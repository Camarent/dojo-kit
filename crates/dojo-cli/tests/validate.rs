use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn unique_dir(tag: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("dojo-cli-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stdout(out: &Output) -> String {
    String::from_utf8(out.stdout.clone()).unwrap()
}

#[test]
fn demo_validates_with_exit_0() {
    let out = dojo().arg("validate").arg(demo()).output().unwrap();
    assert_eq!(code(&out), Some(0));
    assert_eq!(stdout(&out), "0 errors, 0 warnings\n");
}

#[test]
fn errors_exit_1_with_text_format() {
    let out = dojo().arg("validate").arg(fixture("errors")).output().unwrap();
    assert_eq!(code(&out), Some(1));
    let text = stdout(&out);
    assert!(text.starts_with("error[unknown_unit] content/u.jsonl:1: "), "{text}");
    assert!(text.ends_with("1 errors, 0 warnings\n"), "{text}");
}

#[test]
fn strict_turns_warnings_into_failure() {
    let plain = dojo().arg("validate").arg(fixture("warn")).output().unwrap();
    assert_eq!(code(&plain), Some(0));
    assert!(stdout(&plain).contains("warning[unit_empty] course.json: "));
    let strict = dojo().arg("validate").arg(fixture("warn")).arg("--strict").output().unwrap();
    assert_eq!(code(&strict), Some(1));
}

#[test]
fn json_output_is_a_single_object_with_matching_counts() {
    let out = dojo().arg("validate").arg(fixture("errors")).arg("--json").output().unwrap();
    assert_eq!(code(&out), Some(1));
    let v: Value = serde_json::from_str(&stdout(&out)).unwrap();
    assert_eq!(v["ok"], false);
    assert_eq!(v["errors"], 1);
    assert_eq!(v["warnings"], 0);
    let d = &v["diagnostics"][0];
    assert_eq!((d["severity"].as_str(), d["code"].as_str(), d["line"].as_u64()), (Some("error"), Some("unknown_unit"), Some(1)));
    assert_eq!(d["file"], "content/u.jsonl");
    assert!(d["message"].is_string());
    let ok = dojo().arg("validate").arg(demo()).arg("--json").output().unwrap();
    let v: Value = serde_json::from_str(&stdout(&ok)).unwrap();
    assert_eq!((v["ok"].clone(), v["diagnostics"].as_array().map(Vec::len)), (Value::Bool(true), Some(0)));
}

#[test]
fn usage_and_io_errors_exit_2() {
    let missing = std::env::temp_dir().join("dojo-cli-does-not-exist");
    assert_eq!(code(&dojo().arg("validate").arg(&missing).output().unwrap()), Some(2));
    assert_eq!(code(&dojo().arg("validate").output().unwrap()), Some(2));
    assert_eq!(code(&dojo().arg("validate").arg(demo()).arg("--bogus").output().unwrap()), Some(2));
    assert_eq!(code(&dojo().arg("validate").arg(fixture("badlock")).output().unwrap()), Some(2));
    assert_eq!(code(&dojo().arg("lock").output().unwrap()), Some(2));
    let empty = unique_dir("empty");
    assert_eq!(code(&dojo().arg("validate").arg(&empty).output().unwrap()), Some(2));
}

#[test]
fn lock_refuses_to_write_on_errors() {
    let dir = unique_dir("lock-err");
    copy_dir(&fixture("errors"), &dir);
    let out = dojo().arg("lock").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(1));
    assert!(stdout(&out).contains("error[unknown_unit]"));
    assert!(!dir.join("ids.lock").exists());
}

#[test]
fn lock_writes_sorted_output_and_demo_passes_with_it() {
    let dir = unique_dir("lock-ok");
    copy_dir(&fixture("warn"), &dir);
    let out = dojo().arg("lock").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(0));
    assert_eq!(stdout(&out), "ids.lock: 2 ids, 0 retired\n");
    let text = std::fs::read_to_string(dir.join("ids.lock")).unwrap();
    let v: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(v["ids"], serde_json::json!(["u-1", "u-2"]));
    assert!(text.ends_with('\n'));

    let demo_copy = unique_dir("demo");
    copy_dir(&demo(), &demo_copy);
    assert_eq!(code(&dojo().arg("lock").arg(&demo_copy).output().unwrap()), Some(0));
    assert!(demo_copy.join("ids.lock").exists());
    let again = dojo().arg("validate").arg(&demo_copy).arg("--strict").output().unwrap();
    assert_eq!(code(&again), Some(0));
    assert_eq!(code(&dojo().arg("lock").arg(&demo_copy).output().unwrap()), Some(0));
}

#[test]
fn validate_with_lock_detects_removed_id() {
    let dir = unique_dir("removed");
    copy_dir(&demo(), &dir);
    assert_eq!(code(&dojo().arg("lock").arg(&dir).output().unwrap()), Some(0));
    let geo = dir.join("content/geo.jsonl");
    let text = std::fs::read_to_string(&geo).unwrap();
    let kept: Vec<&str> = text.lines().filter(|l| !l.contains(r#""id":"geo-1""#)).collect();
    std::fs::write(&geo, kept.join("\n")).unwrap();
    let out = dojo().arg("validate").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(1));
    assert!(stdout(&out).contains("error[id_removed] ids.lock: "));
}

#[test]
fn brief_lists_validator_codes() {
    let out = dojo().args(["schema", "--brief"]).output().unwrap();
    let text = stdout(&out);
    assert!(text.contains("VALIDATOR CODES"));
    assert!(text.contains("  retired_id_reused [error]"));
}

#[test]
fn symlink_content_file_is_rejected() {
    use std::os::unix::fs as unix_fs;
    let dir = unique_dir("symlink");
    copy_dir(&demo(), &dir);
    
    // Create a symlink to a content file
    let content_dir = dir.join("content");
    let target = content_dir.join("geo.jsonl");
    let symlink_path = dir.join("content/symlink.jsonl");
    unix_fs::symlink(&target, &symlink_path).unwrap();
    
    let out = dojo().arg("validate").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(2));
    let stderr = String::from_utf8(out.stderr.clone()).unwrap();
    assert!(stderr.contains("symlink"));
}

#[test]
fn symlink_ids_lock_is_rejected() {
    use std::os::unix::fs as unix_fs;
    let dir = unique_dir("symlink-lock");
    copy_dir(&demo(), &dir);
    
    // Replace ids.lock with a symlink to /tmp
    let target = Path::new("/tmp/dojo-test-ids.lock");
    let symlink_path = dir.join("ids.lock");
    // Create the target file first
    std::fs::write(target, "test").unwrap();
    // Remove the original ids.lock
    std::fs::remove_file(&symlink_path).unwrap();
    // Create a symlink in its place
    unix_fs::symlink(target, &symlink_path).unwrap();
    
    // This should fail when trying to load (exit code 2 for IO errors)
    let out = dojo().arg("validate").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(2));
    let stderr = String::from_utf8(out.stderr.clone()).unwrap();
    assert!(stderr.contains("symlink") || stderr.contains("ids.lock"));
}

#[test]
fn dangling_ids_lock_symlink_is_rejected_and_target_not_created() {
    let dir = unique_dir("dangling-lock");
    copy_dir(&demo(), &dir);
    let target = dir.join("elsewhere.lock");
    std::fs::remove_file(dir.join("ids.lock")).unwrap();
    std::os::unix::fs::symlink(&target, dir.join("ids.lock")).unwrap();
    let out = dojo().arg("lock").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(2), "{}", String::from_utf8_lossy(&out.stderr));
    assert!(String::from_utf8_lossy(&out.stderr).contains("symlink"));
    assert!(!target.exists());
}

const EN: &str = r#"{"hi":"Hello {name}","bye":"Bye","lang":"Language: {lang}"}"#;

fn i18n_setup(tag: &str, file: &str) -> (PathBuf, PathBuf) {
    let dir = unique_dir(tag);
    copy_dir(&demo(), &dir);
    std::fs::create_dir_all(dir.join("i18n")).unwrap();
    std::fs::write(dir.join("i18n/xx.json"), file).unwrap();
    let web = unique_dir(&format!("{tag}-web"));
    std::fs::create_dir_all(web.join("i18n")).unwrap();
    std::fs::write(web.join("i18n/en.json"), EN).unwrap();
    (dir, web)
}

fn fixture_web(root: &Path) -> PathBuf {
    let web = root.join("web");
    std::fs::create_dir_all(web.join("i18n")).unwrap();
    let _ = std::fs::write(web.join("bundle.json"), r#"{"scripts":["a.js","b.js"],"styles":["s.css"],"i18n":["en","ru"],"licenses":["L.txt"]}"#);
    let _ = std::fs::write(web.join("a.js"), "var a=1;");
    let _ = std::fs::write(web.join("b.js"), "var s='</script>';");
    let _ = std::fs::write(web.join("s.css"), "body{margin:0}");
    let _ = std::fs::write(web.join("L.txt"), "MIT -- license");
    let _ = std::fs::write(web.join("i18n/en.json"), EN);
    let _ = std::fs::write(web.join("i18n/ru.json"), r#"{"hi":"Privet","bye":"Poka","thanks":"Spasibo"}"#);
    let _ = std::fs::write(
        web.join("index.template.html"),
        "<title><!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n",
    );
    web
}

fn validate_i18n(dir: &Path, web: &Path, extra: &[&str]) -> Output {
    dojo().arg("validate").arg(dir).arg("--web").arg(web).args(extra).output().unwrap()
}

#[test]
fn i18n_complete_file_has_no_diagnostics() {
    let (dir, web) = i18n_setup("i18n-ok", r#"{"hi":"Salut {name}","bye":"Ciao","lang":"Langue {lang}"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(0));
    assert_eq!(stdout(&out), "0 errors, 0 warnings\n");
}

#[test]
fn i18n_missing_keys_warn_and_fail_only_with_strict() {
    let (dir, web) = i18n_setup("i18n-missing", r#"{"hi":"Salut {name}"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(0));
    let text = stdout(&out);
    assert!(text.contains("warning[i18n_missing_key] i18n/xx.json: "), "{text}");
    assert!(text.contains("bye") && text.contains("lang"), "{text}");
    assert_eq!(code(&validate_i18n(&dir, &web, &["--strict"])), Some(1));
}

#[test]
fn i18n_lost_placeholder_is_an_error() {
    let (dir, web) = i18n_setup("i18n-ph", r#"{"hi":"Salut","bye":"Ciao","lang":"Langue"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(1));
    let text = stdout(&out);
    assert!(text.contains("error[i18n_placeholder] i18n/xx.json: "), "{text}");
    assert_eq!(text.matches("i18n_placeholder").count(), 2, "{text}");
}

#[test]
fn i18n_extra_placeholder_is_an_error() {
    let (dir, web) = i18n_setup("i18n-ph-extra", r#"{"hi":"Salut {name} {n}","bye":"Ciao","lang":"Langue {lang}"}"#);
    assert_eq!(code(&validate_i18n(&dir, &web, &[])), Some(1));
}

#[test]
fn i18n_unknown_key_is_a_warning() {
    let (dir, web) = i18n_setup("i18n-unknown", r#"{"hi":"Salut {name}","bye":"Ciao","lang":"Langue {lang}","extra":"x"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(0));
    assert!(stdout(&out).contains("warning[i18n_unknown_key] i18n/xx.json: "), "{}", stdout(&out));
}

#[test]
fn i18n_non_string_value_is_an_error() {
    let (dir, web) = i18n_setup("i18n-nonstr", r#"{"hi":"Salut {name}","bye":3,"lang":"Langue {lang}"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(1));
    assert!(stdout(&out).contains("error[i18n_not_string] i18n/xx.json: "), "{}", stdout(&out));
}

#[test]
fn i18n_invalid_json_is_an_error() {
    let (dir, web) = i18n_setup("i18n-badjson", "{not json");
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(1));
    assert!(stdout(&out).contains("error[i18n_bad_file] i18n/xx.json: "), "{}", stdout(&out));
}

#[test]
fn i18n_check_is_skipped_without_a_web_dir() {
    let (dir, _web) = i18n_setup("i18n-noweb", r#"{"hi":"Salut"}"#);
    let cwd = unique_dir("i18n-noweb-cwd");
    let out = dojo().current_dir(&cwd).arg("validate").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(0));
    assert_eq!(stdout(&out), "0 errors, 0 warnings\n");
}

#[test]
fn i18n_errors_are_shown_by_lock() {
    let (dir, web) = i18n_setup("i18n-lock", r#"{"hi":"Salut","bye":"Ciao","lang":"Langue"}"#);
    let root = unique_dir("i18n-lock-root");
    copy_dir(&web, &root.join("web"));
    std::fs::write(root.join("web/bundle.json"), "{}").unwrap();
    let out = dojo().current_dir(&root).arg("lock").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(1));
    assert!(stdout(&out).contains("error[i18n_placeholder]"), "{}", stdout(&out));
}

const EN_PLURAL: &str = r#"{"n.one":"{n} item","n.other":"{n} items","hi":"Hello {name}"}"#;

fn i18n_plural_setup(tag: &str, file: &str) -> (PathBuf, PathBuf) {
    let dir = unique_dir(tag);
    copy_dir(&demo(), &dir);
    std::fs::create_dir_all(dir.join("i18n")).unwrap();
    std::fs::write(dir.join("i18n/xx.json"), file).unwrap();
    let web = unique_dir(&format!("{tag}-web"));
    std::fs::create_dir_all(web.join("i18n")).unwrap();
    std::fs::write(web.join("i18n/en.json"), EN_PLURAL).unwrap();
    (dir, web)
}

#[test]
fn i18n_plural_dotted_suffixes_accepted() {
    let (dir, web) = i18n_plural_setup("i18n-plural-dotted", r#"{"n.one":"{n} элемент","n.few":"{n} элемента","n.many":"{n} элементов","n.other":"{n} элементов","hi":"Привет {name}"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(0));
    assert_eq!(stdout(&out), "0 errors, 0 warnings\n");
}

#[test]
fn i18n_plural_placeholder_mismatch_is_error() {
    let (dir, web) = i18n_plural_setup("i18n-plural-ph", r#"{"n.one":"{n} элемент","n.few":"много","n.many":"{n} элементов","n.other":"{n} элементов","hi":"Привет {name}"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(1));
    let text = stdout(&out);
    assert!(text.contains("error[i18n_placeholder] i18n/xx.json: "), "{}", text);
    assert!(text.contains("n.few"), "{}", text);
}

#[test]
fn i18n_plural_unknown_suffix_is_warning() {
    let (dir, web) = i18n_plural_setup("i18n-plural-unknown", r#"{"n.one":"{n} элемент","n.few":"{n} элемента","n.many":"{n} элементов","n.other":"{n} элементов","n.dual":"{n} duo","hi":"Привет {name}"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(0));
    let text = stdout(&out);
    assert!(text.contains("warning[i18n_unknown_key] i18n/xx.json: "), "{}", text);
    assert!(text.contains("n.dual"), "{}", text);
}

#[test]
fn i18n_plural_underscore_suffix_is_warning() {
    let (dir, web) = i18n_plural_setup("i18n-plural-underscore", r#"{"n.one":"{n} элемент","n.few":"{n} элемента","n.many":"{n} элементов","n.other":"{n} элементов","n_few":"{n} wrong","hi":"Привет {name}"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(0));
    let text = stdout(&out);
    assert!(text.contains("warning[i18n_unknown_key] i18n/xx.json: "), "{}", text);
    assert!(text.contains("n_few"), "{}", text);
}

#[test]
fn i18n_reserved_plugin_course_keys_do_not_warn() {
    let (dir, _web) = i18n_setup("i18n-reserved", r#"{"plugin.x.y":"val","course.a":"val","hi":"Salut {name}","bye":"Ciao","lang":"Langue {lang}"}"#);
    let out = validate_i18n(&dir, &_web, &[]);
    assert_eq!(code(&out), Some(0));
    assert!(!stdout(&out).contains("warning[i18n_unknown_key]"), "reserved keys should not warn: {}", stdout(&out));
    
    let build_web_root = unique_dir("i18n-reserved-build-web");
    let build_web = fixture_web(&build_web_root);
    let build_out = unique_dir("i18n-reserved-build");
    let wasm = unique_dir("i18n-reserved-wasm");
    std::fs::write(wasm.join("tiny.wasm"), [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).unwrap();
    
    let path = dir.join("course.json");
    let text = std::fs::read_to_string(&path).unwrap().replace("\"uiLanguage\": \"en\"", "\"uiLanguage\": \"xx\"");
    std::fs::write(&path, text).unwrap();
    
    let build_result = dojo()
        .arg("build")
        .arg(&dir)
        .arg("--out")
        .arg(&build_out)
        .arg("--wasm")
        .arg(wasm.join("tiny.wasm"))
        .arg("--web")
        .arg(&build_web)
        .output()
        .unwrap();
    assert_eq!(code(&build_result), Some(0), "{}", String::from_utf8_lossy(&build_result.stderr));
    assert!(!stdout(&build_result).contains("warning[i18n_unknown_key]"), "build should not warn for reserved keys: {}", stdout(&build_result));
    
    let html = std::fs::read_to_string(build_out.join("demo/index.html")).unwrap();
    assert!(html.contains(r#""plugin.x.y":"val""#), "built bundle should contain plugin.x.y");
    assert!(html.contains(r#""course.a":"val""#), "built bundle should contain course.a");
}

#[test]
fn i18n_unknown_key_foo_bar_still_warns() {
    let (dir, web) = i18n_setup("i18n-foo-bar", r#"{"foo.bar":"val","hi":"Salut {name}","bye":"Ciao","lang":"Langue {lang}"}"#);
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(0));
    assert!(stdout(&out).contains("warning[i18n_unknown_key] i18n/xx.json: "), "{}", stdout(&out));
}

#[cfg(unix)]
#[test]
fn i18n_symlinked_file_is_rejected_by_validate_like_build() {
    let (dir, web) = i18n_setup("i18n-symlink", r#"{"hi":"x"}"#);
    std::fs::remove_file(dir.join("i18n/xx.json")).unwrap();
    std::fs::write(web.join("i18n/real.json"), EN).unwrap();
    std::os::unix::fs::symlink(web.join("i18n/real.json"), dir.join("i18n/xx.json")).unwrap();
    let out = validate_i18n(&dir, &web, &[]);
    assert_eq!(code(&out), Some(1));
    let text = stdout(&out);
    assert!(text.contains("i18n_bad_file") && text.contains("i18n/xx.json: symlinks are not allowed"), "{text}");
}
