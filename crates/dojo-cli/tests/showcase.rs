use serde_json::Value;
use std::path::PathBuf;
use std::process::Command;

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn showcase() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/showcase")
}

#[test]
fn showcase_validates_strict() {
    let out = dojo().arg("validate").arg(showcase()).arg("--strict").output().unwrap();
    assert_eq!(out.status.code(), Some(0), "{}", String::from_utf8_lossy(&out.stdout));
}

#[test]
fn showcase_stats_report_all_eight_types() {
    let out = dojo().arg("stats").arg(showcase()).arg("--json").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let v: Value = serde_json::from_slice(&out.stdout).unwrap();
    for t in ["choice", "multi", "gap", "cloze", "numeric", "match", "order", "card"] {
        let n = v["totals"]["active"][t].as_u64().unwrap_or(0);
        assert!(n >= 2, "{t}: {n}");
    }
}
