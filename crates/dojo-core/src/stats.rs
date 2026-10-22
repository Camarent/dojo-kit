use crate::content::{Course, Item, ItemType, Status};
use serde::{Serialize, Deserialize};
use std::collections::{BTreeMap, HashMap};

/// Fixed order for item types in stats output.
const TYPE_ORDER: [ItemType; 8] = [
    ItemType::Choice,
    ItemType::Gap,
    ItemType::Card,
    ItemType::Multi,
    ItemType::Match,
    ItemType::Order,
    ItemType::Cloze,
    ItemType::Numeric,
];

/// Type name for a given ItemType.
fn type_name(t: ItemType) -> &'static str {
    match t {
        ItemType::Choice => "choice",
        ItemType::Gap => "gap",
        ItemType::Card => "card",
        ItemType::Multi => "multi",
        ItemType::Match => "match",
        ItemType::Order => "order",
        ItemType::Cloze => "cloze",
        ItemType::Numeric => "numeric",
    }
}

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

/// Returns the item's unit.
fn item_unit(item: &Item) -> &str {
    match item {
        Item::Choice(i) => &i.unit,
        Item::Gap(i) => &i.unit,
        Item::Card(i) => &i.unit,
        Item::Multi(i) => &i.unit,
        Item::Match(i) => &i.unit,
        Item::Order(i) => &i.unit,
        Item::Cloze(i) => &i.unit,
        Item::Numeric(i) => &i.unit,
    }
}

/// Returns the item's type.
fn item_type(item: &Item) -> ItemType {
    match item {
        Item::Choice(_) => ItemType::Choice,
        Item::Gap(_) => ItemType::Gap,
        Item::Card(_) => ItemType::Card,
        Item::Multi(_) => ItemType::Multi,
        Item::Match(_) => ItemType::Match,
        Item::Order(_) => ItemType::Order,
        Item::Cloze(_) => ItemType::Cloze,
        Item::Numeric(_) => ItemType::Numeric,
    }
}

/// Returns the item's tags.
fn item_tags(item: &Item) -> &[String] {
    match item {
        Item::Choice(i) => &i.tags,
        Item::Gap(i) => &i.tags,
        Item::Card(i) => &i.tags,
        Item::Multi(i) => &i.tags,
        Item::Match(i) => &i.tags,
        Item::Order(i) => &i.tags,
        Item::Cloze(i) => &i.tags,
        Item::Numeric(i) => &i.tags,
    }
}

/// Returns true if the item is retired.
fn is_retired(item: &Item) -> bool {
    let status = match item {
        Item::Choice(i) => i.status,
        Item::Gap(i) => i.status,
        Item::Card(i) => i.status,
        Item::Multi(i) => i.status,
        Item::Match(i) => i.status,
        Item::Order(i) => i.status,
        Item::Cloze(i) => i.status,
        Item::Numeric(i) => i.status,
    };
    status == Some(Status::Retired)
}

/// Returns true if the item's type is self-rated (currently only Card).
fn is_self_rated(item: &Item) -> bool {
    item_type(item).is_self_rated()
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
    let mut total_active: BTreeMap<String, usize> = TYPE_ORDER.iter().map(|t| (type_name(*t).to_string(), 0)).collect();
    let mut total_retired = 0;
    let mut tag_counts: HashMap<String, usize> = HashMap::new();
    let mut unit_item_count: HashMap<usize, usize> = HashMap::new();

    // Count items per unit and globally
    for item in items {
        let unit = item_unit(item);
        let unit_idx = match unit_id_to_index.get(unit) {
            Some(&idx) => idx,
            None => continue, // unknown unit, skip
        };

        let it = item_type(item);
        let type_name = type_name(it);

        if is_retired(item) {
            unit_stats[unit_idx].retired += 1;
            total_retired += 1;
        } else {
            *unit_stats[unit_idx].active.entry(type_name.to_string()).or_insert(0) += 1;
            *total_active.entry(type_name.to_string()).or_insert(0) += 1;
            
            // Count tags
            for tag in item_tags(item) {
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
                    .filter(|item| !is_retired(item))
                    .filter(|item| !is_self_rated(item)) // due-for-exam-eligible
                    .filter(|item| section.units.as_ref().is_none_or(|units| units.iter().any(|u| u == item_unit(item))))
                    .filter(|item| section.tags.as_ref().is_none_or(|tags| item_tags(item).iter().any(|t| tags.contains(t))))
                    .filter(|item| section.types.as_ref().is_none_or(|types| types.iter().any(|t| t == type_name(item_type(item)))))
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
mod tests {
    use super::*;
    use crate::content::{ChoiceItem, Course, GapItem, CardItem, Status};

    fn make_course() -> Course {
        Course {
            id: "test".to_string(),
            title: "Test Course".to_string(),
            ui_language: "en".to_string(),
            detail: None,
            content_language: None,
            units: vec![
                crate::content::Unit { id: "unit-1".to_string(), title: "Unit 1".to_string(), new_per_day: None, srs: None, placement: None, detail: None, new_order: None, exam_only: None },
                crate::content::Unit { id: "unit-2".to_string(), title: "Unit 2".to_string(), new_per_day: None, srs: None, placement: None, detail: None, new_order: None, exam_only: None },
            ],
            types: None,
            srs: None,
            srs_by_type: None,
            exam: None,
            exams: vec![],
            storage: None,
            plugins: None,
            markup: None,
            normalize: None,
            speech: None,
            placement: None,
            new_order: None,
            scripts: vec![],
            allow_override: None,
            intro_new: None,
            dont_know: None,
            learned_stage: None,
            groups: vec![],
            bars: vec![],
            tag_labels: None,
            input_script: None,
            ruby: None,
            captions: None,
            breakdown: None,
        }
    }

    fn choice_item(id: &str, unit: &str) -> Item {
        Item::Choice(ChoiceItem {
            id: id.to_string(),
            unit: unit.to_string(),
            tags: vec![],
            prompt: "Test prompt".to_string(),
            explanation: None,
            source: None,
            status: None,
            supersedes: None,
            options: vec!["a".to_string(), "b".to_string()],
            answer: 0,
            meta: None,
            stimulus: None,
            speak: None,
            entity: None,
        })
    }

    fn gap_item(id: &str, unit: &str) -> Item {
        Item::Gap(GapItem {
            id: id.to_string(),
            unit: unit.to_string(),
            tags: vec![],
            prompt: "Test prompt".to_string(),
            explanation: None,
            source: None,
            status: None,
            supersedes: None,
            answers: vec!["answer".to_string()],
            retry: vec![],
            normalize: None,
            meta: None,
            stimulus: None,
            speak: None,
            entity: None,
        })
    }

    fn card_item(id: &str, unit: &str, retired: bool) -> Item {
        Item::Card(CardItem {
            id: id.to_string(),
            unit: unit.to_string(),
            tags: vec![],
            prompt: "Test prompt".to_string(),
            explanation: None,
            source: None,
            status: if retired { Some(Status::Retired) } else { None },
            supersedes: None,
            back: "answer".to_string(),
            meta: None,
            stimulus: None,
            speak: None,
            entity: None,
        })
    }

    #[test]
    fn empty_course() {
        let course = make_course();
        let items: Vec<Item> = vec![];
        let stats = compute(&course, &items);
        assert_eq!(stats.course, "test");
        assert_eq!(stats.units.len(), 2);
        assert_eq!(stats.units[0].id, "unit-1");
        assert_eq!(stats.units[0].active.len(), 0);
        assert_eq!(stats.units[0].retired, 0);
        assert_eq!(stats.totals.total_active, 0);
        assert_eq!(stats.totals.retired, 0);
        assert_eq!(stats.exam.len(), 0);
    }

    #[test]
    fn single_choice_item() {
        let course = make_course();
        let items = vec![choice_item("u1-1", "unit-1")];
        let stats = compute(&course, &items);
        assert_eq!(stats.totals.total_active, 1);
        assert_eq!(stats.totals.active.get("choice"), Some(&1));
        assert_eq!(stats.units[0].active.get("choice"), Some(&1));
        assert_eq!(stats.units[1].active.get("choice"), None);
    }

    #[test]
    fn mixed_items() {
        let course = make_course();
        let items = vec![
            choice_item("u1-1", "unit-1"),
            gap_item("u1-2", "unit-1"),
            card_item("u2-1", "unit-2", false),
        ];
        let stats = compute(&course, &items);
        assert_eq!(stats.totals.total_active, 3);
        assert_eq!(stats.totals.active.get("choice"), Some(&1));
        assert_eq!(stats.totals.active.get("gap"), Some(&1));
        assert_eq!(stats.totals.active.get("card"), Some(&1));
        assert_eq!(stats.units[0].active.get("choice"), Some(&1));
        assert_eq!(stats.units[0].active.get("gap"), Some(&1));
        assert_eq!(stats.units[1].active.get("card"), Some(&1));
    }

    #[test]
    fn retired_item() {
        let course = make_course();
        let items = vec![
            choice_item("u1-1", "unit-1"),
            card_item("u1-2", "unit-1", true),
        ];
        let stats = compute(&course, &items);
        assert_eq!(stats.totals.total_active, 1);
        assert_eq!(stats.totals.retired, 1);
        assert_eq!(stats.units[0].retired, 1);
        assert_eq!(stats.totals.active.get("choice"), Some(&1));
        assert_eq!(stats.totals.active.get("card"), Some(&0));
    }

    #[test]
    fn self_rated_not_exam_eligible() {
        use crate::exam::Section;
        let course = Course {
            id: "test".to_string(),
            title: "Test".to_string(),
            ui_language: "en".to_string(),
            detail: None,
            content_language: None,
            units: vec![crate::content::Unit { id: "unit-1".to_string(), title: "Unit 1".to_string(), new_per_day: None, srs: None, placement: None, detail: None, new_order: None, exam_only: None }],
            types: None,
            srs: None,
            srs_by_type: None,
            exam: Some(crate::content::ExamConfig {
                id: "default".to_string(),
                title: None,
                minutes: Some(10),
                pass_mark: Some(0.7),
                sections: vec![Section {
                    title: "Test Section".to_string(),
                    count: 10,
                    units: None,
                    tags: None,
                    types: None,
                }],
                timing: None,
                scoring: vec![],
                pass_points: None,
                note: None,
                pass: None,
            }),
            exams: vec![],
            storage: None,
            plugins: None,
            markup: None,
            normalize: None,
            speech: None,
            placement: None,
            new_order: None,
            scripts: vec![],
            allow_override: None,
            intro_new: None,
            dont_know: None,
            learned_stage: None,
            groups: vec![],
            bars: vec![],
            tag_labels: None,
            input_script: None,
            ruby: None,
            captions: None,
            breakdown: None,
        };
        let items = vec![
            choice_item("u1-1", "unit-1"),
            card_item("u1-2", "unit-1", false),
        ];
        let stats = compute(&course, &items);
        assert_eq!(stats.exam.len(), 1);
        assert_eq!(stats.exam[0].title, "Test Section");
        assert_eq!(stats.exam[0].requested, 10);
        assert_eq!(stats.exam[0].available, 1); // Only choice is eligible, not card
    }

    #[test]
    fn tags_counted() {
        let course = make_course();
        let mut choice = choice_item("u1-1", "unit-1");
        if let Item::Choice(ref mut c) = choice {
            c.tags = vec!["tag1".to_string(), "tag2".to_string()];
        }
        let items = vec![choice];
        let stats = compute(&course, &items);
        assert_eq!(stats.tags.len(), 2);
        let tag1_count = stats.tags.iter().find(|t| t.tag == "tag1").map(|t| t.count);
        let tag2_count = stats.tags.iter().find(|t| t.tag == "tag2").map(|t| t.count);
        assert_eq!(tag1_count, Some(1));
        assert_eq!(tag2_count, Some(1));
    }
}
