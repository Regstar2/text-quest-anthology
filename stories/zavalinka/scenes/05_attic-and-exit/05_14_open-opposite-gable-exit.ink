=== roof_open ===
// Router for the split opposite-gable exit scene.
// Existing predecessors still enter through -> roof_open. The scene branches by surviving cast,
// then every branch rejoins at -> d12 without changing state.

{
- ILYA_ALIVE && LERA_ALIVE:
    -> roof_open_both
- ILYA_ALIVE:
    -> roof_open_ilya
- else:
    -> roof_open_lera
}
