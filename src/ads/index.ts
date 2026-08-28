import type {AdsProvider} from './AdsProvider';
import {noAdsProvider} from './noads/NoAdsProvider';
import {yandexAdsProvider} from './yandex/YandexAdsProvider';
import {ADS_CONFIG} from '../config/adsConfig';

function selectAdsProvider(): AdsProvider {
  switch (ADS_CONFIG.provider) {
    case 'yandex':
      return yandexAdsProvider;
    case 'none':
      return noAdsProvider;
  }
}

export const adsProvider = selectAdsProvider();
export type {
  AdsBannerProps,
  AdsProvider,
  AdShowResult,
  InterstitialPlacement,
} from './AdsProvider';
