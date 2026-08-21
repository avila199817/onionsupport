#!/usr/bin/env python3
"""Static syntax checks for an untrusted Repository Integrity candidate."""

from __future__ import annotations

import ast
import json
import os
import sys
from pathlib import Path


PYTHON_FILES = (
    ".github/ci/validate_candidate_paths.py",
    ".github/ci/validate_integrity_candidate.py",
    ".github/scripts/repo_integrity.py",
    ".github/scripts/app_entrypoint_integrity.py",
    ".github/scripts/boot_visual_integrity.py",
    ".github/scripts/cuenta_integrity.py",
    ".github/scripts/public_home_integrity.py",
    ".github/scripts/public_home_performance.py",
    ".github/scripts/production_verify.py",
)

JSON_FILES = (
    "staticwebapp.config.json",
)


def candidate_root() -> Path:
    raw = os.environ.get("ONION_REPO_ROOT", "").strip()

    if not raw:
        raise RuntimeError("ONION_REPO_ROOT no está definido")

    root = Path(raw).resolve()

    if not root.is_dir():
        raise RuntimeError(f"candidate root inexistente: {root}")

    return root


def checked_file(root: Path, relative: str) -> Path:
    path = root / relative

    if path.is_symlink():
        raise RuntimeError(f"{relative}: symlink prohibido")

    try:
        resolved = path.resolve(strict=True)
    except OSError:
        raise RuntimeError(f"{relative}: archivo inexistente o ilegible") from None

    try:
        resolved.relative_to(root)
    except ValueError:
        raise RuntimeError(f"{relative}: resuelve fuera del candidate") from None

    if not resolved.is_file():
        raise RuntimeError(f"{relative}: no es un archivo regular")

    return resolved


def main() -> int:
    try:
        root = candidate_root()
    except RuntimeError as exc:
        print(f"::error title=Candidate inválido::{exc}")
        return 1

    errors: list[str] = []

    for relative in PYTHON_FILES:
        try:
            path = checked_file(root, relative)
            source = path.read_text(encoding="utf-8")
            ast.parse(source, filename=relative)
        except RuntimeError as exc:
            errors.append(str(exc))
        except UnicodeDecodeError:
            errors.append(f"{relative}: debe ser UTF-8")
        except SyntaxError as exc:
            errors.append(
                f"{relative}: sintaxis Python inválida "
                f"en línea {exc.lineno or '?'} columna {exc.offset or '?'}"
            )

    for relative in JSON_FILES:
        try:
            path = checked_file(root, relative)
            source = path.read_text(encoding="utf-8")
            json.loads(source)
        except RuntimeError as exc:
            errors.append(str(exc))
        except UnicodeDecodeError:
            errors.append(f"{relative}: debe ser UTF-8")
        except json.JSONDecodeError as exc:
            errors.append(
                f"{relative}: JSON inválido "
                f"en línea {exc.lineno} columna {exc.colno}"
            )

    if errors:
        for error in errors:
            print(f"::error title=Candidate CI/static syntax inválida::{error}")
        return 1

    print(
        "Candidate CI/static syntax OK · "
        f"Python={len(PYTHON_FILES)} · JSON={len(JSON_FILES)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
