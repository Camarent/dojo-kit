//! `SessionConfig`: `course.json` `session:{...}` merged with `session:<name>` overrides.
use crate::content::{SessionMode, SessionSettings};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

/// Prefix of override keys: `session:<name>` overrides the course key `<name>`.
pub const OVERRIDE_PREFIX: &str = "session:";
/// Default question kinds in session order.
pub const DEFAULT_SESSION_MIX: &[&str] = &["weak", "new", "due"];
/// Default questions per unit in one session.
pub const DEFAULT_PER_UNIT_MAX: u32 = 1;
/// Default repeats of one question in one session.
pub const DEFAULT_REPEAT_MAX: u32 = 1;
/// Default manual session size; 0 = unlimited.
pub const DEFAULT_SESSION_CAP: u32 = 0;
/// Default study minutes per day.
pub const DEFAULT_DAILY_MINUTES: u32 = 30;
/// Default upper bound of an auto session size.
pub const DEFAULT_SESSION_MAX: u32 = 60;
/// Default seconds per answer when no timing is recorded.
pub const DEFAULT_SEC_PER_ANSWER: u32 = 20;
/// Default days before the exam kept free of new units.
pub const DEFAULT_REVIEW_DAYS: u32 = 3;
/// Default distinct right answers before a question leaves the queue.
pub const DEFAULT_KNOWN_DISTINCT: i64 = 1;

/// Resolved session settings; every field has a named default.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct SessionConfig {
    pub session_mix: Vec<String>,
    pub per_unit_max: u32,
    pub repeat_max: u32,
    pub session_mode: SessionMode,
    pub session_cap: u32,
    pub daily_minutes: u32,
    pub session_max: u32,
    pub sec_per_answer: u32,
    pub review_days: u32,
    pub known_distinct: i64,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            session_mix: DEFAULT_SESSION_MIX.iter().map(|kind| kind.to_string()).collect(),
            per_unit_max: DEFAULT_PER_UNIT_MAX,
            repeat_max: DEFAULT_REPEAT_MAX,
            session_mode: SessionMode::default(),
            session_cap: DEFAULT_SESSION_CAP,
            daily_minutes: DEFAULT_DAILY_MINUTES,
            session_max: DEFAULT_SESSION_MAX,
            sec_per_answer: DEFAULT_SEC_PER_ANSWER,
            review_days: DEFAULT_REVIEW_DAYS,
            known_distinct: DEFAULT_KNOWN_DISTINCT,
        }
    }
}

/// Resolves the settings: course block first, then each `session:<name>` override (overrides win).
/// Keys without the prefix are ignored; a bad value or unknown name is an error.
pub fn resolve(settings: Option<&SessionSettings>, overrides: &BTreeMap<String, Value>) -> Result<SessionConfig, serde_json::Error> {
    let mut merged = match settings {
        Some(block) => match serde_json::to_value(block)? {
            Value::Object(map) => map,
            _ => Map::new(),
        },
        None => Map::new(),
    };
    for (key, value) in overrides {
        if let Some(name) = key.strip_prefix(OVERRIDE_PREFIX) {
            merged.insert(name.to_string(), value.clone());
        }
    }
    serde_json::from_value(Value::Object(merged))
}
