use super::*;
use crate::groups;

pub(super) fn groups_call(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "buildQueue" => build_queue(a),
        "groupCounts" => group_counts(a),
        "entityStates" => entity_states(a),
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}

fn build_queue(a: &Value) -> Result<Value, CallError> {
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

fn group_counts(a: &Value) -> Result<Value, CallError> {
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

fn entity_states(a: &Value) -> Result<Value, CallError> {
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
        let learned = groups::learned_stage_of(a, None);
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

