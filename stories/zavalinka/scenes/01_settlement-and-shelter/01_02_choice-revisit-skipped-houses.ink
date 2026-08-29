=== d1 ===
// TODO: fill scene prose from the approved Zavalinka decision map.
* [Не возвращаться. Идти к дому с целыми окнами.] -> s_house_seen
* [Вернуться к крыльцу с кровью.]
    ~ DETOUR_COUNT = DETOUR_COUNT + 1
    -> a_blood
* [Коротко проверить дом с открытой задней дверью.]
    ~ DETOUR_COUNT = DETOUR_COUNT + 1
    -> a_open
* [Осмотреть только входную часть дома с выбитыми окнами.]
    ~ DETOUR_COUNT = DETOUR_COUNT + 1
    -> a_broken
