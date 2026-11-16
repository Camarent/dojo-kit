use super::*;
use crate::{days, migrate, progress, supersedes};

// Contract: `out` is a `json!` object, so string-key assignment cannot panic.
pub(super) fn progress_call(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "emptyProgress" => Ok(progress::empty_progress()),
        "sanitize" => Ok(progress::sanitize(a).unwrap_or(Value::Null)),
        "merge" => match progress::merge(field(a, "a")?, field(a, "b")?) {
            Ok(doc) => Ok(doc),
            Err(progress::MergeError::CourseMismatch) => Ok(json!({ "error": "course_mismatch" })),
            Err(progress::MergeError::InvalidDocument) => Ok(json!({ "error": "invalid_document" })),
        },
        "migrateProgress" | "migrateDoc" => {
            let links = match links_of(a)? {
                Ok(l) => l,
                Err(done) => return Ok(done),
            };
            let result = if name == "migrateDoc" {
                let members = members_of(a)?;
                migrate::migrate_doc(field(a, "doc")?, field(a, "course")?, &links, &members, int(a, "now")?)
            } else {
                migrate::migrate_progress(field(a, "doc")?, &links)
            };
            match result {
                Ok(m) => {
                    let mut out = json!({ "folded": m.folded, "skipped": m.skipped });
                    if let (Some(obj), Some(d)) = (out.as_object_mut(), m.doc) {
                        obj.insert("doc".to_string(), d);
                    }
                    Ok(out)
                }
                Err(migrate::MigrateError::InvalidDocument) => Ok(json!({ "error": "invalid_document", "message": "not a v1 progress document" })),
            }
        }
        "unmigrate" => Ok(migrate::unmigrate(field(a, "doc")?, text(a, "id")?)),
        "dayKey" => {
            let offset = a.get("tzOffsetMin").and_then(Value::as_i64).unwrap_or(0);
            Ok(Value::String(days::day_key(int(a, "ms")?, offset as i32)))
        }
        "streak" => Ok(json!(days::streak(field(a, "days")?, text(a, "todayKey")?))),
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}


/// Supersedes links from `a.items`; the inner `Err` is the finished `bad_links` reply.
fn links_of(a: &Value) -> Result<Result<supersedes::Links, Value>, CallError> {
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
    Ok(supersedes::links_from(&items).map_err(|e| json!({ "error": "bad_links", "message": e.0 })))
}

/// `a.members`: `[{id, unit, key?}]`, `key` defaults to the id (a unit of one member is never unified).
fn members_of(a: &Value) -> Result<Vec<migrate::Member>, CallError> {
    let list = field(a, "members")?.as_array().ok_or_else(|| bad("`members` must be an array"))?;
    list.iter()
        .map(|m| {
            let id = text(m, "id")?.to_string();
            let key = m.get("key").and_then(Value::as_str).map_or_else(|| id.clone(), str::to_string);
            Ok(migrate::Member { id, unit: text(m, "unit")?.to_string(), key })
        })
        .collect()
}
