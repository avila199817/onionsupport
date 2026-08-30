#!/usr/bin/env python3
"""Static syntax and production-workflow checks for an untrusted candidate."""

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

SWA_PRODUCTION_WORKFLOW = (
    ".github/workflows/azure-static-web-apps-polite-bay-086469a1e.yml"
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


def validate_swa_provenance_contract(root: Path, errors: list[str]) -> None:
    """Require PR provenance before an automatic SWA production deploy.

    This validator runs from the trusted base checkout in pull_request_target.
    The workflow being inspected is candidate data, so changing the candidate
    copy of this validator cannot weaken the check for the current PR.
    """

    try:
        path = checked_file(root, SWA_PRODUCTION_WORKFLOW)
        source = path.read_text(encoding="utf-8")
    except RuntimeError as exc:
        errors.append(str(exc))
        return
    except UnicodeDecodeError:
        errors.append(f"{SWA_PRODUCTION_WORKFLOW}: debe ser UTF-8")
        return

    required_markers = (
        (
            "pull-requests: read",
            "el job de validación necesita pull-requests: read para comprobar procedencia",
        ),
        (
            "- name: Require merged pull request for automatic production",
            "falta el gate de procedencia de producción",
        ),
        (
            "if: github.event_name != 'workflow_dispatch'",
            "el gate automático debe conservar workflow_dispatch como escape explícito",
        ),
        (
            "GITHUB_TOKEN: ${{ github.token }}",
            "el gate debe usar el token efímero del workflow",
        ),
        (
            '"https://api.github.com/repos/${REPOSITORY}/commits/${REVISION}/pulls"',
            "el gate debe resolver la asociación commit -> pull request",
        ),
        (
            'select(.merged_at != null and .base.ref == "main")',
            "el gate debe exigir una PR fusionada cuyo destino sea main",
        ),
        (
            "Automatic production rejected:",
            "el gate debe fallar cerrado cuando no existe PR fusionada",
        ),
    )

    for marker, message in required_markers:
        if marker not in source:
            errors.append(f"{SWA_PRODUCTION_WORKFLOW}: {message}")

    lock_marker = "      - name: Lock validated revision"
    gate_marker = "      - name: Require merged pull request for automatic production"
    validation_marker = "      - name: Stage trusted validation tooling"

    lock_index = source.find(lock_marker)
    gate_index = source.find(gate_marker)
    validation_index = source.find(validation_marker)

    if not (
        lock_index >= 0
        and gate_index > lock_index
        and validation_index > gate_index
    ):
        errors.append(
            f"{SWA_PRODUCTION_WORKFLOW}: el gate de procedencia debe ejecutarse "
            "después de fijar el SHA y antes de validar/materializar el release"
        )

    if "pull_request:" in source.split("on:", 1)[-1].split("concurrency:", 1)[0]:
        errors.append(
            f"{SWA_PRODUCTION_WORKFLOW}: el workflow productivo no debe desplegar "
            "directamente desde el evento pull_request"
        )


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

    validate_swa_provenance_contract(root, errors)

    if errors:
        for error in errors:
            print(f"::error title=Candidate CI/static syntax inválida::{error}")
        return 1

    print(
        "Candidate CI/static syntax OK · "
        f"Python={len(PYTHON_FILES)} · JSON={len(JSON_FILES)} · "
        "SWA provenance=locked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
