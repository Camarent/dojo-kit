use dojo_core::content::{Item, Intro, Stimulus, parse_intros, parse_items, parse_stimuli};
use dojo_core::lock::{self};
use dojo_core::validate::Severity;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use crate::course_files::*;
use crate::cmd::build_audio;
use crate::cmd::build_io::{write_outputs, OutArgs};
use crate::cmd::validate::{count, print_text};
use crate::{build, USAGE};
use crate::build::{build_i18n, collect_assets, Assets};

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

pub(crate) fn write_out(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    }
    fs::write(path, bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

pub(crate) enum Stop {
    Fail(String),
    Err(String),
}

pub(crate) type Step<T> = Result<T, Stop>;

pub(crate) fn fatal<T>(r: Result<T, String>) -> Step<T> {
    r.map_err(Stop::Err)
}

pub(crate) fn failed<T>(r: Result<T, String>) -> Step<T> {
    r.map_err(Stop::Fail)
}

pub(crate) struct Content {
    pub(crate) bytes: Vec<u8>,
    pub(crate) version: String,
    pub(crate) next_lock: lock::IdLock,
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

fn build_content(course: &CourseFiles, course_json: &serde_json::Value) -> Step<Content> {
    fatal(build_content_inner(course, course_json))
}

// Contract: `content` is a JSON object built in this function, so string-key assignment cannot panic.
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
    if let Some(obj) = content.as_object_mut() {
        if !stimuli_list.is_empty() {
            obj.insert("stimuli".to_owned(), serde_json::to_value(stimuli_list).map_err(|e| e.to_string())?);
        }
        if !intros_list.is_empty() {
            obj.insert("intros".to_owned(), serde_json::to_value(intros_list).map_err(|e| e.to_string())?);
        }
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

