//! Asset and i18n collection for `dojo build`: bundle scripts, styles, licenses and UI language.

use std::fs;
use std::path::Path;
use crate::build;
use crate::cmd::build::{failed, fatal, Step, Stop};
use crate::course_files::{plugin_files, read};

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
    pub(crate) lang: String,
}

pub(crate) fn collect_assets(dir: &Path, web: &Path, course_json: &serde_json::Value) -> Step<Assets> {
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

pub(crate) fn build_i18n(dir: &Path, web: &Path, lang: &str, bundle_languages: &[String]) -> Step<serde_json::Map<String, serde_json::Value>> {
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
