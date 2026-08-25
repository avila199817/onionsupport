#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"INCIDENCIAS_SCALE_CONTRACT: {message}")


core = read("src/core/config.js")
controller = read("src/views/incidencias/index.js")
api = read("src/views/incidencias/incidencias.api.impl.js")
template = read("src/views/incidencias/incidencias.template.js")

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
    "INCIDENCIAS_DETAIL_CACHE_MAX_ENTRIES" in api,
    "detail cache must have an explicit capacity bound",
)
require(
    "pruneDetailCache" in api,
    "detail cache must evict old entries",
)

print("Incidencias scale contract OK · canonical API · cursor pages · remote search · bounded detail cache")
