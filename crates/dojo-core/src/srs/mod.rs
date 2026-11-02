use crate::progress::num_i64;
use crate::rng::splitmix64;
use serde_json::{Map, Value};

mod config;
mod entity;
mod queue;
mod timer;
mod extras;
mod weighted;

pub use config::*;
use config::{interval, max_stage};
pub use entity::*;
pub use queue::*;
pub use timer::{timer_limit, timer_next, TimerIn};
pub use extras::{apply_extras, Outcome};
pub use weighted::{draw_index, unit_random, weight, weighted_queue, WeightedIn};

pub const HOUR: i64 = 3_600_000;
pub const DAY: i64 = 24 * HOUR;
pub const DEFAULT_LADDER: [i64; 7] = [0, 4 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];


/// Stages lost on a wrong answer when the API gets no explicit drop (keeps golden vectors).
/// Used by `apply_answer` and `apply_practice` when called without an explicit drop parameter.
pub const LEGACY_VECTOR_DROP: i64 = 2;
/// Stages lost on a wrong answer for a course that does not set `dropOnWrong` (UI default).
/// Used by `drop_for_unit_json` and `unit_config` as the final fallback.
pub const COURSE_DEFAULT_DROP: i64 = 1;

pub fn int_field(rec: Option<&Value>, key: &str) -> i64 {
    rec.and_then(|r| r.get(key)).and_then(num_i64).unwrap_or(0)
}

fn ever_learned(rec: Option<&Value>) -> bool {
    rec.is_some() && (int_field(rec, "ok") > 0 || int_field(rec, "s") > 0)
}

fn record_fields(rec: Option<&Value>) -> Map<String, Value> {
    rec.and_then(Value::as_object).cloned().unwrap_or_default()
}

/// Grades one answer and returns a new record: correct moves up a stage, wrong drops `LEGACY_VECTOR_DROP`
/// (never below 1 for an item that was ever learned). `due = now + ladder[stage]`.
pub fn apply_answer(rec: Option<&Value>, correct: bool, now: i64, ladder: &[i64]) -> Value {
    apply_answer_drop(rec, correct, now, ladder, LEGACY_VECTOR_DROP)
}

/// Like `apply_answer`, but a wrong answer drops `drop` stages.
pub fn apply_answer_drop(rec: Option<&Value>, correct: bool, now: i64, ladder: &[i64], drop: i64) -> Value {
    let stage = int_field(rec, "s");
    let next = if correct {
        stage.saturating_add(1)
    } else {
        stage.saturating_sub(drop).max(i64::from(ever_learned(rec)))
    }
    .clamp(0, max_stage(ladder));

    let mut out = record_fields(rec);
    out.insert("s".into(), Value::from(next));
    out.insert("due".into(), Value::from(now.saturating_add(interval(ladder, next))));
    out.insert("ok".into(), Value::from(int_field(rec, "ok").saturating_add(i64::from(correct))));
    out.insert("bad".into(), Value::from(int_field(rec, "bad").saturating_add(i64::from(!correct))));
    out.insert("last".into(), Value::from(now));
    Value::Object(out)
}

/// Like `apply_answer`, but a correct answer to a started, not yet due record only adds to `ok` and sets `last`.
pub fn apply_practice(rec: Option<&Value>, correct: bool, now: i64, ladder: &[i64]) -> Value {
    apply_practice_drop(rec, correct, now, ladder, LEGACY_VECTOR_DROP)
}

/// Like `apply_practice`, but a wrong answer drops `drop` stages.
pub fn apply_practice_drop(rec: Option<&Value>, correct: bool, now: i64, ladder: &[i64], drop: i64) -> Value {
    let not_due = rec
        .and_then(|r| r.get("due"))
        .and_then(num_i64)
        .is_some_and(|due| due > now);
    if !correct || !not_due {
        return apply_answer_drop(rec, correct, now, ladder, drop);
    }
    let mut out = record_fields(rec);
    out.insert("ok".into(), Value::from(int_field(rec, "ok").saturating_add(1)));
    out.insert("last".into(), Value::from(now));
    Value::Object(out)
}

/// Returns the record unchanged unless it sits at stage 0, which moves to stage 1.
pub fn apply_relearn(rec: Option<&Value>, now: i64, ladder: &[i64]) -> Option<Value> {
    let rec = rec?;
    if rec.is_null() || int_field(Some(rec), "s") > 0 {
        return Some(rec.clone());
    }
    let step = ladder.get(1).or(ladder.first()).copied().unwrap_or(0);
    let mut out = Map::new();
    out.insert("s".into(), Value::from(1));
    out.insert("due".into(), Value::from(now.saturating_add(step)));
    out.insert("ok".into(), Value::from(int_field(Some(rec), "ok")));
    out.insert("bad".into(), Value::from(int_field(Some(rec), "bad")));
    out.insert("last".into(), Value::from(now));
    Some(Value::Object(out))
}

/// True when the record exists and its `due` is at or before `now`.
pub fn is_due(rec: Option<&Value>, now: i64) -> bool {
    rec.and_then(|r| r.get("due")).and_then(num_i64).is_some_and(|due| due <= now)
}

/// True when there is no record (absent or JSON `null`).
pub fn is_new(rec: Option<&Value>) -> bool {
    rec.is_none_or(Value::is_null)
}

/// Target stage for placement: 4, or the highest stage <= 4 if the ladder is shorter.
fn placement_stage(ladder: &[i64]) -> i64 {
    let target = 4i64;
    let max = max_stage(ladder);
    target.min(max)
}

/// Applies placement marking to a record (`None`/null = unseen item).
///
/// - `known = true`: move the item to stage 4 (or highest stage <= 4), with due date spread
///   deterministically over a window using the seeded PRNG.
///   If the record already has a stage >= the target, it is returned unchanged (idempotent, never lowers).
/// - `known = false`: return the record unchanged (no change).
///
/// The spread is: `ladder[target_stage] * (0.6 + 0.8 * random)` where random is in [0, 1).
pub fn apply_placement(rec: Option<&Value>, known: bool, now: i64, ladder: &[i64], seed: u64) -> Value {
    // If not known, return record unchanged (null/None becomes null)
    if !known {
        return rec.cloned().unwrap_or(Value::Null);
    }

    let current_stage = int_field(rec, "s");
    let target = placement_stage(ladder);

    // Idempotent: if already at or past the target stage, return unchanged
    if current_stage >= target {
        return rec.cloned().unwrap_or(Value::Null);
    }

    // Use seeded PRNG to generate deterministic random value
    let mut state = seed;
    let rand_value = splitmix64(&mut state);
    // Top 53 bits -> f64 in [0, 1)
    let rand = (rand_value >> 11) as f64 / (1u64 << 53) as f64;

    // Calculate spread: ladder[target] * (0.6 + 0.8 * rand)
    let target_interval = interval(ladder, target);
    let spread = target_interval as f64 * (0.6 + 0.8 * rand);
    let due = now.saturating_add(spread.round() as i64);

    let mut out = record_fields(rec);
    out.entry("ok").or_insert(Value::from(0));
    out.entry("bad").or_insert(Value::from(0));
    out.insert("s".into(), Value::from(target));
    out.insert("due".into(), Value::from(due));
    out.insert("last".into(), Value::from(now));
    Value::Object(out)
}

#[cfg(test)]
mod drop_tests {
    use super::*;
    use serde_json::json;

    const NOW: i64 = 1_000_000;

    #[test]
    fn drop_0_keeps_stage() {
        let rec = json!({"s": 3, "ok": 1, "bad": 0, "due": NOW, "last": NOW});
        let r = apply_answer_drop(Some(&rec), false, NOW, &DEFAULT_LADDER, 0);
        assert_eq!(r["s"], 3);
        assert_eq!(r["bad"], 1);
        assert!(r["due"].as_i64().unwrap() > NOW);
    }

    #[test]
    fn drop_1_drops_one() {
        let rec = json!({"s": 3, "ok": 1, "bad": 0, "due": NOW, "last": NOW});
        let r = apply_answer_drop(Some(&rec), false, NOW, &DEFAULT_LADDER, 1);
        assert_eq!(r["s"], 2);
        assert_eq!(r["bad"], 1);
    }

    #[test]
    fn drop_2_drops_two() {
        let rec = json!({"s": 3, "ok": 1, "bad": 0, "due": NOW, "last": NOW});
        let r = apply_answer_drop(Some(&rec), false, NOW, &DEFAULT_LADDER, 2);
        assert_eq!(r["s"], 1);
        assert_eq!(r["bad"], 1);
    }

    #[test]
    fn drop_3_floors_at_1() {
        let rec = json!({"s": 3, "ok": 1, "bad": 0, "due": NOW, "last": NOW});
        let r = apply_answer_drop(Some(&rec), false, NOW, &DEFAULT_LADDER, 3);
        assert_eq!(r["s"], 1);
        assert_eq!(r["bad"], 1);
    }

    #[test]
    fn drop_never_below_1_for_learned() {
        let rec = json!({"s": 1, "ok": 1, "bad": 0, "due": NOW, "last": NOW});
        let r = apply_answer_drop(Some(&rec), false, NOW, &DEFAULT_LADDER, 5);
        assert_eq!(r["s"], 1);
        assert_eq!(r["bad"], 1);
    }

    #[test]
    fn drop_new_item_stays_0() {
        let r = apply_answer_drop(None, false, NOW, &DEFAULT_LADDER, 2);
        assert_eq!(r["s"], 0);
        assert_eq!(r["bad"], 1);
    }

    #[test]
    fn drop_for_unit_json_resolution_order() {
        use serde_json::json;
        let course = json!({
            "units": [{"id": "u1", "title": "U1", "srs": {"dropOnWrong": 2}}],
            "srs": {"dropOnWrong": 1},
            "srsByType": {"choice": {"dropOnWrong": 3}}
        });
        
        assert_eq!(drop_for_unit_json(&course, "u1", None), 2);
        assert_eq!(drop_for_unit_json(&course, "unknown", None), 1);
        assert_eq!(drop_for_unit_json(&course, "unknown", Some("choice")), 3);
        assert_eq!(drop_for_unit_json(&course, "unknown", Some("gap")), 1);
        assert_eq!(drop_for_unit_json(&course, "u1", Some("choice")), 2);
    }

    #[test]
    fn drop_for_unit_json_fallback_to_default() {
        use serde_json::json;
        let course = json!({"units": [], "srs": {}});
        assert_eq!(drop_for_unit_json(&course, "u1", None), COURSE_DEFAULT_DROP);
        assert_eq!(drop_for_unit_json(&course, "u1", Some("choice")), COURSE_DEFAULT_DROP);
    }
}

#[cfg(test)]
mod placement_tests {
    use super::*;
    use serde_json::json;

    const NOW: i64 = 1_000_000;

    #[test]
    fn known_unseen_item_goes_to_stage_4() {
        let r = apply_placement(None, true, NOW, &DEFAULT_LADDER, 7);
        assert_eq!(r["s"], 4);
        assert_eq!(r["ok"], 0);
        assert!(r["due"].as_i64().unwrap() > NOW);
    }

    #[test]
    fn short_ladder_uses_highest_stage() {
        let r = apply_placement(None, true, NOW, &[0, HOUR, DAY], 7);
        assert_eq!(r["s"], 2);
    }

    #[test]
    fn spread_is_seeded_and_varies() {
        let a = apply_placement(None, true, NOW, &DEFAULT_LADDER, 1);
        assert_eq!(a, apply_placement(None, true, NOW, &DEFAULT_LADDER, 1));
        let dues: std::collections::HashSet<i64> =
            (0..20).map(|s| apply_placement(None, true, NOW, &DEFAULT_LADDER, s)["due"].as_i64().unwrap()).collect();
        assert!(dues.len() > 10);
        let lo = NOW + (7.0 * DAY as f64 * 0.6) as i64 - 1;
        let hi = NOW + (7.0 * DAY as f64 * 1.4) as i64 + 1;
        assert!(dues.iter().all(|d| (lo..=hi).contains(d)));
    }

    #[test]
    fn never_lowers_and_unknown_untouched() {
        let hi = json!({"s":5,"due":9,"ok":3,"bad":0,"last":1});
        assert_eq!(apply_placement(Some(&hi), true, NOW, &DEFAULT_LADDER, 1), hi);
        let lo = json!({"s":1,"due":9,"ok":1,"bad":0,"last":1});
        assert_eq!(apply_placement(Some(&lo), false, NOW, &DEFAULT_LADDER, 1), lo);
        assert_eq!(apply_placement(None, false, NOW, &DEFAULT_LADDER, 1), Value::Null);
    }
}
