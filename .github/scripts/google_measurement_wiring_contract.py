#!/usr/bin/env python3
"""Exercise Google source wiring and exact deployed artifact authority.

These fixtures test static wiring only. The module's actual consent, privacy and
modal behavior runs in modal_lifecycle_contract.mjs with intercepted Google I/O.
"""
from pathlib import Path
from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import shutil
import sys
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("google_contract", ROOT / ".github/scripts/google_measurement_contract.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)
MARKER = "<!-- public-site-v3: generated metadata -->"
IMPORT = 'import "./analytics/google-tag.js";'


def verify_production_roots(source, temporary):
    artifact = temporary / "compiled"
    for name in contract.PRODUCTION_ASSETS:
        target = artifact / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((source / name).read_bytes())
    css = artifact / contract.CONSENT_STYLESHEET_PATH
    # Byte fixture only: real CSS semantic/minifier regressions live in trusted-build.
    css.write_bytes(b"".join(css.read_bytes().split()))
    compiled = {name: (artifact / name).read_bytes() for name in contract.PRODUCTION_ASSETS}
    sources = {name: (source / name).read_bytes() for name in contract.PRODUCTION_ASSETS}
    assert compiled[contract.CONSENT_STYLESHEET_PATH] != sources[contract.CONSENT_STYLESHEET_PATH]
    assert contract.validate_source(artifact), "artifact is not a valid source tree"

    def run(deployed, production_root=None):
        argv = ["google_measurement_contract.py", "--root", str(source),
                "--base-url", "https://fixture.invalid", "--revision", "fixture",
                "--attempts", "1", "--delay", "0"]
        if production_root is not None:
            argv.extend(["--production-root", str(production_root)])
        output = io.StringIO()
        with patch.object(sys, "argv", argv), patch.object(
            contract, "fetch_live", side_effect=lambda base, name, revision, attempt: deployed[name]
        ) as fetch, redirect_stdout(output), redirect_stderr(output):
            status = contract.main()
        return status, output.getvalue(), fetch.call_count

    status, output, calls = run(compiled, artifact)
    assert status == 0 and calls == len(compiled), output
    assert f"production={artifact.resolve()}" in output, output

    # Artifact bytes can never stand in for semantic source validation.
    source_css = source / contract.CONSENT_STYLESHEET_PATH
    original = source_css.read_bytes()
    source_css.write_bytes(b".invalid-source {}")
    try:
        status, output, calls = run(compiled, artifact)
        assert status == 1 and calls == 0 and "contrato visual/accesible" in output, output
    finally:
        source_css.write_bytes(original)

    # Source bytes on the server are stale when the expected artifact is compiled.
    status, output, _ = run(sources, artifact)
    assert status == 1 and "distinto al artefacto esperado" in output, output
    for name in contract.PRODUCTION_ASSETS:
        tampered = {**compiled, name: compiled[name] + b"\n"}
        status, output, _ = run(tampered, artifact)
        assert status == 1 and name in output and "distinto al artefacto esperado" in output, output

    for production_root in (None, source):
        status, output, calls = run(sources, production_root)
        assert status == 0 and calls == len(sources), output

    for name in contract.PRODUCTION_ASSETS:
        asset = artifact / name
        asset.unlink()
        try:
            status, output, _ = run(compiled, artifact)
            assert status == 1 and name in output and "activo productivo esperado" in output, output
        finally:
            asset.write_bytes(compiled[name])
    print("Google production roots: PASS (source semantics; exact compiled bytes; rejected source/tampered/missing assets; legacy defaults)")


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
        reject("account page added to measurement", contract.BOOTSTRAP_PATH, lambda text: text.replace('const PUBLIC_MARKETING_PATHS = new Set([', 'const PUBLIC_MARKETING_PATHS = new Set(["/login",'), "exactamente a las seis rutas comerciales")
        reject("duplicate classic tag", "seo/impresoras.html", lambda text: text.replace(contract.SCRIPT_TAG, contract.SCRIPT_TAG * 2), "encontrado 2", legacy)
        verify_production_roots(modern, root)
        print(f"Google wiring contract: PASS (2 wiring modes + {len(checks)} rejected mutations)")


if __name__ == "__main__":
    main()
