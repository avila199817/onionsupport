#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"CLIENTES_SCALE_CONTRACT: {message}")


api = read("src/views/clientes/clientes.api.js")
api_compat = read("src/views/clientes/clientes.api.legacy.js")
model = read("src/views/clientes/clientes.model.js")
controller = read("src/views/clientes/index.js")
create_controller = read("src/views/clientes/clientes.create-controller.js")
template = read("src/views/clientes/clientes.template.js")
template_compat = read("src/views/clientes/clientes.template.legacy.js")
style = read("src/css/views/clientes/index.css")
status_style = read("src/css/components/status-system.css")
legacy_controller = read("src/views/clientes/clientes.index.legacy.js")

# ---------------------------------------------------------------------------
# SINGLE AUTHORITIES: one model, one HTTP adapter, one create controller.
# Compatibility files may re-export/delegate only; they must not own logic.
# ---------------------------------------------------------------------------
require(
    'from "./clientes.model.js"' in api
    and "CLIENTES_MODEL_VERSION" in api
    and "singleModelAuthority: true" in api
    and "singleHttpAuthority: true" in api,
    "canonical API must consume the single Clientes model authority",
)
require(
    "CLIENTES_MODEL_VERSION" in model
    and "export function normalizeClienteModel" in model
    and "export function normalizeClientesCollection" in model
    and "export function statusBucket" in model
    and "Http." not in model
    and "document." not in model
    and "window." not in model,
    "clientes.model.js must be the pure model authority",
)
require(
    'export * from "./clientes.api.js";' in api_compat
    and 'export { default } from "./clientes.api.js";' in api_compat
    and "Http." not in api_compat
    and "normalizeClienteModel(" not in api_compat,
    "legacy API path must be a zero-logic facade over the canonical API",
)
require(
    'export * from "./clientes.model.js";' in template_compat
    and 'export { default } from "./clientes.model.js";' in template_compat
    and "renderClientesTemplate" not in template_compat,
    "legacy template path must be a zero-logic facade over the canonical model",
)
require(
    "createClientesCreateController" in create_controller
    and "createModalLifecycle" in create_controller
    and "fetchUsuariosRequest" in create_controller
    and "createClienteRequest" in create_controller
    and "loadClienteDetailRequest" in create_controller
    and "fetchClientesPage" not in create_controller
    and "IntersectionObserver" not in create_controller,
    "Clientes Create must be a create-only controller using shared modal lifecycle and canonical API",
)
require(
    "COMPAT ONLY · NO SECOND CLIENTES VIEW" in legacy_controller
    and 'from "./clientes.api.js"' in legacy_controller
    and 'from "./clientes.create-controller.js"' in legacy_controller
    and "fetchClientesPage" not in legacy_controller
    and "IntersectionObserver" not in legacy_controller
    and "visibleLimit" not in legacy_controller,
    "legacy index path must be a thin compatibility facade, never a second listing controller",
)

# ---------------------------------------------------------------------------
# LIST API / CURSOR SCALE CONTRACT.
# ---------------------------------------------------------------------------
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
    "hasMore !== true" in controller
    and "!nextCursor" in controller
    and "requestPage({ append: true })" in controller,
    "next-page loading must require and propagate the opaque server cursor",
)
require(
    "INFINITE_ROOT_MARGIN" in controller
    and "new window.IntersectionObserver" in controller
    and "data-clientes-infinite-sentinel='true'" in controller
    and 'document.getElementById("main-content")' in controller
    and "root: scrollRoot" in controller
    and "disconnectInfiniteObserver" in controller,
    "controller must own a disposable observer rooted in the application scroller",
)
require(
    "observer.takeRecords?.()" in controller
    and "infiniteObserver !== observer" in controller,
    "queued callbacks from a disconnected observer must not load stale pages",
)
require(
    "loadMoreError" in controller
    and "Boolean(loadMoreError)" in controller,
    "failed continuation pages must stop automatic retries",
)
require(
    "seenPageCursors" in controller
    and "CLIENTES_CURSOR_DID_NOT_ADVANCE" in controller
    and "CLIENTES_PAGE_DID_NOT_ADVANCE" in controller
    and "mergedItems.length <= items.length" in controller,
    "cursor cycles and duplicate-only continuation pages must stop safely",
)
require(
    "CLIENTES_CURSOR_CONTEXT_MISMATCH" in controller
    and "CLIENTES_CURSOR_INVALID" in controller
    and "clientes:cursor-reset" in controller,
    "cursor context errors must reset safely instead of mixing result sets",
)
require(
    "SEARCH_DEBOUNCE_MS = 220" in controller
    and "let searchDraft" in controller
    and "let searchContextDirty" in controller
    and "readLiveSearchDraft" in controller
    and "commitSearchDraft" in controller
    and "const rawDraft = String(readLiveSearchDraft()" in controller
    and "searchDraft = rawDraft" in controller
    and "invalidateForSearchDraft" in controller
    and "searchPending: Boolean(searchTimer) || searchContextDirty" in controller
    and "void setSearch(searchDraft)" in controller
    and "resetAndLoad()" in controller
    and "function clearSearchTimer()" in controller
    and "Boolean(searchTimer)" in controller
    and "disconnectInfiniteObserver();\n    abortList(\"clientes-search-draft-changed\")" in controller
    and "function reflectSearchPendingState()" in controller
    and "reflectSearchPendingState();" in controller
    and "data-search-pending" in controller
    and "clientes-history-results" in controller
    and "pendingSearch || searchChanged || filterChanged" in controller
    and "pendingSearch || searchChanged || sortChanged" in controller,
    "search drafts must invalidate old continuation work and commit before filters/order",
)
require(
    "function attrExact" in template
    and "attrExact(vm.searchDraft)" in template
    and "search: cleanText(data.search" in template,
    "the visible search draft must preserve spaces independently from the API query",
)
require(
    "event.isComposing || searchComposing" in controller
    and 'addEventListener("compositionstart", handleCompositionStart)' in controller
    and 'addEventListener("compositionend", handleCompositionEnd)' in controller,
    "search debounce must wait for IME composition to finish",
)
require(
    "if (!key || seen.has(key)) continue;" in controller
    and "if (!key || seen.has(key)) continue;" in api,
    "rows without a stable ID must not count as pagination progress",
)
require(
    "Boolean(searchTimer) ||\n        searchContextDirty" in controller
    and "searchTimer ||\n      searchContextDirty" in controller,
    "observer and programmatic continuation must pause for a pending search draft",
)
require(
    "mergeFreshPageWithLoaded" in controller
    and "preservePages = false" in controller
    and "preservedLoadMoreError" in controller
    and 'if (!append) {\n      loadMoreError = "";\n      error = "";\n    }' in controller
    and "mergeFreshReconciliationPage([], incoming, existing).visibleItems" in controller
    and "preservePages: items.length > 0" in controller,
    "refresh/create revalidation must retain visible rows and enter an unambiguous busy retry state",
)
require(
    "mergeFreshReconciliationPage" in controller
    and "let freshReconciliationItems = null" in controller
    and "preservedFreshReconciliationItems" in controller
    and "startFreshReconciliation" in controller
    and "preserveLoadedPages && responseHasMore" in controller
    and "reconciliationPage.visibleItems" in controller
    and "reconciliationPage.freshItems" in controller
    and "!reconciliationPage.progressed" in controller
    and "freshReconciliationItems = responseHasMore" in controller
    and "freshReconciliationItems = appendUnique([], pageItems)" in controller
    and "responseHasMore && responseCursor ? [responseCursor] : []" in controller
    and 'nextCursor = responseHasMore ? responseCursor : ""' in controller
    and "preserveContinuation" not in controller
    and "freshReconciliationItems = null;\n    error = \"\";" in controller,
    "every preserved revalidation must use the fresh cursor chain, retain visible rows, and prune only at its confirmed end",
)
require(
    "responseHasMore &&\n        normalizedPageItems.length === 0" in controller
    and "CLIENTES_PAGE_DID_NOT_ADVANCE" in controller
    and "Boolean(error) ||" in controller,
    "an empty continuable first page must stop with a retryable contract error",
)
require(
    "captureFocusState" in controller
    and "restoreFocusState" in controller
    and "clientId" in controller
    and "scrollTop" in controller
    and "controlKind" in controller
    and "state.filter" in controller
    and "state.action === CLIENTES_ACTIONS.CLEAR_SEARCH" in controller
    and "state.action === CLIENTES_ACTIONS.CLEAR_FILTERS" in controller
    and "CLIENTES_ACTIONS.RETRY_PAGE, CLIENTES_ACTIONS.REFRESH" in controller,
    "incremental renders must restore scroll, exact filter, search and retry focus",
)
require(
    "function number(value = 0, fallback = 0)" in controller,
    "focus and scroll restoration must use a locally defined numeric normalizer",
)
require(
    "visibleLimit" not in controller,
    "main Clientes controller must not simulate pagination with visibleLimit",
)
require(
    "void requestPage({ append: false, silent: false });" in controller
    and "await requestPage({ append: false, silent: false });" not in controller,
    "Clientes route mount must paint immediately and never await first-page network I/O",
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

# ---------------------------------------------------------------------------
# TEMPLATE / ACCESSIBILITY / INFINITE SCROLL CONTRACT.
# ---------------------------------------------------------------------------
require(
    "vm.hasMore" in template and "vm.nextCursor" not in template,
    "template continuation state must come from controller/backend state",
)
require(
    'data-clientes-infinite-sentinel="true"' in template
    and 'aria-live="polite"' in template,
    "template must expose an accessible infinite-scroll sentinel",
)
require(
    'clientes-history-subtitle" tabindex="-1" ${vm.error ? "" : \'role="status" aria-live="polite" aria-atomic="true"\'}' in template
    and "function historyStatus" in template
    and 'clientes-history-results" aria-busy=' in template
    and "vm.searchPending" in template
    and "data-search-pending=" in template
    and "!vm.refreshing && !vm.searchPending" in template
    and "!vm.error && !vm.loadMoreError" in template
    and "Preparando la búsqueda de clientes..." in template
    and "No hay clientes con esos filtros." in template
    and "Has visto todos los clientes de esta consulta" in template,
    "one scoped live status must announce non-error loading, empty and final states",
)
require(
    template.count('aria-live="polite"') == 1
    and template.count('role="status"') == 1,
    "Clientes template must contain exactly one small live region",
)
require(
    'data-clientes-fatal-error="true" role="alert" aria-atomic="true" tabindex="-1"' in template
    and 'class="clientes-inline-error" role="alert" aria-atomic="true"' in template
    and "clientes-inline-retry" in template
    and "Actualización detenida. Reintenta para continuar." in template
    and 'root?.querySelector?.(\n              "[data-clientes-fatal-error=\'true\']"' in controller
    and ".clientes-fatal-error:focus-visible" in style,
    "fatal and preserved-page errors must be announced, focusable and retryable",
)
require(
    'RETRY_PAGE: "retry-page"' in template
    and "vm.loadMoreError" in template,
    "a failed continuation page must offer an explicit retry state",
)
require(
    "clientes-load-more-btn" not in template
    and "<span>Cargar más</span>" not in template,
    "template must not expose a manual continuation control",
)
require(
    'data-clientes-infinite-sentinel="true" aria-hidden="true"' in template
    and 'LOAD_MORE: "load-more"' not in template,
    "the sentinel must not expose a hidden manual continuation action",
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
    ".clientes-history-subtitle:focus-visible" in style
    and "outline: 2px solid CanvasText" in style,
    "the stable live-status focus target must remain visible in forced colors",
)

# ---------------------------------------------------------------------------
# SHARED PRIVATE VISUAL AUTHORITIES.
# ---------------------------------------------------------------------------
for forbidden in (
    ".clientes-chip--active {",
    ".clientes-chip--pending {",
    ".clientes-chip--blocked {",
    ".clientes-chip-dot {",
):
    require(
        forbidden not in style,
        f"Clientes route CSS must not repaint shared status selector {forbidden}",
    )
for required in (
    ".clientes-chip--active",
    ".clientes-chip--pending",
    ".clientes-chip--blocked",
    ".clientes-chip-dot",
    "SINGLE STATUS PAINT AUTHORITY · SPA-WIDE",
):
    require(
        required in status_style,
        f"global status-system.css must own {required}",
    )
require(
    "Shell/listado compartido: private-admin-parity.css" in style
    and "Estados y dots: components/status-system.css" in style
    and "Avatares: components/avatar-system.css" in style,
    "Clientes route CSS must explicitly defer shared shell/status/avatar paint",
)

print(
    "Clientes scale contract OK · one model/API/create authority · shared status paint · "
    "cursor pages · server query · abort/sequence · continuous scroll · loaded-only CSV/stats"
)
