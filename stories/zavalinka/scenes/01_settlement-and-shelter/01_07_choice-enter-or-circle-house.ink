=== d2 ===
// TODO: fill scene prose from the approved Zavalinka decision map.
* [Зайти сразу.] -> s_enter
* [Сначала обойти дом.]
    ~ PIPE_KNOWN = true
    ~ DETOUR_COUNT = DETOUR_COUNT + 1
    -> a_circle
