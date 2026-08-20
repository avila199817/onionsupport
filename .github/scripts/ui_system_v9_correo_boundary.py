#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "src/views/correo/correo.api.js"
VIEW = ROOT / "src/views/correo/index.js"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V9_AUDIT.md"


def migrate_api(text: str) -> str:
    start_marker = "/*\n  Preferencia local por defecto: activada."
    end_marker = 'export const CORREO_API_VERSION = "correo.api.microsoft.production.v2-default-notifications";'
    start = text.find(start_marker)
    end = text.find(end_marker)
    if start < 0 or end < 0 or end <= start:
        raise SystemExit("No se encontró el bloque legacy de preferencia en correo.api.js")

    replacement = 'export const CORREO_API_VERSION = "correo.api.microsoft.production.v3-pure-http";'
    text = text[:start] + replacement + text[end + len(end_marker):]

    if "localStorage" in text or '"Notification" in window' in text:
        raise SystemExit("correo.api.js conserva responsabilidades browser/UI")
    return text


def migrate_view(text: str) -> str:
    text = text.replace(
        'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v3-outlook-extreme";',
        'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v4-preference-owner";',
    )

    marker = '''const NOTIFICATION_PREF_KEY = "onion.correo.notifications.v1";\nconst NOTIFICATION_POLL_MS = 60000;\nconst MAX_NOTIFICATION_IDS = 80;\n'''
    addition = marker + '''\nfunction primeNotificationPreference() {\n  if (typeof window === "undefined" || !("Notification" in window)) return;\n  try {\n    if (window.localStorage.getItem(NOTIFICATION_PREF_KEY) === null) {\n      window.localStorage.setItem(NOTIFICATION_PREF_KEY, "1");\n    }\n  } catch {\n    // La preferencia de UI no puede bloquear Correo.\n  }\n}\n\nprimeNotificationPreference();\n'''

    if marker not in text:
        raise SystemExit("No se encontró bloque de constantes de notificación en correo/index.js")
    if "function primeNotificationPreference()" not in text:
        text = text.replace(marker, addition, 1)

    if text.count("onion.correo.notifications.v1") != 1:
        raise SystemExit("La key de preferencia de Correo debe tener una sola autoridad")
    return text


def update_integrity(text: str) -> str:
    function = '''\n\ndef validate_correo_boundary_v9_contract(errors: list[str]) -> None:\n    """Correo API is HTTP-only; browser notification preferences belong to the view controller."""\n    api_path = SRC / "views" / "correo" / "correo.api.js"\n    view_path = SRC / "views" / "correo" / "index.js"\n    api_text = api_path.read_text(encoding="utf-8")\n    view_text = view_path.read_text(encoding="utf-8")\n\n    for forbidden in ("localStorage", '"Notification" in window', "Notification.requestPermission"):\n        if forbidden in api_text:\n            errors.append(f"src/views/correo/correo.api.js :: responsabilidad browser/UI prohibida: {forbidden}")\n\n    for required in (\n        'import Http from "../../core/http.js"',\n        'MICROSOFT_ENDPOINT = "/api/microsoft"',\n        'CORREO_API_VERSION = "correo.api.microsoft.production.v3-pure-http"',\n    ):\n        if required not in api_text:\n            errors.append(f"src/views/correo/correo.api.js :: falta contrato HTTP V9: {required}")\n\n    for required in (\n        'NOTIFICATION_PREF_KEY = "onion.correo.notifications.v1"',\n        "function primeNotificationPreference()",\n        "window.localStorage.getItem(NOTIFICATION_PREF_KEY)",\n        "window.localStorage.setItem(NOTIFICATION_PREF_KEY, \"1\")",\n    ):\n        if required not in view_text:\n            errors.append(f"src/views/correo/index.js :: falta autoridad de preferencia V9: {required}")\n'''

    if "def validate_correo_boundary_v9_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró inserción para contrato V9")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_detail_modal_tokens_v8_contract(errors)\n"
    if "    validate_correo_boundary_v9_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V8 en main()")
        text = text.replace(call, call + "    validate_correo_boundary_v9_contract(errors)\n", 1)
    return text


def write_audit(api_before: int, api_after: int, view_before: int, view_after: int) -> None:
    AUDIT.write_text(
        f'''# Onion Support — UI System V9 Audit\n\n## Correo: boundary API / browser UI\n\nV9 corrige una mezcla de responsabilidades que seguía viva desde la activación por defecto de notificaciones. `correo.api.js` ya no lee ni escribe `localStorage` ni inspecciona APIs de notificación del navegador. La preferencia booleana permanece exactamente igual, pero su lifecycle vive en el controlador de vista que ya era quien la leía, modificaba y aplicaba.\n\n- `correo.api.js`: **{api_before:,} → {api_after:,} bytes**\n- `correo/index.js`: **{view_before:,} → {view_after:,} bytes**\n- Keys de preferencia persistente: **1** (`onion.correo.notifications.v1`)\n- Cliente HTTP de Correo: **1** (`core/http.js`)\n- Tokens Microsoft persistidos en browser: **0** por contrato\n\n## Autoridades\n\n- `correo.api.js`: endpoints, DTOs, FormData y descarga a través de `core/http.js`.\n- `correo/index.js`: Notification API, permiso del navegador, polling y preferencia booleana local.\n- Repository Integrity bloquea volver a introducir `localStorage`/Notification en la capa API.\n''',
        encoding="utf-8",
    )


def main() -> None:
    api_text = API.read_text(encoding="utf-8")
    view_text = VIEW.read_text(encoding="utf-8")
    api_before = len(api_text.encode("utf-8"))
    view_before = len(view_text.encode("utf-8"))

    api_next = migrate_api(api_text)
    view_next = migrate_view(view_text)
    API.write_text(api_next, encoding="utf-8")
    VIEW.write_text(view_next, encoding="utf-8")
    INTEGRITY.write_text(update_integrity(INTEGRITY.read_text(encoding="utf-8")), encoding="utf-8")
    write_audit(api_before, len(api_next.encode("utf-8")), view_before, len(view_next.encode("utf-8")))
    print("Correo boundary V9 OK")


if __name__ == "__main__":
    main()
