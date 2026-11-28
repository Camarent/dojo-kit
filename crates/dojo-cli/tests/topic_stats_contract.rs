//! Contract tests for `dojo topic-stats`: stdout against the committed schema,
//! `--changed-since` windows, exit codes, and a golden snapshot on a copy of the showcase.

#[path = "schema_check/mod.rs"]
mod schema_check;

mod common;

use common::TempDir;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// `generated_at` value written into the golden snapshot; the real one is the wall clock.
const GENERATED_AT_FIXED: &str = "1970-01-01T00:00:00.000Z";

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn showcase_src() -> PathBuf {
    manifest_dir().join("../../examples/showcase")
}

fn learner_state() -> PathBuf {
    manifest_dir().join("tests/fixtures/topic-stats/learner-state.json")
}

fn snapshot_path() -> PathBuf {
    manifest_dir().join("tests/snapshots/topic-stats-showcase.json")
}

fn committed_schema() -> Value {
    let path = manifest_dir().join("../../schema/topic-stats.schema.json");
    let text = fs::read_to_string(&path).expect("read committed schema");
    serde_json::from_str(&text).expect("committed schema is JSON")
}

fn assert_matches_schema(doc: &Value) {
    schema_check::validate(&committed_schema(), doc).expect("stdout matches topic-stats schema");
}

fn run_topic_stats(course: &Path, progress: &Path, changed_since: Option<&str>) -> Output {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_dojo"));
    cmd.arg("topic-stats").arg(course).arg("--progress").arg(progress);
    if let Some(since) = changed_since {
        cmd.arg("--changed-since").arg(since);
    }
    cmd.arg("--json").output().expect("run dojo")
}

fn stdout_json(out: &Output) -> Value {
    assert_eq!(out.status.code(), Some(0), "stderr: {}", String::from_utf8_lossy(&out.stderr));
    serde_json::from_slice(&out.stdout).expect("stdout is JSON")
}

fn write_progress(dir: &Path, name: &str, doc: &Value) -> PathBuf {
    let path = dir.join(name);
    fs::write(&path, doc.to_string()).expect("write progress");
    path
}

/// Recursive copy of a directory tree; `dst` is created.
fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Small course: topic `fractions` spans units u1 and u2, one untopiced item in u1,
/// and one retired item that must not count.
fn write_fixture_course(dir: &Path) {
    fs::create_dir_all(dir.join("content")).expect("create content dir");
    let course = json!({
        "id": "fixture",
        "title": "Fixture",
        "uiLanguage": "en",
        "contentLanguage": "en",
        "units": [{"id": "u1", "title": "Unit 1"}, {"id": "u2", "title": "Unit 2"}]
    });
    fs::write(dir.join("course.json"), course.to_string()).expect("write course.json");
    let items = [
        json!({"type": "card", "id": "f-1", "unit": "u1", "topic": "fractions", "prompt": "Half of 4?", "back": "2"}),
        json!({"type": "card", "id": "f-2", "unit": "u2", "topic": "fractions", "prompt": "A quarter of 8?", "back": "2"}),
        json!({"type": "card", "id": "f-3", "unit": "u1", "prompt": "Capital of France?", "back": "Paris"}),
        json!({"type": "card", "id": "f-4", "unit": "u2", "topic": "fractions", "prompt": "Old item", "back": "x", "status": "retired"}),
    ];
    let lines: Vec<String> = items.iter().map(Value::to_string).collect();
    fs::write(dir.join("content/main.jsonl"), lines.join("\n") + "\n").expect("write items");
}

#[test]
fn showcase_output_matches_schema() {
    let out = run_topic_stats(&showcase_src(), &learner_state(), None);
    assert_matches_schema(&stdout_json(&out));
}

#[test]
fn fixture_course_output_matches_schema_and_groups() {
    let dir = TempDir::new("dojo-cli-topic-contract-fixture").expect("create test dir");
    let course = dir.join("course");
    write_fixture_course(&course);
    let progress = write_progress(
        &dir,
        "progress.json",
        &json!({"v": 1, "course": "fixture", "items": {"f-1": {"s": 4, "ok": 4, "last": 1767225600000u64}}}),
    );
    let doc = stdout_json(&run_topic_stats(&course, &progress, None));
    assert_matches_schema(&doc);
    let groups = doc["groups"].as_array().expect("groups array");
    assert_eq!(groups.len(), 2, "{doc}");
    assert_eq!(groups[0]["kind"], "topic");
    assert_eq!(groups[0]["id"], "fractions");
    assert_eq!(groups[0]["unit"], json!(["u1", "u2"]));
    assert_eq!(groups[0]["items"], json!({"total": 2, "unseen": 1, "learning": 0, "mature": 1}));
    assert_eq!(groups[1]["kind"], "unit");
    assert_eq!(groups[1]["id"], "u1");
    assert_eq!(groups[1]["label"], "Unit 1");
    assert_eq!(groups[1]["items"]["total"], 1);
}

#[test]
fn changed_since_after_every_answer_returns_no_groups() {
    let out = run_topic_stats(&showcase_src(), &learner_state(), Some("2026-06-01T00:00:00Z"));
    let doc = stdout_json(&out);
    assert_matches_schema(&doc);
    assert_eq!(doc["groups"], json!([]));
    assert_eq!(doc["changed_since"], "2026-06-01T00:00:00.000Z");
}

#[test]
fn changed_since_before_every_answer_returns_all_groups() {
    let full = stdout_json(&run_topic_stats(&showcase_src(), &learner_state(), None));
    let windowed = stdout_json(&run_topic_stats(&showcase_src(), &learner_state(), Some("2025-01-01T00:00:00Z")));
    assert_matches_schema(&windowed);
    assert_eq!(full["groups"].as_array().map(Vec::len), Some(4), "{full}");
    assert_eq!(windowed["groups"], full["groups"]);
    assert_eq!(windowed["changed_since"], "2025-01-01T00:00:00.000Z");
}

#[test]
fn nonexistent_course_dir_exits_2() {
    let dir = TempDir::new("dojo-cli-topic-contract-nodir").expect("create test dir");
    let missing = dir.join("no-such-course");
    let out = run_topic_stats(&missing, &learner_state(), None);
    assert_eq!(out.status.code(), Some(2));
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("no-such-course"), "stderr: {stderr}");
}

#[test]
fn golden_showcase_snapshot() {
    let dir = TempDir::new("dojo-cli-topic-contract-golden").expect("create test dir");
    let course = dir.join("showcase");
    copy_dir(&showcase_src(), &course).expect("copy showcase");
    let mut actual = stdout_json(&run_topic_stats(&course, &learner_state(), None));
    actual["generated_at"] = json!(GENERATED_AT_FIXED);
    assert_matches_schema(&actual);
    let text = format!("{}\n", serde_json::to_string_pretty(&actual).expect("serialize"));
    let expected = fs::read_to_string(snapshot_path()).expect("read snapshot");
    assert_eq!(text, expected);
}

#[test]
fn temp_dir_is_removed_on_drop() {
    let dir = TempDir::new("dojo-cli-topic-contract-cleanup").expect("create test dir");
    let path = dir.to_path_buf();
    let progress = write_progress(&dir, "progress.json", &json!({"v": 1, "items": {}}));
    stdout_json(&run_topic_stats(&showcase_src(), &progress, None));
    assert!(path.exists());
    drop(dir);
    assert!(!path.exists(), "temp dir left behind: {}", path.display());
}
