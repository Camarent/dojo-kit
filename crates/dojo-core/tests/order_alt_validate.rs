mod common;
use common::*;
use dojo_core::content::Item;

const C: &str = r#"{"id":"c","title":"C","uiLanguage":"en","contentLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

fn item(alt: Option<&str>) -> String {
    let a = alt.map(|a| format!(r#","altOrders":{a}"#)).unwrap_or_default();
    format!(r#"{{"type":"order","id":"u-1","unit":"u","prompt":"___ ___ ___","steps":["a","b","c"]{a}}}"#)
}

fn bad(alt: Option<&str>) -> bool {
    run(C, &[&item(alt)]).iter().any(|d| d.code == "order_alt_invalid")
}

#[test]
fn valid_alt_passes() {
    assert!(!bad(Some("[[1,0,2],[2,1,0]]")));
}

#[test]
fn no_alt_unchanged() {
    assert!(!bad(None));
}

#[test]
fn wrong_length_fails() {
    assert!(bad(Some("[[1,0]]")));
    assert!(bad(Some("[[1,0,2,3]]")));
}

#[test]
fn out_of_range_fails() {
    assert!(bad(Some("[[1,0,3]]")));
}

#[test]
fn repeated_index_fails() {
    assert!(bad(Some("[[1,1,2]]")));
}

#[test]
fn identity_fails() {
    assert!(bad(Some("[[0,1,2]]")));
}

#[test]
fn duplicate_entry_fails() {
    assert!(bad(Some("[[1,0,2],[1,0,2]]")));
}

#[test]
fn parse_round_trip() {
    let it: Item = serde_json::from_str(&item(Some("[[1,0,2]]"))).unwrap();
    let s = serde_json::to_string(&it).unwrap();
    assert!(s.contains(r#""altOrders":[[1,0,2]]"#));
    let back: Item = serde_json::from_str(&s).unwrap();
    assert_eq!(it, back);
    let plain: Item = serde_json::from_str(&item(None)).unwrap();
    assert!(!serde_json::to_string(&plain).unwrap().contains("altOrders"));
}
