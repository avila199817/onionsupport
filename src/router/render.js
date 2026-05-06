/* =========================================================
   Onion SPA - Router Render
   Archivo: src/router/render.js

   FINAL EXTREME SYSTEM · RENDER HOST ISOLATED · RACE SAFE · EVENT SAFE · 14/10
   PATCH · ROUTE STATE COMMIT BEFORE SUCCESS VIEW RENDER
   PATCH · SIDEBAR ACTIVE ROUTE FIX
   PATCH · CANONICAL/PUBLIC PAYLOAD HARDENED
   PATCH · NO DOUBLE router:rendered WITH router/index.js
   PATCH · TOKEN REDACTION SAFE

   RESPONSABILIDADES:
   - renderizar vistas internas del router
   - construir payloads de navegación
   - emitir before-render / rendered solo cuando el flujo lo requiere
   - preparar contextos de render
   - flujos success / forbidden / 404 / login / runtime
   - soportar route.render async
   - reparar shell tras login / restore / navegación privada
   - evitar que auth-screen deje el panel debajo del sidebar
   - aislar cada render en un host propio para evitar carreras async
   - impedir que renders antiguos reparen shell o pinten errores tardíos
   - exponer contexto con renderId / signal / isStale / renderRoot

   HARDENING EXTREMO:
   - guards browser / DOM total safe
   - evita doble router:rendered en success / 404 / forbidden / login
   - evita doble sync route/publicPath en success
   - payloads estables y enriquecidos
   - paso explícito de viewContainer y renderRoot al render
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

   FIX REAL RACE CONDITIONS:
   - cada navegación success crea un render host aislado
   - route.render() recibe renderRoot en vez de tocar el root global
   - async render antiguo queda en host desconectado si llega tarde
   - async error antiguo se ignora
   - reparación async solo corre si renderId sigue activo
   - AbortController opcional para vistas que soporten ctx.signal

   FIX UX / PERFORMANCE:
   - success no bloquea navegación salvo route.awaitRender/renderMode=blocking
   - pinta transición inmediata
   - deja que la vista cargue datos en segundo plano
   - evita sensación de sidebar congelado
   - repara shell antes y después del render
   - evita panel privado desplazado bajo sidebar tras login

   FIX EVENT STORM:
   - safeEmit() NO duplica AppCore.events + window
   - router:shell:repair se deduplica por firma
   - app:ui:repair-request NO se emite automáticamente desde cada shell repair
   - render.js no fuerza repair UI global en cada fase interna

   FIX ROUTE SCOPE:
   - canonicalPath nunca conserva prefijo /@usuario
   - publicPath puede conservar /@usuario
   - helpers externos no pueden degradar /incidencias a /
   - render host queda marcado con canonical/public/status/renderId
   - async stale render no puede escribir ni reparar shell

   FIX SIDEBAR ACTIVE:
   - success hace commit real de AppCore.state.route/publicPath ANTES del render
   - router/index.js emite router:rendered con canonical/public definitivos
   - el sidebar ya no queda activo en la ruta anterior
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

const ACTIVATION_PATH =
  "/activate-account";

const RESET_CONFIRM_PATH =
  "/reset-password/confirm";

const RENDER_HOST_ATTR =
  "data-router-view-host";

const RENDER_HOST_CLASS =
  "router-view-host";

const RENDER_FALLBACK_CLASS =
  "router-fallback-view";

const SHELL_REPAIR_EMIT_DEDUPE_MS =
  24;

const ACTIVATION_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ]);

const RESET_TOKEN_PARAM_NAMES =
  Object.freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
  ]);

const AUTH_SCREEN_CANONICAL_PATHS =
  new Set([
    "/login",
    "/forgot-password",
    "/recover-password",
    "/password-reset",
    "/reset-password",
    "/reset-password/confirm",
    "/activate-account",
    "/2fa",
    "/otp",
  ]);

const PROTECTED_PUBLIC_TOKEN_ROUTES =
  Object.freeze([
    Object.freeze({
      key:
        "activation",
      path:
        ACTIVATION_PATH,
      stateScrubFlags:
        Object.freeze([
          "scrubbedActivationToken",
        ]),
      windowKeys:
        Object.freeze([
          "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
        ]),
      tokenNames:
        ACTIVATION_TOKEN_PARAM_NAMES,
    }),

    Object.freeze({
      key:
        "resetConfirm",
      path:
        RESET_CONFIRM_PATH,
      stateScrubFlags:
        Object.freeze([
          "scrubbedResetToken",
          "scrubbedResetPasswordToken",
        ]),
      windowKeys:
        Object.freeze([
          "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
          "__ONION_RESET_CONFIRM_INITIAL_URL__",
        ]),
      tokenNames:
        RESET_TOKEN_PARAM_NAMES,
    }),
  ]);

const SENSITIVE_QUERY_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
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

function isNode(value) {
  if (!value) {
    return false;
  }

  try {
    return (
      typeof Node !== "undefined" &&
      value instanceof Node
    );
  } catch {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.nodeType === "number"
    );
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

  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowEpochMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function firstResolved(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
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

function microtask(callback) {
  if (!isFunction(callback)) {
    return;
  }

  try {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        try {
          callback();
        } catch {}
      });

      return;
    }
  } catch {}

  try {
    Promise.resolve().then(() => {
      try {
        callback();
      } catch {}
    });

    return;
  } catch {}

  try {
    callback();
  } catch {}
}

/* =========================================================
   REDACTION / SAFE LOG PAYLOADS
========================================================= */

function redactTokenInText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_QUERY_PARAM_NAMES) {
      const escaped =
        String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    }

    output =
      output.replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
        "$1***"
      );

    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  return output;
}

function redactPayload(value, depth = 0) {
  if (depth > 4) {
    return "[MaxDepth]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "string") {
    return redactTokenInText(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name:
        value.name || "Error",
      message:
        redactTokenInText(value.message || ""),
      code:
        value.code || value.status || null,
      stack:
        redactTokenInText(value.stack || ""),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      redactPayload(
        item,
        depth + 1
      )
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const output =
      {};

    for (const [key, item] of Object.entries(value)) {
      const cleanKey =
        String(key).toLowerCase();

      if (
        cleanKey.includes("token") ||
        cleanKey === "authorization" ||
        cleanKey === "password" ||
        cleanKey === "secret"
      ) {
        output[key] =
          item ? "***" : item;
        continue;
      }

      output[key] =
        redactPayload(
          item,
          depth + 1
        );
    }

    return output;
  }

  return value;
}

/* =========================================================
   PATH HARDENING
========================================================= */

function normalizePathnameOnly(pathname = "/") {
  let value =
    String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  if (value.length > 1) {
    value =
      value.replace(/\/+$/g, "") ||
      "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const value =
    safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function splitFullPath(value = "/") {
  const raw =
    safeText(value, "/");

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) ||
      "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      "/";
  }

  return {
    pathname:
      normalizePathnameOnly(pathname),
    search:
      normalizeSearch(search),
    hash:
      normalizeHash(hash),
  };
}

function normalizeLocalFullPath(path = "/") {
  const raw =
    safeText(path, "/");

  if (!raw) {
    return "/";
  }

  if (isHashRouterPath(raw)) {
    return normalizeLocalFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          getBaseOrigin()
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeLocalFullPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizeLocalFullPath(
        `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripSearchAndHash(path = "/") {
  const normalized =
    normalizeLocalFullPath(path || "/");

  return (
    normalized
      .split("?")[0]
      .split("#")[0] ||
    "/"
  );
}

function isPublicUsernameSegment(segment = "") {
  const raw =
    safeText(segment, "");

  return /^@[A-Za-z0-9._-]{1,80}$/.test(raw);
}

function hasPublicUsernamePrefix(path = "") {
  const clean =
    stripSearchAndHash(path);

  const first =
    clean
      .split("/")
      .filter(Boolean)[0] ||
    "";

  return isPublicUsernameSegment(first);
}

function stripPublicUsernamePrefix(path = "/") {
  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(
      normalizeLocalFullPath(path || "/")
    );

  const segments =
    pathname
      .split("/")
      .filter(Boolean);

  if (
    segments.length > 0 &&
    isPublicUsernameSegment(segments[0])
  ) {
    const rest =
      segments
        .slice(1)
        .join("/");

    const cleanPathname =
      rest
        ? normalizePathnameOnly(`/${rest}`)
        : "/";

    return `${cleanPathname}${search}${hash}`;
  }

  return `${pathname}${search}${hash}`;
}

function safeNormalizePublicPath(AppCore, path = "/") {
  const local =
    normalizeLocalFullPath(path || "/");

  try {
    const external =
      normalizePath(
        AppCore,
        path || "/"
      );

    const normalizedExternal =
      normalizeLocalFullPath(
        external || local
      );

    if (
      hasPublicUsernamePrefix(local) &&
      !hasPublicUsernamePrefix(normalizedExternal) &&
      stripSearchAndHash(normalizedExternal) === "/"
    ) {
      return local;
    }

    return normalizedExternal || local;
  } catch {
    return local;
  }
}

function safeCanonicalPath(AppCore, path = "/") {
  const localPublic =
    normalizeLocalFullPath(path || "/");

  const localCanonical =
    normalizeLocalFullPath(
      stripPublicUsernamePrefix(localPublic)
    );

  let externalCanonical =
    "";

  try {
    externalCanonical =
      normalizeCanonicalPath(
        AppCore,
        path || "/"
      ) || "";
  } catch {}

  externalCanonical =
    externalCanonical
      ? normalizeLocalFullPath(
          stripPublicUsernamePrefix(externalCanonical)
        )
      : "";

  const localClean =
    stripSearchAndHash(localCanonical);

  const externalClean =
    stripSearchAndHash(externalCanonical);

  if (
    hasPublicUsernamePrefix(localPublic) &&
    (
      !externalClean ||
      externalClean === "/"
    ) &&
    localClean !== "/"
  ) {
    return localCanonical;
  }

  if (
    externalClean &&
    externalClean !== "/" &&
    !hasPublicUsernamePrefix(externalCanonical)
  ) {
    return externalCanonical;
  }

  return localCanonical || externalCanonical || "/";
}

function sameCanonicalRoute(AppCore, a = "/", b = "/") {
  return (
    stripSearchAndHash(
      safeCanonicalPath(AppCore, a || "/")
    ) ===
    stripSearchAndHash(
      safeCanonicalPath(AppCore, b || "/")
    )
  );
}

function getSafeSearchAndHash(AppCore, path = "") {
  try {
    return getSearchAndHash(path || "") || "";
  } catch {
    const normalized =
      normalizeLocalFullPath(path || "");

    const queryIndex =
      normalized.indexOf("?");

    const hashIndex =
      normalized.indexOf("#");

    if (
      queryIndex < 0 &&
      hashIndex < 0
    ) {
      return "";
    }

    if (queryIndex >= 0) {
      return normalized.slice(queryIndex);
    }

    return normalized.slice(hashIndex);
  }
}

function pathFromUrlLike(AppCore, value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return safeNormalizePublicPath(
      AppCore,
      normalizeHashRouterPath(raw)
    );
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return safeNormalizePublicPath(
        AppCore,
        normalizeHashRouterPath(parsed.hash)
      );
    }

    return safeNormalizePublicPath(
      AppCore,
      `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
    );
  } catch {
    return safeNormalizePublicPath(
      AppCore,
      raw.startsWith("/") ? raw : `/${raw}`
    );
  }
}

function buildCanonicalSourceWithSuffix(
  AppCore,
  canonicalPath = "/",
  requestedPath = "/"
) {
  const finalCanonical =
    safeCanonicalPath(
      AppCore,
      canonicalPath ||
        requestedPath ||
        "/"
    );

  const normalizedRequested =
    safeNormalizePublicPath(
      AppCore,
      requestedPath ||
        canonicalPath ||
        finalCanonical
    );

  const requestedSuffix =
    getSafeSearchAndHash(
      AppCore,
      normalizedRequested
    );

  const canonicalSuffix =
    getSafeSearchAndHash(
      AppCore,
      canonicalPath || ""
    );

  const suffix =
    requestedSuffix ||
    canonicalSuffix ||
    "";

  return safeCanonicalPath(
    AppCore,
    `${stripSearchAndHash(finalCanonical)}${suffix}`
  );
}

/* =========================================================
   SAFE OPS
========================================================= */

function safeEmit(AppCore, eventName, payload = {}, options = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const opts =
    safeObject(options);

  const finalPayload =
    opts.redact === true
      ? redactPayload(payload)
      : payload;

  let busAvailable =
    false;

  let busEmitted =
    false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable =
        true;

      AppCore.events.emit(
        name,
        finalPayload
      );

      busEmitted =
        true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            finalPayload,
        })
      );

      return true;
    } catch {}
  }

  return busEmitted;
}

function safeWarn(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      redactPayload(item)
    );

  try {
    AppCore?.utils?.warn?.(
      "[RouterRender]",
      ...safeArgs
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[RouterRender]",
        ...safeArgs
      );
    }
  } catch {}
}

function safeError(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      redactPayload(item)
    );

  try {
    AppCore?.utils?.error?.(
      "[RouterRender]",
      ...safeArgs
    );
  } catch {}

  try {
    console.error(
      "[RouterRender]",
      ...safeArgs
    );
  } catch {}
}

function safeLog(AppCore, ...args) {
  const safeArgs =
    args.map((item) =>
      redactPayload(item)
    );

  try {
    AppCore?.utils?.log?.(
      "[RouterRender]",
      ...safeArgs
    );
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
    },
    {
      redact:
        true,
    }
  );
}

/* =========================================================
   VIEW CONTAINER / HOST ISOLATION
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
    document.querySelector("[data-view-root]") ||
    document.querySelector("[data-view-container='true']") ||
    null;

  try {
    if (el && AppCore?.dom) {
      AppCore.dom.viewContainer =
        el;
    }
  } catch {}

  return el;
}

function setDataset(el, key, value) {
  if (
    !el ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
      return true;
    }

    el.dataset[key] =
      String(value);

    return true;
  } catch {
    return false;
  }
}

function createAbortControllerSafe() {
  try {
    if (typeof AbortController === "function") {
      return new AbortController();
    }
  } catch {}

  return null;
}

let successRenderSequence =
  0;

let activeRenderController =
  null;

let lastShellRepairEmitKey =
  "";

let lastShellRepairEmitAt =
  0;

function abortPreviousSuccessRender(reason = "new-render") {
  try {
    activeRenderController?.abort?.(reason);
  } catch {}

  activeRenderController =
    null;
}

function beginSuccessRender() {
  abortPreviousSuccessRender("superseded");

  const renderId =
    ++successRenderSequence;

  const controller =
    createAbortControllerSafe();

  activeRenderController =
    controller;

  return {
    renderId,
    controller,
    signal:
      controller?.signal || null,
  };
}

function isCurrentRender(AppCore, renderId, canonicalPath = "") {
  if (renderId !== successRenderSequence) {
    return false;
  }

  const view =
    getViewContainer(AppCore);

  if (!view) {
    return false;
  }

  const viewRenderId =
    safeText(
      view.dataset?.routerRenderId,
      ""
    );

  if (
    viewRenderId &&
    viewRenderId !== String(renderId)
  ) {
    return false;
  }

  const expectedCanonical =
    stripSearchAndHash(
      safeText(canonicalPath, "")
    );

  if (expectedCanonical) {
    const viewCanonical =
      stripSearchAndHash(
        safeText(
          view.dataset?.routerCanonicalPath,
          ""
        )
      );

    if (
      viewCanonical &&
      viewCanonical !== expectedCanonical
    ) {
      return false;
    }
  }

  return true;
}

function markViewContainer({
  AppCore,
  view,
  renderId,
  route = null,
  canonicalPath = "/",
  publicPath = "/",
  status = "pending",
} = {}) {
  if (!view) {
    return false;
  }

  setDataset(view, "routerRenderId", renderId);
  setDataset(view, "routerStatus", status);
  setDataset(view, "routerCanonicalPath", canonicalPath);
  setDataset(view, "routerPublicPath", publicPath);
  setDataset(view, "routerRoute", route?.path || canonicalPath || "/");
  setDataset(view, "routerRouteName", route?.name || "");
  setDataset(view, "routerViewKey", route?.viewKey || "");
  setDataset(view, "routerViewName", route?.viewName || "");

  try {
    view.classList.add("router-view-root");
    view.classList.toggle("is-rendering", status === "pending");
    view.classList.toggle("is-ready", status === "ready");
    view.classList.toggle("has-error", status === "error");
  } catch {}

  try {
    if (AppCore?.dom) {
      AppCore.dom.viewContainer =
        view;
    }
  } catch {}

  return true;
}

function markViewReady(AppCore, renderId, canonicalPath = "/") {
  if (
    renderId &&
    !isCurrentRender(AppCore, renderId, canonicalPath)
  ) {
    return false;
  }

  const view =
    getViewContainer(AppCore);

  if (!view) {
    return false;
  }

  setDataset(view, "routerStatus", "ready");

  try {
    view.classList.remove("is-rendering", "has-error");
    view.classList.add("is-ready");
  } catch {}

  return true;
}

function markViewError(AppCore, renderId, canonicalPath = "/") {
  if (
    renderId &&
    !isCurrentRender(AppCore, renderId, canonicalPath)
  ) {
    return false;
  }

  const view =
    getViewContainer(AppCore);

  if (!view) {
    return false;
  }

  setDataset(view, "routerStatus", "error");

  try {
    view.classList.remove("is-rendering", "is-ready");
    view.classList.add("has-error");
  } catch {}

  return true;
}

function prepareRenderHost({
  AppCore,
  route = null,
  renderId,
  canonicalPath = "/",
  publicPath = "/",
  mode = "success",
} = {}) {
  const view =
    getViewContainer(AppCore);

  if (!view) {
    return {
      view:
        null,
      host:
        null,
    };
  }

  markViewContainer({
    AppCore,
    view,
    renderId,
    route,
    canonicalPath,
    publicPath,
    status:
      "pending",
  });

  const host =
    document.createElement("div");

  host.className =
    RENDER_HOST_CLASS;

  host.setAttribute(RENDER_HOST_ATTR, "true");
  host.setAttribute("data-router-render-id", String(renderId));
  host.setAttribute("data-router-mode", mode);
  host.setAttribute("data-router-route", route?.path || canonicalPath || "/");
  host.setAttribute("data-router-route-name", route?.name || "");
  host.setAttribute("data-router-view-key", route?.viewKey || "");
  host.setAttribute("data-router-view-name", route?.viewName || "");
  host.setAttribute("data-router-canonical-path", canonicalPath);
  host.setAttribute("data-router-public-path", publicPath);

  try {
    view.replaceChildren(host);
  } catch {
    try {
      view.innerHTML = "";
      view.appendChild(host);
    } catch {}
  }

  try {
    if (AppCore?.dom) {
      AppCore.dom.viewContainer =
        view;
      AppCore.dom.routerViewHost =
        host;
      AppCore.dom.viewHost =
        host;
    }
  } catch {}

  return {
    view,
    host,
  };
}

function getCurrentRenderHost(AppCore) {
  const view =
    getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  try {
    return view.querySelector(`[${RENDER_HOST_ATTR}="true"]`);
  } catch {
    return null;
  }
}

function adoptRenderedResult(target, result) {
  if (!target) {
    return result || null;
  }

  if (
    result === null ||
    result === undefined
  ) {
    return result || null;
  }

  if (typeof result === "string") {
    try {
      target.innerHTML =
        result;
    } catch {}

    return target;
  }

  if (!isNode(result)) {
    return result;
  }

  if (result === target) {
    return result;
  }

  try {
    if (target.contains(result)) {
      return result;
    }
  } catch {}

  try {
    target.replaceChildren(result);
  } catch {
    try {
      target.innerHTML = "";
      target.appendChild(result);
    } catch {}
  }

  return result;
}

/* =========================================================
   URL CONTEXT HELPERS
========================================================= */

function getBrowserPublicPath(AppCore) {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return safeNormalizePublicPath(
        AppCore,
        normalizeHashRouterPath(hash)
      );
    }

    return safeNormalizePublicPath(
      AppCore,
      `${pathname}${search}${hash}`
    );
  } catch {
    return "";
  }
}

function getRouteConfigByPath(path = "") {
  const clean =
    stripSearchAndHash(path);

  return (
    PROTECTED_PUBLIC_TOKEN_ROUTES.find((item) => {
      return (
        clean === item.path ||
        clean.startsWith(`${item.path}/`)
      );
    }) || null
  );
}

function getRouteConfigFromUrl(AppCore, pathOrUrl = "") {
  const path =
    pathFromUrlLike(
      AppCore,
      pathOrUrl
    );

  const canonical =
    safeCanonicalPath(
      AppCore,
      path || "/"
    );

  return getRouteConfigByPath(canonical);
}

function isProtectedPublicTokenPath(AppCore, path = "") {
  return Boolean(
    getRouteConfigFromUrl(
      AppCore,
      path
    )
  );
}

function hasTokenInSearch(search = "", tokenNames = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return safeArray(tokenNames).some((name) => {
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
  const path =
    pathFromUrlLike(
      AppCore,
      pathOrUrl
    );

  if (!path) {
    return "";
  }

  const pathname =
    stripSearchAndHash(
      stripPublicUsernamePrefix(path)
    );

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    if (!pathname.startsWith(`${config.path}/`)) {
      continue;
    }

    const token =
      pathname
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
  const raw =
    safeText(pathOrUrl, "");

  if (!raw) {
    return false;
  }

  const config =
    getRouteConfigFromUrl(
      AppCore,
      raw
    );

  if (!config) {
    return false;
  }

  if (getPathToken(AppCore, raw)) {
    return true;
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    if (
      hasTokenInSearch(
        parsed.search,
        config.tokenNames
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      if (getPathToken(AppCore, hashPath)) {
        return true;
      }

      const hashParts =
        splitFullPath(hashPath);

      if (
        hasTokenInSearch(
          hashParts.search,
          config.tokenNames
        )
      ) {
        return true;
      }
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenNames
      );
    }

    return false;
  } catch {
    const parts =
      splitFullPath(raw);

    if (
      hasTokenInSearch(
        parts.search,
        config.tokenNames
      )
    ) {
      return true;
    }

    if (
      parts.hash &&
      parts.hash.includes("?")
    ) {
      const query =
        parts.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        config.tokenNames
      );
    }

    return false;
  }
}

function isTokenScrubbedForConfig(config = null) {
  if (
    !isBrowser() ||
    !config
  ) {
    return false;
  }

  const flags =
    Array.isArray(config.stateScrubFlags)
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
  if (
    !isBrowser() ||
    !config
  ) {
    return [];
  }

  const keys =
    Array.isArray(config.windowKeys)
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
  if (
    !isBrowser() ||
    !config ||
    !value
  ) {
    return false;
  }

  const keys =
    Array.isArray(config.windowKeys)
      ? config.windowKeys
      : [config.windowKey].filter(Boolean);

  let wrote =
    false;

  for (const key of keys) {
    try {
      if (!window[key]) {
        window[key] =
          value;
      }

      wrote =
        true;
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
    const href =
      window.location.href;

    if (!window.__ONION_INITIAL_URL__) {
      window.__ONION_INITIAL_URL__ =
        href;
    }

    const path =
      pathFromUrlLike(
        AppCore,
        href
      );

    for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
      const matchesRoute =
        sameCanonicalRoute(
          AppCore,
          path,
          config.path
        );

      if (
        matchesRoute &&
        hasProtectedToken(AppCore, href) &&
        getStoredInitialUrlsByConfig(config).length === 0
      ) {
        setStoredInitialUrlByConfig(
          config,
          href
        );
      }
    }

    return true;
  } catch {
    return false;
  }
}

function getProtectedPublicPath(AppCore) {
  captureInitialUrl(AppCore);

  const candidates =
    [];

  for (const config of PROTECTED_PUBLIC_TOKEN_ROUTES) {
    if (isTokenScrubbedForConfig(config)) {
      continue;
    }

    candidates.push(
      ...getStoredInitialUrlsByConfig(config)
    );
  }

  const initialUrl =
    getInitialUrl();

  if (initialUrl) {
    candidates.push(initialUrl);
  }

  const browserPath =
    getBrowserPublicPath(AppCore);

  if (browserPath) {
    candidates.push(browserPath);
  }

  for (const candidate of candidates) {
    const config =
      getRouteConfigFromUrl(
        AppCore,
        candidate
      );

    if (!config) {
      continue;
    }

    if (isTokenScrubbedForConfig(config)) {
      continue;
    }

    if (!hasProtectedToken(AppCore, candidate)) {
      continue;
    }

    return pathFromUrlLike(
      AppCore,
      candidate
    );
  }

  return "";
}

function preservePublicContextForSameRoute(AppCore, candidatePath = "/") {
  const candidate =
    safeNormalizePublicPath(
      AppCore,
      candidatePath || "/"
    );

  const protectedPath =
    getProtectedPublicPath(AppCore);

  if (
    protectedPath &&
    isProtectedPublicTokenPath(AppCore, candidate) &&
    sameCanonicalRoute(AppCore, protectedPath, candidate)
  ) {
    return protectedPath;
  }

  const browserPath =
    getBrowserPublicPath(AppCore);

  if (!browserPath) {
    return candidate;
  }

  const candidateSuffix =
    getSafeSearchAndHash(
      AppCore,
      candidate
    );

  const browserSuffix =
    getSafeSearchAndHash(
      AppCore,
      browserPath
    );

  if (
    browserSuffix &&
    !candidateSuffix &&
    sameCanonicalRoute(AppCore, browserPath, candidate)
  ) {
    return browserPath;
  }

  if (
    hasPublicUsernamePrefix(browserPath) &&
    !hasPublicUsernamePrefix(candidate) &&
    sameCanonicalRoute(AppCore, browserPath, candidate)
  ) {
    return browserPath;
  }

  return candidate;
}

function preferRequestedPublicPathIfCompatible(
  AppCore,
  requestedPath = "",
  builtPublicPath = "",
  canonicalPath = "/"
) {
  const requested =
    preservePublicContextForSameRoute(
      AppCore,
      requestedPath || ""
    );

  const built =
    preservePublicContextForSameRoute(
      AppCore,
      builtPublicPath || ""
    );

  const canonical =
    safeCanonicalPath(
      AppCore,
      canonicalPath ||
        built ||
        requested ||
        "/"
    );

  if (
    requested &&
    hasPublicUsernamePrefix(requested) &&
    sameCanonicalRoute(AppCore, requested, canonical)
  ) {
    return requested;
  }

  if (
    requested &&
    getSafeSearchAndHash(AppCore, requested) &&
    sameCanonicalRoute(AppCore, requested, canonical)
  ) {
    return requested;
  }

  if (
    built &&
    hasPublicUsernamePrefix(built) &&
    sameCanonicalRoute(AppCore, built, canonical)
  ) {
    return built;
  }

  return built || requested || canonical || "/";
}

/* =========================================================
   SHELL / AUTH-SCREEN REPAIR
========================================================= */

function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      html:
        null,
      body:
        null,
      shell:
        null,
      main:
        null,
      appContent:
        null,
      view:
        null,
      sidebar:
        null,
      topbar:
        null,
      tablehead:
        null,
      tableheadContainer:
        null,
      loader:
        null,
    };
  }

  const html =
    document.documentElement || null;

  const body =
    document.body || null;

  const shell =
    document.getElementById("app-shell") ||
    document.querySelector("[data-app-shell='true']") ||
    document.querySelector("[data-app-shell]") ||
    document.querySelector(".app-shell") ||
    document.querySelector(".layout") ||
    null;

  const main =
    document.getElementById("main-content") ||
    document.querySelector(".main-content") ||
    document.querySelector("main[role='main']") ||
    document.querySelector("main") ||
    null;

  const appContent =
    document.getElementById("app-content") ||
    document.querySelector("[data-app-content]") ||
    null;

  const view =
    getViewContainer(AppCore);

  const sidebar =
    AppCore?.dom?.sidebar ||
    document.querySelector("#app-sidebar") ||
    document.querySelector(".sidebar") ||
    document.querySelector("[data-sidebar-root]") ||
    null;

  const topbar =
    AppCore?.dom?.topbar ||
    document.querySelector("#app-topbar") ||
    document.querySelector(".topbar") ||
    document.querySelector("[data-topbar-root]") ||
    null;

  const tablehead =
    document.getElementById("table-head") ||
    document.querySelector(".table-head") ||
    null;

  const tableheadContainer =
    AppCore?.dom?.tableheadContainer ||
    document.getElementById("tablehead-container") ||
    document.querySelector("[data-tablehead-container]") ||
    null;

  const loader =
    AppCore?.dom?.loader ||
    document.getElementById("app-loader") ||
    document.querySelector(".app-loader") ||
    document.querySelector("[data-app-loader='true']") ||
    null;

  try {
    if (AppCore?.dom) {
      AppCore.dom.appShell =
        shell || AppCore.dom.appShell || null;

      AppCore.dom.mainContent =
        main || AppCore.dom.mainContent || null;

      AppCore.dom.appContent =
        appContent || AppCore.dom.appContent || null;

      AppCore.dom.viewContainer =
        view || AppCore.dom.viewContainer || null;

      AppCore.dom.sidebar =
        sidebar || AppCore.dom.sidebar || null;

      AppCore.dom.topbar =
        topbar || AppCore.dom.topbar || null;

      AppCore.dom.tableheadContainer =
        tableheadContainer || AppCore.dom.tableheadContainer || null;

      AppCore.dom.loader =
        loader || AppCore.dom.loader || null;
    }
  } catch {}

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
    el.hidden =
      Boolean(hidden);
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

function routeRequestsShellHidden(AppCore, route = null, canonicalPath = "/") {
  const canonical =
    stripSearchAndHash(
      safeCanonicalPath(
        AppCore,
        canonicalPath || route?.path || "/"
      )
    );

  if (
    route?.shell === false ||
    route?.hideShell === true ||
    route?.showShell === false ||
    route?.layout === "auth" ||
    route?.layout === "public" ||
    route?.meta?.shell === false ||
    route?.meta?.hideShell === true ||
    route?.meta?.showShell === false ||
    route?.meta?.layout === "auth" ||
    route?.meta?.layout === "public"
  ) {
    return true;
  }

  return AUTH_SCREEN_CANONICAL_PATHS.has(canonical);
}

function shouldUseAuthScreenClass(AppCore, route = null, canonicalPath = "/") {
  const canonical =
    stripSearchAndHash(
      safeCanonicalPath(
        AppCore,
        canonicalPath || route?.path || "/"
      )
    );

  if (
    route?.layout === "auth" ||
    route?.meta?.layout === "auth" ||
    route?.authScreen === true ||
    route?.meta?.authScreen === true
  ) {
    return true;
  }

  return AUTH_SCREEN_CANONICAL_PATHS.has(canonical);
}

function setCoreShellVisible(AppCore, visible = true) {
  const patch =
    {
      shellVisible:
        Boolean(visible),

      chromeVisible:
        Boolean(visible),

      appShellVisible:
        true,

      routeShellHidden:
        !Boolean(visible),

      authScreen:
        !Boolean(visible),
    };

  try {
    AppCore?.setState?.(patch);
  } catch {}

  try {
    if (AppCore?.state) {
      Object.assign(
        AppCore.state,
        patch
      );
    }
  } catch {}
}

function hideLoaderSafe(AppCore, reason = "router-render") {
  const {
    loader,
    body,
    html,
  } =
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
      "is-leaving",
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

    loader.dataset.loaderVisible =
      "false";

    loader.hidden =
      true;
  } catch {}

  safeEmit(
    AppCore,
    "app:loader:hidden",
    {
      reason,
      source:
        "router.render",
    }
  );

  return true;
}

function emitShellRepair(AppCore, payload = {}) {
  const key =
    [
      safeText(payload.phase, ""),
      payload.shellHidden ? "hidden" : "visible",
      safeText(payload.canonicalPath, ""),
      safeText(payload.publicPath, ""),
      payload.hasSidebar ? "sidebar" : "no-sidebar",
      payload.hasTopbar ? "topbar" : "no-topbar",
    ].join("|");

  const current =
    nowEpochMs();

  if (
    key === lastShellRepairEmitKey &&
    current - lastShellRepairEmitAt < SHELL_REPAIR_EMIT_DEDUPE_MS
  ) {
    return false;
  }

  lastShellRepairEmitKey =
    key;

  lastShellRepairEmitAt =
    current;

  return safeEmit(
    AppCore,
    "router:shell:repair",
    payload
  );
}

function applyRenderShellRepair({
  AppCore,
  route = null,
  canonicalPath = "/",
  publicPath = "/",
  phase = "render",
  hideLoader = false,
  emitRepair = true,
  emitUiRepairRequest = false,
} = {}) {
  if (!isBrowser()) {
    return {
      applied:
        false,
      shellHidden:
        false,
      reason:
        "not-browser",
    };
  }

  const canonical =
    stripSearchAndHash(
      safeCanonicalPath(
        AppCore,
        canonicalPath || route?.path || "/"
      )
    );

  const publicRoute =
    preservePublicContextForSameRoute(
      AppCore,
      safeNormalizePublicPath(
        AppCore,
        publicPath || canonical || "/"
      )
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
  } =
    getShellElements(AppCore);

  if (!html || !body) {
    return {
      applied:
        false,
      shellHidden,
      reason:
        "missing-document",
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

  setDataset(
    html,
    "routeMode",
    shellHidden ? "auth" : "app"
  );

  setDataset(
    body,
    "routeMode",
    shellHidden ? "auth" : "app"
  );

  setDataset(
    html,
    "chrome",
    shellHidden ? "hidden" : "visible"
  );

  setDataset(
    body,
    "chrome",
    shellHidden ? "hidden" : "visible"
  );

  if (shellHidden) {
    try {
      body.classList.add(
        "route-shell-hidden",
        "route-chrome-hidden",
        "route-auth"
      );

      body.classList.remove(
        "route-shell-visible",
        "route-chrome-visible",
        "route-app",
        "login-no-scroll",
        "sidebar-open",
        "sidebar-collapsed",
        "sidebar-transitioning",
        "sidebar-tooltips-active"
      );

      html.classList.add(
        "route-shell-hidden",
        "route-chrome-hidden",
        "route-auth"
      );

      html.classList.remove(
        "route-shell-visible",
        "route-chrome-visible",
        "route-app"
      );

      if (useAuthScreen) {
        body.classList.add("auth-screen");
      } else {
        body.classList.remove("auth-screen");
      }
    } catch {}

    setDataset(body, "shell", "visible");
    setDataset(html, "shell", "visible");
    setDataset(shell, "shell", "visible");
    setDataset(shell, "chrome", "hidden");
    setDataset(shell, "routeMode", "auth");

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
        "route-auth",
        "route-shell-hidden",
        "route-chrome-hidden"
      );

      body.classList.add(
        "route-app",
        "route-shell-visible",
        "route-chrome-visible"
      );

      html.classList.remove(
        "route-auth",
        "route-shell-hidden",
        "route-chrome-hidden"
      );

      html.classList.add(
        "route-app",
        "route-shell-visible",
        "route-chrome-visible"
      );
    } catch {}

    setDataset(body, "shell", "visible");
    setDataset(html, "shell", "visible");
    setDataset(shell, "shell", "visible");
    setDataset(shell, "chrome", "visible");
    setDataset(shell, "routeMode", "app");

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
          safeText(
            tableheadContainer.innerHTML,
            ""
          )
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
      shell?.setAttribute?.("aria-hidden", "false");
      main?.setAttribute?.("aria-hidden", "false");
      appContent?.setAttribute?.("aria-hidden", "false");
      view?.setAttribute?.("aria-hidden", "false");
    } catch {}
  }

  if (hideLoader || !shellHidden) {
    hideLoaderSafe(
      AppCore,
      `router-render:${phase}`
    );
  }

  const repairPayload =
    {
      phase,
      shellHidden,
      useAuthScreen,
      canonicalPath:
        canonical,
      publicPath:
        publicRoute,
      routePath:
        route?.path || null,
      routeName:
        route?.name || null,
      viewKey:
        route?.viewKey || null,
      viewName:
        route?.viewName || null,
      hasSidebar:
        Boolean(sidebar),
      hasTopbar:
        Boolean(topbar),
      hasShell:
        Boolean(shell),
      source:
        "router.render",
    };

  if (emitRepair !== false) {
    emitShellRepair(
      AppCore,
      repairPayload
    );
  }

  if (emitUiRepairRequest === true) {
    safeEmit(
      AppCore,
      "app:ui:repair-request",
      repairPayload
    );
  }

  return {
    applied:
      true,
    shellHidden,
    useAuthScreen,
    canonicalPath:
      canonical,
    publicPath:
      publicRoute,
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
    AppCore?.state?.user?.slug ||
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
    stripSearchAndHash(
      safeCanonicalPath(
        AppCore,
        sourceForPublic
      )
    );

  const normalizedRequested =
    safeNormalizePublicPath(
      AppCore,
      requestedPath ||
        sourceForPublic ||
        finalCanonical
    );

  const username =
    resolveUsernameForPayload(
      AppCore,
      requestedUsername,
      normalizedRequested || sourceForPublic
    );

  let built =
    "";

  try {
    built =
      buildPublicPath(
        AppCore,
        getRoute || (() => route),
        sourceForPublic,
        {
          username,
          resolvedUsername:
            username,
          fromPath:
            normalizedRequested || sourceForPublic,
          publicPath:
            normalizedRequested || sourceForPublic,
          canonicalPath:
            finalCanonical,
        }
      ) || "";
  } catch {
    built = "";
  }

  built =
    built
      ? safeNormalizePublicPath(AppCore, built)
      : "";

  const preferredPublic =
    preferRequestedPublicPathIfCompatible(
      AppCore,
      normalizedRequested,
      built ||
        sourceForPublic ||
        normalizedRequested ||
        finalCanonical,
      finalCanonical
    );

  const finalPublic =
    preservePublicContextForSameRoute(
      AppCore,
      preferredPublic ||
        built ||
        sourceForPublic ||
        normalizedRequested ||
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

function resolveRouteRenderer(route = null) {
  if (isFunction(route?.render)) {
    return {
      source:
        "route.render",
      render:
        route.render,
      thisArg:
        route,
    };
  }

  if (isFunction(route?.view)) {
    return {
      source:
        "route.view",
      render:
        route.view,
      thisArg:
        route,
    };
  }

  if (isFunction(route?.component)) {
    return {
      source:
        "route.component",
      render:
        route.component,
      thisArg:
        route,
    };
  }

  if (isFunction(route?.handler)) {
    return {
      source:
        "route.handler",
      render:
        route.handler,
      thisArg:
        route,
    };
  }

  if (isFunction(route?.component?.render)) {
    return {
      source:
        "route.component.render",
      render:
        route.component.render,
      thisArg:
        route.component,
    };
  }

  if (isFunction(route?.view?.render)) {
    return {
      source:
        "route.view.render",
      render:
        route.view.render,
      thisArg:
        route.view,
    };
  }

  if (isFunction(route?.adapter?.render)) {
    return {
      source:
        "route.adapter.render",
      render:
        route.adapter.render,
      thisArg:
        route.adapter,
    };
  }

  return {
    source:
      "",
    render:
      null,
    thisArg:
      null,
  };
}

/* =========================================================
   PAYLOADS
========================================================= */

export function buildRenderPayload({
  AppCore = null,

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
  renderId = null,

  flow = "",
  status = "",
} = {}) {
  const routePathRaw =
    route?.path || null;

  const rawRequestedPath =
    safeText(
      firstResolved(
        requestedPath,
        path,
        publicPath,
        canonicalPath,
        routePathRaw,
        getBrowserPublicPath(AppCore),
        AppCore?.state?.publicPath,
        AppCore?.state?.route,
        "/"
      ),
      "/"
    );

  const canonicalInput =
    safeText(
      firstResolved(
        canonicalPath,
        routePathRaw,
        rawRequestedPath,
        "/"
      ),
      "/"
    );

  const canonicalWithSuffix =
    buildCanonicalSourceWithSuffix(
      AppCore,
      canonicalInput,
      rawRequestedPath
    );

  const finalCanonicalPath =
    stripSearchAndHash(
      safeCanonicalPath(
        AppCore,
        canonicalWithSuffix || canonicalInput || "/"
      )
    );

  const publicInput =
    safeText(
      firstResolved(
        publicPath,
        path,
        requestedPath,
        rawRequestedPath,
        canonicalWithSuffix,
        finalCanonicalPath,
        "/"
      ),
      "/"
    );

  const normalizedPublicPath =
    safeNormalizePublicPath(
      AppCore,
      publicInput
    );

  const preferredPublicPath =
    preferRequestedPublicPathIfCompatible(
      AppCore,
      rawRequestedPath,
      normalizedPublicPath ||
        canonicalWithSuffix ||
        finalCanonicalPath,
      finalCanonicalPath
    );

  const finalPublicPath =
    preservePublicContextForSameRoute(
      AppCore,
      preferredPublicPath ||
        normalizedPublicPath ||
        finalCanonicalPath ||
        "/"
    );

  const finalUsername =
    safeText(username, "") ||
    resolveUsernameForPayload(
      AppCore,
      null,
      finalPublicPath
    ) ||
    null;

  const finalRoutePath =
    routePathRaw
      ? stripSearchAndHash(
          safeCanonicalPath(
            AppCore,
            routePathRaw
          )
        )
      : finalCanonicalPath;

  return {
    path:
      finalPublicPath,

    requestedPath:
      rawRequestedPath,

    canonicalPath:
      finalCanonicalPath,

    publicPath:
      finalPublicPath,

    username:
      finalUsername,

    route:
      route || null,

    routePath:
      finalRoutePath,

    routeName:
      route?.name || null,

    viewKey:
      route?.viewKey || null,

    viewName:
      route?.viewName || null,

    found:
      Boolean(found),

    forbidden:
      Boolean(forbidden),

    redirectedFrom:
      redirectedFrom || null,

    options:
      options || null,

    renderId:
      renderId || null,

    flow:
      safeText(flow, "") || null,

    status:
      safeText(status, "") || null,

    ts:
      Date.now(),
  };
}

export function emitBeforeRender(AppCore, payload = {}) {
  const finalPayload =
    buildRenderPayload({
      AppCore,
      ...safeObject(payload),
      flow:
        payload?.flow || "before-render",
    });

  safeEmit(
    AppCore,
    "router:before-render",
    finalPayload,
    {
      redact:
        true,
    }
  );

  return finalPayload;
}

export function emitRendered(AppCore, payload = {}) {
  const finalPayload =
    buildRenderPayload({
      AppCore,
      ...safeObject(payload),
      flow:
        payload?.flow || "rendered",
    });

  safeEmit(
    AppCore,
    "router:rendered",
    finalPayload,
    {
      redact:
        true,
    }
  );

  return finalPayload;
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
    stripSearchAndHash(
      safeCanonicalPath(
        AppCore,
        canonicalPath || "/"
      )
    );

  const candidatePublic =
    safeNormalizePublicPath(
      AppCore,
      publicPath || finalCanonical
    );

  const finalPublic =
    preservePublicContextForSameRoute(
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
      canonicalPath:
        finalCanonical,
      publicPath:
        finalPublic,
      currentResolvedUsername:
        username,
    });
  } catch {}

  try {
    if (AppCore?.state) {
      AppCore.state.route =
        finalCanonical;

      AppCore.state.canonicalPath =
        finalCanonical;

      AppCore.state.publicPath =
        finalPublic;

      AppCore.state.currentResolvedUsername =
        username;
    }
  } catch {}

  return {
    canonicalPath:
      finalCanonical,
    publicPath:
      finalPublic,
    username,
  };
}

function syncRouteStateFromPayload(AppCore, payload = {}) {
  const normalized =
    buildRenderPayload({
      AppCore,
      ...safeObject(payload),
    });

  const synced =
    syncRouteState(
      AppCore,
      normalized.canonicalPath,
      normalized.publicPath
    );

  return buildRenderPayload({
    AppCore,
    ...normalized,

    path:
      synced.publicPath,

    canonicalPath:
      synced.canonicalPath,

    publicPath:
      synced.publicPath,

    username:
      synced.username ||
      normalized.username,
  });
}

function commitRouteStateOnly(AppCore, payload = {}) {
  return syncRouteStateFromPayload(
    AppCore,
    payload
  );
}

export function applyResolvedRouteState(
  AppCore,
  canonicalPath,
  fallbackPublicPath
) {
  const protectedPublicPath =
    getProtectedPublicPath(AppCore);

  const resolvedFallback =
    getResolvedPublicPath(fallbackPublicPath) ||
    fallbackPublicPath ||
    canonicalPath ||
    "/";

  const publicPath =
    protectedPublicPath ||
    preservePublicContextForSameRoute(
      AppCore,
      resolvedFallback
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
  renderId = null,
  signal = null,
  renderRoot = null,
  viewContainer = null,
} = {}) {
  const finalPublicPath =
    preservePublicContextForSameRoute(
      AppCore,
      publicPath ||
        requestedPath ||
        canonicalPath ||
        "/"
    );

  const finalCanonicalPath =
    stripSearchAndHash(
      safeCanonicalPath(
        AppCore,
        canonicalPath ||
          finalPublicPath
      )
    );

  const username =
    resolveUsernameForPayload(
      AppCore,
      requestedUsername,
      finalPublicPath
    );

  const rootView =
    viewContainer ||
    getViewContainer(AppCore);

  const host =
    renderRoot ||
    getCurrentRenderHost(AppCore) ||
    rootView;

  return Object.freeze({
    AppCore,
    route,

    path:
      finalPublicPath,
    requestedPath:
      finalPublicPath,
    canonicalPath:
      finalCanonicalPath,
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

    renderId,
    signal,

    viewContainer:
      rootView,
    renderRoot:
      host,
    renderHost:
      host,

    routePath:
      route?.path || finalCanonicalPath,
    routeName:
      route?.name || null,
    viewKey:
      route?.viewKey || null,
    viewName:
      route?.viewName || null,

    isStale: () =>
      renderId
        ? !isCurrentRender(AppCore, renderId, finalCanonicalPath)
        : false,

    isCurrent: () =>
      renderId
        ? isCurrentRender(AppCore, renderId, finalCanonicalPath)
        : true,
  });
}

/* =========================================================
   ROUTE EXECUTION
========================================================= */

function runRouteRender(
  AppCore,
  route,
  renderTarget,
  context
) {
  if (!renderTarget) {
    safeWarn(
      AppCore,
      "viewContainer/renderRoot ausente."
    );

    return null;
  }

  const renderer =
    resolveRouteRenderer(route);

  if (!isFunction(renderer.render)) {
    safeWarn(
      AppCore,
      "ruta sin render compatible:",
      route?.path
    );

    return null;
  }

  try {
    if (renderer.render.length >= 2) {
      return renderer.render.call(
        renderer.thisArg || route,
        renderTarget,
        {
          ...context,
          rendererSource:
            renderer.source,
        }
      );
    }

    if (renderer.render.length === 1) {
      return renderer.render.call(
        renderer.thisArg || route,
        {
          ...context,
          rendererSource:
            renderer.source,
        }
      );
    }

    return renderer.render.call(
      renderer.thisArg || route,
      renderTarget,
      {
        ...context,
        rendererSource:
          renderer.source,
      }
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

function createDeferredViewInstance({
  AppCore,
  renderId,
  canonicalPath,
} = {}) {
  let current =
    null;

  let destroyed =
    false;

  return {
    set(view) {
      current =
        view || null;

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
      destroyed =
        true;

      if (
        current &&
        typeof current.destroy === "function"
      ) {
        try {
          current.destroy();
        } catch {}
      }

      current =
        null;

      if (
        renderId &&
        isCurrentRender(AppCore, renderId, canonicalPath)
      ) {
        abortPreviousSuccessRender("view-destroyed");
      }
    },

    get current() {
      return current;
    },
  };
}

/* =========================================================
   INTERNAL VIEWS
========================================================= */

function getInternalViewTarget(AppCore, target = null) {
  return (
    target ||
    getCurrentRenderHost(AppCore) ||
    getViewContainer(AppCore)
  );
}

export function renderGenericView(AppCore, route, target = null) {
  const view =
    getInternalViewTarget(
      AppCore,
      target
    );

  if (!view) {
    return null;
  }

  const canonical =
    AppCore?.state?.route ||
    route?.path ||
    "/";

  const publicPath =
    getCurrentPublicPath(AppCore);

  const username =
    getCurrentResolvedUsername(AppCore);

  view.innerHTML =
    `
<section class="content-wrapper ${RENDER_FALLBACK_CLASS}">
  <div class="panel-block" style="padding:24px;">
    <div style="display:grid;gap:14px;">
      <h2 style="margin:0;">${escapeHtml(AppCore, route?.title || "Vista")}</h2>
      <p style="margin:0;color:var(--text-dim);">
        Vista conectada al router.
      </p>
      <div><strong>Canonical:</strong> ${escapeHtml(AppCore, canonical)}</div>
      <div><strong>Public:</strong> ${escapeHtml(AppCore, redactTokenInText(publicPath))}</div>
      <div><strong>User:</strong> ${escapeHtml(AppCore, username || "—")}</div>
    </div>
  </div>
</section>`;

  return view;
}

export function renderForbiddenView(AppCore, getRoute) {
  const view =
    getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  const href =
    getDefaultHomeTarget(
      AppCore,
      getRoute
    );

  view.innerHTML =
    `
<section class="content-wrapper ${RENDER_FALLBACK_CLASS}">
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
  const view =
    getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  const href =
    getDefaultHomeTarget(
      AppCore,
      getRoute
    );

  view.innerHTML =
    `
<section class="content-wrapper ${RENDER_FALLBACK_CLASS}">
  <div class="panel-block" style="padding:24px;">
    <h2 style="margin:0 0 12px 0;">404</h2>
    <p style="margin:0 0 14px 0;color:var(--text-dim);">
      Ruta no encontrada:
      ${escapeHtml(AppCore, redactTokenInText(requestedPath))}
    </p>
    <a href="${escapeHtml(AppCore, href)}" data-spa>Inicio</a>
  </div>
</section>`;

  return view;
}

export function renderRuntimeErrorView(AppCore, error, getRoute) {
  const view =
    getViewContainer(AppCore);

  if (!view) {
    return null;
  }

  const href =
    getDefaultHomeTarget(
      AppCore,
      getRoute
    );

  view.innerHTML =
    `
<section class="content-wrapper ${RENDER_FALLBACK_CLASS}">
  <div class="panel-block" style="padding:24px;">
    <h2 style="margin:0 0 12px 0;">Error de navegación</h2>
    <p style="margin:0 0 14px 0;color:var(--text-dim);">
      ${escapeHtml(AppCore, redactTokenInText(error?.message || "Error inesperado"))}
    </p>
    <a href="${escapeHtml(AppCore, href)}" data-spa>Recuperar</a>
  </div>
</section>`;

  return view;
}

/* =========================================================
   SUCCESS RENDER CONTROL
========================================================= */

function shouldAwaitRouteRender(AppCore, route = null) {
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
  route = null,
  target = null
) {
  const view =
    target ||
    getCurrentRenderHost(AppCore) ||
    getViewContainer(AppCore);

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

  view.innerHTML =
    `
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
  if (
    renderId &&
    !isCurrentRender(
      AppCore,
      renderId,
      canonicalPath
    )
  ) {
    return;
  }

  safeError(
    AppCore,
    "async route render error",
    error
  );

  safeEmit(
    AppCore,
    "router:render:error",
    {
      error,
      message:
        safeText(
          error?.message,
          "Error de navegación"
        ),
      route:
        route || null,
      routePath:
        route?.path || null,
      routeName:
        route?.name || null,
      viewKey:
        route?.viewKey || null,
      viewName:
        route?.viewName || null,
      requestedPath,
      canonicalPath,
      publicPath,
      username:
        requestedUsername || null,
      renderId,
      ts:
        Date.now(),
    },
    {
      redact:
        true,
    }
  );

  markViewError(
    AppCore,
    renderId,
    canonicalPath
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
    phase:
      "async-error",
    hideLoader:
      true,
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
  const startedAt =
    nowMs();

  const {
    renderId,
    signal,
  } =
    beginSuccessRender();

  const resolvedRaw =
    resolvePublicPathForRoute({
      AppCore,
      getRoute,
      route,
      canonicalPath,
      requestedPath,
      requestedUsername,
    });

  /*
    FIX CRÍTICO:
    Commit real ANTES de pintar vista.
    Esto corrige sidebar/topbar activos en ruta anterior.
    No emitimos router:rendered aquí porque src/router/index.js ya emite el evento final.
  */
  const lifecycleState =
    commitRouteStateOnly(
      AppCore,
      {
        path:
          resolvedRaw.publicPath,

        requestedPath:
          requestedPath ||
          resolvedRaw.publicPath,

        canonicalPath:
          resolvedRaw.canonicalPath,

        publicPath:
          resolvedRaw.publicPath,

        username:
          resolvedRaw.username,

        route,
        found:
          true,
        forbidden:
          false,
        renderId,

        flow:
          "success",

        status:
          "state-committed",

        options: {
          requestedUsername:
            requestedUsername || null,
        },
      }
    );

  const resolved =
    {
      canonicalPath:
        lifecycleState.canonicalPath,

      publicPath:
        lifecycleState.publicPath,

      username:
        lifecycleState.username ||
        resolvedRaw.username ||
        null,
    };

  safeEmit(
    AppCore,
    "router:render:state-committed",
    {
      path:
        resolved.publicPath,
      requestedPath:
        requestedPath || resolved.publicPath,
      canonicalPath:
        resolved.canonicalPath,
      publicPath:
        resolved.publicPath,
      username:
        resolved.username,
      route:
        route || null,
      routePath:
        route?.path || null,
      routeName:
        route?.name || null,
      viewKey:
        route?.viewKey || null,
      viewName:
        route?.viewName || null,
      renderId,
      source:
        "router.render",
    },
    {
      redact:
        true,
    }
  );

  applyRenderShellRepair({
    AppCore,
    route,
    canonicalPath:
      resolved.canonicalPath,
    publicPath:
      resolved.publicPath,
    phase:
      "before-success-render",
    hideLoader:
      false,
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

  const {
    view,
    host,
  } =
    prepareRenderHost({
      AppCore,
      route,
      renderId,
      canonicalPath:
        resolved.canonicalPath,
      publicPath:
        resolved.publicPath,
      mode:
        "success",
    });

  const ctx =
    buildRouteRenderContext({
      AppCore,
      route,

      requestedPath:
        resolved.publicPath,

      canonicalPath:
        resolved.canonicalPath,

      requestedUsername:
        resolved.username,

      publicPath:
        resolved.publicPath,

      renderId,
      signal,

      viewContainer:
        view,

      renderRoot:
        host,
    });

  const shouldBlock =
    shouldAwaitRouteRender(
      AppCore,
      route
    );

  let viewInstance =
    null;

  const renderer =
    resolveRouteRenderer(route);

  let asyncDispatched =
    false;

  if (isFunction(renderer.render)) {
    const transitionView =
      shouldBlock
        ? null
        : renderRouteTransitionView(
            AppCore,
            route,
            host
          );

    const result =
      runRouteRender(
        AppCore,
        route,
        host || ctx.viewContainer,
        ctx
      );

    if (shouldBlock) {
      viewInstance =
        await Promise.resolve(result);

      if (
        !isCurrentRender(
          AppCore,
          renderId,
          resolved.canonicalPath
        )
      ) {
        try {
          viewInstance?.destroy?.();
        } catch {}

        return null;
      }

      adoptRenderedResult(
        host || ctx.viewContainer,
        viewInstance
      );

      markViewReady(
        AppCore,
        renderId,
        resolved.canonicalPath
      );

      applyRenderShellRepair({
        AppCore,
        route,
        canonicalPath:
          resolved.canonicalPath,
        publicPath:
          resolved.publicPath,
        phase:
          "after-blocking-render",
        hideLoader:
          true,
      });
    } else if (isPromiseLike(result)) {
      asyncDispatched =
        true;

      const deferredView =
        createDeferredViewInstance({
          AppCore,
          renderId,
          canonicalPath:
            resolved.canonicalPath,
        });

      result
        .then((resolvedView) => {
          if (
            !isCurrentRender(
              AppCore,
              renderId,
              resolved.canonicalPath
            )
          ) {
            try {
              resolvedView?.destroy?.();
            } catch {}

            return;
          }

          deferredView.set(
            resolvedView
          );

          adoptRenderedResult(
            host || ctx.viewContainer,
            resolvedView
          );

          markViewReady(
            AppCore,
            renderId,
            resolved.canonicalPath
          );

          applyRenderShellRepair({
            AppCore,
            route,
            canonicalPath:
              resolved.canonicalPath,
            publicPath:
              resolved.publicPath,
            phase:
              "async-complete",
            hideLoader:
              true,
          });

          afterPaint(() => {
            if (
              !isCurrentRender(
                AppCore,
                renderId,
                resolved.canonicalPath
              )
            ) {
              return;
            }

            applyRenderShellRepair({
              AppCore,
              route,
              canonicalPath:
                resolved.canonicalPath,
              publicPath:
                resolved.publicPath,
              phase:
                "async-complete-after-paint",
              hideLoader:
                true,
            });
          });

          safeEmit(
            AppCore,
            "router:render:async-complete",
            {
              path:
                resolved.publicPath,

              requestedPath:
                requestedPath ||
                resolved.publicPath,

              route:
                route?.path || null,

              routePath:
                route?.path || null,

              routeName:
                route?.name || null,

              viewKey:
                route?.viewKey || null,

              viewName:
                route?.viewName || null,

              canonicalPath:
                resolved.canonicalPath,

              publicPath:
                resolved.publicPath,

              username:
                resolved.username,

              hasView:
                Boolean(resolvedView),

              renderId,

              durationMs:
                Math.round(
                  nowMs() - startedAt
                ),
            },
            {
              redact:
                true,
            }
          );
        })
        .catch((error) => {
          handleAsyncRouteRenderFailure({
            AppCore,
            error,
            route,
            requestedPath:
              requestedPath ||
              resolved.publicPath,
            canonicalPath:
              resolved.canonicalPath,
            publicPath:
              resolved.publicPath,
            requestedUsername:
              resolved.username,
            getRoute,
            renderId,
          });
        });

      viewInstance =
        deferredView ||
        transitionView ||
        host ||
        ctx.viewContainer ||
        null;

      microtask(() => {
        if (
          !isCurrentRender(
            AppCore,
            renderId,
            resolved.canonicalPath
          )
        ) {
          return;
        }

        applyRenderShellRepair({
          AppCore,
          route,
          canonicalPath:
            resolved.canonicalPath,
          publicPath:
            resolved.publicPath,
          phase:
            "after-non-blocking-dispatch",
          hideLoader:
            true,
        });
      });
    } else {
      viewInstance =
        result ||
        transitionView ||
        host ||
        ctx.viewContainer ||
        null;

      if (
        !isCurrentRender(
          AppCore,
          renderId,
          resolved.canonicalPath
        )
      ) {
        try {
          viewInstance?.destroy?.();
        } catch {}

        return null;
      }

      adoptRenderedResult(
        host || ctx.viewContainer,
        viewInstance
      );

      markViewReady(
        AppCore,
        renderId,
        resolved.canonicalPath
      );

      applyRenderShellRepair({
        AppCore,
        route,
        canonicalPath:
          resolved.canonicalPath,
        publicPath:
          resolved.publicPath,
        phase:
          "after-sync-render",
        hideLoader:
          true,
      });
    }
  } else {
    viewInstance =
      renderGenericView(
        AppCore,
        route,
        host || ctx.viewContainer
      );

    markViewReady(
      AppCore,
      renderId,
      resolved.canonicalPath
    );

    applyRenderShellRepair({
      AppCore,
      route,
      canonicalPath:
        resolved.canonicalPath,
      publicPath:
        resolved.publicPath,
      phase:
        "after-generic-render",
      hideLoader:
        true,
    });
  }

  afterPaint(() => {
    if (
      !isCurrentRender(
        AppCore,
        renderId,
        resolved.canonicalPath
      )
    ) {
      return;
    }

    applyRenderShellRepair({
      AppCore,
      route,
      canonicalPath:
        resolved.canonicalPath,
      publicPath:
        resolved.publicPath,
      phase:
        "success-after-paint",
      hideLoader:
        true,
    });
  });

  emitFlowMetric(
    AppCore,
    "success",
    {
      path:
        resolved.publicPath,

      requestedPath:
        requestedPath ||
        resolved.publicPath,

      route:
        route?.path || null,

      routeName:
        route?.name || null,

      viewKey:
        route?.viewKey || null,

      viewName:
        route?.viewName || null,

      canonicalPath:
        resolved.canonicalPath,

      publicPath:
        resolved.publicPath,

      username:
        resolved.username,

      renderMode:
        shouldBlock ? "blocking" : "non-blocking",

      rendererSource:
        renderer.source || null,

      asyncDispatched:
        Boolean(asyncDispatched),

      renderId,

      durationMs:
        Math.round(
          nowMs() - startedAt
        ),
    }
  );

  safeLog(
    AppCore,
    "success",
    {
      route:
        route?.path || null,

      routeName:
        route?.name || null,

      viewKey:
        route?.viewKey || null,

      viewName:
        route?.viewName || null,

      canonicalPath:
        resolved.canonicalPath,

      publicPath:
        resolved.publicPath,

      username:
        resolved.username,

      renderMode:
        shouldBlock ? "blocking" : "non-blocking",

      rendererSource:
        renderer.source || null,

      asyncDispatched:
        Boolean(asyncDispatched),

      renderId,
    }
  );

  return viewInstance || null;
}

export function renderRouteForbidden(args = {}) {
  const startedAt =
    nowMs();

  abortPreviousSuccessRender("forbidden");

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
    AppCore:
      args.AppCore,
    route:
      args.route || null,
    canonicalPath:
      args.canonicalPath || args.requestedPath || "/",
    publicPath:
      args.requestedPath || args.canonicalPath || "/",
    phase:
      "forbidden",
    hideLoader:
      true,
  });

  emitFlowMetric(
    args.AppCore,
    "forbidden",
    {
      canonicalPath:
        args.canonicalPath || args.requestedPath || "/",
      publicPath:
        args.requestedPath || args.canonicalPath || "/",
      durationMs:
        Math.round(
          nowMs() - startedAt
        ),
    }
  );

  return null;
}

export function renderRouteNotFound(args = {}) {
  const startedAt =
    nowMs();

  abortPreviousSuccessRender("not-found");

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
    AppCore:
      args.AppCore,
    route:
      args.route || null,
    canonicalPath:
      args.canonicalPath || args.requestedPath || "/",
    publicPath:
      args.requestedPath || args.canonicalPath || "/",
    phase:
      "not-found",
    hideLoader:
      true,
  });

  emitFlowMetric(
    args.AppCore,
    "not-found",
    {
      canonicalPath:
        args.canonicalPath || args.requestedPath || "/",
      publicPath:
        args.requestedPath || args.canonicalPath || "/",
      durationMs:
        Math.round(
          nowMs() - startedAt
        ),
    }
  );

  return null;
}

export async function renderLoginRedirect(args = {}) {
  const startedAt =
    nowMs();

  abortPreviousSuccessRender("login-redirect");

  const routeNames =
    getRouteNames(args.AppCore);

  const loginUrl =
    safeText(args.redirectTo, "") ||
    buildLoginUrl(
      args.AppCore,
      args.requestedPath ||
        args.publicPath ||
        args.canonicalPath
    );

  const route =
    args.getRoute?.(
      routeNames.LOGIN
    );

  const publicPath =
    safeNormalizePublicPath(
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
      AppCore:
        args.AppCore,
      getRoute:
        args.getRoute,
      pathname:
        publicPath,
      options: {
        replaceState:
          true,
        redirectedFrom:
          args.publicPath ||
          args.requestedPath ||
          args.canonicalPath ||
          null,
        source:
          "guard:not-authenticated",
      },
    }
  );

  syncRouteState(
    args.AppCore,
    routeNames.LOGIN,
    publicPath
  );

  applyRenderShellRepair({
    AppCore:
      args.AppCore,
    route,
    canonicalPath:
      routeNames.LOGIN,
    publicPath,
    phase:
      "login-redirect-before-render",
    hideLoader:
      false,
  });

  const renderId =
    ++successRenderSequence;

  /*
    No emitimos router:rendered aquí.
    router/index.js emite el evento final del flujo guard:not-authenticated.
  */
  safeEmit(
    args.AppCore,
    "router:render:login-state-committed",
    {
      path:
        publicPath,
      requestedPath:
        publicPath,
      canonicalPath:
        routeNames.LOGIN,
      publicPath,
      route,
      found:
        Boolean(route),
      forbidden:
        false,
      redirectedFrom:
        args.publicPath ||
        args.requestedPath ||
        args.canonicalPath ||
        null,
      renderId,
      source:
        "router.render",
    },
    {
      redact:
        true,
    }
  );

  const {
    view,
    host,
  } =
    prepareRenderHost({
      AppCore:
        args.AppCore,
      route,
      renderId,
      canonicalPath:
        routeNames.LOGIN,
      publicPath,
      mode:
        "login",
    });

  const ctx =
    buildRouteRenderContext({
      AppCore:
        args.AppCore,
      route,
      requestedPath:
        publicPath,
      canonicalPath:
        routeNames.LOGIN,
      publicPath,
      redirectedFrom:
        args.publicPath ||
        args.requestedPath ||
        args.canonicalPath ||
        null,
      renderId,
      viewContainer:
        view,
      renderRoot:
        host,
    });

  const renderer =
    resolveRouteRenderer(route);

  if (isFunction(renderer.render)) {
    const result =
      runRouteRender(
        args.AppCore,
        route,
        host || getViewContainer(args.AppCore),
        ctx
      );

    const resolvedResult =
      await Promise.resolve(result);

    if (
      isCurrentRender(
        args.AppCore,
        renderId,
        routeNames.LOGIN
      )
    ) {
      adoptRenderedResult(
        host || getViewContainer(args.AppCore),
        resolvedResult
      );
    }
  } else if (host) {
    renderGenericView(
      args.AppCore,
      route,
      host
    );
  }

  applyRenderShellRepair({
    AppCore:
      args.AppCore,
    route,
    canonicalPath:
      routeNames.LOGIN,
    publicPath,
    phase:
      "login-redirect-after-render",
    hideLoader:
      true,
  });

  markViewReady(
    args.AppCore,
    renderId,
    routeNames.LOGIN
  );

  emitFlowMetric(
    args.AppCore,
    "login-redirect",
    {
      renderId,
      durationMs:
        Math.round(
          nowMs() - startedAt
        ),
    }
  );

  return null;
}

export function renderRouteRuntimeError(args = {}) {
  const startedAt =
    nowMs();

  abortPreviousSuccessRender("runtime-error");

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
    AppCore:
      args.AppCore,
    route:
      args.route || null,
    canonicalPath:
      args.canonicalPath || args.requestedPath || "/",
    publicPath:
      args.requestedPath || args.canonicalPath || "/",
    phase:
      "runtime-error",
    hideLoader:
      true,
  });

  emitFlowMetric(
    args.AppCore,
    "runtime-error",
    {
      error:
        safeText(args.error?.message),
      durationMs:
        Math.round(
          nowMs() - startedAt
        ),
    }
  );

  safeError(
    args.AppCore,
    "runtime-error",
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
    appContent,
    view,
    sidebar,
    topbar,
    tablehead,
    loader,
  } =
    getShellElements(AppCore);

  const host =
    getCurrentRenderHost(AppCore);

  const browserPublicPath =
    getBrowserPublicPath(AppCore);

  return redactPayload({
    browserPublicPath,

    browserCanonicalPath:
      safeCanonicalPath(
        AppCore,
        browserPublicPath || "/"
      ),

    currentPublicPath:
      getCurrentPublicPath(AppCore),

    currentCanonicalPath:
      safeCanonicalPath(
        AppCore,
        AppCore?.state?.route || browserPublicPath || "/"
      ),

    protectedPublicPath:
      getProtectedPublicPath(AppCore),

    initialUrl:
      getInitialUrl(),

    activationInitialUrl:
      getActivationInitialUrl(),

    resetConfirmInitialUrl:
      getResetConfirmInitialUrl(),

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

    activeRenderAborted:
      Boolean(activeRenderController?.signal?.aborted),

    lastShellRepairEmitKey,
    lastShellRepairEmitAt,

    dom: {
      bodyClasses:
        body?.className || "",

      htmlClasses:
        html?.className || "",

      bodyShell:
        body?.dataset?.shell || null,

      htmlShell:
        html?.dataset?.shell || null,

      bodyChrome:
        body?.dataset?.chrome || null,

      htmlChrome:
        html?.dataset?.chrome || null,

      bodyRouteMode:
        body?.dataset?.routeMode || null,

      htmlRouteMode:
        html?.dataset?.routeMode || null,

      hasShell:
        Boolean(shell),

      hasMain:
        Boolean(main),

      hasAppContent:
        Boolean(appContent),

      hasView:
        Boolean(view),

      hasRenderHost:
        Boolean(host),

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

      viewRenderId:
        view?.dataset?.routerRenderId || null,

      viewStatus:
        view?.dataset?.routerStatus || null,

      viewCanonicalPath:
        view?.dataset?.routerCanonicalPath || null,

      viewPublicPath:
        view?.dataset?.routerPublicPath || null,

      viewRoute:
        view?.dataset?.routerRoute || null,

      viewRouteName:
        view?.dataset?.routerRouteName || null,

      viewKey:
        view?.dataset?.routerViewKey || null,

      viewName:
        view?.dataset?.routerViewName || null,

      hostRenderId:
        host?.getAttribute?.("data-router-render-id") || null,

      hostCanonicalPath:
        host?.getAttribute?.("data-router-canonical-path") || null,

      hostPublicPath:
        host?.getAttribute?.("data-router-public-path") || null,

      hostRoute:
        host?.getAttribute?.("data-router-route") || null,

      hostRouteName:
        host?.getAttribute?.("data-router-route-name") || null,

      hostViewKey:
        host?.getAttribute?.("data-router-view-key") || null,

      hostViewName:
        host?.getAttribute?.("data-router-view-name") || null,
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
