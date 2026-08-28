export interface AdsConfig {
  provider: 'none' | 'yandex';
  distribution: string;
  adUnits: {
    banner: string;
    interstitial: string;
  };
}

export const ADS_CONFIG: AdsConfig = {
  provider: 'yandex',
  distribution: 'rustore-dev',
  adUnits: {
    banner: 'demo-banner-yandex',
    interstitial: 'demo-interstitial-yandex',
  },
};
