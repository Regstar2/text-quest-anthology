import {APP_CONFIG} from '../src/config/appConfig';

describe('application identity', () => {
  it('keeps the stable Android identity for public MVP v0.4.0', () => {
    expect(APP_CONFIG).toEqual({
      applicationId: 'io.github.regstar2.textquestanthology',
      displayName: 'Text Quest Anthology',
      versionCode: 10,
      versionName: '0.4.0',
    });
  });

  it('uses an Android version code newer than the previous v0.1.8 build', () => {
    expect(APP_CONFIG.versionCode).toBeGreaterThan(9);
  });

  it('does not bind the applicationId to a store or ad provider', () => {
    expect(APP_CONFIG.applicationId).not.toMatch(/rustore|huawei|xiaomi|yandex|ads/i);
  });
});
