mod add;
mod build;
mod import_progress;

use dojo_core::content::{Course, Item, ItemType, Intro, Stimulus, parse_course, parse_intros, parse_items, parse_stimuli};
use dojo_core::days;
use dojo_core::lock::{self, IdLock};
use dojo_core::schema;
use dojo_core::slug::is_valid_course_id;
use dojo_core::stats::{compute, Stats};
use dojo_core::validate::{Diagnostic, Severity, SourceFile, validate_all};
use serde_json::json;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const USAGE: &str = "usage: dojo schema (--out <dir> | --brief)\n       dojo validate <course-dir> [--json] [--strict] [--web <dir>]\n\
       dojo lock <course-dir>\n\
       dojo build <course-dir> [--out <dir>] [--wasm <file>] [--web <dir>] [--strict]\n\
       dojo init <course-id> [--title T] [--ui LANG] [--content-lang LANG] [--workspace DIR]\n\
       dojo stats <course-dir> [--json]\n\
       dojo next-id <course-dir> <prefix> [--count N]\n\
       dojo add <course-dir> <unit-id> [--file F] [--dry-run]\n\
       dojo import-progress <old.json> --map <id-map.json> --course <dir> [--out <file>] [--write] [--now <ISO>";

fn write_schemas(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    fs::write(dir.join("course.schema.json"), schema::pretty(&schema::course_schema()))?;
    fs::write(dir.join("item.schema.json"), schema::pretty(&schema::item_schema()))
}

struct CourseFiles {
    course_text: String,
    files: Vec<SourceFile>,
    lock: Option<IdLock>,
    stimuli: Option<SourceFile>,
    intros: Option<SourceFile>,
}

fn read(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("cannot read {}: {e}", path.display()))
}

/// Check if a path is a symlink and return an error message if it is.
fn check_symlink(path: &Path, kind: &str) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("cannot check {} {}: {e}", kind, path.display())),
    };
    if metadata.file_type().is_symlink() {
        Err(format!("{} is a symlink, which is not allowed for security reasons", kind))
    } else {
        Ok(())
    }
}

fn load(dir: &Path) -> Result<CourseFiles, String> {
    if !dir.is_dir() {
        return Err(format!("not a directory: {}", dir.display()));
    }
    let course_text = read(&dir.join("course.json"))?;
    let content = dir.join("content");

    let mut names: Vec<String> = Vec::new();
    if content.is_dir() {
        // Check that content directory is not a symlink
        check_symlink(&content, "content directory")?;
        let entries = fs::read_dir(&content).map_err(|e| format!("cannot read {}: {e}", content.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("cannot read {}: {e}", content.display()))?;
            let path = entry.path();
            // Check that each content file is not a symlink
            check_symlink(&path, &format!("content file {}", path.display()))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(".jsonl") && path.is_file() {
                names.push(name);
            }
        }
    }
    names.sort();
    let mut files = Vec::new();
    for name in names {
        let text = read(&content.join(&name))?;
        files.push(SourceFile { name: format!("content/{name}"), text });
    }
    let lock_path = dir.join("ids.lock");

    // Check that ids.lock is not a symlink
    check_symlink(&lock_path, "ids.lock")?;

    let lock = if lock_path.is_file() {
        let text = read(&lock_path)?;
        Some(lock::parse_lock(&text).map_err(|e| format!("bad {}: {e}", lock_path.display()))?)
    } else {
        None
    };

    let stimuli_path = dir.join("stimuli.jsonl");

    // Check that stimuli.jsonl is not a symlink
    check_symlink(&stimuli_path, "stimuli.jsonl")?;

    let stimuli = if stimuli_path.is_file() {
        let text = read(&stimuli_path)?;
        Some(SourceFile { name: "stimuli.jsonl".to_string(), text })
    } else {
        None
    };
    let intros_path = dir.join("intros.jsonl");
    check_symlink(&intros_path, "intros.jsonl")?;
    let intros = if intros_path.is_file() {
        let text = read(&intros_path)?;
        Some(SourceFile { name: "intros.jsonl".to_string(), text })
    } else {
        None
    };
    Ok(CourseFiles { course_text, files, lock, stimuli, intros })
}

fn count(diags: &[Diagnostic], severity: Severity) -> usize {
    diags.iter().filter(|d| d.severity == severity).count()
}

fn print_text(diags: &[Diagnostic]) {
    for d in diags {
        let place = if d.line == 0 { d.file.clone() } else { format!("{}:{}", d.file, d.line) };
        println!("{}[{}] {place}: {}", d.severity.as_str(), d.code, d.message);
    }
    println!("{} errors, {} warnings", count(diags, Severity::Error), count(diags, Severity::Warning));
}

fn print_json(diags: &[Diagnostic]) {
    let errors = count(diags, Severity::Error);
    let list: Vec<_> = diags
        .iter()
        .map(|d| json!({"severity": d.severity.as_str(), "code": d.code, "file": d.file, "line": d.line, "message": d.message}))
        .collect();
    let out = json!({"ok": errors == 0, "errors": errors, "warnings": count(diags, Severity::Warning), "diagnostics": list});
    println!("{out}");
}

/// Checks `<dir>/i18n/*.json` against `<web>/i18n/en.json`; nothing when the reference is unavailable.
fn i18n_check(dir: &Path, web: Option<&Path>) -> Vec<Diagnostic> {
    let Some(web) = web else { return Vec::new() };
    let Ok(text) = fs::read_to_string(web.join("i18n/en.json")) else { return Vec::new() };
    let Ok(serde_json::Value::Object(reference)) = serde_json::from_str::<serde_json::Value>(&text) else { return Vec::new() };
    let langs = match build::collect_course_languages(dir) {
        Ok(l) => l,
        Err(message) => return vec![Diagnostic { severity: Severity::Error, code: "i18n_bad_file", file: "i18n".to_string(), line: 0, message }],
    };
    let mut diags = Vec::new();
    for lang in langs {
        let file = format!("i18n/{lang}.json");
        match build::read_i18n_json(&dir.join(&file), &file) {
            Ok(Some(value)) => diags.extend(build::i18n_diagnostics(&reference, &file, &value)),
            Ok(None) => {}
            Err(message) => diags.push(Diagnostic { severity: Severity::Error, code: "i18n_bad_file", file, line: 0, message }),
        }
    }
    diags
}

/// Core validation, the UI-file checks and the plugin file checks that need the filesystem.
fn validate_course(dir: &Path, course: &CourseFiles, web: Option<&Path>) -> Vec<Diagnostic> {
    let mut diags = validate_all(&course.course_text, &course.files, course.lock.as_ref(), course.stimuli.as_ref(), course.intros.as_ref());
    diags.extend(i18n_check(dir, web));
    let root = match fs::canonicalize(dir) {
        Ok(r) => r,
        Err(e) => {
            diags.push(Diagnostic { severity: Severity::Error, code: "bad_plugin_path", file: dir.display().to_string(), line: 0, message: format!("cannot canonicalize course directory: {e}") });
            return diags;
        }
    };
    let value: serde_json::Value = serde_json::from_str(&course.course_text).unwrap_or_default();
    for kind in ["scripts", "styles"] {
        let list = value.get("plugins").and_then(|p| p.get(kind)).and_then(|v| v.as_array());
        for path in list.into_iter().flatten().filter_map(|v| v.as_str()) {
            let full_path = root.join(path);
            let metadata = match fs::symlink_metadata(&full_path) {
                Ok(m) => m,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    diags.push(Diagnostic { severity: Severity::Error, code: "bad_plugin_path", file: "course.json".to_string(), line: 0, message: format!("plugins.{kind} file '{path}' cannot be read: {e}") });
                    continue;
                }
                Err(e) => {
                    diags.push(Diagnostic { severity: Severity::Error, code: "bad_plugin_path", file: "course.json".to_string(), line: 0, message: format!("plugins.{kind} file '{path}' cannot be checked: {e}") });
                    continue;
                }
            };
            if metadata.file_type().is_symlink() {
                diags.push(Diagnostic { severity: Severity::Error, code: "bad_plugin_path", file: "course.json".to_string(), line: 0, message: format!("plugins.{kind} '{path}' is a symlink, which is not allowed for security reasons") });
                continue;
            }
            let problem = match fs::canonicalize(&full_path) {
                Err(e) => Some(format!("plugins.{kind} file '{path}' cannot be read: {e}")),
                Ok(real) if !real.starts_with(&root) => Some(format!("plugins.{kind} path '{path}' resolves outside the course folder")),
                Ok(real) if !real.is_file() => Some(format!("plugins.{kind} path '{path}' is not a file")),
                Ok(_) => None,
            };
            if let Some(message) = problem {
                if !diags.iter().any(|d| d.code == "bad_plugin_path" && d.message.contains(&format!("'{path}'"))) {
                    diags.push(Diagnostic { severity: Severity::Error, code: "bad_plugin_path", file: "course.json".to_string(), line: 0, message });
                }
            }
        }
    }
    diags
}

fn run_validate(args: &[String]) -> Result<u8, String> {
    let mut dir = None;
    let (mut as_json, mut strict, mut web) = (false, false, None);
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--json" => as_json = true,
            "--strict" => strict = true,
            "--web" => web = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?)),
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }
    let dir = dir.ok_or_else(|| USAGE.to_string())?;
    let course = load(Path::new(dir))?;
    let web = web.or_else(|| find_web_dir().ok());
    let diags = validate_course(Path::new(dir), &course, web.as_deref());
    if as_json {
        print_json(&diags);
    } else {
        print_text(&diags);
    }
    let failed = count(&diags, Severity::Error) > 0 || (strict && count(&diags, Severity::Warning) > 0);
    Ok(u8::from(failed))
}

fn run_lock(args: &[String]) -> Result<u8, String> {
    let [dir] = args else {
        return Err(USAGE.to_string());
    };
    if dir.starts_with("--") {
        return Err(USAGE.to_string());
    }
    let dir = Path::new(dir);
    let course = load(dir)?;
    let diags = validate_course(dir, &course, find_web_dir().ok().as_deref());
    if count(&diags, Severity::Error) > 0 {
        print_text(&diags);
        return Ok(1);
    }
    let items: Vec<Item> = course.files.iter().flat_map(|f| parse_items(&f.text).items).map(|(_, i)| i).collect();
    let next = lock::update(course.lock.as_ref(), &items);
    let path = dir.join("ids.lock");
    // Check that ids.lock is not a symlink before writing
    check_symlink(&path, "ids.lock")?;
    fs::write(&path, next.to_text()).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    println!("ids.lock: {} ids, {} retired", next.ids.len(), next.retired.len());
    Ok(0)
}

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

fn find_web_dir() -> Result<PathBuf, String> {
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

/// Reads the files listed in `course.json` `plugins.<kind>`, relative to the course folder.
fn plugin_files(canonical_root: &Path, course: &serde_json::Value, kind: &str) -> Result<Vec<String>, String> {
    let list = course.get("plugins").and_then(|p| p.get(kind)).and_then(|v| v.as_array());
    let mut out = Vec::new();
    for path in list.into_iter().flatten().filter_map(|v| v.as_str()) {
        let full_path = canonical_root.join(path);
        let real = fs::canonicalize(&full_path).map_err(|e| format!("plugins.{kind} '{path}': {e}"))?;
        if !real.starts_with(canonical_root) {
            return Err(format!("plugins.{kind} path '{path}' resolves outside the course folder"));
        }
        let metadata = fs::symlink_metadata(&full_path).map_err(|e| format!("plugins.{kind} '{path}': cannot check: {e}"))?;
        if metadata.file_type().is_symlink() {
            return Err(format!("plugins.{kind} '{path}' is a symlink, which is not allowed for security reasons"));
        }
        let text = read(&full_path).map_err(|e| format!("plugins.{kind} '{path}': {e}"))?;
        out.push(text);
    }
    Ok(out)
}

fn run_build(args: &[String]) -> Result<u8, String> {
    let a = parse_build_args(args)?;
    let dir = Path::new(&a.dir);
    let course = load(dir)?;
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
        None => find_web_dir()?,
    };
    let wasm_path = match &a.wasm {
        Some(w) => w.clone(),
        None => web.parent().unwrap_or(Path::new(".")).join("target/wasm32-unknown-unknown/release/dojo_wasm.wasm"),
    };
    let fail = |msg: String| -> Result<u8, String> {
        eprintln!("error: {msg}");
        Ok(1)
    };

    let course_json: serde_json::Value = serde_json::from_str(&course.course_text).map_err(|e| format!("course.json: {e}"))?;
    let course_id = course_json.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let title = course_json.get("title").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let ui_language = course_json.get("uiLanguage").and_then(|v| v.as_str()).unwrap_or_default().to_string();

    let bundle_text = read(&web.join("bundle.json"))?;
    let bundle: serde_json::Value = serde_json::from_str(&bundle_text).map_err(|e| format!("bundle.json: {e}"))?;
    let (scripts, styles, bundle_languages, licenses) = (
        string_list(&bundle, "scripts")?,
        string_list(&bundle, "styles")?,
        string_list(&bundle, "i18n")?,
        string_list(&bundle, "licenses")?,
    );

    // Collect all available languages: bundle i18n UNION course i18n/*.json stems
    let course_languages = match build::collect_course_languages(dir) {
        Ok(langs) => langs,
        Err(e) => return fail(e),
    };
    let mut all_available: Vec<String> = bundle_languages.clone();
    for lang in &course_languages {
        if !all_available.contains(lang) {
            all_available.push(lang.clone());
        }
    }

    // Select the language, falling back to "en" if not found
    let lang = match build::select_language(&ui_language, &all_available) {
        Some(l) => l,
        None => {
            let lang_to_try = if ui_language.is_empty() { "" } else { ui_language.as_str() };
            eprintln!("warning: no UI translation for \"{lang_to_try}\"; falling back to en. Add <course>/i18n/{lang_to_try}.json (copy web/i18n/en.json and translate it)");
            "en".to_string()
        }
    };

    let canonical_root = fs::canonicalize(dir).map_err(|e| format!("cannot canonicalize course directory: {e}"))?;
    let plugin_scripts = match plugin_files(&canonical_root, &course_json, "scripts") {
        Ok(v) => v,
        Err(e) => return fail(e),
    };
    let plugin_styles = match plugin_files(&canonical_root, &course_json, "styles") {
        Ok(v) => v,
        Err(e) => return fail(e),
    };
    if !plugin_scripts.is_empty() && !scripts.iter().any(|r| r == "@course") {
        return fail("bundle.json: scripts has no \"@course\" marker but the course declares plugin scripts".to_string());
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
        match read_listed(&web, rel) {
            Ok(t) => {
                script_html.push_str(&build::script_tag(&t));
                script_html.push('\n');
            }
            Err(e) => return fail(e),
        }
    }
    let mut css = String::new();
    for rel in &styles {
        if rel == "@course" {
            continue;
        }
        match read_listed(&web, rel) {
            Ok(t) => {
                css.push_str(&t);
                css.push('\n');
            }
            Err(e) => return fail(e),
        }
    }
    for t in &plugin_styles {
        css.push_str(&build::escape_style_text(t));
        css.push('\n');
    }

    let mut license_texts = Vec::new();
    for rel in &licenses {
        match read_listed(&web, rel) {
            Ok(t) => license_texts.push(t),
            Err(e) => return fail(e),
        }
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

    let mut i18n = serde_json::Map::new();
    let mut wanted = vec!["en".to_string()];
    if lang != "en" {
        wanted.push(lang.clone());
    }
    for l in &wanted {
        // Load base from web directory
        let web_rel = format!("i18n/{l}.json");
        let web_path = web.join(&web_rel);
        let base = match load_i18n_file(&web_path, &web_rel) {
            Ok(v) => v,
            Err(e) => {
                // For web files, if it's a required language (en or in bundle), fail
                if l == "en" || bundle_languages.contains(l) {
                    return fail(e);
                }
                return fail(e);
            }
        };

        // For web files that are required (en or in bundle), check they exist
        if base.is_none() && (l == "en" || bundle_languages.contains(l)) {
            return fail(format!("{}: file not found", web_rel));
        }

        // Load overlay from course directory
        let course_rel = format!("i18n/{l}.json");
        let course_path = dir.join(&course_rel);
        let course = match load_i18n_file(&course_path, &course_rel) {
            Ok(v) => v,
            Err(e) => return fail(e),
        };

        // Merge: course overrides base
        let merged = build::merge_i18n(base, course);
        i18n.insert(l.clone(), serde_json::Value::Object(merged));
    }
    let template = read(&web.join("index.template.html"))?;
    let wasm = fs::read(&wasm_path).map_err(|e| format!("cannot read wasm {}: {e}", wasm_path.display()))?;

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
    let mut hash_input = format!("{}{items_json}", serde_json::to_string(&course_json).map_err(|e| e.to_string())?);
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
    let content_bytes = serde_json::to_string(&content).map_err(|e| e.to_string())?.into_bytes();

    let wasm_js = format!("window.__DOJO_WASM__=\"{}\";", build::base64(&wasm));
    let i18n_js = format!("window.__DOJO_I18N__={};", build::json_for_script(&serde_json::Value::Object(i18n)));
    let html = match build::fill_template(
        &template,
        &[
            ("<!--DOJO:TITLE-->", build::html_escape(&title)),
            ("<!--DOJO:CSS-->", css),
            ("<!--DOJO:SCRIPTS-->", script_html),
            ("<!--DOJO:WASM-->", wasm_js),
            ("<!--DOJO:I18N-->", i18n_js),
            ("<!--DOJO:LICENSES-->", build::license_comment(&license_texts)),
        ],
    ) {
        Ok(h) => h.into_bytes(),
        Err(e) => return fail(e),
    };

    let total = content_bytes.len() + html.len();
    if total > MAX_BYTES {
        return fail(format!("total size {total} bytes exceeds the {MAX_BYTES} byte limit"));
    }
    let manifest = json!({
        "course": course_id,
        "version": version,
        "files": [
            {"path": "data/content.json", "bytes": content_bytes.len()},
            {"path": "index.html", "bytes": html.len()},
        ],
        "totalBytes": total,
        "wasmBytes": wasm.len(),
        "lang": lang,
    });
    let manifest_text = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())? + "\n";

    let lock_path = dir.join("ids.lock");
    write_out(&lock_path, next_lock.to_text().as_bytes())?;
    let target = a.out.join(&course_id);
    write_out(&target.join("data/content.json"), &content_bytes)?;
    write_out(&target.join("index.html"), &html)?;
    write_out(&target.join("manifest.json"), manifest_text.as_bytes())?;

    // Write third-party notices
    let notices = include_str!("../../../THIRD_PARTY_NOTICES.md");
    write_out(&target.join("THIRD_PARTY_NOTICES.md"), notices.as_bytes())?;

    println!("built {course_id} version {version} lang {lang} -> {}", target.display());
    println!("  data/content.json {} bytes, index.html {} bytes, wasm {} bytes, total {total} bytes", content_bytes.len(), html.len(), wasm.len());
    if total > WARN_BYTES {
        println!("warning: total size {total} bytes exceeds {WARN_BYTES} bytes");
    }
    Ok(0)
}

/// Type name for a given ItemType.
fn type_name(t: ItemType) -> &'static str {
    match t {
        ItemType::Choice => "choice",
        ItemType::Gap => "gap",
        ItemType::Card => "card",
        ItemType::Multi => "multi",
        ItemType::Match => "match",
        ItemType::Order => "order",
        ItemType::Cloze => "cloze",
        ItemType::Numeric => "numeric",
    }
}

/// Fixed order for item types in stats output.
const TYPE_ORDER: [ItemType; 8] = [
    ItemType::Choice,
    ItemType::Gap,
    ItemType::Card,
    ItemType::Multi,
    ItemType::Match,
    ItemType::Order,
    ItemType::Cloze,
    ItemType::Numeric,
];

fn print_stats_text(stats: &Stats) {
    for unit in &stats.units {
        let mut active_counts: Vec<(&str, usize)> = Vec::new();
        for t in &TYPE_ORDER {
            if let Some(&count) = unit.active.get(type_name(*t)) {
                if count > 0 {
                    active_counts.push((type_name(*t), count));
                }
            }
        }
        active_counts.sort_by(|a, b| a.0.cmp(b.0));
        let active_str: String = active_counts.iter().map(|(t, c)| format!("{t}:{c}")).collect::<Vec<_>>().join(", ");
        if active_str.is_empty() {
            println!("{} ({}): 0 active, {} retired", unit.id, unit.title, unit.retired);
        } else {
            println!("{} ({}): {} active, {} retired", unit.id, unit.title, active_str, unit.retired);
        }
    }

    let mut total_active_counts: Vec<(&str, usize)> = Vec::new();
    for t in &TYPE_ORDER {
        if let Some(&count) = stats.totals.active.get(type_name(*t)) {
            if count > 0 {
                total_active_counts.push((type_name(*t), count));
            }
        }
    }
    total_active_counts.sort_by(|a, b| a.0.cmp(b.0));
    let total_active_str: String = total_active_counts.iter().map(|(t, c)| format!("{t}:{c}")).collect::<Vec<_>>().join(", ");
    if total_active_str.is_empty() {
        println!("Total: 0 active, {} retired", stats.totals.retired);
    } else {
        println!("Total: {} active, {} retired", total_active_str, stats.totals.retired);
    }

    if !stats.tags.is_empty() {
        println!("\nTop tags:");
        for tag in &stats.tags {
            println!("  {}: {}", tag.tag, tag.count);
        }
    }

    if !stats.exam.is_empty() {
        println!("\nExam capacity:");
        for section in &stats.exam {
            println!("  {}: {} available, {} requested", section.title, section.available, section.requested);
        }
    }
}

fn run_stats(args: &[String]) -> Result<u8, String> {
    let mut dir = None;
    let mut as_json = false;
    for a in args {
        match a.as_str() {
            "--json" => as_json = true,
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }
    let dir = dir.ok_or_else(|| USAGE.to_string())?;
    let course = load(Path::new(dir))?;
    let course_data: Course = parse_course(&course.course_text).map_err(|errs| {
        let msgs: Vec<String> = errs.into_iter().map(|e| e.message).collect();
        format!("course.json parse error: {}", msgs.join("; "))
    })?;
    let items: Vec<Item> = course.files.iter().flat_map(|f| parse_items(&f.text).items).map(|(_, i)| i).collect();
    let stats = compute(&course_data, &items);

    if as_json {
        let json_stats = json!({
            "course": stats.course,
            "units": stats.units.iter().map(|u| json!({
                "id": u.id,
                "title": u.title,
                "active": u.active,
                "retired": u.retired
            })).collect::<Vec<_>>(),
            "totals": json!({
                "active": stats.totals.active,
                "retired": stats.totals.retired,
                "total_active": stats.totals.total_active
            }),
            "tags": stats.tags.iter().map(|t| json!({"tag": t.tag, "count": t.count})).collect::<Vec<_>>(),
            "exam": stats.exam.iter().map(|e| json!({"title": e.title, "requested": e.requested, "available": e.available})).collect::<Vec<_>>()
        });
        println!("{}", serde_json::to_string_pretty(&json_stats).map_err(|e| e.to_string())?);
    } else {
        print_stats_text(&stats);
    }
    Ok(0)
}

fn parse_prefix(s: &str) -> Result<(), String> {
    if s.is_empty() {
        return Err("prefix must not be empty".to_string());
    }
    let mut chars = s.chars();
    let first = chars.next().unwrap();
    if !first.is_ascii_lowercase() {
        return Err(format!("prefix '{}' must start with a lowercase letter", s));
    }
    if !chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) {
        return Err(format!("prefix '{}' must contain only lowercase letters and digits", s));
    }
    Ok(())
}

fn extract_number_from_id(id: &str, prefix: &str) -> Option<usize> {
    let full_prefix = format!("{prefix}-");
    if id.starts_with(&full_prefix) {
        let suffix = &id[full_prefix.len()..];
        suffix.parse::<usize>().ok()
    } else {
        None
    }
}

fn run_next_id(args: &[String]) -> Result<u8, String> {
    let mut dir = None;
    let mut prefix = None;
    let mut count = 1;

    let mut it = args.iter().peekable();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--count" => {
                if let Some(next) = it.peek() {
                    count = next.parse::<usize>().map_err(|_| "--count must be a number".to_string())?;
                    if count == 0 || count > 500 {
                        return Err("--count must be between 1 and 500".to_string());
                    }
                    it.next();
                } else {
                    return Err("--count requires a number".to_string());
                }
            }
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a),
            _ if prefix.is_none() => prefix = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }

    let dir = dir.ok_or_else(|| USAGE.to_string())?;
    let prefix = prefix.ok_or_else(|| USAGE.to_string())?;

    parse_prefix(prefix).map_err(|e| {
        eprintln!("{}", e);
        USAGE.to_string()
    })?;

    if count == 0 || count > 500 {
        return Err(USAGE.to_string());
    }

    let course = load(Path::new(dir))?;

    // Collect all ids from content files
    let mut existing_numbers: BTreeSet<usize> = BTreeSet::new();
    for f in &course.files {
        for line in f.text.lines().filter(|l| !l.trim().is_empty()) {
            if let Ok(item) = serde_json::from_str::<Item>(line) {
                if let Some(num) = extract_number_from_id(item.id(), prefix) {
                    existing_numbers.insert(num);
                }
            }
        }
    }

    // Collect all ids from ids.lock
    if let Some(lock) = &course.lock {
        for id in &lock.ids {
            if let Some(num) = extract_number_from_id(id, prefix) {
                existing_numbers.insert(num);
            }
        }
        for id in &lock.retired {
            if let Some(num) = extract_number_from_id(id, prefix) {
                existing_numbers.insert(num);
            }
        }
    }

    let max_num = existing_numbers.iter().max().copied().unwrap_or(0);
    let mut next_num = max_num + 1;

    for _ in 0..count {
        while existing_numbers.contains(&next_num) {
            next_num += 1;
        }
        println!("{}-{}", prefix, next_num);
        next_num += 1;
    }

    Ok(0)
}

fn default_title_from_id(id: &str) -> String {
    let replaced = id.replace('-', " ").replace('_', " ");
    let mut chars = replaced.chars();
    let first = chars.next().unwrap_or(' ').to_uppercase().collect::<String>();
    let rest: String = chars.collect();
    format!("{}{}", first, rest)
}

fn run_init(args: &[String]) -> Result<u8, String> {
    let mut course_id = None;
    let mut title = None;
    let mut ui_lang = None;
    let mut content_lang = None;
    let mut workspace = None;

    let mut it = args.iter().peekable();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--title" => {
                title = Some(it.next().ok_or_else(|| USAGE.to_string())?);
            }
            "--ui" => {
                ui_lang = Some(it.next().ok_or_else(|| USAGE.to_string())?);
            }
            "--content-lang" => {
                content_lang = Some(it.next().ok_or_else(|| USAGE.to_string())?);
            }
            "--workspace" => {
                workspace = Some(it.next().ok_or_else(|| USAGE.to_string())?);
            }
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if course_id.is_none() => course_id = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }

    let course_id = course_id.ok_or_else(|| USAGE.to_string())?;

    if !is_valid_course_id(course_id) {
        eprintln!("invalid course id '{course_id}': must match ^[a-z0-9][a-z0-9_-]{{0,47}}$");
        return Ok(1);
    }

    let base_dir = match workspace {
        Some(w) => PathBuf::from(w),
        None => std::env::current_dir().map_err(|e| format!("cannot read current directory: {e}"))?.join("workspace"),
    };

    let course_dir = base_dir.join(course_id);

    if course_dir.exists() {
        eprintln!("directory '{}' already exists", course_dir.display());
        return Ok(1);
    }

    // Create directories
    let content_dir = course_dir.join("content");
    let materials_dir = course_dir.join("materials");
    fs::create_dir_all(&content_dir).map_err(|e| format!("cannot create {}: {e}", content_dir.display()))?;
    fs::create_dir_all(&materials_dir).map_err(|e| format!("cannot create {}: {e}", materials_dir.display()))?;

    // Create materials/.gitkeep
    fs::write(materials_dir.join(".gitkeep"), "").map_err(|e| format!("cannot write .gitkeep: {e}"))?;

    // Default title
    let title = title.map(|s| s.to_string()).unwrap_or_else(|| default_title_from_id(course_id));
    let ui_lang = ui_lang.map(|s| s.to_string()).unwrap_or_else(|| "en".to_string());
    let content_lang = content_lang.map(|s| s.to_string()).unwrap_or_else(|| ui_lang.clone());

    // Create course.json
    let course = json!({
        "id": course_id,
        "title": title,
        "uiLanguage": ui_lang,
        "contentLanguage": content_lang,
        "units": [{"id": "unit-1", "title": "Unit 1"}]
    });
    let course_json = serde_json::to_string_pretty(&course).map_err(|e| e.to_string())? + "\n";
    fs::write(course_dir.join("course.json"), course_json).map_err(|e| format!("cannot write course.json: {e}"))?;

    // Create content/unit-1.jsonl (empty)
    fs::write(content_dir.join("unit-1.jsonl"), "").map_err(|e| format!("cannot write content/unit-1.jsonl: {e}"))?;

    // Create MAP.md
    let map_content = "# Course MAP\n\n| unit | title | sources | planned items |\n|------|-------|--------|---------------|\n\nDelete the placeholder unit and add your own.\n";
    fs::write(course_dir.join("MAP.md"), map_content).map_err(|e| format!("cannot write MAP.md: {e}"))?;

    println!("Created course '{}' in {}", course_id, course_dir.display());
    println!("  {}", course_dir.join("course.json").display());
    println!("  {}", content_dir.join("unit-1.jsonl").display());
    println!("  {}", materials_dir.join(".gitkeep").display());
    println!("  {}", course_dir.join("MAP.md").display());
    println!("\nNext: edit course.json units, then write content/<unit>.jsonl; see AGENTS.md");

    Ok(0)
}

fn run_add(args: &[String]) -> Result<u8, String> {
    let mut it = args.iter();
    let mut course_dir = None;
    let mut unit_id = None;
    let mut file = None;
    let mut dry_run = false;

    while let Some(a) = it.next() {
        match a.as_str() {
            "--file" => {
                file = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?));
            }
            "--dry-run" => {
                dry_run = true;
            }
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if course_dir.is_none() => course_dir = Some(a),
            _ if unit_id.is_none() => unit_id = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }

    let course_dir = course_dir.ok_or_else(|| USAGE.to_string())?;
    let unit_id = unit_id.ok_or_else(|| USAGE.to_string())?;
    add::run(Path::new(course_dir), unit_id, file.as_deref(), dry_run)
}

fn parse_timestamp(s: &str) -> Result<i64, String> {
    days::parse_iso_ms(s).ok_or_else(|| format!("invalid timestamp: {}", s))
}

fn run_import_progress(args: &[String]) -> Result<u8, String> {
    let mut old_progress_path = None;
    let mut id_map_path = None;
    let mut course_dir = None;
    let mut out_path = None;
    let mut write = false;
    let mut now = None;

    let mut it = args.iter().peekable();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--map" => {
                id_map_path = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?));
            }
            "--course" => {
                course_dir = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?));
            }
            "--out" => {
                out_path = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?));
            }
            "--write" => {
                write = true;
            }
            "--now" => {
                let now_str = it.next().ok_or_else(|| USAGE.to_string())?;
                now = Some(parse_timestamp(now_str)?);
            }
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if old_progress_path.is_none() => old_progress_path = Some(PathBuf::from(a)),
            _ => return Err(USAGE.to_string()),
        }
    }

    let old_progress_path = old_progress_path.ok_or_else(|| USAGE.to_string())?;
    let id_map_path = id_map_path.ok_or_else(|| USAGE.to_string())?;
    let course_dir = course_dir.ok_or_else(|| USAGE.to_string())?;

    import_progress::run(
        &old_progress_path,
        &id_map_path,
        &course_dir,
        out_path.as_deref(),
        write,
        now,
    )
}

fn run(args: &[String]) -> Result<u8, String> {
    match args {
        [cmd, flag] if cmd == "schema" && flag == "--brief" => {
            print!("{}", schema::brief());
            Ok(0)
        }
        [cmd, flag, dir] if cmd == "schema" && flag == "--out" => {
            write_schemas(Path::new(dir)).map_err(|e| format!("cannot write schema to {dir}: {e}"))?;
            Ok(0)
        }
        [cmd, rest @ ..] if cmd == "validate" => run_validate(rest),
        [cmd, rest @ ..] if cmd == "lock" => run_lock(rest),
        [cmd, rest @ ..] if cmd == "build" => run_build(rest),
        [cmd, rest @ ..] if cmd == "init" => run_init(rest),
        [cmd, rest @ ..] if cmd == "stats" => run_stats(rest),
        [cmd, rest @ ..] if cmd == "next-id" => run_next_id(rest),
        [cmd, rest @ ..] if cmd == "add" => run_add(rest),
        [cmd, rest @ ..] if cmd == "import-progress" => run_import_progress(rest),
        _ => Err(USAGE.to_string()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(code) => ExitCode::from(code),
        Err(msg) => {
            eprintln!("{msg}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod plugin_files_tests {
    use super::*;
    use std::os::unix::fs as unix_fs;

    fn setup(tag: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("dojo-pf-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let root = base.join("course");
        let outside = base.join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        (fs::canonicalize(&root).unwrap(), fs::canonicalize(&outside).unwrap())
    }

    fn course(path: &str) -> serde_json::Value {
        serde_json::json!({"plugins": {"scripts": [path]}})
    }

    #[test]
    fn plugin_files_reads_regular_file_inside_root() {
        let (root, _) = setup("ok");
        fs::write(root.join("a.js"), "A").unwrap();
        assert_eq!(plugin_files(&root, &course("a.js"), "scripts").unwrap(), vec!["A".to_string()]);
    }

    #[test]
    fn plugin_files_rejects_dotdot_escape() {
        let (root, outside) = setup("dotdot");
        fs::write(outside.join("o.js"), "O").unwrap();
        let err = plugin_files(&root, &course("../outside/o.js"), "scripts").unwrap_err();
        assert!(err.contains("outside the course folder"), "{err}");
    }

    #[test]
    fn plugin_files_rejects_symlinked_directory_pointing_outside() {
        let (root, outside) = setup("dirlink");
        fs::write(outside.join("o.js"), "O").unwrap();
        unix_fs::symlink(&outside, root.join("sub")).unwrap();
        let err = plugin_files(&root, &course("sub/o.js"), "scripts").unwrap_err();
        assert!(err.contains("outside the course folder"), "{err}");
    }

    #[test]
    fn plugin_files_rejects_symlink_file_even_when_target_is_inside_root() {
        let (root, _) = setup("filelink");
        fs::write(root.join("real.js"), "R").unwrap();
        unix_fs::symlink(root.join("real.js"), root.join("link.js")).unwrap();
        let err = plugin_files(&root, &course("link.js"), "scripts").unwrap_err();
        assert!(err.contains("symlink"), "{err}");
    }
}
