//! Characterization of the counter mismatch (audit/repro.md C2): an item-scoped group counts
//! an entity as due when ANY member is due, so answering one item leaves the group due while a
//! sibling is still due. Task 6 flips this to the unit view; update the expectations there.
use dojo_core::api;
use serde_json::{json, Map, Value};

const NOW: i64 = 1_760_000_000_000;
const D: i64 = 86_400_000;

fn rec(s: i64, due: i64) -> Value {
    json!({"s": s, "due": due, "ok": s, "bad": 0, "last": NOW - D})
}

/// Synthetic course: one group `g1` on unit `u1`, item-scoped SRS.
/// Entities E1={a1,a2,a3}, E2={b1,b2}, E3={c1}.
fn course() -> Value {
    json!({
        "srs": {"scope": "item"},
        "groups": [{"id": "g1", "title": "G", "units": ["u1"]}],
        "bars": [{"title": "B", "units": ["u1"]}],
        "units": [{"id": "u1"}]
    })
}

fn items() -> Value {
    json!([
        {"id": "a1", "unit": "u1", "entity": "E1"},
        {"id": "a2", "unit": "u1", "entity": "E1"},
        {"id": "a3", "unit": "u1", "entity": "E1"},
        {"id": "b1", "unit": "u1", "entity": "E2"},
        {"id": "b2", "unit": "u1", "entity": "E2"},
        {"id": "c1", "unit": "u1", "entity": "E3"}
    ])
}

/// `due_ids` are due now (due = NOW - D); every other record is due in the future.
fn records(due_ids: &[&str]) -> Map<String, Value> {
    let mut m = Map::new();
    for id in ["a1", "a2", "a3", "b1", "b2", "c1"] {
        let due = if due_ids.contains(&id) { NOW - D } else { NOW + D };
        m.insert(id.to_string(), rec(2, due));
    }
    m
}

fn session_due(records: &Map<String, Value>) -> usize {
    records.values().filter(|r| r["due"].as_i64().unwrap() <= NOW).count()
}

/// Calls `applyAnswer` for `id` (correct) through the core API, as the web does.
fn answer(records: &mut Map<String, Value>, id: &str) {
    let out: Value = serde_json::from_str(&api::call("applyAnswer", &json!({"rec": records[id], "correct": true, "now": NOW}).to_string())).unwrap();
    assert_eq!(out["ok"], true, "applyAnswer failed: {out}");
    records.insert(id.to_string(), out["value"].clone());
}

/// Group `g1` due count from the core `groupCounts` call.
fn group_due(records: &Map<String, Value>) -> i64 {
    let out: Value = serde_json::from_str(&api::call("groupCounts", &json!({"course": course(), "items": items(), "records": records, "now": NOW}).to_string())).unwrap();
    assert_eq!(out["ok"], true, "groupCounts failed: {out}");
    out["value"]["groups"]["g1"]["due"].as_i64().unwrap()
}

#[test]
fn counter_item_scope_group_due_stays_when_sibling_due() {
    // Scenario B: a1 and a2 both due. Answer a1 right; a2 stays due.
    let mut recs = records(&["a1", "a2"]);
    assert_eq!(group_due(&recs), 1);
    assert_eq!(session_due(&recs), 2);
    answer(&mut recs, "a1");
    assert_eq!(session_due(&recs), 1);
    // Today's behaviour (repro C2): the group any-member rule keeps the group due.
    assert_eq!(group_due(&recs), 1);
}

#[test]
fn counter_item_scope_group_due_drops_without_sibling() {
    // Scenario A: only a1 due. Answer a1 right; no sibling left due.
    let mut recs = records(&["a1"]);
    assert_eq!(group_due(&recs), 1);
    answer(&mut recs, "a1");
    assert_eq!(group_due(&recs), 0);
}
