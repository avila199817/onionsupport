#!/usr/bin/env python3
"""Reject backup, editor and generated artifacts from the frontend repository.

This check is intentionally narrow. It does not duplicate JavaScript, CSS or
runtime contract validation already owned by repo_integrity.py; it only keeps
files that should never be committed or shipped with the static application out
of the repository.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(
    os.environ.get(
        "ONION_REPO_ROOT",
        str(Path(__file__).resolve().parents[2]),
    )
).resolve()

IGNORED_DIRS = frozenset({".git"})
FORBIDDEN_DIRS = frozenset(
    {
        "node_modules",
        "coverage",
        ".nyc_output",
        ".pytest_cache",
        "__pycache__",
    }
)

FORBIDDEN_FILE_RE = re.compile(
    r"(?:"
    r"\.bak(?:[-.]|$)|"
    r"\.backup(?:[-.]|$)|"
    r"\.old$|"
    r"\.orig$|"
    r"\.rej$|"
    r"\.sw[op]$|"
    r"\.tmp$|"
    r"~$|"
    r"^\.DS_Store$|"
    r"^Thumbs\.db$"
    r")",
    re.IGNORECASE,
)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def scan() -> tuple[list[str], int]:
    errors: list[str] = []
    files_seen = 0

    for current, dirs, files in os.walk(ROOT):
        current_path = Path(current)

        kept_dirs: list[str] = []
        for name in dirs:
            if name in IGNORED_DIRS:
                continue

            target = current_path / name
            if name in FORBIDDEN_DIRS:
                errors.append(
                    f"{rel(target)} :: directorio generado/prohibido dentro del repositorio"
                )
                continue

            kept_dirs.append(name)

        dirs[:] = kept_dirs

        for name in files:
            files_seen += 1
            path = current_path / name

            if FORBIDDEN_FILE_RE.search(name):
                errors.append(
                    f"{rel(path)} :: backup/temporal/editor artefact prohibido"
                )

    return errors, files_seen


def main() -> int:
    if not ROOT.is_dir():
        print(f"Artifact hygiene ERROR: repository root not found: {ROOT}", file=sys.stderr)
        return 2

    errors, files_seen = scan()

    if errors:
        print("Artifact hygiene FAILED", file=sys.stderr)
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        return 1

    print(f"Artifact hygiene OK · {files_seen} files scanned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
