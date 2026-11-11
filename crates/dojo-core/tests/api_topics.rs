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

/// Stage n of `small_ladder` is due `10 * n` after `NOW`.
const NOW: i64 = 1000;

fn small_ladder() -> Value {
    json!([0, 10, 20, 30, 40, 50, 60])
}

/// `base` with the keys of `extra` added.
fn with(base: Value, extra: Value) -> Value {
    let mut out = base;
    for (k, v) in extra.as_object().unwrap() {
        out[k] = v.clone();
    }
    out
}

#[test]
fn apply_answer_jump_to_moves_due_item_from_stage_one() {
    let base = json!({"correct": true, "now": NOW, "ladder": small_ladder(), "rec": {"s": 1, "due": 900, "ok": 1, "bad": 0}});
    assert_eq!(ok_value("applyAnswer", base.clone())["s"], 2, "no jumpTo: +1 stage");
    let jumped = ok_value("applyAnswer", with(base, json!({"jumpTo": 4})));
    assert_eq!(jumped["s"], 4);
    assert_eq!(jumped["due"], NOW + 40);
}

#[test]
fn apply_answer_wrong_floor_keeps_learned_item_above_floor() {
    let base = json!({"correct": false, "now": NOW, "ladder": small_ladder(), "drop": 4, "rec": {"s": 5, "due": 900, "ok": 3, "bad": 0}});
    assert_eq!(ok_value("applyAnswer", base.clone())["s"], 1, "no wrongFloor: drop to 1");
    assert_eq!(ok_value("applyAnswer", with(base, json!({"wrongFloor": 3})))["s"], 3);
}

#[test]
fn apply_practice_uses_jump_and_floor_on_graded_branch() {
    // a due record takes the graded branch, so jumpTo applies
    let due = json!({"correct": true, "now": NOW, "ladder": small_ladder(), "rec": {"s": 1, "due": 900, "ok": 1, "bad": 0}, "jumpTo": 3});
    assert_eq!(ok_value("applyPractice", due)["s"], 3);
    let learned = json!({"correct": false, "now": NOW, "ladder": small_ladder(), "drop": 4, "wrongFloor": 3, "rec": {"s": 5, "due": 900, "ok": 3, "bad": 0}});
    assert_eq!(ok_value("applyPractice", learned)["s"], 3);
}

#[test]
fn apply_entity_takes_jump_to_and_wrong_floor() {
    let jumped = json!({"members": [{"id": "a"}], "records": {"a": {"s": 1, "due": 900, "ok": 1, "bad": 0}}, "mode": "answer", "correct": true, "now": NOW, "ladder": small_ladder(), "jumpTo": 4});
    assert_eq!(ok_value("applyEntity", jumped)["a"]["s"], 4);
    let floored = json!({"members": [{"id": "a"}], "records": {"a": {"s": 5, "due": 900, "ok": 3, "bad": 0}}, "mode": "answer", "correct": false, "now": NOW, "ladder": small_ladder(), "dropOnWrong": 4, "wrongFloor": 3});
    assert_eq!(ok_value("applyEntity", floored)["a"]["s"], 3);
}

#[test]
fn negative_jump_or_floor_is_bad_args() {
    for key in ["jumpTo", "wrongFloor"] {
        let out = call("applyAnswer", with(json!({"correct": true, "now": NOW, "rec": {"s": 1, "due": 900}}), json!({ key: -1 })));
        assert_eq!(out["ok"], json!(false), "{key}: {out}");
        assert_eq!(out["error"]["code"], json!("bad_args"), "{key}: {out}");
    }
}

#[test]
fn absent_or_null_jump_and_floor_match_old_result() {
    let base = json!({"correct": false, "now": NOW, "ladder": small_ladder(), "drop": 2, "rec": {"s": 3, "due": 900, "ok": 2, "bad": 1}});
    let old = ok_value("applyAnswer", base.clone());
    assert_eq!(ok_value("applyAnswer", with(base, json!({"jumpTo": null, "wrongFloor": null}))), old);
}
