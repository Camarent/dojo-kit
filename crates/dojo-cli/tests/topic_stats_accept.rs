//! Final acceptance for `dojo topic-stats` on the showcase: exit 0, stdout matches the
//! committed schema, and the groups list is non-empty.

#[path = "schema_check/mod.rs"]
mod schema_check;

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn committed_schema() -> Value {
    let path = manifest_dir().join("../../schema/topic-stats.schema.json");
    let text = fs::read_to_string(&path).expect("read committed schema");
    serde_json::from_str(&text).expect("committed schema is JSON")
}

#[test]
fn showcase_topic_stats_is_valid_and_non_empty() {
    let showcase = manifest_dir().join("../../examples/showcase");
    let progress = manifest_dir().join("tests/fixtures/topic-stats/learner-state.json");
    let out = Command::new(env!("CARGO_BIN_EXE_dojo"))
        .arg("topic-stats")
        .arg(&showcase)
        .arg("--progress")
        .arg(&progress)
        .arg("--json")
        .output()
        .expect("run dojo");
    assert_eq!(
        out.status.code(),
        Some(0),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let doc: Value = serde_json::from_slice(&out.stdout).expect("stdout is JSON");
    schema_check::validate(&committed_schema(), &doc).expect("stdout matches topic-stats schema");
    let groups = doc["groups"].as_array().expect("groups is an array");
    assert!(!groups.is_empty(), "groups must be non-empty");
}
