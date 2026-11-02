mod common;
use common::{groups, json_eq, load, report};
use dojo_core::api::call;
use dojo_core::srs::{draw_index, unit_random, weight};
use serde_json::{json, Value};

fn n(v: &Value, k: &str) -> Result<f64, String> {
    v.get(k).and_then(Value::as_f64).ok_or_else(|| format!("`{k}` must be a number"))
}

fn run_case(f: &str, input: &Value) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(match f {
        "weight" => json!(weight(input.get("rec").and_then(Value::as_object), n(input, "now")?)),
        "drawIndex" => {
            let w: Vec<f64> = input
                .get("weights")
                .and_then(Value::as_array)
                .ok_or("`weights` must be an array")?
                .iter()
                .map(|x| x.as_f64().ok_or("`weights` entries must be numbers"))
                .collect::<Result<_, &str>>()?;
            json!(draw_index(&w, n(input, "r")?))
        }
        "unitRandom" => {
            let mut s: u64 = input.get("seed").and_then(Value::as_str).ok_or("`seed` must be a string")?.parse()?;
            let k = input.get("n").and_then(Value::as_u64).ok_or("`n` must be an integer")?;
            json!((0..k).map(|_| unit_random(dojo_core::rng::splitmix64(&mut s))).collect::<Vec<_>>())
        }
        _ => {
            let out: Value = serde_json::from_str(&call(f, &input.to_string()))?;
            assert_eq!(out.get("ok"), Some(&json!(true)), "{f}: {out}");
            out.get("value").cloned().unwrap_or(Value::Null)
        }
    })
}

#[test]
fn weighted_vectors() -> Result<(), Box<dyn std::error::Error>> {
    let mut failures = vec![];
    for (f, cases) in groups(&load("weighted.json")) {
        for c in cases {
            let got = run_case(&f, &c["input"])?;
            if !json_eq(&got, &c["expect"]) {
                failures.push(format!("{f}/{}: {got}", c["name"]));
            }
        }
    }
    report("weighted.json", failures);
    Ok(())
}

fn queue_err(seed: &str) -> Result<Value, serde_json::Error> {
    let input = json!({"ids": ["a"], "records": {}, "now": 0, "seed": seed, "limit": 1, "newAllowance": 1});
    serde_json::from_str(&call("weightedQueue", &input.to_string()))
}

#[test]
fn bad_seeds_are_bad_args() -> Result<(), Box<dyn std::error::Error>> {
    for s in ["+5", "", "-1", "1.5", "18446744073709551616", "000000000000000000001", " 5"] {
        assert_eq!(queue_err(s)?["error"]["code"], "bad_args", "{s:?}");
    }
    assert_eq!(queue_err("18446744073709551615")?["ok"], json!(true));
    Ok(())
}
