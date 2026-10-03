<div align="center">

# Text Quest Anthology

Android-антология коротких интерактивных текстовых историй. В текущей версии доступна хоррор-история «Завалинка», где решения игрока меняют дальнейшие события и приводят к разным концовкам.

[![Platform](https://img.shields.io/badge/platform-Android%207.0%2B-0A7EA4?style=for-the-badge&logo=android&logoColor=white)](#требования)

[Быстрый старт](#быстрый-старт) ·
[Документация](#документация) ·
[Релизы](../../releases) ·
[Обратная связь](#обратная-связь)

</div>

---

## О проекте

Text Quest Anthology — приложение для прохождения самостоятельных интерактивных историй на Android. Основной сценарий: открыть библиотеку, выбрать историю, читать текст, принимать решения, продолжить прохождение после перезапуска и дойти до терминальной концовки.

Первая история — «Завалинка»: хоррор о ночлеге в пустом посёлке, где ранние решения влияют на доступные сцены, состояние персонажей и финал. Основной игровой сценарий работает без обязательного подключения к интернету.

## Статус проекта

**Стадия:** Public MVP — release candidate.

- версия приложения: `0.4.0` (`versionCode 10`);
- актуальный GitHub Release: [`v0.4.0-rc.1`](../../releases/tag/v0.4.0-rc.1);
- целевая площадка первого публичного релиза: RuStore;
- финальный regression подписанного RC завершён 3 октября 2026 года;
- автоматические проверки, release signing, privacy gate, offline flow, сохранения, реклама и финальный smoke на физическом Android-устройстве прошли обязательный release-candidate gate.

Публикация в RuStore не считается завершённой, пока приложение фактически не отправлено и не опубликовано магазином.

## Возможности

- библиотека локально поставляемых историй;
- полностью реализованная история «Завалинка» на Ink/inkjs;
- ветвящийся сюжет с несколькими терминальными концовками;
- постраничный reader с вариантами выбора;
- изменение размера текста с корректной перепагинацией;
- локальное автосохранение прогресса и продолжение после перезапуска;
- безопасный restart прохождения без потери уже открытых концовок;
- защита от несовместимых и повреждённых сохранений;
- основной игровой цикл полностью работает офлайн;
- Yandex Mobile Ads: sticky banner и interstitial в естественных паузах;
- отказ сети или рекламного SDK не блокирует прохождение.

## Быстрый старт

Самый короткий путь — установить готовый APK из последнего GitHub Release:

1. откройте [Releases](../../releases);
2. скачайте APK для актуального release candidate;
3. разрешите установку приложений из этого источника, если Android запросит это;
4. установите APK и запустите **Text Quest Anthology**;
5. выберите «Завалинку» и начните новое прохождение или продолжите сохранённое.

После установки интернет не требуется для библиотеки, чтения, выборов, сохранений, продолжения, концовок и restart. Сеть используется сторонним рекламным SDK.

## Требования

### Для запуска

- Android 7.0 / API 24 или новее;
- установка APK вручную либо через поддерживаемый магазин;
- интернет не обязателен для игрового сценария.

### Для разработки

- Node.js `>=22.13.0`; рекомендуемая версия из `.nvmrc`;
- npm;
- JDK 17;
- Android SDK Platform 37;
- Android Build Tools 37.0.0;
- Android NDK 27.1.12297006.

Текущая Android-конфигурация использует `minSdk 24`, `targetSdk 36` и `compileSdk 37`.

## Установка

Для установки release APK через ADB:

```powershell
adb install -r .\text-quest-anthology-v0.4.0-rc.1.apk
```

Package name приложения:

```text
io.github.regstar2.textquestanthology
```

При обновлении поверх совместимой версии Android сохраняет package identity и локальные данные. Если версия контента истории несовместима со старым сохранением, приложение выполняет предусмотренный безопасный reset этого сохранения.

## Использование

1. Откройте библиотеку.
2. Выберите «Завалинку».
3. Начните новое прохождение или продолжите сохранённое.
4. Читайте текст и выбирайте действия.
5. После завершения истории можно начать прохождение заново.

Прогресс сохраняется локально после значимых изменений narrative state. Настройки чтения и сведения об открытых концовках также хранятся на устройстве.

## Архитектура

Основные слои проекта:

```text
React Native + TypeScript
        │
        ├── stories/                исходники story packages
        ├── Ink / inkjs             narrative runtime
        ├── persistence             локальные сохранения и migration guards
        └── ads
             ├── Yandex Ads
             └── fail-open behavior
```

Истории отделены от reader/runtime и хранятся как независимые пакеты:

```text
stories/<story-id>/
├── meta.json
├── story.ink
├── scenes/
└── assets/
```

Подробности находятся в [архитектурной документации](docs/architecture/architecture.md).

## Приватность

Для основного сценария не нужны регистрация, аккаунт или backend разработчика. Прогресс, открытые концовки и настройки чтения сохраняются локально в приватном хранилище Android; cloud sync отсутствует.

В Android-версии используется Yandex Mobile Ads SDK, который выполняет сетевые запросы и может обрабатывать технические данные, необходимые для показа и измерения рекламы.

Полное описание обработки данных и разрешений: [`PRIVACY.md`](PRIVACY.md). Публичная версия политики: https://regstar2.github.io/privacy/text-quest-anthology/

## Разработка

Клонирование и установка зависимостей:

```powershell
git clone https://github.com/Regstar2/text-quest-anthology.git
Set-Location text-quest-anthology
npm ci
```

Для debug-запуска через Metro:

```powershell
npm start
```

В отдельном терминале:

```powershell
npm run android
```

На Windows с non-ASCII символами в пути к профилю Android SDK рекомендуется держать SDK в ASCII-пути, например `C:\Android\Sdk`, и указывать его через локальный `android/local.properties`.

## Сборка

Debug APK:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

Результат:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Release-сборка требует production signing configuration. Инструкция: [`docs/testing/release-signing.md`](docs/testing/release-signing.md).

## Тестирование

Полная локальная проверка проекта:

```powershell
npm run verify
```

Она включает:

- компиляцию story packages;
- проверки story package contract;
- release metadata checks;
- privacy source contract;
- TypeScript typecheck;
- ESLint;
- Jest.

Дополнительная проверка итогового release privacy contract:

```powershell
npm run verify:release-privacy
```

Фактический журнал regression для текущего RC: [`docs/testing/v0.4.0-rc-regression.md`](docs/testing/v0.4.0-rc-regression.md).

## Документация

- [MVP scope](docs/product/mvp-scope.md) — core scenario, P0 scope и критерий завершения первого релиза.
- [Архитектура](docs/architecture/architecture.md) — структура приложения и story packages.
- [Ручной test plan](docs/testing/manual-test-plan.md) — сценарии release-проверки.
- [Regression v0.4.0 RC](docs/testing/v0.4.0-rc-regression.md) — фактические результаты финального прогона.
- [Release signing](docs/testing/release-signing.md) — production-подпись Android.
- [Privacy and permissions](docs/testing/privacy-and-permissions.md) — проверка release manifest и privacy contract.
- [RuStore listing](docs/store/rustore-listing.md) — данные карточки магазина и требования к публикации.
- [Политика конфиденциальности](PRIVACY.md) — обработка локальных данных и работа рекламного SDK.

## Обратная связь

Ошибки и предложения можно фиксировать через [GitHub Issues](../../issues). Для внешней связи также доступен email разработчика: **regstar02@gmail.com**.

## Ограничения

- поддерживается только Android;
- в текущем публичном MVP доступна только одна история — «Завалинка»;
- основной язык приложения и контента — русский;
- отсутствуют аккаунты, backend и облачные сохранения;
- Android backup данных приложения отключён;
- новые истории поставляются вместе с обновлениями приложения, удалённого каталога нет;
- реклама требует сети, но её отсутствие не блокирует прохождение;
- несовместимое сохранение после изменения версии контента может быть безопасно сброшено;
- iOS, Windows и web-версии не входят в текущий scope;
- текущий `v0.4.0-rc.1` является release candidate; публикация в RuStore — отдельный следующий шаг.
