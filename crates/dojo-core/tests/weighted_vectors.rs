mod common;
use common::{groups, json_eq, load, report};
use dojo_core::api::call;
use dojo_core::srs::{draw_index, unit_random, weight};
use serde_json::{json, Value};

fn n(v: &Value, k: &str) -> f64 {
    v[k].as_f64().unwrap()
}

fn run_case(f: &str, input: &Value) -> Value {
    match f {
        "weight" => json!(weight(input.get("rec").and_then(Value::as_object), n(input, "now"))),
        "drawIndex" => {
            let w: Vec<f64> = input["weights"].as_array().unwrap().iter().map(|x| x.as_f64().unwrap()).collect();
            json!(draw_index(&w, n(input, "r")))
        }
        "unitRandom" => {
            let mut s: u64 = input["seed"].as_str().unwrap().parse().unwrap();
            let k = input["n"].as_u64().unwrap();
            json!((0..k).map(|_| unit_random(dojo_core::rng::splitmix64(&mut s))).collect::<Vec<_>>())
        }
        _ => {
            let out: Value = serde_json::from_str(&call(f, &input.to_string())).unwrap();
            assert_eq!(out["ok"], json!(true), "{f}: {out}");
            out["value"].clone()
        }
    }
}

#[test]
fn weighted_vectors() {
    let mut failures = vec![];
    for (f, cases) in groups(&load("weighted.json")) {
        for c in cases {
            let got = run_case(&f, &c["input"]);
            if !json_eq(&got, &c["expect"]) {
                failures.push(format!("{f}/{}: {got}", c["name"]));
            }
        }
    }
    report("weighted.json", failures);
}

fn queue_err(seed: &str) -> Value {
    let input = json!({"ids": ["a"], "records": {}, "now": 0, "seed": seed, "limit": 1, "newAllowance": 1});
    serde_json::from_str(&call("weightedQueue", &input.to_string())).unwrap()
}

#[test]
fn bad_seeds_are_bad_args() {
    for s in ["+5", "", "-1", "1.5", "18446744073709551616", "000000000000000000001", " 5"] {
        assert_eq!(queue_err(s)["error"]["code"], "bad_args", "{s:?}");
    }
    assert_eq!(queue_err("18446744073709551615")["ok"], json!(true));
}
