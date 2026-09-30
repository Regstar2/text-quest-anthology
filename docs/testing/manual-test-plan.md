# План ручного тестирования

## Назначение

Этот план определяет минимальную проверку первого Android MVP. Он не заменяет автоматические unit/integration tests, но является release gate для `v0.3.1`.

Проверки выполняются на фактическом release candidate. Если test case не может быть выполнен в текущей среде, статус фиксируется как `BLOCKED`, а не заменяется более простой проверкой.

## Статусы

```text
PASS     — проверено, ожидаемый результат получен
FAIL     — воспроизводимый дефект
BLOCKED  — проверка невозможна из-за внешнего/средового ограничения
N/A      — неприменимо к текущему release с объяснением
```

## 1. Install / launch

### T-001 Clean install

1. Удалить предыдущую тестовую сборку.
2. Установить release APK либо package, полученный из release flow.
3. Запустить приложение.

Ожидание:

- установка проходит без package/signature ошибки;
- приложение запускается;
- библиотека отображается;
- нет crash loop.

### T-002 Relaunch

1. Закрыть приложение.
2. Запустить повторно.

Ожидание: приложение запускается в валидном состоянии.

## 2. Library / story package

### T-010 Story listing

Ожидание:

- «Завалинка» отображается один раз;
- title/description/assets соответствуют metadata;
- нет synthetic/test story в production manifest.

### T-011 Invalid package behavior

На development/test fixture проверить битую metadata/package.

Ожидание:

- ошибка обрабатывается явно;
- приложение не падает целиком;
- пользователь не получает технический stack trace.

## 3. Reader

### T-020 Start story

1. Открыть «Завалинку».
2. Начать новое прохождение.

Ожидание:

- появляется правильный начальный текст;
- choices доступны;
- текст/choices не перекрываются banner area.

### T-021 Long content

Открыть длинную сцену.

Ожидание:

- scrolling стабилен;
- choices достижимы;
- текст не обрезан;
- banner не вызывает layout jump при загрузке.

### T-022 Font size

Изменить размер текста.

Ожидание:

- reader обновляется корректно;
- choices остаются читаемыми;
- настройка сохраняется после relaunch, если это входит в фактическую реализацию.

### T-023 Android Back

Проверить Back на library/details/reader/ending.

Ожидание:

- нет неожиданного reset narrative state;
- пользователь не теряет прохождение молча;
- приложение не попадает в пустой экран.

## 4. Narrative routes

Полный exhaustive перебор всех комбинаций вручную не требуется. Нужны известные критические маршруты из narrative map.

### T-030 Canonical/original-like path

Пройти маршрут, максимально близкий к исходной трагической ветке.

Ожидание:

- причинность событий сохранена;
- Ilya/Lera state соответствует решениям;
- ветка достигает предусмотренного ending.

### T-031 Prepared escape path

Пройти маршрут с ранним поиском/подготовкой, который использует найденные предметы/знания.

Ожидание:

- ранние решения меняют поздние options/outcome;
- предметы не появляются без получения;
- знание люка/трубы учитывается корректно.

### T-032 Alternate survivor path

Пройти маршрут, где состав выживших отличается от canonical path.

Ожидание:

- текст не упоминает погибшего персонажа как живого;
- ending соответствует фактическому состоянию.

### T-033 Bite state

Пройти минимум один маршрут с укусом.

Ожидание:

- состояние укуса не пропадает;
- последующие choices/text учитывают его там, где предусмотрено;
- ending не противоречит flag state.

### T-034 Terminal endings

Для каждого заявленного ending ID должна существовать подтверждённая route fixture или ручной маршрут.

Ожидание:

- ending достижим;
- после ending нет обязательного «продолжение следует»;
- story session корректно отмечается завершённой.

## 5. Saves

### T-040 Autosave

1. Начать историю.
2. Сделать несколько choices.
3. Закрыть приложение.
4. Запустить снова.
5. Нажать «Продолжить».

Ожидание: narrative state восстановлен без потери уже сделанных значимых решений.

### T-041 Resume after process death/relaunch

Повторить save/resume после полного закрытия процесса.

Ожидание: результат тот же.

### T-042 Restart

1. Имея save, выбрать restart.
2. Подтвердить, если UI требует подтверждение.

Ожидание:

- старое narrative state очищено;
- история начинается с начала;
- save другой истории не затрагивается в multi-story test fixture, если такой fixture существует.

### T-043 Corrupted save

Использовать test fixture с повреждённым serialized state.

Ожидание:

- нет crash loop;
- приложение предлагает/выполняет безопасный fallback;
- ошибка не маскируется под успешный resume.

### T-044 Incompatible content version

Использовать save с несовместимой `storyContentVersion`.

Ожидание: явный safe reset/fallback по фактическому contract.

## 6. Android lifecycle

### T-050 Background / foreground

Во время reader отправить приложение в background и вернуть.

Ожидание:

- narrative state сохраняется;
- текст/choices остаются валидными;
- banner/ad callbacks не ломают screen.

### T-051 Rotation / orientation

Проверить поведение согласно фактической orientation policy приложения.

Ожидание:

- если rotation разрешён — layout/state сохраняются;
- если orientation зафиксирован — policy работает предсказуемо.

### T-052 Low-memory/process recreation

Если воспроизводимо в тестовой среде, проверить восстановление после уничтожения процесса Android.

Ожидание: приложение может продолжить с последнего persisted state, а не зависит только от in-memory React state.

## 7. Offline behavior

### T-060 Full offline story

1. Отключить Wi-Fi/mobile data.
2. Запустить приложение.
3. Начать или продолжить историю.
4. Дойти до ending.

Ожидание:

- library работает;
- story загружается;
- choices работают;
- saves работают;
- ending работает;
- отсутствие рекламы не блокирует flow.

## 8. Advertising

Development проверяется на официальных demo/test IDs. Production configuration отдельно проверяется на отсутствие demo IDs.

### T-070 Sticky banner layout

Ожидание:

- banner находится сверху reader screen в зарезервированной области;
- не перекрывает narrative text;
- не перекрывает choice buttons;
- появление/исчезновение не вызывает критического layout shift;
- advertisement UI визуально не маскируется под игровую кнопку.

### T-071 Interstitial natural pause

1. Завершить историю.
2. На ending flow выполнить действие, которое по дизайну запускает interstitial.

Ожидание:

- interstitial не прерывает финальный текст до его прочтения;
- не появляется между обычными choices;
- после закрытия рекламы выполняется ожидаемый переход.

### T-072 Interstitial unavailable

Отключить сеть либо использовать controlled failure/test double.

Ожидание:

- переход продолжается без рекламы;
- нет бесконечного spinner;
- нет повторного автоматического показа в цикле.

### T-073 Ads initialization failure

На development configuration проверить `NoAdsProvider`/failure path.

Ожидание: core scenario полностью работоспособен.

### T-074 Production configuration

Перед release:

- demo/test placement IDs отсутствуют в production config;
- production IDs не хранятся внутри Ink story;
- секретов/credential material в Git нет.

## 9. Privacy / permissions

### T-080 Permissions sanity

Build the merged release manifest and run the repository gate:

```powershell
Set-Location android
.\gradlew.bat :app:processReleaseMainManifest -x :app:validateReleaseSigningConfig
Set-Location ..
npm run verify:release-privacy
```

Expected:

- the checker prints the complete merged release permission list;
- there are no unreviewed permissions;
- there are no location, contacts, SMS/calls, camera, microphone, external-storage/media or other blocked sensitive permissions;
- `INTERNET` and the Yandex-provided `AD_ID` disclosure match the production advertising configuration.

After `assembleRelease`, independently inspect the APK permission list as described in `docs/testing/privacy-and-permissions.md`.

### T-081 Privacy text

Compare the final production behavior with `PRIVACY.md` and its public RuStore copy.

Expected:

- local `SharedPreferences` saves and reader preferences are described honestly;
- absence of accounts, backend and cloud sync is stated;
- Yandex Mobile Ads/network requests/advertising identifiers are disclosed;
- the text does not claim that the application sends no data at all;
- the public policy is reachable without private GitHub access;
- the policy is rechecked after any advertising SDK, permission or storage change.

## 10. Release signing / update

### T-090 Release signing

Проверить release artifact.

Ожидание:

- package подписан production key;
- signing material отсутствует в repository;
- резервная копия ключа создана до store submission.

### T-091 Upgrade path

Когда доступно две подписанные версии, установить старую и обновить новой.

Ожидание:

- Android принимает update;
- package identity сохраняется;
- существующий save не теряется без причины.

## 11. Store readiness

### T-100 Store metadata consistency

Проверить:

- название;
- описание;
- screenshots;
- icon;
- возраст/контент;
- privacy URL/document;
- версия package;
- application/package ID.

Ожидание: карточка не обещает вторую историю или функции, которых нет в release.

### T-101 Production build smoke

На чистом устройстве/профиле выполнить:

```text
install
→ launch
→ start Zavalinka
→ make choices
→ background/foreground
→ resume
→ reach ending
→ ad flow or fail-open
→ restart
```

Это обязательный финальный critical path.

## Release blocker policy

`FAIL` блокирует release только если дефект:

- ломает core scenario;
- делает установку/запуск практически невозможными;
- приводит к существенной потере/повреждению save;
- создаёт существенную security/privacy проблему;
- делает центральное заявленное поведение ложным;
- блокирует публикацию по правилам RuStore;
- создаёт неприемлемый юридический/лицензионный риск.

Cosmetic polish и необязательные edge cases переносятся post-MVP, если основной сценарий остаётся пригодным для внешней проверки.
