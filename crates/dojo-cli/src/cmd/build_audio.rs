use dojo_core::content::TimerConfig;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
pub(crate) const MAX_DIST_BYTES: u64 = 60 * 1024 * 1024;
pub(crate) const MAX_FILES: usize = 250;

/// One audio file shipped under `data/audio/`.
pub(crate) struct AudioFile {
    pub(crate) rel: String,
    pub(crate) src: PathBuf,
    pub(crate) bytes: u64,
    /// Bytes already read and validated (the manifest); `copy` writes these instead of re-reading `src`.
    pub(crate) data: Option<Vec<u8>>,
}

/// Lists the manifest and packs of `course.audio`; empty when the course has none.
/// Fails on a symlink, a pack named `manifest.json` or a file over the per-file limit.
/// Pack names are checked beforehand by `dojo-core` manifest validation; the build gates on it (build.rs:117) before this runs.
pub(crate) fn collect(dir: &Path, course_json: &Value) -> Result<Vec<AudioFile>, String> {
    let Some(manifest_rel) = course_json.get("audio").and_then(|a| a.get("manifest")).and_then(Value::as_str) else {
        return Ok(Vec::new());
    };
    let manifest = dir.join(manifest_rel);
    let mut prefix = dir.to_path_buf();
    for part in Path::new(manifest_rel).components() {
        prefix.push(part);
        crate::course_files::check_symlink(&prefix, &format!("audio path {}", prefix.display()))?;
    }
    let mut head = entry(&manifest, "manifest.json", manifest_rel)?;
    let raw = fs::read(&manifest).map_err(|e| format!("cannot read {}: {e}", manifest.display()))?;
    if raw.len() as u64 > MAX_FILE_BYTES {
        return Err(format!("{manifest_rel}: {} bytes exceeds the {MAX_FILE_BYTES} byte per-file limit", raw.len()));
    }
    let text = String::from_utf8(raw.clone()).map_err(|e| format!("cannot read {}: {e}", manifest.display()))?;
    head.bytes = raw.len() as u64;
    head.data = Some(raw);
    let mut files = vec![head];
    let mut seen = std::collections::HashSet::new();
    let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("{manifest_rel}: {e}"))?;
    let base = manifest.parent().unwrap_or(dir);
    for pack in parsed.get("packs").and_then(Value::as_array).into_iter().flatten() {
        let file = pack.get("file").and_then(Value::as_str).unwrap_or_default();
        if file == "manifest.json" {
            return Err(format!("{manifest_rel}: a pack cannot be named manifest.json"));
        }
        if !seen.insert(file.to_string()) {
            continue;
        }
        files.push(entry(&base.join(file), file, file)?);
    }
    Ok(files)
}

fn entry(src: &Path, name: &str, label: &str) -> Result<AudioFile, String> {
    let meta = fs::symlink_metadata(src).map_err(|e| format!("cannot read {label}: {e}"))?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err(format!("{label}: audio files must be regular files, not symlinks"));
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("{label}: {} bytes exceeds the {MAX_FILE_BYTES} byte per-file limit", meta.len()));
    }
    Ok(AudioFile { rel: format!("data/audio/{name}"), src: src.to_path_buf(), bytes: meta.len(), data: None })
}

/// Checks the whole dist folder: `other_bytes` and `other_files` cover everything except audio.
pub(crate) fn check_totals(files: &[AudioFile], other_bytes: u64, other_files: usize) -> Result<(), String> {
    let total = other_bytes + files.iter().map(|f| f.bytes).sum::<u64>();
    if total > MAX_DIST_BYTES {
        return Err(format!("dist size {total} bytes exceeds the {MAX_DIST_BYTES} byte limit"));
    }
    let count = other_files + files.len();
    if count > MAX_FILES {
        return Err(format!("dist has {count} files, over the {MAX_FILES} file limit"));
    }
    Ok(())
}

/// Copies the collected files into `<target>/data/audio/`.
pub(crate) fn copy(target: &Path, files: &[AudioFile]) -> Result<(), String> {
    let stale = target.join("data/audio");
    if fs::symlink_metadata(&stale).is_ok() {
        fs::remove_dir_all(&stale).map_err(|e| format!("cannot clear {}: {e}", stale.display()))?;
    }
    for f in files {
        let to = target.join(&f.rel);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
        match &f.data {
            Some(data) => fs::write(&to, data).map_err(|e| format!("cannot write {}: {e}", to.display()))?,
            None => fs::copy(&f.src, &to).map(|_| ()).map_err(|e| format!("cannot copy {}: {e}", f.src.display()))?,
        }
    }
    Ok(())
}

/// Returns `course_json` with every present course/unit `timer` re-serialised through
/// `TimerConfig`, so all three fields are materialised. Courses without a timer are unchanged.
pub(crate) fn materialise_timers(course_json: &Value) -> Result<Value, String> {
    let mut out = course_json.clone();
    fill(&mut out)?;
    for unit in out.get_mut("units").and_then(Value::as_array_mut).into_iter().flatten() {
        fill(unit)?;
    }
    Ok(out)
}

fn fill(obj: &mut Value) -> Result<(), String> {
    let Some(slot) = obj.get_mut("timer").filter(|t| !t.is_null()) else { return Ok(()) };
    let cfg: TimerConfig = serde_json::from_value(slot.take()).map_err(|e| format!("timer: {e}"))?;
    *slot = serde_json::to_value(cfg).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_bytes_are_read_once_and_copied_from_memory() {
        let tmp = std::env::temp_dir().join(format!("dojo-audio-once-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("m.json"), r#"{"packs":[]}"#).unwrap();
        let course = serde_json::json!({"audio": {"manifest": "m.json"}});
        let files = collect(&tmp, &course).unwrap();
        // Swap the file after collect: the copy must still carry the validated bytes.
        fs::write(tmp.join("m.json"), "tampered").unwrap();
        let out = tmp.join("out");
        copy(&out, &files).unwrap();
        assert_eq!(fs::read_to_string(out.join("data/audio/manifest.json")).unwrap(), r#"{"packs":[]}"#);
        let _ = fs::remove_dir_all(&tmp);
    }
}
