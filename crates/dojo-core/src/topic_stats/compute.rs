use super::types::{GroupKind, StageCounts, TopicGroup, TopicStats, UnitRef, TOPIC_STATS_VERSION};
use crate::content::{Course, Item};
use crate::days::format_iso_ms;
use crate::groups::DEFAULT_LEARNED_STAGE;
use crate::srs::{int_field, is_new};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// Running totals of one group while items are added.
struct Acc {
    kind: GroupKind,
    id: String,
    label: String,
    units: BTreeSet<String>,
    counts: StageCounts,
    last: Option<i64>,
}

/// Topic statistics of `course` over `items`, read from `progress["items"]` (record per item id).
///
/// Pure: `now_ms` is the generation time and `changed_since` (epoch ms) keeps only groups
/// with a change after it. Retired items are not counted. Items with a topic group by topic;
/// items without one group by unit. Groups keep the order of their first item.
pub fn topic_stats(
    course: &Course,
    items: &[Item],
    progress: &Value,
    changed_since: Option<i64>,
    now_ms: i64,
) -> TopicStats {
    let records = progress.get("items");
    let threshold = course.learned_stage.unwrap_or(DEFAULT_LEARNED_STAGE);
    let mut order: Vec<Acc> = Vec::new();
    let mut index: BTreeMap<(bool, String), usize> = BTreeMap::new();

    for item in items.iter().filter(|i| !i.is_retired()) {
        let (kind, id, label) = match item.topic() {
            Some(topic) => (GroupKind::Topic, topic.to_string(), topic.to_string()),
            None => {
                let unit = item.unit();
                let title = course.units.iter().find(|u| u.id == unit).map_or(unit, |u| u.title.as_str());
                (GroupKind::Unit, unit.to_string(), title.to_string())
            }
        };
        let key = (matches!(kind, GroupKind::Unit), id.clone());
        let slot = match index.get(&key) {
            Some(&slot) => slot,
            None => {
                order.push(Acc { kind, id, label, units: BTreeSet::new(), counts: StageCounts::default(), last: None });
                index.insert(key, order.len() - 1);
                order.len() - 1
            }
        };
        let Some(acc) = order.get_mut(slot) else { continue };
        acc.units.insert(item.unit().to_string());
        acc.counts.total += 1;

        let rec = records.and_then(|m| m.get(item.id()));
        if is_new(rec) {
            acc.counts.unseen += 1;
            continue;
        }
        if int_field(rec, "s") >= threshold {
            acc.counts.mature += 1;
        } else {
            acc.counts.learning += 1;
        }
        let last = rec.and_then(|r| r.get("last")).and_then(Value::as_i64);
        acc.last = acc.last.max(last);
    }

    let groups = order
        .into_iter()
        .filter(|acc| changed_since.is_none_or(|since| acc.last.is_some_and(|t| t > since)))
        .map(|acc| {
            let unit = if acc.units.len() == 1 {
                UnitRef::One(acc.units.into_iter().next().unwrap_or_default())
            } else {
                UnitRef::Many(acc.units.into_iter().collect())
            };
            TopicGroup {
                kind: acc.kind,
                id: acc.id,
                label: acc.label,
                unit,
                items: acc.counts,
                last_answered: acc.last.map(format_iso_ms),
                last_changed: acc.last.map(format_iso_ms),
            }
        })
        .collect();

    TopicStats {
        v: TOPIC_STATS_VERSION,
        course: course.id.clone(),
        generated_at: format_iso_ms(now_ms),
        changed_since: changed_since.map(format_iso_ms),
        groups,
    }
}
