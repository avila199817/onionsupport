#!/usr/bin/env python3
"""Static contract for cursor-first Users administration."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
INDEX = (ROOT / "src/views/usuarios/index.js").read_text(encoding="utf-8")
CURSOR = (ROOT / "src/views/usuarios/usuarios.cursor.js").read_text(encoding="utf-8")
TEMPLATE = (ROOT / "src/views/usuarios/usuarios.template.js").read_text(encoding="utf-8")
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

# Cursor/query races: an obsolete page must not clear or overwrite a newer page task.
require(INDEX, "const task = (async () =>", "Load-more must keep a stable task identity")
require(INDEX, "loadMoreTask = task", "Load-more task must be registered explicitly")
require(INDEX, "if (loadMoreTask === task) loadMoreTask = null", "Only the owning load-more task may clear the task pointer")
require(INDEX, "epoch !== queryEpoch", "Cursor responses must be rejected after a query epoch change")
require(INDEX, "cursor !== continuationToken", "Cursor responses must be rejected after cursor replacement")
require(INDEX, "loadMoreTaskIdentityProtected: true", "Usuarios snapshot must declare load-more identity protection")

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
reject(TEMPLATE, "filteredItems.length > pageItems.length", "Template must not infer remote pagination from local rows")

# Legacy API may remain for compatibility, but its fixed-page behavior must not be the active view path.
require(API, "USUARIOS_MAX_PAGES", "Legacy compatibility API unexpectedly disappeared; review migration intentionally")

if errors:
    for error in errors:
        print(f"usuarios-scale-contract: {error}", file=sys.stderr)
    raise SystemExit(1)

print("usuarios-scale-contract: ok")
