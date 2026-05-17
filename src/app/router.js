 /* =========================================================
   Onion Support - App Router
   Archivo: /src/app/router.js

   Responsabilidad:
   - Wrapper mínimo sobre src/router/index.js.
   - Configurar Router si existe.
   - Bindear Router si existe.
   - Renderizar ruta inicial.
   - Sin Auth.
   - Sin AppCore complejo.
   - Sin eventos.
   - Sin debug.
   - Sin snapshots grandes.
   - Sin token flow.
   - Sin lógica rara.
========================================================= */

import { Router } from "../router/index.js";

export const ROUTER_BOOTSTRAP_VERSION = "simple";

let configured = false;
let bound = false;
let rendered = false;
let renderPromise = null;

function currentPath() {
  if (typeof window === "undefined") return "/";

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function routeFrom(options = {}) {
  return options.publicPath || options.path || options.route || currentPath();
}

function payload(options = {}) {
  return {
    source: "app.router",
    ...options,
  };
}

function call(name, options = {}) {
  if (typeof Router?.[name] === "function") {
    return Router[name](payload(options));
  }

  return null;
}

export function configureRouter(options = {}) {
  if (configured) return true;

  try {
    const result =
      call("configure", { skipInitialRender: true, ...options }) ??
      call("init", { skipInitialRender: true, ...options }) ??
      call("boot", { skipInitialRender: true, ...options });

    configured = result !== false;
    return configured;
  } catch {
    configured = false;
    return false;
  }
}

export function bindRouter(options = {}) {
  if (bound) return true;

  if (!configured && !configureRouter(options)) {
    return false;
  }

  try {
    const result = call("bind", {
      skipInitialRender: true,
      ...options,
    });

    bound = result !== false;
    return bound;
  } catch {
    bound = false;
    return false;
  }
}

async function render(path, options = {}) {
  if (typeof Router?.renderCurrent === "function") {
    return Router.renderCurrent(payload(options));
  }

  if (typeof Router?.render === "function") {
    return Router.render(path, payload(options));
  }

  if (typeof Router?.navigate === "function") {
    return Router.navigate(path, payload(options));
  }

  return null;
}

export function renderInitialRoute(options = {}) {
  if (rendered) return Promise.resolve(true);
  if (renderPromise) return renderPromise;

  renderPromise = (async () => {
    configureRouter(options);

    const path = routeFrom(options);
    const result = await render(path, {
      initialRender: true,
      force: true,
      ...options,
    });

    rendered = result !== false;

    if (!bound) {
      bindRouter(options);
    }

    return rendered;
  })()
    .catch(() => {
      rendered = false;
      return false;
    })
    .finally(() => {
      renderPromise = null;
    });

  return renderPromise;
}

export function resetRouterBootstrap() {
  configured = false;
  bound = false;
  rendered = false;
  renderPromise = null;

  return true;
}

export function getRouterBootstrapState() {
  return {
    version: ROUTER_BOOTSTRAP_VERSION,
    configured,
    bound,
    rendered,
    rendering: Boolean(renderPromise),
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
