#!/usr/bin/env python3
from pathlib import Path

path = Path('src/views/facturas/facturas.template.create.js')
text = path.read_text(encoding='utf-8')

start_marker = '    descripcion: String(first(raw.descripcion, raw.description, raw.detalle, "") ?? "")'
end_marker = '      .trim(),'
start = text.find(start_marker)
if start < 0:
    raise SystemExit('description normalization start not found')
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit('description normalization end not found')
end += len(end_marker)

fixed = '''    descripcion: String(first(raw.descripcion, raw.description, raw.detalle, "") ?? "")
      .split("\\r\\n").join("\\n")
      .split("\\r").join("\\n")
      .trim(),'''

text = text[:start] + fixed + text[end:]
path.write_text(text, encoding='utf-8')
print('facturas-create-polish-bootstrap-v5: generated description normalization fixed')
