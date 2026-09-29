# Индекс версий

Версии до первого релиза используются как небольшие проверяемые этапы, а не как обещание долгосрочного продукта.

## v0.1.x — Technical Prototype

| Версия | Назначение | Целевая дата |
|---|---|---|
| `v0.1.0` | Android Foundation | 28.08.2026 |
| `v0.1.1` | Ink/inkjs Narrative Runtime | 29.08.2026 |
| `v0.1.2` | Story Package + validation | 30.08.2026 |
| `v0.1.3` | Local saves / resume / reset | 31.08.2026 |
| `v0.1.4` | AdsProvider + Yandex demo integration | 01.09.2026 |
| `v0.1.5` | Mobile reader vertical slice | 02.09.2026 |
| `v0.1.6` | Real «Завалинка» vertical slice through runtime/save/ads boundaries | 02.09.2026 |
| `v0.1.7` | Technical prototype gate + manifest-backed anthology navigation + architecture freeze | 02.09.2026 |

`v0.1.x` подтверждает технологический pipeline. Финальный литературный текст не является целью этой серии.

`v0.1.7` закрывает техническую фазу только после успешного device smoke pass. До него допустим verdict `PROCEED WITH CONSTRAINT`; архитектурные или data-loss blockers требуют `REWORK`.

## v0.2.x — Zavalinka Content

Контентный цикл начинается с полного Ink skeleton, после чего работа идёт только по существующему сюжетному графу:

1. полный Ink skeleton;
2. написание сцен;
3. consistency pass;
4. literary pass;
5. content freeze.

Точное разбиение написания сцен по patch-версиям может корректироваться без добавления новых технических подсистем. После content freeze новый сюжетный scope не добавляется.

Архитектура, зафиксированная gate `v0.1.7`, считается базовой для всего `v0.2.x`: generated manifest → `StoryLoader` → `StorySession` / Ink → per-story save repository → общий reader.

## v0.3.x — Release Preparation

| Версия | Назначение | Целевая дата |
|---|---|---|
| `v0.3.0` | Product/release hardening | 09.09.2026 |
| `v0.3.1` | Release Candidate / RuStore submission | 10.09.2026 |

`v0.3.1` является feature freeze первого цикла.

## v0.4.0 — Public MVP

Публично одобренный RuStore release.

Для public MVP зафиксирована release identity:

- `versionName = 0.4.0`;
- `versionCode = 10`;
- `applicationId = io.github.regstar2.textquestanthology`.

`versionCode 10` продолжает последовательность после распространённой сборки `v0.1.8` с `versionCode 9`. Для каждого следующего Android artifact код должен увеличиваться, а `applicationId` остаётся неизменным.

Дата зависит от внешней модерации и не продлевает feature-development window. Допускаются только изменения, необходимые для устранения release blockers или замечаний модерации.

Состав `v0.4.0`:

- Android;
- одна законченная «Завалинка»;
- Ink/inkjs;
- local saves;
- library/reader/ending flow;
- adaptive sticky banner;
- ending interstitial;
- offline core scenario;
- production signing;
- RuStore listing.

## После v0.4.0

Номер следующей продуктовой версии заранее не фиксирует вторую историю.

Сначала выполняется decision gate:

```text
CONTINUE / PIVOT / MAINTENANCE / ARCHIVE
```

Если принято `CONTINUE`, следующая история проходит собственный content cycle. Версия приложения и `contentVersion` конкретной истории рассматриваются отдельно.

Пример:

```text
app v0.5.x
  zavalinka contentVersion=1
  story-02 contentVersion=1
```

## Правила версионирования

- Patch/minor numbering до `1.0` служит для понятного разделения ограниченных этапов.
- Не увеличивать версию только ради документации/пустого commit.
- Одна версия имеет одну основную цель.
- Не реализовывать следующую версию заранее внутри текущей.
- Фактический release/tag создаётся только когда соответствующий результат существует.
- Никакой статус `stable` не используется до осознанного перехода проекта на эту стадию.
