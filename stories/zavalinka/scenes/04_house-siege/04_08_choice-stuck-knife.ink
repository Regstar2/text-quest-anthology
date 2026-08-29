=== d8 ===
// TODO: fill scene prose from the approved Zavalinka decision map.
* [Оставить нож в ране, ударить ногой и бежать к люку.]
    ~ KNIFE_AVAILABLE = false
    -> hatch_race
* [Потратить секунду и выдернуть нож.]
    ~ KNIFE_AVAILABLE = true
    ~ BITE_ILYA = true
    ~ ILYA_BITE_KNOWN_TO_LERA = false
    -> hatch_race
* {TOOLS_READY} [Крикнуть Лере: «Доску!»]
    ~ KNIFE_AVAILABLE = false
    -> hatch_race
* [Удерживать заражённого на себе и дать Лере фору.]
    ~ BITE_ILYA = true
    ~ ILYA_BITE_KNOWN_TO_LERA = false
    ~ KNIFE_AVAILABLE = false
    ~ LERA_AT_HATCH_FIRST = true
    -> hatch_race
