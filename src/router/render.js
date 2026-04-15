/* =========================================================
   Onion SPA - Router Render
   Archivo: src/router/render.js

   Responsabilidades:
   - renderizar vistas internas del router
   - construir payloads de navegación
   - emitir before-render / rendered
   - sincronizar route/publicPath
   - flujos success / forbidden / 404 / login / runtime
   - soportar route.render async

   HARDENING:
   - guards de browser
   - sync de estado consistente
   - payloads estables
   - paso explícito de viewContainer al render
   - compatibilidad con vistas tipo función y adapters del router
   - return explícito de view instance cuando exista
   - fallbacks seguros si una ruta no tiene render
========================================================= */

import {
  getRouteNames,
  escapeHtml,
  normalizeCanonicalPath,
  getCurrentPublicPath,
  getCurrentResolvedUsername,
  getCurrentUsername,
  extractUsernameFromPath,
  buildPublicPath,
  buildLoginUrl,
  getDefaultHomeTarget,
  getResolvedPublicPath,
} from "./helpers.js";

/* =========================================================
   INTERNAL
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeEmit(AppCore, eventName, payload) {
  try {
    AppCore?.events?.emit?.(eventName, payload);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(...args);
  } catch {}
}

function safeSetDocumentTitle(setDocumentTitle, title) {
  if (typeof setDocumentTitle === "function") {
    setDocumentTitle(title);
  }
}

function safeSetShellMode(setShellMode, route) {
  if (typeof setShellMode === "function") {
    setShellMode(route);
  }
}

function safeClearDynamicContainers(clearDynamicContainers) {
  if (typeof clearDynamicContainers === "function") {
    clearDynamicContainers();
  }
}

function safeSetActiveMenu(setActiveMenu, path) {
  if (typeof setActiveMenu === "function") {
    setActiveMenu(path);
  }
}

function nowMs() {
  try {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }
  } catch {}

  return Date.now();
}

function emitFlowMetric(
  AppCore,
  flow = "unknown",
  payload = {}
) {
  safeEmit(
    AppCore,
    "router:render:flow",
    {
      flow,
      ...payload,
    }
  );
}

function resolveUsernameForPayload(AppCore, requestedUsername = null) {
  return (
    requestedUsername ||
    getCurrentResolvedUsername(AppCore) ||
    getCurrentUsername(AppCore) ||
    null
  );
}

/* =========================================================
   VIEW CONTAINER
========================================================= */

export function getViewContainer(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  return (
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    document.querySelector("#view-container") ||
    null
  );
}

/* =========================================================
   PAYLOADS
========================================================= */

export function buildRenderPayload({
  path = null,
  canonicalPath = null,
  publicPath = null,
  username = null,
  route = null,
  found = false,
  forbidden = false,
  redirectedFrom = null,
} = {}) {
  return {
    path,
    canonicalPath,
    publicPath,
    username,
    route,
    found,
    forbidden,
    redirectedFrom,
  };
}

export function emitBeforeRender(AppCore, payload = {}) {
  safeEmit(
    AppCore,
    "router:before-render",
    buildRenderPayload(payload)
  );
}

export function emitRendered(AppCore, payload = {}) {
  safeEmit(
    AppCore,
    "router:rendered",
    buildRenderPayload(payload)
  );
}

/* =========================================================
   STATE SYNC
========================================================= */

export function syncRouteState(
  AppCore,
  canonicalPath = "/",
  publicPath = null
) {
  const finalCanonical = normalizeCanonicalPath(
    AppCore,
    canonicalPath
  );

  const browserPublicPath = isBrowser()
    ? `${window.location.pathname || "/"}${window.location.search || ""}`
    : finalCanonical;

  const finalPublicPath = AppCore?.utils?.normalizePath
    ? AppCore.utils.normalizePath(
        publicPath || browserPublicPath || finalCanonical
      )
    : publicPath || browserPublicPath || finalCanonical;

  AppCore?.setRoute?.(finalCanonical);
  AppCore?.setPublicPath?.(finalPublicPath);

  return {
    canonicalPath: finalCanonical,
    publicPath: finalPublicPath,
  };
}

export function applyResolvedRouteState(
  AppCore,
  canonicalPath,
  fallbackPublicPath
) {
  const resolvedPublicPath = getResolvedPublicPath(
    fallbackPublicPath
  );

  const synced = syncRouteState(
    AppCore,
    canonicalPath,
    resolvedPublicPath
  );

  return synced.publicPath;
}

/* =========================================================
   RENDER CONTEXT
========================================================= */

export function buildRouteRenderContext({
  AppCore,
  route = null,
  requestedPath = "/",
  canonicalPath = "/",
  requestedUsername = null,
  publicPath = null,
  redirectedFrom = null,
  found = true,
  forbidden = false,
} = {}) {
  return Object.freeze({
    AppCore,
    route,
    path: requestedPath,
    requestedPath,
    canonicalPath,
    publicPath,
    username: requestedUsername,
    requestedUsername,
    redirectedFrom,
    found,
    forbidden,
    viewContainer: getViewContainer(AppCore),
  });
}

async function runRouteRender(
  AppCore,
  route,
  viewContainer,
  context
) {
  if (!viewContainer) {
    safeWarn(
      AppCore,
      "[Router] viewContainer no disponible para render:",
      route?.path || "(sin path)"
    );

    return null;
  }

  if (typeof route?.render !== "function") {
    safeWarn(
      AppCore,
      "[Router] ruta sin render():",
      route?.path || "(sin path)"
    );

    return null;
  }

  return await Promise.resolve(
    route.render(viewContainer, context)
  );
}

/* =========================================================
   INTERNAL VIEWS
========================================================= */

export function renderGenericView(AppCore, route) {
  const view = getViewContainer(AppCore);

  if (!view) return null;

  const canonicalPath = AppCore?.state?.route || "/";
  const publicPath = getCurrentPublicPath(AppCore);
  const resolvedUsername = getCurrentResolvedUsername(AppCore);

  view.innerHTML = `
<section class="content-wrapper">
  <div class="panel-block" style="padding:24px;">
    <div style="display:grid;gap:16px;">
      <div>
        <h2 style="margin:0 0 8px 0;">${escapeHtml(AppCore, route?.title || "Vista")}</h2>
        <p style="margin:0;color:var(--text-dim);">
          Esta sección ya está conectada al router y lista para evolucionar.
        </p>
      </div>

      <div style="display:grid;gap:8px;font-size:14px;">
        <div><strong>Ruta canónica:</strong> ${escapeHtml(AppCore, canonicalPath)}</div>
        <div><strong>Ruta pública:</strong> ${escapeHtml(AppCore, publicPath)}</div>
        <div><strong>Usuario slug:</strong> ${escapeHtml(AppCore, resolvedUsername || "Sin username")}</div>
      </div>
    </div>
  </div>
</section>
`;

  return null;
}

export function renderForbiddenView(
  AppCore,
  getRoute,
  route = null
) {
  const view = getViewContainer(AppCore);

  if (!view) return null;

  const homeHref = getDefaultHomeTarget(
    AppCore,
    getRoute
  );

  view.innerHTML = `
<section class="content-wrapper">
  <div class="panel-block" style="padding:24px;">
    <div style="display:grid;gap:16px;">
      <h2 style="margin:0;">Acceso denegado</h2>
      <p style="margin:0;color:var(--text-dim);">
        No tienes permisos para entrar en esta sección.
      </p>
      <div>
        <a href="${escapeHtml(AppCore, homeHref)}" data-spa>Volver al inicio</a>
      </div>
    </div>
  </div>
</section>
`;

  return null;
}

export function renderNotFoundView(
  AppCore,
  requestedPath = "/",
  getRoute
) {
  const routeNames = getRouteNames(AppCore);
  const view = getViewContainer(AppCore);

  if (!view) return null;

  const homeHref = buildPublicPath(
    AppCore,
    getRoute,
    routeNames.HOME,
    {
      username:
        extractUsernameFromPath(AppCore, requestedPath) ||
        getCurrentResolvedUsername(AppCore) ||
        getCurrentUsername(AppCore),
    }
  );

  view.innerHTML = `
<section class="content-wrapper">
  <div class="panel-block" style="padding:24px;">
    <div style="display:grid;gap:16px;">
      <h2 style="margin:0;">404</h2>
      <p style="margin:0;color:var(--text-dim);">
        La ruta no existe en la SPA.
      </p>
      <div>
        <a href="${escapeHtml(AppCore, homeHref || routeNames.HOME)}" data-spa>Volver al inicio</a>
      </div>
    </div>
  </div>
</section>
`;

  return null;
}

export function renderRuntimeErrorView(
  AppCore,
  error,
  route = null,
  requestedPath = "/",
  getRoute
) {
  const view = getViewContainer(AppCore);

  if (!view) return null;

  view.innerHTML = `
<section class="content-wrapper">
  <div class="panel-block" style="padding:24px;">
    <div style="display:grid;gap:16px;">
      <h2 style="margin:0;">Error de navegación</h2>
      <p style="margin:0;color:var(--text-dim);">
        Ocurrió un error al renderizar esta vista.
      </p>
      <div><strong>Error:</strong> ${escapeHtml(AppCore, error?.message || "Error inesperado")}</div>
      <div>
        <a href="${escapeHtml(AppCore, getDefaultHomeTarget(AppCore, getRoute))}" data-spa>Volver al inicio</a>
      </div>
    </div>
  </div>
</section>
`;

  return null;
}

/* =========================================================
   FLOWS
========================================================= */

export async function renderRouteSuccess({
  AppCore,
  route,
  requestedPath,
  canonicalPath,
  requestedUsername,
  setShellMode,
  setDocumentTitle,
} = {}) {
  const startedAt = nowMs();

  const resolvedPublicPath = applyResolvedRouteState(
    AppCore,
    canonicalPath,
    requestedPath
  );

  safeSetShellMode(setShellMode, route);
  safeSetDocumentTitle(
    setDocumentTitle,
    route?.title || AppCore?.config?.appName
  );

  const viewContainer = getViewContainer(AppCore);

  const renderContext = buildRouteRenderContext({
    AppCore,
    route,
    requestedPath,
    canonicalPath,
    requestedUsername,
    publicPath: resolvedPublicPath,
    found: true,
    forbidden: false,
  });

  let renderedView = null;

  if (typeof route?.render === "function") {
    renderedView = await runRouteRender(
      AppCore,
      route,
      viewContainer,
      renderContext
    );
  } else {
    renderedView = renderGenericView(AppCore, route);
  }

  emitRendered(AppCore, {
    path: requestedPath,
    canonicalPath,
    publicPath: resolvedPublicPath,
    username: resolveUsernameForPayload(
      AppCore,
      requestedUsername
    ),
    found: true,
    forbidden: false,
    route,
  });

  emitFlowMetric(
    AppCore,
    "success",
    {
      path: requestedPath,
      canonicalPath,
      durationMs: Math.round(nowMs() - startedAt),
      route: route?.path || null,
    }
  );

  return renderedView || null;
}

export function renderRouteForbidden({
  AppCore,
  getRoute,
  updateHistory,
  route,
  requestedPath,
  canonicalPath,
  requestedUsername,
  options = {},
  setShellMode,
  setDocumentTitle,
} = {}) {
  const startedAt = nowMs();

  updateHistory({
    AppCore,
    getRoute,
    pathname: canonicalPath,
    options: {
      ...options,
      username:
        requestedUsername ||
        getCurrentUsername(AppCore),
    },
  });

  const resolvedPublicPath = applyResolvedRouteState(
    AppCore,
    canonicalPath,
    requestedPath
  );

  safeSetShellMode(setShellMode, route);
  safeSetDocumentTitle(
    setDocumentTitle,
    "Acceso denegado"
  );

  renderForbiddenView(AppCore, getRoute, route);

  emitRendered(AppCore, {
    path: requestedPath,
    canonicalPath,
    publicPath: resolvedPublicPath,
    username: resolveUsernameForPayload(
      AppCore,
      requestedUsername
    ),
    found: true,
    forbidden: true,
    route,
  });

  emitFlowMetric(
    AppCore,
    "forbidden",
    {
      path: requestedPath,
      canonicalPath,
      durationMs: Math.round(nowMs() - startedAt),
      route: route?.path || null,
    }
  );

  return null;
}

export function renderRouteNotFound({
  AppCore,
  getRoute,
  updateHistory,
  requestedPath,
  canonicalPath,
  requestedUsername,
  options = {},
  setShellMode,
  setDocumentTitle,
} = {}) {
  const startedAt = nowMs();

  updateHistory({
    AppCore,
    getRoute,
    pathname: requestedPath,
    options: {
      ...options,
      preservePath: true,
    },
  });

  const resolvedPublicPath = applyResolvedRouteState(
    AppCore,
    canonicalPath,
    requestedPath
  );

  safeSetShellMode(setShellMode, null);
  safeSetDocumentTitle(setDocumentTitle, "404");

  renderNotFoundView(AppCore, requestedPath, getRoute);

  emitRendered(AppCore, {
    path: requestedPath,
    canonicalPath,
    publicPath: resolvedPublicPath,
    username: resolveUsernameForPayload(
      AppCore,
      requestedUsername
    ),
    found: false,
    forbidden: false,
    route: null,
  });

  emitFlowMetric(
    AppCore,
    "not-found",
    {
      path: requestedPath,
      canonicalPath,
      durationMs: Math.round(nowMs() - startedAt),
    }
  );

  return null;
}

export async function renderLoginRedirect({
  AppCore,
  getRoute,
  updateHistory,
  canonicalPath,
  clearDynamicContainers,
  setActiveMenu,
  setShellMode,
  setDocumentTitle,
} = {}) {
  const startedAt = nowMs();

  const routeNames = getRouteNames(AppCore);
  const loginRoute = getRoute(routeNames.LOGIN);
  const loginUrl = buildLoginUrl(AppCore, canonicalPath);

  updateHistory({
    AppCore,
    getRoute,
    pathname: loginUrl,
    options: {
      replaceState: true,
      preservePath: true,
      redirectedFrom: canonicalPath,
    },
  });

  const resolvedPublicPath = applyResolvedRouteState(
    AppCore,
    routeNames.LOGIN,
    loginUrl
  );

  safeClearDynamicContainers(clearDynamicContainers);
  safeSetActiveMenu(setActiveMenu, routeNames.LOGIN);
  safeSetShellMode(setShellMode, loginRoute);
  safeSetDocumentTitle(
    setDocumentTitle,
    loginRoute?.title || "Acceso"
  );

  const viewContainer = getViewContainer(AppCore);

  const renderContext = buildRouteRenderContext({
    AppCore,
    route: loginRoute,
    requestedPath: loginUrl,
    canonicalPath: routeNames.LOGIN,
    requestedUsername: null,
    publicPath: resolvedPublicPath,
    redirectedFrom: canonicalPath,
    found: true,
    forbidden: false,
  });

  let renderedView = null;

  if (typeof loginRoute?.render === "function") {
    renderedView = await runRouteRender(
      AppCore,
      loginRoute,
      viewContainer,
      renderContext
    );
  } else {
    safeWarn(
      AppCore,
      "[Router] loginRoute sin render(), fallback genérico."
    );

    renderedView = renderGenericView(AppCore, loginRoute);
  }

  emitRendered(AppCore, {
    path: loginUrl,
    canonicalPath: routeNames.LOGIN,
    publicPath: resolvedPublicPath,
    username: null,
    found: true,
    forbidden: false,
    redirectedFrom: canonicalPath,
    route: loginRoute,
  });

  emitFlowMetric(
    AppCore,
    "login-redirect",
    {
      path: loginUrl,
      canonicalPath: routeNames.LOGIN,
      durationMs: Math.round(nowMs() - startedAt),
      redirectedFrom: canonicalPath,
    }
  );

  return renderedView || null;
}

export function renderRouteRuntimeError({
  AppCore,
  getRoute,
  route,
  error,
  requestedPath,
  canonicalPath,
  requestedUsername,
  cycleId,
  renderCycle,
  setShellMode,
  setDocumentTitle,
} = {}) {
  const startedAt = nowMs();

  if (cycleId !== renderCycle) {
    safeWarn(
      AppCore,
      "Router: render antiguo descartado."
    );
    return null;
  }

  safeError(
    AppCore,
    "Router render error:",
    error
  );

  const resolvedPublicPath = applyResolvedRouteState(
    AppCore,
    canonicalPath,
    requestedPath
  );

  safeSetShellMode(setShellMode, route);
  safeSetDocumentTitle(setDocumentTitle, "Error");

  renderRuntimeErrorView(
    AppCore,
    error,
    route,
    requestedPath,
    getRoute
  );

  emitRendered(AppCore, {
    path: requestedPath,
    canonicalPath,
    publicPath: resolvedPublicPath,
    username: resolveUsernameForPayload(
      AppCore,
      requestedUsername
    ),
    found: true,
    forbidden: false,
    route,
  });

  emitFlowMetric(
    AppCore,
    "runtime-error",
    {
      path: requestedPath,
      canonicalPath,
      durationMs: Math.round(nowMs() - startedAt),
      route: route?.path || null,
      error: String(error?.message || error || ""),
    }
  );

  return null;
}
