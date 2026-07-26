#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GZIP_PATCH="$ROOT_DIR/0001-internal-hr-reimbursement-foundation.patch.gz"
PATCH_FILE="$ROOT_DIR/0001-internal-hr-reimbursement-foundation.patch"
EXPECTED_GZIP_SHA="6d39c88d8f1ee7b1354b700c60c605c3a1c76cb60dbfc936c3548c63df8aa989"
EXPECTED_PATCH_SHA="b9f6760b63bf43faa79190c81a0ff910cfc656c9390a2bdc3f98525818f90cb4"

cat "$ROOT_DIR"/patch-archive/part-*.b64 | base64 --decode > "$GZIP_PATCH"
echo "$EXPECTED_GZIP_SHA  $GZIP_PATCH" | sha256sum --check
gzip -dc "$GZIP_PATCH" > "$PATCH_FILE"
echo "$EXPECTED_PATCH_SHA  $PATCH_FILE" | sha256sum --check

echo "Patch reconstructed: $PATCH_FILE"
