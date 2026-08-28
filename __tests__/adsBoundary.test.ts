import {NoAdsProvider} from '../src/ads/noads/NoAdsProvider';
import {ADS_CONFIG} from '../src/config/adsConfig';

describe('ads boundary', () => {
  it('keeps a no-op provider available for ad-free flows', async () => {
    const provider = new NoAdsProvider();

    await expect(provider.initialize()).resolves.toBeUndefined();
    await expect(provider.preloadInterstitial()).resolves.toBeUndefined();
    await expect(
      provider.showInterstitial('story-ending-restart'),
    ).resolves.toBe('unavailable');
  });

  it('uses only official Yandex demo ad units in the prototype', () => {
    expect(ADS_CONFIG).toEqual({
      provider: 'yandex',
      distribution: 'rustore-dev',
      adUnits: {
        banner: 'demo-banner-yandex',
        interstitial: 'demo-interstitial-yandex',
      },
    });
  });
});
