use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Version of the topic-stats JSON layout written in `TopicStats::v`.
pub const TOPIC_STATS_VERSION: i64 = 1;

/// Topic statistics document for one course.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct TopicStats {
    /// Layout version, see `TOPIC_STATS_VERSION`.
    pub v: i64,
    /// Course id.
    pub course: String,
    /// Generation time (ISO 8601).
    pub generated_at: String,
    /// Start of the incremental window, or null for a full run.
    #[schemars(required, schema_with = "nullable_string")]
    pub changed_since: Option<String>,
    /// One entry per topic or unit group.
    pub groups: Vec<TopicGroup>,
}

/// Kind of a topic group.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum GroupKind {
    Topic,
    Unit,
}

/// Unit reference of a group: one unit id, or a list when the group spans units.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum UnitRef {
    One(String),
    Many(Vec<String>),
}

/// Statistics of one topic or unit group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct TopicGroup {
    /// Group kind.
    pub kind: GroupKind,
    /// Group id.
    pub id: String,
    /// Human-readable label.
    pub label: String,
    /// Unit id, or unit ids for a group spanning units.
    pub unit: UnitRef,
    /// Item counts per learning stage.
    pub items: StageCounts,
    /// Time of the last answer in the group, or null.
    #[schemars(required, schema_with = "nullable_string")]
    pub last_answered: Option<String>,
    /// Time of the last content change in the group, or null.
    #[schemars(required, schema_with = "nullable_string")]
    pub last_changed: Option<String>,
}

/// Schema of an `Option<String>` field that serialises as `null` when empty.
fn nullable_string(_gen: &mut schemars::SchemaGenerator) -> schemars::Schema {
    schemars::json_schema!({"type": ["string", "null"]})
}

/// Item counts per learning stage.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct StageCounts {
    pub total: u64,
    pub unseen: u64,
    pub learning: u64,
    pub mature: u64,
}
