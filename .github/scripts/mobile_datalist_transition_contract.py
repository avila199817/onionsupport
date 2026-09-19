#!/usr/bin/env python3
"""Exercise trusted DataList validation against both supported source contracts."""

import importlib.util
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location(
    "repo_integrity", Path(__file__).with_name("repo_integrity.py")
)
integrity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(integrity)

FEATURE = "src/features/mobile-datalist/index.js"
CSS = "src/css/compositions/mobile-datalist.css"
AUTHORITY = "src/css/compositions/entity-list.css"
V1 = "mobile-datalist.v1-semantic-table-card-composition"
V2 = "mobile-datalist.v2-shared-entity-list"
VIEWS = ("incidencias", "facturas", "clientes", "usuarios")
FEATURE_BODY = "\n".join(f'const {view} = {{ layout: "{view}" }};' for view in VIEWS)
FEATURE_BODY += '\nnew MutationObserver(() => {});\nrow.classList.add("ui-datalist-row", "ui-entity-row");'
LEGACY_CSS = '@layer compositions {\n@media (max-width: 680px) {\n.ui-datalist { display: block; }\n'
LEGACY_CSS += "\n".join(f'.ui-datalist[data-mobile-datalist-layout="{view}"] {{ color: inherit; }}' for view in VIEWS)
LEGACY_CSS += "\n} }"
SHARED_CSS = '''@media (max-width: 680px) {
.ui-datalist { display: block; }
.ui-datalist-row { display: flex; flex-wrap: wrap; gap: var(--entity-list-meta-gap); }
.ui-datalist-cell::before { content: attr(data-mobile-label); }
.ui-datalist-cell:is([data-mobile-slot="primary"], [data-mobile-slot="actions"]) { flex-basis: 100%; }
}'''
SHARED_AUTHORITY = '''@layer entity-list {
:root { --entity-list-row-radius: 17px; --entity-list-row-padding: 10px; --entity-list-meta-gap: 6px; --entity-list-title-size: 12px; }
.ui-entity-row { padding: var(--entity-list-row-padding); border-radius: var(--entity-list-row-radius); border: 1px solid var(--data-table-row-border); }
@media (min-width: 681px) { .ui-datalist-row.ui-entity-row { all: revert-layer; } }
}'''
SHARED_IMPORT = '@import url("./compositions/entity-list.css") layer(compositions);'
ADAPTER_IMPORT = '@import url("./compositions/mobile-datalist.css") layer(compositions);'


def fixture(version):
    files = {
        FEATURE: f'export const MOBILE_DATALIST_VERSION = "{version}";\n' + FEATURE_BODY,
        CSS: LEGACY_CSS if version == V1 else SHARED_CSS,
        AUTHORITY: SHARED_AUTHORITY,
        "src/css/app.css": SHARED_IMPORT + "\n" + ADAPTER_IMPORT,
        "src/css/private.css": SHARED_IMPORT + "\n" + ADAPTER_IMPORT,
        "src/views/home/home.template.activity.js": 'const row = `<button class="home-entity-row ui-entity-row home-entity-row--activity">Actividad</button>`;',
        "src/views/home/home.template.billing.js": 'const row = `<button class="home-entity-row ui-entity-row home-entity-row--invoice">Factura</button>`;',
        # A candidate must never supply the implementation of its own gate.
        ".github/scripts/repo_integrity.py": 'raise AssertionError("Candidate validator was executed")',
    }
    files.update({f"src/css/views/{view}/index.css": "@layer views {}" for view in VIEWS})
    if version == V1:
        del files[AUTHORITY]
        files["src/css/app.css"] = ADAPTER_IMPORT
        files["src/css/private.css"] = ADAPTER_IMPORT
    return files


def verify(files):
    with tempfile.TemporaryDirectory(prefix="onion-mobile-contract-") as folder:
        root = Path(folder)
        for relative, source in files.items():
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source, encoding="utf-8")
        integrity.ROOT = root
        integrity.SRC = root / "src"
        errors = []
        integrity.validate_mobile_datalist_transition(errors)
        return errors


cases = 0


def reject(version, path, transform, label):
    global cases
    files = fixture(version)
    files[path] = transform(files[path])
    assert verify(files), label
    cases += 1


for version in (V1, V2):
    assert not verify(fixture(version)), f"Supported contract must pass: {version}"
    cases += 1
    reject(version, FEATURE, lambda value: value.replace(version, "unknown"), "Unknown versions must fail closed")
    reject(version, FEATURE, lambda value: "/*" + value + "*/", "Comments cannot declare the version or layouts")
    reject(version, FEATURE, lambda value: value + f'\nexport const MOBILE_DATALIST_VERSION = "{version}";', "Duplicate versions must fail closed")
    reject(version, CSS, lambda value: value + "\n.ui-datalist { color: red !important; }", "Neither contract permits !important")
    for view in VIEWS:
        reject(version, FEATURE, lambda value, view=view: value.replace(f'layout: "{view}"', ""), f"Both contracts must retain the {view} adapter")

for snippet in ("@layer compositions", "@media (max-width: 680px)", ".ui-datalist"):
    reject(V1, CSS, lambda value, snippet=snippet: value.replace(snippet, ""), f"Legacy requirement retained: {snippet}")
for view in VIEWS:
    reject(V1, CSS, lambda value, view=view: value.replace(f'.ui-datalist[data-mobile-datalist-layout="{view}"]', ".other"), f"Legacy domain geometry required: {view}")
reject(V1, CSS, lambda _: SHARED_CSS, "New CSS without the new version must fail")
reject(V2, CSS, lambda _: LEGACY_CSS, "A new version cannot excuse legacy geometry")
reject(V2, CSS, lambda value: value.replace("flex-wrap: wrap", "flex-wrap: nowrap"), "Non-wrapping rows must fail")
reject(V2, CSS, lambda value: value.replace("display: flex", "display: grid"), "Fixed row grids must fail")
reject(V2, CSS, lambda value: value.replace("flex-basis: 100%", "flex-basis: 50%"), "Primary and actions must span the full row")
reject(V2, CSS, lambda value: value + '\n.ui-datalist[data-mobile-datalist-layout="facturas"] { color: inherit; }', "CSS must not branch by domain")
reject(V2, CSS, lambda value: value + '\n.ui-datalist-cell[data-mobile-slot="amount"] { grid-column: 4 / span 3; }', "Fixed slot columns must fail")
reject(V2, CSS, lambda value: "@layer compositions {\n" + value + "\n}", "The adapter must not nest compositions")
reject(V2, FEATURE, lambda value: value.replace(', "ui-entity-row"', ""), "Every table row must consume the shared surface")
reject(V2, AUTHORITY, lambda value: value.replace("@layer entity-list", "@layer compositions"), "Only the isolated surface sublayer is accepted")
reject(V2, AUTHORITY, lambda value: value.replace("all: revert-layer;", ""), "Desktop surface rollback is mandatory")
reject(V2, AUTHORITY, lambda value: "/*" + value + "*/", "Commented authority cannot satisfy v2")
for entry in ("src/css/app.css", "src/css/private.css"):
    reject(V2, entry, lambda value: value.replace(SHARED_IMPORT, ""), f"{entry} must load shared authority")
    reject(V2, entry, lambda _: ADAPTER_IMPORT + "\n" + SHARED_IMPORT, f"{entry} must load authority before its adapter")
reject(V2, "src/css/views/facturas/index.css", lambda value: value + '\n.ui-datalist[data-mobile-datalist-layout="facturas"] { display: grid; }', "Route CSS cannot fork mobile geometry")
for domain in ("activity", "billing"):
    reject(V2, f"src/views/home/home.template.{domain}.js", lambda value: value.replace(" ui-entity-row", ""), f"Home {domain} must consume the same authority as mobile tables")
missing = fixture(V2)
del missing[AUTHORITY]
assert verify(missing), "A version marker without the shared authority must fail"
cases += 1

print(f"Mobile datalist transition OK · {cases} cases · both versions accepted · partial migrations rejected · candidate tooling never executed")
