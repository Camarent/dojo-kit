//! Language selection, i18n merging and i18n diagnostics for `dojo build`.

use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// Collect valid language stems from course i18n directory.
/// Returns a BTreeSet of valid language codes found in `<course_dir>/i18n/*.json`.
/// Only files matching the pattern `[A-Za-z0-9_-]+.json` are considered.
/// Invalid filenames are reported via warnings printed to stderr.
pub fn collect_course_languages(course_dir: &Path) -> Result<BTreeSet<String>, String> {
    let mut langs = BTreeSet::new();
    let i18n_dir = course_dir.join("i18n");
    if !i18n_dir.is_dir() {
        return Ok(langs);
    }
    if let Ok(entries) = fs::read_dir(&i18n_dir) {
        for entry in entries.flatten() {
            {
                let path = entry.path();
                // Check for symlinks before processing
                #[cfg(unix)]
                {
                    if let Ok(metadata) = fs::symlink_metadata(&path)
                        && metadata.file_type().is_symlink()
                            && let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                return Err(format!("i18n/{}: symlinks are not allowed", name));
                            }
                }
                if path.is_file()
                    && let Some(name) = path.file_name().and_then(|n| n.to_str())
                        && let Some(stem) = name.strip_suffix(".json") {
                            if stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
                                langs.insert(stem.to_string());
                            } else {
                                eprintln!("warning: ignoring invalid i18n filename: {}", path.display());
                            }
                        }
            }
        }
    }
    Ok(langs)
}

/// Reads and parses one i18n JSON file; `Ok(None)` when it is not a regular file.
/// Symlinks are rejected. `label` names the file in errors (e.g. "i18n/en.json").
/// Shared by `validate` and `build` so both accept and reject the same inputs.
pub fn read_i18n_json(path: &Path, label: &str) -> Result<Option<serde_json::Value>, String> {
    if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err(format!("{label}: symlinks are not allowed"));
    }
    if !path.is_file() {
        return Ok(None);
    }
    let text = fs::read_to_string(path).map_err(|e| format!("{label}: cannot read file: {e}"))?;
    let value = serde_json::from_str(&text).map_err(|e| format!("{label}: invalid JSON: {e}"))?;
    Ok(Some(value))
}

/// Picks the i18n key for `ui_language`: the full tag, else its primary subtag, from `available`.
/// Returns None if no match is found.
pub fn select_language(ui_language: &str, available: &[String]) -> Option<String> {
    let lower = ui_language.to_ascii_lowercase();
    let primary = lower.split(['-', '_']).next().unwrap_or("").to_string();
    for cand in [lower.as_str(), primary.as_str()] {
        if let Some(found) = available.iter().find(|a| a.to_ascii_lowercase() == cand) {
            return Some(found.clone());
        }
    }
    None
}

/// Merges two i18n maps: course overrides base. Missing keys are not filled.
pub fn merge_i18n(base: Option<Map<String, Value>>, course: Option<Map<String, Value>>) -> Map<String, Value> {
    let mut result = base.unwrap_or_default();
    if let Some(course_map) = course {
        for (k, v) in course_map {
            result.insert(k, v);
        }
    }
    result
}

const PLURAL_SUFFIXES: [&str; 6] = [".zero", ".one", ".two", ".few", ".many", ".other"];

/// Splits a plural-form key into (base, suffix); `None` for plain keys.
fn plural_split(key: &str) -> Option<(&str, &str)> {
    PLURAL_SUFFIXES.iter().find_map(|s| key.strip_suffix(s).filter(|b| !b.is_empty()).map(|b| (b, *s)))
}

fn family(key: &str) -> &str {
    plural_split(key).map_or(key, |(b, _)| b)
}

/// The set of `{name}` placeholders in `text`.
fn placeholders(text: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let mut rest = text;
    while let Some(start) = rest.find('{') {
        rest = &rest[start + 1..];
        if let Some(end) = rest.find('}') {
            let name = &rest[..end];
            if !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_') {
                out.insert(name.to_string());
            }
        }
    }
    out
}

fn i18n_diag(severity: crate::Severity, code: &'static str, file_name: &str, message: String) -> crate::Diagnostic {
    crate::Diagnostic { severity, code, file: file_name.to_string(), line: 0, message }
}

/// Compares a course UI file with the English reference: placeholder mismatches (error),
/// missing keys and unknown keys (warnings), non-string values and non-object files (errors).
/// `framework` is the framework file of the same language: its key families count as covered
/// for the missing-key check only.
pub fn i18n_diagnostics(reference: &Map<String, Value>, file_name: &str, course: &Value, framework: Option<&Map<String, Value>>) -> Vec<crate::Diagnostic> {
    use crate::Severity::{Error, Warning};
    let Some(map) = course.as_object() else {
        return vec![i18n_diag(Error, "i18n_bad_file", file_name, "must be a JSON object of string values".to_string())];
    };
    let mut diags = Vec::new();
    let ref_families: BTreeSet<&str> = reference.keys().map(|k| family(k)).collect();
    let mut course_families = BTreeSet::new();
    for (key, value) in map {
        let Some(text) = value.as_str() else {
            diags.push(i18n_diag(Error, "i18n_not_string", file_name, format!("key \"{key}\" must be a string")));
            continue;
        };
        course_families.insert(family(key));
        let expected = reference.get(key).or_else(|| {
            let (base, _) = plural_split(key)?;
            reference.get(&format!("{base}.other")).or_else(|| reference.get(base))
        });
        match expected.and_then(Value::as_str) {
            Some(en) => {
                let (want, got) = (placeholders(en), placeholders(text));
                if want != got {
                    diags.push(i18n_diag(Error, "i18n_placeholder", file_name, format!("key \"{key}\" has placeholders {got:?}, expected {want:?}")));
                }
            }
            None if !ref_families.contains(family(key)) && !key.starts_with("plugin.") && !key.starts_with("course.") => {
                diags.push(i18n_diag(Warning, "i18n_unknown_key", file_name, format!("key \"{key}\" is not in the English reference")));
            }
            None => {}
        }
    }
    if let Some(fw) = framework {
        course_families.extend(fw.keys().map(|k| family(k)));
    }
    let missing: Vec<&str> = ref_families.iter().filter(|f| !course_families.contains(*f)).copied().collect();
    if !missing.is_empty() {
        let shown: Vec<&str> = missing.iter().take(20).copied().collect();
        let more = if missing.len() > 20 { format!(" and {} more", missing.len() - 20) } else { String::new() };
        diags.push(i18n_diag(Warning, "i18n_missing_key", file_name, format!("{} keys missing (English is used): {}{more}", missing.len(), shown.join(", "))));
    }
    diags
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_selection() {
        let av = vec!["en".to_string(), "ru".to_string(), "pt".to_string()];
        assert_eq!(select_language("en", &av), Some("en".to_string()));
        assert_eq!(select_language("pt-BR", &av), Some("pt".to_string()));
        assert_eq!(select_language("xx", &av), None);
        assert_eq!(select_language("fr-FR", &av), None);
    }

    #[test]
    fn merge_i18n_cases() {
        use serde_json::json;
        // base only
        let base = Some(serde_json::from_value(json!({"a": "1", "b": "2"})).unwrap());
        let result = merge_i18n(base, None);
        assert_eq!(result.get("a").and_then(|v| v.as_str()), Some("1"));
        assert_eq!(result.get("b").and_then(|v| v.as_str()), Some("2"));
        
        // course only
        let course = Some(serde_json::from_value(json!({"c": "3"})).unwrap());
        let result = merge_i18n(None, course);
        assert_eq!(result.get("c").and_then(|v| v.as_str()), Some("3"));
        
        // both with override
        let base = Some(serde_json::from_value(json!({"a": "1", "b": "2"})).unwrap());
        let course = Some(serde_json::from_value(json!({"b": "overridden", "c": "3"})).unwrap());
        let result = merge_i18n(base, course);
        assert_eq!(result.get("a").and_then(|v| v.as_str()), Some("1"));
        assert_eq!(result.get("b").and_then(|v| v.as_str()), Some("overridden"));
        assert_eq!(result.get("c").and_then(|v| v.as_str()), Some("3"));
        
        // neither
        let result = merge_i18n(None, None);
        assert!(result.is_empty());
    }
}

#[cfg(test)]
mod i18n_tests {
    use super::*;
    use serde_json::json;

    fn en() -> Map<String, Value> {
        json!({"n.other": "{n} items", "n.one": "{n} item", "plain": "x", "solo.other": "{n} y"}).as_object().unwrap().clone()
    }

    fn codes(course: Value) -> Vec<&'static str> {
        i18n_diagnostics(&en(), "i18n/x.json", &course, None).iter().map(|d| d.code).collect()
    }

    #[test]
    fn plural_forms_count_as_the_base_key_and_compare_against_other() {
        assert!(codes(json!({"n.other": "{n}", "n.one": "{n}", "plain": "y", "solo.other": "{n}"})).is_empty());
        assert!(codes(json!({"n.few": "{n}", "plain": "y", "solo.other": "{n}"})).is_empty());
        assert_eq!(codes(json!({"n.few": "x", "plain": "y", "solo.other": "{n}"})), vec!["i18n_placeholder"]);
    }

    #[test]
    fn missing_list_is_capped_at_twenty() {
        let reference: Map<String, Value> = (0..25).map(|i| (format!("k{i:02}"), json!("v"))).collect();
        let d = i18n_diagnostics(&reference, "i18n/x.json", &json!({}), None);
        assert_eq!(d.len(), 1);
        assert!(d[0].message.contains("k19") && !d[0].message.contains("k20") && d[0].message.ends_with("and 5 more"), "{}", d[0].message);
    }

    #[test]
    fn framework_file_covers_missing_families_only() {
        let fw = json!({"n.other": "x", "n.one": "y", "plain": "z"});
        let fw = fw.as_object().unwrap();
        let course = json!({"solo.other": "{n}"});
        assert!(i18n_diagnostics(&en(), "i18n/x.json", &course, Some(fw)).is_empty());
        let partial = json!({"plain": "z"});
        let d = i18n_diagnostics(&en(), "i18n/x.json", &json!({}), Some(partial.as_object().unwrap()));
        assert_eq!(d.len(), 1);
        assert!(d[0].message.starts_with("2 keys missing") && !d[0].message.contains("plain"), "{}", d[0].message);
        // framework keys never trigger placeholder or unknown-key checks
        let fw = json!({"bogus": "{q}"});
        assert!(!i18n_diagnostics(&en(), "i18n/x.json", &json!({"plain":"a","n.other":"{n}","solo.other":"{n}"}), Some(fw.as_object().unwrap()))
            .iter().any(|d| d.code != "i18n_missing_key"));
    }

    #[test]
    fn non_object_file_is_bad() {
        assert_eq!(codes(json!([1])), vec!["i18n_bad_file"]);
    }
}
