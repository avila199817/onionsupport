#!/usr/bin/env python3
"""Static regression guard for the public-home frame budget."""

from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "src/views/public/home/index.js"


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
    errors: list[str] = []

    forbidden = {
        "setInterval(": "public-home no puede volver a usar polling/heartbeat",
        '"wheel"': "el pipeline de scroll no debe escuchar wheel",
        '"touchmove"': "el pipeline de scroll no debe escuchar touchmove",
        "getScrollCandidates": "el scroll host no debe redescubrirse en cada frame",
        "getActiveScrollHost": "el scroll host debe resolverse una sola vez por mount",
        'addEvent(cleanups, document, "scroll"': "no debe existir scroll global capturado en document",
    }

    for token, message in forbidden.items():
        if token in source:
            fail(errors, message)

    required = {
        "public.home.view.controller.2026.24.frame-budgeted-scroll": "falta versión del runtime frame-budgeted",
        "function createFrameScheduler": "falta coalescing explícito por requestAnimationFrame",
        "metricsDirty": "falta invalidación explícita de geometría",
        '"ResizeObserver" in window': "falta invalidación estructural con ResizeObserver",
        "const STYLE_CACHE = new WeakMap()": "faltan escrituras CSS deduplicadas",
        'scrollPipeline: "single-listener-frame-budgeted"': "snapshot no expone el contrato del pipeline",
    }

    for token, message in required.items():
        if token not in source:
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

    if source.count("replace: true,") < 2:
        fail(errors, "la navegación interna debe conservar history.replaceState sin spam")

    if errors:
        print("Public home performance contract: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Public home performance contract: PASS")
    print("- 1 scroll listener")
    print("- 0 heartbeat/wheel/touchmove/document-scroll")
    print("- geometry invalidated by ResizeObserver/resize")
    print("- hot-path writes coalesced to one animation frame")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
