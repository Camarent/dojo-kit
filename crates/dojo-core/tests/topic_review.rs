//! Topic rule for review sessions: `topic_once`, `aspect_of`, `topic_levels`.
use dojo_core::groups::{aspect_of, topic_levels, topic_once, AspectRule, TopicLevel};
use dojo_core::srs::Queue;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap};

fn q(due: &[&str], fresh: &[&str]) -> Queue {
    Queue { due: due.iter().map(|s| s.to_string()).collect(), fresh: fresh.iter().map(|s| s.to_string()).collect() }
}

/// Records from `(id, stage, due)`.
fn recs(items: &[(&str, i64, i64)]) -> Map<String, Value> {
    items.iter().map(|(id, s, due)| (id.to_string(), json!({"s": s, "due": due, "ok": 0, "bad": 0, "last": 0}))).collect()
}

fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

fn once(queue: Queue, topic_of: &HashMap<String, String>, aspects: &HashMap<String, String>, records: &Map<String, Value>, cap: Option<usize>) -> Queue {
    topic_once(queue, topic_of, aspects, records, cap)
}

#[test]
fn three_items_of_one_topic_keep_the_weakest_aspect() {
    let topic = map(&[("a", "T"), ("b", "T"), ("c", "T")]);
    let aspects = map(&[("a", "meaning"), ("b", "writing"), ("c", "reading")]);
    let records = recs(&[("a", 3, 10), ("b", 1, 10), ("c", 2, 10)]);
    let out = once(q(&["a", "b", "c"], &[]), &topic, &aspects, &records, None);
    assert_eq!(out, q(&["b"], &[]));
}

#[test]
fn tie_on_level_prefers_lower_own_stage() {
    let topic = map(&[("x", "T"), ("y", "T")]);
    let aspects = map(&[("x", "A"), ("y", "A")]);
    let records = recs(&[("x", 2, 10), ("y", 1, 10)]);
    assert_eq!(once(q(&["x", "y"], &[]), &topic, &aspects, &records, None), q(&["y"], &[]));
}

#[test]
fn tie_on_level_and_stage_prefers_earlier_due() {
    let topic = map(&[("x", "T"), ("y", "T")]);
    let aspects = map(&[("x", "A"), ("y", "A")]);
    let records = recs(&[("x", 1, 20), ("y", 1, 10)]);
    assert_eq!(once(q(&["x", "y"], &[]), &topic, &aspects, &records, None), q(&["y"], &[]));
}

#[test]
fn full_tie_prefers_queue_position() {
    let topic = map(&[("x", "T"), ("y", "T")]);
    let aspects = map(&[("x", "A"), ("y", "A")]);
    let records = recs(&[("x", 1, 10), ("y", 1, 10)]);
    assert_eq!(once(q(&["x", "y"], &[]), &topic, &aspects, &records, None), q(&["x"], &[]));
    assert_eq!(once(q(&["y", "x"], &[]), &topic, &aspects, &records, None), q(&["y"], &[]));
}

#[test]
fn fresh_item_ties_due_item_at_same_level_and_wins_on_own_stage() {
    let topic = map(&[("d", "T"), ("f", "T")]);
    let aspects = map(&[("d", "A"), ("f", "A")]);
    let records = recs(&[("d", 0, 5)]);
    assert_eq!(once(q(&["d"], &["f"]), &topic, &aspects, &records, None), q(&[], &["f"]));
}

#[test]
fn fresh_item_of_started_topic_wins_over_recorded_aspect() {
    let topic = map(&[("d", "T"), ("f", "T")]);
    let aspects = map(&[("d", "A"), ("f", "B")]);
    let records = recs(&[("d", 2, 5)]);
    assert_eq!(once(q(&["d"], &["f"]), &topic, &aspects, &records, None), q(&[], &["f"]));
}

#[test]
fn intro_topic_keeps_all_fresh_items() {
    let topic = map(&[("f1", "I"), ("f2", "I")]);
    let out = once(q(&[], &["f1", "f2"]), &topic, &HashMap::new(), &Map::new(), None);
    assert_eq!(out, q(&[], &["f1", "f2"]));
}

#[test]
fn cap_keeps_first_topics_in_due_order() {
    let records = recs(&[("a", 0, 1), ("b", 0, 1), ("c", 0, 1)]);
    let out = once(q(&["a", "b", "c"], &[]), &HashMap::new(), &HashMap::new(), &records, Some(2));
    assert_eq!(out, q(&["a", "b"], &[]));
}

#[test]
fn cap_counts_fresh_items_of_started_topics_after_due() {
    let topic = map(&[("g", "S"), ("f", "S")]);
    let records = recs(&[("a", 0, 1), ("g", 1, 5)]);
    let out = once(q(&["a"], &["f"]), &topic, &HashMap::new(), &records, Some(1));
    assert_eq!(out, q(&["a"], &[]));
    let out = once(q(&["a"], &["f"]), &topic, &HashMap::new(), &records, Some(2));
    assert_eq!(out, q(&["a"], &["f"]));
}

#[test]
fn cap_never_drops_intro_fresh_items() {
    let topic = map(&[("a", "T1"), ("b", "T2"), ("f", "I")]);
    let records = recs(&[("a", 0, 1), ("b", 0, 1)]);
    let out = once(q(&["a", "b"], &["f"]), &topic, &HashMap::new(), &records, Some(1));
    assert_eq!(out, q(&["a"], &["f"]));
}

#[test]
fn missing_topic_of_makes_each_item_its_own_topic() {
    let records = recs(&[("a", 0, 1), ("b", 2, 1)]);
    let out = once(q(&["a", "b"], &["c"]), &HashMap::new(), &HashMap::new(), &records, None);
    assert_eq!(out, q(&["a", "b"], &["c"]));
}

#[test]
fn output_keeps_input_order_within_due_and_fresh() {
    let records = recs(&[("a", 0, 1), ("b", 0, 1)]);
    let out = once(q(&["b", "a"], &["f2", "f1"]), &HashMap::new(), &HashMap::new(), &records, None);
    assert_eq!(out, q(&["b", "a"], &["f2", "f1"]));
}

#[test]
fn records_are_not_changed() {
    let topic = map(&[("a", "T"), ("b", "T")]);
    let aspects = map(&[("a", "A"), ("b", "B")]);
    let records = recs(&[("a", 3, 10), ("b", 1, 10)]);
    let before = records.clone();
    let _ = once(q(&["a", "b"], &["f"]), &topic, &aspects, &records, Some(1));
    assert_eq!(records, before);
}

fn rules() -> Vec<AspectRule> {
    vec![
        AspectRule { id: "meaning".into(), title: None, tags: vec!["meaning".into()], units: vec![] },
        AspectRule { id: "reading".into(), title: None, tags: vec!["reading".into()], units: vec!["u2".into()] },
    ]
}

#[test]
fn aspect_of_first_matching_rule_by_tag_or_unit() {
    let r = rules();
    assert_eq!(aspect_of(&["reading".to_string()], "u1", &r), "reading");
    assert_eq!(aspect_of(&[], "u2", &r), "reading");
    assert_eq!(aspect_of(&["meaning".to_string(), "reading".to_string()], "u2", &r), "meaning");
}

#[test]
fn aspect_of_no_match_is_default() {
    assert_eq!(aspect_of(&["x".to_string()], "u9", &rules()), "default");
    assert_eq!(aspect_of(&[], "u9", &[]), "default");
}

#[test]
fn topic_levels_min_per_aspect_and_overall() {
    let members: HashMap<String, Vec<String>> = HashMap::from([
        ("T".to_string(), vec!["a".into(), "b".into(), "c".into(), "d".into()]),
        ("U".to_string(), vec!["x".into()]),
    ]);
    let aspects = map(&[("a", "meaning"), ("b", "writing"), ("c", "meaning"), ("d", "reading")]);
    let records = recs(&[("a", 3, 1), ("b", 1, 1), ("c", 2, 1)]);
    let out = topic_levels(&members, &aspects, &records);
    let want = TopicLevel { aspects: BTreeMap::from([("meaning".to_string(), 2), ("writing".to_string(), 1)]), level: 1 };
    assert_eq!(out, BTreeMap::from([("T".to_string(), want)]));
}
