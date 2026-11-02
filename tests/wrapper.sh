#!/usr/bin/env bash
set -euo pipefail

# This test exercises the ./dojo wrapper script.
# It runs from a temporary directory to test the wrapper's repo-root resolution.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Create a temporary workspace directory
TMP_DIR="$(mktemp -d)"
trap "rm -rf $TMP_DIR" EXIT

WORKSPACE="$TMP_DIR/workspace"
mkdir -p "$WORKSPACE"

# Run all commands from the temp directory to test path resolution
cd "$TMP_DIR"

echo "=== Testing ./dojo wrapper script ==="

# Test init
echo "Testing init..."
"$REPO_ROOT/dojo" init test-course --workspace "$WORKSPACE"

# Verify files were created
if [ ! -f "$WORKSPACE/test-course/course.json" ]; then
    echo "ERROR: course.json not created" >&2
    exit 1
fi
if [ ! -f "$WORKSPACE/test-course/content/unit-1.jsonl" ]; then
    echo "ERROR: content/unit-1.jsonl not created" >&2
    exit 1
fi
if [ ! -f "$WORKSPACE/test-course/MAP.md" ]; then
    echo "ERROR: MAP.md not created" >&2
    exit 1
fi

# Test validate
echo "Testing validate..."
"$REPO_ROOT/dojo" validate "$WORKSPACE/test-course"

# Relative course path resolves against the caller's directory
echo "Testing validate with a relative path..."
(cd "$WORKSPACE/test-course" && "$REPO_ROOT/dojo" validate .)
(cd "$WORKSPACE" && "$REPO_ROOT/dojo" validate test-course)

# Test stats
echo "Testing stats..."
"$REPO_ROOT/dojo" stats "$WORKSPACE/test-course"

# Relative course paths resolve against the caller's directory, not the repo root
echo "Testing stats and build with relative paths..."
(cd "$REPO_ROOT" && "$REPO_ROOT/dojo" stats examples/listening >/dev/null)
(cd "$REPO_ROOT/examples" && "$REPO_ROOT/dojo" stats listening >/dev/null)

# Test next-id
echo "Testing next-id..."
"$REPO_ROOT/dojo" next-id "$WORKSPACE/test-course" test

# Test build through the wrapper (it must supply --wasm itself)
echo "Testing build..."
printf '%s\n' '{"type":"card","id":"unit-1","unit":"unit-1","prompt":"Q","back":"A"}' > "$WORKSPACE/test-course/content/unit-1.jsonl"
"$REPO_ROOT/dojo" build "$WORKSPACE/test-course" --out "$TMP_DIR/dist"
if [ ! -f "$TMP_DIR/dist/test-course/index.html" ] || [ ! -f "$TMP_DIR/dist/test-course/data/content.json" ]; then
    echo "ERROR: build output missing" >&2
    exit 1
fi

# Relative build paths resolve against the caller's directory
echo "Testing build with relative paths..."
(cd "$REPO_ROOT" && "$REPO_ROOT/dojo" build examples/listening --out "$TMP_DIR/dist-root" >/dev/null)
(cd "$REPO_ROOT/examples" && "$REPO_ROOT/dojo" build listening --out "$TMP_DIR/dist-examples" >/dev/null)
for d in dist-root dist-examples; do
    if [ ! -f "$TMP_DIR/$d/listening/index.html" ]; then
        echo "ERROR: relative build output missing in $d" >&2
        exit 1
    fi
done

# --web=PATH counts as an explicit web directory: the wrapper must not append a second --web.
# A stub binary (fresh, so not rebuilt) echoes its argv.
echo "Testing --web=PATH detection..."
stub_dir="$TMP_DIR/stub-target/release"
mkdir -p "$stub_dir"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$@"\n' > "$stub_dir/dojo"
chmod +x "$stub_dir/dojo"
args=$(CARGO_TARGET_DIR="$TMP_DIR/stub-target" "$REPO_ROOT/dojo" validate "$WORKSPACE/test-course" --web="$REPO_ROOT/web")
if [ "$args" != "$(printf '%s\n' validate "$WORKSPACE/test-course" --web="$REPO_ROOT/web")" ]; then
    echo "ERROR: wrapper altered args for --web=PATH: $args" >&2
    exit 1
fi

# Test that a changed source file triggers a rebuild of the CLI binary
echo "Testing stale rebuild..."
before=$(stat -c %Y "$REPO_ROOT/target/release/dojo")
sleep 1
touch "$REPO_ROOT/crates/dojo-core/src/lib.rs"
"$REPO_ROOT/dojo" stats "$WORKSPACE/test-course" >/dev/null
after=$(stat -c %Y "$REPO_ROOT/target/release/dojo")
if [ "$after" -le "$before" ]; then
    echo "ERROR: wrapper did not rebuild after a source change" >&2
    exit 1
fi

# Test that init refuses existing directory
echo "Testing init refuses existing directory..."
out=$("$REPO_ROOT/dojo" init test-course --workspace "$WORKSPACE" 2>&1 || true)
if grep -q "already exists" <<<"$out"; then
    echo "OK: init correctly refused existing directory"
else
    echo "ERROR: init did not refuse existing directory" >&2
    exit 1
fi

# Test that init refuses invalid id
echo "Testing init refuses invalid id..."
out=$("$REPO_ROOT/dojo" init "BadID" --workspace "$WORKSPACE" 2>&1 || true)
if grep -q "invalid course id" <<<"$out"; then
    echo "OK: init correctly refused invalid id"
else
    echo "ERROR: init did not refuse invalid id" >&2
    exit 1
fi

echo "=== All wrapper tests passed ==="
