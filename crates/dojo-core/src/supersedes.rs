use crate::content::Item;
use crate::lock::IdLock;
use crate::validate::{Diagnostic, Severity};

/// `(successor id, ids of the retired items it replaces)`, sorted by successor id.
pub type Links = Vec<(String, Vec<String>)>;

/// Minimal item projection used at runtime.
#[derive(Debug, Clone, Default)]
pub struct LinkItem {
    pub id: String,
    pub retired: bool,
    pub supersedes: Option<Vec<String>>,
}

/// A violated `supersedes` rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkError(pub String);

/// Checks one item list; `retired_extra` are ids known retired outside the list (ids.lock). Returns `(item id, message)` pairs.
fn problems(items: &[LinkItem], retired_extra: &[&str]) -> Vec<(String, String)> {
    let is_live = |p: &str| items.iter().any(|i| !i.retired && i.id == p);
    let is_retired = |p: &str| retired_extra.contains(&p) || items.iter().any(|i| i.retired && i.id == p);
    let mut owner: Vec<(&str, &str)> = Vec::new();
    let mut out = Vec::new();
    for item in items {
        let Some(list) = &item.supersedes else { continue };
        let mut err = |m: &str, p: &str| out.push((item.id.clone(), [m, p].concat()));
        if item.retired {
            err("supersedes is not allowed on a retired item", "");
            continue;
        }
        if list.is_empty() {
            err("supersedes must not be empty", "");
        }
        for (n, p) in list.iter().enumerate() {
            if list[..n].contains(p) {
                err("supersedes lists an id twice: ", p);
            } else if p == &item.id {
                err("supersedes lists the item itself: ", p);
            } else if is_live(p) || !is_retired(p) {
                err("supersedes an id that is not retired: ", p);
            } else if owner.iter().any(|(q, _)| q == p) {
                err("id is superseded by two items: ", p);
            } else {
                owner.push((p, &item.id));
            }
        }
    }
    out
}

/// Runtime link table; fails on the first violated rule. Items without `supersedes` are ignored.
pub fn links_from(items: &[LinkItem]) -> Result<Links, LinkError> {
    if let Some((id, m)) = problems(items, &[]).into_iter().next() {
        return Err(LinkError([id.as_str(), ": ", m.as_str()].concat()));
    }
    let mut links = Links::new();
    for i in items {
        if let Some(l) = &i.supersedes {
            links.push((i.id.clone(), l.clone()));
        }
    }
    links.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(links)
}

/// Validator diagnostics (`bad_supersedes`) for parsed items given as `(file, line, item)`.
pub fn check_supersedes(items: &[(&str, usize, &Item)], lock: Option<&IdLock>) -> Vec<Diagnostic> {
    let extra: Vec<&str> = lock.map(|l| l.retired.iter().map(String::as_str).collect()).unwrap_or_default();
    let list: Vec<LinkItem> = items
        .iter()
        .map(|(_, _, i)| LinkItem { id: i.id().to_string(), retired: i.is_retired(), supersedes: i.supersedes_field().map(<[String]>::to_vec) })
        .collect();
    let mut found = problems(&list, &extra);
    found.sort();
    found
        .into_iter()
        .map(|(id, message)| {
            let (file, line) = items.iter().find(|(_, _, i)| i.id() == id).map_or(("", 0), |(f, l, _)| (*f, *l));
            Diagnostic { severity: Severity::Error, code: "bad_supersedes", file: file.to_string(), line, message }
        })
        .collect()
}
