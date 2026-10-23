use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

const MIB: u64 = 1024 * 1024;

struct Env {
    root: PathBuf,
    course: PathBuf,
    web: PathBuf,
    wasm: PathBuf,
}

fn put(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for e in fs::read_dir(from).unwrap() {
        let e = e.unwrap();
        if e.path().is_dir() {
            copy_dir(&e.path(), &to.join(e.file_name()));
        } else {
            fs::copy(e.path(), to.join(e.file_name())).unwrap();
        }
    }
}

fn env(tag: &str) -> Env {
    static N: AtomicUsize = AtomicUsize::new(0);
    let root = std::env::temp_dir().join(format!("dojo-baudio-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&root);
    let course = root.join("course");
    copy_dir(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo"), &course);
    let _ = fs::remove_file(course.join("ids.lock"));
    let web = root.join("web");
    put(&web.join("bundle.json"), r#"{"scripts":["a.js"],"styles":[],"i18n":["en"],"licenses":[]}"#);
    put(&web.join("a.js"), "var a=1;");
    put(&web.join("i18n/en.json"), "{}");
    put(&web.join("index.template.html"), "<!--DOJO:TITLE--><!--DOJO:CSS--><!--DOJO:WASM--><!--DOJO:I18N--><!--DOJO:SCRIPTS--><!--DOJO:LICENSES-->");
    let wasm = root.join("tiny.wasm");
    fs::write(&wasm, [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).unwrap();
    Env { root, course, web, wasm }
}

fn edit_course(e: &Env, f: impl FnOnce(&mut Value)) {
    let p = e.course.join("course.json");
    let mut v: Value = serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
    f(&mut v);
    fs::write(p, serde_json::to_string_pretty(&v).unwrap()).unwrap();
}

/// Adds audio with one pack of each size in `sizes` (sparse files).
fn add_audio(e: &Env, sizes: &[u64]) {
    let packs: Vec<Value> = sizes.iter().enumerate().map(|(i, b)| json!({"file": format!("pack-{i:02}.bin"), "bytes": b})).collect();
    let manifest = json!({"v": 1, "packs": packs, "clips": {"c-one": {"pack": 0, "off": 0, "len": 4, "ms": 100, "mime": "audio/wav"}}});
    put(&e.course.join("audio/manifest.json"), &manifest.to_string());
    for (i, b) in sizes.iter().enumerate() {
        let f = fs::File::create(e.course.join(format!("audio/pack-{i:02}.bin"))).unwrap();
        f.set_len(*b).unwrap();
    }
    edit_course(e, |v| v["audio"] = json!({"manifest": "audio/manifest.json"}));
}

fn build(e: &Env, out: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
        .args(["build"]).arg(&e.course).arg("--out").arg(out)
        .arg("--wasm").arg(&e.wasm).arg("--web").arg(&e.web)
        .output().unwrap()
}

fn stderr(o: &Output) -> String {
    String::from_utf8_lossy(&o.stderr).to_string()
}

fn json_file(p: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(p).unwrap()).unwrap()
}

#[test]
fn audio_manifest_and_packs_are_copied_and_listed() {
    let e = env("copy");
    add_audio(&e, &[64, 32]);
    let out = e.root.join("dist");
    let o = build(&e, &out);
    assert_eq!(o.status.code(), Some(0), "{}", stderr(&o));
    let d = out.join("demo");
    assert_eq!(fs::read(d.join("data/audio/manifest.json")).unwrap(), fs::read(e.course.join("audio/manifest.json")).unwrap());
    assert_eq!(fs::metadata(d.join("data/audio/pack-00.bin")).unwrap().len(), 64);
    assert_eq!(fs::metadata(d.join("data/audio/pack-01.bin")).unwrap().len(), 32);
    let paths: Vec<String> = json_file(&d.join("manifest.json"))["files"].as_array().unwrap().iter().map(|f| f["path"].as_str().unwrap().to_string()).collect();
    for p in ["data/audio/manifest.json", "data/audio/pack-00.bin", "data/audio/pack-01.bin"] {
        assert!(paths.iter().any(|x| x == p), "{p} in {paths:?}");
    }
}

#[test]
fn course_without_audio_has_the_same_file_list() {
    let e = env("noaudio");
    let out = e.root.join("dist");
    assert_eq!(build(&e, &out).status.code(), Some(0));
    let paths: Vec<String> = json_file(&out.join("demo/manifest.json"))["files"].as_array().unwrap().iter().map(|f| f["path"].as_str().unwrap().to_string()).collect();
    assert_eq!(paths, ["data/content.json", "index.html"]);
    assert!(!out.join("demo/data/audio").exists());
}

#[test]
fn audio_does_not_change_content_json_beyond_the_course_audio_field() {
    let e = env("content");
    let a = e.root.join("a");
    assert_eq!(build(&e, &a).status.code(), Some(0));
    let plain = json_file(&a.join("demo/data/content.json"));
    add_audio(&e, &[8]);
    let b = e.root.join("b");
    assert_eq!(build(&e, &b).status.code(), Some(0));
    let mut with = json_file(&b.join("demo/data/content.json"));
    assert_eq!(with["course"]["audio"], json!({"manifest": "audio/manifest.json"}));
    with["course"].as_object_mut().unwrap().remove("audio");
    with["version"] = plain["version"].clone();
    assert_eq!(with, plain);
}

#[test]
fn pack_over_16_mib_fails() {
    let e = env("bigfile");
    add_audio(&e, &[16 * MIB + 1]);
    let o = build(&e, &e.root.join("dist"));
    assert_eq!(o.status.code(), Some(1));
    let err = stderr(&o);
    assert!(err.contains("pack-00.bin") && err.contains("per-file limit"), "{err}");
}

#[test]
fn pack_of_exactly_16_mib_is_accepted() {
    let e = env("edgefile");
    add_audio(&e, &[16 * MIB]);
    assert_eq!(build(&e, &e.root.join("dist")).status.code(), Some(0));
}

#[test]
fn dist_over_60_mib_fails() {
    let e = env("total");
    add_audio(&e, &[16 * MIB, 16 * MIB, 16 * MIB, 13 * MIB]);
    let o = build(&e, &e.root.join("dist"));
    assert_eq!(o.status.code(), Some(1));
    assert!(stderr(&o).contains("byte limit"), "{}", stderr(&o));
}

#[test]
fn more_than_250_files_fails() {
    let e = env("count");
    add_audio(&e, &vec![4; 246]);
    let o = build(&e, &e.root.join("dist"));
    assert_eq!(o.status.code(), Some(1), "{}", stderr(&o));
    assert!(stderr(&o).contains("file limit"), "{}", stderr(&o));
}

#[test]
fn exactly_250_files_is_accepted() {
    let e = env("count-ok");
    add_audio(&e, &vec![4; 245]);
    let out = e.root.join("dist");
    let o = build(&e, &out);
    assert_eq!(o.status.code(), Some(0), "{}", stderr(&o));
    assert_eq!(file_count(&out.join("demo")), 250);
}

#[test]
fn timers_ship_with_all_defaults_and_absent_timers_stay_absent() {
    let e = env("timer");
    edit_course(&e, |v| {
        v["timer"] = json!({"baseMs": 9000});
        v["units"][0]["timer"] = json!({"replays": 2});
    });
    let out = e.root.join("dist");
    let o = build(&e, &out);
    assert_eq!(o.status.code(), Some(0), "{}", stderr(&o));
    let c = json_file(&out.join("demo/data/content.json"));
    assert_eq!(c["course"]["timer"], json!({"baseMs": 9000, "adaptive": true, "replays": 1}));
    assert_eq!(c["course"]["units"][0]["timer"], json!({"baseMs": 8000, "adaptive": true, "replays": 2}));
    assert!(c["course"]["units"][1].get("timer").is_none());
}

fn dir_bytes(p: &Path) -> u64 {
    fs::read_dir(p).unwrap().map(|e| e.unwrap().path()).map(|p| if p.is_dir() { dir_bytes(&p) } else { fs::metadata(p).unwrap().len() }).sum()
}

/// Finds the last pack size that makes the whole dist exactly `target` bytes.
fn fit_last_pack(target: u64) -> (Env, u64) {
    let mut last = 12_000_000;
    for _ in 0..6 {
        let e = env("fit");
        add_audio(&e, &[16 * MIB, 16 * MIB, 16 * MIB, last]);
        let out = e.root.join("dist");
        let o = build(&e, &out);
        assert_eq!(o.status.code(), Some(0), "{last} {}", stderr(&o));
        let total = dir_bytes(&out.join("demo"));
        if total == target {
            return (e, last);
        }
        last = (last as i64 + target as i64 - total as i64) as u64;
    }
    panic!("no fit");
}

#[test]
fn dist_of_exactly_60_mib_is_accepted_and_one_more_byte_is_rejected() {
    let (_e, last) = fit_last_pack(60 * MIB);
    let e = env("edge-ok");
    add_audio(&e, &[16 * MIB, 16 * MIB, 16 * MIB, last]);
    assert_eq!(build(&e, &e.root.join("dist")).status.code(), Some(0));
    let e = env("edge-over");
    add_audio(&e, &[16 * MIB, 16 * MIB, 16 * MIB, last + 1]);
    let o = build(&e, &e.root.join("dist"));
    assert_eq!(o.status.code(), Some(1));
    assert!(stderr(&o).contains("byte limit"), "{}", stderr(&o));
}

#[test]
fn a_pack_listed_twice_is_copied_and_counted_once() {
    let e = env("dup");
    add_audio(&e, &[4, 4]);
    let mut m = json_file(&e.course.join("audio/manifest.json"));
    m["packs"][1]["file"] = json!("pack-00.bin");
    put(&e.course.join("audio/manifest.json"), &m.to_string());
    let out = e.root.join("dist");
    let o = build(&e, &out);
    assert_eq!(o.status.code(), Some(0), "{}", stderr(&o));
    let files = json_file(&out.join("demo/manifest.json"))["files"].as_array().unwrap().len();
    assert_eq!(files, 4);
}

fn file_count(p: &Path) -> usize {
    fs::read_dir(p).unwrap().map(|e| e.unwrap().path()).map(|p| if p.is_dir() { file_count(&p) } else { 1 }).sum()
}

fn names(p: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(p).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
    v.sort();
    v
}

#[test]
fn rebuild_drops_stale_audio() {
    let e = env("stale");
    add_audio(&e, &[4, 4]);
    let out = e.root.join("dist");
    assert_eq!(build(&e, &out).status.code(), Some(0));
    add_audio(&e, &[4]);
    fs::remove_file(e.course.join("audio/pack-01.bin")).unwrap();
    assert_eq!(build(&e, &out).status.code(), Some(0));
    assert_eq!(names(&out.join("demo/data/audio")), ["manifest.json", "pack-00.bin"]);
    edit_course(&e, |v| { v.as_object_mut().unwrap().remove("audio"); });
    assert_eq!(build(&e, &out).status.code(), Some(0));
    assert!(!out.join("demo/data/audio").exists());
}

#[cfg(unix)]
#[test]
fn symlinked_audio_dir_or_pack_is_rejected() {
    let e = env("symdir");
    add_audio(&e, &[4]);
    let outside = e.root.join("outside");
    fs::rename(e.course.join("audio"), &outside).unwrap();
    std::os::unix::fs::symlink(&outside, e.course.join("audio")).unwrap();
    let o = build(&e, &e.root.join("dist"));
    assert_eq!(o.status.code(), Some(1), "{}", stderr(&o));
    assert!(stderr(&o).contains("symlink"), "{}", stderr(&o));

    let e = env("sympack");
    add_audio(&e, &[4]);
    fs::rename(e.course.join("audio/pack-00.bin"), e.root.join("real.bin")).unwrap();
    std::os::unix::fs::symlink(e.root.join("real.bin"), e.course.join("audio/pack-00.bin")).unwrap();
    let o = build(&e, &e.root.join("dist"));
    assert_eq!(o.status.code(), Some(1), "{}", stderr(&o));
}

#[test]
fn pack_named_manifest_json_is_rejected() {
    let e = env("packman");
    add_audio(&e, &[4]);
    let path = e.course.join("audio/manifest.json");
    let mut m = json_file(&path);
    m["packs"][0]["file"] = json!("manifest.json");
    for _ in 0..3 {
        put(&path, &m.to_string());
        m["packs"][0]["bytes"] = json!(fs::metadata(&path).unwrap().len());
    }
    let o = build(&e, &e.root.join("dist"));
    assert_eq!(o.status.code(), Some(1), "{}", stderr(&o));
    assert!(stderr(&o).contains("cannot be named manifest.json"), "{}", stderr(&o));
}

#[test]
fn null_timer_builds_like_no_timer() {
    let e = env("nulltimer");
    edit_course(&e, |v| v["timer"] = Value::Null);
    let out = e.root.join("dist");
    let o = build(&e, &out);
    assert_eq!(o.status.code(), Some(0), "{}", stderr(&o));
    assert!(json_file(&out.join("demo/data/content.json"))["course"]["timer"].is_null());
}

#[test]
fn out_dir_resolving_to_the_course_dir_fails_and_keeps_its_audio() {
    let mut e = env("overlap");
    add_audio(&e, &[16]);
    let same = e.root.join("demo");
    fs::rename(&e.course, &same).unwrap();
    e.course = same;
    fs::create_dir_all(e.course.join("data/audio")).unwrap();
    put(&e.course.join("data/audio/keep.bin"), "x");
    let o = build(&e, &e.root);
    assert_eq!(o.status.code(), Some(1));
    assert!(stderr(&o).contains("overlaps the course directory"), "{}", stderr(&o));
    assert!(e.course.join("data/audio/keep.bin").exists());
    let inner = build(&e, &e.course);
    assert_eq!(inner.status.code(), Some(1));
}
