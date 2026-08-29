=== escape_state ===
// TODO: fill scene prose from the approved Zavalinka decision map.
{
- ILYA_ALIVE && LERA_ALIVE:
    {
    - BITE_ILYA && BITE_LERA:
        -> e17
    - BITE_ILYA || BITE_LERA:
        -> bite_choice
    - else:
        -> e15
    }
- !ILYA_ALIVE && LERA_ALIVE:
    -> o3_lera_alone
- ILYA_ALIVE && !LERA_ALIVE:
    -> o4_ilya_alone
- else:
    -> e12
}
