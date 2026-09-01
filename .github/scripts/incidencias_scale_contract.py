#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"INCIDENCIAS_SCALE_CONTRACT: {message}")


core = read("src/core/config.js")
boundary = read("src/views/incidencias/index.js")
controller = read("src/views/incidencias/index.impl.js")
api = read("src/views/incidencias/incidencias.api.impl.js")
facets = read("src/views/incidencias/incidencias.filter-facets.js")
template = read("src/views/incidencias/incidencias.template.js")
styles = read("src/css/views/incidencias/index.css")

require(
    'import * as Impl from "./index.impl.js"' in boundary
    and "Impl.IncidenciasView(host, context)" in boundary,
    "stable Incidencias boundary must delegate to the full controller implementation",
)
require(
    'CANONICAL_PRODUCTION_API_BASE = "https://api.onionsupport.com"' in core,
    "frontend canonical API must be api.onionsupport.com",
)

runtime = "\n".join(
    path.read_text(encoding="utf-8")
    for path in (ROOT / "src").rglob("*.js")
)
legacy_api_domain = "api." + "onionit" + "." + "net"
require(
    legacy_api_domain not in runtime.lower(),
    "legacy API domain must not exist in frontend runtime",
)

require(
    'REFRESH: "refresh"' in template,
    "retry/refresh action must be declared",
)
require(
    "remoteHasMore" in template and "nextCursor" in template,
    "template must understand remote cursor pagination",
)
require(
    'data-incidencias-infinite-sentinel="true"' in template,
    "template must expose a continuous-scroll sentinel",
)
require(
    'aria-live="polite"' in template and "incrementalError" in template,
    "continuous loading and incremental failures must be announced accessibly",
)
refresh_overlay = template[
    template.index("function renderRefreshOverlay") : template.index("function renderEmpty")
]
require(
    'aria-live="polite"' not in refresh_overlay
    and 'aria-hidden="true"' in refresh_overlay,
    "the visual refresh overlay must not create a second live region",
)
pending_footer = template[
    template.index("if (vm.listQueryPending || vm.refreshing)") : template.index(
        "if (vm.incrementalError"
    )
]
require(
    "listQueryPending: d.listQueryPending === true" in template
    and "if (vm.listQueryPending || vm.refreshing)" in template
    and "vm.loadingMore || vm.listQueryPending" in template
    and 'class="incidencias-visually-hidden" role="status" aria-live="polite"' in template
    and 'aria-live="polite"' in pending_footer
    and 'data-incidencias-infinite-sentinel="true"' not in pending_footer,
    "pending first-page queries must use one busy live state without an idle sentinel",
)
require(
    "RETRY_INCREMENTAL" in template and "incidencias-infinite-retry" in template,
    "only failed incremental loads may expose a retry control",
)

manual_pagination_markers = (
    "Mostrar más",
    "Cargar más",
    "Ver más",
    "Load more",
    "incidencias-load-more-btn",
    'LOAD_MORE: "load-more"',
)
for marker in manual_pagination_markers:
    require(
        marker not in template and marker not in styles,
        f"manual pagination marker must not exist: {marker}",
    )

require(
    ".incidencias-infinite" in styles
    and ".incidencias-infinite-error" in styles
    and ".incidencias-infinite-retry" in styles,
    "continuous-scroll idle/loading/error styles must exist",
)

require(
    "loadIncidenciasPage" in controller,
    "controller must use the cache-neutral page loader",
)
require(
    'pageMode: "cursor"' in controller,
    "controller must request cursor pagination",
)
require(
    "nextCursor" in controller,
    "controller must retain the opaque next-page cursor",
)
require(
    "event.isComposing || listSearchComposing" in controller
    and '"compositionstart",\n      onCompositionStart' in controller
    and '"compositionend",\n      onCompositionEnd' in controller,
    "search must wait for IME composition to finish",
)
require(
    "new window.IntersectionObserver" in controller
    and 'INFINITE_ROOT_MARGIN = "900px 0px 900px 0px"' in controller
    and "root: getInfiniteScrollRoot()" in controller
    and 'document.getElementById("main-content")' in controller
    and 'document.querySelector(".main-content")' in controller,
    "continuous pagination must observe against the real main scroll host with prefetch margin",
)
require(
    "disconnectInfiniteObserver" in controller
    and "const observer = new window.IntersectionObserver" in controller
    and "infiniteObserver !== observer" in controller
    and "observer.takeRecords?.()" in controller
    and "observer.observe(sentinel)" in controller
    and '"incidencias-controller-destroyed"' in controller,
    "the observer must discard stale records, verify identity, and disconnect on destroy",
)
require(
    "background &&\n        sameContext &&\n        hasItems" in controller
    and "mergeTicketPage(items, responseItems)" in controller
    and "autoRefreshRunning = false;\n      syncInfiniteObserver();" in controller
    and "Boolean(incrementalError) ||\n      creating" in controller,
    "same-context background revalidation must preserve pages, retry state, and observation",
)
require(
    "loadingMore" in controller
    and "loadMoreSeq" in controller
    and "mergeTicketPage" in controller
    and "INCIDENCIAS_CURSOR_DID_NOT_ADVANCE" in controller,
    "incremental loading must reject duplicates, races, and non-advancing cursors",
)
require(
    "const seenCursors = new Set()" in controller
    and "resetCursorHistory(nextCursor)" in controller
    and "seenCursors.has(responseCursor)" in controller
    and "INCIDENCIAS_CURSOR_CYCLE" in controller,
    "cursor history must reset per first-page query and reject A-B-A cycles",
)
require(
    "countNewTicketIds(responseItems) === 0" in controller
    and "INCIDENCIAS_PAGE_WITHOUT_ID_PROGRESS" in controller,
    "an advancing cursor without new stable IDs must stop automatic pagination",
)
require(
    "incrementalError = safeError(" in controller
    and "error = safeError(pageError" not in controller,
    "next-page failure must stay separate from the general first-page error",
)
require(
    "getListFilterQuery" in controller
    and "getIncidenciasFacetFilterQuery" in controller
    and "getListPageQuery()" in controller
    and "getListPageQuery({ cursor })" in controller
    and 'if (filter === "open") return { closed: false };' in facets
    and 'if (filter === "closed") return { closed: true };' in facets
    and 'if (filter === "urgent") return { priority: "high" };' in facets,
    "first and subsequent cursor pages must share the canonical production facet query",
)
require(
    "filterFacetCache" in controller
    and "filterFacetSearchKey" in controller
    and "getIncidenciasFacetRequestQuery" in controller
    and "loadIncidenciasPage({" in controller
    and "cacheNeutralPageQueries: true" in facets
    and "searchDefinesFacetUniverse: true" in facets,
    "facet totals must be cache-neutral, search-scoped, and independent of the selected facet",
)
require(
    "restartListQuery" in controller
    and '"incidencias-filter-query-changed"' in controller
    and "return setFilter(stat);" in controller
    and '"incidencias-search-query-restored"' in controller
    and "cancelledPendingSearch" in controller
    and "nextServerSearch" in controller,
    "filter changes must invalidate the old cursor and request a new first page",
)
require(
    "let itemsContextKey" in controller
    and "const requestContextKey" in controller
    and "const sameContext" in controller
    and "if (!sameContext)" in controller
    and 'items = [];\n      total = 0;\n      nextCursor = "";' in controller
    and "itemsContextKey =\n          requestContextKey;" in controller,
    "a semantic query change must release rows owned by the previous context before requesting page one",
)
search_debounce = controller[
    controller.index("listSearchTimer = window.setTimeout") : controller.index(
        "function setFilter"
    )
]
require(
    "listQueryPending = true;" in search_debounce,
    "a queued server search must expose a busy state before its first-page request starts",
)
require(
    "getListServerContextKey" in controller
    and "function toggleSortOrder" in controller
    and "node?.dataset?.sortMode" in controller
    and "nextServerContext !==\n      currentServerContext" in controller
    and 'data-incidencias-action="${INCIDENCIAS_ACTIONS.SORT_TOGGLE}" data-sort-mode="date"' in template
    and 'data-filter="date"' not in template
    and "const queryChanged = nextFilter !== filter" not in controller,
    "date sorting must remain orthogonal to the server filter and respect the remote sort lock",
)
require(
    "Boolean(nextCursor && filtered.length)" in template
    and "(list.filteredTotal > 0 && nextCursor)" in controller,
    "an empty filtered result must not drain remote cursor pages automatically",
)
require(
    "captureListFocus" in controller
    and "restoreListFocus" in controller
    and "listTicketIdForNode" in controller
    and '"stats",\n        ".incidencias-stats"' in controller
    and '"filters",\n        ".incidencias-filter-pills"' in controller
    and '"sort",\n        ".incidencias-sort-pills"' in controller
    and "snapshot.filter" in controller
    and "snapshot.sortMode" in controller
    and "snapshot.scope" in controller
    and "snapshot.index" in controller
    and "preventScroll: true" in controller
    and 'data-incidencias-focus-fallback="true"' in template,
    "list patching must restore exact row/stat/filter/sort focus by stable identity and scope",
)
require(
    'role="alert" aria-live="assertive" aria-atomic="true"' in template
    and 'aria-labelledby="incidencias-fatal-error-title"' in template
    and 'aria-describedby="incidencias-fatal-error-text"' in template
    and "renderLoading({\n          focusSnapshot:" in controller
    and "renderError(\n        error,\n        {\n          focusSnapshot:" in controller
    and "cancelScheduledRender();\n    const focusSnapshot" in controller
    and "const shouldFocusFatalError" in controller
    and "fatalFocusSnapshot" in controller,
    "fatal first-page failures and their retries must be announced and retain a reasonable focus target",
)
require(
    "listQueryPending" in controller
    and "isListSortLocked" in controller
    and "listQueryPending = false;\n      loadController = null;\n\n      render(" in controller
    and "sortLocked" in template
    and 'disabled aria-disabled="true"' in template
    and ".incidencias-sort-pill:disabled" in styles,
    "local sorting must remain disabled while a cursor or first-page query is active",
)
require(
    "LIST_SEARCH_DEBOUNCE_MS" in controller and "serverSearch" in controller,
    "large-history search must be server-backed and debounced",
)
require(
    "Math.max(INCIDENCIAS_CACHE_TTL_MS * 3, 180000)" in controller,
    "autorefresh floor must be 180 seconds to avoid request herds",
)

require(
    "export async function loadIncidenciasPage" in api,
    "API layer must expose cache-neutral cursor page loading",
)
require(
    'INCIDENCIAS_LIST_RESPONSE_CONTRACT = "v2"' in api
    and "responseContract: INCIDENCIAS_LIST_RESPONSE_CONTRACT" in api
    and '"responseContract",' in api,
    "canonical list queries must request v2 while retaining an explicit v1 override",
)
require(
    "export function normalizeIncidenciasListResponse" in api
    and "normalizeIncidenciasListResponse(response" in api
    and "INCIDENCIAS_LIST_V2_ITEMS_REQUIRED" in api,
    "page and cached list loaders must share the strict v2 envelope parser",
)
require(
    "object?.hasMore === true" in api
    and "Boolean(nextCursor)" in api
    and "pagination.total === null" in api,
    "cursor continuation and unknown totals must remain type-strict",
)
require(
    "INCIDENCIAS_DETAIL_CACHE_MAX_ENTRIES" in api,
    "detail cache must have an explicit capacity bound",
)
require(
    "pruneDetailCache" in api,
    "detail cache must evict old entries",
)

print(
    "Incidencias scale contract OK · canonical API · continuous cursor scroll · "
    "cycle/progress guards · stable focus/sort · exact search facets · bounded detail cache"
)
