#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_exact(text, old, new, label, expected=1):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} occurrences, found {count}: {old!r}")
    return text.replace(old, new)


def find_function_span(text, name):
    pattern = re.compile(rf"(?m)^(?P<indent>[ \t]*)(?:async\s+)?function\s+{re.escape(name)}\s*\(")
    match = pattern.search(text)
    if not match:
        raise SystemExit(f"function not found: {name}")
    brace = text.find("{", match.end())
    if brace < 0:
        raise SystemExit(f"opening brace not found: {name}")
    depth = 0
    quote = None
    escape = False
    template_depth = 0
    i = brace
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if quote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif quote == "`" and ch == "$" and nxt == "{":
                template_depth += 1
                i += 1
            elif ch == quote and template_depth == 0:
                quote = None
            elif quote == "`" and ch == "}" and template_depth:
                template_depth -= 1
            i += 1
            continue
        if ch in ('"', "'", "`"):
            quote = ch
            i += 1
            continue
        if ch == "/" and nxt == "/":
            end = text.find("\n", i + 2)
            i = len(text) if end < 0 else end + 1
            continue
        if ch == "/" and nxt == "*":
            end = text.find("*/", i + 2)
            if end < 0:
                raise SystemExit(f"unterminated comment while parsing {name}")
            i = end + 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return match.start(), i + 1
        i += 1
    raise SystemExit(f"closing brace not found: {name}")


def replace_function(text, name, replacement):
    start, end = find_function_span(text, name)
    return text[:start] + replacement.rstrip() + text[end:]


def insert_before_function(text, name, insertion):
    start, _ = find_function_span(text, name)
    return text[:start] + insertion.rstrip() + "\n\n" + text[start:]


# ------------------------------------------------------------------
# API: cache-neutral cursor pages + bounded detail cache
# ------------------------------------------------------------------
api_path = "src/views/incidencias/incidencias.api.impl.js"
api = read(api_path)
api = replace_exact(
    api,
    'export const INCIDENCIAS_API_VERSION = "incidencias.api.extreme.v23.admin-attachment-delete";',
    'export const INCIDENCIAS_API_VERSION = "incidencias.api.extreme.v24.cursor-scale-safe";',
    "api version",
)
api = replace_exact(
    api,
    "export const INCIDENCIAS_DETAIL_CACHE_TTL_MS = 20000;",
    "export const INCIDENCIAS_DETAIL_CACHE_TTL_MS = 20000;\nexport const INCIDENCIAS_DETAIL_CACHE_MAX_ENTRIES = 96;",
    "detail cache max constant",
)

last_list_anchor = """let lastList = {
  items: [],
  total: 0,
};
"""
prune_code = """
function pruneDetailCache() {
  while (detailCache.size > INCIDENCIAS_DETAIL_CACHE_MAX_ENTRIES) {
    const oldestKey = detailCache.keys().next().value;
    if (oldestKey === undefined) break;
    detailCache.delete(oldestKey);
  }
}
"""
api = replace_exact(
    api,
    last_list_anchor,
    last_list_anchor + prune_code,
    "detail cache prune insertion",
)

set_marker = "detailCache.set(id, { item: normalized, at: now() });"
set_count = api.count(set_marker)
if set_count < 1:
    raise SystemExit("detail cache set marker missing")
api = api.replace(set_marker, set_marker + "\n  pruneDetailCache();")

page_loader = r'''export async function loadIncidenciasPage(options = {}) {
  const response = await fetchIncidenciasRequest({
    ...safeObject(options),
    query: {
      pageMode: "cursor",
      limit: INCIDENCIAS_LIST_LIMIT,
      ...safeObject(options?.query),
    },
  });

  if (responseLooksFailed(response)) {
    throw new Error(
      responseErrorMessage(response, "No se pudo cargar la página de incidencias.")
    );
  }

  const rawItems = listFromPayload(response);
  const items = normalizeList(rawItems);
  const data = safeObject(response?.data);
  const pagination = safeObject(
    first(response?.pagination, data?.pagination, {})
  );
  const total = Math.max(
    number(
      first(
        response?.total,
        response?.totalCount,
        data?.total,
        data?.totalCount,
        items.length
      ),
      items.length
    ),
    items.length
  );
  const nextCursor = cleanText(
    first(
      response?.nextCursor,
      pagination?.nextCursor,
      data?.nextCursor,
      data?.pagination?.nextCursor,
      ""
    ),
    ""
  );
  const hasMore =
    response?.hasMore === true ||
    pagination?.hasMore === true ||
    data?.hasMore === true ||
    data?.pagination?.hasMore === true ||
    Boolean(nextCursor);

  return {
    ok: true,
    cached: false,
    stale: false,
    items,
    total,
    count: items.length,
    rawCount: rawItems.length,
    nextCursor,
    hasMore,
    pagination: {
      ...pagination,
      mode: "cursor",
      nextCursor,
      hasMore,
      total,
      pageSize: number(
        first(pagination?.pageSize, options?.query?.limit, INCIDENCIAS_LIST_LIMIT),
        INCIDENCIAS_LIST_LIMIT
      ),
    },
  };
}'''

_, fetch_end = find_function_span(api, "fetchIncidenciasRequest")
api = api[:fetch_end] + "\n\n" + page_loader + api[fetch_end:]

snapshot_old = "detailCache: { size: detailCache.size, inFlight: detailInFlight.size, ttlMs: INCIDENCIAS_DETAIL_CACHE_TTL_MS },"
snapshot_new = "detailCache: { size: detailCache.size, inFlight: detailInFlight.size, ttlMs: INCIDENCIAS_DETAIL_CACHE_TTL_MS, maxEntries: INCIDENCIAS_DETAIL_CACHE_MAX_ENTRIES },"
api = replace_exact(api, snapshot_old, snapshot_new, "detail cache snapshot")

api = replace_exact(
    api,
    "  listIncidencias,\n  loadIncidencias,",
    "  listIncidencias,\n  loadIncidenciasPage,\n  loadIncidencias,",
    "default export page loader",
)
write(api_path, api)

# ------------------------------------------------------------------
# Template: refresh action + remote pagination awareness
# ------------------------------------------------------------------
template_path = "src/views/incidencias/incidencias.template.js"
template = read(template_path)
template = replace_exact(
    template,
    'export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.extreme.v27.stable-toolbar-money-reset";',
    'export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.extreme.v28.cursor-scale-safe";',
    "template version",
)
template = replace_exact(
    template,
    '  CREATE_OPEN: "create-open",\n',
    '  CREATE_OPEN: "create-open",\n  REFRESH: "refresh",\n',
    "refresh action",
)
template = replace_exact(
    template,
    "  const total = remoteTotal(d, items.length);\n  const stats =",
    "  const total = remoteTotal(d, items.length);\n  const nextCursor = txt(first(d.nextCursor, d.pagination?.nextCursor, \"\"), \"\");\n  const remoteHasMore = Boolean(nextCursor) || d.hasMore === true || d.pagination?.hasMore === true || total > items.length;\n  const stats =",
    "template remote pagination vars",
)
template = replace_exact(
    template,
    "    remainingCount: Math.max(0, filtered.length - visible.length),\n    hasMore: filtered.length > visible.length,",
    "    remainingCount: remoteHasMore\n      ? Math.max(0, total - visible.length)\n      : Math.max(0, filtered.length - visible.length),\n    hasMore: filtered.length > visible.length || remoteHasMore,\n    remoteHasMore,\n    nextCursor,",
    "template remote pagination fields",
)
write(template_path, template)

# ------------------------------------------------------------------
# Controller: cursor pages, remote debounced search, quiet refresh
# ------------------------------------------------------------------
controller_path = "src/views/incidencias/index.js"
controller = read(controller_path)
controller = replace_exact(
    controller,
    "  listIncidencias,\n  hydrateIncidenciasFromCache,\n  INCIDENCIAS_CACHE_TTL_MS,",
    "  listIncidencias,\n  loadIncidenciasPage,\n  hydrateIncidenciasFromCache,\n  INCIDENCIAS_LIST_LIMIT,\n  INCIDENCIAS_CACHE_TTL_MS,",
    "controller imports",
)
controller = replace_exact(
    controller,
    '  "incidencias.index.extreme.v34.interaction-stable";',
    '  "incidencias.index.extreme.v35.cursor-production";',
    "controller version",
)
controller = replace_exact(
    controller,
    "const AUTO_REFRESH_INTERVAL_MS = INCIDENCIAS_CACHE_TTL_MS;",
    "const AUTO_REFRESH_INTERVAL_MS = Math.max(INCIDENCIAS_CACHE_TTL_MS * 3, 180000);",
    "quiet auto refresh",
)
controller = replace_exact(
    controller,
    "const USER_SEARCH_DEBOUNCE_MS = 220;",
    "const USER_SEARCH_DEBOUNCE_MS = 220;\nconst LIST_SEARCH_MIN_LENGTH = 3;\nconst LIST_SEARCH_DEBOUNCE_MS = 350;",
    "list search constants",
)

state_match = re.search(r"(?m)^(?P<indent>[ \t]*)let loadingMore\s*=\s*false;", controller)
if not state_match:
    raise SystemExit("controller loadingMore state marker missing")
indent = state_match.group("indent")
state_block = (
    f"{indent}let nextCursor = \"\";\n"
    f"{indent}let serverSearch = \"\";\n"
    f"{indent}let listSearchTimer = 0;\n"
    f"{indent}let listSearchSeq = 0;\n"
    f"{indent}let loadMoreSeq = 0;\n"
    f"{indent}let pageController = null;\n"
)
controller = controller[:state_match.start()] + state_block + controller[state_match.start():]

merge_helper = r'''function mergeTicketPage(currentItems = [], incomingItems = []) {
  const map = new Map();

  for (const current of safeArray(currentItems)) {
    const id = getTicketId(current);
    if (id) map.set(id, current);
  }

  for (const incoming of safeArray(incomingItems)) {
    const id = getTicketId(incoming);
    if (!id) continue;
    map.set(
      id,
      map.has(id)
        ? mergeTicketData(map.get(id), incoming)
        : incoming
    );
  }

  return [...map.values()].sort((a, b) => {
    const diff = ticketSortTime(b) - ticketSortTime(a);
    if (diff !== 0) return diff;
    return getTicketId(b).localeCompare(getTicketId(a), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}'''
controller = insert_before_function(controller, "nextFrame", merge_helper)

clear_search_timer = r'''function clearListSearchTimer() {
  if (!listSearchTimer) return false;

  try {
    window.clearTimeout(listSearchTimer);
  } catch {
    // noop
  }

  listSearchTimer = 0;
  return true;
}'''
controller = insert_before_function(controller, "load", clear_search_timer)

new_load = r'''async function load(options = {}) {
    const seq = ++loadSeq;
    const silent = options.silent === true;
    const force = options.force === true;
    const background = options.background === true;
    const hasItems = items.length > 0;

    error = "";

    if (!silent) {
      loading = !hasItems;
      refreshing = force && hasItems;

      if (loading) {
        renderLoading();
      } else {
        render();
      }
    }

    loadController?.abort?.();
    const requestController = typeof AbortController !== "undefined"
      ? new AbortController()
      : null;
    loadController = requestController;

    try {
      const response = await loadIncidenciasPage({
        signal: requestController?.signal,
        query: {
          pageMode: "cursor",
          limit: INCIDENCIAS_LIST_LIMIT,
          ...(serverSearch ? { q: serverSearch } : {}),
        },
      });

      if (destroyed || seq !== loadSeq) {
        return response;
      }

      items = safeArray(response.items);
      total = Number(response.total || items.length) || items.length;
      nextCursor = cleanText(response.nextCursor, "");
      error = response.stale
        ? cleanText(response.error?.message, "")
        : "";

      loading = false;
      refreshing = false;

      render(
        background
          ? { listPatch: true, skipModals: true }
          : {}
      );

      return response;
    } catch (loadError) {
      if (destroyed || seq !== loadSeq) {
        return null;
      }

      error = safeError(loadError);
      loading = false;
      refreshing = false;

      if (items.length) {
        render(
          background
            ? { listPatch: true, skipModals: true }
            : {}
        );
        return null;
      }

      renderError(error);
      return null;
    }
  }'''
controller = replace_function(controller, "load", new_load)

new_set_search = r'''function setSearch(value = "") {
    const next = cleanText(value, "");
    search = next;
    visibleLimit = DEFAULT_VISIBLE_LIMIT;
    renderWithFilteredItems();

    clearListSearchTimer();
    const requestedServerSearch =
      next.length >= LIST_SEARCH_MIN_LENGTH
        ? next
        : "";

    if (requestedServerSearch === serverSearch) {
      return true;
    }

    const seq = ++listSearchSeq;

    const commitSearch = async () => {
      if (destroyed || seq !== listSearchSeq) return false;

      serverSearch = requestedServerSearch;
      nextCursor = "";
      visibleLimit = DEFAULT_VISIBLE_LIMIT;

      await load({
        force: true,
        silent: true,
        background: false,
        cache: false,
      });

      return true;
    };

    if (!isBrowser()) {
      void commitSearch();
      return true;
    }

    listSearchTimer = window.setTimeout(() => {
      listSearchTimer = 0;
      void commitSearch();
    }, LIST_SEARCH_DEBOUNCE_MS);

    return true;
  }'''
controller = replace_function(controller, "setSearch", new_set_search)

new_load_more = r'''async function loadMore() {
    if (loadingMore) return false;

    const localVisible = filteredItems().length;

    if (visibleLimit < localVisible) {
      visibleLimit += DEFAULT_VISIBLE_LIMIT;
      renderWithFilteredItems();
      return true;
    }

    if (!nextCursor) {
      return false;
    }

    const seq = ++loadMoreSeq;
    const cursor = nextCursor;
    loadingMore = true;
    renderWithFilteredItems();

    pageController?.abort?.();
    pageController = typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

    try {
      const response = await loadIncidenciasPage({
        signal: pageController?.signal,
        query: {
          pageMode: "cursor",
          cursor,
          limit: INCIDENCIAS_LIST_LIMIT,
          ...(serverSearch ? { q: serverSearch } : {}),
        },
      });

      if (destroyed || seq !== loadMoreSeq) {
        return false;
      }

      items = mergeTicketPage(items, response.items);
      total = Math.max(
        Number(response.total || total || items.length) || items.length,
        items.length
      );
      nextCursor = cleanText(response.nextCursor, "");
      visibleLimit += DEFAULT_VISIBLE_LIMIT;
      error = "";

      renderWithFilteredItems();
      return true;
    } catch (pageError) {
      if (destroyed || seq !== loadMoreSeq) {
        return false;
      }

      error = safeError(pageError, "No se pudieron cargar más incidencias.");
      renderWithFilteredItems();
      return false;
    } finally {
      if (seq === loadMoreSeq) {
        loadingMore = false;
        pageController = null;
        renderWithFilteredItems();
      }
    }
  }'''
controller = replace_function(controller, "loadMore", new_load_more)

refresh_anchor = """    if (
      type ===
      INCIDENCIAS_ACTIONS.OPEN_DETAIL
    ) {"""
refresh_branch = """    if (
      type ===
      INCIDENCIAS_ACTIONS.REFRESH
    ) {
      return refresh();
    }

"""
if refresh_branch.strip() not in controller:
    controller = replace_exact(
        controller,
        refresh_anchor,
        refresh_branch + refresh_anchor,
        "refresh action handler",
    )

# Reset remote search state when clearing all filters.
clear_start, clear_end = find_function_span(controller, "clearFilters")
clear_src = controller[clear_start:clear_end]
if 'serverSearch = "";' not in clear_src:
    marker = '    search = "";'
    if marker not in clear_src:
        raise SystemExit("clearFilters search marker missing")
    clear_src = clear_src.replace(
        marker,
        marker + '\n    serverSearch = "";\n    nextCursor = "";\n    listSearchSeq += 1;\n    clearListSearchTimer();',
        1,
    )
    clear_src = clear_src.replace(
        "    renderWithFilteredItems();\n\n    return true;",
        "    renderWithFilteredItems();\n    void load({ force: true, silent: true, cache: false });\n\n    return true;",
        1,
    )
    controller = controller[:clear_start] + clear_src + controller[clear_end:]

# Canonical preview behavior: never scroll the ticket body to reveal media.
preview_start, preview_end = find_function_span(controller, "revealDetailPreview")
preview_src = controller[preview_start:preview_end]
preview_src = re.sub(
    r"\n\s*try\s*\{\s*preview\.scrollIntoView\([\s\S]*?\}\s*catch\s*\{[\s\S]*?\}\s*",
    "\n",
    preview_src,
    count=1,
)
controller = controller[:preview_start] + preview_src + controller[preview_end:]

# Destroy must cancel pending page/search work.
destroy_marker = "\n    destroy() {"
destroy_start = controller.find(destroy_marker)
destroy_end = controller.find("\n    unmount() {", destroy_start)
if destroy_start < 0 or destroy_end < 0:
    raise SystemExit("controller destroy span missing")
destroy_src = controller[destroy_start:destroy_end]
if "clearListSearchTimer();" not in destroy_src:
    destroy_src = destroy_src.replace(
        "      clearUserSearchTimer();",
        "      clearUserSearchTimer();\n      clearListSearchTimer();\n      listSearchSeq += 1;\n      loadMoreSeq += 1;\n      pageController?.abort?.();\n      pageController = null;",
        1,
    )
controller = controller[:destroy_start] + destroy_src + controller[destroy_end:]

# Pass remote paging state to the template without exposing the opaque cursor.
vp_start, vp_end = find_function_span(controller, "viewPayload")
vp_src = controller[vp_start:vp_end]
if "hasMore:" not in vp_src:
    vp_src = vp_src.replace(
        "      total,",
        "      total,\n      hasMore: Boolean(nextCursor) || total > items.length,\n      pagination: { hasMore: Boolean(nextCursor), nextCursor: nextCursor ? \"available\" : \"\" },",
        1,
    )
controller = controller[:vp_start] + vp_src + controller[vp_end:]

# Snapshot policy should reflect cursor-backed paging and no scroll jump.
controller = controller.replace(
    "          attachmentPreviewScrollIntoView: true,",
    "          attachmentPreviewScrollIntoView: false,",
)
write(controller_path, controller)

# ------------------------------------------------------------------
# Conditional legacy fallback polling: reduce wake-up frequency.
# ------------------------------------------------------------------
detail_state_path = "src/features/incidencias-detail-state/index.js"
detail_state = read(detail_state_path)
detail_state = replace_exact(
    detail_state,
    "const POLL_MS = 30000;",
    "const POLL_MS = 90000;",
    "conditional detail poll interval",
)
write(detail_state_path, detail_state)

# Runtime must not carry the old API hostname.
legacy = []
for file in (ROOT / "src").rglob("*.js"):
    if "api.onionit.net" in file.read_text(encoding="utf-8").lower():
        legacy.append(str(file.relative_to(ROOT)))
if legacy:
    raise SystemExit("legacy frontend API references remain: " + ", ".join(legacy))

print("Frontend Incidencias finalizer applied: cursor pages, remote search, bounded cache, canonical preview, quiet refresh")
