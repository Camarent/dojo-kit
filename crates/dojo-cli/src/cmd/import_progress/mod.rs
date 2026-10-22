//! Generic legacy progress importer for dojo-kit.
//!
//! Converts old progress documents to the current v:1 format.
//! Old format: `{items: {<oldId>: {s, due, ok, bad, last}}, stats: {days, newByDay}, settings}`
//! 
//! The importer:
//! - Maps old IDs to new IDs using an id-map.json file
//! - Aggregates multiple old records for the same new ID
//! - Clamps stages to the course ladder
//! - Handles entity-scoped SRS (writes identical records to all entity members)
//! - Preserves stats.days and stats.newByDay
//! - Passes through only newPerDay and placementDone from settings
//! - Validates output with the core sanitizer

mod aggregate;
mod legacy;

use crate::USAGE;
use aggregate::{generate_report, import_progress};
use dojo_core::content::{parse_items, Item};
use dojo_core::days;
use dojo_core::validate::SourceFile;
use dojo_core::progress::sanitize;
use legacy::{IdMapConfig, OldProgress};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn parse_timestamp(s: &str) -> Result<i64, String> {
    days::parse_iso_ms(s).ok_or_else(|| format!("invalid timestamp: {}", s))
}

pub(crate) fn run_import_progress(args: &[String]) -> Result<u8, String> {
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

    run(
        &old_progress_path,
        &id_map_path,
        &course_dir,
        out_path.as_deref(),
        write,
        now,
    )
}

/// Parse every content file of a loaded course; a bad line is an error naming file and line.
fn parse_course_items(files: &[SourceFile]) -> Result<Vec<Item>, String> {
    let mut items = Vec::new();
    for f in files {
        let parsed = parse_items(&f.text);
        if let Some(e) = parsed.errors.first() {
            return Err(format!("{}: line {}: {}", f.name, e.line, e.message));
        }
        items.extend(parsed.items.into_iter().map(|(_, i)| i));
    }
    Ok(items)
}

/// Run the import-progress subcommand.
fn run(
    old_progress_path: &Path,
    id_map_path: &Path,
    course_dir: &Path,
    out_path: Option<&Path>,
    write: bool,
    now: Option<i64>,
) -> Result<u8, String> {
    // Read old progress file
    let old_progress_text = fs::read_to_string(old_progress_path)
        .map_err(|e| format!("cannot read {}: {}", old_progress_path.display(), e))?;
    let old_progress_value: Value = serde_json::from_str(&old_progress_text)
        .map_err(|e| format!("invalid JSON in {}: {}", old_progress_path.display(), e))?;
    let old_progress = OldProgress::from_value(&old_progress_value)?;
    
    // Read id-map file
    let id_map_text = fs::read_to_string(id_map_path)
        .map_err(|e| format!("cannot read {}: {}", id_map_path.display(), e))?;
    let id_map_value: Value = serde_json::from_str(&id_map_text)
        .map_err(|e| format!("invalid JSON in {}: {}", id_map_path.display(), e))?;
    let id_map = IdMapConfig::from_value(&id_map_value)?;
    
    // Read course files (symlink-checked, sorted)
    let files = crate::course_files::load(course_dir)?;
    let course_path = course_dir.join("course.json");
    let course_value: Value = serde_json::from_str(&files.course_text)
        .map_err(|e| format!("invalid JSON in {}: {}", course_path.display(), e))?;
    let course_items = parse_course_items(&files.files)?;

    // Import progress
    let (new_progress, unmapped_ids, stats) = import_progress(&old_progress, &id_map, &course_value, now, &course_items);
    
    // Generate report
    let report = generate_report(&old_progress, &unmapped_ids, &stats);
    println!("{}", report);
    
    // Dry-run is default (write = false)
    if !write {
        if out_path.is_some() {
            eprintln!("warning: --out specified but --write not set; nothing written");
        }
        return Ok(0);
    }
    
    // Write output
    let output_path = out_path
        .ok_or_else(|| "--write requires an explicit --out <file>".to_string())?
        .to_path_buf();
    if fs::symlink_metadata(&output_path).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        return Err(format!("refusing to write through symlink {}", output_path.display()));
    }
    let new_progress_text = serde_json::to_string_pretty(&new_progress)
        .map_err(|e| format!("cannot serialize progress: {}", e))?;
    
    // Validate output with sanitizer
    if sanitize(&new_progress).is_none() {
        return Err("imported progress failed sanitization".to_string());
    }
    
    // Ensure parent directory exists
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("cannot create {}: {}", parent.display(), e))?;
    }
    
    fs::write(&output_path, new_progress_text)
        .map_err(|e| format!("cannot write {}: {}", output_path.display(), e))?;
    
    println!("Wrote {}", output_path.display());
    
    Ok(0)
}

