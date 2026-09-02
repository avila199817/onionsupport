from pathlib import Path

script_path = Path(".github/scripts/polish_empleados_once.py")
source = script_path.read_text(encoding="utf-8")

old = '''separator_selector = '.sidebar-menu-item[data-route$="/servidor"] {'
if executive.count(separator_selector) != 2:
    raise SystemExit("sidebar.executive.css: expected two Servidor separator selectors")
executive = executive.replace(
    separator_selector,
    '.sidebar-menu-item[data-route$="/empleados"] {',
)'''

new = '''separator_token = 'data-route$="/servidor"'
if executive.count(separator_token) != 2:
    raise SystemExit("sidebar.executive.css: expected two Servidor hierarchy tokens")
executive = executive.replace(
    separator_token,
    'data-route$="/empleados"',
)'''

if source.count(old) != 1:
    raise SystemExit("Unable to patch the Empleados applicator exactly once")

script_path.write_text(source.replace(old, new), encoding="utf-8")

compiled = compile(
    script_path.read_text(encoding="utf-8"),
    str(script_path),
    "exec",
)
exec(compiled, {"__name__": "__main__"})
