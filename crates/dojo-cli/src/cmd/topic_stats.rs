use dojo_core::content::{Course, Item, parse_course, parse_items};
use dojo_core::days;
use dojo_core::topic_stats::topic_stats;
use serde_json::Value;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::course_files::*;
use crate::USAGE;

/// Run the topic-stats subcommand: read the course and a progress file, print `TopicStats` as JSON.
/// Nothing is written to disk.
pub(crate) fn run_topic_stats(args: &[String]) -> Result<u8, String> {
    let mut dir = None;
    let mut progress_path = None;
    let mut changed_since = None;
    let mut as_json = false;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--json" => as_json = true,
            "--progress" if progress_path.is_none() => {
                progress_path = Some(it.next().ok_or_else(|| USAGE.to_string())?.as_str());
            }
            "--changed-since" => changed_since = Some(it.next().ok_or_else(|| USAGE.to_string())?.as_str()),
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a.as_str()),
            _ => return Err(USAGE.to_string()),
        }
    }
    let dir = dir.ok_or_else(|| USAGE.to_string())?;
    let progress_path = progress_path.ok_or_else(|| USAGE.to_string())?;
    if !as_json {
        return Err(USAGE.to_string());
    }
    let changed_since_ms = match changed_since {
        Some(s) => Some(days::parse_iso_ms(s).ok_or_else(|| format!("invalid timestamp: {s}"))?),
        None => None,
    };

    let course = load(Path::new(dir))?;
    let course_data: Course = parse_course(&course.course_text).map_err(|errs| {
        let msgs: Vec<String> = errs.into_iter().map(|e| e.message).collect();
        format!("course.json parse error: {}", msgs.join("; "))
    })?;
    let items: Vec<Item> = course.files.iter().flat_map(|f| parse_items(&f.text).items).map(|(_, i)| i).collect();

    let progress_text = read(Path::new(progress_path))?;
    let progress: Value = serde_json::from_str(&progress_text)
        .map_err(|e| format!("invalid JSON in {progress_path}: {e}"))?;
    if let Some(course_id) = progress.get("course").and_then(Value::as_str)
        && course_id != course_data.id
    {
        return Err(format!("progress is for course {course_id}, not {}", course_data.id));
    }
    if progress.get("parts").and_then(Value::as_i64).is_some_and(|n| n > 0) {
        return Err("split progress document: join the .partN bodies first".to_string());
    }

    let now_ms = i64::try_from(
        SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis(),
    )
    .map_err(|e| e.to_string())?;
    let stats = topic_stats(&course_data, &items, &progress, changed_since_ms, now_ms);
    println!("{}", serde_json::to_string_pretty(&stats).map_err(|e| e.to_string())?);
    Ok(0)
}
