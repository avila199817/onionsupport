#!/usr/bin/env python3
"""Onion Support repository integrity checks.

Dependency-free and intentionally conservative: validate only references and
contracts that can be resolved statically without executing the SPA or guessing
runtime values.
"""

from __future__ import annotations

import json
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
FIRST_HELPER_PATTERN = re.compile(
    r"function\s+first\s*\(\s*\.\.\.values\s*\)\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)
EXTERNAL_SCHEMES = ("http://", "https://", "data:", "blob:")

PRIVATE_ROUTE_SLUGS = (
    "incidencias",
    "facturas",
    "clientes",
    "usuarios",
    "correo",
    "servidor",
    "cuenta",
    "ajustes",
)

PRIVATE_UI_INDEX_FILES = (
    SRC / "css" / "views" / "home" / "index.css",
    SRC / "css" / "views" / "incidencias" / "index.css",
    SRC / "css" / "views" / "facturas" / "index.css",
    SRC / "css" / "views" / "clientes" / "index.css",
    SRC / "css" / "views" / "usuarios" / "index.css",
    SRC / "css" / "views" / "servidor" / "index.css",
    SRC / "css" / "views" / "cuenta" / "index.css",
)


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


def validate_first_helpers(errors: list[str]) -> None:
    """A `first()` selector must preserve arrays as values, never flatten them.

    Flattening its variadic arguments silently turns a domain collection into its
    first element. We have already hit this class of bug in Facturas/Incidencias,
    so it is now a repository-level invariant.
    """

    for js_file in sorted(SRC.rglob("*.js")):
        text = js_file.read_text(encoding="utf-8")
        for match in FIRST_HELPER_PATTERN.finditer(text):
            body = match.group("body")
            if "values.flat(" in body or "values.flatMap(" in body:
                errors.append(
                    f"{js_file.relative_to(ROOT)} :: first(...values) no puede aplanar arrays"
                )


def validate_private_route_contract(errors: list[str]) -> None:
    """Keep SPA routing, Azure noindex headers and robots.txt aligned.

    A private route can be valid in Router and still leak a public/indexable shell
    if the static host contract drifts. The invariant lives here so every deploy
    and PR validates the same source of truth.
    """

    config_path = ROOT / "staticwebapp.config.json"
    robots_path = ROOT / "robots.txt"

    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"staticwebapp.config.json :: JSON inválido o ilegible: {error}")
        return

    try:
        robots_lines = {
            line.strip()
            for line in robots_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
    except OSError as error:
        errors.append(f"robots.txt :: archivo ilegible: {error}")
        robots_lines = set()

    routes = {
        route.get("route"): route
        for route in config.get("routes", [])
        if isinstance(route, dict) and route.get("route")
    }

    for slug in PRIVATE_ROUTE_SLUGS:
        static_route = f"/{slug}*"
        robots_rule = f"Disallow: /{slug}"
        route = routes.get(static_route)

        if not route:
            errors.append(
                f"staticwebapp.config.json :: falta contrato SPA privado para {static_route}"
            )
        else:
            if route.get("rewrite") != "/index.html":
                errors.append(
                    f"staticwebapp.config.json :: {static_route} debe reescribir a /index.html"
                )

            x_robots = str(
                route.get("headers", {}).get("X-Robots-Tag", "")
            ).lower()

            if "noindex" not in x_robots or "nofollow" not in x_robots:
                errors.append(
                    f"staticwebapp.config.json :: {static_route} debe enviar X-Robots-Tag noindex, nofollow"
                )

        if robots_rule not in robots_lines:
            errors.append(
                f"robots.txt :: falta regla privada obligatoria: {robots_rule}"
            )


def validate_api_transport_contract(errors: list[str]) -> None:
    """Keep same-origin /api traffic and direct /health traffic explicit.

    Azure Static Web Apps proxies the linked backend only under /api. Root-level
    /health endpoints otherwise fall through to the SPA and return index.html.
    """

    config_text = (SRC / "core" / "config.js").read_text(encoding="utf-8")
    http_text = (SRC / "core" / "http.js").read_text(encoding="utf-8")

    required_config = (
        'CANONICAL_PRODUCTION_API_BASE = "https://www.onionsupport.com"',
        'CANONICAL_DIRECT_BACKEND_API_BASE = "https://api.onionit.net"',
        'DIRECT_BACKEND_API_PREFIXES = Object.freeze([',
        '"/health"',
    )

    for snippet in required_config:
        if snippet not in config_text:
            errors.append(
                f"src/core/config.js :: falta contrato de transporte API: {snippet}"
            )

    required_http = (
        "CANONICAL_DIRECT_BACKEND_API_BASE",
        "DIRECT_BACKEND_API_PREFIXES",
        "shouldUseDirectBackendOrigin",
    )

    for snippet in required_http:
        if snippet not in http_text:
            errors.append(
                f"src/core/http.js :: falta routing directo de health: {snippet}"
            )


def validate_css_references(errors: list[str]) -> None:
    for css_file in sorted((SRC / "css").rglob("*.css")):
        text = css_file.read_text(encoding="utf-8")
        for match in CSS_IMPORT_PATTERN.finditer(text):
            spec = clean_spec(match.group(1))
            target = resolve_local(css_file, spec)
            if target is not None and not target.is_file():
                record_missing(errors, css_file, spec, "@import")


def validate_ui_foundation_contract(errors: list[str]) -> None:
    """Keep private SPA geometry governed by one final, non-view-specific layer.

    The route sheets remain free to paint their own domain UI, but they must not
    be able to remove the shrink/overflow/scroll/mobile invariants that keep the
    application stable with long content and compact viewports.
    """

    app_path = SRC / "css" / "app.css"
    guardrails_path = SRC / "css" / "core" / "guardrails.css"
    datalist_path = SRC / "css" / "compositions" / "mobile-datalist.css"
    datalist_feature_path = SRC / "features" / "mobile-datalist" / "index.js"

    try:
        app_text = app_path.read_text(encoding="utf-8")
    except OSError as error:
        errors.append(f"src/css/app.css :: ilegible: {error}")
        return

    required_app = (
        "@layer tokens, reset, core, layout, components, views, auth, compositions, guardrails;",
        '@import url("./compositions/mobile-datalist.css") layer(compositions);',
        '@import url("./core/guardrails.css") layer(guardrails);',
    )
    for snippet in required_app:
        if snippet not in app_text:
            errors.append(f"src/css/app.css :: falta UI Foundation: {snippet}")

    import_specs = [clean_spec(match.group(1)) for match in CSS_IMPORT_PATTERN.finditer(app_text)]
    duplicates = sorted({spec for spec in import_specs if import_specs.count(spec) > 1})
    for spec in duplicates:
        errors.append(f"src/css/app.css :: @import duplicado: {spec}")

    if re.search(r"@import[^;]*(?:patch|hotfix)[^;]*;", app_text, re.IGNORECASE):
        errors.append("src/css/app.css :: prohibido importar micro-parches/hotfix CSS")

    if not guardrails_path.is_file():
        errors.append("src/css/core/guardrails.css :: falta contrato final de layout")
        return

    guardrails_text = guardrails_path.read_text(encoding="utf-8")
    required_guardrails = (
        ".panel-content[data-view]",
        "min-inline-size: 0;",
        ".main-content",
        ".incidencias-table-shell",
        ".facturas-table-shell",
        ".clientes-table-shell",
        ".usuarios-table-shell",
        "overflow-x: auto;",
        "@media (max-width: 900px)",
        "@media (max-width: 560px)",
        "@media (max-width: 480px)",
        'dialog,',
        '[role="dialog"]',
        "100dvh",
        "var(--app-safe-left)",
    )
    for snippet in required_guardrails:
        if snippet not in guardrails_text:
            errors.append(
                f"src/css/core/guardrails.css :: falta invariante obligatoria: {snippet}"
            )

    if re.search(r"#[0-9a-fA-F]{3,8}\b", guardrails_text):
        errors.append(
            "src/css/core/guardrails.css :: guardrails no puede definir colores/paleta"
        )

    if re.search(r"\[data-theme\s*=", guardrails_text):
        errors.append(
            "src/css/core/guardrails.css :: guardrails no puede contener lógica de tema"
        )

    if not datalist_path.is_file():
        errors.append("src/css/compositions/mobile-datalist.css :: falta composición móvil canónica")
    else:
        datalist_text = datalist_path.read_text(encoding="utf-8")
        required_datalist = (
            "@layer compositions",
            ".ui-datalist",
            '.ui-datalist[data-mobile-datalist-layout="incidencias"]',
            '.ui-datalist[data-mobile-datalist-layout="facturas"]',
            '.ui-datalist[data-mobile-datalist-layout="clientes"]',
            '.ui-datalist[data-mobile-datalist-layout="usuarios"]',
            "@media (max-width: 680px)",
        )
        for snippet in required_datalist:
            if snippet not in datalist_text:
                errors.append(
                    f"src/css/compositions/mobile-datalist.css :: falta contrato DataList: {snippet}"
                )

        if "!important" in datalist_text:
            errors.append(
                "src/css/compositions/mobile-datalist.css :: compositions no puede usar !important"
            )

    if not datalist_feature_path.is_file():
        errors.append("src/features/mobile-datalist/index.js :: falta adaptador DataList")
    else:
        datalist_feature_text = datalist_feature_path.read_text(encoding="utf-8")
        for snippet in (
            "MOBILE_DATALIST_VERSION",
            'layout: "incidencias"',
            'layout: "facturas"',
            'layout: "clientes"',
            'layout: "usuarios"',
            "MutationObserver",
        ):
            if snippet not in datalist_feature_text:
                errors.append(
                    f"src/features/mobile-datalist/index.js :: falta contrato DataList: {snippet}"
                )

    try:
        index_text = (ROOT / "index.html").read_text(encoding="utf-8")
    except OSError as error:
        errors.append(f"index.html :: ilegible: {error}")
    else:
        if '/src/features/mobile-datalist/index.js' not in index_text:
            errors.append("index.html :: debe cargar mobile-datalist/index.js")

    for css_path in PRIVATE_UI_INDEX_FILES:
        if not css_path.is_file():
            errors.append(f"{css_path.relative_to(ROOT)} :: falta stylesheet privado canónico")
            continue

        text = css_path.read_text(encoding="utf-8")
        if "@layer views" not in text:
            errors.append(
                f"{css_path.relative_to(ROOT)} :: stylesheet privado debe vivir en @layer views"
            )

        if re.search(r"(?:^|[;{\s])(?:inline-size|width)\s*:\s*100vw\s*;", text, re.IGNORECASE):
            errors.append(
                f"{css_path.relative_to(ROOT)} :: 100vw directo prohibido en root/layout privado"
            )

    forbidden_architecture_names = re.compile(r"(?:patch|hotfix|quickfix)", re.IGNORECASE)
    architecture_roots = (
        SRC / "css" / "core",
        SRC / "css" / "layout",
        SRC / "css" / "components",
        SRC / "css" / "compositions",
    )
    for root in architecture_roots:
        if not root.exists():
            continue
        for css_path in root.rglob("*.css"):
            if forbidden_architecture_names.search(css_path.name):
                errors.append(
                    f"{css_path.relative_to(ROOT)} :: micro-parche prohibido en arquitectura CSS"
                )


def validate_ui_system_v4_contract(errors: list[str]) -> None:
    """Keep the post-cleanup UI architecture from regressing into bridge/patch layers."""
    app_text = (SRC / "css" / "app.css").read_text(encoding="utf-8")
    index_text = (ROOT / "index.html").read_text(encoding="utf-8")
    route_styles_text = (SRC / "router" / "styles.js").read_text(encoding="utf-8")
    correo_viewport_text = (SRC / "css" / "views" / "correo" / "viewport.css").read_text(encoding="utf-8")
    sidebar_text = (SRC / "css" / "layout" / "sidebar.css").read_text(encoding="utf-8")

    dead_paths = (
        SRC / "css" / "layout" / "mobile-shell.css",
        SRC / "css" / "layout" / "correo-sidebar.css",
        SRC / "css" / "views" / "correo" / "fullheight.css",
        SRC / "features" / "mobile-shell" / "index.js",
    )
    for path in dead_paths:
        if path.exists():
            errors.append(f"{path.relative_to(ROOT)} :: arquitectura legacy no debe reaparecer")

    for forbidden in ("correo-sidebar.css", "correo/fullheight.css", "mobile-shell.css"):
        if forbidden in app_text:
            errors.append(f"src/css/app.css :: import legacy prohibido: {forbidden}")

    if '@import url("./layout/chrome.css") layer(layout);' not in app_text:
        errors.append("src/css/app.css :: chrome.css debe ser la autoridad final de layout")

    if '/src/ui/chrome/index.js' not in index_text:
        errors.append("index.html :: debe cargar App Chrome canónico directamente")
    if '/src/features/mobile-shell/index.js' in index_text:
        errors.append("index.html :: bridge mobile-shell prohibido")

    for snippet in (
        'correo: Object.freeze([',
        '"/src/css/views/correo/index.css"',
        '"/src/css/views/correo/viewport.css"',
    ):
        if snippet not in route_styles_text:
            errors.append(f"src/router/styles.js :: falta contrato CSS de Correo: {snippet}")
    if "correo/fullheight.css" in route_styles_text:
        errors.append("src/router/styles.js :: Correo no puede recuperar fullheight.css")

    if "CONSOLIDATED HEIGHT / DENSITY CONTRACT" not in correo_viewport_text:
        errors.append("src/css/views/correo/viewport.css :: falta contrato consolidado de viewport")
    if 'data-sidebar-key="correo"' not in sidebar_text:
        errors.append("src/css/layout/sidebar.css :: falta icono integrado de Correo")


def validate_correo_cascade_v5_contract(errors: list[str]) -> None:
    """Keep Correo on normal cascade; reserve !important for accessibility/print escape hatches."""
    viewport_path = SRC / "css" / "views" / "correo" / "viewport.css"
    viewport_text = viewport_path.read_text(encoding="utf-8")
    important_count = viewport_text.count("!important")

    if important_count > 16:
        errors.append(
            f"src/css/views/correo/viewport.css :: demasiados !important tras V5: {important_count} > 16"
        )

    if "CONSOLIDATED HEIGHT / DENSITY CONTRACT" not in viewport_text:
        errors.append("src/css/views/correo/viewport.css :: falta contrato consolidado de altura/densidad")


def validate_detail_modal_v6_contract(errors: list[str]) -> None:
    """Usuarios must consume the transverse detail modal without importing Incidencias CSS."""
    component_path = SRC / "css" / "components" / "detail-modal.css"
    route_styles = (SRC / "router" / "styles.js").read_text(encoding="utf-8")
    users_template = (SRC / "views" / "usuarios" / "usuarios.template.modal.js").read_text(encoding="utf-8")

    if not component_path.is_file():
        errors.append("src/css/components/detail-modal.css :: falta componente Detail Modal V6")
        return

    component = component_path.read_text(encoding="utf-8")
    for snippet in ("@layer components", ".ui-detail-modal-root", ".ui-detail-modal-panel", ".ui-detail-modal-body"):
        if snippet not in component:
            errors.append(f"src/css/components/detail-modal.css :: falta contrato: {snippet}")

    if ".incidencias-modal-" in component or ".usuarios-modal-" in component:
        errors.append("src/css/components/detail-modal.css :: el componente transversal no puede contener selectores de dominio")

    if "incidencias-modal-" in users_template or "incidencias-detail-open" in users_template:
        errors.append("src/views/usuarios/usuarios.template.modal.js :: Usuarios no puede depender de clases de Incidencias")

    users_match = re.search(r"usuarios:\s*Object\.freeze\(\[(?P<body>.*?)\]\)", route_styles, re.DOTALL)
    if not users_match:
        errors.append("src/router/styles.js :: falta manifest CSS de Usuarios")
        return
    users_css = users_match.group("body")
    if '"/src/css/components/detail-modal.css"' not in users_css:
        errors.append("src/router/styles.js :: Usuarios debe cargar detail-modal.css")
    if '"/src/css/views/incidencias/detail.css"' in users_css:
        errors.append("src/router/styles.js :: Usuarios no puede cargar incidencias/detail.css")


def validate_shared_detail_modal_v7_contract(errors: list[str]) -> None:
    """Incidencias and Usuarios must share the same transverse modal shell authority."""
    route_styles = (SRC / "router" / "styles.js").read_text(encoding="utf-8")
    inc_template = (SRC / "views" / "incidencias" / "incidencias.template.modal.js").read_text(encoding="utf-8")
    inc_detail = (SRC / "css" / "views" / "incidencias" / "detail.css").read_text(encoding="utf-8")

    inc_match = re.search(r"incidencias:\s*Object\.freeze\(\[(?P<body>.*?)\]\)", route_styles, re.DOTALL)
    if not inc_match:
        errors.append("src/router/styles.js :: falta manifest CSS de Incidencias")
    else:
        inc_css = inc_match.group("body")
        if '"/src/css/components/detail-modal.css"' not in inc_css:
            errors.append("src/router/styles.js :: Incidencias debe cargar detail-modal.css")

    for snippet in ("ui-detail-modal-root", "ui-detail-modal-overlay", "ui-detail-modal-panel", "ui-detail-modal-body"):
        if snippet not in inc_template:
            errors.append(f"src/views/incidencias/incidencias.template.modal.js :: falta clase compartida: {snippet}")

    for selector in (
        ".incidencias-modal-overlay {",
        ".incidencias-modal-panel {",
        ".incidencias-modal-body {",
        ".incidencias-modal-meta-grid {",
    ):
        if selector in inc_detail:
            errors.append(f"src/css/views/incidencias/detail.css :: regla compartida duplicada tras V7: {selector}")


def validate_detail_modal_pairing_v7_contract(errors: list[str]) -> None:
    """Critical Incidencias modal primitives must carry both domain and shared classes."""
    template = (SRC / "views" / "incidencias" / "incidencias.template.modal.js").read_text(encoding="utf-8")
    required_pairs = (
        "incidencias-modal-root ui-detail-modal-root",
        "incidencias-modal-overlay ui-detail-modal-overlay",
        "incidencias-modal-panel ui-detail-modal-panel",
        "incidencias-modal-chip ui-detail-modal-chip",
        "incidencias-modal-body ui-detail-modal-body",
        "incidencias-modal-meta-grid ui-detail-modal-meta-grid",
    )
    for pair in required_pairs:
        if pair not in template:
            errors.append(f"src/views/incidencias/incidencias.template.modal.js :: falta alias compartido: {pair}")

    dynamic_pair = "incidencias-modal-chip--${attr(safeModifier)} ui-detail-modal-chip--${attr(safeModifier)}"
    if dynamic_pair not in template:
        errors.append("src/views/incidencias/incidencias.template.modal.js :: modifier dinámico de chip no comparte autoridad V7")


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
    validate_first_helpers(errors)
    validate_private_route_contract(errors)
    validate_api_transport_contract(errors)
    validate_css_references(errors)
    validate_ui_foundation_contract(errors)
    validate_ui_system_v4_contract(errors)
    validate_correo_cascade_v5_contract(errors)
    validate_detail_modal_v6_contract(errors)
    validate_shared_detail_modal_v7_contract(errors)
    validate_detail_modal_pairing_v7_contract(errors)
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
