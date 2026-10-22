use super::*;
use crate::{days, migrate, progress, supersedes};

// Contract: `out` is a `json!` object, so string-key assignment cannot panic.
#[allow(clippy::indexing_slicing)]
pub(super) fn progress_call(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "emptyProgress" => Ok(progress::empty_progress()),
        "sanitize" => Ok(progress::sanitize(a).unwrap_or(Value::Null)),
        "merge" => match progress::merge(field(a, "a")?, field(a, "b")?) {
            Ok(doc) => Ok(doc),
            Err(progress::MergeError::CourseMismatch) => Ok(json!({ "error": "course_mismatch" })),
            Err(progress::MergeError::InvalidDocument) => Ok(json!({ "error": "invalid_document" })),
        },
        "migrateProgress" => {
            let list = field(a, "items")?.as_array().ok_or_else(|| bad("`items` must be an array"))?;
            let mut items = Vec::new();
            for m in list {
                let sup = match m.get("supersedes") {
                    None | Some(Value::Null) => None,
                    Some(v) => Some(strings(v, "supersedes")?),
                };
                items.push(supersedes::LinkItem {
                    id: text(m, "id")?.to_string(),
                    retired: m.get("status").and_then(Value::as_str) == Some("retired"),
                    supersedes: sup,
                });
            }
            let links = match supersedes::links_from(&items) {
                Ok(l) => l,
                Err(e) => return Ok(json!({ "error": "bad_links", "message": e.0 })),
            };
            match migrate::migrate_progress(field(a, "doc")?, &links) {
                Ok(m) => {
                    let mut out = json!({ "folded": m.folded, "skipped": m.skipped });
                    if let Some(d) = m.doc {
                        out["doc"] = d;
                    }
                    Ok(out)
                }
                Err(migrate::MigrateError::InvalidDocument) => Ok(json!({ "error": "invalid_document", "message": "not a v1 progress document" })),
            }
        }
        "dayKey" => {
            let offset = a.get("tzOffsetMin").and_then(Value::as_i64).unwrap_or(0);
            Ok(Value::String(days::day_key(int(a, "ms")?, offset as i32)))
        }
        "streak" => Ok(json!(days::streak(field(a, "days")?, text(a, "todayKey")?))),
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}

