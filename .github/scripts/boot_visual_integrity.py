#!/usr/bin/env python3
"""Guard the boot paint barrier that prevents route CSS FOUC."""

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
LOADER = ROOT / "src/app/loader.js"
ROUTE_STYLES = ROOT / "src/router/styles.js"
INDEX = ROOT / "index.html"


def main() -> int:
    loader = LOADER.read_text(encoding="utf-8")
    styles = ROUTE_STYLES.read_text(encoding="utf-8")
    index = INDEX.read_text(encoding="utf-8")
    errors: list[str] = []

    required_loader = {
        "app.loader.minimal.v5-paint-barrier": "falta versión del loader con paint barrier",
        "const HIDE_PAINT_FRAMES = 2;": "el loader debe cubrir al menos dos paints de estabilización",
        "function scheduleHideAfterPaint()": "falta scheduler de ocultación por paint",
        "function cancelPendingHide()": "showLoader debe poder cancelar una ocultación pendiente",
        "return scheduleHideAfterPaint();": "hideLoader debe usar la barrera de pintura",
        "cancelPendingHide();": "el loader visible debe invalidar hides obsoletos",
        "hideLoaderImmediately": "falta escape explícito para ocultación inmediata controlada",
        "requestAnimationFrame": "la barrera debe sincronizarse con el pipeline de pintura",
    }

    for token, message in required_loader.items():
        if token not in loader:
            errors.append(message)

    match = re.search(r"const\s+HIDE_PAINT_FRAMES\s*=\s*(\d+)\s*;", loader)
    if not match or int(match.group(1)) < 2:
        errors.append("HIDE_PAINT_FRAMES debe ser >= 2")

    hide_body = re.search(
        r"export\s+function\s+hideLoader\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
        loader,
        re.DOTALL,
    )
    if not hide_body:
        errors.append("no se pudo localizar hideLoader()")
    else:
        body = hide_body.group("body")
        if "writeLoader(false" in body:
            errors.append("hideLoader() no puede retirar el loader inmediatamente")
        if "setTimeout" in body:
            errors.append("hideLoader() no puede usar una espera temporal arbitraria")

    for token, message in (
        ('MEDIA_INACTIVE =\n  "not all"', "RouteStyles debe conservar descarga inactiva previa al commit"),
        ("setManagedLinkActive", "RouteStyles debe activar hojas gestionadas explícitamente"),
        ("prepareRouteStyles", "RouteStyles debe conservar fase prepare"),
    ):
        if token not in styles:
            errors.append(message)

    for token, message in (
        ('id="app-loader"', "index.html debe contener el loader canónico"),
        ('class="app-loader is-visible"', "el loader debe comenzar visible en cold boot"),
        ('data-app-loading="true"', "el documento debe comenzar en estado loading"),
    ):
        if token not in index:
            errors.append(message)

    if errors:
        print("Boot visual integrity: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Boot visual integrity: PASS")
    print("- loader starts visible")
    print("- route CSS is preloaded inactive")
    print("- hide is deferred through two animation-frame paints")
    print("- pending hides are cancellable and idempotent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
