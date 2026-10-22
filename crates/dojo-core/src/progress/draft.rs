use serde_json::Value;
use std::cmp::Ordering;

use super::{coerce_f64, json_number, utf16_cmp};

/// `examDraft` is valid when it is an object with a string `sid` and a numeric `updatedAt`.
pub(super) fn is_valid_draft(d: &Value) -> bool {
    d.as_object()
        .is_some_and(|o| o.get("sid").is_some_and(Value::is_string) && o.get("updatedAt").is_some_and(Value::is_number))
}

pub(super) fn is_closed_draft(d: &Value) -> bool {
    d.as_object().is_some_and(|o| o.get("closed").is_some_and(Value::is_string))
}

pub(super) fn draft_sid(d: &Value) -> &str {
    d.get("sid").and_then(Value::as_str).unwrap_or("")
}

pub(super) fn draft_updated_at(d: &Value) -> f64 {
    d.get("updatedAt").map_or(0.0, coerce_f64)
}

pub(super) fn draft_answer_count(d: &Value) -> usize {
    d.get("answers").and_then(Value::as_array).map_or(0, Vec::len)
}

/// Bounds a closedSids list to `CLOSED_SIDS_BOUND` valid entries, keeping the largest `updatedAt` (ties: larger sid).
pub(super) fn bound_closed_sids(list: &[Value]) -> Vec<Value> {
    if list.len() <= CLOSED_SIDS_BOUND {
        return list.to_vec();
    }
    let mut entries: Vec<(&Value, f64)> = list.iter().filter_map(|e| {
        is_valid_draft(e).then(|| (e, draft_updated_at(e)))
    }).collect();
    entries.sort_by(|a, b| {
        b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal).then_with(|| draft_sid(b.0).cmp(draft_sid(a.0)))
    });
    entries.truncate(CLOSED_SIDS_BOUND);
    entries.into_iter().map(|(v, _)| v.clone()).collect()
}

/// Maximum number of closed-sid entries kept in `examDraft.closedSids`.
pub(crate) const CLOSED_SIDS_MAX: usize = 32;
/// Reason used for tombstones synthesised from `closedSids`; ranks below every other reason.
pub(crate) const SYNTHETIC_REASON: &str = "expired";
/// Bound for input closedSids lists before merging: 4 * CLOSED_SIDS_MAX.
pub(crate) const CLOSED_SIDS_BOUND: usize = 4 * CLOSED_SIDS_MAX;

pub(super) fn closed_reason(d: &Value) -> &str {
    d.get("closed").and_then(Value::as_str).unwrap_or("")
}

pub(super) fn tombstone(sid: &str, updated_at: f64, reason: &str) -> Value {
    serde_json::json!({"sid": sid, "updatedAt": json_number(updated_at), "closed": reason})
}

/// `examDraft` without its `closedSids` bookkeeping, for comparing payloads.
pub(super) fn draft_payload_json(d: &Value) -> String {
    let mut d = d.clone();
    if let Some(o) = d.as_object_mut() {
        o.remove("closedSids");
    }
    super::stable_json(&d)
}

/// Total order on candidate drafts (the greatest becomes the slot): `updatedAt`, then `sid` (UTF-16), then closed
/// over open, then for closed the reason (`expired` lowest, then UTF-16), for open more `answers` then stable JSON.
pub(super) fn draft_cmp(x: &Value, y: &Value) -> std::cmp::Ordering {
    let (xc, yc) = (is_closed_draft(x), is_closed_draft(y));
    draft_updated_at(x)
        .partial_cmp(&draft_updated_at(y))
        .unwrap_or(Ordering::Equal)
        .then_with(|| utf16_cmp(draft_sid(x), draft_sid(y)))
        .then_with(|| xc.cmp(&yc))
        .then_with(|| {
            if xc && yc {
                let (rx, ry) = (closed_reason(x), closed_reason(y));
                (rx != SYNTHETIC_REASON).cmp(&(ry != SYNTHETIC_REASON)).then_with(|| utf16_cmp(rx, ry))
            } else {
                draft_answer_count(x)
                    .cmp(&draft_answer_count(y))
                    .then_with(|| utf16_cmp(&draft_payload_json(x), &draft_payload_json(y)))
            }
        })
}

/// Outcome of merging the `examDraft` fields of two documents.
pub(super) enum DraftMerge {
    /// Neither side has a usable draft: keep the generic top-level result.
    Generic,
    /// Valid drafts existed but all predate `resetAt`: remove the key.
    Drop,
    Use(Value),
}

/// Join of the draft state `(closed, slot)`: `closed` is a bounded grow-only map sid -> updatedAt (stored as
/// `closedSids: [{sid, updatedAt}]` inside the slot), `slot` is the greatest candidate under `draft_cmp`. Candidates
/// are the drafts themselves (closed ones reduced to a canonical tombstone) and one tombstone per closed entry.
/// Commutative, associative and idempotent; a sid in `closedSids` is closed whatever the slot holds.
pub(super) fn merge_draft(a: Option<&Value>, b: Option<&Value>, reset_at: f64) -> DraftMerge {
    merge_draft_bounded(a, b, reset_at, CLOSED_SIDS_MAX)
}

// Contract: `skip <= entries.len()` by `saturating_sub`.
#[allow(clippy::indexing_slicing)]
pub(super) fn merge_draft_bounded(a: Option<&Value>, b: Option<&Value>, reset_at: f64, bound: usize) -> DraftMerge {
    let fresh = |t: f64| reset_at == 0.0 || t >= reset_at;
    let mut valid_seen = false;
    let mut closed: std::collections::BTreeMap<String, f64> = std::collections::BTreeMap::new();
    let mut note_closed = |sid: &str, t: f64| {
        let e = closed.entry(sid.to_string()).or_insert(t);
        if t > *e {
            *e = t;
        }
    };
    let mut best: Option<Value> = None;
    let consider = |c: Value, best: &mut Option<Value>| {
        if best.as_ref().is_none_or(|b| draft_cmp(&c, b) == Ordering::Greater) {
            *best = Some(c);
        }
    };
    for d in [a, b].into_iter().flatten().filter(|d| is_valid_draft(d)) {
        valid_seen = true;
        if let Some(list) = d.get("closedSids").and_then(Value::as_array) {
            let bounded_list = bound_closed_sids(list);
            for e in bounded_list.iter().filter(|e| is_valid_draft(e)) {
                let t = draft_updated_at(e);
                if fresh(t) {
                    note_closed(draft_sid(e), t);
                    consider(tombstone(draft_sid(e), t, SYNTHETIC_REASON), &mut best);
                }
            }
        }
        let t = draft_updated_at(d);
        if !fresh(t) {
            continue;
        }
        if is_closed_draft(d) {
            note_closed(draft_sid(d), t);
            consider(tombstone(draft_sid(d), t, closed_reason(d)), &mut best);
        } else {
            consider(d.clone(), &mut best);
        }
    }
    let Some(mut slot) = best else {
        return if valid_seen { DraftMerge::Drop } else { DraftMerge::Generic };
    };
    let mut entries: Vec<(&String, &f64)> = closed.iter().collect();
    entries.sort_by(|x, y| x.1.partial_cmp(y.1).unwrap_or(Ordering::Equal).then_with(|| utf16_cmp(x.0, y.0)));
    let skip = entries.len().saturating_sub(bound);
    let list: Vec<Value> = entries[skip..]
        .iter()
        .map(|(sid, t)| serde_json::json!({"sid": sid, "updatedAt": json_number(**t)}))
        .collect();
    if let Some(o) = slot.as_object_mut() {
        if list.is_empty() {
            o.remove("closedSids");
        } else {
            o.insert("closedSids".into(), Value::Array(list));
        }
    }
    DraftMerge::Use(slot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progress::{merge, sanitize};
    use serde_json::json;

    fn doc(t: u64, reset: u64, extra: Value) -> Value {
        let mut d = json!({"v": 1, "t": t, "resetAt": reset, "items": {}, "stats": {}, "settings": {}});
        for (k, v) in extra.as_object().unwrap() {
            d[k] = v.clone();
        }
        d
    }

    fn draft_of(a: Value, b: Value) -> Option<Value> {
        let ab = merge(&a, &b).unwrap();
        let ba = merge(&b, &a).unwrap();
        assert_eq!(ab, ba, "merge must be commutative");
        ab.get("examDraft").cloned()
    }

    fn with(t: u64, reset: u64, d: Value) -> Value {
        doc(t, reset, json!({"examDraft": d}))
    }

    #[test]
    fn draft_absent_on_both_stays_absent() {
        assert_eq!(draft_of(doc(1, 0, json!({})), doc(2, 0, json!({}))), None);
    }

    #[test]
    fn draft_one_side_survives_with_unknown_fields() {
        let d = json!({"sid": "s", "updatedAt": 5, "x": {"y": [1]}, "answers": [{"i": 0, "c": true, "g": "a"}]});
        assert_eq!(draft_of(with(1, 0, d.clone()), doc(9, 0, json!({}))), Some(d));
    }

    #[test]
    fn draft_same_sid_closed_is_never_resurrected_by_newer_open() {
        let open = json!({"sid": "s", "updatedAt": 900, "answers": [{"i": 0, "c": true}]});
        let closed = json!({"sid": "s", "updatedAt": 1, "closed": "finished"});
        let got = draft_of(with(1, 0, open.clone()), with(2, 0, closed)).unwrap();
        assert_eq!(got["closedSids"], json!([{"sid": "s", "updatedAt": 1}]));
        assert_eq!(got["sid"], "s");
        assert_eq!(got["updatedAt"], 900);
    }

    #[test]
    fn draft_same_sid_open_later_updated_at_then_more_answers() {
        let old = json!({"sid": "s", "updatedAt": 1});
        let new = json!({"sid": "s", "updatedAt": 2});
        assert_eq!(draft_of(with(5, 0, old), with(1, 0, new.clone())), Some(new));
        let few = json!({"sid": "s", "updatedAt": 2, "answers": []});
        let many = json!({"sid": "s", "updatedAt": 2, "answers": [{"i": 0, "c": false}]});
        assert_eq!(draft_of(with(5, 0, few), with(1, 0, many.clone())), Some(many));
    }

    #[test]
    fn draft_same_sid_full_tie_larger_stable_json() {
        let a = json!({"sid": "s", "updatedAt": 2, "z": 1});
        let b = json!({"sid": "s", "updatedAt": 2, "z": 2});
        assert_eq!(draft_of(with(1, 0, a), with(1, 0, b.clone())), Some(b));
    }

    #[test]
    fn draft_other_sid_later_wins_tie_larger_sid_then_closed() {
        let s1 = json!({"sid": "s1", "updatedAt": 1});
        let s2 = json!({"sid": "s2", "updatedAt": 2});
        assert_eq!(draft_of(with(1, 0, s1.clone()), with(1, 0, s2.clone())), Some(s2));
        let closed = json!({"sid": "s1", "updatedAt": 1, "closed": "abandoned"});
        assert_eq!(draft_of(with(1, 0, s1.clone()), with(1, 0, closed)).unwrap()["closed"], "abandoned");
        let s0 = json!({"sid": "s0", "updatedAt": 1});
        assert_eq!(draft_of(with(1, 0, s0), with(1, 0, s1.clone())), Some(s1));
    }

    #[test]
    fn draft_reset_at_drops_older_drafts_only() {
        let old = json!({"sid": "s", "updatedAt": 50});
        assert_eq!(draft_of(with(1, 100, old.clone()), doc(2, 100, json!({}))), None);
        assert_eq!(draft_of(with(1, 0, old), doc(2, 100, json!({}))), None);
        let fresh = json!({"sid": "t", "updatedAt": 100});
        assert_eq!(draft_of(with(1, 0, json!({"sid": "s", "updatedAt": 50})), with(1, 100, fresh.clone())), Some(fresh));
    }

    #[test]
    fn draft_invalid_keeps_generic_top_level_result() {
        let bad = json!({"updatedAt": 100});
        let other = json!({"sid": 3, "updatedAt": 1});
        assert_eq!(draft_of(with(1, 0, bad.clone()), with(2, 0, other.clone())), Some(other.clone()));
        assert_eq!(draft_of(with(3, 0, bad.clone()), doc(2, 0, json!({}))), Some(bad));
        let good = json!({"sid": "s", "updatedAt": 1});
        assert_eq!(draft_of(with(9, 0, json!("junk")), with(1, 0, good.clone())), Some(good));
    }

    #[test]
    fn draft_sanitize_keeps_draft_byte_identical() {
        let d = json!({"sid": "s", "updatedAt": 5, "extra": [1, {"k": null}], "answers": [{"i": 0, "c": true, "g": "x"}]});
        let out = sanitize(&with(1, 0, d.clone())).unwrap();
        assert_eq!(out.get("examDraft"), Some(&d));
    }

    fn step(a: &Option<Value>, b: &Option<Value>, bound: usize) -> Option<Value> {
        match merge_draft_bounded(a.as_ref(), b.as_ref(), 0.0, bound) {
            DraftMerge::Use(v) => Some(v),
            DraftMerge::Drop => None,
            DraftMerge::Generic => a.clone().or_else(|| b.clone()),
        }
    }

    fn pool() -> Vec<Value> {
        let mut seed = 12345u64;
        let mut next = move |m: u64| {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (seed >> 33) % m
        };
        let mut out = vec![
            json!({"sid": "s1", "updatedAt": 100}),
            json!({"sid": "s1", "updatedAt": 50, "closed": "finished"}),
            json!({"sid": "s2", "updatedAt": 75}),
        ];
        for _ in 0..24 {
            let sid = format!("s{}", next(4));
            let t = 1 + next(5);
            let mut d = json!({"sid": sid, "updatedAt": t});
            match next(4) {
                0 => d["closed"] = json!(["finished", "abandoned", "expired", "zzz"][next(4) as usize]),
                1 => d["answers"] = json!(vec![json!({"i": 0, "c": true}); next(3) as usize]),
                2 => d["index"] = json!(next(3)),
                _ => {}
            }
            if next(3) == 0 {
                d["closedSids"] = json!([{"sid": format!("s{}", next(4)), "updatedAt": 1 + next(5)}, {"sid": "x", "updatedAt": 2}]);
            }
            out.push(d);
        }
        out
    }

    #[test]
    fn draft_merge_is_a_join_commutative_associative_idempotent() {
        let pool: Vec<Option<Value>> = pool().into_iter().map(Some).collect();
        for bound in [1, 2, 3, CLOSED_SIDS_MAX] {
            for x in &pool {
                assert_eq!(step(x, x, bound), step(&step(x, x, bound), x, bound), "idempotent");
                let xx = step(x, x, bound);
                assert_eq!(step(&xx, &xx, bound), xx);
                for y in &pool {
                    assert_eq!(step(x, y, bound), step(y, x, bound), "commutative");
                    for z in &pool {
                        assert_eq!(step(&step(x, y, bound), z, bound), step(x, &step(y, z, bound), bound), "associative {x:?} {y:?} {z:?}");
                    }
                }
            }
        }
    }

    #[test]
    fn draft_all_fold_orders_give_the_same_result() {
        fn permutations(items: &mut Vec<usize>, k: usize, out: &mut Vec<Vec<usize>>) {
            if k == items.len() {
                out.push(items.clone());
                return;
            }
            for i in k..items.len() {
                items.swap(k, i);
                permutations(items, k + 1, out);
                items.swap(k, i);
            }
        }
        let pool = pool();
        for start in 0..pool.len() - 5 {
            let set: Vec<Option<Value>> = pool[start..start + 5].iter().cloned().map(Some).collect();
            let mut orders = Vec::new();
            permutations(&mut (0..5).collect(), 0, &mut orders);
            let results: Vec<Option<Value>> = orders
                .iter()
                .map(|o| o.iter().skip(1).fold(set[o[0]].clone(), |acc, &i| step(&acc, &set[i], 2)))
                .collect();
            assert!(results.windows(2).all(|w| w[0] == w[1]), "fold order changed the result for start {start}");
        }
    }

    #[test]
    fn draft_reviewer_cycle_x_y_z_gives_one_result_and_stays_closed() {
        let x = json!({"sid": "s1", "updatedAt": 100});
        let y = json!({"sid": "s1", "updatedAt": 50, "closed": "finished"});
        let z = json!({"sid": "s2", "updatedAt": 75});
        let d = |v: &Value| doc(1, 0, json!({"examDraft": v}));
        let (dx, dy, dz) = (d(&x), d(&y), d(&z));
        let m = |p: &Value, q: &Value| merge(p, q).unwrap();
        let first = m(&m(&dx, &dy), &dz);
        for r in [m(&dx, &m(&dy, &dz)), m(&m(&dx, &dz), &dy), m(&m(&dz, &dy), &dx), m(&dz, &m(&dx, &dy))] {
            assert_eq!(r, first);
        }
        let got = &first["examDraft"];
        assert_eq!(got["sid"], "s1");
        assert_eq!(got["closedSids"], json!([{"sid": "s1", "updatedAt": 50}]));
    }

    #[test]
    fn draft_closed_sids_are_bounded_keeping_the_largest() {
        let mk = |i: u64| json!({"sid": format!("s{i}"), "updatedAt": i, "closed": "finished"});
        let all: Vec<Option<Value>> = (1..=6).map(|i| Some(mk(i))).collect();
        let r = all.iter().skip(1).fold(all[0].clone(), |acc, d| step(&acc, d, 3)).unwrap();
        assert_eq!(r["closedSids"].as_array().unwrap().len(), 3);
        assert_eq!(r["closedSids"][0]["sid"], "s4");
    }

    #[test]
    fn draft_reset_at_drops_closed_sids_too() {
        let d = json!({"sid": "s2", "updatedAt": 200, "closedSids": [{"sid": "s1", "updatedAt": 10}]});
        let got = draft_of(with(1, 100, d), doc(1, 0, json!({}))).unwrap();
        assert!(got.get("closedSids").is_none());
    }

    #[test]
    fn draft_closed_sids_bound_large_input() {
        let mut large_list = Vec::with_capacity(200_000);
        for i in 0..200_000u64 {
            large_list.push(json!({"sid": format!("s{i}"), "updatedAt": i}));
        }
        let d = json!({"sid": "s0", "updatedAt": 0, "closedSids": large_list});
        let doc_a = doc(1, 0, json!({"examDraft": d}));
        let doc_b = doc(2, 0, json!({}));
        let got = draft_of(doc_a, doc_b).unwrap();
        let closed_sids = got.get("closedSids").and_then(Value::as_array);
        assert!(closed_sids.is_some());
        assert!(closed_sids.unwrap().len() <= CLOSED_SIDS_MAX);
        assert!(closed_sids.unwrap().iter().any(|e| e["sid"] == "s199999"));
    }
}
