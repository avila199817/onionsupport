/* =========================================================
   Onion Support - Global Entity Overlay

   Despacha entidades desde cualquier punto de la SPA. Incidencias y Facturas
   pertenecen siempre a sus vistas/controladores canónicos; las entidades simples
   conservan overlay lazy mientras migran al mismo contrato propietario.
========================================================= */

import { AppCore } from "../../core/index.js";

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
  "entity-overlay.v3-factura-incidencia-owner-authority";

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

/*
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

let ownerSequence = 0;
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

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let initialized = false;
let root = null;
let context = {};
let stack = [];
let tokenSequence = 0;
let renderSequence = 0;
let closeFallbackTimer = 0;
let lastGlobalOpener = null;
let bodySnapshot = null;
let documentClickBound = false;
let documentKeydownBound = false;
let popstateBound = false;

const stylePromises = new Map();
const adapterPromises = new Map();

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
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
  if (!isBrowser() || bodySnapshot) return false;

  const body = document.body;
  if (!body) return false;

  bodySnapshot = {
    overflow: body.style.overflow,
    overscrollBehavior: body.style.overscrollBehavior,
  };

  body.classList.add(BODY_CLASS);
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "contain";
  return true;
}

function unlockBody() {
  if (!isBrowser()) return false;

  const body = document.body;
  if (!body) return false;

  body.classList.remove(BODY_CLASS);

  if (bodySnapshot) {
    body.style.overflow = bodySnapshot.overflow;
    body.style.overscrollBehavior = bodySnapshot.overscrollBehavior;
  } else {
    body.style.removeProperty("overflow");
    body.style.removeProperty("overscroll-behavior");
  }

  bodySnapshot = null;
  return true;
}

function restoreFocus() {
  const target = lastGlobalOpener;
  lastGlobalOpener = null;

  if (!target?.isConnected || typeof target.focus !== "function") return false;

  try {
    target.focus({ preventScroll: true });
    return true;
  } catch {
    try {
      target.focus();
      return true;
    } catch {
      return false;
    }
  }
}

function normalizeOpenInput(input = {}) {
  const type = normalizeEntityType(input?.type || input?.entityType || "");
  const id = normalizeEntityId(type, input?.id || input?.entityId || "");

  if (!type || !id || (!ADAPTER_LOADERS[type] && !OWNER_ROUTED_TYPES.has(type))) return null;

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
  };
}

function stylePaths(type = "") {
  const domainPaths = Array.isArray(ENTITY_STYLE_PATHS[type])
    ? ENTITY_STYLE_PATHS[type]
    : [];

  return [
    "/src/css/features/entity-overlay.css",
    ...domainPaths,
  ].filter(Boolean);
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
    const ready = Promise.resolve(true);
    stylePromises.set(href, ready);
    return ready;
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
    panel.querySelector(FOCUSABLE_SELECTOR) ||
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
  lockBody();

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

function currentPublicPathWithoutEntityQuery() {
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

function ownerDefinition(type = "") {
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

async function open(input = {}) {
  if (!initialized) init(context);

  const normalized = normalizeOpenInput(input);
  if (!normalized) {
    throw new TypeError("Entidad o identificador no válidos.");
  }

  if (OWNER_ROUTED_TYPES.has(normalized.type)) {
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
    entityType &&
    (ADAPTER_LOADERS[entityType] || OWNER_ROUTED_TYPES.has(entityType)) &&
    normalizeEntityId(entityType, id)
  );
}

function snapshot() {
  return Object.freeze({
    version: ENTITY_OVERLAY_VERSION,
    initialized,
    open: Boolean(stack.length),
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
      ...OWNER_ROUTED_TYPES,
    ]),
    loadedAdapters: Object.freeze([...adapterPromises.keys()]),
    ownerRouted: ownerSession
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
  if (!event || event.button !== 0) return;
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

function focusableNodes(panel = null) {
  if (!panel) return [];

  return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
    if (node.getAttribute("aria-disabled") === "true") return false;
    return node.getClientRects().length > 0;
  });
}

function onDocumentKeydown(event) {
  if (!stack.length || !root?.contains?.(event.target)) return;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }

  if (event.key !== "Tab") return;

  const panel = root.querySelector(PANEL_SELECTOR);
  if (!panel) return;

  const nodes = focusableNodes(panel);
  if (!nodes.length) {
    event.preventDefault();
    panel.focus?.({ preventScroll: true });
    return;
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function onPopstate() {
  clearCloseFallback();

  if (ownerSession && !isOwnerRoute(ownerSession.type)) {
    stopOwnerSession();
  }

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

  if (!documentKeydownBound) {
    document.addEventListener("keydown", onDocumentKeydown, true);
    documentKeydownBound = true;
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

  if (documentKeydownBound) {
    document.removeEventListener("keydown", onDocumentKeydown, true);
    documentKeydownBound = false;
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
  getSnapshot: snapshot,
  normalizeType: normalizeEntityType,
  normalizeId: normalizeEntityId,
});

export default EntityOverlay;
