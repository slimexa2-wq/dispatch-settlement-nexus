#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="$ROOT_DIR/xiangneng-hrms-source.tar.gz"
SOURCE_DIR="$ROOT_DIR/source"
EXPECTED_SHA="0c375e52d853fbdaf489c1837e650a2ac4d16896b40283bd9fb910e73c512405"

cat "$ROOT_DIR"/source-archive/part-*.b64 | base64 --decode > "$ARCHIVE"
echo "$EXPECTED_SHA  $ARCHIVE" | sha256sum --check --status
rm -rf "$SOURCE_DIR"
mkdir -p "$SOURCE_DIR"
tar -xzf "$ARCHIVE" -C "$SOURCE_DIR"
echo "Source reconstructed in $SOURCE_DIR"
