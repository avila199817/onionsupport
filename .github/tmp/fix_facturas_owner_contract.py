from pathlib import Path

path = Path(".github/scripts/entity_overlay_contract.mjs")
text = path.read_text()

replacements = {
    'assert.match(overlay, /openCanonicalIncidencia/);': 'assert.match(overlay, /openCanonicalOwner/);',
    'assert.match(overlay, /INCIDENCIA_MODAL_ROOT_SELECTOR/);': 'assert.match(overlay, /ownerModalOpen/);',
    'assert.match(overlay, /navigateWithRouter\\(target\\)/);': 'assert.match(overlay, /navigateWithRouter\\(target,/);',
    '/navigateBack:\\s*Boolean\\(session\\.returnPath\\)\\s*&&\\s*isIncidenciaOwnerRoute\\(\\)/': '/navigateBack:\\s*Boolean\\(session\\.returnPath\\)\\s*&&\\s*isOwnerRoute\\(session\\.type\\)/',
}

for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f"stale contract anchor not found: {old}")
    text = text.replace(old, new, 1)

path.write_text(text)
