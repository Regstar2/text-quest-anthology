import React, {useEffect, useState} from 'react';
import {StyleSheet, View, useWindowDimensions} from 'react-native';
import {
  BannerAdSize,
  BannerView,
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

type BannerLoadState = 'loading' | 'loaded' | 'failed';

function logAdsError(message: string, error: unknown): void {
  console.warn(`[ads:yandex] ${message}`, error);
}

function YandexBanner({
  isDarkMode,
  visible,
}: AdsBannerProps): React.JSX.Element {
  const {height, width} = useWindowDimensions();
  const [adSize, setAdSize] = useState<BannerAdSize | null>(null);
  const [loadState, setLoadState] = useState<BannerLoadState>('loading');
  const bannerWidth = Math.max(1, Math.floor(width));
  const reservedHeight = Math.max(
    ADS_CONFIG.bannerLayout.minHeight,
    Math.ceil(height * ADS_CONFIG.bannerLayout.heightRatio),
  );

  useEffect(() => {
    let active = true;
    setLoadState('loading');

    BannerAdSize.stickySize(bannerWidth)
      .then(size => {
        if (active) {
          setAdSize(size);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadState('failed');
          logAdsError('Failed to calculate sticky banner size.', error);
        }
      });

    return () => {
      active = false;
    };
  }, [bannerWidth]);

  const isVisible = visible && loadState !== 'failed';

  return (
    <View
      accessibilityElementsHidden={!isVisible}
      accessibilityLabel={isVisible ? 'Реклама' : undefined}
      collapsable={false}
      importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[
        styles.bannerSlot,
        {height: reservedHeight},
        isVisible
          ? styles.bannerSlotVisible
          : [styles.bannerSlotHidden, {top: -reservedHeight - 8}],
        isVisible && loadState === 'loaded' && styles.bannerSlotLoaded,
        isVisible &&
          loadState === 'loaded' &&
          isDarkMode &&
          styles.bannerSlotLoadedDark,
      ]}>
      {adSize ? (
        <BannerView
          adRequest={{adUnitId: ADS_CONFIG.adUnits.banner}}
          onAdFailedToLoad={error => {
            setLoadState('failed');
            logAdsError('Banner failed to load.', error);
          }}
          onAdLoaded={() => {
            setLoadState('loaded');
          }}
          size={adSize}
        />
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  bannerSlot: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
    zIndex: 20,
  },
  bannerSlotVisible: {
    opacity: 1,
    position: 'relative',
  },
  bannerSlotHidden: {
    left: 0,
    opacity: 0,
    position: 'absolute',
    right: 0,
  },
  bannerSlotLoaded: {
    backgroundColor: '#f3f4f6',
  },
  bannerSlotLoadedDark: {
    backgroundColor: '#1f2937',
  },
});