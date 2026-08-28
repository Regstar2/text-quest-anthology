VAR opened_door = false

Техническая история: свет в подъезде погас.

* [Открыть дверь]
    ~ opened_door = true
    -> resolve
* [Остаться внутри]
    ~ opened_door = false
    -> resolve

=== resolve ===
{ opened_door:
    Ты открываешь дверь и выходишь в коридор. # ending:ending_a
    -> END
- else:
    Ты запираешь дверь и остаёшься внутри. # ending:ending_b
    -> END
}
