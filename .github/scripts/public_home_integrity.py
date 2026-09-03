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

WEBP_FALLBACK = (
    'const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = '
    '"/src/media/img/Cristian_Avila_Formulario_960.webp";'
)
LEGACY_PNG_FALLBACK = (
    'const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = '
    '"/src/media/img/Cristian_Avila_Formulario.png";'
)
LEGACY_PNG_PATHS = (
    "src/media/img/Cristian_Avila.png",
    "src/media/img/Cristian_Avila_Formulario.png",
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


def photo_policy_errors(core) -> list[str]:
    errors: list[str] = []
    intake = core.read("src/features/public-support/index.js")

    if WEBP_FALLBACK not in intake:
        errors.append("El fallback del técnico debe ser exclusivamente WebP 960")
    if LEGACY_PNG_FALLBACK in intake:
        errors.append("El fallback PNG legado del técnico no puede reintroducirse")

    if 'width="960"' not in intake or 'height="1200"' not in intake:
        errors.append("Las dimensiones intrínsecas del técnico deben ser 960×1200")
    if 'width="1122"' in intake or 'height="1402"' in intake:
        errors.append("Las dimensiones legacy 1122×1402 no pueden reintroducirse")

    root = Path(core.ROOT)
    for relative in LEGACY_PNG_PATHS:
        if (root / relative).exists():
            errors.append(f"Asset PNG legado reintroducido: {relative}")

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
    errors = photo_policy_errors(core)
    if errors:
        print("\nPublic home photo policy: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    original_require = core.require

    def require_with_modern_dimensions(
        contract_errors: list[str], condition: bool, message: str
    ) -> None:
        if message in LEGACY_DIMENSION_MESSAGES:
            return
        original_require(contract_errors, condition, message)

    core.require = require_with_modern_dimensions
    status = core.main()
    if status != 0:
        return status

    print(
        "Public home photo policy: PASS · WebP-only fallback 960×1200 enforced · "
        "WebP 480×600 + 960×1200 bytes verified"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
