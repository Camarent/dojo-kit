Frozen snapshots of the reference JS implementation (progress document + spaced repetition) that the Rust core must match.
Used only by `tests/gen-vectors.js` to produce `tests/vectors/*.json`. Do not edit; do not load at runtime.

Contract section 12 reference modules (operation order and input normalisation are specified there, not here):
- `timer.js`: `timerNext`, `timerLimit` (12.2: scale/streak/baseMs normalised, round4 after each scale step).
- `extras.js`: `applyExtras` (12.3: flags only `=== true`, `cf` ordered pair list, White_Space trim, code-point length).
- `weighted.js`: `weight`, `weightedQueue`, `unitRandom` (12.4: own-property records, `r = (v >> 11) / 2^53`, weight op order).
