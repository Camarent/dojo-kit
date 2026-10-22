mod common;
use common::{groups, json_eq, load, report};
use dojo_core::srs::*;
use serde_json::Value;

fn rec(c: &Value) -> Option<&Value> {
    match &c["input"]["rec"] {
        Value::Null => None,
        r => Some(r),
    }
}

fn ladder(c: &Value) -> Vec<i64> {
    match c["input"].get("ladder") {
        Some(l) => l.as_array().unwrap().iter().map(|x| x.as_i64().unwrap()).collect(),
        None => DEFAULT_LADDER.to_vec(),
    }
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect()
}

#[test]
fn srs_vectors() {
    let mut failures = vec![];
    for (f, cases) in groups(&load("srs.json")) {
        for c in cases {
            let i = &c["input"];
            let (now, correct) = (i["now"].as_i64().unwrap_or(0), i["correct"].as_bool().unwrap_or(false));
            let got: Value = match f.as_str() {
                "applyAnswer" => apply_answer(rec(&c), correct, now, &ladder(&c)),
                "applyPractice" => apply_practice(rec(&c), correct, now, &ladder(&c)),
                "applyRelearn" => apply_relearn(rec(&c), now, &ladder(&c)).unwrap_or(Value::Null),
                "applyPlacement" => {
                    let known = i["known"].as_bool().unwrap_or(false);
                    let seed = i["seed"].as_str().unwrap_or("0").parse::<u64>().unwrap_or(0);
                    apply_placement(rec(&c), known, now, &ladder(&c), seed)
                }
                "entityView" | "applyEntity" => {
                    serde_json::from_str::<Value>(&dojo_core::api::call(&f, &i.to_string())).unwrap()["value"].clone()
                }
                "isDue" => Value::Bool(is_due(rec(&c), now)),
                "isNew" => Value::Bool(is_new(rec(&c))),
                "weakest" => {
                    let limit = i.get("limit").and_then(Value::as_u64).map(|n| n as usize);
                    let valid = i.get("validIds");
                    serde_json::json!(weakest(&i["items"], limit, valid))
                }
                "buildQueue" if i.get("itemEntities").is_some() => {
                    serde_json::from_str::<Value>(&dojo_core::api::call("buildQueue", &i.to_string())).unwrap()["value"].clone()
                }
                "buildQueue" => {
                    let caps: Option<std::collections::HashMap<String, u32>> = i.get("unitNewCaps").map(|m| {
                        m.as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_u64().unwrap() as u32)).collect()
                    });
                    let units: Option<std::collections::HashMap<String, String>> = i.get("itemUnits").map(|m| {
                        m.as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string())).collect()
                    });
                    let q = build_queue_with_caps(&i["items"], &strings(&i["order"]), now, i["newAllowance"].as_i64().unwrap_or(0), caps.as_ref(), units.as_ref());
                    serde_json::json!({ "due": q.due, "fresh": q.fresh })
                }
                "ladderForUnit" => {
                    let course_json = &i["course"];
                    let unit_id = i["unitId"].as_str().unwrap();
                    let item_type = i.get("itemType").and_then(|v| v.as_str());
                    serde_json::json!(ladder_for_unit_json(course_json, unit_id, item_type))
                }
                other => panic!("unknown group {other}"),
            };
            if !json_eq(&got, &c["expect"]) {
                failures.push(format!("{f}/{} => got {got}", c["name"]));
            }
        }
    }
    report("srs", failures);
}
