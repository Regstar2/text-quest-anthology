=== d11_pre ===
// TODO: fill scene prose from the approved Zavalinka decision map.
* {ILYA_ALIVE && LERA_ALIVE} [Разделиться: один блокирует основное окно, второй открывает противоположный фронтон.]
    ~ WINDOW_SECURED = true
    -> roof_open
* {ILYA_ALIVE && LERA_ALIVE} [Один осторожно проверяет люк вниз, второй следит за трубой.] -> hatch_down
* {ILYA_ALIVE && LERA_ALIVE} [Остаться у окна и дождаться заражённого.] -> window_canon
* {!ILYA_ALIVE || !LERA_ALIVE} [Заблокировать окно заранее.]
    ~ WINDOW_SECURED = true
    -> window_blocked
* {!ILYA_ALIVE || !LERA_ALIVE} [Проверить противоположный фронтон и заранее открыть выход.] -> roof_open
* {!ILYA_ALIVE || !LERA_ALIVE} [Осторожно проверить комнату под люком.] -> hatch_down
* {!ILYA_ALIVE || !LERA_ALIVE} [Остаться у окна и дождаться заражённого.] -> window_canon
