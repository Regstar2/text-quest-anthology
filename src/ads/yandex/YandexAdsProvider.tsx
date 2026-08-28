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

function logAdsError(message: string, error: unknown): void {
  console.warn(`[ads:yandex] ${message}`, error);
}

function YandexBanner({isDarkMode}: AdsBannerProps): React.JSX.Element {
  const {height, width} = useWindowDimensions();
  const [adSize, setAdSize] = useState<BannerAdSize | null>(null);
  const bannerWidth = Math.max(1, Math.floor(width));
  const reservedHeight = Math.max(
    ADS_CONFIG.bannerLayout.minHeight,
    Math.ceil(height * ADS_CONFIG.bannerLayout.heightRatio),
  );

  useEffect(() => {
    let active = true;
    setAdSize(null);

    void BannerAdSize.stickySize(bannerWidth)
      .then(size => {
        if (active) {
          setAdSize(size);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          logAdsError('Failed to calculate sticky banner size.', error);
        }
      });

    return () => {
      active = false;
    };
  }, [bannerWidth]);

  return (
    <View
      accessibilityLabel="Реклама"
      style={[
        styles.bannerSlot,
        {height: reservedHeight},
        isDarkMode && styles.bannerSlotDark,
      ]}>
      {adSize ? (
        <BannerView
          adRequest={{adUnitId: ADS_CONFIG.adUnits.banner}}
          onAdFailedToLoad={() => {
            logAdsError('Banner failed to load.', 'load-failed');
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
    if (
      placement !== 'story-ending-restart' ||
      this.isShowingInterstitial
    ) {
      return 'unavailable';
    }

    if (!this.interstitialFrequency.registerEnding()) {
      return 'unavailable';
    }

    const ad = this.interstitialAd;
    this.interstitialAd = null;

    if (!ad) {
      void this.preloadInterstitial();
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

        if (result === 'success') {
          this.interstitialFrequency.markShown();
        }

        void this.preloadInterstitial();
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
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  bannerSlotDark: {
    backgroundColor: '#1f2937',
  },
});
