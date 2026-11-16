//! `build_session`: category mix, per-unit choice, entity spread, seed, capacity cut, filter and plan numbers.
use dojo_core::content::SessionMode;
use dojo_core::groups::{group_counts, AspectRule, ItemMeta};
use dojo_core::session::Session;
use dojo_core::session::choice::pick_questions;
use dojo_core::session::order::spread;
use dojo_core::session::{build_session, SessionConfig, SessionFilter, SessionInput};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

const NOW: i64 = 100;
const DAY_MS: i64 = 86_400_000;
/// `days_left` 4 with the default `reviewDays` 3 leaves one day for new units: every never-introduced unit fits.
const DAYS_LEFT: i64 = 4;

fn item(id: &str, unit: &str, entity: &str, tags: &[&str]) -> ItemMeta {
    ItemMeta {
        id: id.into(),
        unit: unit.into(),
        entity: entity.into(),
        tags: tags.iter().map(|t| t.to_string()).collect(),
        retired: false,
    }
}

fn rule(value: Value) -> AspectRule {
    serde_json::from_value(value).expect("aspect rule")
}

/// Record for an item: `due` at or before NOW when `due`, `wk` 1 when weak, `qbad` set when missed.
fn rec(due: bool, weak: bool, qok: i64, qbad: i64, qlast: i64) -> Value {
    json!({"due": if due { 0 } else { NOW + 50 }, "s": 1, "last": 1, "wk": i64::from(weak), "qok": qok, "qbad": qbad, "qlast": qlast})
}

fn records(pairs: &[(&str, Value)]) -> Map<String, Value> {
    pairs.iter().map(|(id, v)| (id.to_string(), v.clone())).collect()
}

fn session_at(items: &[ItemMeta], recs: &Map<String, Value>, rules: &[AspectRule], cfg: &SessionConfig, filter: Option<&SessionFilter>, course_id: &str, now: i64) -> Session {
    build_session(&SessionInput {
        items,
        records: recs,
        rules,
        cfg,
        filter,
        course_id,
        now,
        days_left: DAYS_LEFT,
        introduced_today: 0,
        answer_ms: &[],
        seed: None,
    })
}

fn session_with(items: &[ItemMeta], recs: &Map<String, Value>, rules: &[AspectRule], cfg: &SessionConfig, filter: Option<&SessionFilter>) -> Session {
    session_at(items, recs, rules, cfg, filter, "c", NOW)
}

fn session(items: &[ItemMeta], recs: &Map<String, Value>, cfg: &SessionConfig) -> Session {
    session_with(items, recs, &[], cfg, None)
}

fn manual(cap: u32) -> SessionConfig {
    SessionConfig { session_mode: SessionMode::Manual, session_cap: cap, ..SessionConfig::default() }
}

#[test]
fn mix_orders_weak_then_new_then_due() {
    let items = [item("n1", "un", "EN", &[]), item("w1", "uw", "EW", &[]), item("d1", "ud", "ED", &[])];
    let recs = records(&[("w1", rec(true, true, 0, 1, 5)), ("d1", rec(true, false, 1, 0, 3))]);
    let s = session(&items, &recs, &SessionConfig::default());
    assert_eq!(s.queue, ["w1", "n1", "d1"]);
    assert_eq!((s.plan.weak, s.plan.new, s.plan.due), (1, 1, 2)); // w1 is weak and due: due counts every due unit
}

#[test]
fn custom_mix_keeps_only_listed_kinds() {
    let items = [item("n1", "un", "EN", &[]), item("d1", "ud", "ED", &[])];
    let recs = records(&[("d1", rec(true, false, 1, 0, 3))]);
    let cfg = SessionConfig { session_mix: vec!["due".into()], ..SessionConfig::default() };
    assert_eq!(session(&items, &recs, &cfg).queue, ["d1"]);
}

#[test]
fn per_unit_max_takes_that_many_questions() {
    let items = [item("a", "u", "E", &[]), item("b", "u", "E", &[]), item("c", "u", "E", &[])];
    let one = session(&items, &Map::new(), &SessionConfig::default());
    assert_eq!(one.queue.len(), 1);
    let two = session(&items, &Map::new(), &SessionConfig { per_unit_max: 2, ..SessionConfig::default() });
    assert_eq!(two.queue.len(), 2);
}

#[test]
fn choice_unseen_then_missed_not_last_asked() {
    // a: asked last (max qlast) so skipped; b: unseen; c: missed.
    let recs = records(&[("a", rec(false, false, 1, 0, 10)), ("c", rec(false, false, 0, 1, 5))]);
    assert_eq!(pick_questions(&["a", "b", "c"], &recs, 3), ["b", "c"]);
}

#[test]
fn choice_oldest_asked_first_and_last_asked_skipped() {
    let recs = records(&[
        ("x", rec(false, false, 1, 0, 20)),
        ("y", rec(false, false, 1, 0, 5)),
        ("z", rec(false, false, 1, 0, 30)),
    ]);
    assert_eq!(pick_questions(&["x", "y", "z"], &recs, 3), ["y", "x"]);
    // a single question stays available even when it was the last asked.
    assert_eq!(pick_questions(&["z"], &recs, 1), ["z"]);
}

#[test]
fn spread_keeps_units_of_one_entity_apart() {
    let items = [item("e1", "u1", "E", &["t1"]), item("e2", "u2", "E", &["t2"]), item("f1", "u3", "F", &[])];
    let rules = [rule(json!({"id": "a1", "tags": ["t1"]})), rule(json!({"id": "a2", "tags": ["t2"]}))];
    let s = session_with(&items, &Map::new(), &rules, &SessionConfig::default(), None);
    assert_eq!(s.queue.len(), 3);
    let entity = |id: &str| if id == "f1" { "F" } else { "E" };
    for pair in s.queue.windows(2) {
        assert_ne!(entity(&pair[0]), entity(&pair[1]), "adjacent same entity in {:?}", s.queue);
    }
    // spread helper: first remaining different entity is taken next.
    let out = spread(vec![("E", 1), ("E", 2), ("F", 3)], |t| t.0);
    assert_eq!(out.iter().map(|t| t.0).collect::<Vec<_>>(), ["E", "F", "E"]);
}

#[test]
fn same_day_and_course_same_queue_other_day_or_course_other_queue() {
    let items: Vec<ItemMeta> = (0..8).map(|i| item(&format!("i{i}"), &format!("u{i}"), &format!("E{i}"), &[])).collect();
    let cfg = SessionConfig { session_mix: vec!["new".into()], ..SessionConfig::default() };
    let at = |course: &str, now: i64| session_at(&items, &Map::new(), &[], &cfg, None, course, now);
    assert_eq!(at("c", NOW), at("c", NOW + 1000)); // same UTC day
    assert_ne!(at("c", NOW).queue, at("c", NOW + DAY_MS).queue);
    assert_ne!(at("c", NOW).queue, at("d", NOW).queue);
}

#[test]
fn capacity_cut_limits_queue() {
    let items = [item("a", "u1", "E1", &[]), item("b", "u2", "E2", &[]), item("c", "u3", "E3", &[])];
    let s = session(&items, &Map::new(), &manual(2));
    assert_eq!(s.queue.len(), 2);
    assert_eq!(s.plan.capacity, Some(2));
    assert_eq!(s.plan.total, 3);
}

#[test]
fn empty_course_gives_empty_queue_and_zero_plan() {
    let s = session(&[], &Map::new(), &SessionConfig::default());
    assert!(s.queue.is_empty());
    assert_eq!((s.plan.weak, s.plan.new, s.plan.due, s.plan.total), (0, 0, 0, 0));
}

#[test]
fn plan_due_equals_home_group_count() {
    let items = [
        item("d1", "u1", "E1", &[]),
        item("d2", "u2", "E2", &[]),
        item("w1", "u3", "E3", &[]),
        item("n1", "u4", "E4", &[]),
    ];
    // w1 is weak and due: the mix files it under "weak", plan.due still counts it.
    let recs = records(&[("d1", rec(true, false, 1, 0, 1)), ("d2", rec(true, false, 1, 0, 2)), ("w1", rec(true, true, 1, 0, 3))]);
    let s = session(&items, &recs, &SessionConfig::default());
    let course = json!({"groups": [{"id": "g", "title": "G", "units": ["u1", "u2", "u3", "u4"]}]});
    let counts = group_counts(&course, &items, &recs, NOW, &HashMap::new(), 0);
    assert_eq!(s.plan.due, 3);
    assert_eq!(s.plan.due, counts.groups["g"].due);
}

#[test]
fn filter_by_topic_and_by_aspect() {
    let items = [item("e1", "u1", "E", &["t1"]), item("e2", "u2", "E", &["t2"]), item("f1", "u3", "F", &["t1"])];
    let rules = [rule(json!({"id": "a1", "tags": ["t1"]})), rule(json!({"id": "a2", "tags": ["t2"]}))];
    let run = |topic: Option<&str>, aspect: Option<&str>| {
        let f = SessionFilter { topic: topic.map(String::from), aspect: aspect.map(String::from) };
        let mut q = session_with(&items, &Map::new(), &rules, &SessionConfig::default(), Some(&f)).queue;
        q.sort();
        q
    };
    assert_eq!(run(None, Some("a2")), ["e2"]);
    assert_eq!(run(Some("E"), None), ["e1", "e2"]);
    assert_eq!(run(Some("E"), Some("a1")), ["e1"]);
    assert_eq!(run(None, None), ["e1", "e2", "f1"]);
    assert!(run(Some("F"), Some("a2")).is_empty());
}

#[test]
fn no_item_twice_in_the_queue() {
    let items: Vec<ItemMeta> = (0..6).map(|i| item(&format!("i{i}"), &format!("u{}", i % 3), &format!("E{}", i % 3), &[])).collect();
    let cfg = SessionConfig { per_unit_max: 2, ..SessionConfig::default() };
    for course in ["a", "b", "c", "d", "e"] {
        let s = session_at(&items, &Map::new(), &[], &cfg, None, course, NOW);
        assert_eq!(s.queue.len(), 6);
        let unique: std::collections::HashSet<&String> = s.queue.iter().collect();
        assert_eq!(unique.len(), s.queue.len(), "repeat in {:?}", s.queue);
        for pair in s.queue.windows(2) {
            assert_ne!(pair[0], pair[1]);
        }
    }
}
