use super::*;
use crate::exam;

pub(super) fn exam_call(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "splitmix64" => {
            let mut state = seed(a)?;
            let n = int(a, "n")?.clamp(0, 10_000);
            Ok(Value::Array((0..n).map(|_| Value::String(exam::splitmix64(&mut state).to_string())).collect()))
        }
        "sample" => sample(a),
        "score" => score(a),
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}

fn sample(a: &Value) -> Result<Value, CallError> {
    let mut candidates = Vec::new();
    for c in field(a, "candidates")?.as_array().ok_or_else(|| bad("`candidates` must be an array"))? {
        candidates.push(exam::Candidate {
            id: text(c, "id")?.to_string(),
            unit: text(c, "unit")?.to_string(),
            tags: strings(field(c, "tags")?, "tags")?,
            item_type: text(c, "type")?.to_string(),
            stimulus: opt_string(c, "stimulus")?,
            exam_only: opt_bool(c, "examOnly")?,
        });
    }
    let mut sections = Vec::new();
    for s in field(a, "sections")?.as_array().ok_or_else(|| bad("`sections` must be an array"))? {
        sections.push(exam::Section {
            title: text(s, "title")?.to_string(),
            count: int(s, "count")?.max(0) as usize,
            units: opt_strings(s, "units")?,
            tags: opt_strings(s, "tags")?,
            types: opt_strings(s, "types")?,
        });
    }
    let r = exam::sample(&candidates, &sections, seed(a)?);
    let short: Vec<Value> = r.short.iter().map(|s| json!({ "title": s.title, "shortBy": s.short_by })).collect();
    let sections_out: Vec<Value> = r.sections.iter().map(|s| json!({ "title": s.title, "start": s.start, "count": s.count })).collect();
    let mut out = Map::new();
    out.insert("ids".into(), json!(r.ids));
    out.insert("short".into(), Value::Array(short));
    out.insert("sections".into(), Value::Array(sections_out));
    Ok(Value::Object(out))
}

fn score(a: &Value) -> Result<Value, CallError> {
    let mut results = Vec::new();
    for r in field(a, "results")?.as_array().ok_or_else(|| bad("`results` must be an array"))? {
        results.push((text(r, "id")?.to_string(), flag(r, "correct")));
    }
    let pass_mark = match a.get("passMark") {
        None | Some(Value::Null) => exam::DEFAULT_PASS_MARK,
        Some(v) => v.as_f64().ok_or_else(|| bad("`passMark` must be a number"))?,
    };
    let total = int(a, "total")?.max(0) as usize;

    let scoring = match a.get("scoring") {
        None | Some(Value::Null) => {
            return Ok(serde_json::to_value(exam::score(&results, total, pass_mark)).unwrap());
        }
        Some(v) => v.as_array().ok_or_else(|| bad("`scoring` must be an array"))?,
    };
    if scoring.is_empty() {
        return Err(bad("`scoring` must not be empty"));
    }
    let mut section_ranges = Vec::new();
    for s in field(a, "sections")?.as_array().ok_or_else(|| bad("`sections` must be an array"))? {
        section_ranges.push(exam::SectionRange { title: text(s, "title")?.to_string(), start: count(s, "start")?, count: count(s, "count")? });
    }
    let mut parts = Vec::new();
    for (idx, sp) in scoring.iter().enumerate() {
        let obj = sp.as_object().ok_or_else(|| bad(format!("scoring[{idx}] must be an object")))?;
        let sections = match obj.get("sections") {
            Some(Value::Array(arr)) => arr
                .iter()
                .map(|s| s.as_str().map(String::from).ok_or_else(|| bad(format!("scoring[{idx}].sections must be strings"))))
                .collect::<Result<Vec<_>, _>>()?,
            _ => return Err(bad(format!("scoring[{idx}].sections must be an array of strings"))),
        };
        parts.push(crate::content::ScoringPart {
            title: obj.get("title").and_then(Value::as_str).ok_or_else(|| bad(format!("scoring[{idx}].title must be a string")))?.to_string(),
            sections,
            points: obj.get("points").and_then(Value::as_u64).ok_or_else(|| bad(format!("scoring[{idx}].points must be a non-negative integer"))).and_then(|v| u32::try_from(v).map_err(|_| bad(format!("scoring[{idx}].points {} is too large for u32", v))))?,
            min_points: match obj.get("minPoints") {
                None | Some(Value::Null) => None,
                Some(v) => Some(v.as_u64().ok_or_else(|| bad(format!("scoring[{idx}].minPoints must be a non-negative integer"))).and_then(|v| u32::try_from(v).map_err(|_| bad(format!("scoring[{idx}].minPoints {} is too large for u32", v))))?),
            },
        });
    }
    let pass_points = match a.get("passPoints") {
        None | Some(Value::Null) => None,
        Some(v) => Some(v.as_i64().ok_or_else(|| bad("`passPoints` must be an integer"))?),
    };
    let pass_rule = match a.get("pass") {
        None | Some(Value::Null) => None,
        Some(v) => {
            let rule: crate::content::PassRule = serde_json::from_value(v.clone()).map_err(|e| bad(format!("pass: {}", e)))?;
            Some(rule)
        }
    };
    let has_scoring = !scoring.is_empty();
    let mode = exam::resolve_mode(pass_rule.as_ref(), has_scoring);
    let s = exam::score_with_parts(
        &results,
        total,
        pass_mark,
        exam::PartsInput {
            section_ranges: &section_ranges,
            scoring_parts: &parts,
            pass_points,
            pass_mode: mode,
            scaled: pass_rule.as_ref().and_then(|r| r.scaled) == Some(true),
        },
    ).map_err(bad)?;
    Ok(serde_json::to_value(s).unwrap())
}

