//! Deterministic hashing and shuffling primitives.

/// splitmix64 step: advances `state` and returns the next value.
pub fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

/// FNV-1a 64-bit hash of the UTF-8 bytes of `text`.
pub fn fnv1a(text: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in text.bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Fisher-Yates shuffle driven by splitmix64 over `state`.
pub fn seeded_shuffle<T>(items: &mut [T], state: &mut u64) {
    for i in (1..items.len()).rev() {
        let j = (splitmix64(state) % (i as u64 + 1)) as usize;
        items.swap(i, j);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a_pins() {
        assert_eq!(fnv1a(""), 14695981039346656037);
        assert_eq!(fnv1a("a"), 12638187200555641996);
        assert_eq!(fnv1a("course|2025-10-09|g1"), 12757483913148007183);
    }

    #[test]
    fn shuffle_trivial_lengths_untouched() {
        let mut s = 5u64;
        let mut e: [u8; 0] = [];
        seeded_shuffle(&mut e, &mut s);
        let mut one = [1u8];
        seeded_shuffle(&mut one, &mut s);
        assert_eq!((s, one), (5, [1]));
    }
}
