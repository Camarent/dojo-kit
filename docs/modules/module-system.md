---
paths: [modules/, crates/dojo-cli/src/modules.rs]
summary: How optional language modules are declared, loaded and checked - manifest, registry, course key, validator trait.
---
# module-system

## Purpose
A course opts into optional language modules with the `modules` array in `course.json` (ids). Each module lives in `modules/<id>/` and has a `module.json` manifest, an optional Rust validator crate in `modules/<id>/rust` and optional browser code. Module ids in this repo: `ja` ([module-ja.md](module-ja.md)) and `ru` ([module-ru.md](module-ru.md)).

## Public surface
- Course key: `modules` in `course.json`, the `"modules"` property in `schema/course.schema.json`.
- Manifest: `modules/<id>/module.json`. Fields seen in use: `manifestVersion`, `id`, `description`, `hooks` (`markup`, `validator`, `ui`), `web.scripts`, `web.styles`, `courseKeys`, `markups`.
- Registry in `modules/registry/src/lib.rs`: `IDS` = `["ja", "ru"]`, `ids()`, and `validator(id)`, which returns `Option<Box<dyn ValidatorModule>>`.
- Trait: `ValidatorModule` and `ItemChecker` in `crates/dojo-core/src/validate/module.rs`.
- CLI loading in `crates/dojo-cli/src/modules.rs`: `resolve`, `all_manifests`, `load` (reads `modules/<id>/module.json`).

## Key files
- `modules/registry/src/lib.rs` - id list and validator factory.
- `Cargo.toml` - workspace members; a new module crate is added here too.
- `crates/dojo-core/src/validate/module.rs` - the trait a module implements.
- `crates/dojo-cli/src/modules.rs` - manifest discovery and loading.

## Invariants and gotchas
- A module folder without a loadable `module.json` is skipped by `all_manifests`. A course that lists its id gets `module_missing` (error).
- A course that uses a key or markup a module provides, without listing the module in `modules`, gets `module_key_unlisted` (error). Rules: [crates.md](crates.md).
- The registry and the manifest must agree: an id in `IDS` needs a matching `modules/<id>/module.json`.
- Tests: `modules/registry/tests/registry.rs`, `crates/dojo-cli/tests/build_modules.rs`, `crates/dojo-cli/tests/validate_modules.rs`.
