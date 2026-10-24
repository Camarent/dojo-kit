use crate::check::Normalize;
use crate::content::{Course, Item};
use crate::srs::DEFAULT_LADDER;
use crate::validate::CODES;
use serde_json::Value;

fn to_value<T: serde::Serialize>(schema: &T) -> Value {
    serde_json::to_value(schema).unwrap_or(Value::Null)
}

/// JSON Schema (draft 2020-12) for `course.json`.
pub fn course_schema() -> Value {
    to_value(&schemars::schema_for!(Course))
}

/// JSON Schema (draft 2020-12) for one content JSONL line.
pub fn item_schema() -> Value {
    to_value(&schemars::schema_for!(Item))
}

/// Pretty-printed JSON with a trailing newline.
pub fn pretty(value: &Value) -> String {
    let mut s = serde_json::to_string_pretty(value).unwrap_or_default();
    s.push('\n');
    s
}

/// Example JSONL lines, one per item type, each parseable by `parse_items`.
pub const EXAMPLE_LINES: [&str; 8] = [
    r#"{"type":"choice","id":"geo-1","unit":"geo","tags":["capitals"],"prompt":"Capital of France?","options":["Paris","Rome","Madrid"],"answer":0,"explanation":"Paris is on the Seine."}"#,
    r#"{"type":"gap","id":"geo-2","unit":"geo","prompt":"The capital of Italy is ___.","answers":["Rome","Roma"],"normalize":{"caseSensitive":false}}"#,
    r#"{"type":"card","id":"geo-3","unit":"geo","prompt":"Capital of Spain","back":"Madrid"}"#,
    r#"{"type":"multi","id":"a-1","unit":"a","prompt":"Select all capitals","options":["Paris","Rome","Madrid"],"correct":[0,1]}"#,
    r#"{"type":"match","id":"a-2","unit":"a","prompt":"Match countries to capitals","pairs":[{"left":"France","right":"Paris"},{"left":"Italy","right":"Rome"}]}"#,
    r#"{"type":"order","id":"a-3","unit":"a","prompt":"Order the steps","steps":["First","Second","Third"]}"#,
    r#"{"type":"cloze","id":"a-4","unit":"a","prompt":"Fill in the blanks","parts":["The capital of France is ",["Paris"],", of Italy ",["Rome","Roma"],"."]}"#,
    r#"{"type":"numeric","id":"a-5","unit":"a","prompt":"What is 2+2?","answer":4.0,"tolerance":0.1,"unitLabel":"units"}"#,
];

/// Compact plain-text cheat-sheet of the content format for AI authors.
pub fn brief() -> String {
    let ladder: Vec<String> = DEFAULT_LADDER.iter().map(i64::to_string).collect();
    let n = Normalize::default();
    let common = "id string REQUIRED; unit string REQUIRED (unit id); tags [string] optional; prompt string REQUIRED; explanation string optional; source string optional; status \"active\"|\"retired\" optional; stimulus string optional (id from stimuli.jsonl); entity string optional (learning record id); topic string optional (catalog/topic label shown instead of the question; never the prompt)";
    let mut s = String::new();
    s.push_str("dojo content format (one JSON object per line in content/<unit>.jsonl is preferred, objects may also span several lines; unknown fields are rejected)\n\n");
    s.push_str("COMMON FIELDS (every item)\n  type \"choice\"|\"gap\"|\"card\"|\"multi\"|\"match\"|\"order\"|\"cloze\"|\"numeric\" REQUIRED\n");
    for f in common.split("; ") {
        s.push_str("  ");
        s.push_str(f);
        s.push('\n');
    }
    s.push_str("\nTYPE choice\n  options [string] REQUIRED\n  answer integer REQUIRED (0-based index into options)\n  example: ");
    s.push_str(EXAMPLE_LINES[0]);
    s.push_str("\n\nTYPE gap\n  answers [string] REQUIRED (any accepted)\n  retry [string] optional (also-accepted-but-not-correct readings, same normalization as answers)\n  normalize object optional: caseSensitive bool, trim bool, collapseSpaces bool, stripPunctuation bool, fold [[from,to]] optional\n  example: ");
    s.push_str(EXAMPLE_LINES[1]);
    s.push_str("\n\nTYPE card\n  back string REQUIRED (the front is prompt)\n  example: ");
    s.push_str(EXAMPLE_LINES[2]);
    s.push_str("\n\nTYPE multi\n  options [string] REQUIRED\n  correct [integer] REQUIRED (indices into options)\n  example: ");
    s.push_str(EXAMPLE_LINES[3]);
    s.push_str("\n\nTYPE match\n  pairs [{left,right}] REQUIRED\n  distractors [string] optional\n  example: ");
    s.push_str(EXAMPLE_LINES[4]);
    s.push_str("\n\nTYPE order\n  steps [string] REQUIRED (in correct order)\n  example: ");
    s.push_str(EXAMPLE_LINES[5]);
    s.push_str("\n\nTYPE cloze\n  parts [string|[string]] REQUIRED (text or blank with alternatives)\n  normalize object optional: caseSensitive bool, trim bool, collapseSpaces bool, stripPunctuation bool, fold [[from,to]] optional\n  example: ");
    s.push_str(EXAMPLE_LINES[6]);
    s.push_str("\n\nTYPE numeric\n  answer number REQUIRED\n  tolerance number optional (absolute)\n  unitLabel string optional (display unit)\n  example: ");
    s.push_str(EXAMPLE_LINES[7]);
    s.push_str("\n\nCOURSE (course.json)\n");
    s.push_str("  id string REQUIRED; title string REQUIRED; uiLanguage string REQUIRED (e.g. \"en\"); contentLanguage string optional\n");
    s.push_str("  units [{id,title,newPerDay?: integer >=0, srs?: {ladder:[integer ms]}, placement?: bool (default true, false = exclude from placement)}] REQUIRED (at least 1; per-unit: newPerDay caps new items/day, srs.ladder is that unit's interval ladder)\n");
    s.push_str("  types [\"choice\"|\"gap\"|\"card\"|\"multi\"|\"match\"|\"order\"|\"cloze\"|\"numeric\"] optional (default: all)\n");
    s.push_str("  srs {ladder:[integer ms]} optional; srsByType {<type>:{ladder}} optional\n");
    s.push_str("  exam {minutes?: integer, passMark?: number, pass?: {mode?: \"percent\"|\"points\", basis?: \"official\"|\"author\", source?: string, scaled?: boolean}, sections: [{title,count,units?,tags?,types?}] REQUIRED} optional\n");
    s.push_str("  exams [{id REQUIRED (unique, like course ids; frozen once published), title?, minutes?, passMark?, pass?, sections, timing?, scoring?, passPoints?, note?}] optional (several exams; the legacy `exam` is id \"default\")\n");
    s.push_str("    timing [{sections:[section title], minutes: integer >0}] optional (timer groups; a section is in at most one group)\n");
    s.push_str("    scoring [{title, sections:[section title], points: integer >0, minPoints?: integer <= points}] optional (a section is in at most one part; section titles must be unique)\n");
    s.push_str("    passPoints integer >=0 optional (sum of part points needed to pass); note string optional\n");
    s.push_str("  storage string optional (adapter id)\n");
    s.push_str("  allowOverride bool optional (defaults to true; when false, disables typo-override in practice)\n");
    s.push_str("  introNew bool optional (defaults to false; when true, shows intro for new items)\n");
    s.push_str("  dontKnow bool optional (defaults to false; when true, enables 'I don't know' button)\n");
    s.push_str("  speech {lang?: string, rate?: number 0.1..10, voices?: {<label>: {pitch?: number 0..2, rate?: number 0.1..10, match?: non-empty string}}} optional (speech synthesis)\n");
    s.push_str("  item speak string optional (text read aloud for that item)\n");
    s.push_str("  entity string optional (id of the learning record the item belongs to; default = item id)\n");
    s.push_str("  groups [{id, title, units:[unitId], newPerDay?: integer >=0, newOrder?: 'file'|'random', extraNew?: bool, extraTags?: [tag]}] optional (group units for daily caps)\n");
    s.push_str("  tagLabels {<tag>: label | {label?: string, kind?: 'public'|'internal'}} optional (display labels for tags, e.g. in the group 'only <tag>' toggle; default is the tag uppercased; kind 'internal' hides the tag from the catalog chips)\n");
    s.push_str("  bars [{title, units?:[unitId], tags?:[tag], learnedStage?: integer >=1}] optional (progress bars: learned/total ENTITIES matching filters)\n");
    s.push_str("\nSTIMULI (stimuli.jsonl in the course root, optional; one JSON object per line)\n");
    s.push_str("  id string REQUIRED; title string optional; text string REQUIRED (shared passage or dialogue); hideText bool optional (hide the text, e.g. listening); speak {lines:[{voice?: string, text: string}]} optional (lines read aloud, in order)\n");
    s.push_str("  items point to a stimulus with \"stimulus\":\"<id>\"; an exam draws the items of one stimulus together, in file order\n");
    s.push_str("  line: {\"id\":\"s1\",\"title\":\"Letter\",\"text\":\"Dear Ann, ...\"}\n");
    s.push_str("\nINTROS (intros.jsonl in the course root, optional; one JSON object per line; one card per entity)\n");
    s.push_str("  id string REQUIRED (entity id: item.entity, default the item id); title string optional; text string optional (card body, course markup); meta any JSON optional (for plugins); speak string optional\n");
    s.push_str("  with course.introNew the card is shown once, before the first question of a new entity; items without an intro keep showing their explanation\n");
    s.push_str("\nDEFAULTS\n  srs.ladder (ms by stage): [");
    s.push_str(&ladder.join(", "));
    s.push_str(&format!(
        "]\n  normalize: caseSensitive={}, trim={}, collapseSpaces={}, stripPunctuation={}\n  exam.passMark: fraction of correct answers needed to pass, 0..1 (default 0.6)\n  exam.pass: pass rule with mode (percent|points), basis (official|author), source, scaled\n",
        n.case_sensitive, n.trim, n.collapse_spaces, n.strip_punctuation
    ));
    s.push_str("\nAUTHORING TIPS\n");
    s.push_str("  ids are permanent; retire an item (status \"retired\") instead of deleting it.\n");
    s.push_str("  Changing an item's type or its correct answer needs a new id.\n");
    s.push_str("  Keep shards of about 30 items; run `dojo validate` after each change.\n");
    s.push_str("\nVALIDATOR CODES (dojo validate <course-dir>)\n");
    for (code, severity, what) in CODES {
        s.push_str(&format!("  {code} [{}] {what}\n", severity.as_str()));
    }
    s
}
