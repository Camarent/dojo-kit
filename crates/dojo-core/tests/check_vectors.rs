mod common;
use common::{groups, json_eq, load, report};
use dojo_core::check::{check_choice, check_cloze, check_gap, gap_verdict, check_match, check_multi, check_order, check_numeric, normalize, Normalize};
use serde_json::{json, Value};

fn opts(i: &Value) -> Normalize {
    match i.get("opts") {
        Some(o) => serde_json::from_value(o.clone()).expect("opts"),
        None => Normalize::default(),
    }
}

fn indices(v: &Value, what: &str) -> Vec<usize> {
    let list = v.as_array().unwrap_or_else(|| panic!("`{what}` must be an array"));
    list.iter().map(|n| n.as_u64().unwrap_or_else(|| panic!("`{what}` must be integer")) as usize).collect()
}

fn count(v: &Value, what: &str) -> usize {
    v.as_u64().unwrap_or_else(|| panic!("`{what}` must be a number")) as usize
}

#[test]
fn check_order_huge_step_count_does_not_allocate() {
    let r = check_order(1usize << 40, &[0, 1, 2], &[]);
    assert!(!r.correct);
    assert_eq!(r.first_wrong, Some(3));
}

#[test]
fn check_vectors() {
    let mut failures = vec![];
    for (f, cases) in groups(&load("check.json")) {
        for c in cases {
            let i = &c["input"];
            let got: Value = match f.as_str() {
                "normalize" => Value::String(normalize(i["text"].as_str().unwrap(), &opts(i))),
                "checkGap" => {
                    let answers: Vec<String> = i["answers"].as_array().unwrap().iter().map(|a| a.as_str().unwrap().to_string()).collect();
                    Value::Bool(check_gap(&answers, i["input"].as_str().unwrap(), &opts(i)))
                }
                "checkChoice" => Value::Bool(check_choice(i["answer"].as_u64().unwrap() as usize, i["selected"].as_u64().unwrap() as usize)),
                "checkMulti" => {
                    let correct = indices(&i["correct"], "correct");
                    let selected = indices(&i["selected"], "selected");
                    Value::Bool(check_multi(&correct, &selected))
                }
                "checkMatch" => {
                    let pair_count = count(&i["pairCount"], "pairCount");
                    let mapping = indices(&i["mapping"], "mapping");
                    let r = check_match(pair_count, &mapping);
                    json!({ "correct": r.correct, "wrong": r.wrong })
                }
                "checkOrder" => {
                    let step_count = count(&i["stepCount"], "stepCount");
                    let sequence = indices(&i["sequence"], "sequence");
                    let alt: Vec<Vec<usize>> = match i.get("altOrders") {
                        Some(v) => v.as_array().unwrap().iter().map(|o| indices(o, "altOrders")).collect(),
                        None => vec![],
                    };
                    let r = check_order(step_count, &sequence, &alt);
                    json!({ "correct": r.correct, "firstWrong": r.first_wrong, "matched": r.matched })
                }
                "checkCloze" => {
                    let blanks: Vec<Vec<String>> = i["blanks"].as_array().unwrap().iter()
                        .map(|b| b.as_array().unwrap().iter().map(|s| s.as_str().unwrap().to_string()).collect())
                        .collect();
                    let inputs: Vec<String> = i["inputs"].as_array().unwrap().iter().map(|s| s.as_str().unwrap().to_string()).collect();
                    let r = check_cloze(&blanks, &inputs, &opts(i));
                    json!({ "correct": r.correct, "results": r.results })
                }
                "checkNumeric" => {
                    let answer = i["answer"].as_f64().unwrap();
                    let tolerance = i.get("tolerance").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let input = i["input"].as_str().unwrap();
                    let r = check_numeric(answer, tolerance, input);
                    json!({ "correct": r.correct, "parsed": r.parsed })
                }
                "gapVerdict" => {
                    let answers: Vec<String> = i["answers"].as_array().unwrap().iter().map(|a| a.as_str().unwrap().to_string()).collect();
                    let retry: Vec<String> = i.get("retry").and_then(|v| v.as_array()).map(|arr| arr.iter().map(|s| s.as_str().unwrap().to_string()).collect()).unwrap_or_default();
                    let input = i["input"].as_str().unwrap();
                    let verdict = gap_verdict(&answers, &retry, input, &opts(i));
                    Value::String(verdict.to_string())
                }
                other => panic!("unknown group {other}"),
            };
            if !json_eq(&got, &c["expect"]) {
                failures.push(format!("{f}/{} => got {got}", c["name"]));
            }
        }
    }
    report("check", failures);
}
