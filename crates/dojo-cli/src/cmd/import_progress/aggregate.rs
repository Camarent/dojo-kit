//! Aggregation of old records and conversion to the current progress format.

use super::legacy::{Aggregate, IdMapConfig, OldProgress, OldRecord};
use dojo_core::progress::{empty_progress, sanitize};
use dojo_core::content::Item;
use dojo_core::srs::{entity_view, ladder_for_unit_json, unit_config, DEFAULT_LADDER};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// Max stage of a ladder of `len` entries.
fn max_stage_of(len: usize) -> i64 {
    i64::try_from(len.saturating_sub(1)).unwrap_or(i64::MAX)
}

fn entity_of(item: &Item) -> &str {
    item.entity().unwrap_or_else(|| item.id())
}

/// Aggregate multiple old records into one new record.
fn aggregate_records(records: &[OldRecord], method: Aggregate) -> OldRecord {
    if records.is_empty() {
        return OldRecord {
            s: 0,
            due: 0,
            ok: 0,
            bad: 0,
            last: 0,
        };
    }
    
    match method {
        Aggregate::First => records[0].clone(),
        Aggregate::Min => OldRecord {
            s: records.iter().map(|r| r.s).min().unwrap_or(0),
            due: records.iter().map(|r| r.due).min().unwrap_or(0),
            ok: records.iter().map(|r| r.ok).min().unwrap_or(0),
            bad: records.iter().map(|r| r.bad).min().unwrap_or(0),
            last: records.iter().map(|r| r.last).min().unwrap_or(0),
        },
        Aggregate::Max => OldRecord {
            s: records.iter().map(|r| r.s).max().unwrap_or(0),
            due: records.iter().map(|r| r.due).max().unwrap_or(0),
            ok: records.iter().map(|r| r.ok).max().unwrap_or(0),
            bad: records.iter().map(|r| r.bad).max().unwrap_or(0),
            last: records.iter().map(|r| r.last).max().unwrap_or(0),
        },
        Aggregate::Mean => {
            let count = records.len() as i64;
            OldRecord {
                s: (records.iter().map(|r| r.s).sum::<i64>() / count),
                due: (records.iter().map(|r| r.due).sum::<i64>() / count),
                ok: (records.iter().map(|r| r.ok).sum::<i64>() / count),
                bad: (records.iter().map(|r| r.bad).sum::<i64>() / count),
                last: (records.iter().map(|r| r.last).sum::<i64>() / count),
            }
        },
    }
}

/// Statistics from the import process.
#[derive(Debug, Clone, Default)]
pub struct ImportStats {
    pub mapped_count: usize,
    pub unmapped_count: usize,
    pub stage_histogram_before: HashMap<i64, usize>,
    pub stage_histogram_after: HashMap<i64, usize>,
    pub ok_total: i64,
    pub bad_total: i64,
}

/// Import progress from old format to new format.
pub fn import_progress(
    old_progress: &OldProgress,
    id_map: &IdMapConfig,
    course: &Value,
    now: Option<i64>,
    course_items: &[Item],
) -> (Value, Vec<String>, ImportStats) {
    let mut new_items: Map<String, Value> = Map::new();
    let mut unmapped_ids: Vec<String> = Vec::new();
    let mut stats = ImportStats::default();
    
    // Active items only: id -> (unit, type, entity); entity -> active members
    let mut by_id: BTreeMap<&str, &Item> = BTreeMap::new();
    let mut entity_members: BTreeMap<String, Vec<&str>> = BTreeMap::new();
    for item in course_items.iter().filter(|i| !i.is_retired()) {
        by_id.insert(item.id(), item);
        entity_members.entry(entity_of(item).to_string()).or_default().push(item.id());
    }
    let retired: BTreeSet<&str> = course_items.iter().filter(|i| i.is_retired()).map(Item::id).collect();
    let default_max = max_stage_of(DEFAULT_LADDER.len());
    let max_stage_for = |new_id: &str| -> i64 {
        if let Some(n) = id_map.ladder_len {
            return n.saturating_sub(1) as i64;
        }
        by_id.get(new_id).map_or(default_max, |i| {
            max_stage_of(ladder_for_unit_json(course, i.unit(), Some(i.item_type().as_str())).len())
        })
    };
    let scope_is_entity = |item: &Item| unit_config(course, item.unit()).get("scope").and_then(Value::as_str) == Some("entity");

    // Group old records by new ID
    let mut new_id_records: Vec<(String, Vec<OldRecord>)> = Vec::new();
    let mut new_id_pos: HashMap<String, usize> = HashMap::new();
    
    for (old_id, old_record) in &old_progress.items {
        if let Some(new_ids) = id_map.map.get(old_id) {
            for new_id in new_ids {
                let pos = *new_id_pos.entry(new_id.clone()).or_insert_with(|| {
                    new_id_records.push((new_id.clone(), Vec::new()));
                    new_id_records.len() - 1
                });
                new_id_records[pos].1.push(old_record.clone());
            }
            stats.mapped_count += 1;
        } else {
            unmapped_ids.push(old_id.clone());
            stats.unmapped_count += 1;
        }
    }
    
    // Aggregate records for each new ID
    for (new_id, records) in &new_id_records {
        if retired.contains(new_id.as_str()) {
            continue;
        }
        let aggregated = aggregate_records(records, id_map.aggregate);
        
        // Clamp stage to max_stage
        let clamped_s = aggregated.s.clamp(0, max_stage_for(new_id));
        
        let mut record_value = aggregated.to_value();
        if let Some(obj) = record_value.as_object_mut() {
            obj.insert("s".to_string(), Value::from(clamped_s));
        }
        
        stats.stage_histogram_before.entry(aggregated.s).and_modify(|c| *c += 1).or_insert(1);
        stats.stage_histogram_after.entry(clamped_s).and_modify(|c| *c += 1).or_insert(1);
        stats.ok_total += aggregated.ok;
        stats.bad_total += aggregated.bad;
        
        new_items.insert(new_id.clone(), record_value);
    }
    
    // Entity scope: write the entity view to every active member
    let mut final_items = new_items.clone();
    let entities: BTreeSet<&str> = new_items
        .keys()
        .filter_map(|id| by_id.get(id.as_str()))
        .filter(|i| scope_is_entity(i))
        .map(|i| entity_of(i))
        .collect();
    for entity_id in entities {
        let members = &entity_members[entity_id];
        if let Some(view) = entity_view(members, &new_items) {
            for id in members {
                final_items.insert((*id).to_string(), view.clone());
            }
        }
    }
    new_items = final_items;

    // Build the new progress document
    let mut new_progress = empty_progress();
    if let Some(obj) = new_progress.as_object_mut() {
        if let Some(id) = course.get("id").and_then(Value::as_str) {
            obj.insert("course".to_string(), Value::from(id));
        }
        // Set timestamp
        if let Some(n) = now {
            obj.insert("t".to_string(), Value::from(n));
        }
        
        // Set items
        obj.insert("items".to_string(), Value::Object(new_items));
        
        // Copy stats
        let mut new_stats = Map::new();
        new_stats.insert("days".to_string(), Value::Object(old_progress.stats.days.clone()));
        new_stats.insert("newByDay".to_string(), Value::Object(old_progress.stats.new_by_day.clone()));
        obj.insert("stats".to_string(), Value::Object(new_stats));
        
        // Set settings
        let mut new_settings = Map::new();
        if let Some(new_per_day) = old_progress.settings.new_per_day {
            new_settings.insert("newPerDay".to_string(), Value::from(new_per_day));
        }
        if let Some(placement_done) = old_progress.settings.placement_done {
            new_settings.insert("placementDone".to_string(), Value::Bool(placement_done));
        }
        new_settings.insert("t".to_string(), Value::from(0));
        obj.insert("settings".to_string(), Value::Object(new_settings));
    }
    
    // Sanitize the result
    if let Some(sanitized) = sanitize(&new_progress) {
        (sanitized, unmapped_ids, stats)
    } else {
        // If sanitization fails, return the unsanitized version with a warning
        (new_progress, unmapped_ids, stats)
    }
}

/// Format a histogram for display.
fn format_histogram(hist: &HashMap<i64, usize>, label: &str) -> String {
    let mut entries: Vec<(i64, usize)> = hist.iter().map(|(k, v)| (*k, *v)).collect();
    entries.sort_by_key(|e| e.0);
    let parts: Vec<String> = entries.iter().map(|(k, v)| format!("s{k}: {v}")).collect();
    if parts.is_empty() {
        format!("{}: (none)", label)
    } else {
        format!("{}: {}", label, parts.join(", "))
    }
}

/// Generate a report for dry-run mode.
pub fn generate_report(
    _old_progress: &OldProgress,
    unmapped_ids: &[String],
    stats: &ImportStats,
) -> String {
    let mut report = Vec::new();
    
    report.push(format!("Mapped: {}", stats.mapped_count));
    report.push(format!("Unmapped: {}", stats.unmapped_count));
    
    if !unmapped_ids.is_empty() {
        let show_count = std::cmp::min(20, unmapped_ids.len());
        let shown: Vec<String> = unmapped_ids.iter().take(show_count).cloned().collect();
        report.push(format!("First {} unmapped IDs: {}", show_count, shown.join(", ")));
        if unmapped_ids.len() > 20 {
            report.push(format!("... and {} more", unmapped_ids.len() - 20));
        }
    }
    
    report.push(format_histogram(&stats.stage_histogram_before, "Stage histogram (before clamping)"));
    report.push(format_histogram(&stats.stage_histogram_after, "Stage histogram (after clamping)"));
    report.push(format!("Total ok: {}", stats.ok_total));
    report.push(format!("Total bad: {}", stats.bad_total));
    
    report.join("\n")
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aggregation_min() {
        let records = vec![
            OldRecord { s: 1, due: 100, ok: 5, bad: 2, last: 1000 },
            OldRecord { s: 3, due: 300, ok: 10, bad: 1, last: 3000 },
            OldRecord { s: 2, due: 200, ok: 8, bad: 3, last: 2000 },
        ];
        let agg = aggregate_records(&records, Aggregate::Min);
        assert_eq!(agg.s, 1);
        assert_eq!(agg.due, 100);
        assert_eq!(agg.ok, 5);
        assert_eq!(agg.bad, 1);
        assert_eq!(agg.last, 1000);
    }

    #[test]
    fn test_aggregation_max() {
        let records = vec![
            OldRecord { s: 1, due: 100, ok: 5, bad: 2, last: 1000 },
            OldRecord { s: 3, due: 300, ok: 10, bad: 1, last: 3000 },
        ];
        let agg = aggregate_records(&records, Aggregate::Max);
        assert_eq!(agg.s, 3);
        assert_eq!(agg.due, 300);
        assert_eq!(agg.ok, 10);
        assert_eq!(agg.bad, 2);
        assert_eq!(agg.last, 3000);
    }

    #[test]
    fn test_aggregation_mean() {
        let records = vec![
            OldRecord { s: 1, due: 100, ok: 5, bad: 2, last: 1000 },
            OldRecord { s: 3, due: 300, ok: 10, bad: 1, last: 3000 },
        ];
        let agg = aggregate_records(&records, Aggregate::Mean);
        assert_eq!(agg.s, 2);  // (1+3)/2 = 2
        assert_eq!(agg.due, 200); // (100+300)/2 = 200
        assert_eq!(agg.ok, 7);   // (5+10)/2 = 7 (integer division)
        assert_eq!(agg.bad, 1);  // (2+1)/2 = 1 (integer division)
        assert_eq!(agg.last, 2000); // (1000+3000)/2 = 2000
    }

    #[test]
    fn test_aggregation_first() {
        let records = vec![
            OldRecord { s: 1, due: 100, ok: 5, bad: 2, last: 1000 },
            OldRecord { s: 3, due: 300, ok: 10, bad: 1, last: 3000 },
        ];
        let agg = aggregate_records(&records, Aggregate::First);
        assert_eq!(agg.s, 1);
        assert_eq!(agg.due, 100);
    }
}
