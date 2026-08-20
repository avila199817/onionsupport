#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VIEW = ROOT / "src/views/correo/index.js"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V10_AUDIT.md"

LOCAL_SANITIZER = '''function safeImageUrl(value = "") {\n  const raw = cleanText(value, "");\n  if (!raw || /[\\r\\n\\t\\\\]/.test(raw) || /^(?:javascript|data|vbscript|file):/i.test(raw)) return "";\n  if (raw.startsWith("/")) return raw;\n  try {\n    const url = new URL(raw);\n    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();\n  } catch {\n    return "";\n  }\n  return "";\n}\n\n'''


def migrate_view(text: str) -> tuple[str, int]:
    import_anchor = 'import { AppCore } from "../../core/index.js";\n'
    media_import = 'import { sanitizeRuntimeImageUrl } from "../../core/media.js";\n'

    if media_import not in text:
        if import_anchor not in text:
            raise SystemExit("No se encontró import AppCore en Correo")
        text = text.replace(import_anchor, import_anchor + media_import, 1)

    if LOCAL_SANITIZER not in text:
        raise SystemExit("No se encontró safeImageUrl local esperado")
    text = text.replace(LOCAL_SANITIZER, "", 1)

    uses_before = text.count("safeImageUrl(")
    if uses_before < 1:
        raise SystemExit("No se encontró consumidor de safeImageUrl")
    text = text.replace("safeImageUrl(", "sanitizeRuntimeImageUrl(")

    text = text.replace(
        'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v4-preference-owner";',
        'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v5-canonical-media";',
    )

    if "function safeImageUrl" in text or "safeImageUrl(" in text:
        raise SystemExit("Persisten sanitizadores locales de imagen en Correo")
    if text.count("sanitizeRuntimeImageUrl(") < uses_before:
        raise SystemExit("No se migraron todos los consumidores de imagen")
    return text, uses_before


def update_integrity(text: str) -> str:
    function = '''\n\ndef validate_correo_media_v10_contract(errors: list[str]) -> None:\n    """Correo runtime avatars must use the canonical core/media.js URL policy."""\n    view_path = SRC / "views" / "correo" / "index.js"\n    view_text = view_path.read_text(encoding="utf-8")\n\n    required = (\n        'import { sanitizeRuntimeImageUrl } from "../../core/media.js"',\n        "sanitizeRuntimeImageUrl(",\n        'CORREO_VIEW_VERSION = "correo.view.microsoft.production.v5-canonical-media"',\n    )\n    for snippet in required:\n        if snippet not in view_text:\n            errors.append(f"src/views/correo/index.js :: falta contrato media V10: {snippet}")\n\n    for forbidden in (\n        "function safeImageUrl",\n        "/^(?:javascript|data|vbscript|file):/i.test(raw)",\n    ):\n        if forbidden in view_text:\n            errors.append(f"src/views/correo/index.js :: política local de media prohibida tras V10: {forbidden}")\n'''

    if "def validate_correo_media_v10_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró inserción para contrato V10")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_correo_boundary_v9_contract(errors)\n"
    if "    validate_correo_media_v10_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V9 en main()")
        text = text.replace(call, call + "    validate_correo_media_v10_contract(errors)\n", 1)
    return text


def write_audit(before: int, after: int, uses: int) -> None:
    AUDIT.write_text(
        f'''# Onion Support — UI System V10 Audit\n\n## Correo: política canónica de media runtime\n\nCorreo tenía un sanitizador local `safeImageUrl()` que aceptaba cualquier URL HTTP/HTTPS. El resto del shell privado ya dispone de una autoridad más estricta en `src/core/media.js`, capaz de distinguir same-origin, Onion API y Azure Blob/SAS sin aceptar credenciales de aplicación en URLs.\n\nV10 elimina esa segunda política.\n\n- `correo/index.js`: **{before:,} → {after:,} bytes**\n- Consumidores migrados a `sanitizeRuntimeImageUrl()`: **{uses}**\n- Sanitizadores runtime de imagen propios de Correo: **0**\n- Autoridad runtime de media: **1** (`src/core/media.js`)\n\n## Efecto de seguridad\n\nEl avatar de Correo ya no puede aceptar un host HTTP/HTTPS arbitrario sólo por tener un protocolo válido. Hereda exactamente el mismo contrato que Sidebar: assets relativos, same-origin, dominios Onion permitidos y Azure Blob; SAS sólo cuando corresponde a Blob Storage y sin parámetros sensibles de aplicación.\n\n## Invariante\n\nRepository Integrity exige el import de `sanitizeRuntimeImageUrl`, bloquea la reaparición de `safeImageUrl()` local y fija la versión del controlador de Correo V10.\n''',
        encoding="utf-8",
    )


def main() -> None:
    source = VIEW.read_text(encoding="utf-8")
    before = len(source.encode("utf-8"))
    migrated, uses = migrate_view(source)
    VIEW.write_text(migrated, encoding="utf-8")
    INTEGRITY.write_text(update_integrity(INTEGRITY.read_text(encoding="utf-8")), encoding="utf-8")
    write_audit(before, len(migrated.encode("utf-8")), uses)
    print(f"Correo media V10 OK · uses={uses} · bytes={before}->{len(migrated.encode('utf-8'))}")


if __name__ == "__main__":
    main()
