//! Unit-level SRS (`srs.scope: "unit"`): unit key `<entity>|<aspect>`, one grade per unit key, and the validator rule.
mod common;
use common::{codes, run};
use dojo_core::groups::{unit_key, AspectRule};
use dojo_core::srs::{apply_entity, entity_view, AnswerRules, EntityMode, DEFAULT_LADDER};
use serde_json::{json, Map, Value};

const NOW: i64 = 1_760_000_000_000;
const DAY: i64 = 86_400_000;

fn rules() -> Vec<AspectRule> {
    vec![
        AspectRule { id: "meaning".into(), title: None, tags: vec!["meaning".into()], units: vec![] },
        AspectRule { id: "reading".into(), title: None, tags: vec!["reading".into()], units: vec![] },
    ]
}

fn tags(list: &[&str]) -> Vec<String> {
    list.iter().map(|t| t.to_string()).collect()
}

fn rec(s: i64, due: i64, ok: i64, last: i64) -> Value {
    json!({"s": s, "due": due, "ok": ok, "bad": 0, "last": last})
}

#[test]
fn unit_key_splits_one_entity_by_aspect() {
    let r = rules();
    let meaning = unit_key("E", &tags(&["meaning"]), "u", &r);
    let reading = unit_key("E", &tags(&["reading"]), "u", &r);
    assert_eq!(meaning, "E|meaning");
    assert_eq!(reading, "E|reading");
    assert_ne!(meaning, reading);
    // No aspect rule matches and no topics: the default aspect.
    assert_eq!(unit_key("E", &[], "u", &[]), "E|default");
}

#[test]
fn answer_writes_same_schedule_on_unit_members_only() {
    let r = rules();
    // Entity E has two aspects: A and B are "meaning", C is "reading".
    let key_a = unit_key("E", &tags(&["meaning"]), "u", &r);
    let members_a = ["A", "B"];
    let mut records = Map::new();
    records.insert("A".into(), rec(1, NOW - DAY, 2, NOW - 2 * DAY));
    records.insert("B".into(), rec(3, NOW - 5 * DAY, 4, NOW - 3 * DAY));
    records.insert("C".into(), rec(2, NOW + DAY, 1, NOW - DAY));
    assert_eq!(key_a, "E|meaning");

    // View of the unit: s = min, due = min.
    let view = entity_view(&members_a, &records).expect("unit has records");
    assert_eq!(view["s"], json!(1));
    assert_eq!(view["due"], json!(NOW - 5 * DAY));

    let before_c = records["C"].clone();
    let out = apply_entity(&members_a, &records, EntityMode::Answer, true, NOW, &DEFAULT_LADDER, AnswerRules { drop: 1, jump_to: None, wrong_floor: None });
    assert!(out.contains_key("A") && out.contains_key("B"));
    assert_eq!(out.len(), 2, "only the unit members are written");
    // Every member of the unit gets the same s, due, ok, bad, last.
    for field in ["s", "due", "ok", "bad", "last"] {
        assert_eq!(out["A"][field], out["B"][field], "field {field} differs inside the unit");
    }
    // Merge back: the other unit (C) keeps its record.
    let mut merged = records.clone();
    for (id, v) in out {
        merged.insert(id, v);
    }
    assert_eq!(merged["C"], before_c);
}

#[test]
fn scope_unit_without_topics_is_an_error() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","srs":{"scope":"unit"}}]}"#;
    let d = run(c, &[]);
    assert!(codes(&d).contains(&"unit_scope_no_topics"), "{:?}", codes(&d));
}

#[test]
fn scope_unit_with_topics_has_no_such_error() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","topics":{"units":[],"aspects":[{"id":"a","tags":["t"]}]},"units":[{"id":"u","title":"U","srs":{"scope":"unit"}}]}"#;
    let d = run(c, &[]);
    assert!(!codes(&d).contains(&"unit_scope_no_topics"), "{:?}", codes(&d));
}

#[test]
fn scope_entity_without_topics_has_no_unit_error() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","srs":{"scope":"entity"}}]}"#;
    let d = run(c, &[]);
    assert!(!codes(&d).contains(&"unit_scope_no_topics"), "{:?}", codes(&d));
}
