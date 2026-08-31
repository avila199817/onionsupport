#!/usr/bin/env python3
from pathlib import Path
import re
import sys

TEMPLATE = Path("src/views/incidencias/incidencias.template.js")
CSS = Path("src/css/views/incidencias/index.css")
APP_CSS = Path("src/css/app.css")
SKELETON_CSS = Path("src/css/components/skeleton.css")

errors = []

for path in (TEMPLATE, CSS, APP_CSS, SKELETON_CSS):
    if not path.is_file():
        errors.append(f"{path}: no existe")

if not errors:
    template = TEMPLATE.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    app_css = APP_CSS.read_text(encoding="utf-8")
    skeleton_css = SKELETON_CSS.read_text(encoding="utf-8")

    required_template = (
        "function renderTableLoading(rows = DEFAULT_VISIBLE_ROWS)",
        "renderColgroup()",
        "renderThead()",
        "incidencias-row--skeleton",
        "incidencias-skeleton incidencias-skeleton--${at(c.key)}",
        "const initialLoading = vm.loading && !vm.visibleItems.length;",
        "initialLoading ? renderTableLoading(DEFAULT_VISIBLE_ROWS)",
        "const refreshing = vm.refreshing && vm.visibleItems.length;",
    )
    for token in required_template:
        if token not in template:
            errors.append(f"{TEMPLATE}: falta contrato {token!r}")

    layer_contract = (
        "@layer tokens, reset, core, layout, components, views, auth, "
        "compositions, loading, guardrails;"
    )
    if layer_contract not in app_css:
        errors.append(f"{APP_CSS}: loading debe vivir después de compositions")
    if '@import url("./components/skeleton.css") layer(loading);' not in app_css:
        errors.append(f"{APP_CSS}: falta la autoridad global de skeleton")

    # Incidencias conserva sólo layout/ancho del placeholder.
    required_local = (
        ".incidencias-row--skeleton {",
        ".incidencias-row--skeleton:nth-child(n+7) { display: none; }",
        ".incidencias-skeleton--main { inline-size: 100%; min-inline-size: 0; }",
        ".incidencias-skeleton--status { inline-size: 72%; }",
        ".incidencias-skeleton--created { inline-size: 66%; }",
        ".incidencias-skeleton--updated { inline-size: 70%; }",
        ".incidencias-skeleton--amount { inline-size: 64%; }",
        ".incidencias-skeleton--attachments { inline-size: 52%; }",
    )
    for token in required_local:
        if token not in css:
            errors.append(f"{CSS}: falta geometría local {token!r}")

    # Paint completo en la única autoridad global.
    required_global = (
        "SINGLE SKELETON AUTHORITY",
        ".incidencias-skeleton--main {",
        "block-size: 108px;",
        "background: none;",
        "animation: none;",
        ".incidencias-skeleton--main::before",
        ".incidencias-skeleton--main::after",
        "var(--private-admin-avatar-size)",
        "var(--private-admin-main-gap)",
        "var(--ui-skeleton-base)",
        "var(--ui-skeleton-highlight)",
        "block-size: var(--ui-skeleton-chip);",
        "block-size: var(--ui-skeleton-line);",
        "ui-skeleton-shimmer var(--ui-skeleton-duration)",
    )
    for token in required_global:
        if token not in skeleton_css:
            errors.append(f"{SKELETON_CSS}: falta autoridad Incidencias {token!r}")

    # Ningún bloque local incidencias-skeleton puede recuperar paint.
    for match in re.finditer(
        r"\.incidencias-skeleton[^\{]*\{(?P<body>.*?)\}", css, re.DOTALL
    ):
        body = match.group("body")
        for forbidden in ("background:", "animation:", "border-radius:", "block-size:"):
            if forbidden in body:
                errors.append(
                    f"{CSS}: paint local prohibido en skeleton Incidencias: {forbidden!r}"
                )

    forbidden_template = (
        "incidencias-global-loader",
        "incidencias-page-loader",
        "showLoader(",
        "hideLoader(",
    )
    for token in forbidden_template:
        if token in template:
            errors.append(f"{TEMPLATE}: loader paralelo prohibido {token!r}")

if errors:
    for item in errors:
        print(f"::error title=Contrato skeleton Incidencias inválido::{item}")
    sys.exit(1)

print(
    "Skeleton Incidencias 1:1 OK · paint global · 6 filas visibles · "
    "sin cápsula · sin autoridad visual local"
)
