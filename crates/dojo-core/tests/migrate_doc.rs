use dojo_core::api::call;
use dojo_core::migrate::{Member, migrate_doc, unmigrate};
use dojo_core::progress::merge;
use dojo_core::supersedes::Links;
use serde_json::{Value, json};

const H: i64 = 3_600_000;
const D: i64 = 24 * H;

fn course(unify: bool) -> Value {
    json!({
        "id": "c",
        "units": [{"id": "u1"}, {"id": "u2"}],
        "srs": {"migrate": {"id": "m1", "ladderFrom": {"u1": [0, 2 * H, 4 * H, 8 * H, D, 2 * D, 3 * D, 4 * D, 7 * D, 14 * D, 30 * D]}, "unify": unify}}
    })
}

fn members() -> Vec<Member> {
    let m = |id: &str, unit: &str, key: &str| Member { id: id.into(), unit: unit.into(), key: key.into() };
    vec![m("a", "u1", "k1"), m("b", "u1", "k1"), m("c", "u1", "k1"), m("x", "u2", "k2")]
}

fn doc(items: Value) -> Value {
    json!({"v": 1, "course": "c", "t": 5, "resetAt": 0, "items": items})
}

fn rec(s: i64, due: i64) -> Value {
    json!({"s": s, "due": due, "ok": s, "bad": 0, "last": due - 10})
}

fn run(d: &Value, c: &Value, links: &Links) -> Option<Value> {
    migrate_doc(d, c, links, &members(), 777).unwrap().doc
}

fn stage(d: &Value, id: &str) -> i64 {
    d["items"][id]["s"].as_i64().unwrap()
}

#[test]
fn remap_table_and_interval_zero() {
    let items: serde_json::Map<String, Value> = (0..=10).map(|s| (format!("i{s}"), rec(s, 5000))).collect();
    let ms: Vec<Member> = (0..=10).map(|s| Member { id: format!("i{s}"), unit: "u1".into(), key: format!("k{s}") }).collect();
    let out = migrate_doc(&doc(Value::Object(items)), &course(false), &vec![], &ms, 1).unwrap().doc.unwrap();
    let got: Vec<i64> = (0..=10).map(|s| stage(&out, &format!("i{s}"))).collect();
    assert_eq!(got, [0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 4]);
    for s in 0..=10 {
        let r = &out["items"][format!("i{s}")];
        assert_eq!(r["due"], 5000);
        assert_eq!(r["s0"], s);
        assert!(r.get("wk").is_none());
    }
}

#[test]
fn unify_takes_best_and_latest_and_skips_unrecorded() {
    let d = doc(json!({"a": rec(1, 4000), "b": rec(6, 3000)}));
    let out = run(&d, &course(true), &vec![]).unwrap();
    assert_eq!(stage(&out, "a"), 2);
    assert_eq!(stage(&out, "b"), 2);
    assert_eq!(out["items"]["a"]["due"], 4000);
    assert_eq!(out["items"]["b"]["due"], 4000);
    assert_eq!(out["items"]["b"]["ok"], 6);
    // Remap runs first: `s0` is the original stage, not the unified one.
    assert_eq!((out["items"]["a"]["s0"].as_i64(), out["items"]["b"]["s0"].as_i64()), (Some(1), Some(6)));
    assert!(out["items"].get("c").is_none());
}

#[test]
fn fold_runs_before_remap_once() {
    let links: Links = vec![("a".into(), vec!["old".into()])];
    let d = doc(json!({"old": rec(6, 3000)}));
    let out = run(&d, &course(false), &links).unwrap();
    assert_eq!(stage(&out, "a"), 2);
    assert_eq!(out["items"]["a"]["s0"], 6);
}

#[test]
fn second_run_is_noop_and_marker_written() {
    let d = doc(json!({"a": rec(3, 3000)}));
    let out = run(&d, &course(true), &vec![]).unwrap();
    assert_eq!(out["migrated"], json!({"m1": 777}));
    assert!(run(&out, &course(true), &vec![]).is_none());
}

#[test]
fn unmigrate_round_trip() {
    let d = doc(json!({"a": rec(3, 3000), "b": rec(8, 4000), "x": rec(2, 10)}));
    let out = run(&d, &course(true), &vec![]).unwrap();
    assert_eq!(unmigrate(&out, "m1"), sanitized(&d));
}

fn sanitized(d: &Value) -> Value {
    dojo_core::progress::sanitize(d).unwrap()
}

#[test]
fn no_declaration_or_sparse_doc_does_not_crash() {
    let d = doc(json!({"a": {"s": 1}, "b": "junk"}));
    assert!(run(&d, &json!({"id": "c", "units": []}), &vec![]).is_none());
    let out = run(&d, &course(true), &vec![]).unwrap();
    assert_eq!(out["items"]["a"], json!({"s": 1}));
    assert!(migrate_doc(&json!({"v": 2}), &course(true), &vec![], &[], 1).is_err());
}

#[test]
fn import_migrates_before_merge() {
    let mine = doc(json!({"a": rec(3, 3000)}));
    let theirs = doc(json!({"a": rec(9, 9000)}));
    let c = course(false);
    let mig = run(&mine, &c, &vec![]).unwrap();
    // Merging the raw export would let the unmigrated stage 9 win; migrate it first.
    let theirs_m = run(&theirs, &c, &vec![]).unwrap();
    let merged = merge(&mig, &theirs_m).unwrap();
    assert_eq!(merged["migrated"], json!({"m1": 777}));
    assert_eq!(stage(&merged, "a"), 3);
    let again = merge(&mig, &theirs).unwrap();
    assert_eq!(again["migrated"], json!({"m1": 777}));
}

#[test]
fn merge_keeps_smallest_marker() {
    let mut a = doc(json!({}));
    a["migrated"] = json!({"m1": 50});
    let mut b = doc(json!({}));
    b["migrated"] = json!({"m1": 20, "m2": 9});
    assert_eq!(merge(&a, &b).unwrap()["migrated"], json!({"m1": 20, "m2": 9}));
}

#[test]
fn api_migrate_doc_and_unmigrate() {
    let d = doc(json!({"a": rec(6, 3000)}));
    let args = json!({"doc": d, "course": course(false), "items": [], "members": [{"id": "a", "unit": "u1"}], "now": 5});
    let out: Value = serde_json::from_str(&call("migrateDoc", &args.to_string())).unwrap();
    assert_eq!(out["ok"], json!(true));
    assert_eq!(out["value"]["doc"]["items"]["a"]["s"], 2);
    let back: Value = serde_json::from_str(&call("unmigrate", &json!({"doc": out["value"]["doc"], "id": "m1"}).to_string())).unwrap();
    assert_eq!(back["value"], sanitized(&d));
}

/// Course with migration id `id`, optional `undo` id and optional `keepLearned` map; learned stage 4.
fn course_v2(id: &str, undo: Option<&str>, keep: Option<Value>) -> Value {
    let mut mig = json!({"id": id, "ladderFrom": {"u1": [0, 2 * H, 4 * H, 8 * H, D, 2 * D, 3 * D, 4 * D, 7 * D, 14 * D, 30 * D]}});
    if let Some(u) = undo {
        mig["undo"] = json!(u);
    }
    if let Some(k) = keep {
        mig["keepLearned"] = k;
    }
    json!({"id": "c", "learnedStage": 4, "units": [{"id": "u1"}, {"id": "u2"}], "srs": {"migrate": mig}})
}

fn stage_members() -> Vec<Member> {
    (0..=10).map(|s| Member { id: format!("i{s}"), unit: "u1".into(), key: format!("k{s}") }).collect()
}

fn all_stages_doc() -> Value {
    let items: serde_json::Map<String, Value> = (0..=10).map(|s| (format!("i{s}"), rec(s, 5000))).collect();
    doc(Value::Object(items))
}

#[test]
fn keep_learned_lifts_items_at_or_above_min_old_stage() {
    let c = course_v2("n5-units-2", None, Some(json!({"u1": 5})));
    let out = migrate_doc(&all_stages_doc(), &c, &vec![], &stage_members(), 1).unwrap().doc.unwrap();
    let got: Vec<i64> = (0..=10).map(|s| stage(&out, &format!("i{s}"))).collect();
    // Old stages 0..=4 keep the remap table; 5..=10 remap to 1,2,2,2,3,4 and are lifted to learned stage 4.
    assert_eq!(got, [0, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4]);
    assert_eq!(out["items"]["i7"]["s0"], 7);
}

#[test]
fn undo_reverses_prior_marker_then_migrates_once() {
    let d = doc(json!({"a": rec(6, 3000), "b": rec(3, 3000)}));
    let c1 = course_v2("n5-units-1", None, None);
    let c2 = course_v2("n5-units-2", Some("n5-units-1"), Some(json!({"u1": 5})));
    let prev = migrate_doc(&d, &c1, &vec![], &members(), 1).unwrap().doc.unwrap();
    assert_eq!(prev["migrated"], json!({"n5-units-1": 1}));
    let fresh = migrate_doc(&d, &c2, &vec![], &members(), 2).unwrap().doc.unwrap();
    let via = migrate_doc(&prev, &c2, &vec![], &members(), 2).unwrap().doc.unwrap();
    assert_eq!(via, fresh);
    assert_eq!(via["migrated"], json!({"n5-units-2": 2}));
    assert_eq!(via["items"]["a"]["s0"], 6);
    assert!(migrate_doc(&via, &c2, &vec![], &members(), 3).unwrap().doc.is_none());
}
