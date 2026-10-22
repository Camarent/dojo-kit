use crate::content::{Course, Item, ItemType};
use serde::{Serialize, Deserialize};
use std::collections::{BTreeMap, HashMap};

/// Per-unit statistics.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnitStats {
    /// Unit id.
    pub id: String,
    /// Unit title.
    pub title: String,
    /// Active items per type (only types with count > 0 are included in JSON, but all types in fixed order for text).
    pub active: BTreeMap<String, usize>,
    /// Number of retired items in this unit.
    pub retired: usize,
}

/// Exam section capacity information.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExamSectionStats {
    /// Section title.
    pub title: String,
    /// Number of items requested by the section.
    pub requested: usize,
    /// Number of items available that match the section criteria.
    pub available: usize,
}

/// Total statistics across all units.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TotalStats {
    /// Total active items per type.
    pub active: BTreeMap<String, usize>,
    /// Total retired items.
    pub retired: usize,
    /// Total active items.
    pub total_active: usize,
}

/// Tag frequency entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TagCount {
    /// Tag name.
    pub tag: String,
    /// Number of items with this tag.
    pub count: usize,
}

/// Complete course statistics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Stats {
    /// Course id.
    pub course: String,
    /// Per-unit statistics, in course order.
    pub units: Vec<UnitStats>,
    /// Total statistics.
    pub totals: TotalStats,
    /// Top 10 tags by count (descending), then by name (ascending).
    pub tags: Vec<TagCount>,
    /// Exam section capacity per configured section.
    pub exam: Vec<ExamSectionStats>,
}

/// Returns true if the item's type is self-rated (currently only Card).
fn is_self_rated(item: &Item) -> bool {
    item.item_type().is_self_rated()
}

/// Computes statistics for a course given its JSON text, parsed course, and all items.
/// The items are expected to be from content/*.jsonl files; parse errors are not handled here.
pub fn compute(course: &Course, items: &[Item]) -> Stats {
    let mut unit_id_to_index: HashMap<&str, usize> = HashMap::new();
    for (idx, unit) in course.units.iter().enumerate() {
        unit_id_to_index.insert(unit.id.as_str(), idx);
    }

    // Initialize per-unit stats
    let mut unit_stats: Vec<UnitStats> = course.units.iter().map(|unit| {
        UnitStats {
            id: unit.id.clone(),
            title: unit.title.clone(),
            active: BTreeMap::new(),
            retired: 0,
        }
    }).collect();

    // Initialize totals
    let mut total_active: BTreeMap<String, usize> = ItemType::ALL.iter().map(|t| (t.as_str().to_string(), 0)).collect();
    let mut total_retired = 0;
    let mut tag_counts: HashMap<String, usize> = HashMap::new();
    let mut unit_item_count: HashMap<usize, usize> = HashMap::new();

    // Count items per unit and globally
    for item in items {
        let unit = item.unit();
        let unit_idx = match unit_id_to_index.get(unit) {
            Some(&idx) => idx,
            None => continue, // unknown unit, skip
        };

        let it = item.item_type();

        if item.is_retired() {
            unit_stats[unit_idx].retired += 1;
            total_retired += 1;
        } else {
            *unit_stats[unit_idx].active.entry(it.as_str().to_string()).or_insert(0) += 1;
            *total_active.entry(it.as_str().to_string()).or_insert(0) += 1;
            
            // Count tags
            for tag in item.tags() {
                *tag_counts.entry(tag.clone()).or_insert(0) += 1;
            }
            
            // Track unit item count
            *unit_item_count.entry(unit_idx).or_insert(0) += 1;
        }
    }

    // Sort tags: by count descending, then by name ascending, take top 10
    let mut tags: Vec<TagCount> = tag_counts.into_iter().map(|(tag, count)| TagCount { tag, count }).collect();
    tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
    let tags = tags.into_iter().take(10).collect();

    // Compute exam section capacities
    let exam = match &course.exam {
        Some(exam) => {
            let mut sections: Vec<ExamSectionStats> = Vec::new();
            for section in &exam.sections {
                let available = items.iter()
                    .filter(|item| !item.is_retired())
                    .filter(|item| !is_self_rated(item)) // due-for-exam-eligible
                    .filter(|item| section.units.as_ref().is_none_or(|units| units.iter().any(|u| u == item.unit())))
                    .filter(|item| section.tags.as_ref().is_none_or(|tags| item.tags().iter().any(|t| tags.contains(t))))
                    .filter(|item| section.types.as_ref().is_none_or(|types| types.iter().any(|t| t == item.item_type().as_str())))
                    .count();
                sections.push(ExamSectionStats {
                    title: section.title.clone(),
                    requested: section.count,
                    available,
                });
            }
            sections
        }
        None => Vec::new(),
    };

    // Convert total_active BTreeMap to ensure proper ordering
    let total_active_map: BTreeMap<String, usize> = total_active;

    Stats {
        course: course.id.clone(),
        units: unit_stats,
        totals: TotalStats {
            active: total_active_map,
            retired: total_retired,
            total_active: unit_item_count.values().sum(),
        },
        tags,
        exam,
    }
}

#[cfg(test)]
mod tests;
