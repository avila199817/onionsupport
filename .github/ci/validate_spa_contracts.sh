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
        "goAfterLogin",
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
