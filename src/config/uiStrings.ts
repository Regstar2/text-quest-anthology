export const UI_STRINGS = {
  prototypeTitle: 'Ink runtime prototype',
  prototypeStatus: 'Ink runtime · локальные сохранения',
  loadingStory: 'Загрузка истории…',
  startupFailed: 'Не удалось запустить историю.',
  endingLabel: 'Терминальная концовка',
  restart: 'Начать заново',
  restartConfirmation:
    'Текущий прогресс этой истории будет сброшен. Другие истории не затрагиваются.',
  cancel: 'Отмена',
  corruptedSaveReset:
    'Сохранение повреждено и было безопасно сброшено. История начата заново.',
  incompatibleSaveReset:
    'Сохранение относится к несовместимой версии истории и было сброшено.',
  storageUnavailable:
    'Локальное хранилище недоступно. История запущена без восстановления.',
  saveFailed:
    'Не удалось сохранить прогресс. Текущий сеанс продолжает работать.',
  storyActionFailed: 'Не удалось применить действие к истории.',
} as const;
