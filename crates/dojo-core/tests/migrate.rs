use dojo_core::api::call;
use dojo_core::migrate::{MigrateError, migrate_progress};
use dojo_core::progress::{merge, stable_json};
use dojo_core::supersedes::{LinkItem, Links, links_from};
use serde_json::{Value, json};

fn rec(s: i64, last: i64) -> Value {
    json!({"s": s, "due": last + 100, "ok": s, "bad": 0, "last": last})
}

fn doc(reset: i64, items: Value) -> Value {
    json!({"v": 1, "course": "c", "t": 5, "resetAt": reset, "items": items})
}

fn links(pairs: &[(&str, &[&str])]) -> Links {
    let mut l: Links = pairs.iter().map(|(s, p)| (s.to_string(), p.iter().map(|x| x.to_string()).collect())).collect();
    l.sort();
    l
}

fn run(d: &Value, l: &Links) -> (Option<Value>, Vec<String>, Vec<String>) {
    let m = migrate_progress(d, l).unwrap();
    (m.doc, m.folded, m.skipped)
}

fn item_of(d: &Value, id: &str) -> Value {
    d["items"][id].clone()
}

#[test]
fn pair_pred_only_creates_fold() {
    let d = doc(0, json!({"o-1": rec(2, 10), "o-2": rec(2, 20)}));
    let (out, folded, _) = run(&d, &links(&[("n-1", &["o-1", "o-2"])]));
    assert_eq!(folded, ["n-1"]);
    assert_eq!(item_of(&out.unwrap(), "n-1"), json!({"s": 2, "due": 110, "ok": 2, "bad": 0, "last": 20}));
}

#[test]
fn single_pred_pred_only() {
    let d = doc(0, json!({"o-1": rec(3, 10)}));
    let (out, folded, _) = run(&d, &links(&[("n-1", &["o-1"])]));
    assert_eq!(folded, ["n-1"]);
    assert_eq!(item_of(&out.unwrap(), "n-1"), rec(3, 10));
}

#[test]
fn successor_newer_is_untouched_whatever_stage() {
    for (ss, ps) in [(4, 1), (1, 4)] {
        let d = doc(0, json!({"o-1": rec(ps, 10), "o-2": rec(ps, 12), "n-1": rec(ss, 50)}));
        let (out, folded, _) = run(&d, &links(&[("n-1", &["o-1", "o-2"])]));
        assert!(out.is_none() && folded.is_empty(), "s={ss} pred s={ps}");
    }
}

#[test]
fn old_client_evidence_refolds_with_min() {
    let d = doc(0, json!({"o-1": rec(1, 60), "o-2": rec(5, 10), "n-1": rec(3, 50)}));
    let (out, folded, _) = run(&d, &links(&[("n-1", &["o-1", "o-2"])]));
    assert_eq!(folded, ["n-1"]);
    let r = item_of(&out.unwrap(), "n-1");
    assert_eq!((r["s"].clone(), r["last"].clone(), r["ok"].clone()), (json!(1), json!(60), json!(5)));
}

#[test]
fn different_pred_stages_take_min() {
    let d = doc(0, json!({"o-1": rec(4, 10), "o-2": rec(2, 11)}));
    let out = run(&d, &links(&[("n-1", &["o-1", "o-2"])])).0.unwrap();
    assert_eq!(item_of(&out, "n-1")["s"], json!(2));
}

#[test]
fn partial_pair_uses_present_pred() {
    let d = doc(0, json!({"o-2": rec(4, 11)}));
    let out = run(&d, &links(&[("n-1", &["o-1", "o-2"])])).0.unwrap();
    assert_eq!(item_of(&out, "n-1"), rec(4, 11));
}

#[test]
fn reset_at_filters_old_preds() {
    let d = doc(100, json!({"o-1": rec(2, 50), "o-2": rec(4, 150)}));
    let out = run(&d, &links(&[("n-1", &["o-1", "o-2"])])).0.unwrap();
    assert_eq!(item_of(&out, "n-1"), rec(4, 150));
    let d = doc(100, json!({"o-1": rec(2, 50)}));
    assert!(run(&d, &links(&[("n-1", &["o-1"])])).0.is_none());
}

#[test]
fn invalid_successor_is_skipped_and_kept() {
    let d = doc(0, json!({"o-1": rec(2, 10), "n-1": {"s": "x"}}));
    let (out, folded, skipped) = run(&d, &links(&[("n-1", &["o-1"])]));
    assert!(out.is_none() && folded.is_empty());
    assert_eq!(skipped, ["n-1"]);
}

#[test]
fn extra_fields_follow_latest_then_successor_then_lowest_pred() {
    let mut a = rec(2, 10);
    a["note"] = json!("a");
    let mut b = rec(2, 20);
    b["note"] = json!("b");
    let out = run(&doc(0, json!({"o-1": a.clone(), "o-2": b.clone()})), &links(&[("n-1", &["o-1", "o-2"])])).0.unwrap();
    assert_eq!(item_of(&out, "n-1")["note"], json!("b"));
    let mut c = rec(2, 20);
    c["note"] = json!("c");
    let out = run(&doc(0, json!({"o-1": a, "o-2": b.clone(), "o-3": c})), &links(&[("n-1", &["o-3", "o-2", "o-1"])])).0.unwrap();
    assert_eq!(item_of(&out, "n-1")["note"], json!("b"));
    let mut s = rec(2, 20);
    s["note"] = json!("s");
    let mut older = rec(2, 5);
    older["note"] = json!("o");
    let d = doc(0, json!({"o-1": older, "o-2": b, "n-1": s}));
    assert!(run(&d, &links(&[("n-1", &["o-1", "o-2"])])).0.is_none());
}

#[test]
fn successor_wins_last_tie_inside_fold() {
    let mut s = rec(3, 20);
    s["note"] = json!("s");
    let mut p = rec(3, 20);
    p["note"] = json!("p");
    let mut q = rec(1, 30);
    q["note"] = json!("q");
    let d = doc(0, json!({"o-1": p, "o-2": q.clone(), "n-1": s}));
    let out = run(&d, &links(&[("n-1", &["o-1", "o-2"])])).0.unwrap();
    assert_eq!(item_of(&out, "n-1")["note"], json!("q"));
}

#[test]
fn unrelated_and_retired_records_unchanged() {
    let d = doc(0, json!({"o-1": rec(2, 10), "x-1": rec(1, 3), "bad": 7}));
    let out = run(&d, &links(&[("n-1", &["o-1"])])).0.unwrap();
    for id in ["o-1", "x-1", "bad"] {
        assert_eq!(item_of(&out, id), d["items"][id]);
    }
}

#[test]
fn second_run_is_noop() {
    let l = links(&[("n-1", &["o-1", "o-2"])]);
    let d = doc(0, json!({"o-1": rec(2, 10), "o-2": rec(2, 20)}));
    let first = run(&d, &l).0.unwrap();
    let before = stable_json(&first);
    let (out, folded, _) = run(&first, &l);
    assert!(out.is_none() && folded.is_empty());
    assert_eq!(stable_json(&first), before);
}

#[test]
fn answer_after_fold_stays_noop() {
    let l = links(&[("n-1", &["o-1"])]);
    let mut first = run(&doc(0, json!({"o-1": rec(2, 10)})), &l).0.unwrap();
    first["items"]["n-1"] = rec(3, 99);
    assert!(run(&first, &l).0.is_none());
}

#[test]
fn convergence_after_merge() {
    let l = links(&[("n-1", &["o-1", "o-2"])]);
    let base = doc(0, json!({"o-1": rec(2, 10), "o-2": rec(2, 20)}));
    let a = run(&base, &l).0.unwrap();
    let b = doc(0, json!({"o-1": rec(1, 70), "o-2": rec(2, 20)}));
    let step = |x: &Value, y: &Value| {
        let m = merge(x, y).unwrap();
        run(&m, &l).0.unwrap_or(m)
    };
    let ab = step(&a, &b);
    let ba = step(&b, &a);
    assert_eq!(stable_json(&ab["items"]), stable_json(&ba["items"]));
    assert!(run(&ab, &l).0.is_none());
    assert_eq!(item_of(&ab, "n-1")["s"], json!(1));
}

#[test]
fn non_document_refused() {
    assert_eq!(migrate_progress(&json!([1]), &Links::new()).unwrap_err(), MigrateError::InvalidDocument);
}

fn li(id: &str, retired: bool, sup: Option<&[&str]>) -> LinkItem {
    LinkItem { id: id.into(), retired, supersedes: sup.map(|s| s.iter().map(|x| x.to_string()).collect()) }
}

#[test]
fn links_refusals() {
    let ok = [li("o-1", true, None), li("n-1", false, Some(&["o-1"]))];
    assert!(links_from(&ok).is_ok());
    let cases: Vec<(&str, Vec<LinkItem>)> = vec![
        ("pred missing", vec![li("n-1", false, Some(&["o-1"]))]),
        ("pred live", vec![li("o-1", false, None), li("n-1", false, Some(&["o-1"]))]),
        ("two lists", vec![li("o-1", true, None), li("n-1", false, Some(&["o-1"])), li("n-2", false, Some(&["o-1"]))]),
        ("self", vec![li("n-1", false, Some(&["n-1"]))]),
        ("on retired", vec![li("o-1", true, None), li("o-2", true, Some(&["o-1"]))]),
        ("empty", vec![li("n-1", false, Some(&[]))]),
        ("duplicate", vec![li("o-1", true, None), li("n-1", false, Some(&["o-1", "o-1"]))]),
    ];
    for (name, items) in cases {
        assert!(links_from(&items).is_err(), "{name}");
    }
}

#[test]
fn api_migrate_progress() {
    let items = json!([{"id": "o-1", "status": "retired"}, {"id": "n-1", "supersedes": ["o-1"]}, {"id": "z"}]);
    let d = doc(0, json!({"o-1": rec(2, 10)}));
    let out: Value = serde_json::from_str(&call("migrateProgress", &json!({"doc": d, "items": items}).to_string())).unwrap();
    assert_eq!(out["ok"], json!(true));
    assert_eq!(out["value"]["folded"], json!(["n-1"]));
    assert_eq!(out["value"]["doc"]["items"]["n-1"], rec(2, 10));
    let again = out["value"]["doc"].clone();
    let out: Value = serde_json::from_str(&call("migrateProgress", &json!({"doc": again, "items": items}).to_string())).unwrap();
    assert!(out["value"].get("doc").is_none());
    let bad = json!([{"id": "n-1", "supersedes": ["o-1"]}]);
    let out: Value = serde_json::from_str(&call("migrateProgress", &json!({"doc": d, "items": bad}).to_string())).unwrap();
    assert_eq!(out["value"]["error"], json!("bad_links"));
    let out: Value = serde_json::from_str(&call("migrateProgress", &json!({"doc": 1, "items": items}).to_string())).unwrap();
    assert_eq!(out["value"]["error"], json!("invalid_document"));
}
