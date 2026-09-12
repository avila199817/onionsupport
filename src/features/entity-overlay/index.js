import "../../css/features/entity-overlay.css";
import { AppCore } from "../../core/index.js";
import { createAsyncScope } from "../../core/async-scope.js";
import { getRouteByViewKey } from "../../router/routes.js";
import { createModalLifecycle, restoreModalFocus } from "./modal-lifecycle.js";
import { inferEntityIntent, inferEntityIntentFromElement, normalizeEntityId, normalizeEntityType } from "./intent.js";
import { ENTITY_STYLE_PATHS } from "./styles.generated.js";
import { cleanText, renderDetailPending, safeError } from "./pending-view.js";

/* One session dispatches every entity detail, from Home, lists, relations and
   deeplinks. Domain controllers own rendering, requests and close policy. */
export const ENTITY_OVERLAY_VERSION = "entity-overlay.v5-single-detail-session";
const ROOT_ID = "entity-overlay-root";
const PANEL_SELECTOR = "[data-entity-overlay-panel='true']";
const ROUTE_HOST_SELECTOR = "[data-route-host='true'][data-route-host-state='ready']:not([hidden])";
const STYLE_TIMEOUT_MS = 4_000;
const OWNER_DEFINITIONS = Object.freeze({
  factura: Object.freeze({
    viewKey: "facturas", load: () => import("../../views/facturas/index.js"),
    createName: "createFacturaDetailController", openName: "openFactura",
    styles: Object.freeze(["/src/css/views/facturas/detail.css", "/src/css/views/facturas/resend-confirm.css"]),
  }),
  incidencia: Object.freeze({
    viewKey: "incidencias", load: () => import("../../views/incidencias/index.js"),
    createName: "createIncidenciaDetailController", prepareName: "prepareIncidenciaDetail", openName: "openDetail",
    styles: Object.freeze(["/src/css/components/detail-modal.css", "/src/css/views/incidencias/detail.css", "/src/css/views/incidencias/media-preview.css"]),
  }),
  cliente: Object.freeze({
    viewKey: "clientes", load: () => import("../../views/clientes/index.js"),
    createName: "createClienteDetailController", openName: "openDetail", styles: ENTITY_STYLE_PATHS.cliente,
  }),
  usuario: Object.freeze({
    viewKey: "usuarios", load: () => import("../../views/usuarios/index.js"),
    createName: "createUsuarioDetailController", openName: "openDetail", styles: ENTITY_STYLE_PATHS.usuario,
  }),
});
const ownerPromises = new Map();
const stylePromises = new Map();
const subscribers = new Set();
const activatedOrigins = new WeakSet();
let initialized = false;
let destroying = false;
let root = null;
let context = {};
let ownerSession = null;
let sessionSequence = 0;
const modalLifecycle = createModalLifecycle({
  getPanel: () => root?.querySelector(PANEL_SELECTOR), onEscape: () => close(), bodyClasses: ["entity-overlay-open"],
});

function isBrowser() { return typeof window !== "undefined" && typeof document !== "undefined"; }
function canAccessEntity(type) {
  const route = getRouteByViewKey(OWNER_DEFINITIONS[type]?.viewKey || "");
  if (!route) return false;
  try {
    const authenticated = AppCore.isAuthenticated?.() === true || AppCore.runtimeState?.read?.()?.authenticated === true;
    return authenticated && (!route.roles?.length || AppCore.hasRole?.(route.roles) === true);
  } catch { return false; }
}
function safeActiveElement() {
  return isBrowser() && document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
function ensureRoot() {
  if (!isBrowser()) return null;
  if (root?.isConnected) return root;
  root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "entity-overlay-root";
    root.dataset.entityOverlayRoot = "true";
    root.hidden = true;
    document.body.appendChild(root);
  }
  return root;
}
function clearPending(session) {
  // A former owner's destroy callback may already have opened a new session.
  if (root?.dataset.entitySession !== String(session.sequence)) return;
  root.replaceChildren();
  root.hidden = true;
  delete root.dataset.entitySession;
  modalLifecycle.deactivate({ restoreFocus: false });
}
function notify(phase, session) {
  const event = Object.freeze({ phase, type: session.type, id: session.id, originHost: session.originHost });
  for (const listener of [...subscribers]) {
    try { listener(event); } catch { /* A list cannot retain a closed detail. */ }
  }
}
export function subscribe(listener) {
  if (typeof listener !== "function") throw new TypeError("A detail listener is required.");
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
export function isOriginOpen(host) {
  return Boolean(host && ownerSession?.originHost === host && ownerSession.scope.isActive());
}
function committedOrigin(opener, originHost) {
  if (originHost) return originHost.isConnected && originHost.matches?.(ROUTE_HOST_SELECTOR) ? originHost : null;
  // An old row can finish a lazy wrapper after navigation. Never silently
  // adopt the new page as the origin of that stale action.
  if (opener && !opener.isConnected) return null;
  const openerHost = opener?.closest?.("[data-route-host='true']");
  if (openerHost) return openerHost.matches(ROUTE_HOST_SELECTOR) ? openerHost : null;
  return document.querySelector(ROUTE_HOST_SELECTOR);
}
function ownerIsCurrent(session) {
  return ownerSession === session && session.scope.isActive() && session.originHost?.isConnected && session.originHost.matches(ROUTE_HOST_SELECTOR);
}
function ownerReturnTarget(session) {
  if (session.opener?.isConnected) return session.opener;
  if (!session.originHost?.isConnected) return null;
  const row = [...session.originHost.querySelectorAll([
    "[data-entity-id]", "[data-factura-id]", "[data-invoice-id]", "[data-incidencia-id]",
    "[data-ticket-id]", "[data-cliente-id]", "[data-client-id]", "[data-usuario-id]", "[data-user-id]",
  ].join(","))].find((node) => {
    const intent = inferEntityIntentFromElement(node);
    return intent?.type === session.openerType && intent.id === session.openerId;
  });
  if (row) {
    if (row.tabIndex < 0 && !row.hasAttribute("tabindex")) row.tabIndex = -1;
    return row;
  }
  const heading = session.originHost.querySelector("h1");
  if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  return heading || null;
}
function stopOwnerSession({ restore = false, reason = "detail-closed" } = {}) {
  const session = ownerSession;
  if (!session) return false;
  session.restoreFocus = restore;
  session.scope.dispose(reason);
  return true;
}
export function releaseOrigin(host) {
  return host && ownerSession?.originHost === host ? stopOwnerSession({ reason: "origin-released" }) : false;
}
function ensureStyle(path) {
  const href = new URL(path, document.baseURI).href;
  if (stylePromises.has(href)) return stylePromises.get(href);
  const existing = [...document.querySelectorAll("link[rel='stylesheet']")].find((link) => link.href === href);
  if (existing?.sheet) return Promise.resolve(true);
  const promise = new Promise((resolve) => {
    const link = existing || document.createElement("link");
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      link.removeEventListener("load", onLoad);
      link.removeEventListener("error", onError);
      stylePromises.delete(href);
      if (!ok && !existing) link.remove();
      resolve(ok);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timeout = window.setTimeout(() => finish(Boolean(link.sheet)), STYLE_TIMEOUT_MS);
    link.addEventListener("load", onLoad, { once: true });
    link.addEventListener("error", onError, { once: true });
    if (!existing) {
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.entityOverlayStyle = "true";
      document.head.appendChild(link);
    }
  });
  stylePromises.set(href, promise);
  return promise;
}
export async function preload(type = "") {
  const key = normalizeEntityType(type);
  const definition = OWNER_DEFINITIONS[key];
  if (!definition || !isBrowser() || !canAccessEntity(key)) return false;
  if (!ownerPromises.has(key)) {
    const task = definition.load().catch((error) => { ownerPromises.delete(key); throw error; });
    ownerPromises.set(key, task);
  }
  const [module, styles] = await Promise.all([ownerPromises.get(key), Promise.all(definition.styles.map(ensureStyle))]);
  if (!styles.every(Boolean)) throw new Error("No se pudieron cargar los estilos del detalle.");
  if (definition.prepareName) await module[definition.prepareName]();
  return true;
}
function renderOwnerPending(session, error = null) {
  if (!ownerIsCurrent(session)) return false;
  const host = ensureRoot();
  session.error = error;
  host.dataset.entitySession = String(session.sequence);
  host.hidden = false;
  host.innerHTML = renderDetailPending({ type: session.type, id: session.id, error: error && safeError(error) });
  modalLifecycle.activate({ opener: session.opener });
  host.querySelector(PANEL_SELECTOR)?.focus({ preventScroll: true });
  return true;
}
function close() {
  const session = ownerSession;
  if (!session) return false;
  if (session.controller) {
    const controller = session.controller;
    const closed = controller.closeDetailModal();
    // A draft confirmation consumes the action while keeping the detail open.
    if (closed === false || controller.getSnapshot().detailModalOpen) return false;
  }
  if (ownerSession === session) stopOwnerSession({ restore: true });
  return true;
}
async function openCanonicalOwner(input) {
  const { type, id, opener, signal } = input;
  const definition = OWNER_DEFINITIONS[type];
  if (!isBrowser() || !canAccessEntity(type) || signal?.aborted) return false;
  const originHost = committedOrigin(opener, input.originHost);
  if (!originHost) return false;
  if (ownerSession?.type === type && ownerSession.id === id && ownerSession.originHost === originHost && !ownerSession.error && ownerIsCurrent(ownerSession)) {
    return ownerSession.task || true;
  }
  if (ownerSession && !close()) return false;
  // A closed subscriber may synchronously open another detail. Preserve it.
  if (ownerSession) return false;
  const session = {
    type, id, originHost, opener, sequence: ++sessionSequence,
    openerType: opener?.dataset?.entityType || type, openerId: opener?.dataset?.entityId || id,
    scope: createAsyncScope({ signal }), controller: null, modalHost: null,
    source: cleanText(input.source, "api"), signal, error: null, task: null, restoreFocus: false,
  };
  ownerSession = session;
  session.scope.onDispose(() => {
    if (ownerSession === session) ownerSession = null;
    try { session.controller?.destroy?.(); }
    finally {
      session.controller = null;
      clearPending(session);
      notify("closed", session);
      if (session.restoreFocus && !ownerSession) restoreModalFocus(ownerReturnTarget(session));
    }
  });
  notify("opened", session);
  // The origin owns cancellation before imports or detail I/O start.
  renderOwnerPending(session);
  const task = (async () => {
    try {
      if (!ownerIsCurrent(session)) return false;
      if (!await preload(type) || !canAccessEntity(type)) {
        if (ownerSession === session) stopOwnerSession({ reason: "access-unavailable" });
        return false;
      }
      if (!ownerIsCurrent(session)) return false;
      const module = await ownerPromises.get(type);
      if (!ownerIsCurrent(session)) return false;
      const controller = await module[definition.createName]({
        ...context, signal: session.scope.signal,
        onDetailShell(detail = {}) {
          if (!ownerIsCurrent(session)) return;
          session.modalHost = detail.modalHost || detail.host || null;
          clearPending(session);
        },
        onDetailClosed() { if (ownerSession === session) stopOwnerSession({ restore: true }); },
        openEntityDetail(relation) {
          return open({ ...relation, opener: relation.opener || ownerReturnTarget(session), source: `${type}.relation` });
        },
      });
      if (!ownerIsCurrent(session)) { controller?.destroy?.(); return false; }
      session.controller = controller;
      if (!controller || typeof controller[definition.openName] !== "function" || typeof controller.closeDetailModal !== "function" || typeof controller.getSnapshot !== "function") {
        throw new Error("No se pudo preparar el detalle. Puedes reintentarlo.");
      }
      const opened = await controller[definition.openName](id, opener);
      if (!ownerIsCurrent(session)) return false;
      if (opened || controller.getSnapshot().detailModalOpen) return Boolean(opened);
      throw new Error("No se pudo cargar el detalle. Puedes reintentarlo.");
    } catch (error) {
      if (!ownerIsCurrent(session)) return false;
      const controller = session.controller;
      session.controller = null;
      try { controller?.destroy?.(); } catch { /* Cleanup cannot hide the retry surface. */ }
      renderOwnerPending(session, error);
      return false;
    }
  })();
  session.task = task;
  return task;
}
async function open(input = {}) {
  if (destroying) return false;
  if (!initialized) init(context);
  const type = normalizeEntityType(input.type || input.entityType || "");
  const id = normalizeEntityId(type, input.id || input.entityId || "");
  if (!OWNER_DEFINITIONS[type] || !id) throw new TypeError("Entidad o identificador no válidos.");
  return openCanonicalOwner({ ...input, type, id, opener: input.opener || safeActiveElement() });
}
function canOpen(type = "", id = "") {
  const key = normalizeEntityType(type);
  return Boolean(OWNER_DEFINITIONS[key] && normalizeEntityId(key, id) && canAccessEntity(key));
}
function onDocumentClick(event) {
  if (!event || event.defaultPrevented || event.__onionRouterHandled || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
  if (root?.contains(target)) {
    const action = target.closest?.("[data-entity-overlay-action]")?.dataset.entityOverlayAction;
    if (action !== "retry" && action !== "close" && !target.matches?.("[data-entity-overlay-backdrop='true']")) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "retry" && ownerSession) {
      const { type, id, opener, originHost, signal } = ownerSession;
      stopOwnerSession();
      if (!ownerSession) void open({ type, id, opener, originHost, signal, source: "detail.retry" });
    } else close();
    return;
  }
  // Once the domain owns its shell, every control and backdrop belongs to
  // that controller. IDs on the shell never become another open intention.
  if (ownerSession?.modalHost?.contains(target)) return;
  const intent = inferEntityIntentFromElement(target);
  if (!intent || !canOpen(intent.type, intent.id)) return;
  event.preventDefault();
  event.stopPropagation();
  void open({ ...intent, source: "global-dom", opener: target.closest?.("a,button,[role='button'],[data-route]") || target });
}
// Read legacy links only after their origin has committed. Modals never write
// browser history or create a second routing stack.
export function activateOrigin(host) {
  if (!initialized || !host?.isConnected || !host.matches(ROUTE_HOST_SELECTOR) || activatedOrigins.has(host)) return false;
  activatedOrigins.add(host);
  const url = new URL(window.location.href);
  const intent = inferEntityIntent({ type: url.searchParams.get("entity"), id: url.searchParams.get("entityId") });
  if (!intent || ownerSession) return false;
  void open({ ...intent, originHost: host, source: "url" });
  return true;
}
export function init(options = {}) {
  if (!isBrowser() || destroying) return EntityOverlay;
  context = { ...context, ...options };
  ensureRoot();
  try {
    AppCore.registerModule?.("entities", EntityOverlay);
    AppCore.registerModule?.("entity-overlay", EntityOverlay);
    if (!AppCore.entities) Object.defineProperty(AppCore, "entities", { value: EntityOverlay, configurable: true });
  } catch { /* The module registry remains the integration boundary. */ }
  if (!initialized) {
    document.addEventListener("click", onDocumentClick, true);
    initialized = true;
  }
  activateOrigin(document.querySelector(ROUTE_HOST_SELECTOR));
  return EntityOverlay;
}
export function onSessionInvalidated() {
  if (destroying) return false;
  // Authorization loss is teardown, not a user close subject to draft guards.
  // Block synchronous closed subscribers from reopening during invalidation.
  destroying = true;
  try { return stopOwnerSession({ reason: "session-invalidated" }); }
  finally { destroying = false; }
}
export function destroy() {
  if (destroying) return false;
  destroying = true;
  try {
    if (isBrowser() && initialized) document.removeEventListener("click", onDocumentClick, true);
    initialized = false;
    stopOwnerSession({ reason: "runtime-destroyed" });
    return true;
  } finally { destroying = false; }
}
function snapshot() {
  return Object.freeze({
    version: ENTITY_OVERLAY_VERSION, initialized, open: Boolean(ownerSession), depth: ownerSession ? 1 : 0,
    current: ownerSession ? Object.freeze({ type: ownerSession.type, id: ownerSession.id, source: ownerSession.source,
      loading: !ownerSession.controller && !ownerSession.error, hasError: Boolean(ownerSession.error) }) : null,
    registeredTypes: Object.freeze(Object.keys(OWNER_DEFINITIONS)), loadedOwners: Object.freeze([...ownerPromises.keys()]),
    ownerDetail: ownerSession ? Object.freeze({ type: ownerSession.type, active: true }) : null,
  });
}
export const EntityOverlay = Object.freeze({
  version: ENTITY_OVERLAY_VERSION, init, destroy, open, openEntity: open, close,
  canOpen, preload, releaseOrigin, activateOrigin, subscribe, isOriginOpen, onSessionInvalidated,
  getSnapshot: snapshot, normalizeType: normalizeEntityType, normalizeId: normalizeEntityId,
});
export default EntityOverlay;
