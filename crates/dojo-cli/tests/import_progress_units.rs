//! import-progress: unit ladders, unit scope, retired members, course field, parse errors.

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn unique_dir(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("dojo-cli-impunits-{tag}-{}-{n}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("content")).unwrap();
    dir
}

fn gap(id: &str, entity: Option<&str>, retired: bool) -> String {
    let mut v = json!({"type": "gap", "id": id, "unit": "u1", "prompt": id, "answers": ["a"]});
    if let Some(e) = entity {
        v["entity"] = json!(e);
    }
    if retired {
        v["status"] = json!("retired");
    }
    serde_json::to_string(&v).unwrap()
}

fn fixture(tag: &str, unit_srs: Value, lines: &[String]) -> PathBuf {
    let dir = unique_dir(tag);
    let course = json!({
        "id": "unit-course", "title": "T", "uiLanguage": "en", "contentLanguage": "en",
        "units": [{"id": "u1", "title": "U", "srs": unit_srs}],
        "srs": {"ladder": [0, 1000, 2000]}
    });
    fs::write(dir.join("course.json"), course.to_string()).unwrap();
    fs::write(dir.join("content/u1.jsonl"), lines.join("\n") + "\n").unwrap();
    let old = json!({"items": {"o1": {"s": 8, "due": 5, "ok": 3, "bad": 1, "last": 9}},
        "stats": {"days": {}, "newByDay": {}}, "settings": {}});
    fs::write(dir.join("old.json"), old.to_string()).unwrap();
    let map = json!({"aggregate": "first", "map": {"o1": ["a"]}});
    fs::write(dir.join("map.json"), map.to_string()).unwrap();
    dir
}

fn run(dir: &Path, out: &str) -> Output {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
        .arg("import-progress").arg(dir.join("old.json"))
        .arg("--map").arg(dir.join("map.json"))
        .arg("--course").arg(dir)
        .arg("--out").arg(dir.join(out)).arg("--write")
        .arg("--now").arg("2024-01-01T00:00:00Z")
        .output().unwrap()
}

fn result(dir: &Path, out: &str) -> Value {
    let o = run(dir, out);
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    serde_json::from_str(&fs::read_to_string(dir.join(out)).unwrap()).unwrap()
}

fn ladder10() -> Value {
    json!({"ladder": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]})
}

#[test]
fn unit_ladder_keeps_stage() {
    let dir = fixture("ladder", ladder10(), &[gap("a", None, false)]);
    assert_eq!(result(&dir, "o.json")["items"]["a"]["s"], 8);
}

#[test]
fn unit_scope_entity_writes_active_siblings() {
    let mut srs = ladder10();
    srs["scope"] = json!("entity");
    let lines = [gap("a", Some("e"), false), gap("b", Some("e"), false)];
    let dir = fixture("scope", srs, &lines);
    let r = result(&dir, "o.json");
    assert_eq!(r["items"]["b"]["s"], 8);
    assert_eq!(r["items"]["b"], r["items"]["a"]);
}

#[test]
fn retired_member_gets_no_record() {
    let mut srs = ladder10();
    srs["scope"] = json!("entity");
    let lines = [gap("a", Some("e"), false), gap("b", Some("e"), false), gap("c", Some("e"), true)];
    let dir = fixture("retired", srs, &lines);
    let r = result(&dir, "o.json");
    assert!(r["items"].get("b").is_some());
    assert!(r["items"].get("c").is_none());
}

#[test]
fn output_has_course_id() {
    let dir = fixture("course", ladder10(), &[gap("a", None, false)]);
    assert_eq!(result(&dir, "o.json")["course"], "unit-course");
}

#[test]
fn output_is_deterministic() {
    let mut srs = ladder10();
    srs["scope"] = json!("entity");
    let lines = [gap("a", Some("e"), false), gap("b", Some("e"), false), gap("z", Some("e"), false)];
    let dir = fixture("det", srs, &lines);
    result(&dir, "o1.json");
    result(&dir, "o2.json");
    assert_eq!(fs::read(dir.join("o1.json")).unwrap(), fs::read(dir.join("o2.json")).unwrap());
}

#[test]
fn bad_content_line_is_error() {
    let dir = fixture("bad", ladder10(), &[gap("a", None, false), "{not json".to_string()]);
    let o = run(&dir, "o.json");
    assert_ne!(o.status.code(), Some(0));
    let err = String::from_utf8_lossy(&o.stderr);
    assert!(err.contains("content/u1.jsonl") && err.contains("line 2"), "{err}");
}
