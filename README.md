# Text Quest Anthology

Android-приложение-антология коротких независимых текстовых квестов. Первая история — хоррор/выживание «Завалинка»; решения игрока меняют доступные события и приводят к нескольким терминальным концовкам.

[Документация](#документация) · [Дорожная карта](#дорожная-карта) · [Обратная связь](../../issues)

---

## О проекте

Проект проверяет простой сценарий: пользователь устанавливает приложение, выбирает короткую интерактивную историю, читает её, принимает решения, получает последствия прошлых выборов и завершает прохождение одной из концовок.

Истории не обязаны быть связаны между собой. Архитектура должна позволять добавлять будущие истории преимущественно как контентные пакеты, без переписывания narrative runtime и основных экранов приложения.

Первый целевой канал распространения — Android/RuStore. Приложение проектируется offline-first: чтение, выборы и сохранения не должны зависеть от сети. Интернет нужен только внешним сервисам, прежде всего рекламе.

## Статус проекта

**Стадия:** PROTOTYPE.

Android bootstrap `v0.1.0` реализован и вручную проверен на Windows и реальном Android-устройстве: TypeScript, ESLint и Jest проходят; debug APK собирается Gradle; приложение устанавливается, запускается через Metro и успешно проходит повторный запуск после полного закрытия.

Жёсткий предел разработки первого MVP — **10 сентября 2026 года включительно**. Первый MVP должен содержать одну полностью законченную историю — «Завалинка» — и быть подготовлен к публикации в RuStore.

## Технический baseline v0.1.0

- React Native `0.87.1`;
- React `19.2.3`;
- TypeScript `6.0.3`;
- Node.js: `>=22.13.0`, `.nvmrc` — `22.23.2`;
- JDK `17`;
- Gradle `9.4.1`;
- Android SDK Platform `37.0` (`compileSdk = 37`);
- Android Build Tools `37.0.0`;
- Android NDK `27.1.12297006`;
- `applicationId`: `io.github.regstar2.textquestanthology`;
- `versionName`: `0.1.0`;
- `versionCode`: `1`.

Локальная acceptance-проверка также успешно выполнена на Node.js `24.15.0`.

## Быстрый старт

### 1. Клонирование и зависимости

```powershell
git clone https://github.com/Regstar2/text-quest-anthology.git
cd text-quest-anthology
npm ci
npm run verify
```

### 2. Android SDK

Для Windows с кириллицей или другими non-ASCII символами в имени профиля рекомендуется держать Android SDK в ASCII-пути, например:

```text
C:\Android\Sdk
```

И создать локальный `android/local.properties`:

```text
sdk.dir=C:/Android/Sdk
```

`android/local.properties` является machine-specific файлом и не коммитится.

Необходимые Android-компоненты:

```text
platform-tools
platforms;android-37.0
build-tools;37.0.0
ndk;27.1.12297006
```

CMake `3.22.1` может быть автоматически установлен Android Gradle Plugin при первой native-сборке.

### 3. Сборка debug APK

```powershell
cd android
.\gradlew.bat assembleDebug
```

Debug APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Для быстрой локальной сборки только ARM64 можно использовать:

```powershell
.\gradlew.bat assembleDebug -PreactNativeArchitectures=arm64-v8a
```

Не используйте `clean` без необходимости: он удаляет build/cache state и заметно замедляет следующую сборку.

### 4. Metro и запуск на устройстве

В первом терминале:

```powershell
npm start
```

Во втором терминале после подключения устройства с USB debugging:

```powershell
adb devices
adb reverse tcp:8081 tcp:8081
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am force-stop io.github.regstar2.textquestanthology
adb shell am start -n io.github.regstar2.textquestanthology/.MainActivity
```

В debug-режиме при запуске приложение получает JavaScript bundle от Metro, поэтому кратковременный статус `Building...` является штатным. В release build Metro не требуется.

## Проверки

```powershell
npm run typecheck
npm run lint
npm test -- --runInBand
```

Или одной командой:

```powershell
npm run verify
```

На `v0.1.0` фактически проверено:

- установка JS-зависимостей;
- TypeScript typecheck;
- ESLint;
- Jest;
- Android `assembleDebug`;
- установка APK через ADB;
- запуск на реальном устройстве;
- полный stop и повторный запуск приложения.

## Архитектура

Планируемое ядро:

```text
React Native + TypeScript
        │
        ├── Ink / inkjs            narrative runtime
        ├── local save storage     прогресс прохождения
        └── AdsProvider
             ├── YandexAdsProvider
             └── NoAdsProvider
```

Истории хранятся независимо:

```text
stories/
└── zavalinka/
    ├── meta.json
    ├── story.ink
    └── assets/
```

RuStore и Yandex Mobile Ads не являются частью narrative core. Первый магазин — RuStore, первая рекламная реализация — РСЯ, но приложение не должно требовать их для чтения истории.

## Документация

- [`docs/product/idea.md`](docs/product/idea.md) — проблема, пользователь и продуктовая гипотеза.
- [`docs/product/feasibility.md`](docs/product/feasibility.md) — выводы исследования целесообразности.
- [`docs/product/mvp-scope.md`](docs/product/mvp-scope.md) — обязательный scope первого релиза.
- [`docs/product/roadmap.md`](docs/product/roadmap.md) — двухнедельный план разработки.
- [`docs/product/post-mvp.md`](docs/product/post-mvp.md) — идеи, которые сознательно не входят в MVP.
- [`docs/architecture/tech-stack.md`](docs/architecture/tech-stack.md) — выбранный стек и границы зависимостей.
- [`docs/architecture/architecture.md`](docs/architecture/architecture.md) — структура приложения и будущих story packages.
- [`docs/versions/versions-index.md`](docs/versions/versions-index.md) — назначение версий до первого релиза.
- [`docs/testing/manual-test-plan.md`](docs/testing/manual-test-plan.md) — минимальный release test plan.

## Дорожная карта

```text
v0.1.x  технический прототип Android + Ink + saves + РСЯ
   ↓
v0.2.x  полный интерактивный текст «Завалинки»
   ↓
v0.3.x  product/release hardening
   ↓
v0.4.0  публичный MVP в RuStore
```

До 10 сентября scope не расширяется второй историей, backend, аккаунтами, облаком или платёжной системой.

## Обратная связь

Ошибки и предложения фиксируются через [GitHub Issues](../../issues).

## Ограничения

- На первом релизе только Android.
- На первом релизе только одна история.
- Основной язык первого MVP — русский.
- Backend, аккаунты и cloud saves отсутствуют.
- Новые истории поставляются вместе с обновлениями приложения; удалённого каталога историй нет.
- Реклама является экспериментальной монетизацией, а не условием работоспособности приложения.
- Платные истории, подписка и отключение рекламы за деньги не входят в MVP.
