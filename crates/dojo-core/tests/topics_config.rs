use dojo_core::validate::Diagnostic;
mod common;
use common::*;

const VALID_TOPICS: &str = r#"{"units":["u"],"aspects":[{"id":"meaning","tags":["meaning"]},{"id":"reading","units":["u"]}],"sessionCap":10}"#;

fn course_with(topics: &str) -> String {
    with_course(&format!(r#""topics":{topics}"#))
}

fn topic_codes(d: &[Diagnostic]) -> Vec<&'static str> {
    d.iter().map(|d| d.code).filter(|c| c.starts_with("topics_")).collect()
}

fn assert_only_topic_code(course: &str, code: &str) {
    let d = run(course, &[CHOICE]);
    assert_eq!(topic_codes(&d), vec![code], "{d:?}");
}

#[test]
fn valid_topics_config_has_no_diagnostics() {
    let d = run(&course_with(VALID_TOPICS), &[CHOICE]);
    assert_eq!(codes(&d), Vec::<&str>::new(), "{d:?}");
}

#[test]
fn course_without_topics_is_unchanged() {
    let d = run(COURSE, &[CHOICE]);
    assert_eq!(codes(&d), Vec::<&str>::new(), "{d:?}");
}

#[test]
fn topics_unit_unknown_decoy() {
    assert_only_topic_code(&course_with(r#"{"units":["nope"],"aspects":[{"id":"a","tags":["t"]}]}"#), "topics_unit_unknown");
}

#[test]
fn topics_unit_scoped_decoy() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","srs":{"scope":"entity"}}],"topics":{"units":["u"],"aspects":[{"id":"a","tags":["t"]}]}}"#;
    assert_only_topic_code(course, "topics_unit_scoped");
}

#[test]
fn topics_aspect_duplicate_decoy() {
    let topics = r#"{"units":["u"],"aspects":[{"id":"a","tags":["t"]},{"id":"a","units":["u"]}]}"#;
    assert_only_topic_code(&course_with(topics), "topics_aspect_duplicate");
}

#[test]
fn topics_aspect_empty_decoy() {
    for rule in [r#"{"id":"a"}"#, r#"{"id":"a","tags":[],"units":[]}"#] {
        let topics = format!(r#"{{"units":["u"],"aspects":[{rule}]}}"#);
        assert_only_topic_code(&course_with(&topics), "topics_aspect_empty");
    }
}

#[test]
fn topics_cap_range_decoy() {
    for cap in ["0", "501"] {
        let topics = format!(r#"{{"units":["u"],"aspects":[{{"id":"a","tags":["t"]}}],"sessionCap":{cap}}}"#);
        assert_only_topic_code(&course_with(&topics), "topics_cap_range");
    }
}

#[test]
fn topics_cap_bounds_are_valid() {
    for cap in ["1", "500"] {
        let topics = format!(r#"{{"units":["u"],"aspects":[{{"id":"a","tags":["t"]}}],"sessionCap":{cap}}}"#);
        let d = run(&course_with(&topics), &[CHOICE]);
        assert_eq!(topic_codes(&d), Vec::<&str>::new(), "cap {cap}: {d:?}");
    }
}

#[test]
fn topics_pool_unknown_decoy() {
    let topics = r#"{"units":["u"],"aspects":[{"id":"meaning","tags":["t"]}],"poolAspects":["meaning","nope"]}"#;
    assert_only_topic_code(&course_with(topics), "topics_pool_unknown");
}

#[test]
fn topics_pool_known_aspects_are_valid() {
    let topics = r#"{"units":["u"],"aspects":[{"id":"meaning","tags":["t"]},{"id":"reading","units":["u"]}],"poolAspects":["reading"]}"#;
    let d = run(&course_with(topics), &[CHOICE]);
    assert_eq!(topic_codes(&d), Vec::<&str>::new(), "{d:?}");
}

#[test]
fn unknown_topics_field_is_parse_error() {
    let d = run(&course_with(r#"{"units":["u"],"aspects":[],"bogus":1}"#), &[CHOICE]);
    assert!(d.iter().any(|d| d.code == "parse_error"), "{d:?}");
}

#[test]
fn topics_codes_are_registered() {
    let registered: Vec<&str> = dojo_core::validate::CODES.iter().map(|c| c.0).collect();
    for code in ["topics_unit_unknown", "topics_unit_scoped", "topics_aspect_duplicate", "topics_aspect_empty", "topics_cap_range", "topics_pool_unknown"] {
        assert!(registered.contains(&code), "{code} not in CODES");
    }
}
