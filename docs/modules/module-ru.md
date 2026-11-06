---
paths: [modules/ru/]
summary: The optional `ru` module - validator only; prompt trigger words and disambiguation words.
---
# module-ru

## Purpose
Russian add-on. It has no browser code and no markup. It supplies two word lists to the core validator. Enabled per course with `"modules": ["ru"]` in `course.json`. General module rules: [module-system.md](module-system.md).

## Public surface
- Manifest `modules/ru/module.json`: `"id": "ru"`; hooks `validator` only.
- Rust crate `dojo-module-ru`: `pub struct Ru` in `modules/ru/rust/src/lib.rs`.
- `PROMPT_TRIGGERS` in `modules/ru/rust/src/lib.rs`: `напишите` (choice, order, match, card items), `выберите` (gap items).
- `DISAMBIGUATION_WORDS` in `modules/ru/rust/src/lib.rs`: `любой`, `или`.
- `ValidatorModule` impl: `id()` returns `"ru"`; `prompt_triggers()` and `disambiguation_words()` return the two lists above.

## Key files
- `modules/ru/rust/src/lib.rs` - the whole validator.
- `modules/registry/src/lib.rs` - the validator factory maps `"ru"` to `dojo_module_ru::Ru`.

## Invariants and gotchas
- Trigger and disambiguation words are matched by the core validator through the trait; changing them changes validator output for every course that lists `ru`.
- Tests: `modules/ru/rust/tests/ru_words.rs`.
