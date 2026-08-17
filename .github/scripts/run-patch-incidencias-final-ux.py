from pathlib import Path
import runpy

script = Path('.github/scripts/patch-incidencias-final-ux.py')
text = script.read_text(encoding='utf-8')
old = "if '!important' in c:\n    raise SystemExit('CSS contract violated: !important found')"
new = "if re.search(r':\\s*[^;{}\\n]*!\\s*important\\b', c, flags=re.I):\n    raise SystemExit('CSS contract violated: !important declaration found')"
if old not in text:
    raise SystemExit('Expected CSS validation guard not found in patcher')
script.write_text(text.replace(old, new, 1), encoding='utf-8')
runpy.run_path(str(script), run_name='__main__')
