use dojo_core::content::{Item, parse_course, parse_items};
use serde_json::{Deserializer, Value};
use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;

use crate::CourseFiles;

fn id_prefix(unit_id: &str) -> String {
    let cleaned: String = unit_id.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect();
    match cleaned.chars().next() {
        Some(c) if !c.is_ascii_digit() => cleaned,
        _ => "q".to_string(),
    }
}

fn number_in(id: &str, prefix: &str) -> Option<u64> {
    id.strip_prefix(prefix)?.strip_prefix('-')?.parse().ok()
}

fn existing_ids(course: &CourseFiles) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    for file in &course.files {
        for (_, item) in parse_items(&file.text).items {
            ids.insert(item.id().to_string());
        }
    }
    if let Some(lock) = &course.lock {
        ids.extend(lock.ids.iter().chain(&lock.retired).cloned());
    }
    ids
}

fn parse_input(text: &str) -> Result<Vec<Value>, String> {
    let mut values = Vec::new();
    for parsed in Deserializer::from_str(text).into_iter::<Value>() {
        match parsed.map_err(|e| format!("invalid JSON input: {e}"))? {
            Value::Array(items) => values.extend(items),
            other => values.push(other),
        }
    }
    Ok(values)
}

fn read_input(file: Option<&Path>) -> Result<String, String> {
    let mut text = String::new();
    match file {
        Some(path) => text = crate::read(path)?,
        None => {
            std::io::stdin().read_to_string(&mut text).map_err(|e| format!("cannot read stdin: {e}"))?;
        }
    }
    Ok(text)
}

fn convert(k: usize, mut value: Value, unit_id: &str, prefix: &str, taken: &mut BTreeSet<String>, next: &mut u64) -> Result<Item, String> {
    let fail = |m: String| format!("item {k}: {m}");
    let obj = value.as_object_mut().ok_or_else(|| fail("expected a JSON object".to_string()))?;
    match obj.get("unit") {
        None => {
            obj.insert("unit".to_string(), Value::String(unit_id.to_string()));
        }
        Some(Value::String(u)) if u == unit_id => {}
        Some(Value::String(u)) => return Err(fail(format!("unit '{u}' does not match target unit '{unit_id}'"))),
        Some(_) => return Err(fail("unit must be a string".to_string())),
    }
    match obj.get("id") {
        None => {
            let id = format!("{prefix}-{next}");
            obj.insert("id".to_string(), Value::String(id));
        }
        Some(Value::String(id)) if taken.contains(id) => return Err(fail(format!("id already exists: {id}"))),
        Some(_) => {}
    }
    let item = serde_json::from_value::<Item>(value).map_err(|e| fail(e.to_string()))?;
    if !taken.insert(item.id().to_string()) {
        return Err(fail(format!("id already exists: {}", item.id())));
    }
    if let Some(n) = number_in(item.id(), prefix) {
        *next = (*next).max(n.saturating_add(1));
    }
    Ok(item)
}

fn append(path: &Path, items: &[Item]) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.file_type().is_symlink() => {
            return Err(format!("{} is a symlink, which is not allowed for security reasons", path.display()));
        }
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("cannot check {}: {e}", path.display())),
    }
    
    let io = |e: std::io::Error| format!("cannot write {}: {e}", path.display());
    let mut out = String::new();
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(io)?;
    }
    if path.is_file() {
        let existing = crate::read(path)?;
        if !existing.is_empty() && !existing.ends_with('\n') {
            out.push('\n');
        }
    }
    for item in items {
        out.push_str(&serde_json::to_string(item).map_err(|e| e.to_string())?);
        out.push('\n');
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path).map_err(io)?;
    file.write_all(out.as_bytes()).map_err(io)
}

/// Adds the items in the input (stdin or `file`) to `<course_dir>/content/<unit_id>.jsonl`.
/// All-or-nothing: on any item error prints every error to stderr, writes nothing, returns exit code 1.
/// With `dry_run` nothing is written. `Err` carries usage or IO failures (exit code 2).
pub fn run(course_dir: &Path, unit_id: &str, file: Option<&Path>, dry_run: bool) -> Result<u8, String> {
    if !dojo_core::validate::is_valid_course_id(unit_id) {
        eprintln!("unit id '{unit_id}' must match ^[a-z0-9][a-z0-9_-]{{0,47}}$");
        return Ok(1);
    }
    let course_files = crate::load(course_dir)?;
    let course = parse_course(&course_files.course_text)
        .map_err(|errs| format!("bad course.json: {}", errs.into_iter().map(|e| e.message).collect::<Vec<_>>().join("; ")))?;
    let text = read_input(file)?;
    if text.trim().is_empty() {
        return Err("empty input".to_string());
    }
    let values = match parse_input(&text) {
        Ok(values) if !values.is_empty() => values,
        Ok(_) => return Err("empty input".to_string()),
        Err(e) => {
            eprintln!("{e}");
            return Ok(1);
        }
    };
    if !course.units.iter().any(|u| u.id == unit_id) {
        eprintln!("unit '{unit_id}' does not exist in course.json");
        return Ok(1);
    }

    let mut taken = existing_ids(&course_files);
    let prefix = id_prefix(unit_id);
    let max_used = taken.iter().filter_map(|id| number_in(id, &prefix)).max().unwrap_or(0);
    let mut next = max_used.saturating_add(1);
    let mut items = Vec::new();
    let mut errors = Vec::new();
    for (idx, value) in values.into_iter().enumerate() {
        match convert(idx + 1, value, unit_id, &prefix, &mut taken, &mut next) {
            Ok(item) => items.push(item),
            Err(e) => errors.push(e),
        }
    }
    if !errors.is_empty() {
        for e in &errors {
            eprintln!("{e}");
        }
        return Ok(1);
    }

    let relative = format!("content/{unit_id}.jsonl");
    if !dry_run {
        append(&course_dir.join(&relative), &items)?;
    }
    let ids: Vec<&str> = items.iter().map(Item::id).collect();
    println!("added {} items to {relative}: {} .. {}", items.len(), ids.first().unwrap_or(&""), ids.last().unwrap_or(&""));
    println!("{}", ids.join(","));
    println!("next: ./dojo validate {}", course_dir.display());
    Ok(0)
}
