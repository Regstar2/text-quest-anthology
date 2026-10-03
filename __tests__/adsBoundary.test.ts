import {InterstitialFrequencyPolicy} from '../src/ads/InterstitialFrequencyPolicy';
import {NoAdsProvider} from '../src/ads/noads/NoAdsProvider';
import {
  ADS_CONFIG,
  createAdsConfig,
  type NativeAdsRuntimeConfig,
} from '../src/config/adsConfig';

const fs = jest.requireActual('fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const pathModule = jest.requireActual('path') as {
  join(...paths: string[]): string;
};
const processModule = jest.requireActual('process') as {
  cwd(): string;
};

function source(path: string): string {
  return fs
    .readFileSync(pathModule.join(processModule.cwd(), path), 'utf8')
    .replace(/\r\n/g, '\n');
}

describe('ads boundary', () => {
  it('keeps a no-op provider available for ad-free flows', async () => {
    const provider = new NoAdsProvider();

    await expect(provider.initialize()).resolves.toBeUndefined();
    await expect(provider.preloadInterstitial()).resolves.toBeUndefined();
    await expect(provider.showInterstitial('story-restart')).resolves.toBe(
      'unavailable',
    );
  });

  it('uses native build configuration and fails open when it is unavailable', () => {
    const productionRuntimeConfig: NativeAdsRuntimeConfig = {
      distribution: 'rustore',
      bannerAdUnitId: 'R-M-production-banner',
      interstitialAdUnitId: 'R-M-production-interstitial',
    };

    expect(createAdsConfig(productionRuntimeConfig)).toMatchObject({
      provider: 'yandex',
      distribution: 'rustore',
      adUnits: {
        banner: 'R-M-production-banner',
        interstitial: 'R-M-production-interstitial',
      },
    });

    expect(createAdsConfig(null)).toMatchObject({
      provider: 'none',
      distribution: 'unconfigured',
      adUnits: {
        banner: '',
        interstitial: '',
      },
    });
  });

  it('separates Yandex demo and production ad units by Android build type', () => {
    const gradle = source('android/app/build.gradle');

    expect(gradle).toContain(
      'def yandexDemoBannerAdUnitId = "demo-banner-yandex"',
    );
    expect(gradle).toContain(
      'def yandexDemoInterstitialAdUnitId = "demo-interstitial-yandex"',
    );
    expect(gradle).toContain(
      'def yandexProductionBannerAdUnitId = "R-M-20131427-1"',
    );
    expect(gradle).toContain(
      'def yandexProductionInterstitialAdUnitId = "R-M-20131427-2"',
    );
    expect(gradle).toContain(
      'buildConfigField "String", "YANDEX_AD_DISTRIBUTION", buildConfigString("rustore-dev")',
    );
    expect(gradle).toContain(
      'buildConfigField "String", "YANDEX_AD_DISTRIBUTION", buildConfigString("rustore")',
    );
  });

  it('blocks release builds that use missing or demo Yandex placements', () => {
    const gradle = source('android/app/build.gradle');

    expect(gradle).toContain('tasks.register("validateReleaseAdsConfig")');
    expect(gradle).toContain('value.startsWith("demo-")');
    expect(gradle).toContain(
      'task.dependsOn("validateReleaseAdsConfig")',
    );
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
