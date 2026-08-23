#!/usr/bin/env bash
set -euo pipefail

REPO="avila199817/onionsupport"
BRANCH="fix/incidencias-detail-final-polish"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch_file() {
  local path="$1"
  local out="$2"
  gh api "repos/$REPO/contents/$path?ref=$BRANCH" \
    --jq '.content' | tr -d '\n' | base64 -d > "$out"
}

put_file() {
  local path="$1"
  local file="$2"
  local message="$3"
  local sha
  sha="$(gh api "repos/$REPO/contents/$path?ref=$BRANCH" --jq '.sha')"
  gh api --method PUT "repos/$REPO/contents/$path" \
    -f message="$message" \
    -f branch="$BRANCH" \
    -f sha="$sha" \
    -f content="$(base64 -w0 "$file")" \
    --jq '.commit.sha'
}

TEMPLATE="$TMP/modal.js"
FEATURE="$TMP/detail-state.js"
CSS="$TMP/detail.css"

fetch_file "src/views/incidencias/incidencias.template.modal.js" "$TEMPLATE"
fetch_file "src/features/incidencias-detail-state/index.js" "$FEATURE"
fetch_file "src/css/views/incidencias/detail.css" "$CSS"

python3 - "$TEMPLATE" "$FEATURE" "$CSS" <<'PY'
from pathlib import Path
import sys

TEMPLATE = Path(sys.argv[1])
FEATURE = Path(sys.argv[2])
CSS = Path(sys.argv[3])

def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"ERROR {label}: esperaba 1 coincidencia y hay {n}")
    return text.replace(old, new, 1)

# TEMPLATE ---------------------------------------------------
t = TEMPLATE.read_text(encoding="utf-8")
t = once(
    t,
    '"incidencias.template.modal.extreme.v34.stable-confirmations"',
    '"incidencias.template.modal.extreme.v35.final-polish"',
    "template version",
)
t = once(
    t,
    'aria-label="Cerrar ticket"',
    'aria-label="Cerrar incidencia"',
    "close aria",
)
t = once(
    t,
    'title="Cerrar esta incidencia manualmente"',
    'title="Cerrar esta incidencia"',
    "close title",
)
t = once(
    t,
    '>\n                Cerrar ticket\n              </span>',
    '>\n                Cerrar incidencia\n              </span>',
    "close label",
)
TEMPLATE.write_text(t, encoding="utf-8")

# FEATURE ----------------------------------------------------
f = FEATURE.read_text(encoding="utf-8")
f = once(
    f,
    '"incidencias-detail-state.v2.interaction-stable"',
    '"incidencias-detail-state.v3.final-polish"',
    "feature version",
)
f = once(
    f,
    'const TECH_EYE = "[data-technician-profile-eye=\'true\']";\nconst POLL_MS = 30000;',
    'const TECH_EYE = "[data-technician-profile-eye=\'true\']";\nconst TECH_AVATAR_FRAME = "[data-modal-technician-avatar-frame=\'true\']";\nconst TECH_AVATAR_IMG = "[data-modal-technician-avatar-img=\'true\']";\nconst POLL_MS = 30000;',
    "avatar selectors",
)
f = once(
    f,
    '        "incidencias-modal-chip--status-pending",\n        "ui-detail-modal-chip--status-pending",',
    '        "incidencias-modal-chip--status-pending",\n        "ui-detail-modal-chip--status-pending",\n        "incidencias-modal-review-chip",',
    "review chip class",
)
anchor = '''function syncTechnicianEye(root) {
  const card = root?.querySelector?.(TECH_CARD);'''
# Insert helpers immediately before syncTechnicianEye so ownership stays in this feature.
helpers = '''function fallbackTechnicianAvatar(image) {
  const frame = image?.closest?.(TECH_AVATAR_FRAME) || null;
  if (!frame) return false;

  ownMutation(() => {
    frame.dataset.hasAvatar = "false";
    frame.dataset.fallback = "true";
    frame.classList.add("incidencias-modal-technician-avatar--fallback");
    image.remove();
  });

  return true;
}

function repairTechnicianAvatar(root) {
  if (!root) return false;

  let repaired = false;

  for (const image of Array.from(root.querySelectorAll?.(TECH_AVATAR_IMG) || [])) {
    if (image.complete && Number(image.naturalWidth || 0) === 0) {
      repaired = fallbackTechnicianAvatar(image) || repaired;
    }
  }

  return repaired;
}

function handleTechnicianAvatarError(event) {
  const image = event?.target;
  if (!image?.matches?.(TECH_AVATAR_IMG)) return;
  fallbackTechnicianAvatar(image);
}

function syncTechnicianEye(root) {
  const card = root?.querySelector?.(TECH_CARD);'''
f = once(f, anchor, helpers, "avatar helpers")
f = once(
    f,
    '  syncTicketId(root);\n  syncTechnicianEye(root);\n\n  return true;',
    '  syncTicketId(root);\n  syncTechnicianEye(root);\n  repairTechnicianAvatar(root);\n\n  return true;',
    "project avatar repair",
)
f = once(
    f,
    '  syncTicketId(root);\n  syncTechnicianEye(root);\n\n  if (activeRoot !== root || activeTicketId !== id) {',
    '  syncTicketId(root);\n  syncTechnicianEye(root);\n  repairTechnicianAvatar(root);\n\n  if (activeRoot !== root || activeTicketId !== id) {',
    "sync avatar repair",
)
f = once(
    f,
    '  mounted = true;\n\n  if (typeof MutationObserver !== "undefined") {',
    '  mounted = true;\n\n  mountRoot.addEventListener("error", handleTechnicianAvatarError, true);\n\n  if (typeof MutationObserver !== "undefined") {',
    "avatar error mount",
)
f = once(
    f,
    '  viewObserver?.disconnect?.();\n  modalObserver?.disconnect?.();\n\n  if (frame && browser()) {',
    '  viewObserver?.disconnect?.();\n  modalObserver?.disconnect?.();\n  mountRoot?.removeEventListener?.("error", handleTechnicianAvatarError, true);\n\n  if (frame && browser()) {',
    "avatar error cleanup",
)
f = once(
    f,
    '    pendingIndicator: "warning_clock_chip",\n    closedTicketCanReceiveFutureUpdate: true,',
    '    pendingIndicator: "warning_clock_chip",\n    technicianAvatarFallback: "initials_on_image_error",\n    closedTicketCanReceiveFutureUpdate: true,',
    "snapshot fallback contract",
)
FEATURE.write_text(f, encoding="utf-8")

# CSS --------------------------------------------------------
c = CSS.read_text(encoding="utf-8")
anchor_css = '''.incidencias-modal-history-jump-count {
min-inline-size: 20px;'''
warning_css = '''.incidencias-modal-review-chip[data-ticket-review-state="pending"] {
border-color: color-mix(in srgb, var(--warning) 62%, var(--border-default));
  background: color-mix(in srgb, var(--warning) 18%, var(--surface-2));
  color: var(--warning-strong, var(--warning));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--warning) 12%, transparent);
}

.incidencias-modal-review-chip[data-ticket-review-state="pending"] > span:first-child {
color: var(--warning);
  font-weight: var(--weight-black);
}

.incidencias-modal-history-jump-count {
min-inline-size: 20px;'''
c = once(c, anchor_css, warning_css, "review warning css")
CSS.write_text(c, encoding="utf-8")

print("FINAL_POLISH_PATCH_OK")
PY

node --check "$TEMPLATE"
node --check "$FEATURE"

# Static contract checks before any write.
grep -Fq 'Cerrar incidencia' "$TEMPLATE"
! grep -Fq 'aria-label="Cerrar ticket"' "$TEMPLATE"
grep -Fq 'incidencias-detail-state.v3.final-polish' "$FEATURE"
grep -Fq 'initials_on_image_error' "$FEATURE"
grep -Fq 'incidencias-modal-review-chip' "$CSS"

printf '\n==> Subiendo template\n'
put_file "src/views/incidencias/incidencias.template.modal.js" "$TEMPLATE" \
  "Incidencias: use final Spanish close label"

printf '\n==> Subiendo detail-state\n'
put_file "src/features/incidencias-detail-state/index.js" "$FEATURE" \
  "Incidencias: harden technician avatar fallback"

printf '\n==> Subiendo CSS warning\n'
put_file "src/css/views/incidencias/detail.css" "$CSS" \
  "Incidencias: emphasize pending review state"

printf '\nFINAL_POLISH_REMOTE_OK\n'
