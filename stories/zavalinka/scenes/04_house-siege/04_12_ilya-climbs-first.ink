=== ilya_first ===
// TODO: fill scene prose from the approved Zavalinka decision map.
{ !(HATCH_PREPARED || ROPE || TOOLS_READY):
    ~ LERA_ALIVE = false
    -> attic_ilya
- else:
    * {KNIFE_AVAILABLE || TOOLS_READY} [Сначала отбить заражённого сверху, затем вытянуть Леру.] -> attic_both
    * [Сразу рвануть Леру вверх.]
        ~ BITE_LERA = true
        -> attic_both
}
