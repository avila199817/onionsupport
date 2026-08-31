#!/usr/bin/env python3
from pathlib import Path
import sys

TEMPLATE = Path("src/views/incidencias/incidencias.template.js")
CSS = Path("src/css/views/incidencias/index.css")

errors = []

if not TEMPLATE.is_file():
    errors.append(f"{TEMPLATE}: no existe")
if not CSS.is_file():
    errors.append(f"{CSS}: no existe")

if not errors:
    template = TEMPLATE.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")

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

    required_css = (
        ".incidencias-row--skeleton {",
        ".incidencias-skeleton--main {",
        "block-size: 108px;",
        ".incidencias-skeleton--main::before",
        ".incidencias-skeleton--main::after",
        "var(--private-admin-avatar-size)",
        "var(--private-admin-main-gap)",
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
            errors.append(f"{CSS}: falta geometría skeleton {token!r}")

    forbidden_template = (
        "incidencias-global-loader",
        "incidencias-page-loader",
        "showLoader(",
        "hideLoader(",
    )
    for token in forbidden_template:
        if token in template:
            errors.append(f"{TEMPLATE}: loader paralelo prohibido {token!r}")

    # Un skeleton de celda vacío necesita altura explícita. Este guard evita
    # volver al bug donde sólo main era visible y el resto colapsaba a 0px.
    for klass in ("status", "created", "updated", "amount", "attachments"):
        selector = f".incidencias-skeleton--{klass}"
        if selector not in css:
            errors.append(f"{CSS}: falta selector {selector!r}")

if errors:
    for item in errors:
        print(f"::error title=Contrato skeleton Incidencias inválido::{item}")
    sys.exit(1)

print("Skeleton Incidencias 1:1 OK.")
