=== hatch_race ===
// TODO: fill scene prose from the approved Zavalinka decision map.
{
- not HATCH_PREPARED && not HATCH_SPOTTED:
    ~ HATCH_SPOTTED = true
}

{
- LERA_AT_HATCH_FIRST:
    -> lera_first
- else:
    -> d9
}
