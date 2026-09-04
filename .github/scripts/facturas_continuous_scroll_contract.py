#!/usr/bin/env python3
"""Static safety contract for Facturas continuous pagination."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
INDEX = (ROOT / "src/views/facturas/index.js").read_text(encoding="utf-8")
API = (ROOT / "src/views/facturas/facturas.api.js").read_text(encoding="utf-8")
TEMPLATE = (ROOT / "src/views/facturas/facturas.template.js").read_text(encoding="utf-8")
STYLE = (ROOT / "src/css/views/facturas/index.css").read_text(encoding="utf-8")
CREATE_TEMPLATE = (ROOT / "src/views/facturas/facturas.template.create.js").read_text(encoding="utf-8")
CREATE_STYLE = (ROOT / "src/css/views/facturas/create.css").read_text(encoding="utf-8")

errors: list[str] = []


def require(source: str, snippet: str, message: str) -> None:
    if snippet not in source:
        errors.append(message)


def reject(source: str, snippet: str, message: str) -> None:
    if snippet in source:
        errors.append(message)


# Owner authority and first-render performance.
require(INDEX, "const DEFAULT_BATCH_SIZE = 50;", "Facturas initial batch must stay bounded for a light first render")
require(INDEX, "export async function openFacturaDetailById", "Facturas must expose its canonical detail opener")
require(INDEX, "lastFacturasController", "Facturas canonical opener must target the mounted controller")
require(TEMPLATE, "Exportar cargadas", "Partial CSV export must say that only loaded invoices are exported")
require(TEMPLATE, "Actualización detenida.", "Refresh failure must expose actionable copy")
require(TEMPLATE, 'data-facturas-action="${FACTURAS_ACTIONS.REFRESH}"', "Refresh failure must expose a retry action")
reject(TEMPLATE, "Usa Actualizar para reintentar", "Facturas must not reference the removed manual Actualizar button")
reject(TEMPLATE, "counts[filter.key]", "Server-filter pills must not display misleading partial counts")

# Runtime cache and stale fallbacks must never cross a server-query boundary.
require(API, "getFacturasListContextKey", "API must expose a canonical list context key")
require(API, "lastList.contextKey === contextKey", "Append cache must require the same query context")
require(API, "lastList.queryKey === queryKey", "Stale fallback must require the exact same request")
require(INDEX, "returnStaleOnError: false", "Controller must reject API stale fallback rows")
require(INDEX, "requestContextKey !== getListContextKey()", "Controller must reject obsolete query responses")
require(INDEX, "itemsContextKey = requestContextKey", "Loaded rows must retain their owning query context")
require(INDEX, "resetListState({ keepItems: false })", "Filter/search changes must clear old-query rows")
require(INDEX, "FACTURAS_PAGE_DID_NOT_ADVANCE", "Duplicate-only continuation pages must stop automatic loading")
require(INDEX, "FACTURAS_FIRST_PAGE_DID_NOT_ADVANCE", "An empty continuable first page must stop with a retryable error")
require(INDEX, "responseAdvertisesMore && normalizedRows.length === 0", "First-page progress must be measured by stable IDs")
require(INDEX, "items.length <= previousPageState.items.length", "Continuation must prove stable-ID progress")
require(INDEX, "mergeFacturasFreshPageFirst", "First-page revalidation must retain accumulated rows in server order")
require(INDEX, "Number(replacedPageSize)", "First-page revalidation must replace, not retain, its stale prior page")
require(INDEX, "preservePages = false", "First-page loads must declare whether accumulated pages are preserved")
require(INDEX, "preserveContinuation", "Same-query revalidation must retain its prior continuation")
require(INDEX, "preserveCompletedHistory", "A completed history must remain complete after safe revalidation")
require(INDEX, "totalContracted", "Known total contraction must invalidate retained offset pages")
require(INDEX, "responseTotal !== previousPageState.total", "Any exact total change must invalidate unsafe offset continuation")
require(INDEX, "!totalChanged", "Page preservation must reject an exact total change")
require(INDEX, "facturasFirstPageIdentityMatches", "Offset continuation must compare the exact first-page ID order")
require(INDEX, "stableKnownTotal", "Offset pages may only survive when both exact totals prove the dataset size stable")
require(INDEX, "!firstPageIdentityChanged", "Offset pages must reset when their first-page boundary changes")
require(INDEX, "retainedRowsExceedTotal", "Retained stale rows must not exceed a known backend total")
require(INDEX, "previousPageState.nextPage", "Revalidation must restore the continuation captured before its request")
require(API, "hasExplicitTotal", "API normalization must distinguish exact totals from page-size fallbacks")
require(API, "parseBooleanFlag(hasMore", "Legacy string hasMore values must not create phantom continuation pages")
require(API, "if (Array.isArray(unwrapped)) return unwrapped;", "A data[] envelope must preserve its invoice rows")
require(API, "original.meta", "A data[] envelope must preserve pagination metadata from its outer envelope")
require(API, "function pagingMetadataFromPayload", "Mixed envelopes must merge object pagination metadata")
require(API, "if (isObject(candidate)) Object.assign(paging, candidate);", "A numeric page value must not hide meta continuation fields")
require(API, "totalKnown: paging.totalKnown", "Exact-total provenance must survive normalization")
require(API, "nextPage: normalized.nextPage", "Runtime cache must preserve the next page")
require(API, "hasMore: normalized.hasMore === true", "Runtime cache must preserve backend completion state")
require(API, "export function syncFacturasListCache", "Controller must be able to persist its reconciled accumulated snapshot")
require(INDEX, "function syncListCacheSnapshot()", "Controller must synchronize reconciled pages back to API cache")
require(INDEX, "syncFacturasListCache({", "Controller cache sync must include its final accumulated rows")
require(INDEX, "syncListCacheSnapshot();", "Successful and rolled-back list requests must persist controller state")
reject(API, "mergeById([created, ...lastList.items])", "Create must not contaminate an unknown filtered cache context")
require(INDEX, "const canOptimisticallyInsert", "Create must declare when an optimistic row belongs to the canonical query")
require(INDEX, 'normalizeKey(filter) === "all"', "Create must not optimistically insert into a filtered query")
require(INDEX, "facturasCanOptimisticallyInsertCreated", "Create optimism must be covered by a testable safety predicate")
require(INDEX, '(hasMore !== true || normalizeKey(sort) === "date_desc")', "Partial ascending histories must not optimistically misorder a new invoice")
require(INDEX, "keepItems: itemsBelongToCurrentQuery()", "Create must revalidate the active server query after success")

# Debounced search owns the list slot; observer and scroll fallback stay blocked.
require(INDEX, "function cancelListSearchTimer()", "List debounce must have explicit cancellation")
require(INDEX, "Boolean(listSearchTimer)", "Observer/scroll guards must include pending search")
require(INDEX, "listSearchTimer ||", "Load-more must reject a pending search")
require(INDEX, "const hadPendingSearch = cancelListSearchTimer()", "Filter/sort must cancel pending search")
require(INDEX, "cancelListSearchTimer();\n    filter = \"all\";", "Clear filters must cancel pending search")

# Observer replacement must invalidate queued callbacks, not just current targets.
require(INDEX, "observer.takeRecords?.()", "Observer teardown must clear queued entries")
require(INDEX, "infiniteObserver !== observer", "Stale observer callbacks must be identity-guarded")
require(INDEX, "disconnectInfiniteObserver();\n            void loadMore();", "Observer must disconnect before continuation")
require(INDEX, "root: scrollRoot", "Observer must use the application scroll owner")
require(INDEX, "if (!flushedMain) syncInfiniteObserver();", "Closing a modal without deferred render must rearm continuation")
require(INDEX, "suspendScheduledMainRender();\n    disconnectInfiniteObserver();", "Opening a modal must retire the live continuation observer")

# Incremental DOM replacement must preserve a stable keyboard target.
require(INDEX, "captureStableListFocus", "Incremental render must capture stable focus")
require(INDEX, "restoreStableListFocus", "Incremental render must restore stable focus")
require(INDEX, "facturaId", "Focus restoration must use stable factura identity")
require(INDEX, "target.focus({ preventScroll: true })", "Focus restoration must not move the feed")
require(INDEX, "state.action === FACTURAS_ACTIONS.RETRY_PAGE", "Retry focus must move to a stable feed target")
require(INDEX, "state.selectionStart", "Search focus and caret must survive result rendering")
require(INDEX, "render({ preserveFocus: true });", "Search rendering must restore its captured caret")
require(INDEX, "inputValue:", "Search focus capture must retain the exact unnormalized draft")
require(INDEX, "target.value = state.inputValue", "Search rerender must restore spaces and the exact draft")
require(INDEX, "event.isComposing || listSearchComposing", "Search must not replace the input during IME composition")
require(INDEX, 'addEventListener?.("compositionstart", onCompositionStart)', "Search must observe IME composition start")
require(INDEX, 'addEventListener?.("compositionend", onCompositionEnd)', "Search must commit after IME composition ends")
require(INDEX, "listSearchComposing ||", "Automatic continuation must pause while search composition is active")
if INDEX.count("Boolean(error) ||") < 5:
    errors.append("General first-page errors must block observer, append, load-more and scroll fallback")
require(INDEX, "state.action === FACTURAS_ACTIONS.CLEAR_SEARCH", "Clearing search must focus its stable input fallback")
require(INDEX, "state.action === FACTURAS_ACTIONS.CLEAR_FILTERS", "Clearing an empty filter result must focus the stable all-filter control")
require(INDEX, "state.action === FACTURAS_ACTIONS.REFRESH", "Refresh must focus a stable feed/loading fallback while its button is disabled")
require(INDEX, "facturaId: cleanText(row?.dataset?.facturaId", "Modal return focus must capture stable row identity")
require(INDEX, "snapshot.node?.isConnected", "Modal return focus must re-resolve a replaced opener")
require(INDEX, "sortKey", "Sort focus must use a stable key instead of the changing next direction")

# The sentinel is passive. Retry is the only visible continuation control.
require(TEMPLATE, 'data-facturas-infinite-sentinel="true"', "Template must expose the observer sentinel")
require(
    TEMPLATE,
    'data-facturas-infinite-sentinel="true" aria-hidden="true"',
    "Sentinel must remain a passive, hidden observer target",
)
require(TEMPLATE, 'RETRY_PAGE: "retry-page"', "Incremental failure must expose retry")
require(TEMPLATE, "loadMoreError", "Template must distinguish incremental failure")
require(TEMPLATE, 'class="facturas-refresh-overlay" aria-hidden="true"', "Refresh overlay must not create a second live announcement")
require(TEMPLATE, "!loadingMore && !refreshing && !loadMoreError", "Sentinel must stay absent while a refresh owns the list")
require(TEMPLATE, "if (listError)", "A first-page refresh error must suppress automatic continuation")
require(TEMPLATE, 'id="facturas-list-status" class="facturas-loading-status" role="status"', "Initial loading must expose one visible live status")
require(TEMPLATE, 'id="facturas-fatal-error" class="facturas-error" role="alert"', "Fatal loading errors must be announced")
require(TEMPLATE, 'id="facturas-empty-state" class="facturas-empty" tabindex="-1"', "Empty results must expose a stable focus fallback")
require(TEMPLATE, 'role="status" aria-live="polite" aria-atomic="true"', "Successful empty results must be announced from one live status")
require(TEMPLATE, 'const liveAttributes = hasError', "Error empties must not duplicate their alert in a polite region")
require(INDEX, 'host.querySelector("#facturas-fatal-error")', "Fatal errors must receive a stable programmatic focus target")
reject(TEMPLATE, 'LOAD_MORE: "load-more"', "Template must not export a hidden manual continuation action")
reject(TEMPLATE, 'data-action="load-more"', "Sentinel must not expose a manual action")
reject(TEMPLATE, 'data-facturas-action="load-more"', "Sentinel must be observer-only")
reject(INDEX, "LOAD_MORE_ACTION", "Controller must not retain the hidden sentinel action")
require(STYLE, ".facturas-infinite-retry", "Retry control must retain explicit styling")
require(STYLE, ".facturas-infinite:focus-visible", "Feed focus fallback must remain visible")
require(STYLE, ".facturas-error:focus-visible", "Fatal-error focus target must remain visibly focused")
require(STYLE, ".facturas-empty:focus-visible", "Empty-result focus target must remain visibly focused")
require(STYLE, ".facturas-loading-status:focus-visible", "Loading focus target must remain visibly focused")
require(STYLE, "outline: 2px solid CanvasText", "Focus fallbacks must remain visible in forced colors")

# Invoice creation must select billing clients only; user search is a different domain.
require(
    INDEX,
    'const CLIENT_SEARCH_ENDPOINTS = Object.freeze([\n  "/api/search/clientes",\n]);',
    "Create-invoice client search must use only the canonical clientes search endpoint",
)
reject(INDEX, '"/api/search/users"', "Create-invoice client search must never fall back to user search")
reject(INDEX, '"/api/users"', "Create-invoice client search must never fall back to the users listing")


# Nueva factura is a line-item editor with one canonical client and incident domain.
reject(CREATE_TEMPLATE, 'CLIENT_CLEAR: "create-client-clear"', "Create invoice must not expose a duplicate client clear action")
reject(CREATE_TEMPLATE, 'TICKET_CLEAR: "create-ticket-clear"', "Create invoice must not expose a duplicate ticket clear action")
reject(CREATE_TEMPLATE, "Política automática:", "Create invoice must not render the redundant automatic tax policy footnote")
reject(CREATE_TEMPLATE, "fac-create-footer-summary", "Create invoice footer must contain actions only")
require(CREATE_TEMPLATE, 'LINE_ADD: "create-line-add"', "Create invoice must support adding line items")
require(CREATE_TEMPLATE, 'LINE_REMOVE: "create-line-remove"', "Create invoice must support removing line items")
require(CREATE_TEMPLATE, 'data-line-field="concepto"', "Line-item editor must expose per-line concepts")
require(CREATE_TEMPLATE, 'data-line-field="unidad"', "Line-item editor must support service/material units")
require(INDEX, "readCreateLineItems", "Controller must read every invoice line before submit")
require(INDEX, "safeArray(breakdown.lineas).map", "Create payload must serialize every validated invoice line")
require(INDEX, 'const TICKET_SEARCH_ENDPOINTS = Object.freeze([\n  "/api/search/incidencias",\n]);', "Invoice incidents must use the canonical client-scoped incidence search")
require(INDEX, "autoSelectLatest: false", "Client incidents must remain an explicit choice instead of being auto-selected")
require(CREATE_TEMPLATE, "resolveAvatarPresentation", "Create invoice avatars must delegate identity and tone to AvatarSystem")
require(CREATE_TEMPLATE, 'data-avatar-system="true"', "Create invoice avatars must be globally managed from first paint")
require(CREATE_TEMPLATE, 'data-avatar-host="true"', "Create invoice avatars must expose the canonical avatar host")
require(CREATE_TEMPLATE, 'data-avatar-tone="${attr(String(presentation.tone))}"', "Create invoice avatars must carry the uint32 tone resolved by AvatarSystem")
reject(CREATE_TEMPLATE, "fac-create-avatar--tone-", "Create invoice must not reintroduce local tone classes")
reject(CREATE_STYLE, ".fac-create-avatar--tone-", "Create invoice CSS must not own a local avatar palette")

# Facturas resend UX must stay inside the product visual system, never browser chrome.
reject(INDEX, "¿Quieres volver a enviarla?", "Resend confirmation must not use the browser-native confirm dialog")
require(INDEX, "function confirmFacturaResend", "Resend must expose an accessible custom confirmation flow")
require(INDEX, 'dialog.setAttribute("role", "alertdialog")', "Resend confirmation must be an alertdialog")
# Keyboard, focus and scroll ownership belong to the shared modal lifecycle.
# Scope the wiring check to resend so another modal cannot satisfy this contract.
RESEND = INDEX.split("function confirmFacturaResend", 1)[-1].split("\nfunction ", 1)[0]
require(RESEND, "const confirmationLifecycle = createModalLifecycle({", "Resend confirmation must use the shared modal lifecycle")
require(RESEND, "getPanel: () => dialog", "Shared focus management must own the actual resend dialog")
require(RESEND, "onEscape: () => settle(false)", "Resend Escape must cancel through its owner")
require(RESEND, "onDetached: () => settle(false)", "Removing the resend dialog must settle its pending confirmation")
require(RESEND, "confirmationLifecycle.activate({ opener })", "Resend must register its opener and acquire shared interaction")
require(RESEND, "confirmationLifecycle.deactivate({ restoreFocus: false })", "Resend cleanup must release shared interaction before restoring owner focus")
require(RESEND, "restoreModalFocus(opener)", "Resend must return focus through the shared guard")
reject(RESEND, "focusableElements(dialog)", "Resend must not duplicate the shared focus trap")
require(STYLE, ".facturas-resend-confirm-overlay", "Resend confirmation must use the Facturas themed overlay")
require(STYLE, ".facturas-resend-confirm-dialog", "Resend confirmation must use the Facturas themed dialog")
require(STYLE, '.ui-datalist[data-mobile-datalist-layout="facturas"]', "Mobile Facturas identity must have a dedicated no-clipping contract")
require(STYLE, "overflow-wrap: anywhere", "Mobile Facturas identity must wrap long values instead of clipping them")

if errors:
    for error in errors:
        print(f"facturas-continuous-scroll-contract: {error}", file=sys.stderr)
    raise SystemExit(1)

print("facturas-continuous-scroll-contract: ok")