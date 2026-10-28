use dojo_core::slug::is_valid_course_id;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use crate::USAGE;

fn default_title_from_id(id: &str) -> String {
    let replaced = id.replace(['-', '_'], " ");
    let mut chars = replaced.chars();
    let first = chars.next().unwrap_or(' ').to_uppercase().collect::<String>();
    let rest: String = chars.collect();
    format!("{}{}", first, rest)
}

pub(crate) fn run_init(args: &[String]) -> Result<u8, String> {
    let mut course_id = None;
    let mut title = None;
    let mut ui_lang = None;
    let mut content_lang = None;
    let mut workspace = None;

    let mut it = args.iter().peekable();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--title" => {
                title = Some(it.next().ok_or_else(|| USAGE.to_string())?);
            }
            "--ui" => {
                ui_lang = Some(it.next().ok_or_else(|| USAGE.to_string())?);
            }
            "--content-lang" => {
                content_lang = Some(it.next().ok_or_else(|| USAGE.to_string())?);
            }
            "--workspace" => {
                workspace = Some(it.next().ok_or_else(|| USAGE.to_string())?);
            }
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if course_id.is_none() => course_id = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }

    let course_id = course_id.ok_or_else(|| USAGE.to_string())?;

    if !is_valid_course_id(course_id) {
        eprintln!("invalid course id '{course_id}': must match ^[a-z0-9][a-z0-9_-]{{0,47}}$");
        return Ok(1);
    }

    let base_dir = match workspace {
        Some(w) => PathBuf::from(w),
        None => std::env::current_dir().map_err(|e| format!("cannot read current directory: {e}"))?.join("workspace"),
    };

    let course_dir = base_dir.join(course_id);

    if course_dir.exists() {
        eprintln!("directory '{}' already exists", course_dir.display());
        return Ok(1);
    }

    // Create directories
    let content_dir = course_dir.join("content");
    let materials_dir = course_dir.join("materials");
    fs::create_dir_all(&content_dir).map_err(|e| format!("cannot create {}: {e}", content_dir.display()))?;
    fs::create_dir_all(&materials_dir).map_err(|e| format!("cannot create {}: {e}", materials_dir.display()))?;

    // Create materials/.gitkeep
    fs::write(materials_dir.join(".gitkeep"), "").map_err(|e| format!("cannot write .gitkeep: {e}"))?;

    // Default title
    let title = title.map(|s| s.to_string()).unwrap_or_else(|| default_title_from_id(course_id));
    let ui_lang = ui_lang.map(|s| s.to_string()).unwrap_or_else(|| "en".to_string());
    let content_lang = content_lang.map(|s| s.to_string()).unwrap_or_else(|| ui_lang.clone());

    // Create course.json
    let course = json!({
        "id": course_id,
        "title": title,
        "uiLanguage": ui_lang,
        "contentLanguage": content_lang,
        "units": [{"id": "unit-1", "title": "Unit 1"}]
    });
    let course_json = serde_json::to_string_pretty(&course).map_err(|e| e.to_string())? + "\n";
    fs::write(course_dir.join("course.json"), course_json).map_err(|e| format!("cannot write course.json: {e}"))?;

    // Create content/unit-1.jsonl (empty)
    fs::write(content_dir.join("unit-1.jsonl"), "").map_err(|e| format!("cannot write content/unit-1.jsonl: {e}"))?;

    // Create MAP.md
    let map_content = "# Course MAP\n\n| unit | title | sources | planned items |\n|------|-------|--------|---------------|\n\nDelete the placeholder unit and add your own.\n";
    fs::write(course_dir.join("MAP.md"), map_content).map_err(|e| format!("cannot write MAP.md: {e}"))?;

    println!("Created course '{}' in {}", course_id, course_dir.display());
    println!("  {}", course_dir.join("course.json").display());
    println!("  {}", content_dir.join("unit-1.jsonl").display());
    println!("  {}", materials_dir.join(".gitkeep").display());
    println!("  {}", course_dir.join("MAP.md").display());
    println!("\nNext: edit course.json units, then write content/<unit>.jsonl; see AGENTS.md");

    Ok(0)
}
