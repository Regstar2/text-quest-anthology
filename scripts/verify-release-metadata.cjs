/* eslint-env node */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
);
const packageLock = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'),
);
const appConfig = fs.readFileSync(
  path.join(rootDir, 'src', 'config', 'appConfig.ts'),
  'utf8',
);
const androidBuildGradle = fs.readFileSync(
  path.join(rootDir, 'android', 'app', 'build.gradle'),
  'utf8',
);

const expectedVersionName = packageJson.version;
const expectedVersionCode = 10;
const expectedApplicationId = 'io.github.regstar2.textquestanthology';

assert.equal(packageLock.version, expectedVersionName);
assert.equal(packageLock.packages[''].version, expectedVersionName);

assert.ok(
  appConfig.includes(`versionName: '${expectedVersionName}'`),
  'APP_CONFIG versionName is out of sync',
);
assert.ok(
  appConfig.includes(`versionCode: ${expectedVersionCode},`),
  'APP_CONFIG versionCode is out of sync',
);
assert.ok(
  appConfig.includes(`applicationId: '${expectedApplicationId}'`),
  'APP_CONFIG applicationId is out of sync',
);

assert.ok(
  androidBuildGradle.includes(`versionName "${expectedVersionName}"`),
  'Android versionName is out of sync',
);
assert.ok(
  androidBuildGradle.includes(`versionCode ${expectedVersionCode}`),
  'Android versionCode is out of sync',
);
assert.ok(
  androidBuildGradle.includes(`applicationId "${expectedApplicationId}"`),
  'Android applicationId is out of sync',
);

console.log(
  `[release-metadata] ${expectedApplicationId} v${expectedVersionName} (${expectedVersionCode}) is synchronized.`,
);
