# Story packages

Каждая встроенная история хранится как независимый локальный content package:

```text
stories/<story-id>/
├── meta.json
├── story.ink
└── assets/
```

## Минимальный `meta.json`

```json
{
  "id": "zavalinka",
  "schemaVersion": 1,
  "contentVersion": 1,
  "title": "Завалинка",
  "description": "...",
  "cover": "assets/cover.webp"
}
```

`id` использует lowercase kebab-case. `schemaVersion` и `contentVersion` — положительные целые числа. `cover` должен быть относительным POSIX-путём внутри `assets/` и указывать на существующий файл.

## Сборка и validation

```powershell
npm run compile:stories
```

Команда до запуска приложения проверяет обязательные metadata fields, уникальность IDs, версии, наличие `story.ink`, ссылки на assets и компиляцию Ink. Любая ошибка завершает команду с ненулевым кодом.

Успешная проверка создаёт внутренние build artifacts:

```text
src/stories/generated/
├── manifest.ts
└── <story-id>/
    └── story.json
```

Generated files не редактируются вручную. `manifest.ts` создаётся из содержимого `stories/*` и содержит статические imports compiled Ink, необходимые Metro.

Для добавления следующей истории достаточно создать новый каталог с тем же минимальным контрактом и снова запустить validation. Публичного plugin API, remote catalog или пользовательского package installer на этом этапе нет.
