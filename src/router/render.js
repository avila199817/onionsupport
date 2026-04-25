/* =========================================================
   Onion SPA - Router Render
   Archivo: src/router/render.js

   RESPONSABILIDADES:
   - renderizar vistas internas del router
   - construir payloads de navegación
   - emitir before-render / rendered
   - sincronizar route/publicPath
   - flujos success / forbidden / 404 / login / runtime
   - soportar route.render async

   HARDENING EXTREMO:
   - guards browser / DOM total safe
   - sync de estado consistente y única
   - payloads estables y enriquecidos
   - paso explícito de viewContainer al render
   - compatibilidad función / objeto / adapters
   - return explícito de view instance
   - fallbacks seguros si falta render
   - preserva username resuelto y slug público
   - preserva query/hash públicos en render
   - no destruye /activate-account?token=...
   - métricas internas por flujo
   - anti stale-render
   - cero throws accidentales
========================================================= */

import {
  getRouteNames,
  escapeHtml,
  normalizeCanonicalPath,
  normalizePath,
  getSearchAndHash,
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
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
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

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

/* =========================================================
   SAFE OPS
========================================================= */

function safeEmit(
  AppCore,
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeWarn(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.warn?.(
      ...args
    );
  } catch {}
}

function safeError(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.error?.(
      ...args
    );
  } catch {}
}

function safeLog(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.log?.(
      ...args
    );
  } catch {}
}

function safeSetDocumentTitle(
  setDocumentTitle,
  title
) {
  try {
    if (
      typeof setDocumentTitle === "function"
    ) {
      setDocumentTitle(title);
    }
  } catch {}
}

function safeSetShellMode(
  setShellMode,
  route
) {
  try {
    if (
      typeof setShellMode === "function"
    ) {
      setShellMode(route);
    }
  } catch {}
}

function safeClearDynamicContainers(
  clearDynamicContainers
) {
  try {
    if (
      typeof clearDynamicContainers === "function"
    ) {
      clearDynamicContainers();
    }
  } catch {}
}

function safeSetActiveMenu(
  setActiveMenu,
  path
) {
  try {
    if (
      typeof setActiveMenu === "function"
    ) {
      setActiveMenu(path);
    }
  } catch {}
}

/* =========================================================
   FLOW METRICS
========================================================= */

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

/* =========================================================
   VIEW CONTAINER
========================================================= */

export function getViewContainer(
  AppCore
) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (
      AppCore?.dom?.viewContainer &&
      document.contains(
        AppCore.dom.viewContainer
      )
    ) {
      return AppCore.dom.viewContainer;
    }
  } catch {}

  const el =
    document.getElementById(
      "view-container"
    ) ||
    document.querySelector(
      "#view-container"
    ) ||
    null;

  try {
    if (
      el &&
      AppCore?.dom
    ) {
      AppCore.dom.viewContainer = el;
    }
  } catch {}

  return el;
}

/* =========================================================
   URL CONTEXT HELPERS
========================================================= */

function getBrowserPublicPath(
  AppCore
) {
  if (!isBrowser()) {
    return "";
  }

  try {
    return normalizePath(
      AppCore,
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "";
  }
}

function sameCanonicalRoute(
  AppCore,
  a = "/",
  b = "/"
) {
  return (
    normalizeCanonicalPath(
      AppCore,
      a
    ) ===
    normalizeCanonicalPath(
      AppCore,
      b
    )
  );
}

/**
 * Protege query/hash del navegador si el render intenta
 * sincronizar la misma ruta sin query.
 *
 * Ejemplo:
 *   browser:   /activate-account?token=abc
 *   candidate: /activate-account
 *   resultado: /activate-account?token=abc
 */
function preserveBrowserContextForSameRoute(
  AppCore,
  candidatePath = "/"
) {
  const candidate =
    normalizePath(
      AppCore,
      candidatePath || "/"
    );

  const browserPath =
    getBrowserPublicPath(
      AppCore
    );

  if (!browserPath) {
    return candidate;
  }

  const candidateSuffix =
    getSearchAndHash(
      candidate
    );

  const browserSuffix =
    getSearchAndHash(
      browserPath
    );

  if (
    browserSuffix &&
    !candidateSuffix &&
    sameCanonicalRoute(
      AppCore,
      browserPath,
      candidate
    )
  ) {
    return browserPath;
  }

  return candidate;
}

function buildCanonicalSourceWithSuffix(
  AppCore,
  canonicalPath = "/",
  requestedPath = "/"
) {
  const finalCanonical =
    normalizeCanonicalPath(
      AppCore,
      canonicalPath ||
        requestedPath ||
        "/"
    );

  const normalizedRequested =
    normalizePath(
      AppCore,
      requestedPath ||
        canonicalPath ||
        finalCanonical
    );

  const requestedSuffix =
    getSearchAndHash(
      normalizedRequested
    );

  const canonicalSuffix =
    getSearchAndHash(
      canonicalPath || ""
    );

  const suffix =
    requestedSuffix ||
    canonicalSuffix ||
    "";

  return normalizePath(
    AppCore,
    `${finalCanonical}${suffix}`
  );
}

/* =========================================================
   RESOLVERS
========================================================= */

function resolveUsernameForPayload(
  AppCore,
  requestedUsername = null,
  publicPath = null
) {
  return (
    safeText(
      requestedUsername
    ) ||
    extractUsernameFromPath(
      AppCore,
      publicPath || ""
    ) ||
    getCurrentResolvedUsername(
      AppCore
    ) ||
    getCurrentUsername(
      AppCore
    ) ||
    AppCore?.state?.user
      ?.username ||
    null
  );
}

function resolvePublicPathForRoute({
  AppCore,
  getRoute,
  canonicalPath = "/",
  requestedPath = "/",
  requestedUsername = null,
  route = null,
} = {}) {
  const sourceForPublic =
    buildCanonicalSourceWithSuffix(
      AppCore,
      canonicalPath,
      requestedPath
    );

  const finalCanonical =
    normalizeCanonicalPath(
      AppCore,
      sourceForPublic
    );

  const username =
    resolveUsernameForPayload(
      AppCore,
      requestedUsername,
      requestedPath ||
        sourceForPublic
    );

  const built =
    buildPublicPath(
      AppCore,
      getRoute ||
        (() => route),
      sourceForPublic,
      {
        username,
        fromPath:
          requestedPath ||
          sourceForPublic,
      }
    );

  const finalPublic =
    preserveBrowserContextForSameRoute(
      AppCore,
      built ||
        sourceForPublic ||
        requestedPath ||
        finalCanonical
    );

  return {
    canonicalPath:
      finalCanonical,
    publicPath:
      finalPublic,
    username:
      username || null,
  };
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
    found:
      Boolean(found),
    forbidden:
      Boolean(forbidden),
    redirectedFrom,
    ts: Date.now(),
  };
}

export function emitBeforeRender(
  AppCore,
  payload = {}
) {
  safeEmit(
    AppCore,
    "router:before-render",
    buildRenderPayload(
      payload
    )
  );
}

export function emitRendered(
  AppCore,
  payload = {}
) {
  safeEmit(
    AppCore,
    "router:rendered",
    buildRenderPayload(
      payload
    )
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
  const finalCanonical =
    normalizeCanonicalPath(
      AppCore,
      canonicalPath
    );

  const browserPath =
    getBrowserPublicPath(
      AppCore
    ) || finalCanonical;

  const candidatePublic =
    normalizePath(
      AppCore,
      publicPath ||
        browserPath ||
        finalCanonical
    );

  const finalPublic =
    preserveBrowserContextForSameRoute(
      AppCore,
      candidatePublic
    );

  const username =
    resolveUsernameForPayload(
      AppCore,
      null,
      finalPublic
    );

  try {
    AppCore?.setRoute?.(
      finalCanonical
    );
  } catch {}

  try {
    AppCore?.setPublicPath?.(
      finalPublic
    );
  } catch {}

  try {
    AppCore?.setState?.({
      route:
        finalCanonical,
      publicPath:
        finalPublic,
      currentResolvedUsername:
        username,
    });
  } catch {}

  return {
    canonicalPath:
      finalCanonical,
    publicPath:
      finalPublic,
    username,
  };
}

export function applyResolvedRouteState(
  AppCore,
  canonicalPath,
  fallbackPublicPath
) {
  const publicPath =
    getResolvedPublicPath(
      fallbackPublicPath
    );

  return syncRouteState(
    AppCore,
    canonicalPath,
    publicPath
  );
}

/* =========================================================
   CONTEXT
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
  const finalPublicPath =
    preserveBrowserContextForSameRoute(
      AppCore,
      publicPath ||
        requestedPath ||
        canonicalPath ||
        "/"
    );

  const username =
    resolveUsernameForPayload(
      AppCore,
      requestedUsername,
      finalPublicPath
    );

  return Object.freeze({
    AppCore,
    route,
    path:
      finalPublicPath,
    requestedPath:
      finalPublicPath,
    canonicalPath:
      normalizeCanonicalPath(
        AppCore,
        canonicalPath ||
          finalPublicPath
      ),
    publicPath:
      finalPublicPath,
    username,
    requestedUsername:
      username,
    redirectedFrom,
    found:
      Boolean(found),
    forbidden:
      Boolean(forbidden),
    viewContainer:
      getViewContainer(
        AppCore
      ),
  });
}

/* =========================================================
   ROUTE EXECUTION
========================================================= */

async function runRouteRender(
  AppCore,
  route,
  viewContainer,
  context
) {
  if (!viewContainer) {
    safeWarn(
      AppCore,
      "[Router] viewContainer ausente."
    );
    return null;
  }

  if (
    !isFunction(
      route?.render
    )
  ) {
    safeWarn(
      AppCore,
      "[Router] ruta sin render():",
      route?.path
    );
    return null;
  }

  return await Promise.resolve(
    route.render(
      viewContainer,
      context
    )
  );
}

/* =========================================================
   INTERNAL VIEWS
========================================================= */

export function renderGenericView(
  AppCore,
  route
) {
  const view =
    getViewContainer(
      AppCore
    );

  if (!view) {
    return null;
  }

  const canonical =
    AppCore?.state?.route ||
    "/";

  const publicPath =
    getCurrentPublicPath(
      AppCore
    );

  const username =
    getCurrentResolvedUsername(
      AppCore
    );

  view.innerHTML = `
<section class="content-wrapper">
<div class="panel-block" style="padding:24px;">
<div style="display:grid;gap:14px;">
<h2 style="margin:0;">${escapeHtml(AppCore, route?.title || "Vista")}</h2>
<p style="margin:0;color:var(--text-dim);">
Vista conectada al router.
</p>
<div><strong>Canonical:</strong> ${escapeHtml(AppCore, canonical)}</div>
<div><strong>Public:</strong> ${escapeHtml(AppCore, publicPath)}</div>
<div><strong>User:</strong> ${escapeHtml(AppCore, username || "—")}</div>
</div>
</div>
</section>`;

  return null;
}

export function renderForbiddenView(
  AppCore,
  getRoute
) {
  const view =
    getViewContainer(
      AppCore
    );

  if (!view) {
    return null;
  }

  const href =
    getDefaultHomeTarget(
      AppCore,
      getRoute
    );

  view.innerHTML = `
<section class="content-wrapper">
<div class="panel-block" style="padding:24px;">
<h2 style="margin:0 0 12px 0;">Acceso denegado</h2>
<p style="margin:0 0 14px 0;color:var(--text-dim);">
No tienes permisos para acceder.
</p>
<a href="${escapeHtml(AppCore, href)}" data-spa>Volver</a>
</div>
</section>`;

  return null;
}

export function renderNotFoundView(
  AppCore,
  requestedPath,
  getRoute
) {
  const view =
    getViewContainer(
      AppCore
    );

  if (!view) {
    return null;
  }

  const href =
    getDefaultHomeTarget(
      AppCore,
      getRoute
    );

  view.innerHTML = `
<section class="content-wrapper">
<div class="panel-block" style="padding:24px;">
<h2 style="margin:0 0 12px 0;">404</h2>
<p style="margin:0 0 14px 0;color:var(--text-dim);">
Ruta no encontrada:
${escapeHtml(AppCore, requestedPath)}
</p>
<a href="${escapeHtml(AppCore, href)}" data-spa>Inicio</a>
</div>
</section>`;

  return null;
}

export function renderRuntimeErrorView(
  AppCore,
  error,
  getRoute
) {
  const view =
    getViewContainer(
      AppCore
    );

  if (!view) {
    return null;
  }

  const href =
    getDefaultHomeTarget(
      AppCore,
      getRoute
    );

  view.innerHTML = `
<section class="content-wrapper">
<div class="panel-block" style="padding:24px;">
<h2 style="margin:0 0 12px 0;">Error de navegación</h2>
<p style="margin:0 0 14px 0;color:var(--text-dim);">
${escapeHtml(AppCore, error?.message || "Error inesperado")}
</p>
<a href="${escapeHtml(AppCore, href)}" data-spa>Recuperar</a>
</div>
</section>`;

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
  getRoute,
} = {}) {
  const startedAt =
    nowMs();

  const resolved =
    resolvePublicPathForRoute({
      AppCore,
      getRoute,
      route,
      canonicalPath,
      requestedPath,
      requestedUsername,
    });

  const synced =
    syncRouteState(
      AppCore,
      resolved.canonicalPath,
      resolved.publicPath
    );

  safeSetShellMode(
    setShellMode,
    route
  );

  safeSetDocumentTitle(
    setDocumentTitle,
    route?.title ||
      AppCore?.config
        ?.appName ||
      "Onion"
  );

  const ctx =
    buildRouteRenderContext({
      AppCore,
      route,
      requestedPath:
        synced.publicPath,
      canonicalPath:
        synced.canonicalPath,
      requestedUsername:
        synced.username,
      publicPath:
        synced.publicPath,
    });

  let view = null;

  if (
    isFunction(
      route?.render
    )
  ) {
    view =
      await runRouteRender(
        AppCore,
        route,
        ctx.viewContainer,
        ctx
      );
  } else {
    view =
      renderGenericView(
        AppCore,
        route
      );
  }

  emitRendered(
    AppCore,
    {
      path:
        synced.publicPath,
      canonicalPath:
        synced.canonicalPath,
      publicPath:
        synced.publicPath,
      username:
        synced.username,
      found: true,
      route,
    }
  );

  emitFlowMetric(
    AppCore,
    "success",
    {
      route:
        route?.path ||
        null,
      durationMs:
        Math.round(
          nowMs() -
            startedAt
        ),
    }
  );

  return view || null;
}

export function renderRouteForbidden(
  args = {}
) {
  const startedAt =
    nowMs();

  renderForbiddenView(
    args.AppCore,
    args.getRoute
  );

  emitFlowMetric(
    args.AppCore,
    "forbidden",
    {
      durationMs:
        Math.round(
          nowMs() -
            startedAt
        ),
    }
  );

  return null;
}

export function renderRouteNotFound(
  args = {}
) {
  const startedAt =
    nowMs();

  renderNotFoundView(
    args.AppCore,
    args.requestedPath,
    args.getRoute
  );

  emitFlowMetric(
    args.AppCore,
    "not-found",
    {
      durationMs:
        Math.round(
          nowMs() -
            startedAt
        ),
    }
  );

  return null;
}

export async function renderLoginRedirect(
  args = {}
) {
  const routeNames =
    getRouteNames(
      args.AppCore
    );

  const loginUrl =
    buildLoginUrl(
      args.AppCore,
      args.canonicalPath
    );

  const route =
    args.getRoute?.(
      routeNames.LOGIN
    );

  safeClearDynamicContainers(
    args.clearDynamicContainers
  );

  safeSetActiveMenu(
    args.setActiveMenu,
    routeNames.LOGIN
  );

  safeSetShellMode(
    args.setShellMode,
    route
  );

  safeSetDocumentTitle(
    args.setDocumentTitle,
    route?.title ||
      "Login"
  );

  const synced =
    syncRouteState(
      args.AppCore,
      routeNames.LOGIN,
      loginUrl
    );

  if (
    isFunction(
      route?.render
    )
  ) {
    await runRouteRender(
      args.AppCore,
      route,
      getViewContainer(
        args.AppCore
      ),
      buildRouteRenderContext({
        AppCore:
          args.AppCore,
        route,
        requestedPath:
          synced.publicPath,
        canonicalPath:
          routeNames.LOGIN,
        publicPath:
          synced.publicPath,
        redirectedFrom:
          args.canonicalPath,
      })
    );
  }

  emitRendered(
    args.AppCore,
    {
      path:
        synced.publicPath,
      canonicalPath:
        routeNames.LOGIN,
      publicPath:
        synced.publicPath,
      found: true,
      route,
    }
  );

  return null;
}

export function renderRouteRuntimeError(
  args = {}
) {
  renderRuntimeErrorView(
    args.AppCore,
    args.error,
    args.getRoute
  );

  emitFlowMetric(
    args.AppCore,
    "runtime-error",
    {
      error: safeText(
        args.error?.message
      ),
    }
  );

  return null;
}
