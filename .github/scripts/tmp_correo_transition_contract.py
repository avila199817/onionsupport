#!/usr/bin/env python3
from pathlib import Path

p = Path('.github/scripts/repo_integrity.py')
text = p.read_text(encoding='utf-8')

def one(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    text = text.replace(old, new, 1)

one(
    '    correo_viewport_text = (SRC / "css" / "views" / "correo" / "viewport.css").read_text(encoding="utf-8")',
    '''    correo_index_path = SRC / "css" / "views" / "correo" / "index.css"\n    correo_viewport_path = SRC / "css" / "views" / "correo" / "viewport.css"\n    correo_index_text = correo_index_path.read_text(encoding="utf-8")\n    correo_viewport_text = correo_viewport_path.read_text(encoding="utf-8") if correo_viewport_path.exists() else ""\n    correo_single_authority = not correo_viewport_path.exists()''',
    'v4 Correo paths',
)

one(
    '''    for snippet in (\n        'correo: Object.freeze([',\n        '\"/src/css/views/correo/index.css\"',\n        '\"/src/css/views/correo/viewport.css\"',\n    ):\n        if snippet not in route_styles_text:\n            errors.append(f\"src/router/styles.js :: falta contrato CSS de Correo: {snippet}\")\n    if \"correo/fullheight.css\" in route_styles_text:\n        errors.append(\"src/router/styles.js :: Correo no puede recuperar fullheight.css\")\n\n    if \"CONSOLIDATED HEIGHT / DENSITY CONTRACT\" not in correo_viewport_text:\n        errors.append(\"src/css/views/correo/viewport.css :: falta contrato consolidado de viewport\")''',
    '''    if correo_single_authority:\n        if route_styles_text.count('/src/css/views/correo/') != 1 or '\"/src/css/views/correo/index.css\"' not in route_styles_text:\n            errors.append(\"src/router/styles.js :: Correo canónico debe cargar exactamente index.css\")\n        correo_authority_text = correo_index_text\n        correo_authority_label = \"src/css/views/correo/index.css\"\n    else:\n        for snippet in (\n            'correo: Object.freeze([',\n            '\"/src/css/views/correo/index.css\"',\n            '\"/src/css/views/correo/viewport.css\"',\n        ):\n            if snippet not in route_styles_text:\n                errors.append(f\"src/router/styles.js :: falta contrato CSS de Correo legacy: {snippet}\")\n        correo_authority_text = correo_viewport_text\n        correo_authority_label = \"src/css/views/correo/viewport.css\"\n\n    if \"correo/fullheight.css\" in route_styles_text:\n        errors.append(\"src/router/styles.js :: Correo no puede recuperar fullheight.css\")\n\n    if \"CONSOLIDATED HEIGHT / DENSITY CONTRACT\" not in correo_authority_text:\n        errors.append(f\"{correo_authority_label} :: falta contrato consolidado de viewport\")''',
    'v4 transition contract',
)

one(
    '''    viewport_path = SRC / \"css\" / \"views\" / \"correo\" / \"viewport.css\"\n    viewport_text = viewport_path.read_text(encoding=\"utf-8\")\n    important_count = viewport_text.count(\"!important\")\n\n    if important_count > 16:\n        errors.append(\n            f\"src/css/views/correo/viewport.css :: demasiados !important tras V5: {important_count} > 16\"\n        )\n\n    if \"CONSOLIDATED HEIGHT / DENSITY CONTRACT\" not in viewport_text:\n        errors.append(\"src/css/views/correo/viewport.css :: falta contrato consolidado de altura/densidad\")''',
    '''    viewport_path = SRC / \"css\" / \"views\" / \"correo\" / \"viewport.css\"\n    index_path = SRC / \"css\" / \"views\" / \"correo\" / \"index.css\"\n    active_path = viewport_path if viewport_path.exists() else index_path\n    active_text = active_path.read_text(encoding=\"utf-8\")\n    important_count = active_text.count(\"!important\")\n\n    if important_count > 16:\n        errors.append(\n            f\"{active_path.relative_to(ROOT)} :: demasiados !important tras V5: {important_count} > 16\"\n        )\n\n    if \"CONSOLIDATED HEIGHT / DENSITY CONTRACT\" not in active_text:\n        errors.append(f\"{active_path.relative_to(ROOT)} :: falta contrato consolidado de altura/densidad\")''',
    'v5 transition contract',
)

p.write_text(text, encoding='utf-8')
print('Correo CSS transition contract applied')
