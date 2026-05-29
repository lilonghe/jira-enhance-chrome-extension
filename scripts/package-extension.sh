#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_PATH="${1:-$ROOT_DIR/dist/jira-enhance.zip}"

if [[ "$OUTPUT_PATH" != /* ]]; then
  OUTPUT_PATH="$ROOT_DIR/$OUTPUT_PATH"
fi

OUTPUT_DIR="$(dirname "$OUTPUT_PATH")"

# Keep the zip contents limited to extension runtime files so the archive can
# be uploaded directly without dragging along docs or repository metadata.
PACKAGE_ITEMS=(
  "manifest.json"
  "icons"
  "src"
)

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_PATH"

# Use the Python standard library here because it's stable on both macOS and
# GitHub Actions runners, and it avoids platform-specific quirks from `zip`.
python3 - "$ROOT_DIR" "$OUTPUT_PATH" "${PACKAGE_ITEMS[@]}" <<'PY'
from pathlib import Path
import sys
import zipfile

root_dir = Path(sys.argv[1]).resolve()
output_path = Path(sys.argv[2]).resolve()
package_items = [root_dir / item for item in sys.argv[3:]]

with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for item in package_items:
        if item.is_file():
            archive.write(item, item.relative_to(root_dir))
            continue

        for child in sorted(item.rglob("*")):
            if child.is_file():
                archive.write(child, child.relative_to(root_dir))
PY

echo "Created package: $OUTPUT_PATH"
