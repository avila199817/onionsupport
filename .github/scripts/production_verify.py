#!/usr/bin/env python3
"""Strict post-deploy verifier for Onion Support production.

The verifier compares critical static files served by Azure Static Web Apps with
exact bytes from the checked-out commit and validates SPA/SEO route headers. It
retries for a bounded propagation window and exits non-zero on any final drift.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = "https://www.onionsupport.com"
DEFAULT_ATTEMPTS = 8
DEFAULT_DELAY_SECONDS = 10.0
REQUEST_TIMEOUT_SECONDS = 20.0

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
    "src/features/public-home-experience/index.js",
    "src/css/app.css",
    "src/css/views/public/index.css",
    "src/css/views/public/home-experience.css",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
)

PUBLIC_ROUTES = (
    "/",
    "/login",
    "/password-request",
    "/password-reset",
    "/activate-account",
)

PRIVATE_ROUTES = (
    "/dashboard",
    "/incidencias",
    "/facturas",
    "/clientes",
    "/usuarios",
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


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_url(base_url: str, path: str, revision: str, attempt: int) -> str:
    base = base_url.rstrip("/") + "/"
    url = urljoin(base, path.lstrip("/"))
    query = urlencode({"deploy_check": revision, "attempt": attempt})
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{query}"


def fetch(base_url: str, path: str, revision: str, attempt: int) -> tuple[int, bytes, dict[str, str]]:
    url = build_url(base_url, path, revision, attempt)
    request = Request(
        url,
        headers={
            "User-Agent": "OnionSupport-Production-Verification/1.0",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Accept-Encoding": "identity",
        },
        method="GET",
    )

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

    return errors


def check_spa_routes(base_url: str, revision: str, attempt: int) -> list[str]:
    errors: list[str] = []

    for route in PUBLIC_ROUTES + PRIVATE_ROUTES:
        try:
            status, body, headers = fetch(base_url, route, revision, attempt)
        except RuntimeError as error:
            errors.append(str(error))
            continue

        if status != 200:
            errors.append(f"{route}: HTTP {status}, esperado 200")
            continue

        text = body.decode("utf-8", errors="replace")
        if "/src/main.js" not in text:
            errors.append(f"{route}: no devolvió el shell SPA canónico")

        x_robots = headers.get("x-robots-tag", "").lower()
        if route in PRIVATE_ROUTES:
            if "noindex" not in x_robots or "nofollow" not in x_robots:
                errors.append(
                    f"{route}: X-Robots-Tag privado inválido: {x_robots!r}"
                )
        elif route == "/" and x_robots:
            if "index" not in x_robots or "follow" not in x_robots:
                errors.append(f"/: X-Robots-Tag público inválido: {x_robots!r}")

    return errors


def check_seo(base_url: str, revision: str, attempt: int) -> list[str]:
    errors: list[str] = []
    expected_home = base_url.rstrip("/") + "/"

    try:
        status, body, _ = fetch(base_url, "/", revision, attempt)
    except RuntimeError as error:
        return [str(error)]

    if status != 200:
        return [f"/: HTTP {status}, esperado 200 para SEO"]

    parser = CanonicalParser()
    parser.feed(body.decode("utf-8", errors="replace"))
    if parser.canonicals != [expected_home]:
        errors.append(
            f"/: canonical inválido: {parser.canonicals!r}; esperado [{expected_home!r}]"
        )

    return errors


def verify_once(root: Path, base_url: str, revision: str, attempt: int) -> list[str]:
    errors: list[str] = []
    errors.extend(check_exact_files(root, base_url, revision, attempt))
    errors.extend(check_spa_routes(base_url, revision, attempt))
    errors.extend(check_seo(base_url, revision, attempt))
    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--attempts", type=int, default=DEFAULT_ATTEMPTS)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
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

    print(f"Production verification · base={base_url} · revision={revision}")
    print(f"Exact files={len(EXACT_FILES)} · SPA routes={len(PUBLIC_ROUTES) + len(PRIVATE_ROUTES)}")

    last_errors: list[str] = []

    for attempt in range(1, attempts + 1):
        print(f"\nIntento {attempt}/{attempts}")
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
    print(
        f"Producción no coincide con el commit esperado tras {attempts} intentos.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
