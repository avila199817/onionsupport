from pathlib import Path

path = Path('.github/scripts/app_entrypoint_integrity.py')
text = path.read_text()

text = text.replace(
    'ENHANCEMENTS = ROOT / "src/app/enhancements.js"\nAPP_CSS = ROOT / "src/css/app.css"',
    'ENHANCEMENTS = ROOT / "src/app/enhancements.js"\nPRIVATE_RUNTIME = ROOT / "src/features/private-runtime-ui/index.js"\nAPP_CSS = ROOT / "src/css/app.css"',
    1,
)
text = text.replace(
    '    "../ui/chrome/index.js",\n',
    '',
    1,
)
text = text.replace(
    '    required_paths = (INDEX, MAIN, ENHANCEMENTS, APP_CSS, *RUNTIME_FILES.values())',
    '    required_paths = (INDEX, MAIN, ENHANCEMENTS, PRIVATE_RUNTIME, APP_CSS, *RUNTIME_FILES.values())',
    1,
)
text = text.replace(
    '    enhancements_text = read(ENHANCEMENTS, errors)\n    app_css_text = read(APP_CSS, errors)',
    '    enhancements_text = read(ENHANCEMENTS, errors)\n    private_runtime_text = read(PRIVATE_RUNTIME, errors)\n    app_css_text = read(APP_CSS, errors)',
    1,
)
old = '''    require(
        errors,
        enhancements_text.count("../ui/chrome/index.js") == 1,
        "App Chrome debe registrarse exactamente una vez",
    )'''
new = '''    require(
        errors,
        enhancements_text.count("../ui/chrome/index.js") == 0
        and private_runtime_text.count('import("../../ui/chrome/index.js")') == 1,
        "App Chrome debe tener una sola autoridad y vivir detrás del runtime privado autenticado",
    )'''
if old not in text:
    raise SystemExit('old App Chrome contract anchor missing')
text = text.replace(old, new, 1)
text = text.replace(
    '    print(f"- registry global: {len(CANONICAL_MODULES)} módulos")',
    '    print(f"- registry global: {len(CANONICAL_MODULES)} módulos públicos/progresivos")\n    print("- App Chrome: autoridad única en private-runtime-ui, fuera de pre-auth")',
    1,
)
path.write_text(text)
print('app entrypoint integrity adapted to private runtime authority')
