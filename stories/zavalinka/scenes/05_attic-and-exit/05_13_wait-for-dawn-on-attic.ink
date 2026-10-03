=== o6 ===
// Router for the split wait-for-dawn scene.
// 05_12 still enters through -> o6. From here the story branches by the surviving cast,
// then every branch rejoins at -> roof_open without changing state.

{
- ILYA_ALIVE && LERA_ALIVE:
    -> o6_both
- ILYA_ALIVE:
    -> o6_ilya
- else:
    -> o6_lera
}
