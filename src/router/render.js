/* =========================================================
   Onion SPA - Router Render
   Archivo: src/router/render.js

   RESPONSABILIDADES:
   - renderizar vistas internas del router
   - construir payloads de navegación
   - emitir before-render / rendered cuando el flujo lo requiere
   - preparar contextos de render
   - flujos success / forbidden / 404 / login / runtime
   - soportar route.render async

   HARDENING EXTREMO:
   - guards browser / DOM total safe
   - evita doble router:rendered en success
   - evita doble sync route/publicPath en success
   - payloads estables y enriquecidos
   - paso explícito de viewContainer al render
   - compatibilidad función / objeto / adapters
   - return explícito de view instance
   - fallbacks seguros si falta render
   - preserva username resuelto y slug público
   - preserva query/hash públicos en render
   - no destruye /activate-account?token=...
   - no destruye /activate-account/<token>
   - no destruye /reset-password/confirm?token=...
   - no destruye /reset-password/confirm/<token>
   - no resucita token tras scrubbedActivationToken
   - no resucita token tras scrubbedResetToken
   - soporte hash-router /#/activate-account?token=...
   - soporte hash-router /#/reset-password/confirm?token=...
   - métricas internas por flujo
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
   CONSTANTS
========================================================= */

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const ACTIVATION_TOKEN_PARAM_NAMES = [
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
];

const RESET_TOKEN_PARAM_NAMES = [
  "token",
  "resetToken",
  "passwordResetToken",
  "code",
  "t",
];

const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    path: ACTIVATION_PATH,
    stateScrubFlag: "scrubbedActivationToken",
    windowKey: "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    tokenNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),

  Object.freeze({
    path: RESET_CONFIRM_PATH,
    stateScrubFlag: "scrubbedResetToken",
    windowKey: "__ONION_RESET_CONFIRM_INITIAL_URL__",
    tokenNames: RESET_TOKEN_PARAM_NAMES,
  }),
]);

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

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizePathnameOnly(pathname = "/") {
  let value = String(pathname || "/")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

/* =========================================================
   SAFE OPS
========================================================= */

function safeEmit(AppCore, eventName, payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {}

  try {
    console.warn(...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(...args);
  } catch {}

  try {
    console.error(...args);
  } catch {}
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function safeSetDocumentTitle(setDocumentTitle, title) {
  try {
    if (typeof setDocumentTitle === "function") {
      setDocumentTitle(title);
    }
  } catch {}
}

function safeSetShellMode(setShellMode, route) {
  try {
    if (typeof setShellMode === "function") {
      setShellMode(route);
    }
  } catch {}
}

function safeClearDynamicContainers(clearDynamicContainers) {
  try {
    if (typeof clearDynamicContainers === "function") {
      clearDynamicContainers();
    }
  } catch {}
}

function safeSetActiveMenu(setActiveMenu, path) {
  try {
    if (typeof setActiveMenu === "function") {
      setActiveMenu(path);
    }
  } catch {}
}

/* =========================================================
   FLOW METRICS
========================================================= */

function emitFlowMetric(AppCore, flow = "unknown", payload = {}) {
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

export function getViewContainer(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (
      AppCore?.dom?.viewContainer &&
      document.contains(AppCore.dom.viewContainer)
    ) {
      return AppCore.dom.viewContainer;
    }
  } catch {}

  const el =
    document.getElementById("view-container") ||
    document.querySelector("#view-container") ||
    null;

  try {
    if (el && AppCore?.dom) {
      AppCore.dom.viewContainer = el;
    }
  } catch {}

  return el;
}

/* =========================================================
   URL CONTEXT HELPERS
========================================================= */

function isHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function getBrowserPublicPath(AppCore) {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizePath(
        AppCore,
        normalizeHashRouterPath(hash)
      );
    }

    return normalizePath(
      AppCore,
      `${pathname}${search}${hash}`
    );
  } catch {
    return "";
  }
}

function pathFromUrlLike(AppCore, value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizePath(
      AppCore,
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizePath(
        AppCore,
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return normalizePath(
      AppCore,
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return normalizePath(
      AppCore,
      raw.startsWith("/") ? raw : `/${raw}`
    );
  }
}

function sameCanonicalRoute(AppCore, a = "/", b = "/") {
  return (
    normalizeCanonicalPath(AppCore, a) ===
    normalizeCanonicalPath(AppCore, b)
  );
}

function getRouteConfigByPath(path = "") {
  const clean = normalizePathnameOnly(path);

  return PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => {
    return (
      clean === item.path ||
      clean.startsWith(`${item.path}/`)
    );
  }) || null;
}

function getRouteConfigFromUrl(AppCore, pathOrUrl = "") {
  const path = pathFromUrlLike(AppCore, pathOrUrl);
  const canonical = normalizeCanonicalPath(AppCore, path || "/");

  return getRouteConfigByPath(canonical);
}

function isProtectedPublicTokenPath(AppCore, path = "") {
  return Boolean(
    getRouteConfigFromUrl(AppCore, path)
  );
}

function hasTokenInSearch(search = "", tokenNames = []) {
  try {
    const params = new URLSearchParams(search || "");

    return tokenNames.some((name) => {
      return Boolean(
        safeText(
          params.get(name),
          ""
        )
      );
    });
  } catch {
    return false;
  }
}

function getPathToken(AppCore, pathOrUrl = "") {
  const path = pathFromUrlLike(AppCore, pathOrUrl);

  if (!path) {
    return "";
  }

  const pathname = normalizePathnameOnly(
    path.split("?")[0].split("#")[0] || "/"
  );

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    if (!pathname.startsWith(`${config.path}/`)) {
      continue;
    }

    const token = pathname
      .slice(`${config.path}/`.length)
      .split("/")[0];

    try {
      return safeText(
        decodeURIComponent(token || ""),
        ""
      );
    } catch {
      return safeText(token, "");
    }
  }

  return "";
}

function hasProtectedToken(AppCore, pathOrUrl = "") {
  const raw = safeText(pathOrUrl, "");

  if (!raw) {
    return false;
  }

  const config = getRouteConfigFromUrl(AppCore, raw);

  if (!config) {
    return false;
  }

  if (getPathToken(AppCore, raw)) {
    return true;
  }

  try {
    const parsed = new URL(raw, getBaseOrigin());

    if (
      hasTokenInSearch(parsed.search, config.tokenNames)
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query = parsed.hash.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenNames
      );
    }

    return false;
  } catch {
    const suffix = getSearchAndHash(raw);

    if (
      suffix &&
      suffix.includes("?")
    ) {
      const query = suffix.split("#")[0];

      if (hasTokenInSearch(query, config.tokenNames)) {
        return true;
      }
    }

    if (
      suffix &&
      suffix.includes("#") &&
      suffix.includes("?")
    ) {
      const query = suffix.split("?").slice(1).join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenNames
      );
    }

    return false;
  }
}

function isTokenScrubbedForConfig(config = null) {
  if (!isBrowser() || !config) {
    return false;
  }

  try {
    return Boolean(
      window.history?.state?.[config.stateScrubFlag]
    );
  } catch {
    return false;
  }
}

function getInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_INITIAL_URL__,
    ""
  );
}

function getStoredInitialUrlByConfig(config = null) {
  if (!isBrowser() || !config?.windowKey) {
    return "";
  }

  try {
    return safeText(
      window[config.windowKey],
      ""
    );
  } catch {
    return "";
  }
}

function setStoredInitialUrlByConfig(config = null, value = "") {
  if (!isBrowser() || !config?.windowKey) {
    return false;
  }

  try {
    window[config.windowKey] = value;
    return true;
  } catch {
    return false;
  }
}

function getActivationInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__,
    ""
  );
}

function getResetConfirmInitialUrl() {
  if (!isBrowser()) {
    return "";
  }

  return safeText(
    window.__ONION_RESET_CONFIRM_INITIAL_URL__,
    ""
  );
}

function captureInitialUrl(AppCore) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const href = window.location.href;

    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ = href;
    }

    for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
      const path = pathFromUrlLike(AppCore, href);

      const matchesRoute =
        sameCanonicalRoute(AppCore, path, config.path) ||
        normalizeCanonicalPath(AppCore, path).startsWith(`${config.path}/`);

      if (
        matchesRoute &&
        hasProtectedToken(AppCore, href) &&
        !getStoredInitialUrlByConfig(config)
      ) {
        setStoredInitialUrlByConfig(config, href);
      }
    }

    return true;
  } catch {
    return false;
  }
}

function getProtectedPublicPath(AppCore) {
  captureInitialUrl(AppCore);

  const candidates = [];

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    if (isTokenScrubbedForConfig(config)) {
      continue;
    }

    const stored = getStoredInitialUrlByConfig(config);

    if (stored) {
      candidates.push(stored);
    }
  }

  const initialUrl = getInitialUrl();

  if (initialUrl) {
    candidates.push(initialUrl);
  }

  const browserPath = getBrowserPublicPath(AppCore);

  if (browserPath) {
    candidates.push(browserPath);
  }

  for (const candidate of candidates) {
    const config = getRouteConfigFromUrl(AppCore, candidate);

    if (!config) {
      continue;
    }

    if (isTokenScrubbedForConfig(config)) {
      continue;
    }

    if (!hasProtectedToken(AppCore, candidate)) {
      continue;
    }

    return pathFromUrlLike(AppCore, candidate);
  }

  return "";
}

/**
 * Protege query/hash/path-token del navegador o URL inicial si el render intenta
 * sincronizar la misma ruta sin token.
 *
 * Ejemplos:
 *   initial:   /activate-account?token=abc
 *   candidate: /activate-account
 *   resultado: /activate-account?token=abc
 *
 *   initial:   /reset-password/confirm/abc
 *   candidate: /reset-password/confirm
 *   resultado: /reset-password/confirm/abc
 */
function preservePublicContextForSameRoute(AppCore, candidatePath = "/") {
  const candidate = normalizePath(
    AppCore,
    candidatePath || "/"
  );

  const protectedPath = getProtectedPublicPath(AppCore);

  if (
    protectedPath &&
    isProtectedPublicTokenPath(AppCore, candidate) &&
    sameCanonicalRoute(AppCore, protectedPath, candidate)
  ) {
    return protectedPath;
  }

  const browserPath = getBrowserPublicPath(AppCore);

  if (!browserPath) {
    return candidate;
  }

  const candidateSuffix = getSearchAndHash(candidate);
  const browserSuffix = getSearchAndHash(browserPath);

  if (
    browserSuffix &&
    !candidateSuffix &&
    sameCanonicalRoute(AppCore, browserPath, candidate)
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
  const finalCanonical = normalizeCanonicalPath(
    AppCore,
    canonicalPath ||
      requestedPath ||
      "/"
  );

  const normalizedRequested = normalizePath(
    AppCore,
    requestedPath ||
      canonicalPath ||
      finalCanonical
  );

  const requestedSuffix = getSearchAndHash(
    normalizedRequested
  );

  const canonicalSuffix = getSearchAndHash(
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
    safeText(requestedUsername) ||
    extractUsernameFromPath(AppCore, publicPath || "") ||
    getCurrentResolvedUsername(AppCore) ||
    getCurrentUsername(AppCore) ||
    AppCore?.state?.user?.username ||
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
  const sourceForPublic = buildCanonicalSourceWithSuffix(
    AppCore,
    canonicalPath,
    requestedPath
  );

  const finalCanonical = normalizeCanonicalPath(
    AppCore,
    sourceForPublic
  );

  const username = resolveUsernameForPayload(
    AppCore,
    requestedUsername,
    requestedPath || sourceForPublic
  );

  const built = buildPublicPath(
    AppCore,
    getRoute || (() => route),
    sourceForPublic,
    {
      username,
      resolvedUsername: username,
      fromPath: requestedPath || sourceForPublic,
      publicPath: requestedPath || sourceForPublic,
    }
  );

  const finalPublic = preservePublicContextForSameRoute(
    AppCore,
    built ||
      sourceForPublic ||
      requestedPath ||
      finalCanonical
  );

  return {
    canonicalPath: finalCanonical,
    publicPath: finalPublic,
    username: username || null,
  };
}

/* =========================================================
   PAYLOADS
========================================================= */

export function buildRenderPayload({
  path = null,
  requestedPath = null,
  canonicalPath = null,
  publicPath = null,
  username = null,
  route = null,
  found = false,
  forbidden = false,
  redirectedFrom = null,
  options = null,
} = {}) {
  return {
    path,
    requestedPath,
    canonicalPath,
    publicPath,
    username,
    route,
    found: Boolean(found),
    forbidden: Boolean(forbidden),
    redirectedFrom,
    options,
    ts: Date.now(),
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

  const candidatePublic = normalizePath(
    AppCore,
    publicPath || finalCanonical
  );

  const finalPublic = preservePublicContextForSameRoute(
    AppCore,
    candidatePublic
  );

  const username = resolveUsernameForPayload(
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
      route: finalCanonical,
      publicPath: finalPublic,
      currentResolvedUsername: username,
    });
  } catch {}

  return {
    canonicalPath: finalCanonical,
    publicPath: finalPublic,
    username,
  };
}

export function applyResolvedRouteState(
  AppCore,
  canonicalPath,
  fallbackPublicPath
) {
  const protectedPublicPath = getProtectedPublicPath(AppCore);

  const publicPath =
    protectedPublicPath ||
    getResolvedPublicPath(fallbackPublicPath);

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
  const finalPublicPath = preservePublicContextForSameRoute(
    AppCore,
    publicPath ||
      requestedPath ||
      canonicalPath ||
      "/"
  );

  const finalCanonicalPath = normalizeCanonicalPath(
    AppCore,
    canonicalPath ||
      finalPublicPath
  );

  const username = resolveUsernameForPayload(
    AppCore,
    requestedUsername,
    finalPublicPath
  );

  return Object.freeze({
    AppCore,
    route,

    path: finalPublicPath,
    requestedPath: finalPublicPath,
    canonicalPath: finalCanonicalPath,
    publicPath: finalPublicPath,

    username,
    requestedUsername: username,

    redirectedFrom,

    found: Boolean(found),
    forbidden: Boolean(forbidden),

    viewContainer: getViewContainer(AppCore),
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

  if (!isFunction(route?.render)) {
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

export function renderGenericView(AppCore, route) {
  const view = getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  const canonical = AppCore?.state?.route || "/";
  const publicPath = getCurrentPublicPath(AppCore);
  const username = getCurrentResolvedUsername(AppCore);

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

export function renderForbiddenView(AppCore, getRoute) {
  const view = getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  const href = getDefaultHomeTarget(
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

export function renderNotFoundView(AppCore, requestedPath, getRoute) {
  const view = getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  const href = getDefaultHomeTarget(
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

export function renderRuntimeErrorView(AppCore, error, getRoute) {
  const view = getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  const href = getDefaultHomeTarget(
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
  const startedAt = nowMs();

  const resolved = resolvePublicPathForRoute({
    AppCore,
    getRoute,
    route,
    canonicalPath,
    requestedPath,
    requestedUsername,
  });

  /*
    IMPORTANTE:
    No hacemos syncRouteState() aquí.
    El Router principal ya sincroniza route/publicPath después de recibir la view.
    Esto evita doble app:route:change y microparpadeos post-login.
  */

  safeSetShellMode(
    setShellMode,
    route
  );

  safeSetDocumentTitle(
    setDocumentTitle,
    route?.title ||
      AppCore?.config?.appName ||
      "Onion"
  );

  const ctx = buildRouteRenderContext({
    AppCore,
    route,
    requestedPath: resolved.publicPath,
    canonicalPath: resolved.canonicalPath,
    requestedUsername: resolved.username,
    publicPath: resolved.publicPath,
  });

  let view = null;

  if (isFunction(route?.render)) {
    view = await runRouteRender(
      AppCore,
      route,
      ctx.viewContainer,
      ctx
    );
  } else {
    view = renderGenericView(
      AppCore,
      route
    );
  }

  /*
    IMPORTANTE:
    No emitimos router:rendered aquí en success.
    Lo emite src/router/index.js cuando termina de syncar estado.
    Esto evita doble evento rendered.
  */

  emitFlowMetric(
    AppCore,
    "success",
    {
      route: route?.path || null,
      canonicalPath: resolved.canonicalPath,
      publicPath: resolved.publicPath,
      durationMs: Math.round(nowMs() - startedAt),
    }
  );

  safeLog(
    AppCore,
    "[RouterRender] success",
    {
      route: route?.path || null,
      canonicalPath: resolved.canonicalPath,
      publicPath: resolved.publicPath,
    }
  );

  return view || null;
}

export function renderRouteForbidden(args = {}) {
  const startedAt = nowMs();

  renderForbiddenView(
    args.AppCore,
    args.getRoute
  );

  emitRendered(
    args.AppCore,
    {
      path: args.requestedPath,
      requestedPath: args.requestedPath,
      canonicalPath: args.canonicalPath,
      publicPath: args.requestedPath,
      username: args.requestedUsername || null,
      found: true,
      forbidden: true,
      route: args.route || null,
    }
  );

  emitFlowMetric(
    args.AppCore,
    "forbidden",
    {
      durationMs: Math.round(nowMs() - startedAt),
    }
  );

  return null;
}

export function renderRouteNotFound(args = {}) {
  const startedAt = nowMs();

  renderNotFoundView(
    args.AppCore,
    args.requestedPath,
    args.getRoute
  );

  /*
    No emitimos router:rendered aquí.
    src/router/index.js ya lo emite en flujo 404.
  */

  emitFlowMetric(
    args.AppCore,
    "not-found",
    {
      durationMs: Math.round(nowMs() - startedAt),
    }
  );

  return null;
}

export async function renderLoginRedirect(args = {}) {
  const startedAt = nowMs();

  const routeNames = getRouteNames(args.AppCore);

  const loginUrl = buildLoginUrl(
    args.AppCore,
    args.canonicalPath
  );

  const route = args.getRoute?.(
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
    route?.title || "Login"
  );

  const publicPath = preservePublicContextForSameRoute(
    args.AppCore,
    loginUrl
  );

  if (isFunction(route?.render)) {
    await runRouteRender(
      args.AppCore,
      route,
      getViewContainer(args.AppCore),
      buildRouteRenderContext({
        AppCore: args.AppCore,
        route,
        requestedPath: publicPath,
        canonicalPath: routeNames.LOGIN,
        publicPath,
        redirectedFrom: args.canonicalPath,
      })
    );
  }

  emitRendered(
    args.AppCore,
    {
      path: publicPath,
      requestedPath: publicPath,
      canonicalPath: routeNames.LOGIN,
      publicPath,
      found: true,
      route,
      redirectedFrom: args.canonicalPath || null,
    }
  );

  emitFlowMetric(
    args.AppCore,
    "login-redirect",
    {
      durationMs: Math.round(nowMs() - startedAt),
    }
  );

  return null;
}

export function renderRouteRuntimeError(args = {}) {
  const startedAt = nowMs();

  renderRuntimeErrorView(
    args.AppCore,
    args.error,
    args.getRoute
  );

  emitRendered(
    args.AppCore,
    {
      path: args.requestedPath,
      requestedPath: args.requestedPath,
      canonicalPath: args.canonicalPath,
      publicPath: args.requestedPath,
      username: args.requestedUsername || null,
      found: true,
      forbidden: false,
      route: args.route || null,
    }
  );

  emitFlowMetric(
    args.AppCore,
    "runtime-error",
    {
      error: safeText(args.error?.message),
      durationMs: Math.round(nowMs() - startedAt),
    }
  );

  safeError(
    args.AppCore,
    "[RouterRender] runtime-error",
    args.error
  );

  return null;
}

/* =========================================================
   DEBUG
========================================================= */

export function getRenderSnapshot(AppCore) {
  return {
    browserPublicPath: getBrowserPublicPath(AppCore),

    currentPublicPath: getCurrentPublicPath(AppCore),

    protectedPublicPath: getProtectedPublicPath(AppCore),

    initialUrl: getInitialUrl(),

    activationInitialUrl: getActivationInitialUrl(),

    resetConfirmInitialUrl: getResetConfirmInitialUrl(),

    activationTokenScrubbed:
      isBrowser()
        ? Boolean(window.history?.state?.scrubbedActivationToken)
        : false,

    resetTokenScrubbed:
      isBrowser()
        ? Boolean(window.history?.state?.scrubbedResetToken)
        : false,
  };
}
