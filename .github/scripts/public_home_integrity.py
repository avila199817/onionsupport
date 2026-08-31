#!/usr/bin/env python3
"""Onion Support: semantic contract for the public landing and intake."""

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

REQUIRED = (
    "index.html",
    "login.html",
    "docs/PUBLIC_TICKET_INTAKE.md",
    "src/app/enhancements.js",
    "src/css/app.css",
    "src/router/styles.js",
    "src/css/views/public/index.css",
    "src/css/views/public/support-request.css",
    "src/css/views/public/public-support-progress.css",
    "src/css/views/public/home-experience.css",
    "src/features/public-support/index.js",
    "src/media/img/Cristian_Avila_Formulario_480.webp",
    "src/media/img/Cristian_Avila_Formulario_960.webp",
    "src/features/public-support-progress/index.js",
    "src/features/public-home-experience/index.js",
    "src/media/img/Cristian_Avila_224.webp",
    "src/media/img/Cristian_Avila_480.webp",
    "src/media/img/Cristian_Avila_640.webp",
    "src/media/img/Cristian_Avila_960.webp",
    "src/views/public/home/index.js",
    "src/views/public/home/template.js",
    "src/media/img/favicon_black_circle_128.webp",
    "src/preboot/public-home-preload.js",
    "src/views/public/index.js",
    "src/views/public/login/template.js",
)

FORBIDDEN = (
    "src/features/public-support/mobile-polish.js",
    "src/features/public-support-structured/index.js",
    "src/css/views/public/mobile-polish.css",
    "noop",
)

PUBLIC_ENHANCEMENTS = (
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


class IndexParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.scripts: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() != "script":
            return
        self.scripts.append(
            {str(key).lower(): str(value or "") for key, value in attrs}
        )


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def require(errors: list[str], condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


PICTURE_PATTERN = re.compile(
    r"<picture\b[^>]*>(?P<body>.*?)</picture>",
    re.DOTALL | re.IGNORECASE,
)
HERO_WEBP_PATTERN = re.compile(r"/?src/media/img/Cristian_Avila_(\d+)\.webp")


def picture_uses_modern_source(
    source: str,
    modern_reference: str,
    fallback_reference: str,
) -> bool:
    for match in PICTURE_PATTERN.finditer(source):
        body = match.group("body")
        source_index = body.find("<source")
        modern_index = body.find(modern_reference)
        image_index = body.find("<img")
        fallback_index = body.find(fallback_reference, image_index)

        if (
            source_index >= 0
            and modern_index > source_index
            and image_index > modern_index
            and fallback_index > image_index
            and 'type="image/webp"' in body[source_index:image_index]
        ):
            return True

    return False


def fallback_image_outside_picture(source: str, fallback_reference: str) -> bool:
    without_pictures = PICTURE_PATTERN.sub("", source)
    return bool(
        re.search(
            rf"<img\b[^>]*\bsrc\s*=\s*\"[^\"]*{re.escape(fallback_reference)}",
            without_pictures,
            re.DOTALL | re.IGNORECASE,
        )
    )


def webp_dimensions(relative: str) -> tuple[int, int]:
    data = (ROOT / relative).read_bytes()
    if len(data) < 20 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("cabecera RIFF/WEBP inválida")

    offset = 12
    while offset + 8 <= len(data):
        chunk = data[offset : offset + 4]
        size = int.from_bytes(data[offset + 4 : offset + 8], "little")
        payload = data[offset + 8 : offset + 8 + size]

        if chunk == b"VP8X" and len(payload) >= 10:
            width = int.from_bytes(payload[4:7], "little") + 1
            height = int.from_bytes(payload[7:10], "little") + 1
            return width, height

        if chunk == b"VP8L" and len(payload) >= 5 and payload[0] == 0x2F:
            packed = int.from_bytes(payload[1:5], "little")
            width = (packed & 0x3FFF) + 1
            height = ((packed >> 14) & 0x3FFF) + 1
            return width, height

        if chunk == b"VP8 " and len(payload) >= 14 and payload[6:9] == b"\x9d\x01\x2a":
            width = int.from_bytes(payload[10:12], "little") & 0x3FFF
            height = int.from_bytes(payload[12:14], "little") & 0x3FFF
            return width, height

        offset += 8 + size + (size % 2)

    raise ValueError("dimensiones WebP no encontradas")


def public_home_manifest(route_styles: str) -> str:
    match = re.search(
        r'"public-home"\s*:\s*Object\.freeze\(\[(?P<body>.*?)\]\)',
        route_styles,
        re.DOTALL,
    )
    return match.group("body") if match else ""


def main() -> int:
    errors: list[str] = []

    for relative in REQUIRED:
        if not (ROOT / relative).is_file():
            errors.append(f"Falta archivo obligatorio: {relative}")

    for relative in FORBIDDEN:
        if (ROOT / relative).exists():
            errors.append(f"Archivo temporal/retirado reaparecido: {relative}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    index = read("index.html")
    login_document = read("login.html")
    docs = read("docs/PUBLIC_TICKET_INTAKE.md")
    enhancements = read("src/app/enhancements.js")
    app_css = read("src/css/app.css")
    route_styles = read("src/router/styles.js")
    intake = read("src/features/public-support/index.js")
    progress_js = read("src/features/public-support-progress/index.js")
    home_experience = read("src/features/public-home-experience/index.js")
    home = read("src/views/public/home/index.js")
    home_template = read("src/views/public/home/template.js")
    home_preload = read("src/preboot/public-home-preload.js")
    public_shared = read("src/views/public/index.js")
    login_template = read("src/views/public/login/template.js")
    experience_css = read("src/css/views/public/home-experience.css")
    progress_css = read("src/css/views/public/public-support-progress.css")

    parser = IndexParser()
    parser.feed(index)
    modules = [
        item
        for item in parser.scripts
        if item.get("type", "").strip().lower() == "module"
    ]

    require(
        errors,
        len(modules) == 1 and modules[0].get("src") == "/src/main.js",
        "index.html debe ejecutar únicamente /src/main.js como módulo",
    )

    service_hierarchy = {
        "seo/reparacion-ordenadores.html": ("/reparacion-ordenadores", "https://onionsupport.com/reparacion-ordenadores"),
        "seo/soporte-informatico.html": ("/soporte-informatico", "https://onionsupport.com/soporte-informatico"),
        "seo/redes-wifi.html": ("/redes-wifi", "https://onionsupport.com/redes-wifi"),
        "seo/impresoras.html": ("/impresoras", "https://onionsupport.com/impresoras"),
        "seo/soporte-empresas.html": ("/soporte-empresas", "https://onionsupport.com/soporte-empresas"),
    }
    require(errors, 'data-public-home-service-link="true"' in home_template, "Las tarjetas de servicio deben ser enlaces HTML rastreables")
    require(errors, '"@id": `https://${BUSINESS.domain}/#business`' in home_template, "El LocalBusiness runtime debe reutilizar el @id canónico")
    require(errors, '"publisher": { "@id": "https://onionsupport.com/#business" }' in index, "El WebSite raíz debe apuntar al LocalBusiness canónico")
    canonical_login_anchor = 'data-public-home-login="true">Iniciar sesión</a>'
    require(errors, home_template.count(canonical_login_anchor) == 2, "La landing debe nombrar /login como Iniciar sesión en header y footer")
    require(errors, 'data-public-home-login="true">Panel cliente</a>' not in home_template, "La landing no puede reintroducir Panel cliente como anchor de /login")
    require(errors, '<a href="/login">Iniciar sesión</a>' in index, "El fallback raíz debe conservar Iniciar sesión como anchor de /login")
    for relative, (href, canonical) in service_hierarchy.items():
        require(errors, f'href: "{href}"' in home_template, f"La landing debe enlazar semánticamente {href}")
        source = read(relative)
        require(errors, 'data-onion-schema="service-hierarchy"' in source, f"{relative} debe declarar jerarquía WebPage/BreadcrumbList")
        require(errors, '"@type": "BreadcrumbList"' in source, f"{relative} debe declarar BreadcrumbList")
        require(errors, f'"item": "{canonical}"' in source, f"{relative} debe cerrar el breadcrumb sobre su canonical")
        require(errors, 'itemid="https://onionsupport.com/#business"' in source, f"{relative} debe reutilizar la identidad canónica del proveedor")
        login_anchor = '<a href="/login">Iniciar sesión</a>'
        require(errors, source.count(login_anchor) == 2, f"{relative} debe usar Iniciar sesión en sus dos enlaces a /login")
        require(errors, "Panel cliente" not in source and "Acceso al panel cliente" not in source, f"{relative} no puede usar anchors alternativos para /login")

    for module_path in PUBLIC_ENHANCEMENTS:
        require(
            errors,
            enhancements.count(module_path) == 1,
            f"Enhancement público sin autoridad única: {module_path}",
        )

    manifest = public_home_manifest(route_styles)
    require(
        errors,
        bool(manifest),
        "src/router/styles.js debe declarar manifest public-home",
    )
    for css_path in PUBLIC_ROUTE_CSS:
        require(
            errors,
            f'"{css_path}"' in manifest,
            f"public-home debe cargar por ruta: {css_path}",
        )

    require(
        errors,
        '"/src/css/auth/login.css"' not in manifest,
        "public-home no debe descargar la hoja de autenticación",
    )

    for css_name in (
        "support-request.css",
        "public-support-progress.css",
        "home-experience.css",
    ):
        require(
            errors,
            css_name not in app_css,
            f"src/css/app.css no puede cargar CSS específico de public-home: {css_name}",
        )

    require(
        errors,
        "mobile-polish.js" not in index and "mobile-polish.css" not in app_css,
        "No debe reaparecer la capa legacy mobile-polish",
    )

    # Intake: endpoint, auth opcional, España, idempotencia, identidad y anti-enumeración.
    for snippet, message in (
        ('PUBLIC_TICKET_ENDPOINT = "/api/tickets/public"', "Falta POST /api/tickets/public"),
        ('SPAIN_PREFIX = "+34"', "Falta prefijo telefónico España"),
        ('/^[6789]\\d{8}$/', "Falta validación nacional española"),
        ('const useAuth = session().authenticated === true;', "Falta auth opcional"),
        ('auth: useAuth,', "El POST no consume auth opcional"),
        ('"Idempotency-Key": requestKey', "Falta Idempotency-Key"),
        ('idempotencyKey(form)', "Falta clave estable de idempotencia"),
        ('neutralAccepted(response)', "Falta respuesta anti-enumeración"),
        ('intakeIconNode', "Falta icono interno de incidencia"),
        ('formatNationalSpanishPhone', "Falta formato nacional español del teléfono"),
        ('"tel-national"', "El teléfono debe usar autocomplete nacional"),
        ('public-support.intake.v10-canonical-panel-handoff', "Falta versión final del contrato público"),
        ('currentFormPhone(form)', "El bloqueo local debe observar el teléfono"),
        ('publicSupportBlockedPhone', "Falta lock local por teléfono"),
        ('lockMatchesCurrentIdentity(form)', "El lock debe resolver email O teléfono"),
        ('Este formulario no crea ni modifica fichas de cliente.', "La UI debe declarar que no crea clientes"),
        ('correo o teléfono', "La UI debe explicar la reutilización por correo O teléfono"),
        ('sin modificar el perfil', "La UI debe declarar no-overwrite de usuario existente"),
        ('"Enviando solicitud…"', "El estado busy debe permanecer neutro"),
        ('"onion:public-support:accepted"', "El evento de aceptación debe ser semánticamente neutro"),
        ('postalCode: text(data.get("postalCode")).slice(0, 5)', "Falta CP estructurado en payload"),
        ('city: text(data.get("city")).slice(0, 90)', "Falta ciudad estructurada en payload"),
        ('province: text(data.get("province")).slice(0, 90)', "Falta provincia estructurada en payload"),
        ('country: "España"', "Falta país canónico en payload"),
        ('...addressParts(user)', "Falta prefill estructurado desde usuario existente"),
        ('new MutationObserver(queueScan)', "El intake debe coalescer mutaciones por frame"),
    ):
        require(errors, snippet in intake, message)

    require(
        errors,
        "SPAIN_PHONE_DEFAULT" not in intake,
        "El intake no puede inyectar +34 dentro del input telefónico",
    )
    require(
        errors,
        'root.addEventListener("focusin", onFocusIn' not in intake,
        "El intake no debe mutar el teléfono al recibir focus",
    )
    require(
        errors,
        'phone: normalizeSpanishPhone(data.get("phone"))' in intake,
        "El payload debe seguir normalizando el teléfono con +34",
    )
    require(
        errors,
        "fullName: fullName(user)" not in intake,
        "El formulario público no debe precargar automáticamente el nombre",
    )
    require(
        errors,
        "public: true," not in intake and "noAuthHeader: true," not in intake,
        "El intake no debe forzar la retirada de Authorization",
    )
    require(
        errors,
        "lockMatchesCurrentEmail" not in intake,
        "No debe reaparecer el lock legacy limitado sólo al correo",
    )
    require(
        errors,
        "cuenta de cliente" not in intake.lower(),
        "La UI pública no debe prometer creación/gestión automática de cuenta de cliente",
    )
    require(
        errors,
        '"onion:public-support:created"' not in intake,
        "Una aceptación anónima neutra no puede publicarse como evento created",
    )

    # La fotografía secundaria no puede volver a descargar el PNG de 1,6 MB
    # en navegadores modernos ni perder sus dimensiones intrínsecas.
    for snippet, message in (
        ("<picture>", "La fotografía del técnico debe usar picture"),
        ("PUBLIC_SUPPORT_TECHNICIAN_PHOTO_WEBP_480", "Falta WebP 480 del técnico"),
        ("PUBLIC_SUPPORT_TECHNICIAN_PHOTO_WEBP_960", "Falta WebP 960 del técnico"),
        (" 480w, ${PUBLIC_SUPPORT_TECHNICIAN_PHOTO_WEBP_960} 960w", "Falta srcset responsive del técnico"),
        ('width="1122"', "Falta anchura intrínseca del técnico"),
        ('height="1402"', "Falta altura intrínseca del técnico"),
        ('loading="lazy"', "La fotografía secundaria debe seguir siendo lazy"),
        ('fetchpriority="low"', "La fotografía secundaria no puede competir con el hero"),
    ):
        require(errors, snippet in intake, message)

    for relative, maximum in (
        ("src/media/img/Cristian_Avila_Formulario_480.webp", 30_000),
        ("src/media/img/Cristian_Avila_Formulario_960.webp", 70_000),
    ):
        size = (ROOT / relative).stat().st_size
        require(
            errors,
            size <= maximum,
            f"Budget imagen excedido: {relative} pesa {size} B (máximo {maximum} B)",
        )

    # Imágenes públicas críticas: el navegador moderno debe elegir WebP,
    # template y preload deben describir el mismo hero, y los assets no pueden
    # recuperar el peso que Lighthouse acaba de eliminar.
    expected_hero_widths = [224, 480, 640, 960]
    expected_hero_sizes = (
        "(max-width: 720px) calc(100vw - 90px), "
        "(max-width: 1040px) 206px, "
        "(max-width: 1240px) 176px, 196px"
    )
    template_hero_widths = sorted(
        {int(width) for width in HERO_WEBP_PATTERN.findall(home_template)}
    )
    preload_hero_widths = sorted(
        {int(width) for width in HERO_WEBP_PATTERN.findall(home_preload)}
    )

    require(
        errors,
        template_hero_widths == expected_hero_widths,
        f"Hero responsive inválido en template: {template_hero_widths}",
    )
    require(
        errors,
        preload_hero_widths == expected_hero_widths,
        f"Hero responsive inválido en preload: {preload_hero_widths}",
    )
    require(
        errors,
        template_hero_widths == preload_hero_widths,
        "El srcset del hero y su preload están desincronizados",
    )
    require(
        errors,
        "${profilePhotoWebp224} 224w, ${profilePhotoWebp480} 480w, ${profilePhotoWebp640} 640w, ${profilePhotoWebp960} 960w"
        in home_template,
        "El picture del hero debe elegir 224/480/640/960 WebP",
    )
    for snippet, message in (
        ('["/src/media/img/Cristian_Avila_224.webp", "224w"]', "El preload no ofrece hero 224w"),
        ('["/src/media/img/Cristian_Avila_480.webp", "480w"]', "El preload no ofrece hero 480w"),
        ('["/src/media/img/Cristian_Avila_640.webp", "640w"]', "El preload no ofrece hero 640w"),
        ('["/src/media/img/Cristian_Avila_960.webp", "960w"]', "El preload no ofrece hero 960w"),
        ('href: "/src/media/img/Cristian_Avila_224.webp"', "El fallback del preload debe usar hero 224w"),
        ("imageSrcset: heroImageSrcset", "El preload debe publicar imagesrcset"),
        ("imageSizes: heroImageSizes", "El preload debe publicar imagesizes canónico"),
    ):
        require(errors, snippet in home_preload, message)

    template_sizes = re.search(
        r'const profilePhotoSizes = "(?P<value>[^"]+)"', home_template
    )
    preload_sizes = re.search(
        r'const heroImageSizes = "(?P<value>[^"]+)"', home_preload
    )
    require(
        errors,
        bool(template_sizes and preload_sizes)
        and template_sizes.group("value") == preload_sizes.group("value")
        and template_sizes.group("value") == expected_hero_sizes,
        "Los sizes del hero deben reflejar la geometría CSS y coincidir con el preload",
    )

    for source, modern_reference, fallback_reference, label in (
        (index, "/src/media/img/favicon_black_circle_128.webp", "/favicon.ico", "loader home"),
        (login_document, "/src/media/img/favicon_black_circle_128.webp", "/favicon.ico", "loader login"),
        (public_shared, "logoWebp", "logoFallback", "marca pública compartida"),
        (home_template, "logoWebp", "logoFallback", "marca home"),
        (login_template, "logoWebp", "logoFallback", "marca login"),
        (
            home_template,
            "escapeAttr(profilePhotoWebpSrcset)",
            "escapeAttr(profilePhoto)",
            "hero home",
        ),
    ):
        require(
            errors,
            picture_uses_modern_source(source, modern_reference, fallback_reference),
            f"{label}: falta WebP elegido antes del fallback",
        )
        require(
            errors,
            not fallback_image_outside_picture(source, fallback_reference),
            f"{label}: el PNG/ICO reapareció como imagen elegida fuera de picture",
        )

    for source, label in (
        (public_shared, "marca pública compartida"),
        (home_template, "marca home"),
        (login_template, "marca login"),
    ):
        require(
            errors,
            "PUBLIC_AUTH_LOGO_WEBP" in source,
            f"{label}: falta autoridad del logo WebP canónico",
        )

    image_budgets = (
        ("src/media/img/favicon_black_circle_128.webp", (128, 128), 2_500),
        ("src/media/img/Cristian_Avila_224.webp", (224, 280), 8_500),
        ("src/media/img/Cristian_Avila_480.webp", (480, 600), 32_000),
        ("src/media/img/Cristian_Avila_640.webp", (640, 800), 35_000),
        ("src/media/img/Cristian_Avila_960.webp", (960, 1200), 85_000),
    )
    for relative, expected_dimensions, maximum in image_budgets:
        size = (ROOT / relative).stat().st_size
        require(
            errors,
            size <= maximum,
            f"Budget imagen excedido: {relative} pesa {size} B (máximo {maximum} B)",
        )
        try:
            dimensions = webp_dimensions(relative)
        except (OSError, ValueError) as error:
            errors.append(f"WebP inválido: {relative} ({error})")
            continue
        require(
            errors,
            dimensions == expected_dimensions,
            f"Dimensiones WebP inválidas: {relative} es {dimensions}, esperado {expected_dimensions}",
        )

    # Progreso: deriva del data-submitting real, lenguaje neutro y observer limitado.
    for snippet, message in (
        ("PUBLIC_SUPPORT_PROGRESS_VERSION", "Falta contrato de versión del progreso"),
        ("public-support.progress.v3-neutral-intake", "Falta versión neutral del progreso"),
        ("Procesando tu solicitud…", "El overlay no debe afirmar creación antes de la respuesta"),
        ("MutationObserver", "El progreso debe observar el estado real del formulario"),
        ('VIEW_ROOT_SELECTOR = "#view-container, [data-router-view=\'true\']"', "El observer debe scopearse al Router view"),
        ('attributeFilter: ["data-submitting"]', "El observer debe limitar atributos a data-submitting"),
        ("observer.observe(root", "El observer no debe volver a documentElement"),
    ):
        require(errors, snippet in progress_js, message)

    require(
        errors,
        "observer.observe(document.documentElement" not in progress_js,
        "El progreso público no puede observar todo documentElement",
    )
    require(
        errors,
        "Creando tu incidencia…" not in progress_js,
        "El overlay no puede afirmar que se creó una incidencia antes de resolver el POST",
    )

    require(
        errors,
        ".public-support-submit-overlay" in progress_css
        and "public-support-submission-active" in progress_css,
        "Falta contrato visual del progreso de envío",
    )

    # Home: historial interno sin spam y UX autenticada/responsive.
    require(
        errors,
        home.count("replace: true,") >= 2,
        "La navegación interna debe reemplazar hash sin apilar historial",
    )

    for snippet, message in (
        ('domain: "onionsupport.com"', "Schema LocalBusiness: dominio canónico incorrecto"),
        ('url: `https://${BUSINESS.domain}/`', "Schema LocalBusiness: URL HTTPS canónica ausente"),
        ('type="application/ld+json"', "Schema LocalBusiness: script JSON-LD ausente"),
    ):
        require(errors, snippet in home_template, message)

    for snippet, message in (
        ("data-public-home-account-menu", "Falta menú autenticado"),
        ("Cerrar sesión", "Falta logout en menú autenticado"),
        ('"/incidencias"', "Falta acceso a Incidencias"),
        ('"/facturas"', "Falta acceso a Facturas"),
        ('"/cuenta"', "Falta acceso a Cuenta"),
        ("public-home.experience.v4-canonical-session-handoff", "Falta versión coalescida del Home"),
        ("new MutationObserver(queueScan)", "El Home debe coalescer mutaciones por frame"),
        ("formatNationalPhone", "Falta formato progresivo nacional de teléfono"),
        ("+34 612 345 678", "Falta ejemplo telefónico español"),
        ("national-es-with-static-prefix", "Falta contrato teléfono con prefijo visual externo"),
        ("login-incidence", "Falta orden explícito Cuenta/Incidencia"),
        ('link.removeAttribute("href")', "El toggle autenticado debe ser no navegable"),
        ('link.setAttribute("role", "button")', "El toggle autenticado debe declarar rol de botón"),
        ('link.dataset.publicHomeAccountHome = home', "La ruta de panel debe separarse del toggle"),
        ('event.stopImmediatePropagation?.()', "El toggle debe aislar su evento del Router"),
    ):
        require(errors, snippet in home_experience, message)

    for snippet, message in (
        ("order: 1", "Falta orden visual 1 del header público"),
        ("order: 2", "Falta orden visual 2 del header público"),
        ('.public-home-footer [data-public-home-login]', "El footer debe ocultar login/cuenta"),
        ("shape-rendering: geometricPrecision", "Falta precisión de SVG inline"),
        ("@media (max-width: 1040px)", "Falta breakpoint del drawer público"),
        (".public-home .public-home-nav-panel", "Falta contrato del drawer público"),
    ):
        require(errors, snippet in experience_css, message)

    require(
        errors,
        "public-home-topbar-account" not in experience_css,
        "El responsive no debe duplicar identidad en topbar",
    )

    # Documentación: debe describir exactamente el backend productivo final.
    for snippet, message in (
        ("`POST /api/tickets/public`", "Docs: falta endpoint público"),
        ("`+34` como prefijo visual", "Docs: falta alcance telefónico España"),
        ("`Idempotency-Key`", "Docs: falta idempotencia"),
        ("autenticación opcional", "Docs: falta auth opcional"),
        ("no deben usar su icono", "Docs: falta separación CTA/WhatsApp"),
        ("correo o teléfono", "Docs: falta resolución de identidad por correo O teléfono"),
        ("nunca crea clientes", "Docs: falta prohibición de creación de cliente"),
        ("`clienteId: null`", "Docs: falta alta nueva sin cliente"),
        ("reutilizar sin overwrite", "Docs: falta regla estricta de usuario existente"),
        ("`INC-YYYYMMDD-XXXXXX`", "Docs: falta formato canónico del ticket"),
        ("mismo correo o el mismo teléfono", "Docs: falta lock local por ambos identificadores"),
    ):
        require(errors, snippet in docs, message)

    for stale, message in (
        ("su cliente pendiente", "Docs: no puede reaparecer cliente pendiente en alta pública"),
        ("rota la activación", "Docs: no puede rotarse activación de usuario existente"),
        ("el backend no crea el ticket y envía un aviso", "Docs: cuenta existente anónima debe reutilizarse, no rechazarse"),
    ):
        require(errors, stale.lower() not in docs.lower(), message)

    for relative in (
        "src/css/views/public/index.css",
        "src/css/views/public/support-request.css",
        "src/css/views/public/public-support-progress.css",
        "src/css/views/public/home-experience.css",
    ):
        css = read(relative)
        require(
            errors,
            css.count("{") == css.count("}"),
            f"Llaves CSS desbalanceadas: {relative}",
        )

    if errors:
        print("\nPublic home integrity: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Public home integrity: PASS")
    print("- JS: main.js -> app/enhancements.js")
    print("- CSS: router/styles.js -> public-home (sin auth/login.css)")
    print("- app.css: sólo estilos globales")
    print("- intake: reuse por email/teléfono, no-overwrite, NEW sin cliente")
    print("- estados accepted/progress neutros y byte-gate productivo")
    print("- teléfono nacional, menú autenticado y progreso validados")
    print("- imágenes: logo WebP canónico y hero 224/480/640/960 sincronizado")
    print("- budgets: logo <= 2500 B; hero 224 <= 8500 B; hero 640 <= 35000 B")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
