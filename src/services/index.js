/* =========================================================
   Onion Support - Services
   Archivo: /src/services/index.js

   Responsabilidad:
   - Fachada mínima de compat.
   - Delegar siempre en src/core/http.js.
   - Registrar HTTP canónico en AppCore.services sólo desde init/install.
   - Endpoints/política desde core/config.js.
   - Sin fetch propio.
   - Sin parser propio.
   - Sin retry propio.
   - Sin refresh propio.
   - Sin interceptors fake.
   - Sin apiClient paralelo.
   - Sin storage.
   - Sin Router.
   - Sin Toast.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../core/index.js";
import CoreHttp from "../core/http.js";

import {
  AUTH_ENDPOINTS,
  getApiBase,
  isPrivateApiPath,
  isPublicApiPath,
  normalizeEndpointPath,
} from "../core/config.js";

export const HTTP_SERVICE_VERSION = "services.http.v2";

const SERVICE_NAME = "http";

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

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

export function redact(value = "") {
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function coreOrigin() {
  try {
    return (
      CoreHttp?.getApiOrigin?.() ||
      CoreHttp?.origin ||
      getApiBase()
    );
  } catch {
    return getApiBase();
  }
}

function coreMethod(name = "") {
  const fn = CoreHttp?.[name];

  if (!isFunction(fn)) {
    throw new Error(`CoreHttp.${name}() no disponible.`);
  }

  return fn.bind(CoreHttp);
}

/* =========================================================
   CONFIG
========================================================= */

export function configure(patch = {}) {
  const source = isObject(patch) ? patch : {};

  const origin = cleanText(
    source.apiBase ||
      source.apiOrigin ||
      source.apiUrl ||
      source.baseUrl ||
      source.baseURL ||
      "",
    ""
  );

  if (origin) {
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

  return cleanText(path, "/");
}

/* =========================================================
   REQUEST
========================================================= */

export function request(...args) {
  return coreMethod("request")(...args);
}

/* =========================================================
   METHODS
========================================================= */

export function get(path, options = {}) {
  return coreMethod("get")(path, options);
}

export function head(path, options = {}) {
  return coreMethod("head")(path, options);
}

export function options(path, requestOptions = {}) {
  return coreMethod("options")(path, requestOptions);
}

export function post(path, body = undefined, requestOptions = {}) {
  return coreMethod("post")(path, body, requestOptions);
}

export function put(path, body = undefined, requestOptions = {}) {
  return coreMethod("put")(path, body, requestOptions);
}

export function patch(path, body = undefined, requestOptions = {}) {
  return coreMethod("patch")(path, body, requestOptions);
}

export function del(path, requestOptions = {}) {
  return coreMethod("del")(path, requestOptions);
}

export const deleteRequest = del;

export function raw(path, requestOptions = {}) {
  return coreMethod("raw")(path, requestOptions);
}

export function upload(path, body, requestOptions = {}) {
  return coreMethod("upload")(path, body, requestOptions);
}

export function download(path, requestOptions = {}) {
  return coreMethod("download")(path, requestOptions);
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function login(body = {}, requestOptions = {}) {
  return coreMethod("login")(body, requestOptions);
}

export function me(requestOptions = {}) {
  return coreMethod("me")(requestOptions);
}

export function refresh(requestOptions = {}) {
  return coreMethod("refresh")(requestOptions);
}

export function refreshSession(bodyOrOptions = {}, maybeOptions = null) {
  if (maybeOptions !== null && maybeOptions !== undefined) {
    return coreMethod("refreshSession")(bodyOrOptions, maybeOptions);
  }

  return coreMethod("refreshSession")(
    {},
    isObject(bodyOrOptions) ? bodyOrOptions : {}
  );
}

export function logout(requestOptions = {}) {
  return coreMethod("logout")(requestOptions);
}

export function activate(body = {}, requestOptions = {}) {
  return coreMethod("activate")(body, requestOptions);
}

export function requestPasswordReset(body = {}, requestOptions = {}) {
  return coreMethod("requestPasswordReset")(body, requestOptions);
}

export function confirmPasswordReset(body = {}, requestOptions = {}) {
  return coreMethod("confirmPasswordReset")(body, requestOptions);
}

export function logoutLocal() {
  clearAuthTokens();
  return true;
}

/* =========================================================
   TOKEN COMPAT MÍNIMA
   La fuente real es CoreHttp/AppCore.state.
========================================================= */

export function getAccessToken() {
  return CoreHttp?.getAccessToken?.() || "";
}

export function setAuthTokens(payload = {}) {
  return CoreHttp?.setAuthTokens?.(payload) || {};
}

export function clearAuthTokens() {
  return CoreHttp?.clearAuthTokens?.() !== false;
}

/* =========================================================
   POLICY HELPERS
========================================================= */

function endpointPath(path = "") {
  try {
    return normalizeEndpointPath(path);
  } catch {
    return cleanText(path, "")
      .split("?")[0]
      .split("#")[0]
      .replace(/^\/+/, "/") || "";
  }
}

export function isAuthMeRequest(path = "") {
  return endpointPath(path) === AUTH_ENDPOINTS.me;
}

export function isPublicRequest(path = "", requestOptions = {}) {
  const clean = endpointPath(path);

  if (!clean) return false;
  if (clean === AUTH_ENDPOINTS.me) return false;

  if (
    requestOptions.public === true ||
    requestOptions.auth === false ||
    requestOptions.skipAuth === true ||
    requestOptions.noAuthHeader === true
  ) {
    return true;
  }

  if (
    requestOptions.auth === true ||
    requestOptions.public === false ||
    requestOptions.skipAuth === false ||
    requestOptions.noAuthHeader === false
  ) {
    return false;
  }

  return isPublicApiPath(clean);
}

export function isPrivateRequest(path = "", requestOptions = {}) {
  const clean = endpointPath(path);

  if (!clean) return false;
  if (clean === AUTH_ENDPOINTS.me) return true;

  if (
    requestOptions.auth === true ||
    requestOptions.public === false ||
    requestOptions.skipAuth === false ||
    requestOptions.noAuthHeader === false
  ) {
    return true;
  }

  if (
    requestOptions.public === true ||
    requestOptions.auth === false ||
    requestOptions.skipAuth === true ||
    requestOptions.noAuthHeader === true
  ) {
    return false;
  }

  return isPrivateApiPath(clean) || !isPublicRequest(clean, requestOptions);
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

    /*
      Fuente canónica: CoreHttp.
      Este archivo sólo es fachada de importación.
    */
    App.services.http = CoreHttp;

    return true;
  } catch {
    return false;
  }
}

export function init(options = {}) {
  activeAppCore = options.AppCore || options.core || activeAppCore || AppCore;

  configure(options);

  try {
    CoreHttp?.install?.(activeAppCore, {
      ...options,
      apiBase: options.apiBase || options.apiOrigin || coreOrigin(),
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

  return init({
    ...options,
    AppCore: activeAppCore,
  });
}

export function resetRuntime() {
  initialized = false;
  activeAppCore = AppCore || null;
  return true;
}

/* =========================================================
   ABORT HELPERS
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

    auth: {
      hasAccessToken: Boolean(getAccessToken()),
      authMePrivate: true,
      exposesRefreshToken: false,
    },

    transport: {
      delegatesToCoreHttp: true,
      hasCoreHttp: Boolean(CoreHttp),
      hasRequest: isFunction(CoreHttp?.request),
      hasGet: isFunction(CoreHttp?.get),
      hasPost: isFunction(CoreHttp?.post),
    },

    policy: {
      facadeOnly: true,
      coreHttpIsSourceOfTruth: true,

      noOwnFetch: true,
      noOwnParser: true,
      noRetry: true,
      noRefreshOwn: true,

      noInterceptors: true,
      noApiClientAlias: true,
      noAppApiAlias: true,
      noTokenProviderCompat: true,
      noRefreshTokenFacade: true,

      noStorage: true,
      noRouter: true,
      noToast: true,

      noImportSideEffectRegistration: true,
      snapshotRedacted: true,
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
  deleteRequest,
  raw,

  upload,
  download,

  login,
  me,
  refresh,
  refreshSession,
  logout,
  logoutLocal,

  activate,
  requestPasswordReset,
  confirmPasswordReset,

  setAuthTokens,
  clearAuthTokens,
  getAccessToken,

  isPublicEndpoint: isPublicRequest,
  isPublicRequest,
  isPrivateRequest,
  isAuthMeEndpoint: isAuthMeRequest,
  isAuthMeRequest,

  buildUrl,
  redact,

  createAbortController,
  abort,

  resetRuntime,
};

export default Http;
