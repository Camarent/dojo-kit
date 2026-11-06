use serde_json::Value;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

type Res<T = ()> = Result<T, Box<dyn Error>>;

/// Removes its directory when the test ends, also on panic.
struct Scratch(PathBuf);

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn scratch(tag: &str) -> Res<Scratch> {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("dojo-validate-modules-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    Ok(Scratch(dir))
}

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn repo_web() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../web")
}

fn copy_dir(from: &Path, to: &Path) -> Res {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// A copy of the demo course whose `course.json` is changed by `edit`; the guard removes it.
fn course(tag: &str, edit: impl FnOnce(&mut Value)) -> Res<(Scratch, PathBuf)> {
    let guard = scratch(tag)?;
    let dir = guard.0.join("course");
    copy_dir(&demo(), &dir)?;
    let _ = std::fs::remove_file(dir.join("ids.lock"));
    let path = dir.join("course.json");
    let mut value: Value = serde_json::from_str(&std::fs::read_to_string(&path)?)?;
    edit(&mut value);
    std::fs::write(&path, serde_json::to_string_pretty(&value)?)?;
    Ok((guard, dir))
}

/// Codes in the `--json` report of `dojo validate --web <repo web>` on `dir`.
fn codes(dir: &Path) -> Res<Vec<String>> {
    let out: Output = Command::new(env!("CARGO_BIN_EXE_dojo"))
        .arg("validate")
        .arg(dir)
        .arg("--web")
        .arg(repo_web())
        .arg("--json")
        .output()?;
    let report: Value = serde_json::from_slice(&out.stdout)?;
    let list = report["diagnostics"].as_array().ok_or("no diagnostics array")?;
    Ok(list.iter().filter_map(|d| d["code"].as_str().map(str::to_string)).collect())
}

fn has(codes: &[String], code: &str) -> bool {
    codes.iter().any(|c| c == code)
}

#[test]
fn listed_ghost_module_is_module_missing() -> Res {
    let (_guard, dir) = course("ghost", |c| c["modules"] = Value::from(vec!["ghost"]))?;
    let found = codes(&dir)?;
    assert!(has(&found, "module_missing"), "{found:?}");
    Ok(())
}

#[test]
fn ruby_key_without_ja_is_module_key_unlisted() -> Res {
    let (_guard, dir) = course("ruby-no-ja", |c| c["ruby"] = serde_json::json!({}))?;
    let found = codes(&dir)?;
    assert!(has(&found, "module_key_unlisted"), "{found:?}");
    Ok(())
}

#[test]
fn ruby_key_with_ja_listed_gives_neither_code() -> Res {
    let (_guard, dir) = course("ruby-ja", |c| {
        c["ruby"] = serde_json::json!({});
        c["modules"] = Value::from(vec!["ja"]);
    })?;
    let found = codes(&dir)?;
    assert!(!has(&found, "module_key_unlisted"), "{found:?}");
    assert!(!has(&found, "module_missing"), "{found:?}");
    Ok(())
}

#[test]
fn ruby_markup_without_ja_is_module_key_unlisted() -> Res {
    let (_guard, dir) = course("markup-no-ja", |c| c["markup"] = Value::from("ruby"))?;
    let found = codes(&dir)?;
    assert!(has(&found, "module_key_unlisted"), "{found:?}");
    Ok(())
}
