#!/usr/bin/env python3
"""Onion Support: contract for the single browser entrypoint."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "index.html"
MAIN = ROOT / "src/main.js"
ENHANCEMENTS = ROOT / "src/app/enhancements.js"
APP_CSS = ROOT / "src/css/app.css"

CANONICAL_MODULES = (
    "../features/ticket-deeplink/index.js",
    "../ui/chrome/index.js",
    "../features/mobile-datalist/index.js",
    "../features/facturas-autorefresh/index.js",
    "../features/incidencias-media-preview/index.js",
    "../features/public-support/index.js",
    "../features/public-support-progress/index.js",
    "../features/public-home-experience/index.js",
)


class IndexParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.scripts: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        data = {str(key).lower(): str(value or "") for key, value in attrs}
        if tag.lower() == "script":
            self.scripts.append(data)
        elif tag.lower() == "link":
            self.links.append(data)


def read(path: Path, errors: list[str]) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"No se puede leer {path.relative_to(ROOT)}: {exc}")
        return ""


def main() -> int:
    errors: list[str] = []

    for required in (INDEX, MAIN, ENHANCEMENTS, APP_CSS):
        if not required.is_file():
            errors.append(f"Falta archivo obligatorio: {required.relative_to(ROOT)}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    index_text = read(INDEX, errors)
    main_text = read(MAIN, errors)
    enhancements_text = read(ENHANCEMENTS, errors)
    app_css_text = read(APP_CSS, errors)

    parser = IndexParser()
    parser.feed(index_text)

    module_scripts = [
        script
        for script in parser.scripts
        if script.get("type", "").strip().lower() == "module"
    ]

    if len(module_scripts) != 1:
        errors.append(
            f"index.html debe ejecutar exactamente un script type=module; encontrados: {len(module_scripts)}"
        )
    elif module_scripts[0].get("src") != "/src/main.js":
        errors.append(
            "El único script type=module de index.html debe ser /src/main.js"
        )

    direct_global_modules = [
        script.get("src", "")
        for script in module_scripts
        if script.get("src", "").startswith(("/src/features/", "/src/ui/"))
    ]
    if direct_global_modules:
        errors.append(
            "index.html ejecuta módulos globales fuera del entrypoint: "
            + ", ".join(direct_global_modules)
        )

    direct_progress_css = any(
        link.get("rel", "").lower() == "stylesheet"
        and link.get("href") == "/src/css/views/public/public-support-progress.css"
        for link in parser.links
    )
    if direct_progress_css:
        errors.append(
            "public-support-progress.css debe entrar por src/css/app.css, no por index.html"
        )

    css_import_pattern = re.compile(
        r"@import\s+url\([\"']\./views/public/public-support-progress\.css[\"']\)",
        re.IGNORECASE,
    )
    if not css_import_pattern.search(app_css_text):
        errors.append(
            "src/css/app.css debe importar ./views/public/public-support-progress.css"
        )

    if 'const ENHANCEMENTS_MODULE = "./app/enhancements.js";' not in main_text:
        errors.append("src/main.js no declara el registry canónico de enhancements")

    for call in (
        "enhancements.initPreRouter()",
        "enhancements.initPostRouter()",
    ):
        if call not in main_text:
            errors.append(f"src/main.js no orquesta {call}")

    for module_path in CANONICAL_MODULES:
        if module_path not in enhancements_text:
            errors.append(
                f"src/app/enhancements.js no registra el módulo canónico: {module_path}"
            )

    if enhancements_text.count("ticket-deeplink/index.js") != 1:
        errors.append("ticket-deeplink debe registrarse exactamente una vez")

    if enhancements_text.count("../ui/chrome/index.js") != 1:
        errors.append("App Chrome debe registrarse exactamente una vez")

    if errors:
        print("\nApp entrypoint integrity: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("App entrypoint integrity: PASS")
    print("- index.html: 1 módulo ejecutable (/src/main.js)")
    print(f"- registry global: {len(CANONICAL_MODULES)} módulos")
    print("- CSS público progresivo centralizado en app.css")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
