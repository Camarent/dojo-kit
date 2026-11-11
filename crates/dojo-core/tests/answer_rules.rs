//! `AnswerRules`: `jump_to` (correct answer, due, stage 1) and `wrong_floor` (wrong answer, ever learned).
use dojo_core::srs::{apply_answer, apply_answer_rules, apply_practice_rules, AnswerRules, DEFAULT_LADDER};
use serde_json::{json, Value};

const NOW: i64 = 1_000_000;

fn rec(s: i64, due: i64) -> Value {
    json!({"s": s, "ok": 1, "bad": 0, "due": due, "last": NOW - 1})
}

fn stage(v: &Value) -> i64 {
    v["s"].as_i64().unwrap()
}

fn rules(drop: i64, jump_to: Option<i64>, wrong_floor: Option<i64>) -> AnswerRules {
    AnswerRules { drop, jump_to, wrong_floor }
}

#[test]
fn jump_applies_when_due_and_stage_1() {
    let r = apply_answer_rules(Some(&rec(1, NOW)), true, NOW, &DEFAULT_LADDER, rules(1, Some(5), None));
    assert_eq!(stage(&r), 5);
}

#[test]
fn jump_skipped_when_not_due() {
    let r = apply_answer_rules(Some(&rec(1, NOW + 1)), true, NOW, &DEFAULT_LADDER, rules(1, Some(5), None));
    assert_eq!(stage(&r), 2);
}

#[test]
fn jump_skipped_when_not_stage_1() {
    let r = apply_answer_rules(Some(&rec(2, NOW)), true, NOW, &DEFAULT_LADDER, rules(1, Some(5), None));
    assert_eq!(stage(&r), 3);
}

#[test]
fn jump_skipped_for_new_item() {
    let r = apply_answer_rules(None, true, NOW, &DEFAULT_LADDER, rules(1, Some(5), None));
    assert_eq!(stage(&r), 1);
}

#[test]
fn jump_clamped_to_max_stage() {
    let r = apply_answer_rules(Some(&rec(1, NOW)), true, NOW, &DEFAULT_LADDER, rules(1, Some(99), None));
    assert_eq!(stage(&r), 6);
}

#[test]
fn absent_jump_keeps_plus_one() {
    let r = apply_answer_rules(Some(&rec(1, NOW)), true, NOW, &DEFAULT_LADDER, rules(1, None, None));
    assert_eq!(stage(&r), 2);
}

#[test]
fn wrong_floor_holds_learned_item() {
    let r = apply_answer_rules(Some(&rec(4, NOW)), false, NOW, &DEFAULT_LADDER, rules(5, None, Some(2)));
    assert_eq!(stage(&r), 2);
}

#[test]
fn wrong_floor_never_learned_stays_0() {
    let r = apply_answer_rules(None, false, NOW, &DEFAULT_LADDER, rules(5, None, Some(3)));
    assert_eq!(stage(&r), 0);
    assert_eq!(r["bad"], 1);
}

#[test]
fn absent_floor_keeps_floor_1() {
    let r = apply_answer_rules(Some(&rec(4, NOW)), false, NOW, &DEFAULT_LADDER, rules(5, None, None));
    assert_eq!(stage(&r), 1);
}

#[test]
fn absent_rules_match_plain_apply_answer() {
    let base = rec(3, NOW);
    assert_eq!(
        apply_answer_rules(Some(&base), false, NOW, &DEFAULT_LADDER, AnswerRules::with_drop(2)),
        apply_answer(Some(&base), false, NOW, &DEFAULT_LADDER)
    );
    assert_eq!(
        apply_answer_rules(Some(&base), true, NOW, &DEFAULT_LADDER, AnswerRules::with_drop(2)),
        apply_answer(Some(&base), true, NOW, &DEFAULT_LADDER)
    );
}

#[test]
fn practice_not_due_correct_does_not_jump() {
    let r = apply_practice_rules(Some(&rec(1, NOW + 1)), true, NOW, &DEFAULT_LADDER, rules(1, Some(5), None));
    assert_eq!(stage(&r), 1);
    assert_eq!(r["ok"], 2);
}

#[test]
fn practice_due_correct_jumps() {
    let r = apply_practice_rules(Some(&rec(1, NOW)), true, NOW, &DEFAULT_LADDER, rules(1, Some(5), None));
    assert_eq!(stage(&r), 5);
}
