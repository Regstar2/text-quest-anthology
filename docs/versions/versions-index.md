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
| `v0.1.5` | Reader vertical slice | 02.09.2026 |
| `v0.1.6` | Full «Завалинка» narrative skeleton | 03.09.2026 |

`v0.1.x` подтверждает технологический pipeline. Финальный литературный текст не является целью этой серии.

## v0.2.x — Zavalinka Content

| Версия | Назначение | Целевая дата |
|---|---|---|
| `v0.2.0` | Settlement + House prose | 04.09.2026 |
| `v0.2.1` | Preparation + Night prose | 05.09.2026 |
| `v0.2.2` | Assault prose | 06.09.2026 |
| `v0.2.3` | Attic + terminal endings | 07.09.2026 |
| `v0.2.4` | Consistency + literary pass | 08.09.2026 |

После `v0.2.3` новый сюжетный scope не добавляется. `v0.2.4` исправляет существующий материал и граф.

## v0.3.x — Release Preparation

| Версия | Назначение | Целевая дата |
|---|---|---|
| `v0.3.0` | Product/release hardening | 09.09.2026 |
| `v0.3.1` | Release Candidate / RuStore submission | 10.09.2026 |

`v0.3.1` является feature freeze первого цикла.

## v0.4.0 — Public MVP

Публично одобренный RuStore release.

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
