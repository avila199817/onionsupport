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
   - reparar shell tras login / restore / navegación privada
   - evitar que auth-screen deje el panel debajo del sidebar

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
   - no resucita token tras scrubbedResetToken / scrubbedResetPasswordToken
   - soporte hash-router /#/activate-account?token=...
   - soporte hash-router /#/reset-password/confirm?token=...
   - soporte aliases legacy de reset initial url
   - métricas internas por flujo
   - cero throws accidentales

   FIX UX / PERFORMANCE:
   - el flujo success ya no bloquea la navegación esperando
     a que route.render() termine si la ruta no pide modo blocking.
   - pinta transición inmediata.
   - deja que la vista cargue datos en segundo plano.
   - evita sensación de sidebar congelado.
   - repara el shell antes y después del render.
   - evita panel privado desplazado bajo sidebar tras login.

   FIX ROUTER LOGIN:
   - renderLoginRedirect respeta args.redirectTo ya construido por guards.
   - history se actualiza en redirect a login cuando updateHistory está disponible.
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

const ACTIVATION_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
]);

const RESET_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
]);

const AUTH_SCREEN_CANONICAL_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/recover-password",
  "/password-reset",
  "/reset-password",
  "/reset-password/confirm",
  "/activate-account",
]);

const PROTECTED_PUBLIC_TOKEN_ROUTES = Object.freeze([
  Object.freeze({
    path: ACTIVATION_PATH,
    stateScrubFlags: Object.freeze([
      "scrubbedActivationToken",
    ]),
    windowKeys: Object.freeze([
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),
    tokenNames: ACTIVATION_TOKEN_PARAM_NAMES,
  }),

  Object.freeze({
    path: RESET_CONFIRM_PATH,
    stateScrubFlags: Object.freeze([
      "scrubbedResetToken",
      "scrubbedResetPasswordToken",
    ]),
    windowKeys: Object.freeze([
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
    ]),
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

function isPromiseLike(value) {
  return Boolean(
    value &&
      (
        typeof value === "object" ||
        typeof value === "function"
      ) &&
      typeof value.then === "function"
  );
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

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
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

function stripPublicUsernamePrefix(pathname = "/") {
  return (
    normalizePathnameOnly(pathname).replace(/^\/@[^/]+(?=\/|$)/i, "") ||
    "/"
  );
}

function afterPaint(callback) {
  if (!isFunction(callback)) {
    return;
  }

  if (!isBrowser()) {
    try {
      callback();
    } catch {}

    return;
  }

  try {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });
    });

    return;
  } catch {}

  try {
    window.setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
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

  try {
    window?.AppCore?.events?.emit?.(
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

function safeUpdateHistory(updateHistory, payload = {}) {
  try {
    if (typeof updateHistory === "function") {
      return updateHistory(payload);
    }
  } catch {}

  return false;
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

  const pathname = stripPublicUsernamePrefix(
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
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath = normalizeHashRouterPath(parsed.hash);

      if (getPathToken(AppCore, hashPath)) {
        return true;
      }

      const hashSuffix = getSearchAndHash(hashPath);

      if (
        hashSuffix &&
        hasTokenInSearch(hashSuffix.split("#")[0], config.tokenNames)
      ) {
        return true;
      }
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

  const flags = Array.isArray(config.stateScrubFlags)
    ? config.stateScrubFlags
    : [config.stateScrubFlag].filter(Boolean);

  try {
    return flags.some((flag) =>
      Boolean(window.history?.state?.[flag])
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

function getStoredInitialUrlsByConfig(config = null) {
  if (!isBrowser() || !config) {
    return [];
  }

  const keys = Array.isArray(config.windowKeys)
    ? config.windowKeys
    : [config.windowKey].filter(Boolean);

  return keys
    .map((key) => {
      try {
        return safeText(window[key], "");
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function setStoredInitialUrlByConfig(config = null, value = "") {
  if (!isBrowser() || !config) {
    return false;
  }

  const keys = Array.isArray(config.windowKeys)
    ? config.windowKeys
    : [config.windowKey].filter(Boolean);

  let wrote = false;

  for (const key of keys) {
    try {
      if (!window[key]) {
        window[key] = value;
      }

      wrote = true;
    } catch {}
  }

  return wrote;
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
    window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__ ||
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

    const path = pathFromUrlLike(AppCore, href);

    for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
      const matchesRoute =
        sameCanonicalRoute(AppCore, path, config.path);

      if (
        matchesRoute &&
        hasProtectedToken(AppCore, href) &&
        getStoredInitialUrlsByConfig(config).length === 0
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

    candidates.push(
      ...getStoredInitialUrlsByConfig(config)
    );
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
   SHELL / AUTH-SCREEN REPAIR
========================================================= */

function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,
      shell: null,
      main: null,
      appContent: null,
      view: null,
      sidebar: null,
      topbar: null,
      tablehead: null,
      tableheadContainer: null,
      loader: null,
    };
  }

  const html =
    document.documentElement || null;

  const body =
    document.body || null;

  const shell =
    document.getElementById("app-shell") ||
    document.querySelector("[data-app-shell='true']") ||
    null;

  const main =
    document.getElementById("main-content") ||
    document.querySelector(".main-content") ||
    null;

  const appContent =
    document.getElementById("app-content") ||
    document.querySelector("[data-app-content]") ||
    null;

  const view =
    getViewContainer(AppCore);

  const sidebar =
    AppCore?.dom?.sidebar ||
    document.querySelector(".sidebar") ||
    null;

  const topbar =
    AppCore?.dom?.topbar ||
    document.querySelector(".topbar") ||
    null;

  const tablehead =
    document.getElementById("table-head") ||
    document.querySelector(".table-head") ||
    null;

  const tableheadContainer =
    AppCore?.dom?.tableheadContainer ||
    document.getElementById("tablehead-container") ||
    null;

  const loader =
    AppCore?.dom?.loader ||
    document.getElementById("app-loader") ||
    document.querySelector(".app-loader") ||
    null;

  return {
    html,
    body,
    shell,
    main,
    appContent,
    view,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    loader,
  };
}

function setElementHidden(el, hidden = false) {
  if (!el) {
    return;
  }

  try {
    el.hidden = Boolean(hidden);
  } catch {}

  try {
    el.setAttribute(
      "aria-hidden",
      hidden ? "true" : "false"
    );
  } catch {}
}

function setElementBusy(el, busy = false) {
  if (!el) {
    return;
  }

  try {
    el.setAttribute(
      "aria-busy",
      busy ? "true" : "false"
    );
  } catch {}
}

function setDataset(el, key, value) {
  if (!el) {
    return;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
      return;
    }

    el.dataset[key] = String(value);
  } catch {}
}

function routeRequestsShellHidden(AppCore, route = null, canonicalPath = "/") {
  const canonical =
    normalizeCanonicalPath(
      AppCore,
      canonicalPath || route?.path || "/"
    );

  if (
    route?.shell === false ||
    route?.hideShell === true ||
    route?.showShell === false ||
    route?.layout === "auth" ||
    route?.layout === "public" ||
    route?.meta?.shell === false ||
    route?.meta?.hideShell === true ||
    route?.meta?.layout === "auth" ||
    route?.meta?.layout === "public"
  ) {
    return true;
  }

  if (AUTH_SCREEN_CANONICAL_PATHS.has(canonical)) {
    return true;
  }

  return false;
}

function shouldUseAuthScreenClass(AppCore, route = null, canonicalPath = "/") {
  const canonical =
    normalizeCanonicalPath(
      AppCore,
      canonicalPath || route?.path || "/"
    );

  if (
    route?.layout === "auth" ||
    route?.meta?.layout === "auth" ||
    route?.authScreen === true ||
    route?.meta?.authScreen === true
  ) {
    return true;
  }

  if (AUTH_SCREEN_CANONICAL_PATHS.has(canonical)) {
    return true;
  }

  return false;
}

function setCoreShellVisible(AppCore, visible = true) {
  try {
    AppCore?.setState?.({
      shellVisible: Boolean(visible),
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.shellVisible =
          Boolean(visible);
      }
    } catch {}
  }
}

function hideLoaderSafe(AppCore, reason = "router-render") {
  const { loader, body, html } =
    getShellElements(AppCore);

  try {
    body?.classList?.remove?.("loading");
    body?.classList?.remove?.("app-loading");
    html?.classList?.remove?.("app-loading");
  } catch {}

  if (!loader) {
    return false;
  }

  try {
    loader.classList.remove(
      "is-visible",
      "app-loader--visible"
    );

    loader.classList.add(
      "is-hidden",
      "has-hidden"
    );

    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.setAttribute(
      "aria-busy",
      "false"
    );

    loader.dataset.loaderVisible = "false";

    loader.hidden = true;
  } catch {}

  safeEmit(
    AppCore,
    "app:loader:hidden",
    {
      reason,
      source: "router.render",
    }
  );

  return true;
}

function applyRenderShellRepair({
  AppCore,
  route = null,
  canonicalPath = "/",
  publicPath = "/",
  phase = "render",
  hideLoader = false,
} = {}) {
  if (!isBrowser()) {
    return {
      applied: false,
      shellHidden: false,
      reason: "not-browser",
    };
  }

  const canonical =
    normalizeCanonicalPath(
      AppCore,
      canonicalPath || route?.path || "/"
    );

  const publicRoute =
    normalizePath(
      AppCore,
      publicPath || canonical || "/"
    );

  const shellHidden =
    routeRequestsShellHidden(
      AppCore,
      route,
      canonical
    );

  const useAuthScreen =
    shouldUseAuthScreenClass(
      AppCore,
      route,
      canonical
    );

  const {
    html,
    body,
    shell,
    main,
    appContent,
    view,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
  } = getShellElements(AppCore);

  if (!html || !body) {
    return {
      applied: false,
      shellHidden,
      reason: "missing-document",
    };
  }

  try {
    html.classList.remove(
      "app-booting",
      "app-loading"
    );

    body.classList.remove(
      "app-booting",
      "app-loading",
      "loading"
    );

    html.classList.add("app-ready");
    body.classList.add("app-ready");
  } catch {}

  if (shellHidden) {
    try {
      body.classList.add("route-shell-hidden");
      body.classList.remove("route-shell-visible");

      if (useAuthScreen) {
        body.classList.add("auth-screen");
      }
    } catch {}

    setDataset(body, "shell", "hidden");
    setDataset(html, "shell", "hidden");

    setCoreShellVisible(AppCore, false);

    setElementHidden(shell, false);
    setElementHidden(main, false);
    setElementHidden(appContent, false);
    setElementHidden(view, false);

    setElementHidden(sidebar, true);
    setElementHidden(topbar, true);
    setElementHidden(tablehead, true);

    setElementBusy(shell, false);
    setElementBusy(main, false);
    setElementBusy(appContent, false);
    setElementBusy(view, false);
  } else {
    try {
      body.classList.remove(
        "auth-screen",
        "login-no-scroll",
        "route-shell-hidden"
      );

      body.classList.add("route-shell-visible");
    } catch {}

    setDataset(body, "shell", "visible");
    setDataset(html, "shell", "visible");

    setCoreShellVisible(AppCore, true);

    setElementHidden(shell, false);
    setElementHidden(main, false);
    setElementHidden(appContent, false);
    setElementHidden(view, false);

    setElementHidden(sidebar, false);
    setElementHidden(topbar, false);

    const tableheadHasContent =
      Boolean(
        tableheadContainer &&
          safeText(tableheadContainer.innerHTML, "")
      );

    if (tablehead) {
      setElementHidden(
        tablehead,
        !tableheadHasContent
      );
    }

    setElementBusy(shell, false);
    setElementBusy(main, false);
    setElementBusy(appContent, false);
    setElementBusy(view, false);

    try {
      shell?.setAttribute?.(
        "aria-hidden",
        "false"
      );

      main?.setAttribute?.(
        "aria-hidden",
        "false"
      );
    } catch {}
  }

  if (hideLoader || !shellHidden) {
    hideLoaderSafe(
      AppCore,
      `router-render:${phase}`
    );
  }

  safeEmit(
    AppCore,
    "router:shell:repair",
    {
      phase,
      shellHidden,
      useAuthScreen,
      canonicalPath: canonical,
      publicPath: publicRoute,
      hasSidebar: Boolean(sidebar),
      hasTopbar: Boolean(topbar),
      hasShell: Boolean(shell),
      source: "router.render",
    }
  );

  safeEmit(
    AppCore,
    "app:ui:repair-request",
    {
      phase,
      shellHidden,
      canonicalPath: canonical,
      publicPath: publicRoute,
      source: "router.render",
    }
  );

  return {
    applied: true,
    shellHidden,
    useAuthScreen,
    canonicalPath: canonical,
    publicPath: publicRoute,
  };
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

function runRouteRender(
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

  try {
    return route.render(
      viewContainer,
      context
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

function createDeferredViewInstance() {
  let current = null;
  let destroyed = false;

  return {
    set(view) {
      current = view || null;

      if (
        destroyed &&
        current &&
        typeof current.destroy === "function"
      ) {
        try {
          current.destroy();
        } catch {}
      }
    },

    destroy() {
      destroyed = true;

      if (
        current &&
        typeof current.destroy === "function"
      ) {
        try {
          current.destroy();
        } catch {}
      }

      current = null;
    },

    get current() {
      return current;
    },
  };
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

  return view;
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

  return view;
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

  return view;
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

  return view;
}

/* =========================================================
   SUCCESS RENDER CONTROL
========================================================= */

let successRenderSequence = 0;

function shouldAwaitRouteRender(
  AppCore,
  route = null
) {
  if (
    route?.awaitRender === true ||
    route?.renderMode === "blocking" ||
    route?.blockingRender === true
  ) {
    return true;
  }

  if (
    route?.awaitRender === false ||
    route?.renderMode === "non-blocking" ||
    route?.nonBlockingRender === true
  ) {
    return false;
  }

  return Boolean(
    AppCore?.config?.routerAwaitRouteRender === true ||
      AppCore?.config?.awaitRouteRender === true
  );
}

function renderRouteTransitionView(
  AppCore,
  route = null
) {
  const view = getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  if (
    route?.transitionView === false ||
    route?.skipTransitionView === true
  ) {
    return view;
  }

  const title =
    route?.title ||
    route?.label ||
    "Cargando vista";

  view.innerHTML = `
<section class="content-wrapper">
  <div class="panel-block" style="padding:24px;">
    <div style="display:grid;gap:14px;">
      <div
        aria-hidden="true"
        style="
          width:42px;
          height:42px;
          border-radius:16px;
          background:var(--surface-2, rgba(148,163,184,.14));
          box-shadow:inset 0 0 0 1px var(--border-soft, rgba(148,163,184,.2));
        "
      ></div>

      <div style="display:grid;gap:8px;">
        <h2 style="margin:0;font-size:18px;">
          ${escapeHtml(AppCore, title)}
        </h2>

        <p style="margin:0;color:var(--text-dim);font-size:13px;">
          Preparando contenido...
        </p>
      </div>

      <div style="display:grid;gap:8px;max-width:520px;">
        <div style="height:10px;border-radius:999px;background:var(--surface-2, rgba(148,163,184,.16));"></div>
        <div style="height:10px;width:76%;border-radius:999px;background:var(--surface-2, rgba(148,163,184,.12));"></div>
        <div style="height:10px;width:54%;border-radius:999px;background:var(--surface-2, rgba(148,163,184,.10));"></div>
      </div>
    </div>
  </div>
</section>`;

  return view;
}

function handleAsyncRouteRenderFailure({
  AppCore,
  error,
  route,
  requestedPath,
  canonicalPath,
  publicPath,
  requestedUsername,
  getRoute,
  renderId,
} = {}) {
  if (renderId !== successRenderSequence) {
    return;
  }

  const currentCanonical =
    AppCore?.state?.route || canonicalPath || "/";

  if (
    !sameCanonicalRoute(
      AppCore,
      currentCanonical,
      canonicalPath
    )
  ) {
    return;
  }

  safeError(
    AppCore,
    "[RouterRender] async route render error",
    error
  );

  safeEmit(
    AppCore,
    "router:render:error",
    {
      error,
      message: safeText(error?.message, "Error de navegación"),
      route: route || null,
      requestedPath,
      canonicalPath,
      publicPath,
      username: requestedUsername || null,
      ts: Date.now(),
    }
  );

  renderRuntimeErrorView(
    AppCore,
    error,
    getRoute
  );

  applyRenderShellRepair({
    AppCore,
    route,
    canonicalPath,
    publicPath,
    phase: "async-error",
    hideLoader: true,
  });
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

  const renderId =
    ++successRenderSequence;

  const resolved = resolvePublicPathForRoute({
    AppCore,
    getRoute,
    route,
    canonicalPath,
    requestedPath,
    requestedUsername,
  });

  /*
    Reparación temprana:
    si venimos de /login, aquí se quita auth-screen antes de que la vista privada pinte.
    Esto evita que .main-content siga a 0px y quede debajo del sidebar.
  */
  applyRenderShellRepair({
    AppCore,
    route,
    canonicalPath: resolved.canonicalPath,
    publicPath: resolved.publicPath,
    phase: "before-success-render",
    hideLoader: false,
  });

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

  const shouldBlock =
    shouldAwaitRouteRender(
      AppCore,
      route
    );

  let view = null;

  if (isFunction(route?.render)) {
    const transitionView =
      shouldBlock
        ? null
        : renderRouteTransitionView(
            AppCore,
            route
          );

    const result = runRouteRender(
      AppCore,
      route,
      ctx.viewContainer,
      ctx
    );

    if (shouldBlock) {
      view = await Promise.resolve(result);

      applyRenderShellRepair({
        AppCore,
        route,
        canonicalPath: resolved.canonicalPath,
        publicPath: resolved.publicPath,
        phase: "after-blocking-render",
        hideLoader: true,
      });
    } else if (isPromiseLike(result)) {
      const deferredView =
        createDeferredViewInstance();

      result
        .then((resolvedView) => {
          deferredView.set(resolvedView);

          applyRenderShellRepair({
            AppCore,
            route,
            canonicalPath: resolved.canonicalPath,
            publicPath: resolved.publicPath,
            phase: "async-complete",
            hideLoader: true,
          });

          afterPaint(() => {
            applyRenderShellRepair({
              AppCore,
              route,
              canonicalPath: resolved.canonicalPath,
              publicPath: resolved.publicPath,
              phase: "async-complete-after-paint",
              hideLoader: true,
            });
          });

          safeEmit(
            AppCore,
            "router:render:async-complete",
            {
              route: route?.path || null,
              canonicalPath: resolved.canonicalPath,
              publicPath: resolved.publicPath,
              hasView: Boolean(resolvedView),
              renderId,
              durationMs: Math.round(nowMs() - startedAt),
            }
          );
        })
        .catch((error) => {
          handleAsyncRouteRenderFailure({
            AppCore,
            error,
            route,
            requestedPath,
            canonicalPath: resolved.canonicalPath,
            publicPath: resolved.publicPath,
            requestedUsername: resolved.username,
            getRoute,
            renderId,
          });
        });

      view =
        deferredView ||
        transitionView ||
        ctx.viewContainer ||
        null;

      applyRenderShellRepair({
        AppCore,
        route,
        canonicalPath: resolved.canonicalPath,
        publicPath: resolved.publicPath,
        phase: "after-non-blocking-dispatch",
        hideLoader: true,
      });
    } else {
      view =
        result ||
        transitionView ||
        ctx.viewContainer ||
        null;

      applyRenderShellRepair({
        AppCore,
        route,
        canonicalPath: resolved.canonicalPath,
        publicPath: resolved.publicPath,
        phase: "after-sync-render",
        hideLoader: true,
      });
    }
  } else {
    view = renderGenericView(
      AppCore,
      route
    );

    applyRenderShellRepair({
      AppCore,
      route,
      canonicalPath: resolved.canonicalPath,
      publicPath: resolved.publicPath,
      phase: "after-generic-render",
      hideLoader: true,
    });
  }

  /*
    Reparación después del paint:
    cubre casos donde topbar/sidebar se montan tarde o AppCore.syncUserUI llega después.
  */
  afterPaint(() => {
    applyRenderShellRepair({
      AppCore,
      route,
      canonicalPath: resolved.canonicalPath,
      publicPath: resolved.publicPath,
      phase: "success-after-paint",
      hideLoader: true,
    });
  });

  /*
    IMPORTANTE:
    No emitimos router:rendered aquí en success.
    Lo emite src/router/index.js cuando termina de syncar estado.
  */

  emitFlowMetric(
    AppCore,
    "success",
    {
      route: route?.path || null,
      canonicalPath: resolved.canonicalPath,
      publicPath: resolved.publicPath,
      renderMode: shouldBlock ? "blocking" : "non-blocking",
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
      renderMode: shouldBlock ? "blocking" : "non-blocking",
    }
  );

  return view || null;
}

export function renderRouteForbidden(args = {}) {
  const startedAt = nowMs();

  safeSetShellMode(
    args.setShellMode,
    args.route || null
  );

  safeSetDocumentTitle(
    args.setDocumentTitle,
    "Acceso denegado"
  );

  renderForbiddenView(
    args.AppCore,
    args.getRoute
  );

  applyRenderShellRepair({
    AppCore: args.AppCore,
    route: args.route || null,
    canonicalPath: args.canonicalPath || args.requestedPath || "/",
    publicPath: args.requestedPath || args.canonicalPath || "/",
    phase: "forbidden",
    hideLoader: true,
  });

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

  safeSetShellMode(
    args.setShellMode,
    args.route || null
  );

  safeSetDocumentTitle(
    args.setDocumentTitle,
    "404"
  );

  renderNotFoundView(
    args.AppCore,
    args.requestedPath,
    args.getRoute
  );

  applyRenderShellRepair({
    AppCore: args.AppCore,
    route: args.route || null,
    canonicalPath: args.canonicalPath || args.requestedPath || "/",
    publicPath: args.requestedPath || args.canonicalPath || "/",
    phase: "not-found",
    hideLoader: true,
  });

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

  const loginUrl =
    safeText(args.redirectTo, "") ||
    buildLoginUrl(
      args.AppCore,
      args.requestedPath ||
        args.publicPath ||
        args.canonicalPath
    );

  const route = args.getRoute?.(
    routeNames.LOGIN
  );

  const publicPath = normalizePath(
    args.AppCore,
    loginUrl || routeNames.LOGIN
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

  safeUpdateHistory(
    args.updateHistory,
    {
      AppCore: args.AppCore,
      getRoute: args.getRoute,
      pathname: publicPath,
      options: {
        replaceState: true,
        redirectedFrom:
          args.publicPath ||
          args.requestedPath ||
          args.canonicalPath ||
          null,
        source: "guard:not-authenticated",
      },
    }
  );

  applyRenderShellRepair({
    AppCore: args.AppCore,
    route,
    canonicalPath: routeNames.LOGIN,
    publicPath,
    phase: "login-redirect-before-render",
    hideLoader: false,
  });

  if (isFunction(route?.render)) {
    await Promise.resolve(
      runRouteRender(
        args.AppCore,
        route,
        getViewContainer(args.AppCore),
        buildRouteRenderContext({
          AppCore: args.AppCore,
          route,
          requestedPath: publicPath,
          canonicalPath: routeNames.LOGIN,
          publicPath,
          redirectedFrom:
            args.publicPath ||
            args.requestedPath ||
            args.canonicalPath ||
            null,
        })
      )
    );
  }

  applyRenderShellRepair({
    AppCore: args.AppCore,
    route,
    canonicalPath: routeNames.LOGIN,
    publicPath,
    phase: "login-redirect-after-render",
    hideLoader: true,
  });

  emitRendered(
    args.AppCore,
    {
      path: publicPath,
      requestedPath: publicPath,
      canonicalPath: routeNames.LOGIN,
      publicPath,
      found: true,
      route,
      redirectedFrom:
        args.publicPath ||
        args.requestedPath ||
        args.canonicalPath ||
        null,
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

  safeSetShellMode(
    args.setShellMode,
    args.route || null
  );

  safeSetDocumentTitle(
    args.setDocumentTitle,
    "Error de navegación"
  );

  renderRuntimeErrorView(
    args.AppCore,
    args.error,
    args.getRoute
  );

  applyRenderShellRepair({
    AppCore: args.AppCore,
    route: args.route || null,
    canonicalPath: args.canonicalPath || args.requestedPath || "/",
    publicPath: args.requestedPath || args.canonicalPath || "/",
    phase: "runtime-error",
    hideLoader: true,
  });

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
  const {
    body,
    html,
    shell,
    main,
    sidebar,
    topbar,
    tablehead,
    loader,
  } = getShellElements(AppCore);

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
        ? Boolean(
            window.history?.state?.scrubbedResetToken ||
              window.history?.state?.scrubbedResetPasswordToken
          )
        : false,

    successRenderSequence,

    dom: {
      bodyClasses:
        body?.className || "",

      htmlClasses:
        html?.className || "",

      bodyShell:
        body?.dataset?.shell || null,

      htmlShell:
        html?.dataset?.shell || null,

      hasShell:
        Boolean(shell),

      hasMain:
        Boolean(main),

      hasSidebar:
        Boolean(sidebar),

      hasTopbar:
        Boolean(topbar),

      hasTablehead:
        Boolean(tablehead),

      hasLoader:
        Boolean(loader),

      shellHidden:
        Boolean(shell?.hidden),

      sidebarHidden:
        Boolean(sidebar?.hidden),

      topbarHidden:
        Boolean(topbar?.hidden),

      loaderHidden:
        Boolean(loader?.hidden),
    },
  };
}

export default {
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
