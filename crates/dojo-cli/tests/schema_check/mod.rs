//! Test-only JSON Schema validator for `schema/topic-stats.schema.json`.
//!
//! Supports only the keywords that the committed schema uses. Any other
//! schema keyword makes [`validate`] return `Err`, so a schema change cannot
//! pass silently. Annotation keywords (`$schema`, `title`, `description`,
//! `format`, `$defs`) carry no validation and are ignored.

use serde_json::Value;

/// Keywords that only annotate or hold definitions; they assert nothing.
const ANNOTATIONS: &[&str] = &["$schema", "title", "description", "format", "$defs"];

/// Keywords this validator enforces.
const ASSERTIONS: &[&str] = &[
    "type",
    "required",
    "properties",
    "additionalProperties",
    "items",
    "enum",
    "anyOf",
    "oneOf",
    "$ref",
    "minimum",
];

/// Checks `doc` against `schema` (whose `$ref`s resolve inside `schema`).
/// The error names the JSON path of the first violation.
pub fn validate(schema: &Value, doc: &Value) -> Result<(), String> {
    reject_unknown_keywords(schema, "$")?;
    check(schema, schema, doc, "$")
}

/// Walks every subschema of `schema`, whether or not the document reaches it,
/// and errors on any keyword outside ANNOTATIONS + ASSERTIONS.
fn reject_unknown_keywords(schema: &Value, path: &str) -> Result<(), String> {
    let obj = schema
        .as_object()
        .ok_or_else(|| format!("{path}: schema is not an object"))?;
    for key in obj.keys() {
        if !ANNOTATIONS.contains(&key.as_str()) && !ASSERTIONS.contains(&key.as_str()) {
            return Err(format!("{path}: unsupported schema keyword `{key}`"));
        }
    }
    for map_kw in ["properties", "$defs", "definitions"] {
        if let Some(map) = obj.get(map_kw).and_then(Value::as_object) {
            for (name, sub) in map {
                reject_unknown_keywords(sub, &format!("{path}.{map_kw}.{name}"))?;
            }
        }
    }
    for single_kw in ["items", "additionalProperties"] {
        if let Some(sub) = obj.get(single_kw).filter(|v| v.is_object()) {
            reject_unknown_keywords(sub, &format!("{path}.{single_kw}"))?;
        }
    }
    for list_kw in ["anyOf", "oneOf"] {
        if let Some(list) = obj.get(list_kw).and_then(Value::as_array) {
            for (i, sub) in list.iter().enumerate() {
                reject_unknown_keywords(sub, &format!("{path}.{list_kw}[{i}]"))?;
            }
        }
    }
    Ok(())
}

fn check(root: &Value, schema: &Value, doc: &Value, path: &str) -> Result<(), String> {
    let obj = schema
        .as_object()
        .ok_or_else(|| format!("{path}: schema is not an object"))?;
    if let Some(r) = obj.get("$ref") {
        let target = resolve(root, r).map_err(|e| format!("{path}: {e}"))?;
        check(root, target, doc, path)?;
    }
    if let Some(t) = obj.get("type") {
        check_type(t, doc).map_err(|e| format!("{path}: {e}"))?;
    }
    if let Some(e) = obj.get("enum") {
        let options = e
            .as_array()
            .ok_or_else(|| format!("{path}: enum is not an array"))?;
        if !options.contains(doc) {
            return Err(format!("{path}: {doc} is not one of the enum values"));
        }
    }
    if let Some(m) = obj.get("minimum") {
        let min = m
            .as_f64()
            .ok_or_else(|| format!("{path}: minimum is not a number"))?;
        if let Some(n) = doc.as_f64().filter(|n| *n < min) {
            return Err(format!("{path}: {n} is below minimum {min}"));
        }
    }
    if let Some(map) = doc.as_object() {
        if let Some(req) = obj.get("required") {
            let names = req
                .as_array()
                .ok_or_else(|| format!("{path}: required is not an array"))?;
            for name in names {
                let name = name
                    .as_str()
                    .ok_or_else(|| format!("{path}: required entry is not a string"))?;
                if !map.contains_key(name) {
                    return Err(format!("{path}: missing required key `{name}`"));
                }
            }
        }
        let props = match obj.get("properties") {
            Some(p) => Some(
                p.as_object()
                    .ok_or_else(|| format!("{path}: properties is not an object"))?,
            ),
            None => None,
        };
        if let Some(props) = props {
            for (name, sub) in props {
                if let Some(value) = map.get(name) {
                    check(root, sub, value, &format!("{path}.{name}"))?;
                }
            }
        }
        if let Some(extra) = obj.get("additionalProperties") {
            let allowed = extra
                .as_bool()
                .ok_or_else(|| format!("{path}: additionalProperties must be a boolean"))?;
            if !allowed {
                for name in map.keys() {
                    if !props.is_some_and(|p| p.contains_key(name)) {
                        return Err(format!("{path}: unexpected key `{name}`"));
                    }
                }
            }
        }
    }
    if let (Some(items), Some(list)) = (obj.get("items"), doc.as_array()) {
        for (i, value) in list.iter().enumerate() {
            check(root, items, value, &format!("{path}[{i}]"))?;
        }
    }
    if let Some(any) = obj.get("anyOf") {
        let subs = branches(any, path, "anyOf")?;
        let mut errors = Vec::new();
        for sub in subs {
            match check(root, sub, doc, path) {
                Ok(()) => return Ok(()),
                Err(e) => errors.push(e),
            }
        }
        return Err(format!("{path}: no anyOf branch matched: {}", errors.join("; ")));
    }
    if let Some(one) = obj.get("oneOf") {
        let subs = branches(one, path, "oneOf")?;
        let matched = subs.iter().filter(|s| check(root, s, doc, path).is_ok()).count();
        if matched != 1 {
            return Err(format!("{path}: {matched} oneOf branches matched, expected 1"));
        }
    }
    Ok(())
}

fn branches<'a>(v: &'a Value, path: &str, kw: &str) -> Result<&'a Vec<Value>, String> {
    v.as_array()
        .ok_or_else(|| format!("{path}: {kw} is not an array"))
}

fn resolve<'a>(root: &'a Value, r: &Value) -> Result<&'a Value, String> {
    let text = r.as_str().ok_or_else(|| "$ref is not a string".to_string())?;
    let pointer = text
        .strip_prefix('#')
        .filter(|p| p.starts_with("/$defs/") || p.starts_with("/definitions/"))
        .ok_or_else(|| format!("unsupported $ref `{text}`"))?;
    root.pointer(pointer)
        .ok_or_else(|| format!("unresolved $ref `{text}`"))
}

fn check_type(t: &Value, doc: &Value) -> Result<(), String> {
    let names: Vec<&Value> = match t {
        Value::Array(list) => list.iter().collect(),
        other => vec![other],
    };
    for name in names {
        let name = name.as_str().ok_or_else(|| "type name is not a string".to_string())?;
        let ok = match name {
            "object" => doc.is_object(),
            "array" => doc.is_array(),
            "string" => doc.is_string(),
            "integer" => doc.is_i64() || doc.is_u64(),
            "number" => doc.is_number(),
            "boolean" => doc.is_boolean(),
            "null" => doc.is_null(),
            other => return Err(format!("unsupported type `{other}`")),
        };
        if ok {
            return Ok(());
        }
    }
    Err(format!("{doc} has the wrong type"))
}
