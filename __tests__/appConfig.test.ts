import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {APP_CONFIG} from '../src/config/appConfig';

const packageJsonPath = resolve(__dirname, '../package.json');
const packageLockPath = resolve(__dirname, '../package-lock.json');
const androidBuildGradlePath = resolve(__dirname, '../android/app/build.gradle');

describe('application identity', () => {
  it('keeps the stable Android identity for public MVP v0.4.0', () => {
    expect(APP_CONFIG).toEqual({
      applicationId: 'io.github.regstar2.textquestanthology',
      displayName: 'Text Quest Anthology',
      versionCode: 10,
      versionName: '0.4.0',
    });
  });

  it('keeps release metadata synchronized across runtime, npm, and Android', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
    const androidBuildGradle = readFileSync(androidBuildGradlePath, 'utf8');

    expect(packageJson.version).toBe(APP_CONFIG.versionName);
    expect(packageLock.version).toBe(APP_CONFIG.versionName);
    expect(packageLock.packages[''].version).toBe(APP_CONFIG.versionName);
    expect(androidBuildGradle).toContain(
      `applicationId "${APP_CONFIG.applicationId}"`,
    );
    expect(androidBuildGradle).toContain(`versionCode ${APP_CONFIG.versionCode}`);
    expect(androidBuildGradle).toContain(
      `versionName "${APP_CONFIG.versionName}"`,
    );
  });

  it('uses an Android version code newer than the distributed v0.1.8 build', () => {
    expect(APP_CONFIG.versionCode).toBeGreaterThan(9);
  });

  it('does not bind the applicationId to a store or ad provider', () => {
    expect(APP_CONFIG.applicationId).not.toMatch(/rustore|huawei|xiaomi|yandex|ads/i);
  });
});
