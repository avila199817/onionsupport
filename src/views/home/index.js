/* =========================================================
   Onion SPA - Home Index
   Archivo: src/views/home/index.js

   HOME INDEX · ROUTE SAFE · USERNAME PUBLIC PATH PATCH · 10/10

   FIX CRÍTICO:
   - /@usuario/ debe considerarse HOME
   - canonicalPath "/" debe ganar sobre publicPath "/@usuario/"
   - no bloquear HomeView.init si Router ya resolvió routeKey/viewKey home
   - evita quedarse en placeholder "Preparando contenido..."
   - wrapper limpio hacia homeView.js
========================================================= */

import HomeViewDefault, {
  HomeView as HomeViewNamed,
} from "./homeView.js";

/* =========================================================
   CONSTANTS
========================================================= */

const SOURCE = "views:home:index";
const HOME_PATH = "/";

const HomeView =
  HomeViewNamed ||
  HomeViewDefault ||
  null;

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
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

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

/* =========================================================
   LOG
========================================================= */

function safeWarn(...args) {
  try {
    console.warn(
      "[HomeIndex]",
      ...args
    );
  } catch {}
}

function safeLog(...args) {
  try {
    const debug =
      isBrowser()
        ? Boolean(window.__ONION_DEBUG_HOME__)
        : false;

    if (debug) {
      console.log(
        "[HomeIndex]",
        ...args
      );
    }
  } catch {}
}

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function getBaseOrigin() {
  try {
    if (
      isBrowser() &&
      window.location?.origin
    ) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function normalizePathnameOnly(pathname = HOME_PATH) {
  let value = safeText(pathname, HOME_PATH)
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) {
    value = HOME_PATH;
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || HOME_PATH;
  }

  return value;
}

function splitPath(value = HOME_PATH) {
  const raw = safeText(value, HOME_PATH);

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || HOME_PATH;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || HOME_PATH;
  }

  return {
    pathname: normalizePathnameOnly(pathname),
    search,
    hash,
  };
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return HOME_PATH;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function normalizeFullPath(path = HOME_PATH) {
  const raw = safeText(path, HOME_PATH);

  if (!raw) {
    return HOME_PATH;
  }

  if (isHashRouterPath(raw)) {
    return normalizeFullPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed = new URL(
        raw,
        getBaseOrigin()
      );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizeFullPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizeFullPath(
        `${parsed.pathname || HOME_PATH}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } = splitPath(raw);

  return `${pathname}${search || ""}${hash || ""}`;
}

function stripSearchAndHash(path = HOME_PATH) {
  return (
    normalizeFullPath(path)
      .split("?")[0]
      .split("#")[0] ||
    HOME_PATH
  );
}

function isUsernameSegment(segment = "") {
  return /^@[A-Za-z0-9._-]{1,80}$/.test(
    safeText(segment, "")
  );
}

function stripUsernamePrefix(path = HOME_PATH) {
  const cleanPath = stripSearchAndHash(path);
  const segments = cleanPath
    .split("/")
    .filter(Boolean);

  if (
    segments.length > 0 &&
    isUsernameSegment(segments[0])
  ) {
    const rest = segments
      .slice(1)
      .join("/");

    return rest
      ? normalizePathnameOnly(`/${rest}`)
      : HOME_PATH;
  }

  return normalizePathnameOnly(cleanPath);
}

function canonicalizeHomePath(path = HOME_PATH) {
  return stripUsernamePrefix(
    normalizeFullPath(path || HOME_PATH)
  );
}

function isHomePath(path = "") {
  return canonicalizeHomePath(path || HOME_PATH) === HOME_PATH;
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || HOME_PATH;

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeFullPath(
        normalizeHashRouterPath(hash)
      );
    }

    return normalizeFullPath(
      `${pathname}${search}${hash}`
    );
  } catch {
    return "";
  }
}

/* =========================================================
   SIGNALS
========================================================= */

function pushPathSignal(
  signals,
  label,
  value,
  strength = "explicit"
) {
  const raw = safeText(value, "");

  if (!raw) {
    return;
  }

  signals.push({
    type: "path",
    label,
    value: raw,
    canonical: canonicalizeHomePath(raw),
    isHome: isHomePath(raw),
    strength,
  });
}

function pushViewSignal(
  signals,
  label,
  value,
  strength = "explicit"
) {
  const raw = safeText(value, "");

  if (!raw) {
    return;
  }

  const key = normalizeKey(raw);

  signals.push({
    type: "view",
    label,
    value: key,
    isHome:
      key === "home" ||
      key === "homeview" ||
      key === "dashboard",
    strength,
  });
}

function collectObjectSignals(
  signals,
  value,
  label = "arg",
  strength = "explicit"
) {
  const object = safeObject(value, null);

  if (!object) {
    return;
  }

  pushViewSignal(signals, `${label}.viewKey`, object.viewKey, strength);
  pushViewSignal(signals, `${label}.viewName`, object.viewName, strength);
  pushViewSignal(signals, `${label}.name`, object.name, strength);
  pushViewSignal(signals, `${label}.routeKey`, object.routeKey, strength);

  pushPathSignal(signals, `${label}.path`, object.path, strength);
  pushPathSignal(signals, `${label}.href`, object.href, strength);
  pushPathSignal(signals, `${label}.to`, object.to, strength);
  pushPathSignal(signals, `${label}.canonicalPath`, object.canonicalPath, strength);
  pushPathSignal(signals, `${label}.publicPath`, object.publicPath, strength);
  pushPathSignal(signals, `${label}.requestedPath`, object.requestedPath, strength);

  const route = safeObject(object.route, null);

  if (route) {
    pushViewSignal(signals, `${label}.route.viewKey`, route.viewKey, strength);
    pushViewSignal(signals, `${label}.route.viewName`, route.viewName, strength);
    pushViewSignal(signals, `${label}.route.name`, route.name, strength);
    pushViewSignal(signals, `${label}.route.routeKey`, route.routeKey, strength);

    pushPathSignal(signals, `${label}.route.path`, route.path, strength);
    pushPathSignal(signals, `${label}.route.href`, route.href, strength);
    pushPathSignal(signals, `${label}.route.to`, route.to, strength);
    pushPathSignal(signals, `${label}.route.canonicalPath`, route.canonicalPath, strength);
    pushPathSignal(signals, `${label}.route.publicPath`, route.publicPath, strength);
  }

  collectObjectSignals(
    signals,
    object.options,
    `${label}.options`,
    strength
  );

  collectObjectSignals(
    signals,
    object.payload,
    `${label}.payload`,
    strength
  );

  collectObjectSignals(
    signals,
    object.detail,
    `${label}.detail`,
    strength
  );
}

function collectSignals(args = []) {
  const signals = [];

  safeArray(args).forEach((arg, index) => {
    collectObjectSignals(
      signals,
      arg,
      `args[${index}]`,
      "explicit"
    );
  });

  const browserPath = getBrowserPath();

  if (browserPath) {
    pushPathSignal(
      signals,
      "window.location",
      browserPath,
      "browser"
    );
  }

  return signals;
}

function hasPositiveHomeSignal(signals = []) {
  return signals.some(
    (signal) => signal.isHome === true
  );
}

function getBrowserBlockingSignal(signals = []) {
  return signals.find(
    (signal) =>
      signal.strength === "browser" &&
      signal.type === "path" &&
      signal.isHome === false
  ) || null;
}

function getExplicitBlockingSignal(signals = []) {
  return signals.find(
    (signal) =>
      signal.strength === "explicit" &&
      signal.type === "path" &&
      signal.isHome === false &&
      signal.label !== "args[0].publicPath" &&
      !signal.label.endsWith(".publicPath")
  ) || null;
}

function getHomeRouteDebug(args = []) {
  const signals = collectSignals(args);
  const browserBlock = getBrowserBlockingSignal(signals);
  const explicitBlock = getExplicitBlockingSignal(signals);

  const allowed = Boolean(
    !browserBlock &&
      !explicitBlock &&
      (
        hasPositiveHomeSignal(signals) ||
        isHomePath(getBrowserPath() || HOME_PATH)
      )
  );

  return {
    source: SOURCE,
    allowed,
    browserPath: getBrowserPath(),
    browserCanonicalPath: canonicalizeHomePath(getBrowserPath() || HOME_PATH),
    signals,
    browserBlock,
    explicitBlock,
    hasPositiveHomeSignal: hasPositiveHomeSignal(signals),
  };
}

function shouldAllowHome(method = "unknown", args = []) {
  const debug = getHomeRouteDebug(args);

  if (debug.allowed) {
    safeLog(`${method} permitido`, debug);
    return true;
  }

  safeWarn(
    `HomeView.${method} bloqueado: la ruta actual no es Home.`,
    debug
  );

  return false;
}

/* =========================================================
   DELEGATE
========================================================= */

async function init(...args) {
  if (!shouldAllowHome("init", args)) {
    return api;
  }

  if (isFunction(HomeView?.init)) {
    return HomeView.init(...args);
  }

  if (isFunction(HomeView?.mount)) {
    return HomeView.mount(...args);
  }

  if (isFunction(HomeView?.render)) {
    return HomeView.render(...args);
  }

  safeWarn("HomeView no expone init/mount/render.");
  return api;
}

async function mount(...args) {
  return init(...args);
}

function render(...args) {
  if (!shouldAllowHome("render", args)) {
    return null;
  }

  if (isFunction(HomeView?.render)) {
    return HomeView.render(...args);
  }

  if (isFunction(HomeView?.scheduleRender)) {
    return HomeView.scheduleRender(...args);
  }

  if (isFunction(HomeView?.init)) {
    void HomeView.init(...args);
    return null;
  }

  safeWarn("HomeView no expone render.");
  return null;
}

function scheduleRender(...args) {
  return render(...args);
}

async function reload(options = {}) {
  if (isFunction(HomeView?.reload)) {
    return HomeView.reload(options);
  }

  if (isFunction(HomeView?.refresh)) {
    return HomeView.refresh(options);
  }

  return init({
    route: {
      path: HOME_PATH,
      viewKey: "home",
    },
    canonicalPath: HOME_PATH,
    publicPath: HOME_PATH,
    options,
  });
}

async function refresh(options = {}) {
  return reload({
    ...safeObject(options),
    asRefresh: true,
    force: true,
  });
}

function destroy(...args) {
  if (isFunction(HomeView?.destroy)) {
    return HomeView.destroy(...args);
  }

  if (isFunction(HomeView?.unmount)) {
    return HomeView.unmount(...args);
  }

  return true;
}

function unmount(...args) {
  return destroy(...args);
}

function bind(...args) {
  if (isFunction(HomeView?.bind)) {
    return HomeView.bind(...args);
  }

  return false;
}

function getState() {
  if (isFunction(HomeView?.getState)) {
    return HomeView.getState();
  }

  return {};
}

function getSnapshot() {
  if (isFunction(HomeView?.getSnapshot)) {
    return HomeView.getSnapshot();
  }

  return {
    source: SOURCE,
    homeViewAvailable: Boolean(HomeView),
    routeGuard: getHomeRouteDebug([]),
  };
}

function getItems() {
  if (isFunction(HomeView?.getItems)) {
    return HomeView.getItems();
  }

  if (isFunction(HomeView?.getTickets)) {
    return HomeView.getTickets();
  }

  return [];
}

function getTickets() {
  if (isFunction(HomeView?.getTickets)) {
    return HomeView.getTickets();
  }

  return getItems();
}

function openTicket(payload = {}) {
  if (isFunction(HomeView?.openTicketFromExternalRequest)) {
    return HomeView.openTicketFromExternalRequest(payload);
  }

  if (isFunction(HomeView?.openTicket)) {
    return HomeView.openTicket(payload);
  }

  return null;
}

function createIncidencia(draft = {}) {
  if (isFunction(HomeView?.createIncidencia)) {
    return HomeView.createIncidencia(draft);
  }

  return false;
}

/* =========================================================
   API
========================================================= */

const api = {
  source: SOURCE,

  init,
  mount,

  render,
  scheduleRender,

  reload,
  refresh,

  destroy,
  unmount,

  bind,

  getState,
  getSnapshot,
  getItems,
  getTickets,

  openTicket,
  openIncidencia: openTicket,
  createIncidencia,

  canRenderHomeNow: (...args) =>
    shouldAllowHome("canRenderHomeNow", args),

  getHomeRouteDebug,

  get view() {
    return HomeView;
  },

  get ready() {
    return Boolean(HomeView);
  },
};

/* =========================================================
   GLOBAL DEBUG BRIDGE
========================================================= */

try {
  if (isBrowser()) {
    window.HomeIndex = api;
    window.OnionHomeIndex = api;
  }
} catch {}

/* =========================================================
   EXPORTS
========================================================= */

export {
  api as HomeIndex,
  HomeView,

  init,
  mount,

  render,
  scheduleRender,

  reload,
  refresh,

  destroy,
  unmount,

  bind,

  getState,
  getSnapshot,
  getItems,
  getTickets,

  openTicket,
  createIncidencia,

  getHomeRouteDebug,
};

export default api;
