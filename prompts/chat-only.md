# Prompt: AI without file or shell access (chat only)

You cannot run `dojo`, so ask the AI to produce the course files as text and run the tool yourself.

```
I want a practice trainer for <exam/course>. Produce, as separate code blocks with the file name above each block:
1. course.json (fields: id, title, uiLanguage, contentLanguage, units [{id,title}], optional exam {minutes, passMark?, pass?, sections [{title,count,units?,types?}]}).
2. One JSONL file per unit (content/<unit-id>.jsonl), one JSON object per line, with these types: choice {type,id,unit,prompt,options,answer(index from 0),explanation}, multi {options, correct[]}, gap {answers[]}, cloze {parts: strings and arrays-of-alternatives}, numeric {answer, tolerance?, unitLabel?}, match {pairs[{left,right}]}, order {steps in correct order}, card {prompt, back}. Ids look like geo-1, geo-2 and must be unique.
Base every fact on this material only: <paste material>. Write your own questions; do not copy long passages.
```
Create the folder with `./dojo init <course-id>` (course ids: lowercase letters, digits, `-`, `_`, max 48; unit ids in course.json match `^[a-z0-9][a-z0-9_-]{0,47}$`), save the blocks into workspace/<course-id>/ in the repository, then run `./dojo validate workspace/<course-id>`, paste the errors back to the AI, and repeat until it passes. Then `./dojo build workspace/<course-id>`.
