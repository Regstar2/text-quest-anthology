import {APP_CONFIG} from '../src/config/appConfig';

describe('application identity', () => {
  it('keeps the stable Android identity for v0.1.0', () => {
    expect(APP_CONFIG).toEqual({
      applicationId: 'io.github.regstar2.textquestanthology',
      displayName: 'Text Quest Anthology',
      versionCode: 1,
      versionName: '0.1.0',
    });
  });

  it('does not bind the applicationId to a store or ad provider', () => {
    expect(APP_CONFIG.applicationId).not.toMatch(/rustore|huawei|xiaomi|yandex|ads/i);
  });
});
