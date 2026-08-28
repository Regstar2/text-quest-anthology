export interface AdsConfig {
  provider: 'none' | 'yandex';
  distribution: string;
  adUnits: {
    banner: string;
    interstitial: string;
  };
  bannerLayout: {
    heightRatio: number;
    minHeight: number;
  };
  bannerFrequency: {
    pagesPerBanner: number;
    feedChoicesPerBanner: number;
  };
  interstitialFrequency: {
    restartsPerAd: number;
  };
}

export const ADS_CONFIG: AdsConfig = {
  provider: 'yandex',
  distribution: 'rustore-dev',
  adUnits: {
    banner: 'demo-banner-yandex',
    interstitial: 'demo-interstitial-yandex',
  },
  bannerLayout: {
    heightRatio: 0.08,
    minHeight: 50,
  },
  bannerFrequency: {
    pagesPerBanner: 3,
    feedChoicesPerBanner: 3,
  },
  interstitialFrequency: {
    restartsPerAd: 3,
  },
};
