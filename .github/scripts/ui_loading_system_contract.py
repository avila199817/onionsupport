#!/usr/bin/env python3
"""Permanent contract for Onion Support's loading/skeleton design system."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "src/css/app.css"
SKELETON = ROOT / "src/css/components/skeleton.css"
UI = ROOT / "src/css/components/ui.css"
DOC = ROOT / "docs/UI_LOADING_SYSTEM.md"

CRUD_LOCAL = (
    ROOT / "src/css/views/incidencias/index.css",
    ROOT / "src/css/views/facturas/index.css",
    ROOT / "src/css/views/clientes/index.css",
    ROOT / "src/css/views/usuarios/index.css",
)

# These files already contained historical skeleton paint before the design
# system migration. layer(loading) supersedes them at runtime. This bounded set
# prevents proliferation while allowing cleanup to be performed deliberately.
LEGACY_ADAPTER_FILES = {
    ROOT / "src/css/tokens/variables.css",
    ROOT / "src/css/components/ui.css",
    ROOT / "src/css/compositions/private-admin-parity.css",
    ROOT / "src/css/views/home/index.css",
    ROOT / "src/css/views/cuenta/index.css",
    ROOT / "src/css/views/correo/index.css",
    ROOT / "src/css/views/facturas/detail.css",
}

errors = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


for path in (APP, SKELETON, UI, DOC, *CRUD_LOCAL):
    require(path.is_file(), f"{path.relative_to(ROOT)}: no existe")

if not errors:
    app = APP.read_text(encoding="utf-8")
    skeleton = SKELETON.read_text(encoding="utf-8")
    ui = UI.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(
        "@layer tokens, reset, core, layout, components, views, auth, compositions, loading, guardrails;"
        in app,
        "src/css/app.css: layer(loading) debe vivir entre compositions y guardrails",
    )
    require(
        '@import url("./components/skeleton.css") layer(loading);' in app,
        "src/css/app.css: falta el import canónico de skeleton.css",
    )

    for token in (
        "SINGLE SKELETON AUTHORITY",
        "--ui-skeleton-base:",
        "--ui-skeleton-highlight:",
        "--ui-skeleton-duration:",
        ".ui-skeleton,",
        ".incidencias-skeleton,",
        ".facturas-skeleton,",
        ".clientes-skeleton,",
        ".usuarios-skeleton,",
        ".cuenta-skeleton,",
        ".home-skeleton,",
        ".correo-message-skeleton > span",
        ".correo-reader-skeleton-block",
        ".facturas-detail-skeleton",
        "@keyframes ui-skeleton-shimmer",
        "@keyframes ui-loading-spin",
        "@media (prefers-reduced-motion: reduce)",
        "@media (forced-colors: active)",
        ".ui-loading-status",
        ".ui-progress-spinner,",
        ".incidencias-refresh-overlay,",
        ".facturas-refresh-overlay",
    ):
        require(token in skeleton, f"src/css/components/skeleton.css: falta {token!r}")

    require(
        ".ui-skeleton" in ui,
        "src/css/components/ui.css: la primitiva histórica .ui-skeleton debe seguir disponible",
    )

    # CRUD listings are fully migrated: only horizontal/layout geometry may stay
    # local. Paint, heights, radius and animation belong to skeleton.css.
    forbidden_paint = (
        "background:",
        "background-image:",
        "animation:",
        "border-radius:",
        "block-size:",
        "color:",
        "opacity:",
    )
    for path in CRUD_LOCAL:
        text = path.read_text(encoding="utf-8")
        prefix = path.parent.name
        for match in re.finditer(
            rf"\.{re.escape(prefix)}-skeleton[^{{]*\{{(?P<body>.*?)\}}",
            text,
            re.DOTALL,
        ):
            body = match.group("body")
            for prop in forbidden_paint:
                require(
                    prop not in body,
                    f"{path.relative_to(ROOT)}: skeleton local recuperó paint {prop!r}",
                )

    # Stop proliferation. Existing legacy files are bounded adapters; any new
    # skeleton keyframe elsewhere is a hard regression.
    skeleton_keyframes = re.compile(r"@keyframes\s+[\w-]*skeleton[\w-]*", re.I)
    for path in (ROOT / "src/css").rglob("*.css"):
        if path == SKELETON:
            continue
        text = path.read_text(encoding="utf-8")
        if skeleton_keyframes.search(text):
            require(
                path in LEGACY_ADAPTER_FILES,
                f"{path.relative_to(ROOT)}: nuevo @keyframes skeleton fuera de la autoridad global",
            )

    # The loading policy is part of the product contract, not tribal knowledge.
    for token in (
        "COLD_LOADING",
        "READY",
        "REFRESHING",
        "LOADING_MORE",
        "ACTION_PENDING",
        "EMPTY",
        "ERROR",
        "prefers-reduced-motion",
        "aria-busy",
        "role=\"status\"",
    ):
        require(token in doc, f"docs/UI_LOADING_SYSTEM.md: falta política {token!r}")

if errors:
    for item in errors:
        print(f"::error title=UI Loading System contract inválido::{item}")
    sys.exit(1)

print(
    "UI Loading System OK · single skeleton authority · canonical shimmer/spinner · "
    "CRUD paint centralized · legacy adapters bounded · accessibility/motion policy locked"
)
