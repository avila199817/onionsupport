from pathlib import Path

path = Path("src/features/entity-overlay/index.js")
text = path.read_text()
old = '''    stopOwnerSession({ navigateBack: Boolean(session.returnPath) });'''
new = '''    stopOwnerSession({
      navigateBack: Boolean(session.returnPath) && isIncidenciaOwnerRoute(),
    });'''
if old not in text:
    raise SystemExit("owner close return call not found")
text = text.replace(old, new, 1)
path.write_text(text)

contract_path = Path(".github/scripts/entity_overlay_contract.mjs")
contract = contract_path.read_text()
anchor = 'assert.match(overlay, /navigateWithRouter\\(target\\)/);'
insert = '''assert.match(overlay, /navigateWithRouter\\(target\\)/);\nassert.match(\n  overlay,\n  /navigateBack:\\s*Boolean\\(session\\.returnPath\\)\\s*&&\\s*isIncidenciaOwnerRoute\\(\\)/\n);'''
if anchor not in contract:
    raise SystemExit("contract anchor not found")
contract = contract.replace(anchor, insert, 1)
contract_path.write_text(contract)
