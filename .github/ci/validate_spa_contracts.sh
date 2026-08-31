#!/usr/bin/env bash
set -euo pipefail

python3 -I - <<'PY'
from pathlib import Path
import sys

checks = {
    "src/views/public/index.js": (
        "PUBLIC_SHARED_VERSION",
        "PUBLIC_AUTH_LOGO",
        "export function escapeHtml",
        "export function escapeAttr",
        "export function renderPublicShell",
        "export function safeAssetSrc",
        "export function safeInternalHref",
    ),
    "src/views/public/login/index.js": (
        "LOGIN_VIEW_VERSION",
        "renderLoginView",
        "Auth as DefaultAuth",
        "createLoginTemplate",
        "handoffAfterLogin",
    ),
    "src/views/public/login/template.js": (
        "LOGIN_TEMPLATE_VERSION",
        "data-login-form",
        "login-identifier",
        "data-login-password",
        "data-login-submit",
        "data-login-forgot-password",
        "ROUTES.passwordRequest",
    ),
    "src/views/public/password-reset/index.js": (
        "PASSWORD_RESET_VIEW_VERSION",
        "renderPasswordResetView",
        "requestPasswordReset",
        "confirmResetPassword",
        "PasswordRequestView",
        "PasswordResetView",
    ),
    "src/views/public/password-reset/template.js": (
        "PASSWORD_RESET_TEMPLATE_VERSION",
        "createPasswordResetTemplate",
        "data-password-reset-form",
        "data-password-reset-submit",
        "password-reset-identifier",
        "password-reset-password",
        "password-reset-confirm",
    ),
    "src/router/routes.js": (
        "ROUTES_VERSION",
        "PASSWORD_REQUEST",
        'viewKey: "password-request"',
        'import("../views/public/password-reset/index.js")',
        '"PasswordRequestView"',
    ),
    "src/router/index.js": (
        "ROUTER_VERSION",
        "Router",
        "start",
        "bind",
        "onClick",
        "a[data-spa]",
        "a[data-route]",
    ),
    "src/app/index.js": (
        "APP_VERSION",
        "restoreSession",
        "Router",
        "start",
    ),
    "src/core/config.js": (
        "CONFIG_VERSION",
        'CANONICAL_PRODUCTION_API_BASE = "https://api.onionsupport.com"',
        'CANONICAL_FRONTEND_ORIGINS = Object.freeze([',
        '"https://onionsupport.com",',
    ),
    "src/views/incidencias/incidencias.api.js": (
        "INCIDENCIAS_DETAIL_REQUEST_COORDINATOR_VERSION",
        "createDetailRequestCoordinator",
        'import * as Impl from "./incidencias.api.impl.js"',
        "export function getIncidenciaByIdRequest",
        "export const loadIncidenciaDetail = getIncidenciaByIdRequest",
    ),
    "src/views/incidencias/incidencias.api.impl.js": (
        "INCIDENCIAS_API_VERSION",
        "getIncidenciaByIdRequest",
        "upsertCachedIncidencia",
    ),
}

errors = []

for file_name, tokens in checks.items():
    path = Path(file_name)
    if not path.is_file():
        errors.append(f"{file_name}: no existe")
        continue

    text = path.read_text(encoding="utf-8")
    for token in tokens:
        if token not in text:
            errors.append(f"{file_name}: falta {token!r}")

public_shared = Path("src/views/public/index.js").read_text(encoding="utf-8")
for forbidden in ("LOGIN_VIEW_VERSION", "renderLoginView"):
    if forbidden in public_shared:
        errors.append(
            f"src/views/public/index.js: token contaminante {forbidden!r}"
        )

if errors:
    for item in errors:
        print(f"::error title=Contrato SPA crítico inválido::{item}")
    sys.exit(1)

print("Contratos SPA críticos OK.")
PY

python3 .github/scripts/private_css_authority_contract.py
python3 .github/scripts/facturas_loading_parity_contract.py
python3 .github/scripts/incidencias_skeleton_contract.py

node .github/scripts/core_runtime_contract.mjs
node .github/scripts/core_snapshot_contract.mjs
node .github/scripts/auth_selector_contract.mjs
node .github/scripts/auth_logout_contract.mjs
node .github/scripts/router_runtime_contract.mjs
node .github/scripts/shell_runtime_contract.mjs
node .github/scripts/private_runtime_auth_contract.mjs
node .github/scripts/public_home_session_handoff_contract.mjs
node .github/scripts/private_css_entry_contract.mjs
node .github/scripts/login_document_handoff_contract.mjs
node .github/scripts/login_accessibility_contract.mjs
node .github/scripts/view_runtime_state_contract.mjs
node .github/scripts/home_runtime_state_contract.mjs
node .github/scripts/home_view_runtime_context_contract.mjs
node .github/scripts/navigation_performance_contract.mjs
node .github/scripts/incidencias_detail_request_contract.mjs
node .github/scripts/incidencias_list_response_v2_contract.mjs
node .github/scripts/facturas_document_flow_contract.mjs

node "${ROOT_DIR:-$(git rev-parse --show-toplevel)}/.github/scripts/entity_overlay_contract.mjs"
