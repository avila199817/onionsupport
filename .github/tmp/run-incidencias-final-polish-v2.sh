#!/usr/bin/env bash
set -euo pipefail

REPO="avila199817/onionsupport"
BRANCH="fix/incidencias-detail-final-polish"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SRC="$TMP/original.sh"
FIXED="$TMP/fixed.sh"

gh api "repos/$REPO/contents/.github/tmp/apply-incidencias-final-polish.sh?ref=$BRANCH" \
  --jq '.content' | tr -d '\n' | base64 -d > "$SRC"

python3 - "$SRC" "$FIXED" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text(encoding="utf-8")
out = Path(sys.argv[2])

old = '''put_file() {
  local path="$1"
  local file="$2"
  local message="$3"
  local sha
  sha="$(gh api "repos/$REPO/contents/$path?ref=$BRANCH" --jq '.sha')"
  gh api --method PUT "repos/$REPO/contents/$path" \\
    -f message="$message" \\
    -f branch="$BRANCH" \\
    -f sha="$sha" \\
    -f content="$(base64 -w0 "$file")" \\
    --jq '.commit.sha'
}'''

new = '''put_file() {
  local path="$1"
  local file="$2"
  local message="$3"
  local sha encoded

  sha="$(gh api "repos/$REPO/contents/$path?ref=$BRANCH" --jq '.sha')"
  encoded="$(mktemp)"
  base64 -w0 "$file" > "$encoded"

  jq -n \\
    --arg message "$message" \\
    --arg branch "$BRANCH" \\
    --arg sha "$sha" \\
    --rawfile content "$encoded" \\
    '{message:$message,branch:$branch,sha:$sha,content:$content}' \\
  | gh api \\
      --method PUT \\
      "repos/$REPO/contents/$path" \\
      --input - \\
      --jq '.commit.sha'

  rm -f "$encoded"
}'''

if src.count(old) != 1:
    raise SystemExit("ERROR: no se encontró exactamente la función put_file original")

out.write_text(src.replace(old, new, 1), encoding="utf-8")
print("UPLOAD_TRANSPORT_FIXED_OK")
PY

bash "$FIXED"
