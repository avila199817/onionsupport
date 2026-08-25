#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"CLIENTES_SCALE_CONTRACT: {message}")


api = read("src/views/clientes/clientes.api.js")
controller = read("src/views/clientes/index.js")
template = read("src/views/clientes/clientes.template.js")
legacy_controller = read("src/views/clientes/clientes.index.legacy.js")

require(
    'CLIENTES_PAGE_ENDPOINT = "/api/clientes/page"' in api,
    "list adapter must target /api/clientes/page",
)
require(
    "export async function fetchClientesPage" in api,
    "API layer must expose a cache-neutral cursor page loader",
)
for token in ("query.q", "filter,", "order,", "query.cursor"):
    require(
        token in api,
        f"page adapter must propagate {token}",
    )
require(
    "noAutomaticPageDrain: true" in api and "noLegacyDatasetCache: true" in api,
    "page adapter must not drain all pages or revive the full-dataset cache",
)
require(
    "hydrateClientesFromCache" in api and "items: []" in api and "totalKnown: false" in api,
    "legacy list cache must be an explicit miss under cursor pagination",
)

require(
    "fetchClientesPage" in controller,
    "controller must use the cursor page adapter",
)
require(
    "new AbortController()" in controller
    and "requestSeq" in controller
    and "queryVersion" in controller,
    "controller must combine AbortController with stale-response sequencing",
)
require(
    "hasMore !== true || !nextCursor" in controller
    and "requestPage({ append: true })" in controller,
    "load more must require and propagate the opaque server cursor",
)
require(
    "CLIENTES_CURSOR_CONTEXT_MISMATCH" in controller
    and "CLIENTES_CURSOR_INVALID" in controller
    and "clientes:cursor-reset" in controller,
    "cursor context errors must reset safely instead of mixing result sets",
)
require(
    "SEARCH_DEBOUNCE_MS = 220" in controller
    and "void setSearch(value)" in controller
    and "resetAndLoad()" in controller,
    "search must remain debounced and restart server pagination",
)
require(
    "visibleLimit" not in controller,
    "main Clientes controller must not simulate pagination with visibleLimit",
)
require(
    "hydrateClientesFromCache" not in controller,
    "main Clientes controller must not hydrate the former complete-dataset cache",
)
require(
    "exportCsv" in controller
    and "no descarga páginas adicionales" in controller,
    "CSV export must explicitly cover loaded records only",
)

require(
    "data-clientes-action=\"${CLIENTES_ACTIONS.LOAD_MORE}\"" in template,
    "template must expose a real load-more action",
)
require(
    "vm.hasMore" in template and "vm.nextCursor" not in template,
    "template load-more state must come from controller/backend state",
)
require(
    "registros cargados" in template.lower()
    and "totalKnown" in template,
    "template must label page-local values and avoid invented global totals",
)
require(
    "visibleLimit" not in template,
    "template must not slice the server-backed result set",
)

require(
    'from "./clientes.api.js"' in legacy_controller,
    "creation bridge must route any compatibility list read through the new page adapter",
)

print(
    "Clientes scale contract OK · cursor pages · server query · abort/sequence · "
    "safe cursor reset · no legacy dataset cache · loaded-only CSV/stats"
)
