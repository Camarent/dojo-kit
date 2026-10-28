// Snapshot test for build output determinism.
// Computes sha256 over build artefacts and compares against stored snapshots.

use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

// Pure Rust SHA-256 implementation (no external crates).
const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const H0: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/// SHA-256 hash function - returns hex string
fn sha256(bytes: &[u8]) -> String {
    let mut h = H0;
    let mut message = Vec::from(bytes);

    message.push(0x80);
    while (message.len() % 64) != 56 {
        message.push(0x00);
    }

    let bit_len = (bytes.len() as u64) * 8;
    for i in 0..8 {
        message.push(((bit_len >> (56 - i * 8)) & 0xFF) as u8);
    }

    for chunk in message.chunks(64) {
        let mut w = [0u32; 64];

        for i in 0..16 {
            w[i] = (u32::from(chunk[i * 4]) << 24)
                | (u32::from(chunk[i * 4 + 1]) << 16)
                | (u32::from(chunk[i * 4 + 2]) << 8)
                | u32::from(chunk[i * 4 + 3]);
        }

        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut result = String::with_capacity(64);
    for v in h.iter().take(8) {
        result.push_str(&format!("{:08x}", v));
    }
    result
}

/// Mask script and style element contents in HTML
/// Replaces the contents between <script> and </script> (and <style> and </style>) with "MASKED"
fn mask_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let bytes = html.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        // Check for <script or <style (case-insensitive opening tag)
        if i < bytes.len() && bytes[i] == b'<' {
            let mut j = i + 1;
            // Skip whitespace
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }

            // Check for script
            let is_script = j + 6 <= bytes.len()
                && bytes[j].eq_ignore_ascii_case(&b's')
                && bytes[j + 1].eq_ignore_ascii_case(&b'c')
                && bytes[j + 2].eq_ignore_ascii_case(&b'r')
                && bytes[j + 3].eq_ignore_ascii_case(&b'i')
                && bytes[j + 4].eq_ignore_ascii_case(&b'p')
                && bytes[j + 5].eq_ignore_ascii_case(&b't');

            // Check for style
            let is_style = j + 5 <= bytes.len()
                && bytes[j].eq_ignore_ascii_case(&b's')
                && bytes[j + 1].eq_ignore_ascii_case(&b't')
                && bytes[j + 2].eq_ignore_ascii_case(&b'y')
                && bytes[j + 3].eq_ignore_ascii_case(&b'l')
                && bytes[j + 4].eq_ignore_ascii_case(&b'e');

            if is_script || is_style {
                // Find the '>'
                let mut tag_end = if is_script { j + 6 } else { j + 5 };
                while tag_end < bytes.len() && bytes[tag_end] != b'>' {
                    tag_end += 1;
                }
                if tag_end >= bytes.len() {
                    // No closing '>', just copy and break
                    result.push_str(&html[i..]);
                    return result;
                }
                tag_end += 1; // include the '>'

                // Copy the opening tag
                result.push_str(&html[i..tag_end]);
                i = tag_end;

                // Find the matching closing tag and skip all content in between
                let closing_tag = if is_script { "</script>" } else { "</style>" };
                let closing_len = closing_tag.len();

                while i + closing_len <= bytes.len() {
                    let mut matches = true;
                    for (k, &b) in closing_tag.as_bytes().iter().enumerate() {
                        if !bytes[i + k].eq_ignore_ascii_case(&b) {
                            matches = false;
                            break;
                        }
                    }
                    if matches {
                        // Found the closing tag, add MASKED and the closing tag
                        result.push_str("MASKED");
                        result.push_str(closing_tag);
                        i += closing_len;
                        break;
                    }
                    // Skip this character (don't copy it to result)
                    i += 1;
                }

                if i + closing_len > bytes.len() {
                    // Didn't find closing tag, copy the rest
                    result.push_str(&html[i..]);
                    return result;
                }
            } else {
                let c = html[i..].chars().next().unwrap();
                result.push(c);
                i += c.len_utf8();
            }
        } else {
            let c = html[i..].chars().next().unwrap();
            result.push(c);
            i += c.len_utf8();
        }
    }

    result
}

/// Put a file
fn put(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

/// Fixture web directory with minimal content
fn fixture_web(root: &Path) -> PathBuf {
    let web = root.join("web");
    put(
        &web.join("bundle.json"),
        r#"{"scripts":["a.js","b.js"],"styles":["s.css"],"i18n":["en","ru"],"licenses":["L.txt"]}"#,
    );
    put(&web.join("a.js"), "var a=1;");
    put(&web.join("b.js"), "var s='</script>';");
    put(&web.join("s.css"), "body{margin:0}");
    put(&web.join("L.txt"), "MIT -- license");
    put(&web.join("i18n/en.json"), r#"{"hi":"Hello </b>"}"#);
    put(&web.join("i18n/ru.json"), r#"{"hi":"Privet","bye":"Poka","thanks":"Spasibo"}"#);
    put(
        &web.join("index.template.html"),
        "<title><!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n",
    );
    web
}

/// Create a unique temp directory
fn unique_dir(tag: &str) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "dojo-snapshot-{tag}-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// Get the path to the dojo CLI binary
fn dojo_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_dojo"))
}

/// Recursively collect file paths relative to base
fn collect_files(dir: &Path, base: &Path) -> BTreeSet<String> {
    let mut files = BTreeSet::new();
    if !dir.exists() {
        return files;
    }
    for entry in std::fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_dir() {
            let sub_files = collect_files(&path, base);
            for f in sub_files {
                files.insert(f);
            }
        } else {
            let relative = path.strip_prefix(base).unwrap().to_string_lossy().to_string();
            files.insert(relative);
        }
    }
    files
}

/// Load snapshot file
fn load_snapshots() -> Value {
    let snapshots_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/snapshots/build.json");
    if snapshots_path.exists() {
        let content = fs::read_to_string(&snapshots_path).unwrap();
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    }
}

/// Save snapshot file
fn save_snapshots(snapshots: &Value) {
    let snapshots_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/snapshots/build.json");
    fs::create_dir_all(snapshots_path.parent().unwrap()).unwrap();
    fs::write(&snapshots_path, serde_json::to_string_pretty(snapshots).unwrap().as_bytes()).unwrap();
}

/// Compute the digest for a built example
fn compute_digest(course_dir: &Path) -> String {
    let mut concatenated = Vec::new();

    // Add data/content.json
    let content_path = course_dir.join("data/content.json");
    if content_path.exists() {
        concatenated.extend_from_slice(&fs::read(&content_path).unwrap());
    }

    // Add manifest.json
    let manifest_path = course_dir.join("manifest.json");
    if manifest_path.exists() {
        concatenated.extend_from_slice(&fs::read(&manifest_path).unwrap());
    }

    // Add ids.lock if produced
    let ids_lock_path = course_dir.join("ids.lock");
    if ids_lock_path.exists() {
        concatenated.extend_from_slice(&fs::read(&ids_lock_path).unwrap());
    }

    // Add sorted list of output file names (relative paths)
    let files = collect_files(course_dir, course_dir);
    for name in &files {
        concatenated.extend_from_slice(name.as_bytes());
        concatenated.push(b'\n');
    }

    // Add index.html length after masking
    let index_path = course_dir.join("index.html");
    if index_path.exists() {
        let html = fs::read_to_string(&index_path).unwrap();
        let masked = mask_html(&html);
        let length_bytes = masked.len().to_string();
        concatenated.extend_from_slice(length_bytes.as_bytes());
    }

    sha256(&concatenated)
}

/// Build an example into a temp directory with fixture web and wasm
fn build_with_fixtures(example_path: &Path, out_dir: &Path) -> Result<(), String> {
    let bin = dojo_bin();
    let root = unique_dir("web");
    let web = fixture_web(&root);
    let wasm = root.join("tiny.wasm");
    std::fs::write(&wasm, [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).unwrap();

    let output = std::process::Command::new(&bin)
        .arg("build")
        .arg(example_path)
        .arg("--out")
        .arg(out_dir)
        .arg("--wasm")
        .arg(&wasm)
        .arg("--web")
        .arg(&web)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!("Build failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}

/// Get example directories
fn get_examples() -> Vec<(String, PathBuf)> {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples");
    let mut examples = Vec::new();

    for entry in std::fs::read_dir(&base).unwrap() {
        let path = entry.unwrap().path();
        if path.join("course.json").is_file() {
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            examples.push((name, path));
        }
    }
    examples.sort();
    examples
}

#[test]
fn build_snapshots_are_stable() {
    let bin = dojo_bin();
    assert!(bin.exists(), "dojo binary missing");

    let examples = get_examples();
    assert!(!examples.is_empty(), "no examples found");

    let update = env::var("UPDATE_SNAPSHOT").is_ok();
    let mut snapshots = load_snapshots();
    let snapshots_obj = snapshots.as_object_mut().unwrap();

    for (example_name, example_path) in &examples {
        let out_dir = unique_dir("snapshot");

        // Build the example with fixture web and wasm
        build_with_fixtures(example_path, &out_dir).unwrap();

        // The build command creates output in <out_dir>/<example_name>
        let course_output = out_dir.join(example_name);

        // Compute digest
        let digest = compute_digest(&course_output);

        // Check or update snapshot
        if update {
            snapshots_obj.insert(example_name.clone(), json!(digest));
        } else {
            match snapshots_obj.get(example_name) {
                Some(expected) => {
                    let expected_str = expected.as_str().unwrap();
                    assert_eq!(
                        &digest,
                        expected_str,
                        "Digest mismatch for {}. Run UPDATE_SNAPSHOT=1 to update.",
                        example_name
                    );
                }
                None => {
                    panic!(
                        "No snapshot for {}. Run with UPDATE_SNAPSHOT=1 to create.",
                        example_name
                    );
                }
            }
        }
    }

    if update {
        save_snapshots(&snapshots);
    }
}
