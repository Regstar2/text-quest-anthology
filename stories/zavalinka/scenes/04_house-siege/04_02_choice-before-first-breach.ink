=== d7 ===
// TODO: fill scene prose from the approved Zavalinka decision map.
* {HATCH_PREPARED} [Уходить на чердак прямо сейчас.]
    ~ HATCH_HEAD_START = false
    -> pre_attic
* {!HATCH_PREPARED} [Искать второй выход в дальней комнате.] -> hatch_spotted_late
* {TOOLS_READY} [Взять подготовленную длинную доску и прикрыть отход.] -> board_defense
* [Остаться у первой комнаты с ножом.] -> breach
* [Рвануть к террасе.] -> terrace_fail
