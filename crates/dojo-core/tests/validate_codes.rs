use dojo_core::validate::{Diagnostic, SourceFile, validate};

const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

fn run(course: &str, lines: &[&str]) -> Vec<Diagnostic> {
    validate(course, &[file("content/u.jsonl", &lines.join("\n"))], None)
}

fn codes(d: &[Diagnostic]) -> Vec<&'static str> {
    d.iter().map(|d| d.code).collect()
}

fn fires(course: &str, lines: &[&str], code: &str) {
    let d = run(course, lines);
    assert!(d.iter().any(|d| d.code == code), "{code} not in {d:?}");
}

const CHOICE: &str = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a","b"],"answer":0}"#;

fn with_course(extra: &str) -> String {
    format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],{extra}}}"#)
}

#[test]
fn fires_bar_matches_zero() {
    // bar matches 0 items when bar has units that don't match any items
    let c = with_course(r#""bars":[{"title":"B","units":["nonexistent"]}]"#);
    fires(&c, &[CHOICE], "bar_matches_zero");
    
    // clean: bar with units that match items
    let c = with_course(r#""bars":[{"title":"B","units":["u"]}]"#);
    let d = run(&c, &[CHOICE]);
    assert!(!d.iter().any(|d| d.code == "bar_matches_zero"));
    
    // group extraTags matches 0 items
    let c = with_course(r#""groups":[{"id":"g","title":"G","units":["u"],"extraTags":["missing-tag"]}]"#);
    fires(&c, &[CHOICE], "bar_matches_zero");
    
    // clean: group extraTags match items
    let c = with_course(r#""groups":[{"id":"g","title":"G","units":["u"],"extraTags":["present"]}]"#);
    let choice_with_tag = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a","b"],"answer":0,"tags":["present"]}"#;
    let d = run(&c, &[choice_with_tag]);
    assert!(!d.iter().any(|d| d.code == "bar_matches_zero"));
}

#[test]
fn fires_empty_detail_key() {
    // detail field with empty key at course level
    let c = with_course(r#""detail":{"fields":[{"key":""}]}"#);
    fires(&c, &[CHOICE], "empty_detail_key");
    
    // detail field with empty key at unit level
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","detail":{"fields":[{"key":""}]}}]}"#;
    fires(&c, &[CHOICE], "empty_detail_key");
    
    // clean: detail field with non-empty key
    let c = with_course(r#""detail":{"fields":[{"key":"test"}]}"#);
    let d = run(&c, &[CHOICE]);
    assert!(!d.iter().any(|d| d.code == "empty_detail_key"));
}

#[test]
fn fires_entity_spans_groups() {
    // Create two units in different groups with same entity
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u1","title":"U1"},{"id":"u2","title":"U2"}],"groups":[{"id":"g1","title":"G1","units":["u1"]},{"id":"g2","title":"G2","units":["u2"]}]}"#;
    let item1 = r#"{"type":"choice","id":"e-1","unit":"u1","prompt":"Pick 1","options":["a","b"],"answer":0,"entity":"shared"}"#;
    let item2 = r#"{"type":"choice","id":"e-2","unit":"u2","prompt":"Pick 2","options":["a","b"],"answer":0,"entity":"shared"}"#;
    fires(&c, &[item1, item2], "entity_spans_groups");
    
    // clean: entity in same group
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u1","title":"U1"},{"id":"u2","title":"U2"}],"groups":[{"id":"g1","title":"G1","units":["u1","u2"]}]}"#;
    let d = run(&c, &[item1, item2]);
    assert!(!d.iter().any(|d| d.code == "entity_spans_groups"));
}

#[test]
fn fires_two_extra_new_groups() {
    // Two groups with extraNew: true
    let c = with_course(r#""groups":[{"id":"g1","title":"G1","units":["u"],"extraNew":true},{"id":"g2","title":"G2","units":["u"],"extraNew":true}]"#);
    fires(&c, &[CHOICE], "two_extra_new_groups");
    
    // clean: only one group with extraNew: true
    let c = with_course(r#""groups":[{"id":"g1","title":"G1","units":["u"],"extraNew":true}]"#);
    let d = run(&c, &[CHOICE]);
    assert!(!d.iter().any(|d| d.code == "two_extra_new_groups"));
}

#[test]
fn fires_unit_in_two_groups() {
    // Unit in two groups
    let c = with_course(r#""groups":[{"id":"g1","title":"G1","units":["u"]},{"id":"g2","title":"G2","units":["u"]}]"#);
    fires(&c, &[CHOICE], "unit_in_two_groups");
    
    // clean: unit in only one group
    let c = with_course(r#""groups":[{"id":"g1","title":"G1","units":["u"]}]"#);
    let d = run(&c, &[CHOICE]);
    assert!(!d.iter().any(|d| d.code == "unit_in_two_groups"));
}
