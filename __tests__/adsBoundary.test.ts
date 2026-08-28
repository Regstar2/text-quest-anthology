import {InterstitialFrequencyPolicy} from '../src/ads/InterstitialFrequencyPolicy';
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
    expect(ADS_CONFIG.adUnits).toEqual({
      banner: 'demo-banner-yandex',
      interstitial: 'demo-interstitial-yandex',
    });
  });

  it('keeps the banner compact while preserving a minimum slot height', () => {
    expect(ADS_CONFIG.bannerLayout).toEqual({
      heightRatio: 0.08,
      minHeight: 50,
    });
  });

  it('allows an interstitial only after three completed endings', () => {
    const policy = new InterstitialFrequencyPolicy(
      ADS_CONFIG.interstitialFrequency,
    );

    expect(policy.registerEnding(0)).toBe(false);
    expect(policy.registerEnding(1)).toBe(false);
    expect(policy.registerEnding(2)).toBe(true);
  });

  it('keeps the ten-minute cooldown after a shown interstitial', () => {
    const policy = new InterstitialFrequencyPolicy(
      ADS_CONFIG.interstitialFrequency,
    );

    policy.registerEnding(0);
    policy.registerEnding(1);
    expect(policy.registerEnding(2)).toBe(true);
    policy.markShown(2);

    policy.registerEnding(3);
    policy.registerEnding(4);
    expect(policy.registerEnding(5)).toBe(false);
    expect(policy.registerEnding(2 + 10 * 60 * 1000)).toBe(true);
  });

  it('does not consume the frequency threshold when an ad is unavailable', () => {
    const policy = new InterstitialFrequencyPolicy(
      ADS_CONFIG.interstitialFrequency,
    );

    policy.registerEnding(0);
    policy.registerEnding(1);
    expect(policy.registerEnding(2)).toBe(true);
    expect(policy.registerEnding(3)).toBe(true);
  });
});
