use dojo_core::api;
use dojo_core::srs::*;
use serde_json::{json, Value};

// NOT-TESTED C1: New optional field `dropOnWrong` (integer 0..=10) on `SrsConfig` (`content.rs`), so it is allowed in course `srs`, `srsByType.<type>` and unit `srs`.
// NOT-TESTED C2: Rust field `drop_on_wrong`.
// NOT-TESTED C5: Core default when the `drop` argument is absent stays 2 (`LEGACY_VECTOR_DROP`), so existing golden vectors in `tests/vectors/` stay valid and unchanged.
// NOT-TESTED C7: Floor rule unchanged: never below stage 1 for an ever-learned item.
// NOT-TESTED C8: `drop = 0` keeps the stage but still resets `due = now + ladder[stage]`.
// NOT-TESTED C11: Validator: new error code `bad_drop` (add to `CODES`, fix the array length) when any `dropOnWrong` is outside 0..=10; message names the place (`srs`, `srsByType.<t>`, `unit '<id>' srs`).

fn course(srs: Value, by_type: Value, unit_srs: Value) -> Value {
    json!({"srs": srs, "srsByType": by_type, "units": [{"id": "unit1", "srs": unit_srs}]})
}

fn rec(s: i64) -> Value {
    json!({"s": s, "ok": 1, "bad": 0, "due": 1000, "last": 1000})
}

const LADDER: [i64; 5] = [0, 10, 20, 30, 40];

fn call(name: &str, args: Value) -> Value {
    serde_json::from_str(&api::call(name, &args.to_string())).unwrap()
}

fn error_code(v: &Value) -> &str {
    assert_eq!(v["ok"], false, "{v}");
    v["error"]["code"].as_str().unwrap()
}

#[test]
fn unit_override_wins() {
    let c = course(json!({"dropOnWrong": 3}), json!({"type1": {"dropOnWrong": 2}}), json!({"dropOnWrong": 0}));
    assert_eq!(drop_for_unit_json(&c, "unit1", Some("type1")), 0);
}

#[test]
fn type_override_beats_course() {
    let c = course(json!({"dropOnWrong": 3}), json!({"type1": {"dropOnWrong": 2}}), json!({}));
    assert_eq!(drop_for_unit_json(&c, "unit1", Some("type1")), 2);
}

#[test]
fn course_level_used_without_type_override() {
    let c = course(json!({"dropOnWrong": 3}), json!({}), json!({}));
    assert_eq!(drop_for_unit_json(&c, "unit1", Some("type1")), 3);
    assert_eq!(drop_for_unit_json(&c, "unit1", None), 3);
}

#[test]
fn default_is_course_default() {
    let c = course(json!({}), json!({}), json!({}));
    assert_eq!(drop_for_unit_json(&c, "unit1", Some("type1")), COURSE_DEFAULT_DROP);
    assert_eq!(COURSE_DEFAULT_DROP, 1);
    assert_eq!(LEGACY_VECTOR_DROP, 2);
}

#[test]
fn negative_falls_through() {
    let c = course(json!({"dropOnWrong": -1}), json!({"type1": {"dropOnWrong": 2}}), json!({}));
    assert_eq!(drop_for_unit_json(&c, "unit1", Some("type1")), 2);
    let c = course(json!({"dropOnWrong": -1}), json!({}), json!({}));
    assert_eq!(drop_for_unit_json(&c, "unit1", Some("type1")), COURSE_DEFAULT_DROP);
}

#[test]
fn out_of_range_and_non_integer_fall_through() {
    for bad in [json!(11), json!(50), json!(1.5), json!("2"), json!(null)] {
        let c = course(json!({"dropOnWrong": 3}), json!({}), json!({"dropOnWrong": bad}));
        assert_eq!(drop_for_unit_json(&c, "unit1", None), 3, "{bad}");
    }
    let c = course(json!({}), json!({}), json!({"dropOnWrong": 10}));
    assert_eq!(drop_for_unit_json(&c, "unit1", None), 10);
}

#[test]
fn drop_zero_keeps_stage_and_resets_due() {
    let r = apply_answer_drop(Some(&rec(3)), false, 5000, &LADDER, 0);
    assert_eq!(r["s"], 3);
    assert_eq!(r["due"], 5000 + LADDER[3]);
    assert_eq!(r["bad"], 1);
}

#[test]
fn drop_one_two_three_from_stage_three() {
    for (drop, stage) in [(1, 2), (2, 1), (3, 1)] {
        let r = apply_answer_drop(Some(&rec(3)), false, 5000, &LADDER, drop);
        assert_eq!(r["s"], stage, "drop {drop}");
        assert_eq!(r["due"], 5000 + LADDER[stage as usize], "drop {drop}");
    }
}

#[test]
fn floor_is_stage_one_for_learned_item() {
    let r = apply_answer_drop(Some(&rec(1)), false, 5000, &LADDER, 1);
    assert_eq!(r["s"], 1);
    assert_eq!(r["due"], 5000 + LADDER[1]);
}

#[test]
fn apply_answer_uses_default_drop() {
    assert_eq!(
        apply_answer(Some(&rec(3)), false, 5000, &LADDER),
        apply_answer_drop(Some(&rec(3)), false, 5000, &LADDER, LEGACY_VECTOR_DROP)
    );
}

#[test]
fn apply_practice_drop_matches_answer_when_wrong() {
    assert_eq!(
        apply_practice_drop(Some(&rec(3)), false, 5000, &LADDER, 1),
        apply_answer_drop(Some(&rec(3)), false, 5000, &LADDER, 1)
    );
}

#[test]
fn api_apply_answer_drop_values() {
    let base = |drop: Option<Value>| {
        let mut a = json!({"rec": rec(3), "correct": false, "now": 5000, "ladder": LADDER});
        if let Some(d) = drop {
            a["drop"] = d;
        }
        call("applyAnswer", a)
    };
    assert_eq!(base(None)["value"]["s"], 1);
    assert_eq!(base(Some(json!(null)))["value"]["s"], 1);
    assert_eq!(base(Some(json!(1)))["value"]["s"], 2);
    assert_eq!(base(Some(json!(0)))["value"]["s"], 3);
}

#[test]
fn api_apply_answer_rejects_negative_and_non_integer_drop() {
    for bad in [json!(-1), json!(1.5), json!("1"), json!(true)] {
        for name in ["applyAnswer", "applyPractice"] {
            let v = call(name, json!({"rec": rec(3), "correct": false, "now": 5000, "ladder": LADDER, "drop": bad}));
            assert_eq!(error_code(&v), "bad_args", "{name} {bad}");
        }
    }
}

#[test]
fn api_drop_for_unit() {
    let c = course(json!({"dropOnWrong": 3}), json!({"type1": {"dropOnWrong": 2}}), json!({"dropOnWrong": 1}));
    let v = call("dropForUnit", json!({"course": c, "unitId": "unit1", "itemType": "type1"}));
    assert_eq!(v, json!({"ok": true, "value": 1}));
    let v = call("dropForUnit", json!({"course": c, "unitId": "other", "itemType": "type1"}));
    assert_eq!(v["value"], 2);
}
