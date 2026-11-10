use dojo_core::validate::Diagnostic;
mod common;
use common::*;

fn leaks(lines: &[&str]) -> bool {
    run(COURSE, lines).iter().any(|d: &Diagnostic| d.code == "hint_leaks_answer")
}

#[test]
fn hint_leak_gap_flagged() {
    fires(COURSE, &[r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Capital of Italy: ___ (Rome)","answers":["Rome"]}"#], "hint_leaks_answer");
}

#[test]
fn hint_leak_cloze_and_choice_flagged() {
    fires(COURSE, &[r#"{"type":"cloze","id":"u-1","unit":"u","prompt":"Fill in (cat)","parts":["the ",["cat"]," sat"]}"#], "hint_leaks_answer");
    fires(COURSE, &[r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Capital of France (Paris)?","options":["Paris","b"],"answer":0}"#], "hint_leaks_answer");
}

#[test]
fn hint_leak_order_flagged() {
    fires(COURSE, &[r#"{"type":"order","id":"u-1","unit":"u","prompt":"Put in order (morning first)","steps":["morning","noon","night"]}"#], "hint_leaks_answer");
}

#[test]
fn hint_leak_decoys_not_flagged() {
    // Order item with an unrelated hint.
    assert!(!leaks(&[r#"{"type":"order","id":"u-5","unit":"u","prompt":"Put in order (days of week)","steps":["Monday","Tuesday","Friday"]}"#]));
    // Answer shorter than MIN_LEAK_CHARS: same rule as answer_in_prompt, so not a leak.
    assert!(!leaks(&[r#"{"type":"gap","id":"u-4","unit":"u","prompt":"1 + 1 = ___ (12)","answers":["12"]}"#]));
    // Unrelated hint.
    assert!(!leaks(&[r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Rome is the capital of ___ (country)","answers":["Italy"]}"#]));
    // Ruby reading of the stem is not a hint, even when it equals the answer.
    assert!(!leaks(&[r#"{"type":"gap","id":"u-2","unit":"u","prompt":"{\u6771\u4eac|\u3068\u3046\u304d\u3087\u3046}\u306e___","answers":["\u3068\u3046\u304d\u3087\u3046"]}"#]));
    // Blank-only hint (empty after normalization) never matches.
    assert!(!leaks(&[r#"{"type":"gap","id":"u-3","unit":"u","prompt":"Sum is ___ （　）","answers":["2"]}"#]));
}
