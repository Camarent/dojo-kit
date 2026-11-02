use dojo_core::content::Item;
mod common;
use common::*;

const CASES: [&str; 8] = [
    r#"{"type":"choice","id":"a","unit":"u","prompt":"p","options":["x","y"],"answer":0,"topic":"T"}"#,
    r#"{"type":"gap","id":"a","unit":"u","prompt":"p","answers":["x"],"topic":"T"}"#,
    r#"{"type":"card","id":"a","unit":"u","prompt":"p","back":"b","topic":"T"}"#,
    r#"{"type":"multi","id":"a","unit":"u","prompt":"p","options":["x","y"],"correct":[0],"topic":"T"}"#,
    r#"{"type":"match","id":"a","unit":"u","prompt":"p","pairs":[{"left":"l","right":"r"}],"topic":"T"}"#,
    r#"{"type":"order","id":"a","unit":"u","prompt":"p","steps":["a","b"],"topic":"T"}"#,
    r#"{"type":"cloze","id":"a","unit":"u","prompt":"p","parts":["a",["b"]],"topic":"T"}"#,
    r#"{"type":"numeric","id":"a","unit":"u","prompt":"p","answer":1,"topic":"T"}"#,
];

#[test]
fn topic_parses_on_every_item_type() {
    for c in CASES {
        let item: Item = serde_json::from_str(c).unwrap_or_else(|e| panic!("{c}: {e}"));
        assert_eq!(item.topic(), Some("T"), "{c}");
        assert!(serde_json::to_string(&item).unwrap().contains(r#""topic":"T""#));
    }
}

#[test]
fn absent_topic_stays_absent() {
    let c = CASES[0].replace(r#","topic":"T""#, "");
    let item: Item = serde_json::from_str(&c).unwrap();
    assert_eq!(item.topic(), None);
    assert!(!serde_json::to_string(&item).unwrap().contains("topic"));
}

#[test]
fn unknown_field_still_rejected() {
    let c = CASES[0].replace(r#""topic":"T""#, r#""topik":"T""#);
    assert!(serde_json::from_str::<Item>(&c).is_err());
}

fn codes(extra: &str, prompt: &str) -> Vec<String> {
    let l = format!(r#"{{"type":"card","id":"u-1","unit":"u","prompt":"{prompt}","back":"b",{extra}}}"#);
    run(COURSE, &[&l]).into_iter().map(|d| d.code.to_string()).collect()
}

#[test]
fn topic_codes_fire_and_good_topic_is_clean() {
    let has = |v: &[String], c: &str| v.iter().any(|x| x == c);
    let good = codes(r#""topic":"closures""#, "What?");
    assert!(!has(&good, "bad_topic") && !has(&good, "topic_too_long") && !has(&good, "topic_is_prompt"));
    assert!(has(&codes(r#""topic":"""#, "What?"), "bad_topic"));
    assert!(has(&codes(r#""topic":"  ""#, "What?"), "bad_topic"));
    let t80 = "a".repeat(80);
    let t81 = "a".repeat(81);
    assert!(!has(&codes(&format!(r#""topic":"{t80}""#), "What?"), "topic_too_long"));
    assert!(has(&codes(&format!(r#""topic":"{t81}""#), "What?"), "topic_too_long"));
    assert!(has(&codes(r#""topic":" what? ""#, "What?"), "topic_is_prompt"));
}
