import { PUBLIC_SITE } from "../core/public-site.js";

/* =========================================================
   Onion Support - Routes
   Archivo: /src/router/routes.js

   PRODUCTIVO · LAZY INDEXED · ACTIVATION PATH TOKEN HARDENED

   Responsabilidad:
   - Tabla mínima de rutas SPA.
   - Vistas lazy.
   - Cachear imports y vistas resueltas.
   - Deduplicar imports compartidos entre viewKeys.
   - Exponer preload de vistas para navegación rápida.
   - Resolver /@{slug} hacia ruta interna privada.
   - Marcar rutas públicas, privadas, admin y token routes.
   - Rutas públicas viven en /src/views/public/*.
   - Resolver aliases legacy de password reset SIN exponer el token.
   - Resolver /activate-account/<token> hacia /activate-account SIN extraerlo.
   - Mantener token únicamente en la URL/contexto efímero del Router/vista.
   - No devolver tokens de pathname en snapshots/debug.
   - Cooperar con AbortSignal del Router sin introducir Auth/guards.
   - Lookups O(1) por path/name/viewKey.
   - Sin Auth.
   - Sin guards.
   - Sin history.
   - Sin storage.
   - Sin Toast.
   - Sin shell.
========================================================= */

import {
  ROUTES,
  USER_HOME_PREFIX,
  ALLOWED_ROLES,
  PUBLIC_ROUTES,
  PROTECTED_PUBLIC_TOKEN_ROUTES,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
} from "../core/config.js";

export const ROUTES_VERSION =
  "routes.minimal.v8.4-canonical-visibility";

/* =========================================================
   PATHS / NAMES
========================================================= */

export const ROUTE_PATHS = Object.freeze({
  PUBLIC_HOME: "/",

  HOME:
    ROUTES.privateHome ||
    ROUTES.dashboard ||
    "/dashboard",

  INCIDENCIAS:
    ROUTES.incidencias ||
    "/incidencias",

  FACTURAS:
    ROUTES.facturas ||
    "/facturas",

  CLIENTES:
    ROUTES.clientes ||
    "/clientes",

  USUARIOS:
    ROUTES.usuarios ||
    "/usuarios",

  EMPLEADOS:
    ROUTES.empleados ||
    "/empleados",

  CORREO:
    ROUTES.correo ||
    "/correo",

  SERVIDOR:
    ROUTES.servidor ||
    "/servidor",

  CUENTA:
    ROUTES.cuenta ||
    "/cuenta",

  AJUSTES:
    ROUTES.ajustes ||
    "/ajustes",

  LOGIN:
    ROUTES.login ||
    "/login",

  PASSWORD_REQUEST:
    ROUTES.passwordRequest ||
    "/password-request",

  PASSWORD_RESET:
    ROUTES.passwordReset ||
    "/password-reset",

  ACTIVATE_ACCOUNT:
    ROUTES.activateAccount ||
    "/activate-account",
});

export const ROUTE_NAMES = Object.freeze({
  PUBLIC_HOME: "public-home",
  HOME: "home",
  INCIDENCIAS: "incidencias",
  FACTURAS: "facturas",
  CLIENTES: "clientes",
  USUARIOS: "usuarios",
  EMPLEADOS: "empleados",
  CORREO: "correo",
  SERVIDOR: "servidor",
  CUENTA: "cuenta",
  AJUSTES: "ajustes",
  LOGIN: "login",
  PASSWORD_REQUEST: "password-request",
  PASSWORD_RESET: "password-reset",
  ACTIVATE_ACCOUNT: "activate-account",
});

export const VALID_ROLES = Object.freeze(
  Array.isArray(ALLOWED_ROLES) && ALLOWED_ROLES.length
    ? [
        ...new Set(
          ALLOWED_ROLES.map((role) =>
            String(role).toLowerCase()
          )
        ),
      ]
    : ["admin", "user"]
);

export const ADMIN_ROLES = Object.freeze([
  "admin",
]);

/*
  Aliases exactos únicamente de compatibilidad.

  Password reset nuevo:
    /password-reset?token=...

  Activación productiva del backend:
    /activate-account/<TOKEN>

  El alias dinámico de activación se resuelve más abajo sin leer,
  decodificar, persistir ni devolver el token.
*/
export const ROUTE_ALIASES = Object.freeze({
  "/reset-password":
    ROUTE_PATHS.PASSWORD_RESET,

  "/reset-password/confirm":
    ROUTE_PATHS.PASSWORD_RESET,

  "/password-reset/confirm":
    ROUTE_PATHS.PASSWORD_RESET,
});

/* =========================================================
   BASICS
========================================================= */

function cleanText(
  value = "",
  fallback = ""
) {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizePath(path = "/") {
  try {
    return (
      configNormalizeRoutePath(path) ||
      "/"
    );
  } catch {
    let value = cleanText(path, "/")
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || "/";
    }

    return value || "/";
  }
}

function cleanName(value = "") {
  return cleanText(value, "route")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 96);
}

function normalizePathList(paths = []) {
  const seen = new Set();

  for (
    const path of Array.isArray(paths)
      ? paths
      : []
  ) {
    const clean = normalizePath(path);

    if (!clean) continue;

    if (clean.startsWith(USER_HOME_PREFIX)) {
      continue;
    }

    try {
      if (isBlockedRoutePath(clean)) {
        continue;
      }
    } catch {
      continue;
    }

    seen.add(clean);
  }

  return Object.freeze([...seen]);
}

function pathInList(
  path = "/",
  paths = []
) {
  return paths.includes(
    normalizePath(path)
  );
}

function tokenRoutePathsFromConfig() {
  const paths = [];

  for (
    const item of Array.isArray(
      PROTECTED_PUBLIC_TOKEN_ROUTES
    )
      ? PROTECTED_PUBLIC_TOKEN_ROUTES
      : []
  ) {
    if (item?.path) {
      paths.push(item.path);
    }

    if (Array.isArray(item?.paths)) {
      paths.push(...item.paths);
    }
  }

  return normalizePathList(
    paths.length
      ? paths
      : [
          ROUTE_PATHS.PASSWORD_RESET,
          ROUTE_PATHS.ACTIVATE_ACCOUNT,
        ]
  );
}

function pickView(
  module,
  names = []
) {
  for (
    const name of Array.isArray(names)
      ? names
      : []
  ) {
    if (module?.[name]) {
      return module[name];
    }
  }

  return module?.default || module;
}

function resolveRenderer(
  view,
  viewKey = ""
) {
  if (isFunction(view)) {
    return view;
  }

  if (isFunction(view?.init)) {
    return view.init.bind(view);
  }

  if (isFunction(view?.mount)) {
    return view.mount.bind(view);
  }

  if (isFunction(view?.render)) {
    return view.render.bind(view);
  }

  throw new Error(
    `La vista "${viewKey}" no expone init(), mount() ni render().`
  );
}

function createAbortError(
  reason = "route-view-aborted"
) {
  try {
    return new DOMException(
      reason,
      "AbortError"
    );
  } catch {
    const error = new Error(reason);

    error.name = "AbortError";
    error.code = "ROUTE_VIEW_ABORTED";

    return error;
  }
}

function throwIfAborted(
  signal = null
) {
  if (signal?.aborted !== true) {
    return false;
  }

  throw createAbortError(
    cleanText(
      signal.reason,
      "route-view-aborted"
    )
  );
}

/* =========================================================
   PUBLIC / TOKEN ROUTES
========================================================= */

export const PUBLIC_AUTH_ROUTES = normalizePathList(
  Array.isArray(PUBLIC_ROUTES) &&
  PUBLIC_ROUTES.length
    ? PUBLIC_ROUTES
    : [
        ROUTE_PATHS.LOGIN,
        ROUTE_PATHS.PASSWORD_REQUEST,
        ROUTE_PATHS.PASSWORD_RESET,
        ROUTE_PATHS.ACTIVATE_ACCOUNT,
      ]
);

export const TOKEN_ROUTE_PATHS =
  tokenRoutePathsFromConfig();

/* =========================================================
   ALIASES
========================================================= */

function matchAliasBase(
  path = "",
  alias = ""
) {
  const cleanPath = normalizePath(path);
  const cleanAlias = normalizePath(alias);

  return (
    cleanPath === cleanAlias ||
    cleanPath.startsWith(`${cleanAlias}/`)
  );
}

function isSingleSegmentChildPath(
  path = "",
  base = ""
) {
  const cleanPath = normalizePath(path);
  const cleanBase = normalizePath(base);

  if (
    !cleanPath ||
    !cleanBase ||
    cleanPath === cleanBase ||
    !cleanPath.startsWith(`${cleanBase}/`)
  ) {
    return false;
  }

  const suffix = cleanPath.slice(
    cleanBase.length + 1
  );

  return Boolean(
    suffix &&
    !suffix.includes("/")
  );
}


const PRIVATE_DETAIL_TICKET_PATTERN =
  /^INC-[A-Z0-9-]{6,120}$/i;

function resolvePrivateDetailRoutePath(
  path = "/"
) {
  const clean = normalizePath(path);
  const scoped = getUserScopedRouteInfo(clean);
  const candidate = scoped.scoped
    ? (
        scoped.restPath ||
        scoped.canonicalPath ||
        "/"
      )
    : clean;

  if (
    isSingleSegmentChildPath(
      candidate,
      ROUTE_PATHS.INCIDENCIAS
    )
  ) {
    const suffix = candidate.slice(
      ROUTE_PATHS.INCIDENCIAS.length + 1
    );

    if (PRIVATE_DETAIL_TICKET_PATTERN.test(suffix)) {
      return ROUTE_PATHS.INCIDENCIAS;
    }
  }

  if (
    isSingleSegmentChildPath(
      candidate,
      "/tickets"
    )
  ) {
    const suffix = candidate.slice("/tickets/".length);

    if (PRIVATE_DETAIL_TICKET_PATTERN.test(suffix)) {
      return ROUTE_PATHS.INCIDENCIAS;
    }
  }

  return "";
}

function resolvePublicAliasPath(
  path = "/"
) {
  const clean = normalizePath(path);

  /* Exactos primero. */
  if (ROUTE_ALIASES[clean]) {
    return normalizePath(
      ROUTE_ALIASES[clean]
    );
  }

  /*
    Correos legacy de password reset:
      /reset-password/confirm/<token>
      /password-reset/confirm/<token>

    No extraemos el token aquí.
  */
  if (
    matchAliasBase(
      clean,
      "/reset-password/confirm"
    ) ||
    matchAliasBase(
      clean,
      "/password-reset/confirm"
    )
  ) {
    return ROUTE_PATHS.PASSWORD_RESET;
  }

  /*
    Contrato productivo de activación del backend:
      /activate-account/<TOKEN>

    Únicamente aceptamos UN segmento opaco tras la ruta canónica.
    El token permanece en la URL/contexto de navegación y lo consume
    exclusivamente la vista de activación.
  */
  if (
    isSingleSegmentChildPath(
      clean,
      ROUTE_PATHS.ACTIVATE_ACCOUNT
    )
  ) {
    return ROUTE_PATHS.ACTIVATE_ACCOUNT;
  }

  return clean;
}

export function isRouteAlias(
  path = "/"
) {
  const clean = normalizePath(path);

  return (
    resolvePublicAliasPath(clean) !==
    clean
  );
}

/* =========================================================
   USER SCOPE
========================================================= */

export function normalizeRoutePath(
  path = "/"
) {
  return normalizePath(path);
}

export function normalizeUserHomeSlug(
  value = ""
) {
  try {
    return normalizeUserSlug(value) || "";
  } catch {
    return "";
  }
}

export function getUserScopedRouteInfo(
  path = "/"
) {
  try {
    return configGetUserScopedRouteInfo(path);
  } catch {
    const clean = normalizePath(path);

    if (!clean.startsWith(USER_HOME_PREFIX)) {
      return {
        scoped: false,
        home: false,
        slug: "",
        restPath: clean,
        canonicalPath: clean,
        lookupPath: clean,
      };
    }

    const rest = clean.slice(
      USER_HOME_PREFIX.length
    );

    const [
      slugSegment = "",
      ...segments
    ] = rest.split("/");

    const slug = normalizeUserHomeSlug(
      slugSegment
    );

    if (!slug) {
      return {
        scoped: false,
        home: false,
        slug: "",
        restPath: clean,
        canonicalPath: clean,
        lookupPath: clean,
      };
    }

    const restPath = segments.length
      ? normalizePath(
          `/${segments.join("/")}`
        )
      : "/";

    return {
      scoped: true,
      home: restPath === "/",
      slug,
      restPath,
      canonicalPath: restPath,
      lookupPath: restPath,
    };
  }
}

export function resolveRouteLookupPath(
  path = "/"
) {
  const clean = normalizePath(path);

  if (!clean) return "";

  try {
    if (isBlockedRoutePath(clean)) {
      return "";
    }
  } catch {
    return "";
  }

  const privateDetailLookup =
    resolvePrivateDetailRoutePath(
      clean
    );

  if (privateDetailLookup) {
    return privateDetailLookup;
  }

  const scoped = getUserScopedRouteInfo(
    clean
  );

  /* Alias público sólo si NO vive bajo /@{slug}. */
  if (!scoped.scoped) {
    return resolvePublicAliasPath(clean);
  }

  const rawLookup = scoped.home
    ? ROUTE_PATHS.HOME
    : (
        scoped.canonicalPath ||
        scoped.restPath ||
        "/"
      );

  /*
    Rutas públicas y aliases públicos nunca son válidos
    bajo /@{slug}.
  */
  const aliasLookup = resolvePublicAliasPath(
    rawLookup
  );

  if (
    aliasLookup !== normalizePath(rawLookup) ||
    pathInList(
      aliasLookup,
      PUBLIC_AUTH_ROUTES
    )
  ) {
    return "";
  }

  return normalizePath(rawLookup);
}

export function getUserHomeSlugFromPath(
  path = "/"
) {
  const info = getUserScopedRouteInfo(path);

  return info.home
    ? info.slug
    : "";
}

export function getUserScopedSlugFromPath(
  path = "/"
) {
  const info = getUserScopedRouteInfo(path);

  return info.scoped
    ? info.slug
    : "";
}

export function getUserScopedRestPath(
  path = "/"
) {
  const info = getUserScopedRouteInfo(path);

  return info.scoped
    ? (
        info.restPath ||
        info.canonicalPath ||
        "/"
      )
    : "";
}

export function isUserScopedPath(
  path = "/"
) {
  return (
    getUserScopedRouteInfo(path)
      .scoped === true
  );
}

export function isUserHomePath(
  path = "/"
) {
  return (
    getUserScopedRouteInfo(path)
      .home === true
  );
}

export function isHomePath(
  path = "/"
) {
  const clean = normalizePath(path);

  return (
    clean === ROUTE_PATHS.PUBLIC_HOME ||
    clean === ROUTE_PATHS.HOME ||
    isUserHomePath(clean)
  );
}

/* =========================================================
   VIEW SPECS / MODULE LOADERS
========================================================= */

const VIEW_SPECS = Object.freeze({
  "public-home": Object.freeze({
    moduleKey: "public-home",
    loadModule: () =>
      import(
        "../views/public/home/index.js"
      ),
    names: Object.freeze([
      "PublicHomeView",
    ]),
  }),

  home: Object.freeze({
    moduleKey: "home",
    loadModule: () =>
      import(
        "../views/home/index.js"
      ),
    names: Object.freeze([
      "HomeView",
    ]),
  }),

  incidencias: Object.freeze({
    moduleKey: "incidencias",
    loadModule: () =>
      import(
        "../views/incidencias/index.js"
      ),
    names: Object.freeze([
      "IncidenciasView",
    ]),
  }),

  facturas: Object.freeze({
    moduleKey: "facturas",
    loadModule: () =>
      import(
        "../views/facturas/index.js"
      ),
    names: Object.freeze([
      "FacturasView",
    ]),
  }),

  clientes: Object.freeze({
    moduleKey: "clientes",
    loadModule: () =>
      import(
        "../views/clientes/index.js"
      ),
    names: Object.freeze([
      "ClientesView",
    ]),
  }),

  usuarios: Object.freeze({
    moduleKey: "usuarios",
    loadModule: () =>
      import(
        "../views/usuarios/index.js"
      ),
    names: Object.freeze([
      "UsuariosView",
    ]),
  }),

  empleados: Object.freeze({
    moduleKey: "empleados",
    loadModule: () =>
      import(
        "../views/empleados/index.js"
      ),
    names: Object.freeze([
      "EmpleadosView",
    ]),
  }),

  correo: Object.freeze({
    moduleKey: "correo",
    loadModule: () =>
      import(
        "../views/correo/index.js"
      ),
    names: Object.freeze([
      "CorreoView",
    ]),
  }),

  servidor: Object.freeze({
    moduleKey: "servidor",
    loadModule: () =>
      import(
        "../views/server/index.js"
      ),
    names: Object.freeze([
      "ServidorView",
      "ServerView",
    ]),
  }),

  cuenta: Object.freeze({
    moduleKey: "cuenta",
    loadModule: () =>
      import(
        "../views/cuenta/index.js"
      ),
    names: Object.freeze([
      "CuentaView",
    ]),
  }),

  ajustes: Object.freeze({
    moduleKey: "cuenta",
    loadModule: () =>
      import(
        "../views/cuenta/index.js"
      ),
    names: Object.freeze([
      "CuentaView",
    ]),
  }),

  login: Object.freeze({
    moduleKey: "login",
    loadModule: () =>
      import(
        "../views/public/login/index.js"
      ),
    names: Object.freeze([
      "LoginView",
    ]),
  }),

  "password-request": Object.freeze({
    moduleKey: "password-reset-public",

    /*
      CI CONTRACT — mantener literal exacto:
      import("../views/public/password-reset/index.js")
      "PasswordRequestView"
    */
    loadModule:
      () => import("../views/public/password-reset/index.js"),

    names: Object.freeze([
      "PasswordRequestView",
      "PasswordResetView",
      "ResetPasswordView",
    ]),
  }),

  "password-reset": Object.freeze({
    moduleKey: "password-reset-public",
    loadModule:
      () => import("../views/public/password-reset/index.js"),
    names: Object.freeze([
      "PasswordResetView",
      "ResetPasswordView",
    ]),
  }),

  "activate-account": Object.freeze({
    moduleKey: "activate-account",
    loadModule: () =>
      import(
        "../views/public/activate-account/index.js"
      ),
    names: Object.freeze([
      "ActivateAccountView",
    ]),
  }),
});

/*
  Contrato interno histórico.
*/
const VIEW_LOADERS = Object.freeze(
  Object.fromEntries(
    Object.entries(VIEW_SPECS).map(
      ([key]) => [
        key,
        () => loadView(key),
      ]
    )
  )
);

const MODULE_PROMISE_CACHE = new Map();
const MODULE_RESOLVED_CACHE = new Map();
const VIEW_PROMISE_CACHE = new Map();
const VIEW_RESOLVED_CACHE = new Map();
const VIEW_FAILURES = new Map();

function getViewSpec(viewKey = "") {
  const key = cleanName(viewKey);

  return VIEW_SPECS[key] || null;
}

async function loadModuleOnce(spec = null) {
  if (
    !spec ||
    !isFunction(spec.loadModule)
  ) {
    throw new Error(
      "Especificación de módulo de vista inválida."
    );
  }

  const moduleKey = cleanName(
    spec.moduleKey ||
    "view-module"
  );

  if (MODULE_RESOLVED_CACHE.has(moduleKey)) {
    return MODULE_RESOLVED_CACHE.get(moduleKey);
  }

  if (!MODULE_PROMISE_CACHE.has(moduleKey)) {
    const promise = Promise.resolve()
      .then(() => spec.loadModule())
      .then((module) => {
        MODULE_RESOLVED_CACHE.set(
          moduleKey,
          module
        );

        return module;
      })
      .catch((error) => {
        MODULE_PROMISE_CACHE.delete(moduleKey);
        MODULE_RESOLVED_CACHE.delete(moduleKey);
        throw error;
      });

    MODULE_PROMISE_CACHE.set(
      moduleKey,
      promise
    );
  }

  return MODULE_PROMISE_CACHE.get(moduleKey);
}

async function loadView(
  viewKey = "",
  options = {}
) {
  const key = cleanName(viewKey);
  const spec = getViewSpec(key);

  if (!spec) {
    throw new Error(
      `Vista no encontrada: "${key}".`
    );
  }

  throwIfAborted(options.signal || null);

  if (VIEW_RESOLVED_CACHE.has(key)) {
    return VIEW_RESOLVED_CACHE.get(key);
  }

  if (!VIEW_PROMISE_CACHE.has(key)) {
    const promise = Promise.resolve()
      .then(() => loadModuleOnce(spec))
      .then((module) => {
        const view = pickView(
          module,
          spec.names
        );

        resolveRenderer(view, key);

        VIEW_RESOLVED_CACHE.set(key, view);
        VIEW_FAILURES.delete(key);

        return view;
      })
      .catch((error) => {
        VIEW_PROMISE_CACHE.delete(key);
        VIEW_RESOLVED_CACHE.delete(key);

        VIEW_FAILURES.set(
          key,
          Object.freeze({
            name: cleanText(
              error?.name,
              "Error"
            ),
            message: cleanText(
              error?.message,
              "No se pudo cargar la vista."
            ).slice(0, 500),
            at: new Date().toISOString(),
          })
        );

        throw error;
      });

    VIEW_PROMISE_CACHE.set(key, promise);
  }

  const view = await VIEW_PROMISE_CACHE.get(key);

  throwIfAborted(options.signal || null);

  return view;
}

function createRender(viewKey = "") {
  const key = cleanName(viewKey);

  return async function render(
    host = null,
    context = {}
  ) {
    const safeContext = isObject(context)
      ? context
      : {};

    const signal = safeContext.signal || null;

    throwIfAborted(signal);

    const view = await loadView(
      key,
      { signal }
    );

    throwIfAborted(signal);

    const renderer = resolveRenderer(
      view,
      key
    );

    return renderer(
      host,
      {
        ...safeContext,
        viewKey: key,
        routeViewKey: key,
      }
    );
  };
}

/* =========================================================
   VIEW PRELOAD API
========================================================= */

export function hasRouteViewLoader(
  viewKey = ""
) {
  return Boolean(
    getViewSpec(viewKey)
  );
}

export function isRouteViewLoaded(
  viewKey = ""
) {
  return VIEW_RESOLVED_CACHE.has(
    cleanName(viewKey)
  );
}

export function isRouteViewLoading(
  viewKey = ""
) {
  const key = cleanName(viewKey);

  return Boolean(
    VIEW_PROMISE_CACHE.has(key) &&
    !VIEW_RESOLVED_CACHE.has(key)
  );
}

export function preloadRouteView(
  viewKey = "",
  options = {}
) {
  const key = cleanName(viewKey);

  if (!getViewSpec(key)) {
    return Promise.resolve(null);
  }

  return loadView(
    key,
    {
      signal: options?.signal || null,
    }
  ).catch((error) => {
    if (error?.name === "AbortError") {
      return null;
    }

    return null;
  });
}

export function preloadRouteByPath(
  path = "/",
  options = {}
) {
  const route = getRouteByPath(path);

  if (!route?.viewKey) {
    return Promise.resolve(null);
  }

  return preloadRouteView(
    route.viewKey,
    options
  );
}

export function preloadRouteByName(
  name = "",
  options = {}
) {
  const route = getRouteByName(name);

  if (!route?.viewKey) {
    return Promise.resolve(null);
  }

  return preloadRouteView(
    route.viewKey,
    options
  );
}

export function preloadRouteByViewKey(
  viewKey = "",
  options = {}
) {
  return preloadRouteView(
    viewKey,
    options
  );
}

function resolvePreloadViewKey(value = null) {
  if (isObject(value)) {
    if (value.viewKey) {
      return cleanName(value.viewKey);
    }

    if (value.path) {
      return (
        getRouteByPath(value.path)
          ?.viewKey ||
        ""
      );
    }

    if (value.name) {
      return (
        getRouteByName(value.name)
          ?.viewKey ||
        ""
      );
    }

    return "";
  }

  const valueText = cleanText(value, "");

  if (!valueText) return "";

  if (valueText.startsWith("/")) {
    return (
      getRouteByPath(valueText)
        ?.viewKey ||
      ""
    );
  }

  if (hasRouteViewLoader(valueText)) {
    return cleanName(valueText);
  }

  return (
    getRouteByName(valueText)
      ?.viewKey ||
    ""
  );
}

export function preloadRoutes(
  values = [],
  options = {}
) {
  const list = Array.isArray(values)
    ? values
    : [values];

  const uniqueViewKeys = new Set();

  for (const value of list) {
    const viewKey = resolvePreloadViewKey(value);

    if (
      viewKey &&
      hasRouteViewLoader(viewKey)
    ) {
      uniqueViewKeys.add(viewKey);
    }
  }

  return Promise.allSettled(
    [...uniqueViewKeys].map(
      (viewKey) =>
        preloadRouteView(
          viewKey,
          options
        )
    )
  );
}

export function preloadPrivateRouteViews(
  options = {}
) {
  return preloadRoutes(
    getImmutableRoutes()
      .filter(
        (route) =>
          route.public !== true
      )
      .map(
        (route) =>
          route.viewKey
      ),
    options
  );
}

export function getLoadedRouteViewKeys() {
  return [...VIEW_RESOLVED_CACHE.keys()];
}

export function getLoadingRouteViewKeys() {
  return [...VIEW_PROMISE_CACHE.keys()]
    .filter(
      (key) =>
        !VIEW_RESOLVED_CACHE.has(key)
    );
}

/* =========================================================
   ROUTES
========================================================= */

function createRoute({
  path,
  name,
  title,
  viewKey,
  public: isPublic = false,
  guestOnly = false,
  adminOnly = false,
  tokenRoute = false,
  showInSidebar = true,
  searchable = true,
  order = 0,
}) {
  const finalPath = normalizePath(path);

  const finalName = cleanName(
    name ||
    viewKey ||
    finalPath
  );

  const finalViewKey = cleanName(
    viewKey ||
    finalName
  );

  const finalPublic = Boolean(
    isPublic ||
    pathInList(
      finalPath,
      PUBLIC_AUTH_ROUTES
    )
  );

  const finalTokenRoute = Boolean(
    tokenRoute ||
    pathInList(
      finalPath,
      TOKEN_ROUTE_PATHS
    )
  );

  let finalAdminOnly = Boolean(adminOnly);

  try {
    finalAdminOnly = Boolean(
      finalAdminOnly ||
      configIsAdminRoute(finalPath)
    );
  } catch {
    // declaración explícita sigue siendo autoridad
  }

  if (!finalPath) {
    throw new Error(
      `Ruta no permitida: "${path}".`
    );
  }

  try {
    if (isBlockedRoutePath(finalPath)) {
      throw new Error(
        `Ruta no permitida: "${path}".`
      );
    }
  } catch (error) {
    if (
      error?.message?.startsWith(
        "Ruta no permitida:"
      )
    ) {
      throw error;
    }
  }

  if (finalPath.startsWith(USER_HOME_PREFIX)) {
    throw new Error(
      `No se declaran rutas reales bajo "${USER_HOME_PREFIX}".`
    );
  }

  if (finalPublic && finalAdminOnly) {
    throw new Error(
      `Una ruta pública no puede ser admin-only: "${finalPath}".`
    );
  }

  if (finalTokenRoute && !finalPublic) {
    throw new Error(
      `Una token route debe ser pública: "${finalPath}".`
    );
  }

  if (!hasRouteViewLoader(finalViewKey)) {
    throw new Error(
      `No existe loader para la vista "${finalViewKey}".`
    );
  }

  return Object.freeze({
    id: finalName,
    version: ROUTES_VERSION,
    path: finalPath,
    canonicalPath: finalPath,
    name: finalName,
    title: cleanText(title, finalName),
    viewKey: finalViewKey,
    viewName: finalViewKey,
    public: finalPublic,
    private: !finalPublic,
    requiresAuth: !finalPublic,
    guestOnly: Boolean(guestOnly),
    publicOnly: Boolean(guestOnly),
    adminOnly: finalAdminOnly,
    requiresAdmin: finalAdminOnly,
    roles: finalAdminOnly
      ? ADMIN_ROLES
      : [],
    tokenRoute: finalTokenRoute,
    publicTokenRoute: finalTokenRoute,
    preserveSearch:
      finalPublic ||
      finalTokenRoute,
    preserveHash:
      finalPublic ||
      finalTokenRoute,
    hideShell: finalPublic,
    showShell: !finalPublic,
    shell: !finalPublic,
    layout: finalPublic
      ? "auth"
      : "app",
    sidebar:
      !finalPublic &&
      showInSidebar !== false,
    showInSidebar:
      !finalPublic &&
      showInSidebar !== false,
    searchable:
      !finalPublic &&
      searchable !== false,
    sidebarKey: finalViewKey,
    order: Number(order) || 0,
    render: createRender(finalViewKey),
    preload: (options = {}) =>
      preloadRouteView(
        finalViewKey,
        options
      ),
  });
}

const ROUTE_DEFINITIONS = Object.freeze([
  createRoute({
    path: ROUTE_PATHS.PUBLIC_HOME,
    name: ROUTE_NAMES.PUBLIC_HOME,
    title: PUBLIC_SITE.name,
    viewKey: "public-home",
    public: true,
    guestOnly: false,
    order: 1,
  }),

  createRoute({
    path: ROUTE_PATHS.HOME,
    name: ROUTE_NAMES.HOME,
    title: "Inicio",
    viewKey: "home",
    order: 10,
  }),

  createRoute({
    path: ROUTE_PATHS.INCIDENCIAS,
    name: ROUTE_NAMES.INCIDENCIAS,
    title: "Incidencias",
    viewKey: "incidencias",
    order: 20,
  }),

  createRoute({
    path: ROUTE_PATHS.FACTURAS,
    name: ROUTE_NAMES.FACTURAS,
    title: "Facturas",
    viewKey: "facturas",
    order: 30,
  }),

  createRoute({
    path: ROUTE_PATHS.CLIENTES,
    name: ROUTE_NAMES.CLIENTES,
    title: "Clientes",
    viewKey: "clientes",
    adminOnly: true,
    order: 40,
  }),

  createRoute({
    path: ROUTE_PATHS.USUARIOS,
    name: ROUTE_NAMES.USUARIOS,
    title: "Usuarios",
    viewKey: "usuarios",
    adminOnly: true,
    order: 50,
  }),

  createRoute({
    path: ROUTE_PATHS.EMPLEADOS,
    name: ROUTE_NAMES.EMPLEADOS,
    title: "Empleados",
    viewKey: "empleados",
    adminOnly: true,
    order: 58,
  }),

  createRoute({
    path: ROUTE_PATHS.CORREO,
    name: ROUTE_NAMES.CORREO,
    title: "Correo",
    viewKey: "correo",
    adminOnly: true,
    order: 55,
  }),

  createRoute({
    path: ROUTE_PATHS.SERVIDOR,
    name: ROUTE_NAMES.SERVIDOR,
    title: "Servidor",
    viewKey: "servidor",
    adminOnly: true,
    order: 60,
  }),

  createRoute({
    path: ROUTE_PATHS.CUENTA,
    name: ROUTE_NAMES.CUENTA,
    title: "Cuenta",
    viewKey: "cuenta",
    order: 70,
  }),

  createRoute({
    path: ROUTE_PATHS.AJUSTES,
    name: ROUTE_NAMES.AJUSTES,
    title: "Ajustes",
    viewKey: "ajustes",
    showInSidebar: false,
    searchable: false,
    order: 80,
  }),

  createRoute({
    path: ROUTE_PATHS.LOGIN,
    name: ROUTE_NAMES.LOGIN,
    title: "Acceso",
    viewKey: "login",
    public: true,
    guestOnly: true,
    order: 100,
  }),

  createRoute({
    path: ROUTE_PATHS.PASSWORD_REQUEST,
    name: ROUTE_NAMES.PASSWORD_REQUEST,
    title: "Recuperar acceso",

    /* CI CONTRACT — mantener literal exacto. */
    viewKey: "password-request",

    public: true,
    order: 110,
  }),

  createRoute({
    path: ROUTE_PATHS.PASSWORD_RESET,
    name: ROUTE_NAMES.PASSWORD_RESET,
    title: "Nueva contraseña",
    viewKey: "password-reset",
    public: true,
    tokenRoute: true,
    order: 120,
  }),

  createRoute({
    path: ROUTE_PATHS.ACTIVATE_ACCOUNT,
    name: ROUTE_NAMES.ACTIVATE_ACCOUNT,
    title: "Activar cuenta",
    viewKey: "activate-account",
    public: true,
    tokenRoute: true,
    order: 130,
  }),
]);

/* =========================================================
   ROUTE CACHE / INDEXES
========================================================= */

let routesCache = null;
let routeIndexes = null;

function buildRouteIndexes(routes = []) {
  const byPath = new Map();
  const byName = new Map();
  const byViewKey = new Map();

  for (const route of routes) {
    if (byPath.has(route.path)) {
      throw new Error(
        `Ruta duplicada: ${route.path}`
      );
    }

    if (byName.has(route.name)) {
      throw new Error(
        `Nombre de ruta duplicado: ${route.name}`
      );
    }

    if (byViewKey.has(route.viewKey)) {
      throw new Error(
        `viewKey de ruta duplicado: ${route.viewKey}`
      );
    }

    byPath.set(route.path, route);
    byName.set(route.name, route);
    byViewKey.set(route.viewKey, route);
  }

  return Object.freeze({
    byPath,
    byName,
    byViewKey,
  });
}

function ensureRouteCaches() {
  if (routesCache && routeIndexes) {
    return;
  }

  const routes = createRoutes();

  validateRoutesTable(null, routes);

  routesCache = Object.freeze(routes);
  routeIndexes = buildRouteIndexes(
    routesCache
  );
}

export function createRoutes() {
  return [...ROUTE_DEFINITIONS].sort(
    (a, b) =>
      a.order - b.order
  );
}

export function getImmutableRoutes() {
  ensureRouteCaches();
  return routesCache;
}

export function resetRoutesCacheForTests() {
  routesCache = null;
  routeIndexes = null;

  MODULE_PROMISE_CACHE.clear();
  MODULE_RESOLVED_CACHE.clear();
  VIEW_PROMISE_CACHE.clear();
  VIEW_RESOLVED_CACHE.clear();
  VIEW_FAILURES.clear();

  return true;
}

/* =========================================================
   LOOKUPS
========================================================= */

export function getRouteByPath(
  path = "/"
) {
  const lookup = resolveRouteLookupPath(path);

  if (!lookup) return null;

  try {
    if (isBlockedRoutePath(lookup)) {
      return null;
    }
  } catch {
    return null;
  }

  ensureRouteCaches();

  return (
    routeIndexes.byPath.get(lookup) ||
    null
  );
}

export function getRouteByName(
  name = ""
) {
  const clean = cleanName(name);

  ensureRouteCaches();

  return (
    routeIndexes.byName.get(clean) ||
    null
  );
}

export function getRouteByViewKey(
  viewKey = ""
) {
  const clean = cleanName(viewKey);

  ensureRouteCaches();

  return (
    routeIndexes.byViewKey.get(clean) ||
    null
  );
}

export function resolveRouteAlias(
  path = "/"
) {
  return resolveRouteLookupPath(path);
}

export function isPublicAuthPath(
  path = "/"
) {
  return (
    getRouteByPath(path)
      ?.public === true
  );
}

export function isTokenPublicRoutePath(
  path = "/"
) {
  return (
    getRouteByPath(path)
      ?.tokenRoute === true
  );
}

export function isPrivateRoutePath(
  path = "/"
) {
  return (
    getRouteByPath(path)
      ?.requiresAuth === true
  );
}

export function isAdminRoutePath(
  path = "/"
) {
  const route = getRouteByPath(path);

  return Boolean(
    route?.adminOnly ||
    route?.requiresAdmin
  );
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateRoutesTable(
  _core = null,
  routes = ROUTE_DEFINITIONS
) {
  if (!Array.isArray(routes)) {
    throw new Error(
      "Tabla de rutas inválida."
    );
  }

  const seenPaths = new Set();
  const seenNames = new Set();
  const seenViewKeys = new Set();

  for (const route of routes) {
    if (
      !route?.path ||
      !isFunction(route?.render)
    ) {
      throw new Error("Ruta inválida.");
    }

    if (seenPaths.has(route.path)) {
      throw new Error(
        `Ruta duplicada: ${route.path}`
      );
    }

    if (seenNames.has(route.name)) {
      throw new Error(
        `Nombre de ruta duplicado: ${route.name}`
      );
    }

    if (seenViewKeys.has(route.viewKey)) {
      throw new Error(
        `viewKey de ruta duplicado: ${route.viewKey}`
      );
    }

    if (route.path.startsWith(USER_HOME_PREFIX)) {
      throw new Error(
        `Ruta user-scoped declarada incorrectamente: ${route.path}`
      );
    }

    try {
      if (isBlockedRoutePath(route.path)) {
        throw new Error(
          `Ruta bloqueada declarada incorrectamente: ${route.path}`
        );
      }
    } catch (error) {
      if (
        error?.message?.startsWith(
          "Ruta bloqueada declarada incorrectamente:"
        )
      ) {
        throw error;
      }
    }

    if (!hasRouteViewLoader(route.viewKey)) {
      throw new Error(
        `Loader inexistente para vista: ${route.viewKey}`
      );
    }

    if (
      route.tokenRoute === true &&
      route.public !== true
    ) {
      throw new Error(
        `Token route no pública: ${route.path}`
      );
    }

    if (
      route.adminOnly === true &&
      route.public === true
    ) {
      throw new Error(
        `Ruta pública admin-only inválida: ${route.path}`
      );
    }

    seenPaths.add(route.path);
    seenNames.add(route.name);
    seenViewKeys.add(route.viewKey);
  }

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getViewCacheState(
  viewKey = ""
) {
  const key = cleanName(viewKey);

  if (VIEW_RESOLVED_CACHE.has(key)) {
    return "loaded";
  }

  if (VIEW_PROMISE_CACHE.has(key)) {
    return "loading";
  }

  if (VIEW_FAILURES.has(key)) {
    return "failed";
  }

  return "idle";
}

export function getRoutesSnapshot() {
  return getImmutableRoutes().map(
    (route) => ({
      path: route.path,
      name: route.name,
      title: route.title,
      viewKey: route.viewKey,
      public: route.public,
      guestOnly: route.guestOnly,
      requiresAuth: route.requiresAuth,
      adminOnly: route.adminOnly,
      tokenRoute: route.tokenRoute,
      hideShell: route.hideShell,
      showInSidebar: route.showInSidebar,
      loaded: isRouteViewLoaded(
        route.viewKey
      ),
      loading: isRouteViewLoading(
        route.viewKey
      ),
      cacheState: getViewCacheState(
        route.viewKey
      ),
    })
  );
}

function safeDebugPath(path = "/") {
  const clean = normalizePath(path);
  const resolved = resolvePublicAliasPath(clean);

  /*
    Si el pathname contiene un token dinámico reconocido,
    sólo devolvemos la ruta canónica.
  */
  return resolved !== clean
    ? resolved
    : clean;
}

export function getRouteDebug(
  path = "/"
) {
  const route = getRouteByPath(path);
  const scoped = getUserScopedRouteInfo(path);

  const normalizedInput = normalizePath(path);
  const safeInput = safeDebugPath(path);
  const lookupPath = resolveRouteLookupPath(path);

  return {
    /*
      Nunca devolvemos query/hash ni tokens dinámicos de pathname.
    */
    input: safeInput,
    lookupPath,
    alias:
      lookupPath !== normalizedInput,
    found: Boolean(route),
    userScoped:
      scoped.scoped === true,
    userHome:
      scoped.home === true,
    userSlug:
      scoped.slug || null,
    route: route
      ? {
          path: route.path,
          name: route.name,
          viewKey: route.viewKey,
          public: route.public,
          guestOnly: route.guestOnly,
          adminOnly: route.adminOnly,
          tokenRoute: route.tokenRoute,
          loaded: isRouteViewLoaded(
            route.viewKey
          ),
          loading: isRouteViewLoading(
            route.viewKey
          ),
          cacheState: getViewCacheState(
            route.viewKey
          ),
        }
      : null,
  };
}

export function getCriticalRoutesDebug() {
  return getRoutesSnapshot();
}

export function getRoutesIntegritySnapshot() {
  ensureRouteCaches();

  return Object.freeze({
    version: ROUTES_VERSION,
    count: routesCache.length,
    routes: getRoutesSnapshot(),
    userHomePrefix: USER_HOME_PREFIX,
    publicAuthRoutes: [
      ...PUBLIC_AUTH_ROUTES,
    ],
    tokenRoutePaths: [
      ...TOKEN_ROUTE_PATHS,
    ],
    routeAliases: {
      ...ROUTE_ALIASES,
    },
    loadedViews: getLoadedRouteViewKeys(),
    loadingViews: getLoadingRouteViewKeys(),
    failedViews: [
      ...VIEW_FAILURES.entries(),
    ].map(
      ([viewKey, error]) => ({
        viewKey,
        error,
      })
    ),
    cache: Object.freeze({
      routePathIndex:
        routeIndexes.byPath.size,
      routeNameIndex:
        routeIndexes.byName.size,
      routeViewIndex:
        routeIndexes.byViewKey.size,
      modulePromises:
        MODULE_PROMISE_CACHE.size,
      resolvedModules:
        MODULE_RESOLVED_CACHE.size,
      viewPromises:
        VIEW_PROMISE_CACHE.size,
      resolvedViews:
        VIEW_RESOLVED_CACHE.size,
    }),
    policy: Object.freeze({
      routesOnly: true,
      lazyViews: true,
      moduleImportDedup: true,
      resolvedViewCache: true,
      failedImportRetry: true,
      abortAwareRender: true,
      indexedLookups: true,
      preloadApi: true,
      noAuth: true,
      noGuards: true,
      noHistory: true,
      noStorage: true,
      noToast: true,
      noShell: true,
      canonicalPasswordReset:
        ROUTE_PATHS.PASSWORD_RESET,
      legacyPasswordResetAlias: true,
      canonicalActivateAccount:
        ROUTE_PATHS.ACTIVATE_ACCOUNT,
      activationPathTokenAlias: true,
      debugPathTokenRedaction: true,
    }),
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  ROUTES_VERSION,

  ROUTE_PATHS,
  ROUTE_NAMES,
  ROUTE_ALIASES,

  VALID_ROLES,
  ADMIN_ROLES,

  PUBLIC_AUTH_ROUTES,
  TOKEN_ROUTE_PATHS,

  normalizeRoutePath,
  normalizeUserHomeSlug,

  getUserScopedRouteInfo,
  getUserHomeSlugFromPath,
  getUserScopedSlugFromPath,
  getUserScopedRestPath,

  isUserScopedPath,
  isUserHomePath,
  isHomePath,

  resolveRouteLookupPath,
  resolveRouteAlias,
  isRouteAlias,

  createRoutes,
  getImmutableRoutes,
  resetRoutesCacheForTests,
  validateRoutesTable,

  getRouteByPath,
  getRouteByName,
  getRouteByViewKey,

  isPublicAuthPath,
  isTokenPublicRoutePath,
  isPrivateRoutePath,
  isAdminRoutePath,

  hasRouteViewLoader,
  isRouteViewLoaded,
  isRouteViewLoading,

  preloadRouteView,
  preloadRouteByPath,
  preloadRouteByName,
  preloadRouteByViewKey,
  preloadRoutes,
  preloadPrivateRouteViews,

  getLoadedRouteViewKeys,
  getLoadingRouteViewKeys,

  getRoutesSnapshot,
  getRouteDebug,
  getCriticalRoutesDebug,
  getRoutesIntegritySnapshot,
};
