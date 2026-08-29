=== d11_pre ===
// TODO: fill scene prose from the approved Zavalinka decision map.
{ ILYA_ALIVE && LERA_ALIVE:
    * [Разделиться: один блокирует основное окно, второй открывает противоположный фронтон.]
        ~ WINDOW_SECURED = true
        -> roof_open
    * [Один осторожно проверяет люк вниз, второй следит за трубой.] -> hatch_down
    * [Остаться у окна и дождаться заражённого.] -> window_canon
- else:
    * [Заблокировать окно заранее.]
        ~ WINDOW_SECURED = true
        -> window_blocked
    * [Проверить противоположный фронтон и заранее открыть выход.] -> roof_open
    * [Осторожно проверить комнату под люком.] -> hatch_down
    * [Остаться у окна и дождаться заражённого.] -> window_canon
}
