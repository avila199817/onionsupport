#!/usr/bin/env python3
"""Onion Support: semantic contract for the public landing and intake."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]

REQUIRED = (
    "index.html",
    "docs/PUBLIC_TICKET_INTAKE.md",
    "src/app/enhancements.js",
    "src/css/app.css",
    "src/css/views/public/index.css",
    "src/css/views/public/support-request.css",
    "src/css/views/public/public-support-progress.css",
    "src/css/views/public/home-experience.css",
    "src/features/public-support/index.js",
    "src/features/public-support-progress/index.js",
    "src/features/public-home-experience/index.js",
    "src/views/public/home/index.js",
    "src/views/public/home/template.js",
)

FORBIDDEN = (
    "src/features/public-support/mobile-polish.js",
    "src/css/views/public/mobile-polish.css",
    "noop",
)

PUBLIC_ENHANCEMENTS = (
    "../features/public-support/index.js",
    "../features/public-support-progress/index.js",
    "../features/public-home-experience/index.js",
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
    docs = read("docs/PUBLIC_TICKET_INTAKE.md")
    enhancements = read("src/app/enhancements.js")
    app_css = read("src/css/app.css")
    intake = read("src/features/public-support/index.js")
    progress_js = read("src/features/public-support-progress/index.js")
    home_experience = read("src/features/public-home-experience/index.js")
    home = read("src/views/public/home/index.js")
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

    for module_path in PUBLIC_ENHANCEMENTS:
        require(
            errors,
            enhancements.count(module_path) == 1,
            f"Enhancement público sin autoridad única: {module_path}",
        )

    for css_path in (
        "support-request.css",
        "public-support-progress.css",
        "home-experience.css",
    ):
        require(
            errors,
            f'@import url("./views/public/{css_path}")' in app_css,
            f"src/css/app.css debe cargar {css_path}",
        )

    require(
        errors,
        "mobile-polish.js" not in index and "mobile-polish.css" not in app_css,
        "No debe reaparecer la capa legacy mobile-polish",
    )

    # Intake: endpoint, auth opcional, España, idempotencia y anti-enumeración.
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
    ):
        require(errors, snippet in intake, message)

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

    # Progreso: deriva del data-submitting real y observa sólo el Router view.
    for snippet, message in (
        ("PUBLIC_SUPPORT_PROGRESS_VERSION", "Falta contrato de versión del progreso"),
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
        ("data-public-home-account-menu", "Falta menú autenticado"),
        ("Cerrar sesión", "Falta logout en menú autenticado"),
        ('"/incidencias"', "Falta acceso a Incidencias"),
        ('"/facturas"', "Falta acceso a Facturas"),
        ('"/cuenta"', "Falta acceso a Cuenta"),
        ("formatSpanishPhoneInput", "Falta formato progresivo de teléfono"),
        ("+34 612 345 678", "Falta ejemplo telefónico español"),
        ("login-incidence", "Falta orden explícito Cuenta/Incidencia"),
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

    for snippet, message in (
        ("`POST /api/tickets/public`", "Docs: falta endpoint público"),
        ("`+34` por defecto", "Docs: falta alcance telefónico España"),
        ("`Idempotency-Key`", "Docs: falta idempotencia"),
        ("autenticación opcional", "Docs: falta auth opcional"),
        ("no deben usar su icono", "Docs: falta separación CTA/WhatsApp"),
    ):
        require(errors, snippet in docs, message)

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
    print("- CSS: app.css")
    print("- intake, UX y progreso validados por contrato semántico")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
