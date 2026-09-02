#!/usr/bin/env python3
"""Permanent single-source CSS architecture contract for the private SPA."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def fail(message: str) -> None:
    print(f"private-css-authority-contract: {message}", file=sys.stderr)
    raise SystemExit(1)


parity = read("src/css/compositions/private-admin-parity.css")
create = read("src/css/compositions/private-create-modal.css")
avatar_system = read("src/css/components/avatar-system.css")
app = read("src/css/app.css")
private_entry = read("src/css/private.css")
users_create = read("src/css/views/usuarios/create.css")
server = read("src/css/views/servidor/index.css")

if "SINGLE VISUAL AUTHORITY" not in parity:
    fail("private-admin-parity.css must explicitly be the single listing visual authority")

for forbidden in (
    ".inc-create-overlay",
    ".cli-create-overlay",
    ".fac-create-overlay",
    ".usr-create-overlay",
    ".ui-detail-modal-overlay",
    ".clientes-detail-overlay",
    ".facturas-detail-overlay",
):
    if forbidden in parity:
        fail(f"listing foundation must not own Create/Detail selector {forbidden}")

for entry_name, source in (("app.css", app), ("private.css", private_entry)):
    for required in (
        './compositions/private-admin-parity.css',
        './compositions/private-admin-interactions.css',
        './compositions/private-create-modal.css',
        './components/avatar-system.css',
    ):
        if required not in source:
            fail(f"{entry_name} is missing canonical composition {required}")

if "INCIDENCIAS CREATE AS VISUAL AUTHORITY" not in create:
    fail("private-create-modal.css must remain the Create visual authority")

for required in (
    "SINGLE VISUAL AUTHORITY · TRANSPARENT ALPHA SAFE · SPA-WIDE",
    "UINT32 COLOR ENGINE · 4,294,967,296 TONES",
    '[data-avatar-authority="global"][data-avatar-state="fallback"]',
    "ONE FALLBACK PAINT AUTHORITY",
):
    if required not in avatar_system:
        fail(f"avatar-system.css missing canonical avatar authority: {required}")

for forbidden_avatar_owner in (
    ".incidencias-avatar",
    ".facturas-avatar",
    ".clientes-avatar",
    ".usuarios-avatar",
):
    if forbidden_avatar_owner in parity:
        fail(
            f"listing foundation must not paint avatar selector {forbidden_avatar_owner}; "
            "components/avatar-system.css owns avatar geometry/state/paint"
        )

if (ROOT / "src/css/views/servidor/base.css").exists():
    fail("Servidor base.css was reintroduced")
if re.search(r"@import\s+[^;]*base\.css", server):
    fail("Servidor index.css must not import a parallel base.css")
if "@layer views" not in server:
    fail("Servidor index.css must stay inside @layer views")

shared_listing_owners = {
    "incidencias": (
        r"\.incidencias-hero\s*\{",
        r"\.incidencias-stats\s*\{",
        r"\.incidencias-history\s*\{",
        r"\.incidencias-search\s*\{",
        r"\.incidencias-avatar\s*\{",
    ),
    "facturas": (
        r"\.facturas-hero\s*\{",
        r"\.facturas-stats\s*\{",
        r"\.facturas-history\s*\{",
        r"\.facturas-search\s*\{",
        r"\.facturas-avatar\s*\{",
    ),
    "clientes": (
        r"\.clientes-hero\s*\{",
        r"\.clientes-stats\s*\{",
        r"\.clientes-history\s*\{",
        r"\.clientes-search\s*\{",
        r"\.clientes-avatar\s*\{",
    ),
    "usuarios": (
        r"\.usuarios-hero\s*\{",
        r"\.usuarios-stats\s*\{",
        r"\.usuarios-history\s*\{",
        r"\.usuarios-search\s*\{",
        r"\.usuarios-avatar\s*\{",
    ),
}

for domain, patterns in shared_listing_owners.items():
    path = f"src/css/views/{domain}/index.css"
    source = read(path)
    if "@layer views" not in source:
        fail(f"{path} must stay in @layer views")
    for pattern in patterns:
        if re.search(pattern, source):
            fail(f"{path} reintroduced shared listing ownership: {pattern}")
    for literal in ("#1A73E8", "#1967D2", "#185ABC"):
        if literal.lower() in source.lower():
            fail(f"{path} reintroduced a private action palette literal {literal}")

for forbidden in (
    r"\.usr-create-overlay\s*\{",
    r"\.usr-create-panel\s*\{",
    r"\.usr-create-header\s*\{",
    r"\.usr-create-body\s*\{",
    r"\.usr-create-input\s*[,\{]",
    r"\.usr-create-submit\s*\{",
    r"\.usr-create-loading-overlay\s*\{",
):
    if re.search(forbidden, users_create):
        fail(f"Usuarios Create reintroduced shared modal ownership: {forbidden}")

facturas_index = read("src/css/views/facturas/index.css")
if '@import url("./resend-confirm.css");' not in facturas_index:
    fail("Facturas route entry must load its isolated resend-confirm domain component")
if not (ROOT / "src/css/views/facturas/resend-confirm.css").is_file():
    fail("Facturas resend-confirm.css domain component is missing")

for token in (
    ".incidencias-hero",
    ".facturas-hero",
    ".clientes-hero",
    ".usuarios-hero",
    ".server-hero",
    ".server-summary-grid",
):
    if token not in parity:
        fail(f"canonical listing foundation missing {token}")

print(
    "Private CSS authority contract OK · one listing foundation · one AvatarSystem paint authority · "
    "one Create foundation · Servidor base removed · route CSS domain-only"
)
