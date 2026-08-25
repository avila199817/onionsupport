#!/usr/bin/env python3
"""Strict post-deploy verifier for Onion Support production.

The verifier compares critical public files/routes with exact bytes from the
checked-out commit, validates canonical URLs, canonical backing redirects and
enforces index/noindex headers. It retries for a bounded propagation window and
exits non-zero on final drift.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

DEFAULT_BASE_URL = "https://onionsupport.com"
DEFAULT_ATTEMPTS = 8
DEFAULT_DELAY_SECONDS = 10.0
REQUEST_TIMEOUT_SECONDS = 20.0

ORIGIN_REDIRECT_PROBES = (
    "/",
    "/reparacion-ordenadores?canonical_probe=1",
)

EXACT_FILES = (
    "index.html",
    "src/main.js",
    "src/app/index.js",
    "src/app/loader.js",
    "src/app/enhancements.js",
    "src/router/index.js",
    "src/router/routes.js",
    "src/router/styles.js",
    "src/views/public/home/index.js",
    "src/views/public/home/template.js",
    "src/features/public-support/index.js",
    "src/features/public-support-progress/index.js",
    "src/features/public-home-experience/index.js",
    "src/css/app.css",
    "src/css/views/public/index.css",
    "src/css/views/public/home-experience.css",
    "src/css/seo/public-service.css",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
)

EXACT_ROUTE_FILES = (
    ("/reparacion-ordenadores", "seo/reparacion-ordenadores.html"),
    ("/soporte-informatico", "seo/soporte-informatico.html"),
    ("/redes-wifi", "seo/redes-wifi.html"),
    ("/impresoras", "seo/impresoras.html"),
    ("/soporte-empresas", "seo/soporte-empresas.html"),
    ("/login", "login.html"),
)

SEO_ALIAS_REDIRECTS = (
    ("/seo/reparacion-ordenadores", "/reparacion-ordenadores"),
    ("/seo/reparacion-ordenadores.html", "/reparacion-ordenadores"),
    ("/seo/soporte-informatico", "/soporte-informatico"),
    ("/seo/soporte-informatico.html", "/soporte-informatico"),
    ("/seo/redes-wifi", "/redes-wifi"),
    ("/seo/redes-wifi.html", "/redes-wifi"),
    ("/seo/impresoras", "/impresoras"),
    ("/seo/impresoras.html", "/impresoras"),
    ("/seo/soporte-empresas", "/soporte-empresas"),
    ("/seo/soporte-empresas.html", "/soporte-empresas"),
    ("/login.html", "/login"),
)

SPA_ROUTES = (
    "/",
    "/login",
    "/password-request",
    "/password-reset",
    "/reset-password",
    "/activate-account",
    "/dashboard",
    "/@ci-probe",
    "/incidencias",
    "/facturas",
    "/clientes",
    "/usuarios",
    "/correo",
    "/servidor",
    "/cuenta",
    "/ajustes",
)

INDEXABLE_ROUTES = (
    "/",
    "/reparacion-ordenadores",
    "/soporte-informatico",
    "/redes-wifi",
    "/impresoras",
    "/soporte-empresas",
    "/login",
)

NOINDEX_ROUTES = (
    "/password-request",
    "/password-reset",
    "/reset-password",
    "/activate-account",
    "/dashboard",
    "/@ci-probe",
    "/incidencias",
    "/facturas",
    "/clientes",
    "/usuarios",
    "/correo",
    "/servidor",
    "/cuenta",
    "/ajustes",
)


class CanonicalParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.canonicals: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() != "link":
            return
        data = {str(key).lower(): str(value or "") for key, value in attrs}
        rel = {token.lower() for token in data.get("rel", "").split()}
        if "canonical" in rel:
            self.canonicals.append(data.get("href", "").strip())


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


NO_REDIRECT_OPENER = build_opener(NoRedirect())


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_url(base_url: str, path: str, revision: str, attempt: int) -> str:
    base = base_url.rstrip("/") + "/"
    url = urljoin(base, path.lstrip("/"))
    query = urlencode({"deploy_check": revision, "attempt": attempt})
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{query}"


def replace_scheme(base_url: str, scheme: str) -> str:
    parsed = urlsplit(base_url)
    return urlunsplit((scheme, parsed.netloc, "", "", "")).rstrip("/")


def legacy_www_origin(base_url: str) -> str:
    parsed = urlsplit(base_url)
    hostname = parsed.hostname or ""

    if not hostname:
        raise ValueError(f"origen canónico inválido: {base_url!r}")

    legacy_hostname = hostname if hostname.startswith("www.") else f"www.{hostname}"
    netloc = legacy_hostname

    if parsed.port is not None:
        netloc = f"{netloc}:{parsed.port}"

    return urlunsplit((parsed.scheme, netloc, "", "", "")).rstrip("/")


def request_for(url: str) -> Request:
    return Request(
        url,
        headers={
            "User-Agent": "OnionSupport-Production-Verification/3.0",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Accept-Encoding": "identity",
        },
        method="GET",
    )


def fetch(base_url: str, path: str, revision: str, attempt: int) -> tuple[int, bytes, dict[str, str]]:
    url = build_url(base_url, path, revision, attempt)
    request = request_for(url)

    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            headers = {key.lower(): value for key, value in response.headers.items()}
            return int(response.status), response.read(), headers
    except HTTPError as error:
        body = error.read() if hasattr(error, "read") else b""
        headers = {key.lower(): value for key, value in error.headers.items()} if error.headers else {}
        return int(error.code), body, headers
    except (URLError, TimeoutError, OSError) as error:
        raise RuntimeError(f"{path}: error de red: {error}") from error


def fetch_no_redirect(base_url: str, path: str, revision: str, attempt: int) -> tuple[int, bytes, dict[str, str]]:
    url = build_url(base_url, path, revision, attempt)
    request = request_for(url)

    try:
        with NO_REDIRECT_OPENER.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            headers = {key.lower(): value for key, value in response.headers.items()}
            return int(response.status), response.read(), headers
    except HTTPError as error:
        body = error.read() if hasattr(error, "read") else b""
        headers = {key.lower(): value for key, value in error.headers.items()} if error.headers else {}
        return int(error.code), body, headers
    except (URLError, TimeoutError, OSError) as error:
        raise RuntimeError(f"{path}: error de red: {error}") from error


def check_exact_files(root: Path, base_url: str, revision: str, attempt: int) -> list[str]:
    errors: list[str] = []

    for relative in EXACT_FILES:
        local_path = root / relative
        if not local_path.is_file():
            errors.append(f"archivo local obligatorio inexistente: {relative}")
            continue
        try:
            status, body, _ = fetch(base_url, f"/{relative}", revision, attempt)
        except RuntimeError as error:
            errors.append(str(error))
            continue
        if status != 200:
            errors.append(f"/{relative}: HTTP {status}, esperado 200")
            continue
        expected = local_path.read_bytes()
        if body != expected:
            errors.append(
                f"/{relative}: contenido distinto al commit "
                f"(prod={sha256(body)[:16]} local={sha256(expected)[:16]})"
            )

    for route, relative in EXACT_ROUTE_FILES:
        local_path = root / relative
        if not local_path.is_file():
            errors.append(f"archivo local obligatorio inexistente: {relative}")
            continue
        try:
            status, body, _ = fetch(base_url, route, revision, attempt)
        except RuntimeError as error:
            errors.append(str(error))
            continue
        if status != 200:
            errors.append(f"{route}: HTTP {status}, esperado 200")
            continue
        expected = local_path.read_bytes()
        if body != expected:
            errors.append(
                f"{route}: contenido distinto al backing {relative} "
                f"(prod={sha256(body)[:16]} local={sha256(expected)[:16]})"
            )

    return errors


def check_routes(base_url: str, revision: str, attempt: int) -> list[str]:
    errors: list[str] = []
    cache: dict[str, tuple[int, bytes, dict[str, str]]] = {}

    for route in dict.fromkeys(SPA_ROUTES + INDEXABLE_ROUTES + NOINDEX_ROUTES):
        try:
            cache[route] = fetch(base_url, route, revision, attempt)
        except RuntimeError as error:
            errors.append(str(error))

    for route in SPA_ROUTES:
        if route not in cache:
            continue
        status, body, _ = cache[route]
        if status != 200:
            errors.append(f"{route}: HTTP {status}, esperado 200")
            continue
        text = body.decode("utf-8", errors="replace")
        if "/src/main.js" not in text:
            errors.append(f"{route}: no devolvió el shell SPA canónico")

    for route in INDEXABLE_ROUTES:
        if route not in cache:
            continue
        status, _, headers = cache[route]
        if status != 200:
            errors.append(f"{route}: HTTP {status}, esperado 200")
            continue
        x_robots = headers.get("x-robots-tag", "").lower()
        if "index" not in x_robots or "follow" not in x_robots or "noindex" in x_robots:
            errors.append(f"{route}: X-Robots-Tag indexable inválido: {x_robots!r}")

    for route in NOINDEX_ROUTES:
        if route not in cache:
            continue
        status, _, headers = cache[route]
        if status != 200:
            errors.append(f"{route}: HTTP {status}, esperado 200")
            continue
        x_robots = headers.get("x-robots-tag", "").lower()
        if "noindex" not in x_robots or "nofollow" not in x_robots:
            errors.append(f"{route}: X-Robots-Tag privado inválido: {x_robots!r}")

    return errors


def check_aliases(base_url: str, revision: str, attempt: int) -> list[str]:
    errors: list[str] = []
    canonical_origin = urlsplit(base_url).scheme + "://" + urlsplit(base_url).netloc

    for alias, destination in SEO_ALIAS_REDIRECTS:
        try:
            status, _, headers = fetch_no_redirect(base_url, alias, revision, attempt)
        except RuntimeError as error:
            errors.append(str(error))
            continue

        if status != 301:
            errors.append(f"{alias}: HTTP {status}, esperado 301 hacia {destination}")
            continue

        location = headers.get("location", "").strip()
        allowed = {destination, canonical_origin + destination}
        if location not in allowed:
            errors.append(
                f"{alias}: Location inválido {location!r}; esperado {destination!r}"
            )

    return errors


def check_origin_redirects(base_url: str, revision: str, attempt: int) -> list[str]:
    errors: list[str] = []
    legacy_https = legacy_www_origin(base_url)
    sources = (
        (replace_scheme(base_url, "http"), "HTTP apex"),
        (legacy_https, "HTTPS www"),
        (replace_scheme(legacy_https, "http"), "HTTP www"),
    )

    for source, label in sources:
        for path in ORIGIN_REDIRECT_PROBES:
            expected = build_url(base_url, path, revision, attempt)

            try:
                status, _, headers = fetch_no_redirect(
                    source,
                    path,
                    revision,
                    attempt,
                )
            except RuntimeError as error:
                errors.append(f"{label} {path}: {error}")
                continue

            if status != 301:
                errors.append(
                    f"{label} {path}: HTTP {status}, esperado 301 directo hacia {expected}"
                )
                continue

            location = headers.get("location", "").strip()
            if location != expected:
                errors.append(
                    f"{label} {path}: Location {location!r}; esperado {expected!r} "
                    "sin cadena y conservando path/query"
                )

    return errors


def check_seo(base_url: str, revision: str, attempt: int) -> list[str]:
    errors: list[str] = []

    for route in INDEXABLE_ROUTES:
        expected = base_url.rstrip("/") + "/" if route == "/" else base_url.rstrip("/") + route
        try:
            status, body, _ = fetch(base_url, route, revision, attempt)
        except RuntimeError as error:
            errors.append(str(error))
            continue
        if status != 200:
            errors.append(f"{route}: HTTP {status}, esperado 200 para SEO")
            continue
        parser = CanonicalParser()
        parser.feed(body.decode("utf-8", errors="replace"))
        if parser.canonicals != [expected]:
            errors.append(
                f"{route}: canonical inválido: {parser.canonicals!r}; esperado [{expected!r}]"
            )

    return errors


def verify_once(root: Path, base_url: str, revision: str, attempt: int) -> list[str]:
    return (
        check_exact_files(root, base_url, revision, attempt)
        + check_routes(base_url, revision, attempt)
        + check_aliases(base_url, revision, attempt)
        + check_seo(base_url, revision, attempt)
        + check_origin_redirects(base_url, revision, attempt)
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--attempts", type=int, default=DEFAULT_ATTEMPTS)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument(
        "--redirects-only",
        action="store_true",
        help="validate only cross-origin canonical redirects",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    base_url = str(args.base_url).rstrip("/")
    revision = str(args.revision).strip()
    attempts = max(1, int(args.attempts))
    delay = max(0.0, float(args.delay))

    if not revision:
        print("ERROR: --revision no puede estar vacío", file=sys.stderr)
        return 2

    mode = "redirects-only" if args.redirects_only else "full"
    print(
        f"Production verification · mode={mode} · base={base_url} · revision={revision}"
    )
    if args.redirects_only:
        print(f"Origin redirect probes={len(ORIGIN_REDIRECT_PROBES) * 3}")
    else:
        print(
            f"Exact static files={len(EXACT_FILES)} · exact route files={len(EXACT_ROUTE_FILES)} · "
            f"indexable routes={len(INDEXABLE_ROUTES)} · aliases={len(SEO_ALIAS_REDIRECTS)} · "
            f"origin redirect probes={len(ORIGIN_REDIRECT_PROBES) * 3} · "
            f"noindex routes={len(NOINDEX_ROUTES)}"
        )

    last_errors: list[str] = []
    for attempt in range(1, attempts + 1):
        print(f"\nIntento {attempt}/{attempts}")
        if args.redirects_only:
            last_errors = check_origin_redirects(
                base_url,
                revision,
                attempt,
            )
        else:
            last_errors = verify_once(root, base_url, revision, attempt)
        if not last_errors:
            print("Production verification: PASS")
            return 0
        for error in last_errors:
            print(f"- {error}")
        if attempt < attempts:
            print(f"Esperando {delay:g}s por propagación/cache...")
            time.sleep(delay)

    print("\nProduction verification: FAIL", file=sys.stderr)
    failure = (
        "La canonicalización externa de host no cumple el contrato"
        if args.redirects_only
        else "Producción no coincide con el commit esperado"
    )
    print(f"{failure} tras {attempts} intentos.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
