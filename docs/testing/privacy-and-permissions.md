# Privacy and Android permissions release check

This document is the release gate for issue #55. It verifies that the public privacy text matches the current Android implementation and that dependency manifests do not introduce unexplained sensitive permissions.

## Verified source-level facts

The current `v0.4.0` source configuration states:

- package: `io.github.regstar2.textquestanthology`;
- Yandex Mobile Ads React Native package: `8.3.0`;
- native Android Yandex Mobile Ads dependency: `8.3.0`;
- production ads are enabled only in the release build configuration;
- the app's own `AndroidManifest.xml` declares `android.permission.INTERNET`;
- `android:allowBackup="false"`;
- story progress, unlocked endings and reader preferences use the local `SharedPreferences`-backed storage boundary;
- no account, backend or cloud-save dependency exists in the MVP scope.

These facts are checked by `npm run test:privacy-contract`.

## Why the merged release manifest must be checked

The source manifest is not the final manifest shipped in the APK/AAB. Android merges manifests from React Native and transitive dependencies.

Yandex documents that Mobile Ads SDK versions starting with 4.5.0 add `com.google.android.gms.permission.AD_ID` automatically. The SDK also has transitive dependencies, including AppMetrica. Therefore privacy review must inspect the merged **release** manifest, not only `android/app/src/main/AndroidManifest.xml`.

## Automated release-manifest check

From the repository root:

```powershell
npm ci
npm run verify

Set-Location android
.\gradlew.bat :app:processReleaseMainManifest -x :app:validateReleaseSigningConfig
Set-Location ..

npm run verify:release-privacy
```

The manifest-only command deliberately skips `validateReleaseSigningConfig`: signing is irrelevant to manifest merging and is still mandatory for `assembleRelease`/`bundleRelease`. `verify:release-privacy` finds the newest merged release `AndroidManifest.xml`, prints every requested permission and fails when:

- the release manifest does not contain `android.permission.INTERNET`;
- Yandex Mobile Ads `8.3.0` is configured but `com.google.android.gms.permission.AD_ID` is absent;
- a sensitive permission used by camera, microphone, contacts, SMS/calls, location, external storage/media, Bluetooth nearby devices, notifications, package installation or overlays is present;
- a permission outside the reviewed release allowlist appears.

An allowlist failure is intentional. Do not silently add the new permission to the allowlist. First determine which dependency introduced it and whether the application actually needs it, then update both the check and privacy disclosure when justified.

## Independent APK check

After `assembleRelease`, inspect the produced APK with Android Build Tools:

```powershell
$SdkRoot = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "C:\Android\Sdk" }

$ApkAnalyzer = Get-ChildItem (Join-Path $SdkRoot "cmdline-tools") -Recurse -Filter "apkanalyzer.bat" -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $ApkAnalyzer) {
  $ApkAnalyzer = Get-ChildItem (Join-Path $SdkRoot "tools") -Recurse -Filter "apkanalyzer.bat" -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

if ($ApkAnalyzer) {
  & $ApkAnalyzer.FullName manifest permissions ".\android\app\build\outputs\apk\release\app-release.apk"
} else {
  Write-Warning "apkanalyzer.bat not found; use Android Studio APK Analyzer to inspect manifest permissions."
}
```

The APK permission list must match the merged-manifest check.

## Privacy policy publication

The canonical repository policy text is `PRIVACY.md`. The public RuStore URL is:

https://regstar2.github.io/privacy/text-quest-anthology/

Before RuStore submission:

1. open the public URL without GitHub authentication/private repository access;
2. compare its disclosures with `PRIVACY.md`;
3. place that URL in the RuStore application card;
4. repeat `npm run verify:release-privacy` against the final production build.

## Current external documentation checked on 2026-09-30

- Yandex Mobile Ads Android integration: https://ads.yandex.com/helpcenter/en/dev/android/quick-start
- Yandex advertising ID documentation: https://ads.yandex.com/helpcenter/en/dev/android/ad-id
- Yandex Ads privacy policy: https://yandex.com/legal/international_ads_privacy_policy/en/
- RuStore application requirements: https://www.rustore.ru/help/developers/publishing-and-verifying-apps/requirement-apps

Yandex currently documents that SDK versions starting with 4.5.0 add `AD_ID` automatically. RuStore requires applications to request only permissions needed for their service and requires justification for sensitive permissions.

## Regional privacy note

The current release target is RuStore. Yandex's documentation has additional consent requirements for users in the EEA and Switzerland. If distribution is expanded to those regions, the advertising consent flow must be reviewed before that distribution; this document does not claim that the current MVP implements a GDPR consent UI.
