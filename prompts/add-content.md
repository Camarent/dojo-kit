# Prompt: add content to an existing course

```
Open <path to dojo-kit>, read AGENTS.md (sections 0, 4, 5, 8) and then extend the course workspace/<course-id>/ with material from <new files or topic>. Before writing an item, check that its word is not already in the course: grep workspace/<course-id>/content/*.jsonl for the same kana or kanji and the same English meaning; if an active item already has it, do not add a second copy: merge into the existing item or skip, and tell me which. Use ./dojo next-id for ids, never reuse or renumber ids, validate and lock after each batch, and show me the new counts with ./dojo stats. Do not change existing items except to retire wrong ones; tell me which ones and why.
```
