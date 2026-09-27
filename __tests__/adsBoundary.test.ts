import {InterstitialFrequencyPolicy} from '../src/ads/InterstitialFrequencyPolicy';
import {NoAdsProvider} from '../src/ads/noads/NoAdsProvider';
import {ADS_CONFIG} from '../src/config/adsConfig';

describe('ads boundary', () => {
  it('keeps a no-op provider available for ad-free flows', async () => {
    const provider = new NoAdsProvider();

    await expect(provider.initialize()).resolves.toBeUndefined();
    await expect(provider.preloadInterstitial()).resolves.toBeUndefined();
    await expect(provider.showInterstitial('story-restart')).resolves.toBe(
      'unavailable',
    );
  });

  it('uses only official Yandex demo ad units in the prototype', () => {
    expect(ADS_CONFIG.adUnits).toEqual({
      banner: 'demo-banner-yandex',
      interstitial: 'demo-interstitial-yandex',
    });
  });

  it('does not guess native banner height in shared config', () => {
    expect(ADS_CONFIG).not.toHaveProperty('bannerLayout');
  });

  it('shows the reader banner only on every third page or feed choice', () => {
    expect(ADS_CONFIG.bannerFrequency).toEqual({
      pagesPerBanner: 3,
      feedChoicesPerBanner: 3,
    });
  });

  it('allows an interstitial on exactly every third restart attempt', () => {
    const policy = new InterstitialFrequencyPolicy(
      ADS_CONFIG.interstitialFrequency,
    );

    expect(policy.registerRestart()).toBe(false);
    expect(policy.registerRestart()).toBe(false);
    expect(policy.registerRestart()).toBe(true);
    expect(policy.registerRestart()).toBe(false);
    expect(policy.registerRestart()).toBe(false);
    expect(policy.registerRestart()).toBe(true);
  });
});
