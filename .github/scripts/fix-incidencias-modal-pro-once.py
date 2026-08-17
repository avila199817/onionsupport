from pathlib import Path

p = Path("src/views/incidencias/index.js")
s = p.read_text(encoding="utf-8")
old = '? "\n\nTienes una actualización sin enviar. Se conservará en pantalla; si la envías después, la incidencia se reabrirá."'
new = r'? "\n\nTienes una actualización sin enviar. Se conservará en pantalla; si la envías después, la incidencia se reabrirá."'
count = s.count(old)
if count != 1:
    raise RuntimeError(f"draft close copy escape: expected 1, got {count}")
p.write_text(s.replace(old, new, 1), encoding="utf-8")
print("fixed index close confirmation escape")
