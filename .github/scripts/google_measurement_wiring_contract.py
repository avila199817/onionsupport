#!/usr/bin/env python3
"""Exercise Google bootstrap wiring modes and rejected regressions.

These fixtures test static wiring only. The module's actual consent, privacy and
modal behavior runs in modal_lifecycle_contract.mjs with intercepted Google I/O.
"""
from pathlib import Path
import importlib.util
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("google_contract", ROOT / ".github/scripts/google_measurement_contract.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)
MARKER = "<!-- public-site-v3: generated metadata -->"
IMPORT = 'import "./analytics/google-tag.js";'


def main():
    with tempfile.TemporaryDirectory(prefix="onion-google-wiring-") as temporary:
        root = Path(temporary)
        modern = root / "modern"
        files = [*contract.PUBLIC_SURFACES, contract.BOOTSTRAP_PATH, contract.CONSENT_STYLESHEET_PATH, "src/main.js"]
        for name in files:
            target = modern / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target)
        assert MARKER in (modern / "index.html").read_text(), "v3 fixture requires the actual migrated entry"
        assert not contract.validate_source(modern), "actual v3 source must pass"

        # A static classic-wiring fixture reuses the privacy declarations. Its
        # JavaScript is never executed; removing the ESM import changes only the
        # syntax mode under test, not production source or the privacy checks.
        legacy = root / "classic-wiring"
        shutil.copytree(modern, legacy)
        for name in contract.PUBLIC_SURFACES:
            page = legacy / name
            text = page.read_text().replace(MARKER, "<!-- classic wiring fixture -->")
            if name == "index.html":
                text = text.replace("</head>", contract.SCRIPT_TAG + "\n</head>")
            else:
                text = text.replace(contract.MODULE_SCRIPT_TAG, contract.SCRIPT_TAG)
            page.write_text(text)
        bootstrap = legacy / contract.BOOTSTRAP_PATH
        bootstrap.write_text("\n".join(line for line in bootstrap.read_text().splitlines() if not line.startswith("import ")))
        assert not contract.validate_source(legacy), "classic wiring remains supported"

        checks = []
        def reject(name, relative, mutate, expected_error, base=modern):
            path = base / relative
            original = path.read_text()
            path.write_text(mutate(original))
            try:
                errors = contract.validate_source(base)
                assert any(expected_error in error for error in errors), f"{name}: missing expected rejection: {errors}"
            finally:
                path.write_text(original)
            checks.append(name)

        reject("duplicate module", "seo/impresoras.html", lambda text: text.replace(contract.MODULE_SCRIPT_TAG, contract.MODULE_SCRIPT_TAG * 2), "encontrado 2")
        reject("classic tag in v3", "seo/impresoras.html", lambda text: text.replace(contract.MODULE_SCRIPT_TAG, contract.SCRIPT_TAG), "encontrado 0")
        reject("second SPA entry", "index.html", lambda text: text.replace("</head>", contract.MODULE_SCRIPT_TAG + "</head>"), "sin segunda etiqueta")
        reject("duplicate bootstrap import", "src/main.js", lambda text: IMPORT + "\n" + text, "antes del boot")
        reject("bootstrap below boot", "src/main.js", lambda text: text.replace(IMPORT, "") + "\n" + IMPORT, "antes del boot")
        reject("unmarked ESM migration", "index.html", lambda text: text.replace(MARKER, "<!-- public-site-v2 -->"), "modo clásico")
        reject("ESM in classic", contract.BOOTSTRAP_PATH, lambda text: 'import "./module.js";\n' + text, "modo clásico", legacy)
        reject("duplicate classic tag", "seo/impresoras.html", lambda text: text.replace(contract.SCRIPT_TAG, contract.SCRIPT_TAG * 2), "encontrado 2", legacy)
        print(f"Google wiring contract: PASS (2 wiring modes + {len(checks)} rejected mutations)")


if __name__ == "__main__":
    main()
