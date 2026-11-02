mod common;
use common::{groups, json_eq, load, report};
use dojo_core::exam::{sample, splitmix64, Candidate, Section};
use serde_json::{json, Value};

fn strs(v: &Value) -> Result<Vec<String>, &'static str> {
    v.as_array().ok_or("expected an array")?.iter().map(|x| x.as_str().map(String::from).ok_or("expected a string")).collect()
}

fn opt_strs(v: &Value, key: &str) -> Result<Option<Vec<String>>, &'static str> {
    v.get(key).map(strs).transpose()
}

#[test]
fn exam_vectors() -> Result<(), Box<dyn std::error::Error>> {
    let mut failures = vec![];
    for (f, cases) in groups(&load("exam.json")) {
        for c in cases {
            let i = &c["input"];
            let got: Value = match f.as_str() {
                "splitmix64" => {
                    let mut st: u64 = i["seed"].as_str().unwrap().parse().unwrap();
                    let n = i["n"].as_u64().unwrap();
                    Value::Array((0..n).map(|_| Value::String(splitmix64(&mut st).to_string())).collect())
                }
                "sample" => {
                    let cands: Vec<Candidate> = i["candidates"].as_array().unwrap().iter().map(|k| -> Result<Candidate, &'static str> { Ok(Candidate {
                        id: k["id"].as_str().unwrap().into(),
                        unit: k["unit"].as_str().unwrap().into(),
                        tags: strs(&k["tags"])?,
                        item_type: k["type"].as_str().unwrap().into(),
                        stimulus: k["stimulus"].as_str().map(String::from),
                        exam_only: k.get("examOnly").and_then(Value::as_bool).unwrap_or(false),
                    }) }).collect::<Result<Vec<Candidate>, &str>>()?;
                    let secs: Vec<Section> = i["sections"].as_array().unwrap().iter().map(|s| -> Result<Section, &'static str> { Ok(Section {
                        title: s["title"].as_str().unwrap().into(),
                        count: s["count"].as_u64().unwrap() as usize,
                        units: opt_strs(s, "units")?,
                        tags: opt_strs(s, "tags")?,
                        types: opt_strs(s, "types")?,
                    }) }).collect::<Result<Vec<Section>, &str>>()?;
                    let r = sample(&cands, &secs, i["seed"].as_str().unwrap().parse().unwrap());
                    json!({ 
                        "ids": r.ids, 
                        "short": r.short.iter().map(|s| json!({"title": s.title, "shortBy": s.short_by})).collect::<Vec<_>>(),
                        "sections": r.sections.iter().map(|s| json!({"title": s.title, "start": s.start, "count": s.count})).collect::<Vec<_>>()
                    })
                }
                "score" => {
                    let env: Value = serde_json::from_str(&dojo_core::api::call("score", &i.to_string())).unwrap();
                    assert_eq!(env["ok"], json!(true), "{f}/{}: {env}", c["name"]);
                    env["value"].clone()
                }
                other => panic!("unknown group {other}"),
            };
            if !json_eq(&got, &c["expect"]) {
                failures.push(format!("{f}/{} => got {got}", c["name"]));
            }
        }
    }
    report("exam", failures);
    Ok(())
}

fn score_call(args: Value) -> Result<Value, serde_json::Error> {
    serde_json::from_str(&dojo_core::api::call("score", &args.to_string()))
}

#[test]
fn score_api_rejects_bad_scoring_input() -> Result<(), Box<dyn std::error::Error>> {
    let base = |scoring: Value, sections: Value| {
        let mut a = json!({ "results": [{"id": "q", "correct": true}], "total": 1, "passMark": 0.5, "scoring": scoring });
        if !sections.is_null() {
            a["sections"] = sections;
        }
        a
    };
    let secs = json!([{"title": "s", "start": 0, "count": 1}]);
    for (name, args) in [
        ("empty scoring", base(json!([]), secs.clone())),
        ("no sections", base(json!([{"title": "P", "sections": ["s"], "points": 5}]), Value::Null)),
        ("non-string section", base(json!([{"title": "P", "sections": [1], "points": 5}]), secs.clone())),
        ("null sections in part", base(json!([{"title": "P", "sections": null, "points": 5}]), secs.clone())),
        ("unknown section", base(json!([{"title": "P", "sections": ["zz"], "points": 5}]), secs.clone())),
    ] {
        let r = score_call(args)?;
        assert_eq!((r["ok"].clone(), r["error"]["code"].clone()), (json!(false), json!("bad_args")), "{name}: {r}");
    }
    Ok(())
}

#[test]
fn score_api_without_scoring_has_no_parts() -> Result<(), Box<dyn std::error::Error>> {
    let r = score_call(json!({ "results": [{"id": "q", "correct": true}], "total": 1, "passMark": 0.5 }))?;
    assert_eq!(r["value"], json!({"raw": 1, "total": 1, "fraction": 1.0, "pass": true}));
    Ok(())
}
