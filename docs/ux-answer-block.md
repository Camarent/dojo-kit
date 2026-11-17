# Answer block UX spec

Generic UX rules for the answer block of an exam item. Applies to every course and every item type. Mobile first: design for a narrow portrait screen, then widen.

## Scope

The answer block is the part of an item where the learner gives an answer and sees the result. It has three parts:

- **Question part**: the input area (option buttons, text input, cloze blanks, or ordering pool).
- **Extra part**: feedback shown after an answer (accepted forms, first wrong step, alternative orders). Optional per item type.
- **Answer texts**: the correct answer shown after grading.

Renderers own the question part. Course plugins may add text around the block but do not replace it.

## Block order

Top to bottom, always in this order:

1. Stimulus (shared passage or prompt text), when present. Position unverified: the audit did not trace where stimulus renders (`answer-block-audit.md` Notes). Confirm before relying on it.
2. Prompt.
3. Question part (input area).
4. Submit control (where the item type has one).
5. Answered caption, shown only after submit (see below). Proposed, not from the audit.
6. Extra part.
7. Answer texts.

Rules:

- No part moves position between items of the same type.
- Only one primary action is visible at a time.
- On a narrow screen the submit control spans the full width of the block.

## Answer shapes by item type

| Item type | Question part | Submit | Extra part |
|---|---|---|---|
| choice | option buttons, one per option, stacked vertically on narrow screens | none; tapping an option grades it | none |
| gap | single-line text input | submit button | shown when the item has more than one accepted answer |
| cloze, one blank | single-line text input inline with the sentence | submit button | none |
| cloze, two or more blanks | several inputs in one grouped row or column, keeping sentence order | submit button | none |
| order | sentence with slots, word or step pool below, action row | per action row | shows the first wrong step and any alternative correct order |

Rules:

- Option buttons and inputs keep the same visual size for every item of one type.
- Inputs use the keyboard hint from the item (`numeric`, `decimal`, `text`); the hint never changes grading.
- A slot or blank never changes width after the learner types into it.

## Kanji item table

Source: the kanji unit file of the audit (`answer-block-audit.md`, type inventory). Each row is one shape the kanji unit uses. Same rules as the table above apply.

| Item type | Shape | Question part | Submit | Extra part |
|---|---|---|---|---|
| choice | 4 options | option buttons, stacked vertically on narrow screens | none; tapping an option grades it | none |
| choice | with speak | same as choice, 4 options; speak is not read by the choice renderer (`web/types/choice.js:36-46`) | none | none |
| gap | one accepted answer | single-line text input | submit button | none |
| gap | several accepted answers | single-line text input | submit button | shows the accepted list |
| cloze | one blank | single-line text input inline with the sentence | submit button | none |
| cloze | two or more blanks | several inputs in one grouped row or column, keeping sentence order | submit button | none |

Rules:

- A kanji gap with several accepted answers shows the list only after submit.

## Locked caption

Proposed, not from the audit: the audit has no caption section. Confirm with the owner before use. The wording below is fixed once confirmed; change it only through this spec.

After an answer is submitted, the question part becomes read-only. A caption directly under the block states the state, so the learner sees why the input no longer responds:

- The caption is one short line, plain text, no icon-only meaning.
- Exact wording, one string per result (proposed):
  - correct: `Answered: correct`
  - wrong: `Answered: wrong`
- It is shown in the same place for every item type.
- It uses the feedback colour for the result (correct or wrong) and also the words, so colour is not the only signal.
- It stays until the learner moves to the next item.
- Tapping an answered option or input does nothing and does not show an error.

Status: the caption is not implemented. No `Answered` string in `web/ui/answer-block.js` or `web/i18n/*.json`; cloze shows `q.cloze.locked` ("not checked", exam only), per `docs/modules/web.md`.

Note: "locked" is not used for this state. It names the cloze part `{locked: string}` (fixed text shown, not typed; `crates/dojo-core/src/content/item.rs:219`), a different concept. This section names the caption "locked" only as the read-only state of the question part.

## Spacing

Proposed, not from the audit: none of the rules below appear in `answer-block-audit.md` or the brief. Confirm with the owner before use.

- Stack rule: the gap between the question part and the submit control is the same for every item type.
- Gap between the answered caption and the Extra part is smaller than the gap between the prompt and the question part.
- Minimum touch target for option buttons and submit controls: 44 px high.
- Keep at least 8 px between adjacent tap targets.
- Text inside the block never gets a smaller font size than the prompt.

## Mobile first

Status: not met by `modules/ja/web/ja.css`, which uses only `max-width` media queries (lines 5, 8; desktop-first).

- Single column. No side-by-side layout below the tablet width.
- Long options wrap; they do not truncate.
- The block scrolls with the page; it does not use a fixed-height box.
- The keyboard must not cover the submit control: scroll the focused input into view.

## Result view and layout

Source of truth: the code cites below. Each rule names the file that enforces it.

Text wrapping:

- Kana and kanji words never break inside the word. Ruby (`<ruby>`, `<rt>`) uses `white-space: nowrap`: `web/styles/app.css:391-392`, and in the detail table `web/styles/app.css:411`.
- Question, option and feedback text wrap between words only (`word-break: keep-all`): `web/styles/answer-block.css:9`, `web/styles/types-cloze.css:2`, `web/styles/types-order.css:14,23`.
- A table wider than the viewport scrolls inside its wrapper (`overflow-x: auto`); its ruby cells stay nowrap: `web/styles/app.css:378`, `web/styles/app.css:411`.

Buttons at 390x844:

- The submit control spans the full block width on narrow screens: `web/styles/answer-block.css:7`.
- "Не знаю" (`session.dontKnow`) and "Далее" (`session.next`) are never clipped; the rows wrap and their buttons use `overflow: visible; max-width: 100%`: `web/styles/app.css:395-396`. Below the tablet width each button takes the full row: `web/styles/app.css:398`. Sources: `web/ui/session-feedback.js:98`, `web/ui/session-panels.js:81`.

Wrong-answer feedback, in DOM order (`web/ui/session-feedback.js:201-213`):

1. Verdict and the correct answer, labelled.
2. Explanation card (`feedback-card`): a wrong answer with an explanation or detail wraps it in a card with `max-height: 40vh` and `overflow-y: auto`: `web/styles/app.css:367`.
3. "Далее" in the action row. The row is `position: sticky; bottom: 0`: `web/styles/app.css:368`.

Choice options after grading:

- An option the learner did not choose is never marked wrong: it has no state class, or `right` when it is the correct one (non-exam only): `web/types/choice.js:21-26`.
- In exam mode only the chosen option gets `picked`; no option gets `right` or `wrong`: `web/types/choice.js:23`.

Empty submit (text input):

- An empty or whitespace submit is not graded. It shows the inline line `session.emptyAnswer` (`web/types/gap.js:28`). Keys in `web/i18n/en.json:159`, `web/i18n/ru.json:171`, `web/i18n/fr.json:127`, `web/i18n/ja.json:127`.

Partial verdict (cloze):

- A result with some blanks right and some wrong is `partial`. The verdict text is `session.partial` instead of the wrong text: `web/types/cloze.js:145`, `web/types/cloze.js:179`. Scoring: `CONTRACT.md` "Partial verdict".
- Each blank gets a mark with an `aria-label`, so the mark is not colour only: `web/types/cloze.js:37-43`. In a partial result the label is `session.field.right` / `session.field.wrong`; otherwise `q.result.blankRight` / `q.result.blankWrong`. All-right and none-right results keep their current text.

## Out of scope

- Visual theme and colours beyond the feedback colours above.
- Per-course content, wording, and examples.
