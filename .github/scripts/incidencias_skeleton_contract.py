#!/usr/bin/env python3
from pathlib import Path
import re
import sys

TEMPLATE = Path("src/views/incidencias/incidencias.template.js")
CSS = Path("src/css/views/incidencias/index.css")
APP_CSS = Path("src/css/app.css")

errors = []

for path in (TEMPLATE, CSS, APP_CSS):
    if not path.is_file():
        errors.append(f"{path}: no existe")

if not errors:
    template = TEMPLATE.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    app_css = APP_CSS.read_text(encoding="utf-8")

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

    # La arquitectura declara compositions por encima de views. El main skeleton
    # debe neutralizar únicamente el relleno genérico para que no vuelva a verse
    # como una cápsula gigante alrededor de avatar + copy.
    layer_contract = "@layer tokens, reset, core, layout, components, views, auth, compositions, guardrails;"
    if layer_contract not in app_css:
        errors.append(
            f"{APP_CSS}: cambió el orden de capas; revisar intencionadamente la protección del skeleton"
        )

    required_css = (
        "--inc-skeleton-bg: var(--skeleton-bg);",
        "--inc-skeleton-bg-strong: var(--skeleton-bg-strong);",
        ".incidencias-row--skeleton {",
        ".incidencias-row--skeleton:nth-child(n+7) { display: none; }",
        ".incidencias-skeleton--main {",
        "--skeleton-bg: transparent;",
        "--skeleton-bg-strong: transparent;",
        "inline-size: 100%;",
        "block-size: 108px;",
        "display: block;",
        ".incidencias-skeleton--main::before",
        ".incidencias-skeleton--main::after",
        "var(--private-admin-avatar-size)",
        "var(--private-admin-main-gap)",
        "var(--inc-skeleton-bg)",
        "var(--inc-skeleton-bg-strong)",
        ".incidencias-skeleton--status,",
        ".incidencias-skeleton--amount,",
        ".incidencias-skeleton--attachments {",
        "block-size: 25px;",
        ".incidencias-skeleton--created,",
        ".incidencias-skeleton--updated {",
        "block-size: 11px;",
        "private-admin-shimmer 1.35s linear infinite",
    )
    for token in required_css:
        if token not in css:
            errors.append(f"{CSS}: falta geometría/protección skeleton {token!r}")

    main_match = re.search(
        r"\.incidencias-skeleton--main\s*\{(?P<body>.*?)\n\}",
        css,
        re.DOTALL,
    )
    if main_match is None:
        errors.append(f"{CSS}: no se pudo aislar el bloque main del skeleton")
    else:
        main_body = main_match.group("body")
        for token in (
            "--skeleton-bg: transparent;",
            "--skeleton-bg-strong: transparent;",
            "background: none;",
            "animation: none;",
        ):
            if token not in main_body:
                errors.append(f"{CSS}: main skeleton debe neutralizar la cápsula genérica: {token!r}")

    pseudo_match = re.search(
        r"\.incidencias-skeleton--main::before,\s*\n\.incidencias-skeleton--main::after\s*\{(?P<body>.*?)\n\}",
        css,
        re.DOTALL,
    )
    if pseudo_match is None:
        errors.append(f"{CSS}: falta shimmer estructurado del main skeleton")
    else:
        pseudo_body = pseudo_match.group("body")
        if "var(--inc-skeleton-bg)" not in pseudo_body or "var(--inc-skeleton-bg-strong)" not in pseudo_body:
            errors.append(f"{CSS}: pseudo-elementos deben reutilizar los tokens canónicos capturados")
        if "linear-gradient(90deg, var(--skeleton-bg), var(--skeleton-bg-strong)" in pseudo_body:
            errors.append(f"{CSS}: pseudo-elementos no pueden heredar los tokens transparentes del contenedor")

    forbidden_template = (
        "incidencias-global-loader",
        "incidencias-page-loader",
        "showLoader(",
        "hideLoader(",
    )
    for token in forbidden_template:
        if token in template:
            errors.append(f"{TEMPLATE}: loader paralelo prohibido {token!r}")

    # Cada celda vacía necesita altura explícita; evita placeholders colapsados.
    for klass in ("status", "created", "updated", "amount", "attachments"):
        selector = f".incidencias-skeleton--{klass}"
        if selector not in css:
            errors.append(f"{CSS}: falta selector {selector!r}")

if errors:
    for item in errors:
        print(f"::error title=Contrato skeleton Incidencias inválido::{item}")
    sys.exit(1)

print(
    "Skeleton Incidencias 1:1 OK · sin cápsula genérica · shimmer canónico · "
    "6 filas visibles · placeholders no colapsados"
)
