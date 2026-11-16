//! Session calls through `api::call`: same data as the core functions, bad args give `bad_args`.
use dojo_core::session;
use serde_json::{json, Value};

fn call(name: &str, args: Value) -> Value {
    serde_json::from_str(&dojo_core::api::call(name, &args.to_string())).unwrap()
}

fn ok_value(name: &str, args: Value) -> Value {
    let out = call(name, args);
    assert_eq!(out["ok"], json!(true), "{name}: {out}");
    out["value"].clone()
}

fn course() -> Value {
    json!({ "id": "synthetic" })
}

fn items() -> Value {
    json!([
        { "id": "a1", "unit": "u1" },
        { "id": "a2", "unit": "u1" },
        { "id": "b1", "unit": "u2" },
        { "id": "c1", "unit": "u3", "status": "retired" },
    ])
}

fn build_args(seed: Option<&str>) -> Value {
    let mut args = json!({
        "units": course(),
        "items": items(),
        "records": {},
        "now": 100,
        "daysLeft": 4,
        "courseId": "synthetic",
    });
    if let Some(s) = seed {
        args["seed"] = json!(s);
    }
    args
}

#[test]
fn build_session_matches_core_build() {
    let value = ok_value("buildSession", build_args(Some("7")));
    let metas: Vec<dojo_core::groups::ItemMeta> = [("a1", "u1"), ("a2", "u1"), ("b1", "u2")]
        .iter()
        .map(|(id, unit)| dojo_core::groups::ItemMeta {
            id: id.to_string(),
            unit: unit.to_string(),
            entity: id.to_string(),
            tags: Vec::new(),
            retired: false,
        })
        .collect();
    let cfg = session::resolve(None, &Default::default()).unwrap();
    let input = session::SessionInput {
        items: &metas,
        records: &serde_json::Map::new(),
        rules: &[],
        cfg: &cfg,
        filter: None,
        course_id: "synthetic",
        now: 100,
        days_left: 4,
        introduced_today: 0,
        answer_ms: &[],
        seed: Some(7),
    };
    let expected = session::build_session(&input);
    let queue: Vec<String> = value["queue"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
    assert_eq!(queue, expected.queue, "{value}");
    assert_eq!(value["plan"]["total"], json!(expected.plan.total));
    assert!(!queue.contains(&"c1".to_string()), "retired item skipped");
}

#[test]
fn build_session_is_deterministic_for_a_seed() {
    let a = ok_value("buildSession", build_args(Some("7")));
    let b = ok_value("buildSession", build_args(Some("7")));
    assert_eq!(a, b);
}

#[test]
fn build_session_bad_args_give_code() {
    let mut no_units = build_args(None);
    no_units.as_object_mut().unwrap().remove("units");
    let out = call("buildSession", no_units);
    assert_eq!(out["ok"], json!(false));
    assert_eq!(out["error"]["code"], json!("bad_args"));

    let out = call("buildSession", build_args(Some("not-a-number")));
    assert_eq!(out["error"]["code"], json!("bad_args"));

    let mut bad_settings = build_args(None);
    bad_settings["settings"] = json!({ "sessionMix": "weak" });
    let out = call("buildSession", bad_settings);
    assert_eq!(out["error"]["code"], json!("bad_args"));
}

#[test]
fn requeue_matches_core_and_checks_args() {
    let pool = json!(["q1", "q2", "q3"]);
    let value = ok_value(
        "sessionRequeue",
        json!({ "unit": "u1", "pool": pool, "answered": "q1", "alreadyRepeated": 0, "repeatMax": 1, "seed": "42" }),
    );
    let expected = session::requeue("u1", &["q1", "q2", "q3"], "q1", 0, 1, 42);
    assert_eq!(value, json!(expected));

    let capped = ok_value(
        "sessionRequeue",
        json!({ "unit": "u1", "pool": pool, "answered": "q1", "alreadyRepeated": 1, "repeatMax": 1, "seed": "42" }),
    );
    assert_eq!(capped, Value::Null);

    let out = call("sessionRequeue", json!({ "unit": "u1", "pool": "q1", "answered": "q1", "seed": "42" }));
    assert_eq!(out["error"]["code"], json!("bad_args"));
}

#[test]
fn finish_summary_matches_core() {
    let value = ok_value(
        "sessionFinish",
        json!({
            "answers": [{ "id": "a1", "right": true }, { "id": "b1", "right": false }],
            "units": [["a1", "a2"], ["b1"]],
            "records": { "a1": { "due": 500, "s": 1 } },
            "now": 100,
            "planned": 2,
            "repeatsAdded": 1,
        }),
    );
    assert_eq!(value["answered"], json!(2));
    assert_eq!(value["right"], json!(1));
    assert_eq!(value["denominator"], json!(3));
    assert_eq!(value["weakLeft"], json!(0));
    assert_eq!(value["nextDue"], json!(500));
}
