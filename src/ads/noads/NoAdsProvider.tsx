import type React from 'react';
import type {
  AdsBannerProps,
  AdsProvider,
  AdShowResult,
  InterstitialPlacement,
} from '../AdsProvider';

function NoAdsBanner(_props: AdsBannerProps): React.JSX.Element | null {
  return null;
}

export class NoAdsProvider implements AdsProvider {
  readonly Banner = NoAdsBanner;

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  preloadInterstitial(): Promise<void> {
    return Promise.resolve();
  }

  showInterstitial(
    _placement: InterstitialPlacement,
  ): Promise<AdShowResult> {
    return Promise.resolve('unavailable');
  }
}

export const noAdsProvider = new NoAdsProvider();
