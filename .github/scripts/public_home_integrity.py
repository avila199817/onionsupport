#!/usr/bin/env python3
"""Onion Support: public landing and intake integrity contract."""

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
        self.links: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        data = {str(key).lower(): str(value or "") for key, value in attrs}
        if tag.lower() == "script":
            self.scripts.append(data)
        elif tag.lower() == "link":
            self.links.append(data)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


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
        script for script in parser.scripts
        if script.get("type", "").strip().lower() == "module"
    ]

    checks = [
        (
            len(modules) == 1 and modules[0].get("src") == "/src/main.js",
            "index.html debe ejecutar únicamente /src/main.js como módulo",
        ),
        (
            all(path in enhancements for path in PUBLIC_ENHANCEMENTS),
            "Los módulos públicos deben registrarse en src/app/enhancements.js",
        ),
        (
            all(enhancements.count(path) == 1 for path in PUBLIC_ENHANCEMENTS),
            "Cada enhancement público debe tener una única autoridad de carga",
        ),
        (
            "mobile-polish.js" not in index and "mobile-polish.css" not in app_css,
            "No debe reaparecer la capa legacy mobile-polish",
        ),
        (
            '@import url("./views/public/support-request.css")' in app_css,
            "app.css debe importar support-request.css",
        ),
        (
            '@import url("./views/public/public-support-progress.css")' in app_css,
            "app.css debe importar public-support-progress.css",
        ),
        (
            '@import url("./views/public/home-experience.css")' in app_css,
            "app.css debe importar home-experience.css",
        ),
        (
            'PUBLIC_TICKET_ENDPOINT = "/api/tickets/public"' in intake,
            "El intake debe mantener POST /api/tickets/public",
        ),
        (
            'SPAIN_PREFIX = "+34"' in intake and '/^[6789]\\d{8}$/' in intake,
            "El intake debe mantener el contrato telefónico español",
        ),
        (
            'public-support.intake.v5-live-optional-auth' in intake,
            "Falta la versión productiva esperada del intake",
        ),
        (
            'intakeIconNode' in intake and 'public-support-intake-icon' in intake,
            "Los CTAs internos deben conservar su icono de incidencia",
        ),
        (
            'fullName: fullName(user)' not in intake,
            "El formulario público no debe precargar automáticamente el nombre completo",
        ),
        (
            'const useAuth = session().authenticated === true;' in intake
            and 'auth: useAuth,' in intake,
            "El POST público debe conservar autenticación opcional",
        ),
        (
            'public: true,' not in intake and 'noAuthHeader: true,' not in intake,
            "El intake no debe bloquear Authorization de forma forzada",
        ),
        (
            '"Idempotency-Key": requestKey' in intake
            and 'idempotencyKey(form)' in intake
            and 'clearIdempotency(form);' in intake,
            "El intake debe mantener idempotencia estable y rotación correcta",
        ),
        (
            'Solicitud recibida. Revisa tu correo para continuar.' in intake
            and 'neutralAccepted(response)' in intake,
            "La respuesta anónima debe conservar el contrato anti-enumeración",
        ),
        (
            'public-support.progress.v1-fullscreen-blocking' in progress_js
            and 'MutationObserver' in progress_js,
            "El progreso de envío debe seguir ligado al estado real del formulario",
        ),
        (
            '.public-support-submit-overlay' in progress_css
            and 'public-support-submission-active' in progress_css,
            "Falta el contrato visual del progreso de envío",
        ),
        (
            'public.home.view.controller.final.productivo.2026.23.history-replace' in home,
            "La home debe conservar la revisión de historial interno",
        ),
        (
            home.count('replace: true,') >= 2,
            "La navegación interna debe reemplazar hash sin apilar historial",
        ),
        (
            'public-home.experience.v1.production' in home_experience,
            "Falta la versión productiva del módulo UX público",
        ),
        (
            'data-public-home-account-menu' in home_experience
            and 'Cerrar sesión' in home_experience,
            "El menú autenticado debe conservar accesos rápidos y logout",
        ),
        (
            '"/incidencias"' in home_experience
            and '"/facturas"' in home_experience
            and '"/cuenta"' in home_experience,
            "El menú autenticado debe conservar Incidencias, Facturas y Cuenta",
        ),
        (
            'formatSpanishPhoneInput' in home_experience
            and '+34 612 345 678' in home_experience,
            "El teléfono debe mantener formato progresivo español",
        ),
        (
            'login-incidence' in home_experience
            and 'order: 1' in experience_css
            and 'order: 2' in experience_css,
            "Debe mantenerse Login/Cuenta antes de Abrir incidencia",
        ),
        (
            '.public-home-footer [data-public-home-login]' in experience_css,
            "El footer debe ocultar login/cuenta",
        ),
        (
            'shape-rendering: geometricPrecision' in experience_css,
            "Debe mantenerse la precisión de SVGs inline",
        ),
        (
            'public-home-topbar-account' not in experience_css,
            "El responsive no debe duplicar identidad en topbar",
        ),
        (
            '.public-home .public-home-price-link' in experience_css,
            "home-experience.css debe conservar el header canónico",
        ),
        (
            '@media (max-width: 1040px)' in experience_css
            and '.public-home .public-home-nav-panel' in experience_css,
            "home-experience.css debe conservar el drawer responsive",
        ),
        (
            '`POST /api/tickets/public`' in docs,
            "La documentación debe conservar el endpoint público",
        ),
        (
            '`+34` por defecto' in docs and '`6`, `7`, `8` o `9`' in docs,
            "La documentación debe conservar el alcance telefónico España",
        ),
        (
            'no deben usar su icono' in docs,
            "La documentación debe diferenciar CTA interno y WhatsApp",
        ),
        (
            '`Idempotency-Key`' in docs and 'autenticación opcional' in docs,
            "La documentación debe describir idempotencia y auth opcional",
        ),
    ]

    for ok, message in checks:
        if not ok:
            errors.append(message)

    for relative in (
        "src/css/views/public/index.css",
        "src/css/views/public/support-request.css",
        "src/css/views/public/public-support-progress.css",
        "src/css/views/public/home-experience.css",
    ):
        css = read(relative)
        if css.count("{") != css.count("}"):
            errors.append(f"Llaves CSS desbalanceadas: {relative}")

    if errors:
        print("\nPublic home integrity: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Public home integrity: PASS")
    print("- entrypoint JS: main.js -> app/enhancements.js")
    print("- entrypoint CSS: app.css")
    print("- intake, UX y progreso público validados")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
