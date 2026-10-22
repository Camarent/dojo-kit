use super::*;
use crate::srs;

pub(super) fn srs_call(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "applyAnswer" => Ok(srs::apply_answer_drop(rec(a), flag(a, "correct"), int(a, "now")?, &ladder(a)?, drop(a)?)),
        "applyPractice" => Ok(srs::apply_practice_drop(rec(a), flag(a, "correct"), int(a, "now")?, &ladder(a)?, drop(a)?)),
        "applyRelearn" => Ok(srs::apply_relearn(rec(a), int(a, "now")?, &ladder(a)?).unwrap_or(Value::Null)),
        "applyPlacement" => Ok(srs::apply_placement(rec(a), flag(a, "known"), int(a, "now")?, &ladder(a)?, seed(a)?)),
        "entityView" => {
            let ids = active_members(a)?;
            let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
            let empty = Map::new();
            let records = a.get("records").and_then(Value::as_object).unwrap_or(&empty);
            Ok(srs::entity_view(&ids, records).unwrap_or(Value::Null))
        }
        "applyEntity" => {
            let ids = active_members(a)?;
            let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
            let empty = Map::new();
            let records = a.get("records").and_then(Value::as_object).unwrap_or(&empty);
            let mode = match text(a, "mode")? {
                "answer" => srs::EntityMode::Answer,
                "practice" => srs::EntityMode::Practice,
                "relearn" => srs::EntityMode::Relearn,
                "placement" => srs::EntityMode::Placement { seed: seed(a)? },
                other => return Err(bad(format!("unknown mode `{other}`"))),
            };
            let correct = if matches!(mode, srs::EntityMode::Placement { .. }) { flag(a, "known") || flag(a, "correct") } else { flag(a, "correct") };
            let drop = match a.get("dropOnWrong") {
                None | Some(Value::Null) => drop(a)?,
                Some(d) => d.as_i64().filter(|n| *n >= 0).ok_or_else(|| bad("`dropOnWrong` must be a non-negative integer"))?,
            };
            Ok(Value::Object(srs::apply_entity(&ids, records, mode, correct, int(a, "now")?, &ladder(a)?, drop)))
        }
        "isDue" => Ok(Value::Bool(srs::is_due(rec(a), int(a, "now")?))),
        "isNew" => Ok(Value::Bool(srs::is_new(rec(a)))),
        "weakest" => {
            let limit = a.get("limit").and_then(Value::as_u64).map(|n| n as usize);
            Ok(json!(srs::weakest(field(a, "items")?, limit, a.get("validIds"))))
        }
        "ladderForUnit" => {
            let course_json = field(a, "course")?;
            let unit_id = text(a, "unitId")?;
            let item_type = a.get("itemType").and_then(Value::as_str);
            let ladder = srs::ladder_for_unit_json(course_json, unit_id, item_type);
            Ok(Value::Array(ladder.iter().map(|&v| Value::from(v)).collect()))
        },
        "dropForUnit" => {
            let unit_id = text(a, "unitId")?;
            let item_type = a.get("itemType").and_then(Value::as_str);
            Ok(Value::from(srs::drop_for_unit_json(field(a, "course")?, unit_id, item_type)))
        },
        "unitConfig" => {
            let course_json = field(a, "course")?;
            let unit_id = text(a, "unitId")?;
            Ok(srs::unit_config(course_json, unit_id))
        },
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}

