//! Topic rule for review sessions: one item per topic, picked by the weakest aspect.
//!
//! A topic is a set of items that teach one thing. An aspect is a part of that thing (meaning, reading, ...).
//! Pure functions, no RNG. Per-item records are read, never written.

use crate::srs::{int_field, Queue};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap, HashSet};

/// Aspect of an item that no rule matches.
pub const DEFAULT_ASPECT: &str = "default";

/// Course rule that puts items into an aspect.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AspectRule {
    pub id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub units: Vec<String>,
}

/// Aspect levels of one topic: `aspects` = min stage per recorded aspect, `level` = min over them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TopicLevel {
    pub aspects: BTreeMap<String, i64>,
    pub level: i64,
}

/// Topic -> aspect -> min stage `s` over its recorded items.
type Levels = HashMap<String, HashMap<String, i64>>;

/// Tie-break key of a candidate, lower wins: (aspect level, own stage, due time, queue position).
type Rank = (i64, i64, i64, usize);

/// Aspect of an item: id of the first rule whose `tags` hold one of the item tags or whose `units` hold `unit`.
pub fn aspect_of(tags: &[String], unit: &str, rules: &[AspectRule]) -> String {
    rules
        .iter()
        .find(|r| r.units.iter().any(|u| u == unit) || r.tags.iter().any(|t| tags.contains(t)))
        .map_or_else(|| DEFAULT_ASPECT.to_string(), |r| r.id.clone())
}

/// Topic of an item: its `topic_of` entry, else the item id itself.
fn topic_name<'a>(id: &'a str, topic_of: &'a HashMap<String, String>) -> &'a str {
    topic_of.get(id).map_or(id, String::as_str)
}

/// Aspect of an item from `aspect_of_item`, else `DEFAULT_ASPECT`.
fn aspect_name<'a>(id: &str, aspect_of_item: &'a HashMap<String, String>) -> &'a str {
    aspect_of_item.get(id).map_or(DEFAULT_ASPECT, String::as_str)
}

/// Min stage per (topic, aspect) over every recorded item. A topic is started when it appears here.
fn recorded_levels(topic_of: &HashMap<String, String>, aspect_of_item: &HashMap<String, String>, records: &Map<String, Value>) -> Levels {
    let mut out: Levels = HashMap::new();
    for (id, rec) in records {
        let s = int_field(Some(rec), "s");
        let slot = out
            .entry(topic_name(id, topic_of).to_string())
            .or_default()
            .entry(aspect_name(id, aspect_of_item).to_string())
            .or_insert(s);
        *slot = (*slot).min(s);
    }
    out
}

/// Level of an aspect in a topic; -1 when no item of it has a record.
fn level_of(levels: &Levels, topic: &str, aspect: &str) -> i64 {
    levels.get(topic).and_then(|aspects| aspects.get(aspect)).copied().unwrap_or(-1)
}

/// Ids of the queue that win their topic (plus every fresh id of an intro topic), as a set.
fn winners(queue: &Queue, topic_of: &HashMap<String, String>, aspect_of_item: &HashMap<String, String>, records: &Map<String, Value>, cap: Option<usize>) -> HashSet<String> {
    let levels = recorded_levels(topic_of, aspect_of_item, records);
    let cands: Vec<(&str, bool)> = queue.due.iter().map(|id| (id.as_str(), true)).chain(queue.fresh.iter().map(|id| (id.as_str(), false))).collect();
    let mut keep: HashSet<String> = HashSet::new();
    let mut best: HashMap<&str, (Rank, &str)> = HashMap::new();
    let mut order: Vec<&str> = Vec::new();
    for (pos, &(id, is_due)) in cands.iter().enumerate() {
        let topic = topic_name(id, topic_of);
        if !levels.contains_key(topic) {
            if !is_due {
                keep.insert(id.to_string());
            }
            continue;
        }
        let level = level_of(&levels, topic, aspect_name(id, aspect_of_item));
        let rank = rank_of(records.get(id), is_due, level, pos);
        let slot = best.entry(topic).or_insert_with(|| {
            order.push(topic);
            (rank, id)
        });
        if rank < slot.0 {
            *slot = (rank, id);
        }
    }
    for topic in order.iter().take(cap.unwrap_or(usize::MAX)) {
        if let Some((_, id)) = best.get(topic) {
            keep.insert(id.to_string());
        }
    }
    keep
}

/// Rank of a candidate. Fresh items have own stage -1 and no due time (last among equals).
fn rank_of(rec: Option<&Value>, is_due: bool, level: i64, pos: usize) -> Rank {
    let (own, due_at) = if is_due { (int_field(rec, "s"), int_field(rec, "due")) } else { (-1, i64::MAX) };
    (level, own, due_at, pos)
}

/// Keep the ids of `ids` that are in `keep`, in their order.
fn keep_in_order(ids: Vec<String>, keep: &HashSet<String>) -> Vec<String> {
    ids.into_iter().filter(|id| keep.contains(id)).collect()
}

/// One review session: each started topic keeps one due-or-fresh item, the one of its weakest aspect.
///
/// Intro topics (no member has a record) keep all their fresh items. Topics are taken in due order
/// (first appearance in `due`, then `fresh`) and only the first `cap` non-intro topics stay.
/// Output: kept `due` ids in input order, then kept `fresh` ids in input order. `records` is not changed.
/// A missing `topic_of` entry makes the item its own topic; a missing `aspect_of_item` entry is `DEFAULT_ASPECT`.
pub fn topic_once(
    queue: Queue,
    topic_of: &HashMap<String, String>,
    aspect_of_item: &HashMap<String, String>,
    records: &Map<String, Value>,
    cap: Option<usize>,
) -> Queue {
    let keep = winners(&queue, topic_of, aspect_of_item, records, cap);
    let Queue { due, fresh } = queue;
    Queue { due: keep_in_order(due, &keep), fresh: keep_in_order(fresh, &keep) }
}

/// Aspect levels per topic for the topics in `members` (topic -> item ids).
///
/// Only recorded items count. An aspect with no recorded item and a topic with no recorded item are omitted.
pub fn topic_levels(
    members: &HashMap<String, Vec<String>>,
    aspect_of_item: &HashMap<String, String>,
    records: &Map<String, Value>,
) -> BTreeMap<String, TopicLevel> {
    let mut out = BTreeMap::new();
    for (topic, ids) in members {
        let mut aspects: BTreeMap<String, i64> = BTreeMap::new();
        for id in ids {
            let Some(rec) = records.get(id) else { continue };
            let s = int_field(Some(rec), "s");
            let slot = aspects.entry(aspect_name(id, aspect_of_item).to_string()).or_insert(s);
            *slot = (*slot).min(s);
        }
        if let Some(level) = aspects.values().copied().min() {
            out.insert(topic.clone(), TopicLevel { aspects, level });
        }
    }
    out
}
