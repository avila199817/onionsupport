#!/usr/bin/env python3
"""Onion Support repository integrity checks.

Dependency-free and intentionally conservative: validate only references that can
be resolved statically without executing the SPA or guessing runtime values.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"

JS_IMPORT_PATTERNS = (
    re.compile(r"""import\s+(?:[^'\"]+?\s+from\s+)?['\"]([^'\"]+)['\"]"""),
    re.compile(r"""export\s+[^'\"]+?\s+from\s+['\"]([^'\"]+)['\"]"""),
    re.compile(r"""import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)"""),
)
CSS_IMPORT_PATTERN = re.compile(
    r"@import\s+(?:url\(\s*)?['\"]?([^'\"\)\s]+)['\"]?\s*\)?",
    re.IGNORECASE,
)
IMPORT_META_URL_PATTERN = re.compile(
    r"new\s+URL\(\s*['\"]([^'\"]+)['\"]\s*,\s*import\.meta\.url\s*\)",
    re.MULTILINE,
)
ROOT_ASSET_PATTERN = re.compile(
    r"['\"](/src/(?:css|media)/[^'\"?#]+(?:\?[^'\"#]*)?(?:#[^'\"]*)?)['\"]"
)
EXTERNAL_SCHEMES = ("http://", "https://", "data:", "blob:")


def clean_spec(value: str) -> str:
    return (value or "").strip()


def strip_query_fragment(value: str) -> str:
    return urlsplit(value).path or ""


def resolve_local(owner: Path, spec: str) -> Path | None:
    spec = clean_spec(spec)
    if not spec or spec.startswith(EXTERNAL_SCHEMES) or spec.startswith("//"):
        return None

    path_part = strip_query_fragment(spec)
    if not path_part:
        return None

    if path_part.startswith("/"):
        return ROOT / path_part.lstrip("/")

    return (owner.parent / path_part).resolve()


def module_candidates(path: Path) -> tuple[Path, ...]:
    candidates = [path]
    if path.suffix == "":
        candidates.extend((path.with_suffix(".js"), path / "index.js"))
    return tuple(candidates)


def record_missing(errors: list[str], owner: Path, spec: str, kind: str) -> None:
    errors.append(f"{owner.relative_to(ROOT)} :: {kind} local inexistente: {spec}")


def validate_js_references(errors: list[str]) -> None:
    for js_file in sorted(SRC.rglob("*.js")):
        text = js_file.read_text(encoding="utf-8")

        for pattern in JS_IMPORT_PATTERNS:
            for match in pattern.finditer(text):
                spec = clean_spec(match.group(1))
                target = resolve_local(js_file, spec)
                if target is None:
                    continue
                if not any(candidate.is_file() for candidate in module_candidates(target)):
                    record_missing(errors, js_file, spec, "import")

        for match in IMPORT_META_URL_PATTERN.finditer(text):
            spec = clean_spec(match.group(1))
            target = resolve_local(js_file, spec)
            if target is not None and not target.is_file():
                record_missing(errors, js_file, spec, "asset import.meta.url")

        for match in ROOT_ASSET_PATTERN.finditer(text):
            spec = clean_spec(match.group(1))
            target = resolve_local(js_file, spec)
            if target is not None and not target.is_file():
                record_missing(errors, js_file, spec, "asset /src")


def validate_css_references(errors: list[str]) -> None:
    for css_file in sorted((SRC / "css").rglob("*.css")):
        text = css_file.read_text(encoding="utf-8")
        for match in CSS_IMPORT_PATTERN.finditer(text):
            spec = clean_spec(match.group(1))
            target = resolve_local(css_file, spec)
            if target is not None and not target.is_file():
                record_missing(errors, css_file, spec, "@import")


def validate_paths(errors: list[str]) -> None:
    for root in (SRC, ROOT / ".github"):
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if any(part != part.strip() for part in path.relative_to(ROOT).parts):
                errors.append(f"{path.relative_to(ROOT)} :: ruta con espacios iniciales/finales")


def validate_known_dead_paths(errors: list[str]) -> None:
    forbidden = {
        "ajustes.state.js",
        "ajustes.store.js",
        "ajustes.model.js",
        "ajustesView.js",
        "ajustesEditView.js",
    }

    for js_file in sorted(SRC.rglob("*.js")):
        text = js_file.read_text(encoding="utf-8")
        for name in forbidden:
            if name in text:
                errors.append(
                    f"{js_file.relative_to(ROOT)} :: referencia legacy prohibida: {name}"
                )


def main() -> int:
    errors: list[str] = []
    validate_paths(errors)
    validate_js_references(errors)
    validate_css_references(errors)
    validate_known_dead_paths(errors)

    unique_errors = list(dict.fromkeys(errors))
    if unique_errors:
        print("Repository integrity FAILED:")
        for item in unique_errors:
            print(f" - {item}")
        return 1

    js_count = sum(1 for _ in SRC.rglob("*.js"))
    css_count = sum(1 for _ in (SRC / "css").rglob("*.css"))
    print(f"Repository integrity OK · JS={js_count} · CSS={css_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
