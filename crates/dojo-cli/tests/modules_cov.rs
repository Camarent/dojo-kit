//! Coverage for module manifest checks in `modules::load` (scout-coverage.md item 1).
//! Helpers mirror `build_modules.rs`; each integration test file is its own crate.

use serde_json::Value;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

type Res<T = ()> = Result<T, Box<dyn Error>>;

const TEMPLATE: &str = "<title><!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n";

const BUNDLE_WITH_MARKERS: &str = r#"{"scripts":["core.js","@modules","@course"],"styles":["s.css","@modules","@course"],"i18n":["en","ru","fr"],"licenses":["L.txt"]}"#;

/// Removes its directory when the test ends, also on panic.
struct Scratch(PathBuf);

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

struct Env {
    _guard: Scratch,
    root: PathBuf,
    course: PathBuf,
    web: PathBuf,
    wasm: PathBuf,
}

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn scratch(tag: &str) -> Res<Scratch> {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("dojo-modcov-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    Ok(Scratch(dir))
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

fn put(path: &Path, text: &str) -> Res {
    std::fs::create_dir_all(path.parent().ok_or("no parent dir")?)?;
    std::fs::write(path, text)?;
    Ok(())
}

fn env(tag: &str) -> Res<Env> {
    let guard = scratch(tag)?;
    let root = guard.0.clone();
    let course = root.join("course");
    copy_dir(&demo(), &course)?;
    let _ = std::fs::remove_file(course.join("ids.lock"));
    let web = root.join("web");
    put(&web.join("bundle.json"), BUNDLE_WITH_MARKERS)?;
    put(&web.join("core.js"), "var CORE=1;")?;
    put(&web.join("s.css"), "body{margin:0}")?;
    put(&web.join("L.txt"), "MIT -- license")?;
    put(&web.join("i18n/en.json"), r#"{"hi":"Hello"}"#)?;
    put(&web.join("i18n/fr.json"), r#"{"hi":"Bonjour"}"#)?;
    put(&web.join("i18n/ru.json"), r#"{"hi":"Privet"}"#)?;
    put(&web.join("index.template.html"), TEMPLATE)?;
    let wasm = root.join("tiny.wasm");
    std::fs::write(&wasm, [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0])?;
    Ok(Env { _guard: guard, root, course, web, wasm })
}

/// Sets `uiLanguage` and, when non-empty, `modules` in the copied course.
fn course_with(e: &Env, ui: &str, modules: &[&str]) -> Res {
    let path = e.course.join("course.json");
    let mut course: Value = serde_json::from_str(&std::fs::read_to_string(&path)?)?;
    course["uiLanguage"] = Value::from(ui);
    if !modules.is_empty() {
        course["modules"] = Value::from(modules.to_vec());
    }
    std::fs::write(&path, serde_json::to_string_pretty(&course)?)?;
    Ok(())
}

/// Writes `modules/<folder>/module.json` with the given raw text and a script `m.js`.
fn module_raw(e: &Env, folder: &str, manifest: &str) -> Res {
    let dir = e.root.join("modules").join(folder);
    put(&dir.join("module.json"), manifest)?;
    put(&dir.join("m.js"), "var M=1;")?;
    Ok(())
}

fn build(e: &Env, out: &Path) -> Res<Output> {
    Ok(Command::new(env!("CARGO_BIN_EXE_dojo"))
        .arg("build")
        .arg(&e.course)
        .arg("--out")
        .arg(out)
        .arg("--wasm")
        .arg(&e.wasm)
        .arg("--web")
        .arg(&e.web)
        .output()?)
}

/// Runs a build that must fail and returns its output: diagnostics go to stdout, `Stop::Fail` to stderr.
fn failing_build_stderr(e: &Env) -> Res<String> {
    let o = build(e, &e.root.join("dist"))?;
    assert_ne!(o.status.code(), Some(0), "build should fail");
    Ok(format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr)))
}

#[test]
fn invalid_module_id_is_a_build_error() -> Res {
    let e = env("badid")?;
    course_with(&e, "en", &["Bad_ID"])?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("invalid module id"), "stderr: {err}");
    Ok(())
}

#[test]
fn wrong_manifest_version_is_a_build_error() -> Res {
    let e = env("manver")?;
    module_raw(&e, "base", r#"{"manifestVersion":99,"id":"base"}"#)?;
    course_with(&e, "en", &["base"])?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("manifestVersion must be"), "stderr: {err}");
    Ok(())
}

#[test]
fn manifest_id_must_match_folder_name() -> Res {
    let e = env("idmismatch")?;
    module_raw(&e, "base", r#"{"manifestVersion":1,"id":"other"}"#)?;
    course_with(&e, "en", &["base"])?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("must equal the folder name"), "stderr: {err}");
    Ok(())
}

/// Sets one raw top-level key in the copied `course.json`.
fn course_field(e: &Env, key: &str, value: Value) -> Res {
    let path = e.course.join("course.json");
    let mut course: Value = serde_json::from_str(&std::fs::read_to_string(&path)?)?;
    course[key] = value;
    std::fs::write(&path, serde_json::to_string_pretty(&course)?)?;
    Ok(())
}

#[test]
fn unknown_ui_language_falls_back_to_en() -> Res {
    let e = env("uilang")?;
    course_with(&e, "xx", &[])?;
    let o = build(&e, &e.root.join("dist"))?;
    let err = String::from_utf8_lossy(&o.stderr).into_owned();
    assert_eq!(o.status.code(), Some(0), "stderr: {err}");
    assert!(err.contains("no UI translation for \"xx\""), "stderr: {err}");
    Ok(())
}

#[test]
fn non_array_course_modules_is_a_build_error() -> Res {
    let e = env("modobj")?;
    course_field(&e, "modules", Value::from("base"))?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("\"modules\" must be an array of strings"), "stderr: {err}");
    Ok(())
}

#[test]
fn non_string_course_module_entry_is_a_build_error() -> Res {
    let e = env("modint")?;
    course_field(&e, "modules", Value::from(vec![1]))?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("\"modules\" must be an array of strings"), "stderr: {err}");
    Ok(())
}

#[test]
fn non_string_i18n_value_names_the_file() -> Res {
    let e = env("i18nval")?;
    put(&e.web.join("i18n/fr.json"), r#"{"hi":5}"#)?;
    course_with(&e, "fr", &[])?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("i18n/fr.json: key \"hi\" must be a string"), "stderr: {err}");
    Ok(())
}

#[test]
fn missing_listed_bundle_file_is_a_build_error() -> Res {
    let e = env("missingfile")?;
    put(&e.web.join("bundle.json"), r#"{"scripts":["core.js"],"styles":["s.css"],"i18n":["en","ru","fr"],"licenses":["Nope.txt"]}"#)?;
    course_with(&e, "en", &[])?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("bundle file missing or unreadable: Nope.txt"), "stderr: {err}");
    Ok(())
}

#[test]
fn unsafe_web_path_is_a_build_error() -> Res {
    let e = env("escape")?;
    module_raw(&e, "base", r#"{"manifestVersion":1,"id":"base","web":{"scripts":["../escape.js"]}}"#)?;
    course_with(&e, "en", &["base"])?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("must be relative inside the module"), "stderr: {err}");
    Ok(())
}

#[cfg(unix)]
#[test]
fn web_path_through_symlink_leaving_module_is_a_build_error() -> Res {
    let e = env("symlinkescape")?;
    put(&e.root.join("outside.js"), "var X=1;")?;
    module_raw(&e, "base", r#"{"manifestVersion":1,"id":"base","web":{"scripts":["link.js"]}}"#)?;
    std::os::unix::fs::symlink(e.root.join("outside.js"), e.root.join("modules/base/link.js"))?;
    course_with(&e, "en", &["base"])?;
    let err = failing_build_stderr(&e)?;
    assert!(err.contains("must be relative inside the module"), "stderr: {err}");
    Ok(())
}

#[test]
fn web_path_in_module_subdir_is_accepted() -> Res {
    let e = env("subdirok")?;
    module_raw(&e, "base", r#"{"manifestVersion":1,"id":"base","web":{"scripts":["sub/n.js"]}}"#)?;
    put(&e.root.join("modules/base/sub/n.js"), "var N=1;")?;
    course_with(&e, "en", &["base"])?;
    let o = build(&e, &e.root.join("dist"))?;
    assert!(o.status.success(), "stderr: {}", String::from_utf8_lossy(&o.stderr));
    Ok(())
}
