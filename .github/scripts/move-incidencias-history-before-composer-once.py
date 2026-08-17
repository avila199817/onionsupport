from pathlib import Path

p = Path("src/views/incidencias/incidencias.template.modal.js")
s = p.read_text(encoding="utf-8")
old = '''            <div data-modal-composer-slot="true">
              ${renderComposer(vm)}
            </div>

            ${renderHistorySection(vm)}'''
new = '''            ${renderHistorySection(vm)}

            <div data-modal-composer-slot="true">
              ${renderComposer(vm)}
            </div>'''
if old not in s:
    raise SystemExit("target modal order not found")
s = s.replace(old, new, 1)
s = s.replace(
    '"incidencias.template.modal.extreme.v21.pro-close-history"',
    '"incidencias.template.modal.extreme.v22.history-first"',
    1,
)
p.write_text(s, encoding="utf-8")
print("moved history before composer")
