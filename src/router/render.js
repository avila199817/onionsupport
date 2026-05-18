/* =========================================================
   Onion Support - Router Render
   Archivo: /src/router/render.js

   Responsabilidad:
   - Render DOM mínimo.
   - Preparar #view-container.
   - Crear un host estable por navegación.
   - Ejecutar route.render(host, context).
   - Adoptar resultado de vista sólo si es seguro.
   - Inyectar contexto común: AppCore / I18n / t / Toast.
   - Pintar fallback simple.
   - Mantener publicPath visible y canonicalPath interno.
   - No exponer token real en DOM/snapshot.
   - Sin imports.
   - Sin Auth.
   - Sin guards.
   - Sin history propio.
   - Sin storage.
   - Sin Toast propio.
   - Sin i18n propio.
   - Sin fetch.
   - Sin navegación.
   - Sin validar slug real.
   - Sin CustomEvent.
   - Sin /403.
   - Sin /404.
   - Sin magia negra.
========================================================= */

export const ROUTER_RENDER_VERSION = "router.render.v3";

const DEFAULT_ROUTE = "/";
const USER_HOME_PREFIX = "/@";

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

function nextRenderId() {
  renderSeq += 1;
  return `render_${renderSeq}`;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function call(fn = null, ...args) {
  try {
    return isFunction(fn) ? fn(...args) : null;
  } catch {
    return null;
  }
}

/* =========================================================
   PATHS
========================================================= */

function normalizeHashPath(path = DEFAULT_ROUTE) {
  const value = text(path, DEFAULT_ROUTE);

  if (value.startsWith("#!")) {
    return value.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  if (value.startsWith("#/")) {
    return value.slice(1) || DEFAULT_ROUTE;
  }

  return value;
}

function pathFromInput(path = DEFAULT_ROUTE) {
  const value = normalizeHashPath(path);

  if (!value || value.startsWith("//")) {
    return DEFAULT_ROUTE;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return DEFAULT_ROUTE;
  }

  return value;
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let value = text(pathname, DEFAULT_ROUTE).replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || DEFAULT_ROUTE;
  }

  return value || DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const value = text(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = text(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitPath(path = DEFAULT_ROUTE) {
  let raw = pathFromInput(path);
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || DEFAULT_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || DEFAULT_ROUTE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || DEFAULT_ROUTE),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

function normalizePublicPath(path = DEFAULT_ROUTE) {
  return joinPath(splitPath(path));
}

function normalizeUserSlug(value = "") {
  const slug = text(value, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

function extractSlugFromPath(path = DEFAULT_ROUTE) {
  const pathname = splitPath(path).pathname;

  if (!pathname.startsWith(USER_HOME_PREFIX)) return "";

  const slug = pathname.slice(USER_HOME_PREFIX.length);

  if (!slug || slug.includes("/")) return "";

  return normalizeUserSlug(slug);
}

function isUserHomePath(path = DEFAULT_ROUTE) {
  return Boolean(extractSlugFromPath(path));
}

function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const pathname = splitPath(path).pathname || DEFAULT_ROUTE;

  return isUserHomePath(pathname)
    ? DEFAULT_ROUTE
    : pathname;
}

function resolvePaths({
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = "",
  publicPath = "",
} = {}) {
  const visible = normalizePublicPath(
    publicPath ||
      requestedPath ||
      route?.path ||
      DEFAULT_ROUTE
  );

  const canonical = normalizeCanonicalPath(
    canonicalPath ||
      route?.path ||
      visible ||
      DEFAULT_ROUTE
  );

  return {
    canonicalPath: canonical,
    publicPath: visible,
  };
}

function domPath(path = DEFAULT_ROUTE) {
  return redact(normalizePublicPath(path));
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

function setAttr(node = null, name = "", value = "") {
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

function setData(node = null, name = "", value = "") {
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

function clear(node = null) {
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

function create(
  tag = "div",
  {
    className = "",
    textContent = "",
    attrs = {},
    dataset = {},
  } = {}
) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (textContent) {
    node.textContent = textContent;
  }

  for (const [key, value] of Object.entries(isObject(attrs) ? attrs : {})) {
    setAttr(node, key, value);
  }

  for (const [key, value] of Object.entries(isObject(dataset) ? dataset : {})) {
    setData(node, key, value);
  }

  return node;
}

function append(parent = null, children = []) {
  if (!parent) return parent;

  const list = Array.isArray(children) ? children : [children];

  for (const child of list) {
    if (!child) continue;

    try {
      parent.appendChild(child);
    } catch {
      // noop
    }
  }

  return parent;
}

function nodeContains(parent = null, child = null) {
  if (!isNode(parent) || !isNode(child)) return false;

  try {
    return parent !== child && parent.contains?.(child) === true;
  } catch {
    return false;
  }
}

function canPaintNode(target = null, node = null) {
  if (!target || !isNode(node)) return false;
  if (node === target) return false;
  if (nodeContains(node, target)) return false;

  return true;
}

function paint(target = null, content = null) {
  if (!target) return null;

  if (content === target) {
    return target;
  }

  if (isNode(content)) {
    if (!canPaintNode(target, content)) {
      return target;
    }

    try {
      target.replaceChildren(content);
      return content;
    } catch {
      try {
        clear(target);
        target.appendChild(content);
        return content;
      } catch {
        return null;
      }
    }
  }

  if (typeof content === "string") {
    return paint(
      target,
      create("div", {
        className: "router-text-view",
        textContent: content,
      })
    );
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

function markView(
  AppCore = null,
  {
    status = "ready",
    renderId = "",
    route = null,
    canonicalPath = DEFAULT_ROUTE,
    publicPath = DEFAULT_ROUTE,
  } = {}
) {
  const view = getViewContainer(AppCore);

  if (!view) return false;

  setData(view, "routerStatus", status);
  setData(view, "routerRenderId", renderId);
  setData(view, "routerCanonicalPath", normalizeCanonicalPath(canonicalPath));
  setData(view, "routerPublicPath", domPath(publicPath));
  setData(view, "routerRoute", route?.path || normalizeCanonicalPath(canonicalPath));
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
      "data-router-route": route?.path || normalizeCanonicalPath(canonicalPath),
      "data-router-route-name": route?.name || "",
      "data-router-view-key": route?.viewKey || "",
      "data-router-view-name": route?.viewName || "",
      "data-router-canonical-path": normalizeCanonicalPath(canonicalPath),
      "data-router-public-path": domPath(publicPath),
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

function adoptResult(target = null, result = null) {
  if (!target || result === undefined || result === null) {
    return result || null;
  }

  if (result === target) {
    return target;
  }

  if (isNode(result)) {
    if (!canPaintNode(target, result)) {
      return target;
    }

    return paint(target, result);
  }

  if (typeof result === "string") {
    return paint(target, result);
  }

  for (const key of ["element", "node", "root", "container"]) {
    const candidate = result?.[key];

    if (!isNode(candidate)) continue;

    if (candidate === target) {
      return target;
    }

    if (!canPaintNode(target, candidate)) {
      return target;
    }

    return paint(target, candidate);
  }

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
  if (isFunction(AppCore?.t)) return AppCore.t.bind(AppCore);

  const I18n = getI18n(AppCore);

  if (isFunction(I18n?.t)) return I18n.t.bind(I18n);
  if (isFunction(I18n?.translate)) return I18n.translate.bind(I18n);

  return (key = "", _params = {}, fallback = "") => text(fallback || key, "");
}

function getShowToast(AppCore = null) {
  const Toast = getToast(AppCore);

  if (isFunction(AppCore?.showToast)) return AppCore.showToast.bind(AppCore);
  if (isFunction(Toast?.show)) return Toast.show.bind(Toast);
  if (isFunction(Toast)) return Toast;

  return null;
}

/* =========================================================
   CONTEXT
========================================================= */

function routeRenderer(route = null) {
  return isFunction(route?.render) ? route.render : null;
}

export function buildRouteRenderContext({
  AppCore = null,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = null,
  routeParams = {},
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

    routeParams: isObject(routeParams) ? { ...routeParams } : {},
    publicSlug: extractSlugFromPath(resolved.publicPath) || null,

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

function fallbackView({
  kind = "info",
  title = "",
  message = "",
  action = null,
} = {}) {
  const section = create("section", {
    className: `router-fallback router-fallback--${kind}`,
    attrs: {
      role: kind === "error" ? "alert" : "region",
    },
  });

  const card = create("div", {
    className: "router-fallback__card",
  });

  append(
    card,
    create("h1", {
      className: "router-fallback__title",
      textContent: title || "Onion Support",
    })
  );

  if (message) {
    append(
      card,
      create("p", {
        className: "router-fallback__message",
        textContent: message,
      })
    );
  }

  if (action?.href && action?.text) {
    append(
      card,
      create("a", {
        className: "router-fallback__action",
        textContent: action.text,
        attrs: {
          href: normalizePublicPath(action.href),
          "data-spa": "",
          "data-route": normalizePublicPath(action.href),
        },
      })
    );
  }

  append(section, card);

  return section;
}

function renderFallbackInto({
  AppCore = null,
  route = null,
  kind = "info",
  title = "Onion Support",
  message = "",
  action = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = null,
  routeParams = {},
  mode = "fallback",
  status = "ready",
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  const renderId = nextRenderId();

  const resolved = resolvePaths({
    route,
    requestedPath,
    canonicalPath,
    publicPath,
  });

  call(setShellMode, route || null);
  call(setDocumentTitle, title);

  const { view, host } = prepareHost({
    AppCore,
    route,
    renderId,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    mode,
  });

  const target = host || view;

  if (!target) return null;

  const node = fallbackView({
    kind,
    title,
    message,
    action,
  });

  paint(target, node);

  markView(AppCore, {
    status,
    renderId,
    route,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
  });

  return buildRouteRenderContext({
    AppCore,
    route,
    requestedPath: resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    routeParams,
    renderId,
    viewContainer: view,
    renderRoot: target,
    found: kind !== "not-found",
    forbidden: kind === "forbidden",
  }).renderRoot;
}

export function renderGenericView(AppCore = null, route = null, target = null) {
  const root = target || getCurrentHost(AppCore) || getViewContainer(AppCore);

  if (!root) return null;

  return paint(
    root,
    fallbackView({
      kind: "generic",
      title: route?.title || route?.name || "Vista",
      message: "Vista conectada al router.",
    })
  );
}

export function renderForbiddenView(AppCore = null, target = null) {
  const root = target || getCurrentHost(AppCore) || getViewContainer(AppCore);

  if (!root) return null;

  return paint(
    root,
    fallbackView({
      kind: "forbidden",
      title: "Acceso no permitido",
      message: "No tienes permisos para acceder a esta vista.",
      action: {
        href: DEFAULT_ROUTE,
        text: "Volver al inicio",
      },
    })
  );
}

export function renderNotFoundView(
  AppCore = null,
  requestedPath = DEFAULT_ROUTE,
  target = null
) {
  const root = target || getCurrentHost(AppCore) || getViewContainer(AppCore);

  if (!root) return null;

  return paint(
    root,
    fallbackView({
      kind: "not-found",
      title: "Ruta no encontrada",
      message: `No se ha podido resolver la ruta solicitada: ${redact(
        requestedPath || DEFAULT_ROUTE
      )}`,
      action: {
        href: DEFAULT_ROUTE,
        text: "Volver al inicio",
      },
    })
  );
}

export function renderRuntimeErrorView(
  AppCore = null,
  error = null,
  target = null
) {
  const root = target || getCurrentHost(AppCore) || getViewContainer(AppCore);

  if (!root) return null;

  return paint(
    root,
    fallbackView({
      kind: "error",
      title: "Error de navegación",
      message: redact(error?.message || "Error inesperado."),
      action: {
        href: DEFAULT_ROUTE,
        text: "Volver al inicio",
      },
    })
  );
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
  routeParams = {},
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
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
    routeParams,
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
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = null,
  routeParams = {},
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  return renderFallbackInto({
    AppCore,
    route,
    kind: "forbidden",
    title: "Acceso no permitido",
    message: "No tienes permisos para acceder a esta vista.",
    action: {
      href: DEFAULT_ROUTE,
      text: "Volver al inicio",
    },
    requestedPath,
    canonicalPath,
    publicPath,
    routeParams,
    mode: "forbidden",
    setShellMode,
    setDocumentTitle,
  });
}

export function renderRouteNotFound({
  AppCore = null,
  route = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = null,
  routeParams = {},
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  const visible = normalizePublicPath(publicPath || requestedPath || canonicalPath);

  return renderFallbackInto({
    AppCore,
    route,
    kind: "not-found",
    title: "Ruta no encontrada",
    message: `No se ha podido resolver la ruta solicitada: ${redact(visible)}`,
    action: {
      href: DEFAULT_ROUTE,
      text: "Volver al inicio",
    },
    requestedPath: visible,
    canonicalPath,
    publicPath: visible,
    routeParams,
    mode: "not-found",
    setShellMode,
    setDocumentTitle,
  });
}

export function renderRouteRuntimeError({
  AppCore = null,
  route = null,
  error = null,
  requestedPath = DEFAULT_ROUTE,
  canonicalPath = DEFAULT_ROUTE,
  publicPath = null,
  routeParams = {},
  setShellMode = null,
  setDocumentTitle = null,
} = {}) {
  const visible = normalizePublicPath(publicPath || requestedPath || canonicalPath);

  return renderFallbackInto({
    AppCore,
    route,
    kind: "error",
    title: "Error de navegación",
    message: redact(error?.message || "No se pudo renderizar esta vista."),
    action: {
      href: DEFAULT_ROUTE,
      text: "Volver al inicio",
    },
    requestedPath: visible,
    canonicalPath,
    publicPath: visible,
    routeParams,
    mode: "error",
    status: "error",
    setShellMode,
    setDocumentTitle,
  });
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
    currentCanonicalPath: redact(
      AppCore?.state?.canonicalPath ||
        AppCore?.state?.route ||
        DEFAULT_ROUTE
    ),

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

      hostCanonicalPath: redact(host?.dataset?.routerCanonicalPath || ""),
      hostPublicPath: redact(host?.dataset?.routerPublicPath || ""),
    },

    policy: {
      renderOnly: true,

      ownAuth: false,
      ownGuards: false,
      ownHistory: false,
      ownStorage: false,
      ownToast: false,
      ownI18n: false,
      ownNavigation: false,
      ownShellRepair: false,

      injectsSharedContext: true,
      safeAdoptResult: true,
      singleStableHost: true,

      preservesPublicPath: true,
      preservesCanonicalPath: true,
      noTokenInDomDataset: true,

      validatesRealUserSlug: false,
      realSlugValidationOwner: "router/index.js",

      noCustomEvent: true,
      no403Route: true,
      no404Route: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_RENDER_VERSION,

  getViewContainer,
  buildRouteRenderContext,

  renderGenericView,
  renderForbiddenView,
  renderNotFoundView,
  renderRuntimeErrorView,

  renderRouteSuccess,
  renderRouteForbidden,
  renderRouteNotFound,
  renderRouteRuntimeError,

  getRenderSnapshot,
};
