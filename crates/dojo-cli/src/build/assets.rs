//! Asset and i18n collection for `dojo build`: bundle scripts, styles, licenses and UI language.

use std::fs;
use std::path::Path;
use crate::build;
use crate::cmd::build::{failed, fatal, Step, Stop};
use crate::course_files::{plugin_files, read};
use crate::modules;

/// Module ids listed in `course.json` `modules`; the field is optional.
fn course_module_ids(course: &serde_json::Value) -> Result<Vec<String>, String> {
    let Some(value) = course.get("modules") else { return Ok(Vec::new()) };
    let arr = value.as_array().ok_or_else(|| "course.json: \"modules\" must be an array of strings".to_string())?;
    arr.iter()
        .map(|v| v.as_str().map(str::to_string).ok_or_else(|| "course.json: \"modules\" must be an array of strings".to_string()))
        .collect()
}

fn read_all(paths: &[std::path::PathBuf]) -> Result<Vec<String>, String> {
    paths.iter().map(|p| read(p)).collect()
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

pub(crate) struct Assets {
    pub(crate) script_html: String,
    pub(crate) css: String,
    pub(crate) license_texts: Vec<String>,
    pub(crate) bundle_languages: Vec<String>,
    pub(crate) pack_languages: Vec<String>,
    pub(crate) lang: String,
}

pub(crate) fn collect_assets(dir: &Path, web: &Path, course_json: &serde_json::Value) -> Step<Assets> {
    let bundle_text = fatal(read(&web.join("bundle.json")))?;
    let bundle: serde_json::Value = fatal(serde_json::from_str(&bundle_text).map_err(|e| format!("bundle.json: {e}")))?;
    let scripts = fatal(string_list(&bundle, "scripts"))?;
    let styles = fatal(string_list(&bundle, "styles"))?;
    let bundle_languages = fatal(string_list(&bundle, "i18n"))?;
    let licenses = fatal(string_list(&bundle, "licenses"))?;

    let packs = failed(modules::read_packs(web))?;
    let (lang, resolved) = course_lang_modules(dir, web, course_json, &bundle_languages, &packs)?;
    let pack_languages: Vec<String> = packs.into_keys().collect();

    let canonical_root = fatal(fs::canonicalize(dir).map_err(|e| format!("cannot canonicalize course directory: {e}")))?;
    let plugin_scripts = failed(plugin_files(&canonical_root, course_json, "scripts"))?;
    let plugin_styles = failed(plugin_files(&canonical_root, course_json, "styles"))?;
    if !plugin_scripts.is_empty() && !scripts.iter().any(|r| r == "@course") {
        return Err(Stop::Fail("bundle.json: scripts has no \"@course\" marker but the course declares plugin scripts".to_string()));
    }

    let module_scripts = failed(read_all(&failed(modules::web_paths(web, &resolved, |w| w.scripts.as_slice()))?))?;
    let module_styles = failed(read_all(&failed(modules::web_paths(web, &resolved, |w| w.styles.as_slice()))?))?;
    if !module_scripts.is_empty() && !scripts.iter().any(|r| r == "@modules") {
        return Err(Stop::Fail("bundle.json: scripts has no \"@modules\" marker but the course lists modules with scripts".to_string()));
    }
    if !module_styles.is_empty() && !styles.iter().any(|r| r == "@modules") {
        return Err(Stop::Fail("bundle.json: styles has no \"@modules\" marker but the course lists modules with styles".to_string()));
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
        if rel == "@modules" {
            for t in &module_scripts {
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
        if rel == "@modules" {
            for t in &module_styles {
                css.push_str(&build::escape_style_text(t));
                css.push('\n');
            }
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
    Ok(Assets { script_html, css, license_texts, bundle_languages, pack_languages, lang })
}

/// UI language and effective module set of a course, shared by `dojo build` and `dojo validate`.
/// `bundle_languages` is the bundle's `i18n` list; `web` is the `web/` directory.
/// `packs` is the `packs.json` map from `modules::read_packs`, read once by the caller.
pub(crate) fn course_lang_modules(dir: &Path, web: &Path, course_json: &serde_json::Value, bundle_languages: &[String], packs: &modules::Packs) -> Step<(String, Vec<modules::Manifest>)> {
    let ui_language = course_json.get("uiLanguage").and_then(|v| v.as_str()).unwrap_or_default();
    let pack_languages: Vec<String> = packs.keys().cloned().collect();
    let lang = select_lang(dir, ui_language, bundle_languages, &pack_languages)?;
    let course_modules = fatal(course_module_ids(course_json))?;
    let resolved = failed(modules::resolve(web, packs, &lang, &course_modules))?;
    Ok((lang, resolved))
}

/// Languages a course can use: `bundle`, then `packs`, then `course`, without repeats.
fn language_union(bundle: &[String], packs: &[String], course: &[String]) -> Vec<String> {
    let mut all: Vec<String> = bundle.to_vec();
    for lang in packs.iter().chain(course) {
        if !all.contains(lang) {
            all.push(lang.clone());
        }
    }
    all
}

fn select_lang(dir: &Path, ui_language: &str, bundle_languages: &[String], pack_languages: &[String]) -> Step<String> {
    // Collect all available languages: bundle i18n UNION language packs UNION course i18n/*.json stems
    let course_languages: Vec<String> = failed(build::collect_course_languages(dir))?.into_iter().collect();
    let all_available = language_union(bundle_languages, pack_languages, &course_languages);
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

pub(crate) fn build_i18n(dir: &Path, web: &Path, lang: &str, bundle_languages: &[String], pack_languages: &[String]) -> Step<serde_json::Map<String, serde_json::Value>> {
    let mut i18n = serde_json::Map::new();
    let mut wanted = vec!["en".to_string()];
    if lang != "en" {
        wanted.push(lang.to_string());
    }
    let declared = language_union(bundle_languages, pack_languages, &[]);
    for l in &wanted {
        let web_rel = format!("i18n/{l}.json");
        let base = failed(load_i18n_file(&web.join(&web_rel), &web_rel))?;
        if base.is_none() && (l == "en" || declared.contains(l)) {
            return Err(Stop::Fail(format!("{}: file not found", web_rel)));
        }
        let course_rel = format!("i18n/{l}.json");
        let course = failed(load_i18n_file(&dir.join(&course_rel), &course_rel))?;
        let merged = build::merge_i18n(base, course);
        i18n.insert(l.clone(), serde_json::Value::Object(merged));
    }
    Ok(i18n)
}
