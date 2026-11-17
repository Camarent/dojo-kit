//! Group counts under `srs.scope: "unit"`: a unit (`<entity>|<aspect>`) counts once, judged on the unit view.
use dojo_core::api;
use serde_json::{json, Map, Value};

const NOW: i64 = 1_760_000_000_000;
const D: i64 = 86_400_000;

fn rec(due: i64) -> Value {
    json!({"s": 2, "due": due, "ok": 2, "bad": 0, "last": NOW - D})
}

/// Units: E1|meaning {a1,a2}, E1|reading {a3}, E2|meaning {b1}, E2|reading {b2}, E3|meaning {c1}.
fn course() -> Value {
    json!({
        "srs": {"scope": "item"},
        "units": [{"id": "u1", "srs": {"scope": "unit"}}],
        "topics": {"aspects": [
            {"id": "meaning", "tags": ["meaning"]},
            {"id": "reading", "tags": ["reading"]}
        ]},
        "groups": [{"id": "g1", "title": "G", "units": ["u1"]}],
        "bars": [{"title": "B", "units": ["u1"]}]
    })
}

fn items() -> Value {
    json!([
        {"id": "a1", "unit": "u1", "entity": "E1", "tags": ["meaning"]},
        {"id": "a2", "unit": "u1", "entity": "E1", "tags": ["meaning"]},
        {"id": "a3", "unit": "u1", "entity": "E1", "tags": ["reading"]},
        {"id": "b1", "unit": "u1", "entity": "E2", "tags": ["meaning"]},
        {"id": "b2", "unit": "u1", "entity": "E2", "tags": ["reading"]},
        {"id": "c1", "unit": "u1", "entity": "E3", "tags": ["meaning"]}
    ])
}

/// Every item recorded and due in the future, except `due_now` (due = NOW - D).
fn records(due_now: &[&str], unrecorded: &[&str]) -> Map<String, Value> {
    let mut m = Map::new();
    for id in ["a1", "a2", "a3", "b1", "b2", "c1"] {
        if unrecorded.contains(&id) {
            continue;
        }
        let due = if due_now.contains(&id) { NOW - D } else { NOW + D };
        m.insert(id.to_string(), rec(due));
    }
    m
}

fn group_counts(records: &Map<String, Value>) -> Value {
    let out: Value = serde_json::from_str(&api::call("groupCounts", &json!({"course": course(), "items": items(), "records": records, "now": NOW}).to_string())).unwrap();
    assert_eq!(out["ok"], true, "groupCounts failed: {out}");
    out["value"]["groups"]["g1"].clone()
}

/// Grades one unit (all `members`) as a correct answer, as the web does for unit scope.
fn answer_unit(records: &mut Map<String, Value>, members: &[&str]) {
    let ids: Vec<Value> = members.iter().map(|id| json!({"id": id})).collect();
    let out: Value = serde_json::from_str(&api::call("applyEntity", &json!({"members": ids, "records": records, "mode": "answer", "correct": true, "now": NOW}).to_string())).unwrap();
    assert_eq!(out["ok"], true, "applyEntity failed: {out}");
    for (id, r) in out["value"].as_object().unwrap() {
        records.insert(id.clone(), r.clone());
    }
}

#[test]
fn unit_scope_counts_units_due_fresh_started_total() {
    // Due units: E1|meaning (a1,a2) and E3|meaning (c1). All five units are recorded.
    let recs = records(&["a1", "a2", "c1"], &[]);
    let g = group_counts(&recs);
    assert_eq!((g["due"].as_i64(), g["fresh"].as_i64(), g["started"].as_i64(), g["total"].as_i64()), (Some(2), Some(0), Some(5), Some(5)));
    // E2 has no record: its two units (b1, b2) are fresh.
    let recs = records(&["a1", "a2", "c1"], &["b1", "b2"]);
    let g = group_counts(&recs);
    assert_eq!((g["due"].as_i64(), g["fresh"].as_i64(), g["started"].as_i64(), g["total"].as_i64()), (Some(2), Some(2), Some(3), Some(5)));
    assert_eq!(g["newToday"].as_i64(), Some(2));
}

#[test]
fn unit_scope_one_answer_drops_group_due_by_one_unit() {
    let mut recs = records(&["a1", "a2", "c1"], &[]);
    assert_eq!(group_counts(&recs)["due"].as_i64(), Some(2));
    answer_unit(&mut recs, &["a1", "a2"]);
    assert_eq!(group_counts(&recs)["due"].as_i64(), Some(1));
    answer_unit(&mut recs, &["c1"]);
    assert_eq!(group_counts(&recs)["due"].as_i64(), Some(0));
}
