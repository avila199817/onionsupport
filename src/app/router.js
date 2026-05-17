/* =========================================================
   Onion SPA - App Router Bootstrap
   Archivo: src/app/router.js

   APP ROUTER · SIMPLE WRAPPER
   - adaptador fino sobre Router real
   - configura Router una vez
   - bindea Router una vez
   - render inicial serializado
   - preserva publicPath y rutas técnicas con token
   - sin Auth real, guards, history, fetch, storage ni Toast propios
========================================================= */

import { AppCore as ImportedAppCore } from "../core/index.js";
import { Router as ImportedRouter } from "../router/index.js";
import { Auth as ImportedAuth } from "../features/auth/index.js";

import {
  captureInitialUrl,
  getCurrentPublicPath,
  getProtectedInitialPublicPath,
  normalizeCanonicalPath,
  redactTokenInText,
} from "../router/helpers.js";

export const ROUTER_BOOTSTRAP_VERSION = "21.0.0-simple";

const SOURCE = "app.router";
const DEFAULT_ROUTE = "/";
const DEBUG_KEY = "__ONION_APP_ROUTER_BOOTSTRAP__";

const EVENTS = Object.freeze({
  configured: "app:router:configured",
  bound: "app:router:bound",
  initialRenderStart: "app:router:initial-render:start",
  initialRenderDone: "app:router:initial-render:done",
  initialRenderError: "app:router:initial-render:error",
  reset: "app:router:reset",
});

let RuntimeAppCore = ImportedAppCore;
let RuntimeRouter = ImportedRouter;
let RuntimeAuth = ImportedAuth;

let configured = false;
let bound = false;
let firstRenderDone = false;
let initialRenderPromise = null;
let renderCycle = 0;

const bootState = {
  lastConfiguredAt: 0,
  lastBoundAt: 0,
  lastInitialPath: "",
  lastInitialPublicPath: "",
  lastRenderedPath: "",
  lastRenderedPublicPath: "",
  lastProtectedPublicPath: "",
  lastRenderAt: 0,
  lastRenderOk: false,
  lastRenderError: null,
};

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function now() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function iso(ms = now()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return text(value, "");
  }
}

function normalizeError(error = null) {
  if (!error) return null;

  return {
    name: text(error?.name, "RouterBootstrapError"),
    message: redact(text(error?.message || error, "Error en bootstrap Router.")),
    code: text(error?.code || error?.status || error?.statusCode, "") || null,
  };
}

function sanitize(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  if (/token|secret|password|authorization|credential|jwt|bearer|otp|code|session|refresh/i.test(keyHint)) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[function]";
  if (value instanceof Error) return normalizeError(value);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitize(item, depth + 1, keyHint));

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitize(item, depth + 1, key)])
    );
  }

  return String(value);
}

function emit(eventName = "", payload = {}, options = {}) {
  const name = text(eventName, "");
  if (!name || options.emit === false || options.emitEvents === false) return false;

  const detail = sanitize({
    version: ROUTER_BOOTSTRAP_VERSION,
    source: SOURCE,
    at: iso(),
    ...object(payload),
  });

  try {
    RuntimeAppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function warn(...args) {
  try {
    RuntimeAppCore?.utils?.warn?.("[AppRouter]", ...args.map((item) => sanitize(item)));
  } catch {
    try {
      if (RuntimeAppCore?.config?.debug) console.warn("[AppRouter]", ...args.map((item) => sanitize(item)));
    } catch {}
  }
}

function setState(patch = {}) {
  const data = object(patch);
  if (!Object.keys(data).length) return false;

  try {
    RuntimeAppCore?.setState?.(data, { source: SOURCE, emit: false, emitState: false, silent: true });
    return true;
  } catch {}

  try {
    if (RuntimeAppCore?.state && typeof RuntimeAppCore.state === "object") {
      Object.assign(RuntimeAppCore.state, data);
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DEPS / CORE REGISTRY
========================================================= */

function moduleGet(AppCore, name = "") {
  try {
    return AppCore?.modules?.get?.(name) || null;
  } catch {
    return null;
  }
}

function resolveDeps(deps = {}) {
  const input = object(deps);

  RuntimeAppCore = input.AppCore || input.core || RuntimeAppCore || ImportedAppCore;
  RuntimeRouter = input.Router || input.router || RuntimeAppCore?.Router || RuntimeAppCore?.router || moduleGet(RuntimeAppCore, "Router") || moduleGet(RuntimeAppCore, "router") || RuntimeRouter || ImportedRouter;
  RuntimeAuth = input.Auth || input.auth || RuntimeAppCore?.Auth || RuntimeAppCore?.auth || moduleGet(RuntimeAppCore, "Auth") || moduleGet(RuntimeAppCore, "auth") || RuntimeAuth || ImportedAuth;

  return { AppCore: RuntimeAppCore, Router: RuntimeRouter, Auth: RuntimeAuth };
}

function exposeRouterToCore() {
  if (!RuntimeAppCore || !RuntimeRouter) return false;

  try {
    RuntimeAppCore.Router = RuntimeRouter;
    RuntimeAppCore.router = RuntimeRouter;
  } catch {}

  try {
    RuntimeAppCore?.modules?.register?.("Router", RuntimeRouter, {
      overwrite: true,
      replace: true,
      aliases: ["router"],
      source: SOURCE,
      emit: false,
      silent: true,
    });
  } catch {}

  try {
    RuntimeAppCore?.modules?.set?.("Router", RuntimeRouter);
    RuntimeAppCore?.modules?.set?.("router", RuntimeRouter);
  } catch {}

  return true;
}

/* =========================================================
   PATH / INITIAL CONTEXT
========================================================= */

function browserPath() {
  if (!isBrowser()) return DEFAULT_ROUTE;

  try {
    const { pathname, search, hash } = window.location;
    if (hash?.startsWith?.("#/")) return hash.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
    if (hash?.startsWith?.("#!")) return hash.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
    return `${pathname || DEFAULT_ROUTE}${search || ""}${hash || ""}`;
  } catch {
    return DEFAULT_ROUTE;
  }
}

function currentPublicPath(fallback = DEFAULT_ROUTE) {
  try {
    return RuntimeRouter?.getCurrentPublicPath?.() || getCurrentPublicPath(RuntimeAppCore) || browserPath() || fallback;
  } catch {
    return browserPath() || fallback;
  }
}

function protectedInitialPath() {
  try {
    captureInitialUrl();
    return getProtectedInitialPublicPath(RuntimeAppCore) || "";
  } catch {
    return "";
  }
}

function explicitPathFromDeps(deps = {}) {
  return text(deps.publicPath || deps.path || deps.requestedPath || deps.route || "", "");
}

function initialContext(deps = {}) {
  const data = object(deps);
  const protectedPath = protectedInitialPath();
  const explicitPath = explicitPathFromDeps(data);
  const publicPath = protectedPath || explicitPath || currentPublicPath(DEFAULT_ROUTE) || DEFAULT_ROUTE;
  const canonicalPath = normalizeCanonicalPath(RuntimeAppCore, publicPath) || DEFAULT_ROUTE;

  return {
    reason: text(data.reason, "initial-render"),
    publicPath,
    canonicalPath,
    protectedPublicPath: protectedPath,
    protectedInitialUrl: Boolean(protectedPath),
  };
}

function renderOptions(ctx = {}, cycleId = 0) {
  const data = object(ctx);
  const protectedInitialUrl = Boolean(data.protectedInitialUrl || data.protectedPublicPath);

  return {
    force: true,
    forceRender: true,
    initialRender: true,
    canonicalPath: data.canonicalPath || DEFAULT_ROUTE,
    publicPath: data.publicPath || DEFAULT_ROUTE,
    requestedPath: data.publicPath || DEFAULT_ROUTE,
    source: SOURCE,
    reason: data.reason || "initial-render",
    cycleId,
    preservePublicPath: true,
    preserveUrl: true,
    preservePath: protectedInitialUrl,
    preserveSearch: protectedInitialUrl,
    preserveHash: protectedInitialUrl,
    protectedInitialUrl,
    skipHistory: protectedInitialUrl,
    replaceState: !protectedInitialUrl,
  };
}

function markInitialRenderDone(value = true) {
  firstRenderDone = Boolean(value);
  setState({
    initialRouteRendered: Boolean(value),
    bootNavigationHandled: Boolean(value),
  });
}

/* =========================================================
   CONFIGURE / BIND
========================================================= */

export function configureRouter(deps = {}) {
  resolveDeps(deps);
  captureInitialUrl();
  exposeRouterToCore();

  if (configured) return true;

  try {
    if (isFn(RuntimeRouter?.configure)) {
      const result = RuntimeRouter.configure({
        AppCore: RuntimeAppCore,
        core: RuntimeAppCore,
        Auth: RuntimeAuth,
        auth: RuntimeAuth,
        source: SOURCE,
      });

      if (result === false) return false;
    }

    configured = true;
    bootState.lastConfiguredAt = now();

    emit(EVENTS.configured, { configured: true, at: iso(bootState.lastConfiguredAt) });
    return true;
  } catch (error) {
    configured = false;
    bootState.lastRenderError = normalizeError(error);
    warn("Error configurando Router", error);
    return false;
  }
}

export function bindRouter(deps = {}) {
  resolveDeps(deps);
  captureInitialUrl();

  if (!configured && configureRouter(deps) === false) return false;
  if (bound) return true;

  try {
    if (isFn(RuntimeRouter?.bind)) {
      const result = RuntimeRouter.bind({
        AppCore: RuntimeAppCore,
        core: RuntimeAppCore,
        Auth: RuntimeAuth,
        auth: RuntimeAuth,
        initialRenderDone: firstRenderDone,
        source: SOURCE,
      });

      if (result === false) return false;
    }

    bound = true;
    bootState.lastBoundAt = now();

    emit(EVENTS.bound, {
      bound: true,
      initialRenderDone: firstRenderDone,
      at: iso(bootState.lastBoundAt),
    });

    return true;
  } catch (error) {
    bound = false;
    bootState.lastRenderError = normalizeError(error);
    warn("Error bindeando Router", error);
    return false;
  }
}

/* =========================================================
   INITIAL RENDER
========================================================= */

async function runInitialRender(ctx = {}, cycleId = 0) {
  const data = object(ctx);
  const path = data.publicPath || DEFAULT_ROUTE;
  const options = renderOptions(data, cycleId);

  bootState.lastInitialPath = data.canonicalPath || DEFAULT_ROUTE;
  bootState.lastInitialPublicPath = path;
  bootState.lastProtectedPublicPath = data.protectedPublicPath || "";

  emit(EVENTS.initialRenderStart, {
    canonicalPath: data.canonicalPath,
    publicPath: redact(path),
    protectedInitialUrl: Boolean(data.protectedInitialUrl),
    cycleId,
  });

  let result = null;

  if (isFn(RuntimeRouter?.render)) result = await RuntimeRouter.render(path, options);
  else if (isFn(RuntimeRouter?.navigate)) result = await RuntimeRouter.navigate(path, options);
  else if (isFn(RuntimeRouter?.renderCurrent)) result = await RuntimeRouter.renderCurrent(options);
  else {
    setState({
      route: data.canonicalPath || DEFAULT_ROUTE,
      canonicalPath: data.canonicalPath || DEFAULT_ROUTE,
      publicPath: path,
    });
    result = { ok: false, rendered: false, reason: "router-render-missing" };
  }

  if (cycleId !== renderCycle) return { ok: false, stale: true };

  markInitialRenderDone(true);

  bootState.lastRenderedPath = data.canonicalPath || DEFAULT_ROUTE;
  bootState.lastRenderedPublicPath = path;
  bootState.lastRenderAt = now();
  bootState.lastRenderOk = true;
  bootState.lastRenderError = null;

  emit(EVENTS.initialRenderDone, {
    ok: true,
    canonicalPath: data.canonicalPath,
    publicPath: redact(path),
    protectedInitialUrl: Boolean(data.protectedInitialUrl),
    cycleId,
    at: iso(bootState.lastRenderAt),
  });

  return result || { ok: true, rendered: true };
}

export function renderInitialRoute(deps = {}) {
  resolveDeps(deps);
  captureInitialUrl();

  if (!configured && configureRouter(deps) === false) return Promise.resolve(false);
  if (firstRenderDone) return Promise.resolve(true);
  if (initialRenderPromise) return initialRenderPromise;

  const cycleId = ++renderCycle;
  const ctx = initialContext(deps);

  initialRenderPromise = runInitialRender(ctx, cycleId)
    .then((result) => result !== false)
    .catch((error) => {
      bootState.lastRenderOk = false;
      bootState.lastRenderError = normalizeError(error);
      markInitialRenderDone(false);

      emit(EVENTS.initialRenderError, {
        canonicalPath: ctx.canonicalPath,
        publicPath: redact(ctx.publicPath),
        protectedInitialUrl: Boolean(ctx.protectedInitialUrl),
        error: bootState.lastRenderError,
        at: iso(),
      });

      warn("Fallo render inicial", {
        canonicalPath: ctx.canonicalPath,
        publicPath: ctx.publicPath,
        error,
      });

      return false;
    })
    .finally(() => {
      initialRenderPromise = null;
    });

  return initialRenderPromise;
}

/* =========================================================
   RESET / SNAPSHOT
========================================================= */

export function resetRouterBootstrap(options = {}) {
  const opts = object(options);

  firstRenderDone = false;
  initialRenderPromise = null;
  renderCycle = 0;

  if (opts.resetConfigured) configured = false;
  if (opts.resetBound) bound = false;

  Object.assign(bootState, {
    lastInitialPath: "",
    lastInitialPublicPath: "",
    lastRenderedPath: "",
    lastRenderedPublicPath: "",
    lastProtectedPublicPath: "",
    lastRenderAt: 0,
    lastRenderOk: false,
    lastRenderError: null,
  });

  setState({ initialRouteRendered: false, bootNavigationHandled: false });
  emit(EVENTS.reset, { resetConfigured: Boolean(opts.resetConfigured), resetBound: Boolean(opts.resetBound), at: iso() });

  return true;
}

export function getRouterBootstrapState() {
  resolveDeps();

  let routerSnapshot = null;

  try {
    routerSnapshot = RuntimeRouter?.getSnapshot?.() || RuntimeRouter?.getDebugSnapshot?.() || RuntimeRouter?.getState?.() || null;
  } catch {}

  const protectedPath = protectedInitialPath();
  const current = currentPublicPath();

  return sanitize({
    version: ROUTER_BOOTSTRAP_VERSION,
    configured,
    bound,
    firstRenderDone,
    initialRenderInFlight: Boolean(initialRenderPromise),
    renderCycle,
    route: RuntimeAppCore?.state?.route || DEFAULT_ROUTE,
    publicPath: RuntimeAppCore?.state?.publicPath || DEFAULT_ROUTE,
    protectedInitialPublicPath: protectedPath,
    currentPublicPath: current,
    currentCanonicalPath: normalizeCanonicalPath(RuntimeAppCore, current),
    lastInitialPath: bootState.lastInitialPath,
    lastInitialPublicPath: bootState.lastInitialPublicPath,
    lastRenderedPath: bootState.lastRenderedPath,
    lastRenderedPublicPath: bootState.lastRenderedPublicPath,
    lastProtectedPublicPath: bootState.lastProtectedPublicPath,
    lastRenderAt: bootState.lastRenderAt,
    lastRenderAtIso: bootState.lastRenderAt ? iso(bootState.lastRenderAt) : "",
    lastRenderOk: bootState.lastRenderOk,
    lastRenderError: bootState.lastRenderError,
    lastConfiguredAt: bootState.lastConfiguredAt,
    lastConfiguredAtIso: bootState.lastConfiguredAt ? iso(bootState.lastConfiguredAt) : "",
    lastBoundAt: bootState.lastBoundAt,
    lastBoundAtIso: bootState.lastBoundAt ? iso(bootState.lastBoundAt) : "",
    routerSnapshot,
    policy: {
      wrapperOnly: true,
      ownAuth: false,
      ownGuards: false,
      ownHistory: false,
      ownRender: false,
      ownStorage: false,
      ownToast: false,
    },
  });
}

/* =========================================================
   DEBUG API
========================================================= */

function exposeDebugApi() {
  const api = {
    version: ROUTER_BOOTSTRAP_VERSION,
    configure: configureRouter,
    bind: bindRouter,
    renderInitial: renderInitialRoute,
    reset: resetRouterBootstrap,
    snapshot: getRouterBootstrapState,
    getSnapshot: getRouterBootstrapState,
  };

  try {
    if (isBrowser()) window[DEBUG_KEY] = api;
  } catch {}

  try {
    if (RuntimeAppCore && typeof RuntimeAppCore === "object" && Object.isExtensible(RuntimeAppCore)) {
      Object.defineProperty(RuntimeAppCore, "RouterBootstrap", {
        value: api,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
  } catch {}

  return api;
}

exposeDebugApi();

export default {
  ROUTER_BOOTSTRAP_VERSION,
  configureRouter,
  bindRouter,
  renderInitialRoute,
  resetRouterBootstrap,
  getRouterBootstrapState,
};
