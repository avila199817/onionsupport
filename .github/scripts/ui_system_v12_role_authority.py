#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V12_AUDIT.md"

TARGETS = (
    "src/views/home/index.js",
    "src/views/server/index.js",
    "src/ui/topbar/index.js",
    "src/ui/sidebar/index.js",
    "src/ui/sidebar/template.js",
    "src/views/incidencias/index.js",
    "src/views/usuarios/index.js",
    "src/views/clientes/index.js",
    "src/views/facturas/index.js",
)

DECL_RE = re.compile(r"\bfunction\s+normalizeRole\s*\(")
CALL_RE = re.compile(r"(?<![\w.])normalizeRole\s*\(")
LEGACY_ROLE_WORDS = {
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "root",
    "owner",
    "usuario",
    "client",
    "cliente",
}


def find_matching_brace(text: str, open_index: int) -> int:
    depth = 1
    quote = ""
    template = False
    comment = ""
    i = open_index + 1

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if comment == "line":
            if ch == "\n":
                comment = ""
            i += 1
            continue

        if comment == "block":
            if ch == "*" and nxt == "/":
                comment = ""
                i += 2
                continue
            i += 1
            continue

        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = ""
            i += 1
            continue

        if template:
            if ch == "\\":
                i += 2
                continue
            if ch == "`":
                template = False
            i += 1
            continue

        if ch == "/" and nxt == "/":
            comment = "line"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            comment = "block"
            i += 2
            continue
        if ch in {"'", '"'}:
            quote = ch
            i += 1
            continue
        if ch == "`":
            template = True
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1

    raise SystemExit("No se encontró cierre de normalizeRole()")


def remove_local_normalizer(text: str, path: str) -> tuple[str, int, set[str]]:
    match = DECL_RE.search(text)
    if not match:
        raise SystemExit(f"{path}: no contiene function normalizeRole()")
    if DECL_RE.search(text, match.end()):
        raise SystemExit(f"{path}: contiene más de un normalizeRole()")

    open_brace = text.find("{", match.end())
    if open_brace < 0:
        raise SystemExit(f"{path}: normalizeRole() sin cuerpo")
    close_brace = find_matching_brace(text, open_brace)

    start = match.start()
    while start > 0 and text[start - 1] in " \t":
        start -= 1

    end = close_brace + 1
    while end < len(text) and text[end] in " \t":
        end += 1
    if end < len(text) and text[end] == "\n":
        end += 1
    if end < len(text) and text[end] == "\n":
        end += 1

    body = text[match.start():close_brace + 1]
    aliases = {
        word
        for word in LEGACY_ROLE_WORDS
        if re.search(rf"[\"']{re.escape(word)}[\"']", body, re.I)
    }

    updated = text[:start] + text[end:]
    call_count = len(CALL_RE.findall(updated))

    if call_count:
        if "AppCore" not in updated or "import" not in updated[:3500]:
            raise SystemExit(f"{path}: consumidores de rol sin AppCore disponible")
        updated = CALL_RE.sub("AppCore.normalizeRole(", updated)

    if DECL_RE.search(updated) or CALL_RE.search(updated):
        raise SystemExit(f"{path}: persistió normalizeRole local tras migración")
    if call_count and "AppCore.normalizeRole(" not in updated:
        raise SystemExit(f"{path}: no consume AppCore.normalizeRole()")

    return updated, call_count, aliases


def update_integrity(
    text: str,
    canonical_targets: tuple[str, ...],
    dead_targets: tuple[str, ...],
) -> str:
    all_literal = "\n".join(f'        "{path}",' for path in TARGETS)
    canonical_literal = "\n".join(f'        "{path}",' for path in canonical_targets)
    dead_literal = "\n".join(f'        "{path}",' for path in dead_targets)

    function = f'''\n\ndef validate_ui_role_authority_v12_contract(errors: list[str]) -> None:\n    """UI controllers use AppCore.normalizeRole; unused local normalizers are removed."""\n    audited_files = (\n{all_literal}\n    )\n    canonical_role_files = (\n{canonical_literal}\n    )\n    dead_role_files = (\n{dead_literal}\n    )\n\n    for relative in audited_files:\n        source = (ROOT / relative).read_text(encoding="utf-8")\n        if re.search(r"\\bfunction\\s+normalizeRole\\s*\\(", source):\n            errors.append(f"{{relative}} :: normalizador local de rol prohibido tras V12")\n\n    for relative in canonical_role_files:\n        source = (ROOT / relative).read_text(encoding="utf-8")\n        if "AppCore.normalizeRole(" not in source:\n            errors.append(f"{{relative}} :: debe consumir AppCore.normalizeRole()")\n\n    for relative in dead_role_files:\n        source = (ROOT / relative).read_text(encoding="utf-8")\n        if re.search(r"(?<![\\w.])normalizeRole\\s*\\(", source):\n            errors.append(f"{{relative}} :: reapareció consumidor local de rol sin autoridad canónica")\n'''

    if "def validate_ui_role_authority_v12_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró punto de inserción para contrato V12")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_correo_identity_v11_contract(errors)\n"
    if "    validate_ui_role_authority_v12_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V11 en main()")
        text = text.replace(call, call + "    validate_ui_role_authority_v12_contract(errors)\n", 1)
    return text


def write_audit(rows: list[tuple[str, int, int, int, set[str]]]) -> None:
    removed_bytes = sum(before - after for _, before, after, _, _ in rows)
    total_calls = sum(calls for _, _, _, calls, _ in rows)
    all_aliases = sorted({alias for *_, aliases in rows for alias in aliases})
    canonical_count = sum(1 for *_, calls, _aliases in rows if calls > 0)
    dead_count = len(rows) - canonical_count

    table = "\n".join(
        f"| `{path}` | {before:,} | {after:,} | {before - after:,} | {calls} | {'canónico' if calls else 'dead-code'} |"
        for path, before, after, calls, _ in rows
    )
    aliases = ", ".join(f"`{item}`" for item in all_aliases) or "ninguno"

    AUDIT.write_text(
        f'''# Onion Support — UI System V12 Audit\n\n## Autoridad canónica de roles en UI\n\nEl backend y Cosmos ya trabajan con los roles canónicos `admin` y `user`. Sin embargo, varios controladores visuales seguían manteniendo dialectos locales que traducían valores como `root`, `owner`, `superadmin`, `administrador` o `cliente`. V12 retira esos normalizadores de la capa UI: los consumidores reales pasan a `AppCore.normalizeRole()` y los normalizadores sin consumidores se eliminan como código muerto.\n\n- Controladores auditados: **{len(rows)}**\n- Controladores migrados a autoridad Core: **{canonical_count}**\n- Normalizadores muertos eliminados: **{dead_count}**\n- Consumidores migrados a `AppCore.normalizeRole()`: **{total_calls}**\n- Código duplicado retirado: **{removed_bytes:,} bytes**\n- Alias legacy encontrados dentro de normalizadores retirados: {aliases}\n- Roles funcionales de UI después de V12: **`admin` / `user`**\n\n| Archivo | bytes antes | bytes después | retirados | llamadas Core | resultado |\n|---|---:|---:|---:|---:|---|\n{table}\n\n## Boundary deliberado\n\nV12 **no toca** `features/auth`, `home.api.js`, `cuenta.api.js` ni APIs de dominio. Esas capas reciben contratos externos/backend y se auditarán por separado antes de retirar compatibilidad. Esta fase sólo elimina dialectos de rol en controladores de presentación que ya disponen de Core o elimina helpers sin consumidores.\n\n## Invariante\n\nRepository Integrity bloquea nuevos `function normalizeRole()` en los controladores auditados y exige `AppCore.normalizeRole()` allí donde existe consumo real.\n''',
        encoding="utf-8",
    )


def main() -> None:
    rows = []
    canonical_targets: list[str] = []
    dead_targets: list[str] = []

    for relative in TARGETS:
        path = ROOT / relative
        source = path.read_text(encoding="utf-8")
        before = len(source.encode("utf-8"))
        updated, calls, aliases = remove_local_normalizer(source, relative)
        path.write_text(updated, encoding="utf-8")
        after = len(updated.encode("utf-8"))
        rows.append((relative, before, after, calls, aliases))
        (canonical_targets if calls else dead_targets).append(relative)

    if not canonical_targets:
        raise SystemExit("V12 no encontró ningún consumidor real de normalizeRole()")

    INTEGRITY.write_text(
        update_integrity(
            INTEGRITY.read_text(encoding="utf-8"),
            tuple(canonical_targets),
            tuple(dead_targets),
        ),
        encoding="utf-8",
    )
    write_audit(rows)
    print(
        "UI role authority V12 OK · "
        f"files={len(rows)} · canonical={len(canonical_targets)} · dead={len(dead_targets)} · "
        f"calls={sum(row[3] for row in rows)} · removed={sum(row[1]-row[2] for row in rows)} bytes"
    )


if __name__ == "__main__":
    main()
