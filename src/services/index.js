/* =========================================================
   Onion Support - Services
   Archivo: /src/services/index.js

   Responsabilidad:
   - Fachada mínima de compat.
   - Delegar siempre en src/core/http.js.
   - Registrar Http en AppCore.services.
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

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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

function coreOrigin() {
  try {
    return (
      CoreHttp?.getApiOrigin?.() ||
      CoreHttp?.origin ||
      DEFAULT_API_BASE
    );
  } catch {
    return DEFAULT_API_BASE;
  }
}

/* =========================================================
   CONFIG
========================================================= */

export function configure(patch = {}) {
  const source = isObject(patch) ? patch : {};

  const origin = normalizeOrigin(
    source.apiBase ||
      source.apiOrigin ||
      source.apiUrl ||
      source.baseUrl ||
      source.baseURL ||
      coreOrigin()
  );

  try {
    CoreHttp?.setApiOrigin?.(origin);
  } catch {
    // noop
  }

  try {
    CoreHttp?.setOrigin?.(origin);
  } catch {
    // noop
  }

  return getConfig();
}

export function getConfig() {
  const origin = coreOrigin();

  return {
    version: HTTP_SERVICE_VERSION,
    apiBase: origin,
    apiOrigin: origin,
    apiUrl: origin,
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

export function request(...args) {
  return CoreHttp.request(...args);
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

export function refresh(requestOptions = {}) {
  return CoreHttp.refresh(requestOptions);
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
   TOKEN COMPAT
   La fuente real es CoreHttp/AppCore.state.
========================================================= */

export function setTokenProvider(provider = null) {
  void provider;
  return CoreHttp.setTokenProvider?.() ?? true;
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

function cleanPath(path = "") {
  return text(path, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/^\/+/, "");
}

export function isAuthMeRequest(path = "") {
  const clean = cleanPath(path);

  return clean === "api/auth/me" || clean === "auth/me";
}

export function isPublicRequest(path = "", requestOptions = {}) {
  if (isAuthMeRequest(path)) return false;

  if (
    requestOptions.public === true ||
    requestOptions.auth === false ||
    requestOptions.skipAuth === true
  ) {
    return true;
  }

  if (requestOptions.auth === true || requestOptions.public === false) {
    return false;
  }

  return [
    "api/auth/login",
    "api/auth/refresh",
    "api/auth/activate",
    "api/auth/reset-password-request",
    "api/auth/reset-password-confirm",
  ].includes(cleanPath(path));
}

export function isPrivateRequest(path = "", requestOptions = {}) {
  return !isPublicRequest(path, requestOptions);
}

/* =========================================================
   INTERCEPTOR COMPAT
   No ejecutan nada. Sólo evitan imports rotos.
========================================================= */

export const interceptors = Object.freeze({
  request: Object.freeze([]),
  response: Object.freeze([]),
  error: Object.freeze([]),
});

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
   INSTALL
========================================================= */

export function attachToAppCore(AppCoreRef = activeAppCore) {
  const App = AppCoreRef || activeAppCore;

  if (!App || typeof App !== "object") return false;

  activeAppCore = App;

  try {
    App.services = isObject(App.services) ? App.services : {};

    App.services.http = Http;
    App.services.Http = Http;
    App.services.api = Http;
    App.services.apiClient = Http;

    App.http = App.http || Http;
    App.Http = App.Http || Http;
    App.api = App.api || Http;
    App.apiClient = App.apiClient || Http;

    App.modules?.register?.("Services", Http);
    App.modules?.register?.("services", Http);
    App.modules?.register?.("HttpService", Http);

    return true;
  } catch {
    return false;
  }
}

export function init(options = {}) {
  configure(options);

  try {
    CoreHttp.install?.(activeAppCore, {
      apiBase: coreOrigin(),
    });
  } catch {
    // noop
  }

  attachToAppCore(activeAppCore);

  initialized = true;

  return Http;
}

export function install(AppCoreRef = AppCore, options = {}) {
  activeAppCore = AppCoreRef || activeAppCore || AppCore;
  return init(options);
}

export function resetRuntime() {
  return true;
}

/* =========================================================
   ABORT COMPAT
========================================================= */

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

    apiBase: coreOrigin(),
    delegatesToCoreHttp: true,

    auth: {
      hasAccessToken: Boolean(getAccessToken()),
      hasRefreshToken: Boolean(getRefreshToken()),
      authMePrivate: true,
    },

    transport: {
      hasCoreHttp: Boolean(CoreHttp),
      hasRequest: isFunction(CoreHttp?.request),
      hasGet: isFunction(CoreHttp?.get),
      hasPost: isFunction(CoreHttp?.post),
    },

    policy: {
      facadeOnly: true,
      noOwnFetch: true,
      noOwnParser: true,
      noRetry: true,
      noRefreshOwn: true,
      noInterceptorsReal: true,
      noStorage: true,
      noRouter: true,
      noToast: true,
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
