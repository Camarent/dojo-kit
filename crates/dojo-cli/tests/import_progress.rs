//! Integration tests for import-progress subcommand.

use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn unique_dir(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("dojo-cli-import-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stdout(out: &Output) -> String {
    String::from_utf8(out.stdout.clone()).unwrap()
}

fn stderr(out: &Output) -> String {
    String::from_utf8(out.stderr.clone()).unwrap()
}

/// Create a minimal course directory with entity-scoped SRS
fn create_test_course(dir: &Path, scope: &str) {
    fs::create_dir_all(dir).unwrap();
    
    // Create course.json with entity scope
    let course = json!({
        "id": "test-import",
        "title": "Test Import",
        "uiLanguage": "en",
        "contentLanguage": "en",
        "units": [
            {
                "id": "unit1",
                "title": "Unit 1"
            }
        ],
        "srs": {
            "scope": scope,
            "ladder": [0, 1000, 2000, 3000]
        }
    });
    fs::write(dir.join("course.json"), serde_json::to_string_pretty(&course).unwrap()).unwrap();
    
    // Create content directory
    fs::create_dir_all(dir.join("content")).unwrap();
    
    // Create content with entities
    // item1 and item2 belong to entity1
    // item3 and item4 belong to entity2
    // item5 has no entity (defaults to its own ID)
    let items = [json!({
            "type": "gap",
            "prompt": "Item 1",
            "answers": ["a"],
            "id": "item1",
            "entity": "entity1"
        }),
        json!({
            "type": "gap",
            "prompt": "Item 2",
            "answers": ["b"],
            "id": "item2",
            "entity": "entity1"
        }),
        json!({
            "type": "gap",
            "prompt": "Item 3",
            "answers": ["c"],
            "id": "item3",
            "entity": "entity2"
        }),
        json!({
            "type": "gap",
            "prompt": "Item 4",
            "answers": ["d"],
            "id": "item4",
            "entity": "entity2"
        }),
        json!({
            "type": "gap",
            "prompt": "Item 5",
            "answers": ["e"],
            "id": "item5"
        }),
        json!({
            "type": "gap",
            "prompt": "Item 6",
            "answers": ["f"],
            "id": "item6"
        })];
    
    let content_text: String = items.iter().map(|i| { let mut i = i.clone(); i["unit"] = json!("unit1"); serde_json::to_string(&i).unwrap() }).collect::<Vec<_>>().join("\n") + "\n";
    fs::write(dir.join("content/unit1.jsonl"), content_text).unwrap();
    
    // Create ids.lock
    let lock = json!({
        "v": 1,
        "ids": ["item1", "item2", "item3", "item4", "item5", "item6"],
        "retired": []
    });
    fs::write(dir.join("ids.lock"), serde_json::to_string_pretty(&lock).unwrap()).unwrap();
}

fn run_import_progress(
    old_progress: &Path,
    id_map: &Path,
    course_dir: &Path,
    out: Option<&Path>,
    write: bool,
    now: Option<&str>,
) -> Output {
    let mut cmd = dojo();
    cmd.arg("import-progress")
        .arg(old_progress)
        .arg("--map")
        .arg(id_map)
        .arg("--course")
        .arg(course_dir);
    
    if let Some(p) = out {
        cmd.arg("--out").arg(p);
    }
    if write {
        cmd.arg("--write");
    }
    if let Some(n) = now {
        cmd.arg("--now").arg(n);
    }
    
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap()
        .wait_with_output()
        .unwrap()
}

#[test]
fn dry_run_shows_report() {
    let dir = unique_dir("dry-run");
    create_test_course(&dir, "item");
    
    // Create old progress with 6 items
    let old_progress = json!({
        "items": {
            "old1": {"s": 2, "due": 1000, "ok": 5, "bad": 1, "last": 2000},
            "old2": {"s": 3, "due": 2000, "ok": 10, "bad": 0, "last": 3000},
            "old3": {"s": 1, "due": 500, "ok": 3, "bad": 2, "last": 1500},
            "old4": {"s": 4, "due": 3000, "ok": 8, "bad": 1, "last": 4000},
            "old5": {"s": 0, "due": 0, "ok": 0, "bad": 0, "last": 0},
            "old6": {"s": 5, "due": 4000, "ok": 12, "bad": 0, "last": 5000}
        },
        "stats": {
            "days": {"2024-01-01": 5},
            "newByDay": {"2024-01-01": 2}
        },
        "settings": {
            "newPerDay": 10,
            "placementDone": true
        }
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    // Create id-map: 1->many mapping, old1 maps to item1 and item2
    let id_map = json!({
        "aggregate": "mean",
        "ladderLen": 4,
        "map": {
            "old1": ["item1", "item2"],
            "old2": ["item3"],
            "old3": ["item4"],
            "old4": ["item5"],
            "old5": ["item6"]
        }
    });
    let map_path = dir.join("id-map.json");
    fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
    
    let out = run_import_progress(&old_path, &map_path, &dir, None, false, None);
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    
    let report = stdout(&out);
    assert!(report.contains("Mapped: 5"));
    assert!(report.contains("Unmapped: 1"));
    assert!(report.contains("old6")); // old6 is unmapped
}

#[test]
fn write_output_with_write_flag() {
    let dir = unique_dir("write-output");
    create_test_course(&dir, "item");
    
    // Create old progress
    let old_progress = json!({
        "items": {
            "old1": {"s": 2, "due": 1000, "ok": 5, "bad": 1, "last": 2000},
            "old2": {"s": 3, "due": 2000, "ok": 10, "bad": 0, "last": 3000}
        },
        "stats": {
            "days": {},
            "newByDay": {}
        },
        "settings": {
            "newPerDay": 5,
            "placementDone": false
        }
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    // Create id-map
    let id_map = json!({
        "map": {
            "old1": ["item1"],
            "old2": ["item2"]
        }
    });
    let map_path = dir.join("id-map.json");
    fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
    
    let out_path = dir.join("output.json");
    let out = run_import_progress(&old_path, &map_path, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    
    // Verify output file exists
    assert!(out_path.exists());
    
    // Verify output is valid JSON
    let output_text = fs::read_to_string(&out_path).unwrap();
    let output_value: serde_json::Value = serde_json::from_str(&output_text).unwrap();
    
    // Verify structure
    assert_eq!(output_value["v"], 1);
    assert!(output_value.get("items").is_some());
    assert!(output_value.get("stats").is_some());
    assert!(output_value.get("settings").is_some());
}

#[test]
fn test_aggregation_min() {
    let dir = unique_dir("agg-min");
    create_test_course(&dir, "item");
    
    // Create old progress: old1 maps to both item1 and item2, so they should be aggregated
    let old_progress = json!({
        "items": {
            "old1": {"s": 2, "due": 1000, "ok": 5, "bad": 1, "last": 2000},
            "old2": {"s": 4, "due": 2000, "ok": 10, "bad": 2, "last": 4000}
        },
        "stats": {"days": {}, "newByDay": {}},
        "settings": {}
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    // old1 maps to item1, old2 maps to item1 as well (1->many)
    let id_map = json!({
        "aggregate": "min",
        "map": {
            "old1": ["item1"],
            "old2": ["item1"]
        }
    });
    let map_path = dir.join("id-map.json");
    fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
    
    let out_path = dir.join("output.json");
    let out = run_import_progress(&old_path, &map_path, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    
    // Check that item1 has the minimum values
    let output_text = fs::read_to_string(&out_path).unwrap();
    let output_value: serde_json::Value = serde_json::from_str(&output_text).unwrap();
    let item1 = &output_value["items"]["item1"];
    assert_eq!(item1["s"], 2); // min(2, 4)
}

#[test]
fn test_aggregation_max() {
    let dir = unique_dir("agg-max");
    create_test_course(&dir, "item");
    
    let old_progress = json!({
        "items": {
            "old1": {"s": 2, "due": 1000, "ok": 5, "bad": 1, "last": 2000},
            "old2": {"s": 4, "due": 2000, "ok": 10, "bad": 2, "last": 4000}
        },
        "stats": {"days": {}, "newByDay": {}},
        "settings": {}
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    let id_map = json!({
        "aggregate": "max",
        "map": {
            "old1": ["item1"],
            "old2": ["item1"]
        }
    });
    let map_path = dir.join("id-map.json");
    fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
    
    let out_path = dir.join("output.json");
    let out = run_import_progress(&old_path, &map_path, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    
    let output_text = fs::read_to_string(&out_path).unwrap();
    let output_value: serde_json::Value = serde_json::from_str(&output_text).unwrap();
    let item1 = &output_value["items"]["item1"];
    // Course ladder is [0, 1000, 2000, 3000] (4 stages, max = 3)
    // So s=4 gets clamped to 3
    assert_eq!(item1["s"], 3); // max(2, 4) = 4, clamped to 3
}

#[test]
fn test_stage_clamping() {
    let dir = unique_dir("clamp");
    create_test_course(&dir, "item");
    
    // Create old progress with stage beyond ladder
    let old_progress = json!({
        "items": {
            "old1": {"s": 10, "due": 1000, "ok": 5, "bad": 1, "last": 2000}
        },
        "stats": {"days": {}, "newByDay": {}},
        "settings": {}
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    // Ladder has 4 stages (0..3), so stage 10 should be clamped to 3
    let id_map = json!({
        "ladderLen": 4,
        "map": {
            "old1": ["item1"]
        }
    });
    let map_path = dir.join("id-map.json");
    fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
    
    let out_path = dir.join("output.json");
    let out = run_import_progress(&old_path, &map_path, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    
    let output_text = fs::read_to_string(&out_path).unwrap();
    let output_value: serde_json::Value = serde_json::from_str(&output_text).unwrap();
    let item1 = &output_value["items"]["item1"];
    assert_eq!(item1["s"], 3); // clamped to max stage 3
}

#[test]
fn test_entity_scope_writes_to_all_members() {
    let dir = unique_dir("entity-scope");
    create_test_course(&dir, "entity");
    
    // Create old progress
    let old_progress = json!({
        "items": {
            "old1": {"s": 2, "due": 1000, "ok": 5, "bad": 1, "last": 2000}
        },
        "stats": {"days": {}, "newByDay": {}},
        "settings": {}
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    // old1 maps to item1 which is part of entity1 (with item1 and item2)
    let id_map = json!({
        "map": {
            "old1": ["item1"]
        }
    });
    let map_path = dir.join("id-map.json");
    fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
    
    let out_path = dir.join("output.json");
    let out = run_import_progress(&old_path, &map_path, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    
    let output_text = fs::read_to_string(&out_path).unwrap();
    let output_value: serde_json::Value = serde_json::from_str(&output_text).unwrap();
    let items = output_value["items"].as_object().unwrap();
    
    // Both item1 and item2 should have records
    assert!(items.contains_key("item1"));
    assert!(items.contains_key("item2"));
    
    // They should have the same record (entity view)
    assert_eq!(items["item1"], items["item2"]);
}

#[test]
fn test_settings_passthrough() {
    let dir = unique_dir("settings");
    create_test_course(&dir, "item");
    
    let old_progress = json!({
        "items": {},
        "stats": {"days": {}, "newByDay": {}},
        "settings": {
            "newPerDay": 20,
            "placementDone": true,
            "otherSetting": "should be dropped",
            "anotherExtra": 123
        }
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    let id_map = json!({"map": {}});
    let map_path = dir.join("id-map.json");
    fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
    
    let out_path = dir.join("output.json");
    let out = run_import_progress(&old_path, &map_path, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    
    let output_text = fs::read_to_string(&out_path).unwrap();
    let output_value: serde_json::Value = serde_json::from_str(&output_text).unwrap();
    let settings = output_value["settings"].as_object().unwrap();
    
    // newPerDay and placementDone should be passed through
    assert_eq!(settings["newPerDay"], 20);
    assert_eq!(settings["placementDone"], true);
    
    // Other settings should not be present
    assert!(settings.get("otherSetting").is_none());
    assert!(settings.get("anotherExtra").is_none());
}

#[test]
fn test_stats_passthrough() {
    let dir = unique_dir("stats");
    create_test_course(&dir, "item");
    
    let old_progress = json!({
        "items": {},
        "stats": {
            "days": {
                "2024-01-01": 5,
                "2024-01-02": 3
            },
            "newByDay": {
                "2024-01-01": 10,
                "2024-01-02": 8
            }
        },
        "settings": {}
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    let id_map = json!({"map": {}});
    let map_path = dir.join("id-map.json");
    fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
    
    let out_path = dir.join("output.json");
    let out = run_import_progress(&old_path, &map_path, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "stdout: {}, stderr: {}", stdout(&out), stderr(&out));
    
    let output_text = fs::read_to_string(&out_path).unwrap();
    let output_value: serde_json::Value = serde_json::from_str(&output_text).unwrap();
    let stats = output_value["stats"].as_object().unwrap();
    
    // days and newByDay should be passed through
    assert_eq!(stats["days"]["2024-01-01"], 5);
    assert_eq!(stats["days"]["2024-01-02"], 3);
    assert_eq!(stats["newByDay"]["2024-01-01"], 10);
    assert_eq!(stats["newByDay"]["2024-01-02"], 8);
}

#[test]
fn test_all_aggregation_methods() {
    let dir = unique_dir("all-agg");
    create_test_course(&dir, "item");
    
    let old_progress = json!({
        "items": {
            "old1": {"s": 1, "due": 100, "ok": 1, "bad": 1, "last": 100},
            "old2": {"s": 3, "due": 300, "ok": 3, "bad": 3, "last": 300},
            "old3": {"s": 2, "due": 200, "ok": 2, "bad": 2, "last": 200}
        },
        "stats": {"days": {}, "newByDay": {}},
        "settings": {}
    });
    let old_path = dir.join("old.json");
    fs::write(&old_path, serde_json::to_string_pretty(&old_progress).unwrap()).unwrap();
    
    // Use separate old IDs for each record to ensure predictable ordering
    // We'll use a single old ID that maps to multiple new IDs to test 1->many
    // But for aggregation, we need multiple old IDs mapping to the same new ID
    
    for agg in ["first", "min", "mean", "max"] {
        let id_map = json!({
            "aggregate": agg,
            "map": {
                "old1": ["item1"],
                "old2": ["item1"],
                "old3": ["item1"]
            }
        });
        let map_path = dir.join(format!("id-map-{}.json", agg));
        fs::write(&map_path, serde_json::to_string_pretty(&id_map).unwrap()).unwrap();
        
        let out_path = dir.join(format!("output-{}.json", agg));
        let out = run_import_progress(&old_path, &map_path, &dir, Some(&out_path), true, None);
        assert_eq!(code(&out), Some(0), "agg={}, stdout: {}, stderr: {}", agg, stdout(&out), stderr(&out));
        
        let output_text = fs::read_to_string(&out_path).unwrap();
        let output_value: serde_json::Value = serde_json::from_str(&output_text).unwrap();
        let item1 = &output_value["items"]["item1"];
        
        match agg {
            "first" => {
                assert_eq!(item1["s"], 1);
                assert_eq!(item1["ok"], 1);
            }
            "min" => {
                assert_eq!(item1["s"], 1);
                assert_eq!(item1["ok"], 1);
            }
            "mean" => {
                // (1+3+2)/3 = 2, (1+3+2)/3 = 2
                assert_eq!(item1["s"], 2);
                assert_eq!(item1["ok"], 2);
            }
            "max" => {
                // Course ladder is [0, 1000, 2000, 3000] (4 stages, max = 3)
                // s=3 is within range, so it should stay 3
                assert_eq!(item1["s"], 3);
                assert_eq!(item1["ok"], 3);
            }
            _ => unreachable!(),
        }
    }
}

fn write_json(path: &Path, v: &serde_json::Value) {
    fs::write(path, serde_json::to_string_pretty(v).unwrap()).unwrap();
}

fn read_json(path: &Path) -> serde_json::Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn six_item_old() -> serde_json::Value {
    json!({
        "items": {
            "o1": {"s": 2, "due": 100, "ok": 5, "bad": 1, "last": 200},
            "o2": {"s": 9, "due": 300, "ok": 7, "bad": 0, "last": 400},
            "o3": {"s": 1, "due": 50, "ok": 1, "bad": 4, "last": 60},
            "o4": {"s": 0, "due": 0, "ok": 0, "bad": 0, "last": 0},
            "o5": {"s": 3, "due": 10, "ok": 2, "bad": 2, "last": 20},
            "o6": {"s": 2, "due": 10, "ok": 2, "bad": 2, "last": 20}
        },
        "stats": {"days": {"2024-01-01": 5, "2024-01-02": 3}, "newByDay": {"2024-01-01": 2}},
        "settings": {"newPerDay": 12, "placementDone": true, "theme": "dark"}
    })
}

#[test]
fn one_to_many_unmapped_dates_and_settings() {
    let dir = unique_dir("one-many");
    create_test_course(&dir, "item");
    let old = dir.join("old.json");
    write_json(&old, &six_item_old());
    let map = dir.join("map.json");
    write_json(&map, &json!({"map": {"o1": ["item1", "item2", "item3"], "o2": ["item4"]}}));
    let out_path = dir.join("o.json");
    let out = run_import_progress(&old, &map, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let rep = stdout(&out);
    assert!(rep.contains("Mapped: 2") && rep.contains("Unmapped: 4"), "{rep}");
    assert!(rep.contains("o3, o4, o5, o6"), "{rep}");
    assert!(rep.contains("Total ok:") && rep.contains("Stage histogram"), "{rep}");
    let v = read_json(&out_path);
    for id in ["item1", "item2", "item3"] {
        assert_eq!(v["items"][id]["s"], 2, "{id}");
        assert_eq!(v["items"][id]["ok"], 5);
    }
    assert_eq!(v["items"]["item4"]["s"], 3, "clamped to default ladder-independent course ladder");
    assert_eq!(v["stats"]["days"]["2024-01-02"], 3);
    assert_eq!(v["stats"]["newByDay"]["2024-01-01"], 2);
    assert_eq!(v["settings"]["newPerDay"], 12);
    assert_eq!(v["settings"]["placementDone"], true);
    assert!(v["settings"].get("theme").is_none());
}

#[test]
fn unmapped_report_caps_at_twenty() {
    let dir = unique_dir("unmapped20");
    create_test_course(&dir, "item");
    let mut items = serde_json::Map::new();
    for i in 0..25 {
        items.insert(format!("u{i}"), json!({"s":0,"due":0,"ok":0,"bad":0,"last":0}));
    }
    let old = dir.join("old.json");
    write_json(&old, &json!({"items": items, "stats": {}, "settings": {}}));
    let map = dir.join("map.json");
    write_json(&map, &json!({"map": {}}));
    let out = run_import_progress(&old, &map, &dir, None, false, None);
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let rep = stdout(&out);
    assert!(rep.contains("Unmapped: 25") && rep.contains("u19") && !rep.contains("u20,") && rep.contains("5 more"), "{rep}");
}

#[test]
fn dry_run_writes_nothing() {
    let dir = unique_dir("dry-nothing");
    create_test_course(&dir, "item");
    let old = dir.join("old.json");
    write_json(&old, &six_item_old());
    let map = dir.join("map.json");
    write_json(&map, &json!({"map": {"o1": ["item1"]}}));
    let out_path = dir.join("o.json");
    let out = run_import_progress(&old, &map, &dir, Some(&out_path), false, None);
    assert_eq!(code(&out), Some(0));
    assert!(!out_path.exists());
    assert!(!dir.join("progress.json").exists());
    let out = run_import_progress(&old, &map, &dir, None, false, None);
    assert_eq!(code(&out), Some(0));
    assert!(!dir.join("progress.json").exists());
}

#[test]
fn output_is_sanitizer_stable() {
    let dir = unique_dir("sanitize");
    create_test_course(&dir, "entity");
    let old = dir.join("old.json");
    write_json(&old, &six_item_old());
    let map = dir.join("map.json");
    write_json(&map, &json!({"aggregate": "max", "map": {
        "o1": ["item1", "item5"], "o2": ["item3"], "o3": ["item6"]}}));
    let out_path = dir.join("o.json");
    let out = run_import_progress(&old, &map, &dir, Some(&out_path), true, Some("2024-03-01T00:00:00Z"));
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let v = read_json(&out_path);
    let again = dojo_core::progress::sanitize(&v).expect("sanitizes");
    assert_eq!(again, v);
}

#[test]
fn entity_members_get_min_stage_max_counts() {
    let dir = unique_dir("entity-agg");
    create_test_course(&dir, "entity");
    let old = dir.join("old.json");
    write_json(&old, &six_item_old());
    let map = dir.join("map.json");
    // item1,item2 share entity1: stages 2 and 1; ok 5 and 1; bad 1 and 4.
    write_json(&map, &json!({"map": {"o1": ["item1"], "o3": ["item2"]}}));
    let out_path = dir.join("o.json");
    let out = run_import_progress(&old, &map, &dir, Some(&out_path), true, None);
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let v = read_json(&out_path);
    for id in ["item1", "item2"] {
        assert_eq!(v["items"][id]["s"], 1, "{id}");
        assert_eq!(v["items"][id]["ok"], 5, "{id}");
        assert_eq!(v["items"][id]["bad"], 4, "{id}");
    }
    assert!(v["items"].get("item3").is_none());
}

#[test]
fn usage_and_error_exit_codes() {
    let dir = unique_dir("usage");
    create_test_course(&dir, "item");
    let out = dojo().arg("import-progress").output().unwrap();
    assert_eq!(code(&out), Some(2), "{}", stderr(&out));
    assert!(stderr(&out).contains("import-progress"));
    let out = dojo().args(["import-progress", "x.json", "--bogus"]).output().unwrap();
    assert_eq!(code(&out), Some(2));
    let out = dojo().args(["import-progress", "x.json", "--map"]).output().unwrap();
    assert_eq!(code(&out), Some(2));
    let missing = dir.join("nope.json");
    let map = dir.join("map.json");
    write_json(&map, &json!({"map": {}}));
    let out = run_import_progress(&missing, &map, &dir, None, false, None);
    assert_ne!(code(&out), Some(0));
    assert!(stderr(&out).contains("cannot read"), "{}", stderr(&out));
    let bad = dir.join("bad.json");
    fs::write(&bad, "{not json").unwrap();
    let out = run_import_progress(&bad, &map, &dir, None, false, None);
    assert_ne!(code(&out), Some(0));
    assert!(stderr(&out).contains("invalid JSON"), "{}", stderr(&out));
}

#[test]
fn write_without_out_is_refused() {
    let dir = unique_dir("write-no-out");
    create_test_course(&dir, "item");
    let old = dir.join("old.json");
    write_json(&old, &six_item_old());
    let map = dir.join("map.json");
    write_json(&map, &json!({"map": {"o1": ["item1"]}}));
    let out = run_import_progress(&old, &map, &dir, None, true, None);
    assert_ne!(code(&out), Some(0));
    assert!(stderr(&out).contains("--out"));
    assert!(!dir.join("progress.json").exists());
}

#[cfg(unix)]
#[test]
fn write_through_symlink_is_refused() {
    let dir = unique_dir("write-symlink");
    create_test_course(&dir, "item");
    let old = dir.join("old.json");
    write_json(&old, &six_item_old());
    let map = dir.join("map.json");
    write_json(&map, &json!({"map": {"o1": ["item1"]}}));
    let target = dir.join("victim.json");
    fs::write(&target, "keep").unwrap();
    let link = dir.join("link.json");
    std::os::unix::fs::symlink(&target, &link).unwrap();
    let out = run_import_progress(&old, &map, &dir, Some(&link), true, None);
    assert_ne!(code(&out), Some(0));
    assert_eq!(fs::read_to_string(&target).unwrap(), "keep");
}
