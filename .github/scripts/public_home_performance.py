#!/usr/bin/env python3
"""Static regression guard for the public-home scroll/frame contract."""

from __future__ import annotations

import os
from pathlib import Path
import re
import sys

ROOT = Path(
    os.environ.get(
        "ONION_REPO_ROOT",
        str(Path(__file__).resolve().parents[2]),
    )
).resolve()
HOME = ROOT / "src/views/public/home/index.js"
HOME_CSS = ROOT / "src/css/views/public/index.css"
HOME_EXPERIENCE = ROOT / "src/features/public-home-experience/index.js"


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def function_body(source: str, name: str, next_name: str) -> str:
    start = source.find(f"function {name}")
    end = source.find(f"function {next_name}", start + 1)
    if start < 0:
        return ""
    return source[start:] if end < 0 else source[start:end]


def main() -> int:
    source = HOME.read_text(encoding="utf-8")
    css = HOME_CSS.read_text(encoding="utf-8")
    experience = HOME_EXPERIENCE.read_text(encoding="utf-8")
    errors: list[str] = []

    forbidden = {
        "setInterval(": "public-home no puede volver a usar polling/heartbeat",
        '"wheel"': "el pipeline de scroll no debe escuchar wheel",
        '"touchmove"': "el pipeline de scroll no debe escuchar touchmove",
        "getScrollCandidates": "el scroll host no debe redescubrirse en cada frame",
        "getActiveScrollHost": "el scroll host debe resolverse una sola vez por mount",
        "function isScrollableElement": "el host no puede inferirse por geometría durante el mount oculto",
        'addEvent(cleanups, document, "scroll"': "no debe existir scroll global capturado en document",
    }

    for token, message in forbidden.items():
        if token in source:
            fail(errors, message)

    required = {
        "public.home.view.controller.2026.25.cold-boot-main-content": "falta versión cold-boot safe",
        "function createFrameScheduler": "falta coalescing explícito por requestAnimationFrame",
        "metricsDirty": "falta invalidación explícita de geometría",
        '"ResizeObserver" in window': "falta invalidación estructural con ResizeObserver",
        "const STYLE_CACHE = new WeakMap()": "faltan escrituras CSS deduplicadas",
        'refs.root.closest?.(".main-content")': "la home debe resolver .main-content por contrato DOM",
        'document.getElementById("main-content")': "falta fallback canónico a #main-content",
        'scrollContract: "main-content-deterministic"': "snapshot no expone el contrato determinista",
        'scrollPipeline: "single-listener-frame-budgeted"': "snapshot no expone el contrato frame-budgeted",
    }

    for token, message in required.items():
        if token not in source:
            fail(errors, message)

    css_required = {
        "ÚNICO scroll real de la landing": "el CSS debe documentar la autoridad única de scroll",
        "body.public-home-screen .main-content": "el CSS debe gobernar .main-content en public-home",
        "overflow-y: auto;": "el host canónico debe permitir scroll vertical",
    }

    for token, message in css_required.items():
        if token not in css:
            fail(errors, message)

    scroll_listener_count = len(
        re.findall(
            r"addEvent\(cleanups,\s*scrollTarget,\s*[\"']scroll[\"']",
            source,
        )
    )
    if scroll_listener_count != 1:
        fail(
            errors,
            f"public-home debe registrar exactamente un listener del scroll host; encontrados {scroll_listener_count}",
        )

    hot_path = function_body(source, "writeProgress", "initActiveSection")
    if not hot_path:
        fail(errors, "no se pudo localizar writeProgress()")
    else:
        for token in ("getBoundingClientRect(", "getComputedStyle(", "querySelector("):
            if token in hot_path:
                fail(errors, f"writeProgress() contiene lectura estructural caliente: {token}")

    host_resolver = function_body(source, "resolveScrollHost", "isWindowHost")
    if not host_resolver:
        fail(errors, "no se pudo localizar resolveScrollHost()")
    else:
        for token in ("scrollHeight", "clientHeight", "getComputedStyle"):
            if token in host_resolver:
                fail(errors, f"resolveScrollHost() no puede depender de geometría/estilos: {token}")

    if source.count("replace: true,") < 2:
        fail(errors, "la navegación interna debe conservar history.replaceState sin spam")

    experience_forbidden = {
        "AppCore?.getState?.()": "public-home experience no debe construir snapshots públicos en scans",
        "AppCore?.state": "public-home experience no debe leer estado canónico mutable directamente",
        "AppCore?.isAuthenticated?.()": "public-home experience no debe rereleer Core mediante isAuthenticated()",
    }

    for token, message in experience_forbidden.items():
        if token in experience:
            fail(errors, message)

    state_reader = function_body(experience, "appState", "currentUser")
    if not state_reader:
        fail(errors, "no se pudo localizar appState() en public-home experience")
    elif state_reader.count("runtimeState?.read?.()") != 1:
        fail(errors, "appState() debe ejecutar exactamente una lectura zero-copy de runtimeState")

    current_user = function_body(experience, "currentUser", "authenticated")
    if not current_user or "appState(" in current_user:
        fail(errors, "currentUser() debe consumir únicamente el state suministrado")

    auth_selector = function_body(experience, "authenticated", "safePath")
    if not auth_selector:
        fail(errors, "no se pudo localizar authenticated() en public-home experience")
    else:
        if "state.authenticated === true" not in auth_selector:
            fail(errors, "authenticated() debe derivar auth del state suministrado")
        for token in ("appState(", "AppCore"):
            if token in auth_selector:
                fail(errors, f"authenticated() contiene reread de Core: {token}")

    panel_path = function_body(experience, "panelPath", "compactDisplayName")
    if not panel_path:
        fail(errors, "no se pudo localizar panelPath() en public-home experience")
    else:
        if "currentUser(state)" not in panel_path:
            fail(errors, "panelPath() debe reutilizar el state al resolver usuario")
        if "appState(" in panel_path:
            fail(errors, "panelPath() no puede rereleer Core")

    account_menu = function_body(experience, "ensureAccountMenu", "enforceHeaderActionOrder")
    if not account_menu:
        fail(errors, "no se pudo localizar ensureAccountMenu() en public-home experience")
    else:
        for snippet, message in (
            ("authenticated(state)", "ensureAccountMenu() debe reutilizar state para auth"),
            ("panelPath(link, state)", "ensureAccountMenu() debe reutilizar state para home path"),
        ):
            if snippet not in account_menu:
                fail(errors, message)
        if "appState(" in account_menu:
            fail(errors, "ensureAccountMenu() no puede rereleer Core")

    enhance = function_body(experience, "enhance", "scan")
    if not enhance or "ensureAccountMenu(root, state)" not in enhance:
        fail(errors, "enhance() debe propagar el state del scan a account menu")

    scan = function_body(experience, "scan", "queueScan")
    if not scan:
        fail(errors, "no se pudo localizar scan() en public-home experience")
    else:
        if scan.count("appState()") != 1:
            fail(errors, "scan() debe ejecutar exactamente una lectura Core por operación")
        if "enhance(root, state)" not in scan:
            fail(errors, "scan() debe reutilizar el mismo state para todos los roots")
        if "if (!roots.length) return false;" not in scan:
            fail(errors, "scan() debe evitar leer Core cuando no existe public-home")
        roots_index = scan.find("document.querySelectorAll(HOME)")
        state_index = scan.find("const state = appState()")
        if roots_index < 0 or state_index < 0 or roots_index > state_index:
            fail(errors, "scan() debe comprobar roots antes de leer Core")

    if errors:
        print("Public home performance contract: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Public home performance contract: PASS")
    print("- deterministic .main-content scroll host")
    print("- 1 scroll listener")
    print("- 0 heartbeat/wheel/touchmove/document-scroll")
    print("- geometry invalidated by ResizeObserver/viewport")
    print("- hot-path writes coalesced to one animation frame")
    print("- public-home experience uses one zero-copy Core read per scan")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())