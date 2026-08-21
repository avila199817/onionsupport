#!/usr/bin/env python3
"""Reject candidate repository paths that can escape the validation boundary."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def main() -> int:
    raw_root = os.environ.get("ONION_REPO_ROOT", "").strip()

    if not raw_root:
        print(
            "::error title=Candidate root ausente::"
            "ONION_REPO_ROOT no está definido."
        )
        return 1

    root = Path(raw_root).resolve()

    if not root.exists():
        print(
            "::error title=Candidate root inexistente::"
            f"{root} no existe."
        )
        return 1

    try:
        raw_index = subprocess.check_output(
            ["git", "-C", str(root), "ls-files", "-s", "-z"]
        )
    except subprocess.CalledProcessError as exc:
        print(
            "::error title=Índice Git ilegible::"
            f"No se pudo inspeccionar el candidate checkout: {exc}."
        )
        return 1

    errors: list[str] = []
    tracked = 0

    for record in raw_index.split(b"\0"):
        if not record:
            continue

        metadata, separator, raw_path = record.partition(b"\t")

        if not separator:
            errors.append(f"entrada de índice Git malformada: {record!r}")
            continue

        fields = metadata.split()

        if len(fields) < 3:
            errors.append(f"metadata Git inesperada: {metadata!r}")
            continue

        mode = fields[0].decode("ascii", "replace")
        path_text = os.fsdecode(raw_path)
        relative = Path(path_text)
        tracked += 1

        display = repr(path_text)

        if mode == "120000":
            errors.append(f"{display}: symlink Git prohibido")
            continue

        if mode == "160000":
            errors.append(f"{display}: gitlink/submodule prohibido")
            continue

        if relative.is_absolute():
            errors.append(f"{display}: path absoluto prohibido")
            continue

        if any(part in {"", ".", ".."} for part in relative.parts):
            errors.append(f"{display}: componente de path inseguro")
            continue

        if any(part != part.strip() for part in relative.parts):
            errors.append(
                f"{display}: espacios al principio/final de un componente"
            )

        if any(ord(char) < 32 or ord(char) == 127 for char in path_text):
            errors.append(f"{display}: caracteres de control prohibidos")

        full = root / relative

        if full.is_symlink():
            errors.append(f"{display}: symlink materializado prohibido")
            continue

        resolved = full.resolve(strict=False)

        try:
            resolved.relative_to(root)
        except ValueError:
            errors.append(
                f"{display}: resuelve fuera del candidate checkout hacia {resolved}"
            )

    if errors:
        for item in errors:
            print(
                "::error title=Candidate path boundary inválido::"
                f"{item}"
            )
        return 1

    print(
        "Candidate path boundary OK · "
        f"tracked={tracked} · symlinks=0 · gitlinks=0 · escapes=0"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
