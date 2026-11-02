use dojo_core::check::Normalize;
use serde_json::{json, Value};

#[test]
fn defaults_serialize_as_course_json_shape() {
    let v = serde_json::to_value(Normalize::default()).unwrap();
    assert_eq!(v, json!({"caseSensitive": false, "trim": true, "collapseSpaces": true, "stripPunctuation": false}));
}

#[test]
fn defaults_accessors_match_documented_defaults() {
    let n = Normalize::default();
    assert!(!n.case_sensitive());
    assert!(n.trim());
    assert!(n.collapse_spaces());
    assert!(!n.strip_punctuation());
    assert!(n.fold.is_empty());
}

#[test]
fn empty_object_gives_defaults() {
    let n: Normalize = serde_json::from_str("{}").unwrap();
    assert_eq!(n, Normalize::default());
}

#[test]
fn partial_object_keeps_other_defaults() {
    let n: Normalize = serde_json::from_str(r#"{"caseSensitive":true}"#).unwrap();
    assert!(n.case_sensitive());
    assert!(n.trim());
    assert!(n.collapse_spaces());
    assert!(!n.strip_punctuation());
}

#[test]
fn json_round_trip_is_unchanged() {
    let text = r#"{"caseSensitive":true,"trim":false,"collapseSpaces":false,"stripPunctuation":true,"fold":[["a","b"]]}"#;
    let n: Normalize = serde_json::from_str(text).unwrap();
    let back: Value = serde_json::to_value(&n).unwrap();
    assert_eq!(back, serde_json::from_str::<Value>(text).unwrap());
    let again: Normalize = serde_json::from_value(back).unwrap();
    assert_eq!(again, n);
}

#[test]
fn fold_omitted_when_empty() {
    let v = serde_json::to_value(Normalize::default().with_strip_punctuation(true)).unwrap();
    assert!(v.get("fold").is_none());
    assert_eq!(v["stripPunctuation"], json!(true));
}

#[test]
fn unknown_key_is_rejected() {
    assert!(serde_json::from_str::<Normalize>(r#"{"caseSensitve":true}"#).is_err());
}

#[test]
fn non_boolean_flag_is_rejected() {
    assert!(serde_json::from_str::<Normalize>(r#"{"trim":null}"#).is_err());
    assert!(serde_json::from_str::<Normalize>(r#"{"trim":"yes"}"#).is_err());
}

#[test]
fn builder_setters_set_each_flag_independently() {
    let n = Normalize::default().with_case_sensitive(true).with_strip_punctuation(true);
    assert!(n.case_sensitive());
    assert!(n.trim());
    assert!(n.collapse_spaces());
    assert!(n.strip_punctuation());
    let m = n.with_trim(false).with_collapse_spaces(false).with_case_sensitive(false);
    assert!(!m.case_sensitive());
    assert!(!m.trim());
    assert!(!m.collapse_spaces());
    assert!(m.strip_punctuation());
}

#[test]
fn schema_unchanged() {
    let s = serde_json::to_value(schemars::schema_for!(Normalize)).unwrap();
    assert_eq!(s["type"], json!("object"));
    assert_eq!(s["additionalProperties"], json!(false));
    assert_eq!(
        s["description"],
        json!("How typed answers are compared. Defaults: trim and collapse spaces, case-insensitive, keep punctuation.")
    );
    assert_eq!(s["properties"]["caseSensitive"], json!({"type": "boolean", "default": false}));
    assert_eq!(s["properties"]["trim"], json!({"type": "boolean", "default": true}));
    assert_eq!(s["properties"]["collapseSpaces"], json!({"type": "boolean", "default": true}));
    assert_eq!(s["properties"]["stripPunctuation"], json!({"type": "boolean", "default": false}));
    assert!(s["properties"].get("fold").is_some());
    assert!(s.get("required").is_none());
}
