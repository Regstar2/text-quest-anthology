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
  interstitialFrequency: {
    endingsPerAd: number;
    cooldownMs: number;
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
  interstitialFrequency: {
    endingsPerAd: 3,
    cooldownMs: 10 * 60 * 1000,
  },
};
