#!/usr/bin/env python3
"""Guard the boot paint barrier, cold-boot DOM and public-home SEO signals."""

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
LOADER = ROOT / "src/app/loader.js"
ROUTE_STYLES = ROOT / "src/router/styles.js"
INDEX = ROOT / "index.html"
HOME_TEMPLATE = ROOT / "src/views/public/home/template.js"

PUBLIC_SERVICE_PATHS = (
    "/reparacion-ordenadores",
    "/soporte-informatico",
    "/redes-wifi",
    "/impresoras",
    "/soporte-empresas",
)

META_DESCRIPTION_MIN = 120
META_DESCRIPTION_MAX = 155


class BootHtmlParser(HTMLParser):
    """Read boot-critical HTML signals without depending on source formatting."""

    VOID_ELEMENTS = frozenset(
        {
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
        }
    )

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.view_container_count = 0
        self.view_container_has_content = False
        self.meta_descriptions: list[str] = []
        self._view_depth = 0

    @staticmethod
    def _attrs(attrs) -> dict[str, str]:
        return {
            str(key).lower(): (value or "")
            for key, value in (attrs or [])
        }

    def _capture_meta_description(self, tag: str, attrs: dict[str, str]) -> None:
        if tag != "meta":
            return

        if attrs.get("name", "").strip().lower() != "description":
            return

        self.meta_descriptions.append(attrs.get("content", "").strip())

    def handle_starttag(self, tag, attrs) -> None:
        tag = str(tag).lower()
        attrs_map = self._attrs(attrs)
        self._capture_meta_description(tag, attrs_map)

        if self._view_depth > 0:
            self.view_container_has_content = True
            if tag not in self.VOID_ELEMENTS:
                self._view_depth += 1
            return

        if attrs_map.get("id", "").strip() == "view-container":
            self.view_container_count += 1
            if tag not in self.VOID_ELEMENTS:
                self._view_depth = 1

    def handle_startendtag(self, tag, attrs) -> None:
        tag = str(tag).lower()
        attrs_map = self._attrs(attrs)
        self._capture_meta_description(tag, attrs_map)

        if self._view_depth > 0:
            self.view_container_has_content = True
            return

        if attrs_map.get("id", "").strip() == "view-container":
            self.view_container_count += 1

    def handle_endtag(self, tag) -> None:
        if self._view_depth > 0:
            self._view_depth -= 1

    def handle_data(self, data) -> None:
        if self._view_depth > 0 and str(data).strip():
            self.view_container_has_content = True


def main() -> int:
    loader = LOADER.read_text(encoding="utf-8")
    styles = ROUTE_STYLES.read_text(encoding="utf-8")
    index = INDEX.read_text(encoding="utf-8")
    home_template = HOME_TEMPLATE.read_text(encoding="utf-8")
    errors: list[str] = []

    required_loader = {
        "app.loader.minimal.v5-paint-barrier": "falta versión del loader con paint barrier",
        "const HIDE_PAINT_FRAMES = 2;": "el loader debe cubrir al menos dos paints de estabilización",
        "function scheduleHideAfterPaint()": "falta scheduler de ocultación por paint",
        "function cancelPendingHide()": "showLoader debe poder cancelar una ocultación pendiente",
        "return scheduleHideAfterPaint();": "hideLoader debe usar la barrera de pintura",
        "cancelPendingHide();": "el loader visible debe invalidar hides obsoletos",
        "hideLoaderImmediately": "falta escape explícito para ocultación inmediata controlada",
        "requestAnimationFrame": "la barrera debe sincronizarse con el pipeline de pintura",
    }

    for token, message in required_loader.items():
        if token not in loader:
            errors.append(message)

    match = re.search(r"const\s+HIDE_PAINT_FRAMES\s*=\s*(\d+)\s*;", loader)
    if not match or int(match.group(1)) < 2:
        errors.append("HIDE_PAINT_FRAMES debe ser >= 2")

    hide_body = re.search(
        r"export\s+function\s+hideLoader\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
        loader,
        re.DOTALL,
    )
    if not hide_body:
        errors.append("no se pudo localizar hideLoader()")
    else:
        body = hide_body.group("body")
        if "writeLoader(false" in body:
            errors.append("hideLoader() no puede retirar el loader inmediatamente")
        if "setTimeout" in body:
            errors.append("hideLoader() no puede usar una espera temporal arbitraria")

    for token, message in (
        ('MEDIA_INACTIVE =\n  "not all"', "RouteStyles debe conservar descarga inactiva previa al commit"),
        ("setManagedLinkActive", "RouteStyles debe activar hojas gestionadas explícitamente"),
        ("prepareRouteStyles", "RouteStyles debe conservar fase prepare"),
    ):
        if token not in styles:
            errors.append(message)

    for token, message in (
        ('id="app-loader"', "index.html debe contener el loader canónico"),
        ('class="app-loader is-visible"', "el loader debe comenzar visible en cold boot"),
        ('data-app-loading="true"', "el documento debe comenzar en estado loading"),
        ('class="noscript-title"', "el fallback no-JS debe usar título visual no-H1"),
        ('class="noscript-services"', "el fallback no-JS debe conservar navegación pública útil"),
    ):
        if token not in index:
            errors.append(message)

    if "data-public-home-prerender" in index:
        errors.append(
            "index.html no puede pintar contenido prerender dentro del Router root durante cold boot"
        )

    parser = BootHtmlParser()
    parser.feed(index)
    parser.close()

    if parser.view_container_count != 1:
        errors.append(
            "index.html debe declarar exactamente un #view-container; "
            f"encontrados {parser.view_container_count}"
        )
    elif parser.view_container_has_content:
        errors.append("#view-container debe nacer vacío; Router es la única autoridad visible")

    for path in PUBLIC_SERVICE_PATHS:
        if f'href="{path}"' not in index:
            errors.append(f"fallback no-JS sin enlace público: {path}")

    # El fallback no-JS no debe introducir un segundo H1 en el DOM que analizan
    # crawlers capaces de renderizar la SPA. El H1 canónico pertenece a la home real.
    if re.search(r"<h1\b", index, re.IGNORECASE):
        errors.append("index.html no debe declarar H1; el H1 canónico pertenece a public-home")

    home_h1_count = len(re.findall(r"<h1\b", home_template, re.IGNORECASE))
    if home_h1_count != 1:
        errors.append(f"public-home debe declarar exactamente un H1; encontrados {home_h1_count}")

    # HTMLParser evita falsos negativos por saltos de línea, orden o espaciado
    # de atributos. El contrato exige exactamente una descripción canónica.
    if len(parser.meta_descriptions) != 1:
        errors.append(
            "index.html debe declarar exactamente una meta description; "
            f"encontradas {len(parser.meta_descriptions)}"
        )
    else:
        description = " ".join(parser.meta_descriptions[0].split())
        length = len(description)
        if not META_DESCRIPTION_MIN <= length <= META_DESCRIPTION_MAX:
            errors.append(
                f"meta description fuera del contrato {META_DESCRIPTION_MIN}-{META_DESCRIPTION_MAX}: {length}"
            )

    if errors:
        print("Boot visual integrity: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Boot visual integrity: PASS")
    print("- loader starts visible")
    print("- router root starts empty: no pre-hydration content flash")
    print("- no-script fallback keeps crawlable public service links without duplicate H1")
    print("- public home owns exactly one H1")
    print("- meta description stays concise and informative")
    print("- route CSS is preloaded inactive")
    print("- hide is deferred through two animation-frame paints")
    print("- pending hides are cancellable and idempotent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
