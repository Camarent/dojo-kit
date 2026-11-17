# tools/sim — session and grading simulator

Runs study sessions through the core wasm bundle; grading and scheduling stay in the core.

```js
const sim = createSim({ course, items, intros?, stimuli?, now, seed, wasm }); // wasm: loaded dojo handle
sim.buildSession({ daysLeft? })     // -> { queue, plan }; daysLeft defaults to 4 (core: empty queue below 4)
sim.answer(itemId, correct | text)  // -> { correct, record, requeued, finish }; choice/gap items
sim.rebuild()                       // rebuild from current records
sim.records()                       // in-memory progress doc
sim.clock.advance(ms)               // move the clock
sim.runSession({ accuracy, weakUnits, rng }) // one session (one day) -> { queue, plan, finish }
```
`finish` is the core summary: answered, right, weakLeft, nextDue, denominator. `intros` and `stimuli` are accepted but unused (the core build does not read them).
`weakUnits` items are always wrong; `rng(seed)` returns a [0, 1) generator (default: mulberry32 from `seed`).
