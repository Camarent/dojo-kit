use std::os::unix::fs as unix_fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn unique_dir(tag: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("dojo-cli-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stdout(out: &Output) -> String {
    String::from_utf8(out.stdout.clone()).unwrap()
}

fn stderr(out: &Output) -> String {
    String::from_utf8(out.stderr.clone()).unwrap()
}

#[test]
fn plugin_path_containing_double_dot_escapes_course_root_is_rejected() {
    let dir = unique_dir("plugin-escape");
    copy_dir(&demo(), &dir);
    
    let course_path = dir.join("course.json");
    let course_text = std::fs::read_to_string(&course_path).unwrap();
    let course_with_plugin: serde_json::Value = serde_json::from_str(&course_text).unwrap();
    
    let parent = dir.parent().unwrap();
    let outside_js = parent.join("outside.js");
    std::fs::write(&outside_js, "// external plugin").unwrap();
    
    let mut course_obj = course_with_plugin.as_object().unwrap().clone();
    course_obj.insert("plugins".to_string(), serde_json::json!({
        "scripts": ["../outside.js"]
    }));
    
    let new_course = serde_json::Value::Object(course_obj);
    std::fs::write(&course_path, serde_json::to_string_pretty(&new_course).unwrap()).unwrap();
    
    let validate_out = dojo().arg("validate").arg(&dir).output().unwrap();
    assert_ne!(code(&validate_out), Some(0), "Expected non-zero exit for escaping plugin path in validate, got: {}", stdout(&validate_out));
    let validate_text = stdout(&validate_out);
    assert!(validate_text.contains("bad_plugin_path") || validate_text.contains("resolves outside"), "Expected error about escaping path in validate, got: {}", validate_text);
    
    let build_out = unique_dir("plugin-escape-build");
    let wasm = unique_dir("plugin-escape-wasm");
    std::fs::write(wasm.join("tiny.wasm"), [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).unwrap();
    let web = unique_dir("plugin-escape-web");
    let web_path = fixture_web(&web);
    
    let build = dojo()
        .arg("build")
        .arg(&dir)
        .arg("--out")
        .arg(&build_out)
        .arg("--wasm")
        .arg(wasm.join("tiny.wasm"))
        .arg("--web")
        .arg(&web_path)
        .output()
        .unwrap();
    assert_ne!(code(&build), Some(0), "Expected non-zero exit for escaping plugin path in build, got: {}", stdout(&build));
}

#[test]
fn plugin_that_is_a_symlink_is_rejected() {
    let dir = unique_dir("plugin-symlink");
    copy_dir(&demo(), &dir);
    
    let plugins_dir = dir.join("plugins");
    std::fs::create_dir_all(&plugins_dir).unwrap();
    
    let real_plugin = plugins_dir.join("real.js");
    std::fs::write(&real_plugin, "console.log('hello');").unwrap();
    
    let symlink_plugin = plugins_dir.join("link.js");
    unix_fs::symlink(&real_plugin, &symlink_plugin).unwrap();
    
    let course_path = dir.join("course.json");
    let course_text = std::fs::read_to_string(&course_path).unwrap();
    let course_with_plugin: serde_json::Value = serde_json::from_str(&course_text).unwrap();
    
    let mut course_obj = course_with_plugin.as_object().unwrap().clone();
    course_obj.insert("plugins".to_string(), serde_json::json!({
        "scripts": ["plugins/link.js"]
    }));
    
    let new_course = serde_json::Value::Object(course_obj);
    std::fs::write(&course_path, serde_json::to_string_pretty(&new_course).unwrap()).unwrap();
    
    let validate_out = dojo().arg("validate").arg(&dir).output().unwrap();
    assert_ne!(code(&validate_out), Some(0), "Expected non-zero exit for symlink plugin in validate, got: {}", stdout(&validate_out));
    let validate_text = stdout(&validate_out);
    assert!(validate_text.contains("bad_plugin_path") || validate_text.contains("symlink"), "Expected error about symlink in validate, got: {}", validate_text);
    
    let build_out = unique_dir("plugin-symlink-build");
    let wasm = unique_dir("plugin-symlink-wasm");
    std::fs::write(wasm.join("tiny.wasm"), [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).unwrap();
    let web = unique_dir("plugin-symlink-web");
    let web_path = fixture_web(&web);
    
    let build = dojo()
        .arg("build")
        .arg(&dir)
        .arg("--out")
        .arg(&build_out)
        .arg("--wasm")
        .arg(wasm.join("tiny.wasm"))
        .arg("--web")
        .arg(&web_path)
        .output()
        .unwrap();
    assert_ne!(code(&build), Some(0), "Expected non-zero exit for symlink plugin in build, got: {}", stdout(&build));
}

#[test]
fn nonexistent_course_directory_gives_non_zero_exit() {
    let missing = std::env::temp_dir().join("dojo-cli-nonexistent-course");
    let out = dojo().arg("validate").arg(&missing).output().unwrap();
    assert_eq!(code(&out), Some(2), "Expected exit code 2 for nonexistent directory, got: {}", code(&out).unwrap_or(-1));
    let stderr_text = stderr(&out);
    assert!(!stderr_text.is_empty(), "Expected error message in stderr for nonexistent directory");
}

#[test]
fn valid_plugin_builds_successfully() {
    let dir = unique_dir("plugin-valid");
    copy_dir(&demo(), &dir);
    
    let plugins_dir = dir.join("plugins");
    std::fs::create_dir_all(&plugins_dir).unwrap();
    
    let plugin_script = plugins_dir.join("custom.js");
    std::fs::write(&plugin_script, "console.log('custom plugin');").unwrap();
    
    let course_path = dir.join("course.json");
    let course_text = std::fs::read_to_string(&course_path).unwrap();
    let course_with_plugin: serde_json::Value = serde_json::from_str(&course_text).unwrap();
    
    let mut course_obj = course_with_plugin.as_object().unwrap().clone();
    course_obj.insert("plugins".to_string(), serde_json::json!({
        "scripts": ["plugins/custom.js"]
    }));
    
    let new_course = serde_json::Value::Object(course_obj);
    std::fs::write(&course_path, serde_json::to_string_pretty(&new_course).unwrap()).unwrap();
    
    let web_dir = unique_dir("plugin-valid-web");
    let web = fixture_web(&web_dir);
    let build_out = unique_dir("plugin-valid-build");
    
    let wasm = unique_dir("plugin-valid-wasm");
    std::fs::write(wasm.join("tiny.wasm"), [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).unwrap();
    
    let out = dojo()
        .arg("build")
        .arg(&dir)
        .arg("--out")
        .arg(&build_out)
        .arg("--wasm")
        .arg(wasm.join("tiny.wasm"))
        .arg("--web")
        .arg(&web)
        .output()
        .unwrap();
    
    assert_eq!(code(&out), Some(0), "Expected successful build, got: {}", stdout(&out));
    assert!(build_out.join("demo").exists(), "Expected demo directory to be created");
    let html = std::fs::read_to_string(build_out.join("demo/index.html")).unwrap();
    assert!(html.contains("custom plugin"), "Expected plugin content in HTML");
}

fn fixture_web(root: &Path) -> PathBuf {
    let web = root.join("web");
    std::fs::create_dir_all(web.join("i18n")).unwrap();
    let _ = std::fs::write(web.join("bundle.json"), r#"{"scripts":["@course","a.js"],"styles":["s.css"],"i18n":["en"],"licenses":["L.txt"]}"#);
    let _ = std::fs::write(web.join("a.js"), "var a=1;");
    let _ = std::fs::write(web.join("s.css"), "body{margin:0}");
    let _ = std::fs::write(web.join("L.txt"), "MIT");
    let _ = std::fs::write(web.join("i18n/en.json"), r#"{"hi":"Hello {name}"}"#);
    let _ = std::fs::write(
        web.join("index.template.html"),
        "<title><!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n",
    );
    web
}

fn course_with_symlinked_dir_plugin(tag: &str) -> PathBuf {
    let dir = unique_dir(tag);
    copy_dir(&demo(), &dir);
    let outside = unique_dir(&format!("{tag}-outside"));
    std::fs::write(outside.join("evil.js"), "// evil").unwrap();
    unix_fs::symlink(&outside, dir.join("linked")).unwrap();
    let course_path = dir.join("course.json");
    let mut v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&course_path).unwrap()).unwrap();
    v["plugins"] = serde_json::json!({"scripts": ["linked/evil.js"]});
    std::fs::write(&course_path, serde_json::to_string_pretty(&v).unwrap()).unwrap();
    dir
}

#[test]
fn validate_rejects_plugin_inside_symlinked_directory_pointing_outside() {
    let dir = course_with_symlinked_dir_plugin("plugin-dirlink-validate");
    let out = dojo().arg("validate").arg(&dir).output().unwrap();
    assert_ne!(code(&out), Some(0), "validate accepted escaping plugin: {}", stdout(&out));
    assert!(stdout(&out).contains("outside the course folder"), "got: {}", stdout(&out));
}

#[test]
fn build_rejects_plugin_inside_symlinked_directory_pointing_outside() {
    let dir = course_with_symlinked_dir_plugin("plugin-dirlink-build");
    let build_out = unique_dir("plugin-dirlink-build-out");
    let wasm = unique_dir("plugin-dirlink-build-wasm");
    std::fs::write(wasm.join("tiny.wasm"), [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).unwrap();
    let web = fixture_web(&unique_dir("plugin-dirlink-build-web"));
    let out = dojo().arg("build").arg(&dir).arg("--out").arg(&build_out).arg("--wasm").arg(wasm.join("tiny.wasm")).arg("--web").arg(&web).output().unwrap();
    assert_ne!(code(&out), Some(0), "build accepted escaping plugin");
    assert!(!build_out.join("index.html").exists() || !std::fs::read_to_string(build_out.join("index.html")).unwrap().contains("// evil"));
}
