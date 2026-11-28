//! Checks sample `topic-stats.json` documents against the committed schema.

#[path = "schema_check/mod.rs"]
mod schema_check;

use serde_json::{json, Value};

fn committed_schema() -> Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../schema/topic-stats.schema.json");
    let text = std::fs::read_to_string(&path).unwrap();
    serde_json::from_str(&text).unwrap()
}

fn valid_doc() -> Value {
    json!({
        "v": 1,
        "course": "demo",
        "generated_at": "2026-11-28T10:00:00Z",
        "changed_since": null,
        "groups": [
            {
                "kind": "topic",
                "id": "fractions",
                "label": "Fractions",
                "unit": "u1",
                "items": {"total": 4, "unseen": 1, "learning": 2, "mature": 1},
                "last_answered": null,
                "last_changed": "2026-11-27T09:00:00Z"
            },
            {
                "kind": "unit",
                "id": "u1-2",
                "label": "Units 1 and 2",
                "unit": ["u1", "u2"],
                "items": {"total": 0, "unseen": 0, "learning": 0, "mature": 0},
                "last_answered": "2026-11-26T08:00:00Z",
                "last_changed": null
            }
        ]
    })
}

fn check(doc: &Value) -> Result<(), String> {
    schema_check::validate(&committed_schema(), doc)
}

#[test]
fn valid_doc_passes_both_unit_forms_and_null_last_answered() {
    let doc = valid_doc();
    assert_eq!(check(&doc), Ok(()));
}

#[test]
fn missing_required_key_fails() {
    let mut doc = valid_doc();
    doc.as_object_mut().unwrap().remove("generated_at");
    let err = check(&doc).unwrap_err();
    assert!(err.contains("generated_at"), "{err}");
}

#[test]
fn extra_key_fails() {
    let mut doc = valid_doc();
    doc["groups"][0]["extra"] = json!(1);
    let err = check(&doc).unwrap_err();
    assert!(err.contains("$.groups[0]"), "{err}");
}

#[test]
fn v_as_string_fails() {
    let mut doc = valid_doc();
    doc["v"] = json!("1");
    let err = check(&doc).unwrap_err();
    assert!(err.contains("$.v"), "{err}");
}

#[test]
fn negative_count_fails() {
    let mut doc = valid_doc();
    doc["groups"][0]["items"]["total"] = json!(-1);
    let err = check(&doc).unwrap_err();
    assert!(err.contains("$.groups[0].items.total"), "{err}");
}

#[test]
fn bad_kind_fails() {
    let mut doc = valid_doc();
    doc["groups"][1]["kind"] = json!("chapter");
    let err = check(&doc).unwrap_err();
    assert!(err.contains("$.groups[1].kind"), "{err}");
}

#[test]
fn unknown_schema_keyword_is_an_error() {
    let schema = json!({"type": "object", "not": {}});
    assert!(schema_check::validate(&schema, &json!({})).is_err());
}

#[test]
fn unknown_keyword_in_absent_optional_property_is_an_error() {
    let schema = json!({"type": "object", "properties": {"x": {"pattern": "a"}}});
    assert!(schema_check::validate(&schema, &json!({})).is_err());
}
