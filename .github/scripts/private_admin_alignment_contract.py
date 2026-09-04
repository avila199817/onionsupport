#!/usr/bin/env python3
"""Cross-view integrity contract for the private listing foundation."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CRUD_VIEWS = ("incidencias", "facturas", "clientes", "usuarios")
MANUAL_PAGINATION_MARKERS = (
    "Mostrar más",
    "Cargar más",
    "Ver más",
    "Load more",
    'LOAD_MORE: "load-more"',
    'data-action="load-more"',
)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"PRIVATE_ADMIN_ALIGNMENT_CONTRACT: {message}")


app_css = read("src/css/app.css")
private_css = read("src/css/private.css")
mobile_js = read("src/features/mobile-datalist/index.js")
mobile_css = read("src/css/compositions/mobile-datalist.css")
parity_css = read("src/css/compositions/private-admin-parity.css")
interactions_css = read("src/css/compositions/private-admin-interactions.css")
avatar_css = read("src/css/components/avatar-system.css")
server_css = read("src/css/views/servidor/index.css")

for entry_name, entry in (("app.css", app_css), ("private.css", private_css)):
    for shared_css in (
        './compositions/private-admin-parity.css',
        './compositions/private-admin-interactions.css',
        './compositions/private-create-modal.css',
        './components/avatar-system.css',
    ):
        require(shared_css in entry, f"{entry_name} must import {shared_css}")

require("PRIVATE UI FOUNDATION" in parity_css, "shared composition must declare the single private UI foundation")
require("SINGLE VISUAL AUTHORITY" in parity_css, "shared composition must declare single listing visual authority")
require(".server-hero" in parity_css, "Servidor hero must consume the shared private foundation")
require(".server-summary-grid" in parity_css, "Servidor KPI shell must consume the shared private foundation")
require(".server-panel" in parity_css, "Servidor panels must consume the shared private foundation")
require("@import" not in server_css, "Servidor domain CSS must not import a parallel base stylesheet")
require(not (ROOT / "src/css/views/servidor/base.css").exists(), "obsolete Servidor base.css must stay deleted")

require(
    "SINGLE VISUAL AUTHORITY · TRANSPARENT ALPHA SAFE · SPA-WIDE" in avatar_css,
    "AvatarSystem must remain the independent cross-view avatar paint authority",
)
require(
    "MICROSOFT FLUENT UI V8 PERSONA AUTO-COLOR PALETTE" in avatar_css,
    "AvatarSystem must retain the Microsoft Fluent Persona color engine",
)
require(
    '[data-avatar-tone="19"]' in avatar_css,
    "AvatarSystem must retain the complete 20-tone Microsoft Persona palette",
)

for view in CRUD_VIEWS:
    index_path = (
        "src/views/incidencias/index.impl.js"
        if view == "incidencias"
        else f"src/views/{view}/index.js"
    )
    index = read(index_path)
    template_name = "incidencias.template.js" if view == "incidencias" else f"{view}.template.js"
    template = read(f"src/views/{view}/{template_name}")
    styles = read(f"src/css/views/{view}/index.css")

    if view == "incidencias":
        boundary = read("src/views/incidencias/index.js")
        require(
            'import * as Impl from "./index.impl.js"' in boundary,
            "incidencias stable boundary must delegate to index.impl.js",
        )

    require("@layer views" in styles, f"{view} CSS must remain in @layer views")
    require(
        'document.getElementById("main-content")' in index,
        f"{view} must resolve the real application scroll owner",
    )
    require(
        "IntersectionObserver" in index,
        f"{view} must retain automatic continuous-scroll observation",
    )
    require(
        "compositionstart" in index and "compositionend" in index,
        f"{view} search must remain IME-safe",
    )

    for marker in MANUAL_PAGINATION_MARKERS:
        require(marker not in template, f"{view} template reintroduced manual pagination marker: {marker}")

    require(f'layout: "{view}"' in mobile_js, f"mobile datalist JS must include {view}")
    require(f'data-mobile-datalist-layout="{view}"' in mobile_css, f"mobile datalist CSS must include {view}")

for domain in ("facturas", "clientes", "usuarios"):
    for token in (
        f"#{domain}-create-btn",
        f".{domain}-filter-pill",
        f".{domain}-search-input",
        f".{domain}-history-head",
    ):
        require(token in interactions_css, f"shared interactions missing {token}")

    for token in (
        f".{domain}-stats",
        f".{domain}-history",
        f".{domain}-table",
    ):
        require(token in parity_css, f"shared parity missing {token}")

    require(
        f".{domain}-avatar" not in parity_css,
        f"{domain} avatar paint must remain outside shared listing parity",
    )

for token in (
    ".incidencias-stats",
    ".incidencias-history",
    ".incidencias-table",
):
    require(token in parity_css, f"Incidencias shared listing authority missing {token}")

require(
    ".incidencias-avatar" not in parity_css,
    "Incidencias avatar paint must remain owned by AvatarSystem",
)

for breakpoint in (
    "@container (max-width: 1120px)",
    "@container (max-width: 820px)",
    "@media (max-width: 680px)",
    "@container (max-width: 560px)",
):
    require(breakpoint in parity_css, f"shared responsive breakpoint missing: {breakpoint}")

print(
    "Private admin alignment contract OK · 4 CRUD views + Servidor · continuous scroll · "
    "IME-safe search · single listing foundation · independent AvatarSystem authority · mobile datalist"
)
