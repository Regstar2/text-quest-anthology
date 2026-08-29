=== d3 ===
// TODO: fill scene prose from the approved Zavalinka decision map.
* [Ограничиться обычным осмотром: шкафы, кровати, занавески, санузел.]
    ~ PREP_ACTIONS_LEFT = 2 - DETOUR_COUNT
    { PREP_ACTIONS_LEFT < 0:
        ~ PREP_ACTIONS_LEFT = 0
    }
    -> prep

* [Проверить дом полностью, включая потолок, печь и пространство над шкафами.]
    ~ HATCH_SPOTTED = true
    ~ HATCH_PREPARED = true
    ~ PREP_ACTIONS_LEFT = 1 - DETOUR_COUNT
    { PREP_ACTIONS_LEFT < 0:
        ~ PREP_ACTIONS_LEFT = 0
    }
    -> prep
