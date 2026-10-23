use super::DEFAULT_LADDER;
use super::COURSE_DEFAULT_DROP;
use crate::progress::num_i64;
use serde_json::{Map, Value};

pub(super) fn max_stage(ladder: &[i64]) -> i64 {
    i64::try_from(ladder.len().saturating_sub(1)).unwrap_or(i64::MAX)
}

pub(super) fn interval(ladder: &[i64], stage: i64) -> i64 {
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
