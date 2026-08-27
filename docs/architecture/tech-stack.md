# Технический стек

## Принцип выбора

Стек выбирается под один текущий продуктовый сценарий: **Android-приложение для чтения branching narrative с локальными сохранениями и рекламой**.

Новая технология должна решать текущую проблему. Backend, игровой движок, CMS, plugin framework и multi-platform abstraction не добавляются ради потенциального будущего.

Фактические версии SDK/runtime фиксируются в repository manifests при реализации `v0.1.0` и перед использованием version-sensitive API проверяются по официальной документации именно выбранных версий.

## Платформа

### Android

Первая и единственная обязательная платформа MVP.

Причины:

- основной канал публикации — RuStore;
- один target соответствует MVP-first ограничению;
- Android позволяет проверить signing, store moderation и Yandex Mobile Ads в реальном релизе.

Минимальный/target Android API level выбирается в `v0.1.0` после проверки актуальных требований React Native, Android tooling, Yandex Mobile Ads и RuStore. Значения не фиксируются в документации заранее без фактической конфигурации проекта.

## UI и application layer

### React Native

Используется bare React Native Android project.

Почему:

- полноценный native Android UI на Kotlin не даёт существенного преимущества для text-heavy продукта;
- React Native официально совместим с требуемым TypeScript workflow;
- для Yandex Mobile Ads существует React Native integration;
- приложение остаётся достаточно близко к native Android lifecycle/build/release.

### TypeScript

Основной язык application/UI слоя.

Требования:

- strict TypeScript configuration по возможности с первого baseline;
- production identifiers/comments/docstrings — English;
- пользовательские строки не хранятся внутри domain logic;
- story text живёт в Ink content, UI strings — в отдельном resource/localization-friendly слое.

### Expo

Не является частью обязательного stack.

MVP не должен зависеть от Expo/EAS для production build/signing. Если отдельный Expo package понадобится как библиотека и решает конкретную задачу, решение принимается отдельно по фактической необходимости.

## Narrative

### Ink

Источник branching narrative.

Ink отвечает за:

- текст;
- choices;
- variables/flags;
- conditions;
- ветвление;
- повторное схождение веток;
- terminal endings.

Не создаётся второй собственный DSL или универсальный JSON-engine поверх Ink.

### inkjs

Runtime/adaptation layer для JavaScript/TypeScript приложения.

Приложение взаимодействует с Ink через тонкий `InkStoryRuntime`, чтобы React components не управляли внутренними Ink variables напрямую.

### Компиляция истории

`.ink` является исходным форматом истории. Для приложения используется runtime-представление, совместимое с выбранной версией Ink/inkjs.

Compilation/validation выполняются до production runtime: build step или отдельная reproducible validation command. Мобильное приложение не должно превращаться в редактор/компилятор пользовательских Ink-файлов.

## Story metadata

`meta.json` — маленький внутренний manifest.

Первый schema contract:

```ts
interface StoryMetadata {
  id: string;
  schemaVersion: number;
  contentVersion: number;
  title: string;
  description: string;
  cover?: string;
}
```

Runtime validation обязательна на границе загрузки package.

Не добавлять JSON Schema/Zod/другую dependency только ради нескольких полей, если понятная TypeScript validation остаётся маленькой. Новая validation library допускается при реальном росте контракта.

## Сохранения

### Локальное key-value storage

Предпочтительная реализация MVP: `@react-native-async-storage/async-storage` либо эквивалентный поддерживаемый React Native storage package, подтверждённый при реализации.

База данных не требуется.

Храним минимум:

```text
storyId
saveSchemaVersion
storyContentVersion
serialized narrative state
startedAt / updatedAt при фактической необходимости
completed / endingId при фактической необходимости UI
```

Save implementation скрыта за `StorySaveRepository`.

## Реклама

### Application contract

```ts
interface AdsProvider {
  initialize(): Promise<void>;
  preloadInterstitial(placement: AdPlacement): Promise<void>;
  showInterstitial(placement: AdPlacement): Promise<void>;
}
```

Banner является UI-facing adapter/component, но reader screen не импортирует Yandex SDK напрямую.

### Yandex Mobile Ads

Первая production implementation — официальный React Native SDK Yandex Mobile Ads (`yandex-mobile-ads`) фактической версии, проверенной в `v0.1.4`.

MVP uses:

- adaptive sticky banner;
- interstitial;
- official demo/test IDs during development;
- production placement IDs only through production configuration.

### NoAdsProvider

Нужен для:

- unit/component tests;
- local/dev flows без SDK/network;
- безопасного поведения при отсутствующей advertising configuration.

Второй commercial ads provider не реализуется до появления реальной причины.

## Distribution boundary

Первый store — RuStore, но store-specific code не входит в narrative/domain.

MVP может иметь простой `DistributionConfig`/build config с полями, которые действительно различаются между channels, например:

```text
channel
ad placement IDs
store URL после публикации
```

Не создавать Gradle product flavors до второго магазина, если один RuStore build не требует их.

При появлении AppGallery/GetApps flavors вводятся только если они реально уменьшают ручные различия конфигурации.

## Signing

- собственный Android signing key;
- ключ/пароли никогда не коммитятся;
- `.gitignore` исключает signing material;
- минимум одна резервная зашифрованная копия вне рабочей машины; предпочтительно две независимые копии;
- один и тот же package/signing identity сохраняется между обновлениями и, по возможности, магазинами.

Конкретный способ secret injection в release build определяется при создании release configuration.

## Тестирование

### Unit / integration

Предпочтительно:

- Jest — если он уже входит в фактический React Native baseline;
- React Native Testing Library — для критичных UI states, если оправдано;
- отдельные narrative/package tests без рендера UI.

Автоматизация фокусируется на invariants, а не на line coverage.

Минимальные автоматизируемые проверки:

- metadata/package validation;
- known route → expected ending;
- critical flag changes available choices;
- save → load round trip;
- corrupted/incompatible save handling;
- AdsProvider fail-open application behavior через test double/NoAdsProvider.

## Сборка

Android build system — фактический Gradle baseline, создаваемый React Native tooling.

До первого MVP не требуется сложный CI/release orchestration. Обязательны воспроизводимые локальные команды:

```text
install dependencies
run tests/validation
build debug
build signed release
```

Точные команды документируются только после создания проекта, а не восстанавливаются по памяти.

## Что не входит в стек MVP

- Redux/large state framework без доказанной необходимости;
- backend/API server;
- SQL database;
- GraphQL;
- Firebase только ради analytics/auth;
- cloud save SDK;
- dependency injection framework;
- plugin system;
- remote config;
- custom scripting engine;
- multiple ads SDKs;
- billing SDK;
- desktop/mobile cross-platform framework поверх React Native;
- сложный animation framework только ради polish.

## Критерий хорошего стека

После появления второй истории должны сохраниться без переписывания:

- `InkStoryRuntime`;
- `StorySaveRepository` contract;
- reader flow;
- ads boundary;
- library screen logic.

Если реальная вторая история выявит недостаток, abstraction меняется тогда, когда существует конкретный второй случай.
