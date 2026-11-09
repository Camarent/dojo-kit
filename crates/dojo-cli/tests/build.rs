mod common;

use common::TempDir;
use serde_json::Value;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

type Res<T = ()> = Result<T, Box<dyn Error>>;

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn unique_dir(tag: &str) -> Res<TempDir> {
    Ok(TempDir::new(&format!("dojo-build-{tag}"))?)
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

fn fixture_web(root: &Path) -> Res<PathBuf> {
    let web = root.join("web");
    put(
        &web.join("bundle.json"),
        r#"{"scripts":["a.js","b.js"],"styles":["s.css"],"i18n":["en","ru"],"licenses":["L.txt"]}"#,
    )?;
    put(&web.join("a.js"), "var a=1;")?;
    put(&web.join("b.js"), "var s='</script>';")?;
    put(&web.join("s.css"), "body{margin:0}")?;
    put(&web.join("L.txt"), "MIT -- license")?;
    put(&web.join("i18n/en.json"), r#"{"hi":"Hello </b>"}"#)?;
    put(&web.join("i18n/ru.json"), r#"{"hi":"Privet","bye":"Poka","thanks":"Spasibo"}"#)?;
    put(
        &web.join("index.template.html"),
        "<title><!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n",
    )?;
    Ok(web)
}

struct Env {
    _guard: TempDir,
    root: PathBuf,
    course: PathBuf,
    web: PathBuf,
    wasm: PathBuf,
}

fn env(tag: &str) -> Res<Env> {
    let guard = unique_dir(tag)?;
    let root = guard.to_path_buf();
    let course = root.join("course");
    copy_dir(&demo(), &course)?;
    let _ = std::fs::remove_file(course.join("ids.lock"));
    let web = fixture_web(&root)?;
    let wasm = root.join("tiny.wasm");
    std::fs::write(&wasm, [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0])?;
    Ok(Env { _guard: guard, root, course, web, wasm })
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

fn json(path: &Path) -> Res<Value> {
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

#[test]
fn demo_builds_three_outputs() -> Res {
    let e = env("ok")?;
    let out = e.root.join("dist");
    let o = build(&e, &out)?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    let dir = out.join("demo");
    for f in ["index.html", "manifest.json", "data/content.json"] {
        assert!(dir.join(f).is_file(), "{f}");
    }
    let content = json(&dir.join("data/content.json"))?;
    assert_eq!(content["v"], 1);
    assert_eq!(content["items"].as_array().map(Vec::len), Some(17));
    let version = content["version"].as_str().ok_or("version is not a string")?;
    assert_eq!(version.len(), 16);
    assert!(version.chars().all(|c| c.is_ascii_hexdigit()));
    assert_eq!(content["course"]["id"], "demo");
    assert_eq!(content["lock"]["v"], 1);
    assert_eq!(content["lock"]["ids"].as_array().map(Vec::len), Some(17));
    let manifest = json(&dir.join("manifest.json"))?;
    assert_eq!(manifest["lang"], "en");
    assert_eq!(manifest["wasmBytes"], 8);
    assert_eq!(manifest["version"], version);
    let html = std::fs::read_to_string(dir.join("index.html"))?;
    assert!(html.starts_with("<title>Demo course</title>"));
    assert!(html.contains("window.__DOJO_WASM__=\"AGFzbQEAAAA=\";"));
    assert!(html.contains("<script>var s='<\\/script>';</script>"));
    assert!(html.contains("Hello <\\/b>"));
    assert!(!html.contains("\"ru\":"));
    assert!(!html.contains("DOJO:"));
    assert!(html.contains("MIT - - license"));
    Ok(())
}

#[test]
fn favicon_link_is_inline() -> Res {
    let web = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../web");
    let e = env("favicon")?;
    let out = e.root.join("dist");
    let o = Command::new(env!("CARGO_BIN_EXE_dojo"))
        .arg("build")
        .arg(&e.course)
        .arg("--out")
        .arg(&out)
        .arg("--wasm")
        .arg(&e.wasm)
        .arg("--web")
        .arg(&web)
        .output()?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    let html = std::fs::read_to_string(out.join("demo/index.html"))?;
    assert!(html.contains("rel=\"icon\""), "missing rel=\"icon\" in index.html");
    assert!(html.contains("href=\"data:image/svg+xml,"), "missing inline svg favicon href in index.html");
    assert!(!html.contains("href=\"data:,\""), "empty data:, favicon still in index.html");
    let link_pos = html.find("<link").ok_or("no <link> in index.html")?;
    let style_pos = html.find("<style>").ok_or("no <style> in index.html")?;
    assert!(link_pos < style_pos, "<link> must appear before <style>");
    Ok(())
}

#[test]
fn build_writes_third_party_notices_next_to_index() -> Res {
    let e = env("notices")?;
    let out = e.root.join("dist");
    assert_eq!(build(&e, &out)?.status.code(), Some(0));
    let dir = out.join("demo");
    let notices = std::fs::read_to_string(dir.join("THIRD_PARTY_NOTICES.md"))?;
    assert!(!notices.trim().is_empty());
    assert!(dir.join("index.html").is_file());
    Ok(())
}

#[test]
fn build_is_deterministic() -> Res {
    let e = env("det")?;
    let (o1, o2) = (e.root.join("d1"), e.root.join("d2"));
    assert_eq!(build(&e, &o1)?.status.code(), Some(0));
    assert_eq!(build(&e, &o2)?.status.code(), Some(0));
    for f in ["index.html", "manifest.json", "data/content.json"] {
        assert_eq!(std::fs::read(o1.join("demo").join(f))?, std::fs::read(o2.join("demo").join(f))?, "{f}");
    }
    Ok(())
}

#[test]
fn ids_lock_is_written() -> Res {
    let e = env("lock")?;
    assert_eq!(build(&e, &e.root.join("dist"))?.status.code(), Some(0));
    let lock = json(&e.course.join("ids.lock"))?;
    assert_eq!(lock["ids"].as_array().map(Vec::len), Some(17));
    Ok(())
}

#[test]
fn validation_error_writes_nothing() -> Res {
    let e = env("bad")?;
    put(&e.course.join("content/zzz.jsonl"), "{\"id\":\"x-1\",\"type\":\"nope\"}\n")?;
    let out = e.root.join("dist");
    let o = build(&e, &out)?;
    assert_eq!(o.status.code(), Some(1));
    assert!(!out.exists());
    assert!(!e.course.join("ids.lock").exists());
    Ok(())
}

#[test]
fn missing_bundle_file_is_named() -> Res {
    let e = env("missing")?;
    std::fs::remove_file(e.web.join("b.js"))?;
    let out = e.root.join("dist");
    let o = build(&e, &out)?;
    assert_eq!(o.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&o.stderr).contains("b.js"));
    assert!(!out.exists());
    Ok(())
}

#[test]
fn unknown_ui_language_falls_back_to_en() -> Res {
    // (a) unknown language without course file -> exit 0, stderr warning, manifest lang en, html has no "xx" key
    let e = env("lang-fallback")?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"xx\"");
    std::fs::write(&path, text)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(0));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert!(stderr.contains("warning: no UI translation for \"xx\""));
    assert!(stderr.contains("falling back to en"));
    let manifest = json(&e.root.join("dist/demo/manifest.json"))?;
    assert_eq!(manifest["lang"], "en");
    let html = std::fs::read_to_string(e.root.join("dist/demo/index.html"))?;
    assert!(!html.contains("\"xx\":"));
    Ok(())
}

#[test]
fn course_i18n_partial_translation() -> Res {
    // (b) Course i18n/xx.json = {"hi":"Salut"} with uiLanguage xx -> exit 0, html contains "xx":{"hi":"Salut"}, manifest lang xx
    let e = env("lang-partial")?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"xx\"");
    std::fs::write(&path, text)?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    put(&e.course.join("i18n/xx.json"), r#"{"hi":"Salut"}"#)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(0));
    let html = std::fs::read_to_string(e.root.join("dist/demo/index.html"))?;
    assert!(html.contains("\"xx\":{\"hi\":\"Salut\"}"));
    let manifest = json(&e.root.join("dist/demo/manifest.json"))?;
    assert_eq!(manifest["lang"], "xx");
    Ok(())
}

#[test]
fn course_i18n_overrides_web() -> Res {
    // (c) Course i18n/ru.json overriding one key -> embedded ru has the override AND keeps other web keys
    let e = env("lang-override")?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"ru\"");
    std::fs::write(&path, text)?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    put(&e.course.join("i18n/ru.json"), r#"{"hi":"Zdravstvuyte"}"#)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(0));
    let html = std::fs::read_to_string(e.root.join("dist/demo/index.html"))?;
    // Check that the override is applied
    assert!(html.contains("\"ru\":{\"hi\":\"Zdravstvuyte\""));
    // Check that other web keys are preserved
    assert!(html.contains("\"bye\":\"Poka\""));
    assert!(html.contains("\"thanks\":\"Spasibo\""));
    let manifest = json(&e.root.join("dist/demo/manifest.json"))?;
    assert_eq!(manifest["lang"], "ru");
    Ok(())
}

#[test]
fn course_i18n_en_override() -> Res {
    // (d) Course i18n/en.json override applies to en
    let e = env("lang-en-override")?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    put(&e.course.join("i18n/en.json"), r#"{"hi":"Custom Hello"}"#)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(0));
    let html = std::fs::read_to_string(e.root.join("dist/demo/index.html"))?;
    assert!(html.contains("\"en\":{\"hi\":\"Custom Hello\"}"));
    let manifest = json(&e.root.join("dist/demo/manifest.json"))?;
    assert_eq!(manifest["lang"], "en");
    Ok(())
}

#[test]
fn malformed_course_i18n_file_fails() -> Res {
    // (e) Malformed course file -> exit 1, file name in stderr
    let e = env("lang-malformed")?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    put(&e.course.join("i18n/xx.json"), r#"{"bad": 123}"#)?; // non-string value
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"xx\"");
    std::fs::write(&path, text)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert!(stderr.contains("i18n/xx.json"));
    Ok(())
}

#[test]
fn russian_course_embeds_en_and_ru() -> Res {
    let e = env("ru")?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"ru\"");
    std::fs::write(&path, text)?;
    let out = e.root.join("dist");
    assert_eq!(build(&e, &out)?.status.code(), Some(0));
    let html = std::fs::read_to_string(out.join("demo/index.html"))?;
    assert!(html.contains("\"ru\":{\"hi\":\"Privet\",\"bye\":\"Poka\",\"thanks\":\"Spasibo\"}"));
    assert_eq!(json(&out.join("demo/manifest.json"))?["lang"], "ru");
    Ok(())
}

#[test]
fn real_web_builds_when_ui_files_exist() -> Res {
    let web = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../web");
    let bundle = json(&web.join("bundle.json"))?;
    let listed: Vec<&str> = ["scripts", "styles", "licenses"]
        .iter()
        .flat_map(|k| bundle[*k].as_array().into_iter().flatten())
        .filter_map(Value::as_str)
        .collect();
    let ready = listed.iter().all(|p| web.join(p).is_file())
        && bundle["i18n"].as_array().into_iter().flatten().filter_map(Value::as_str).all(|l| web.join(format!("i18n/{l}.json")).is_file());
    if !ready {
        return Ok(());
    }
    let e = env("real")?;
    let o = Command::new(env!("CARGO_BIN_EXE_dojo"))
        .arg("build")
        .arg(&e.course)
        .arg("--out")
        .arg(e.root.join("dist"))
        .arg("--wasm")
        .arg(&e.wasm)
        .arg("--web")
        .arg(&web)
        .output()?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    Ok(())
}

const PLUGIN_JS: &str = "(function () {\n  window.DojoExt.registerMarkup('t', { render: function (s) { return s; }, plain: function (s) { return s; } });\n})();\n";

fn enable_plugins(e: &Env, plugin_path: &str) -> Res {
    put(&e.web.join("bundle.json"), r#"{"scripts":["a.js","@course","b.js"],"styles":["s.css","@course"],"i18n":["en","ru"],"licenses":["L.txt"]}"#)?;
    put(&e.course.join("plugins/t.js"), PLUGIN_JS)?;
    put(&e.course.join("plugins/t.css"), ".t{color:red}")?;
    let path = e.course.join("course.json");
    let mut course = json(&path)?;
    let obj = course.as_object_mut().ok_or("course.json is not an object")?;
    obj.insert("plugins".into(), serde_json::json!({"scripts": [plugin_path], "styles": ["plugins/t.css"]}));
    obj.insert("markup".into(), serde_json::json!("t"));
    std::fs::write(path, serde_json::to_string(&course)?)?;
    Ok(())
}

#[test]
fn course_plugins_are_inlined_at_the_marker() -> Res {
    let e = env("plug")?;
    enable_plugins(&e, "plugins/t.js")?;
    let out = e.root.join("dist");
    let o = build(&e, &out)?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    let html = std::fs::read_to_string(out.join("demo/index.html"))?;
    let a = html.find("var a=1;").ok_or("no var a=1;")?;
    let p = html.find("registerMarkup('t'").ok_or("no registerMarkup")?;
    let b = html.find("var s='<").ok_or("no var s")?;
    assert!(a < p && p < b);
    assert!(html.contains(".t{color:red}"));
    assert!(!html.contains("src="));
    Ok(())
}

#[test]
fn dotdot_plugin_path_is_rejected() -> Res {
    let e = env("dots")?;
    enable_plugins(&e, "../t.js")?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&o.stdout).contains("bad_plugin_path"), "{}", String::from_utf8_lossy(&o.stdout));
    Ok(())
}

#[test]
fn plugins_without_marker_are_refused() -> Res {
    let e = env("nomark")?;
    enable_plugins(&e, "plugins/t.js")?;
    put(&e.web.join("bundle.json"), r#"{"scripts":["a.js"],"styles":["s.css"],"i18n":["en","ru"],"licenses":["L.txt"]}"#)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    Ok(())
}

fn validate_out(e: &Env) -> Res<Output> {
    Ok(Command::new(env!("CARGO_BIN_EXE_dojo")).arg("validate").arg(&e.course).output()?)
}

#[test]
fn missing_plugin_file_is_bad_plugin_path_in_validate() -> Res {
    let e = env("missing")?;
    enable_plugins(&e, "plugins/none.js")?;
    let o = validate_out(&e)?;
    assert_eq!(o.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&o.stdout).contains("bad_plugin_path"), "{}", String::from_utf8_lossy(&o.stdout));
    Ok(())
}

#[cfg(unix)]
#[test]
fn symlink_escaping_course_folder_is_rejected() -> Res {
    let e = env("symlink")?;
    enable_plugins(&e, "plugins/t.js")?;
    let outside = e.root.join("outside.js");
    put(&outside, "var x=1;")?;
    std::fs::remove_file(e.course.join("plugins/t.js"))?;
    std::os::unix::fs::symlink(&outside, e.course.join("plugins/t.js"))?;
    let o = validate_out(&e)?;
    assert_eq!(o.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&o.stdout).contains("bad_plugin_path"), "{}", String::from_utf8_lossy(&o.stdout));
    assert_eq!(build(&e, &e.root.join("dist"))?.status.code(), Some(1));
    Ok(())
}

#[test]
fn plugin_script_and_style_cannot_break_out_of_their_elements() -> Res {
    let e = env("escape")?;
    enable_plugins(&e, "plugins/t.js")?;
    put(&e.course.join("plugins/t.js"), "var p='</script><b>PWN</b><!-- x <script>';")?;
    put(&e.course.join("plugins/t.css"), ".t{}</STYLE><b>PWN2</b>")?;
    let out = e.root.join("dist");
    let o = build(&e, &out)?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    let html = std::fs::read_to_string(out.join("demo/index.html"))?;
    assert!(html.contains("var p='<\\/script><b>PWN</b><\\!-- x <script>';"));
    assert!(html.contains(".t{}<\\/STYLE><b>PWN2</b>"));
    assert_eq!(html.matches("</style>").count(), 1);
    Ok(())
}

#[test]
fn plugin_html_comment_opener_without_later_script_is_kept_verbatim() -> Res {
    let e = env("comment_opener")?;
    enable_plugins(&e, "plugins/t.js")?;
    put(&e.course.join("plugins/t.js"), "var r=/<!--/u; var s=a<!--b;")?;
    let out = e.root.join("dist");
    let o = build(&e, &out)?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    let html = std::fs::read_to_string(out.join("demo/index.html"))?;
    assert!(html.contains("var r=/<!--/u; var s=a<!--b;"));
    Ok(())
}

#[test]
fn stimuli_jsonl_is_loaded_into_content_json_only_when_present() -> Res {
    let e = env("stim")?;
    let plain = e.root.join("plain");
    assert_eq!(build(&e, &plain)?.status.code(), Some(0));
    assert!(json(&plain.join("demo/data/content.json"))?.get("stimuli").is_none());

    put(&e.course.join("stimuli.jsonl"), "{\"id\":\"s1\",\"title\":\"T\",\"text\":\"Passage\",\"hideText\":true}\n")?;
    let withs = e.root.join("withs");
    assert_eq!(build(&e, &withs)?.status.code(), Some(0));
    let c = json(&withs.join("demo/data/content.json"))?;
    assert_eq!(c["stimuli"][0]["id"], "s1");
    assert_eq!(c["stimuli"][0]["hideText"], true);
    assert_eq!(c["lock"], json(&plain.join("demo/data/content.json"))?["lock"]);
    Ok(())
}

#[test]
fn editing_a_stimulus_changes_version_and_no_stimulus_version_is_unchanged() -> Res {
    let e = env("stim-ver")?;
    let plain = e.root.join("plain");
    assert_eq!(build(&e, &plain)?.status.code(), Some(0));
    let v0 = json(&plain.join("demo/data/content.json"))?["version"].clone();

    put(&e.course.join("stimuli.jsonl"), "{\"id\":\"s1\",\"title\":\"T\",\"text\":\"One\"}\n")?;
    let a = e.root.join("a");
    assert_eq!(build(&e, &a)?.status.code(), Some(0));
    let v1 = json(&a.join("demo/data/content.json"))?["version"].clone();

    put(&e.course.join("stimuli.jsonl"), "{\"id\":\"s1\",\"title\":\"T\",\"text\":\"Two\"}\n")?;
    let b = e.root.join("b");
    assert_eq!(build(&e, &b)?.status.code(), Some(0));
    let v2 = json(&b.join("demo/data/content.json"))?["version"].clone();

    assert_ne!(v0, v1);
    assert_ne!(v1, v2);

    put(&e.course.join("stimuli.jsonl"), "\n")?;
    let c = e.root.join("c");
    assert_eq!(build(&e, &c)?.status.code(), Some(0));
    assert_eq!(json(&c.join("demo/data/content.json"))?["version"], v0);
    Ok(())
}

#[test]
fn empty_stimuli_file_keeps_content_json_identical() -> Res {
    let e = env("stim-empty")?;
    let a = e.root.join("a");
    assert_eq!(build(&e, &a)?.status.code(), Some(0));
    put(&e.course.join("stimuli.jsonl"), "\n")?;
    let b = e.root.join("b");
    assert_eq!(build(&e, &b)?.status.code(), Some(0));
    assert_eq!(std::fs::read(a.join("demo/data/content.json"))?, std::fs::read(b.join("demo/data/content.json"))?);
    Ok(())
}

#[test]
fn unknown_stimulus_reference_fails_the_build() -> Res {
    let e = env("stim-bad")?;
    let path = e.course.join("content/geo.jsonl");
    let text = std::fs::read_to_string(&path)?.replacen("\"unit\":\"geo\"", "\"unit\":\"geo\",\"stimulus\":\"nope\"", 1);
    put(&path, &text)?;
    let out = e.root.join("out");
    let o = build(&e, &out)?;
    assert_ne!(o.status.code(), Some(0));
    assert!(!out.join("demo").exists());
    Ok(())
}

#[test]
fn speech_reaches_content_course_and_absent_leaves_no_trace() -> Res {
    let plain = env("sp_plain")?;
    let (p1, p2) = (plain.root.join("d1"), plain.root.join("d2"));
    assert_eq!(build(&plain, &p1)?.status.code(), Some(0));
    assert_eq!(build(&plain, &p2)?.status.code(), Some(0));
    let base = json(&p1.join("demo/data/content.json"))?;
    assert!(base["course"].get("speech").is_none());
    assert_eq!(std::fs::read(p1.join("demo/data/content.json"))?, std::fs::read(p2.join("demo/data/content.json"))?);

    let e = env("sp_with")?;
    let cj = e.course.join("course.json");
    let mut c: Value = json(&cj)?;
    c["speech"] = serde_json::json!({"lang": "en", "rate": 1.5, "voices": {"m": {"pitch": 1.0, "rate": 1.2, "match": "male"}}});
    std::fs::write(&cj, serde_json::to_string_pretty(&c)?)?;
    let out = e.root.join("dist");
    let o = build(&e, &out)?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    let content = json(&out.join("demo/data/content.json"))?;
    assert_eq!(content["course"]["speech"]["lang"], "en");
    assert_eq!(content["course"]["speech"]["voices"]["m"]["match"], "male");
    assert_ne!(content["version"], base["version"]);
    Ok(())
}

#[test]
fn intros_jsonl_is_loaded_into_content_json_only_when_present() -> Res {
    let e = env("intros")?;
    let plain = e.root.join("plain");
    assert_eq!(build(&e, &plain)?.status.code(), Some(0));
    let p = json(&plain.join("demo/data/content.json"))?;
    assert!(p.get("intros").is_none());

    let first = p["items"][0]["id"].as_str().ok_or("first item has no id")?.to_string();
    put(&e.course.join("intros.jsonl"), &format!("{{\"id\":\"{first}\",\"title\":\"T\",\"text\":\"Card\",\"meta\":{{\"kind\":\"x\"}}}}\n"))?;
    let withi = e.root.join("withi");
    assert_eq!(build(&e, &withi)?.status.code(), Some(0));
    let c = json(&withi.join("demo/data/content.json"))?;
    assert_eq!(c["intros"][0]["id"], first.as_str());
    assert_eq!(c["intros"][0]["meta"]["kind"], "x");
    assert_ne!(c["version"], p["version"]);

    put(&e.course.join("intros.jsonl"), "\n")?;
    let empty = e.root.join("empty");
    assert_eq!(build(&e, &empty)?.status.code(), Some(0));
    assert_eq!(json(&empty.join("demo/data/content.json"))?["version"], p["version"]);
    Ok(())
}

#[test]
fn course_i18n_malformed_json() -> Res {
    // Malformed JSON in course file -> exact error message
    let e = env("lang-malformed-json")?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    put(&e.course.join("i18n/ru.json"), r#"{"hi": "Privet"#)?; // missing closing brace
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"ru\"");
    std::fs::write(&path, text)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert!(stderr.contains("error: i18n/ru.json: invalid JSON:"), "Expected exact error format, got: {}", stderr);
    // Check no absolute path
    assert!(!stderr.contains("/i18n/ru.json"), "Error should not contain absolute path: {}", stderr);
    Ok(())
}

#[test]
fn course_i18n_non_string_value() -> Res {
    // Non-string value in course file -> exact error message
    let e = env("lang-non-string")?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    put(&e.course.join("i18n/ru.json"), r#"{"hi": 123}"#)?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"ru\"");
    std::fs::write(&path, text)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert_eq!(stderr.trim(), "error: i18n/ru.json: key \"hi\" must be a string");
    Ok(())
}

#[test]
fn course_i18n_not_object() -> Res {
    // Top-level array in course file -> exact error message
    let e = env("lang-not-object")?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    put(&e.course.join("i18n/ru.json"), r#"["hello", "world"]"#)?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"ru\"");
    std::fs::write(&path, text)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert_eq!(stderr.trim(), "error: i18n/ru.json: expected a JSON object");
    Ok(())
}

#[test]
fn missing_web_en_json_fails() -> Res {
    // Missing web/i18n/en.json -> exit 1 with exact error message
    let e = env("missing-web-en")?;
    std::fs::remove_file(e.web.join("i18n/en.json"))?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert!(stderr.starts_with("error: i18n/en.json:"), "Expected error to start with 'error: i18n/en.json:', got: {}", stderr);
    Ok(())
}

#[test]
fn missing_web_bundle_lang_fails() -> Res {
    // Missing web/i18n/ru.json when ru is in bundle -> exit 1
    let e = env("missing-web-ru")?;
    std::fs::remove_file(e.web.join("i18n/ru.json"))?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"ru\"");
    std::fs::write(&path, text)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert!(stderr.starts_with("error: i18n/ru.json:"), "Expected error to start with 'error: i18n/ru.json:', got: {}", stderr);
    Ok(())
}

#[cfg(unix)]
#[test]
fn course_i18n_symlink_rejected() -> Res {
    // Symlinked course i18n file -> exit 1 with exact error message
    let e = env("lang-symlink")?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"ru\"");
    std::fs::write(&path, text)?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    // Create a symlink to the web ru.json
    std::os::unix::fs::symlink(e.web.join("i18n/ru.json"), e.course.join("i18n/ru.json"))?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert_eq!(stderr.trim(), "error: i18n/ru.json: symlinks are not allowed");
    Ok(())
}

#[test]
fn invalid_i18n_filename_warns() -> Res {
    // Invalid stem (with space) -> warning, build succeeds
    let e = env("lang-invalid-stem")?;
    std::fs::create_dir_all(e.course.join("i18n"))?;
    put(&e.course.join("i18n/x y.json"), r#"{"hi":"test"}"#)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(0));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert!(stderr.contains("warning: ignoring invalid i18n filename"));
    Ok(())
}

#[test]
fn unknown_ui_language_pt_br_falls_back_to_en() -> Res {
    // Unknown UI language pt-BR with no file -> warning, fallback to en
    let e = env("lang-pt-br")?;
    let path = e.course.join("course.json");
    let text = std::fs::read_to_string(&path)?.replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"pt-BR\"");
    std::fs::write(&path, text)?;
    let o = build(&e, &e.root.join("dist"))?;
    assert_eq!(o.status.code(), Some(0));
    let stderr = String::from_utf8_lossy(&o.stderr);
    assert!(stderr.contains("warning: no UI translation for \"pt-BR\""));
    let manifest = json(&e.root.join("dist/demo/manifest.json"))?;
    assert_eq!(manifest["lang"], "en");
    let html = std::fs::read_to_string(e.root.join("dist/demo/index.html"))?;
    assert!(!html.contains("\"pt-BR\":"));
    Ok(())
}
