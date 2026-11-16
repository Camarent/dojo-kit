mod common;
use common::*;
use dojo_core::validate::Severity;

const ANSWERS: &str = r#""markup":"ruby","ruby":{"checkAnswers":true,"skip":"日"}"#;

fn choice(id: &str, unit: &str, prompt: &str, options: &str, extra: &str) -> String {
    format!(r#"{{"type":"choice","id":"{id}","unit":"{unit}","prompt":"{prompt}","options":{options},"answer":0{extra}}}"#)
}

/// True when some `ruby_missing` diagnostic has ERROR severity.
fn ruby_missing_error(course: &str, lines: &[&str]) -> bool {
    run(course, lines).iter().any(|d| d.code == "ruby_missing" && matches!(d.severity, Severity::Error))
}

#[test]
fn bare_kanji_in_gap_answer_is_error() {
    let gap = r#"{"type":"gap","id":"g-1","unit":"u","prompt":"p","answers":["学"]}"#;
    assert!(ruby_missing_error(&with_course(ANSWERS), &[gap]));
}

#[test]
fn bare_kanji_in_cloze_blank_is_error() {
    let cloze = r#"{"type":"cloze","id":"c-1","unit":"u","prompt":"p","parts":["a",["学"]]}"#;
    assert!(ruby_missing_error(&with_course(ANSWERS), &[cloze]));
}

#[test]
fn bare_kanji_in_option_is_error() {
    let opt = choice("u-1", "u", "Pick", r#"["学校","b"]"#, "");
    assert!(ruby_missing_error(&with_course(ANSWERS), &[&opt]));
}

#[test]
fn bare_kanji_in_retry_is_error() {
    let gap = r#"{"type":"gap","id":"g-2","unit":"u","prompt":"p","answers":["a"],"retry":["学"]}"#;
    assert!(ruby_missing_error(&with_course(ANSWERS), &[gap]));
}

#[test]
fn ruby_form_in_answers_gives_none() {
    let gap = r#"{"type":"gap","id":"g-3","unit":"u","prompt":"p","answers":["{学|がく}"],"retry":["{学|がく}"]}"#;
    let cloze = r#"{"type":"cloze","id":"c-2","unit":"u","prompt":"p","parts":["a",["{学|がく}"]]}"#;
    assert!(!ruby_missing_error(&with_course(ANSWERS), &[gap, cloze]));
}

#[test]
fn skip_kanji_in_answers_gives_none() {
    // decoy: bare kanji in the skip set is fine in an answer
    let gap = r#"{"type":"gap","id":"g-4","unit":"u","prompt":"p","answers":["日"]}"#;
    assert!(!ruby_missing_error(&with_course(ANSWERS), &[gap]));
}

#[test]
fn check_answers_absent_gives_none() {
    let course = with_course(r#""markup":"ruby","ruby":{"skip":"日"}"#);
    let gap = r#"{"type":"gap","id":"g-5","unit":"u","prompt":"p","answers":["学"]}"#;
    let opt = choice("u-1", "u", "Pick", r#"["学校","b"]"#, "");
    assert!(!codes(&run(&course, &[gap, &opt])).contains(&"ruby_missing"));
}

#[test]
fn check_answers_false_gives_none() {
    let course = with_course(r#""markup":"ruby","ruby":{"checkAnswers":false,"skip":"日"}"#);
    let gap = r#"{"type":"gap","id":"g-6","unit":"u","prompt":"p","answers":["学"]}"#;
    assert!(!codes(&run(&course, &[gap])).contains(&"ruby_missing"));
}
