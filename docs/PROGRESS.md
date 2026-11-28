# Progress document

The progress document is the learner's state for one course. The web app stores it locally and in the cloud. The Rust core merges and sanitizes it.

## Storage locations

- Local: localStorage key `dojo.<courseId>.progress.v1` (`web/storage/store.js`).
- Cloud: doc path `data/users/<uid>/progress-<courseId>` (`web/storage/adapters.js`).
- Cloud part docs: `<main path>.part<k>`, k = 1..64 (`web/storage/parts.js`).

## Size limit and part split

- A cloud doc may hold at most 120000 UTF-8 bytes of compact JSON (`CLOUD_DOC_BUDGET_BYTES` in `web/storage/parts.js`).
- A body that does not fit is split: items move into part docs, and the main doc carries `parts` = the part count (`web/storage/parts.js`, `web/storage/body.js`).
- More than 64 parts is refused (`web/storage/parts.js`).

## Top-level keys

- `v` — format version, always 1 (`crates/dojo-core/src/progress/mod.rs`).
- `t` — last-change timestamp in epoch milliseconds (`crates/dojo-core/src/progress/merge.rs`, `crates/dojo-core/src/progress/sanitize.rs`).
- `course` — course id the document belongs to (`crates/dojo-core/src/progress/merge.rs`).
- `items` — item records keyed by item id (`crates/dojo-core/src/progress/sanitize.rs`).
- `resetAt` — timestamp of the last explicit reset; only a reset moves it (`web/storage/body.js`).
- `stats` — per-day counters (`crates/dojo-core/src/progress/sanitize.rs`).
- `settings` — learner settings such as `newPerDay` and `placementDone` (`crates/dojo-core/src/progress/mod.rs`).
- `intros` — intro pages already shown (`crates/dojo-core/src/progress/merge.rs`).
- `exams` — exam results (`crates/dojo-core/src/progress/merge.rs`).
- `examDraft` — an unfinished exam answer draft (`crates/dojo-core/src/progress/draft.rs`).
- `migrated` — markers for applied migrations (`crates/dojo-core/src/progress/merge.rs`).
- `parts` — part count of a split cloud body; never reaches the store (`web/storage/parts.js`, `web/storage/connect.js`).

## Item record

Each entry of `items` has these fields (`crates/dojo-core/src/progress/sanitize.rs`):

- `s` — review stability, a non-negative integer.
- `due` — next due time in epoch milliseconds.
- `ok` — count of correct answers.
- `bad` — count of wrong answers.
- `last` — last review time in epoch milliseconds.

Unknown keys on an item record are kept as they are.

## Topic stats export

`dojo topic-stats` reads a progress document and prints per-topic counts. It reads the progress document, never writes it (`crates/dojo-cli/src/cmd/topic_stats.rs`).

- Record fields used: `s` (stability) and `last` (last review time), from `progress.items` (`crates/dojo-core/src/topic_stats/compute.rs`, `topic_stats`).
- An item with no record, or a `null` record, counts as `unseen` (`is_new`, `crates/dojo-core/src/srs/mod.rs`).
- The stage is an SRS stage, not a learning verdict. An item is `mature` when `s` is at or above the threshold, else `learning`.
- Threshold = course `learnedStage` if set, else `DEFAULT_LEARNED_STAGE` (`DEFAULT_LEARNED_STAGE`, `crates/dojo-core/src/groups/mod.rs`).
- A progress document with `parts` > 0 is refused: join the part bodies first.
- `last_changed` is a proxy: it equals the last review time `last` of the group, the same value as `last_answered`. It is not a separate change log.
