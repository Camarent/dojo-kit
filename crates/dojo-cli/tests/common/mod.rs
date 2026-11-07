//! Helpers shared by the dojo-cli integration tests.

use std::fs;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Empty directory under the system temp dir, removed when dropped (also on panic).
pub struct TempDir(PathBuf);

impl TempDir {
    /// Creates `<temp>/<prefix>-<pid>-<n>`, empty, with a process-wide unique `n`.
    pub fn new(prefix: &str) -> std::io::Result<TempDir> {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("{prefix}-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir)?;
        Ok(TempDir(dir))
    }
}

impl Deref for TempDir {
    type Target = Path;

    fn deref(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
