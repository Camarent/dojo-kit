//! Tests for --now flag timestamp parsing

use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

type Res<T = ()> = Result<T, Box<dyn Error>>;

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn unique_dir(tag: &str) -> Res<PathBuf> {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "dojo-cli-now-{tag}-{}-{}",
        std::process::id(),
        N.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stdout(out: &Output) -> String {
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn stderr(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).into_owned()
}

fn create_minimal_course(dir: &Path) -> Res {
    fs::create_dir_all(dir)?;
    fs::create_dir_all(dir.join("content"))?;

    let course = serde_json::json!({
        "id": "test-now",
        "title": "Test Now",
        "uiLanguage": "en",
        "contentLanguage": "en",
        "units": [{"id": "u1", "title": "U1"}],
        "srs": {"scope": "item", "ladder": [0, 1000]}
    });
    fs::write(dir.join("course.json"), serde_json::to_string_pretty(&course)?)?;

    let items = [serde_json::json!({
        "type": "gap",
        "prompt": "Q1",
        "answers": ["a"],
        "unit": "u1",
        "id": "i1"
    })];
    let content_text: String = items
        .iter()
        .map(serde_json::to_string)
        .collect::<Result<Vec<_>, _>>()?
        .join("\n")
        + "\n";
    fs::write(dir.join("content/u1.jsonl"), content_text)?;

    let lock = serde_json::json!({"v": 1, "ids": ["i1"], "retired": []});
    fs::write(dir.join("ids.lock"), serde_json::to_string_pretty(&lock)?)?;
    Ok(())
}

fn run_import_progress(old_progress: &Path, id_map: &Path, course_dir: &Path, now: Option<&str>) -> Res<Output> {
    let mut cmd = dojo();
    cmd.arg("import-progress")
        .arg(old_progress)
        .arg("--map")
        .arg(id_map)
        .arg("--course")
        .arg(course_dir);

    if let Some(n) = now {
        cmd.arg("--now").arg(n);
    }

    Ok(cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?.wait_with_output()?)
}

#[test]
fn now_flag_invalid_date_exits_non_zero() -> Res {
    let dir = unique_dir("now-invalid")?;
    create_minimal_course(&dir)?;

    let old_progress = dir.join("old.json");
    fs::write(&old_progress, "{\"items\":{}, \"stats\":{}, \"settings\":{}}")?;

    let id_map = dir.join("map.json");
    fs::write(&id_map, "{\"map\":{}}")?;

    let out = run_import_progress(&old_progress, &id_map, &dir, Some("2026-01-00"))?;
    assert_ne!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    assert!(stderr(&out).contains("invalid timestamp"));
    Ok(())
}

#[test]
fn now_flag_huge_year_exits_non_zero() -> Res {
    for now in ["300000000-01-01", "300000000-01-01T00:00:00Z", "10000-01-01T00:00:00Z"] {
        let dir = unique_dir("now-huge")?;
        create_minimal_course(&dir)?;
        let old_progress = dir.join("old.json");
        fs::write(&old_progress, "{\"items\":{}, \"stats\":{}, \"settings\":{}}")?;
        let id_map = dir.join("map.json");
        fs::write(&id_map, "{\"map\":{}}")?;
        let out = run_import_progress(&old_progress, &id_map, &dir, Some(now))?;
        assert_eq!(code(&out), Some(2), "{now}: stdout: {}, stderr: {}", stdout(&out), stderr(&out));
        assert!(stderr(&out).contains("invalid timestamp"), "{now}");
    }
    Ok(())
}

#[test]
fn now_flag_valid_iso_date() -> Res {
    let dir = unique_dir("now-valid")?;
    create_minimal_course(&dir)?;

    let old_progress = dir.join("old.json");
    fs::write(&old_progress, "{\"items\":{}, \"stats\":{}, \"settings\":{}}")?;

    let id_map = dir.join("map.json");
    fs::write(&id_map, "{\"map\":{}}")?;

    let out = run_import_progress(&old_progress, &id_map, &dir, Some("2024-02-29"))?;
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    Ok(())
}

#[test]
fn now_flag_valid_iso_datetime() -> Res {
    let dir = unique_dir("now-valid-dt")?;
    create_minimal_course(&dir)?;

    let old_progress = dir.join("old.json");
    fs::write(&old_progress, "{\"items\":{}, \"stats\":{}, \"settings\":{}}")?;

    let id_map = dir.join("map.json");
    fs::write(&id_map, "{\"map\":{}}")?;

    let out = run_import_progress(&old_progress, &id_map, &dir, Some("2025-12-31T23:59:59Z"))?;
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    Ok(())
}
