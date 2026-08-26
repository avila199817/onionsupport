#!/usr/bin/env python3
"""Static contract for cursor-first Users administration."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
INDEX = (ROOT / "src/views/usuarios/index.js").read_text(encoding="utf-8")
CURSOR = (ROOT / "src/views/usuarios/usuarios.cursor.js").read_text(encoding="utf-8")
TEMPLATE = (ROOT / "src/views/usuarios/usuarios.template.js").read_text(encoding="utf-8")
STYLE = (ROOT / "src/css/views/usuarios/index.css").read_text(encoding="utf-8")
API = (ROOT / "src/views/usuarios/usuarios.api.js").read_text(encoding="utf-8")

errors: list[str] = []

def require(source: str, snippet: str, message: str) -> None:
    if snippet not in source:
        errors.append(message)

def reject(source: str, snippet: str, message: str) -> None:
    if snippet in source:
        errors.append(message)

require(INDEX, 'from "./usuarios.cursor.js"', "Usuarios index must use cursor list client")
require(INDEX, "fetchUsuariosCursorPage", "Usuarios index must fetch cursor pages")
require(INDEX, "continuationToken", "Usuarios index must keep continuation state")
require(INDEX, "serverFiltered: true", "Usuarios index must declare server filtering")
require(INDEX, "backendPagination: true", "Usuarios index must declare backend pagination")
require(INDEX, "legacyFetchAllUsed: false", "Usuarios index must reject legacy fetch-all architecture")
require(INDEX, "localDatasetCeiling: false", "Usuarios index must declare no local dataset ceiling")
reject(INDEX, "loadUsuariosApi(", "Usuarios index must not call legacy all-pages loader")
reject(INDEX, "all: true", "Usuarios index must not request all pages")

# Route-open performance: the router awaits route.render() before committing the hidden host.
# Usuarios must paint its loading shell synchronously, then let the first page resolve in background.
require(INDEX, "void load({ silent: false });\n      return controller;", "Usuarios mount must start the first page without blocking the router commit")
reject(INDEX, "await load({ silent: false });", "Usuarios mount must never await first-page network before route commit")
reject(INDEX, "loading = true;\n      render({ preserveDom: false });\n      await load", "Usuarios mount must not perform a redundant preflight render before loadFirstPage")
require(INDEX, "routeCommitNonBlocking: true", "Usuarios snapshot must declare non-blocking route commit")

# Cursor/query races: an obsolete page must not clear or overwrite a newer page task.
require(INDEX, "const task = (async () =>", "Load-more must keep a stable task identity")
require(INDEX, "loadMoreTask = task", "Load-more task must be registered explicitly")
require(INDEX, "if (loadMoreTask === task) loadMoreTask = null", "Only the owning load-more task may clear the task pointer")
require(INDEX, "epoch !== queryEpoch", "Cursor responses must be rejected after a query epoch change")
require(INDEX, "cursor !== continuationToken", "Cursor responses must be rejected after cursor replacement")
require(INDEX, "loadMoreTaskIdentityProtected: true", "Usuarios snapshot must declare load-more identity protection")
require(INDEX, "loadMoreTask = null;\n    loadingMore = false;", "A new query must release continuation loading state")
require(INDEX, "mergeUsuariosFreshPageFirst(items, page.items)", "Fresh first-page values must refresh preserved continuation rows")
require(INDEX, "mergeUsuariosCursorItems(previousItems, freshPage)", "Fresh incoming values must win before global updatedAt ordering")
require(INDEX, "items = [];\n      continuationToken = \"\";", "A new filter/search query must not display stale rows")
require(INDEX, "loading = !keepAccumulatedPages;", "A reset query must render an explicit loading state")
require(INDEX, "return loadFirstPage({ silent: false });", "A failed first-page query must have a real retry path")

# Infinite continuation must be automatic, disposable and rooted in the real scroll container.
require(INDEX, 'USUARIOS_INFINITE_ROOT_MARGIN = "0px 0px 900px 0px"', "Usuarios must prefetch continuation pages 900px before the feed end")
require(INDEX, "new window.IntersectionObserver", "Usuarios must use IntersectionObserver for automatic continuation")
require(INDEX, 'document.getElementById("main-content")', "Usuarios observer must resolve the application scroll root")
require(INDEX, "root: scrollRoot", "Usuarios observer must use the application scroll container")
require(INDEX, "disconnectInfiniteObserver", "Usuarios observer must have explicit teardown")
require(INDEX, "observer.takeRecords?.()", "Usuarios observer teardown must clear queued entries")
require(INDEX, "infiniteObserver !== observer", "Stale observer callbacks must not affect the live observer")
require(INDEX, "syncInfiniteObserver();", "Usuarios observer must be rebound after DOM replacement")
require(INDEX, "Boolean(loadMoreError)", "Usuarios must stop automatic continuation after a page error")
require(INDEX, "seenPageCursors", "Usuarios must remember returned cursors for the active query")
require(INDEX, "USUARIOS_CURSOR_DID_NOT_ADVANCE", "Usuarios must reject cursor cycles")
require(INDEX, "USUARIOS_PAGE_DID_NOT_ADVANCE", "Usuarios must reject duplicate-only continuation pages")
require(INDEX, "mergedItems.length <= items.length", "Usuarios continuation must prove stable-ID progress")
require(INDEX, "disconnectInfiniteObserver();\n      unbindHost();", "Usuarios destroy must disconnect the continuation observer")
require(INDEX, "preservePages: true", "Resume/create revalidation must preserve accumulated pages")
require(INDEX, "Boolean(loadMoreError) ||", "Resume revalidation must not erase an explicit page retry state")
require(INDEX, "loadMoreTask ||\n        loadingMore ||", "Resume revalidation must not cancel an active continuation")
require(INDEX, "loading ||\n        refreshing ||\n        loadTask ||", "Resume revalidation must not duplicate an active first-page request")
require(INDEX, "userId: cleanText(row?.getAttribute", "Usuarios must capture a stable row identity before replacing DOM")
require(INDEX, "function actionFocusScope(node = null)", "Usuarios must distinguish controls that share an action and filter")
require(INDEX, "actionScope: actionFocusScope(action)", "Usuarios must capture the focused control scope")
require(INDEX, "actionIndex: action ? actionNodes.indexOf(action) : -1", "Usuarios must capture a stable focused-control index")
require(INDEX, "matchesActionIdentity(indexedCandidate)", "Usuarios must restore the exact indexed action before using a fallback")
require(INDEX, "[ACTIONS.RETRY_PAGE, ACTIONS.RETRY, ACTIONS.REFRESH].includes", "Usuarios page retry and refresh focus must move through the stable status target")
require(INDEX, "function invalidateContinuationForPendingSearch()", "Search debounce must invalidate the previous continuation")
require(INDEX, "queryEpoch += 1;\n    loadMoreTask = null;", "Search debounce must invalidate in-flight continuation responses")
require(INDEX, 'continuationToken = "";\n    hasMore = false;', "Search debounce must retire the previous cursor")
require(INDEX, "Boolean(searchTimer)", "Observer and resume guards must block while search debounce is pending")
if INDEX.count("Boolean(searchTimer) ||") < 4:
    errors.append("Search debounce must block observer sync, observer callback, load-more and resume revalidation")
require(INDEX, "loading ||\n      refreshing ||\n      Boolean(loadTask) ||\n      Boolean(searchTimer)", "Load-more must not race initial loading or first-page revalidation")
require(INDEX, "invalidateContinuationForPendingSearch();\n    searchTimer = window.setTimeout", "Search input must invalidate continuation before starting its debounce")
require(INDEX, "searchPending: Boolean(searchTimer)", "Search debounce must be distinguishable from a confirmed feed end")
require(INDEX, "const visibleSearch = searchDraft;", "Rerenders must preserve the exact active search draft")
require(INDEX, "event.isComposing || searchComposing", "Search must not replace the input during IME composition")
require(INDEX, 'addEventListener("compositionstart", hostCompositionStartHandler)', "Search must observe IME composition start")
require(INDEX, 'addEventListener("compositionend", hostCompositionEndHandler)', "Search must commit only after IME composition ends")
require(INDEX, 'searchDraft = String(value ?? "");\n    search = cleanText(searchDraft, "");', "Programmatic searches must separate the visible draft from the normalized API query")
require(INDEX, 'setSearch("");\n        focusSearchInput();', "Clear-search must return focus to the search input")

# Detail/modal races: a response for user A must never update a modal now showing user B.
require(INDEX, "let detailRefreshEpoch = 0", "Detail refreshes need an independent race epoch")
require(INDEX, "const epoch = ++detailRefreshEpoch", "Each detail refresh must advance its race epoch")
require(INDEX, "epoch !== detailRefreshEpoch", "Stale detail refresh responses must be rejected")
require(INDEX, "const liveModalUserId", "Detail refresh must inspect the live modal identity")
require(INDEX, "liveModalUserId === id", "Detail refresh may update only the same live user")
require(INDEX, "detailRefreshEpoch += 1", "Open/close/destroy transitions must invalidate old detail refreshes")
require(INDEX, "detailRefreshRaceProtected: true", "Usuarios snapshot must declare detail refresh race protection")

# Controller teardown must close modal islands only when this controller is the active owner.
require(INDEX, "const wasActiveOwner", "Destroy must establish whether the controller owns active modal islands")
require(INDEX, "if (wasActiveOwner)", "Modal teardown must be conditional on active controller ownership")
require(INDEX, "UsuariosDetailModal?.close?.()", "Destroy must close the detail modal owned by the view")
require(INDEX, "UsuariosCreateModal?.close?.()", "Destroy must close the create modal owned by the view")
require(INDEX, "modalDestroyCleanup: true", "Usuarios snapshot must declare modal teardown protection")

require(CURSOR, "USUARIOS_CURSOR_PAGE_SIZE = 50", "Cursor client must use bounded page size")
require(CURSOR, "query.ct = token", "Cursor client must forward opaque continuation token")
require(CURSOR, "query.status = statusFilter", "Cursor client must send status filter to backend")
require(CURSOR, "totalKnown", "Cursor client must preserve exact-total knowledge")
require(CURSOR, "const shouldIncludeTotal", "Cursor client must gate exact totals")
require(CURSOR, "includeTotal === true &&", "Exact totals must remain explicit opt-in")
require(CURSOR, "!token &&", "Continuation pages must never request exact totals")
require(CURSOR, "!text &&", "Search queries must never request exact totals")
require(CURSOR, 'statusFilter === "all"', "Filtered status queries must never request exact totals")
require(CURSOR, "includeTotal: shouldIncludeTotal", "Effective total gate must be sent to backend")
reject(CURSOR, "USUARIOS_MAX_PAGES", "Cursor client must not contain a page-count ceiling")

require(TEMPLATE, "state.hasMore", "Template must render backend hasMore state")
require(TEMPLATE, "state.totalKnown", "Template must distinguish exact totals")
require(TEMPLATE, "Exportar cargados", "CSV scope must be explicit and non-global")
require(TEMPLATE, 'data-usuarios-infinite-sentinel="true"', "Template must expose an infinite-scroll sentinel")
require(TEMPLATE, 'aria-live="polite"', "Infinite-scroll status must be announced accessibly")
require(TEMPLATE, 'usuarios-history-subtitle" tabindex="-1" role="status" aria-live="polite" aria-atomic="true"', "Usuarios must use one small atomic live region and focus fallback")
require(TEMPLATE, 'RETRY_PAGE: "retry-page"', "Failed continuation pages must expose a dedicated retry action")
require(TEMPLATE, "state.loadMoreError", "Template must distinguish continuation failure from initial-load failure")
require(TEMPLATE, 'state.loadingMore || state.refreshing ? "" : \'<div class="usuarios-feed-sentinel"', "Loading or refreshing must not keep a live sentinel")
require(TEMPLATE, 'if (state.searchPending) return "";', "Pending search must not expose a stale sentinel or false end marker")
require(TEMPLATE, "data.search ?? data.searchQuery ?? state.search ?? state.searchQuery", "Search markup must preserve exact draft spacing and caret offsets")
require(TEMPLATE, 'value="${escapeHtml(search)}"', "Search input attributes must escape without trimming or collapsing the active draft")
require(TEMPLATE, 'Boolean(cleanText(search, ""))', "Whitespace-only drafts must not become an active server filter")
require(TEMPLATE, '"Has visto todos los usuarios de la consulta."', "The single live region must announce the confirmed end")
require(TEMPLATE, "? finalSummary", "The scoped live region must consume the explicit final message")
reject(TEMPLATE, "filteredItems.length > pageItems.length", "Template must not infer remote pagination from local rows")
reject(TEMPLATE, "usuarios-load-more-btn", "Template must not expose a manual continuation button")
reject(TEMPLATE, "Cargar 50 más", "Template must not expose manual continuation copy")
reject(TEMPLATE, 'data-action="load-more"', "Template must not expose a manual continuation action")
reject(TEMPLATE, 'LOAD_MORE: "load-more"', "Template must not export a hidden manual continuation action")
reject(INDEX, "ACTIONS.LOAD_MORE", "Controller must not retain a hidden manual continuation case")
reject(INDEX, "load_more: ACTIONS", "Controller must not retain a hidden manual continuation alias")

if TEMPLATE.count('aria-live="polite"') != 1:
    errors.append("Template must contain exactly one scoped polite live region")

require(STYLE, ".usuarios-feed-sentinel", "Usuarios stylesheet must size the continuation sentinel")
require(STYLE, ".usuarios-feed-retry", "Usuarios stylesheet must style the page-error retry control")
require(STYLE, ".usuarios-history-subtitle:focus-visible", "Usuarios retry focus fallback must remain visibly focused")
reject(STYLE, ".usuarios-load-more-btn", "Usuarios stylesheet must not retain the manual continuation control")

# Legacy API may remain for compatibility, but its fixed-page behavior must not be the active view path.
require(API, "USUARIOS_MAX_PAGES", "Legacy compatibility API unexpectedly disappeared; review migration intentionally")

if errors:
    for error in errors:
        print(f"usuarios-scale-contract: {error}", file=sys.stderr)
    raise SystemExit(1)

print("usuarios-scale-contract: ok")
