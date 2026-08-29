=== d11 ===
// TODO: fill scene prose from the approved Zavalinka decision map.
{ ILYA_ALIVE && LERA_ALIVE:
    { WINDOW_READY:
        * [Один удерживает и фиксирует окно, второй сразу открывает противоположный фронтон.]
            ~ WINDOW_SECURED = true
            -> roof_open
        * [Замереть и потерять оставшееся время.] -> e12
    - HAMMER:
        * [Один следит за рамой, второй быстро отжимает доски фронтона молотком.] -> roof_open
        * [Замереть и потерять оставшееся время.] -> e12
    - else:
        -> e12
    }
- else:
    * {WINDOW_READY} [Поставить подготовленную блокировку.]
        ~ WINDOW_SECURED = true
        -> window_blocked
    * {WINDOW_READY} [Отбить руки доской и сразу зафиксировать створку.]
        ~ WINDOW_SECURED = true
        -> window_blocked
    * {HAMMER} [Ломать доски противоположного фронтона.] -> roof_open
    * [Замереть или не успеть принять решение.] -> e12
}
