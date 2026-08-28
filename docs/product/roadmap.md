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

До первого релиза одновременно существует только одна активная продуктовая цель: **опубликовать одну законченную «Завалинку» как Android MVP**.

Технический prototype gate должен быть закрыт до массового написания финальной прозы. Если gate обнаруживает архитектурный blocker, контентный цикл не используется для маскировки проблемы.

Если план начинает выходить за срок, сокращаются polish и P1-задачи. Нельзя компенсировать задержку второй историей, CMS, backend, plugin framework или другой инфраструктурой.

## v0.1.x — Technical Prototype

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

Gate: если Ink/inkjs оказывается непригодным для React Native baseline, решение меняется здесь, а не после написания «Завалинки».

### v0.1.2 — Story Package

**Дата:** 30.08.2026

Цель: отделить контент от приложения.

- `stories/<id>/meta.json`;
- `stories/<id>/story.ink`;
- `stories/<id>/assets/`;
- generated manifest/loader;
- минимальная schema validation;
- уникальный story ID;
- build-time или explicit validation command;
- вторая fixture package должна использовать тот же loader/runtime без отдельного reader.

### v0.1.3 — Saves

**Дата:** 31.08.2026

Цель: надёжное локальное продолжение прохождения.

- storage adapter/repository;
- autosave;
- resume;
- restart/reset;
- save version/content version;
- corrupted/incompatible save fallback;
- save → load round-trip test;
- storage key и reset scoped by `storyId`.

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

### v0.1.5 — Mobile Reader Vertical Slice

**Дата:** 02.09.2026

Цель: проверить reader UX и mobile behavior через общий runtime/session.

- page/feed reader modes;
- choices;
- ending screen;
- restart/continue;
- banner area;
- Android Back;
- background/foreground persistence;
- длинные reader fragments без потери текста.

### v0.1.6 — Real «Завалинка» Vertical Slice

**Дата:** 02.09.2026

Цель: провести реальный фрагмент «Завалинки» через весь уже созданный pipeline, а не держать слои проверенными только синтетическими fixtures.

Обязательное:

- реальные story metadata и Ink content;
- минимум два известных маршрута;
- причинно значимый delayed consequence;
- save/restore на реальном маршруте;
- разные terminal outcomes;
- reader, persistence и ad boundary не получают story-specific обходов.

Финальная литературная проза и полный граф всей истории в эту версию не входят.

### v0.1.7 — Technical Prototype Gate + Anthology Navigation

**Дата:** 02.09.2026

Цель: закрыть техническую фазу до content production.

Обязательное:

- минимальное главное меню;
- story catalog из generated manifest;
- `Start / Continue / Ending` из per-story save state;
- выбор story ID открывает тот же `StoryLoader` / `StorySession` / reader;
- reset затрагивает только выбранную story;
- отсутствие `DEFAULT_STORY` и story-specific application branching;
- повторная проверка narrative, persistence, ads, lifecycle и Android build/install;
- отдельный анализ ранее замеченного rapid pagination/choice hitch;
- явный verdict: `PROCEED`, `PROCEED WITH CONSTRAINT` или `REWORK`;
- фиксация архитектурных границ для `v0.2.x`.

`PROCEED WITH CONSTRAINT` допускается только для ограничений, которые не меняют narrative outcome, не создают data loss/crash и не требуют перестройки архитектуры. Release/blocking defect означает `REWORK`.

## v0.2.x — Zavalinka Content

`v0.2.x` начинается только после prototype gate. Архитектура технического ядра не расширяется автоматически.

### v0.2.0 — Full Ink Skeleton

**Дата:** 03.09.2026

Цель: перенести полную утверждённую карту решений в Ink до финальной прозы.

- все ключевые флаги;
- все основные choices;
- все terminal endings;
- короткие рабочие тексты узлов;
- каждый основной маршрут проходит от старта до ending;
- отсутствуют обещания следующей главы.

Gate: сначала проверяется причинность полного графа, затем пишется финальная проза.

### v0.2.1 — Scene Writing

**Дата:** 04–06.09.2026

Финальный текст пишется по уже существующим сценам skeleton:

- посёлок и подход к дому;
- дом, ресурсы, люк и труба;
- подготовка, еда, отдых и ночь;
- предупреждение, стук и обнаружение заражённого;
- окружение и прорыв;
- бой, окна, мебель и люк;
- чердак, труба, окно, крыша и спуск;
- terminal epilogues.

Новые сюжетные системы не добавляются ради удобства прозы. Если конкретная сцена обнаруживает реальный causal blocker, сначала исправляется graph logic.

### v0.2.2 — Consistency Pass

**Дата:** 07.09.2026

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

### v0.2.3 — Literary Pass

**Дата:** 08.09.2026

- убрать повторяющиеся реакции и конструкции;
- убрать шаблонную атмосферность без физической конкретики;
- различить голоса персонажей;
- проверить бытовую и пространственную правдоподобность;
- не переписывать сцены ради красоты, если это ломает причинность.

### v0.2.4 — Content Freeze

**Дата:** 08.09.2026

После этой точки новый сюжетный material не добавляется. Допускаются только исправления существующего текста/графа, необходимые для консистентности или release blockers.

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

Практический критерий extensibility после `v0.1.7`: новая история должна добавляться через story package/generated manifest без изменений `InkStoryRuntime`, save engine и shared reader flow. Если конкретная будущая story докажет, что это невозможно, архитектура корректируется по фактическому случаю, а не заранее строится plugin framework.
