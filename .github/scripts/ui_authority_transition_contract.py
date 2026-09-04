#!/usr/bin/env python3
"""Exercise the trusted-base gate against old and migrated CSS candidates."""

import importlib.util
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location(
    "repo_integrity", Path(__file__).with_name("repo_integrity.py")
)
integrity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(integrity)


def verify(parity):
    errors = []
    integrity.validate_loading_authority_transition(parity, errors)
    return errors


with tempfile.TemporaryDirectory(prefix="onion-ui-authority-") as folder:
    root = Path(folder)
    integrity.ROOT = root
    integrity.SRC = root / "src"
    css = root / "src/css"
    (css / "components").mkdir(parents=True)
    (root / ".github/ci").mkdir(parents=True)
    legacy = ".placeholder { animation: private-admin-shimmer 1s linear infinite; } @keyframes private-admin-shimmer { to { opacity: 1; } }"
    assert not verify(legacy), "The existing main must remain valid before activation"
    assert verify("/* " + legacy + " */"), "Comments must not satisfy the legacy contract"
    assert verify(""), "Removing the old authority without opting into the new one must fail"

    marker = root / ".github/ci/ui-authorities-v1"
    marker.write_text("onion-ui-authorities.v1\n")
    assert verify(""), "An activation marker alone cannot bypass the CSS authority"
    (css / "app.css").write_text('@import url("./components/skeleton.css") layer(loading);')
    authority = css / "components/skeleton.css"
    authority.write_text("@keyframes ui-skeleton-shimmer { to { opacity: 1; } } @keyframes ui-loading-spin { to { transform: rotate(1turn); } }")
    assert not verify(""), "The migrated canonical authority must pass"
    authority.write_text("/* " + authority.read_text() + " */")
    assert verify(""), "Commented canonical keyframes cannot satisfy the new contract"
    authority.write_text("@keyframes ui-skeleton-shimmer {} @keyframes ui-loading-spin {}")

    duplicate = css / "duplicate.css"
    for name in ("private-admin-shimmer", "home-skeleton", "uiShimmer", "inc-create-spin", "facturas-detail-spin"):
        duplicate.write_text("@keyframes " + name + " { to { opacity: 1; } }")
        assert verify(""), "Duplicate animation must fail: " + name
    duplicate.unlink()
    marker.write_text("unknown-version")
    assert verify(""), "Unknown versions cannot silently change the contract"

print("UI authority transition OK · old main accepted · explicit activation · duplicate/comment bypass rejected")
