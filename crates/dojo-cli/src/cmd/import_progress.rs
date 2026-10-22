use dojo_core::days;
use std::path::PathBuf;
use crate::{import_progress, USAGE};

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

    import_progress::run(
        &old_progress_path,
        &id_map_path,
        &course_dir,
        out_path.as_deref(),
        write,
        now,
    )
}
