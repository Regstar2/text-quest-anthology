import type React from 'react';

export type InterstitialPlacement = 'story-restart';
export type AdShowResult = 'success' | 'unavailable' | 'failed';

export interface AdsBannerProps {
  isDarkMode: boolean;
  visible: boolean;
}

export interface AdsProvider {
  readonly Banner: React.ComponentType<AdsBannerProps>;
  initialize(): Promise<void>;
  preloadInterstitial(): Promise<void>;
  showInterstitial(placement: InterstitialPlacement): Promise<AdShowResult>;
}
