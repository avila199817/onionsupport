#!/usr/bin/env python3
"""Onion Support: single entrypoint and global runtime ownership contract."""

from __future__ import annotations

from html.parser import HTMLParser
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

PUBLIC_ROUTE_CSS = (
    "/src/css/views/public/index.css",
    "/src/css/views/public/support-request.css",
    "/src/css/views/public/public-support-progress.css",
    "/src/css/views/public/home-experience.css",
)

RUNTIME_FILES = {
    "loader": ROOT / "src/app/loader.js",
    "deeplink": ROOT / "src/features/ticket-deeplink/index.js",
    "facturas_refresh": ROOT / "src/features/facturas-autorefresh/index.js",
    "incidencias_preview": ROOT / "src/features/incidencias-media-preview/index.js",
    "public_support": ROOT / "src/features/public-support/index.js",
    "public_progress": ROOT / "src/features/public-support-progress/index.js",
    "chrome": ROOT / "src/ui/chrome/index.js",
    "preboot": ROOT / "src/preboot/theme.js",
    "route_styles": ROOT / "src/router/styles.js",
}


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


def require(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def public_home_manifest(route_styles: str) -> str:
    match = re.search(
        r'"public-home"\s*:\s*Object\.freeze\(\[(?P<body>.*?)\]\)',
        route_styles,
        re.DOTALL,
    )
    return match.group("body") if match else ""


def validate_runtime_boundaries(errors: list[str], runtime: dict[str, str]) -> None:
    loader = runtime["loader"]
    deeplink = runtime["deeplink"]
    facturas = runtime["facturas_refresh"]
    preview = runtime["incidencias_preview"]
    public_support = runtime["public_support"]
    progress = runtime["public_progress"]
    chrome = runtime["chrome"]
    preboot = runtime["preboot"]
    route_styles = runtime["route_styles"]

    require(
        errors,
        "export function hideLoader" in loader
        and "forceHideLoader" not in loader,
        "app/loader.js debe exponer sólo hideLoader como cierre canónico",
    )

    require(
        errors,
        "observer.observe(root" in deeplink
        and "observer.observe(document.documentElement" not in deeplink,
        "ticket-deeplink debe observar sólo el Router view",
    )

    require(
        errors,
        "MutationObserver" not in facturas
        and "facturas-refresh-btn" not in facturas
        and "removeManualRefresh" not in facturas,
        "facturas-autorefresh no puede corregir/borrar DOM del template",
    )

    require(
        errors,
        "interactionHost" in facturas
        and "host.addEventListener(eventName, onUserInteraction" in facturas
        and "document.addEventListener(eventName, onUserInteraction" not in facturas,
        "facturas-autorefresh debe escuchar interacción sólo en el Router view",
    )

    require(
        errors,
        re.search(r"observer\.observe\s*\(\s*mountRoot\b", preview) is not None
        and "observer.observe(document.body" not in preview
        and 'observerScope: "router-view"' in preview,
        "incidencias-media-preview debe limitar listeners/observer al Router view",
    )

    require(
        errors,
        '"/src/css/views/incidencias/media-preview.css"' in route_styles
        and "STYLE_HREF" not in preview
        and "ensureCss" not in preview
        and 'document.createElement("link")' not in preview
        and 'cssAuthority: "router-styles"' in preview,
        "Incidencias media preview debe recibir CSS exclusivamente del manifest de ruta",
    )

    require(
        errors,
        'VIEW_ROOT_SELECTOR = "#view-container, [data-router-view=\'true\']"' in public_support
        and "bindFormEvents(root)" in public_support
        and "observer.observe(root" in public_support
        and 'listenerScope: mountRoot ? "router-view" : "none"' in public_support
        and "document.addEventListener(\"submit\", onSubmit" not in public_support
        and "document.addEventListener(\"input\", onInput" not in public_support
        and "document.addEventListener(\"focusin\", onFocusIn" not in public_support
        and "document.addEventListener(\"focusout\", onFocusOut" not in public_support,
        "public-support intake debe delegar formulario/observer sólo en el Router view",
    )

    manifest = public_home_manifest(route_styles)
    require(
        errors,
        bool(manifest) and all(f'"{path}"' in manifest for path in PUBLIC_ROUTE_CSS),
        "public-home debe recibir todo su CSS específico desde el manifest de ruta",
    )
    require(
        errors,
        '"/src/css/auth/login.css"' not in manifest,
        "public-home no puede arrastrar auth/login.css",
    )

    require(
        errors,
        "observer.observe(root" in progress
        and "observer.observe(document.documentElement" not in progress
        and 'observerScope: "router-view"' in progress,
        "public-support-progress debe observar sólo el Router view",
    )

    require(
        errors,
        "mobileShell" not in chrome
        and "mobileNavigation" not in chrome
        and "scheduleSync" in chrome,
        "App Chrome no puede reintroducir compatibilidad Mobile Shell",
    )

    require(
        errors,
        "LEGACY_ACCENT_STORAGE_KEY" not in preboot
        and "setAccentDeprecated" not in preboot
        and "setAccent:" not in preboot,
        "Preboot sólo puede gobernar tema e idioma; acento legacy prohibido",
    )


def main() -> int:
    errors: list[str] = []

    required_paths = (INDEX, MAIN, ENHANCEMENTS, APP_CSS, *RUNTIME_FILES.values())
    for required in required_paths:
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
    runtime = {name: read(path, errors) for name, path in RUNTIME_FILES.items()}

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
        errors.append("El único script type=module de index.html debe ser /src/main.js")

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

    direct_route_css = [
        link.get("href", "")
        for link in parser.links
        if link.get("rel", "").strip().lower() == "stylesheet"
        and link.get("href", "").startswith("/src/css/views/")
    ]
    require(
        errors,
        not direct_route_css,
        "index.html no puede enlazar CSS específico de ruta: " + ", ".join(direct_route_css),
    )

    for css_path in PUBLIC_ROUTE_CSS:
        require(
            errors,
            Path(css_path).name not in app_css_text,
            f"src/css/app.css debe ser global-only; CSS de ruta prohibido: {css_path}",
        )

    require(
        errors,
        'const ENHANCEMENTS_MODULE = "./app/enhancements.js";' in main_text,
        "src/main.js no declara el registry canónico de enhancements",
    )
    require(
        errors,
        "enhancements.initPreRouter()" in main_text,
        "src/main.js no orquesta initPreRouter()",
    )
    require(
        errors,
        "enhancements.initPostRouter()" in main_text,
        "src/main.js no orquesta initPostRouter()",
    )
    require(
        errors,
        "void startPostRouterEnhancements(enhancements);" in main_text,
        "Los enhancements post-router deben arrancar sin bloquear ready",
    )
    require(
        errors,
        "forceHideLoader" not in main_text,
        "src/main.js sólo puede consumir hideLoader; alias legacy prohibido",
    )

    for module_path in CANONICAL_MODULES:
        require(
            errors,
            enhancements_text.count(module_path) == 1,
            f"Registry sin autoridad única para: {module_path}",
        )

    require(
        errors,
        enhancements_text.count("ticket-deeplink/index.js") == 1,
        "ticket-deeplink debe registrarse exactamente una vez",
    )
    require(
        errors,
        enhancements_text.count("../ui/chrome/index.js") == 1,
        "App Chrome debe registrarse exactamente una vez",
    )

    validate_runtime_boundaries(errors, runtime)

    if errors:
        print("\nApp/runtime integrity: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("App/runtime integrity: PASS")
    print("- index.html: 1 módulo ejecutable (/src/main.js)")
    print(f"- registry global: {len(CANONICAL_MODULES)} módulos")
    print("- loader: API canónica sin alias legacy")
    print("- app.css: global-only")
    print("- route styles: CSS público/privado bajo una sola autoridad")
    print("- post-router: progresivo/no bloqueante")
    print("- listeners/observers de features: scopeados y protegidos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
