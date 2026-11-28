use dojo_core::content::{Course, Item, parse_course};
use dojo_core::topic_stats::{GroupKind, StageCounts, TopicGroup, TopicStats, UnitRef, topic_stats};
use serde_json::{Value, json};
use std::path::PathBuf;
mod common;
use common::items;

/// Course with units `u` and `v`; `extra` is appended as more top-level JSON fields (leading comma).
fn course(extra: &str) -> Course {
    let text = format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}},{{"id":"v","title":"V"}}]{extra}}}"#);
    parse_course(&text).expect("course parses")
}

/// One card item line; `topic` None omits the field, `retired` adds the status.
fn line(id: &str, unit: &str, topic: Option<&str>, retired: bool) -> String {
    let topic = topic.map(|t| format!(r#","topic":"{t}""#)).unwrap_or_default();
    let status = if retired { r#","status":"retired""# } else { "" };
    format!(r#"{{"type":"card","id":"{id}","unit":"{unit}","prompt":"p","back":"b"{topic}{status}}}"#)
}

fn load(lines: &[String]) -> Vec<Item> {
    let refs: Vec<&str> = lines.iter().map(String::as_str).collect();
    items(&refs)
}

fn counts(total: u64, unseen: u64, learning: u64, mature: u64) -> StageCounts {
    StageCounts { total, unseen, learning, mature }
}

/// Expected group; a unit label is the unit title, which `course()` sets to the upper-case id.
fn group(kind: GroupKind, id: &str, unit: UnitRef, items: StageCounts, last: Option<&str>) -> TopicGroup {
    let label = match kind {
        GroupKind::Topic => id.to_string(),
        GroupKind::Unit => id.to_uppercase(),
    };
    TopicGroup {
        kind,
        id: id.to_string(),
        label,
        unit,
        items,
        last_answered: last.map(str::to_string),
        last_changed: last.map(str::to_string),
    }
}

fn one(unit: &str) -> UnitRef {
    UnitRef::One(unit.to_string())
}

const T1000: &str = "1970-01-01T00:00:01.000Z";
const T2000: &str = "1970-01-01T00:00:02.000Z";

#[test]
fn empty_progress_counts_everything_unseen() {
    let lines = [line("a", "u", Some("T"), false), line("b", "u", Some("T"), false), line("c", "u", None, false)];
    let stats = topic_stats(&course(""), &load(&lines), &json!({}), None, 0);
    assert_eq!(stats.groups, vec![
        group(GroupKind::Topic, "T", one("u"), counts(2, 2, 0, 0), None),
        group(GroupKind::Unit, "u", one("u"), counts(1, 1, 0, 0), None),
    ]);
}

#[test]
fn stages_split_unseen_learning_mature() {
    let lines = [line("a", "u", Some("T"), false), line("b", "u", Some("T"), false), line("c", "u", Some("T"), false)];
    let progress = json!({"items": {"a": {"s": 1, "last": 1000}, "b": {"s": 4, "last": 2000}}});
    let stats = topic_stats(&course(""), &load(&lines), &progress, None, 0);
    // s == 4 is mature (>= threshold), s == 1 is learning, no record is unseen.
    assert_eq!(stats.groups, vec![group(GroupKind::Topic, "T", one("u"), counts(3, 1, 1, 1), Some(T2000))]);
}

#[test]
fn all_answered_has_no_unseen_and_last_is_max_record() {
    let lines = [line("a", "u", Some("T"), false), line("b", "u", Some("T"), false), line("c", "u", Some("T"), false)];
    let progress = json!({"items": {
        "a": {"s": 1, "last": 1000},
        "b": {"s": 4, "last": 2000},
        "c": {"s": 2, "last": 1500}
    }});
    let stats = topic_stats(&course(""), &load(&lines), &progress, None, 0);
    // every item answered: s == 1 and s == 2 are learning, s == 4 is mature; last is the max record.
    assert_eq!(stats.groups, vec![group(GroupKind::Topic, "T", one("u"), counts(3, 0, 2, 1), Some(T2000))]);
}

#[test]
fn retired_items_are_not_counted() {
    let lines = [line("a", "u", Some("T"), false), line("r", "u", Some("T"), true), line("q", "u", None, true)];
    let stats = topic_stats(&course(""), &load(&lines), &json!({}), None, 0);
    assert_eq!(stats.groups, vec![group(GroupKind::Topic, "T", one("u"), counts(1, 1, 0, 0), None)]);
}

#[test]
fn topic_across_two_units_lists_both_units() {
    let lines = [line("a", "u", Some("T"), false), line("d", "v", Some("T"), false)];
    let stats = topic_stats(&course(""), &load(&lines), &json!({}), None, 0);
    let units = UnitRef::Many(vec!["u".to_string(), "v".to_string()]);
    assert_eq!(stats.groups, vec![group(GroupKind::Topic, "T", units, counts(2, 2, 0, 0), None)]);
}

#[test]
fn items_without_topic_group_by_unit_in_first_appearance_order() {
    let lines = [line("c", "v", None, false), line("a", "u", Some("T"), false), line("e", "v", None, false)];
    let stats = topic_stats(&course(""), &load(&lines), &json!({}), None, 0);
    assert_eq!(stats.groups, vec![
        group(GroupKind::Unit, "v", one("v"), counts(2, 2, 0, 0), None),
        group(GroupKind::Topic, "T", one("u"), counts(1, 1, 0, 0), None),
    ]);
}

#[test]
fn course_learned_stage_moves_mature_threshold() {
    let lines = [line("a", "u", Some("T"), false)];
    let progress = json!({"items": {"a": {"s": 2, "last": 1000}}});
    let default = topic_stats(&course(""), &load(&lines), &progress, None, 0);
    assert_eq!(default.groups[0].items, counts(1, 0, 1, 0));
    let set = topic_stats(&course(r#","learnedStage":2"#), &load(&lines), &progress, None, 0);
    assert_eq!(set.groups[0].items, counts(1, 0, 0, 1));
}

#[test]
fn changed_since_keeps_only_groups_changed_after_it() {
    let lines = [line("a", "u", Some("T"), false), line("c", "v", None, false)];
    let progress = json!({"items": {"a": {"s": 1, "last": 2000}, "c": {"s": 1, "last": 500}}});
    let all = topic_stats(&course(""), &load(&lines), &progress, None, 0);
    assert_eq!(all.groups.len(), 2);
    let since = topic_stats(&course(""), &load(&lines), &progress, Some(1000), 0);
    assert_eq!(since.groups, vec![group(GroupKind::Topic, "T", one("u"), counts(1, 0, 1, 0), Some(T2000))]);
    assert_eq!(since.changed_since.as_deref(), Some(T1000));
    assert_eq!(all.changed_since, None);
}

#[test]
fn header_fields_are_set() {
    let stats = topic_stats(&course(""), &[], &json!({}), None, 2000);
    assert_eq!(stats.v, 1);
    assert_eq!(stats.course, "c");
    assert_eq!(stats.generated_at, T2000);
    assert!(stats.groups.is_empty());
}

#[test]
fn serialised_keys_match_schema() {
    let lines = [line("a", "u", Some("T"), false)];
    let stats: TopicStats = topic_stats(&course(""), &load(&lines), &json!({}), None, 0);
    let value = serde_json::to_value(&stats).expect("serialises");
    let schema_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../schema/topic-stats.schema.json");
    let schema: Value = serde_json::from_str(&std::fs::read_to_string(schema_path).expect("schema file")).expect("schema json");
    let top = schema["properties"].as_object().expect("top properties");
    let group_schema = &schema["$defs"]["TopicGroup"]["properties"];
    let group_props = group_schema.as_object().expect("group properties");
    let mut top_keys: Vec<&String> = top.keys().collect();
    let mut value_keys: Vec<&String> = value.as_object().expect("object").keys().collect();
    top_keys.sort();
    value_keys.sort();
    assert_eq!(top_keys, value_keys);
    let group_value = value["groups"][0].as_object().expect("group object");
    let mut gk: Vec<&String> = group_props.keys().collect();
    let mut gv: Vec<&String> = group_value.keys().collect();
    gk.sort();
    gv.sort();
    assert_eq!(gk, gv);
}
