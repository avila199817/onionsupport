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

SPINNER_ADAPTERS = (
    ".inc-create-spinner", ".inc-create-loading-spinner",
    ".cli-create-spinner", ".cli-create-loading-spinner",
    ".fac-create-spinner", ".fac-create-loading-spinner",
    ".usr-create-spinner", ".usr-create-loading-spinner",
    ".usr-create-submit-spinner", ".facturas-detail-spinner",
    ".incidencias-modal-inline-spinner > span:first-child",
    ".incidencias-modal-loading-box > span:first-child",
)

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
        "--ui-loading-animation: ui-loading-spin;",
        "--ui-loading-animation: none;",
        "--ui-loading-duration: .72s;",
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

    # The migration is complete: compatibility classes are selectors in the
    # authority, never an exception allowing another paint or animation engine.
    skeleton_keyframes = re.compile(r"@keyframes\s+[\w-]*(?:skeleton|shimmer)[\w-]*", re.I)
    placeholder_selector = re.compile(
        r"\.(?:(?:ui|incidencias|facturas|clientes|usuarios|cuenta|home)-skeleton"
        r"|facturas-detail-skeleton|home-panel-loading-(?:icon|title|meta|date|amount)"
        r"|correo-boot-(?:account|line|title)|correo-reader-skeleton-block"
        r"|correo-message-skeleton[^,]*(?: > span| i))"
    )
    visual_property = re.compile(
        r"(?<![\w-])(?:background(?:-[\w-]+)?|animation(?:-[\w-]+)?"
        r"|border(?:-[\w-]+)?|block-size|color|opacity)\s*:"
    )
    for path in (*((ROOT / "src/css").rglob("*.css")), *((ROOT / "src/features").rglob("*.css"))):
        if path == SKELETON:
            continue
        text = re.sub(r"/\*.*?\*/", "", path.read_text(encoding="utf-8"), flags=re.S)
        require(
            not skeleton_keyframes.search(text),
            f"{path.relative_to(ROOT)}: @keyframes skeleton/shimmer fuera de la autoridad global",
        )
        for animation_name in re.findall(r"@keyframes\s+([\w-]+)", text):
            require(
                "spin" not in animation_name.lower() or animation_name == "loginOrbitSpin",
                f"{path.relative_to(ROOT)}: animación de indicador paralela {animation_name}",
            )
        for selector, body in re.findall(r"([^{}]+)\{([^{}]*)\}", text):
            if placeholder_selector.search(selector):
                require(
                    not visual_property.search(body),
                    f"{path.relative_to(ROOT)}: paint o forma de skeleton fuera de la autoridad global: {selector.strip()}",
                )
            if any(adapter in selector for adapter in SPINNER_ADAPTERS):
                require(
                    not visual_property.search(body),
                    f"{path.relative_to(ROOT)}: spinner CRUD redefinido fuera de la autoridad global",
                )

    for selector in SPINNER_ADAPTERS:
        require(
            skeleton.count(selector) >= 2,
            f"skeleton.css: {selector} debe compartir spinner canónico y reduced motion",
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
    "CRUD paint centralized · no legacy paint exceptions · accessibility/motion policy locked"
)
