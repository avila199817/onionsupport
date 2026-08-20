#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
AUTH = ROOT / "src/features/auth/index.js"
HOME_API = ROOT / "src/views/home/home.api.js"
CUENTA_API = ROOT / "src/views/cuenta/cuenta.api.js"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V13_AUDIT.md"

DECL_RE = re.compile(r"\bfunction\s+normalizeRole\s*\(")
CALL_RE = re.compile(r"(?<![\w.])normalizeRole\s*\(")


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
            if ch == "\n": comment = ""
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
            if ch == quote: quote = ""
            i += 1
            continue
        if template:
            if ch == "\\":
                i += 2
                continue
            if ch == "`": template = False
            i += 1
            continue
        if ch == "/" and nxt == "/":
            comment = "line"; i += 2; continue
        if ch == "/" and nxt == "*":
            comment = "block"; i += 2; continue
        if ch in {"'", '"'}:
            quote = ch; i += 1; continue
        if ch == "`":
            template = True; i += 1; continue
        if ch == "{": depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0: return i
        i += 1
    raise SystemExit("No se encontró cierre de normalizeRole()")


def remove_function(text: str, path: str) -> str:
    match = DECL_RE.search(text)
    if not match:
        raise SystemExit(f"{path}: no contiene normalizeRole()")
    if DECL_RE.search(text, match.end()):
        raise SystemExit(f"{path}: contiene más de un normalizeRole()")
    open_brace = text.find("{", match.end())
    close_brace = find_matching_brace(text, open_brace)
    start = match.start()
    end = close_brace + 1
    while end < len(text) and text[end] in " \t": end += 1
    if end < len(text) and text[end] == "\n": end += 1
    if end < len(text) and text[end] == "\n": end += 1
    return text[:start] + text[end:]


def migrate_auth(text: str) -> str:
    before_calls = len(CALL_RE.findall(text))
    if before_calls < 2:
        raise SystemExit(f"Auth esperaba >=2 usos normalizeRole; detectados {before_calls}")

    text = re.sub(r"\n\s*ALLOWED_ROLES,", "", text, count=1)
    valid_block = re.compile(
        r"\nconst VALID_ROLES =\s*\n\s*new Set\(.*?\n\s*\);\n",
        re.S,
    )
    text, valid_count = valid_block.subn("\n", text, count=1)
    if valid_count != 1:
        raise SystemExit("Auth: no se eliminó VALID_ROLES")

    text = remove_function(text, "src/features/auth/index.js")
    text = CALL_RE.sub("AppCore.normalizeRole(", text)
    text = text.replace(
        '"auth.minimal.v6.2-user-envelope-hotfix"',
        '"auth.minimal.v6.3-canonical-role-authority"',
    )

    if "VALID_ROLES" in text or "ALLOWED_ROLES" in text or DECL_RE.search(text) or CALL_RE.search(text):
        raise SystemExit("Auth conserva autoridad local de roles")
    if text.count("AppCore.normalizeRole(") < before_calls - 1:
        raise SystemExit("Auth perdió consumidores de rol")
    return text


def migrate_home_api(text: str) -> str:
    before_calls = len(CALL_RE.findall(text))
    if before_calls < 1:
        raise SystemExit("Home API no consume normalizeRole()")
    text = remove_function(text, "src/views/home/home.api.js")
    text = CALL_RE.sub("AppCore.normalizeRole(", text)
    text = text.replace(
        '"home.api.domain-aggregator.v10.entity-identifiers"',
        '"home.api.domain-aggregator.v11-canonical-role"',
    )
    if DECL_RE.search(text) or CALL_RE.search(text):
        raise SystemExit("Home API conserva normalizador local")
    return text


def migrate_cuenta_api(text: str) -> str:
    text = remove_function(text, "src/views/cuenta/cuenta.api.js")
    old = "const role = normalizeRole(first(source.role, source.rol, safeArray(source.roles)[0], DEFAULT_ROLE));"
    new = "const role = AppCore.normalizeRole(first(source.role, source.rol, safeArray(source.roles)[0], DEFAULT_ROLE)) || DEFAULT_ROLE;"
    if old not in text:
        raise SystemExit("Cuenta API: no se encontró consumidor de rol esperado")
    text = text.replace(old, new, 1)
    text = text.replace(
        '"cuenta.api.backend-contract.v3.self-account-runtime-safe"',
        '"cuenta.api.backend-contract.v4-canonical-role"',
    )
    if DECL_RE.search(text) or CALL_RE.search(text):
        raise SystemExit("Cuenta API conserva normalizador local")
    return text


def update_integrity(text: str) -> str:
    function = '''\n\ndef validate_role_boundaries_v13_contract(errors: list[str]) -> None:\n    """Auth/Home/Cuenta role boundaries consume AppCore; Core remains the only role parser."""\n    targets = (\n        "src/features/auth/index.js",\n        "src/views/home/home.api.js",\n        "src/views/cuenta/cuenta.api.js",\n    )\n    for relative in targets:\n        source = (ROOT / relative).read_text(encoding="utf-8")\n        if re.search(r"\\bfunction\\s+normalizeRole\\s*\\(", source):\n            errors.append(f"{relative} :: normalizador local de rol prohibido tras V13")\n        if "AppCore.normalizeRole(" not in source:\n            errors.append(f"{relative} :: debe consumir AppCore.normalizeRole()")\n\n    auth = (SRC / "features" / "auth" / "index.js").read_text(encoding="utf-8")\n    if "VALID_ROLES" in auth or "ALLOWED_ROLES" in auth:\n        errors.append("src/features/auth/index.js :: Auth no debe mantener un segundo catálogo de roles")\n\n    home_api = (SRC / "views" / "home" / "home.api.js").read_text(encoding="utf-8")\n    for alias in ("administrator", "administrador", "superadmin", "super_admin", "root", "owner"):\n        if f'"{alias}"' in home_api:\n            errors.append(f"src/views/home/home.api.js :: alias de privilegio legacy prohibido tras V13: {alias}")\n'''
    if "def validate_role_boundaries_v13_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró inserción V13")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_ui_role_authority_v12_contract(errors)\n"
    if "    validate_role_boundaries_v13_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V12")
        text = text.replace(call, call + "    validate_role_boundaries_v13_contract(errors)\n", 1)
    return text


def write_audit(rows: list[tuple[str, int, int]]) -> None:
    removed = sum(before - after for _, before, after in rows)
    table = "\n".join(
        f"| `{path}` | {before:,} | {after:,} | {before-after:,} |"
        for path, before, after in rows
    )
    AUDIT.write_text(
        f'''# Onion Support — UI System V13 Audit\n\n## Autoridad de rol en boundaries frontend\n\nV12 centralizó los controladores visuales. V13 continúa en tres boundaries que ya importaban `AppCore` pero seguían manteniendo un parser/catálogo propio: Auth, Home API y Cuenta API.\n\n- Boundaries migrados: **3**\n- Código duplicado retirado: **{removed:,} bytes**\n- Catálogos de roles en Auth: **2 → 1** (sólo Core/config)\n- Alias de privilegio legacy en Home API: **eliminados**\n- Cuenta conserva su política de fallback `user`, pero la validación `admin/user` la hace Core.\n\n| Archivo | bytes antes | bytes después | retirados |\n|---|---:|---:|---:|\n{table}\n\n## Scope deliberado\n\n`usuarios.api.js` mantiene `normalizeRoleValue()` por ahora porque participa en normalización de modelos y filtros de consulta. Se auditará de forma separada para no mezclar una refactorización de query/model con Auth/Cuenta.\n\n## Invariante\n\nRepository Integrity impide reintroducir `function normalizeRole()` en estos tres boundaries, exige `AppCore.normalizeRole()` y bloquea un segundo catálogo de roles dentro de Auth.\n''',
        encoding="utf-8",
    )


def main() -> None:
    rows = []
    for path, fn in (
        (AUTH, migrate_auth),
        (HOME_API, migrate_home_api),
        (CUENTA_API, migrate_cuenta_api),
    ):
        source = path.read_text(encoding="utf-8")
        before = len(source.encode("utf-8"))
        migrated = fn(source)
        path.write_text(migrated, encoding="utf-8")
        rows.append((str(path.relative_to(ROOT)), before, len(migrated.encode("utf-8"))))

    INTEGRITY.write_text(update_integrity(INTEGRITY.read_text(encoding="utf-8")), encoding="utf-8")
    write_audit(rows)
    print(f"Role boundaries V13 OK · removed={sum(a-b for _, a, b in rows)} bytes")


if __name__ == "__main__":
    main()
