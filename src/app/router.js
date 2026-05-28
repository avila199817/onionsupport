/* =========================================================
   Onion Support - App Router
   Archivo: /src/app/router.js

   Responsabilidad:
   - Wrapper mínimo sobre /src/router/index.js.
   - Inicializar Router sin render automático.
   - Bindear Router si existe.
   - Renderizar una sola vez la ruta inicial capturada por main.js.
   - Preservar query/hash de la ruta inicial.
   - Delegar guards, render, history, canonicalización y redirects
     al Router real.
   - Sin restore, Auth, storage, fetch, eventos, token flow,
     navegación paralela ni debug pesado.
========================================================= */

import { Router } from "../router/index.js";

export const ROUTER_BOOTSTRAP_VERSION = "app.router.v7";

const INIT_OPTIONS = Object.freeze({
  appManagedInitialRender: true,
  skipInitialRender: true,
  render: false,
});

const INITIAL_RENDER_OPTIONS = Object.freeze({
  initialRender: true,
  replaceState: true,
  skipHistory: true,
});

let configured = false;
let bound = false;
let rendered = false;

let configurePromise = null;
let bindPromise = null;
let renderPromise = null;

let lastInitialPath = "";
let lastRenderResult = null;
let lastRenderError = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function safeError(error = null) {
  if (!error) return null;

  return {
    name: cleanText(error.name, "Error"),
    message: redact(error.message || String(error)),
    code: error.code || error.error || null,
    status: error.status || error.statusCode || error.response?.status || null,
  };
}

function currentPath() {
  if (!isBrowser()) return "/";

  try {
    const { pathname = "/", search = "", hash = "" } = window.location;
    return `${pathname || "/"}${search || ""}${hash || ""}`;
  } catch {
    return "/";
  }
}

function pathCandidate(value = "") {
  return typeof value === "string" ? cleanText(value, "") : "";
}

function resolveInitialPath(options = {}) {
  const input = isPlainObject(options) ? options : {};
  const bootContext = isPlainObject(input.bootContext) ? input.bootContext : {};

  return (
    pathCandidate(bootContext.initialPath) ||
    pathCandidate(input.initialPath) ||
    pathCandidate(input.publicPath) ||
    pathCandidate(input.path) ||
    pathCandidate(input.route) ||
    currentPath()
  );
}

function routerPayload(options = {}, extra = {}) {
  const input = isPlainObject(options) ? options : {};
  const patch = isPlainObject(extra) ? extra : {};

  return {
    ...input,
    ...patch,
    source: cleanText(patch.source || input.source, "app.router"),
  };
}

function requireRouterMethod(name = "") {
  const fn = Router?.[name];

  if (!isFunction(fn)) {
    throw new Error(`Router.${name}() no disponible.`);
  }

  return fn.bind(Router);
}

function summarizeRenderResult(result = null) {
  if (!isPlainObject(result)) {
    return {
      ok: result !== false,
    };
  }

  return {
    ok: result.ok !== false,
    found: result.found ?? null,
    forbidden: result.forbidden ?? null,
    skipped: result.skipped ?? null,
    redirected: result.redirected ?? null,
    reason: result.reason || null,
    canonicalPath: redact(result.canonicalPath || ""),
    publicPath: redact(result.publicPath || ""),
    routeMode: result.routeMode || null,
  };
}

/* =========================================================
   CONFIGURE / BIND
========================================================= */

export function configureRouter(options = {}) {
  if (configured) return Promise.resolve(true);
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    const init = requireRouterMethod("init");
    const result = await init(routerPayload(options, INIT_OPTIONS));

    if (result === false) {
      throw new Error("Router.init() devolvió false.");
    }

    configured = true;
    return true;
  })()
    .catch((error) => {
      configured = false;
      throw error;
    })
    .finally(() => {
      configurePromise = null;
    });

  return configurePromise;
}

export function bindRouter(options = {}) {
  if (bound) return Promise.resolve(true);
  if (bindPromise) return bindPromise;

  bindPromise = (async () => {
    await configureRouter(options);

    if (!isFunction(Router?.bind)) {
      bound = true;
      return true;
    }

    const result = await Router.bind(routerPayload(options, INIT_OPTIONS));

    if (result === false) {
      throw new Error("Router.bind() devolvió false.");
    }

    bound = true;
    return true;
  })()
    .catch((error) => {
      bound = false;
      throw error;
    })
    .finally(() => {
      bindPromise = null;
    });

  return bindPromise;
}

/* =========================================================
   INITIAL RENDER
========================================================= */

export function renderInitialRoute(options = {}) {
  if (rendered) return Promise.resolve(true);
  if (renderPromise) return renderPromise;

  renderPromise = (async () => {
    lastRenderError = null;

    await bindRouter(options);

    const path = resolveInitialPath(options);
    const render = requireRouterMethod("render");

    lastInitialPath = path;

    const result = await render(
      path,
      routerPayload(options, INITIAL_RENDER_OPTIONS)
    );

    if (result === false) {
      throw new Error("Router.render() devolvió false en el render inicial.");
    }

    lastRenderResult = summarizeRenderResult(result);
    rendered = true;

    return true;
  })()
    .catch((error) => {
      rendered = false;
      lastRenderError = safeError(error);
      throw error;
    })
    .finally(() => {
      renderPromise = null;
    });

  return renderPromise;
}

/* =========================================================
   RESET
========================================================= */

export function resetRouterBootstrap() {
  configured = false;
  bound = false;
  rendered = false;

  configurePromise = null;
  bindPromise = null;
  renderPromise = null;

  lastInitialPath = "";
  lastRenderResult = null;
  lastRenderError = null;

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getRouterBootstrapState() {
  return {
    version: ROUTER_BOOTSTRAP_VERSION,

    configured,
    bound,
    rendered,

    configuring: Boolean(configurePromise),
    binding: Boolean(bindPromise),
    rendering: Boolean(renderPromise),

    lastInitialPath: redact(lastInitialPath),
    lastRenderResult,
    lastRenderError,

    router: {
      exists: Boolean(Router),
      hasInit: isFunction(Router?.init),
      hasBind: isFunction(Router?.bind),
      hasRender: isFunction(Router?.render),
    },

    policy: {
      wrapperOnly: true,
      appManagedInitialRender: true,
      renderInitialOnce: true,
      preservesInitialPath: true,
      preservesQueryAndHash: true,
      routerOwnsGuards: true,
      routerOwnsHistory: true,
      routerOwnsCanonicalization: true,
      routerOwnsRedirects: true,
      noAuth: true,
      noStorage: true,
      noFetch: true,
      noEventsOwn: true,
      noTokenFlow: true,
      snapshotRedacted: true,
    },
  };
}

export default {
  ROUTER_BOOTSTRAP_VERSION,

  configureRouter,
  bindRouter,
  renderInitialRoute,
  resetRouterBootstrap,

  getRouterBootstrapState,
};
