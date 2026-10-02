# Android release signing

Production Android artifacts must be signed with the same private key for every update of the application. The key and passwords are local/CI secrets and must never be committed.

## Local configuration

Create the keystore outside the repository. On Windows PowerShell:

```powershell
$KeyDir = Join-Path $env:USERPROFILE ".text-quest-anthology\signing"
New-Item -ItemType Directory -Force -Path $KeyDir | Out-Null

keytool -genkeypair -v `
  -storetype JKS `
  -keystore (Join-Path $KeyDir "text-quest-anthology-release.jks") `
  -alias "text-quest-anthology-release" `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000
```

Do not pass keystore passwords on the command line. `keytool` will request them interactively.

Copy `android/keystore.properties.example` to `android/keystore.properties` and fill in:

```properties
storeFile=C:/Users/<user>/.text-quest-anthology/signing/text-quest-anthology-release.jks
storePassword=<local secret>
keyAlias=text-quest-anthology-release
keyPassword=<local secret>
```

`android/keystore.properties`, `*.jks`, and `*.keystore` are ignored by Git.

For CI, do not create `keystore.properties`. Provide these environment variables instead:

```text
TEXT_QUEST_SIGNING_STORE_FILE
TEXT_QUEST_SIGNING_STORE_PASSWORD
TEXT_QUEST_SIGNING_KEY_ALIAS
TEXT_QUEST_SIGNING_KEY_PASSWORD
```

The store file must already exist in the CI workspace or another protected location available to the build.

## Build

From the repository root:

```powershell
npm ci
npm run verify
Set-Location android
.\gradlew.bat assembleRelease bundleRelease
Set-Location ..

npm run verify:release-privacy
```

The final command checks the merged release manifest against the reviewed permission set and the privacy disclosure. Do not submit a build when this check fails.

Expected artifacts:

```text
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

Release builds fail before packaging if signing configuration is incomplete or the configured keystore file does not exist.

## Verify the certificate

Verify the APK with Android Build Tools:

```powershell
$SdkRoot = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "C:\Android\Sdk" }
$ApkSigner = Get-ChildItem (Join-Path $SdkRoot "build-tools") -Directory |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName "apksigner.bat" } |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1

& $ApkSigner verify --verbose --print-certs ".\app\build\outputs\apk\release\app-release.apk"
```

Then inspect the production keystore certificate:

```powershell
keytool -list -v `
  -keystore "$env:USERPROFILE\.text-quest-anthology\signing\text-quest-anthology-release.jks" `
  -alias "text-quest-anthology-release"
```

The SHA-256 certificate fingerprint printed for the APK must match the certificate in the production keystore.

## Install and update check

For the public MVP, the expected release identity is:

```text
applicationId = io.github.regstar2.textquestanthology
versionName = 0.4.0
versionCode = 10
```

To test the real upgrade path, first install or keep the previous production-signed build on the device. Do not uninstall it before the check: uninstalling would turn the operation into a clean install instead of an update.

With a physical Android device connected:

```powershell
adb devices

# Record the currently installed production build before the update.
adb shell dumpsys package io.github.regstar2.textquestanthology |
  Select-String -Pattern "versionCode=|versionName="

adb install -r ".\app\build\outputs\apk\release\app-release.apk"

# Verify the installed metadata after the update.
adb shell dumpsys package io.github.regstar2.textquestanthology |
  Select-String -Pattern "versionCode=|versionName="

adb shell am force-stop io.github.regstar2.textquestanthology
adb shell am start -n io.github.regstar2.textquestanthology/.MainActivity
```

Acceptance for `v0.4.0`: the previously installed build has a `versionCode` lower than `10`, `adb install -r` returns `Success`, package metadata after the update reports `versionCode=10` and `versionName=0.4.0`, and the application starts without changing `applicationId`. The previous and new APK must be signed with the same production key.

Before store submission, repeat the build with the same keystore and confirm that Android accepts an update over the previous production-signed build. Do not replace the production key between versions.

## Backup

Before the first RuStore submission, copy the keystore to a separate protected backup location, preferably an encrypted removable/offline medium. Keep the backup separately from the working copy and from `keystore.properties`.

After copying, compare hashes:

```powershell
$PrimaryKey = "$env:USERPROFILE\.text-quest-anthology\signing\text-quest-anthology-release.jks"
$BackupKey = Read-Host "Full path to the protected backup copy"

Get-FileHash -Algorithm SHA256 $PrimaryKey
Get-FileHash -Algorithm SHA256 $BackupKey
```

The hashes must be identical.

## Check that signing material is absent from Git

Current tracked tree:

```powershell
git ls-files | Select-String -Pattern '(?i)(\.jks$|\.keystore$|(^|/)keystore\.properties$)'
```

Repository history:

```powershell
git log --all --name-only --pretty=format: |
  Select-String -Pattern '(?i)(\.jks$|\.keystore$|(^|/)keystore\.properties$)' |
  Sort-Object -Unique
```

Both commands should return no production signing files. The tracked `android/keystore.properties.example` file is intentionally excluded by the exact pattern.
