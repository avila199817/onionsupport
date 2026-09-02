from pathlib import Path

script_path = Path(".github/scripts/polish_empleados_once.py")
source = script_path.read_text(encoding="utf-8")

old_separator = '''separator_selector = '.sidebar-menu-item[data-route$="/servidor"] {'
if executive.count(separator_selector) != 2:
    raise SystemExit("sidebar.executive.css: expected two Servidor separator selectors")
executive = executive.replace(
    separator_selector,
    '.sidebar-menu-item[data-route$="/empleados"] {',
)'''

new_separator = '''separator_token = 'data-route$="/servidor"'
if executive.count(separator_token) != 4:
    raise SystemExit("sidebar.executive.css: expected four Servidor hierarchy tokens")
executive = executive.replace(
    separator_token,
    'data-route$="/empleados"',
)'''

old_invariant = '''executive = read(executive_path)
if executive.count('.sidebar-menu-item[data-route$="/empleados"] {') != 2:
    raise SystemExit("Empleados must own both open/collapsed separators")
if '.sidebar-menu-item[data-route$="/servidor"] {' in executive:
    raise SystemExit("Servidor must no longer own the group separator")'''

new_invariant = '''executive = read(executive_path)
if executive.count('data-route$="/empleados"') != 4:
    raise SystemExit("Empleados must own every hierarchy separator mode")
if 'data-route$="/servidor"' in executive:
    raise SystemExit("Servidor must no longer own the group separator")'''

if source.count(old_separator) != 1:
    raise SystemExit("Unable to patch the separator applicator exactly once")
if source.count(old_invariant) != 1:
    raise SystemExit("Unable to patch the separator invariant exactly once")

source = source.replace(old_separator, new_separator)
source = source.replace(old_invariant, new_invariant)
script_path.write_text(source, encoding="utf-8")

compiled = compile(
    script_path.read_text(encoding="utf-8"),
    str(script_path),
    "exec",
)
exec(compiled, {"__name__": "__main__"})
