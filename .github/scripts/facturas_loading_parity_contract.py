#!/usr/bin/env python3
"""Keep Facturas loading presentation aligned with Incidencias.

The list may expose an accessible live state and skeleton rows, but it must not
paint a standalone visible loader between the history header and the table.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

FACTURAS_INDEX = (ROOT / "src/views/facturas/index.js").read_text(encoding="utf-8")
FACTURAS_TEMPLATE = (ROOT / "src/views/facturas/facturas.template.js").read_text(encoding="utf-8")
FACTURAS_CSS = (ROOT / "src/css/views/facturas/index.css").read_text(encoding="utf-8")
INCIDENCIAS_TEMPLATE = (ROOT / "src/views/incidencias/incidencias.template.js").read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FACTURAS_LOADING_PARITY_CONTRACT: {message}")


# Incidencias is the behavioral reference: loading lives inside the history
# surface and its status announcement is visually hidden while skeletons paint.
require(
    "incidencias-visually-hidden" in INCIDENCIAS_TEMPLATE
    and "renderTableLoading(DEFAULT_VISIBLE_ROWS)" in INCIDENCIAS_TEMPLATE,
    "Incidencias reference loading contract changed; review parity intentionally",
)

# Facturas must retain a non-blocking route mount. Network work starts after the
# view/controller has committed; no global loader API is allowed in this view.
mount_start = FACTURAS_INDEX.index("    mount() {")
mount_end = FACTURAS_INDEX.index("    destroy() {", mount_start)
mount = FACTURAS_INDEX[mount_start:mount_end]
require("return controller;" in mount, "Facturas mount must commit synchronously")
require("void load({" in mount, "Facturas first page must start in background")
require("silent: true" in mount, "Facturas initial background load must stay silent")
require("await load(" not in mount, "Facturas mount must not await the first-page request")
for forbidden in ("showLoader", "hideLoader", "Loader.show", "ui-loading-overlay"):
    require(forbidden not in FACTURAS_INDEX, f"standalone/global loader API is forbidden: {forbidden}")

# The normal history shell owns initial loading, just like Incidencias.
require(
    "const showInitialLoading = loading && !listState.visibleItems.length;" in FACTURAS_TEMPLATE,
    "Facturas must derive initial loading from list state",
)
require(
    "renderTableLoading(DEFAULT_SKELETON_ROWS)" in FACTURAS_TEMPLATE,
    "Facturas initial loading must stay inside the history skeleton",
)
require(
    'id="facturas-list-status" class="facturas-loading-status" role="status"' in FACTURAS_TEMPLATE,
    "Facturas must preserve an accessible loading announcement",
)

# That announcement is accessibility-only during normal loading: no visible
# loader line/card is allowed. It may reveal itself only when focused as a
# programmatic fallback after an error/retry transition.
status_match = re.search(
    r"\.facturas-loading-status\s*\{(?P<body>.*?)\n\}",
    FACTURAS_CSS,
    re.DOTALL,
)
require(status_match is not None, "Facturas loading status CSS is missing")
status_body = status_match.group("body")
for token in (
    "position: absolute;",
    "inline-size: 1px;",
    "block-size: 1px;",
    "overflow: hidden;",
    "clip-path: inset(50%);",
    "white-space: nowrap;",
):
    require(token in status_body, f"loading status must be visually hidden: {token}")
require("display: block;" not in status_body, "standalone visible loading line must not return")

focus_match = re.search(
    r"\.facturas-loading-status:focus-visible\s*\{(?P<body>.*?)\n\}",
    FACTURAS_CSS,
    re.DOTALL,
)
require(focus_match is not None, "Facturas loading focus fallback is missing")
focus_body = focus_match.group("body")
require("clip-path: none;" in focus_body, "focused loading fallback must become visible")
require("overflow: visible;" in focus_body, "focused loading fallback must be readable")

print(
    "Facturas loading parity OK · non-blocking mount · inline history skeleton · "
    "no standalone visible loader · accessible focus fallback"
)
