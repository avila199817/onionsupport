#!/usr/bin/env python3
"""Trusted public-home policy layered on the byte-identical core contract."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

LEGACY_DIMENSION_MESSAGES = frozenset(
    {
        "Falta anchura intrínseca del técnico",
        "Falta altura intrínseca del técnico",
    }
)


def resolve_core_path() -> Path:
    sibling = Path(__file__).resolve().with_name("public_home_integrity_core.py")
    if sibling.is_file():
        return sibling

    workspace = Path(os.environ.get("GITHUB_WORKSPACE", "")).resolve()
    trusted = (
        workspace
        / "trusted-integrity-source"
        / ".github"
        / "scripts"
        / "public_home_integrity_core.py"
    )
    if trusted.is_file():
        return trusted

    raise FileNotFoundError("Trusted public-home core contract not found")


def load_core():
    path = resolve_core_path()
    spec = importlib.util.spec_from_file_location("onion_public_home_integrity_core", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load trusted public-home core: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def transition_errors(core) -> list[str]:
    errors: list[str] = []
    intake = core.read("src/features/public-support/index.js")

    legacy_fallback = (
        'const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = "/src/media/img/Cristian_Avila_Formulario.png";'
        in intake
    )
    webp_fallback = (
        'const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = "/src/media/img/Cristian_Avila_Formulario_960.webp";'
        in intake
    )
    legacy_dimensions = 'width="1122"' in intake and 'height="1402"' in intake
    webp_dimensions = 'width="960"' in intake and 'height="1200"' in intake

    if legacy_fallback == webp_fallback:
        errors.append(
            "El fallback del técnico debe ser exactamente PNG legado o WebP 960 durante la transición"
        )
    if legacy_dimensions == webp_dimensions:
        errors.append(
            "Las dimensiones del técnico deben ser exactamente 1122×1402 o 960×1200 durante la transición"
        )
    if webp_fallback != webp_dimensions:
        errors.append(
            "El fallback WebP 960 y sus dimensiones 960×1200 deben migrar de forma atómica"
        )

    for relative, expected in (
        ("src/media/img/Cristian_Avila_Formulario_480.webp", (480, 600)),
        ("src/media/img/Cristian_Avila_Formulario_960.webp", (960, 1200)),
    ):
        try:
            actual = core.webp_dimensions(relative)
        except (OSError, ValueError) as error:
            errors.append(f"WebP inválido: {relative} ({error})")
            continue
        if actual != expected:
            errors.append(
                f"Dimensiones WebP inválidas: {relative} es {actual}, esperado {expected}"
            )

    return errors


def main() -> int:
    core = load_core()
    errors = transition_errors(core)
    if errors:
        print("\nPublic home transition policy: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    original_require = core.require

    def require_with_dimension_transition(
        contract_errors: list[str], condition: bool, message: str
    ) -> None:
        if message in LEGACY_DIMENSION_MESSAGES:
            return
        original_require(contract_errors, condition, message)

    core.require = require_with_dimension_transition
    status = core.main()
    if status != 0:
        return status

    print(
        "Public home transition policy: PASS · technician fallback/dimensions bounded · "
        "WebP 480×600 + 960×1200 verified"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
