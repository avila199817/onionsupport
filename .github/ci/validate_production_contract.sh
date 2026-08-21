#!/usr/bin/env bash
set -euo pipefail

python3 -I - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import os
import sys
import xml.etree.ElementTree as ET

base = os.environ["PUBLIC_SITE_URL"].rstrip("/")
api = os.environ["DIRECT_API_URL"].rstrip("/")
expected_home = f"{base}/"
expected_sitemap = f"{base}/sitemap.xml"
canonical_host = urlsplit(expected_home).netloc

errors = []

def error(path, message):
    errors.append((str(path), message))

# robots.txt
robots_path = Path("robots.txt")
robots_text = robots_path.read_text(encoding="utf-8")
robots_lines = {
    line.strip()
    for line in robots_text.splitlines()
    if line.strip() and not line.lstrip().startswith("#")
}

required_robots = {
    "User-agent: *",
    "Allow: /",
    "Disallow: /login",
    "Disallow: /password-request",
    "Disallow: /password-reset",
    "Disallow: /reset-password",
    "Disallow: /activate-account",
    "Disallow: /dashboard",
    "Disallow: /incidencias",
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

for directive in sorted(required_robots):
    if directive not in robots_lines:
        error(robots_path, f"Falta directiva obligatoria: {directive}")

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

    if sitemap_urls != [expected_home]:
        error(
            sitemap_path,
            f"El sitemap productivo debe publicar exactamente {expected_home}",
        )

    for loc in sitemap_urls:
        parsed = urlsplit(loc)
        if parsed.scheme != "https":
            error(sitemap_path, f"URL no HTTPS: {loc}")
        if parsed.netloc != canonical_host:
            error(sitemap_path, f"Host no canónico: {loc}")
        if parsed.query or parsed.fragment:
            error(sitemap_path, f"Query/fragment no permitido: {loc}")

# index.html
class SeoParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonicals = []
        self.robots = {}

    def handle_starttag(self, tag, attrs):
        attrs = {k.lower(): (v or "") for k, v in (attrs or [])}
        tag = tag.lower()

        if tag == "link":
            rel = {token.lower() for token in attrs.get("rel", "").split()}
            if "canonical" in rel:
                self.canonicals.append(attrs.get("href", "").strip())

        if tag == "meta":
            name = attrs.get("name", "").strip().lower()
            if name in {"robots", "googlebot"}:
                self.robots[name] = attrs.get("content", "").strip().lower()

index_path = Path("index.html")
parser = SeoParser()
parser.feed(index_path.read_text(encoding="utf-8"))

if parser.canonicals != [expected_home]:
    error(index_path, f"Canonical esperado exactamente una vez: {expected_home}")

for name in ("robots", "googlebot"):
    directives = {
        item.strip()
        for item in parser.robots.get(name, "").split(",")
        if item.strip()
    }
    if not {"index", "follow"}.issubset(directives):
        error(index_path, f"Meta {name} debe contener index, follow.")

# Static Web Apps config
config_path = Path("staticwebapp.config.json")
config = json.loads(config_path.read_text(encoding="utf-8"))
routes = {
    route.get("route"): route
    for route in config.get("routes", [])
    if isinstance(route, dict) and route.get("route")
}

exclusions = set(config.get("navigationFallback", {}).get("exclude", []))
for item in (
    "/api/*",
    "/.auth/*",
    "/robots.txt",
    "/sitemap.xml",
    "/site.webmanifest",
    "/favicon.ico",
    "/src/*",
):
    if item not in exclusions:
        error(config_path, f"navigationFallback.exclude debe contener {item}")

root_route = routes.get("/")
if not root_route or root_route.get("rewrite") != "/index.html":
    error(config_path, "/ debe reescribir a /index.html.")
else:
    xrobots = str(root_route.get("headers", {}).get("X-Robots-Tag", "")).lower()
    if "index" not in xrobots or "follow" not in xrobots:
        error(config_path, "/ debe enviar X-Robots-Tag: index, follow.")

private_routes = (
    "/login",
    "/password-request",
    "/password-reset*",
    "/reset-password*",
    "/activate-account*",
    "/dashboard*",
    "/@*",
    "/incidencias*",
    "/facturas*",
    "/clientes*",
    "/usuarios*",
    "/correo*",
    "/servidor*",
    "/cuenta*",
    "/ajustes*",
)

for route_name in private_routes:
    route = routes.get(route_name)
    if not route:
        error(config_path, f"Falta ruta privada: {route_name}")
        continue

    if route.get("rewrite") != "/index.html":
        error(config_path, f"{route_name} debe reescribir a /index.html.")

    xrobots = str(route.get("headers", {}).get("X-Robots-Tag", "")).lower()
    if "noindex" not in xrobots or "nofollow" not in xrobots:
        error(
            config_path,
            f"{route_name} debe enviar X-Robots-Tag: noindex, nofollow.",
        )

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

print(
    "Contrato SEO/routing productivo OK · "
    f"canonical={expected_home} · api={api}"
)
PY
