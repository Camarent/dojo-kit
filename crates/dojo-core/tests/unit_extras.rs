//! Per-question extras (`qok`/`qbad`/`qlast`) and the unit weak flag (`wk`, `wkseen`) written by a unit answer.
use dojo_core::srs::{apply_entity, apply_question_extras, AnswerRules, EntityMode, Question, DEFAULT_LADDER};
use serde_json::{json, Map, Value};

const NOW: i64 = 1_760_000_000_000;
const DAY: i64 = 86_400_000;

fn fresh(members: &[&str]) -> Map<String, Value> {
    members.iter().map(|id| (id.to_string(), json!({"s": 1, "due": NOW - DAY, "ok": 1, "bad": 0, "last": NOW - DAY}))).collect()
}

/// One unit answer: `apply_entity` in answer mode, then the per-question extras for `id`.
fn grade(members: &[&str], records: &Map<String, Value>, id: &str, correct: bool, known: i64) -> Map<String, Value> {
    let mut out = apply_entity(members, records, EntityMode::Answer, correct, NOW, &DEFAULT_LADDER, AnswerRules::with_drop(1));
    apply_question_extras(&mut out, &Question { id, correct, now: NOW, pool: members.len(), known_distinct: known });
    out
}

fn weak(records: &Map<String, Value>, id: &str) -> bool {
    records[id].get("wk").and_then(Value::as_i64) == Some(1)
}

#[test]
fn wrong_then_right_on_same_question_stays_weak() {
    let m = ["a", "b", "c"];
    let r = grade(&m, &fresh(&m), "a", false, 2);
    assert!(m.iter().all(|id| weak(&r, id)));
    let r = grade(&m, &r, "a", true, 2);
    assert!(m.iter().all(|id| weak(&r, id)));
    assert_eq!(r["a"]["wkseen"], json!(["a"]));
}

#[test]
fn wrong_then_right_on_two_distinct_questions_clears_on_all_members() {
    let m = ["a", "b", "c"];
    let r = grade(&m, &fresh(&m), "a", false, 2);
    let r = grade(&m, &r, "b", true, 2);
    assert!(m.iter().all(|id| weak(&r, id)), "one distinct right must not clear");
    let r = grade(&m, &r, "b", true, 2);
    assert!(m.iter().all(|id| weak(&r, id)), "same question again must not clear");
    let r = grade(&m, &r, "c", true, 2);
    assert!(m.iter().all(|id| !weak(&r, id) && r[*id].get("wkseen").is_none()));
}

#[test]
fn pool_of_one_question_clears_after_one_right() {
    let m = ["a"];
    let r = grade(&m, &fresh(&m), "a", false, 2);
    assert!(weak(&r, "a"));
    let r = grade(&m, &r, "a", true, 2);
    assert!(!weak(&r, "a"));
}

#[test]
fn wrong_again_restarts_the_count() {
    let m = ["a", "b", "c"];
    let r = grade(&m, &fresh(&m), "a", false, 2);
    let r = grade(&m, &r, "b", true, 2);
    let r = grade(&m, &r, "c", false, 2);
    assert_eq!(r["a"]["wkseen"], json!(["c"]));
    let r = grade(&m, &r, "a", true, 2);
    assert!(m.iter().all(|id| weak(&r, id)), "one distinct right since the new wrong must not clear");
    let r = grade(&m, &r, "b", true, 2);
    assert!(m.iter().all(|id| !weak(&r, id)), "two distinct rights since the new wrong clear");
}

#[test]
fn counters_change_on_answered_member_only() {
    let m = ["a", "b"];
    let mut before = fresh(&m);
    before.insert("b".into(), json!({"s": 1, "due": NOW - DAY, "ok": 1, "bad": 0, "last": NOW - DAY, "qok": 5, "qbad": 2, "qlast": 123}));
    let r = grade(&m, &before, "a", false, 2);
    assert_eq!(r["a"]["qbad"], 1);
    assert_eq!(r["a"]["qlast"], NOW);
    assert_eq!(r["b"]["qok"], 5);
    assert_eq!(r["b"]["qbad"], 2);
    assert_eq!(r["b"]["qlast"], 123);
}

#[test]
fn right_answer_counts_qok_and_old_records_are_not_weak() {
    let m = ["a", "b"];
    let r = grade(&m, &fresh(&m), "a", true, 2);
    assert_eq!(r["a"]["qok"], 1);
    assert!(!weak(&r, "a"));
    assert!(r["b"].get("qok").is_none());
}
