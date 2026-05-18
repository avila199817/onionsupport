/* =========================================================
   Onion Support - Router Render
   Archivo: /src/router/render.js

   Responsabilidad:
   - Render DOM mínimo.
   - Preparar #view-container.
   - Ejecutar route.render(root, context).
   - Inyectar contexto común: AppCore / I18n / t / Toast.
   - Pintar fallback simple.
   - Sin imports.
   - Sin Auth.
   - Sin guards.
   - Sin history propio.
   - Sin storage.
   - Sin Toast propio.
   - Sin i18n propio.
   - Sin fetch.
   - Sin username public slug.
   - Sin CustomEvent.
   - Sin magia negra.
========================================================= */

export const ROUTER_RENDER_VERSION = "simple";

const SOURCE = "router.render";
const DEFAULT_ROUTE = "/";
const HOST_ATTR = "data-router-view-host";
const HOST_CLASS = "router-view-host";

let renderSeq = 0;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNode(value) {
  try {
    return Boolean(typeof Node !== "undefined" && value instanceof Node);
  } catch {
    return Boolean(value && typeof value.nodeType === "number");
  }
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function nowMs() {
  return Date.now();
}

function nextRenderId() {
  renderSeq += 1;
  return `render_${renderSeq}`;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function emit(AppCore = null, eventName = "", payload = {}, options = {}) {
  if (options.emit === false || options.emitEvents === false) return false;

  const name = text(eventName, "");
  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, {
      source: SOURCE,
      version: ROUTER_RENDER_VERSION,
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

function call(fn, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

/* =========================================================
   PATHS
========================================================= */

function normalizePublicPath(path = DEFAULT_ROUTE) {
  let value = text(path, DEFAULT_ROUTE);

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || DEFAULT_ROUTE;
}

function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || DEFAULT_ROUTE;

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value || DEFAULT_ROUTE;
}

function resolvePaths({
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = "",
} = {}) {
  const canonical = normalizeCanonicalPath(
    canonicalPath ||
      route?.path ||
      requestedPath ||
      DEFAULT_ROUTE
  );

  const visible = normalizePublicPath(
    publicPath ||
      requestedPath ||
      canonical
  );

  return {
    canonicalPath: canonical,
    publicPath: visible,
  };
}

/* =========================================================
   DOM
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function query(selector = "") {
  if (!isBrowser() || !selector) return null;

  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function setAttr(node, name = "", value = "") {
  if (!node || !name) return false;

  try {
    if (value === null || value === undefined || value === "") {
      node.removeAttribute(name);
    } else {
      node.setAttribute(name, String(value));
    }

    return true;
  } catch {
    return false;
  }
}

function setData(node, name = "", value = "") {
  if (!node || !name) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete node.dataset[name];
    } else {
      node.dataset[name] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function clear(node) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function create(tag = "div", { className = "", textContent = "", attrs = {}, dataset = {} } = {}) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (textContent) node.textContent = textContent;

  for (const [key, value] of Object.entries(isObject(attrs) ? attrs : {})) {
    setAttr(node, key, value);
  }

  for (const [key, value] of Object.entries(isObject(dataset) ? dataset : {})) {
    setData(node, key, value);
  }

  return node;
}

function append(parent, children = []) {
  if (!parent) return parent;

  for (const child of Array.isArray(children) ? children : [children]) {
    if (!child) continue;

    try {
      parent.appendChild(child);
    } catch {
      // noop
    }
  }

  return parent;
}

function paint(target, content) {
  if (!target) return null;

  if (isNode(content)) {
    try {
      target.replaceChildren(content);
      return content;
    } catch {
      clear(target);
      target.appendChild(content);
      return content;
    }
  }

  if (typeof content === "string") {
    const node = create("div", {
      className: "router-text-view",
      textContent: content,
    });

    return paint(target, node);
  }

  return content || null;
}

export function getViewContainer(AppCore = null) {
  if (!isBrowser()) return null;

  try {
    const cached = AppCore?.dom?.viewContainer;

    if (cached && document.contains(cached)) {
      return cached;
    }
  } catch {
    // noop
  }

  const view =
    byId("view-container") ||
    query("[data-router-view]") ||
    byId("app-content") ||
    byId("main-content") ||
    document.body ||
    null;

  try {
    if (view && AppCore?.dom) {
      AppCore.dom.viewContainer = view;
    }
  } catch {
    // noop
  }

  return view;
}

function getCurrentHost(AppCore = null) {
  const view = getViewContainer(AppCore);

  if (!view) return null;

  try {
    return view.querySelector(`[${HOST_ATTR}="true"]`);
  } catch {
    return null;
  }
}

function markView(AppCore = null, {
  status = "ready",
  renderId = "",
  route = null,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = DEFAULT_ROUTE,
} = {}) {
  const view = getViewContainer(AppCore);

  if (!view) return false;

  setData(view, "routerStatus", status);
  setData(view, "routerRenderId", renderId);
  setData(view, "routerCanonicalPath", canonicalPath);
  setData(view, "routerPublicPath", publicPath);
  setData(view, "routerRoute", route?.path || canonicalPath);
  setData(view, "routerRouteName", route?.name || "");
  setData(view, "routerViewKey", route?.viewKey || "");
  setData(view, "routerViewName", route?.viewName || "");

  setAttr(view, "aria-busy", status === "rendering" ? "true" : "false");
  setAttr(view, "aria-hidden", "false");

  try {
    view.hidden = false;
  } catch {
    // noop
  }

  return true;
}

function prepareHost({
  AppCore = null,
  route = null,
  renderId = "",
  canonicalPath = DEFAULT_ROUTE,
  publicPath = DEFAULT_ROUTE,
  mode = "route",
} = {}) {
  const view = getViewContainer(AppCore);

  if (!view) {
    return {
      view: null,
      host: null,
    };
  }

  markView(AppCore, {
    status: "rendering",
    renderId,
    route,
    canonicalPath,
    publicPath,
  });

  const host = create("div", {
    className: HOST_CLASS,
    attrs: {
      [HOST_ATTR]: "true",
      "data-router-render-id": renderId,
      "data-router-mode": mode,
      "data-router-route": route?.path || canonicalPath,
      "data-router-route-name": route?.name || "",
      "data-router-view-key": route?.viewKey || "",
      "data-router-view-name": route?.viewName || "",
      "data-router-canonical-path": canonicalPath,
      "data-router-public-path": publicPath,
    },
  });

  paint(view, host);

  try {
    if (AppCore?.dom) {
      AppCore.dom.routerViewHost = host;
      AppCore.dom.viewHost = host;
    }
  } catch {
    // noop
  }

  return {
    view,
    host,
  };
}

function adoptResult(target, result) {
  if (!target || result === undefined || result === null) {
    return result || null;
  }

  if (isNode(result) || typeof result === "string") {
    return paint(target, result);
  }

  if (isNode(result.element)) return paint(target, result.element);
  if (isNode(result.node)) return paint(target, result.node);
  if (isNode(result.root)) return paint(target, result.root);
  if (isNode(result.container)) return paint(target, result.container);

  return result;
}

/* =========================================================
   SHARED CONTEXT
========================================================= */

function getI18n(AppCore = null) {
  return AppCore?.I18n || AppCore?.i18n || AppCore?.services?.i18n || null;
}

function getToast(AppCore = null) {
  return AppCore?.Toast || AppCore?.toast || AppCore?.services?.toast || null;
}

function getTranslator(AppCore = null) {
  if (isFunction(AppCore?.t)) return AppCore.t;

  const I18n = getI18n(AppCore);

  if (isFunction(I18n?.t)) return I18n.t;
  if (isFunction(I18n?.translate)) return I18n.translate;

  return (key = "", _params = {}, fallback = "") => text(fallback || key, "");
}

function getShowToast(AppCore = null) {
  const Toast = getToast(AppCore);

  if (isFunction(AppCore?.showToast)) return AppCore.showToast;
  if (isFunction(Toast?.show)) return Toast.show.bind(Toast);
  if (isFunction(Toast)) return Toast;

  return null;
}

/* =========================================================
   ROUTE RENDERER
========================================================= */

function routeRenderer(route = null) {
  return isFunction(route?.render) ? route.render : null;
}

/* =========================================================
   PAYLOAD / STATE
========================================================= */

export function buildRenderPayload({
  AppCore = null,
  path = "",
  requestedPath = "",
  canonicalPath = "",
  publicPath = "",
  route = null,
  found = false,
  forbidden = false,
  redirectedFrom = null,
  options = null,
  renderId = null,
  flow = "",
  status = "",
} = {}) {
  const resolved = resolvePaths({
    route,
    requestedPath: requestedPath || path || publicPath || route?.path || DEFAULT_ROUTE,
    canonicalPath: canonicalPath || route?.path || requestedPath || path || DEFAULT_ROUTE,
    publicPath: publicPath || requestedPath || path || "",
  });

  return {
    path: resolved.publicPath,
    requestedPath: requestedPath || path || resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,

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

    AppCore: AppCore || null,
  };
}

export function emitBeforeRender(AppCore = null, payload = {}) {
  const finalPayload = buildRenderPayload({
    AppCore,
    ...(isObject(payload) ? payload : {}),
    flow: payload?.flow || "before-render",
  });

  emit(AppCore, "router:before-render", finalPayload);

  return finalPayload;
}

export function emitRendered(AppCore = null, payload = {}) {
  const finalPayload = buildRenderPayload({
    AppCore,
    ...(isObject(payload) ? payload : {}),
    flow: payload?.flow || "rendered",
  });

  emit(AppCore, "router:rendered", finalPayload);

  return finalPayload;
}

/* Compat: el router actual ya sincroniza estado. Mantener para imports antiguos. */
export function syncRouteState(AppCore = null, canonicalPath = DEFAULT_ROUTE, publicPath = null) {
  const canonical = normalizeCanonicalPath(canonicalPath || DEFAULT_ROUTE);
  const visible = normalizePublicPath(publicPath || canonical);

  try {
    AppCore?.setState?.(
      {
        route: canonical,
        canonicalPath: canonical,
        publicPath: visible,
      },
      {
        source: SOURCE,
        silent: true,
        emit: false,
      }
    );
  } catch {
    try {
      Object.assign(AppCore.state, {
        route: canonical,
        canonicalPath: canonical,
        publicPath: visible,
      });
    } catch {
      // noop
    }
  }

  return {
    canonicalPath: canonical,
    publicPath: visible,
  };
}

export function applyResolvedRouteState(AppCore = null, canonicalPath = DEFAULT_ROUTE, fallbackPublicPath = null) {
  return syncRouteState(AppCore, canonicalPath, fallbackPublicPath || canonicalPath || DEFAULT_ROUTE);
}

export function buildRouteRenderContext({
  AppCore = null,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = null,
  redirectedFrom = null,
  found = true,
  forbidden = false,
  renderId = null,
  renderRoot = null,
  viewContainer = null,
} = {}) {
  const resolved = resolvePaths({
    route,
    requestedPath: publicPath || requestedPath,
    canonicalPath,
    publicPath: publicPath || requestedPath,
  });

  const view = viewContainer || getViewContainer(AppCore);
  const host = renderRoot || getCurrentHost(AppCore) || view;

  const I18n = getI18n(AppCore);
  const Toast = getToast(AppCore);
  const t = getTranslator(AppCore);
  const showToast = getShowToast(AppCore);

  return Object.freeze({
    AppCore,
    route,

    I18n,
    i18n: I18n,
    t,

    Toast,
    toast: Toast,
    showToast,

    path: resolved.publicPath,
    requestedPath: resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,

    redirectedFrom,
    found: Boolean(found),
    forbidden: Boolean(forbidden),

    renderId,

    viewContainer: view,
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

function fallbackView({ kind = "info", title = "", message = "", action = null } = {}) {
  const section = create("section", {
    className: `router-fallback router-fallback--${kind}`,
    attrs: {
      role: kind === "error" ? "alert" : "region",
    },
  });

  const card = create("div", {
    className: "router-fallback__card",
  });

  append(card, create("h1", {
    className: "router-fallback__title",
    textContent: title || "Onion Support",
  }));

  if (message) {
    append(card, create("p", {
      className: "router-fallback__message",
      textContent: message,
    }));
  }

  if (action?.href && action?.text) {
    append(card, create("a", {
      className: "router-fallback__action",
      textContent: action.text,
      attrs: {
        href: action.href,
        "data-spa": "",
      },
    }));
  }

  append(section, card);

  return section;
}

export function renderGenericView(AppCore = null, route = null, target = null) {
  const root = target || getCurrentHost(AppCore) || getViewContainer(AppCore);

  if (!root) return null;

  return paint(root, fallbackView({
    kind: "generic",
    title: route?.title || route?.name || "Vista",
    message: "Vista conectada al router.",
  }));
}

export function renderForbiddenView(AppCore = null) {
  const root = getViewContainer(AppCore);

  if (!root) return null;

  return paint(root, fallbackView({
    kind: "forbidden",
    title: "Acceso no permitido",
    message: "No tienes permisos para acceder a esta vista.",
    action: {
      href: DEFAULT_ROUTE,
      text: "Volver al inicio",
    },
  }));
}

export function renderNotFoundView(AppCore = null, requestedPath = DEFAULT_ROUTE) {
  const root = getViewContainer(AppCore);

  if (!root) return null;

  return paint(root, fallbackView({
    kind: "not-found",
    title: "Ruta no encontrada",
    message: `No se ha podido resolver la ruta solicitada: ${redact(requestedPath || DEFAULT_ROUTE)}`,
    action: {
      href: DEFAULT_ROUTE,
      text: "Volver al inicio",
    },
  }));
}

export function renderRuntimeErrorView(AppCore = null, error = null) {
  const root = getViewContainer(AppCore);

  if (!root) return null;

  return paint(root, fallbackView({
    kind: "error",
    title: "Error de navegación",
    message: redact(error?.message || "Error inesperado."),
    action: {
      href: DEFAULT_ROUTE,
      text: "Volver al inicio",
    },
  }));
}

/* =========================================================
   MAIN FLOWS
========================================================= */

export async function renderRouteSuccess({
  AppCore = null,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = null,
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  const startedAt = nowMs();
  const renderId = nextRenderId();

  const resolved = resolvePaths({
    route,
    requestedPath,
    canonicalPath,
    publicPath,
  });

  call(setShellMode, route);
  call(setDocumentTitle, route?.title || route?.name || "Onion Support");

  const { view, host } = prepareHost({
    AppCore,
    route,
    renderId,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    mode: "success",
  });

  const target = host || view;

  if (!target) return null;

  const context = buildRouteRenderContext({
    AppCore,
    route,
    requestedPath: resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    renderId,
    viewContainer: view,
    renderRoot: target,
  });

  try {
    const renderer = routeRenderer(route);
    const result = renderer
      ? await Promise.resolve(renderer(target, context))
      : renderGenericView(AppCore, route, target);

    adoptResult(target, result);

    markView(AppCore, {
      status: "ready",
      renderId,
      route,
      canonicalPath: resolved.canonicalPath,
      publicPath: resolved.publicPath,
    });

    emit(AppCore, "router:render:success", {
      routePath: route?.path || null,
      routeName: route?.name || null,
      canonicalPath: redact(resolved.canonicalPath),
      publicPath: redact(resolved.publicPath),
      durationMs: nowMs() - startedAt,
    });

    return result || target;
  } catch (error) {
    markView(AppCore, {
      status: "error",
      renderId,
      route,
      canonicalPath: resolved.canonicalPath,
      publicPath: resolved.publicPath,
    });

    throw error;
  }
}

export function renderRouteForbidden({
  AppCore = null,
  route = null,
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  call(setShellMode, route || null);
  call(setDocumentTitle, "Acceso no permitido");

  return renderForbiddenView(AppCore);
}

export function renderRouteNotFound({
  AppCore = null,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  call(setShellMode, route || null);
  call(setDocumentTitle, "Ruta no encontrada");

  return renderNotFoundView(AppCore, requestedPath || canonicalPath || DEFAULT_ROUTE);
}

export async function renderLoginRedirect({
  AppCore = null,
  getRoute = null,
  redirectTo = "/login",
  publicPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  clearDynamicContainers = null,
  setActiveMenu = null,
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  const loginPath = normalizeCanonicalPath(redirectTo || "/login");
  const loginPublicPath = normalizePublicPath(redirectTo || loginPath);
  const loginRoute = call(getRoute, loginPath) || null;
  const renderId = nextRenderId();

  call(clearDynamicContainers);
  call(setActiveMenu, loginPath);
  call(setShellMode, loginRoute);
  call(setDocumentTitle, loginRoute?.title || "Acceso");

  const { view, host } = prepareHost({
    AppCore,
    route: loginRoute,
    renderId,
    canonicalPath: loginPath,
    publicPath: loginPublicPath,
    mode: "login",
  });

  const target = host || view;

  if (!target) return null;

  const context = buildRouteRenderContext({
    AppCore,
    route: loginRoute,
    requestedPath: loginPublicPath,
    canonicalPath: loginPath,
    publicPath: loginPublicPath,
    redirectedFrom: publicPath || canonicalPath || null,
    renderId,
    viewContainer: view,
    renderRoot: target,
  });

  const renderer = routeRenderer(loginRoute);

  const result = renderer
    ? await Promise.resolve(renderer(target, context))
    : renderGenericView(AppCore, loginRoute, target);

  adoptResult(target, result);

  markView(AppCore, {
    status: "ready",
    renderId,
    route: loginRoute,
    canonicalPath: loginPath,
    publicPath: loginPublicPath,
  });

  emit(AppCore, "router:render:login-redirect", {
    canonicalPath: redact(loginPath),
    publicPath: redact(loginPublicPath),
  });

  return result || target;
}

export function renderRouteRuntimeError({
  AppCore = null,
  route = null,
  error = null,
  canonicalPath = DEFAULT_ROUTE,
  requestedPath = DEFAULT_ROUTE,
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  call(setShellMode, route || null);
  call(setDocumentTitle, "Error de navegación");

  const view = renderRuntimeErrorView(AppCore, error);

  emit(AppCore, "router:render:error", {
    message: redact(error?.message || "Error de navegación"),
    canonicalPath: redact(normalizeCanonicalPath(canonicalPath || requestedPath || DEFAULT_ROUTE)),
    publicPath: redact(normalizePublicPath(requestedPath || canonicalPath || DEFAULT_ROUTE)),
  });

  return view;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getRenderSnapshot(AppCore = null) {
  const view = getViewContainer(AppCore);
  const host = getCurrentHost(AppCore);

  return {
    version: ROUTER_RENDER_VERSION,

    renderSeq,

    currentPublicPath: redact(AppCore?.state?.publicPath || DEFAULT_ROUTE),
    currentCanonicalPath: redact(AppCore?.state?.canonicalPath || AppCore?.state?.route || DEFAULT_ROUTE),

    context: {
      hasI18n: Boolean(getI18n(AppCore)),
      hasTranslator: isFunction(getTranslator(AppCore)),
      hasToast: Boolean(getToast(AppCore)),
      hasShowToast: isFunction(getShowToast(AppCore)),
    },

    dom: {
      hasView: Boolean(view),
      hasHost: Boolean(host),
      viewStatus: view?.dataset?.routerStatus || null,
      viewRenderId: view?.dataset?.routerRenderId || null,
      viewCanonicalPath: redact(view?.dataset?.routerCanonicalPath || ""),
      viewPublicPath: redact(view?.dataset?.routerPublicPath || ""),
      viewRoute: view?.dataset?.routerRoute || null,
      viewRouteName: view?.dataset?.routerRouteName || null,
      viewKey: view?.dataset?.routerViewKey || null,
      viewName: view?.dataset?.routerViewName || null,
    },

    policy: {
      ownAuth: false,
      ownGuards: false,
      ownHistory: false,
      ownStorage: false,
      ownToast: false,
      ownI18n: false,
      injectsSharedContext: true,
      ownNavigation: false,
      ownShellRepair: false,
      noUsernamePublicSlug: true,
      noCustomEvent: true,
    },
  };
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
