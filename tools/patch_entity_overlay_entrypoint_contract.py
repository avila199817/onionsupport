#!/usr/bin/env python3

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / ".github/scripts/app_entrypoint_integrity.py"

old = '''    require(
        errors,
        "observer.observe(root" in deeplink
        and "observer.observe(document.documentElement" not in deeplink,
        "ticket-deeplink debe observar sólo el Router view",
    )
'''

new = '''    deeplink_is_legacy_scoped = (
        "observer.observe(root" in deeplink
        and "observer.observe(document.documentElement" not in deeplink
    )
    deeplink_is_global_intent = (
        'strategy: "global-entity-intent"' in deeplink
        and 'url.searchParams.set("entity", ENTITY_TYPE)' in deeplink
        and 'url.searchParams.set("entityId", ticketId)' in deeplink
        and ".click()" not in deeplink
        and "MutationObserver" not in deeplink
        and "observer.observe(" not in deeplink
    )
    require(
        errors,
        deeplink_is_legacy_scoped or deeplink_is_global_intent,
        "ticket-deeplink debe limitarse al Router view o expresar sólo una intención global de entidad",
    )
'''

text = TARGET.read_text(encoding="utf-8")

if new not in text:
    if text.count(old) != 1:
        raise SystemExit("app_entrypoint_integrity: deeplink contract anchor not found exactly once")
    text = text.replace(old, new, 1)
    TARGET.write_text(text, encoding="utf-8")

for relative in (
    ".github/workflows/tmp-entrypoint-contract-fix.yml",
    "tools/patch_entity_overlay_entrypoint_contract.py",
):
    (ROOT / relative).unlink(missing_ok=True)

print("App entrypoint contract aligned with global entity intents")
