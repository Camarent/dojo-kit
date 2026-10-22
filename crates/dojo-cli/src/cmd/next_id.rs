use dojo_core::content::Item;
use std::collections::BTreeSet;
use std::path::Path;
use crate::course_files::*;
use crate::USAGE;

fn parse_prefix(s: &str) -> Result<(), String> {
    if s.is_empty() {
        return Err("prefix must not be empty".to_string());
    }
    let mut chars = s.chars();
    let first = chars.next().unwrap();
    if !first.is_ascii_lowercase() {
        return Err(format!("prefix '{}' must start with a lowercase letter", s));
    }
    if !chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) {
        return Err(format!("prefix '{}' must contain only lowercase letters and digits", s));
    }
    Ok(())
}

fn extract_number_from_id(id: &str, prefix: &str) -> Option<usize> {
    let full_prefix = format!("{prefix}-");
    if id.starts_with(&full_prefix) {
        let suffix = &id[full_prefix.len()..];
        suffix.parse::<usize>().ok()
    } else {
        None
    }
}

pub(crate) fn run_next_id(args: &[String]) -> Result<u8, String> {
    let mut dir = None;
    let mut prefix = None;
    let mut count = 1;

    let mut it = args.iter().peekable();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--count" => {
                if let Some(next) = it.peek() {
                    count = next.parse::<usize>().map_err(|_| "--count must be a number".to_string())?;
                    if count == 0 || count > 500 {
                        return Err("--count must be between 1 and 500".to_string());
                    }
                    it.next();
                } else {
                    return Err("--count requires a number".to_string());
                }
            }
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a),
            _ if prefix.is_none() => prefix = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }

    let dir = dir.ok_or_else(|| USAGE.to_string())?;
    let prefix = prefix.ok_or_else(|| USAGE.to_string())?;

    parse_prefix(prefix).map_err(|e| {
        eprintln!("{}", e);
        USAGE.to_string()
    })?;

    if count == 0 || count > 500 {
        return Err(USAGE.to_string());
    }

    let course = load(Path::new(dir))?;

    // Collect all ids from content files
    let mut existing_numbers: BTreeSet<usize> = BTreeSet::new();
    for f in &course.files {
        for line in f.text.lines().filter(|l| !l.trim().is_empty()) {
            if let Ok(item) = serde_json::from_str::<Item>(line) {
                if let Some(num) = extract_number_from_id(item.id(), prefix) {
                    existing_numbers.insert(num);
                }
            }
        }
    }

    // Collect all ids from ids.lock
    if let Some(lock) = &course.lock {
        for id in &lock.ids {
            if let Some(num) = extract_number_from_id(id, prefix) {
                existing_numbers.insert(num);
            }
        }
        for id in &lock.retired {
            if let Some(num) = extract_number_from_id(id, prefix) {
                existing_numbers.insert(num);
            }
        }
    }

    let max_num = existing_numbers.iter().max().copied().unwrap_or(0);
    let mut next_num = max_num + 1;

    for _ in 0..count {
        while existing_numbers.contains(&next_num) {
            next_num += 1;
        }
        println!("{}-{}", prefix, next_num);
        next_num += 1;
    }

    Ok(0)
}
