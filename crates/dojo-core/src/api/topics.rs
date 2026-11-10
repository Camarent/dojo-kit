use super::*;
use crate::groups;

/// Topic calls: `itemAspects`, `topicLevels`. The `topics` argument of `buildQueue` is parsed here too.
pub(super) fn topics_call(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "itemAspects" => item_aspects(a),
        "topicLevels" => topic_levels_call(a),
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}

/// Parsed `topics` argument of `buildQueue`: `{aspects: {id: aspect}, pools: [aspect], cap: n | null}`.
pub(super) struct QueueTopics {
    pub aspects: HashMap<String, String>,
    pub pools: HashSet<String>,
    pub cap: Option<usize>,
}

/// `None` when `topics` is absent or null; otherwise the parsed object.
pub(super) fn queue_topics(a: &Value) -> Result<Option<QueueTopics>, CallError> {
    let obj = match a.get("topics") {
        None | Some(Value::Null) => return Ok(None),
        Some(Value::Object(obj)) => obj,
        Some(_) => return Err(bad("`topics` must be an object")),
    };
    let aspects = aspect_map(obj.get("aspects").ok_or_else(|| bad("`topics.aspects` is required"))?, "topics.aspects")?;
    let pools: HashSet<String> = match obj.get("pools") {
        None | Some(Value::Null) => HashSet::new(),
        Some(v) => strings(v, "topics.pools")?.into_iter().collect(),
    };
    let cap = match obj.get("cap") {
        None | Some(Value::Null) => None,
        Some(v) => {
            let n = v.as_u64().and_then(|n| usize::try_from(n).ok());
            Some(n.ok_or_else(|| bad("`topics.cap` must be an integer >= 0 or null"))?)
        }
    };
    Ok(Some(QueueTopics { aspects, pools, cap }))
}

/// `records` of a call: absent or null gives `empty`; any other non-object is an error.
pub(super) fn records_ref<'a>(a: &'a Value, empty: &'a Map<String, Value>) -> Result<&'a Map<String, Value>, CallError> {
    match a.get("records") {
        None | Some(Value::Null) => Ok(empty),
        Some(Value::Object(m)) => Ok(m),
        Some(_) => Err(bad("`records` must be an object")),
    }
}

fn aspect_map(v: &Value, what: &str) -> Result<HashMap<String, String>, CallError> {
    let obj = v.as_object().ok_or_else(|| bad(format!("`{what}` must be an object")))?;
    obj.iter()
        .map(|(k, s)| s.as_str().map(|s| (k.clone(), s.to_string())).ok_or_else(|| bad(format!("`{what}` values must be strings"))))
        .collect()
}

fn item_list(a: &Value) -> Result<&Vec<Value>, CallError> {
    field(a, "items")?.as_array().ok_or_else(|| bad("`items` must be an array"))
}

fn item_str<'a>(item: &'a Value, key: &str) -> Result<&'a str, CallError> {
    item.get(key).and_then(Value::as_str).ok_or_else(|| bad(format!("item `{key}` must be a string")))
}

/// Course aspect rules from `course.topics.aspects`; `None` when the course has no topics.
fn course_rules(course: &Value) -> Result<Option<Vec<groups::AspectRule>>, CallError> {
    let aspects = match course.get("topics").and_then(|t| t.get("aspects")) {
        None | Some(Value::Null) => return Ok(None),
        Some(v) => v.as_array().ok_or_else(|| bad("`course.topics.aspects` must be an array"))?,
    };
    aspects
        .iter()
        .map(|r| serde_json::from_value(r.clone()).map_err(|e| bad(format!("bad aspect rule: {e}"))))
        .collect::<Result<_, _>>()
        .map(Some)
}

fn item_aspects(a: &Value) -> Result<Value, CallError> {
    let Some(rules) = course_rules(field(a, "course")?)? else {
        return Ok(Value::Object(Map::new()));
    };
    let mut out = Map::new();
    for item in item_list(a)? {
        let id = item_str(item, "id")?;
        let unit = match item.get("unit") {
            None | Some(Value::Null) => "",
            Some(v) => v.as_str().ok_or_else(|| bad("item `unit` must be a string"))?,
        };
        let tags = match item.get("tags") {
            None | Some(Value::Null) => Vec::new(),
            Some(v) => strings(v, "tags")?,
        };
        out.insert(id.to_string(), Value::String(groups::aspect_of(&tags, unit, &rules)));
    }
    Ok(Value::Object(out))
}

fn is_retired(item: &Value) -> bool {
    item.get("retired").and_then(Value::as_bool).unwrap_or(false) || item.get("status").and_then(Value::as_str) == Some("retired")
}

fn topic_levels_call(a: &Value) -> Result<Value, CallError> {
    let aspects = aspect_map(field(a, "aspects")?, "aspects")?;
    let mut members: HashMap<String, Vec<String>> = HashMap::new();
    for item in item_list(a)? {
        if is_retired(item) {
            continue;
        }
        let id = item_str(item, "id")?;
        let entity = item_str(item, "entity")?;
        members.entry(entity.to_string()).or_default().push(id.to_string());
    }
    let empty = Map::new();
    let levels = groups::topic_levels(&members, &aspects, records_ref(a, &empty)?);
    serde_json::to_value(levels).map_err(|e| bad(e.to_string()))
}
