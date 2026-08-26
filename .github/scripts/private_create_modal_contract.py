#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]

APP = (ROOT / "src/css/app.css").read_text(encoding="utf-8")
COMPOSITION = (ROOT / "src/css/compositions/private-create-modal.css").read_text(encoding="utf-8")
INC = (ROOT / "src/views/incidencias/incidencias.template.create.js").read_text(encoding="utf-8")
FAC = (ROOT / "src/views/facturas/facturas.template.create.js").read_text(encoding="utf-8")
CLI = (ROOT / "src/views/clientes/clientes.template.create.js").read_text(encoding="utf-8")
USR = (ROOT / "src/views/usuarios/usuarios.template.create.js").read_text(encoding="utf-8")

CREATE_STYLES = {
    "incidencias": (ROOT / "src/css/views/incidencias/create.css").read_text(encoding="utf-8"),
    "facturas": (ROOT / "src/css/views/facturas/create.css").read_text(encoding="utf-8"),
    "clientes": (ROOT / "src/css/views/clientes/create.css").read_text(encoding="utf-8"),
    "usuarios": (ROOT / "src/css/views/usuarios/create.css").read_text(encoding="utf-8"),
}

errors: list[str] = []


def require(source: str, snippet: str, message: str) -> None:
    if snippet not in source:
        errors.append(message)


def reject(source: str, snippet: str, message: str) -> None:
    if snippet in source:
        errors.append(message)


# One shared composition is the permanent authority after route-level view CSS.
require(
    APP,
    '@import url("./compositions/private-create-modal.css") layer(compositions);',
    "app.css must load the canonical private create modal composition",
)
require(COMPOSITION, "INCIDENCIAS CREATE AS VISUAL AUTHORITY", "Shared Create composition must name Incidencias as visual authority")
require(COMPOSITION, "--private-create-panel-width: min(1080px, calc(100vw - 48px));", "Admin Create modals must share the Incidencias 1080px panel geometry")
require(COMPOSITION, "grid-template-columns: minmax(0, 1fr) auto;", "Create headers must share the Incidencias title + close geometry")
require(COMPOSITION, "--private-create-primary-bg: #2563eb;", "All Create submits must keep the canonical Incidencias blue")
require(COMPOSITION, "background: var(--private-create-primary-bg);", "All Create submits must consume the shared blue Create token")
require(COMPOSITION, "border: 1px solid var(--private-create-primary-border);", "All Create submits must consume the shared blue border token")
require(COMPOSITION, "background: var(--btn-danger-bg);", "All Create close buttons must consume the danger red token")
require(COMPOSITION, "background: var(--btn-danger-bg-hover);", "All Create close buttons must keep danger hover semantics")
require(COMPOSITION, "background: var(--btn-danger-bg-active);", "All Create close buttons must keep danger active semantics")
require(COMPOSITION, "background: var(--btn-secondary-bg);", "Create secondary controls must keep the shared secondary token")
require(COMPOSITION, "@media (max-width: 760px)", "Create composition must preserve the Incidencias tablet breakpoint")
require(COMPOSITION, "@media (max-width: 480px)", "Create composition must preserve the Incidencias phone breakpoint")
for loading_class in [
    ".inc-create-loading-overlay",
    ".cli-create-loading-overlay",
    ".fac-create-loading-overlay",
    ".usr-create-loading-overlay",
]:
    require(COMPOSITION, loading_class, f"Create composition must standardize {loading_class}")

# Incidencias remains the reference shape.
for snippet, message in [
    ('class="inc-create-header"', "Incidencias Create must keep the canonical header"),
    ('class="inc-create-header-copy"', "Incidencias Create must keep the canonical title/subtitle wrapper"),
    ('class="inc-create-body"', "Incidencias Create must keep the canonical single scroll body"),
    ('class="inc-create-form', "Incidencias Create must keep the canonical form wrapper"),
    ('class="inc-create-actions"', "Incidencias Create must keep the canonical action row"),
    ('class="inc-create-actions-note"', "Incidencias Create must keep the canonical action note"),
    ('class="inc-create-submit"', "Incidencias Create must keep the canonical single submit"),
    ('class="inc-create-loading-overlay"', "Incidencias Create must keep the canonical loading overlay"),
]:
    require(INC, snippet, message)

# Facturas must use the same modal architecture, not its former custom chrome/footer.
for snippet, message in [
    ('class="fac-create-header-copy"', "Facturas Create must use title/subtitle-only header copy"),
    ('class="fac-create-body"', "Facturas Create must use one body scroll root"),
    ('class="fac-create-form"', "Facturas Create must expose the canonical form class"),
    ('class="fac-create-actions"', "Facturas Create must use the canonical in-body action row"),
    ('class="fac-create-actions-note"', "Facturas Create must expose the canonical action note"),
    ('class="fac-create-submit"', "Facturas Create must expose one canonical submit"),
    ('class="fac-create-loading-overlay"', "Facturas Create must expose the canonical full-panel loading overlay"),
    ('LINE_ADD: "create-line-add"', "Facturas Create must preserve multi-line billing"),
    ('data-line-field="concepto"', "Facturas Create must preserve per-line concepts"),
    ('data-slot="ticket-search-results"', "Facturas Create must preserve visible client-scoped incidents"),
]:
    require(FAC, snippet, message)

for snippet, message in [
    ("fac-create-header-icon", "Facturas Create must not keep a decorative header icon absent from Incidencias"),
    ("fac-create-eyebrow", "Facturas Create must not keep an eyebrow absent from Incidencias"),
    ("fac-create-footer", "Facturas Create must not keep a separate sticky footer"),
    ("fac-create-btn--ghost", "Facturas Create must not duplicate Close with a Cancel button"),
    ("fac-create-step", "Facturas Create blocks must not use a separate numbered visual grammar"),
]:
    reject(FAC, snippet, message)

# Clientes was already close to Incidencias; lock the remaining exact chrome.
for snippet, message in [
    ('class="cli-create-header-copy inc-create-header-copy"', "Clientes Create must use the canonical title/subtitle header wrapper"),
    ('class="cli-create-body inc-create-body"', "Clientes Create must use the canonical single scroll body"),
    ('class="cli-create-form inc-create-form"', "Clientes Create must use the canonical form wrapper"),
    ('class="cli-create-actions inc-create-actions"', "Clientes Create must use the canonical action row"),
    ('class="cli-create-actions-note inc-create-actions-note"', "Clientes Create must expose the canonical action note"),
    ('class="cli-create-submit inc-create-submit"', "Clientes Create must expose the canonical submit"),
    ('class="cli-create-loading-overlay inc-create-loading-overlay"', "Clientes Create must keep the canonical loading overlay"),
    ('class="cli-create-loading-copy inc-create-loading-copy"', "Clientes loading card must use canonical copy structure"),
]:
    require(CLI, snippet, message)
reject(CLI, "cli-create-title-icon", "Clientes Create must not keep a decorative header icon absent from Incidencias")

# Usuarios must expose the same chrome/state semantics while preserving activation flow.
for snippet, message in [
    ('class="usr-create-header-copy inc-create-header-copy"', "Usuarios Create must use the canonical title/subtitle header wrapper"),
    ('class="usr-create-close inc-create-close"', "Usuarios Create must use the canonical close control"),
    ('class="usr-create-body inc-create-body"', "Usuarios Create must use the canonical single scroll body"),
    ('class="usr-create-form inc-create-form"', "Usuarios Create must use the canonical form wrapper"),
    ('class="usr-create-actions inc-create-actions"', "Usuarios Create must use the canonical action row"),
    ('class="usr-create-actions-note inc-create-actions-note"', "Usuarios Create must expose the canonical action note"),
    ('class="usr-create-submit inc-create-submit"', "Usuarios Create must expose the canonical submit"),
    ('class="usr-create-loading-overlay inc-create-loading-overlay"', "Usuarios Create must use the canonical loading overlay"),
    ('class="usr-create-loading-copy inc-create-loading-copy"', "Usuarios loading card must use canonical copy structure"),
    ('data-activation-flow="true"', "Usuarios Create must preserve the activation flow contract"),
]:
    require(USR, snippet, message)
reject(USR, ">\n              ×\n            </button>", "Usuarios Create close control must use the same SVG icon as Incidencias")

# All route-level sheets remain low-priority view styles; composition owns parity.
for name, css in CREATE_STYLES.items():
    require(css, "@layer views", f"{name} create.css must remain in @layer views")

if errors:
    for error in errors:
        print(f"private-create-modal-contract: {error}", file=sys.stderr)
    raise SystemExit(1)

print("Private Create modal contract OK · Incidencias authority · Facturas/Clientes/Usuarios 1:1 chrome · shared buttons/loading/responsive")
