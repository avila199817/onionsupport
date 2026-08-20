#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "src/views/incidencias/incidencias.template.modal.js"
COMPONENT = ROOT / "src/css/components/detail-modal.css"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V7_AUDIT.md"

STATIC_INC_RE = re.compile(r"incidencias-modal-[a-z0-9-]+", re.I)
DYNAMIC_INC_RE = re.compile(r"(incidencias-modal-[a-z0-9-]+--)\$\{([^{}]+)\}", re.I)
UI_CLASS_RE = re.compile(r"\.((?:ui-detail-modal-)[a-z0-9-]+)", re.I)


def has_exact(text: str, token: str) -> bool:
    return re.search(
        rf"(?<![A-Za-z0-9-]){re.escape(token)}(?![A-Za-z0-9-])",
        text,
    ) is not None


def supported_static(token: str, ui_classes: set[str]) -> bool:
    return token.lower().replace("incidencias-modal-", "ui-detail-modal-") in ui_classes


def supported_dynamic(prefix: str, ui_classes: set[str]) -> bool:
    ui_prefix = prefix.lower().replace("incidencias-modal-", "ui-detail-modal-")
    return any(item.startswith(ui_prefix) for item in ui_classes)


def repair_class_body(body: str, ui_classes: set[str]) -> tuple[str, int]:
    repairs = 0

    def dynamic(match: re.Match) -> str:
        nonlocal repairs
        prefix, expr = match.group(1), match.group(2)
        if not supported_dynamic(prefix, ui_classes):
            return match.group(0)
        generic = prefix.replace("incidencias-modal-", "ui-detail-modal-") + "${" + expr + "}"
        if generic in body:
            return match.group(0)
        repairs += 1
        return match.group(0) + " " + generic

    stage = DYNAMIC_INC_RE.sub(dynamic, body)

    def static(match: re.Match) -> str:
        nonlocal repairs
        token = match.group(0)
        if stage.startswith("${", match.end()):
            return token
        if not supported_static(token, ui_classes):
            return token
        generic = token.replace("incidencias-modal-", "ui-detail-modal-")
        if has_exact(stage, generic):
            return token
        repairs += 1
        return token + " " + generic

    return STATIC_INC_RE.sub(static, stage), repairs


def repair_template(source: str, ui_classes: set[str]) -> tuple[str, int]:
    output: list[str] = []
    cursor = 0
    repairs = 0
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
            raise SystemExit("Atributo class sin cierre")

        body = source[body_start:j]
        fixed, count = repair_class_body(body, ui_classes)
        repairs += count
        output.append(fixed)
        output.append('"')
        cursor = j + 1

    result = "".join(output)
    result = result.replace(
        '"incidencias.template.modal.extreme.v32.avatar-parity"',
        '"incidencias.template.modal.extreme.v33.shared-detail-modal"',
    )
    return result, repairs


def update_integrity(text: str) -> str:
    function = '''\n\ndef validate_detail_modal_pairing_v7_contract(errors: list[str]) -> None:\n    """Critical Incidencias modal primitives must carry both domain and shared classes."""\n    template = (SRC / "views" / "incidencias" / "incidencias.template.modal.js").read_text(encoding="utf-8")\n    required_pairs = (\n        "incidencias-modal-root ui-detail-modal-root",\n        "incidencias-modal-overlay ui-detail-modal-overlay",\n        "incidencias-modal-panel ui-detail-modal-panel",\n        "incidencias-modal-chip ui-detail-modal-chip",\n        "incidencias-modal-body ui-detail-modal-body",\n        "incidencias-modal-meta-grid ui-detail-modal-meta-grid",\n    )\n    for pair in required_pairs:\n        if pair not in template:\n            errors.append(f"src/views/incidencias/incidencias.template.modal.js :: falta alias compartido: {pair}")\n\n    dynamic_pair = "incidencias-modal-chip--${attr(safeModifier)} ui-detail-modal-chip--${attr(safeModifier)}"\n    if dynamic_pair not in template:\n        errors.append("src/views/incidencias/incidencias.template.modal.js :: modifier dinámico de chip no comparte autoridad V7")\n'''

    if "def validate_detail_modal_pairing_v7_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró inserción para validador de pairing V7")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_shared_detail_modal_v7_contract(errors)\n"
    if "    validate_detail_modal_pairing_v7_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada del contrato V7 base")
        text = text.replace(call, call + "    validate_detail_modal_pairing_v7_contract(errors)\n", 1)
    return text


def update_audit(text: str, repairs: int) -> str:
    text = text.replace(
        "- Delta de payload de la ruta: **-450 bytes**",
        "- Variación de payload de `/incidencias`: **+450 bytes (+0,4%)**; a cambio el repositorio elimina 17.961 bytes duplicados y Usuarios/Incidencias comparten una única autoridad de shell.",
    )
    if "Alias de clase reparados" not in text:
        text += (
            "\n## Verificación de alias\n\n"
            f"- Alias de clase reparados tras auditoría del template: **{repairs}**.\n"
            "- El validador permanente exige pairing explícito para root, overlay, panel, chip, body y meta-grid.\n"
            "- Los modificadores dinámicos de chip deben emitir simultáneamente la clase de dominio y la clase transversal.\n"
        )
    return text


def main() -> None:
    component = COMPONENT.read_text(encoding="utf-8")
    ui_classes = {item.lower() for item in UI_CLASS_RE.findall(component)}
    if len(ui_classes) < 15:
        raise SystemExit("Contrato ui-detail-modal insuficiente")

    source = TEMPLATE.read_text(encoding="utf-8")
    repaired, repairs = repair_template(source, ui_classes)
    if repairs < 1:
        raise SystemExit("No se detectó ningún alias faltante; revisar migración antes de continuar")

    required = (
        "incidencias-modal-chip ui-detail-modal-chip",
        "incidencias-modal-chip--${attr(safeModifier)} ui-detail-modal-chip--${attr(safeModifier)}",
    )
    for item in required:
        if item not in repaired:
            raise SystemExit(f"Pairing crítico ausente tras reparación: {item}")

    TEMPLATE.write_text(repaired, encoding="utf-8")
    INTEGRITY.write_text(update_integrity(INTEGRITY.read_text(encoding="utf-8")), encoding="utf-8")
    AUDIT.write_text(update_audit(AUDIT.read_text(encoding="utf-8"), repairs), encoding="utf-8")
    print(f"V7 pairing repair OK · aliases={repairs}")


if __name__ == "__main__":
    main()
