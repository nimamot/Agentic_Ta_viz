#!/usr/bin/env bash
# Build a portable viewer bundle for pipeline repos / GitHub Releases.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
OUT="$ROOT/dist-viewer"
STAGE="$OUT/viewer"
ZIP="$OUT/viewer-dist.zip"

rm -rf "$OUT"
mkdir -p "$STAGE/dist" "$STAGE/data"

echo "Building local-mode viewer…"
(cd "$ROOT" && npm run build:local)

cp -R "$ROOT/dist/." "$STAGE/dist/"
printf '%s\n' '{"projects":[],"codebook_reviews":[]}' > "$STAGE/data/manifest.json"
echo "$VERSION" > "$STAGE/VIEWER_VERSION.txt"
cat > "$STAGE/README.txt" <<EOF
Graph Builder viewer v${VERSION} (local file mode)

Researchers: run viewer_launcher.py from your pipeline repo with --data-dir
pointing at your synced pipeline outputs.

Pipeline maintainers: pin this version in .viewer-version — do not fork the UI here.
EOF

rm -f "$ZIP"
(cd "$STAGE" && zip -r -q "$ZIP" .)

echo ""
echo "Packaged $ZIP (v$VERSION)"
echo "Attach viewer-dist.zip to a GitHub Release for viewer_launcher.py to download."
