//! Module manifests (`modules/<id>/module.json`) and their resolution into an effective, ordered set.

use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fs;
use std::path::{Component, Path};

const MANIFEST_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Hook {
    Markup,
    Validator,
    Ui,
    Build,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct Web {
    #[serde(default)]
    pub(crate) scripts: Vec<String>,
    #[serde(default)]
    pub(crate) styles: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct Manifest {
    pub(crate) manifest_version: u32,
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) description: String,
    #[serde(default)]
    pub(crate) hooks: Vec<Hook>,
    pub(crate) web: Option<Web>,
    #[serde(default)]
    pub(crate) course_keys: Vec<String>,
    #[serde(default)]
    pub(crate) markups: Vec<String>,
    #[serde(default)]
    pub(crate) requires: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pack {
    #[serde(default)]
    modules: Vec<String>,
}

/// Effective module set for a course and UI language, dependencies first, then id ascending.
/// `web_dir` is the `web/` directory; modules live in its sibling `modules/`.
pub(crate) fn resolve(web_dir: &Path, lang: &str, course_modules: &[String]) -> Result<Vec<Manifest>, String> {
    let root = web_dir
        .parent()
        .ok_or_else(|| format!("cannot find the modules directory next to {}", web_dir.display()))?;
    let modules_dir = root.join("modules");

    let mut queue: VecDeque<(String, String)> = VecDeque::new();
    queue.extend(course_modules.iter().map(|id| (id.clone(), "listed in course.json modules".to_string())));
    let pack = pack_modules(web_dir, lang)?;
    queue.extend(pack.into_iter().map(|id| (id, format!("requested by language pack \"{lang}\""))));

    let mut loaded: BTreeMap<String, Manifest> = BTreeMap::new();
    while let Some((id, origin)) = queue.pop_front() {
        if loaded.contains_key(&id) {
            continue;
        }
        let manifest = load(&modules_dir, &id, &origin)?;
        queue.extend(manifest.requires.iter().map(|r| (r.clone(), format!("required by module \"{id}\""))));
        loaded.insert(id, manifest);
    }

    let order = dependency_order(&loaded)?;
    let mut out = Vec::with_capacity(order.len());
    for id in order {
        if let Some(manifest) = loaded.remove(&id) {
            out.push(manifest);
        }
    }
    Ok(out)
}

/// Topological order; among modules whose requirements are all placed, the smallest id goes first.
fn dependency_order(loaded: &BTreeMap<String, Manifest>) -> Result<Vec<String>, String> {
    let mut done: BTreeSet<&str> = BTreeSet::new();
    let mut order = Vec::with_capacity(loaded.len());
    loop {
        let next = loaded
            .iter()
            .find(|(id, m)| !done.contains(id.as_str()) && m.requires.iter().all(|r| done.contains(r.as_str())))
            .map(|(id, _)| id.as_str());
        let Some(id) = next else { break };
        done.insert(id);
        order.push(id.to_string());
    }
    if order.len() != loaded.len() {
        let rest: Vec<&str> = loaded.keys().map(String::as_str).filter(|id| !done.contains(id)).collect();
        return Err(format!("module dependency cycle among: {}", rest.join(", ")));
    }
    Ok(order)
}

fn pack_modules(web_dir: &Path, lang: &str) -> Result<Vec<String>, String> {
    let path = web_dir.join("i18n").join("packs.json");
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let packs: BTreeMap<String, Pack> =
        serde_json::from_str(&text).map_err(|e| format!("invalid {}: {e}", path.display()))?;
    Ok(packs.get(lang).map_or_else(Vec::new, |p| p.modules.clone()))
}

fn load(modules_dir: &Path, id: &str, origin: &str) -> Result<Manifest, String> {
    if !valid_id(id) {
        return Err(format!("invalid module id \"{id}\" ({origin})"));
    }
    let path = modules_dir.join(id).join("module.json");
    if !path.is_file() {
        return Err(format!("module \"{id}\" not found ({origin}): no modules/{id}/module.json"));
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let manifest: Manifest =
        serde_json::from_str(&text).map_err(|e| format!("invalid {}: {e}", path.display()))?;
    if manifest.manifest_version != MANIFEST_VERSION {
        return Err(format!("{}: manifestVersion must be {MANIFEST_VERSION}", path.display()));
    }
    if manifest.id.as_str() != id {
        return Err(format!("{}: id \"{}\" must equal the folder name \"{id}\"", path.display(), manifest.id));
    }
    if let Some(web) = &manifest.web
        && let Some(bad) = web.scripts.iter().chain(&web.styles).find(|p| !safe_rel(p))
    {
        return Err(format!("{}: web path \"{bad}\" must be relative inside the module", path.display()));
    }
    Ok(manifest)
}

fn valid_id(id: &str) -> bool {
    let mut chars = id.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

fn safe_rel(path: &str) -> bool {
    !path.is_empty() && Path::new(path).components().all(|c| matches!(c, Component::Normal(_)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Temp tree `<root>/web` + `<root>/modules`, removed on drop.
    struct Scratch(std::path::PathBuf);

    impl Scratch {
        fn new() -> Self {
            static N: AtomicUsize = AtomicUsize::new(0);
            let n = N.fetch_add(1, Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!("dojo-modules-{}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(dir.join("web")).unwrap();
            Scratch(dir)
        }
        fn web(&self) -> std::path::PathBuf {
            self.0.join("web")
        }
        fn module(&self, id: &str, json: &serde_json::Value) {
            let dir = self.0.join("modules").join(id);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("module.json"), json.to_string()).unwrap();
        }
        fn packs(&self, json: &serde_json::Value) {
            fs::create_dir_all(self.web().join("i18n")).unwrap();
            fs::write(self.web().join("i18n").join("packs.json"), json.to_string()).unwrap();
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn manifest(id: &str, requires: &[&str]) -> serde_json::Value {
        serde_json::json!({"manifestVersion": 1, "id": id, "hooks": ["validator"], "requires": requires})
    }

    fn ids(list: &[Manifest]) -> Vec<&str> {
        list.iter().map(|m| m.id.as_str()).collect()
    }

    fn course(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn order_puts_dependencies_first_then_id_ascending() {
        let s = Scratch::new();
        s.module("a", &manifest("a", &["z"]));
        s.module("b", &manifest("b", &[]));
        s.module("z", &manifest("z", &[]));
        let got = resolve(&s.web(), "en", &course(&["a", "b"])).unwrap();
        assert_eq!(ids(&got), ["b", "z", "a"]);
        let only_a = resolve(&s.web(), "en", &course(&["a"])).unwrap();
        assert_eq!(ids(&only_a), ["z", "a"]);
    }

    #[test]
    fn duplicates_across_course_and_pack_appear_once() {
        let s = Scratch::new();
        s.module("b", &manifest("b", &[]));
        s.module("z", &manifest("z", &[]));
        s.packs(&serde_json::json!({"ru": {"modules": ["b", "z"]}}));
        let got = resolve(&s.web(), "ru", &course(&["b", "b"])).unwrap();
        assert_eq!(ids(&got), ["b", "z"]);
        let other_lang = resolve(&s.web(), "en", &course(&[])).unwrap();
        assert!(other_lang.is_empty());
    }

    #[test]
    fn cycle_is_an_error() {
        let s = Scratch::new();
        s.module("x", &manifest("x", &["y"]));
        s.module("y", &manifest("y", &["x"]));
        let err = resolve(&s.web(), "en", &course(&["x"])).unwrap_err();
        assert!(err.contains("module dependency cycle"), "{err}");
    }

    #[test]
    fn missing_listed_module_is_an_error() {
        let s = Scratch::new();
        let err = resolve(&s.web(), "en", &course(&["nope"])).unwrap_err();
        assert_eq!(err, r#"module "nope" not found (listed in course.json modules): no modules/nope/module.json"#);
    }

    #[test]
    fn missing_pack_module_is_an_error() {
        let s = Scratch::new();
        s.packs(&serde_json::json!({"ru": {"modules": ["ghost"]}}));
        let err = resolve(&s.web(), "ru", &course(&[])).unwrap_err();
        assert_eq!(err, r#"module "ghost" not found (requested by language pack "ru"): no modules/ghost/module.json"#);
    }

    #[test]
    fn missing_required_module_is_an_error() {
        let s = Scratch::new();
        s.module("a", &manifest("a", &["ghost"]));
        let err = resolve(&s.web(), "en", &course(&["a"])).unwrap_err();
        assert_eq!(err, r#"module "ghost" not found (required by module "a"): no modules/ghost/module.json"#);
    }

    #[test]
    fn unknown_hook_and_unknown_field_are_rejected() {
        let s = Scratch::new();
        s.module("a", &serde_json::json!({"manifestVersion": 1, "id": "a", "hooks": ["bogus"]}));
        assert!(resolve(&s.web(), "en", &course(&["a"])).unwrap_err().starts_with("invalid "));
        s.module("a", &serde_json::json!({"manifestVersion": 1, "id": "a", "extra": true}));
        assert!(resolve(&s.web(), "en", &course(&["a"])).unwrap_err().starts_with("invalid "));
    }

    #[test]
    fn ru_manifest_is_validator_only() {
        let m: Manifest = serde_json::from_str(include_str!("../../../modules/ru/module.json")).unwrap();
        assert_eq!(m.id, "ru");
        assert_eq!(m.hooks, [Hook::Validator]);
        assert!(m.web.is_none());
    }
}
