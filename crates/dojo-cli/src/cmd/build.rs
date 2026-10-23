use dojo_core::content::{Item, Intro, Stimulus, parse_intros, parse_items, parse_stimuli};
use dojo_core::lock::{self};
use dojo_core::validate::Severity;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use crate::course_files::*;
use crate::cmd::build_audio;
use crate::cmd::validate::{count, print_text};
use crate::{build, USAGE};

const WARN_BYTES: usize = 8 * 1024 * 1024;
const MAX_BYTES: usize = 16 * 1024 * 1024;

struct BuildArgs {
    dir: String,
    out: PathBuf,
    wasm: Option<PathBuf>,
    web: Option<PathBuf>,
    strict: bool,
}

fn parse_build_args(args: &[String]) -> Result<BuildArgs, String> {
    let (mut dir, mut out, mut wasm, mut web, mut strict) = (None, PathBuf::from("dist"), None, None, false);
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--strict" => strict = true,
            "--out" => out = PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?),
            "--wasm" => wasm = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?)),
            "--web" => web = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?)),
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a.clone()),
            _ => return Err(USAGE.to_string()),
        }
    }
    Ok(BuildArgs { dir: dir.ok_or_else(|| USAGE.to_string())?, out, wasm, web, strict })
}

pub(crate) fn find_web_dir() -> Result<PathBuf, String> {
    let mut cur = std::env::current_dir().map_err(|e| format!("cannot read current directory: {e}"))?;
    loop {
        if cur.join("web/bundle.json").is_file() {
            return Ok(cur.join("web"));
        }
        if !cur.pop() {
            return Err("web/bundle.json not found in the current directory or any parent; pass --web <dir>".to_string());
        }
    }
}

fn string_list(bundle: &serde_json::Value, key: &str) -> Result<Vec<String>, String> {
    let arr = bundle.get(key).and_then(|v| v.as_array()).ok_or_else(|| format!("bundle.json: \"{key}\" must be an array of strings"))?;
    arr.iter()
        .map(|v| v.as_str().map(str::to_string).ok_or_else(|| format!("bundle.json: \"{key}\" must be an array of strings")))
        .collect()
}

fn read_listed(web: &Path, rel: &str) -> Result<String, String> {
    let path = web.join(rel);
    fs::read_to_string(&path).map_err(|e| format!("bundle file missing or unreadable: {rel} ({}): {e}", path.display()))
}

fn write_out(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    }
    fs::write(path, bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

enum Stop {
    Fail(String),
    Err(String),
}

type Step<T> = Result<T, Stop>;

fn fatal<T>(r: Result<T, String>) -> Step<T> {
    r.map_err(Stop::Err)
}

fn failed<T>(r: Result<T, String>) -> Step<T> {
    r.map_err(Stop::Fail)
}

struct Assets {
    script_html: String,
    css: String,
    license_texts: Vec<String>,
    bundle_languages: Vec<String>,
    lang: String,
}

struct Content {
    bytes: Vec<u8>,
    version: String,
    next_lock: lock::IdLock,
}

pub(crate) fn run_build(args: &[String]) -> Result<u8, String> {
    match build_course(args) {
        Ok(code) => Ok(code),
        Err(Stop::Fail(msg)) => {
            eprintln!("error: {msg}");
            Ok(1)
        }
        Err(Stop::Err(msg)) => Err(msg),
    }
}

fn build_course(args: &[String]) -> Step<u8> {
    let a = fatal(parse_build_args(args))?;
    let dir = Path::new(&a.dir);
    let course = fatal(load(dir))?;
    let mut diags = validate_course(dir, &course, a.web.clone().or_else(|| find_web_dir().ok()).as_deref());
    // The build's own i18n loader reports unreadable or non-string files with its exact messages.
    diags.retain(|d| d.code != "i18n_bad_file" && d.code != "i18n_not_string");
    let warnings = count(&diags, Severity::Warning);
    if count(&diags, Severity::Error) > 0 || (a.strict && warnings > 0) {
        print_text(&diags);
        return Ok(1);
    }
    if warnings > 0 {
        print_text(&diags);
    }
    let web = match &a.web {
        Some(w) => w.clone(),
        None => fatal(find_web_dir())?,
    };
    let wasm_path = match &a.wasm {
        Some(w) => w.clone(),
        None => web.parent().unwrap_or(Path::new(".")).join("target/wasm32-unknown-unknown/release/dojo_wasm.wasm"),
    };

    let course_json: serde_json::Value = fatal(serde_json::from_str(&course.course_text).map_err(|e| format!("course.json: {e}")))?;
    let course_json = failed(build_audio::materialise_timers(&course_json))?;
    let audio = failed(build_audio::collect(dir, &course_json))?;
    let course_id = course_json.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let title = course_json.get("title").and_then(|v| v.as_str()).unwrap_or_default().to_string();

    let assets = collect_assets(dir, &web, &course_json)?;
    let i18n = build_i18n(dir, &web, &assets.lang, &assets.bundle_languages)?;
    let template = fatal(read(&web.join("index.template.html")))?;
    let wasm = fatal(fs::read(&wasm_path).map_err(|e| format!("cannot read wasm {}: {e}", wasm_path.display())))?;
    let content = build_content(&course, &course_json)?;
    let html = render_html(&template, &title, &assets, &wasm, i18n)?;
    write_outputs(&OutArgs { out: &a.out, dir, course_id: &course_id, lang: &assets.lang, content: &content, html: &html, wasm_bytes: wasm.len(), audio: &audio })
}

fn collect_assets(dir: &Path, web: &Path, course_json: &serde_json::Value) -> Step<Assets> {
    let ui_language = course_json.get("uiLanguage").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let bundle_text = fatal(read(&web.join("bundle.json")))?;
    let bundle: serde_json::Value = fatal(serde_json::from_str(&bundle_text).map_err(|e| format!("bundle.json: {e}")))?;
    let scripts = fatal(string_list(&bundle, "scripts"))?;
    let styles = fatal(string_list(&bundle, "styles"))?;
    let bundle_languages = fatal(string_list(&bundle, "i18n"))?;
    let licenses = fatal(string_list(&bundle, "licenses"))?;

    let lang = select_lang(dir, &ui_language, &bundle_languages)?;

    let canonical_root = fatal(fs::canonicalize(dir).map_err(|e| format!("cannot canonicalize course directory: {e}")))?;
    let plugin_scripts = failed(plugin_files(&canonical_root, course_json, "scripts"))?;
    let plugin_styles = failed(plugin_files(&canonical_root, course_json, "styles"))?;
    if !plugin_scripts.is_empty() && !scripts.iter().any(|r| r == "@course") {
        return Err(Stop::Fail("bundle.json: scripts has no \"@course\" marker but the course declares plugin scripts".to_string()));
    }

    let mut script_html = String::new();
    for rel in &scripts {
        if rel == "@course" {
            for t in &plugin_scripts {
                script_html.push_str(&build::script_tag(t));
                script_html.push('\n');
            }
            continue;
        }
        let t = failed(read_listed(web, rel))?;
        script_html.push_str(&build::script_tag(&t));
        script_html.push('\n');
    }
    let mut css = String::new();
    for rel in &styles {
        if rel == "@course" {
            continue;
        }
        css.push_str(&failed(read_listed(web, rel))?);
        css.push('\n');
    }
    for t in &plugin_styles {
        css.push_str(&build::escape_style_text(t));
        css.push('\n');
    }

    let mut license_texts = Vec::new();
    for rel in &licenses {
        license_texts.push(failed(read_listed(web, rel))?);
    }
    Ok(Assets { script_html, css, license_texts, bundle_languages, lang })
}

fn select_lang(dir: &Path, ui_language: &str, bundle_languages: &[String]) -> Step<String> {
    // Collect all available languages: bundle i18n UNION course i18n/*.json stems
    let course_languages = failed(build::collect_course_languages(dir))?;
    let mut all_available: Vec<String> = bundle_languages.to_vec();
    for lang in &course_languages {
        if !all_available.contains(lang) {
            all_available.push(lang.clone());
        }
    }
    Ok(match build::select_language(ui_language, &all_available) {
        Some(l) => l,
        None => {
            eprintln!("warning: no UI translation for \"{ui_language}\"; falling back to en. Add <course>/i18n/{ui_language}.json (copy web/i18n/en.json and translate it)");
            "en".to_string()
        }
    })
}

/// Load and validate a single i18n JSON file from a path, returning its Map if valid.
/// All values must be JSON strings.
/// `label` is the relative path to use in error messages (e.g., "i18n/en.json").
fn load_i18n_file(path: &Path, label: &str) -> Result<Option<serde_json::Map<String, serde_json::Value>>, String> {
    let Some(value) = build::read_i18n_json(path, label)? else { return Ok(None) };
    let map = value.as_object().ok_or_else(|| format!("{}: expected a JSON object", label))?;

    // Validate all values are strings
    for (key, value) in map {
        if !value.is_string() {
            return Err(format!("{}: key \"{}\" must be a string", label, key));
        }
    }

    Ok(Some(map.clone()))
}

fn build_i18n(dir: &Path, web: &Path, lang: &str, bundle_languages: &[String]) -> Step<serde_json::Map<String, serde_json::Value>> {
    let mut i18n = serde_json::Map::new();
    let mut wanted = vec!["en".to_string()];
    if lang != "en" {
        wanted.push(lang.to_string());
    }
    for l in &wanted {
        let web_rel = format!("i18n/{l}.json");
        let base = failed(load_i18n_file(&web.join(&web_rel), &web_rel))?;
        if base.is_none() && (l == "en" || bundle_languages.contains(l)) {
            return Err(Stop::Fail(format!("{}: file not found", web_rel)));
        }
        let course_rel = format!("i18n/{l}.json");
        let course = failed(load_i18n_file(&dir.join(&course_rel), &course_rel))?;
        let merged = build::merge_i18n(base, course);
        i18n.insert(l.clone(), serde_json::Value::Object(merged));
    }
    Ok(i18n)
}

fn build_content(course: &CourseFiles, course_json: &serde_json::Value) -> Step<Content> {
    fatal(build_content_inner(course, course_json))
}

// Contract: `content` is a JSON object built in this function, so string-key assignment cannot panic.
#[allow(clippy::indexing_slicing)]
fn build_content_inner(course: &CourseFiles, course_json: &serde_json::Value) -> Result<Content, String> {
    let mut items: Vec<serde_json::Value> = Vec::new();
    let mut parsed: Vec<Item> = Vec::new();
    for f in &course.files {
        for line in f.text.lines().filter(|l| !l.trim().is_empty()) {
            items.push(serde_json::from_str(line).map_err(|e| format!("{}: {e}", f.name))?);
        }
        parsed.extend(parse_items(&f.text).items.into_iter().map(|(_, i)| i));
    }
    let next_lock = lock::update(course.lock.as_ref(), &parsed);

    let stimuli_list: Vec<Stimulus> = course
        .stimuli
        .as_ref()
        .map(|f| parse_stimuli(&f.text).stimuli.into_iter().map(|(_, s)| s).collect())
        .unwrap_or_default();

    let intros_list: Vec<Intro> = course
        .intros
        .as_ref()
        .map(|f| parse_intros(&f.text).stimuli.into_iter().map(|(_, s)| s).collect())
        .unwrap_or_default();

    let items_json = serde_json::to_string(&items).map_err(|e| e.to_string())?;
    let mut hash_input = format!("{}{items_json}", serde_json::to_string(course_json).map_err(|e| e.to_string())?);
    if !stimuli_list.is_empty() {
        hash_input.push_str(&serde_json::to_string(&stimuli_list).map_err(|e| e.to_string())?);
    }
    if !intros_list.is_empty() {
        hash_input.push_str(&serde_json::to_string(&intros_list).map_err(|e| e.to_string())?);
    }
    let version = format!("{:016x}", build::fnv1a64(hash_input.as_bytes()));
    let mut content = json!({
        "v": 1,
        "course": course_json,
        "items": items,
        "version": version,
        "lock": {"v": 1, "ids": next_lock.ids, "retired": next_lock.retired},
    });
    if !stimuli_list.is_empty() {
        content["stimuli"] = serde_json::to_value(stimuli_list).map_err(|e| e.to_string())?;
    }
    if !intros_list.is_empty() {
        content["intros"] = serde_json::to_value(intros_list).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_string(&content).map_err(|e| e.to_string())?.into_bytes();
    Ok(Content { bytes, version, next_lock })
}

fn render_html(template: &str, title: &str, assets: &Assets, wasm: &[u8], i18n: serde_json::Map<String, serde_json::Value>) -> Step<Vec<u8>> {
    let wasm_js = format!("window.__DOJO_WASM__=\"{}\";", build::base64(wasm));
    let i18n_js = format!("window.__DOJO_I18N__={};", build::json_for_script(&serde_json::Value::Object(i18n)));
    let html = failed(build::fill_template(
        template,
        &[
            ("<!--DOJO:TITLE-->", build::html_escape(title)),
            ("<!--DOJO:CSS-->", assets.css.clone()),
            ("<!--DOJO:SCRIPTS-->", assets.script_html.clone()),
            ("<!--DOJO:WASM-->", wasm_js),
            ("<!--DOJO:I18N-->", i18n_js),
            ("<!--DOJO:LICENSES-->", build::license_comment(&assets.license_texts)),
        ],
    ))?;
    Ok(html.into_bytes())
}

struct OutArgs<'a> {
    out: &'a Path,
    dir: &'a Path,
    course_id: &'a str,
    lang: &'a str,
    content: &'a Content,
    html: &'a [u8],
    wasm_bytes: usize,
    audio: &'a [build_audio::AudioFile],
}

/// Fails when the output directory is the course directory or nested with it (the build removes data/audio under the output).
fn check_out_disjoint(target: &Path, dir: &Path) -> Result<(), String> {
    let canon = |p: &Path| -> PathBuf {
        let mut tail = Vec::new();
        let mut cur = p.to_path_buf();
        while !cur.exists() {
            match cur.file_name().map(|n| n.to_os_string()) {
                Some(n) => tail.push(n),
                None => break,
            }
            if !cur.pop() {
                break;
            }
        }
        let mut base = cur.canonicalize().unwrap_or(cur);
        tail.iter().rev().for_each(|n| base.push(n));
        base
    };
    let (t, d) = (canon(target), canon(dir));
    if t.starts_with(&d) || d.starts_with(&t) {
        return Err(format!("output directory {} overlaps the course directory {}", t.display(), d.display()));
    }
    Ok(())
}

fn write_outputs(o: &OutArgs) -> Step<u8> {
    let OutArgs { out, dir, course_id, lang, content, html, wasm_bytes, audio } = *o;
    let total = content.bytes.len() + html.len();
    if total > MAX_BYTES {
        return Err(Stop::Fail(format!("total size {total} bytes exceeds the {MAX_BYTES} byte limit")));
    }
    let mut manifest = json!({
        "course": course_id,
        "version": content.version,
        "files": [
            {"path": "data/content.json", "bytes": content.bytes.len()},
            {"path": "index.html", "bytes": html.len()},
        ],
        "totalBytes": total,
        "wasmBytes": wasm_bytes,
        "lang": lang,
    });
    for f in audio {
        manifest["files"].as_array_mut().map(|a| a.push(json!({"path": f.rel, "bytes": f.bytes})));
    }
    failed(check_out_disjoint(out.join(course_id).as_path(), dir))?;
    let manifest_text = fatal(serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string()))? + "\n";

    let fixed = (total + manifest_text.len() + include_str!("../../../../THIRD_PARTY_NOTICES.md").len()) as u64;
    failed(build_audio::check_totals(audio, fixed, 4))?;
    fatal(write_out(&dir.join("ids.lock"), content.next_lock.to_text().as_bytes()))?;
    let target = out.join(course_id);
    fatal(write_out(&target.join("data/content.json"), &content.bytes))?;
    fatal(write_out(&target.join("index.html"), html))?;
    fatal(write_out(&target.join("manifest.json"), manifest_text.as_bytes()))?;

    // Write third-party notices
    let notices = include_str!("../../../../THIRD_PARTY_NOTICES.md");
    fatal(write_out(&target.join("THIRD_PARTY_NOTICES.md"), notices.as_bytes()))?;
    fatal(build_audio::copy(&target, audio))?;

    println!("built {course_id} version {} lang {lang} -> {}", content.version, target.display());
    println!("  data/content.json {} bytes, index.html {} bytes, wasm {wasm_bytes} bytes, total {total} bytes", content.bytes.len(), html.len());
    if total > WARN_BYTES {
        println!("warning: total size {total} bytes exceeds {WARN_BYTES} bytes");
    }
    Ok(0)
}
