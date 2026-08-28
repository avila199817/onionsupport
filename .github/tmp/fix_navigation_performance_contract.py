from pathlib import Path

path = Path('.github/scripts/navigation_performance_contract.mjs')
text = path.read_text()
text = text.replace('"app.enhancements.v17-incidencias-live-media"','"app.enhancements.v18-no-private-chrome-preauth"',1)
anchor = 'const enhancementsSource = await readFile(\n  "src/app/enhancements.js",\n  "utf8"\n);\n'
addition = anchor + '''assert.equal(\n  enhancementsSource.includes('key: "app-chrome"'),\n  false,\n  "App Chrome must not be a pre-router/global enhancement before authentication"\n);\nassert.equal(\n  enhancementsSource.includes('../ui/chrome/index.js'),\n  false,\n  "App Chrome import authority must live outside enhancements"\n);\n'''
if anchor not in text:
    raise SystemExit('navigation performance anchor missing')
text = text.replace(anchor, addition, 1)
path.write_text(text)
print('navigation performance contract adapted to enhancements v18/private chrome boundary')
