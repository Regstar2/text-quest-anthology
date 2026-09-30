/* eslint-env node */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const sourceOnly = process.argv.includes('--source-only');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function walk(directory, matches = []) {
  if (!fs.existsSync(directory)) {
    return matches;
  }

  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, matches);
    } else if (entry.isFile() && entry.name === 'AndroidManifest.xml') {
      matches.push(fullPath);
    }
  }

  return matches;
}

function isReleaseMergedManifest(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('/build/intermediates/') &&
    normalized.includes('release') &&
    (normalized.includes('merged_manifest') ||
      normalized.includes('merged_manifests') ||
      normalized.includes('processreleasemainmanifest'))
  );
}

function manifestPermissions(manifest) {
  const permissions = new Set();
  const pattern =
    /<uses-permission(?:-sdk-\d+)?\b[^>]*\bandroid:name=["']([^"']+)["'][^>]*>/g;

  for (const match of manifest.matchAll(pattern)) {
    permissions.add(match[1]);
  }

  return [...permissions].sort();
}

const packageJson = JSON.parse(read('package.json'));
const androidBuildGradle = read('android/app/build.gradle');
const sourceManifest = read('android/app/src/main/AndroidManifest.xml');
const privacyPolicy = read('PRIVACY.md');
const saveDocs = read('docs/architecture/story-saves.md');

const sdkVersion = packageJson.dependencies['yandex-mobile-ads'];
assert.ok(sdkVersion, 'yandex-mobile-ads dependency is missing');
assert.ok(
  androidBuildGradle.includes(`com.yandex.android:mobileads:${sdkVersion}`),
  'React Native and native Yandex Mobile Ads versions are out of sync',
);

assert.match(
  sourceManifest,
  /<uses-permission android:name="android\.permission\.INTERNET"\s*\/>/,
  'Source manifest must declare INTERNET',
);
assert.match(
  sourceManifest,
  /android:allowBackup="false"/,
  'Android backup must remain disabled for the current local-save disclosure',
);

for (const permission of [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.READ_CONTACTS',
  'android.permission.SEND_SMS',
]) {
  assert.ok(
    !sourceManifest.includes(permission),
    `Unexpected sensitive source permission: ${permission}`,
  );
}

assert.match(saveDocs, /SharedPreferences/);
assert.match(saveDocs, /not synchronized with any account, backend or cloud service/);

for (const requiredPolicyText of [
  'SharedPreferences',
  'Yandex Mobile Ads SDK `8.3.0`',
  'com.google.android.gms.permission.AD_ID',
  'нет пользовательских аккаунтов',
  'cloud sync',
  'android:allowBackup="false"',
  'https://yandex.com/legal/international_ads_privacy_policy/en/',
  'https://regstar2.github.io/privacy/text-quest-anthology/',
]) {
  assert.ok(
    privacyPolicy.includes(requiredPolicyText),
    `PRIVACY.md is missing required disclosure: ${requiredPolicyText}`,
  );
}

console.log(
  `[privacy-contract] Source configuration and PRIVACY.md match Yandex Mobile Ads ${sdkVersion}.`,
);

if (sourceOnly) {
  process.exit(0);
}

const manifestCandidates = walk(
  path.join(rootDir, 'android', 'app', 'build', 'intermediates'),
)
  .filter(isReleaseMergedManifest)
  .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

assert.ok(
  manifestCandidates.length > 0,
  'Merged release AndroidManifest.xml not found. Run: cd android; .\\gradlew.bat :app:processReleaseMainManifest',
);

const mergedManifestPath = manifestCandidates[0];
const mergedManifest = fs.readFileSync(mergedManifestPath, 'utf8');
const permissions = manifestPermissions(mergedManifest);

console.log(`[release-manifest] ${path.relative(rootDir, mergedManifestPath)}`);
for (const permission of permissions) {
  console.log(`  - ${permission}`);
}

assert.ok(
  permissions.includes('android.permission.INTERNET'),
  'Merged release manifest must contain android.permission.INTERNET',
);
assert.ok(
  permissions.includes('com.google.android.gms.permission.AD_ID'),
  'Yandex Mobile Ads 8.3.0 is expected to add com.google.android.gms.permission.AD_ID',
);

const reviewedPermissions = new Set([
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'com.google.android.gms.permission.AD_ID',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
  'io.github.regstar2.textquestanthology.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
]);

const sensitivePermissions = new Set([
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.GET_ACCOUNTS',
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_PHONE_NUMBERS',
  'android.permission.CALL_PHONE',
  'android.permission.ANSWER_PHONE_CALLS',
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.SEND_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_MMS',
  'android.permission.RECEIVE_WAP_PUSH',
  'android.permission.BODY_SENSORS',
  'android.permission.BODY_SENSORS_BACKGROUND',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_ADVERTISE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.QUERY_ALL_PACKAGES',
]);

const sensitiveFound = permissions.filter(permission =>
  sensitivePermissions.has(permission),
);
assert.deepEqual(
  sensitiveFound,
  [],
  `Sensitive permissions are not allowed in the MVP release: ${sensitiveFound.join(', ')}`,
);

const unreviewed = permissions.filter(permission => !reviewedPermissions.has(permission));
assert.deepEqual(
  unreviewed,
  [],
  [
    'Merged release manifest contains permissions that have not been reviewed:',
    ...unreviewed.map(permission => `- ${permission}`),
    'Identify the owning dependency and justification before updating the allowlist or privacy text.',
  ].join('\n'),
);

console.log('[release-manifest] Permission set is reviewed and contains no blocked sensitive permissions.');
