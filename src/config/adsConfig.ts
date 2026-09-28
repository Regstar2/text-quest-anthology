import {NativeModules, Platform} from 'react-native';

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
    maxHeight: number;
  };
  bannerFrequency: {
    pagesPerBanner: number;
    feedChoicesPerBanner: number;
  };
  interstitialFrequency: {
    restartsPerAd: number;
  };
}

export interface NativeAdsRuntimeConfig {
  distribution?: unknown;
  bannerAdUnitId?: unknown;
  interstitialAdUnitId?: unknown;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function createAdsConfig(
  runtimeConfig: NativeAdsRuntimeConfig | null,
): AdsConfig {
  const distribution = readNonEmptyString(runtimeConfig?.distribution);
  const bannerAdUnitId = readNonEmptyString(runtimeConfig?.bannerAdUnitId);
  const interstitialAdUnitId = readNonEmptyString(
    runtimeConfig?.interstitialAdUnitId,
  );
  const hasConfiguredAdUnits =
    distribution !== null &&
    bannerAdUnitId !== null &&
    interstitialAdUnitId !== null;

  return {
    provider: hasConfiguredAdUnits ? 'yandex' : 'none',
    distribution: distribution ?? 'unconfigured',
    adUnits: {
      banner: bannerAdUnitId ?? '',
      interstitial: interstitialAdUnitId ?? '',
    },
    bannerLayout: {
      heightRatio: 0.14,
      minHeight: 96,
      maxHeight: 120,
    },
    bannerFrequency: {
      pagesPerBanner: 3,
      feedChoicesPerBanner: 3,
    },
    interstitialFrequency: {
      restartsPerAd: 3,
    },
  };
}

function readNativeAdsRuntimeConfig(): NativeAdsRuntimeConfig | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  return (
    (NativeModules.NativeBannerController as NativeAdsRuntimeConfig | undefined) ??
    null
  );
}

export const ADS_CONFIG: AdsConfig = createAdsConfig(
  readNativeAdsRuntimeConfig(),
);
