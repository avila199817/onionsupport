#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "src/ui/sidebar/template.js"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V15_SIDEBAR_RECOVERY.md"


def patch_template() -> tuple[int, int]:
    text = TEMPLATE.read_text(encoding="utf-8")
    before = len(text.encode("utf-8"))

    core_import = 'import { AppCore } from "../../core/index.js";\n'
    config_import = 'import {\n  ROUTES,\n'
    if core_import not in text:
        if config_import not in text:
            raise SystemExit("sidebar/template.js: punto de import de Core no encontrado")
        text = text.replace(config_import, core_import + config_import, 1)

    old_version = '  "sidebar.template.unified.v5-runtime-media-policy";'
    new_version = '  "sidebar.template.unified.v6-core-role-authority";'
    if old_version in text:
        text = text.replace(old_version, new_version, 1)
    elif new_version not in text:
        raise SystemExit("sidebar/template.js: versión inesperada")

    old = '  return [...new Set(raw.map(normalizeRole).filter(Boolean))];'
    new = '''  return [\n    ...new Set(\n      raw\n        .map((role) =>\n          AppCore.normalizeRole(role)\n        )\n        .filter(Boolean)\n    ),\n  ];'''
    if old not in text:
        raise SystemExit("sidebar/template.js: callback normalizeRole roto no encontrado")
    text = text.replace(old, new, 1)

    if re.search(r"\.map\(\s*normalizeRole\s*\)", text):
        raise SystemExit("sidebar/template.js: persiste callback normalizeRole huérfano")
    if re.search(r"\bfunction\s+normalizeRole\s*\(", text):
        raise SystemExit("sidebar/template.js: no debe reintroducir normalizador local")
    if "AppCore.normalizeRole(" not in text:
        raise SystemExit("sidebar/template.js: no consume autoridad Core")

    TEMPLATE.write_text(text, encoding="utf-8")
    return before, len(text.encode("utf-8"))


def patch_integrity() -> None:
    text = INTEGRITY.read_text(encoding="utf-8")
    fn = r'''

def validate_sidebar_runtime_v15_contract(errors: list[str]) -> None:
    """Sidebar template must not reference a removed local role normalizer."""
    relative = "src/ui/sidebar/template.js"
    source = (ROOT / relative).read_text(encoding="utf-8")

    if 'import { AppCore } from "../../core/index.js";' not in source:
        errors.append(f"{relative} :: debe importar AppCore para la autoridad canónica de rol V15")

    if "AppCore.normalizeRole(" not in source:
        errors.append(f"{relative} :: debe consumir AppCore.normalizeRole() V15")

    if re.search(r"\.map\(\s*normalizeRole\s*\)", source):
        errors.append(f"{relative} :: callback normalizeRole huérfano prohibido V15")

    if re.search(r"\bfunction\s+normalizeRole\s*\(", source):
        errors.append(f"{relative} :: normalizador local de rol prohibido V15")

    if "sidebar.template.unified.v6-core-role-authority" not in source:
        errors.append(f"{relative} :: versión de recuperación V15 ausente")
'''

    if "def validate_sidebar_runtime_v15_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("repo_integrity.py: punto de inserción no encontrado")
        text = text.replace(marker, fn + marker, 1)

    call = "    validate_sidebar_runtime_v15_contract(errors)\n"
    if call not in text:
        marker = "    validate_paths(errors)\n"
        if marker not in text:
            raise SystemExit("repo_integrity.py: llamada validate_paths no encontrada")
        text = text.replace(marker, call + marker, 1)

    INTEGRITY.write_text(text, encoding="utf-8")


def write_audit(before: int, after: int) -> None:
    AUDIT.write_text(
        f'''# Onion Support — UI System V15 Sidebar Recovery\n\n## Incidencia\n\nEl shell privado reservaba el ancho del Sidebar, pero el DOM visual no llegaba a montarse. La causa era un `ReferenceError` en `src/ui/sidebar/template.js`: `normalizeRoleList()` conservaba `raw.map(normalizeRole)` después de que V12 eliminara `normalizeRole()` como supuesto código muerto.\n\nComo `SidebarUI.init()` se ejecuta como UI no crítica durante el boot, ese error no detenía la SPA: Home y Topbar continuaban cargando mientras `chrome.css` conservaba el offset desktop del Sidebar. El resultado visual era un hueco vacío del ancho exacto del Sidebar.\n\n## Reparación\n\n- `sidebar/template.js` consume directamente `AppCore.normalizeRole()`.\n- No se reintroduce ningún parser ni catálogo local de roles.\n- El contrato sigue siendo `admin` / `user`.\n- La versión del template pasa a `sidebar.template.unified.v6-core-role-authority`.\n- Repository Integrity bloquea tanto el callback huérfano como la reaparición de un `function normalizeRole()` local.\n\n## Tamaño\n\n- Template antes: **{before:,} bytes**\n- Template después: **{after:,} bytes**\n- Cambio neto: **{after-before:+,} bytes**\n\n## Causa de regresión\n\nLa auditoría V12 contaba únicamente llamadas con forma `normalizeRole(...)`. Una referencia usada como callback (`map(normalizeRole)`) no fue detectada como consumidor y el helper fue clasificado erróneamente como dead-code. V15 corrige el runtime y añade una invariante explícita para este patrón.\n''',
        encoding="utf-8",
    )


def main() -> None:
    before, after = patch_template()
    patch_integrity()
    write_audit(before, after)
    print(
        "Sidebar V15 recovery OK · "
        f"template={before}->{after} bytes · AppCore.normalizeRole canonical"
    )


if __name__ == "__main__":
    main()
