use serde_json::json;
use std::path::{Path, PathBuf};
use crate::cmd::build::{fatal, failed, write_out, Content, Step, Stop};
use crate::cmd::build_audio;

const WARN_BYTES: usize = 8 * 1024 * 1024;
const MAX_BYTES: usize = 16 * 1024 * 1024;

pub(crate) struct OutArgs<'a> {
    pub(crate) out: &'a Path,
    pub(crate) dir: &'a Path,
    pub(crate) course_id: &'a str,
    pub(crate) lang: &'a str,
    pub(crate) content: &'a Content,
    pub(crate) html: &'a [u8],
    pub(crate) wasm_bytes: usize,
    pub(crate) audio: &'a [build_audio::AudioFile],
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

pub(crate) fn write_outputs(o: &OutArgs) -> Step<u8> {
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
        if let Some(a) = manifest.get_mut("files").and_then(|v| v.as_array_mut()) { a.push(json!({"path": f.rel, "bytes": f.bytes})) }
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
