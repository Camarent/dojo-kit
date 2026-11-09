use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Topics config: items of the listed units that share an entity form one topic; each session asks one item per topic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TopicsConfig {
    /// Unit ids whose items are grouped into topics.
    pub units: Vec<String>,
    /// Aspect rules; an item gets the id of the first rule that matches it, or `"default"`.
    pub aspects: Vec<AspectRule>,
    /// Maximum number of topics asked per session (1..=500); absent = no cap.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_cap: Option<u32>,
}

/// One aspect of a topic: items match when they carry one of `tags` or belong to one of `units`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AspectRule {
    /// Aspect id, unique within the config.
    pub id: String,
    /// Display title for the aspect.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Item tags that place an item in this aspect; at least one of `tags` or `units` must be non-empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    /// Unit ids whose items place an item in this aspect.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub units: Option<Vec<String>>,
}
