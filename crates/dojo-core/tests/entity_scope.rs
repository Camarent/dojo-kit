//! Topic-level SRS (`srs.scope: "entity"`): behaviour that vectors do not cover.
use dojo_core::api;
use dojo_core::groups::{build_queue_scoped, group_counts_scoped, ItemMeta, Scope};
use dojo_core::progress::merge;
use dojo_core::srs::{apply_answer_drop, apply_entity, entity_view, pick_drill, EntityMode, DEFAULT_LADDER};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

const NOW: i64 = 1_760_000_000_000;
const D: i64 = 86_400_000;

fn rec(s: i64, ok: i64, bad: i64, last: i64) -> Value {
    json!({"s": s, "due": NOW - 1, "ok": ok, "bad": bad, "last": last})
}

fn doc(items: Value, t: i64) -> Value {
    json!({"v":1,"t":t,"resetAt":0,"items":items,"stats":{"days":{},"newByDay":{}},"settings":{"newPerDay":10,"placementDone":false,"t":0}})
}

fn obj(v: Value) -> Map<String, Value> {
    v.as_object().unwrap().clone()
}

fn grade(members: &[&str], records: &Map<String, Value>, mode: EntityMode, correct: bool, drop: i64) -> Map<String, Value> {
    apply_entity(members, records, mode, correct, NOW, &DEFAULT_LADDER, drop)
}

#[test]
fn merge_old_client_then_entity_grade_loses_nothing() {
    let base = json!({"a": rec(2, 2, 0, NOW - 3 * D), "b": rec(2, 2, 0, NOW - 3 * D), "c": rec(2, 2, 0, NOW - 3 * D)});
    // new client graded the entity (all three rewritten); old client answered only `a` later on another device
    let new_items = json!({"a": rec(3, 3, 0, NOW - D), "b": rec(3, 3, 0, NOW - D), "c": rec(3, 3, 0, NOW - D)});
    let old_items = json!({"a": rec(4, 4, 0, NOW - D / 2), "b": base["b"], "c": base["c"]});
    for (x, y) in [(doc(new_items.clone(), 2), doc(old_items.clone(), 3)), (doc(old_items, 3), doc(new_items, 2))] {
        let merged = merge(&x, &y).unwrap();
        let items = obj(merged["items"].clone());
        for id in ["a", "b", "c"] {
            assert!(items.contains_key(id), "{id} lost");
        }
        assert_eq!(items["a"]["s"], 4, "later per-id record wins");
        let next = grade(&["a", "b", "c"], &items, EntityMode::Answer, true, 1);
        let first = next["a"].clone();
        assert!(next.values().all(|r| *r == first), "members identical: {next:?}");
        assert_eq!(first["s"], 4, "min view s=3 plus one");
        assert_eq!(first["ok"], 5, "ok = max over members (4) + 1");
    }
}

#[test]
fn merge_items_unchanged_for_scoped_docs() {
    let x = doc(json!({"a": rec(2, 2, 0, NOW - D), "b": rec(2, 2, 0, NOW - D)}), 1);
    let y = doc(json!({"a": rec(3, 3, 0, NOW), "c": rec(1, 1, 0, NOW)}), 2);
    let m = merge(&x, &y).unwrap();
    assert_eq!(m["items"]["a"]["s"], 3);
    assert_eq!(m["items"]["b"]["s"], 2);
    assert_eq!(m["items"]["c"]["s"], 1);
}

#[test]
fn sibling_drift_self_heals() {
    let records = obj(json!({"a": rec(5, 6, 0, NOW - D), "b": rec(2, 2, 0, NOW - 2 * D), "c": rec(3, 3, 0, NOW - 2 * D)}));
    let next = grade(&["a", "b", "c"], &records, EntityMode::Answer, true, 1);
    let want = apply_answer_drop(entity_view(&["a", "b", "c"], &records).as_ref(), true, NOW, &DEFAULT_LADDER, 1);
    for id in ["a", "b", "c"] {
        assert_eq!(next[id]["s"], 3);
        assert_eq!(next[id], want);
    }
}

#[test]
fn wrong_drop_applied_once() {
    let records = obj(json!({"a": rec(3, 3, 1, NOW - D), "b": rec(3, 3, 1, NOW - D), "c": rec(3, 3, 1, NOW - D)}));
    let next = grade(&["a", "b", "c"], &records, EntityMode::Answer, false, 1);
    assert!(next.values().all(|r| r["s"] == 2 && r["bad"] == 2), "{next:?}");
    // second wrong in the same session goes through relearn: no further drop, no write at s>0
    assert!(grade(&["a", "b", "c"], &next, EntityMode::Relearn, false, 1).is_empty());
}

#[test]
fn retired_member_untouched() {
    let records = obj(json!({"a": rec(2, 2, 0, NOW - D), "b": rec(2, 2, 0, NOW - D), "r": rec(0, 0, 0, NOW - 9 * D)}));
    let next = grade(&["a", "b"], &records, EntityMode::Answer, true, 1);
    assert!(!next.contains_key("r"));
    assert_eq!(entity_view(&["a", "b"], &records).unwrap()["s"], 2);
    // through the WASM ABI the retired filter is applied by the core itself
    let out = api::call(
        "applyEntity",
        &json!({"members":[{"id":"a"},{"id":"b"},{"id":"r","status":"retired"}],"records":records,"mode":"answer","correct":true,"now":NOW}).to_string(),
    );
    let out: Value = serde_json::from_str(&out).unwrap();
    assert!(out["value"].get("r").is_none() && out["value"].get("a").is_some());
    assert_eq!(out["value"]["a"]["s"], 3, "retired low-s member must not drag the view down");
    let view: Value = serde_json::from_str(&api::call(
        "entityView",
        &json!({"members":[{"id":"a"},{"id":"b"},{"id":"r","status":"retired"}],"records":records}).to_string(),
    ))
    .unwrap();
    assert_eq!(view["value"]["s"], 2);
}

#[test]
fn course_without_scope_is_unchanged() {
    let items = json!({"a": rec(1, 1, 0, NOW - D)});
    let order: Vec<String> = ["a", "b"].iter().map(|s| s.to_string()).collect();
    let used = HashMap::new();
    let (q, drills) = build_queue_scoped(&items, &order, NOW, 5, None, None, None, None, None, None, &used, "d", "c", None);
    assert_eq!((q.due, q.fresh), (vec!["a".to_string()], vec!["b".to_string()]));
    assert!(drills.is_empty());
    let out: Value = serde_json::from_str(&api::call("buildQueue", &json!({"items":items,"order":order,"now":NOW,"newAllowance":5}).to_string())).unwrap();
    assert!(out["value"].get("drills").is_none());
}

#[test]
fn pick_drill_is_seeded_and_clamped() {
    let m: Vec<String> = ["a", "b", "c", "d"].iter().map(|s| s.to_string()).collect();
    assert_eq!(pick_drill(&m, 2, "c", "d", "e"), pick_drill(&m, 2, "c", "d", "e"));
    assert_eq!(pick_drill(&m, 0, "c", "d", "e").len(), 1);
    assert_eq!(pick_drill(&m, 9, "c", "d", "e").len(), 4);
}

#[test]
fn scoped_counts_inherit_for_new_member() {
    let meta = |id: &str| ItemMeta { id: id.into(), unit: "u".into(), entity: "e".into(), tags: vec![], retired: false };
    let metas = [meta("a"), meta("b"), meta("c")];
    let records = obj(json!({"a": {"s":4,"due":NOW+D,"ok":4,"bad":0,"last":NOW}, "b": {"s":4,"due":NOW+D,"ok":4,"bad":0,"last":NOW}}));
    let course = json!({"groups":[{"id":"g","title":"G","units":["u"]}],"bars":[{"title":"B","units":["u"]}]});
    let scoped: HashSet<String> = ["e".to_string()].into();
    let plain = group_counts_scoped(&course, &metas, &records, NOW, &HashMap::new(), 0, None);
    assert_eq!(plain.bars[0].learned, 0, "unscoped: the new member un-learns the bar");
    let r = group_counts_scoped(&course, &metas, &records, NOW, &HashMap::new(), 0, Some(&scoped));
    assert_eq!(r.bars[0].learned, 1);
    assert_eq!((r.groups["g"].fresh, r.groups["g"].started, r.groups["g"].total), (0, 1, 1));
    let out: Value = serde_json::from_str(&api::call(
        "entityStates",
        &json!({"items":[{"id":"a","entity":"e"},{"id":"b","entity":"e"},{"id":"c","entity":"e"}],"records":records,"now":NOW,"scopedEntities":["e"]}).to_string(),
    ))
    .unwrap();
    assert_eq!((out["value"][0]["started"].as_i64(), out["value"][0]["atLearned"].as_i64()), (Some(3), Some(3)));
}

#[test]
fn scoped_queue_started_entity_new_member_neither_fresh_nor_due() {
    let members: HashMap<String, Vec<String>> = HashMap::from([("e".to_string(), vec!["a".into(), "b".into()])]);
    let drill = HashMap::new();
    let scope = Scope { members: &members, drill: &drill };
    let items = json!({"a": {"s":2,"due":NOW+D,"ok":2,"bad":0,"last":NOW}});
    let order: Vec<String> = vec!["a".into(), "b".into()];
    let (q, d) = build_queue_scoped(&items, &order, NOW, 5, None, None, None, None, None, None, &HashMap::new(), "d", "c", Some(&scope));
    assert!(q.due.is_empty() && q.fresh.is_empty() && d.is_empty(), "{q:?}");
}

#[test]
fn drill_only_picks_members_present_in_order() {
    let members: HashMap<String, Vec<String>> = HashMap::from([("e".to_string(), vec!["a".into(), "b".into(), "c".into()])]);
    let drill = HashMap::from([("e".to_string(), 3u32)]);
    let scope = Scope { members: &members, drill: &drill };
    let order: Vec<String> = vec!["a".into(), "b".into()];
    for day in ["d1", "d2", "d3", "d4"] {
        let (q, _) = build_queue_scoped(&json!({}), &order, NOW, 5, None, None, None, None, None, None, &HashMap::new(), day, "c", Some(&scope));
        assert!(q.fresh.iter().all(|id| id != "c") && !q.fresh.is_empty(), "{q:?}");
    }
}

#[test]
fn invalid_unit_drill_falls_back_to_course_value() {
    let course = json!({"srs": {"scope": "entity", "drill": 3}, "units": [{"id": "u", "srs": {"drill": 9}}]});
    assert_eq!(dojo_core::srs::unit_config(&course, "u")["drill"], 3);
}
