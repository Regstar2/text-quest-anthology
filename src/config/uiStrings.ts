export const UI_STRINGS = {
  prototypeTitle: 'Мобильный reader prototype',
  prototypeStatus: 'Ink runtime · локальные сохранения · reader flow',
  loadingStory: 'Загрузка истории…',
  startupFailed: 'Не удалось запустить историю.',
  startStory: 'Начать историю',
  continueStory: 'Продолжить',
  viewEnding: 'Посмотреть концовку',
  menu: 'Меню',
  returnToStart: 'На стартовый экран',
  exitStory: 'Выйти из истории',
  choicesLabel: 'Варианты выбора',
  readerModeLabel: 'Режим чтения',
  readerModePages: 'Страницы',
  readerModeFeed: 'Лента',
  readerModePagesHint: 'Текст автоматически заполняет доступную страницу без прокрутки.',
  readerModeFeedHint: 'Накопительная лента предыдущих фрагментов.',
  pageLabel: 'Страница',
  previousPage: 'Назад',
  nextPage: 'Вперёд',
  endingLabel: 'Концовка',
  finalTextLabel: 'Финальный текст',
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
