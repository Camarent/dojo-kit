use std::path::{Path, PathBuf};
use crate::{add, USAGE};

pub(crate) fn run_add(args: &[String]) -> Result<u8, String> {
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
