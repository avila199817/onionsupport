import "../../css/features/entity-overlay.css";
import { createAsyncScope } from "../../core/async-scope.js";
import { createModalLifecycle, modalFocusableElements, restoreModalFocus } from "./modal-lifecycle.js";
/* =========================================================
   Onion Support - Global Entity Overlay

   Un único despachador para todas las vistas privadas. Incidencias y Facturas
   montan el mismo controller de detalle que su vista, sin navegar ni montar
   listados invisibles. Los datos y las acciones pertenecen al dominio.
========================================================= */

import { AppCore } from "../../core/index.js";
import { getRouteByViewKey } from "../../router/routes.js";

import {
  inferEntityIntent,
  inferEntityIntentFromElement,
  normalizeEntityId,
  normalizeEntityType,
} from "./intent.js";

import { ENTITY_STYLE_PATHS } from "./styles.generated.js";

import {
  cleanText,
  renderAdapterError,
  renderAdapterLoading,
  safeError,
} from "./adapters/adapter-utils.js";

export const ENTITY_OVERLAY_VERSION =
  "entity-overlay.v4-central-domain-detail";

const ROOT_ID = "entity-overlay-root";
const ROOT_SELECTOR = `#${ROOT_ID}`;
const BODY_CLASS = "entity-overlay-open";
const TYPE_QUERY = "entity";
const ID_QUERY = "entityId";
const HISTORY_KEY = "__onionEntityOverlay";
const MAX_STACK_DEPTH = 8;
const STYLE_TIMEOUT_MS = 4_000;
const CLOSE_HISTORY_FALLBACK_MS = 450;

const ADAPTER_LOADERS = Object.freeze({
  cliente: () => import("./adapters/cliente.js"),
  usuario: () => import("./adapters/usuario.js"),
});

const OWNER_DEFINITIONS = Object.freeze({
  factura: Object.freeze({
    load: () => import("../../views/facturas/index.js"),
    createName: "createFacturaDetailController",
    openName: "openFactura",
    routeOpenName: "openFacturaDetailById",
    modalSelector: "[data-facturas-detail-root='true']",
    styles: Object.freeze(["/src/css/views/facturas/detail.css"]),
  }),
  incidencia: Object.freeze({
    load: () => import("../../views/incidencias/index.js"),
    createName: "createIncidenciaDetailController",
    prepareName: "prepareIncidenciaDetail",
    openName: "openDetail",
    routeOpenName: "openIncidenciaDetailById",
    modalSelector: "[data-incidencias-modal-root='true']",
    styles: Object.freeze([
      "/src/css/components/detail-modal.css",
      "/src/css/views/incidencias/detail.css",
      "/src/css/views/incidencias/media-preview.css",
    ]),
  }),
});
const OWNER_TYPES = new Set(Object.keys(OWNER_DEFINITIONS));
const ROUTE_HOST_SELECTOR = "[data-route-host='true'][data-route-host-state='ready']:not([hidden])";
const ownerPromises = new Map();
let ownerSession = null;

const ACTION_SELECTOR = [
  "[data-entity-overlay-action]",
  "[data-facturas-action]",
  "[data-factura-action]",
  "[data-incidencias-action]",
  "[data-incidencia-action]",
  "[data-ticket-action]",
  "[data-clientes-action]",
  "[data-cliente-action]",
  "[data-usuarios-action]",
  "[data-usuario-action]",
  "[data-action]",
].join(",");

const PANEL_SELECTOR = [
  "[data-entity-overlay-panel='true']",
  "[data-facturas-detail-modal='true']",
  "[data-incidencias-detail-modal='true']",
  "[data-incidencia-detail-modal='true']",
  "[data-clientes-detail-modal='true']",
  "[data-usuarios-detail-modal='true']",
  "[role='dialog']",
].join(",");

const BACKDROP_SELECTOR = [
  "[data-entity-overlay-backdrop='true']",
  "[data-facturas-detail-overlay='true']",
  "[data-incidencias-detail-overlay='true']",
  "[data-incidencia-detail-overlay='true']",
  "[data-clientes-detail-overlay='true']",
  "[data-usuarios-detail-overlay='true']",
].join(",");

let initialized = false;
let root = null;
let context = {};
let stack = [];
let tokenSequence = 0;
let renderSequence = 0;
let closeFallbackTimer = 0;
let lastGlobalOpener = null;
const modalLifecycle = createModalLifecycle({
  getPanel: () => root?.querySelector(PANEL_SELECTOR),
  onEscape: () => close(),
  bodyClasses: [BODY_CLASS],
});
let documentClickBound = false;
let popstateBound = false;

const stylePromises = new Map();
const adapterPromises = new Map();

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function authenticated() {
  try {
    return AppCore.isAuthenticated?.() === true ||
      AppCore.runtimeState?.read?.()?.authenticated === true;
  } catch { return false; }
}

function canAccessEntity(type = "") {
  const viewKey = { factura: "facturas", incidencia: "incidencias", cliente: "clientes", usuario: "usuarios" }[type];
  const route = viewKey && getRouteByViewKey(viewKey);
  if (!route || !authenticated()) return false;
  const roles = Array.isArray(route.roles) ? route.roles : [];
  // The route table and Core own role policy. Quick views cannot expand it.
  return roles.length === 0 || AppCore.hasRole?.(roles) === true;
}

function currentUrl() {
  if (!isBrowser()) return null;

  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

function currentMarker() {
  try {
    const marker = window.history.state?.[HISTORY_KEY];
    return marker && typeof marker === "object" ? marker : null;
  } catch {
    return null;
  }
}

function createToken() {
  tokenSequence += 1;
  return `entity-${Date.now().toString(36)}-${tokenSequence.toString(36)}`;
}

function topEntry() {
  return stack[stack.length - 1] || null;
}

function entryIsCurrent(entry = null) {
  return Boolean(entry && topEntry() === entry && stack.includes(entry));
}

function safeActiveElement() {
  if (!isBrowser()) return null;

  try {
    return document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  } catch {
    return null;
  }
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
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
  }

  return root;
}

function lockBody() {
  return modalLifecycle.activate({ opener: lastGlobalOpener });
}

function unlockBody() {
  return modalLifecycle.deactivate({ restoreFocus: false });
}

function restoreFocus() {
  const target = lastGlobalOpener;
  lastGlobalOpener = null;
  return restoreModalFocus(target);
}

function normalizeOpenInput(input = {}) {
  const type = normalizeEntityType(input?.type || input?.entityType || "");
  const id = normalizeEntityId(type, input?.id || input?.entityId || "");

  if (!type || !id || (!ADAPTER_LOADERS[type] && !OWNER_TYPES.has(type))) return null;

  return {
    type,
    id,
    source: cleanText(input?.source, "api"),
    seed: input?.seed && typeof input.seed === "object" ? input.seed : null,
    mode: input?.mode === "replace" ? "replace" : "push",
    historyMode: ["push", "replace", "none"].includes(input?.historyMode)
      ? input.historyMode
      : "push",
    token: cleanText(input?.token, "") || createToken(),
    opener: input?.opener || safeActiveElement(),
    signal: input?.signal || null,
  };
}

function stylePaths(type = "") {
  const domainPaths = Array.isArray(ENTITY_STYLE_PATHS[type])
    ? ENTITY_STYLE_PATHS[type]
    : [];

  return domainPaths.filter(Boolean);
}

function absolutePath(path = "") {
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return cleanText(path, "");
  }
}

function ensureStyle(path = "") {
  const href = absolutePath(path);
  if (!href || !isBrowser()) return Promise.resolve(false);
  if (stylePromises.has(href)) return stylePromises.get(href);

  const existing = Array.from(document.querySelectorAll("link[rel='stylesheet']"))
    .find((link) => link.href === href);

  if (existing?.sheet) {
    return Promise.resolve(true);
  }

  const promise = new Promise((resolve) => {
    const link = existing || document.createElement("link");
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      link.removeEventListener("load", onLoad);
      link.removeEventListener("error", onError);
      stylePromises.delete(href);
      if (!ok && !existing) link.remove();
      resolve(ok);
    };

    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timeoutId = window.setTimeout(() => finish(Boolean(link.sheet)), STYLE_TIMEOUT_MS);

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

async function ensureStyles(type = "") {
  await Promise.all(stylePaths(type).map((path) => ensureStyle(path)));
  return true;
}

async function loadAdapter(type = "") {
  const key = normalizeEntityType(type);
  if (!key || !ADAPTER_LOADERS[key]) {
    throw new Error("ENTITY_ADAPTER_NOT_REGISTERED");
  }

  if (!adapterPromises.has(key)) {
    adapterPromises.set(
      key,
      Promise.resolve()
        .then(() => ADAPTER_LOADERS[key]())
        .then((module) => module?.default || module?.[`${key[0].toUpperCase()}${key.slice(1)}EntityAdapter`] || module)
    );
  }

  return adapterPromises.get(key);
}

function urlIntent() {
  const url = currentUrl();
  if (!url) return null;

  return inferEntityIntent({
    type: url.searchParams.get(TYPE_QUERY),
    id: url.searchParams.get(ID_QUERY),
    source: "url",
  });
}

function markerFor(entry = null) {
  if (!entry) return null;

  return Object.freeze({
    token: entry.token,
    type: entry.type,
    id: entry.id,
    depth: Math.max(1, stack.indexOf(entry) + 1),
  });
}

function writeUrlForEntry(entry = null, mode = "replace") {
  if (!isBrowser()) return false;

  const url = currentUrl();
  if (!url) return false;

  if (entry) {
    url.searchParams.set(TYPE_QUERY, entry.type);
    url.searchParams.set(ID_QUERY, entry.id);
  } else {
    url.searchParams.delete(TYPE_QUERY);
    url.searchParams.delete(ID_QUERY);
  }

  const nextState = {
    ...(window.history.state || {}),
  };

  if (entry) {
    nextState[HISTORY_KEY] = markerFor(entry);
  } else {
    delete nextState[HISTORY_KEY];
  }

  const method = mode === "push" ? "pushState" : "replaceState";

  try {
    window.history[method](
      nextState,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    return true;
  } catch {
    return false;
  }
}

function clearCloseFallback() {
  if (!closeFallbackTimer || !isBrowser()) return false;
  window.clearTimeout(closeFallbackTimer);
  closeFallbackTimer = 0;
  return true;
}

function abortEntry(entry = null) {
  try {
    entry?.abortController?.abort?.();
  } catch {
    // noop
  }
}

function disposeEntry(entry = null) {
  if (!entry) return false;
  abortEntry(entry);

  try {
    entry.adapter?.dispose?.({
      entry,
      root,
      api: EntityOverlay,
    });
  } catch {
    // noop
  }

  return true;
}

function clearRoot() {
  const host = ensureRoot();
  if (!host) return false;

  host.replaceChildren();
  host.hidden = true;
  delete host.dataset.entityType;
  delete host.dataset.entityId;
  delete host.dataset.entityDepth;
  return true;
}

function clearStack({ restore = true } = {}) {
  for (const entry of stack) disposeEntry(entry);
  stack = [];
  clearRoot();
  unlockBody();
  if (restore) restoreFocus();
  return true;
}

function feedbackHtml(feedback = null) {
  const message = cleanText(feedback?.message, "");
  if (!message) return "";

  const type = cleanText(feedback?.type, "info")
    .toLowerCase()
    .replace(/[^a-z]/g, "") || "info";

  const node = document.createElement("div");
  node.className = `entity-overlay-feedback entity-overlay-feedback--${type}`;
  node.dataset.entityOverlayFeedback = "true";
  node.setAttribute("role", type === "error" ? "alert" : "status");
  node.textContent = message;
  return node;
}

function injectOverlayChrome(entry = null) {
  if (!root || !entry) return false;

  const panel = root.querySelector(PANEL_SELECTOR);
  if (!panel) return false;

  panel.dataset.entityOverlayPanel = "true";
  panel.dataset.entityType = entry.type;
  panel.dataset.entityId = entry.id;

  if (stack.length > 1 && !panel.querySelector("[data-entity-overlay-action='back']")) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "entity-overlay-stack-back";
    back.dataset.entityOverlayAction = "back";
    back.setAttribute("aria-label", "Volver al detalle anterior");
    back.textContent = "←";
    panel.prepend(back);
  }

  root.querySelector("[data-entity-overlay-feedback='true']")?.remove?.();
  const feedback = feedbackHtml(entry.feedback);
  if (feedback) panel.prepend(feedback);

  return true;
}

function focusTop(entry = null) {
  if (!root || !entry || entry.focusedOnce) return false;

  const panel = root.querySelector(PANEL_SELECTOR);
  if (!panel) return false;

  const target =
    panel.querySelector("[autofocus]") ||
    modalFocusableElements(panel)[0] ||
    panel;

  if (!(target instanceof HTMLElement)) return false;

  if (!target.hasAttribute("tabindex") && target === panel) {
    target.tabIndex = -1;
  }

  try {
    target.focus({ preventScroll: true });
    entry.focusedOnce = true;
    return true;
  } catch {
    return false;
  }
}

async function renderTop({ focus = false } = {}) {
  const entry = topEntry();
  const host = ensureRoot();
  if (!entry || !host) {
    clearRoot();
    return false;
  }

  const sequence = ++renderSequence;
  host.hidden = false;
  host.dataset.entityType = entry.type;
  host.dataset.entityId = entry.id;
  host.dataset.entityDepth = String(stack.length);
  let html = "";

  try {
    if (!entry.adapter) {
      html = renderAdapterLoading({ type: entry.type, id: entry.id });
    } else if (entry.error) {
      html = await entry.adapter.render?.({
        ...entry,
        overlay: EntityOverlay,
      });
      html ||= renderAdapterError({
        type: entry.type,
        id: entry.id,
        error: safeError(entry.error),
      });
    } else {
      html = await entry.adapter.render?.({
        ...entry,
        overlay: EntityOverlay,
      });
      html ||= renderAdapterLoading({ type: entry.type, id: entry.id });
    }
  } catch (error) {
    entry.error = error;
    html = renderAdapterError({
      type: entry.type,
      id: entry.id,
      error: safeError(error),
    });
  }

  if (sequence !== renderSequence || !entryIsCurrent(entry)) return false;

  host.innerHTML = String(html || "");
  lockBody();

  try {
    await entry.adapter?.afterRender?.(host, {
      ...entry,
      overlay: EntityOverlay,
    });
  } catch {
    // La decoración del adaptador nunca tumba el modal.
  }

  injectOverlayChrome(entry);
  if (focus) window.requestAnimationFrame?.(() => focusTop(entry));
  return true;
}

async function hydrateEntry(entry = null, { silent = false } = {}) {
  if (!entry || !entryIsCurrent(entry)) return false;

  abortEntry(entry);
  entry.abortController = new AbortController();
  entry.loading = true;
  entry.error = null;
  if (!silent) entry.feedback = null;

  await ensureStyles(entry.type);
  entry.adapter = await loadAdapter(entry.type);

  if (!entryIsCurrent(entry)) return false;
  await renderTop({ focus: !entry.focusedOnce });

  try {
    const data = await entry.adapter.load?.({
      id: entry.id,
      seed: entry.seed,
      signal: entry.abortController.signal,
      context,
      AppCore,
      overlay: EntityOverlay,
    });

    if (!entryIsCurrent(entry) || entry.abortController.signal.aborted) return false;

    entry.data = data || entry.seed || null;
    entry.loading = false;
    entry.error = null;
  } catch (error) {
    if (!entryIsCurrent(entry) || entry.abortController.signal.aborted) return false;
    entry.loading = false;
    entry.error = error;
  }

  await renderTop({ focus: !entry.focusedOnce });
  return !entry.error;
}

function ownerModalOpen(type = "") {
  const selector = OWNER_DEFINITIONS[type]?.modalSelector;
  return Boolean(isBrowser() && selector && document.querySelector(selector));
}

function committedOrigin(opener = null) {
  return opener?.closest?.(ROUTE_HOST_SELECTOR) || document.querySelector(ROUTE_HOST_SELECTOR);
}

function ownerIsCurrent(session) {
  return ownerSession === session && session.scope.isActive() &&
    session.originHost?.isConnected && !session.originHost.hidden &&
    session.originHost.getAttribute("data-route-host-state") === "ready";
}

function ownerReturnTarget(session) {
  if (session.opener?.isConnected) return session.opener;
  if (!session.originHost?.isConnected) return null;
  // Home can legitimately refresh after a successful command. Recover the
  // same semantic row, never a detached button or an arbitrary sidebar item.
  const row = Array.from(session.originHost.querySelectorAll("[data-entity-type][data-entity-id]"))
    .find((node) => node.dataset.entityType === session.openerType &&
      node.dataset.entityId === session.openerId);
  if (row) return row;
  const heading = session.originHost.querySelector("h1");
  if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  return heading || null;
}

function stopOwnerSession({ restore = false } = {}) {
  const session = ownerSession;
  if (!session) return false;
  ownerSession = null;
  session.scope.dispose("detail-closed");
  clearRoot();
  unlockBody();
  if (restore) restoreModalFocus(ownerReturnTarget(session));
  return true;
}

export function releaseOrigin(host = null) {
  if (!host || ownerSession?.originHost !== host) return false;
  return stopOwnerSession();
}

export async function preload(type = "") {
  const key = normalizeEntityType(type);
  const definition = OWNER_DEFINITIONS[key];
  if (!definition || !isBrowser() || !canAccessEntity(key)) return false;
  if (!ownerPromises.has(key)) {
    const task = definition.load().catch((error) => { ownerPromises.delete(key); throw error; });
    ownerPromises.set(key, task);
  }
  const [module, styles] = await Promise.all([
    ownerPromises.get(key),
    Promise.all(definition.styles.map(ensureStyle)),
  ]);
  if (!styles.every(Boolean)) throw new Error("No se pudieron cargar los estilos del detalle.");
  if (definition.prepareName) await module[definition.prepareName]();
  return true;
}

function renderOwnerPending(session, error = null) {
  if (!ownerIsCurrent(session)) return false;
  const host = ensureRoot();
  session.error = error;
  host.hidden = false;
  host.innerHTML = error
    ? renderAdapterError({ type: session.type, error: safeError(error) })
    : renderAdapterLoading({ type: session.type, id: session.id });
  const panel = host.querySelector(PANEL_SELECTOR);
  // The common loading surface only owns chunk loading. The domain takes
  // over with its own shell before any detail data is awaited.
  const button = document.createElement("button");
  button.type = "button";
  button.className = "entity-overlay-action-button";
  button.dataset.entityOverlayAction = error ? "retry" : "close";
  button.textContent = error ? "Reintentar" : "Cancelar";
  (panel.querySelector(".entity-overlay-generic-body") || panel).append(button);
  lastGlobalOpener = session.opener;
  lockBody();
  panel.focus({ preventScroll: true });
  return true;
}

function closeOwnerSession() {
  const session = ownerSession;
  if (!session) return false;
  if (session.controller) {
    const controller = session.controller;
    const closed = controller.closeDetailModal();
    // A draft confirmation can return true while the detail remains open.
    if (closed === false || controller.getSnapshot?.().detailModalOpen) return false;
  }
  if (ownerSession === session) stopOwnerSession({ restore: true });
  return true;
}

async function openCanonicalOwner(input = {}) {
  const type = normalizeEntityType(input.type);
  const id = normalizeEntityId(type, input.id);
  const definition = OWNER_DEFINITIONS[type];
  if (!definition || !id || !isBrowser() || !canAccessEntity(type) || input.signal?.aborted) return false;
  if (ownerSession?.type === type && ownerSession.id === id && !ownerSession.error) {
    return ownerSession.task || true;
  }
  if (ownerSession && !closeOwnerSession()) return false;
  const originHost = committedOrigin(input.opener);
  if (!originHost) return false;
  clearStack({ restore: false });
  const session = {
    type, id, originHost, opener: input.opener || safeActiveElement(),
    openerType: input.opener?.dataset?.entityType || "",
    openerId: input.opener?.dataset?.entityId || "",
    scope: createAsyncScope({ signal: input.signal }), controller: null,
    source: cleanText(input.source, "api"), error: null, task: null,
  };
  ownerSession = session;
  session.scope.onDispose(() => {
    session.controller?.destroy?.();
    session.controller = null;
  });
  // Own the origin before the first await: leaving during a slow import must
  // cancel just as leaving during an HTTP request does.
  renderOwnerPending(session);
  const task = (async () => {
    try {
      await preload(type);
      if (!ownerIsCurrent(session)) return false;
      const module = await ownerPromises.get(type);
      if (!ownerIsCurrent(session)) return false;
      if (isCanonicalOwnerRoute(type)) {
        // An already mounted route owns its lifecycle and its sole controller.
        stopOwnerSession();
        return Boolean(await module[definition.routeOpenName](id, session.opener));
      }
      const controller = await module[definition.createName]({
        ...context,
        signal: session.scope.signal,
        onDetailShell() {
          if (!ownerIsCurrent(session)) return;
          clearRoot();
          unlockBody();
        },
        onDetailClosed() {
          if (ownerSession === session) stopOwnerSession({ restore: true });
        },
        openEntityDetail(relation) {
          return open({ ...relation, opener: ownerReturnTarget(session), source: `${type}.relation` });
        },
      });
      if (!ownerIsCurrent(session)) { controller?.destroy?.(); return false; }
      session.controller = controller;
      if (!controller || typeof controller[definition.openName] !== "function") {
        throw new Error("No se pudo preparar el detalle. Puedes reintentarlo.");
      }
      const opened = await controller[definition.openName](id, session.opener);
      if (!ownerIsCurrent(session)) return false;
      if (opened || ownerModalOpen(type)) return Boolean(opened);
      throw new Error("No se pudo cargar el detalle. Puedes reintentarlo.");
    } catch (error) {
      if (!ownerIsCurrent(session)) return false;
      session.controller?.destroy?.();
      session.controller = null;
      renderOwnerPending(session, error);
      return false;
    }
  })();
  session.task = task;
  return task;
}

async function open(input = {}) {
  if (!initialized) init(context);

  const normalized = normalizeOpenInput(input);
  if (!normalized) {
    throw new TypeError("Entidad o identificador no válidos.");
  }

  if (!canAccessEntity(normalized.type)) return false;

  if (OWNER_TYPES.has(normalized.type)) {
    return openCanonicalOwner(normalized);
  }

  const current = topEntry();
  if (current?.type === normalized.type && current?.id === normalized.id) {
    if (input?.force === true) await reload();
    return current;
  }

  if (!stack.length) {
    lastGlobalOpener = normalized.opener;
  }

  if (normalized.mode === "replace" && current) {
    stack.pop();
    disposeEntry(current);
  }

  const entry = {
    token: normalized.token,
    type: normalized.type,
    id: normalized.id,
    source: normalized.source,
    seed: normalized.seed,
    data: normalized.seed,
    adapter: null,
    loading: true,
    error: null,
    feedback: null,
    busy: Object.create(null),
    opener: normalized.opener,
    historyMode: normalized.historyMode,
    abortController: null,
    focusedOnce: false,
    openedAt: Date.now(),
  };

  stack.push(entry);

  if (stack.length > MAX_STACK_DEPTH) {
    const removed = stack.shift();
    disposeEntry(removed);
  }

  if (entry.historyMode !== "none") {
    writeUrlForEntry(entry, entry.historyMode);
  }

  await ensureStyles(entry.type);
  await renderTop({ focus: true });
  void hydrateEntry(entry);
  return entry;
}

function removeTop({ syncUrl = true, restore = true } = {}) {
  const entry = stack.pop();
  disposeEntry(entry);

  if (stack.length) {
    const previous = topEntry();
    if (syncUrl) writeUrlForEntry(previous, "replace");
    void renderTop({ focus: true });
    return true;
  }

  if (syncUrl) writeUrlForEntry(null, "replace");
  clearRoot();
  unlockBody();
  if (restore) restoreFocus();
  return true;
}

function close(options = {}) {
  if (ownerSession) return closeOwnerSession();
  const entry = topEntry();
  if (!entry) return false;

  clearCloseFallback();

  /*
    El cierre desde UI debe ser determinista e inmediato. Delegarlo a
    history.back() podía dejar el overlay visible cuando Router y el
    listener de popstate competían por la misma navegación.
  */
  return removeTop({
    syncUrl: options?.syncUrl !== false,
    restore: options?.restore !== false,
  });
}

function back() {
  if (stack.length <= 1) return close();
  return close();
}

async function reload(options = {}) {
  const entry = topEntry();
  if (!entry) return false;
  return hydrateEntry(entry, options);
}

function setBusy(key = "default", value = true) {
  const entry = topEntry();
  if (!entry) return false;

  const name = cleanText(key, "default");
  entry.busy[name] = value === true;
  void renderTop();
  return true;
}

function setFeedback(feedback = null) {
  const entry = topEntry();
  if (!entry) return false;

  entry.feedback = feedback && typeof feedback === "object"
    ? {
        type: cleanText(feedback.type, "info"),
        message: cleanText(feedback.message, ""),
      }
    : null;

  void renderTop();
  return true;
}

function canOpen(type = "", id = "") {
  const entityType = normalizeEntityType(type);
  return Boolean(
    entityType && canAccessEntity(entityType) &&
    (ADAPTER_LOADERS[entityType] || OWNER_TYPES.has(entityType)) &&
    normalizeEntityId(entityType, id)
  );
}

function snapshot() {
  return Object.freeze({
    version: ENTITY_OVERLAY_VERSION,
    initialized,
    open: Boolean(stack.length || ownerSession),
    depth: stack.length,
    current: topEntry()
      ? Object.freeze({
          type: topEntry().type,
          id: topEntry().id,
          loading: topEntry().loading,
          hasError: Boolean(topEntry().error),
          source: topEntry().source,
        })
      : null,
    registeredTypes: Object.freeze([
      ...Object.keys(ADAPTER_LOADERS),
      ...OWNER_TYPES,
    ]),
    loadedAdapters: Object.freeze([...adapterPromises.keys()]),
    ownerDetail: ownerSession
      ? Object.freeze({ type: ownerSession.type, active: true })
      : null,
  });
}

function actionName(node = null) {
  if (!node) return "";

  const dataset = node.dataset || {};
  return cleanText(
    dataset.entityOverlayAction ||
      dataset.facturasAction ||
      dataset.facturaAction ||
      dataset.incidenciasAction ||
      dataset.incidenciaAction ||
      dataset.ticketAction ||
      dataset.clientesAction ||
      dataset.clienteAction ||
      dataset.usuariosAction ||
      dataset.usuarioAction ||
      dataset.action ||
      "",
    ""
  ).toLowerCase();
}

function stopEntityClick(event = null) {
  try {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  } catch {
    // noop
  }
}

async function handleOverlayClick(event = null) {
  if (ownerSession) {
    const target = event?.target?.nodeType === 3 ? event.target.parentElement : event.target;
    const action = target?.closest?.("[data-entity-overlay-action]")?.dataset.entityOverlayAction;
    if (action === "retry") {
      stopEntityClick(event);
      const { type, id, opener } = ownerSession;
      stopOwnerSession();
      void open({ type, id, opener, source: "detail.retry" });
      return true;
    }
    if (action === "close" || target?.matches?.("[data-entity-overlay-backdrop='true']")) {
      stopEntityClick(event);
      return closeOwnerSession();
    }
    return false;
  }
  const entry = topEntry();
  if (!entry || !root) return false;

  const target = event?.target?.nodeType === 3
    ? event.target.parentElement
    : event?.target;

  if (!target) return false;

  const actionNode = target.closest?.(ACTION_SELECTOR);
  const action = actionName(actionNode);

  if (action === "back" || action.endsWith("-back")) {
    stopEntityClick(event);
    back();
    return true;
  }

  if (action === "close" || action.includes("close-") || action.includes("cerrar")) {
    stopEntityClick(event);
    close();
    return true;
  }

  const relationIntent = inferEntityIntentFromElement(actionNode || target);
  if (
    relationIntent &&
    (relationIntent.type !== entry.type || relationIntent.id !== entry.id)
  ) {
    stopEntityClick(event);
    await open({
      ...relationIntent,
      source: `${entry.type}.dom-relation`,
      opener: actionNode || target,
    });
    return true;
  }

  if (actionNode && typeof entry.adapter?.handleAction === "function") {
    const handled = await entry.adapter.handleAction({
      action,
      node: actionNode,
      event,
      data: entry.data,
      id: entry.id,
      entry,
      overlay: EntityOverlay,
      AppCore,
    });

    if (handled) {
      stopEntityClick(event);
      return true;
    }
  }

  const backdrop = target.closest?.(BACKDROP_SELECTOR);
  const panel = target.closest?.(PANEL_SELECTOR);

  if (backdrop && !panel && target === backdrop) {
    stopEntityClick(event);
    close();
    return true;
  }

  return false;
}

const OWNER_ROUTE_SEGMENTS = Object.freeze({
  factura: Object.freeze(["facturas"]),
  incidencia: Object.freeze(["incidencias", "tickets"]),
  cliente: Object.freeze(["clientes"]),
  usuario: Object.freeze(["usuarios"]),
});

function currentRouteSegments() {
  if (!isBrowser()) return [];

  try {
    return String(window.location?.pathname || "/")
      .toLowerCase()
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isCanonicalOwnerRoute(type = "") {
  const entityType = normalizeEntityType(type);
  const owners = OWNER_ROUTE_SEGMENTS[entityType] || [];
  if (!owners.length) return false;

  const segments = currentRouteSegments();
  return owners.some((owner) => segments.includes(owner));
}

function hasExplicitOverlayTrigger(target = null) {
  const element = target?.nodeType === 3 ? target.parentElement : target;
  if (!element || typeof element.closest !== "function") return false;

  return Boolean(
    element.closest(
      "[data-entity-overlay-open='true'], " +
      "[data-entity-overlay-trigger='true'], " +
      "[data-entity-overlay-action='open']"
    )
  );
}

function onDocumentClick(event) {
  if (!event || event.defaultPrevented || event.__onionRouterHandled || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const host = ensureRoot();
  if (host?.contains?.(event.target)) {
    void handleOverlayClick(event);
    return;
  }

  const intent = inferEntityIntentFromElement(event.target);
  if (!intent || !canOpen(intent.type, intent.id)) return;

  /*
    En la vista propietaria manda su controller canónico. El overlay
    global sólo intercepta allí cuando el elemento lo pide de forma
    explícita. Así se conservan Histórico, edición, adjuntos y cierre.
  */
  if (
    isCanonicalOwnerRoute(intent.type) &&
    !hasExplicitOverlayTrigger(event.target)
  ) {
    return;
  }

  stopEntityClick(event);
  void open({
    ...intent,
    source: "global-dom",
    opener: event.target?.closest?.("a,button,[role='button'],[data-route]") || event.target,
  });
}

function onPopstate() {
  clearCloseFallback();

  if (ownerSession) stopOwnerSession();

  const marker = currentMarker();

  if (marker?.token) {
    const index = stack.findIndex((entry) => entry.token === marker.token);

    if (index >= 0) {
      const removed = stack.splice(index + 1);
      removed.forEach(disposeEntry);
      void renderTop({ focus: true });
      return;
    }

    const intent = inferEntityIntent({
      type: marker.type,
      id: marker.id,
      source: "history",
    });

    if (intent) {
      void open({
        ...intent,
        token: marker.token,
        historyMode: "none",
        source: "history",
      });
      return;
    }
  }

  if (stack.length) clearStack({ restore: true });

  const intent = urlIntent();
  if (intent && isCanonicalOwnerRoute(intent.type)) {
    writeUrlForEntry(null, "replace");
    return;
  }

  if (intent) {
    void open({
      ...intent,
      historyMode: "none",
      source: "url-popstate",
    });
  }
}

function registerApi() {
  try {
    AppCore?.registerModule?.("entities", EntityOverlay);
    AppCore?.registerModule?.("entity-overlay", EntityOverlay);
  } catch {
    // módulo registry best-effort
  }

  try {
    if (!AppCore.entities) {
      Object.defineProperty(AppCore, "entities", {
        value: EntityOverlay,
        configurable: true,
        enumerable: false,
        writable: false,
      });
    }
  } catch {
    // AppCore puede estar sellado; getModule sigue siendo suficiente.
  }

  return true;
}

export function init(options = {}) {
  if (!isBrowser()) return EntityOverlay;

  context = {
    ...context,
    ...(options && typeof options === "object" ? options : {}),
  };

  ensureRoot();
  registerApi();

  if (!documentClickBound) {
    document.addEventListener("click", onDocumentClick, true);
    documentClickBound = true;
  }

  if (!popstateBound) {
    window.addEventListener("popstate", onPopstate);
    popstateBound = true;
  }

  initialized = true;

  const intent = urlIntent();
  if (intent && isCanonicalOwnerRoute(intent.type)) {
    writeUrlForEntry(null, "replace");
  } else if (intent && !stack.length) {
    void open({
      ...intent,
      historyMode: "replace",
      source: "url-init",
    });
  }

  return EntityOverlay;
}

export function destroy() {
  if (!isBrowser()) return false;

  clearCloseFallback();
  stopOwnerSession();
  clearStack({ restore: false });

  if (documentClickBound) {
    document.removeEventListener("click", onDocumentClick, true);
    documentClickBound = false;
  }

  if (popstateBound) {
    window.removeEventListener("popstate", onPopstate);
    popstateBound = false;
  }

  initialized = false;
  return true;
}

export const EntityOverlay = Object.freeze({
  version: ENTITY_OVERLAY_VERSION,
  init,
  destroy,
  open,
  openEntity: open,
  replace: (input = {}) => open({ ...input, mode: "replace" }),
  close,
  back,
  reload,
  setBusy,
  setFeedback,
  canOpen,
  preload,
  releaseOrigin,
  getSnapshot: snapshot,
  normalizeType: normalizeEntityType,
  normalizeId: normalizeEntityId,
});

export default EntityOverlay;
