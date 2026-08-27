# Text Quest Anthology

Android-приложение-антология коротких независимых текстовых квестов. Первая история — хоррор/выживание «Завалинка»; решения игрока меняют доступные события и приводят к нескольким терминальным концовкам.

[Документация](#документация) · [Дорожная карта](#дорожная-карта) · [Обратная связь](../../issues)

---

## О проекте

Проект проверяет простой сценарий: пользователь устанавливает приложение, выбирает короткую интерактивную историю, читает её, принимает решения, получает последствия прошлых выборов и завершает прохождение одной из концовок.

Истории не обязаны быть связаны между собой. Архитектура должна позволять добавлять будущие истории преимущественно как контентные пакеты, без переписывания narrative runtime и основных экранов приложения.

Первый целевой канал распространения — Android/RuStore. Приложение проектируется offline-first: чтение, выборы и сохранения не должны зависеть от сети. Интернет нужен только внешним сервисам, прежде всего рекламе.

## Статус проекта

**Стадия:** IDEA → PROTOTYPE.

Разработка начинается **28 августа 2026 года**. Жёсткий предел разработки первого MVP — **10 сентября 2026 года включительно** (14 календарных дней).

На текущем этапе в репозитории фиксируются продуктовые и технические решения. Рабочей Android-сборки пока нет; первая реализация начинается с `v0.1.0`.

Первый MVP должен содержать одну полностью законченную историю — «Завалинка» — и быть подготовлен к публикации в RuStore. Модерация магазина может завершиться после 10 сентября; после дедлайна допускаются только исправления, необходимые для прохождения модерации или устранения release-blocker дефектов.

## Быстрый старт

Пока код приложения не создан, репозиторий используется как исходная точка разработки:

```powershell
git clone https://github.com/Regstar2/text-quest-anthology.git
cd text-quest-anthology
```

Дальнейшие команды появятся после `v0.1.0`, когда будут зафиксированы фактические версии Node.js, React Native, Android SDK и Gradle.

Перед реализацией читать в таком порядке:

1. [`docs/product/mvp-scope.md`](docs/product/mvp-scope.md)
2. [`docs/product/roadmap.md`](docs/product/roadmap.md)
3. [`docs/architecture/tech-stack.md`](docs/architecture/tech-stack.md)
4. [`docs/architecture/architecture.md`](docs/architecture/architecture.md)
5. [`docs/testing/manual-test-plan.md`](docs/testing/manual-test-plan.md)

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

Коротко:

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
