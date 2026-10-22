use crate::{check, days, exam, groups, progress, srs};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};

struct CallError {
    code: &'static str,
    message: String,
}

fn bad(message: impl Into<String>) -> CallError {
    CallError { code: "bad_args", message: message.into() }
}

/// Runs the named core function on JSON `args` and returns the JSON envelope
/// `{"ok":true,"value":..}` or `{"ok":false,"error":{"code":..,"message":..}}`.
pub fn call(name: &str, args: &str) -> String {
    let result = match serde_json::from_str::<Value>(args) {
        Ok(value) => dispatch(name, &value),
        Err(e) => Err(CallError { code: "bad_json", message: e.to_string() }),
    };
    match result {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(e) => json!({ "ok": false, "error": { "code": e.code, "message": e.message } }),
    }
    .to_string()
}

fn field<'a>(args: &'a Value, key: &str) -> Result<&'a Value, CallError> {
    args.get(key).ok_or_else(|| bad(format!("missing argument `{key}`")))
}

fn rec<'a>(args: &'a Value) -> Option<&'a Value> {
    args.get("rec").filter(|v| !v.is_null())
}

fn int(args: &Value, key: &str) -> Result<i64, CallError> {
    let v = field(args, key)?;
    v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)).ok_or_else(|| bad(format!("`{key}` must be a number")))
}

fn text<'a>(args: &'a Value, key: &str) -> Result<&'a str, CallError> {
    field(args, key)?.as_str().ok_or_else(|| bad(format!("`{key}` must be a string")))
}

fn flag(args: &Value, key: &str) -> bool {
    args.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn strings(v: &Value, what: &str) -> Result<Vec<String>, CallError> {
    let list = v.as_array().ok_or_else(|| bad(format!("`{what}` must be an array of strings")))?;
    list.iter()
        .map(|s| s.as_str().map(str::to_string).ok_or_else(|| bad(format!("`{what}` must be an array of strings"))))
        .collect()
}

fn opt_bool(v: &Value, key: &str) -> Result<bool, CallError> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(b) => b.as_bool().ok_or_else(|| bad(format!("`{key}` must be a boolean"))),
    }
}

fn opt_string(v: &Value, key: &str) -> Result<Option<String>, CallError> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(s) => s.as_str().map(|s| Some(s.to_string())).ok_or_else(|| bad(format!("`{key}` must be a string"))),
    }
}

fn opt_strings(v: &Value, key: &str) -> Result<Option<Vec<String>>, CallError> {
    v.get(key).map(|s| strings(s, key)).transpose()
}

fn indices(v: &Value, what: &str) -> Result<Vec<usize>, CallError> {
    let list = v.as_array().ok_or_else(|| bad(format!("`{what}` must be an array of non-negative integers")))?;
    list.iter()
        .map(|n| n.as_u64().map(|n| n as usize).ok_or_else(|| bad(format!("`{what}` must be an array of non-negative integers"))))
        .collect()
}

fn count(args: &Value, key: &str) -> Result<usize, CallError> {
    field(args, key)?.as_u64().map(|n| n as usize).ok_or_else(|| bad(format!("`{key}` must be a non-negative integer")))
}

fn seed(args: &Value) -> Result<u64, CallError> {
    text(args, "seed")?.parse().map_err(|_| bad("`seed` must be a decimal u64 string"))
}

fn drop(args: &Value) -> Result<i64, CallError> {
    match args.get("drop") {
        None | Some(Value::Null) => Ok(srs::LEGACY_VECTOR_DROP),
        Some(d) => d.as_i64().filter(|n| *n >= 0).ok_or_else(|| bad("`drop` must be a non-negative integer")),
    }
}

fn ladder(args: &Value) -> Result<Vec<i64>, CallError> {
    match args.get("ladder") {
        None | Some(Value::Null) => Ok(srs::DEFAULT_LADDER.to_vec()),
        Some(l) => l
            .as_array()
            .ok_or_else(|| bad("`ladder` must be an array of numbers"))?
            .iter()
            .map(|n| n.as_i64().ok_or_else(|| bad("`ladder` must be an array of numbers")))
            .collect(),
    }
}

fn normalize_opts(args: &Value) -> Result<check::Normalize, CallError> {
    match args.get("opts") {
        None | Some(Value::Null) => Ok(check::Normalize::default()),
        Some(o) => {
            let norm: check::Normalize = serde_json::from_value(o.clone()).map_err(|e| bad(format!("`opts`: {e}")))?;
            for (from, to) in &norm.fold {
                if !check::fold_entry_ok(from, to) {
                    return Err(bad(format!("`opts.fold` entry '{from}' -> '{to}' must be a single char or an equal-length range like 'A-Z' -> 'a-z'")));
                }
            }
            Ok(norm)
        }
    }
}

fn used_map(a: &Value) -> Result<HashMap<String, i64>, CallError> {
    match a.get("used") {
        Some(Value::Object(obj)) => obj
            .iter()
            .map(|(k, v)| v.as_i64().map(|n| (k.clone(), n)).ok_or_else(|| bad("`used` values must be integers")))
            .collect(),
        Some(Value::Null) | None => Ok(HashMap::new()),
        _ => Err(bad("`used` must be an object")),
    }
}

/// Ids of the non-retired entries of `members: [{id, status?, retired?}]`.
fn active_members(a: &Value) -> Result<Vec<String>, CallError> {
    let list = field(a, "members")?.as_array().ok_or_else(|| bad("`members` must be an array"))?;
    let mut out = Vec::new();
    for m in list {
        if flag(m, "retired") || m.get("status").and_then(Value::as_str) == Some("retired") {
            continue;
        }
        out.push(text(m, "id")?.to_string());
    }
    Ok(out)
}

fn scoped_set(a: &Value) -> Result<Option<HashSet<String>>, CallError> {
    Ok(opt_strings(a, "scopedEntities")?.map(|l| l.into_iter().collect()))
}

fn dispatch(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "emptyProgress" => Ok(progress::empty_progress()),
        "sanitize" => Ok(progress::sanitize(a).unwrap_or(Value::Null)),
        "merge" => match progress::merge(field(a, "a")?, field(a, "b")?) {
            Ok(doc) => Ok(doc),
            Err(progress::MergeError::CourseMismatch) => Ok(json!({ "error": "course_mismatch" })),
            Err(progress::MergeError::InvalidDocument) => Ok(json!({ "error": "invalid_document" })),
        },
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
        "buildQueue" => {
            let order = strings(field(a, "order")?, "order")?;
            let items = field(a, "items")?;
            let now = int(a, "now")?;
            let new_allowance = int(a, "newAllowance")?;
            
            // Parse optional unitNewCaps and itemUnits
            let unit_new_caps: Option<HashMap<String, u32>> = match a.get("unitNewCaps") {
                Some(Value::Object(obj)) => {
                    let mut map = HashMap::new();
                    for (key, value) in obj {
                        let cap = value.as_u64().ok_or_else(|| bad("`unitNewCaps` values must be integers >= 0"))?;
                        map.insert(key.clone(), u32::try_from(cap).unwrap_or(u32::MAX));
                    }
                    Some(map)
                }
                Some(Value::Null) | None => None,
                _ => return Err(bad("`unitNewCaps` must be an object")),
            };
            
            let item_units: Option<HashMap<String, String>> = match a.get("itemUnits") {
                Some(Value::Object(obj)) => {
                    let mut map = HashMap::new();
                    for (key, value) in obj {
                        let unit_id = value.as_str().ok_or_else(|| bad("`itemUnits` values must be strings"))?;
                        map.insert(key.clone(), unit_id.to_string());
                    }
                    Some(map)
                }
                Some(Value::Null) | None => None,
                _ => return Err(bad("`itemUnits` must be an object")),
            };
            
            let item_entities: Option<HashMap<String, String>> = match a.get("itemEntities") {
                Some(Value::Object(obj)) => Some(
                    obj.iter()
                        .map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())).ok_or_else(|| bad("`itemEntities` values must be strings")))
                        .collect::<Result<_, _>>()?,
                ),
                Some(Value::Null) | None => None,
                _ => return Err(bad("`itemEntities` must be an object")),
            };
            let group_new_caps: Option<HashMap<String, u32>> = match a.get("groupNewCaps") {
                Some(Value::Object(obj)) => Some(
                    obj.iter()
                        .map(|(k, v)| v.as_u64().map(|n| (k.clone(), u32::try_from(n).unwrap_or(u32::MAX))).ok_or_else(|| bad("`groupNewCaps` values must be integers >= 0")))
                        .collect::<Result<_, _>>()?,
                ),
                Some(Value::Null) | None => None,
                _ => return Err(bad("`groupNewCaps` must be an object")),
            };
            let group_units: Option<HashMap<String, Vec<String>>> = match a.get("groupUnits") {
                Some(Value::Object(obj)) => Some(obj.iter().map(|(k, v)| strings(v, "groupUnits").map(|l| (k.clone(), l))).collect::<Result<_, _>>()?),
                Some(Value::Null) | None => None,
                _ => return Err(bad("`groupUnits` must be an object")),
            };
            let random_groups: Option<HashSet<String>> = opt_strings(a, "randomGroups")?.map(|l| l.into_iter().collect());
            let used = used_map(a)?;
            let day = opt_string(a, "day")?.unwrap_or_default();
            let course_id = opt_string(a, "courseId")?.unwrap_or_default();

            let scoped_members: Option<HashMap<String, Vec<String>>> = match a.get("scopedMembers") {
                Some(Value::Object(obj)) => Some(obj.iter().map(|(k, v)| strings(v, "scopedMembers").map(|l| (k.clone(), l))).collect::<Result<_, _>>()?),
                Some(Value::Null) | None => None,
                _ => return Err(bad("`scopedMembers` must be an object")),
            };
            let scoped_drill: HashMap<String, u32> = match a.get("scopedDrill") {
                Some(Value::Object(obj)) => obj
                    .iter()
                    .map(|(k, v)| v.as_u64().map(|n| (k.clone(), u32::try_from(n).unwrap_or(u32::MAX))).ok_or_else(|| bad("`scopedDrill` values must be integers")))
                    .collect::<Result<_, _>>()?,
                Some(Value::Null) | None => HashMap::new(),
                _ => return Err(bad("`scopedDrill` must be an object")),
            };
            let scope = scoped_members.as_ref().map(|members| groups::Scope { members, drill: &scoped_drill });
            let (q, drills) = groups::build_queue_scoped(
                items, &order, now, new_allowance, unit_new_caps.as_ref(), item_units.as_ref(),
                item_entities.as_ref(), group_new_caps.as_ref(), group_units.as_ref(), random_groups.as_ref(),
                &used, &day, &course_id, scope.as_ref(),
            );
            if scope.is_some() {
                Ok(json!({ "due": q.due, "fresh": q.fresh, "drills": drills }))
            } else {
                Ok(json!({ "due": q.due, "fresh": q.fresh }))
            }
        }
        "groupCounts" => {
            let course = field(a, "course")?;
            let mut metas = Vec::new();
            for m in field(a, "items")?.as_array().ok_or_else(|| bad("`items` must be an array"))? {
                let id = text(m, "id")?.to_string();
                metas.push(groups::ItemMeta {
                    unit: text(m, "unit")?.to_string(),
                    entity: opt_string(m, "entity")?.unwrap_or_else(|| id.clone()),
                    tags: opt_strings(m, "tags")?.unwrap_or_default(),
                    retired: flag(m, "retired") || m.get("status").and_then(Value::as_str) == Some("retired"),
                    id,
                });
            }
            let empty = Map::new();
            let records = a.get("records").and_then(Value::as_object).unwrap_or(&empty);
            let extra = a.get("extraNew").and_then(Value::as_i64).unwrap_or(0);
            let r = groups::group_counts_scoped(course, &metas, records, int(a, "now")?, &used_map(a)?, extra, scoped_set(a)?.as_ref());
            let mut gmap = Map::new();
            for (id, c) in &r.groups {
                gmap.insert(id.clone(), json!({ "due": c.due, "fresh": c.fresh, "newToday": c.new_today, "started": c.started, "total": c.total }));
            }
            let titles: Vec<&str> = course
                .get("bars")
                .and_then(Value::as_array)
                .map(|l| l.iter().map(|b| b.get("title").and_then(Value::as_str).unwrap_or("")).collect())
                .unwrap_or_default();
            let bars: Vec<Value> = r
                .bars
                .iter()
                .enumerate()
                .map(|(i, b)| json!({ "title": titles.get(i).copied().unwrap_or(""), "learned": b.learned, "started": b.started, "total": b.total }))
                .collect();
            Ok(json!({ "groups": gmap, "bars": bars }))
        }
        "entityStates" => {
            let mut order: Vec<String> = Vec::new();
            let mut members: HashMap<String, Vec<String>> = HashMap::new();
            for m in field(a, "items")?.as_array().ok_or_else(|| bad("`items` must be an array"))? {
                if flag(m, "retired") || m.get("status").and_then(Value::as_str) == Some("retired") {
                    continue;
                }
                let id = text(m, "id")?.to_string();
                let ent = opt_string(m, "entity")?.unwrap_or_else(|| id.clone());
                members.entry(ent.clone()).or_insert_with(|| {
                    order.push(ent.clone());
                    Vec::new()
                }).push(id);
            }
            let empty = Map::new();
            let records = a.get("records").and_then(Value::as_object).unwrap_or(&empty);
            let learned = a.get("learnedStage").and_then(Value::as_i64).unwrap_or(groups::DEFAULT_LEARNED_STAGE);
            let now = int(a, "now")?;
            let scoped = scoped_set(a)?;
            let out: Vec<Value> = order
                .iter()
                .map(|e| {
                    let ids: Vec<&str> = members[e].iter().map(String::as_str).collect();
                    let st = groups::entity_stats_scoped(&ids, records, now, learned, scoped.as_ref().is_some_and(|s| s.contains(e)));
                    json!({ "id": e, "members": st.members, "started": st.started, "minStage": st.min_stage, "due": st.due, "learned": st.learned, "atLearned": st.at_learned })
                })
                .collect();
            Ok(Value::Array(out))
        }
        "dayKey" => {
            let offset = a.get("tzOffsetMin").and_then(Value::as_i64).unwrap_or(0);
            Ok(Value::String(days::day_key(int(a, "ms")?, offset as i32)))
        }
        "streak" => Ok(json!(days::streak(field(a, "days")?, text(a, "todayKey")?))),
        "normalize" => Ok(Value::String(check::normalize(text(a, "text")?, &normalize_opts(a)?))),
        "checkGap" => {
            let answers = strings(field(a, "answers")?, "answers")?;
            Ok(Value::Bool(check::check_gap(&answers, text(a, "input")?, &normalize_opts(a)?)))
        }
        "gapVerdict" => {
            let answers = strings(field(a, "answers")?, "answers")?;
            let retry = opt_strings(a, "retry")?.unwrap_or_default();
            let verdict = check::gap_verdict(&answers, &retry, text(a, "input")?, &normalize_opts(a)?);
            Ok(Value::String(verdict.to_string()))
        }
        "checkChoice" => {
            let (answer, selected) = (int(a, "answer")?, int(a, "selected")?);
            Ok(Value::Bool(answer >= 0 && answer == selected))
        }
        "checkMulti" => Ok(Value::Bool(check::check_multi(&indices(field(a, "correct")?, "correct")?, &indices(field(a, "selected")?, "selected")?))),
        "checkMatch" => {
            let r = check::check_match(count(a, "pairCount")?, &indices(field(a, "mapping")?, "mapping")?);
            Ok(json!({ "correct": r.correct, "wrong": r.wrong }))
        }
        "checkOrder" => {
            let r = check::check_order(count(a, "stepCount")?, &indices(field(a, "sequence")?, "sequence")?);
            Ok(json!({ "correct": r.correct, "firstWrong": r.first_wrong }))
        }
        "checkCloze" => {
            let blanks = field(a, "blanks")?
                .as_array()
                .ok_or_else(|| bad("`blanks` must be an array of string arrays"))?
                .iter()
                .map(|b| strings(b, "blanks"))
                .collect::<Result<Vec<_>, _>>()?;
            let r = check::check_cloze(&blanks, &strings(field(a, "inputs")?, "inputs")?, &normalize_opts(a)?);
            Ok(json!({ "correct": r.correct, "results": r.results }))
        }
        "checkNumeric" => {
            let answer = field(a, "answer")?.as_f64().ok_or_else(|| bad("`answer` must be a number"))?;
            let tolerance = match a.get("tolerance") {
                None | Some(Value::Null) => 0.0,
                Some(t) => t.as_f64().ok_or_else(|| bad("`tolerance` must be a number"))?,
            };
            let r = check::check_numeric(answer, tolerance, text(a, "input")?);
            Ok(json!({ "correct": r.correct, "parsed": r.parsed }))
        }
        "splitmix64" => {
            let mut state = seed(a)?;
            let n = int(a, "n")?.clamp(0, 10_000);
            Ok(Value::Array((0..n).map(|_| Value::String(exam::splitmix64(&mut state).to_string())).collect()))
        }
        "sample" => sample(a),
        "score" => score(a),
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
    let s = exam::score_with_parts(&results, total, pass_mark, &section_ranges, &parts, pass_points, mode, pass_rule.as_ref().and_then(|r| r.scaled) == Some(true)).map_err(bad)?;
    Ok(serde_json::to_value(s).unwrap())
}
