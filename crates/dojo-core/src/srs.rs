use crate::progress::{num_i64, truthy};
use serde_json::{Map, Value};
use std::collections::HashMap;

use crate::exam::splitmix64;

pub const HOUR: i64 = 3_600_000;
pub const DAY: i64 = 24 * HOUR;
pub const DEFAULT_LADDER: [i64; 7] = [0, 4 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];

const DEFAULT_WEAKEST_LIMIT: usize = 10;
const WEAK_STAGE_BELOW: i64 = 3;
const WEAK_STAGE_BONUS: f64 = 0.1;

/// Stages lost on a wrong answer when the API gets no explicit drop (keeps golden vectors).
/// Used by `apply_answer` and `apply_practice` when called without an explicit drop parameter.
pub const LEGACY_VECTOR_DROP: i64 = 2;
/// Stages lost on a wrong answer for a course that does not set `dropOnWrong` (UI default).
/// Used by `drop_for_unit_json` and `unit_config` as the final fallback.
pub const COURSE_DEFAULT_DROP: i64 = 1;

/// Ids to show now: `due` oldest first, `fresh` in course order.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Queue {
    pub due: Vec<String>,
    pub fresh: Vec<String>,
}

fn max_stage(ladder: &[i64]) -> i64 {
    i64::try_from(ladder.len().saturating_sub(1)).unwrap_or(i64::MAX)
}

fn interval(ladder: &[i64], stage: i64) -> i64 {
    usize::try_from(stage).ok().and_then(|i| ladder.get(i)).copied().unwrap_or(0)
}

fn json_ladder(srs: Option<&Value>) -> Option<Vec<i64>> {
    let arr = srs?.get("ladder")?.as_array()?;
    let ladder: Option<Vec<i64>> = arr.iter().map(Value::as_i64).collect();
    ladder.filter(|l| !l.is_empty())
}

/// Same as `ladder_for_unit`, reading the course as raw JSON.
/// Resolution order: unit ladder > course srsByType[item_type] > course srs.ladder > default.
pub fn ladder_for_unit_json(course: &Value, unit_id: &str, item_type: Option<&str>) -> Vec<i64> {
    let unit_srs = course
        .get("units")
        .and_then(Value::as_array)
        .and_then(|us| us.iter().find(|u| u.get("id").and_then(Value::as_str) == Some(unit_id)))
        .and_then(|u| u.get("srs"));
    if let Some(ladder) = json_ladder(unit_srs) {
        return ladder;
    }
    // Try srsByType[item_type]
    if let Some(type_name) = item_type {
        if let Some(srs_by_type) = course.get("srsByType").and_then(Value::as_object) {
            if let Some(type_srs) = srs_by_type.get(type_name) {
                if let Some(ladder) = json_ladder(Some(type_srs)) {
                    return ladder;
                }
            }
        }
    }
    // Fall back to course ladder
    json_ladder(course.get("srs"))
        .unwrap_or_else(|| DEFAULT_LADDER.to_vec())
}

fn json_drop(srs: Option<&Value>) -> Option<i64> {
    srs?.get("dropOnWrong")?.as_i64().filter(|d| (0..=10).contains(d))
}

/// Stages lost on a wrong answer. Resolution order: unit > course srsByType[item_type] > course srs > 1.
pub fn drop_for_unit_json(course: &Value, unit_id: &str, item_type: Option<&str>) -> i64 {
    let unit_srs = course
        .get("units")
        .and_then(Value::as_array)
        .and_then(|us| us.iter().find(|u| u.get("id").and_then(Value::as_str) == Some(unit_id)))
        .and_then(|u| u.get("srs"));
    if let Some(d) = json_drop(unit_srs) {
        return d;
    }
    let by_type = item_type.and_then(|t| course.get("srsByType")?.as_object()?.get(t));
    json_drop(by_type).or_else(|| json_drop(course.get("srs"))).unwrap_or(COURSE_DEFAULT_DROP)
}

/// Course-level resolved settings of one unit (no user overrides), the single source for the UI.
/// Returns `{newPerDay, ladder, dropOnWrong, newOrder, dropByType, scope, drill}`:
/// - `scope`: `"item"` or `"entity"` (unit.srs > course.srs > "item"); `drill`: 1..=5 (same order, default 1);
/// - `newPerDay`: `unit.newPerDay`, or null when the course sets no cap for the unit;
/// - `ladder`: `ladder_for_unit_json` without an item type (unit.srs > course.srs > default);
/// - `dropOnWrong`: `drop_for_unit_json` without an item type (unit.srs > course.srs > `COURSE_DEFAULT_DROP`);
/// - `newOrder`: `unit.newOrder` > `course.newOrder` > "file";
/// - `dropByType`: `srsByType` is per item type, so `{<type>: drop}` (`drop_for_unit_json` with that type)
///   for every type present in `srsByType`.
pub fn unit_config(course: &Value, unit_id: &str) -> Value {
    let unit = course
        .get("units")
        .and_then(Value::as_array)
        .and_then(|us| us.iter().find(|u| u.get("id").and_then(Value::as_str) == Some(unit_id)));
    let new_per_day = unit.and_then(|u| u.get("newPerDay")).and_then(num_i64).filter(|n| *n >= 0);
    fn order_of(v: Option<&Value>) -> Option<&str> {
        v.and_then(|o| o.get("newOrder")).and_then(Value::as_str).filter(|o| *o == "file" || *o == "random")
    }
    let new_order = order_of(unit).or_else(|| order_of(Some(course))).unwrap_or("file");
    let mut drop_by_type = Map::new();
    if let Some(types) = course.get("srsByType").and_then(Value::as_object) {
        for t in types.keys() {
            drop_by_type.insert(t.clone(), Value::from(drop_for_unit_json(course, unit_id, Some(t))));
        }
    }
    let pick = |key: &str| unit.and_then(|u| u.get("srs")).and_then(|s| s.get(key)).or_else(|| course.get("srs").and_then(|s| s.get(key)));
    let scope = if pick("scope").and_then(Value::as_str) == Some("entity") { "entity" } else { "item" };
    let valid = |v: &Value| v.as_i64().filter(|d| (1..=5).contains(d));
    let drill = unit
        .and_then(|u| u.get("srs"))
        .and_then(|s| s.get("drill"))
        .and_then(valid)
        .or_else(|| course.get("srs").and_then(|s| s.get("drill")).and_then(valid))
        .unwrap_or(1);
    let mut out = Map::new();
    out.insert("scope".into(), Value::from(scope));
    out.insert("drill".into(), Value::from(drill));
    out.insert("newPerDay".into(), new_per_day.map_or(Value::Null, Value::from));
    out.insert("ladder".into(), Value::from(ladder_for_unit_json(course, unit_id, None)));
    out.insert("dropOnWrong".into(), Value::from(drop_for_unit_json(course, unit_id, None)));
    out.insert("newOrder".into(), Value::from(new_order));
    out.insert("dropByType".into(), Value::Object(drop_by_type));
    Value::Object(out)
}

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

/// Read view over the ACTIVE members' records of one entity (absent/null/non-object = missing).
/// `None` when no member has a record. `s` = min, `due` = min of present dues, `ok`/`bad`/`last` = max;
/// other fields come from the member with the greatest `last` (tie: first in `members`).
pub fn entity_view(members: &[&str], records: &Map<String, Value>) -> Option<Value> {
    let recs: Vec<&Value> = members.iter().filter_map(|id| records.get(*id)).filter(|r| r.is_object()).collect();
    let mut latest: Option<&Value> = None;
    for r in &recs {
        if latest.is_none_or(|l| int_field(Some(r), "last") > int_field(Some(l), "last")) {
            latest = Some(r);
        }
    }
    let mut out = record_fields(latest);
    let min_of = |key: &str| recs.iter().filter_map(|r| r.get(key).and_then(num_i64)).min();
    out.insert("s".into(), Value::from(recs.iter().map(|r| int_field(Some(r), "s")).min()?));
    if let Some(due) = min_of("due") {
        out.insert("due".into(), Value::from(due));
    }
    for key in ["ok", "bad", "last"] {
        out.insert(key.into(), Value::from(recs.iter().map(|r| int_field(Some(r), key)).max().unwrap_or(0)));
    }
    Some(Value::Object(out))
}

/// How `apply_entity` grades.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntityMode {
    Answer,
    Practice,
    Relearn,
    Placement { seed: u64 },
}

/// One grade for a whole entity: grades `entity_view` with the matching `apply_*` and returns
/// `{member_id: record}` for EVERY member (members without a record inherit). Each record is the member's own
/// record with `s,due,ok,bad,last` replaced. Relearn on a view with `s != 0` (or no view), and placement with
/// `correct = false` or a view already at the target, return an empty map (no writes).
pub fn apply_entity(
    members: &[&str],
    records: &Map<String, Value>,
    mode: EntityMode,
    correct: bool,
    now: i64,
    ladder: &[i64],
    drop: i64,
) -> Map<String, Value> {
    let view = entity_view(members, records);
    let next = match mode {
        EntityMode::Answer => apply_answer_drop(view.as_ref(), correct, now, ladder, drop),
        EntityMode::Practice => apply_practice_drop(view.as_ref(), correct, now, ladder, drop),
        EntityMode::Relearn => match view.as_ref() {
            Some(v) if int_field(Some(v), "s") == 0 => apply_relearn(Some(v), now, ladder).unwrap_or(Value::Null),
            _ => return Map::new(),
        },
        EntityMode::Placement { seed } => {
            if !correct {
                return Map::new();
            }
            let next = apply_placement(view.as_ref(), true, now, ladder, seed);
            if Some(&next) == view.as_ref() {
                return Map::new();
            }
            next
        }
    };
    let mut out = Map::new();
    for id in members {
        let mut rec = records.get(*id).filter(|r| r.is_object()).and_then(Value::as_object).cloned().unwrap_or_default();
        for key in ["s", "due", "ok", "bad", "last"] {
            if let Some(v) = next.get(key) {
                rec.insert(key.into(), v.clone());
            }
        }
        out.insert((*id).to_string(), Value::Object(rec));
    }
    out
}

/// Members to ask for one entity slot: seeded shuffle (`course|day|entity`) of `members`, first `min(n, len)`; `n = 0` counts as 1.
pub fn pick_drill(members: &[String], n: usize, course_id: &str, day: &str, entity: &str) -> Vec<String> {
    let mut list = members.to_vec();
    crate::groups::shuffle_entities(&mut list, course_id, day, entity);
    list.truncate(n.max(1));
    list
}

/// True when the record exists and its `due` is at or before `now`.
pub fn is_due(rec: Option<&Value>, now: i64) -> bool {
    rec.and_then(|r| r.get("due")).and_then(num_i64).is_some_and(|due| due <= now)
}

/// True when there is no record (absent or JSON `null`).
pub fn is_new(rec: Option<&Value>) -> bool {
    rec.is_none_or(Value::is_null)
}

struct Candidate<'a> {
    id: &'a str,
    score: f64,
    bad: i64,
    last: f64,
}

fn candidate<'a>(id: &'a str, rec: &Value) -> Option<Candidate<'a>> {
    let rec = rec.is_object().then_some(rec)?;
    let bad = int_field(Some(rec), "bad");
    if bad <= 0 {
        return None;
    }
    let ok = int_field(Some(rec), "ok");
    let low_stage = rec.get("s").and_then(num_i64).is_some_and(|s| s < WEAK_STAGE_BELOW);
    let score = (bad as f64 + 1.0) / (ok as f64 + bad as f64 + 2.0) + if low_stage { WEAK_STAGE_BONUS } else { 0.0 };
    let last = rec.get("last").and_then(Value::as_f64).unwrap_or(0.0);
    Some(Candidate { id, score, bad, last })
}

/// Ids of records with wrong answers, weakest first (ties keep `items` order).
/// `valid_ids`, when an object `{id: truthy}`, restricts the result; `limit` defaults to 10.
pub fn weakest(items: &Value, limit: Option<usize>, valid_ids: Option<&Value>) -> Vec<String> {
    let Some(items) = items.as_object() else { return Vec::new() };
    let allowed = |id: &str| match valid_ids {
        Some(Value::Object(valid)) => valid.get(id).is_some_and(truthy),
        _ => true,
    };
    let mut list: Vec<Candidate> = items
        .iter()
        .filter(|(id, _)| allowed(id))
        .filter_map(|(id, rec)| candidate(id, rec))
        .collect();
    list.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then(b.bad.cmp(&a.bad))
            .then(b.last.total_cmp(&a.last))
    });
    list.into_iter()
        .take(limit.unwrap_or(DEFAULT_WEAKEST_LIMIT))
        .map(|c| c.id.to_string())
        .collect()
}

/// Due ids (only those listed in `order`, oldest `due` first) and up to `new_allowance` ids of `order` without a record.
pub fn build_queue(items: &Value, order: &[String], now: i64, new_allowance: i64) -> Queue {
    build_queue_with_caps(items, order, now, new_allowance, None, None)
}

/// Due ids (only those listed in `order`, oldest `due` first) and up to `new_allowance` ids of `order` without a record.
/// When `unit_new_caps` and `item_units` are provided, new items are also limited by their unit's cap (in addition to the global cap).
/// The global cap still applies overall.
pub fn build_queue_with_caps(
    items: &Value,
    order: &[String],
    now: i64,
    new_allowance: i64,
    unit_new_caps: Option<&HashMap<String, u32>>,
    item_units: Option<&HashMap<String, String>>,
) -> Queue {
    let empty = Map::new();
    let items = items.as_object().unwrap_or(&empty);

    let mut due: Vec<(&str, i64)> = items
        .iter()
        .filter(|(id, rec)| order.contains(id) && is_due(Some(rec), now))
        .map(|(id, rec)| (id.as_str(), int_field(Some(rec), "due")))
        .collect();
    due.sort_by_key(|&(_, due)| due);

    // Build a map of unit -> count of new items for that unit
    let mut unit_counts: HashMap<String, usize> = HashMap::new();
    let allowance = usize::try_from(new_allowance.max(0)).unwrap_or(usize::MAX);
    
    let fresh: Vec<String> = order
        .iter()
        .filter(|id| is_new(items.get(id.as_str())))
        .filter_map(|id| {
            // Check per-unit cap if provided
            if let Some(ref item_units_map) = item_units {
                if let Some(unit_id) = item_units_map.get(id.as_str()) {
                    if let Some(ref caps) = unit_new_caps {
                        if let Some(&cap) = caps.get(unit_id.as_str()) {
                            let cap_usize = cap as usize;
                            let current_count = unit_counts.entry(unit_id.clone()).or_insert(0);
                            if *current_count >= cap_usize {
                                return None;
                            }
                            *current_count += 1;
                        }
                    }
                }
            }
            Some(id.clone())
        })
        .take(allowance)
        .collect();

    Queue { due: due.into_iter().map(|(id, _)| id.to_string()).collect(), fresh }
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

#[cfg(test)]
mod unit_config_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_when_nothing_is_set() {
        let c = unit_config(&json!({"units": [{"id": "u1"}]}), "u1");
        assert_eq!(c["dropOnWrong"], COURSE_DEFAULT_DROP);
        assert!(c["newPerDay"].is_null());
        assert_eq!(c["newOrder"], "file");
        assert_eq!(c["ladder"], Value::from(DEFAULT_LADDER.to_vec()));
        assert_eq!(c["dropByType"], json!({}));
    }

    #[test]
    fn unit_srs_beats_course_srs_for_drop_and_ladder() {
        let course = json!({"units": [{"id": "u1", "srs": {"dropOnWrong": 3, "ladder": [0, 5]}}], "srs": {"dropOnWrong": 1, "ladder": [0, 9]}});
        let c = unit_config(&course, "u1");
        assert_eq!(c["dropOnWrong"], 3);
        assert_eq!(c["ladder"], json!([0, 5]));
    }

    #[test]
    fn course_srs_applies_when_unit_has_none() {
        let course = json!({"units": [{"id": "u1"}], "srs": {"dropOnWrong": 4, "ladder": [0, 9]}});
        let c = unit_config(&course, "u1");
        assert_eq!(c["dropOnWrong"], 4);
        assert_eq!(c["ladder"], json!([0, 9]));
    }

    #[test]
    fn srs_by_type_is_reported_per_type_and_not_folded_into_drop() {
        let course = json!({
            "units": [{"id": "u1"}, {"id": "u2", "srs": {"dropOnWrong": 5}}],
            "srs": {"dropOnWrong": 1},
            "srsByType": {"choice": {"dropOnWrong": 2}, "gap": {"ladder": [0, 7]}}
        });
        let c = unit_config(&course, "u1");
        assert_eq!(c["dropOnWrong"], 1);
        assert_eq!(c["dropByType"], json!({"choice": 2, "gap": 1}));
        assert_eq!(unit_config(&course, "u2")["dropByType"], json!({"choice": 5, "gap": 5}));
    }

    #[test]
    fn new_per_day_and_order_resolve_unit_then_course() {
        let course = json!({"units": [{"id": "a", "newPerDay": 3, "newOrder": "random"}, {"id": "b"}], "newOrder": "random"});
        assert_eq!(unit_config(&course, "a")["newPerDay"], 3);
        assert_eq!(unit_config(&course, "a")["newOrder"], "random");
        assert!(unit_config(&course, "b")["newPerDay"].is_null());
        assert_eq!(unit_config(&course, "b")["newOrder"], "random");
        let file_unit = json!({"units": [{"id": "a", "newOrder": "file"}], "newOrder": "random"});
        assert_eq!(unit_config(&file_unit, "a")["newOrder"], "file");
    }

    #[test]
    fn unknown_unit_gets_course_level_values() {
        let c = unit_config(&json!({"units": [], "srs": {"dropOnWrong": 2}}), "zz");
        assert_eq!(c["dropOnWrong"], 2);
        assert!(c["newPerDay"].is_null());
    }
}
