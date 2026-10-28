//! Legacy progress and id-map document parsing.

use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// Aggregation method for multiple old records mapping to the same new ID.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[derive(Default)]
pub enum Aggregate {
    /// Take the minimum value
    Min,
    /// Take the mean value
    #[default]
    Mean,
    /// Take the maximum value
    Max,
    /// Take the first value encountered
    First,
}


/// Configuration from id-map.json
#[derive(Debug, Clone)]
pub struct IdMapConfig {
    /// How to aggregate when multiple old IDs map to the same new ID
    pub aggregate: Aggregate,
    /// Length of the SRS ladder (for clamping stages)
    pub ladder_len: Option<usize>,
    /// The actual ID map: old ID -> list of new IDs
    pub map: HashMap<String, Vec<String>>,
}

impl IdMapConfig {
    pub(super) fn from_value(value: &Value) -> Result<Self, String> {
        let obj = value.as_object().ok_or_else(|| "id-map must be a JSON object".to_string())?;
        
        // Check for aggregate and ladderLen fields
        let aggregate_str = obj.get("aggregate").and_then(|v| v.as_str());
        let aggregate = match aggregate_str {
            Some("min") => Aggregate::Min,
            Some("mean") => Aggregate::Mean,
            Some("max") => Aggregate::Max,
            Some("first") => Aggregate::First,
            Some(other) => return Err(format!("invalid aggregate method: {}", other)),
            None => Aggregate::Mean,
        };
        
        let ladder_len = obj.get("ladderLen").and_then(|v| v.as_u64()).map(|n| n as usize);
        
        let map_obj = if obj.contains_key("map") {
            obj.get("map").and_then(|v| v.as_object()).ok_or_else(|| "map field must be an object".to_string())?
        } else if obj.contains_key("aggregate") || obj.contains_key("ladderLen") {
            return Err("id-map with aggregate/ladderLen must have a \"map\" field".to_string());
        } else {
            // If there's no "map" key and no config keys, treat the whole object as the map
            obj
        };
        
        let mut map = HashMap::new();
        for (old_id, new_ids_value) in map_obj {
            let new_ids = match new_ids_value {
                Value::String(s) => vec![s.clone()],
                Value::Array(arr) => arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect(),
                _ => return Err(format!("id-map value for '{}' must be a string or array of strings", old_id)),
            };
            if new_ids.is_empty() {
                return Err(format!("id-map value for '{}' must have at least one new ID", old_id));
            }
            map.insert(old_id.clone(), new_ids);
        }
        
        Ok(IdMapConfig { aggregate, ladder_len, map })
    }
}

/// Old progress record for a single item.
#[derive(Debug, Clone)]
pub struct OldRecord {
    pub s: i64,
    pub due: i64,
    pub ok: i64,
    pub bad: i64,
    pub last: i64,
}

impl OldRecord {
    pub(super) fn from_value(value: &Value) -> Result<Self, String> {
        let obj = value.as_object().ok_or_else(|| "record must be an object".to_string())?;
        
        let get_i64 = |key: &str| -> Result<i64, String> {
            obj.get(key)
                .ok_or_else(|| format!("missing required field: {}", key))?
                .as_i64()
                .ok_or_else(|| format!("field '{}' must be an integer", key))
        };
        
        Ok(OldRecord {
            s: get_i64("s")?,
            due: get_i64("due")?,
            ok: get_i64("ok")?,
            bad: get_i64("bad")?,
            last: get_i64("last")?,
        })
    }

    pub(super) fn to_value(&self) -> Value {
        json!({
            "s": self.s,
            "due": self.due,
            "ok": self.ok,
            "bad": self.bad,
            "last": self.last
        })
    }
}

/// Old progress document format.
#[derive(Debug, Clone)]
pub struct OldProgress {
    pub items: Vec<(String, OldRecord)>,
    pub stats: OldStats,
    pub settings: OldSettings,
}

#[derive(Debug, Clone)]
pub struct OldStats {
    pub days: Map<String, Value>,
    pub new_by_day: Map<String, Value>,
}

#[derive(Debug, Clone)]
pub struct OldSettings {
    pub new_per_day: Option<i64>,
    pub placement_done: Option<bool>,
    // Other settings are ignored
}

impl OldProgress {
    pub(super) fn from_value(value: &Value) -> Result<Self, String> {
        let obj = value.as_object().ok_or_else(|| "progress must be a JSON object".to_string())?;
        
        // Parse items
        let items_obj = obj.get("items").and_then(|v| v.as_object()).ok_or_else(|| "missing 'items' field".to_string())?;
        let mut items = Vec::new();
        for (id, record_value) in items_obj {
            let record = OldRecord::from_value(record_value)?;
            items.push((id.clone(), record));
        }
        
        // Parse stats
        let stats_obj = obj.get("stats").and_then(|v| v.as_object()).ok_or_else(|| "missing 'stats' field".to_string())?;
        let days = stats_obj.get("days").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        let new_by_day = stats_obj.get("newByDay").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        
        // Parse settings (only newPerDay and placementDone)
        let settings_obj = obj.get("settings").and_then(|v| v.as_object()).cloned().unwrap_or_default();
        let new_per_day = settings_obj.get("newPerDay").and_then(|v| v.as_i64());
        let placement_done = settings_obj.get("placementDone").and_then(|v| v.as_bool());
        
        Ok(OldProgress {
            items,
            stats: OldStats { days, new_by_day },
            settings: OldSettings { new_per_day, placement_done },
        })
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;


    #[test]
    fn test_id_map_parsing() {
        // Simple map
        let simple = json!({
            "old1": ["new1", "new2"],
            "old2": ["new3"]
        });
        let config = IdMapConfig::from_value(&simple).unwrap();
        assert_eq!(config.aggregate, Aggregate::Mean);
        assert_eq!(config.ladder_len, None);
        assert_eq!(config.map.get("old1"), Some(&vec!["new1".to_string(), "new2".to_string()]));
        
        // Map with aggregate and ladderLen
        let with_config = json!({
            "aggregate": "max",
            "ladderLen": 5,
            "map": {
                "old1": ["new1"]
            }
        });
        let config = IdMapConfig::from_value(&with_config).unwrap();
        assert_eq!(config.aggregate, Aggregate::Max);
        assert_eq!(config.ladder_len, Some(5));
        assert_eq!(config.map.get("old1"), Some(&vec!["new1".to_string()]));
    }

    #[test]
    fn test_old_progress_parsing() {
        let progress = json!({
            "items": {
                "i1": {"s": 2, "due": 1000, "ok": 5, "bad": 1, "last": 2000},
                "i2": {"s": 3, "due": 2000, "ok": 10, "bad": 0, "last": 3000}
            },
            "stats": {
                "days": {"2024-01-01": 5},
                "newByDay": {"2024-01-01": 2}
            },
            "settings": {
                "newPerDay": 10,
                "placementDone": true,
                "otherSetting": "ignored"
            }
        });
        let old = OldProgress::from_value(&progress).unwrap();
        assert_eq!(old.items.len(), 2);
        assert_eq!(old.stats.days.len(), 1);
        assert_eq!(old.stats.new_by_day.len(), 1);
        assert_eq!(old.settings.new_per_day, Some(10));
        assert_eq!(old.settings.placement_done, Some(true));
    }


    #[test]
    fn test_id_map_with_string_value() {
        let simple = json!({
            "old1": "new1",
            "old2": ["new2", "new3"]
        });
        let config = IdMapConfig::from_value(&simple).unwrap();
        assert_eq!(config.map.get("old1"), Some(&vec!["new1".to_string()]));
        assert_eq!(config.map.get("old2"), Some(&vec!["new2".to_string(), "new3".to_string()]));
    }
}
