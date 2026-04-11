/* =========================================================
   Onion SPA - Router Render
   Archivo: src/router/render.js

   Responsabilidades:
   - renderizar vistas internas del router
   - construir payloads de eventos de navegación
   - emitir eventos before-render / rendered
   - sincronizar estado de ruta resuelta
   - resolver flujos visuales de success / forbidden / 404 / login redirect / runtime error
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

export function getViewContainer(AppCore) {
  return (
    AppCore.dom.viewContainer ||
    document.getElementById("view-container") ||
    document.querySelector("#view-container")
  );
}

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
  AppCore.events.emit("router:before-render", buildRenderPayload(payload));
}

export function emitRendered(AppCore, payload = {}) {
  AppCore.events.emit("router:rendered", buildRenderPayload(payload));
}

export function syncRouteState(AppCore, canonicalPath = "/", publicPath = null) {
  const finalCanonical = normalizeCanonicalPath(AppCore, canonicalPath);
  const finalPublicPath = AppCore.utils.normalizePath(
    publicPath ||
      `${window.location.pathname || "/"}${window.location.search || ""}` ||
      finalCanonical
  );

  AppCore.setRoute?.(finalCanonical);
  AppCore.setPublicPath?.(finalPublicPath);
}

export function applyResolvedRouteState(
  AppCore,
  canonicalPath,
  fallbackPublicPath
) {
  const resolvedPublicPath = getResolvedPublicPath(fallbackPublicPath);
  syncRouteState(AppCore, canonicalPath, resolvedPublicPath);
  return resolvedPublicPath;
}

export function renderGenericView(AppCore, route) {
  const view = getViewContainer(AppCore);

  if (!view) {
    AppCore.utils.warn(
      "Router: no se encontró #view-container para renderGenericView."
    );
    return;
  }

  const canonicalPath = AppCore.state.route || "/";
  const publicPath = getCurrentPublicPath(AppCore);
  const resolvedUsername = getCurrentResolvedUsername(AppCore);

  view.innerHTML = `
    <section class="content-wrapper">
      <div class="panel-block" style="padding:24px;">
        <div style="display:grid; gap:16px;">
          <div>
            <h2 style="margin:0 0 8px 0;">${escapeHtml(AppCore, route?.title || "Vista")}</h2>
            <p style="margin:0; color:var(--text-dim);">
              Esta sección ya está conectada al router y lista para evolucionar.
            </p>
          </div>

          <div style="display:grid; gap:8px; font-size:14px;">
            <div><strong>Ruta canónica:</strong> ${escapeHtml(AppCore, canonicalPath)}</div>
            <div><strong>Ruta pública:</strong> ${escapeHtml(AppCore, publicPath)}</div>
            <div><strong>Usuario slug:</strong> ${escapeHtml(AppCore, resolvedUsername || "Sin username")}</div>
            <div><strong>Usuario:</strong> ${escapeHtml(
              AppCore,
              AppCore.state.user?.username ||
                AppCore.state.user?.name ||
                AppCore.state.user?.email ||
                "No autenticado"
            )}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderForbiddenView(AppCore, getRoute, route = null) {
  const view = getViewContainer(AppCore);

  if (!view) {
    AppCore.utils.warn(
      "Router: no se encontró #view-container para renderForbiddenView."
    );
    return;
  }

  const homeHref = getDefaultHomeTarget(AppCore, getRoute);

  view.innerHTML = `
    <section class="content-wrapper">
      <div class="panel-block" style="padding:24px;">
        <div style="display:grid; gap:16px;">
          <h2 style="margin:0;">Acceso denegado</h2>
          <p style="margin:0; color:var(--text-dim);">
            No tienes permisos para entrar en esta sección.
          </p>
          <div style="display:grid; gap:8px; font-size:14px;">
            <div><strong>Ruta:</strong> ${escapeHtml(
              AppCore,
              route?.path || AppCore.state.route || "/"
            )}</div>
            <div><strong>Rol actual:</strong> ${escapeHtml(
              AppCore,
              AppCore.state.role || "Sin rol"
            )}</div>
          </div>
          <div>
            <a href="${escapeHtml(AppCore, homeHref)}" data-spa>Volver al inicio</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderNotFoundView(AppCore, requestedPath = "/", getRoute) {
  const routeNames = getRouteNames(AppCore);
  const view = getViewContainer(AppCore);

  if (!view) {
    AppCore.utils.warn(
      "Router: no se encontró #view-container para renderNotFoundView."
    );
    return;
  }

  const homeHref = buildPublicPath(AppCore, getRoute, routeNames.HOME, {
    username:
      extractUsernameFromPath(AppCore, requestedPath) ||
      getCurrentResolvedUsername(AppCore) ||
      getCurrentUsername(AppCore),
  });

  view.innerHTML = `
    <section class="content-wrapper">
      <div class="panel-block" style="padding:24px;">
        <div style="display:grid; gap:16px;">
          <h2 style="margin:0;">404</h2>
          <p style="margin:0; color:var(--text-dim);">
            La ruta no existe en la SPA.
          </p>
          <div style="display:grid; gap:8px; font-size:14px;">
            <div><strong>Solicitada:</strong> ${escapeHtml(AppCore, requestedPath)}</div>
            <div><strong>Canónica:</strong> ${escapeHtml(
              AppCore,
              normalizeCanonicalPath(AppCore, requestedPath)
            )}</div>
          </div>
          <div>
            <a href="${escapeHtml(AppCore, homeHref || routeNames.HOME)}" data-spa>Volver al inicio</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderRuntimeErrorView(
  AppCore,
  error,
  route = null,
  requestedPath = "/",
  getRoute
) {
  const view = getViewContainer(AppCore);
  if (!view) return;

  view.innerHTML = `
    <section class="content-wrapper">
      <div class="panel-block" style="padding:24px;">
        <div style="display:grid; gap:16px;">
          <h2 style="margin:0;">Error de navegación</h2>
          <p style="margin:0; color:var(--text-dim);">
            Ocurrió un error al renderizar esta vista. Intenta recargar.
          </p>
          <div style="display:grid; gap:8px; font-size:14px;">
            <div><strong>Ruta:</strong> ${escapeHtml(AppCore, requestedPath)}</div>
            <div><strong>Vista:</strong> ${escapeHtml(
              AppCore,
              route?.name || "desconocida"
            )}</div>
            <div><strong>Error:</strong> ${escapeHtml(
              AppCore,
              error?.message || "Error inesperado"
            )}</div>
          </div>
          <div>
            <a href="${escapeHtml(
              AppCore,
              getDefaultHomeTarget(AppCore, getRoute)
            )}" data-spa>Volver al inicio</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function renderRouteSuccess({
  AppCore,
  route,
  requestedPath,
  canonicalPath,
  requestedUsername,
  setShellMode,
  setDocumentTitle,
}) {
  const resolvedPublicPath = applyResolvedRouteState(
    AppCore,
    canonicalPath,
    requestedPath
  );

  setShellMode(route);
  setDocumentTitle(route.title || AppCore.config.appName);

  route.render(route);

  emitRendered(AppCore, {
    path: requestedPath,
    canonicalPath,
    publicPath: resolvedPublicPath,
    username: requestedUsername || getCurrentResolvedUsername(AppCore) || null,
    found: true,
    forbidden: false,
    route,
  });
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
}) {
  updateHistory({
    AppCore,
    getRoute,
    pathname: canonicalPath,
    options: {
      ...options,
      username: requestedUsername || getCurrentUsername(AppCore),
    },
  });

  const resolvedPublicPath = applyResolvedRouteState(
    AppCore,
    canonicalPath,
    requestedPath
  );

  setShellMode(route);
  setDocumentTitle("Acceso denegado");
  renderForbiddenView(AppCore, getRoute, route);

  emitRendered(AppCore, {
    path: requestedPath,
    canonicalPath,
    publicPath: resolvedPublicPath,
    username: requestedUsername || getCurrentResolvedUsername(AppCore),
    found: true,
    forbidden: true,
    route,
  });
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
}) {
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

  setShellMode(null);
  setDocumentTitle("404");
  renderNotFoundView(AppCore, requestedPath, getRoute);

  emitRendered(AppCore, {
    path: requestedPath,
    canonicalPath,
    publicPath: resolvedPublicPath,
    username: requestedUsername || getCurrentResolvedUsername(AppCore) || null,
    found: false,
    forbidden: false,
    route: null,
  });
}

export function renderLoginRedirect({
  AppCore,
  getRoute,
  updateHistory,
  canonicalPath,
  clearDynamicContainers,
  setActiveMenu,
  setShellMode,
  setDocumentTitle,
}) {
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

  clearDynamicContainers();
  setActiveMenu(routeNames.LOGIN);
  setShellMode(loginRoute);
  setDocumentTitle(loginRoute?.title || "Acceso");
  loginRoute?.render?.(loginRoute);

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
}) {
  if (cycleId !== renderCycle) {
    AppCore.utils.warn?.(
      "Router: render antiguo descartado por cambio de ciclo.",
      {
        cycleId,
        currentCycle: renderCycle,
        path: requestedPath,
      }
    );
    return;
  }

  AppCore.utils.error?.("Router render error:", error);

  const resolvedPublicPath = applyResolvedRouteState(
    AppCore,
    canonicalPath,
    requestedPath
  );

  setShellMode(route);
  setDocumentTitle("Error");
  renderRuntimeErrorView(AppCore, error, route, requestedPath, getRoute);

  emitRendered(AppCore, {
    path: requestedPath,
    canonicalPath,
    publicPath: resolvedPublicPath,
    username: requestedUsername || getCurrentResolvedUsername(AppCore) || null,
    found: true,
    forbidden: false,
    route,
  });
}
