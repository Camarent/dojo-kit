mod common;

use common::TempDir;
use std::fs;
use std::io;
use std::os::unix::fs as unix_fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const TINY_WASM: [u8; 8] = [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0];

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn unique_dir(tag: &str) -> io::Result<TempDir> {
    TempDir::new(&format!("dojo-cli-{tag}"))
}

fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
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

/// Sets `plugins.scripts` in `dir/course.json`.
fn set_plugin_scripts(dir: &Path, script: &str) -> io::Result<()> {
    let course_path = dir.join("course.json");
    let mut v: serde_json::Value = serde_json::from_str(&fs::read_to_string(&course_path)?)?;
    v.as_object_mut().ok_or_else(|| io::Error::other("course.json is not an object"))?.insert("plugins".to_string(), serde_json::json!({ "scripts": [script] }));
    fs::write(&course_path, serde_json::to_string_pretty(&v)?)
}

/// Runs `dojo build` on `dir` with a tiny wasm and a fixture web, output to a fresh dir. Returns (output, out dir).
fn build_course(dir: &Path, tag: &str) -> io::Result<(Output, TempDir)> {
    let build_out = unique_dir(&format!("{tag}-build"))?;
    let wasm = unique_dir(&format!("{tag}-wasm"))?;
    fs::write(wasm.join("tiny.wasm"), TINY_WASM)?;
    let web_root = unique_dir(&format!("{tag}-web"))?;
    let web = fixture_web(&web_root)?;
    let out = dojo()
        .arg("build")
        .arg(dir)
        .arg("--out")
        .arg(&*build_out)
        .arg("--wasm")
        .arg(wasm.join("tiny.wasm"))
        .arg("--web")
        .arg(&*web)
        .output()?;
    Ok((out, build_out))
}

#[test]
fn plugin_path_containing_double_dot_escapes_course_root_is_rejected() {
    let dir = unique_dir("plugin-escape").unwrap();
    copy_dir(&demo(), &dir).unwrap();

    let parent = dir.parent().unwrap();
    fs::write(parent.join("outside.js"), "// external plugin").unwrap();
    set_plugin_scripts(&dir, "../outside.js").unwrap();

    let validate_out = dojo().arg("validate").arg(&*dir).output().unwrap();
    assert_ne!(code(&validate_out), Some(0), "Expected non-zero exit for escaping plugin path in validate, got: {}", stdout(&validate_out));
    let validate_text = stdout(&validate_out);
    assert!(validate_text.contains("bad_plugin_path") || validate_text.contains("resolves outside"), "Expected error about escaping path in validate, got: {}", validate_text);

    let (build, _) = build_course(&dir, "plugin-escape").unwrap();
    assert_ne!(code(&build), Some(0), "Expected non-zero exit for escaping plugin path in build, got: {}", stdout(&build));
}

#[test]
fn plugin_that_is_a_symlink_is_rejected() {
    let dir = unique_dir("plugin-symlink").unwrap();
    copy_dir(&demo(), &dir).unwrap();

    let plugins_dir = dir.join("plugins");
    fs::create_dir_all(&plugins_dir).unwrap();
    let real_plugin = plugins_dir.join("real.js");
    fs::write(&real_plugin, "console.log('hello');").unwrap();
    unix_fs::symlink(&real_plugin, plugins_dir.join("link.js")).unwrap();
    set_plugin_scripts(&dir, "plugins/link.js").unwrap();

    let validate_out = dojo().arg("validate").arg(&*dir).output().unwrap();
    assert_ne!(code(&validate_out), Some(0), "Expected non-zero exit for symlink plugin in validate, got: {}", stdout(&validate_out));
    let validate_text = stdout(&validate_out);
    assert!(validate_text.contains("bad_plugin_path") || validate_text.contains("symlink"), "Expected error about symlink in validate, got: {}", validate_text);

    let (build, _) = build_course(&dir, "plugin-symlink").unwrap();
    assert_ne!(code(&build), Some(0), "Expected non-zero exit for symlink plugin in build, got: {}", stdout(&build));
}

#[test]
fn course_json_that_is_a_symlink_is_rejected() {
    let dir = unique_dir("course-symlink").unwrap();
    copy_dir(&demo(), &dir).unwrap();
    let real = dir.join("real-course.json");
    fs::rename(dir.join("course.json"), &real).unwrap();
    unix_fs::symlink(&real, dir.join("course.json")).unwrap();

    let validate_out = dojo().arg("validate").arg(&*dir).output().unwrap();
    assert_ne!(code(&validate_out), Some(0), "validate accepted symlinked course.json: {}", stdout(&validate_out));

    let (build, _) = build_course(&dir, "course-symlink").unwrap();
    assert_ne!(code(&build), Some(0), "build accepted symlinked course.json: {}", stdout(&build));
}

#[test]
fn nonexistent_course_directory_gives_non_zero_exit() {
    let missing = std::env::temp_dir().join("dojo-cli-nonexistent-course");
    let out = dojo().arg("validate").arg(&*missing).output().unwrap();
    assert_eq!(code(&out), Some(2), "Expected exit code 2 for nonexistent directory, got: {}", code(&out).unwrap_or(-1));
    let stderr_text = stderr(&out);
    assert!(!stderr_text.is_empty(), "Expected error message in stderr for nonexistent directory");
}

#[test]
fn valid_plugin_builds_successfully() {
    let dir = unique_dir("plugin-valid").unwrap();
    copy_dir(&demo(), &dir).unwrap();

    let plugins_dir = dir.join("plugins");
    fs::create_dir_all(&plugins_dir).unwrap();
    fs::write(plugins_dir.join("custom.js"), "console.log('custom plugin');").unwrap();
    set_plugin_scripts(&dir, "plugins/custom.js").unwrap();

    let (out, build_out) = build_course(&dir, "plugin-valid").unwrap();
    assert_eq!(code(&out), Some(0), "Expected successful build, got: {}", stdout(&out));
    assert!(build_out.join("demo").exists(), "Expected demo directory to be created");
    let html = fs::read_to_string(build_out.join("demo/index.html")).unwrap();
    assert!(html.contains("custom plugin"), "Expected plugin content in HTML");
}

fn fixture_web(root: &Path) -> io::Result<PathBuf> {
    let web = root.join("web");
    fs::create_dir_all(web.join("i18n"))?;
    let _ = fs::write(web.join("bundle.json"), r#"{"scripts":["@course","a.js"],"styles":["s.css"],"i18n":["en"],"licenses":["L.txt"]}"#);
    let _ = fs::write(web.join("a.js"), "var a=1;");
    let _ = fs::write(web.join("s.css"), "body{margin:0}");
    let _ = fs::write(web.join("L.txt"), "MIT");
    let _ = fs::write(web.join("i18n/en.json"), r#"{"hi":"Hello {name}"}"#);
    let _ = fs::write(
        web.join("index.template.html"),
        "<title><!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n",
    );
    Ok(web)
}

/// Returns the course and the outside dir its symlink points to; the caller keeps both alive.
fn course_with_symlinked_dir_plugin(tag: &str) -> io::Result<(TempDir, TempDir)> {
    let dir = unique_dir(tag)?;
    copy_dir(&demo(), &dir)?;
    let outside = unique_dir(&format!("{tag}-outside"))?;
    fs::write(outside.join("evil.js"), "// evil")?;
    unix_fs::symlink(&*outside, dir.join("linked"))?;
    set_plugin_scripts(&dir, "linked/evil.js")?;
    Ok((dir, outside))
}

#[test]
fn validate_rejects_plugin_inside_symlinked_directory_pointing_outside() {
    let (dir, _outside) = course_with_symlinked_dir_plugin("plugin-dirlink-validate").unwrap();
    let out = dojo().arg("validate").arg(&*dir).output().unwrap();
    assert_ne!(code(&out), Some(0), "validate accepted escaping plugin: {}", stdout(&out));
    assert!(stdout(&out).contains("outside the course folder"), "got: {}", stdout(&out));
}

#[test]
fn build_rejects_plugin_inside_symlinked_directory_pointing_outside() {
    let (dir, _outside) = course_with_symlinked_dir_plugin("plugin-dirlink-build").unwrap();
    let (out, build_out) = build_course(&dir, "plugin-dirlink-build").unwrap();
    assert_ne!(code(&out), Some(0), "build accepted escaping plugin");
    assert!(!build_out.join("index.html").exists() || !fs::read_to_string(build_out.join("index.html")).unwrap().contains("// evil"));
}
