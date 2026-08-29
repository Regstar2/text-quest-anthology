=== lera_first ===
// TODO: fill scene prose from the approved Zavalinka decision map.
{ (HATCH_PREPARED && ROPE) || (HATCH_PREPARED && (TOOLS_READY || KNIFE_AVAILABLE)) || (ROPE && (TOOLS_READY || KNIFE_AVAILABLE)):
    -> attic_both
- else:
    ~ BITE_ILYA = true
    ~ ILYA_BITE_KNOWN_TO_LERA = true
    -> dont_let_go
}
