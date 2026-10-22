//! Group and entity logic for dojo-core.
//!
//! This module implements entity-based grouping, group caps, and progress bar counting.
//! Key principles:
//! - An entity is a set of items that belong together (e.g., a kanji and its words)
//! - Items in the same entity are introduced together and counted once
//! - Group caps count ENTITIES, not items
//! - A cap never splits an entity (all items of an admitted entity go into fresh)
//! - Items in capped groups are exempt from global and unit caps


mod counts;
mod entity;
mod queue;
#[cfg(test)]
mod queue_tests;

pub use counts::{group_counts, group_counts_scoped};
pub use entity::{entity_flags, entity_id, entity_stats, entity_stats_scoped, item_matches_bar, EntityStats};
pub use queue::{build_queue_scoped, build_queue_with_groups, shuffle_entities, Scope};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// New order for groups: file order or random.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GroupNewOrder {
    File,
    Random,
}

/// A group of units for daily new item caps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Group {
    pub id: String,
    pub title: String,
    pub units: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_per_day: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_order: Option<GroupNewOrder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_new: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extra_tags: Vec<String>,
}

/// A progress bar configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bar {
    pub title: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub units: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub learned_stage: Option<i64>,
}

/// Stage threshold for "learned" when a bar has no `learnedStage`.
pub const DEFAULT_LEARNED_STAGE: i64 = 4;

/// Learned threshold: `bar_stage`, else `course.learnedStage`, else `DEFAULT_LEARNED_STAGE`.
pub fn learned_stage_of(course: &Value, bar_stage: Option<i64>) -> i64 {
    bar_stage.or_else(|| course.get("learnedStage").and_then(Value::as_i64)).unwrap_or(DEFAULT_LEARNED_STAGE)
}

/// Counts for a group (all numbers count ENTITIES).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GroupCounts {
    pub due: usize,
    /// Entities with no record on any item.
    pub fresh: usize,
    /// Entities that can still be introduced today: min(fresh, cap - used).
    pub new_today: usize,
    /// Entities with at least one record.
    pub started: usize,
    pub total: usize,
}

/// Counts for a bar.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BarCounts {
    pub learned: usize,
    /// Entities with at least one record that are not learned.
    pub started: usize,
    pub total: usize,
}

/// Result of group_counts function.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GroupCountsResult {
    pub groups: HashMap<String, GroupCounts>,
    pub bars: Vec<BarCounts>,
}

/// Item metadata for `group_counts`.
#[derive(Debug, Clone)]
pub struct ItemMeta {
    pub id: String,
    pub unit: String,
    pub entity: String,
    pub tags: Vec<String>,
    pub retired: bool,
}
