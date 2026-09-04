#!/usr/bin/env python3
"""Static and production contract for Onion Support Google measurement.

The contract locks the active GA4 and Google Ads destinations, Consent Mode v2,
privacy-safe public-route measurement, direct lead conversions, the accessible
consent UI and byte-exact production deployment. It deliberately prevents
duplicate Google tags, legacy identifiers and accidental measurement of private
SPA routes.
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
CONSENT_STYLESHEET_PATH = "src/analytics/google-consent.css"
PRODUCTION_ASSETS = (BOOTSTRAP_PATH, CONSENT_STYLESHEET_PATH)

PUBLIC_SURFACES = (
    "index.html",
    "seo/reparacion-ordenadores.html",
    "seo/soporte-informatico.html",
    "seo/redes-wifi.html",
    "seo/impresoras.html",
    "seo/soporte-empresas.html",
)

PUBLIC_MARKETING_PATHS = (
    "/",
    "/reparacion-ordenadores",
    "/soporte-informatico",
    "/redes-wifi",
    "/impresoras",
    "/soporte-empresas",
)

SCRIPT_TAG = '<script defer src="/src/analytics/google-tag.js"></script>'
MODULE_SCRIPT_TAG = '<script type="module" src="/src/analytics/google-tag.js"></script>'
REQUEST_TIMEOUT_SECONDS = 20.0

CLICK_CAPTURE_PATTERN = re.compile(
    r'document\.addEventListener\(\s*"click"\s*,.*?\}\s*,\s*true\s*\);',
    re.DOTALL,
)
GA_CONFIG_PATTERN = re.compile(
    rf'window\.gtag\(\s*"config"\s*,\s*GOOGLE_ANALYTICS_TAG_ID\s*,\s*\{{'
)
ADS_CONFIG_PATTERN = re.compile(
    rf'window\.gtag\(\s*"config"\s*,\s*GOOGLE_ADS_TAG_ID\s*,\s*\{{'
)
CONSENT_DEFAULT_PATTERN = re.compile(
    r'window\.gtag\(\s*"consent"\s*,\s*"default"\s*,',
    re.DOTALL,
)
CONSENT_UPDATE_PATTERN = re.compile(
    r'window\.gtag\(\s*"consent"\s*,\s*"update"\s*,',
    re.DOTALL,
)

GA_ID_PATTERN = re.compile(r"\bG-[A-Z0-9]{8,}\b")
ADS_ID_PATTERN = re.compile(r"\bAW-\d{6,}\b")
RUNTIME_ID_GLOBS = (
    "*.html",
    "seo/*.html",
    "src/**/*.js",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def position_or_error(text: str, pattern: re.Pattern[str], label: str) -> tuple[int, str | None]:
    match = pattern.search(text)
    if not match:
        return -1, f"{BOOTSTRAP_PATH}: falta {label}"
    return match.start(), None


def validate_runtime_ids(root: Path) -> list[str]:
    errors: list[str] = []
    files: set[Path] = set()

    for pattern in RUNTIME_ID_GLOBS:
        files.update(path for path in root.glob(pattern) if path.is_file())

    for path in sorted(files):
        relative = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8")

        unexpected_ga = sorted(set(GA_ID_PATTERN.findall(text)) - {GA4_TAG_ID})
        unexpected_ads = sorted(
            set(ADS_ID_PATTERN.findall(text)) - {GOOGLE_ADS_TAG_ID}
        )

        for identifier in unexpected_ga:
            errors.append(
                f"{relative}: identificador GA4 antiguo o no autorizado: "
                f"{identifier}"
            )

        for identifier in unexpected_ads:
            errors.append(
                f"{relative}: identificador Google Ads antiguo o no autorizado: "
                f"{identifier}"
            )

    return errors


def validate_source(root: Path) -> list[str]:
    errors: list[str] = []
    errors.extend(validate_runtime_ids(root))
    bootstrap = root / BOOTSTRAP_PATH
    consent_css = root / CONSENT_STYLESHEET_PATH

    if not bootstrap.is_file():
        return [f"{BOOTSTRAP_PATH}: archivo obligatorio inexistente"]
    if not consent_css.is_file():
        return [f"{CONSENT_STYLESHEET_PATH}: archivo obligatorio inexistente"]

    text = bootstrap.read_text(encoding="utf-8")
    css = consent_css.read_text(encoding="utf-8")
    # The trusted contract supports the existing classic release and the
    # public-site-v3 migration. Build tooling and compatibility-copy bytes stay
    # identical; v3 executes the Vite module graph from the single SPA entry.
    index_path = root / "index.html"
    index_text = index_path.read_text(encoding="utf-8") if index_path.is_file() else ""
    module_bootstrap = '<!-- public-site-v3: generated metadata -->' in index_text
    if module_bootstrap:
        for literal in (
            'from "../features/entity-overlay/modal-lifecycle.js";',
            'const modalLifecycle = createModalLifecycle({',
            'modalLifecycle.activate()',
            'modalLifecycle.deactivate({ restoreFocus })',
        ):
            if literal not in text:
                errors.append(f"{BOOTSTRAP_PATH}: falta autoridad modal compartida: {literal}")
        for obsolete in ('function trapDialogFocus(', 'function focusableDialogElements(', 'function handleGlobalKeydown('):
            if obsolete in text:
                errors.append(f"{BOOTSTRAP_PATH}: no debe reintroducir motor modal propio: {obsolete}")
        main_path = root / "src/main.js"
        main_text = main_path.read_text(encoding="utf-8") if main_path.is_file() else ""
        bootstrap_import = 'import "./analytics/google-tag.js";'
        if main_text.count(bootstrap_import) != 1 or not main_text.lstrip().startswith(bootstrap_import):
            errors.append("src/main.js: debe importar una vez el módulo canónico de consentimiento antes del boot")
    elif re.search(r'^\s*(?:import\s|export\s)', text, re.MULTILINE):
        errors.append(f"{BOOTSTRAP_PATH}: el modo clásico no puede ejecutar imports/exports de módulo")

    required_literals = (
        f'const GOOGLE_ANALYTICS_TAG_ID = "{GA4_TAG_ID}";',
        f'const GOOGLE_ADS_TAG_ID = "{GOOGLE_ADS_TAG_ID}";',
        f'"{CONTACT_CONVERSION_DESTINATION}";',
        f'"{WHATSAPP_CONVERSION_DESTINATION}";',
        'const CONSENT_STORAGE_KEY = "onion_google_consent_v2";',
        'const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;',
        'const CONSENT_STYLESHEET_URL = "/src/analytics/google-consent.css";',
        "const PUBLIC_MARKETING_PATHS = new Set([",
        "const ALLOWED_CAMPAIGN_QUERY_KEYS = new Set([",
        "analytics_storage:",
        "ad_storage:",
        "ad_user_data:",
        "ad_personalization:",
        'window.gtag("set", "ads_data_redaction", true);',
        'window.gtag("set", "url_passthrough", true);',
        'window.gtag("set", "allow_google_signals", false);',
        'window.gtag("set", "allow_ad_personalization_signals", false);',
        'window.gtag("js", new Date());',
        "send_page_view: false,",
        "function sanitizePageLocation() {",
        "function isPublicMarketingRoute(",
        "function updateRouteMeasurementGuard(",
        "function ensureGoogleProductsConfigured() {",
        "function trackCurrentPageView(",
        "function sendGoogleAdsConversion(destination, parameters = {}) {",
        'window.addEventListener("onion:public-support:accepted", () => {',
        'trackAnalyticsEvent("generate_lead", {',
        'trackAnalyticsEvent("click_to_call", {',
        'trackAnalyticsEvent("contact_email", {',
        "sendGoogleAdsConversion(WHATSAPP_CONVERSION_DESTINATION",
        "sendGoogleAdsConversion(CONTACT_CONVERSION_DESTINATION",
        "window.OnionGoogleConsent = Object.freeze({",
        'data-consent-action="reject"',
        'data-consent-action="accept"',
        'data-consent-action="settings"',
        "No activamos publicidad",
        "La preferencia técnica se guarda localmente durante",
        "https://www.googletagmanager.com/gtag/js?id=",
    )

    for literal in required_literals:
        if literal not in text:
            errors.append(f"{BOOTSTRAP_PATH}: falta contrato obligatorio: {literal}")

    for path in PUBLIC_MARKETING_PATHS:
        literal = f'"{path}",'
        if path == "/":
            literal = '"/",'
        if literal not in text:
            errors.append(
                f"{BOOTSTRAP_PATH}: falta superficie pública permitida: {path}"
            )

    if text.count("googletagmanager.com/gtag/js?id=") != 1:
        errors.append(
            f"{BOOTSTRAP_PATH}: gtag.js debe declararse exactamente una vez"
        )

    if text.count(CONTACT_CONVERSION_DESTINATION) != 1:
        errors.append(
            f"{BOOTSTRAP_PATH}: Contacto debe existir exactamente una vez"
        )

    if text.count(WHATSAPP_CONVERSION_DESTINATION) != 1:
        errors.append(
            f"{BOOTSTRAP_PATH}: WhatsApp debe existir exactamente una vez"
        )

    consent_default_pos, error = position_or_error(
        text, CONSENT_DEFAULT_PATTERN, "Consent Mode v2 default"
    )
    if error:
        errors.append(error)

    consent_update_pos, error = position_or_error(
        text, CONSENT_UPDATE_PATTERN, "Consent Mode v2 update"
    )
    if error:
        errors.append(error)

    ga_config_pos, error = position_or_error(
        text, GA_CONFIG_PATTERN, "configuración GA4"
    )
    if error:
        errors.append(error)

    ads_config_pos, error = position_or_error(
        text, ADS_CONFIG_PATTERN, "configuración Google Ads"
    )
    if error:
        errors.append(error)

    js_pos = text.find('window.gtag("js", new Date());')
    if min(consent_default_pos, js_pos, ga_config_pos, ads_config_pos) >= 0:
        if not consent_default_pos < js_pos < ga_config_pos < ads_config_pos:
            errors.append(
                f"{BOOTSTRAP_PATH}: orden inválido; consentimiento debe preceder "
                "a js, GA4 y Google Ads"
            )

    send_conversion_pos = text.find(
        "function sendGoogleAdsConversion(destination, parameters = {}) {"
    )
    if ads_config_pos >= 0 and send_conversion_pos >= 0:
        if ads_config_pos > send_conversion_pos:
            errors.append(
                f"{BOOTSTRAP_PATH}: Google Ads debe configurarse de forma "
                "sitewide antes del helper de conversiones"
            )

    if consent_update_pos >= 0 and consent_default_pos >= 0:
        if consent_update_pos < consent_default_pos:
            errors.append(
                f"{BOOTSTRAP_PATH}: consent update aparece antes de consent default"
            )

    if not CLICK_CAPTURE_PATTERN.search(text):
        errors.append(
            f"{BOOTSTRAP_PATH}: el listener de contactos debe ejecutarse en captura"
        )

    if not text.rstrip().endswith("})();"):
        errors.append(f"{BOOTSTRAP_PATH}: bootstrap IIFE incompleto")

    private_markers = (
        'window[`ga-disable-${GOOGLE_ANALYTICS_TAG_ID}`] = disabled;',
        "if (!isPublicMarketingRoute()) return;",
        "page_location: sanitizePageLocation(),",
    )
    for marker in private_markers:
        if marker not in text:
            errors.append(
                f"{BOOTSTRAP_PATH}: falta protección de rutas/datos privados: {marker}"
            )

    forbidden_literals = (
        "ADS_AUTO_CONFIG_DELAY_MS",
        "REMOTE_FALLBACK_DELAY_MS = 15000",
        "REMOTE_LOAD_MIN_DELAY_MS",
        'window.gtag("config", GOOGLE_ANALYTICS_TAG_ID);',
        'window.gtag("config", GOOGLE_ADS_TAG_ID);',
        "send_page_view: true",
        'ad_personalization: "granted"',
        "allow_google_signals: true",
        "allow_ad_personalization_signals: true",
    )
    for literal in forbidden_literals:
        if literal in text:
            errors.append(
                f"{BOOTSTRAP_PATH}: regresión de privacidad/medición detectada: {literal}"
            )

    required_css_literals = (
        ".onion-google-consent__banner",
        ".onion-google-consent__button--decision",
        ".onion-google-consent__preferences",
        ".onion-google-consent__dialog",
        ".onion-google-consent__backdrop",
        ':focus-visible',
        "@media (max-width: 760px)",
        "@media (prefers-reduced-motion: reduce)",
        "[hidden]",
    )
    for literal in required_css_literals:
        if literal not in css:
            errors.append(
                f"{CONSENT_STYLESHEET_PATH}: falta contrato visual/accesible: {literal}"
            )

    if "url(" in css.lower():
        errors.append(
            f"{CONSENT_STYLESHEET_PATH}: no debe depender de recursos remotos"
        )

    for relative in PUBLIC_SURFACES:
        page = root / relative
        if not page.is_file():
            errors.append(f"{relative}: superficie pública obligatoria inexistente")
            continue

        page_text = page.read_text(encoding="utf-8")
        if module_bootstrap and relative == "index.html":
            if '/src/analytics/google-tag.js' in page_text:
                errors.append("index.html: Google debe ejecutarse desde src/main.js, sin segunda etiqueta")
            main_tags = re.findall(r'<script\b[^>]*type=["\']module["\'][^>]*>', page_text, re.IGNORECASE)
            if len(main_tags) != 1 or 'src="/src/main.js"' not in main_tags[0]:
                errors.append("index.html: debe conservar src/main.js como única entrada módulo")
            if "googletagmanager.com/gtag/js" in page_text:
                errors.append("index.html: no debe instalar una segunda etiqueta remota")
            continue

        expected_tag = MODULE_SCRIPT_TAG if module_bootstrap else SCRIPT_TAG
        count = page_text.count(expected_tag)
        if count != 1:
            errors.append(
                f"{relative}: debe cargar {expected_tag!r} exactamente una vez; "
                f"encontrado {count}"
            )
            continue

        if module_bootstrap and SCRIPT_TAG in page_text:
            errors.append(f"{relative}: no puede ejecutar además el bootstrap clásico")
        script_pos = page_text.find(expected_tag)
        head_close = page_text.lower().find("</head>")
        if head_close < 0 or script_pos > head_close:
            errors.append(
                f"{relative}: el bootstrap de medición debe cargarse dentro de <head>"
            )

        if "googletagmanager.com/gtag/js" in page_text:
            errors.append(
                f"{relative}: no debe instalar una segunda etiqueta remota"
            )

    return errors


def fetch_live(
    base_url: str,
    relative_path: str,
    revision: str,
    attempt: int,
) -> bytes:
    base = base_url.rstrip("/") + "/"
    url = urljoin(base, relative_path)
    query = urlencode(
        {
            "deploy_check": revision,
            "asset": Path(relative_path).name,
            "attempt": attempt,
        }
    )
    request = Request(
        f"{url}?{query}",
        headers={
            "User-Agent": "OnionSupport-Google-Measurement-Contract/2.0",
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
                    f"{relative_path}: HTTP {response.status}, esperado 200"
                )
            return response.read()
    except HTTPError as error:
        raise RuntimeError(
            f"{relative_path}: HTTP {error.code}, esperado 200"
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise RuntimeError(f"{relative_path}: error de red: {error}") from error


def verify_production(
    root: Path,
    base_url: str,
    revision: str,
    attempts: int,
    delay: float,
) -> list[str]:
    errors: list[str] = []

    for relative_path in PRODUCTION_ASSETS:
        expected = (root / relative_path).read_bytes()
        last_error = ""

        for attempt in range(1, attempts + 1):
            try:
                deployed = fetch_live(
                    base_url,
                    relative_path,
                    revision,
                    attempt,
                )
            except RuntimeError as error:
                last_error = str(error)
            else:
                if deployed == expected:
                    print(
                        "Google measurement production bytes: PASS · "
                        f"asset={relative_path} · "
                        f"sha256={sha256(deployed)[:16]} · "
                        f"attempt={attempt}/{attempts}"
                    )
                    last_error = ""
                    break

                last_error = (
                    f"{relative_path}: contenido productivo distinto al commit "
                    f"(prod={sha256(deployed)[:16]} "
                    f"local={sha256(expected)[:16]})"
                )

            if attempt < attempts:
                time.sleep(delay)

        if last_error:
            errors.append(last_error)

    return errors


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
        "ConsentMode=v2 · AdsPersonalization=denied · "
        f"public-surfaces={len(PUBLIC_SURFACES)} · "
        f"production-assets={len(PRODUCTION_ASSETS)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
