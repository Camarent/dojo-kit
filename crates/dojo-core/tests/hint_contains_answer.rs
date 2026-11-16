use dojo_core::validate::Diagnostic;
mod common;
use common::*;

fn contains(lines: &[&str]) -> bool {
    run(COURSE, lines).iter().any(|d: &Diagnostic| d.code == "hint_contains_answer")
}

#[test]
fn hint_contains_answer_flagged() {
    // Hint holds the answer.
    fires(COURSE, &[r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Capital of Italy: ___ (Rome)","answers":["Rome"]}"#], "hint_contains_answer");
    // Hint holds the second entry of answers.
    fires(COURSE, &[r#"{"type":"gap","id":"u-2","unit":"u","prompt":"Capital: ___ (Roma)","answers":["Rome","Roma"]}"#], "hint_contains_answer");
    // Hint holds a retry reading.
    fires(COURSE, &[r#"{"type":"gap","id":"u-3","unit":"u","prompt":"Capital: ___ (Tokyo)","answers":["Kyoto"],"retry":["Tokyo"]}"#], "hint_contains_answer");
    // Hint is a kana variant of the answer, equal after the item's fold.
    fires(COURSE, &[r#"{"type":"gap","id":"u-4","unit":"u","prompt":"Tokyo: ___ (\u30c8\u30a6\u30ad\u30e7\u30a6)","answers":["\u3068\u3046\u304d\u3087\u3046"],"normalize":{"fold":[["\u30c8","\u3068"],["\u30a6","\u3046"],["\u30ad","\u304d"],["\u30e7","\u3087"]]}}"#], "hint_contains_answer");
    // meta.hint_ru holds the answer.
    fires(COURSE, &[r#"{"type":"gap","id":"u-5","unit":"u","prompt":"Capital: ___","answers":["Rome"],"meta":{"hint_ru":"Rome"}}"#], "hint_contains_answer");
}

#[test]
fn hint_without_answer_not_flagged() {
    assert!(!contains(&[r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Capital of Italy: ___ (country)","answers":["Rome"]}"#]));
    // Answer shorter than MIN_LEAK_CHARS: same rule as hint_leaks_answer, so not a leak.
    assert!(!contains(&[r#"{"type":"gap","id":"u-2","unit":"u","prompt":"Sum: ___ (12)","answers":["12"]}"#]));
}
