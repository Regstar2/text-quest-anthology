import React, {useEffect, useState} from 'react';
import {
  DeviceEventEmitter,
  NativeModules,
  Platform,
  View,
  type EmitterSubscription,
} from 'react-native';
import {
  InterstitialAdLoader,
  MobileAds,
  type InterstitialAd,
} from 'yandex-mobile-ads';
import type {
  AdsBannerProps,
  AdsProvider,
  AdShowResult,
  InterstitialPlacement,
} from '../AdsProvider';
import {InterstitialFrequencyPolicy} from '../InterstitialFrequencyPolicy';
import {ADS_CONFIG} from '../../config/adsConfig';

const NATIVE_BANNER_EVENT = 'NativeBannerStateChanged';

type NativeBannerState = 'loading' | 'loaded' | 'failed' | 'shown' | 'hidden';

type NativeBannerEvent = Readonly<{
  state: NativeBannerState;
  heightDp: number;
}>;

type NativeBannerControllerModule = Readonly<{
  prepare: (adUnitId: string) => void;
  setVisible: (visible: boolean) => void;
  getState: () => Promise<NativeBannerEvent>;
}>;

function logAdsError(message: string, error: unknown): void {
  console.warn(`[ads:yandex] ${message}`, error);
}

function getNativeBannerController(): NativeBannerControllerModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  return (
    (NativeModules.NativeBannerController as
      | NativeBannerControllerModule
      | undefined) ?? null
  );
}

function YandexBanner({
  onReadyHeightChange,
  visible,
}: AdsBannerProps): React.JSX.Element {
  const nativeBannerController = getNativeBannerController();
  const [readyHeight, setReadyHeight] = useState(0);
  useEffect(() => {
    if (!nativeBannerController) {
      onReadyHeightChange?.(0);
      return;
    }

    const handleEvent = (event: NativeBannerEvent) => {
      if (event.state === 'failed') {
        setReadyHeight(0);
        onReadyHeightChange?.(0);
        return;
      }

      if (event.state === 'loaded' || event.state === 'shown') {
        const nextHeight = Math.max(0, Math.round(event.heightDp));
        setReadyHeight(nextHeight);
        onReadyHeightChange?.(nextHeight);
      }
    };

    const subscription: EmitterSubscription = DeviceEventEmitter.addListener(
      NATIVE_BANNER_EVENT,
      handleEvent,
    );
    nativeBannerController.getState().then(handleEvent).catch((error: unknown) => {
      logAdsError('Banner state sync failed.', error);
    });

    return () => subscription.remove();
  }, [nativeBannerController, onReadyHeightChange]);

  useEffect(() => {
    if (!nativeBannerController) {
      return;
    }

    nativeBannerController.setVisible(visible && readyHeight > 0);

    return () => {
      nativeBannerController.setVisible(false);
    };
  }, [nativeBannerController, readyHeight, visible]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        flexShrink: 0,
        height: visible && readyHeight > 0 ? readyHeight : 0,
        width: '100%',
      }}
    />
  );
}

export class YandexAdsProvider implements AdsProvider {
  readonly Banner = YandexBanner;

  private readonly interstitialFrequency = new InterstitialFrequencyPolicy(
    ADS_CONFIG.interstitialFrequency,
  );
  private initializationPromise: Promise<void> | null = null;
  private interstitialAd: InterstitialAd | null = null;
  private preloadPromise: Promise<void> | null = null;
  private isInitialized = false;
  private isShowingInterstitial = false;

  initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    const initialization = MobileAds.initialize()
      .then(() => {
        this.isInitialized = true;
        getNativeBannerController()?.prepare(ADS_CONFIG.adUnits.banner);
        return this.preloadInterstitial();
      })
      .catch((error: unknown) => {
        this.isInitialized = false;
        this.initializationPromise = null;
        logAdsError('SDK initialization failed.', error);
      });

    this.initializationPromise = initialization;
    return initialization;
  }

  preloadInterstitial(): Promise<void> {
    if (!this.isInitialized) {
      return this.initialize();
    }

    if (this.interstitialAd || this.isShowingInterstitial) {
      return Promise.resolve();
    }

    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    const request = this.loadInterstitial().finally(() => {
      if (this.preloadPromise === request) {
        this.preloadPromise = null;
      }
    });

    this.preloadPromise = request;
    return request;
  }

  async showInterstitial(
    placement: InterstitialPlacement,
  ): Promise<AdShowResult> {
    if (placement !== 'story-restart' || this.isShowingInterstitial) {
      return 'unavailable';
    }

    if (!this.interstitialFrequency.registerRestart()) {
      return 'unavailable';
    }

    const ad = this.interstitialAd;
    this.interstitialAd = null;

    if (!ad) {
      this.preloadInterstitial().catch((error: unknown) => {
        logAdsError('Interstitial preload request failed.', error);
      });
      return 'unavailable';
    }

    this.isShowingInterstitial = true;

    return new Promise<AdShowResult>(resolve => {
      let settled = false;

      const finish = (result: AdShowResult) => {
        if (settled) {
          return;
        }

        settled = true;
        this.isShowingInterstitial = false;

        this.preloadInterstitial().catch((error: unknown) => {
          logAdsError('Interstitial preload request failed.', error);
        });
        resolve(result);
      };

      ad.onAdDismissed = () => finish('success');
      ad.onAdFailedToShow = error => {
        logAdsError('Interstitial failed to show.', error);
        finish('failed');
      };

      try {
        Promise.resolve(ad.show()).catch((error: unknown) => {
          logAdsError('Interstitial show request failed.', error);
          finish('failed');
        });
      } catch (error) {
        logAdsError('Interstitial show request threw.', error);
        finish('failed');
      }
    });
  }

  private async loadInterstitial(): Promise<void> {
    try {
      const loader = await InterstitialAdLoader.create();
      this.interstitialAd = await loader.loadAd({
        adUnitId: ADS_CONFIG.adUnits.interstitial,
      });
    } catch (error) {
      this.interstitialAd = null;
      logAdsError('Interstitial preload failed.', error);
    }
  }
}

export const yandexAdsProvider = new YandexAdsProvider();
