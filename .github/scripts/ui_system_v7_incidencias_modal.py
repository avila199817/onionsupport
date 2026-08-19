#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
DETAIL = ROOT / "src/css/views/incidencias/detail.css"
COMPONENT = ROOT / "src/css/components/detail-modal.css"
TEMPLATE = ROOT / "src/views/incidencias/incidencias.template.modal.js"
ROUTE_STYLES = ROOT / "src/router/styles.js"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V7_AUDIT.md"

INC_CLASS_RE = re.compile(r"\.(incidencias-[a-z0-9-]+)", re.I)
UI_CLASS_RE = re.compile(r"\.(ui-detail-modal-[a-z0-9-]+)", re.I)
TOKEN_RE = re.compile(r"incidencias-modal-[a-z0-9-]+", re.I)
DYNAMIC_TOKEN_RE = re.compile(r"(incidencias-modal-[a-z0-9-]+--)\$\{([^{}]+)\}", re.I)


def strip_comments(value: str) -> str:
    return re.sub(r"/\*.*?\*/", "", value, flags=re.S)


def find_delimiter(text: str, start: int):
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


def parse_rule_list(text: str):
    nodes = []
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


def split_selectors(prelude: str):
    result = []
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


def canonical_selector(value: str) -> str:
    value = strip_comments(value)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\s*([>+~])\s*", r"\1", value)
    return value


def collect_component_selectors(text: str) -> tuple[set[str], set[str]]:
    selectors: set[str] = set()
    ui_classes: set[str] = set()

    def walk(rule_text: str):
        for raw_prelude, content in parse_rule_list(rule_text):
            prelude = strip_comments(raw_prelude).strip()
            lower = prelude.lower()
            if content is None:
                continue
            if lower.startswith("@layer") or lower.startswith("@media") or lower.startswith("@supports") or lower.startswith("@container"):
                walk(content)
                continue
            if lower.startswith("@"):
                continue
            for selector in split_selectors(prelude):
                selectors.add(canonical_selector(selector))
                ui_classes.update(item.lower() for item in UI_CLASS_RE.findall(selector))

    walk(text)
    return selectors, ui_classes


def to_ui_selector(selector: str) -> str:
    return re.sub(r"incidencias-modal-", "ui-detail-modal-", selector, flags=re.I)


def selector_is_absorbed(selector: str, component_selectors: set[str]) -> bool:
    classes = [item.lower() for item in INC_CLASS_RE.findall(selector)]
    if not classes:
        return False
    if any(not item.startswith("incidencias-modal-") for item in classes):
        return False
    return canonical_selector(to_ui_selector(selector)) in component_selectors


def subtract_component_rules(source: str, component_selectors: set[str]) -> tuple[str, int]:
    removed = 0

    def walk(rule_text: str) -> str:
        nonlocal removed
        pieces = []
        for raw_prelude, content in parse_rule_list(rule_text):
            prelude = strip_comments(raw_prelude).strip()
            lower = prelude.lower()
            if content is None:
                pieces.append(raw_prelude)
                continue

            if lower.startswith("@layer") or lower.startswith("@media") or lower.startswith("@supports") or lower.startswith("@container"):
                inner = walk(content)
                if inner.strip():
                    pieces.append(f"{prelude} {{\n{inner}\n}}")
                continue

            if lower.startswith("@"):
                pieces.append(f"{prelude} {{\n{content.strip()}\n}}")
                continue

            selectors = split_selectors(prelude)
            remaining = []
            for selector in selectors:
                if selector_is_absorbed(selector, component_selectors):
                    removed += 1
                else:
                    remaining.append(selector)

            if remaining:
                pieces.append(f"{',\n'.join(remaining)} {{\n{content.strip()}\n}}")

        return "\n\n".join(pieces)

    result = walk(source).strip() + "\n"
    return result, removed


def component_supports_token(token: str, ui_classes: set[str]) -> bool:
    ui = token.lower().replace("incidencias-modal-", "ui-detail-modal-")
    if ui in ui_classes:
        return True
    if ui.endswith("--"):
        return any(item.startswith(ui) for item in ui_classes)
    return False


def transform_class_body(body: str, ui_classes: set[str]) -> str:
    def dynamic_replace(match: re.Match) -> str:
        token = match.group(1)
        expr = match.group(2)
        if not component_supports_token(token, ui_classes):
            return match.group(0)
        ui = token.replace("incidencias-modal-", "ui-detail-modal-")
        return f"{token}${{{expr}}} {ui}${{{expr}}}"

    body = DYNAMIC_TOKEN_RE.sub(dynamic_replace, body)

    def static_replace(match: re.Match) -> str:
        token = match.group(0)
        end = match.end()
        if end < len(body) and body.startswith("${", end):
            return token
        if not component_supports_token(token, ui_classes):
            return token
        ui = token.replace("incidencias-modal-", "ui-detail-modal-")
        if ui in body:
            return token
        return f"{token} {ui}"

    return TOKEN_RE.sub(static_replace, body)


def add_ui_classes_to_template(source: str, ui_classes: set[str]) -> tuple[str, int]:
    output = []
    cursor = 0
    inserted = 0
    marker = 'class="'

    while True:
        start = source.find(marker, cursor)
        if start < 0:
            output.append(source[cursor:])
            break
        body_start = start + len(marker)
        output.append(source[cursor:body_start])

        j = body_start
        expression_depth = 0
        expression_quote = ""
        while j < len(source):
            ch = source[j]
            nxt = source[j + 1] if j + 1 < len(source) else ""
            if expression_depth == 0:
                if ch == "$" and nxt == "{":
                    expression_depth = 1
                    j += 2
                    continue
                if ch == '"':
                    break
                j += 1
                continue

            if expression_quote:
                if ch == "\\":
                    j += 2
                    continue
                if ch == expression_quote:
                    expression_quote = ""
                j += 1
                continue
            if ch in {"'", '"', '`'}:
                expression_quote = ch
            elif ch == "{":
                expression_depth += 1
            elif ch == "}":
                expression_depth -= 1
            j += 1

        if j >= len(source):
            raise SystemExit("Atributo class sin cierre en incidencias.template.modal.js")

        body = source[body_start:j]
        transformed = transform_class_body(body, ui_classes)
        inserted += transformed.count("ui-detail-modal-") - body.count("ui-detail-modal-")
        output.append(transformed)
        output.append('"')
        cursor = j + 1

    result = "".join(output)
    for required in ("ui-detail-modal-root", "ui-detail-modal-overlay", "ui-detail-modal-panel", "ui-detail-modal-body"):
        if required not in result:
            raise SystemExit(f"Template de Incidencias no recibió {required}")
    return result, inserted


def normalize_component(text: str) -> str:
    text = text.replace("--inc-avatar-a", "--ui-detail-avatar-a")
    text = text.replace("--inc-avatar-b", "--ui-detail-avatar-b")
    duplicate = '''\nbody.ui-detail-modal-open {\noverflow: hidden;\n  overscroll-behavior: none;\n}\n'''
    text = text.replace(duplicate, "\n", 1)
    return text


def update_routes(text: str) -> str:
    text = text.replace(
        '"route-styles.v8-detail-modal-component"',
        '"route-styles.v9-shared-detail-modal"',
    )
    old = '''  incidencias: Object.freeze([\n    "/src/css/views/incidencias/index.css",\n    "/src/css/views/incidencias/create.css",\n    "/src/css/views/incidencias/detail.css",\n  ]),'''
    new = '''  incidencias: Object.freeze([\n    "/src/css/components/detail-modal.css",\n    "/src/css/views/incidencias/index.css",\n    "/src/css/views/incidencias/create.css",\n    "/src/css/views/incidencias/detail.css",\n  ]),'''
    if old not in text:
        raise SystemExit("No se encontró manifest de Incidencias V6")
    return text.replace(old, new, 1)


def update_integrity(text: str) -> str:
    function = '''\n\ndef validate_shared_detail_modal_v7_contract(errors: list[str]) -> None:\n    """Incidencias and Usuarios must share the same transverse modal shell authority."""\n    route_styles = (SRC / "router" / "styles.js").read_text(encoding="utf-8")\n    inc_template = (SRC / "views" / "incidencias" / "incidencias.template.modal.js").read_text(encoding="utf-8")\n    inc_detail = (SRC / "css" / "views" / "incidencias" / "detail.css").read_text(encoding="utf-8")\n\n    inc_match = re.search(r"incidencias:\\s*Object\\.freeze\\(\\[(?P<body>.*?)\\]\\)", route_styles, re.DOTALL)\n    if not inc_match:\n        errors.append("src/router/styles.js :: falta manifest CSS de Incidencias")\n    else:\n        inc_css = inc_match.group("body")\n        if '"/src/css/components/detail-modal.css"' not in inc_css:\n            errors.append("src/router/styles.js :: Incidencias debe cargar detail-modal.css")\n\n    for snippet in ("ui-detail-modal-root", "ui-detail-modal-overlay", "ui-detail-modal-panel", "ui-detail-modal-body"):\n        if snippet not in inc_template:\n            errors.append(f"src/views/incidencias/incidencias.template.modal.js :: falta clase compartida: {snippet}")\n\n    for selector in (\n        ".incidencias-modal-overlay {",\n        ".incidencias-modal-panel {",\n        ".incidencias-modal-body {",\n        ".incidencias-modal-meta-grid {",\n    ):\n        if selector in inc_detail:\n            errors.append(f"src/css/views/incidencias/detail.css :: regla compartida duplicada tras V7: {selector}")\n'''
    if "def validate_shared_detail_modal_v7_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró inserción de contrato V7")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_detail_modal_v6_contract(errors)\n"
    if "    validate_shared_detail_modal_v7_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V6 en main()")
        text = text.replace(call, call + "    validate_shared_detail_modal_v7_contract(errors)\n", 1)
    return text


def write_audit(before_size: int, after_size: int, removed: int, inserted: int):
    component_size = COMPONENT.stat().st_size
    idx = (ROOT / "src/css/views/incidencias/index.css").stat().st_size
    create = (ROOT / "src/css/views/incidencias/create.css").stat().st_size
    before_payload = idx + create + before_size
    after_payload = component_size + idx + create + after_size
    repo_saved = before_size - after_size
    payload_delta = before_payload - after_payload

    AUDIT.write_text(
        f'''# Onion Support — UI System V7 Audit\n\n## Incidencias adopta Detail Modal transversal\n\nEl componente `ui-detail-modal-*` creado en V6 deja de ser una abstracción usada por un solo dominio. Incidencias pasa a consumir la misma autoridad y su `detail.css` conserva únicamente las reglas realmente específicas del ticket.\n\n- Selectores/arms compartidos retirados de `incidencias/detail.css`: **{removed}**\n- Clases `ui-detail-modal-*` añadidas al template de Incidencias: **{inserted}**\n- `incidencias/detail.css` antes: **{before_size:,} bytes**\n- `incidencias/detail.css` después: **{after_size:,} bytes**\n- CSS duplicado retirado del repositorio: **{repo_saved:,} bytes**\n- Payload estimado de `/incidencias` antes: **{before_payload:,} bytes**\n- Payload estimado de `/incidencias` después: **{after_payload:,} bytes**\n- Delta de payload de la ruta: **{payload_delta:+,} bytes**\n\n## Arquitectura resultante\n\n- `components/detail-modal.css`: shell, panel, header, avatar, chips, body, meta cards, footer y responsive compartidos.\n- `views/incidencias/detail.css`: historial, comentarios, adjuntos, cierre, preview y estados específicos del ticket.\n- `views/usuarios/*`: detalle administrativo sobre el mismo shell sin importar CSS de Incidencias.\n- Repository Integrity impide que las reglas base de overlay/panel/body/meta vuelvan a duplicarse en Incidencias.\n''',
        encoding="utf-8",
    )


def main():
    component_text = normalize_component(COMPONENT.read_text(encoding="utf-8"))
    component_selectors, ui_classes = collect_component_selectors(component_text)
    if len(component_selectors) < 20 or len(ui_classes) < 15:
        raise SystemExit("Detail Modal V6 no contiene suficiente contrato para migrar Incidencias")

    before = DETAIL.read_text(encoding="utf-8")
    before_size = len(before.encode("utf-8"))
    reduced, removed = subtract_component_rules(before, component_selectors)
    if removed < 20:
        raise SystemExit(f"V7 retiró pocos selectores compartidos: {removed}")
    after_size = len(reduced.encode("utf-8"))
    if after_size >= before_size:
        raise SystemExit("V7 no redujo incidencias/detail.css")

    template, inserted = add_ui_classes_to_template(TEMPLATE.read_text(encoding="utf-8"), ui_classes)
    if inserted < 10:
        raise SystemExit(f"V7 añadió pocas clases compartidas al template: {inserted}")

    DETAIL.write_text(reduced, encoding="utf-8")
    COMPONENT.write_text(component_text, encoding="utf-8")
    TEMPLATE.write_text(template, encoding="utf-8")
    ROUTE_STYLES.write_text(update_routes(ROUTE_STYLES.read_text(encoding="utf-8")), encoding="utf-8")
    INTEGRITY.write_text(update_integrity(INTEGRITY.read_text(encoding="utf-8")), encoding="utf-8")
    write_audit(before_size, after_size, removed, inserted)

    print(f"V7 OK · removed={removed} · template_ui={inserted} · detail={before_size}->{after_size}")


if __name__ == "__main__":
    main()
