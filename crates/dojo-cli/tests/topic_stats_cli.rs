//! Smoke tests for the topic-stats subcommand.

mod common;

use common::TempDir;
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn showcase() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/showcase")
}

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stderr(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).into_owned()
}

fn write_progress(dir: &Path, name: &str, doc: &Value) -> PathBuf {
    let path = dir.join(name);
    fs::write(&path, doc.to_string()).expect("write progress");
    path
}

#[test]
fn showcase_empty_progress_prints_topic_stats() {
    let dir = TempDir::new("dojo-cli-topic-stats-ok").expect("create test dir");
    let progress = write_progress(&dir, "progress.json", &json!({"v": 1, "items": {}}));
    let out = dojo()
        .arg("topic-stats")
        .arg(showcase())
        .arg("--progress")
        .arg(&progress)
        .arg("--json")
        .output()
        .expect("run dojo");
    assert_eq!(code(&out), Some(0), "stderr: {}", stderr(&out));
    let parsed: Value = serde_json::from_slice(&out.stdout).expect("stdout is JSON");
    assert_eq!(parsed["v"], json!(1));
}

#[test]
fn nonexistent_course_dir_fails() {
    let dir = TempDir::new("dojo-cli-topic-stats-nodir").expect("create test dir");
    let progress = write_progress(&dir, "progress.json", &json!({"v": 1, "items": {}}));
    let missing = dir.join("no-such-course");
    let out = dojo()
        .arg("topic-stats")
        .arg(&missing)
        .arg("--progress")
        .arg(&progress)
        .arg("--json")
        .output()
        .expect("run dojo");
    assert_eq!(code(&out), Some(2));
    assert!(stderr(&out).contains("no-such-course"), "stderr: {}", stderr(&out));
}

#[test]
fn missing_progress_file_fails() {
    let dir = TempDir::new("dojo-cli-topic-stats-noprog").expect("create test dir");
    let out = dojo()
        .arg("topic-stats")
        .arg(showcase())
        .arg("--progress")
        .arg(dir.join("absent.json"))
        .arg("--json")
        .output()
        .expect("run dojo");
    assert_eq!(code(&out), Some(2));
}

#[test]
fn other_course_progress_fails() {
    let dir = TempDir::new("dojo-cli-topic-stats-course").expect("create test dir");
    let progress = write_progress(&dir, "progress.json", &json!({"course": "other", "v": 1, "items": {}}));
    let out = dojo()
        .arg("topic-stats")
        .arg(showcase())
        .arg("--progress")
        .arg(&progress)
        .arg("--json")
        .output()
        .expect("run dojo");
    assert_eq!(code(&out), Some(2));
    assert!(stderr(&out).contains("is for course"), "stderr: {}", stderr(&out));
}

#[test]
fn duplicate_progress_flag_fails() {
    let dir = TempDir::new("dojo-cli-topic-stats-dup").expect("create test dir");
    let progress = write_progress(&dir, "progress.json", &json!({"v": 1, "items": {}}));
    let out = dojo()
        .arg("topic-stats")
        .arg(showcase())
        .arg("--progress")
        .arg(&progress)
        .arg("--progress")
        .arg(&progress)
        .arg("--json")
        .output()
        .expect("run dojo");
    assert_eq!(code(&out), Some(2));
}

#[test]
fn split_progress_document_fails() {
    let dir = TempDir::new("dojo-cli-topic-stats-parts").expect("create test dir");
    let progress = write_progress(&dir, "progress.json", &json!({"v": 1, "parts": 1, "items": {}}));
    let out = dojo()
        .arg("topic-stats")
        .arg(showcase())
        .arg("--progress")
        .arg(&progress)
        .arg("--json")
        .output()
        .expect("run dojo");
    assert_eq!(code(&out), Some(2));
    assert!(stderr(&out).contains("join the .partN bodies"), "stderr: {}", stderr(&out));
}

#[test]
fn missing_json_flag_fails() {
    let dir = TempDir::new("dojo-cli-topic-stats-nojson").expect("create test dir");
    let progress = write_progress(&dir, "progress.json", &json!({"v": 1, "items": {}}));
    let out = dojo()
        .arg("topic-stats")
        .arg(showcase())
        .arg("--progress")
        .arg(&progress)
        .output()
        .expect("run dojo");
    assert_eq!(code(&out), Some(2));
}

#[test]
fn bad_changed_since_fails() {
    let dir = TempDir::new("dojo-cli-topic-stats-iso").expect("create test dir");
    let progress = write_progress(&dir, "progress.json", &json!({"v": 1, "items": {}}));
    let out = dojo()
        .arg("topic-stats")
        .arg(showcase())
        .arg("--progress")
        .arg(&progress)
        .arg("--changed-since")
        .arg("not-a-date")
        .arg("--json")
        .output()
        .expect("run dojo");
    assert_eq!(code(&out), Some(2));
    assert!(stderr(&out).contains("invalid timestamp"), "stderr: {}", stderr(&out));
}
