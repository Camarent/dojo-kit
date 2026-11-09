use crate::content::Item;
use crate::diagnostic::{Diagnostic, Severity};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// Contents of `ids.lock`: every id ever shipped and the ids that were retired. Both lists are sorted and unique.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdLock {
    pub v: u32,
    pub ids: Vec<String>,
    pub retired: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub types: BTreeMap<String, String>,
}

fn sorted_unique<I: IntoIterator<Item = String>>(it: I) -> Vec<String> {
    it.into_iter().collect::<BTreeSet<String>>().into_iter().collect()
}

/// Parses `ids.lock` text; requires `"v": 1` and normalizes both lists to sorted unique order.
pub fn parse_lock(text: &str) -> Result<IdLock, String> {
    let lock: IdLock = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if lock.v != 1 {
        return Err(format!("unsupported ids.lock version {}", lock.v));
    }
    Ok(IdLock { v: 1, ids: sorted_unique(lock.ids), retired: sorted_unique(lock.retired), types: lock.types })
}

impl IdLock {
    /// Pretty-printed JSON with a trailing newline.
    pub fn to_text(&self) -> String {
        let mut s = serde_json::to_string_pretty(self).unwrap_or_default();
        s.push('\n');
        s
    }
}

/// Warning `ids_lock_not_canonical` when `text` parses as a lock but is not the byte-exact form `dojo lock` writes.
/// Returns `None` for canonical text and for text that does not parse (that case is the bad-lock error).
pub fn canonical_diagnostic(text: &str) -> Option<Diagnostic> {
    let lock = parse_lock(text).ok()?;
    if lock.to_text() == text {
        return None;
    }
    Some(Diagnostic {
        severity: Severity::Warning,
        code: "ids_lock_not_canonical",
        file: "ids.lock".to_string(),
        line: 0,
        message: "ids.lock is not in canonical form (sorted, unique, trailing newline); run 'dojo lock <course-dir>' to rewrite it".to_string(),
    })
}

/// Next lock state: old ids plus current ids; retired is old retired plus ids of retired items. Ids are never dropped.
/// Also records the type of every current item and keeps old type entries.
pub fn update(lock: Option<&IdLock>, items: &[Item]) -> IdLock {
    let mut ids: Vec<String> = lock.map(|l| l.ids.clone()).unwrap_or_default();
    let mut retired: Vec<String> = lock.map(|l| l.retired.clone()).unwrap_or_default();
    let mut types: BTreeMap<String, String> = lock.map(|l| l.types.clone()).unwrap_or_default();
    for item in items {
        ids.push(item.id().to_string());
        if item.is_retired() {
            retired.push(item.id().to_string());
        }
        types.insert(item.id().to_string(), item.item_type().as_str().to_string());
    }
    ids.extend(retired.iter().cloned());
    IdLock { v: 1, ids: sorted_unique(ids), retired: sorted_unique(retired), types }
}
