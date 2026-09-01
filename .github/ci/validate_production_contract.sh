#!/usr/bin/env bash
set -euo pipefail

python3 -I .github/scripts/public_path_hygiene.py

python3 -I - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

base = os.environ["PUBLIC_SITE_URL"].rstrip("/")
api = os.environ["DIRECT_API_URL"].rstrip("/")
canonical_base = "https://onionsupport.com"
expected_home = f"{base}/"
expected_sitemap = f"{base}/sitemap.xml"
canonical_host = urlsplit(expected_home).netloc
marker_path = Path(".github/ci/seo-public-surface-v2")
apex_marker_path = Path(".github/ci/canonical-apex-v1")
expanded = marker_path.is_file()

errors = []

def error(path, message):
    errors.append((str(path), message))

if base != canonical_base:
    error("PUBLIC_SITE_URL", f"Origen canónico {base!r}; esperado {canonical_base!r}.")

if not apex_marker_path.is_file():
    error(apex_marker_path, "Marcador del canonical apex ausente.")
elif apex_marker_path.read_text(encoding="utf-8").splitlines() != ["canonical-apex-v1"]:
    error(apex_marker_path, "Debe contener exactamente 'canonical-apex-v1'.")

PUBLIC_PATHS = (
    "/",
    "/reparacion-ordenadores",
    "/soporte-informatico",
    "/redes-wifi",
    "/impresoras",
    "/soporte-empresas",
    "/login",
)

PUBLIC_FILES = {
    "/": Path("index.html"),
    "/reparacion-ordenadores": Path("seo/reparacion-ordenadores.html"),
    "/soporte-informatico": Path("seo/soporte-informatico.html"),
    "/redes-wifi": Path("seo/redes-wifi.html"),
    "/impresoras": Path("seo/impresoras.html"),
    "/soporte-empresas": Path("seo/soporte-empresas.html"),
    "/login": Path("login.html"),
}

PUBLIC_REWRITES = {
    "/": "/index.html",
    "/reparacion-ordenadores": "/seo/reparacion-ordenadores.html",
    "/soporte-informatico": "/seo/soporte-informatico.html",
    "/redes-wifi": "/seo/redes-wifi.html",
    "/impresoras": "/seo/impresoras.html",
    "/soporte-empresas": "/seo/soporte-empresas.html",
    "/login": "/login.html",
}

BACKING_ALIAS_REDIRECTS = {
    "/seo/reparacion-ordenadores": "/reparacion-ordenadores",
    "/seo/reparacion-ordenadores.html": "/reparacion-ordenadores",
    "/seo/soporte-informatico": "/soporte-informatico",
    "/seo/soporte-informatico.html": "/soporte-informatico",
    "/seo/redes-wifi": "/redes-wifi",
    "/seo/redes-wifi.html": "/redes-wifi",
    "/seo/impresoras": "/impresoras",
    "/seo/impresoras.html": "/impresoras",
    "/seo/soporte-empresas": "/soporte-empresas",
    "/seo/soporte-empresas.html": "/soporte-empresas",
}

# robots.txt
robots_path = Path("robots.txt")
robots_text = robots_path.read_text(encoding="utf-8")
robots_directives = [
    line.strip()
    for line in robots_text.splitlines()
    if line.strip() and not line.lstrip().startswith("#")
]
robots_lines = set(robots_directives)
user_agent_directives = [
    line.lower()
    for line in robots_directives
    if line.lower().startswith("user-agent:")
]

if user_agent_directives != ["user-agent: *"]:
    error(
        robots_path,
        "Debe existir un único grupo User-agent: *; los grupos específicos de Googlebot/Bingbot "
        "no pueden omitir las reglas privadas del grupo global.",
    )

required_robots = {
    "User-agent: *",
    "Allow: /",
    "Disallow: /password-request",
    "Disallow: /password-reset",
    "Disallow: /reset-password",
    "Disallow: /activate-account",
    "Disallow: /dashboard",
    "Disallow: /incidencias",
    "Disallow: /tickets",
    "Disallow: /facturas",
    "Disallow: /clientes",
    "Disallow: /usuarios",
    "Disallow: /correo",
    "Disallow: /servidor",
    "Disallow: /cuenta",
    "Disallow: /ajustes",
    "Disallow: /@*",
    "Disallow: /api/",
    "Disallow: /.auth/",
    f"Sitemap: {expected_sitemap}",
}

if not expanded:
    required_robots.add("Disallow: /login")

for directive in sorted(required_robots):
    if directive not in robots_lines:
        error(robots_path, f"Falta directiva obligatoria: {directive}")

if expanded and "Disallow: /login" in robots_lines:
    error(robots_path, "/login es público/indexable en seo-public-surface-v2 y no puede estar bloqueado.")

# sitemap.xml
sitemap_path = Path("sitemap.xml")
try:
    tree = ET.parse(sitemap_path)
    root = tree.getroot()
except ET.ParseError as exc:
    error(sitemap_path, f"XML inválido: {exc}")
    root = None

sitemap_urls = []
if root is not None:
    expected_root = "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset"
    if root.tag != expected_root:
        error(sitemap_path, "La raíz debe ser urlset con el namespace oficial.")

    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    sitemap_urls = [
        (node.text or "").strip()
        for node in root.findall("sm:url/sm:loc", ns)
        if (node.text or "").strip()
    ]

    expected_urls = (
        [f"{base}{path}" if path != "/" else expected_home for path in PUBLIC_PATHS]
        if expanded
        else [expected_home]
    )

    if sitemap_urls != expected_urls:
        error(sitemap_path, f"Sitemap inesperado: {sitemap_urls!r}; esperado {expected_urls!r}")

    for loc in sitemap_urls:
        parsed = urlsplit(loc)
        if parsed.scheme != "https":
            error(sitemap_path, f"URL no HTTPS: {loc}")
        if parsed.netloc != canonical_host:
            error(sitemap_path, f"Host no canónico: {loc}")
        if parsed.query or parsed.fragment:
            error(sitemap_path, f"Query/fragment no permitido: {loc}")

class SeoParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonicals = []
        self.og_urls = []
        self.itemprop_urls = []
        self.robots = {}
        self.descriptions = []
        self.titles = []
        self.h1_count = 0
        self.links = []
        self._in_title = False
        self._title_parts = []

    def handle_starttag(self, tag, attrs):
        attrs = {k.lower(): (v or "") for k, v in (attrs or [])}
        tag = tag.lower()
        if tag == "title":
            self._in_title = True
            self._title_parts = []
        if tag == "h1":
            self.h1_count += 1
        if tag == "a":
            href = attrs.get("href", "").strip()
            if href:
                self.links.append(href)
        if tag == "link":
            rel = {token.lower() for token in attrs.get("rel", "").split()}
            if "canonical" in rel:
                self.canonicals.append(attrs.get("href", "").strip())
        if tag == "meta":
            name = attrs.get("name", "").strip().lower()
            property_name = attrs.get("property", "").strip().lower()
            itemprop = attrs.get("itemprop", "").strip().lower()
            if name in {"robots", "googlebot", "bingbot"}:
                self.robots[name] = attrs.get("content", "").strip().lower()
            if name == "description":
                self.descriptions.append(attrs.get("content", "").strip())
            if property_name == "og:url":
                self.og_urls.append(attrs.get("content", "").strip())
            if itemprop == "url":
                self.itemprop_urls.append(attrs.get("content", "").strip())

    def handle_endtag(self, tag):
        if tag.lower() == "title" and self._in_title:
            title = " ".join("".join(self._title_parts).split())
            if title:
                self.titles.append(title)
            self._in_title = False
            self._title_parts = []

    def handle_data(self, data):
        if self._in_title:
            self._title_parts.append(data)

def validate_public_html(path, expected_url, *, require_h1=False, require_internal_links=False):
    if not path.is_file():
        error(path, "Archivo SEO público obligatorio ausente.")
        return
    parser = SeoParser()
    try:
        parser.feed(path.read_text(encoding="utf-8"))
    except UnicodeDecodeError as exc:
        error(path, f"HTML no UTF-8: {exc}")
        return

    if parser.canonicals != [expected_url]:
        error(path, f"Canonical esperado exactamente una vez: {expected_url}")
    if parser.og_urls != [expected_url]:
        error(path, f"og:url esperado exactamente una vez: {expected_url}")
    for itemprop_url in parser.itemprop_urls:
        parsed_itemprop = urlsplit(itemprop_url)
        if parsed_itemprop.scheme != "https" or parsed_itemprop.netloc != canonical_host:
            error(path, f"Microdato itemprop=url fuera del origen canónico: {itemprop_url}")
        if itemprop_url not in {expected_url, expected_home}:
            error(path, f"Microdato itemprop=url inesperado: {itemprop_url}")
    if len(parser.titles) != 1 or not parser.titles[0]:
        error(path, "Debe contener exactamente un <title> no vacío.")
    if len(parser.descriptions) != 1 or not parser.descriptions[0]:
        error(path, "Debe contener exactamente una meta description no vacía.")
    for name in ("robots", "googlebot"):
        directives = {item.strip() for item in parser.robots.get(name, "").split(",") if item.strip()}
        if not {"index", "follow"}.issubset(directives):
            error(path, f"Meta {name} debe contener index, follow.")
    if require_h1 and parser.h1_count != 1:
        error(path, f"Debe contener exactamente un H1; encontrados {parser.h1_count}.")
    if require_internal_links:
        local_links = [href for href in parser.links if href.startswith("/") and not href.startswith("//")]
        if "/" not in local_links or "/login" not in local_links:
            error(path, "Debe enlazar de forma rastreable a / y /login.")

validate_public_html(Path("index.html"), expected_home)

if expanded:
    if marker_path.read_text(encoding="utf-8").splitlines() != ["seo-public-surface-v2"]:
        error(marker_path, "El marcador debe contener exactamente 'seo-public-surface-v2'.")

    for public_path in PUBLIC_PATHS[1:]:
        expected_url = f"{base}{public_path}"
        validate_public_html(
            PUBLIC_FILES[public_path],
            expected_url,
            require_h1=public_path != "/login",
            require_internal_links=public_path != "/login",
        )

# Static Web Apps config
config_path = Path("staticwebapp.config.json")
config = json.loads(config_path.read_text(encoding="utf-8"))
route_entries = [
    route
    for route in config.get("routes", [])
    if isinstance(route, dict) and route.get("route")
]
route_names = [route["route"] for route in route_entries]
routes = {route["route"]: route for route in route_entries}

if len(route_names) != len(set(route_names)):
    duplicates = sorted({name for name in route_names if route_names.count(name) > 1})
    error(config_path, f"Rutas duplicadas en staticwebapp.config.json: {duplicates!r}")

if "navigationFallback" in config:
    error(
        config_path,
        "No debe existir navigationFallback: una SPA pública con fallback global convierte cualquier URL "
        "desconocida en index.html con HTTP 200 y genera soft-404.",
    )

if "/*" in routes:
    error(config_path, "La ruta wildcard global /* está prohibida; las rutas SPA deben declararse explícitamente.")

for denied_path in (
    "/api",
    "/api/*",
    "/.auth",
    "/seo",
    "/src",
    "/assets",
):
    denial = routes.get(denied_path)
    if not denial or denial.get("statusCode") != 404:
        error(config_path, f"{denied_path} debe responder 404 de forma explícita.")

language_route_pattern = re.compile(r"^/[a-z]{2}(?:/\*)?$", re.IGNORECASE)
language_routes = sorted(
    route_name
    for route_name in route_names
    if language_route_pattern.fullmatch(route_name)
)
if language_routes:
    error(
        config_path,
        f"No deben existir rutas estáticas prefijadas por idioma: {language_routes!r}",
    )

root_route = routes.get("/")
if not root_route or root_route.get("rewrite") != "/index.html":
    error(config_path, "/ debe reescribir a /index.html.")
else:
    xrobots = str(root_route.get("headers", {}).get("X-Robots-Tag", "")).lower()
    if "index" not in xrobots or "follow" not in xrobots:
        error(config_path, "/ debe enviar X-Robots-Tag: index, follow.")

if expanded:
    for public_path, rewrite in PUBLIC_REWRITES.items():
        route = routes.get(public_path)
        if not route:
            error(config_path, f"Falta ruta SEO pública: {public_path}")
            continue
        if route.get("rewrite") != rewrite:
            error(config_path, f"{public_path} debe reescribir exactamente a {rewrite}.")
        xrobots = str(route.get("headers", {}).get("X-Robots-Tag", "")).lower()
        if "index" not in xrobots or "follow" not in xrobots or "noindex" in xrobots:
            error(config_path, f"{public_path} debe enviar X-Robots-Tag: index, follow.")

    for alias, destination in BACKING_ALIAS_REDIRECTS.items():
        route = routes.get(alias)
        if not route:
            error(config_path, f"Falta alias backing SEO: {alias}")
            continue
        if route.get("redirect") != destination or route.get("statusCode") != 301:
            error(config_path, f"{alias} debe redirigir 301 exactamente a {destination}.")

    seo_backing = routes.get("/seo/*")
    if not seo_backing or seo_backing.get("statusCode") != 404:
        error(config_path, "/seo/* debe responder 404 para cualquier backing no reconocido.")

    login_backing = routes.get("/login.html")
    if not login_backing or login_backing.get("redirect") != "/login" or login_backing.get("statusCode") != 301:
        error(config_path, "/login.html debe redirigir 301 a /login.")

private_routes = [
    "/password-request",
    "/password-reset*",
    "/reset-password*",
    "/activate-account*",
    "/dashboard*",
    "/@*",
    "/incidencias*",
    "/tickets*",
    "/facturas*",
    "/clientes*",
    "/usuarios*",
    "/correo*",
    "/servidor*",
    "/cuenta*",
    "/ajustes*",
]
if not expanded:
    private_routes.insert(0, "/login")

for route_name in private_routes:
    route = routes.get(route_name)
    if not route:
        error(config_path, f"Falta ruta privada: {route_name}")
        continue
    if route.get("rewrite") != "/index.html":
        error(config_path, f"{route_name} debe reescribir a /index.html.")
    xrobots = str(route.get("headers", {}).get("X-Robots-Tag", "")).lower()
    if "noindex" not in xrobots or "nofollow" not in xrobots:
        error(config_path, f"{route_name} debe enviar X-Robots-Tag: noindex, nofollow.")

csp = str(config.get("globalHeaders", {}).get("Content-Security-Policy", ""))
if api not in csp:
    error(config_path, f"La CSP debe permitir el backend canónico {api}.")
legacy_domain = "onionit" + ".net"
if legacy_domain in csp:
    error(config_path, "La CSP contiene el dominio backend legado.")

if errors:
    for path, message in errors:
        print(f"::error file={path},title=Contrato productivo inválido::{message}")
    sys.exit(1)

mode = "expanded-v2" if expanded else "legacy"
print(
    f"Contrato SEO/routing productivo OK · mode={mode} · canonical={expected_home} · "
    f"api={api} · unknown-routes=404"
)
PY
