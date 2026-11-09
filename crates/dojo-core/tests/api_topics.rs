use serde_json::{json, Value};

/// Calls the WASM API dispatcher and returns the parsed envelope.
fn call(name: &str, args: Value) -> Value {
    serde_json::from_str(&dojo_core::api::call(name, &args.to_string())).unwrap()
}

fn ok_value(name: &str, args: Value) -> Value {
    let out = call(name, args);
    assert_eq!(out["ok"], json!(true), "{name}: {out}");
    out["value"].clone()
}

fn course() -> Value {
    json!({
        "topics": {
            "aspects": [
                { "id": "meaning", "tags": ["vocab"] },
                { "id": "reading", "units": ["kana"] }
            ]
        }
    })
}

#[test]
fn item_aspects_maps_each_item_by_course_rules() {
    let items = json!([
        { "id": "a", "unit": "u1", "tags": ["vocab"] },
        { "id": "b", "unit": "kana", "tags": [] },
        { "id": "c", "unit": "u9", "tags": ["other"] }
    ]);
    let v = ok_value("itemAspects", json!({ "course": course(), "items": items }));
    assert_eq!(v, json!({ "a": "meaning", "b": "reading", "c": "default" }));
}

#[test]
fn item_aspects_course_without_topics_is_empty() {
    let items = json!([{ "id": "a", "unit": "u1", "tags": ["vocab"] }]);
    let v = ok_value("itemAspects", json!({ "course": {}, "items": items }));
    assert_eq!(v, json!({}));
}

#[test]
fn item_aspects_bad_rule_is_error() {
    let course = json!({ "topics": { "aspects": [{ "id": "x", "bogus": 1 }] } });
    let out = call("itemAspects", json!({ "course": course, "items": [] }));
    assert_eq!(out["ok"], json!(false));
    assert_eq!(out["error"]["code"], json!("bad_args"));
}

#[test]
fn topic_levels_min_stage_per_aspect_and_topic() {
    let items = json!([
        { "id": "a", "entity": "T" },
        { "id": "b", "entity": "T" },
        { "id": "c", "entity": "U" }
    ]);
    let records = json!({ "a": { "s": 3 }, "b": { "s": 1 }, "c": { "s": 2 } });
    let aspects = json!({ "a": "meaning", "b": "reading", "c": "meaning" });
    let v = ok_value("topicLevels", json!({ "items": items, "aspects": aspects, "records": records }));
    assert_eq!(v["T"], json!({ "aspects": { "meaning": 3, "reading": 1 }, "level": 1 }));
    assert_eq!(v["U"], json!({ "aspects": { "meaning": 2 }, "level": 2 }));
}

#[test]
fn topic_levels_ignores_retired_items() {
    let items = json!([
        { "id": "a", "entity": "T" },
        { "id": "b", "entity": "T", "retired": true },
        { "id": "c", "entity": "T", "status": "retired" }
    ]);
    let records = json!({ "a": { "s": 4 }, "b": { "s": 0 }, "c": { "s": 0 } });
    let v = ok_value("topicLevels", json!({ "items": items, "aspects": { "a": "meaning" }, "records": records }));
    assert_eq!(v, json!({ "T": { "aspects": { "meaning": 4 }, "level": 4 } }));
}

/// Three recorded items of one topic, all due.
fn due_args(topics: Value) -> Value {
    let recs = json!({
        "a": { "due": 0, "s": 1 },
        "b": { "due": 0, "s": 2 },
        "c": { "due": 0, "s": 3 }
    });
    json!({
        "order": ["a", "b", "c"],
        "items": recs,
        "now": 10,
        "newAllowance": 0,
        "itemEntities": { "a": "T", "b": "T", "c": "T" },
        "records": recs,
        "topics": topics
    })
}

#[test]
fn build_queue_without_topics_keeps_every_due_item() {
    let mut args = due_args(Value::Null);
    args.as_object_mut().unwrap().remove("topics");
    let without = ok_value("buildQueue", args.clone());
    assert_eq!(without["due"], json!(["a", "b", "c"]));
    assert!(without.get("drills").is_none());
    args["topics"] = Value::Null;
    assert_eq!(ok_value("buildQueue", args), without);
}

#[test]
fn build_queue_with_topics_keeps_one_item_of_a_topic() {
    let topics = json!({ "aspects": {}, "cap": null });
    let v = ok_value("buildQueue", due_args(topics));
    assert_eq!(v["due"], json!(["a"]));
}

#[test]
fn build_queue_bad_topics_shape_is_error() {
    let out = call("buildQueue", due_args(json!({ "aspects": [], "cap": null })));
    assert_eq!(out["ok"], json!(false));
    assert_eq!(out["error"]["code"], json!("bad_args"));
    let out = call("buildQueue", due_args(json!({ "aspects": {}, "cap": -1 })));
    assert_eq!(out["ok"], json!(false));
}
