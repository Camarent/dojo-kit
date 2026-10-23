use dojo_core::lock::{self, IdLock};
use dojo_core::validate::{Diagnostic, Severity, SourceFile, validate_all};
use std::fs;
use std::path::Path;
use crate::build;

pub(crate) struct CourseFiles {
    pub(crate) course_text: String,
    pub(crate) files: Vec<SourceFile>,
    pub(crate) lock: Option<IdLock>,
    pub(crate) stimuli: Option<SourceFile>,
    pub(crate) intros: Option<SourceFile>,
}

pub(crate) fn read(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("cannot read {}: {e}", path.display()))
}

/// Check if a path is a symlink and return an error message if it is.
pub(crate) fn check_symlink(path: &Path, kind: &str) -> Result<(), String> {
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

pub(crate) fn load(dir: &Path) -> Result<CourseFiles, String> {
    if !dir.is_dir() {
        return Err(format!("not a directory: {}", dir.display()));
    }
    let course_path = dir.join("course.json");
    check_symlink(&course_path, "course.json")?;
    let course_text = read(&course_path)?;
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

/// Checks `<dir>/i18n/*.json` against `<web>/i18n/en.json`; nothing when the reference is unavailable.
pub(crate) fn i18n_check(dir: &Path, web: Option<&Path>) -> Vec<Diagnostic> {
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
pub(crate) fn validate_course(dir: &Path, course: &CourseFiles, web: Option<&Path>) -> Vec<Diagnostic> {
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

/// Reads the files listed in `course.json` `plugins.<kind>`, relative to the course folder.
pub(crate) fn plugin_files(canonical_root: &Path, course: &serde_json::Value, kind: &str) -> Result<Vec<String>, String> {
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

#[cfg(test)]
mod plugin_files_tests {
    use super::*;
    use std::os::unix::fs as unix_fs;
    use std::path::PathBuf;

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
