from pathlib import Path
import re

OVERLAY = Path("src/features/entity-overlay/index.js")
STYLES = Path("src/features/entity-overlay/styles.generated.js")
CONTRACT = Path(".github/scripts/entity_overlay_contract.mjs")
ADAPTER = Path("src/features/entity-overlay/adapters/incidencia.js")

text = OVERLAY.read_text()
text = text.replace(
    "Abre una entidad desde cualquier punto de la SPA sin montar ni navegar a\n   la vista propietaria. Los adaptadores de dominio y sus CSS se importan sólo\n   cuando existe una intención real de apertura.",
    "Despacha entidades desde cualquier punto de la SPA. Incidencias es siempre\n   propiedad de su vista/controlador canónico; las entidades simples conservan\n   overlay lazy mientras migran al mismo contrato propietario.",
    1,
)
text = text.replace(
    '"entity-overlay.v1.global-lazy-stack"',
    '"entity-overlay.v2-incidencia-owner-authority"',
    1,
)
text = text.replace(
    '  incidencia: () => import("./adapters/incidencia.js"),\n',
    '',
    1,
)

adapter_anchor = '''const ADAPTER_LOADERS = Object.freeze({
  factura: () => import("./adapters/factura.js"),
  cliente: () => import("./adapters/cliente.js"),
  usuario: () => import("./adapters/usuario.js"),
});
'''
if adapter_anchor not in text:
    raise SystemExit("ADAPTER_LOADERS canonical block not found")

owner_constants = adapter_anchor + '''
/*
  Incidencias tiene un controller de dominio completo (histórico, adjuntos,
  previews, borradores, edición, live sync y focus trap). Nunca se vuelve a
  renderizar su template directamente desde el overlay global.
*/
const OWNER_ROUTED_TYPES = new Set(["incidencia"]);
const INCIDENCIA_OWNER_SEGMENT = "incidencias";
const INCIDENCIA_MODAL_ROOT_SELECTOR = "[data-incidencias-modal-root='true']";
const OWNER_ROUTE_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const OWNER_OPEN_TIMEOUT_MS = 12_000;

let ownerSequence = 0;
let ownerSession = null;
'''
text = text.replace(adapter_anchor, owner_constants, 1)

text = text.replace(
    '  if (!type || !id || !ADAPTER_LOADERS[type]) return null;',
    '  if (!type || !id || (!ADAPTER_LOADERS[type] && !OWNER_ROUTED_TYPES.has(type))) return null;',
    1,
)

open_anchor = 'async function open(input = {}) {'
if open_anchor not in text:
    raise SystemExit("open() anchor not found")

owner_helpers = r'''function currentPublicPathWithoutEntityQuery() {
  const url = currentUrl();
  if (!url) return "/";

  url.searchParams.delete(TYPE_QUERY);
  url.searchParams.delete(ID_QUERY);

  return `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
}

function currentScopePrefix() {
  const pathname = currentUrl()?.pathname || "";
  const match = pathname.match(/^\/@([^/]+)/);
  return match?.[1] ? `/@${match[1]}` : "";
}

function incidenciaOwnerBasePath() {
  return `${currentScopePrefix()}/${INCIDENCIA_OWNER_SEGMENT}`
    .replace(/\/{2,}/g, "/");
}

function incidenciaOwnerDetailPath(id = "") {
  const entityId = normalizeEntityId("incidencia", id);
  if (!entityId) return "";
  return `${incidenciaOwnerBasePath()}/${encodeURIComponent(entityId)}`;
}

function ownerRouteRoot() {
  if (!isBrowser()) return null;
  return document.querySelector(OWNER_ROUTE_ROOT_SELECTOR) || document.body || null;
}

function ownerModalOpen() {
  if (!isBrowser()) return false;
  return Boolean(document.querySelector(INCIDENCIA_MODAL_ROOT_SELECTOR));
}

function isIncidenciaOwnerRoute() {
  return isCanonicalOwnerRoute("incidencia");
}

async function navigateWithRouter(path = "", options = {}) {
  const target = cleanText(path, "");
  if (!target || !isBrowser()) return false;

  const router = context?.Router || context?.router || null;
  if (typeof router?.navigate === "function") {
    await Promise.resolve(router.navigate(target, options));
    return true;
  }

  /* Fallback de seguridad: no fabricamos un modal huérfano si Router falta. */
  try {
    window.location.assign(target);
    return true;
  } catch {
    return false;
  }
}

function stopOwnerSession({ navigateBack = false } = {}) {
  const session = ownerSession;
  ownerSession = null;

  if (!session) return false;

  session.openObserver?.disconnect?.();
  session.closeObserver?.disconnect?.();

  if (session.timeoutId) {
    window.clearTimeout(session.timeoutId);
    session.timeoutId = 0;
  }

  if (session.readyHandler) {
    window.removeEventListener("onion:main:ready", session.readyHandler);
    session.readyHandler = null;
  }

  if (navigateBack && session.returnPath) {
    const returnPath = session.returnPath;
    const scrollY = Number(session.scrollY) || 0;

    void navigateWithRouter(returnPath).then(() => {
      window.requestAnimationFrame?.(() => {
        try { window.scrollTo({ top: scrollY, left: 0, behavior: "auto" }); } catch { /* noop */ }
      });
    });
  }

  return true;
}

async function tryOpenCanonicalIncidencia(session = null) {
  if (!session || ownerSession !== session || session.sequence !== ownerSequence) {
    return false;
  }

  try {
    const module = await import("../../views/incidencias/index.js");
    const opener = module?.openIncidenciaDetailById;
    if (typeof opener !== "function") return false;

    return Boolean(await opener(session.id, null));
  } catch {
    return false;
  }
}

function watchCanonicalIncidenciaClose(session = null) {
  if (!session || ownerSession !== session || !isBrowser()) return false;

  const root = ownerRouteRoot();
  if (!root || typeof MutationObserver !== "function") return false;

  session.modalSeen = ownerModalOpen();
  session.closeObserver?.disconnect?.();
  session.closeObserver = new MutationObserver(() => {
    if (ownerSession !== session) return;

    const openNow = ownerModalOpen();
    if (openNow) {
      session.modalSeen = true;
      return;
    }

    if (!session.modalSeen) return;

    /*
      El controller propietario ya ha cerrado y limpiado el modal. Sólo ahora
      devolvemos al origen transversal (Inicio, búsqueda, etc.).
    */
    stopOwnerSession({ navigateBack: Boolean(session.returnPath) });
  });

  session.closeObserver.observe(root, { childList: true, subtree: true });
  return true;
}

async function waitAndOpenCanonicalIncidencia(session = null) {
  if (!session || !isBrowser()) return false;

  if (await tryOpenCanonicalIncidencia(session)) {
    watchCanonicalIncidenciaClose(session);
    return true;
  }

  const root = ownerRouteRoot();
  if (!root || typeof MutationObserver !== "function") return false;

  return new Promise((resolve) => {
    let settled = false;
    let attempting = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      session.openObserver?.disconnect?.();
      session.openObserver = null;
      if (session.timeoutId) {
        window.clearTimeout(session.timeoutId);
        session.timeoutId = 0;
      }
      if (session.readyHandler) {
        window.removeEventListener("onion:main:ready", session.readyHandler);
        session.readyHandler = null;
      }
      if (ok) watchCanonicalIncidenciaClose(session);
      resolve(ok);
    };

    const attempt = async () => {
      if (attempting || settled || ownerSession !== session) return;
      attempting = true;
      try {
        if (await tryOpenCanonicalIncidencia(session)) finish(true);
      } finally {
        attempting = false;
      }
    };

    session.openObserver = new MutationObserver(() => { void attempt(); });
    session.openObserver.observe(root, { childList: true, subtree: true });

    session.readyHandler = () => { void attempt(); };
    window.addEventListener("onion:main:ready", session.readyHandler);

    session.timeoutId = window.setTimeout(() => finish(false), OWNER_OPEN_TIMEOUT_MS);
    void attempt();
  });
}

async function openCanonicalIncidencia(input = {}) {
  const id = normalizeEntityId("incidencia", input?.id || input?.entityId || "");
  if (!id || !isBrowser()) return false;

  /* Un overlay previo nunca debe convivir con el controller de Incidencias. */
  clearStack({ restore: false });
  writeUrlForEntry(null, "replace");
  stopOwnerSession();

  const alreadyOwner = isIncidenciaOwnerRoute();
  const returnPath = alreadyOwner ? "" : currentPublicPathWithoutEntityQuery();
  const target = incidenciaOwnerDetailPath(id);
  if (!target) return false;

  const session = {
    sequence: ++ownerSequence,
    type: "incidencia",
    id,
    source: cleanText(input?.source, "api"),
    target,
    returnPath,
    scrollY: Number(window.scrollY) || 0,
    openObserver: null,
    closeObserver: null,
    timeoutId: 0,
    readyHandler: null,
    modalSeen: false,
  };

  ownerSession = session;

  if (!alreadyOwner) {
    const navigated = await navigateWithRouter(target);
    if (!navigated || ownerSession !== session) {
      stopOwnerSession();
      return false;
    }
  }

  const opened = await waitAndOpenCanonicalIncidencia(session);
  if (!opened && ownerSession === session) {
    stopOwnerSession({ navigateBack: Boolean(returnPath) });
    return false;
  }

  return Object.freeze({
    type: "incidencia",
    id,
    ownerRouted: true,
    source: session.source,
    target,
  });
}

'''
text = text.replace(open_anchor, owner_helpers + open_anchor, 1)

text = text.replace(
    '''  const normalized = normalizeOpenInput(input);\n  if (!normalized) {\n    throw new TypeError("Entidad o identificador no válidos.");\n  }\n''',
    '''  const normalized = normalizeOpenInput(input);\n  if (!normalized) {\n    throw new TypeError("Entidad o identificador no válidos.");\n  }\n\n  if (normalized.type === "incidencia") {\n    return openCanonicalIncidencia(normalized);\n  }\n''',
    1,
)

can_pattern = re.compile(
    r'''function canOpen\(type = "", id = ""\) \{\n  const entityType = normalizeEntityType\(type\);\n  return Boolean\(\n    entityType &&\n    ADAPTER_LOADERS\[entityType\] &&\n    normalizeEntityId\(entityType, id\)\n  \);\n\}'''
)
can_replacement = '''function canOpen(type = "", id = "") {\n  const entityType = normalizeEntityType(type);\n  return Boolean(\n    entityType &&\n    (ADAPTER_LOADERS[entityType] || OWNER_ROUTED_TYPES.has(entityType)) &&\n    normalizeEntityId(entityType, id)\n  );\n}'''
text, count = can_pattern.subn(can_replacement, text, count=1)
if count != 1:
    raise SystemExit("canOpen block not found")

# Owner session is cancelled if history leaves the canonical owner flow.
pop_anchor = '''function onPopstate() {\n  clearCloseFallback();\n'''
if pop_anchor not in text:
    raise SystemExit("onPopstate anchor not found")
text = text.replace(
    pop_anchor,
    '''function onPopstate() {\n  clearCloseFallback();\n\n  if (ownerSession && !isIncidenciaOwnerRoute()) {\n    stopOwnerSession();\n  }\n''',
    1,
)

# Destroy must also tear down owner observers.
destroy_anchor = '''  clearCloseFallback();\n  clearStack({ restore: false });\n'''
if destroy_anchor not in text:
    raise SystemExit("destroy anchor not found")
text = text.replace(
    destroy_anchor,
    '''  clearCloseFallback();\n  stopOwnerSession();\n  clearStack({ restore: false });\n''',
    1,
)

# Snapshot exposes the authority decision without sensitive IDs.
snapshot_anchor = '''    registeredTypes: Object.freeze(Object.keys(ADAPTER_LOADERS)),\n    loadedAdapters: Object.freeze([...adapterPromises.keys()]),\n'''
if snapshot_anchor not in text:
    raise SystemExit("snapshot anchor not found")
text = text.replace(
    snapshot_anchor,
    '''    registeredTypes: Object.freeze([\n      ...Object.keys(ADAPTER_LOADERS),\n      ...OWNER_ROUTED_TYPES,\n    ]),\n    loadedAdapters: Object.freeze([...adapterPromises.keys()]),\n    ownerRouted: ownerSession\n      ? Object.freeze({ type: ownerSession.type, active: true })\n      : null,\n''',
    1,
)

OVERLAY.write_text(text)

styles = STYLES.read_text()
styles = re.sub(
    r'^\s*incidencia:\s*Object\.freeze\(\[[^\n]*\]\),\n',
    '',
    styles,
    count=1,
    flags=re.M,
)
STYLES.write_text(styles)

contract = CONTRACT.read_text()
contract = contract.replace(
    'for (const type of ["factura", "incidencia", "cliente", "usuario"]) {',
    'for (const type of ["factura", "cliente", "usuario"]) {',
    1,
)
contract = contract.replace(
    'assert.match(overlay, /document\\.addEventListener\\("click",\\s*onDocumentClick,\\s*true\\)/);',
    '''assert.match(overlay, /document\\.addEventListener\\("click",\\s*onDocumentClick,\\s*true\\)/);\nassert.match(overlay, /OWNER_ROUTED_TYPES = new Set\\(\\["incidencia"\\]\\)/);\nassert.match(overlay, /openCanonicalIncidencia/);\nassert.match(overlay, /openIncidenciaDetailById/);\nassert.match(overlay, /INCIDENCIA_MODAL_ROOT_SELECTOR/);\nassert.match(overlay, /context\\?\\.Router \\|\\| context\\?\\.router/);\nassert.match(overlay, /navigateWithRouter\\(target\\)/);\nassert.doesNotMatch(overlay, /adapters\\/incidencia\\.js/);''',
    1,
)
contract = contract.replace(
    'const [homeTemplate, homeCss] = await Promise.all([',
    '''const overlayStyles = await read("src/features/entity-overlay/styles.generated.js");\nassert.doesNotMatch(overlayStyles, /^\\s*incidencia:/m);\n\nconst [homeTemplate, homeCss] = await Promise.all([''',
    1,
)
contract = contract.replace(
    '"Entity overlay contract: PASS · lazy overlays · canonical incidencia owner deeplinks"',
    '"Entity overlay contract: PASS · incidencia owner authority · lazy simple overlays · canonical deeplinks"',
    1,
)
CONTRACT.write_text(contract)

if ADAPTER.exists():
    ADAPTER.unlink()
