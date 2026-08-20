#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
COMPONENT = SRC / "css/components/detail-modal.css"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V8_AUDIT.md"
FOUNDATION = ROOT / "docs/UI_FOUNDATION.md"

ALIAS_RE = re.compile(
    r"^\s*(--ui-detail-modal-[a-z0-9-]+):\s*var\((--incidencias-modal-[a-z0-9-]+)\);\s*$",
    re.I | re.M,
)
ALIAS_BLOCK_RE = re.compile(
    r"\n\.ui-detail-modal-root\s*\{\s*\n"
    r"(?:\s*--ui-detail-modal-[a-z0-9-]+:\s*var\(--incidencias-modal-[a-z0-9-]+\);\s*\n)+"
    r"\}\s*\n",
    re.I,
)


def collect_mapping(component: str) -> dict[str, str]:
    mapping = {
        legacy.lower(): generic.lower()
        for generic, legacy in ALIAS_RE.findall(component)
    }
    if len(mapping) < 20:
        raise SystemExit(f"V8 esperaba >=20 aliases compartidos; detectados {len(mapping)}")
    if len(set(mapping.values())) != len(mapping):
        raise SystemExit("Mapping V8 contiene destinos duplicados")
    return mapping


def strip_alias_block(component: str) -> str:
    updated, count = ALIAS_BLOCK_RE.subn("\n", component, count=1)
    if count != 1:
        raise SystemExit("No se encontró el bloque alias V6/V7 en detail-modal.css")
    updated = updated.replace(
        "   UI SYSTEM V6\n   - Shell visual compartido para detalles administrativos.\n   - Sin selectores de dominio Usuarios/Incidencias.\n   - Tokens genéricos con fallback a los tokens históricos de modal.\n   - Route-loaded: no aumenta el CSS global de la landing.",
        "   UI SYSTEM V8\n   - Shell visual compartido para detalles administrativos.\n   - Sin selectores de dominio Usuarios/Incidencias.\n   - Consume tokens canónicos --ui-detail-modal-* del design system.\n   - Route-loaded: no aumenta el CSS global de la landing.",
    )
    return updated


def replace_mapping(text: str, mapping: dict[str, str]) -> tuple[str, int]:
    total = 0
    for legacy, generic in sorted(mapping.items(), key=lambda item: -len(item[0])):
        pattern = re.compile(re.escape(legacy), re.I)
        text, count = pattern.subn(generic, text)
        total += count
    return text, total


def migrate_source(mapping: dict[str, str], component_after_strip: str) -> tuple[int, list[str]]:
    changed_files: list[str] = []
    replacements = 0

    for path in sorted(SRC.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".css", ".js"}:
            continue

        original = component_after_strip if path == COMPONENT else path.read_text(encoding="utf-8")
        updated, count = replace_mapping(original, mapping)

        if path.name in {"variables.css", "light.css"}:
            updated = updated.replace(
                "INCIDENCIAS DETAIL / MODAL TOKENS",
                "DETAIL MODAL SHARED + INCIDENCIAS DOMAIN TOKENS",
            )

        if updated != path.read_text(encoding="utf-8"):
            path.write_text(updated, encoding="utf-8")
            changed_files.append(str(path.relative_to(ROOT)))
        replacements += count

    return replacements, changed_files


def count_legacy(mapping: dict[str, str]) -> dict[str, int]:
    counts = {token: 0 for token in mapping}
    for path in SRC.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".css", ".js"}:
            continue
        text = path.read_text(encoding="utf-8").lower()
        for token in counts:
            counts[token] += text.count(token)
    return counts


def update_integrity(text: str, mapping: dict[str, str]) -> str:
    legacy_tuple = "\n".join(f'        "{token}",' for token in sorted(mapping))
    function = f'''\n\ndef validate_detail_modal_tokens_v8_contract(errors: list[str]) -> None:\n    """Shared Detail Modal tokens are canonical ui-detail-modal tokens, never Incidencias aliases."""\n    component = (SRC / "css" / "components" / "detail-modal.css").read_text(encoding="utf-8")\n    legacy_tokens = (\n{legacy_tuple}\n    )\n\n    if "var(--incidencias-modal-" in component:\n        errors.append("src/css/components/detail-modal.css :: componente transversal no puede depender de tokens Incidencias")\n\n    source_files = [\n        path\n        for path in SRC.rglob("*")\n        if path.is_file() and path.suffix.lower() in {{".css", ".js"}}\n    ]\n    for path in source_files:\n        source = path.read_text(encoding="utf-8").lower()\n        for token in legacy_tokens:\n            if token in source:\n                errors.append(\n                    f"{{path.relative_to(ROOT)}} :: token compartido legacy prohibido tras V8: {{token}}"\n                )\n'''

    if "def validate_detail_modal_tokens_v8_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró inserción para contrato V8")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_detail_modal_pairing_v7_contract(errors)\n"
    if "    validate_detail_modal_tokens_v8_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V7 pairing en main()")
        text = text.replace(call, call + "    validate_detail_modal_tokens_v8_contract(errors)\n", 1)
    return text


def update_foundation(text: str) -> str:
    note = """

## Detail Modal transversal · V8

Los tokens compartidos del shell de detalle usan el namespace `--ui-detail-modal-*` en `tokens/variables.css` y `tokens/light.css`. Ningún componente transversal puede depender de `--incidencias-modal-*`; ese prefijo queda reservado a necesidades exclusivas del dominio Incidencias.
"""
    if "## Detail Modal transversal · V8" not in text:
        text = text.rstrip() + note + "\n"
    return text


def write_audit(mapping: dict[str, str], replacements: int, changed_files: list[str], component_before: int, component_after: int) -> None:
    pairs = "\n".join(
        f"- `{legacy}` → `{generic}`"
        for legacy, generic in sorted(mapping.items())
    )
    files = "\n".join(f"- `{item}`" for item in changed_files)
    AUDIT.write_text(
        f'''# Onion Support — UI System V8 Audit\n\n## Tokens canónicos del Detail Modal\n\nV8 elimina el último acoplamiento semántico del componente transversal con Incidencias. Los tokens que ya gobiernan el shell compartido pasan de `--incidencias-modal-*` a `--ui-detail-modal-*` en toda la fuente productiva.\n\n- Tokens compartidos canonicalizados: **{len(mapping)}**\n- Referencias/declaraciones sustituidas: **{replacements}**\n- Archivos productivos modificados por la migración: **{len(changed_files)}**\n- `detail-modal.css`: **{component_before:,} → {component_after:,} bytes**\n- Aliases locales eliminados del componente: **{len(mapping)}**\n\n## Archivos afectados\n\n{files}\n\n## Mapa de tokens\n\n{pairs}\n\n## Contrato\n\n- `components/detail-modal.css` consume directamente tokens `--ui-detail-modal-*`.\n- `variables.css` y `light.css` son la autoridad de esos tokens.\n- Los tokens `--incidencias-modal-*` supervivientes sólo pueden representar necesidades específicas del ticket.\n- Repository Integrity bloquea la reaparición de cualquiera de los {len(mapping)} nombres legacy compartidos en `src/`.\n''',
        encoding="utf-8",
    )


def main() -> None:
    original_component = COMPONENT.read_text(encoding="utf-8")
    mapping = collect_mapping(original_component)
    stripped = strip_alias_block(original_component)
    before_size = len(original_component.encode("utf-8"))

    replacements, changed_files = migrate_source(mapping, stripped)
    if replacements < len(mapping):
        raise SystemExit(f"Pocas sustituciones V8: {replacements}")

    remaining = {token: count for token, count in count_legacy(mapping).items() if count}
    if remaining:
        raise SystemExit(f"Persisten tokens legacy compartidos: {remaining}")

    INTEGRITY.write_text(
        update_integrity(INTEGRITY.read_text(encoding="utf-8"), mapping),
        encoding="utf-8",
    )
    FOUNDATION.write_text(
        update_foundation(FOUNDATION.read_text(encoding="utf-8")),
        encoding="utf-8",
    )

    after_size = COMPONENT.stat().st_size
    write_audit(mapping, replacements, changed_files, before_size, after_size)
    print(
        f"V8 OK · tokens={len(mapping)} · replacements={replacements} · files={len(changed_files)} · component={before_size}->{after_size}"
    )


if __name__ == "__main__":
    main()
