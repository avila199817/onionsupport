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

    # La vista sólo calibra ancho/variación del contenido. El paint sigue global.
    required_local = (
        ".incidencias-row--skeleton {",
        "--inc-skeleton-subject-width: 58%;",
        "--inc-skeleton-description-width: 90%;",
        "--inc-skeleton-client-width: 62%;",
        "--inc-skeleton-updated-width: 78px;",
        ".incidencias-row--skeleton:nth-child(1) {",
        ".incidencias-row--skeleton:nth-child(2) {",
        ".incidencias-row--skeleton:nth-child(3) {",
        ".incidencias-row--skeleton:nth-child(4) {",
        ".incidencias-row--skeleton:nth-child(5) {",
        ".incidencias-row--skeleton:nth-child(6) {",
        ".incidencias-row--skeleton:nth-child(n+7) { display: none; }",
        ".incidencias-skeleton--main { inline-size: 100%; min-inline-size: 0; }",
        ".incidencias-skeleton--status { inline-size: min(64px, 100%); }",
        ".incidencias-skeleton--created { inline-size: min(78px, 100%); }",
        ".incidencias-skeleton--updated { inline-size: min(var(--inc-skeleton-updated-width), 100%); }",
        ".incidencias-skeleton--amount { inline-size: min(58px, 100%); }",
        ".incidencias-skeleton--attachments { inline-size: min(46px, 100%); }",
    )
    for token in required_local:
        if token not in css:
            errors.append(f"{CSS}: falta geometría realista {token!r}")

    # Evita volver a los porcentajes sobredimensionados vistos en producción.
    for forbidden in (
        ".incidencias-skeleton--status { inline-size: 72%; }",
        ".incidencias-skeleton--created { inline-size: 66%; }",
        ".incidencias-skeleton--updated { inline-size: 70%; }",
        ".incidencias-skeleton--amount { inline-size: 64%; }",
        ".incidencias-skeleton--attachments { inline-size: 52%; }",
    ):
        if forbidden in css:
            errors.append(f"{CSS}: geometría legacy sobredimensionada {forbidden!r}")

    # Paint completo en la única autoridad global. La silueta replica la fila:
    # avatar; ID + categoría; asunto; descripción; cliente; prioridad + asignado.
    required_global = (
        "SINGLE SKELETON AUTHORITY",
        "INCIDENCIAS · REAL ROW SILHOUETTE",
        "--ui-skeleton-chip-sm: 20px;",
        ".incidencias-skeleton--main {",
        "block-size: 105px;",
        "background: none;",
        "animation: none;",
        ".incidencias-skeleton--main::before",
        ".incidencias-skeleton--main::after",
        "--inc-skeleton-id-width: 108px;",
        "--inc-skeleton-category-width: 54px;",
        "--inc-skeleton-priority-width: 60px;",
        "--inc-skeleton-assigned-width: 120px;",
        "var(--private-admin-avatar-size)",
        "var(--private-admin-main-gap)",
        "var(--inc-skeleton-subject-width)",
        "var(--inc-skeleton-description-width)",
        "var(--inc-skeleton-client-width)",
        "0 6px / var(--inc-skeleton-id-width) var(--ui-skeleton-line-sm)",
        "116px 0 / var(--inc-skeleton-category-width) var(--ui-skeleton-chip-sm)",
        "0 27px / var(--inc-skeleton-subject-width) var(--ui-skeleton-line-strong)",
        "0 50px / var(--inc-skeleton-description-width) var(--ui-skeleton-line-sm)",
        "0 68px / var(--inc-skeleton-client-width) var(--ui-skeleton-line-sm)",
        "0 80px / var(--inc-skeleton-priority-width) var(--ui-skeleton-chip)",
        "68px 80px / var(--inc-skeleton-assigned-width) var(--ui-skeleton-chip)",
        "var(--ui-skeleton-base)",
        "var(--ui-skeleton-highlight)",
        "ui-skeleton-shimmer var(--ui-skeleton-duration)",
    )
    for token in required_global:
        if token not in skeleton_css:
            errors.append(f"{SKELETON_CSS}: falta paridad Incidencias {token!r}")

    # Siete capas = jerarquía real completa, incluida la segunda pill inferior.
    main_after = re.search(
        r"\.incidencias-skeleton--main::after\s*\{(?P<body>.*?)\n\}",
        skeleton_css,
        re.DOTALL,
    )
    if not main_after:
        errors.append(f"{SKELETON_CSS}: falta silueta principal")
    else:
        body = main_after.group("body")
        mask_match = re.search(r"(?<!webkit-)mask:\s*(?P<mask>.*?);", body, re.DOTALL)
        if not mask_match:
            errors.append(f"{SKELETON_CSS}: falta mask canónico")
        elif mask_match.group("mask").count("linear-gradient") != 7:
            errors.append(
                f"{SKELETON_CSS}: la silueta debe contener exactamente 7 piezas"
            )

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
    "Skeleton Incidencias 1:1 OK · silueta de fila real · 7 piezas main · "
    "columnas calibradas · 6 filas visibles · paint global"
)
