# Дорожная карта

## Ограничение по сроку

Первый цикл разработки длится **14 календарных дней**:

```text
28.08.2026 → 10.09.2026
```

Это жёсткий предел. После 10 сентября feature/content development прекращается. Допускаются только:

- исправления release blockers;
- обязательные изменения по результатам модерации RuStore;
- исправления критических crash/data-loss/security дефектов.

Новая функциональность после дедлайна требует отдельного post-MVP решения.

## Правило scope

До первого релиза одновременно существует только одна активная цель: **опубликовать одну законченную «Завалинку» как Android MVP**.

Если план начинает выходить за срок, сокращаются polish и P1-задачи. Нельзя компенсировать задержку добавлением людей, второй истории, CMS, backend или другой инфраструктуры.

## План версий

### v0.1.0 — Android Foundation

**Дата:** 28.08.2026

Цель: получить минимальный воспроизводимый Android baseline.

Обязательное:

- React Native + TypeScript;
- bare Android project без зависимости release flow от Expo/EAS;
- фактические версии Node.js/React Native/Android SDK/Gradle зафиксированы в repository files;
- стабильный `applicationId`;
- базовая структура `src/`, `stories/`, `tests/`;
- debug build запускается на реальном Android-устройстве;
- production code/comments/docstrings — English.

Не делать: UI polish, рекламу, полноценную историю.

### v0.1.1 — Narrative Runtime

**Дата:** 29.08.2026

Цель: доказать центральную механику.

- Ink + inkjs;
- synthetic story;
- текст → choice → изменение переменной → условная ветка → минимум две концовки;
- thin `InkStoryRuntime` adapter;
- narrative logic не находится в React screen components.

Gate: если Ink/inkjs оказывается непригодным для React Native baseline, решение меняется сейчас, а не после написания «Завалинки».

### v0.1.2 — Story Package

**Дата:** 30.08.2026

Цель: отделить контент от приложения.

- `stories/<id>/meta.json`;
- `stories/<id>/story.ink`;
- `stories/<id>/assets/`;
- manifest/loader;
- минимальная schema validation;
- уникальный story ID;
- build-time или explicit validation command;
- приложение загружает synthetic story через общий loader.

Gate: добавление второй synthetic story не должно требовать нового reader screen или отдельного runtime.

### v0.1.3 — Saves

**Дата:** 31.08.2026

Цель: надёжное локальное продолжение прохождения.

- storage adapter/repository;
- autosave;
- resume;
- restart/reset;
- save version/content version;
- corrupted/incompatible save fallback;
- save → load round-trip test.

### v0.1.4 — Advertising Boundary

**Дата:** 01.09.2026

Цель: проверить монетизационный стек до производства контента.

- `AdsProvider`;
- `NoAdsProvider`;
- `YandexAdsProvider`;
- официальный Yandex Mobile Ads React Native SDK фактической проверенной версии;
- demo/test IDs;
- adaptive sticky banner;
- interstitial preload/show;
- fail-open behavior;
- SDK отсутствует в narrative/story modules.

Store-specific production placement IDs не хардкодятся в story/UI logic.

### v0.1.5 — Reader Vertical Slice

**Дата:** 02.09.2026

Цель: получить полный технический user flow на synthetic/коротком реальном контенте.

- library screen;
- story card/details в минимальном виде;
- reader;
- scrolling;
- choices;
- ending screen;
- restart/continue;
- font size setting;
- banner area зарезервирована без layout jump;
- interstitial запускается только в ending flow;
- Android Back и background/foreground не ломают state.

### v0.1.6 — «Завалинка» Narrative Skeleton

**Дата:** 03.09.2026

Цель: перенести полную утверждённую карту решений в Ink до литературной полировки.

Обязательное:

- все ключевые флаги;
- все основные choices;
- все терминальные endings;
- короткие рабочие тексты узлов вместо финальной прозы там, где она ещё не написана;
- каждый основной маршрут можно пройти от старта до ending;
- никаких обещаний следующей главы.

Этот gate важнее красоты текста: сначала проверяется причинность графа.

## Контентный цикл

### v0.2.0 — Settlement + House

**Дата:** 04.09.2026

Финальный текст:

- путь через посёлок;
- исследование домов/подход к выбранному дому;
- вход;
- география дома;
- поиск ресурсов;
- люк/труба/подготовительные решения.

### v0.2.1 — Preparation + Night

**Дата:** 05.09.2026

Финальный текст:

- еда/отдых;
- отношения Ильи и Леры;
- подготовка дома;
- дежурство/сон;
- раннее предупреждение;
- стук;
- обнаружение заражённого;
- начало окружения.

### v0.2.2 — Assault

**Дата:** 06.09.2026

Финальный текст:

- прорыв;
- нож/бой;
- окна/мебель;
- люк;
- порядок подъёма;
- укусы;
- попытки вытащить второго персонажа;
- ветви гибели/спасения.

### v0.2.3 — Attic + Endings

**Дата:** 07.09.2026

Финальный текст:

- Лера одна / Илья один / оба живы;
- заражённый у окна;
- газовая труба;
- блокировка окна;
- крыша/спуск;
- все утверждённые эпилоги.

После этой версии новый сюжетный material не добавляется.

### v0.2.4 — Consistency + Literary Pass

**Дата:** 08.09.2026

Цель: не расширять историю, а сделать существующую внутренне непротиворечивой.

Проверить:

- достижимость endings;
- dead ends;
- impossible flag combinations;
- физическое положение персонажей;
- доступность предметов;
- знания персонажей;
- укусы/раны;
- найден ли люк/труба до соответствующего действия;
- сохранение и восстановление разных ветвей;
- отсутствие текста, обещающего следующую главу.

Литературный pass:

- убрать повторяющиеся реакции и конструкции;
- убрать шаблонную «атмосферность» без физической конкретики;
- различить голоса персонажей;
- проверить бытовую/пространственную правдоподобность;
- не переписывать сцены ради красоты, если причинность уже работает.

## Release cycle

### v0.3.0 — Product Hardening

**Дата:** 09.09.2026

Цель: превратить законченный квест в store-ready приложение.

- финальный reader polish только по критичным UX-проблемам;
- production ad config подготовлен отдельно от demo config;
- offline behavior;
- privacy-related disclosures проверены;
- icon/store screenshots/description;
- age/content information;
- release signing configuration;
- signing key backup;
- manual test plan выполнен на release build;
- release APK/AAB согласно фактическим требованиям RuStore на дату публикации.

### v0.3.1 — Release Candidate

**Дата:** 10.09.2026

Hard gate:

- signed release устанавливается на реальное устройство;
- critical routes проходят;
- saves работают;
- реклама fail-open;
- demo IDs отсутствуют в production configuration;
- secrets/signing material отсутствуют в Git;
- README/docs соответствуют фактическому состоянию;
- подготовлена/выполнена RuStore submission.

**После этого feature freeze.**

### v0.4.0 — Public MVP

Дата определяется внешней модерацией RuStore.

`v0.4.0` не является дополнительным этапом feature development. Это публично одобренная версия `v0.3.1` либо минимально исправленная версия после обязательных замечаний модерации.

## Резерв времени

Отдельного «запасного третьего недельного цикла» нет.

Если отставание возникает до 07.09:

1. убрать необязательный visual polish;
2. сократить число декоративных assets;
3. оставить один размер/простую настройку текста;
4. отказаться от GitHub release automation;
5. сократить второстепенные варианты текста, сохранив причинно значимые branches;
6. не удалять утверждённые terminal endings без отдельного продуктового решения.

Если к 09.09 отсутствует полностью проходимая история, release infrastructure перестаёт быть приоритетом до закрытия core scenario.

## Post-MVP

Вторая независимая история начинается только после внешнего decision gate из `feasibility.md`.

Если проект продолжается, следующая story обязана пройти тот же pipeline:

```text
decision map
→ Ink skeleton
→ prose by scene groups
→ consistency
→ literary pass
→ package validation
→ release
```

Первый практический тест extensibility: новая история должна добавиться без изменений `InkStoryRuntime`, save engine и reader flow. Если это невозможно, архитектура корректируется по фактическому случаю, а не заранее строится plugin framework.
