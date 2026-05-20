/* =========================================================
   Onion Support - App Router
   Archivo: /src/app/router.js

   Responsabilidad:
   - Wrapper mínimo sobre /src/router/index.js.
   - Inicializar Router sin render automático.
   - Bindear Router si existe.
   - Renderizar ruta inicial capturada por main.js.
   - Sin Auth.
   - Sin AppCore complejo.
   - Sin eventos propios.
   - Sin debug.
   - Sin snapshots grandes.
   - Sin token flow.
   - Sin lógica rara.
========================================================= */

import { Router } from "../router/index.js";

export const ROUTER_BOOTSTRAP_VERSION = "app.router.v3";

let configured = false;
let bound = false;
let rendered = false;
let renderPromise = null;

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
  const output = String(value ?? "").trim();
  return output || fallback;
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

/* =========================================================
   CONFIGURE
========================================================= */

export async function configureRouter(options = {}) {
  if (configured) return true;

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
}

/* =========================================================
   BIND
========================================================= */

export async function bindRouter(options = {}) {
  if (bound) return true;

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
      skipInitialRender: true,
    })
  );

  if (result === false) {
    throw new Error("Router.bind() devolvió false.");
  }

  bound = true;
  return true;
}

/* =========================================================
   INITIAL RENDER
========================================================= */

export function renderInitialRoute(options = {}) {
  if (rendered) return Promise.resolve(true);
  if (renderPromise) return renderPromise;

  renderPromise = (async () => {
    await configureRouter(options);
    await bindRouter(options);

    const path = routeFrom(options);
    const render = requireRouterMethod("render");

    const result = await render.call(
      Router,
      path,
      payload(options, {
        initialRender: true,
        replaceState: true,
        skipHistory: true,
      })
    );

    if (result === false) {
      throw new Error("Router.render() devolvió false en el render inicial.");
    }

    rendered = true;
    return true;
  })()
    .catch((error) => {
      rendered = false;
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
  renderPromise = null;

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
    rendering: Boolean(renderPromise),

    router: {
      exists: Boolean(Router),
      hasInit: isFunction(Router?.init),
      hasBind: isFunction(Router?.bind),
      hasRender: isFunction(Router?.render),
    },

    policy: {
      wrapperOnly: true,
      appManagedInitialRender: true,
      bindsBeforeInitialRender: true,

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
