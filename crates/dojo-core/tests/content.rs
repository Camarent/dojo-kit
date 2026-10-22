use dojo_core::content::{ItemType, parse_course, parse_items};
use dojo_core::schema::{brief, course_schema, item_schema, pretty, EXAMPLE_LINES};
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn demo(rel: &str) -> String {
    std::fs::read_to_string(root().join("examples/demo").join(rel)).unwrap()
}

#[test]
fn demo_course_parses() {
    let c = parse_course(&demo("course.json")).unwrap();
    assert_eq!(c.id, "demo");
    assert_eq!(c.units.len(), 4);
    assert!(c.exam.is_some());
}

#[test]
fn demo_items_parse_with_expected_counts() {
    let mut items = Vec::new();
    for f in ["content/geo.jsonl", "content/math.jsonl"] {
        let p = parse_items(&demo(f));
        assert!(p.errors.is_empty(), "{:?}", p.errors);
        items.extend(p.items);
    }
    let count = |t| items.iter().filter(|(_, i)| i.item_type() == t).count();
    assert_eq!(count(ItemType::Choice), 6);
    assert_eq!(count(ItemType::Gap), 4);
    assert_eq!(count(ItemType::Card), 5);
    assert_eq!(items.iter().filter(|(_, i)| i.is_retired()).count(), 1);
    assert_eq!(items.len(), 15);
    let mut ids: Vec<&str> = items.iter().map(|(_, i)| i.id()).collect();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), 15);
}

#[test]
fn items_round_trip() {
    for f in ["content/geo.jsonl", "content/math.jsonl"] {
        for (_, item) in parse_items(&demo(f)).items {
            let text = serde_json::to_string(&item).unwrap();
            let again = parse_items(&text);
            assert!(again.errors.is_empty());
            assert_eq!(again.items[0].1, item);
        }
    }
}

fn one_error(text: &str) -> (usize, String) {
    let p = parse_items(text);
    assert_eq!(p.errors.len(), 1, "{:?}", p.errors);
    (p.errors[0].line, p.errors[0].message.clone())
}

const GOOD: &str = r#"{"type":"card","id":"a-1","unit":"a","prompt":"p","back":"b"}"#;

#[test]
fn unknown_field_reports_line() {
    let text = format!("{GOOD}\n{}", r#"{"type":"card","id":"a-2","unit":"a","prompt":"p","back":"b","extra":1}"#);
    let (line, msg) = one_error(&text);
    assert_eq!(line, 2);
    assert!(msg.contains("extra"), "{msg}");
}

#[test]
fn missing_required_field() {
    let (line, msg) = one_error(r#"{"type":"card","id":"a-1","unit":"a","prompt":"p"}"#);
    assert_eq!(line, 1);
    assert!(msg.contains("back"), "{msg}");
}

#[test]
fn wrong_type_is_error() {
    let (_, msg) = one_error(r#"{"type":"choice","id":"a-1","unit":"a","prompt":"p","options":["x"],"answer":"1"}"#);
    assert!(msg.contains("invalid type"), "{msg}");
}

#[test]
fn unknown_type_is_error() {
    let (_, msg) = one_error(r#"{"type":"essay","id":"a-1","unit":"a","prompt":"p"}"#);
    assert!(msg.contains("essay"), "{msg}");
}

#[test]
fn invalid_json_line() {
    one_error("{not json");
}

#[test]
fn blank_lines_skipped_but_counted() {
    let text = format!("\n{GOOD}\n   \n{{bad\n");
    let p = parse_items(&text);
    assert_eq!(p.items[0].0, 2);
    assert_eq!(p.errors.len(), 1);
    assert_eq!(p.errors[0].line, 4);
}

#[test]
fn three_bad_lines_three_errors() {
    let p = parse_items(&format!("{{\n{GOOD}\n[]\n42\n"));
    assert_eq!(p.errors.len(), 3);
    assert_eq!(p.items.len(), 1);
}

#[test]
fn course_unknown_field_rejected() {
    let e = parse_course(r#"{"id":"d","title":"t","uiLanguage":"en","units":[],"bogus":1}"#).unwrap_err();
    assert_eq!(e[0].line, 0);
    assert!(e[0].message.contains("bogus"));
}

#[test]
fn unit_exam_only_parses() {
    let c = parse_course(
        r#"{"id":"d","title":"t","uiLanguage":"en","units":[{"id":"u1","title":"U1","examOnly":true},{"id":"u2","title":"U2"}]}"#,
    )
    .unwrap();
    assert_eq!(c.units[0].exam_only, Some(true));
    assert_eq!(c.units[1].exam_only, None);
}

#[test]
fn unit_unknown_field_still_rejected() {
    let e = parse_course(r#"{"id":"d","title":"t","uiLanguage":"en","units":[{"id":"u1","title":"U1","bogus":1}]}"#).unwrap_err();
    assert!(e[0].message.contains("bogus"));
}

#[test]
fn course_ui_language_required() {
    let e = parse_course(r#"{"id":"d","title":"t","units":[]}"#).unwrap_err();
    assert!(e[0].message.contains("uiLanguage"));
}

#[test]
fn course_schema_mentions_every_field() {
    let s = course_schema().to_string();
    for f in ["id", "title", "uiLanguage", "contentLanguage", "units", "types", "srs", "srsByType", "exam", "storage"] {
        assert!(s.contains(&format!("\"{f}\"")), "{f}");
    }
}

#[test]
fn item_schema_contains_item_types() {
    let s = item_schema().to_string();
    for t in ["choice", "gap", "card", "multi", "match", "order", "cloze", "numeric"] {
        assert!(s.contains(&format!("\"{t}\"")), "{t}");
    }
}

#[test]
fn committed_schema_files_match_generated() {
    let dir = root().join("schema");
    assert_eq!(std::fs::read_to_string(dir.join("course.schema.json")).unwrap(), pretty(&course_schema()));
    assert_eq!(std::fs::read_to_string(dir.join("item.schema.json")).unwrap(), pretty(&item_schema()));
}

#[test]
fn brief_examples_parse() {
    let b = brief();
    for (t, line) in ["choice", "gap", "card", "multi", "match", "order", "cloze", "numeric"].into_iter().zip(EXAMPLE_LINES) {
        assert!(b.contains(&format!("TYPE {t}")));
        assert!(b.contains(line));
        let p = parse_items(line);
        assert!(p.errors.is_empty(), "{:?}", p.errors);
        assert_eq!(p.items.len(), 1);
    }
}

#[test]
fn cloze_bad_part_is_one_error_on_its_line() {
    let good = r#"{"type":"gap","id":"a-1","unit":"a","prompt":"p","answers":["x"]}"#;
    let bad = r#"{"type":"cloze","id":"a-2","unit":"a","prompt":"p","parts":[3]}"#;
    let p = parse_items(&format!("{good}\n\n{bad}\n"));
    assert_eq!(p.items.len(), 1);
    assert_eq!(p.errors.len(), 1);
    assert_eq!(p.errors[0].line, 3);
}

#[test]
fn new_types_parse_and_round_trip() {
    let lines = [
        r#"{"type":"multi","id":"a-1","unit":"a","prompt":"p","options":["x","y","z"],"correct":[0,1]}"#,
        r#"{"type":"match","id":"a-2","unit":"a","prompt":"p","pairs":[{"left":"l","right":"r"},{"left":"m","right":"s"}]}"#,
        r#"{"type":"order","id":"a-3","unit":"a","prompt":"p","steps":["x","y"]}"#,
        r#"{"type":"cloze","id":"a-4","unit":"a","prompt":"p","parts":["The ",["Paris"],"."]}"#,
        r#"{"type":"numeric","id":"a-5","unit":"a","prompt":"p","answer":1.5}"#,
    ];
    let p = parse_items(&lines.join("\n"));
    assert!(p.errors.is_empty(), "{:?}", p.errors);
    for ((_, item), line) in p.items.iter().zip(lines) {
        assert_eq!(serde_json::to_string(item).unwrap(), line);
        assert!(!item.item_type().is_self_rated());
    }
    assert!(ItemType::Card.is_self_rated());
}

const PRETTY_CHOICE: &str = "{\n  \"type\": \"choice\",\n  \"id\": \"a-1\",\n  \"unit\": \"a\",\n  \"prompt\": \"p\",\n  \"options\": [\n    \"x\",\n    \"y\"\n  ],\n  \"answer\": 0\n}";

#[test]
fn pretty_objects_report_start_lines() {
    let p = parse_items(&format!("{PRETTY_CHOICE}\n\n{PRETTY_CHOICE}\n"));
    assert!(p.errors.is_empty(), "{:?}", p.errors);
    assert_eq!(p.items.iter().map(|(l, _)| *l).collect::<Vec<_>>(), [1, 13]);
}

#[test]
fn mixed_one_line_and_multi_line() {
    let p = parse_items(&format!("{GOOD}\n{PRETTY_CHOICE}\n{GOOD}\n"));
    assert!(p.errors.is_empty(), "{:?}", p.errors);
    assert_eq!(p.items.iter().map(|(l, _)| *l).collect::<Vec<_>>(), [1, 2, 13]);
}

#[test]
fn braces_and_escaped_quotes_inside_strings() {
    let line = r#"{"type":"gap","id":"a-1","unit":"a","prompt":"Use {curly} and \"quotes\" and a } here","answers":["x"]}"#;
    let p = parse_items(&format!("{line}\n{line}"));
    assert!(p.errors.is_empty(), "{:?}", p.errors);
    assert_eq!(p.items.len(), 2);
}

#[test]
fn unterminated_object_at_end_is_one_error() {
    let p = parse_items(&format!("{GOOD}\n{{\n  \"type\": \"gap\",\n  \"id\": \"a-2\","));
    assert_eq!(p.items.len(), 1);
    assert_eq!(p.errors.len(), 1);
    assert_eq!(p.errors[0].line, 2);
}

#[test]
fn stray_fragment_between_objects_is_one_error() {
    let p = parse_items(&format!("{PRETTY_CHOICE}\n\"answer\": 0,\n{PRETTY_CHOICE}\n"));
    assert_eq!(p.items.iter().map(|(l, _)| *l).collect::<Vec<_>>(), [1, 13]);
    assert_eq!(p.errors.len(), 1);
    assert_eq!(p.errors[0].line, 12);
}

#[test]
fn three_bad_objects_three_errors() {
    let bad = "{\n  \"type\": \"nope\"\n}";
    let p = parse_items(&format!("{bad}\n{GOOD}\n{bad}\n{bad}\n"));
    assert_eq!(p.items.len(), 1);
    assert_eq!(p.errors.iter().map(|e| e.line).collect::<Vec<_>>(), [1, 5, 8]);
}

#[test]
fn crlf_line_endings() {
    let text = format!("{GOOD}\n{PRETTY_CHOICE}\n{GOOD}\n").replace('\n', "\r\n");
    let p = parse_items(&text);
    assert!(p.errors.is_empty(), "{:?}", p.errors);
    assert_eq!(p.items.iter().map(|(l, _)| *l).collect::<Vec<_>>(), [1, 2, 13]);
}

#[test]
fn non_ascii_text_inside_strings() {
    let obj = "{\n  \"type\": \"gap\",\n  \"id\": \"a-1\",\n  \"unit\": \"a\",\n  \"prompt\": \"Столица {Франции} 🗼 — ___\",\n  \"answers\": [\"Париж\"]\n}";
    let p = parse_items(&format!("{obj}\nпроизвольный текст 🗼\n{obj}\n"));
    assert_eq!(p.items.len(), 2);
    assert_eq!(p.items[1].0, 9);
    assert_eq!(p.errors.len(), 1);
    assert_eq!(p.errors[0].line, 8);
}

#[test]
fn pretty_printed_sample_parses() {
    let text = r#"{
  "type": "choice",
  "id": "history-1",
  "unit": "history",
  "tags": ["history", "pharos"],
  "prompt": "Which ancient lighthouse was one of the Seven Wonders of the Ancient World?",
  "options": [
    "Pharos of Alexandria",
    "Eddystone Lighthouse",
    "Cordouan Lighthouse",
    "Tower of Hercules"
  ],
  "answer": 0,
  "explanation": "The Pharos of Alexandria, built in the 3rd century BC on the island of Pharos, is the best-known lighthouse of antiquity.",
  "source": "materials/lighthouses.md section 1"
}
{
  "type": "gap",
  "id": "history-2",
  "unit": "history",
  "tags": ["history", "etymology"],
  "prompt": "The word \"pharos\" later became the root of the word for lighthouse in several languages, for example \"phare\" in ___.",
  "answers": ["French"],
  "normalize": {"caseSensitive": false},
  "explanation": "The word \"pharos\" became the root for lighthouse in several languages.",
  "source": "materials/lighthouses.md section 1"
}
{
  "type": "choice",
  "id": "history-3",
  "unit": "history",
  "tags": ["history", "eddystone"],
  "prompt": "How many towers have stood on the Eddystone reef?",
  "options": [
    "2",
    "3",
    "4",
    "5"
  ],
  "answer": 2,
  "explanation": "Four towers have stood on the rocks at the Eddystone reef.",
  "source": "materials/lighthouses.md section 1"
}
"#;
    let p = parse_items(text);
    assert!(p.errors.is_empty(), "{:?}", p.errors);
    assert_eq!(p.items.iter().map(|(l, _)| *l).collect::<Vec<_>>(), [1, 17, 28]);
}

#[test]
fn exams_config_parses_with_optional_fields() {
    let c = dojo_core::content::parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],
        "exam":{"passMark":0.5,"sections":[{"title":"a","count":1}]},
        "exams":[{"id":"n1","title":"N1","passMark":0.5,"sections":[{"title":"a","count":1}],
          "timing":[{"sections":["a"],"minutes":7}],"scoring":[{"title":"P","sections":["a"],"points":60,"minPoints":19}],"passPoints":80,"note":"n"}]}"#).unwrap();
    assert_eq!(c.exam.as_ref().unwrap().id, "");
    let e = &c.exams[0];
    assert_eq!((e.id.as_str(), e.title.as_deref(), e.pass_points, e.note.as_deref()), ("n1", Some("N1"), Some(80), Some("n")));
    assert_eq!(e.timing.as_ref().unwrap()[0].minutes, 7);
    assert_eq!(e.scoring[0].min_points, Some(19));
}

#[test]
fn course_without_exams_serializes_unchanged() {
    let text = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"exam":{"minutes":5,"passMark":0.5,"sections":[{"title":"a","count":1}]}}"#;
    let c = dojo_core::content::parse_course(text).unwrap();
    let before: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(serde_json::to_value(&c).unwrap(), before);
}

#[test]
fn new_order_parses_at_course_level() {
    use dojo_core::content::NewOrder;
    let c = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"newOrder":"random"}"#).unwrap();
    assert_eq!(c.new_order, Some(NewOrder::Random));
    let c2 = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"newOrder":"file"}"#).unwrap();
    assert_eq!(c2.new_order, Some(NewOrder::File));
    let c3 = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#).unwrap();
    assert_eq!(c3.new_order, None);
}

#[test]
fn new_order_parses_at_unit_level() {
    use dojo_core::content::NewOrder;
    let c = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","newOrder":"random"}]}"#).unwrap();
    assert_eq!(c.units[0].new_order, Some(NewOrder::Random));
    let c2 = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","newOrder":"file"}]}"#).unwrap();
    assert_eq!(c2.units[0].new_order, Some(NewOrder::File));
    let c3 = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#).unwrap();
    assert_eq!(c3.units[0].new_order, None);
}

#[test]
fn new_order_bad_value_is_parse_error() {
    let e = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"newOrder":"shuffle"}"#).unwrap_err();
    assert_eq!(e.len(), 1);
    assert!(e[0].message.contains("shuffle"));
}

#[test]
fn new_order_bad_unit_value_is_parse_error() {
    let e = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","newOrder":"shuffle"}]}"#).unwrap_err();
    assert_eq!(e.len(), 1);
    assert!(e[0].message.contains("shuffle"));
}

#[test]
fn course_with_pass_round_trips() {
    let text = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],
        "exam":{"passMark":0.7,"pass":{"mode":"percent","basis":"author"},"sections":[{"title":"a","count":1}]}}"#;
    let c = parse_course(text).unwrap();
    let value = serde_json::to_value(&c).unwrap();
    let before: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(value, before);
}

#[test]
fn exam_with_unknown_pass_field_fails() {
    let e = parse_course(r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],
        "exam":{"passMark":0.7,"pass":{"mode":"percent","unknownField":"bad"},"sections":[{"title":"a","count":1}]}}"#).unwrap_err();
    assert_eq!(e.len(), 1);
    assert!(e[0].message.contains("unknown field"));
}
