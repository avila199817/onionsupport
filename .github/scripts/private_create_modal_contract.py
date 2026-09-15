#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]

APP = (ROOT / "src/css/app.css").read_text(encoding="utf-8")
COMPOSITION = (ROOT / "src/css/compositions/private-create-modal.css").read_text(encoding="utf-8")
AUTHORITY = (ROOT / "src/css/components/detail-modal.css").read_text(encoding="utf-8")
INTERACTIONS = (ROOT / "src/css/compositions/private-admin-interactions.css").read_text(encoding="utf-8")
INC = (ROOT / "src/views/incidencias/incidencias.template.create.impl.js").read_text(encoding="utf-8")
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
require(AUTHORITY, '.ui-detail-modal-root[data-modal-size="form"] {', "Create dialogs share the shell's form size (1080px panel, content-sized height up to the form cap)")
require(AUTHORITY, "grid-template-columns: minmax(0, 1fr) auto;", "Create headers share the shell's title + close geometry")
require(INTERACTIONS, ".inc-create-submit {", "Incidencias interaction CSS must remain the Create action authority")
require(INTERACTIONS, "--btn-primary-bg: #1A73E8;", "Incidencias canonical Create blue must remain #1A73E8")
require(INTERACTIONS, "--btn-primary-bg-hover: #1967D2;", "Incidencias canonical Create hover must remain #1967D2")
require(INTERACTIONS, "--btn-primary-bg-active: #185ABC;", "Incidencias canonical Create active must remain #185ABC")
require(INTERACTIONS, "min-inline-size: 190px;", "Incidencias canonical Create submit width must remain authoritative")
require(INTERACTIONS, "border-radius: 999px;", "Incidencias canonical Create submit pill geometry must remain authoritative")
require(INTERACTIONS, ".inc-create-close:hover:not(:disabled):not([aria-disabled=\"true\"])", "Incidencias close hover must remain the destructive-state authority")
require(INTERACTIONS, "background: var(--error-bg);", "Incidencias close hover must use the canonical error background")
require(INTERACTIONS, "background: var(--error-soft);", "Incidencias close active must use the canonical error soft background")
require(COMPOSITION, "background: var(--btn-primary-bg);", "Shared Create submit base must consume Incidencias primary variables")
require(COMPOSITION, "background: var(--btn-secondary-bg);", "Shared Create close rest state must match Incidencias")
reject(COMPOSITION, "--private-create-primary-bg", "Shared Create composition must not invent a parallel primary palette")
reject(COMPOSITION, "background: var(--btn-danger-bg);", "Shared Create close must not become solid red at rest; Incidencias is neutral until hover")
require(COMPOSITION, "@media (max-width: 760px)", "Create composition must preserve the Incidencias tablet breakpoint")
require(COMPOSITION, "@media (max-width: 480px)", "Create composition must preserve the Incidencias phone breakpoint")
for loading_class in [
    ".inc-create-loading-overlay",
    ".cli-create-loading-overlay",
    ".fac-create-loading-overlay",
    ".usr-create-loading-overlay",
]:
    require(COMPOSITION, loading_class, f"Create composition must standardize {loading_class}")

# Incidencias remains the reference shape; its structure is the canonical shell
# (root, overlay, panel, header, close, scroll body) and the form is content.
for snippet, message in [
    ("renderModalShell(", "Incidencias Create must render through the canonical modal shell"),
    ("renderModalCloseButton(", "Incidencias Create must use the shell's close control"),
    ('height: "auto"', "Incidencias Create keeps the content-sized panel (auto height up to the form cap)"),
    ('class="inc-create-header-copy"', "Incidencias Create must keep the canonical title/subtitle wrapper"),
    ('bodyClass: "inc-create-body"', "Incidencias Create must keep the canonical form body class on the shell body"),
    ('class="inc-create-form', "Incidencias Create must keep the canonical form wrapper"),
    ('class="inc-create-actions"', "Incidencias Create must keep the canonical action row"),
    ('class="inc-create-actions-note"', "Incidencias Create must keep the canonical action note"),
    ('class="inc-create-submit"', "Incidencias Create must keep the canonical single submit"),
    ('class="inc-create-loading-overlay"', "Incidencias Create must keep the canonical loading overlay"),
]:
    require(INC, snippet, message)

# Facturas must use the same modal architecture, not its former custom chrome/footer.
for snippet, message in [
    ("renderModalShell(", "Facturas Create must render through the canonical modal shell"),
    ("renderModalCloseButton(", "Facturas Create must use the shell's close control"),
    ('height: "auto"', "Facturas Create keeps the content-sized panel (auto height up to the form cap)"),
    ('class="fac-create-header-copy"', "Facturas Create must use title/subtitle-only header copy"),
    ('bodyClass: "fac-create-body"', "Facturas Create must keep its form body class on the shell body"),
    ('class="fac-create-form"', "Facturas Create must expose the canonical form class"),
    ('class="fac-create-actions"', "Facturas Create must use the canonical in-body action row"),
    ('class="fac-create-actions-note"', "Facturas Create must expose the canonical action note"),
    ('class="fac-create-submit inc-create-submit"', "Facturas Create must consume the canonical Incidencias submit class"),
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

# Clientes renders on the canonical shell; lock the remaining exact chrome.
for snippet, message in [
    ("renderModalShell(", "Clientes Create must render through the canonical modal shell"),
    ("renderModalCloseButton(", "Clientes Create must use the shell's close control"),
    ('height: "auto"', "Clientes Create keeps the content-sized panel (auto height up to the form cap)"),
    ('class="cli-create-header-copy inc-create-header-copy"', "Clientes Create must use the canonical title/subtitle header wrapper"),
    ('bodyClass: "cli-create-body inc-create-body"', "Clientes Create must keep the canonical form body classes on the shell body"),
    ('class="cli-create-form inc-create-form"', "Clientes Create must use the canonical form wrapper"),
    ('class="cli-create-actions inc-create-actions"', "Clientes Create must use the canonical action row"),
    ('class="cli-create-actions-note inc-create-actions-note"', "Clientes Create must expose the canonical action note"),
    ('class="cli-create-submit inc-create-submit"', "Clientes Create must expose the canonical submit"),
    ('class="cli-create-loading-overlay inc-create-loading-overlay"', "Clientes Create must keep the canonical loading overlay"),
    ('class="cli-create-loading-copy inc-create-loading-copy"', "Clientes loading card must use canonical copy structure"),
]:
    require(CLI, snippet, message)
reject(CLI, "cli-create-title-icon", "Clientes Create must not keep a decorative header icon absent from Incidencias")
reject(CLI, "cli-create-close", "Clientes Create must not keep a close control of its own")

# Usuarios renders on the canonical shell and preserves its activation flow.
for snippet, message in [
    ("renderModalShell(", "Usuarios Create must render through the canonical modal shell"),
    ("renderModalCloseButton(", "Usuarios Create must use the shell's close control"),
    ('height: "auto"', "Usuarios Create keeps the content-sized panel (auto height up to the form cap)"),
    ('class="usr-create-header-copy inc-create-header-copy"', "Usuarios Create must use the canonical title/subtitle header wrapper"),
    ('bodyClass: "usr-create-body inc-create-body"', "Usuarios Create must keep the canonical form body classes on the shell body"),
    ('class="usr-create-form inc-create-form"', "Usuarios Create must use the canonical form wrapper"),
    ('class="usr-create-actions inc-create-actions"', "Usuarios Create must use the canonical action row"),
    ('class="usr-create-actions-note inc-create-actions-note"', "Usuarios Create must expose the canonical action note"),
    ('class="usr-create-submit inc-create-submit"', "Usuarios Create must expose the canonical submit"),
    ('class="usr-create-loading-overlay inc-create-loading-overlay"', "Usuarios Create must use the canonical loading overlay"),
    ('class="usr-create-loading-copy inc-create-loading-copy"', "Usuarios loading card must use canonical copy structure"),
    ('"data-activation-flow": "true"', "Usuarios Create must preserve the activation flow contract"),
]:
    require(USR, snippet, message)
reject(USR, "usr-create-close", "Usuarios Create must not keep a close control of its own")

# All route-level sheets remain low-priority view styles; composition owns parity.
for name, css in CREATE_STYLES.items():
    require(css, "@layer views", f"{name} create.css must remain in @layer views")
    reject(css, "-create-header-copy h2", f"{name} create.css must not restyle the create title: the composition owns it")
    reject(css, "-create-header-copy p", f"{name} create.css must not restyle the create subtitle: the composition owns it")
require(COMPOSITION, "  .usr-create-header-copy\n) h2 {", "Create composition must own the title typography of the four create dialogs")
require(COMPOSITION, "  .usr-create-header-copy\n) p {", "Create composition must own the subtitle typography of the four create dialogs")

if errors:
    for error in errors:
        print(f"private-create-modal-contract: {error}", file=sys.stderr)
    raise SystemExit(1)

print("Private Create modal contract OK · Incidencias authority · Facturas/Clientes/Usuarios 1:1 chrome · shared buttons/loading/responsive")
