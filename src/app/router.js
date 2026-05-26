/* =========================================================
   Onion Support - App Router
   Archivo: /src/app/router.js

   Responsabilidad:
   - Wrapper mínimo sobre /src/router/index.js.
   - Inicializar Router sin render automático.
   - Bindear Router si existe.
   - Renderizar ruta inicial capturada por main.js.
   - Preservar query/hash de la ruta inicial.
   - Delegar guards/render/history/canonicalización al Router real.
   - No iniciar restore.
   - No tocar Auth.
   - No tocar storage.
   - No hacer fetch.
   - No crear eventos propios.
   - No aplicar navegación paralela.
   - Sin token flow.
   - Sin debug pesado.
========================================================= */

import { Router } from "../router/index.js";

export const ROUTER_BOOTSTRAP_VERSION = "app.router.v6";

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

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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

function routeFrom(options = {}) {
  const input = isObject(options) ? options : {};
  const bootContext = isObject(input.bootContext) ? input.bootContext : {};

  /*
    No normalizar aquí.
    El Router real decide canonicalización, guards, redirects y render.
  */
  return (
    pathCandidate(bootContext.initialPath) ||
    pathCandidate(input.initialPath) ||
    pathCandidate(input.publicPath) ||
    pathCandidate(input.path) ||
    pathCandidate(input.route) ||
    currentPath()
  );
}

function payload(options = {}, extra = {}) {
  const input = isObject(options) ? options : {};
  const addition = isObject(extra) ? extra : {};

  return {
    ...input,
    ...addition,
    source: cleanText(addition.source || input.source, "app.router"),
  };
}

function requireRouterMethod(name = "") {
  const fn = Router?.[name];

  if (!isFunction(fn)) {
    throw new Error(`Router.${name}() no disponible.`);
  }

  return fn;
}

function summarizeRenderResult(result = null) {
  if (!isObject(result)) {
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
   CONFIGURE
========================================================= */

export function configureRouter(options = {}) {
  if (configured) return Promise.resolve(true);
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    const init = requireRouterMethod("init");

    const result = await init.call(
      Router,
      payload(options, {
        appManagedInitialRender: true,
        skipInitialRender: true,
        render: false,
      })
    );

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

/* =========================================================
   BIND
========================================================= */

export function bindRouter(options = {}) {
  if (bound) return Promise.resolve(true);
  if (bindPromise) return bindPromise;

  bindPromise = (async () => {
    if (!configured) {
      await configureRouter(options);
    }

    if (!isFunction(Router?.bind)) {
      bound = true;
      return true;
    }

    const result = await Router.bind.call(
      Router,
      payload(options, {
        appManagedInitialRender: true,
        skipInitialRender: true,
        render: false,
      })
    );

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

    await configureRouter(options);
    await bindRouter(options);

    const path = routeFrom(options);
    const render = requireRouterMethod("render");

    lastInitialPath = path;

    const result = await render.call(
      Router,
      path,
      payload(options, {
        initialRender: true,
        replaceState: true,

        /*
          La URL actual ya existe en el navegador.
          La gestión real de history pertenece a /src/router.
        */
        skipHistory: true,
      })
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
      configIdempotent: true,
      bindIdempotent: true,
      renderInitialOnce: true,

      bindsBeforeInitialRender: true,
      preservesInitialPath: true,
      preservesQueryAndHash: true,

      routerOwnsAuthWait: true,
      routerOwnsGuards: true,
      routerOwnsHistory: true,
      routerOwnsCanonicalization: true,
      routerOwnsRedirects: true,

      ownAuth: false,
      ownStorage: false,
      ownTransport: false,
      ownNavigationPolicy: false,
      ownRouteGuards: false,
      ownHistory: false,

      noTokenFlow: true,
      noFetch: true,
      noEventsOwn: true,
      noDebugNoise: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTER_BOOTSTRAP_VERSION,

  configureRouter,
  bindRouter,
  renderInitialRoute,
  resetRouterBootstrap,

  getRouterBootstrapState,
};
