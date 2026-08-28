from pathlib import Path

path = Path('.github/scripts/entity_overlay_contract.mjs')
text = path.read_text()
old = '''const [overlay, app, main, html, deeplink, spaContract] = await Promise.all([\n  read("src/features/entity-overlay/index.js"),\n  read("src/app/index.js"),\n  read("src/main.js"),\n  read("index.html"),\n  read("src/features/ticket-deeplink/index.js"),\n  read(".github/ci/validate_spa_contracts.sh"),\n]);'''
new = '''const [overlay, privateRuntime, app, main, html, deeplink, spaContract] = await Promise.all([\n  read("src/features/entity-overlay/index.js"),\n  read("src/features/private-runtime-ui/index.js"),\n  read("src/app/index.js"),\n  read("src/main.js"),\n  read("index.html"),\n  read("src/features/ticket-deeplink/index.js"),\n  read(".github/ci/validate_spa_contracts.sh"),\n]);'''
if old not in text:
    raise SystemExit('entity overlay Promise.all anchor missing')
text = text.replace(old, new, 1)
old = 'assert.match(app, /import\\("\\.\\.\\/features\\/entity-overlay\\/index\\.js"\\)/);'
new = '''assert.match(privateRuntime, /import\\("\\.\\.\\/entity-overlay\\/index\\.js"\\)/);\nassert.doesNotMatch(app, /features\\/entity-overlay\\/index\\.js/);'''
if old not in text:
    raise SystemExit('entity overlay app import assertion missing')
text = text.replace(old, new, 1)
path.write_text(text)
print('entity overlay contract adapted to private runtime ownership')
