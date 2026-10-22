use dojo_core::validate::{CODES, Diagnostic, SourceFile, validate};

fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

fn run(course: &str, lines: &[&str]) -> Vec<Diagnostic> {
    validate(course, &[file("content/u.jsonl", &lines.join("\n"))], None)
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

#[test]
fn fires_empty_detail_glyph() {
    let c = with_course(r#""detail":{"fields":[{"key":"k"}],"glyph":""}"#);
    fires(&c, &[CHOICE], "empty_detail_glyph");
}

#[test]
fn every_code_has_a_firing_test() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let mut texts = Vec::new();
    for entry in std::fs::read_dir(&dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "rs") {
            texts.push(std::fs::read_to_string(&path).unwrap());
        }
    }
    let missing: Vec<&str> = CODES
        .iter()
        .map(|c| c.0)
        .filter(|code| {
            let quoted = format!("\"{code}\"");
            let escaped = format!("\\\"{code}\\\"");
            !texts.iter().any(|t| t.lines().any(|l| {
                let l = l.trim_start();
                !l.starts_with("//") && (l.contains(&quoted) || l.contains(&escaped)) && !l.contains("CODES")
            }))
        })
        .collect();
    assert!(missing.is_empty(), "codes without a test: {missing:?}");
}

#[test]
fn bad_supersedes_cases() {
    let old = r#"{"type":"choice","id":"o-1","unit":"u","prompt":"Old","options":["a","b"],"answer":0,"status":"retired"}"#;
    let new = |extra: &str| format!(r#"{{"type":"choice","id":"n-1","unit":"u","prompt":"New","options":["a","b"],"answer":0,{extra}}}"#);
    let c = with_course(r#""x":1"#).replace(r#","x":1"#, "");
    let n = |s: &str| run(&c, &[old, &new(s)]).iter().filter(|d| d.code == "bad_supersedes").count();
    assert_eq!(n(r#""supersedes":["o-1"]"#), 0);
    for bad in [r#""supersedes":[]"#, r#""supersedes":["o-1","o-1"]"#, r#""supersedes":["n-1"]"#, r#""supersedes":["zz"]"#] {
        assert!(n(bad) > 0, "{bad}");
    }
    let on_retired = old.replace(r#""status":"retired""#, r#""status":"retired","supersedes":["x"]"#);
    assert!(run(&c, &[&on_retired]).iter().any(|d| d.code == "bad_supersedes"));
}
