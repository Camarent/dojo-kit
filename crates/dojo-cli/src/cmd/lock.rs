use dojo_core::content::{Item, parse_items};
use dojo_core::lock::{self};
use dojo_core::validate::Severity;
use std::fs;
use std::path::Path;
use crate::course_files::*;
use crate::cmd::validate::{count, print_text};
use crate::cmd::build::find_web_dir;
use crate::USAGE;

pub(crate) fn run_lock(args: &[String]) -> Result<u8, String> {
    let [dir] = args else {
        return Err(USAGE.to_string());
    };
    if dir.starts_with("--") {
        return Err(USAGE.to_string());
    }
    let dir = Path::new(dir);
    let course = load(dir)?;
    let diags = validate_course(dir, &course, find_web_dir().ok().as_deref());
    if count(&diags, Severity::Error) > 0 {
        print_text(&diags);
        return Ok(1);
    }
    let items: Vec<Item> = course.files.iter().flat_map(|f| parse_items(&f.text).items).map(|(_, i)| i).collect();
    let next = lock::update(course.lock.as_ref(), &items);
    let path = dir.join("ids.lock");
    // Check that ids.lock is not a symlink before writing
    check_symlink(&path, "ids.lock")?;
    fs::write(&path, next.to_text()).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    println!("ids.lock: {} ids, {} retired", next.ids.len(), next.retired.len());
    Ok(0)
}
