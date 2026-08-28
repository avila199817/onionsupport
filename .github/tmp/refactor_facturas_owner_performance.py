from pathlib import Path
import re

OVERLAY = Path("src/features/entity-overlay/index.js")
STYLES = Path("src/features/entity-overlay/styles.generated.js")
FACTURAS = Path("src/views/facturas/index.js")
TEMPLATE = Path("src/views/facturas/facturas.template.js")
ENTITY_CONTRACT = Path(".github/scripts/entity_overlay_contract.mjs")
FACTURAS_CONTRACT = Path(".github/scripts/facturas_continuous_scroll_contract.py")
ADAPTER = Path("src/features/entity-overlay/adapters/factura.js")

# -----------------------------------------------------------------------------
# Global entity overlay: Facturas becomes owner-routed, same authority principle
# as Incidencias. The overlay dispatches; it never renders a second Factura modal.
# -----------------------------------------------------------------------------
text = OVERLAY.read_text()
text = text.replace(
    "Despacha entidades desde cualquier punto de la SPA. Incidencias es siempre\n   propiedad de su vista/controlador canónico; las entidades simples conservan\n   overlay lazy mientras migran al mismo contrato propietario.",
    "Despacha entidades desde cualquier punto de la SPA. Incidencias y Facturas\n   pertenecen siempre a sus vistas/controladores canónicos; las entidades simples\n   conservan overlay lazy mientras migran al mismo contrato propietario.",
    1,
)
text = text.replace(
    '"entity-overlay.v2-incidencia-owner-authority"',
    '"entity-overlay.v3-factura-incidencia-owner-authority"',
    1,
)
text = text.replace(
    '  factura: () => import("./adapters/factura.js"),\n',
    '',
    1,
)

old_owner_constants = '''/*
  Incidencias tiene un controller de dominio completo (histórico, adjuntos,
  previews, borradores, edición, live sync y focus trap). Nunca se vuelve a
  renderizar su template directamente desde el overlay global.
*/
const OWNER_ROUTED_TYPES = new Set(["incidencia"]);
const INCIDENCIA_OWNER_SEGMENT = "incidencias";
const INCIDENCIA_MODAL_ROOT_SELECTOR = "[data-incidencias-modal-root='true']";
const OWNER_ROUTE_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const OWNER_OPEN_TIMEOUT_MS = 12_000;
'''
new_owner_constants = '''/*
  Los dominios con controller completo nunca vuelven a renderizar su template
  directamente desde el overlay global. El overlay sólo conserva la intención,
  navega a la vista propietaria y delega la apertura en su controller real.
*/
const OWNER_DEFINITIONS = Object.freeze({
  factura: Object.freeze({
    routeSegment: "facturas",
    modalSelector: "[data-facturas-detail-root='true']",
    load: () => import("../../views/facturas/index.js"),
    openerName: "openFacturaDetailById",
    detailPath: false,
  }),
  incidencia: Object.freeze({
    routeSegment: "incidencias",
    modalSelector: "[data-incidencias-modal-root='true']",
    load: () => import("../../views/incidencias/index.js"),
    openerName: "openIncidenciaDetailById",
    detailPath: true,
  }),
});
const OWNER_ROUTED_TYPES = new Set(Object.keys(OWNER_DEFINITIONS));
const OWNER_ROUTE_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const OWNER_OPEN_TIMEOUT_MS = 12_000;
'''
if old_owner_constants not in text:
    raise SystemExit("owner constants block not found")
text = text.replace(old_owner_constants, new_owner_constants, 1)

start = text.find("function incidenciaOwnerBasePath()")
end = text.find("async function open(input = {}) {")
if start < 0 or end < 0 or end <= start:
    raise SystemExit("owner bridge block anchors not found")

owner_bridge = r'''function ownerDefinition(type = "") {
  const entityType = normalizeEntityType(type);
  return OWNER_DEFINITIONS[entityType] || null;
}

function ownerBasePath(type = "") {
  const definition = ownerDefinition(type);
  if (!definition) return "";

  return `${currentScopePrefix()}/${definition.routeSegment}`
    .replace(/\/{2,}/g, "/");
}

function ownerTargetPath(type = "", id = "") {
  const entityType = normalizeEntityType(type);
  const entityId = normalizeEntityId(entityType, id);
  const definition = ownerDefinition(entityType);
  const base = ownerBasePath(entityType);

  if (!entityId || !definition || !base) return "";
  return definition.detailPath
    ? `${base}/${encodeURIComponent(entityId)}`
    : base;
}

function ownerRouteRoot() {
  if (!isBrowser()) return null;
  return document.querySelector(OWNER_ROUTE_ROOT_SELECTOR) || document.body || null;
}

function ownerCloseObservationRoot() {
  if (!isBrowser()) return null;
  return document.body || ownerRouteRoot();
}

function ownerModalOpen(type = "") {
  if (!isBrowser()) return false;
  const selector = ownerDefinition(type)?.modalSelector;
  return Boolean(selector && document.querySelector(selector));
}

function isOwnerRoute(type = "") {
  return isCanonicalOwnerRoute(type);
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

async function tryOpenCanonicalOwner(session = null) {
  if (!session || ownerSession !== session || session.sequence !== ownerSequence) {
    return false;
  }

  const definition = ownerDefinition(session.type);
  if (!definition || typeof definition.load !== "function") return false;

  try {
    const module = await definition.load();
    const opener = module?.[definition.openerName];
    if (typeof opener !== "function") return false;

    return Boolean(await opener(session.id, null));
  } catch {
    return false;
  }
}

function watchCanonicalOwnerClose(session = null) {
  if (!session || ownerSession !== session || !isBrowser()) return false;

  const root = ownerCloseObservationRoot();
  if (!root || typeof MutationObserver !== "function") return false;

  session.modalSeen = ownerModalOpen(session.type);
  session.closeObserver?.disconnect?.();
  session.closeObserver = new MutationObserver(() => {
    if (ownerSession !== session) return;

    const openNow = ownerModalOpen(session.type);
    if (openNow) {
      session.modalSeen = true;
      return;
    }

    if (!session.modalSeen) return;

    /*
      El controller propietario ya ha cerrado y limpiado el modal. Sólo vuelve
      al origen transversal si el usuario sigue en esa vista propietaria; una
      navegación explícita por sidebar/router siempre tiene prioridad.
    */
    stopOwnerSession({
      navigateBack: Boolean(session.returnPath) && isOwnerRoute(session.type),
    });
  });

  session.closeObserver.observe(root, { childList: true, subtree: true });
  return true;
}

async function waitAndOpenCanonicalOwner(session = null) {
  if (!session || !isBrowser()) return false;

  if (await tryOpenCanonicalOwner(session)) {
    watchCanonicalOwnerClose(session);
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
      if (ok) watchCanonicalOwnerClose(session);
      resolve(ok);
    };

    const attempt = async () => {
      if (attempting || settled || ownerSession !== session) return;
      attempting = true;
      try {
        if (await tryOpenCanonicalOwner(session)) finish(true);
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

async function openCanonicalOwner(input = {}) {
  const type = normalizeEntityType(input?.type || input?.entityType || "");
  const id = normalizeEntityId(type, input?.id || input?.entityId || "");
  if (!type || !id || !OWNER_ROUTED_TYPES.has(type) || !isBrowser()) return false;

  /* Un overlay previo nunca debe convivir con un controller propietario. */
  clearStack({ restore: false });
  writeUrlForEntry(null, "replace");
  stopOwnerSession();

  const alreadyOwner = isOwnerRoute(type);
  const returnPath = alreadyOwner ? "" : currentPublicPathWithoutEntityQuery();
  const target = ownerTargetPath(type, id);
  if (!target) return false;

  const session = {
    sequence: ++ownerSequence,
    type,
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
    const navigated = await navigateWithRouter(target, {
      source: `entity-overlay.owner.${type}`,
    });
    if (!navigated || ownerSession !== session) {
      stopOwnerSession();
      return false;
    }
  }

  const opened = await waitAndOpenCanonicalOwner(session);
  if (!opened && ownerSession === session) {
    stopOwnerSession({ navigateBack: Boolean(returnPath) });
    return false;
  }

  return Object.freeze({
    type,
    id,
    ownerRouted: true,
    source: session.source,
    target,
  });
}

'''
text = text[:start] + owner_bridge + text[end:]
text = text.replace(
    '''  if (normalized.type === "incidencia") {
    return openCanonicalIncidencia(normalized);
  }
''',
    '''  if (OWNER_ROUTED_TYPES.has(normalized.type)) {
    return openCanonicalOwner(normalized);
  }
''',
    1,
)
text = text.replace(
    '''  if (ownerSession && !isIncidenciaOwnerRoute()) {
    stopOwnerSession();
  }
''',
    '''  if (ownerSession && !isOwnerRoute(ownerSession.type)) {
    stopOwnerSession();
  }
''',
    1,
)
OVERLAY.write_text(text)

styles = STYLES.read_text()
styles = re.sub(
    r'^\s*factura:\s*Object\.freeze\(\[[^\n]*\]\),\n',
    '',
    styles,
    count=1,
    flags=re.M,
)
STYLES.write_text(styles)

if ADAPTER.exists():
    ADAPTER.unlink()

# -----------------------------------------------------------------------------
# Canonical Facturas controller: expose the real detail opener cross-route and
# cut the initial DOM batch in half for a lighter first render.
# -----------------------------------------------------------------------------
facturas = FACTURAS.read_text()
facturas = facturas.replace(
    '"facturas.index.productivo.v20.multi-line-create-polish"',
    '"facturas.index.productivo.v21.owner-authority-performance"',
    1,
)
facturas = facturas.replace(
    "const DEFAULT_BATCH_SIZE = 100;",
    "const DEFAULT_BATCH_SIZE = 50;",
    1,
)
facturas = facturas.replace(
    "let FACTURAS_CONTROLLER_SEQUENCE = 0;",
    "let FACTURAS_CONTROLLER_SEQUENCE = 0;\nlet lastFacturasController = null;",
    1,
)

destroy_anchor = '''      if (
        host?.[FACTURAS_CONTROLLER_KEY] === controller
      ) {
        host.replaceChildren();

        try {
          delete host[FACTURAS_CONTROLLER_KEY];
        } catch {
          host[FACTURAS_CONTROLLER_KEY] = null;
        }
      }

      return true;
'''
if destroy_anchor not in facturas:
    raise SystemExit("Facturas destroy anchor not found")
facturas = facturas.replace(
    destroy_anchor,
    destroy_anchor.replace(
        "\n      return true;\n",
        '''
      if (lastFacturasController === controller) {
        lastFacturasController = null;
      }

      return true;
''',
    ),
    1,
)

view_anchor = '''  const controller = createFacturasController(host, context);
  host[FACTURAS_CONTROLLER_KEY] = controller;

  return controller.mount();
}

export const FacturasIndex = FacturasView;

export default FacturasView;
'''
if view_anchor not in facturas:
    raise SystemExit("Facturas view export anchor not found")
view_replacement = '''  const controller = createFacturasController(host, context);
  host[FACTURAS_CONTROLLER_KEY] = controller;
  lastFacturasController = controller;

  return controller.mount();
}

export const FacturasIndex = FacturasView;

export async function openFacturaDetailById(
  facturaId = "",
  openerNode = null
) {
  try {
    if (
      !lastFacturasController ||
      typeof lastFacturasController.openFactura !== "function"
    ) {
      return false;
    }

    return Boolean(
      await lastFacturasController.openFactura(
        facturaId,
        openerNode
      )
    );
  } catch {
    return false;
  }
}

export default FacturasView;
'''
facturas = facturas.replace(view_anchor, view_replacement, 1)
facturas = facturas.replace(
    "          paymentModalCloseGuard: true,",
    "          paymentModalCloseGuard: true,\n          ownerAuthorityBridge: true,\n          initialBatchSize: DEFAULT_BATCH_SIZE,",
    1,
)
FACTURAS.write_text(facturas)

# -----------------------------------------------------------------------------
# Facturas template: truthful export label, visible retry on refresh failure,
# and remove misleading status counts that only reflected the current server
# query / loaded slice.
# -----------------------------------------------------------------------------
template = TEMPLATE.read_text()
template = template.replace(
    '"facturas.template.productivo.v20.multi-line-create-polish"',
    '"facturas.template.productivo.v21.runtime-polish"',
    1,
)
template = template.replace(
    "  const counts = computeFilterCounts(getInputItems(data), data);\n",
    "",
    1,
)
template = template.replace(
    '''<span>${escapeHtml(filter.label)}</span><strong>${escapeHtml(String(counts[filter.key] ?? 0))}</strong>''',
    '''<span>${escapeHtml(filter.label)}</span>''',
    1,
)
header_anchor = '''  const remoteCount = getRemoteTotal(data, stats.total);
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
'''
if header_anchor not in template:
    raise SystemExit("Facturas header anchor not found")
template = template.replace(
    header_anchor,
    '''  const remoteCount = getRemoteTotal(data, stats.total);
  const exportIsPartial = remoteCount > rows.length;
  const exportLabel = exportIsPartial ? "Exportar cargadas" : "Exportar CSV";
  const refreshing = Boolean(first(runtime.refreshing, data.refreshing));
''',
    1,
)
template = template.replace(
    '''<span class="facturas-btn-text">Exportar CSV</span>''',
    '''<span class="facturas-btn-text">${escapeHtml(exportLabel)}</span>''',
    1,
)
old_error_footer = '''    return `<div class="facturas-infinite" data-facturas-infinite="true" data-has-more="false" tabindex="-1"><div class="facturas-infinite-status is-error"><span class="facturas-infinite-error-icon" aria-hidden="true">${icon("alert")}</span><span>Actualización detenida. Usa Actualizar para reintentar.</span></div></div>`;'''
new_error_footer = '''    return `<div class="facturas-infinite" data-facturas-infinite="true" data-has-more="false" tabindex="-1"><div class="facturas-infinite-status is-error"><span class="facturas-infinite-error-icon" aria-hidden="true">${icon("alert")}</span><span>Actualización detenida.</span><button type="button" class="facturas-btn facturas-infinite-retry" data-facturas-action="${FACTURAS_ACTIONS.REFRESH}" data-action="${FACTURAS_ACTIONS.REFRESH}">${icon("refresh")}<span>Reintentar</span></button></div></div>`;'''
if old_error_footer not in template:
    raise SystemExit("Facturas refresh error footer not found")
template = template.replace(old_error_footer, new_error_footer, 1)
TEMPLATE.write_text(template)

# -----------------------------------------------------------------------------
# Contracts: prevent duplicate Factura overlays from coming back and lock the
# runtime/performance polish.
# -----------------------------------------------------------------------------
contract = ENTITY_CONTRACT.read_text()
contract = contract.replace(
    'for (const type of ["factura", "cliente", "usuario"]) {',
    'for (const type of ["cliente", "usuario"]) {',
    1,
)
contract = contract.replace(
    'assert.match(overlay, /OWNER_ROUTED_TYPES = new Set\\(\\["incidencia"\\]\\)/);',
    '''assert.match(overlay, /OWNER_DEFINITIONS/);\nassert.match(overlay, /factura:\\s*Object\\.freeze\\(\\{/);\nassert.match(overlay, /incidencia:\\s*Object\\.freeze\\(\\{/);\nassert.match(overlay, /openFacturaDetailById/);''',
    1,
)
contract = contract.replace(
    'assert.doesNotMatch(overlay, /adapters\\/incidencia\\.js/);',
    '''assert.doesNotMatch(overlay, /adapters\\/incidencia\\.js/);\nassert.doesNotMatch(overlay, /adapters\\/factura\\.js/);''',
    1,
)
contract = contract.replace(
    'assert.doesNotMatch(overlayStyles, /^\\s*incidencia:/m);',
    '''assert.doesNotMatch(overlayStyles, /^\\s*incidencia:/m);\nassert.doesNotMatch(overlayStyles, /^\\s*factura:/m);''',
    1,
)
contract = contract.replace(
    'const [homeTemplate, homeCss] = await Promise.all([',
    '''const facturasIndex = await read("src/views/facturas/index.js");\nassert.match(facturasIndex, /export async function openFacturaDetailById/);\nassert.match(facturasIndex, /const DEFAULT_BATCH_SIZE = 50;/);\n\nconst [homeTemplate, homeCss] = await Promise.all([''',
    1,
)
contract = contract.replace(
    '"Entity overlay contract: PASS · incidencia owner authority · lazy simple overlays · canonical deeplinks"',
    '"Entity overlay contract: PASS · factura/incidencia owner authority · lazy simple overlays · canonical deeplinks"',
    1,
)
ENTITY_CONTRACT.write_text(contract)

fact_contract = FACTURAS_CONTRACT.read_text()
insert_anchor = '# Runtime cache and stale fallbacks must never cross a server-query boundary.\n'
if insert_anchor not in fact_contract:
    raise SystemExit("Facturas contract insertion anchor not found")
insert = '''# Owner authority and first-render performance.\nrequire(INDEX, "const DEFAULT_BATCH_SIZE = 50;", "Facturas initial batch must stay bounded for a light first render")\nrequire(INDEX, "export async function openFacturaDetailById", "Facturas must expose its canonical detail opener")\nrequire(INDEX, "lastFacturasController", "Facturas canonical opener must target the mounted controller")\nrequire(TEMPLATE, "Exportar cargadas", "Partial CSV export must say that only loaded invoices are exported")\nrequire(TEMPLATE, "Actualización detenida.", "Refresh failure must expose actionable copy")\nrequire(TEMPLATE, 'data-facturas-action="${FACTURAS_ACTIONS.REFRESH}"', "Refresh failure must expose a retry action")\nreject(TEMPLATE, "Usa Actualizar para reintentar", "Facturas must not reference the removed manual Actualizar button")\nreject(TEMPLATE, "counts[filter.key]", "Server-filter pills must not display misleading partial counts")\n\n'''
fact_contract = fact_contract.replace(insert_anchor, insert + insert_anchor, 1)
FACTURAS_CONTRACT.write_text(fact_contract)
