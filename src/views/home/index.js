/* =========================================================
   Onion SPA - Home Index
   Archivo: src/views/home/index.js

   HOME INDEX · ROUTE SAFE · USERNAME PUBLIC PATH PATCH
   WRAPPER CLEAN · NO INLINE CSS · NO DOM MUTATION

   Contrato:
   - / debe considerarse Home.
   - /@usuario/ debe considerarse Home.
   - /@usuario debe considerarse Home.
   - /@usuario/incidencias NO debe considerarse Home.
   - canonicalPath "/" gana sobre publicPath "/@usuario/".
   - routeKey/viewKey/name home permite Home aunque publicPath sea username.
   - No bloquear HomeView.init si Router ya resolvió Home.
   - Evitar placeholder permanente "Preparando contenido...".
   - Delegar en homeView.js sin duplicar lógica visual.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as HomeViewModule from "./homeView.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const HOME_INDEX_VERSION = "13.0.0";

const SOURCE = "views:home:index";
const HOME_PATH = "/";

const HomeView =
  HomeViewModule?.HomeView ||
  HomeViewModule?.default ||
  null;

const HOME_VIEW_KEYS = new Set([
  "home",
  "homeview",
  "dashboard",
  "inicio",
  "root",
  "index",
]);

const KNOWN_ROOT_ROUTE_SEGMENTS = new Set([
  "login",
  "logout",
  "2fa",
  "otp",
  "mfa",

  "home",
  "dashboard",
  "inicio",

  "incidencias",
  "tickets",
  "ticket",
  "incidents",
  "incident",
  "issues",
  "issue",

  "facturas",
  "invoices",
  "invoice",
  "bills",
  "bill",
  "billing",

  "usuarios",
  "users",
  "user",
  "members",
  "member",

  "clientes",
  "clients",
  "client",
  "customers",
  "customer",

  "cuenta",
  "account",
  "profile",

  "ajustes",
  "settings",

  "servidor",
  "server",
  "health",
  "status",

  "activate-account",
  "activation",
  "reset-password",
  "reset-password-confirm",
  "forgot-password",
  "recover-password",
  "password-reset",
]);

/* =========================================================
   BASIC HELPERS
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

  if (isObject(value)) {
    return fallback;
  }

  const text =
    String(value)
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

function isDebugEnabled() {
  try {
    return Boolean(
      AppCore?.config?.debug ||
        AppCore?.state?.debug ||
        AppCore?.state?.flags?.debug ||
        AppCore?.state?.flags?.homeDebug ||
        (
          isBrowser() &&
          (
            window.__ONION_DEBUG__ ||
            window.__ONION_DEBUG_HOME__ ||
            window.__ONION_HOME_WARN__
          )
        )
    );
  } catch {
    return false;
  }
}

const warnedKeys = new Set();

function safeWarnOnce(key = "", ...args) {
  const finalKey = safeText(key, "home-index-warning");

  if (warnedKeys.has(finalKey)) {
    return;
  }

  warnedKeys.add(finalKey);

  if (!isDebugEnabled()) {
    return;
  }

  try {
    AppCore?.utils?.warn?.("[HomeIndex]", ...args);
    return;
  } catch {}

  try {
    console.warn("[HomeIndex]", ...args);
  } catch {}
}

function safeLog(...args) {
  if (!isDebugEnabled()) {
    return;
  }

  try {
    AppCore?.utils?.log?.("[HomeIndex]", ...args);
    return;
  } catch {}

  try {
    console.log("[HomeIndex]", ...args);
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
  let value =
    safeText(pathname, HOME_PATH)
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

function normalizeSearch(search = "") {
  const value = safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
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
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
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
      const parsed = new URL(raw, getBaseOrigin());

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

  const { pathname, search, hash } = splitPath(raw);

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

function normalizeUsernameSegment(value = "") {
  return safeText(value, "")
    .replace(/^@+/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .trim();
}

function getPathSegments(path = HOME_PATH) {
  return stripSearchAndHash(path)
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

/* =========================================================
   USERNAME CONTEXT
========================================================= */

function getCurrentUser() {
  return safeObject(
    first(
      AppCore?.state?.user,
      AppCore?.state?.currentUser,
      AppCore?.state?.profile,
      AppCore?.state?.session?.user,
      AppCore?.session?.user,
      AppCore?.Auth?.user,
      AppCore?.auth?.user,
      {}
    )
  );
}

function getKnownUsernameCandidates() {
  const state = safeObject(AppCore?.state);
  const user = getCurrentUser();
  const raw = safeObject(user.raw);

  return [
    state.currentResolvedUsername,
    state.resolvedUsername,
    state.username,
    state.userName,
    state.user_name,
    state.publicUsername,
    state.slug,

    user.username,
    user.userName,
    user.user_name,
    user.slug,
    user.alias,
    user.login,
    user.email,

    raw.username,
    raw.userName,
    raw.user_name,
    raw.slug,
    raw.alias,
    raw.login,
    raw.email,

    isBrowser() ? window.__ONION_USERNAME__ : "",
    isBrowser() ? window.__ONION_PUBLIC_USERNAME__ : "",
    isBrowser() ? window.__ONION_RESOLVED_USERNAME__ : "",
  ]
    .map(normalizeUsernameSegment)
    .filter(Boolean);
}

/* =========================================================
   ROUTER / APPCORE SIGNAL SOURCES
========================================================= */

function getRouterCandidate() {
  try {
    if (isFunction(AppCore?.modules?.get)) {
      return (
        AppCore.modules.get("router") ||
        AppCore.modules.get("Router") ||
        null
      );
    }
  } catch {}

  try {
    return (
      AppCore?.router ||
      AppCore?.Router ||
      AppCore?.modules?.router ||
      AppCore?.modules?.Router ||
      (isBrowser() ? window.Router : null) ||
      (isBrowser() ? window.OnionRouter : null) ||
      null
    );
  } catch {
    return null;
  }
}

function getStateRouteObject() {
  return safeObject(
    first(
      AppCore?.state?.currentRoute,
      AppCore?.state?.route,
      AppCore?.state?.routeMeta,
      {}
    )
  );
}

function getRawAppRouteValue() {
  const route = getStateRouteObject();

  return safeText(
    first(
      route.canonicalPath,
      route.path,
      route.href,
      route.to,
      AppCore?.state?.canonicalPath,
      AppCore?.state?.currentPath,
      AppCore?.state?.path,
      ""
    ),
    ""
  );
}

function isRawAppRouteHome() {
  const raw = getRawAppRouteValue();

  if (!raw) {
    return false;
  }

  return stripSearchAndHash(raw) === HOME_PATH;
}

function getAppCanonicalPath() {
  const router = getRouterCandidate();
  const route = getStateRouteObject();

  try {
    return safeText(
      first(
        router?.getCurrentCanonicalPath?.(),
        route.canonicalPath,
        route.path,
        AppCore?.state?.canonicalPath,
        AppCore?.state?.currentPath,
        AppCore?.state?.path,
        ""
      ),
      ""
    );
  } catch {
    return safeText(
      first(
        route.canonicalPath,
        route.path,
        AppCore?.state?.canonicalPath,
        AppCore?.state?.currentPath,
        AppCore?.state?.path,
        ""
      ),
      ""
    );
  }
}

function getAppPublicPath() {
  const router = getRouterCandidate();
  const route = getStateRouteObject();

  try {
    return safeText(
      first(
        router?.getCurrentPublicPath?.(),
        route.publicPath,
        route.routePublicPath,
        AppCore?.state?.publicPath,
        AppCore?.state?.routePublicPath,
        router?.getCurrentPath?.(),
        ""
      ),
      ""
    );
  } catch {
    return safeText(
      first(
        route.publicPath,
        route.routePublicPath,
        AppCore?.state?.publicPath,
        AppCore?.state?.routePublicPath,
        ""
      ),
      ""
    );
  }
}

function getAppViewKey() {
  const route = getStateRouteObject();

  return safeText(
    first(
      AppCore?.state?.viewKey,
      AppCore?.state?.routeKey,
      AppCore?.state?.routeName,
      AppCore?.state?.currentView,

      route.viewKey,
      route.routeKey,
      route.name,
      route.key,
      route.viewName,

      AppCore?.state?.routeMeta?.viewKey,
      AppCore?.state?.routeMeta?.routeKey,
      AppCore?.state?.routeMeta?.name,
      ""
    ),
    ""
  );
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname = window.location.pathname || HOME_PATH;
    const search = window.location.search || "";
    const hash = window.location.hash || "";

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
   USERNAME PATH RULES
========================================================= */

function isUsernameSegment(segment = "", options = {}) {
  const raw = safeText(segment, "");
  const opts = safeObject(options);

  if (!raw) {
    return false;
  }

  if (/^@[A-Za-z0-9._-]{1,80}$/.test(raw)) {
    return true;
  }

  const clean = normalizeUsernameSegment(raw);

  if (!clean) {
    return false;
  }

  if (KNOWN_ROOT_ROUTE_SEGMENTS.has(clean)) {
    return false;
  }

  const knownUsernames = getKnownUsernameCandidates();

  if (knownUsernames.some((candidate) => candidate === clean)) {
    return true;
  }

  if (
    opts.allowUnknownSlug === true &&
    /^[a-z0-9._-]{3,80}$/i.test(clean)
  ) {
    return true;
  }

  return false;
}

function stripUsernamePrefix(path = HOME_PATH, options = {}) {
  const opts = safeObject(options);
  const full = normalizeFullPath(path || HOME_PATH);
  const { pathname, search, hash } = splitPath(full);

  const segments = pathname
    .split("/")
    .filter(Boolean);

  if (!segments.length) {
    return `${HOME_PATH}${search}${hash}`;
  }

  const shouldStrip =
    isUsernameSegment(
      segments[0],
      {
        allowUnknownSlug: opts.allowUnknownSlug === true,
      }
    );

  if (!shouldStrip) {
    return `${pathname}${search}${hash}`;
  }

  const rest = segments.slice(1).join("/");
  const cleanPathname =
    rest
      ? normalizePathnameOnly(`/${rest}`)
      : HOME_PATH;

  return `${cleanPathname}${search}${hash}`;
}

function canonicalizeHomePath(path = HOME_PATH, options = {}) {
  return stripUsernamePrefix(
    normalizeFullPath(path || HOME_PATH),
    options
  );
}

function isHomePath(path = "", options = {}) {
  return (
    stripSearchAndHash(
      canonicalizeHomePath(
        path || HOME_PATH,
        options
      )
    ) === HOME_PATH
  );
}

function isSinglePublicUsernameRoot(path = "", options = {}) {
  const clean = stripSearchAndHash(
    normalizeFullPath(path || HOME_PATH)
  );

  const segments = getPathSegments(clean);

  if (segments.length !== 1) {
    return false;
  }

  return isUsernameSegment(
    segments[0],
    {
      allowUnknownSlug: options.allowUnknownSlug === true,
    }
  );
}

/* =========================================================
   SIGNALS
========================================================= */

function pushPathSignal(
  signals,
  label,
  value,
  strength = "explicit",
  options = {}
) {
  const raw = safeText(value, "");

  if (!raw) {
    return;
  }

  const opts = safeObject(options);

  const canonical =
    canonicalizeHomePath(
      raw,
      {
        allowUnknownSlug: opts.allowUnknownSlug === true,
      }
    );

  signals.push({
    type: "path",
    label,
    value: raw,
    canonical,
    clean: stripSearchAndHash(canonical),
    isHome: stripSearchAndHash(canonical) === HOME_PATH,
    isPublicPath:
      label.endsWith(".publicPath") ||
      label.endsWith(".routePublicPath") ||
      label === "AppCore.state.publicPath",
    isBrowser: strength === "browser",
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
    isHome: HOME_VIEW_KEYS.has(key),
    strength,
  });
}

function collectRouteLikeSignals(
  signals,
  object,
  label,
  strength
) {
  if (!isObject(object)) {
    return;
  }

  pushViewSignal(signals, `${label}.viewKey`, object.viewKey, strength);
  pushViewSignal(signals, `${label}.viewName`, object.viewName, strength);
  pushViewSignal(signals, `${label}.name`, object.name, strength);
  pushViewSignal(signals, `${label}.routeKey`, object.routeKey, strength);
  pushViewSignal(signals, `${label}.key`, object.key, strength);

  pushPathSignal(signals, `${label}.path`, object.path, strength);
  pushPathSignal(signals, `${label}.href`, object.href, strength);
  pushPathSignal(signals, `${label}.to`, object.to, strength);
  pushPathSignal(signals, `${label}.canonicalPath`, object.canonicalPath, strength);
  pushPathSignal(signals, `${label}.publicPath`, object.publicPath, strength);
  pushPathSignal(signals, `${label}.routePublicPath`, object.routePublicPath, strength);
  pushPathSignal(signals, `${label}.requestedPath`, object.requestedPath, strength);
}

function collectObjectSignals(
  signals,
  value,
  label = "arg",
  strength = "explicit",
  depth = 0,
  seen = null
) {
  if (depth > 5) {
    return;
  }

  const object = safeObject(value, null);

  if (!object) {
    return;
  }

  const weak = seen || new WeakSet();

  try {
    if (weak.has(object)) {
      return;
    }

    weak.add(object);
  } catch {}

  collectRouteLikeSignals(signals, object, label, strength);

  const route = safeObject(object.route, null);

  if (route) {
    collectRouteLikeSignals(signals, route, `${label}.route`, strength);
  }

  collectObjectSignals(signals, object.options, `${label}.options`, strength, depth + 1, weak);
  collectObjectSignals(signals, object.payload, `${label}.payload`, strength, depth + 1, weak);
  collectObjectSignals(signals, object.detail, `${label}.detail`, strength, depth + 1, weak);
  collectObjectSignals(signals, object.meta, `${label}.meta`, strength, depth + 1, weak);
}

function collectSignals(args = []) {
  const signals = [];

  safeArray(args).forEach((arg, index) => {
    if (typeof arg === "string") {
      pushPathSignal(
        signals,
        `args[${index}]`,
        arg,
        "explicit",
        {
          allowUnknownSlug: false,
        }
      );

      return;
    }

    collectObjectSignals(
      signals,
      arg,
      `args[${index}]`,
      "explicit"
    );
  });

  const appViewKey = getAppViewKey();

  if (appViewKey) {
    pushViewSignal(
      signals,
      "AppCore.state.viewKey",
      appViewKey,
      "ambient"
    );
  }

  const appCanonical = getAppCanonicalPath();

  if (appCanonical) {
    pushPathSignal(
      signals,
      "AppCore.state.canonicalPath",
      appCanonical,
      "ambient",
      {
        allowUnknownSlug: false,
      }
    );
  }

  const appPublic = getAppPublicPath();

  if (appPublic) {
    pushPathSignal(
      signals,
      "AppCore.state.publicPath",
      appPublic,
      "ambient",
      {
        allowUnknownSlug: isRawAppRouteHome(),
      }
    );
  }

  const browserPath = getBrowserPath();

  if (browserPath) {
    pushPathSignal(
      signals,
      "window.location",
      browserPath,
      "browser",
      {
        allowUnknownSlug: isRawAppRouteHome(),
      }
    );
  }

  return signals;
}

/* =========================================================
   SIGNAL EVALUATION
========================================================= */

function hasPositiveHomeSignal(signals = []) {
  return signals.some((signal) => signal.isHome === true);
}

function hasExplicitHomeSignal(signals = []) {
  return signals.some((signal) => (
    signal.strength === "explicit" &&
    signal.isHome === true
  ));
}

function hasAmbientHomeSignal(signals = []) {
  return signals.some((signal) => (
    signal.strength === "ambient" &&
    signal.isHome === true
  ));
}

function isIgnorableUsernameRootSignal(signal = {}, signals = []) {
  if (
    !signal ||
    signal.isHome !== false
  ) {
    return false;
  }

  if (
    !isSinglePublicUsernameRoot(
      signal.value || "",
      {
        allowUnknownSlug: isRawAppRouteHome(),
      }
    )
  ) {
    return false;
  }

  return hasPositiveHomeSignal(signals);
}

function isIgnorablePublicPathSignal(signal = {}, signals = []) {
  if (
    !signal ||
    signal.isHome !== false ||
    !signal.isPublicPath
  ) {
    return false;
  }

  /*
     Sólo se ignora un publicPath no-home si realmente era
     una raíz pública de usuario y existe señal positiva Home.
     No ignorar /@usuario/incidencias.
  */
  if (
    isSinglePublicUsernameRoot(
      signal.value || "",
      {
        allowUnknownSlug: isRawAppRouteHome(),
      }
    )
  ) {
    return hasPositiveHomeSignal(signals);
  }

  return false;
}

function getBrowserBlockingSignal(signals = []) {
  return (
    signals.find((signal) => (
      signal.strength === "browser" &&
      signal.type === "path" &&
      signal.isHome === false &&
      !isIgnorableUsernameRootSignal(signal, signals) &&
      !isIgnorablePublicPathSignal(signal, signals)
    )) ||
    null
  );
}

function getExplicitBlockingSignal(signals = []) {
  return (
    signals.find((signal) => (
      signal.strength === "explicit" &&
      signal.type === "path" &&
      signal.isHome === false &&
      !signal.isPublicPath &&
      !isIgnorableUsernameRootSignal(signal, signals) &&
      !isIgnorablePublicPathSignal(signal, signals)
    )) ||
    null
  );
}

function getHomeRouteDebug(args = []) {
  const signals = collectSignals(args);

  const browserBlock = getBrowserBlockingSignal(signals);
  const explicitBlock = getExplicitBlockingSignal(signals);

  const browserPath = getBrowserPath();
  const browserCanonicalPath =
    canonicalizeHomePath(
      browserPath || HOME_PATH,
      {
        allowUnknownSlug: isRawAppRouteHome(),
      }
    );

  const allowed = Boolean(
    !browserBlock &&
      !explicitBlock &&
      (
        hasPositiveHomeSignal(signals) ||
        isHomePath(
          browserPath || HOME_PATH,
          {
            allowUnknownSlug: isRawAppRouteHome(),
          }
        )
      )
  );

  return {
    source: SOURCE,
    version: HOME_INDEX_VERSION,
    allowed,

    browserPath,
    browserCanonicalPath,

    appCanonicalPath: getAppCanonicalPath(),
    appPublicPath: getAppPublicPath(),
    appViewKey: getAppViewKey(),

    signals,
    browserBlock,
    explicitBlock,

    hasPositiveHomeSignal: hasPositiveHomeSignal(signals),
    hasExplicitHomeSignal: hasExplicitHomeSignal(signals),
    hasAmbientHomeSignal: hasAmbientHomeSignal(signals),
  };
}

function canRenderHomeNow(...args) {
  return getHomeRouteDebug(args).allowed;
}

function shouldAllowHome(method = "unknown", args = []) {
  const debug = getHomeRouteDebug(args);

  if (debug.allowed) {
    safeLog(`${method} permitido`, debug);
    return true;
  }

  safeWarnOnce(
    `blocked:${method}:${debug.browserPath}:${debug.appCanonicalPath}:${debug.appPublicPath}`,
    `HomeView.${method} bloqueado: la ruta activa no es Home.`,
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

  safeWarnOnce(
    "missing-init",
    "HomeView no expone init/mount/render."
  );

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

  safeWarnOnce(
    "missing-render",
    "HomeView no expone render."
  );

  return null;
}

function scheduleRender(...args) {
  return render(...args);
}

async function reload(options = {}) {
  const opts = safeObject(options);

  if (isFunction(HomeView?.reload)) {
    return HomeView.reload(opts);
  }

  if (isFunction(HomeView?.refresh)) {
    return HomeView.refresh(opts);
  }

  return init({
    route: {
      path: HOME_PATH,
      canonicalPath: HOME_PATH,
      viewKey: "home",
      routeKey: "home",
    },
    canonicalPath: HOME_PATH,
    publicPath: getAppPublicPath() || HOME_PATH,
    options: opts,
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
    version: HOME_INDEX_VERSION,
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

function getInvoices() {
  if (isFunction(HomeView?.getInvoices)) {
    return HomeView.getInvoices();
  }

  if (isFunction(HomeView?.getFacturas)) {
    return HomeView.getFacturas();
  }

  return [];
}

function getUsers() {
  if (isFunction(HomeView?.getUsers)) {
    return HomeView.getUsers();
  }

  if (isFunction(HomeView?.getUsuarios)) {
    return HomeView.getUsuarios();
  }

  return [];
}

function getClients() {
  if (isFunction(HomeView?.getClients)) {
    return HomeView.getClients();
  }

  if (isFunction(HomeView?.getClientes)) {
    return HomeView.getClientes();
  }

  return [];
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

function openIncidencia(payload = {}) {
  if (isFunction(HomeView?.openIncidencia)) {
    return HomeView.openIncidencia(payload);
  }

  return openTicket(payload);
}

function createIncidencia(draft = {}) {
  if (isFunction(HomeView?.createIncidencia)) {
    return HomeView.createIncidencia(draft);
  }

  return false;
}

function navigateTo(route = "", options = {}) {
  if (isFunction(HomeView?.navigateTo)) {
    return HomeView.navigateTo(route, options);
  }

  if (isFunction(HomeView?.navigate)) {
    return HomeView.navigate(route, options);
  }

  return false;
}

/* =========================================================
   API
========================================================= */

const api = {
  source: SOURCE,
  version: HOME_INDEX_VERSION,

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
  getDebugSnapshot: getSnapshot,

  getItems,
  getTickets,
  getInvoices,
  getFacturas: getInvoices,
  getUsers,
  getUsuarios: getUsers,
  getClients,
  getClientes: getClients,

  openTicket,
  openIncidencia,
  createIncidencia,

  navigateTo,
  navigate: navigateTo,

  canRenderHomeNow,
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

function defineGlobalBridge(name = "", value = null) {
  if (!isBrowser()) {
    return false;
  }

  const finalName = safeText(name, "");

  if (!finalName) {
    return false;
  }

  try {
    Object.defineProperty(
      window,
      finalName,
      {
        value,
        configurable: true,
        enumerable: false,
        writable: false,
      }
    );

    return true;
  } catch {
    try {
      window[finalName] = value;
      return true;
    } catch {
      return false;
    }
  }
}

defineGlobalBridge("HomeIndex", api);
defineGlobalBridge("OnionHomeIndex", api);

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
  getInvoices,
  getUsers,
  getClients,

  openTicket,
  openIncidencia,
  createIncidencia,

  navigateTo,

  canRenderHomeNow,
  getHomeRouteDebug,
};

export default api;
