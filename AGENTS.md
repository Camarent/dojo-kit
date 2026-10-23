# AGENTS.md — build a trainer with dojo-kit

You are an AI assistant (any vendor, any tool). The user wants a practice trainer for an exam, a course or a skill, built from their own materials. This file is the complete procedure. Follow it in order. The tool `dojo` checks your work and prints machine-readable errors: fix what it reports instead of guessing.

Field lists, unambiguous-answer rules, unit/exam/plugin settings and the content self-check are in `docs/AUTHORING.md`; this file is the procedure. For textbooks (PDF, scans, EPUB) also follow `docs/FROM-TEXTBOOKS.md`.

## 0. Rules that always apply
- Work ONLY inside the course folder `workspace/<course-id>/`. Do not edit `crates/`, `web/`, `tools/`, `tests/`, `schema/` or this file unless the user asks you to change the framework itself.
- Facts come from the user's materials (and sources the user allows you to consult). Do not invent facts. If a material is ambiguous or you are unsure, leave the item out and tell the user.
- Copyright: the materials may be copyrighted. Write your own questions and short explanations; quote at most a short phrase. Never paste long passages, full tables or whole exercises into the course. The `source` field points to where a fact came from (file and page or section), it does not copy it.
- Ids are permanent. Never reuse, renumber or delete an id. To remove an item set `"status":"retired"`. To change an item's type or its correct answer, retire it and add a new item with a new id (saved progress belongs to the id). Editing wording or fixing a typo is fine.
- No secrets, no personal data of the user in the course files.
- Never claim something works without running the command that proves it.

## 1. Intake (ask once, then decide)
Find out, asking the user only what you cannot infer from the materials:
1. Topic or exam, level, and the date if there is one.
2. UI language (`uiLanguage`: `en` and `ru` are shipped; any other code needs a translation file, see section 9) and content language.
3. Exam format and pass rule. Ask: is there an official exam for this topic? If yes: its sections, question counts, minutes and its official pass rule (total points, minimum per section, whether scores are scaled) and where it is published; mirror it as closely as possible (`scoring`, `passPoints`, `pass: {basis:"official", source, scaled}`). If there is no official exam, say the default is 60% correct and ask whether they want another rule; record the answer (`passMark`, `pass.basis:"author"`). Never invent a pass rule.
4. Which question types they want (section 4). Default: a mix, mostly `choice`, with `gap`, `cloze`, `multi` and `numeric` where they fit, and `card` for pure memorization.
5. Where to publish. Today the supported target is a Claude artifact (section 7). Other targets are planned.
6. Where the materials are. If they are not in `workspace/<course-id>/materials/` yet, ask the user to put them there (or tell you the path).
7. Mock exam: if there is one, which materials (past papers, chapter tests) are kept for the exam only. Ask if the materials do not make it clear (section 3, item 2).

## 2. Set up
```
./dojo init <course-id> --title "<Title>" --ui en --content-lang en
```
`<course-id>`: lowercase letters, digits, `-` and `_`, at most 48 chars, starting with a letter or digit (it becomes part of the progress storage key, so keep it stable). This creates `workspace/<course-id>/` with `course.json`, `content/`, `materials/` and `MAP.md`. Run `./dojo schema --brief` and read it: it lists every item field of every question type and every validator code, with examples; course.json fields not shown there are in `docs/AUTHORING.md` and `schema/course.schema.json`. It is the reference; this file only gives the procedure.

## 3. Read the materials and plan
1. List `materials/`. Convert what you cannot read directly to text (PDF: `pdftotext`, or your tool's reader; images need OCR; do not guess at unreadable pages). Put converted text next to the originals in `materials/` only if it is yours to keep.
2. Write `MAP.md`: one line per unit: unit id, title, which files/pages/sections feed it, how many items you plan. Aim for units of 10-40 items. Units are the unit of study, practice filters and exam sections.
   With a mock exam, ideally its questions differ from the training questions: put exam-only questions in their own units (`examOnly: true`) and point the exam sections at them. Decide this split once the materials are known; ask the user if unclear. If materials are scarce, overlap is allowed. Details: `docs/AUTHORING.md` "Exams".
3. Edit `course.json`: replace the placeholder unit with the real units (`id` matching `^[a-z0-9][a-z0-9_-]{0,47}$`, `title`), set `exam`/`exams` with the pass rule from step 3 if the real exam format is known, set `types` only if the user wants to restrict them. Leave `srs` alone unless asked.
4. Show the user the plan (units, counts, type mix) in a few lines and continue unless they object.

## 4. Write the content
Add items with `./dojo add`, not by writing the content files by hand (hand-written JSON formatting is the most common failure). Pass a JSON array (or several JSON objects in a row; pretty-printed is fine) on stdin:
```
./dojo add workspace/<course-id> <unit-id> <<'EOF'
[
  {"type":"choice","prompt":"...","options":["...","...","..."],"answer":0,"explanation":"...","source":"materials/x.md section 2","tags":["topic"]},
  {"type":"gap","prompt":"...","answers":["..."],"explanation":"..."}
]
EOF
```
`unit` and `id` are optional: the tool fills the unit and assigns the next free id. It checks the structure of every item and adds all of them or none, printing the new ids; on errors it prints `item k: message` for each bad item and writes nothing, so fix those items and send the whole batch again. Send 8-15 items per call. You have a limited number of tool calls: never add items one at a time. The content files (`content/<unit-id>.jsonl`, one object per line) are generated; edit one only to fix or retire a single existing item, carefully, and run validate afterwards.

Fields common to every item: `type`, `prompt` (required: the question or instruction), optional `tags` (array of short topic strings), `explanation` (why the answer is right, 1-2 sentences, strongly recommended), `source`, `status`, and `id` and `unit` (normally omitted when using `add`). Ids look like `<prefix>-<number>` and are permanent. To pick ids yourself, ask the tool: `./dojo next-id workspace/<course-id> <prefix> --count 20`.

Types (see `./dojo schema --brief` for the main fields; `schema/course.schema.json` is the complete reference):
- `choice`: one correct option among 3-5. `options`, `answer` (index of the correct option, counting from 0). The app shuffles options, so the position of the answer does not matter. Use for true/false too (`["True","False"]`).
- `multi`: select all that apply. `options` (3+), `correct` (array of indices, fewer than the number of options). Say in `prompt` that several answers are right.
- `gap`: a typed short answer. `answers` (all accepted spellings), optional `normalize` (`caseSensitive`, `trim`, `collapseSpaces`, `stripPunctuation`). Only for answers that have one unambiguous short form.
- `cloze`: fill blanks in a sentence. `parts`: array of strings (literal text) and arrays of strings (a blank with its accepted alternatives), e.g. `["The capital of France is ",["Paris"],"."]`. Max 5 blanks recommended.
- `numeric`: a number. `answer`, optional `tolerance` (absolute), optional `unitLabel` (display only, e.g. "kg").
- `match`: link pairs. `pairs: [{"left":"..","right":".."}]` (2-6 recommended), optional `distractors` (extra wrong right-hand choices). Lefts must be distinct, rights must be distinct.
- `order`: put steps in order. `steps` in the CORRECT order (the app shuffles them). 3-7 steps recommended.
- `card`: self-rated flashcard. `prompt` is the front, `back` the answer. Use for definitions and facts that cannot be auto-checked. Cards are never used in the mock exam.

Quality rules:
- One fact or skill per item. A learner who knows it must be able to answer without guessing.
- Distractors are plausible mistakes a real learner makes, similar length and form as the right answer. No "all of the above", no "none of the above", no jokes.
- The prompt must not contain its own answer. Do not make the right option the longest.
- Make the prompt stand on its own (the learner sees one item at a time).
- Balance: cover every part of the materials proportionally; mix easy and hard; mix types.
- `explanation` should say why, and `source` where to read more.

## 4a. Hard rules for writing content (a run that breaks them is a failed run)
- The ONLY way to create items is `./dojo add`. Never create, overwrite or append to `content/*.jsonl` with a file-writing tool, a shell redirect or `echo`, not even "just this once" or to fix a rejected batch. If `add` rejects a batch, correct the JSON and send the whole batch again.
- Editing an existing line is allowed only to fix wording or retire one item (section 0), followed by validate in the same step.
- Every `choice` needs `answer`, every `multi` needs `correct`, every `gap` needs `answers`: `add` rejects items without them. A source that has no answer for an item means you leave the item out.
- A source text that serves several questions (a reading passage, a dialogue) goes by default in each question's `prompt` (full text, one question per item); the optional `stimulus` field and `stimuli.jsonl` exist but are used only when the user asks for them (see docs/AUTHORING.md). Do not drop the answer to save space.
- Do not put the answer in the `prompt` (for a listening script: the question may mention the topic, never the answer).
- Order of work under a turn limit: add -> validate after EVERY add -> fix -> next. Reserve the last 3 tool calls for `validate`, `lock`, `build`. Coverage targets are secondary to ending with zero validation errors; if you are running out of turns, stop adding and finish those three.
- Never create files outside the course folder, and delete nothing but your own scratch files. Leave unused units out of `course.json` instead of leaving them empty.
- Keep a `GAPS.md` in the course folder when the materials contain something no item type can express (shared passage, audio, markup, timers): one factual bullet each, what you did instead.

## 5. Check after every shard
After every 2-3 `add` calls (about 30 items) run:
```
./dojo validate workspace/<course-id> --json
```
Exit code 0 = no errors. Fix every `error` (the message names the file, line and rule). Read the `warning`s: fix them unless you have a reason. Then `./dojo lock workspace/<course-id>` records the ids (it refuses if there are errors). Repeat for the next shard. `./dojo stats workspace/<course-id>` shows counts per unit and type; use it to find thin units.
Never end a session with validation errors.

## 6. Review before building
Re-read a random sample (10-15%) of the items as a learner would: is each answer actually supported by the materials, is exactly one option right (for `choice`), are the explanations true? Fix or retire what is not. Report to the user: number of items per unit and type, anything you skipped and why.

## 7. Build and publish (target: Claude artifact)
```
./dojo build workspace/<course-id>
```
This validates (errors refuse the build; add `--strict` to refuse on warnings), updates `ids.lock`, and writes `dist/<course-id>/index.html`, `dist/<course-id>/data/content.json` and `manifest.json`. A size over 8 MiB prints a warning, over 16 MiB is an error.
Publishing needs an assistant that can publish Claude artifacts (Claude Code with the Artifact tool, or the `make-trainer` skill). Publish `dist/<course-id>/index.html` as the page and `data/content.json` as a supporting file at the same relative path, with capabilities `{"db":{},"user":{}}`. The page loads `data/content.json` itself. Publish privately (the default) and give the user the link. If your tool cannot publish artifacts, stop after the build, tell the user exactly where `dist/<course-id>/` is, and say they need to publish it with Claude Code.
Progress is saved in the viewer's artifact database (and in the browser as a fallback). To ship new content later, publish to the SAME artifact URL; a new artifact starts with empty progress. The Settings screen of the app has a progress export (copy the text) as a backup.

## 8. Update an existing course
Add items with `./dojo add` (new ids are assigned for you), or retire items. Never reorder or renumber. Run validate, lock, build, and republish to the same URL. Tell the user that wording changes keep progress and type/answer changes do not (they should be new ids).

## 8a. Unambiguous answers
- One right answer per item: a learner who knows it must be able to answer without guessing.
- No readings glued with "/" in choice or multi options; use separate options instead.
- The prompt must match the input the item type gives: do not ask to "write" on a choice/match/order/card, do not ask to "choose/pick" on a gap.
- No mixed scripts: text should only use Latin, Cyrillic, Hiragana, Katakana, or CJK characters (common punctuation and digits are allowed); whitelist other scripts via `course.json` `scripts: ["Arabic"]` if intentional.
- Self-check: each gap has one answer unless the prompt says "any", "one of", or similar; each option is unique after normalization; each order prompt's `___` count matches its steps count; no two non-stimulus gap/cloze/numeric items share the same normalized prompt with different normalized answer sets (`same_prompt_different_answers`).

## 9. Other UI languages
`en` and `ru` are shipped in `web/i18n/`. If the course `uiLanguage` has no `web/i18n/<lang>.json`, translate `web/i18n/en.json` into `workspace/<course-id>/i18n/<lang>.json`: keep every key and every `{placeholder}`, translate the values, keep plural suffixes. Then run validate and build (section 7). Do not edit the framework for this.
- Plural forms: `ru` uses `.one`, `.few`, `.many`, `.other`; every other language uses `.one` and `.other` only. Other plural categories (ar, pl, cs, ...) are not supported precisely: translate them to `one`/`other`.
- A course file overlays the shipped file key by key, so it can also override single strings (for example `speech.novoice`). Keys missing from the course file fall back to en at runtime.
- Shipping a language for everyone is framework-owner work, only when the user asks: copy `web/i18n/en.json` to `web/i18n/<lang>.json`, translate it, add `"<lang>"` to `web/bundle.json` `i18n`, and run `node --test web/tests/i18n.test.js`.

## 10. When something fails
- `dojo validate` codes and meanings: `./dojo schema --brief` (last section).
- Build says "no UI translation": see section 9.
- Build or `./dojo` fails to compile: the framework needs a Rust toolchain (`rustup`); tell the user, do not work around it.
- Never edit the generated `dist/` files by hand.
