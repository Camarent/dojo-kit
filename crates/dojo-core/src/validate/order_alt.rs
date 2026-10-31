//! `order_alt_invalid`: every `altOrders` entry must be a non-identity permutation of the step indices, with no repeats.

use super::Sink;
use crate::content::Item;

/// Error for each `altOrders` entry that is not a permutation of `0..steps.len()`, equals the identity, or repeats an earlier entry.
pub(super) fn check_order_alt(item: &Item, sink: &mut Sink, file: &str, line: usize) {
    let Item::Order(o) = item else { return };
    let Some(alts) = &o.alt_orders else { return };
    let n = o.steps.len();
    for (k, alt) in alts.iter().enumerate() {
        let mut seen = vec![false; n];
        let is_perm = alt.len() == n
            && alt.iter().all(|&i| {
                let fresh = i < n && !seen[i];
                if fresh {
                    seen[i] = true;
                }
                fresh
            });
        let reason = if !is_perm {
            "is not a permutation of the step indices"
        } else if alt.iter().enumerate().all(|(p, &i)| p == i) {
            "equals the identity order"
        } else if alts[..k].contains(alt) {
            "repeats an earlier entry"
        } else {
            continue;
        };
        sink.error("order_alt_invalid", file, line, format!("item '{}' altOrders entry {} {}", o.id, k + 1, reason));
    }
}
