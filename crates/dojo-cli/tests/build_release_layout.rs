mod common;

use common::TempDir;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::Command;

type Res<T = ()> = Result<T, Box<dyn Error>>;

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn copy_dir(from: &Path, to: &Path) -> Res {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn put(path: &Path, text: &str) -> Res {
    std::fs::create_dir_all(path.parent().ok_or("no parent dir")?)?;
    std::fs::write(path, text)?;
    Ok(())
}

// A web/ dir; `title` is text placed before the course title in the index template.
fn web_dir(web: &Path, title: &str) -> Res {
    put(
        &web.join("bundle.json"),
        r#"{"scripts":["a.js"],"styles":["s.css"],"i18n":["en"],"licenses":["L.txt"]}"#,
    )?;
    put(&web.join("a.js"), "var a=1;")?;
    put(&web.join("s.css"), "body{margin:0}")?;
    put(&web.join("L.txt"), "MIT -- license")?;
    put(&web.join("i18n/en.json"), r#"{"hi":"Hello"}"#)?;
    put(
        &web.join("index.template.html"),
        &format!("<title>{title}<!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n"),
    )?;
    Ok(())
}

// Release layout beside the binary: dojo, dojo.wasm and web/ in one directory.
fn release_layout(release: &Path) -> Res {
    web_dir(&release.join("web"), "")?;
    std::fs::write(release.join("dojo.wasm"), [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0])?;
    std::fs::copy(env!("CARGO_BIN_EXE_dojo"), release.join("dojo"))?;
    Ok(())
}

#[test]
fn build_uses_web_and_wasm_beside_binary_without_flags() -> Res {
    let guard = TempDir::new("dojo-build-release-layout")?;
    let root = guard.to_path_buf();
    let release = root.join("release");
    release_layout(&release)?;
    // Decoy repo build beside the release web/ (the target/ path resolved from web's parent): dojo.wasm must win over it.
    put(
        &release.join("target/wasm32-unknown-unknown/release/dojo_wasm.wasm"),
        "stale repo build",
    )?;
    // Decoy repo tree with its own web/ and target/ build; the run must ignore both.
    let repo = root.join("repo");
    web_dir(&repo.join("web"), "DECOY ")?;
    put(
        &repo.join("target/wasm32-unknown-unknown/release/dojo_wasm.wasm"),
        "decoy wasm",
    )?;
    let course = root.join("course");
    copy_dir(&demo(), &course)?;
    let _ = std::fs::remove_file(course.join("ids.lock"));
    // Cwd inside the decoy repo: its web/ is found by walking up, so only the beside-binary layout
    // (checked first) can supply the html title and the wasm bytes.
    let cwd = repo.join("sub");
    std::fs::create_dir_all(&cwd)?;
    let out = root.join("dist");
    let o = Command::new(release.join("dojo"))
        .current_dir(&cwd)
        .arg("build")
        .arg(&course)
        .arg("--out")
        .arg(&out)
        .output()?;
    assert_eq!(o.status.code(), Some(0), "{}", String::from_utf8_lossy(&o.stderr));
    let html = std::fs::read_to_string(out.join("demo/index.html"))?;
    assert!(html.starts_with("<title>Demo course</title>"), "{html}");
    // base64 of the release dojo.wasm bytes: 00 61 73 6d 01 00 00 00
    assert!(html.contains(r#"window.__DOJO_WASM__="AGFzbQEAAAA=";"#), "{html}");
    Ok(())
}

// validate and lock must find the release web/ beside the binary, not only the repo web/ above cwd.
#[test]
fn validate_and_lock_use_web_beside_binary_from_decoy_cwd() -> Res {
    let guard = TempDir::new("dojo-validate-release-layout")?;
    let root = guard.to_path_buf();
    let release = root.join("release");
    release_layout(&release)?;
    let course = root.join("course");
    copy_dir(&demo(), &course)?;
    // The release web/ reference has "hi" without a placeholder, so this course key is an error only with web.
    put(&course.join("i18n/en.json"), r#"{"hi":"Hello {name}"}"#)?;
    // Cwd with no web/ in it or any parent under root: only the beside-binary web/ can supply the reference.
    let cwd = root.join("elsewhere");
    std::fs::create_dir_all(&cwd)?;
    let v = Command::new(release.join("dojo")).current_dir(&cwd).arg("validate").arg(&course).output()?;
    let v_out = String::from_utf8_lossy(&v.stdout).to_string();
    assert_eq!(v.status.code(), Some(1), "{v_out}{}", String::from_utf8_lossy(&v.stderr));
    assert!(v_out.contains("i18n_placeholder"), "{v_out}");
    let l = Command::new(release.join("dojo")).current_dir(&cwd).arg("lock").arg(&course).output()?;
    assert_eq!(l.status.code(), Some(1), "{}{}", String::from_utf8_lossy(&l.stdout), String::from_utf8_lossy(&l.stderr));
    Ok(())
}
