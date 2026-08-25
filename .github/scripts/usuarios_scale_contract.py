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

require(CURSOR, "USUARIOS_CURSOR_PAGE_SIZE = 50", "Cursor client must use bounded page size")
require(CURSOR, "query.ct = token", "Cursor client must forward opaque continuation token")
require(CURSOR, "query.status = statusFilter", "Cursor client must send status filter to backend")
require(CURSOR, "totalKnown", "Cursor client must preserve exact-total knowledge")
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
