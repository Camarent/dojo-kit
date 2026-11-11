use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Spaced-repetition settings; `ladder` holds intervals in milliseconds, indexed by stage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SrsConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ladder: Option<Vec<i64>>,
    /// Stages lost on a wrong answer (default 1; 0 keeps the stage).
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "dropOnWrong")]
    pub drop_on_wrong: Option<i64>,
    /// `"item"` (default) schedules every item alone; `"entity"` schedules all active items of an entity as one topic.
    /// Not allowed in `srsByType`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<SrsScope>,
    /// Items asked per entity slot when `scope` is `"entity"` (1..=5, default 1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drill: Option<u32>,
    /// Scheduling mode: `"ladder"` (default) or `"errorWeighted"`.
    /// Not allowed in `srsByType` (mode_by_type).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<super::media::SrsMode>,
    /// Stage a correct answer jumps to (2..=top stage of the resolved ladder). Not allowed in `srsByType`.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "jumpTo")]
    pub jump_to: Option<i64>,
    /// Lowest stage a wrong answer can drop to (1..=top stage of the resolved ladder). Not allowed in `srsByType`.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "wrongFloor")]
    pub wrong_floor: Option<i64>,
}

/// Scheduling scope of a unit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SrsScope {
    Item,
    Entity,
}
