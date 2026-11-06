use serde_json::Value;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

type Res<T = ()> = Result<T, Box<dyn Error>>;

const TEMPLATE: &str = "<title><!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n";

const BUNDLE_WITH_MARKERS: &str = r#"{"scripts":["core.js","@modules","@course"],"styles":["s.css","@modules","@course"],"i18n":["en","ru","fr"],"licenses":["L.txt"]}"#;

const BUNDLE_WITHOUT_SCRIPT_MARKER: &str = r#"{"scripts":["core.js"],"styles":["s.css","@modules"],"i18n":["en","ru","fr"],"licenses":["L.txt"]}"#;

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
    let dir = std::env::temp_dir().join(format!("dojo-modules-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
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

fn env(tag: &str, bundle: &str) -> Res<Env> {
    let guard = scratch(tag)?;
    let root = guard.0.clone();
    let course = root.join("course");
    copy_dir(&demo(), &course)?;
    let _ = std::fs::remove_file(course.join("ids.lock"));
    let web = root.join("web");
    put(&web.join("bundle.json"), bundle)?;
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

/// Writes `modules/<id>/` with a script `m.js` and a style `m.css`, both marked with `id`.
fn module(e: &Env, id: &str, requires: &[&str], script: &str) -> Res {
    let dir = e.root.join("modules").join(id);
    let manifest = serde_json::json!({
        "manifestVersion": 1,
        "id": id,
        "requires": requires,
        "web": { "scripts": ["m.js"], "styles": ["m.css"] },
    });
    put(&dir.join("module.json"), &manifest.to_string())?;
    put(&dir.join("m.js"), script)?;
    put(&dir.join("m.css"), &format!(".{id}{{}}"))?;
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

fn build_html(e: &Env, out: &Path) -> Res<String> {
    let o = build(e, out)?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    Ok(std::fs::read_to_string(out.join("demo/index.html"))?)
}

fn i18n_keys(html: &str) -> Res<Vec<String>> {
    const PREFIX: &str = "window.__DOJO_I18N__=";
    let start = html.find(PREFIX).ok_or("no i18n assignment")? + PREFIX.len();
    let rest = &html[start..];
    let end = rest.find("</script>").ok_or("no closing script tag")?;
    let value: Value = serde_json::from_str(rest[..end].trim_end_matches(';'))?;
    let mut keys: Vec<String> = value.as_object().ok_or("i18n is not an object")?.keys().cloned().collect();
    keys.sort();
    Ok(keys)
}

#[test]
fn course_without_modules_ships_none_of_them() -> Res {
    let e = env("none", BUNDLE_WITH_MARKERS)?;
    module(&e, "base", &[], "var BASEM=1;")?;
    course_with(&e, "en", &[])?;
    let html = build_html(&e, &e.root.join("dist"))?;
    assert!(!html.contains("var BASEM=1;"));
    assert!(!html.contains(".base{}"));
    assert!(html.contains("var CORE=1;"));
    Ok(())
}

#[test]
fn listed_module_ships_files_in_dependency_order() -> Res {
    let e = env("order", BUNDLE_WITH_MARKERS)?;
    module(&e, "base", &[], "var BASEM=1;")?;
    module(&e, "ext", &["base"], "var EXTM=1;")?;
    course_with(&e, "en", &["ext"])?;
    let html = build_html(&e, &e.root.join("dist"))?;
    let base = html.find("var BASEM=1;").ok_or("base script missing")?;
    let ext = html.find("var EXTM=1;").ok_or("ext script missing")?;
    assert!(base < ext, "required module must come first");
    assert!(html.find("var CORE=1;").ok_or("core missing")? < base, "@modules sits before @course");
    assert!(html.contains(".base{}") && html.contains(".ext{}"));
    Ok(())
}

#[test]
fn module_script_without_marker_is_a_build_error() -> Res {
    let e = env("nomarker", BUNDLE_WITHOUT_SCRIPT_MARKER)?;
    module(&e, "base", &[], "var BASEM=1;")?;
    course_with(&e, "en", &["base"])?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_ne!(o.status.code(), Some(0));
    assert!(String::from_utf8_lossy(&o.stderr).contains("\"@modules\" marker"));
    Ok(())
}

#[test]
fn fr_ui_course_ships_en_and_fr_only() -> Res {
    let e = env("fr", BUNDLE_WITH_MARKERS)?;
    course_with(&e, "fr", &[])?;
    let html = build_html(&e, &e.root.join("dist"))?;
    assert_eq!(i18n_keys(&html)?, vec!["en".to_string(), "fr".to_string()]);
    assert!(!html.contains("Privet"));
    Ok(())
}

#[test]
fn ru_ui_course_resolves_ru_pack_modules() -> Res {
    let e = env("ru", BUNDLE_WITH_MARKERS)?;
    module(&e, "rupack", &[], "var RUPACK=1;")?;
    put(&e.web.join("i18n/packs.json"), r#"{"ru":{"modules":["rupack"]}}"#)?;
    course_with(&e, "ru", &[])?;
    let html = build_html(&e, &e.root.join("dist-ru"))?;
    assert!(html.contains("var RUPACK=1;"));
    assert_eq!(i18n_keys(&html)?, vec!["en".to_string(), "ru".to_string()]);

    course_with(&e, "en", &[])?;
    let html = build_html(&e, &e.root.join("dist-en"))?;
    assert!(!html.contains("var RUPACK=1;"));
    Ok(())
}

fn ja_module() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../modules/ja")
}

#[test]
fn ja_module_ships_its_web_files_in_order_only_when_listed() -> Res {
    let e = env("ja", BUNDLE_WITH_MARKERS)?;
    copy_dir(&ja_module(), &e.root.join("modules/ja"))?;
    let markers = [
        "modules/ja/web/ruby-dict.js",
        "modules/ja/web/ruby.js",
        "modules/ja/web/readings.js",
        "modules/ja/web/kanji-rows.js",
    ];
    course_with(&e, "en", &[])?;
    let plain = build_html(&e, &e.root.join("dist-plain"))?;
    assert!(markers.iter().all(|m| !plain.contains(m)), "course without ja ships no ja script");
    assert!(!plain.contains(".kanji-row-grid"), "course without ja ships no ja style");
    course_with(&e, "en", &["ja"])?;
    let html = build_html(&e, &e.root.join("dist"))?;
    let mut last = html.find("var CORE=1;").ok_or("core missing")?;
    for m in markers {
        let at = html.find(m).ok_or(format!("{m} missing"))?;
        assert!(last < at, "{m} out of order");
        last = at;
    }
    assert!(html.contains(".kanji-row-grid"), "ja.css shipped");
    Ok(())
}
