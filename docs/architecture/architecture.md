# Архитектура

## Цель

Архитектура должна позволить выпустить одну «Завалинку» за две недели и при этом не привязать приложение к конкретной истории, RuStore или Yandex SDK.

Главное ограничение: **не строить платформу раньше второго реального кейса**.

## Высокоуровневая схема

```text
┌─────────────────────────────────────────────┐
│                  React Native               │
│                                             │
│  Library ── Story Details ── Reader ─ Ending│
└───────────────┬───────────────────────┬─────┘
                │                       │
                ▼                       ▼
        Narrative application       Ads boundary
                │                       │
                ▼                 ┌─────┴─────┐
         InkStoryRuntime          │           │
                │          YandexAdsProvider  NoAdsProvider
                ▼
            Ink / inkjs
                │
                ▼
         Story package loader
                │
          ┌─────┴─────┐
          ▼           ▼
       metadata     assets

                │
                ▼
        StorySaveRepository
                │
                ▼
          local storage
```

## Предлагаемая структура

Фактическая структура может быть скорректирована после bootstrap React Native, но зоны ответственности должны остаться различимы.

```text
src/
├── app/
│   ├── navigation/
│   └── configuration/
├── features/
│   ├── library/
│   ├── reader/
│   └── endings/
├── narrative/
│   ├── InkStoryRuntime.ts
│   ├── StoryLoader.ts
│   ├── StoryMetadata.ts
│   └── StoryManifest.ts
├── storage/
│   └── StorySaveRepository.ts
├── ads/
│   ├── AdsProvider.ts
│   ├── AdPlacement.ts
│   ├── NoAdsProvider.ts
│   └── yandex/
│       ├── YandexAdsProvider.ts
│       └── YandexAdBanner.tsx
├── distribution/
│   └── DistributionConfig.ts
└── ui/
    └── shared/

stories/
└── zavalinka/
    ├── meta.json
    ├── story.ink
    └── assets/

tests/
```

Не создавать пустые папки/интерфейсы только ради соответствия этой схеме. Структура появляется вместе с реальным кодом.

## Narrative boundary

### Ответственность Ink

Ink является единым источником истины для narrative behavior:

- текст сцены;
- варианты выбора;
- flags/variables;
- условия;
- branching;
- схождение веток;
- endings.

React UI не должен дублировать эти правила.

Плохо:

```ts
if (hasHammer && atticKnown) {
  // choose story branch in React screen
}
```

Хорошо:

```text
Ink решает, какие choices доступны.
Reader показывает то, что вернул InkStoryRuntime.
```

### InkStoryRuntime

Тонкий adapter вокруг inkjs.

Ответственность:

- создать runtime из подготовленного story package;
- получить следующий текст;
- получить choices;
- применить выбранный choice;
- определить завершение/ending;
- сериализовать/восстановить runtime state.

Он не отвечает за UI, рекламу, Android lifecycle или store distribution.

## Story packages

### Контракт

```text
stories/<story-id>/
├── meta.json
├── story.ink
└── assets/
```

Истории независимы. Общая связь между ними не требуется.

`story-id` стабилен после публикации, потому что используется saves/manifest.

### Manifest

Приложение получает список встроенных историй через build-generated или статически проверяемый manifest.

MVP не сканирует файловую систему пользователя и не загружает remote packages.

### Добавление будущей истории

Целевой flow:

```text
создать stories/story-02/
→ добавить meta.json
→ добавить story.ink
→ добавить assets
→ validation
→ build
```

Допускается добавить запись в manifest/build config, если это остаётся простым и явным.

Не должно требоваться:

- новый reader screen;
- новый save engine;
- новый AdsProvider;
- отдельная navigation architecture;
- копия Ink runtime.

Если второй реальный story package требует новый metadata field, контракт расширяется на основании этого кейса.

## Save boundary

`StorySaveRepository` скрывает конкретный storage mechanism.

Пример application-facing операций:

```ts
load(storyId)
save(storyId, state)
clear(storyId)
```

Один story save не должен изменять другой.

Save проверяет минимум:

- schema version;
- story ID;
- story content version;
- сериализованное состояние runtime.

При несовместимости приложение предлагает безопасный restart или другой явный fallback. Оно не пытается «угадать» миграцию повреждённого Ink state.

## Ads boundary

### Правило

Reader знает, **где предусмотрено рекламное место**, но не знает API рекламной сети.

Пример:

```text
Reader
 └── AdBanner placement=story_reader

Ending flow
 └── AdsProvider.showInterstitial(ending_exit)
```

Внешняя реализация:

```text
AdsProvider
├── YandexAdsProvider
└── NoAdsProvider
```

### Fail-open

Любая ошибка:

- SDK initialization;
- no fill;
- timeout;
- отсутствие сети;
- show failure;

приводит к продолжению пользовательского flow без рекламы.

Реклама не является частью game state и не влияет на концовку.

## Distribution boundary

Первый store — RuStore.

Core/application modules не должны содержать `if (store === "rustore")` без конкретной необходимости.

На MVP достаточно простой distribution configuration. Отдельные product flavors появляются только вместе со вторым реально подключаемым магазином.

Возможные store-specific значения:

- Yandex placement IDs;
- URL store listing;
- отдельный legal/config artifact;
- SDK, если конкретный store реально потребует его.

## Offline boundary

Narrative flow должен оставаться рабочим при полном отсутствии сети.

Следовательно:

```text
network failure
  └── может отключить рекламу
      но не влияет на:
      library
      story load
      choices
      saves
      endings
```

Никакой network service не является обязательной зависимостью core scenario MVP.

## UI state

React components отображают application state и передают user actions.

Не хранить в UI отдельные копии Ink variables, если они не являются чисто presentation state.

Допустимый UI state:

- scroll position;
- loading/error presentation;
- выбранный font size;
- visible modal;
- ad layout state.

Narrative state остаётся в runtime/save layer.

## Error model

Ожидаемые ошибки должны иметь технический тип/код, а не случайную пользовательскую строку.

Минимальные категории:

```text
STORY_NOT_FOUND
INVALID_STORY_METADATA
STORY_RUNTIME_LOAD_FAILED
SAVE_CORRUPTED
SAVE_INCOMPATIBLE
ADS_UNAVAILABLE
```

`ADS_UNAVAILABLE` не является fatal error.

UI преобразует технический результат в понятное русское сообщение.

## Build-time checks

До release build желательно иметь одну воспроизводимую команду/скрипт, которая проверяет:

1. все story IDs уникальны;
2. metadata валидны;
3. assets, на которые ссылается metadata, существуют;
4. Ink source компилируется;
5. known critical routes/tests проходят;
6. demo ad IDs не попадают в production config;
7. signing secrets отсутствуют в tracked files.

Не создавать большой build framework; достаточно простых project-specific scripts.

## Архитектурные запреты до MVP

До появления реального второго кейса не вводятся:

- generic plugin interface для stories;
- downloadable package protocol;
- remote catalog;
- dependency injection container;
- store service locator;
- ads mediation engine;
- собственный event bus;
- universal save migration framework;
- scripting abstraction поверх Ink;
- repository/service/interface на каждый простой файл только ради слоя.

## Проверка extensibility после релиза

Вторая история является первым настоящим архитектурным тестом.

Успех:

> story-02 добавляется как новый package, а существующие runtime/save/reader модули меняются только при обнаружении реального общего требования.

Неуспех:

> для каждой истории появляются специальные `if`, отдельные screens или копии runtime logic.

В таком случае сначала исправляется конкретная граница, а не строится универсальная платформа целиком.
