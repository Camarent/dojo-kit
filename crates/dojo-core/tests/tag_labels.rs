use dojo_core::content::{TagLabel, parse_course};
use dojo_core::validate::validate;

fn course(labels: &str) -> String {
    format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],"tagLabels":{labels}}}"#)
}

#[test]
fn string_and_object_forms_parse() {
    let c = parse_course(&course(r#"{"n5":"N5","x":{"label":"X","kind":"internal"},"y":{"kind":"public"}}"#)).unwrap();
    let l = c.tag_labels.unwrap();
    assert_eq!(l["n5"], TagLabel::Text("N5".to_string()));
    assert!(matches!(&l["x"], TagLabel::Detail(d) if d.label.as_deref() == Some("X") && d.kind.as_deref() == Some("internal")));
    assert!(matches!(&l["y"], TagLabel::Detail(d) if d.label.is_none()));
}

#[test]
fn round_trips_both_forms() {
    let c = parse_course(&course(r#"{"a":"A","b":{"label":"B","kind":"internal"}}"#)).unwrap();
    let v = serde_json::to_value(&c).unwrap();
    assert_eq!(v["tagLabels"]["a"], "A");
    assert_eq!(v["tagLabels"]["b"]["kind"], "internal");
}

#[test]
fn unknown_kind_warns_and_valid_kinds_do_not() {
    let d = validate(&course(r#"{"a":{"kind":"secret"}}"#), &[], None);
    assert!(d.iter().any(|d| d.code == "unknown_tag_kind"), "{d:?}");
    let d = validate(&course(r#"{"a":{"kind":"internal"},"b":"B","c":{"label":"C","kind":"public"}}"#), &[], None);
    assert!(!d.iter().any(|d| d.code == "unknown_tag_kind"), "{d:?}");
}
