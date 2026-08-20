#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / 'src/views/cuenta/cuenta.api.js'
INTEGRITY = ROOT / '.github/scripts/repo_integrity.py'
AUDIT = ROOT / 'docs/UI_SYSTEM_V14_AUDIT.md'

FUNCTIONS = ('isAzureBlobHost', 'isSensitiveQueryParam', 'isAzureSasParam', 'safeAvatarUrl')


def matching_brace(text, open_idx):
    depth = 1
    quote = None
    comment = None
    i = open_idx + 1
    while i < len(text):
        ch = text[i]
        nxt = text[i+1] if i+1 < len(text) else ''
        if comment == 'line':
            if ch == '\n': comment = None
            i += 1; continue
        if comment == 'block':
            if ch == '*' and nxt == '/': comment = None; i += 2; continue
            i += 1; continue
        if quote:
            if ch == '\\': i += 2; continue
            if ch == quote: quote = None
            i += 1; continue
        if ch == '/' and nxt == '/': comment = 'line'; i += 2; continue
        if ch == '/' and nxt == '*': comment = 'block'; i += 2; continue
        if ch in ('"', "'", '`'): quote = ch; i += 1; continue
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: return i
        i += 1
    raise SystemExit('unclosed function')


def remove_function(text, name):
    m = re.search(rf'\nfunction\s+{re.escape(name)}\s*\(', text)
    if not m:
        raise SystemExit(f'missing {name}')
    open_idx = text.find('{', m.end())
    close_idx = matching_brace(text, open_idx)
    end = close_idx + 1
    while end < len(text) and text[end] in ' \t': end += 1
    while end < len(text) and text[end] == '\n': end += 1
    return text[:m.start()] + '\n' + text[end:]


def update_integrity(text):
    fn = '''\n\ndef validate_cuenta_media_v14_contract(errors: list[str]) -> None:\n    path = ROOT / "src/views/cuenta/cuenta.api.js"\n    source = path.read_text(encoding="utf-8")\n    if 'sanitizeRuntimeImageUrl' not in source or '../../core/media.js' not in source:\n        errors.append("src/views/cuenta/cuenta.api.js :: debe consumir core/media.js tras V14")\n    for helper in ("isAzureBlobHost", "isSensitiveQueryParam", "isAzureSasParam", "safeAvatarUrl"):\n        if re.search(rf"\\bfunction\\s+{helper}\\s*\\(", source):\n            errors.append(f"src/views/cuenta/cuenta.api.js :: media helper local prohibido V14: {helper}")\n'''
    if 'def validate_cuenta_media_v14_contract' not in text:
        marker = '\n\ndef validate_paths(errors: list[str]) -> None:\n'
        if marker not in text: raise SystemExit('integrity insertion point missing')
        text = text.replace(marker, fn + marker, 1)
    # insert immediately before path validation so ordering is stable
    main_marker = '    validate_paths(errors)\n'
    if '    validate_cuenta_media_v14_contract(errors)\n' not in text:
        if main_marker not in text: raise SystemExit('integrity main point missing')
        text = text.replace(main_marker, '    validate_cuenta_media_v14_contract(errors)\n' + main_marker, 1)
    return text


def main():
    source = TARGET.read_text(encoding='utf-8')
    before = len(source.encode())
    import_line = 'import Http from "../../core/http.js";\n'
    media_import = 'import { sanitizeRuntimeImageUrl } from "../../core/media.js";\n'
    if media_import not in source:
        if import_line not in source: raise SystemExit('Http import not found')
        source = source.replace(import_line, import_line + media_import, 1)
    for name in FUNCTIONS:
        source = remove_function(source, name)
    source = source.replace('safeAvatarUrl(', 'sanitizeRuntimeImageUrl(')
    if 'safeAvatarUrl(' in source: raise SystemExit('safeAvatarUrl call remains')
    TARGET.write_text(source, encoding='utf-8')
    after = len(source.encode())

    integrity = INTEGRITY.read_text(encoding='utf-8')
    INTEGRITY.write_text(update_integrity(integrity), encoding='utf-8')

    AUDIT.write_text(f'''# Onion Support — UI System V14 Audit\n\n## Cuenta: política multimedia canónica\n\nCuenta deja de mantener una segunda política de URLs de avatar y consume `sanitizeRuntimeImageUrl()` desde `src/core/media.js`.\n\n- Helpers locales retirados: **4** (`isAzureBlobHost`, `isSensitiveQueryParam`, `isAzureSasParam`, `safeAvatarUrl`)\n- `cuenta.api.js`: **{before:,} → {after:,} bytes**\n- Código retirado: **{before-after:,} bytes**\n- Autoridad runtime de imágenes: **1** (`core/media.js`)\n- Se preservan URLs relativas, object URLs `blob:`, Onion API y Azure Blob; SAS sólo se acepta conforme a la política Core.\n\n## Invariante\n\nRepository Integrity bloquea reintroducir los cuatro helpers locales y exige el consumo de `core/media.js`.\n''', encoding='utf-8')
    print(f'Cuenta media V14 OK · removed={before-after} bytes')

if __name__ == '__main__': main()
