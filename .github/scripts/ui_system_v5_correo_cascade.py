#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
VIEWPORT = ROOT / "src/css/views/correo/viewport.css"
INTEGRITY = ROOT / ".github/scripts/repo_integrity.py"
AUDIT = ROOT / "docs/UI_SYSTEM_V5_AUDIT.md"


def strip_nonessential_important(text: str) -> tuple[str, int, int]:
    before = text.count("!important")
    lines = text.splitlines(keepends=True)
    output: list[str] = []
    depth = 0
    preserved_depths: list[int] = []

    for line in lines:
        lower = line.lower()
        starts_preserved_media = (
            "@media" in lower
            and (
                "prefers-reduced-motion" in lower
                or re.search(r"@media\s+print\b", lower) is not None
            )
        )

        inside_preserved_media = bool(preserved_depths) or starts_preserved_media

        if not inside_preserved_media:
            line = re.sub(r"\s*!important\b", "", line)

        opens = line.count("{")
        closes = line.count("}")
        previous_depth = depth
        depth += opens - closes

        if starts_preserved_media and opens > closes:
            preserved_depths.append(previous_depth + 1)

        while preserved_depths and depth < preserved_depths[-1]:
            preserved_depths.pop()

        output.append(line)

    result = "".join(output)
    after = result.count("!important")
    return result, before, after


def update_integrity(max_important: int = 16) -> None:
    text = INTEGRITY.read_text(encoding="utf-8")

    function = f'''\n\ndef validate_correo_cascade_v5_contract(errors: list[str]) -> None:\n    """Keep Correo on normal cascade; reserve !important for accessibility/print escape hatches."""\n    viewport_path = SRC / "css" / "views" / "correo" / "viewport.css"\n    viewport_text = viewport_path.read_text(encoding="utf-8")\n    important_count = viewport_text.count("!important")\n\n    if important_count > {max_important}:\n        errors.append(\n            f"src/css/views/correo/viewport.css :: demasiados !important tras V5: {{important_count}} > {max_important}"\n        )\n\n    if "CONSOLIDATED HEIGHT / DENSITY CONTRACT" not in viewport_text:\n        errors.append("src/css/views/correo/viewport.css :: falta contrato consolidado de altura/densidad")\n'''

    if "def validate_correo_cascade_v5_contract" not in text:
        marker = "\n\ndef validate_paths(errors: list[str]) -> None:\n"
        if marker not in text:
            raise SystemExit("No se encontró punto de inserción para contrato V5")
        text = text.replace(marker, function + marker, 1)

    call = "    validate_ui_system_v4_contract(errors)\n"
    if "    validate_correo_cascade_v5_contract(errors)\n" not in text:
        if call not in text:
            raise SystemExit("No se encontró llamada V4 en main()")
        text = text.replace(
            call,
            call + "    validate_correo_cascade_v5_contract(errors)\n",
            1,
        )

    INTEGRITY.write_text(text, encoding="utf-8")


def css_stats() -> tuple[int, int, int]:
    css_files = list((ROOT / "src/css").rglob("*.css"))
    important = 0
    total_bytes = 0
    media = 0
    for path in css_files:
        text = path.read_text(encoding="utf-8")
        important += text.count("!important")
        total_bytes += path.stat().st_size
        media += text.count("@media")
    return len(css_files), important, total_bytes, media


def write_audit(before: int, after: int) -> None:
    css_count, repo_important, total_bytes, media = css_stats()
    removed = before - after
    AUDIT.write_text(
        f'''# Onion Support — UI System V5 Audit\n\n## Correo: normalización de cascada\n\nLa consolidación V4 eliminó la tercera autoridad `fullheight.css`. V5 aprovecha esa arquitectura para retirar prioridad forzada que ya no necesita competir con hojas paralelas.\n\n- `viewport.css` antes: **{before}** declaraciones `!important`.\n- `viewport.css` después: **{after}** declaraciones `!important`.\n- Prioridades forzadas retiradas: **{removed}**.\n- Las excepciones supervivientes quedan reservadas para `prefers-reduced-motion` y `print`.\n- Repository Integrity bloquea volver a superar **16** `!important` en `viewport.css`.\n\n## Inventario CSS posterior\n\n- Hojas CSS: **{css_count}**\n- Peso fuente CSS: **{total_bytes:,} bytes**\n- `!important` globales: **{repo_important}**\n- Bloques `@media`: **{media}**\n\n## Resultado\n\nCorreo mantiene exactamente las mismas propiedades y selectores; V5 sólo retira `!important` no esenciales. Al estar `viewport.css` después de `index.css` dentro de la misma capa `views`, la cascada normal vuelve a decidir la composición.\n\n## Siguiente deuda prioritaria\n\n1. Extraer el shell modal compartido para que Usuarios deje de depender de `incidencias/detail.css`.\n2. Separar primitives transversales de los estilos de dominio de Incidencias.\n3. Converger create/detail de Incidencias, Facturas, Clientes y Usuarios sobre componentes compartidos donde el contrato sea realmente común.\n''',
        encoding="utf-8",
    )


def main() -> None:
    original = VIEWPORT.read_text(encoding="utf-8")
    normalized, before, after = strip_nonessential_important(original)

    if before < 100:
        raise SystemExit(f"V5 esperaba deuda alta en Correo; detectados sólo {before} !important")
    if before - after < 100:
        raise SystemExit(f"V5 no retiró suficiente deuda: {before} -> {after}")
    if after > 16:
        raise SystemExit(f"V5 deja demasiados !important: {after}")

    VIEWPORT.write_text(normalized, encoding="utf-8")
    update_integrity(16)
    write_audit(before, after)
    print(f"Correo cascade V5 OK: !important {before} -> {after}")


if __name__ == "__main__":
    main()
