mod common;
use common::*;
use dojo_core::lock::update;
use dojo_core::validate::validate;

fn diags(lock: &dojo_core::lock::IdLock, lines: &[String]) -> Vec<&'static str> {
    let text = lines.join("\n");
    codes(&validate(COURSE, &[file("content/u.jsonl", &text)], Some(lock)))
}

#[test]
fn retired_id_absent_is_no_error() {
    let lock = lock_of(&["u-1", "u-2"], &["u-2"]);
    let c = diags(&lock, &[card("u-1", false)]);
    assert!(!c.contains(&"id_removed"), "{c:?}");
}

#[test]
fn active_id_absent_is_id_removed() {
    let lock = lock_of(&["u-1", "u-2"], &["u-2"]);
    let c = diags(&lock, &[card("u-2", true)]);
    assert!(c.contains(&"id_removed"), "{c:?}");
}

#[test]
fn reused_retired_id_is_error() {
    let lock = lock_of(&["u-1", "u-2"], &["u-2"]);
    let c = diags(&lock, &[card("u-1", false), card("u-2", false)]);
    assert!(c.contains(&"retired_id_reused"), "{c:?}");
}

#[test]
fn lock_update_keeps_absent_retired_id() {
    let lock = lock_of(&["u-1", "u-2"], &["u-2"]);
    let next = update(Some(&lock), &items(&[&card("u-1", false)]));
    assert!(next.ids.contains(&"u-2".to_string()));
    assert!(next.retired.contains(&"u-2".to_string()));
}
