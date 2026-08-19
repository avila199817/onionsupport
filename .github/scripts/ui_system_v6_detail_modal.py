#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
INC_CSS = ROOT / "src/css/views/incidencias/detail.css"
USERS_TEMPLATE = ROOT / "src/views/usuarios/usuarios.template.modal.js"
ROUTE_STYLES = ROOT / "src/router/styles.js"
COMPONENT = ROOT / "src/css/components/detail-modal.css"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V6_AUDIT.md"

INC_MODAL_CLASS_RE = re.compile(r"incidencias-modal-[a-z0-9-]+", re.I)
SELECTOR_INC_CLASS_RE = re.compile(r"\.(incidencias-[a-z0-9-]+)", re.I)
INC_VAR_RE = re.compile(r"--incidencias-modal-[a-z0-9-]+", re.I)
ANIMATION_RE = re.compile(r"incidencias-detail-[a-z0-9-]+", re.I)


def strip_comments(value: str) -> str:
    return re.sub(r"/\*.*?\*/", "", value, flags=re.S)


def find_delimiter(text: str, start: int) -> tuple[int, str] | None:
    quote = ""
    comment = False
    paren = 0
    bracket = 0
    i = start
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if comment:
            if ch == "*" and nxt == "/":
                comment = False
                i += 2
                continue
            i += 1
            continue
        if not quote and ch == "/" and nxt == "*":
            comment = True
            i += 2
            continue
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = ""
            i += 1
            continue
        if ch in {"'", '"'}:
            quote = ch
            i += 1
            continue
        if ch == "(":
            paren += 1
        elif ch == ")" and paren:
            paren -= 1
        elif ch == "[":
            bracket += 1
        elif ch == "]" and bracket:
            bracket -= 1
        elif paren == 0 and bracket == 0 and ch in "{;":
            return i, ch
        i += 1
    return None


def find_matching_brace(text: str, open_index: int) -> int:
    depth = 1
    quote = ""
    comment = False
    i = open_index + 1
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if comment:
            if ch == "*" and nxt == "/":
                comment = False
                i += 2
                continue
            i += 1
            continue
        if not quote and ch == "/" and nxt == "*":
            comment = True
            i += 2
            continue
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = ""
            i += 1
            continue
        if ch in {"'", '"'}:
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("CSS con llaves desbalanceadas")


def parse_rule_list(text: str) -> list[tuple[str, str | None]]:
    nodes: list[tuple[str, str | None]] = []
    cursor = 0
    while cursor < len(text):
        delim = find_delimiter(text, cursor)
        if delim is None:
            break
        index, kind = delim
        prelude = text[cursor:index].strip()
        if kind == ";":
            if prelude:
                nodes.append((prelude + ";", None))
            cursor = index + 1
            continue
        close = find_matching_brace(text, index)
        content = text[index + 1:close]
        if prelude:
            nodes.append((prelude, content))
        cursor = close + 1
    return nodes


def split_selectors(prelude: str) -> list[str]:
    result: list[str] = []
    start = 0
    paren = 0
    bracket = 0
    quote = ""
    for index, ch in enumerate(prelude):
        if quote:
            if ch == quote and (index == 0 or prelude[index - 1] != "\\"):
                quote = ""
            continue
        if ch in {"'", '"'}:
            quote = ch
        elif ch == "(":
            paren += 1
        elif ch == ")" and paren:
            paren -= 1
        elif ch == "[":
            bracket += 1
        elif ch == "]" and bracket:
            bracket -= 1
        elif ch == "," and paren == 0 and bracket == 0:
            item = prelude[start:index].strip()
            if item:
                result.append(item)
            start = index + 1
    tail = prelude[start:].strip()
    if tail:
        result.append(tail)
    return result


def needed_class(token: str, needed: set[str]) -> bool:
    token = token.lower()
    if token in needed:
        return True
    return any(item.endswith("--") and token.startswith(item) for item in needed)


def selector_is_shared(selector: str, needed: set[str]) -> bool:
    classes = [item.lower() for item in SELECTOR_INC_CLASS_RE.findall(selector)]
    if not classes:
        return False
    # A shared component selector cannot smuggle non-modal Incidencias domain classes.
    if any(not item.startswith("incidencias-modal-") for item in classes):
        return False
    return all(needed_class(item, needed) for item in classes)


def transform_shared(value: str) -> str:
    value = re.sub(r"incidencias-modal-", "ui-detail-modal-", value, flags=re.I)
    value = re.sub(r"incidencias-detail-", "ui-detail-modal-", value, flags=re.I)
    return value


def extract_shared_component(source: str, needed: set[str]) -> tuple[str, set[str], set[str]]:
    variables: set[str] = set()
    animations: set[str] = set()
    keyframes: dict[str, tuple[str, str]] = {}

    def walk(rule_text: str, unwrap_layer: bool = False) -> str:
        pieces: list[str] = []
        for raw_prelude, content in parse_rule_list(rule_text):
            prelude = strip_comments(raw_prelude).strip()
            lower = prelude.lower()
            if content is None:
                continue

            if lower.startswith("@keyframes ") or lower.startswith("@-webkit-keyframes "):
                parts = prelude.split()
                if len(parts) >= 2:
                    keyframes[parts[-1]] = (prelude, content)
                continue

            if lower.startswith("@layer"):
                inner = walk(content, unwrap_layer=True)
                if inner:
                    pieces.append(inner)
                continue

            if lower.startswith("@media") or lower.startswith("@supports") or lower.startswith("@container"):
                inner = walk(content)
                if inner:
                    pieces.append(f"{prelude} {{\n{inner}\n}}")
                continue

            if lower.startswith("@"):
                continue

            selected = [
                selector
                for selector in split_selectors(prelude)
                if selector_is_shared(selector, needed)
            ]
            if not selected:
                continue

            variables.update(INC_VAR_RE.findall(content))
            animations.update(ANIMATION_RE.findall(content))
            selected_prelude = ",\n".join(transform_shared(item) for item in selected)
            declarations = transform_shared(content.strip())
            pieces.append(f"{selected_prelude} {{\n{declarations}\n}}")

        return "\n\n".join(pieces)

    body = walk(source)
    frame_parts: list[str] = []
    for name in sorted(animations):
        if name not in keyframes:
            continue
        prelude, content = keyframes[name]
        frame_parts.append(
            f"{transform_shared(prelude)} {{\n{transform_shared(content.strip())}\n}}"
        )

    if frame_parts:
        body = body + "\n\n" + "\n\n".join(frame_parts)
    return body.strip(), variables, animations


def make_component(source: str, users_source: str) -> tuple[str, int]:
    needed = {item.lower() for item in INC_MODAL_CLASS_RE.findall(users_source)}
    if len(needed) < 12:
        raise SystemExit(f"Contrato compartido demasiado pequeño: {len(needed)} clases")

    body, variables, _animations = extract_shared_component(source, needed)
    if not body or ".ui-detail-modal-root" not in body or ".ui-detail-modal-panel" not in body:
        raise SystemExit("No se pudo extraer root/panel del modal compartido")

    aliases = []
    for original in sorted({item.lower() for item in variables}):
        generic = original.replace("--incidencias-modal-", "--ui-detail-modal-")
        aliases.append(f"  {generic}: var({original});")

    alias_block = "\n".join(aliases)
    component = f'''/* =========================================================\n   ONION SUPPORT — DETAIL MODAL COMPONENT\n   Archivo: /src/css/components/detail-modal.css\n\n   UI SYSTEM V6\n   - Shell visual compartido para detalles administrativos.\n   - Sin selectores de dominio Usuarios/Incidencias.\n   - Tokens genéricos con fallback a los tokens históricos de modal.\n   - Route-loaded: no aumenta el CSS global de la landing.\n========================================================= */\n\n@layer components {{\n\n.ui-detail-modal-root {{\n{alias_block}\n}}\n\nbody.modal-open,\nbody.ui-detail-modal-open {{\n  overflow: hidden;\n  overscroll-behavior: none;\n}}\n\n{body}\n\n}} /* @layer components */\n'''

    if ".incidencias-modal-" in component or ".usuarios-modal-" in component:
        raise SystemExit("El componente compartido contiene selectores de dominio")
    if component.count("!important") > 8:
        raise SystemExit("El componente compartido heredó demasiados !important")
    return component, len(needed)


def update_users_template(text: str) -> str:
    text = text.replace("incidencias-modal-", "ui-detail-modal-")
    text = text.replace("incidencias-detail-", "ui-detail-modal-")

    body_lock = re.compile(
        r"const BODY_LOCK_CLASSES = Object\.freeze\(\[.*?\]\);",
        re.S,
    )
    replacement = '''const BODY_LOCK_CLASSES = Object.freeze([\n  "modal-open",\n  "usuarios-modal-open",\n  "usuarios-detail-open",\n  "ui-detail-modal-open",\n]);'''
    text, count = body_lock.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit("No se pudo normalizar BODY_LOCK_CLASSES de Usuarios")

    text = text.replace(
        "Reutiliza el contrato visual ui-detail-modal-*.",
        "Consume el contrato visual transversal ui-detail-modal-*.",
    )
    text = text.replace(
        "sharedDetailCss:\n        \"ui-detail-modal-*\",",
        "detailCssAuthority:\n        \"ui-detail-modal-*\",",
    )

    if "incidencias-modal-" in text or "incidencias-detail-open" in text:
        raise SystemExit("Usuarios conserva acoplamiento CSS con Incidencias")
    if "ui-detail-modal-root" not in text or "ui-detail-modal-panel" not in text:
        raise SystemExit("Usuarios no consume el nuevo Detail Modal")
    return text


def update_route_styles(text: str) -> str:
    text = text.replace(
        '"route-styles.v7-ui-system-v4"',
        '"route-styles.v8-detail-modal-component"',
    )
    text = text.replace(
        "   - Usuarios reutiliza incidencias/detail.css porque su modal de detalle\n     emite el contrato visual compartido incidencias-modal-*.\n",
        "   - Usuarios carga un Detail Modal transversal y no depende del CSS de Incidencias.\n",
    )

    old_block = '''  /*\n    usuarios.template.modal.js usa simultáneamente clases\n    usuarios-modal-* e incidencias-modal-*.\n\n    En /src/css/views/usuarios actualmente sólo existen\n    index.css y create.css, por lo que el detalle necesita\n    cargar el CSS compartido que implementa incidencias-modal-*.\n  */\n  usuarios: Object.freeze([\n    "/src/css/views/usuarios/index.css",\n    "/src/css/views/usuarios/create.css",\n    "/src/css/views/incidencias/detail.css",\n  ]),'''
    new_block = '''  /*\n    El detalle de Usuarios consume el shell transversal ui-detail-modal-*\n    sin arrastrar la hoja completa de detalle de Incidencias.\n  */\n  usuarios: Object.freeze([\n    "/src/css/components/detail-modal.css",\n    "/src/css/views/usuarios/index.css",\n    "/src/css/views/usuarios/create.css",\n  ]),'''
    if old_block not in text:
        raise SystemExit("No se encontró manifest legacy de Usuarios")
    text = text.replace(old_block, new_block, 1)
    return text


def update_integrity(text: str) -> str:
    function = '''\n\ndef validate_detail_modal_v6_contract(errors: list[str]) -> None:\n    """Usuarios must consume the transverse detail modal without importing Incidencias CSS."""\n    component_path = SRC / "css" / "components" / "detail-modal.css"\n    route_styles = (SRC / "router" / "styles.js").read_text(encoding="utf-8")\n    users_template = (SRC / "views" / "usuarios" / "usuarios.template.modal.js").read_text(encoding="utf-8")\n\n    if not component_path.is_file():\n        errors.append("src/css/components/detail-modal.css :: falta componente Detail Modal V6")\n        return\n\n    component = component_path.read_text(encoding="utf-8")\n    for snippet in ("@layer components", ".ui-detail-modal-root", ".ui-detail-modal-panel", ".ui-detail-modal-body"):\n        if snippet not in component:\n            errors.append(f"src/css/components/detail-modal.css :: falta contrato: {snippet}")\n\n    if ".incidencias-modal-" in component or ".usuarios-modal-" in component:\n        errors.append("src/css/components/detail-modal.css :: el componente transversal no puede contener selectores de dominio")\n\n    if "incidencias-modal-" in users_template or "incidencias-detail-open" in users_template:\n        errors.append("src/views/usuarios/usuarios.template.modal.js :: Usuarios no puede depender de clases de Incidencias")\n\n    users_match = re.search(r"usuarios:\\s*Object\\.freeze\\(\\[(?P<body>.*?)\\]\\)", route_styles, re.DOTALL)\n    if not users_match:\n        errors.append("src/router/styles.js :: falta manifest CSS de Usuarios")\n        return\n    users_css = users_match.group("body")\n    if '"/src/css/components/detail-modal.css"' not in users_css:\n        errors.append("src/router/styles.js :: Usuarios debe cargar detail-modal.css")\n    if '"/src/css/views/incidencias/detail.css"' in users_css:\n        errors.append("src/router/styles.js :: Usuarios no puede cargar incidencias/detail.css")\n'''

    if "def validate_detail_modal_v6_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró inserción de contrato V6")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_correo_cascade_v5_contract(errors)\n"
    if "    validate_detail_modal_v6_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V5 en main()")
        text = text.replace(call, call + "    validate_detail_modal_v6_contract(errors)\n", 1)
    return text


def write_audit(component_text: str, shared_count: int) -> None:
    inc_size = INC_CSS.stat().st_size
    component_size = len(component_text.encode("utf-8"))
    users_index = (ROOT / "src/css/views/usuarios/index.css").stat().st_size
    users_create = (ROOT / "src/css/views/usuarios/create.css").stat().st_size
    previous_payload = users_index + users_create + inc_size
    next_payload = users_index + users_create + component_size
    saved = previous_payload - next_payload
    pct = (saved / previous_payload * 100) if previous_payload else 0

    AUDIT.write_text(
        f'''# Onion Support — UI System V6 Audit\n\n## Detail Modal transversal\n\nUsuarios deja de cargar `src/css/views/incidencias/detail.css`. Su template conserva sus clases `usuarios-modal-*` y pasa a consumir el shell transversal `ui-detail-modal-*` desde `src/css/components/detail-modal.css`.\n\n- Clases/contratos compartidos detectados: **{shared_count}**\n- `incidencias/detail.css`: **{inc_size:,} bytes**\n- Nuevo `components/detail-modal.css`: **{component_size:,} bytes**\n- Payload CSS estimado anterior de la ruta Usuarios: **{previous_payload:,} bytes**\n- Payload CSS estimado nuevo de la ruta Usuarios: **{next_payload:,} bytes**\n- Reducción estimada: **{saved:,} bytes ({pct:.1f}%)**\n\n## Invariantes nuevas\n\n- `usuarios.template.modal.js` no contiene clases `incidencias-modal-*`.\n- El manifest de Usuarios no carga `incidencias/detail.css`.\n- El componente transversal no contiene selectores `.usuarios-*` ni `.incidencias-modal-*`.\n- Repository Integrity bloquea cualquier regresión de esos contratos.\n- El componente se carga por ruta; no aumenta el CSS global de la landing pública.\n\n## Siguiente fase\n\nMigrar el shell equivalente del detalle de Incidencias al mismo `ui-detail-modal-*` y retirar de `incidencias/detail.css` las reglas ya absorbidas por el componente, de forma que ambos dominios compartan una sola implementación real.\n''',
        encoding="utf-8",
    )


def main() -> None:
    inc_source = INC_CSS.read_text(encoding="utf-8")
    users_source = USERS_TEMPLATE.read_text(encoding="utf-8")
    component_text, shared_count = make_component(inc_source, users_source)

    if len(component_text.encode("utf-8")) >= int(INC_CSS.stat().st_size * 0.8):
        raise SystemExit("El componente extraído es demasiado grande; no reduce el payload de Usuarios")

    COMPONENT.write_text(component_text, encoding="utf-8")
    USERS_TEMPLATE.write_text(update_users_template(users_source), encoding="utf-8")
    ROUTE_STYLES.write_text(update_route_styles(ROUTE_STYLES.read_text(encoding="utf-8")), encoding="utf-8")
    INTEGRITY.write_text(update_integrity(INTEGRITY.read_text(encoding="utf-8")), encoding="utf-8")
    write_audit(component_text, shared_count)

    print(f"Detail Modal V6 OK · shared={shared_count} · component={COMPONENT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
