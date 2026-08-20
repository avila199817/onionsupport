#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
VIEW = ROOT / "src/views/correo/index.js"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V11_AUDIT.md"

READ_USER_RE = re.compile(
    r"function readOnionUser\(\) \{.*?\n\}\n\n(?=function cloneCacheIntoState)",
    re.S,
)

CANONICAL_USER = '''function readOnionUser() {\n  let raw = null;\n\n  try {\n    raw =\n      AppCore?.getCurrentUser?.() ||\n      AppCore?.getState?.()?.user ||\n      AppCore?.state?.user ||\n      DefaultAuth?.getUser?.() ||\n      DefaultAuth?.getCurrentUser?.() ||\n      null;\n  } catch {\n    raw = null;\n  }\n\n  let user = null;\n\n  try {\n    user = AppCore?.publicUser?.(raw) || null;\n  } catch {\n    user = null;\n  }\n\n  const displayName = cleanText(user?.displayName, "Usuario");\n  const avatarUrl = sanitizeRuntimeImageUrl(user?.avatarUrl || "");\n\n  return Object.freeze({\n    displayName,\n    avatarUrl,\n    initials: initialsFrom(displayName),\n  });\n}\n\n'''


def migrate_view(text: str) -> str:
    next_text, count = READ_USER_RE.subn(CANONICAL_USER, text, count=1)
    if count != 1:
        raise SystemExit("No se encontró readOnionUser() V10")

    next_text = next_text.replace(
        'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v5-canonical-media";',
        'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v6-canonical-user";',
    )

    forbidden = (
        "Cristian Ávila Luque",
        "raw?.profile?.avatarUrl",
        "raw?.photoUrl",
    )
    for item in forbidden:
        if item in next_text:
            raise SystemExit(f"Persistencia de identidad legacy en Correo: {item}")

    for required in (
        "AppCore?.publicUser?.(raw)",
        'cleanText(user?.displayName, "Usuario")',
        'sanitizeRuntimeImageUrl(user?.avatarUrl || "")',
    ):
        if required not in next_text:
            raise SystemExit(f"Falta contrato identidad V11: {required}")

    return next_text


def update_integrity(text: str) -> str:
    function = '''\n\ndef validate_correo_identity_v11_contract(errors: list[str]) -> None:\n    """Correo identity must consume AppCore.publicUser without personal or raw-profile fallbacks."""\n    view_text = (SRC / "views" / "correo" / "index.js").read_text(encoding="utf-8")\n\n    for required in (\n        "AppCore?.publicUser?.(raw)",\n        'cleanText(user?.displayName, "Usuario")',\n        'sanitizeRuntimeImageUrl(user?.avatarUrl || "")',\n        'CORREO_VIEW_VERSION = "correo.view.microsoft.production.v6-canonical-user"',\n    ):\n        if required not in view_text:\n            errors.append(f"src/views/correo/index.js :: falta identidad canónica V11: {required}")\n\n    for forbidden in (\n        "Cristian Ávila Luque",\n        "raw?.profile?.avatarUrl",\n        "raw?.photoUrl",\n    ):\n        if forbidden in view_text:\n            errors.append(f"src/views/correo/index.js :: fallback de identidad legacy prohibido V11: {forbidden}")\n'''

    if "def validate_correo_identity_v11_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró inserción V11")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_correo_media_v10_contract(errors)\n"
    if "    validate_correo_identity_v11_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V10")
        text = text.replace(call, call + "    validate_correo_identity_v11_contract(errors)\n", 1)
    return text


def write_audit(before: int, after: int) -> None:
    AUDIT.write_text(
        f'''# Onion Support — UI System V11 Audit\n\n## Correo: identidad canónica del usuario\n\nV11 elimina la última identidad personal codificada dentro del controlador de Correo y deja `AppCore.publicUser()` como única normalización de usuario antes de pintar cuenta/avatar.\n\n- `correo/index.js`: **{before:,} → {after:,} bytes**\n- Fallback personal codificado: **eliminado**\n- Fallback visible cuando no existe identidad: **`Usuario`**\n- Avatar: sólo `publicUser.avatarUrl` + `sanitizeRuntimeImageUrl()`\n- Normalizador de usuario consumido por Correo: **1** (`AppCore.publicUser`)\n\n## Efecto\n\nCorreo ya no reconstruye manualmente `displayName`, `fullName`, `nombre`, `profile`, `picture` o `photoUrl`. Esa compatibilidad pertenece al Core y se resuelve una sola vez en `publicUser()`. Si Core cambia su contrato de identidad, Correo lo hereda sin mantener una segunda lista de campos.\n\nRepository Integrity bloquea volver a introducir el nombre personal o los fallbacks raw/profile retirados.\n''',
        encoding="utf-8",
    )


def main() -> None:
    source = VIEW.read_text(encoding="utf-8")
    before = len(source.encode("utf-8"))
    migrated = migrate_view(source)
    VIEW.write_text(migrated, encoding="utf-8")
    INTEGRITY.write_text(update_integrity(INTEGRITY.read_text(encoding="utf-8")), encoding="utf-8")
    write_audit(before, len(migrated.encode("utf-8")))
    print(f"Correo identity V11 OK · bytes={before}->{len(migrated.encode('utf-8'))}")


if __name__ == "__main__":
    main()
