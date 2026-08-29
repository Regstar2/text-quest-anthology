=== prep ===
// TODO: fill scene prose from the approved Zavalinka decision map.
{ PREP_ACTIONS_LEFT <= 0:
    -> prep_done
}

* {PREP_ACTIONS_LEFT > 0 && !BARRICADE} [Укрепить низкое окно и дверь террасы.] -> p_barr
* {PREP_ACTIONS_LEFT > 0 && !BLACKOUT} [Закрыть окна плотной тканью.] -> p_black
* {PREP_ACTIONS_LEFT > 0 && !HATCH_PREPARED} [Найти и заранее подготовить люк.] -> p_attic
* {PREP_ACTIONS_LEFT > 0 && !TOOLS_READY} [Поставить у кровати длинную доску и распорки.] -> p_tools
* {PREP_ACTIONS_LEFT > 0 && !ILYA_RESTED} [Дать Илье немного поспать первым.] -> p_rest
* {PREP_ACTIONS_LEFT > 0 && HATCH_PREPARED && !WINDOW_READY} [Осмотреть чердак и подготовить вещи у маленького окна.] -> p_pipe
