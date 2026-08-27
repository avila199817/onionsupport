#!/usr/bin/env python3

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


# 1) Private boot: lazy-load the overlay only after an authenticated restore.
app_path = ROOT / "src/app/index.js"
app = app_path.read_text(encoding="utf-8")

if '"app.minimal.v6-public-lean-graph";' in app:
    app = app.replace(
        '"app.minimal.v6-public-lean-graph";',
        '"app.minimal.v7-global-entity-overlay";',
        1,
    )
elif '"app.minimal.v7-global-entity-overlay";' not in app:
    raise SystemExit("app: version anchor not found")

if "let EntityOverlayUI = null;" not in app:
    anchor = "let TopbarUI = null;\n"
    require(anchor in app, "app: TopbarUI state anchor not found")
    app = app.replace(anchor, anchor + "let EntityOverlayUI = null;\n", 1)

if "let entityOverlayLoadPromise = null;" not in app:
    anchor = "let topbarLoadPromise = null;\n"
    require(anchor in app, "app: topbar promise anchor not found")
    app = app.replace(anchor, anchor + "let entityOverlayLoadPromise = null;\n", 1)

if "async function ensureEntityOverlayUI()" not in app:
    match = re.search(
        r"(async function ensureTopbarUI\(\) \{.*?\n\})\n\n(function withRuntimeModules)",
        app,
        re.S,
    )
    require(match is not None, "app: ensureTopbarUI boundary not found")
    addition = r'''

async function ensureEntityOverlayUI() {
  const loaded = await loadRuntimeModule(
    EntityOverlayUI,
    entityOverlayLoadPromise,
    () => import("../features/entity-overlay/index.js"),
    ["EntityOverlay"]
  );
  entityOverlayLoadPromise = loaded.promise;
  EntityOverlayUI = loaded.value;
  return EntityOverlayUI;
}
'''
    app = app[: match.end(1)] + addition + "\n" + app[match.start(2) :]

if "EntityOverlay: EntityOverlayUI," not in app:
    anchor = "    TopbarUI,\n  };"
    require(anchor in app, "app: runtime module payload anchor not found")
    app = app.replace(
        anchor,
        "    TopbarUI,\n    EntityOverlay: EntityOverlayUI,\n  };",
        1,
    )

if "async function initEntityOverlay(" not in app:
    marker = "\nfunction notifyPublicHomeSessionHydrated()"
    require(marker in app, "app: notifyPublicHomeSessionHydrated marker not found")
    addition = r'''

async function initEntityOverlay(
  payload = {}
) {
  const overlay = await ensureEntityOverlayUI();

  const result = await call(
    overlay,
    "init",
    withRuntimeModules(payload),
    false
  );

  recordBootStep(
    "entityOverlay",
    result
  );

  return result.value;
}
'''
    app = app.replace(marker, addition + marker, 1)

if "await initEntityOverlay(" not in app:
    anchor = '''  await initGlobalUI(
    payload
  );

  await startRouter(
'''
    replacement = '''  await initGlobalUI(
    payload
  );

  if (lastRestore?.authenticated === true) {
    await initEntityOverlay(
      payload
    );
  }

  await startRouter(
'''
    require(anchor in app, "app: private initGlobalUI -> Router anchor not found")
    app = app.replace(anchor, replacement, 1)

app_path.write_text(app, encoding="utf-8")


# 2) Historical ticket links become view-independent entity intents.
deeplink_path = ROOT / "src/features/ticket-deeplink/index.js"
deeplink_path.write_text(
    r'''/* =========================================================
   Onion Support - Ticket Deep Link -> Global Entity Overlay

   Mantiene enlaces históricos, pero ya no monta Incidencias, no busca filas y
   no simula clicks. Sólo expresa una intención de entidad en la URL; el overlay
   privado la resuelve cuando Auth y AppCore están listos.
========================================================= */

export const TICKET_DEEPLINK_VERSION =
  "ticket-deeplink.v3-global-entity-intent";

const LEGACY_TICKETS_PREFIX = "/tickets/";
const PRIVATE_HOME_PATH = "/dashboard";
const TICKET_ID_PATTERN = /^INC-[A-Z0-9-]{6,120}$/i;
const ENTITY_TYPE = "incidencia";

let ticketId = "";
let legacyPath = false;
let canonicalized = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDecode(value = "") {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
}

function normalizeTicketId(value = "") {
  const id = cleanText(safeDecode(value));
  return TICKET_ID_PATTERN.test(id) ? id.toUpperCase() : "";
}

function currentUrl() {
  if (!isBrowser()) return null;

  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

function ticketFromLegacyPath(pathname = "") {
  const path = cleanText(pathname);
  if (!path.toLowerCase().startsWith(LEGACY_TICKETS_PREFIX)) return "";

  const suffix = path.slice(LEGACY_TICKETS_PREFIX.length);
  if (!suffix || suffix.includes("/")) return "";
  return normalizeTicketId(suffix);
}

function resolveTicket(url = null) {
  if (!url) return "";

  return (
    ticketFromLegacyPath(url.pathname) ||
    normalizeTicketId(
      url.searchParams.get("ticketId") ||
      url.searchParams.get("incidenciaId") ||
      (url.searchParams.get("entity") === ENTITY_TYPE
        ? url.searchParams.get("entityId")
        : "") ||
      ""
    )
  );
}

function canonicalize() {
  const url = currentUrl();
  if (!url) return false;

  ticketId = resolveTicket(url);
  if (!ticketId) return false;

  legacyPath = Boolean(ticketFromLegacyPath(url.pathname));
  if (legacyPath) url.pathname = PRIVATE_HOME_PATH;

  url.searchParams.delete("ticketId");
  url.searchParams.delete("incidenciaId");
  url.searchParams.set("entity", ENTITY_TYPE);
  url.searchParams.set("entityId", ticketId);

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    canonicalized = true;
    return true;
  } catch {
    return false;
  }
}

canonicalize();

export function getTicketDeeplinkSnapshot() {
  return Object.freeze({
    version: TICKET_DEEPLINK_VERSION,
    active: Boolean(ticketId),
    ticketId: ticketId ? "***" : "",
    legacyPath,
    canonicalized,
    searchApplied: false,
    rowActivated: false,
    modalOpen: false,
    finished: canonicalized,
    strategy: "global-entity-intent",
  });
}

export default Object.freeze({
  version: TICKET_DEEPLINK_VERSION,
  getSnapshot: getTicketDeeplinkSnapshot,
});
''',
    encoding="utf-8",
)


# 3) Generate the CSS manifest from the repository's actual domain styles.
domains = {
    "factura": ("factura", "facturas", "invoice"),
    "incidencia": ("incidencia", "incidencias", "ticket"),
    "cliente": ("cliente", "clientes", "client"),
    "usuario": ("usuario", "usuarios", "user"),
}

css_files = sorted((ROOT / "src/css").rglob("*.css"))
style_map: dict[str, list[str]] = {}

for entity_type, needles in domains.items():
    paths: list[str] = []
    for css_file in css_files:
        rel = css_file.relative_to(ROOT).as_posix()
        parts = [part.lower() for part in css_file.parts]
        stem = css_file.stem.lower()

        in_domain_directory = any(needle in parts for needle in needles)
        named_for_domain = any(
            needle in stem for needle in needles if len(needle) > 4
        )

        if in_domain_directory or named_for_domain:
            paths.append("/" + rel)

    style_map[entity_type] = sorted(dict.fromkeys(paths))

style_lines = [
    "/* Generado desde el árbol CSS real del repositorio. */",
    "export const ENTITY_STYLE_PATHS = Object.freeze({",
]
for entity_type in ("factura", "incidencia", "cliente", "usuario"):
    encoded = ", ".join(json.dumps(path) for path in style_map[entity_type])
    style_lines.append(f"  {entity_type}: Object.freeze([{encoded}]),")
style_lines.extend(["});", "", "export default ENTITY_STYLE_PATHS;", ""])

(ROOT / "src/features/entity-overlay/styles.generated.js").write_text(
    "\n".join(style_lines),
    encoding="utf-8",
)


# 4) Make the entity contract part of every normal SPA validation.
spa_path = ROOT / ".github/ci/validate_spa_contracts.sh"
spa = spa_path.read_text(encoding="utf-8")
contract_line = (
    'node "${ROOT_DIR:-$(git rev-parse --show-toplevel)}/.github/scripts/'
    'entity_overlay_contract.mjs"'
)
if "entity_overlay_contract.mjs" not in spa:
    spa = spa.rstrip() + "\n\n" + contract_line + "\n"
    spa_path.write_text(spa, encoding="utf-8")


# 5) Remove all one-shot automation before committing the product code.
for relative in (
    ".github/workflows/tmp-entity-overlay-build.yml",
    ".github/workflows/tmp-entity-overlay-apply.yml",
    "tools/apply_entity_overlay.py",
):
    (ROOT / relative).unlink(missing_ok=True)

print("Entity overlay integration staged successfully")
