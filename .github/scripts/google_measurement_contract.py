#!/usr/bin/env python3
"""Static and production contract for Onion Support Google measurement.

The contract deliberately locks the Google Analytics destination, Google Ads
destination, public-contact conversion destination and WhatsApp conversion
destination that are configured in the Google Ads account. It also proves that
the shared bootstrap is loaded by every public marketing surface and can
optionally compare the deployed bootstrap with exact bytes from the expected
revision.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

GA4_TAG_ID = "G-RQ77310QBH"
GOOGLE_ADS_TAG_ID = "AW-18395700376"
CONTACT_CONVERSION_DESTINATION = "AW-18395700376/WjQvCIe1tuMcEJi54MNE"
WHATSAPP_CONVERSION_DESTINATION = "AW-18395700376/6zBcCL3zo-ccEJi54MNE"
BOOTSTRAP_PATH = "src/analytics/google-tag.js"
PUBLIC_SURFACES = (
    "index.html",
    "seo/reparacion-ordenadores.html",
    "seo/soporte-informatico.html",
    "seo/redes-wifi.html",
    "seo/impresoras.html",
    "seo/soporte-empresas.html",
)
SCRIPT_TAG = '<script defer src="/src/analytics/google-tag.js"></script>'
REQUEST_TIMEOUT_SECONDS = 20.0
CLICK_CAPTURE_PATTERN = re.compile(
    r'document\.addEventListener\(\s*"click"\s*,.*?\}\s*,\s*true\s*\);',
    re.DOTALL,
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_source(root: Path) -> list[str]:
    errors: list[str] = []
    bootstrap = root / BOOTSTRAP_PATH

    if not bootstrap.is_file():
        return [f"{BOOTSTRAP_PATH}: archivo obligatorio inexistente"]

    text = bootstrap.read_text(encoding="utf-8")
    required_snippets = (
        f'const GOOGLE_ANALYTICS_TAG_ID = "{GA4_TAG_ID}";',
        f'const GOOGLE_ADS_TAG_ID = "{GOOGLE_ADS_TAG_ID}";',
        f'"{CONTACT_CONVERSION_DESTINATION}";',
        f'"{WHATSAPP_CONVERSION_DESTINATION}";',
        "https://www.googletagmanager.com/gtag/js?id=",
        'window.gtag("js", new Date());',
        'window.gtag("config", GOOGLE_ANALYTICS_TAG_ID);',
        'window.gtag("config", GOOGLE_ADS_TAG_ID);',
        'function sendGoogleAdsConversion(destination) {',
        'window.gtag("event", "conversion", {',
        "send_to: destination,",
        'sendGoogleAdsConversion(WHATSAPP_CONVERSION_DESTINATION);',
        'window.addEventListener("onion:public-support:accepted", () => {',
        'sendGoogleAdsConversion(CONTACT_CONVERSION_DESTINATION);',
        'if (/^whatsapp:/i.test(href)) return true;',
        'host === "wa.me"',
        'host.endsWith(".wa.me")',
        'host === "whatsapp.com"',
        'host.endsWith(".whatsapp.com")',
        "const REMOTE_FALLBACK_DELAY_MS = 15000;",
        'const ANALYTICS_CONSENT_EVENT = "onion:analytics:consent-granted";',
        "function promoteAnalyticsOnSignificantInteraction(event) {",
        "if (event?.isTrusted !== true) return;",
        "scheduleRemoteGoogleTag();",
    )

    for snippet in required_snippets:
        if snippet not in text:
            errors.append(f"{BOOTSTRAP_PATH}: falta contrato obligatorio: {snippet}")

    if text.count("googletagmanager.com/gtag/js?id=") != 1:
        errors.append(
            f"{BOOTSTRAP_PATH}: gtag.js debe declararse exactamente una vez"
        )

    if text.count(CONTACT_CONVERSION_DESTINATION) != 1:
        errors.append(
            f"{BOOTSTRAP_PATH}: el destino de conversión de Contacto debe existir exactamente una vez"
        )

    if text.count(WHATSAPP_CONVERSION_DESTINATION) != 1:
        errors.append(
            f"{BOOTSTRAP_PATH}: el destino de conversión de WhatsApp debe existir exactamente una vez"
        )

    if not CLICK_CAPTURE_PATTERN.search(text):
        errors.append(
            f"{BOOTSTRAP_PATH}: el listener de WhatsApp debe ejecutarse en fase de captura"
        )

    if not text.rstrip().endswith("})();"):
        errors.append(f"{BOOTSTRAP_PATH}: bootstrap IIFE incompleto")

    for forbidden in (
        "ADS_AUTO_CONFIG_DELAY_MS",
        "REMOTE_LOAD_MIN_DELAY_MS",
        '["pointerdown", "keydown", "touchstart"]',
    ):
        if forbidden in text:
            errors.append(
                f"{BOOTSTRAP_PATH}: carga remota prematura restaurada: {forbidden}"
            )

    for relative in PUBLIC_SURFACES:
        page = root / relative
        if not page.is_file():
            errors.append(f"{relative}: superficie pública obligatoria inexistente")
            continue

        page_text = page.read_text(encoding="utf-8")
        count = page_text.count(SCRIPT_TAG)
        if count != 1:
            errors.append(
                f"{relative}: debe cargar {SCRIPT_TAG!r} exactamente una vez; encontrado {count}"
            )
            continue

        script_pos = page_text.find(SCRIPT_TAG)
        head_close = page_text.lower().find("</head>")
        if head_close < 0 or script_pos > head_close:
            errors.append(
                f"{relative}: el bootstrap de medición debe cargarse dentro de <head>"
            )

    return errors


def fetch_live(base_url: str, revision: str, attempt: int) -> bytes:
    base = base_url.rstrip("/") + "/"
    url = urljoin(base, BOOTSTRAP_PATH)
    query = urlencode({"deploy_check": revision, "attempt": attempt})
    request = Request(
        f"{url}?{query}",
        headers={
            "User-Agent": "OnionSupport-Google-Measurement-Contract/1.0",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Accept-Encoding": "identity",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            if int(response.status) != 200:
                raise RuntimeError(
                    f"{BOOTSTRAP_PATH}: HTTP {response.status}, esperado 200"
                )
            return response.read()
    except HTTPError as error:
        raise RuntimeError(
            f"{BOOTSTRAP_PATH}: HTTP {error.code}, esperado 200"
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise RuntimeError(f"{BOOTSTRAP_PATH}: error de red: {error}") from error


def verify_production(
    root: Path,
    base_url: str,
    revision: str,
    attempts: int,
    delay: float,
) -> list[str]:
    expected = (root / BOOTSTRAP_PATH).read_bytes()
    last_error = ""

    for attempt in range(1, attempts + 1):
        try:
            deployed = fetch_live(base_url, revision, attempt)
        except RuntimeError as error:
            last_error = str(error)
        else:
            if deployed == expected:
                print(
                    "Google measurement production bytes: PASS · "
                    f"sha256={sha256(deployed)[:16]} · attempt={attempt}/{attempts}"
                )
                return []

            last_error = (
                f"{BOOTSTRAP_PATH}: contenido productivo distinto al commit "
                f"(prod={sha256(deployed)[:16]} local={sha256(expected)[:16]})"
            )

        if attempt < attempts:
            time.sleep(delay)

    return [last_error or f"{BOOTSTRAP_PATH}: verificación productiva fallida"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--base-url")
    parser.add_argument("--revision", default="local")
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--delay", type=float, default=5.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()

    if args.attempts < 1:
        print("ERROR: --attempts debe ser >= 1", file=sys.stderr)
        return 2
    if args.delay < 0:
        print("ERROR: --delay debe ser >= 0", file=sys.stderr)
        return 2

    errors = validate_source(root)

    if not errors and args.base_url:
        errors.extend(
            verify_production(
                root,
                args.base_url,
                args.revision,
                args.attempts,
                args.delay,
            )
        )

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(
        "Google measurement contract: PASS · "
        f"GA4={GA4_TAG_ID} · Ads={GOOGLE_ADS_TAG_ID} · "
        f"Contact={CONTACT_CONVERSION_DESTINATION} · "
        f"WhatsApp={WHATSAPP_CONVERSION_DESTINATION} · "
        f"public-surfaces={len(PUBLIC_SURFACES)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
