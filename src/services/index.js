/* =========================================================
   Onion Support - Services
   Archivo: /src/services/index.js

   Responsabilidad:
   - Fachada mínima de compat.
   - Delegar siempre en src/core/http.js.
   - Sin fetch propio.
   - Sin parser propio.
   - Sin retry propio.
   - Sin refresh propio.
   - Sin interceptors reales.
   - Sin storage.
   - Sin Router.
   - Sin Toast.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../core/index.js";
import CoreHttp from "../core/http.js";

export const HTTP_SERVICE_VERSION = "simple";

const SERVICE_NAME = "http";
const DEFAULT_API_BASE = "https://api.onionit.net";

let activeAppCore = AppCore || null;
let initialized = false;

const stats = {
  total: 0,
  success: 0,
  error: 0,
};

const config = {
  apiBase: DEFAULT_API_BASE,
  apiOrigin: DEFAULT_API_BASE,
  apiUrl: DEFAULT_API_BASE,
};

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizeOrigin(value = "") {
  const raw = text(value, DEFAULT_API_BASE).replace(/\/+$/g, "");

  try {
    const url = new URL(raw);
    return url.origin || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

export function redact(value = "") {
  return String(value || "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   CONFIG
========================================================= */

export function configure(patch = {}) {
  const next = isObject(patch) ? patch : {};
  const origin = normalizeOrigin(
    next.apiBase ||
      next.apiOrigin ||
      next.apiUrl ||
      next.baseUrl ||
      next.baseURL ||
      config.apiBase
  );

  config.apiBase = origin;
  config.apiOrigin = origin;
  config.apiUrl = origin;

  try {
    CoreHttp?.setApiOrigin?.(origin);
    CoreHttp?.setOrigin?.(origin);
  } catch {
    // noop
  }

  return getConfig();
}

export function getConfig() {
  return {
    version: HTTP_SERVICE_VERSION,
    apiBase: config.apiBase,
    apiOrigin: config.apiOrigin,
    apiUrl: config.apiUrl,
  };
}

export function buildUrl(path = "/", query = null) {
  if (isFunction(CoreHttp?.buildApiUrl)) {
    return CoreHttp.buildApiUrl(path, { query });
  }

  if (isFunction(CoreHttp?.buildUrl)) {
    return CoreHttp.buildUrl(path, { query });
  }

  return text(path, "/");
}

/* =========================================================
   REQUEST
========================================================= */

export async function request(...args) {
  stats.total += 1;

  try {
    const result = await CoreHttp.request(...args);
    stats.success += 1;
    return result;
  } catch (error) {
    stats.error += 1;
    throw error;
  }
}

/* =========================================================
   METHODS
========================================================= */

export function get(path, options = {}) {
  return CoreHttp.get(path, options);
}

export function head(path, options = {}) {
  return CoreHttp.head(path, options);
}

export function options(path, requestOptions = {}) {
  return CoreHttp.options(path, requestOptions);
}

export function post(path, body = undefined, requestOptions = {}) {
  return CoreHttp.post(path, body, requestOptions);
}

export function put(path, body = undefined, requestOptions = {}) {
  return CoreHttp.put(path, body, requestOptions);
}

export function patch(path, body = undefined, requestOptions = {}) {
  return CoreHttp.patch(path, body, requestOptions);
}

export function del(path, requestOptions = {}) {
  return CoreHttp.del(path, requestOptions);
}

export const deleteRequest = del;

export function raw(path, requestOptions = {}) {
  return CoreHttp.raw(path, requestOptions);
}

export function upload(path, body, requestOptions = {}) {
  return CoreHttp.upload(path, body, requestOptions);
}

export function download(path, requestOptions = {}) {
  return CoreHttp.download(path, requestOptions);
}

/* =========================================================
   AUTH
========================================================= */

export function login(body = {}, requestOptions = {}) {
  return CoreHttp.login(body, requestOptions);
}

export function me(requestOptions = {}) {
  return CoreHttp.me(requestOptions);
}

export function refresh(bodyOrOptions = {}, maybeOptions = undefined) {
  if (maybeOptions !== undefined) {
    return CoreHttp.post("/api/auth/refresh", bodyOrOptions, {
      ...maybeOptions,
      auth: false,
      public: true,
      skipAuth: true,
      captureAuth: true,
    });
  }

  return CoreHttp.refresh(bodyOrOptions);
}

export function refreshSession(requestOptions = {}) {
  return CoreHttp.refreshSession(requestOptions);
}

export function logout(requestOptions = {}) {
  return CoreHttp.logout(requestOptions);
}

export function logoutLocal() {
  clearAuthTokens();
  return true;
}

/* =========================================================
   TOKEN HELPERS
========================================================= */

export function setTokenProvider(provider = null) {
  return CoreHttp.setTokenProvider?.(provider) ?? false;
}

export function getAccessToken() {
  return CoreHttp.getAccessToken?.() || "";
}

export function getRefreshToken() {
  return CoreHttp.getRefreshToken?.() || "";
}

export function setAuthTokens(payload = {}) {
  return CoreHttp.setAuthTokens?.(payload) || {};
}

export function clearAuthTokens() {
  return CoreHttp.clearAuthTokens?.() !== false;
}

/* =========================================================
   POLICY HELPERS
========================================================= */

export function isAuthMeRequest(path = "") {
  const clean = text(path, "").replace(/^\/+/, "");
  return clean === "api/auth/me" || clean === "auth/me" || clean === "api/me" || clean === "me";
}

export function isPublicRequest(path = "", options = {}) {
  if (isAuthMeRequest(path)) return false;

  if (options.public === true || options.auth === false || options.skipAuth === true) {
    return true;
  }

  if (options.auth === true || options.public === false) {
    return false;
  }

  const clean = text(path, "").replace(/^\/+/, "");

  return [
    "api/auth/login",
    "api/auth/refresh",
    "api/auth/activate",
    "api/auth/reset-password-request",
    "api/auth/reset-password-confirm",
  ].includes(clean);
}

export function isPrivateRequest(path = "", options = {}) {
  return !isPublicRequest(path, options);
}

/* =========================================================
   INTERCEPTOR COMPAT
   No ejecutan nada. Sólo evitan imports rotos.
========================================================= */

export const interceptors = {
  request: [],
  response: [],
  error: [],
};

export function useRequest() {
  return null;
}

export function useResponse() {
  return null;
}

export function useError() {
  return null;
}

export function ejectInterceptor() {
  return false;
}

export function enableInterceptor() {
  return false;
}

export function disableInterceptor() {
  return false;
}

export function clearInterceptors() {
  return 0;
}

/* =========================================================
   INSTALL / RUNTIME
========================================================= */

export function attachToAppCore(AppCoreRef = activeAppCore) {
  const App = AppCoreRef || activeAppCore;

  if (!App || typeof App !== "object") return false;

  activeAppCore = App;

  if (!isObject(App.services)) {
    App.services = {};
  }

  App.services.http = Http;
  App.services.Http = Http;
  App.services.api = Http;
  App.services.apiClient = Http;

  return true;
}

export function init(patch = {}) {
  configure(patch);

  try {
    CoreHttp.install?.(activeAppCore, {
      apiBase: config.apiBase,
    });
  } catch {
    // noop
  }

  attachToAppCore(activeAppCore);

  initialized = true;

  return Http;
}

export function install(AppCoreRef = AppCore, installOptions = {}) {
  activeAppCore = AppCoreRef || activeAppCore || AppCore;
  return init(installOptions);
}

export function resetRuntime() {
  stats.total = 0;
  stats.success = 0;
  stats.error = 0;
  return true;
}

export function createAbortController() {
  try {
    return new AbortController();
  } catch {
    return null;
  }
}

export function abort(controller, reason = "http-abort") {
  try {
    controller?.abort?.(reason);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getState() {
  return getSnapshot();
}

export function getSnapshot() {
  return {
    version: HTTP_SERVICE_VERSION,
    service: SERVICE_NAME,
    initialized,
    apiBase: config.apiBase,
    delegatesToCoreHttp: true,
    stats: { ...stats },
    auth: {
      hasAccessToken: Boolean(getAccessToken()),
      hasRefreshToken: Boolean(getRefreshToken()),
      authMePrivate: true,
    },
  };
}

/* =========================================================
   EXPORT OBJECT
========================================================= */

export const Http = {
  __ONION_HTTP_SERVICE__: true,

  SERVICE_NAME,
  HTTP_SERVICE_VERSION,
  version: HTTP_SERVICE_VERSION,

  init,
  install,
  configure,
  attachToAppCore,

  getConfig,
  getState,
  getSnapshot,
  getDebugSnapshot: getSnapshot,
  snapshot: getSnapshot,

  request,

  get,
  head,
  options,
  post,
  put,
  patch,
  delete: del,
  del,
  raw,

  upload,
  download,

  login,
  me,
  refresh,
  refreshSession,
  logout,
  logoutLocal,

  setTokenProvider,
  setAuthTokens,
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,

  isPublicEndpoint: isPublicRequest,
  isPublicRequest,
  isPrivateRequest,
  isAuthMeEndpoint: isAuthMeRequest,
  isAuthMeRequest,

  buildUrl,
  redact,

  createAbortController,
  abort,

  interceptors,
  useRequest,
  useResponse,
  useError,
  ejectInterceptor,
  enableInterceptor,
  disableInterceptor,
  clearInterceptors,

  resetRuntime,
};

attachToAppCore();

export default Http;
