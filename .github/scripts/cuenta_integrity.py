#!/usr/bin/env python3
"""Onion Support: Cuenta must expose only the current self-service surface."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "src/views/cuenta/index.js"
TEMPLATE = ROOT / "src/views/cuenta/cuenta.template.js"
CSS = ROOT / "src/css/views/cuenta/index.css"
ROUTES = ROOT / "src/router/routes.js"

FORBIDDEN_INDEX = (
    "LEGACY_ACCENT_STORAGE_KEY",
    "clearLegacyAccentPreference",
    "setAccentDeprecated",
    "loadCuentaSessionsApi",
    "legacySessions",
    "setAccent:",
    "updateAccent:",
    "loadSessions,",
    "loadCuentaSessions:",
    "refreshSessions:",
    "saveCuenta: () => false",
    "saveProfile: () => false",
    "updatePrivacy: () => false",
    "getSessions:",
    "export function saveCuenta",
    "export function setAccent",
    "export function loadSessions",
    "export function getSessions",
    "export function updatePrivacy",
)

FORBIDDEN_TEMPLATE = (
    "SET_ACCENT",
    "set-accent",
    "renderActivityCard",
    "renderSessionsCard",
    "renderIdentityCard",
    "renderPreferencesCard",
    "renderCuentaViewTemplate",
)

FORBIDDEN_CSS = (
    '#cuenta-hero-refresh-btn',
    '#cuenta-empty-refresh-btn',
    '[data-cuenta-action="refresh-cuenta"]',
    '[data-cuenta-action="set-accent"]',
    '.cuenta-panel-overlay',
    '.cuenta-refresh-overlay',
    '.cuenta-swatches',
    '.cuenta-swatch',
)

REQUIRED_INDEX = (
    '"cuenta.index.productivo.v8.canonical-surface"',
    "export function CuentaView",
    "loadCuenta as loadCuentaApi",
    "changePassword as changePasswordApi",
    "uploadCuentaAvatar as uploadCuentaAvatarApi",
    "deleteCuentaAvatar as deleteCuentaAvatarApi",
    "deactivateCuenta as deactivateCuentaApi",
    "function setTheme(",
    "function setLocale(",
    "function getSnapshot()",
)

REQUIRED_TEMPLATE = (
    '"cuenta.template.productivo.v7.canonical-surface"',
    "export function renderCuentaTemplate",
    "export function renderAppearanceCard",
    "CUENTA_ACTIONS.SET_THEME",
    "CUENTA_ACTIONS.SET_LOCALE",
    "CUENTA_ACTIONS.CHANGE_PASSWORD",
    "CUENTA_ACTIONS.DEACTIVATE",
)


def read(path: Path, errors: list[str]) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        errors.append(f"{path.relative_to(ROOT)} no se puede leer: {error}")
        return ""


def forbid(errors: list[str], text: str, tokens: tuple[str, ...], owner: str) -> None:
    for token in tokens:
        if token in text:
            errors.append(f"{owner}: compatibilidad/corrector muerto prohibido: {token}")


def require(errors: list[str], text: str, tokens: tuple[str, ...], owner: str) -> None:
    for token in tokens:
        if token not in text:
            errors.append(f"{owner}: falta contrato canónico: {token}")


def main() -> int:
    errors: list[str] = []
    index = read(INDEX, errors)
    template = read(TEMPLATE, errors)
    css = read(CSS, errors)
    routes = read(ROUTES, errors)

    forbid(errors, index, FORBIDDEN_INDEX, "src/views/cuenta/index.js")
    forbid(errors, template, FORBIDDEN_TEMPLATE, "src/views/cuenta/cuenta.template.js")
    forbid(errors, css, FORBIDDEN_CSS, "src/css/views/cuenta/index.css")

    require(errors, index, REQUIRED_INDEX, "src/views/cuenta/index.js")
    require(errors, template, REQUIRED_TEMPLATE, "src/views/cuenta/cuenta.template.js")

    if 'import(\n        "../views/cuenta/index.js"\n      )' not in routes:
        errors.append("src/router/routes.js: Cuenta debe seguir cargándose desde views/cuenta/index.js")

    if routes.count('"CuentaView"') < 2:
        errors.append("src/router/routes.js: cuenta y ajustes deben resolver CuentaView")

    if errors:
        print("Cuenta integrity: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Cuenta integrity: PASS")
    print("- superficie canónica sin accent/sessions/profile no-op legacy")
    print("- template sin aliases vacíos ni acciones retiradas")
    print("- CSS sin correctores de DOM histórico")
    print("- Router mantiene CuentaView para cuenta/ajustes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
