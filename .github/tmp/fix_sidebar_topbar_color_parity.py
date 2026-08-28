from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def append_once(path: str, marker: str, block: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if block.strip() in text:
        return
    if marker not in text:
        raise SystemExit(f"marker not found in {path}: {marker!r}")
    file.write_text(text.replace(marker, marker + block, 1), encoding="utf-8")

# Shared dark source of truth.
replace_once(
    "src/css/tokens/variables.css",
    "  --white: #ffffff;\n  --black: #000000;\n",
    "  --white: #ffffff;\n  --black: #000000;\n\n  /* Private chrome · single surface authority */\n  --chrome-primary-bg: #171717;\n",
)
replace_once(
    "src/css/tokens/variables.css",
    "  --sidebar-bg: var(--graphite-400);",
    "  --sidebar-bg: var(--chrome-primary-bg);",
)
replace_once(
    "src/css/tokens/variables.css",
    "  --topbar-bg: rgba(var(--graphite-rgb-500), .92);",
    "  --topbar-bg: var(--chrome-primary-bg);",
)

# Shared light source of truth.
replace_once(
    "src/css/tokens/light.css",
    "  --light-400: #d1d1d1;\n",
    "  --light-400: #d1d1d1;\n\n  /* Private chrome · same surface for Sidebar + Topbar */\n  --chrome-primary-bg: #f9f9f9;\n",
)
replace_once(
    "src/css/tokens/light.css",
    "  --sidebar-bg: #ffffff;\n  --sidebar-bg-strong: #ffffff;",
    "  --sidebar-bg: var(--chrome-primary-bg);\n  --sidebar-bg-strong: var(--chrome-primary-bg);",
)
replace_once(
    "src/css/tokens/light.css",
    "  --topbar-bg:\n    linear-gradient(180deg, rgba(255,255,255,.88), rgba(245,245,245,.70)),\n    rgba(255,255,255,.82);",
    "  --topbar-bg: var(--chrome-primary-bg);",
)

# Sidebar base + executive consume the same token.
replace_once(
    "src/css/layout/sidebar.css",
    "  --sb-bg:\n    var(--sidebar-bg, #242424);",
    "  --sb-bg:\n    var(--sidebar-bg, var(--chrome-primary-bg, #171717));",
)
replace_once(
    "src/css/layout/sidebar.css",
    "  --sb-bg: #fff;",
    "  --sb-bg: var(--chrome-primary-bg, #f9f9f9);",
)
replace_once(
    "src/css/layout/sidebar.executive.css",
    "  --sb-bg: #171717;",
    "  --sb-bg: var(--chrome-primary-bg, #171717);",
)
replace_once(
    "src/css/layout/sidebar.executive.css",
    "  --sb-bg: #f9f9f9;",
    "  --sb-bg: var(--chrome-primary-bg, #f9f9f9);",
)

# Topbar base is solid from first paint; executive uses the same token.
replace_once(
    "src/css/layout/topbar.css",
    "  --topbar-local-bg-solid: #242424;\n  --topbar-local-bg-glass: rgba(36, 36, 36, .84);",
    "  --topbar-local-bg-solid: var(--chrome-primary-bg, #171717);\n  --topbar-local-bg-glass: var(--chrome-primary-bg, #171717);",
)
replace_once(
    "src/css/layout/topbar.css",
    "  --topbar-local-bg-solid: #fff;\n  --topbar-local-bg-glass:\n    rgba(255, 255, 255, .86);",
    "  --topbar-local-bg-solid: var(--chrome-primary-bg, #f9f9f9);\n  --topbar-local-bg-glass: var(--chrome-primary-bg, #f9f9f9);",
)
old_background = '''  background:\n    linear-gradient(\n      180deg,\n      color-mix(\n        in srgb,\n        var(--topbar-local-bg-solid) 92%,\n        transparent\n      ),\n      color-mix(\n        in srgb,\n        var(--topbar-local-bg-solid) 78%,\n        transparent\n      )\n    ),\n    var(--topbar-local-bg-glass);'''
replace_once(
    "src/css/layout/topbar.css",
    old_background,
    "  background: var(--topbar-local-bg-solid);",
)
replace_once(
    "src/css/layout/topbar.css",
    "  pointer-events: none;\n\n  background:\n    radial-gradient(",
    "  pointer-events: none;\n  display: none;\n\n  background:\n    radial-gradient(",
)
replace_once(
    "src/css/layout/topbar.executive.css",
    "  --tbx-bg: #242424;",
    "  --tbx-bg: var(--chrome-primary-bg, #171717);",
)
replace_once(
    "src/css/layout/topbar.executive.css",
    "  --tbx-bg: #fff;",
    "  --tbx-bg: var(--chrome-primary-bg, #f9f9f9);",
)

# CI contract: never allow Sidebar and Topbar to drift again.
contract_block = r'''

/* Private chrome visual parity: Sidebar and Topbar share one surface token. */
const [variablesCss, lightCss, sidebarCss, sidebarExecutiveCss, topbarCss, topbarExecutiveCss] = await Promise.all([
  readFile("src/css/tokens/variables.css", "utf8"),
  readFile("src/css/tokens/light.css", "utf8"),
  readFile("src/css/layout/sidebar.css", "utf8"),
  readFile("src/css/layout/sidebar.executive.css", "utf8"),
  readFile("src/css/layout/topbar.css", "utf8"),
  readFile("src/css/layout/topbar.executive.css", "utf8"),
]);

assert.match(variablesCss, /--chrome-primary-bg:\s*#171717;/, "Dark chrome surface must have one source of truth");
assert.match(lightCss, /--chrome-primary-bg:\s*#f9f9f9;/, "Light chrome surface must have one source of truth");
assert.match(variablesCss, /--sidebar-bg:\s*var\(--chrome-primary-bg\);/, "Sidebar token must consume chrome surface");
assert.match(variablesCss, /--topbar-bg:\s*var\(--chrome-primary-bg\);/, "Topbar token must consume chrome surface");
assert.match(sidebarExecutiveCss, /--sb-bg:\s*var\(--chrome-primary-bg,\s*#171717\);/, "Sidebar executive must consume shared dark surface");
assert.match(topbarExecutiveCss, /--tbx-bg:\s*var\(--chrome-primary-bg,\s*#171717\);/, "Topbar executive must consume shared dark surface");
assert.match(sidebarCss, /--sb-bg:\s*var\(--chrome-primary-bg,\s*#f9f9f9\);/, "Sidebar light base must consume shared surface");
assert.match(topbarCss, /--topbar-local-bg-solid:\s*var\(--chrome-primary-bg,\s*#f9f9f9\);/, "Topbar light base must consume shared surface");
assert.match(topbarCss, /background:\s*var\(--topbar-local-bg-solid\);/, "Topbar base must be solid so first paint matches Sidebar");
'''

shell_contract = Path(".github/scripts/shell_runtime_contract.mjs")
text = shell_contract.read_text(encoding="utf-8")
if "Private chrome visual parity" not in text:
    shell_contract.write_text(text + contract_block, encoding="utf-8")
