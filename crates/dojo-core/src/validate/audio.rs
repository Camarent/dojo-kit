//! Audio asset validation.

use super::Sink;
use crate::content::{AudioClip, AudioConfig, AudioEncoding, AudioManifest, AudioPack, Stimulus};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// What the stimuli checks know about the course audio manifest.
pub(super) enum ManifestState<'a> {
    NoConfig,
    Unloaded,
    Loaded(&'a AudioManifest),
}

/// A diagnostic location: file and 1-based line (0 = whole file).
struct Loc<'a> {
    file: &'a str,
    line: usize,
}

/// Reads and parses the manifest; returns it with the directory that contains it.
pub(super) fn load_manifest(
    audio: &AudioConfig,
    course_dir: &Path,
    sink: &mut Sink,
) -> Option<(AudioManifest, PathBuf)> {
    if escapes(&audio.manifest) {
        sink.error(
            "audio_path_escape",
            "course.json",
            0,
            format!("audio manifest path '{}' escapes the course directory", audio.manifest),
        );
        return None;
    }
    let manifest_path = course_dir.join(&audio.manifest);
    if !manifest_path.exists() {
        let msg = format!("audio manifest file '{}' not found", audio.manifest);
        sink.error("audio_manifest_missing", "course.json", 0, msg);
        return None;
    }
    let Ok(text) = std::fs::read_to_string(&manifest_path) else {
        let msg = format!("cannot read audio manifest '{}'", audio.manifest);
        sink.error("audio_manifest_missing", "course.json", 0, msg);
        return None;
    };
    let manifest = match serde_json::from_str::<AudioManifest>(&text) {
        Ok(m) => m,
        Err(e) => {
            sink.error("audio_bad_manifest", &audio.manifest, 0, format!("audio manifest is invalid: {e}"));
            return None;
        }
    };
    let dir = manifest_path.parent().map(Path::to_path_buf).unwrap_or_else(|| course_dir.to_path_buf());
    Some((manifest, dir))
}

/// Pure structural checks of a parsed manifest.
pub(super) fn check_manifest(manifest: &AudioManifest, file: &str, sink: &mut Sink) {
    if manifest.v != 1 {
        let msg = format!("audio manifest version {} is not supported (expected 1)", manifest.v);
        sink.error("audio_bad_manifest", file, 0, msg);
    }
    if manifest.packs.is_empty() {
        sink.error("audio_bad_manifest", file, 0, "audio manifest has no packs".to_string());
    }
    for (i, pack) in manifest.packs.iter().enumerate() {
        if !is_valid_pack_name(&pack.file) {
            let msg = format!("audio pack {i} file '{}' must match ^[A-Za-z0-9][A-Za-z0-9._-]{{0,127}}$", pack.file);
            sink.error("audio_bad_manifest", file, 0, msg);
        }
    }
    for (id, clip) in &manifest.clips {
        if !is_valid_clip_id(id) {
            let msg = format!("audio clip id '{id}' must match ^[a-z0-9][a-z0-9-]{{0,63}}$");
            sink.error("audio_bad_manifest", file, 0, msg);
        }
        check_clip(id, clip, &manifest.packs, &Loc { file, line: 0 }, sink);
    }
}

/// Checks one clip's pack index, length and byte range.
fn check_clip(id: &str, clip: &AudioClip, packs: &[AudioPack], loc: &Loc, sink: &mut Sink) {
    let file = loc.file;
    let Some(pack) = packs.get(clip.pack) else {
        let msg = format!("audio clip '{id}' uses pack {} but the manifest has {} packs", clip.pack, packs.len());
        sink.error("audio_bad_manifest", file, 0, msg);
        return;
    };
    if clip.len == 0 {
        sink.error("audio_bad_manifest", file, 0, format!("audio clip '{id}' has len 0"));
    }
    let limit = match pack.enc {
        AudioEncoding::Raw => pack.bytes,
        AudioEncoding::Base64 => pack.bytes / 4 * 3,
    };
    if clip.off.checked_add(clip.len).is_none_or(|end| end > limit) {
        let msg = format!("audio clip '{id}' range {}+{} is outside the decoded pack ({limit} bytes)", clip.off, clip.len);
        sink.error("audio_bad_manifest", file, 0, msg);
    }
    check_clip_text(id, clip, loc, sink);
}

/// Reason a `text`/`tr` value is invalid, if any.
fn text_problem(s: &str) -> Option<&'static str> {
    if s.trim().is_empty() {
        Some("is empty")
    } else if s.chars().count() > 400 {
        Some("longer than 400 characters")
    } else if s.chars().any(|c| c.is_control() && (c as u32) < 0x20 || c == '\u{7f}') {
        Some("contains a control character")
    } else {
        None
    }
}

/// True for `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$`.
fn is_lang_key(k: &str) -> bool {
    let (base, sub) = match k.split_once('-') {
        Some((b, s)) => (b, Some(s)),
        None => (k, None),
    };
    (2..=3).contains(&base.len())
        && base.bytes().all(|b| b.is_ascii_lowercase())
        && sub.is_none_or(|s| (2..=8).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric()))
}

/// Checks a clip's optional `text`, `tr` and `mt`.
fn check_clip_text(id: &str, clip: &AudioClip, loc: &Loc, sink: &mut Sink) {
    let mut err = |field: &str, reason: &str| {
        sink.error("audio_bad_manifest", loc.file, 0, format!("audio clip '{id}' {field}: {reason}"));
    };
    if let Some(reason) = clip.text.as_deref().and_then(text_problem) {
        err("text", reason);
    }
    if let Some(tr) = &clip.tr {
        if clip.text.is_none() {
            err("tr", "requires text");
        }
        if tr.is_empty() || tr.len() > 8 {
            err("tr", "must have 1 to 8 entries");
        }
        for (lang, value) in tr {
            if !is_lang_key(lang) {
                err(&format!("tr.{lang}"), "key is not a language code");
            }
            if let Some(reason) = text_problem(value) {
                err(&format!("tr.{lang}"), reason);
            }
        }
    } else if clip.mt {
        err("mt", "true requires tr");
    }
}

/// Checks that every pack file exists and has the declared size.
pub(super) fn check_pack_files(manifest: &AudioManifest, dir: &Path, file: &str, sink: &mut Sink) {
    for pack in manifest.packs.iter().filter(|p| is_valid_pack_name(&p.file)) {
        let pack_path = dir.join(&pack.file);
        let Ok(meta) = std::fs::metadata(&pack_path) else {
            let msg = format!("audio pack file '{}' not found", pack.file);
            sink.error("audio_pack_missing", file, 0, msg);
            continue;
        };
        if meta.len() != pack.bytes {
            let msg = format!("audio pack '{}' has {} bytes, expected {}", pack.file, meta.len(), pack.bytes);
            sink.error("audio_pack_mismatch", file, 0, msg);
        }
    }
}

/// Checks the `audio` lists of stimuli, in line order, against the manifest state.
pub(super) fn check_stimuli_audio(
    stimuli: &[(usize, Stimulus)],
    name: &str,
    state: &ManifestState,
    sink: &mut Sink,
) {
    for (line, st) in stimuli {
        let Some(clips) = &st.audio else { continue };
        let loc = Loc { file: name, line: *line };
        check_clip_list(&st.id, clips, &loc, sink);
        match state {
            ManifestState::NoConfig => {
                let msg = format!("stimulus '{}' has audio but course.json has no audio", st.id);
                sink.error("audio_without_manifest", name, *line, msg);
            }
            ManifestState::Unloaded => {}
            ManifestState::Loaded(manifest) => unknown_clips(clips, manifest, &loc, sink),
        }
    }
}

/// Size (1..=32) and distinctness of one stimulus `audio` list.
fn check_clip_list(id: &str, clips: &[String], loc: &Loc, sink: &mut Sink) {
    let (name, line) = (loc.file, loc.line);
    if clips.is_empty() || clips.len() > 32 {
        let msg = format!("stimulus '{id}' has {} audio clips, expected 1..=32", clips.len());
        sink.error("audio_bad_stimulus", name, line, msg);
    }
    let distinct: BTreeSet<&String> = clips.iter().collect();
    if distinct.len() != clips.len() {
        sink.error("audio_bad_stimulus", name, line, format!("stimulus '{id}' lists a clip more than once"));
    }
}

/// Reports each unknown clip id once, in list order.
fn unknown_clips(clips: &[String], manifest: &AudioManifest, loc: &Loc, sink: &mut Sink) {
    let (name, line) = (loc.file, loc.line);
    let mut seen = BTreeSet::new();
    for clip_id in clips {
        if !manifest.clips.contains_key(clip_id) && seen.insert(clip_id) {
            let msg = format!("audio clip '{clip_id}' is referenced but not in manifest");
            sink.error("audio_unknown_clip", name, line, msg);
        }
    }
}

/// Bare file name `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`.
fn is_valid_pack_name(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        && name.len() <= 128
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Validates a clip ID matches the contract pattern.
fn is_valid_clip_id(id: &str) -> bool {
    if id.is_empty() {
        return false;
    }
    let chars: Vec<char> = id.chars().collect();
    if chars.len() > 64 {
        return false;
    }
    let first = chars[0];
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return false;
    }
    chars.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-')
}

/// Validates timer configuration.
pub(super) fn check_timer_config(
    timer: &Option<crate::content::TimerConfig>,
    file: &str,
    sink: &mut Sink,
) {
    let Some(timer) = timer else { return };

    if timer.base_ms < 2000 || timer.base_ms > 30000 {
        sink.error(
            "bad_timer",
            file,
            0,
            format!("timer.baseMs must be between 2000 and 30000, got {}", timer.base_ms),
        );
    }

    if timer.replays > 3 {
        sink.error(
            "bad_timer",
            file,
            0,
            format!("timer.replays must be between 0 and 3, got {}", timer.replays),
        );
    }
}

/// Validates that srs.mode is not set in srsByType.
pub(super) fn check_mode_by_type(
    srs_by_type: &Option<std::collections::BTreeMap<String, crate::content::SrsConfig>>,
    sink: &mut Sink,
) {
    let Some(map) = srs_by_type else { return };
    for (type_name, config) in map {
        if config.mode.is_some() {
            sink.error(
                "mode_by_type",
                "course.json",
                0,
                format!("srs.mode cannot be set in srsByType.{}", type_name),
            );
        }
    }
}

/// True when a relative path is absolute or contains a `..` component.
fn escapes(path: &str) -> bool {
    let p = Path::new(path);
    p.is_absolute()
        || path.starts_with('/')
        || path.starts_with('\\')
        || p.components().any(|c| matches!(c, std::path::Component::ParentDir))
        || path.split(['/', '\\']).any(|c| c == "..")
}
