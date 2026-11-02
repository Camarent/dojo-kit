---
paths: [prompts/]
summary: Copy-paste prompts for AI assistants to build, extend, review or author a course with the dojo CLI.
---
# prompts

## Purpose
Ready-made instructions a user pastes into an AI assistant. They point the assistant at `AGENTS.md` and the `./dojo` wrapper; they contain no facts about any course.

## Public surface
- `prompts/build-from-materials.md` - build a trainer from the user's materials (AI with file and shell access). Placeholders in `<angle brackets>`.
- `prompts/add-content.md` - extend an existing course workspace with new material; uses `./dojo next-id`, `validate`, `stats`.
- `prompts/review-course.md` - strict review of a workspace with `./dojo validate --json`; reports only, edits nothing.
- `prompts/chat-only.md` - for an AI without shell access: it outputs `course.json` and `content/<unit>.jsonl` blocks; the user saves them and runs `./dojo validate`.

## Key files
- `build-from-materials.md` - the full workflow, including the every-30-items validation rule.
- `chat-only.md` - lists the item fields for each type.

## Invariants and gotchas
- Prompts name the CLI commands that exist (`validate`, `build`, `stats`, `next-id`).
- The prompts refer to `AGENTS.md` sections (0, 4, 5, 8) that live in the repo root, outside this module; keep those references in sync.

## Depends on / used by
- Depends on: `crates/dojo-cli` (`./dojo` commands); `AGENTS.md` at the repo root.
- Used by: the user, who pastes them into an AI assistant.
