/* =========================================================
   Onion SPA - Router Render
   Archivo: src/router/render.js

   ROUTER RENDER · FINAL SIMPLE
   - Pinta vistas y estados de ruta
   - Sin Auth real, guards, history propio, storage, Toast ni navegación
   - Router index orquesta; render sólo renderiza
   - route.render() recibe renderRoot + context
========================================================= */

import {
  getRouteNames,
  normalizeCanonicalPath,
  normalizePath,
  extractUsernameFromPath,
  getCurrentResolvedUsername,
  getCurrentUsername,
  buildLoginUrl,
  getDefaultHomeTarget,
  redactTokenInText,
} from "./helpers.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const ROUTER_RENDER_VERSION = "20.0.0-final";

const SOURCE = "router.render";
const DEFAULT_ROUTE = "/";
const RENDER_HOST_ATTR = "data-router-view-host";
const RENDER_HOST_CLASS = "router-view-host";

/* =========================================================
   BASICS
========================================================= */

let renderSeq = 0;
let activeController = null;

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function isNode(value) {
  try {
    return Boolean(typeof Node !== "undefined" && value instanceof Node);
  } catch {
    return Boolean(value && typeof value.nodeType === "number");
  }
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function perfMs() {
  try {
    return typeof performance !== "undefined" && isFn(performance.now) ? performance.now() : nowMs();
  } catch {
    return nowMs();
  }
}

function isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "");
  }
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (depth > 4) return "[depth-limit]";
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redact(value.message || ""),
      status: value.status || value.statusCode || value.response?.status || null,
      code: value.code || value.data?.code || value.response?.data?.code || null,
    };
  }

  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, seen));

  if (isObject(value)) {
    try {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    } catch {}

    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      output[key] = /token|authorization|password|secret|credential|jwt|bearer|refresh|access|otp|totp|mfa|2fa|code/i.test(key)
        ? item ? "***" : item
        : sanitize(item, depth + 1, seen);
    }

    return output;
  }

  return String(value);
}

function emit(AppCore, eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitize({
    source: SOURCE,
    version: ROUTER_RENDER_VERSION,
    at: isoNow(),
    ...safeObject(payload),
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[RouterRender]", ...args.map((item) => sanitize(item)));
  } catch {
    try {
      if (AppCore?.config?.debug) console.warn("[RouterRender]", ...args.map((item) => sanitize(item)));
    } catch {}
  }
}

/* =========================================================
   PATHS
========================================================= */

function canonical(AppCore, path = DEFAULT_ROUTE) {
  try {
    return normalizeCanonicalPath(AppCore, path) || DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function publicPath(AppCore, path = DEFAULT_ROUTE) {
  try {
    return normalizePath(AppCore, path) || DEFAULT_ROUTE;
  } catch {
    return path || DEFAULT_ROUTE;
  }
}

function stripSearchAndHash(path = DEFAULT_ROUTE) {
  return safeText(path, DEFAULT_ROUTE).split("?")[0].split("#")[0] || DEFAULT_ROUTE;
}

function usernameFrom(AppCore, requestedUsername = null, path = "") {
  return (
    safeText(requestedUsername, "") ||
    extractUsernameFromPath(AppCore, path || "") ||
    getCurrentResolvedUsername(AppCore) ||
    getCurrentUsername(AppCore) ||
    AppCore?.state?.user?.username ||
    AppCore?.state?.user?.slug ||
    null
  );
}

function resolveRoutePaths({
  AppCore,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath: explicitPublicPath = "",
  requestedUsername = null,
} = {}) {
  const finalCanonical = stripSearchAndHash(
    canonical(AppCore, canonicalPath || route?.path || requestedPath || DEFAULT_ROUTE)
  );

  const finalPublic = publicPath(
    AppCore,
    explicitPublicPath || requestedPath || finalCanonical || DEFAULT_ROUTE
  );

  const username = usernameFrom(AppCore, requestedUsername, finalPublic);

  return {
    canonicalPath: finalCanonical,
    publicPath: finalPublic,
    username,
  };
}

/* =========================================================
   DOM
========================================================= */

function queryFirst(selectors = []) {
  if (!isBrowser()) return null;

  for (const selector of selectors) {
    try {
      const element = selector.startsWith("#") ? document.getElementById(selector.slice(1)) : document.querySelector(selector);
      if (element) return element;
    } catch {}
  }

  return null;
}

function setDataset(element, key, value) {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function empty(element) {
  if (!element) return false;

  try {
    element.replaceChildren();
    return true;
  } catch {}

  try {
    while (element.firstChild) element.removeChild(element.firstChild);
    return true;
  } catch {
    return false;
  }
}

function el(tagName = "div", { className = "", text = "", attrs = {}, dataset = {} } = {}) {
  const node = document.createElement(tagName);

  if (className) node.className = className;
  if (text) node.textContent = text;

  for (const [key, value] of Object.entries(safeObject(attrs))) {
    try {
      if (value === null || value === undefined || value === "") node.removeAttribute(key);
      else node.setAttribute(key, String(value));
    } catch {}
  }

  for (const [key, value] of Object.entries(safeObject(dataset))) setDataset(node, key, value);

  return node;
}

function append(parent, children = []) {
  if (!parent) return parent;

  for (const child of children) {
    if (!child) continue;
    try {
      parent.appendChild(child);
    } catch {}
  }

  return parent;
}

function paint(target, node) {
  if (!target || !node) return null;

  try {
    target.replaceChildren(node);
  } catch {
    empty(target);
    try {
      target.appendChild(node);
    } catch {}
  }

  return node;
}

export function getViewContainer(AppCore) {
  if (!isBrowser()) return null;

  try {
    if (AppCore?.dom?.viewContainer && document.contains(AppCore.dom.viewContainer)) return AppCore.dom.viewContainer;
  } catch {}

  const view = queryFirst(["#view-container", "[data-view-root]", "[data-view-container='true']", "[data-router-view]"]);

  try {
    if (view && AppCore?.dom) AppCore.dom.viewContainer = view;
  } catch {}

  return view;
}

function currentHost(AppCore) {
  const view = getViewContainer(AppCore);
  if (!view) return null;

  try {
    return view.querySelector(`[${RENDER_HOST_ATTR}="true"]`);
  } catch {
    return null;
  }
}

function markView({
  AppCore,
  view,
  renderId,
  route = null,
  canonicalPath = DEFAULT_ROUTE,
  publicPath: routePublicPath = DEFAULT_ROUTE,
  status = "pending",
} = {}) {
  if (!view) return false;

  setDataset(view, "routerRenderId", renderId);
  setDataset(view, "routerStatus", status);
  setDataset(view, "routerCanonicalPath", canonicalPath);
  setDataset(view, "routerPublicPath", routePublicPath);
  setDataset(view, "routerRoute", route?.path || canonicalPath);
  setDataset(view, "routerRouteName", route?.name || "");
  setDataset(view, "routerViewKey", route?.viewKey || "");
  setDataset(view, "routerViewName", route?.viewName || "");

  try {
    view.classList.add("router-view-root");
    view.classList.toggle("is-rendering", status === "pending");
    view.classList.toggle("is-ready", status === "ready");
    view.classList.toggle("has-error", status === "error");
  } catch {}

  try {
    if (AppCore?.dom) AppCore.dom.viewContainer = view;
  } catch {}

  return true;
}

function prepareHost({
  AppCore,
  route = null,
  renderId,
  canonicalPath = DEFAULT_ROUTE,
  publicPath: routePublicPath = DEFAULT_ROUTE,
  mode = "success",
} = {}) {
  const view = getViewContainer(AppCore);
  if (!view) return { view: null, host: null };

  markView({ AppCore, view, renderId, route, canonicalPath, publicPath: routePublicPath, status: "pending" });

  const host = el("div", {
    className: RENDER_HOST_CLASS,
    attrs: {
      [RENDER_HOST_ATTR]: "true",
      "data-router-render-id": renderId,
      "data-router-mode": mode,
      "data-router-route": route?.path || canonicalPath,
      "data-router-route-name": route?.name || "",
      "data-router-view-key": route?.viewKey || "",
      "data-router-view-name": route?.viewName || "",
      "data-router-canonical-path": canonicalPath,
      "data-router-public-path": routePublicPath,
    },
  });

  paint(view, host);

  try {
    if (AppCore?.dom) {
      AppCore.dom.routerViewHost = host;
      AppCore.dom.viewHost = host;
    }
  } catch {}

  return { view, host };
}

function markReady(AppCore, renderId, route = null, canonicalPath = DEFAULT_ROUTE, routePublicPath = DEFAULT_ROUTE) {
  const view = getViewContainer(AppCore);
  if (!view) return false;

  markView({ AppCore, view, renderId, route, canonicalPath, publicPath: routePublicPath, status: "ready" });
  return true;
}

function markError(AppCore, renderId, route = null, canonicalPath = DEFAULT_ROUTE, routePublicPath = DEFAULT_ROUTE) {
  const view = getViewContainer(AppCore);
  if (!view) return false;

  markView({ AppCore, view, renderId, route, canonicalPath, publicPath: routePublicPath, status: "error" });
  return true;
}

function adoptResult(target, result) {
  if (!target || result === null || result === undefined) return result || null;

  if (typeof result === "string") {
    const wrapper = el("div", { className: "router-rendered-text", text: result });
    paint(target, wrapper);
    return wrapper;
  }

  if (!isNode(result)) return result;
  if (result === target) return result;

  try {
    if (target.contains(result)) return result;
  } catch {}

  paint(target, result);
  return result;
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function beginRender() {
  try {
    activeController?.abort?.("superseded");
  } catch {}

  const renderId = ++renderSeq;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  activeController = controller;

  return { renderId, signal: controller?.signal || null };
}

function abortActiveRender(reason = "aborted") {
  try {
    activeController?.abort?.(reason);
  } catch {}

  activeController = null;
}

function routeRenderer(route = null) {
  if (isFn(route?.render)) return { render: route.render, thisArg: route, source: "route.render" };
  if (isFn(route?.view)) return { render: route.view, thisArg: route, source: "route.view" };
  if (isFn(route?.component)) return { render: route.component, thisArg: route, source: "route.component" };
  if (isFn(route?.handler)) return { render: route.handler, thisArg: route, source: "route.handler" };
  if (isFn(route?.component?.render)) return { render: route.component.render, thisArg: route.component, source: "route.component.render" };
  if (isFn(route?.view?.render)) return { render: route.view.render, thisArg: route.view, source: "route.view.render" };

  return { render: null, thisArg: null, source: "" };
}

function runRenderer(route, target, context) {
  const renderer = routeRenderer(route);
  if (!target || !isFn(renderer.render)) return null;

  try {
    return renderer.render.call(renderer.thisArg || route, target, { ...context, rendererSource: renderer.source });
  } catch (error) {
    return Promise.reject(error);
  }
}

/* =========================================================
   PAYLOADS / STATE
========================================================= */

export function buildRenderPayload({
  AppCore = null,
  path = "",
  requestedPath = "",
  canonicalPath = "",
  publicPath: routePublicPath = "",
  username = null,
  route = null,
  found = false,
  forbidden = false,
  redirectedFrom = null,
  options = null,
  renderId = null,
  flow = "",
  status = "",
} = {}) {
  const resolved = resolveRoutePaths({
    AppCore,
    route,
    requestedPath: requestedPath || path || routePublicPath || canonicalPath || route?.path || DEFAULT_ROUTE,
    canonicalPath: canonicalPath || route?.path || requestedPath || path || DEFAULT_ROUTE,
    publicPath: routePublicPath || path || requestedPath || "",
    requestedUsername: username,
  });

  return {
    path: resolved.publicPath,
    requestedPath: requestedPath || path || resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    username: resolved.username || username || null,
    route: route || null,
    routePath: route?.path || resolved.canonicalPath,
    routeName: route?.name || null,
    viewKey: route?.viewKey || null,
    viewName: route?.viewName || null,
    found: Boolean(found),
    forbidden: Boolean(forbidden),
    redirectedFrom: redirectedFrom || null,
    options: options || null,
    renderId: renderId || null,
    flow: flow || null,
    status: status || null,
    ts: nowMs(),
  };
}

export function emitBeforeRender(AppCore, payload = {}) {
  const finalPayload = buildRenderPayload({ AppCore, ...safeObject(payload), flow: payload?.flow || "before-render" });
  emit(AppCore, "router:before-render", finalPayload);
  return finalPayload;
}

export function emitRendered(AppCore, payload = {}) {
  const finalPayload = buildRenderPayload({ AppCore, ...safeObject(payload), flow: payload?.flow || "rendered" });
  emit(AppCore, "router:rendered", finalPayload);
  return finalPayload;
}

export function syncRouteState(AppCore, canonicalPath = DEFAULT_ROUTE, routePublicPath = null) {
  const finalCanonical = stripSearchAndHash(canonical(AppCore, canonicalPath || DEFAULT_ROUTE));
  const finalPublic = publicPath(AppCore, routePublicPath || finalCanonical);
  const username = usernameFrom(AppCore, null, finalPublic);

  try {
    AppCore?.setRoute?.(finalCanonical);
  } catch {}

  try {
    AppCore?.setPublicPath?.(finalPublic);
  } catch {}

  const patch = { route: finalCanonical, canonicalPath: finalCanonical, publicPath: finalPublic, currentResolvedUsername: username };

  try {
    AppCore?.setState?.(patch, { source: SOURCE, emit: false, emitState: false, silent: true });
  } catch {}

  try {
    if (AppCore?.state) Object.assign(AppCore.state, patch);
  } catch {}

  return { canonicalPath: finalCanonical, publicPath: finalPublic, username };
}

export function applyResolvedRouteState(AppCore, canonicalPath, fallbackPublicPath) {
  return syncRouteState(AppCore, canonicalPath, fallbackPublicPath || canonicalPath || DEFAULT_ROUTE);
}

export function buildRouteRenderContext({
  AppCore,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  requestedUsername = null,
  publicPath: routePublicPath = null,
  redirectedFrom = null,
  found = true,
  forbidden = false,
  renderId = null,
  signal = null,
  renderRoot = null,
  viewContainer = null,
} = {}) {
  const resolved = resolveRoutePaths({ AppCore, route, requestedPath: routePublicPath || requestedPath, canonicalPath, publicPath: routePublicPath || requestedPath, requestedUsername });
  const rootView = viewContainer || getViewContainer(AppCore);
  const host = renderRoot || currentHost(AppCore) || rootView;

  return Object.freeze({
    AppCore,
    route,
    path: resolved.publicPath,
    requestedPath: resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    username: resolved.username,
    requestedUsername: resolved.username,
    redirectedFrom,
    found: Boolean(found),
    forbidden: Boolean(forbidden),
    renderId,
    signal,
    viewContainer: rootView,
    renderRoot: host,
    renderHost: host,
    routePath: route?.path || resolved.canonicalPath,
    routeName: route?.name || null,
    viewKey: route?.viewKey || null,
    viewName: route?.viewName || null,
  });
}

/* =========================================================
   FALLBACK VIEWS
========================================================= */

function panelFallback({ kind = "generic", eyebrow = "", title = "", message = "", meta = [], action = null } = {}) {
  const section = el("section", { className: `content-wrapper router-fallback-view router-fallback-view--${kind}`, dataset: { routerFallback: kind } });
  const card = el("div", { className: "panel-block router-fallback-card" });
  const inner = el("div", { className: "router-fallback-card__inner" });
  const header = el("div", { className: "router-fallback-card__header" });

  if (eyebrow) header.appendChild(el("p", { className: "router-fallback-card__eyebrow", text: eyebrow }));
  header.appendChild(el("h2", { className: "router-fallback-card__title", text: title || "Vista" }));
  if (message) header.appendChild(el("p", { className: "router-fallback-card__message", text: message }));

  inner.appendChild(header);

  if (meta.length) {
    const metaBox = el("div", { className: "router-fallback-card__meta" });

    for (const item of meta) {
      const row = el("div", { className: "router-fallback-card__meta-row" });
      append(row, [el("strong", { text: item?.label || "" }), el("span", { text: item?.value || "—" })]);
      metaBox.appendChild(row);
    }

    inner.appendChild(metaBox);
  }

  if (action?.href && action?.text) {
    const actions = el("div", { className: "router-fallback-card__actions" });
    actions.appendChild(el("a", { className: "ui-btn ui-btn-primary router-fallback-card__action", text: action.text, attrs: { href: action.href, "data-spa": "" } }));
    inner.appendChild(actions);
  }

  card.appendChild(inner);
  section.appendChild(card);

  return section;
}

export function renderGenericView(AppCore, route, target = null) {
  const root = target || currentHost(AppCore) || getViewContainer(AppCore);
  if (!root) return null;

  return paint(root, panelFallback({
    kind: "generic",
    eyebrow: "Router",
    title: route?.title || route?.name || "Vista",
    message: "Vista conectada al router.",
    meta: [{ label: "Ruta:", value: route?.path || AppCore?.state?.route || DEFAULT_ROUTE }],
  }));
}

export function renderForbiddenView(AppCore, getRoute) {
  const root = getViewContainer(AppCore);
  if (!root) return null;

  return paint(root, panelFallback({
    kind: "forbidden",
    eyebrow: "403",
    title: "Acceso denegado",
    message: "No tienes permisos para acceder.",
    action: { href: getDefaultHomeTarget(AppCore, getRoute), text: "Volver" },
  }));
}

export function renderNotFoundView(AppCore, requestedPath, getRoute) {
  const root = getViewContainer(AppCore);
  if (!root) return null;

  return paint(root, panelFallback({
    kind: "not-found",
    eyebrow: "404",
    title: "Ruta no encontrada",
    message: "No se ha podido resolver la ruta solicitada.",
    meta: [{ label: "Ruta:", value: redact(requestedPath || "—") }],
    action: { href: getDefaultHomeTarget(AppCore, getRoute), text: "Inicio" },
  }));
}

export function renderRuntimeErrorView(AppCore, error, getRoute) {
  const root = getViewContainer(AppCore);
  if (!root) return null;

  return paint(root, panelFallback({
    kind: "runtime-error",
    eyebrow: "Router error",
    title: "Error de navegación",
    message: redact(error?.message || "Error inesperado."),
    action: { href: getDefaultHomeTarget(AppCore, getRoute), text: "Recuperar" },
  }));
}

/* =========================================================
   FLOW HELPERS
========================================================= */

function call(fn, ...args) {
  try {
    if (isFn(fn)) return fn(...args);
  } catch {}
  return null;
}

function updateHistory(fn, payload = {}) {
  return call(fn, payload) || false;
}

/* =========================================================
   MAIN FLOWS
========================================================= */

export async function renderRouteSuccess({ AppCore, route, requestedPath, canonicalPath, requestedUsername, setShellMode, setDocumentTitle, getRoute } = {}) {
  const startedAt = perfMs();
  const { renderId, signal } = beginRender();
  const resolved = resolveRoutePaths({ AppCore, route, requestedPath, canonicalPath, requestedUsername });

  call(setShellMode, route);
  call(setDocumentTitle, route?.title || AppCore?.config?.appName || "Onion");

  const { view, host } = prepareHost({ AppCore, route, renderId, canonicalPath: resolved.canonicalPath, publicPath: resolved.publicPath, mode: "success" });
  const target = host || view;

  const ctx = buildRouteRenderContext({
    AppCore,
    route,
    requestedPath: resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    requestedUsername: resolved.username,
    renderId,
    signal,
    viewContainer: view,
    renderRoot: target,
  });

  let viewInstance = null;

  try {
    if (isFn(routeRenderer(route).render)) {
      viewInstance = await Promise.resolve(runRenderer(route, target, ctx));
      adoptResult(target, viewInstance);
    } else {
      viewInstance = renderGenericView(AppCore, route, target);
    }

    markReady(AppCore, renderId, route, resolved.canonicalPath, resolved.publicPath);

    emit(AppCore, "router:render:success", {
      routePath: route?.path || null,
      routeName: route?.name || null,
      viewKey: route?.viewKey || null,
      viewName: route?.viewName || null,
      canonicalPath: resolved.canonicalPath,
      publicPath: resolved.publicPath,
      renderId,
      durationMs: Math.round(perfMs() - startedAt),
    });

    return viewInstance || target || null;
  } catch (error) {
    markError(AppCore, renderId, route, resolved.canonicalPath, resolved.publicPath);
    throw error;
  }
}

export function renderRouteForbidden(args = {}) {
  abortActiveRender("forbidden");
  call(args.setShellMode, args.route || null);
  call(args.setDocumentTitle, "Acceso denegado");
  return renderForbiddenView(args.AppCore, args.getRoute);
}

export function renderRouteNotFound(args = {}) {
  abortActiveRender("not-found");
  call(args.setShellMode, args.route || null);
  call(args.setDocumentTitle, "404");
  return renderNotFoundView(args.AppCore, args.requestedPath || args.canonicalPath || DEFAULT_ROUTE, args.getRoute);
}

export async function renderLoginRedirect(args = {}) {
  abortActiveRender("login-redirect");

  const names = getRouteNames(args.AppCore);
  const loginPath = names.LOGIN || "/login";
  const loginUrl = safeText(args.redirectTo, "") || buildLoginUrl(args.AppCore, args.publicPath || args.requestedPath || args.canonicalPath || DEFAULT_ROUTE);
  const route = args.getRoute?.(loginPath) || null;
  const finalPublic = publicPath(args.AppCore, loginUrl || loginPath);

  call(args.clearDynamicContainers);
  call(args.setActiveMenu, loginPath);
  call(args.setShellMode, route);
  call(args.setDocumentTitle, route?.title || "Login");

  updateHistory(args.updateHistory, {
    AppCore: args.AppCore,
    getRoute: args.getRoute,
    pathname: finalPublic,
    options: {
      replaceState: true,
      redirectedFrom: args.publicPath || args.requestedPath || args.canonicalPath || null,
      source: "guard:not-authenticated",
    },
  });

  syncRouteState(args.AppCore, loginPath, finalPublic);

  const { renderId, signal } = beginRender();
  const { view, host } = prepareHost({ AppCore: args.AppCore, route, renderId, canonicalPath: loginPath, publicPath: finalPublic, mode: "login" });
  const target = host || view;

  const ctx = buildRouteRenderContext({
    AppCore: args.AppCore,
    route,
    requestedPath: finalPublic,
    canonicalPath: loginPath,
    publicPath: finalPublic,
    redirectedFrom: args.publicPath || args.requestedPath || args.canonicalPath || null,
    renderId,
    signal,
    viewContainer: view,
    renderRoot: target,
  });

  if (isFn(routeRenderer(route).render)) {
    const result = await Promise.resolve(runRenderer(route, target, ctx));
    adoptResult(target, result);
  } else {
    renderGenericView(args.AppCore, route, target);
  }

  markReady(args.AppCore, renderId, route, loginPath, finalPublic);

  emit(args.AppCore, "router:render:login-redirect", { canonicalPath: loginPath, publicPath: finalPublic, renderId });
  return null;
}

export function renderRouteRuntimeError(args = {}) {
  abortActiveRender("runtime-error");
  call(args.setShellMode, args.route || null);
  call(args.setDocumentTitle, "Error de navegación");

  const view = renderRuntimeErrorView(args.AppCore, args.error, args.getRoute);
  emit(args.AppCore, "router:render:error", {
    error: args.error,
    message: args.error?.message || "Error de navegación",
    canonicalPath: args.canonicalPath || args.requestedPath || DEFAULT_ROUTE,
    publicPath: args.requestedPath || args.canonicalPath || DEFAULT_ROUTE,
  });

  warn(args.AppCore, "runtime-error", args.error);
  return view;
}

/* =========================================================
   DEBUG
========================================================= */

export function getRenderSnapshot(AppCore) {
  const view = getViewContainer(AppCore);
  const host = currentHost(AppCore);

  return sanitize({
    version: ROUTER_RENDER_VERSION,
    currentPublicPath: AppCore?.state?.publicPath || DEFAULT_ROUTE,
    currentCanonicalPath: canonical(AppCore, AppCore?.state?.route || DEFAULT_ROUTE),
    renderSeq,
    activeRenderAborted: Boolean(activeController?.signal?.aborted),
    dom: {
      hasView: Boolean(view),
      hasRenderHost: Boolean(host),
      viewRenderId: view?.dataset?.routerRenderId || null,
      viewStatus: view?.dataset?.routerStatus || null,
      viewCanonicalPath: view?.dataset?.routerCanonicalPath || null,
      viewPublicPath: view?.dataset?.routerPublicPath || null,
      viewRoute: view?.dataset?.routerRoute || null,
      viewRouteName: view?.dataset?.routerRouteName || null,
      viewKey: view?.dataset?.routerViewKey || null,
      viewName: view?.dataset?.routerViewName || null,
      hostRenderId: host?.getAttribute?.("data-router-render-id") || null,
      hostCanonicalPath: host?.getAttribute?.("data-router-canonical-path") || null,
      hostPublicPath: host?.getAttribute?.("data-router-public-path") || null,
      hostRoute: host?.getAttribute?.("data-router-route") || null,
      hostRouteName: host?.getAttribute?.("data-router-route-name") || null,
      hostViewKey: host?.getAttribute?.("data-router-view-key") || null,
      hostViewName: host?.getAttribute?.("data-router-view-name") || null,
    },
    policy: {
      ownAuth: false,
      ownGuards: false,
      ownHistory: false,
      ownStorage: false,
      ownToast: false,
      ownNavigation: false,
      ownShellRepair: false,
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_RENDER_VERSION,

  getViewContainer,

  buildRenderPayload,
  emitBeforeRender,
  emitRendered,

  syncRouteState,
  applyResolvedRouteState,
  buildRouteRenderContext,

  renderGenericView,
  renderForbiddenView,
  renderNotFoundView,
  renderRuntimeErrorView,

  renderRouteSuccess,
  renderRouteForbidden,
  renderRouteNotFound,
  renderLoginRedirect,
  renderRouteRuntimeError,

  getRenderSnapshot,
};
