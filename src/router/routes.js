/* =========================================================
   Onion Support - Routes
   Archivo: /src/router/routes.js

   Responsabilidad:
   - Tabla mínima de rutas SPA.
   - Vistas lazy.
   - Cachear módulos de vista cargados.
   - Exponer preload de vistas para navegación rápida.
   - Resolver /@{slug} hacia ruta interna privada.
   - Marcar rutas públicas, privadas, admin y token routes.
   - Rutas públicas viven en /src/views/public/*.
   - Resolver aliases legacy de password reset SIN exponer el token.
   - Mantener como ruta canónica /password-reset?token=...
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
  "routes.minimal.v7-reset-alias";

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
  PUBLIC_HOME:
    "public-home",

  HOME:
    "home",

  INCIDENCIAS:
    "incidencias",

  FACTURAS:
    "facturas",

  CLIENTES:
    "clientes",

  USUARIOS:
    "usuarios",

  SERVIDOR:
    "servidor",

  CUENTA:
    "cuenta",

  AJUSTES:
    "ajustes",

  LOGIN:
    "login",

  PASSWORD_REQUEST:
    "password-request",

  PASSWORD_RESET:
    "password-reset",

  ACTIVATE_ACCOUNT:
    "activate-account",
});

export const VALID_ROLES = Object.freeze(
  Array.isArray(ALLOWED_ROLES) &&
  ALLOWED_ROLES.length
    ? [
        ...new Set(
          ALLOWED_ROLES.map(
            (role) =>
              String(role)
                .toLowerCase()
          )
        ),
      ]
    : [
        "admin",
        "user",
      ]
);

export const ADMIN_ROLES =
  Object.freeze([
    "admin",
  ]);

/*
  Aliases únicamente de compatibilidad.

  IMPORTANTE:
  - el email NUEVO debe usar /password-reset?token=...
  - estos aliases existen para correos antiguos que ya estén en inbox
  - el token no se guarda ni se copia aquí; solamente se resuelve la vista
*/
export const ROUTE_ALIASES =
  Object.freeze({
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
  const output =
    String(value ?? "")
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    output ||
    fallback
  );
}

function isFunction(
  value
) {
  return (
    typeof value ===
    "function"
  );
}

function isObject(
  value
) {
  return Boolean(
    value &&
      typeof value ===
        "object" &&
      !Array.isArray(value)
  );
}

function normalizePath(
  path = "/"
) {
  try {
    return (
      configNormalizeRoutePath(
        path
      ) ||
      "/"
    );
  } catch {
    let value =
      cleanText(
        path,
        "/"
      )
        .split("?")[0]
        .split("#")[0]
        .replace(
          /\\/g,
          "/"
        );

    if (
      !value.startsWith(
        "/"
      )
    ) {
      value =
        `/${value}`;
    }

    value =
      value.replace(
        /\/{2,}/g,
        "/"
      );

    if (
      value.length > 1
    ) {
      value =
        value.replace(
          /\/+$/g,
          ""
        ) ||
        "/";
    }

    return (
      value ||
      "/"
    );
  }
}

function cleanName(
  value = ""
) {
  return cleanText(
    value,
    "route"
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      "-"
    )
    .replace(
      /[^a-z0-9._:-]/g,
      ""
    )
    .slice(
      0,
      96
    );
}

function normalizePathList(
  paths = []
) {
  const seen =
    new Set();

  for (
    const path
    of Array.isArray(paths)
      ? paths
      : []
  ) {
    const clean =
      normalizePath(path);

    if (!clean) {
      continue;
    }

    if (
      clean.startsWith(
        USER_HOME_PREFIX
      )
    ) {
      continue;
    }

    try {
      if (
        isBlockedRoutePath(
          clean
        )
      ) {
        continue;
      }
    } catch {
      continue;
    }

    seen.add(clean);
  }

  return Object.freeze(
    [...seen]
  );
}

function pathInList(
  path = "/",
  paths = []
) {
  const clean =
    normalizePath(path);

  return paths.some(
    (item) =>
      normalizePath(
        item
      ) === clean
  );
}

function tokenRoutePathsFromConfig() {
  const paths = [];

  for (
    const item
    of Array.isArray(
      PROTECTED_PUBLIC_TOKEN_ROUTES
    )
      ? PROTECTED_PUBLIC_TOKEN_ROUTES
      : []
  ) {
    if (item?.path) {
      paths.push(
        item.path
      );
    }

    if (
      Array.isArray(
        item?.paths
      )
    ) {
      paths.push(
        ...item.paths
      );
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
    const name
    of Array.isArray(names)
      ? names
      : []
  ) {
    if (
      module?.[name]
    ) {
      return module[
        name
      ];
    }
  }

  return (
    module?.default ||
    module
  );
}

function resolveRenderer(
  view,
  viewKey = ""
) {
  if (
    isFunction(view)
  ) {
    return view;
  }

  if (
    isFunction(
      view?.init
    )
  ) {
    return (
      view.init.bind(
        view
      )
    );
  }

  if (
    isFunction(
      view?.mount
    )
  ) {
    return (
      view.mount.bind(
        view
      )
    );
  }

  if (
    isFunction(
      view?.render
    )
  ) {
    return (
      view.render.bind(
        view
      )
    );
  }

  throw new Error(
    `La vista "${viewKey}" no expone init(), mount() ni render().`
  );
}

/* =========================================================
   PUBLIC / TOKEN ROUTES
========================================================= */

export const PUBLIC_AUTH_ROUTES =
  normalizePathList(
    Array.isArray(
      PUBLIC_ROUTES
    ) &&
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
  const cleanPath =
    normalizePath(path);

  const cleanAlias =
    normalizePath(alias);

  return (
    cleanPath ===
      cleanAlias ||
    cleanPath.startsWith(
      `${cleanAlias}/`
    )
  );
}

function resolvePublicAliasPath(
  path = "/"
) {
  const clean =
    normalizePath(path);

  /*
    Exactos primero.
  */
  if (
    ROUTE_ALIASES[
      clean
    ]
  ) {
    return normalizePath(
      ROUTE_ALIASES[
        clean
      ]
    );
  }

  /*
    Correos legacy:
      /reset-password/confirm/<token>
      /password-reset/confirm/<token>

    No extraemos el token aquí.
    Sólo resolvemos qué vista corresponde.
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
    return (
      ROUTE_PATHS.PASSWORD_RESET
    );
  }

  return clean;
}

export function isRouteAlias(
  path = "/"
) {
  const clean =
    normalizePath(path);

  return (
    resolvePublicAliasPath(
      clean
    ) !== clean
  );
}

/* =========================================================
   USER SCOPE
========================================================= */

export function normalizeRoutePath(
  path = "/"
) {
  return normalizePath(
    path
  );
}

export function normalizeUserHomeSlug(
  value = ""
) {
  try {
    return (
      normalizeUserSlug(
        value
      ) ||
      ""
    );
  } catch {
    return "";
  }
}

export function getUserScopedRouteInfo(
  path = "/"
) {
  try {
    return (
      configGetUserScopedRouteInfo(
        path
      )
    );
  } catch {
    const clean =
      normalizePath(
        path
      );

    if (
      !clean.startsWith(
        USER_HOME_PREFIX
      )
    ) {
      return {
        scoped: false,
        home: false,
        slug: "",
        restPath:
          clean,
        canonicalPath:
          clean,
        lookupPath:
          clean,
      };
    }

    const rest =
      clean.slice(
        USER_HOME_PREFIX.length
      );

    const [
      slugSegment = "",
      ...segments
    ] =
      rest.split("/");

    const slug =
      normalizeUserHomeSlug(
        slugSegment
      );

    if (!slug) {
      return {
        scoped: false,
        home: false,
        slug: "",
        restPath:
          clean,
        canonicalPath:
          clean,
        lookupPath:
          clean,
      };
    }

    const restPath =
      segments.length
        ? normalizePath(
            `/${segments.join("/")}`
          )
        : "/";

    return {
      scoped: true,
      home:
        restPath === "/",
      slug,
      restPath,
      canonicalPath:
        restPath,
      lookupPath:
        restPath,
    };
  }
}

export function resolveRouteLookupPath(
  path = "/"
) {
  const clean =
    normalizePath(path);

  if (!clean) {
    return "";
  }

  try {
    if (
      isBlockedRoutePath(
        clean
      )
    ) {
      return "";
    }
  } catch {
    return "";
  }

  const scoped =
    getUserScopedRouteInfo(
      clean
    );

  /*
    Alias público sólo si la URL NO vive bajo /@{slug}.
  */
  if (
    !scoped.scoped
  ) {
    return (
      resolvePublicAliasPath(
        clean
      )
    );
  }

  const rawLookup =
    scoped.home
      ? ROUTE_PATHS.HOME
      : (
          scoped.canonicalPath ||
          scoped.restPath ||
          "/"
        );

  /*
    Las rutas públicas Auth no son válidas bajo /@{slug}.
    También bloqueamos aliases de rutas públicas:
      /@user/reset-password/confirm/...
  */
  const aliasLookup =
    resolvePublicAliasPath(
      rawLookup
    );

  if (
    aliasLookup !==
      normalizePath(
        rawLookup
      ) ||
    pathInList(
      aliasLookup,
      PUBLIC_AUTH_ROUTES
    )
  ) {
    return "";
  }

  return normalizePath(
    rawLookup
  );
}

export function getUserHomeSlugFromPath(
  path = "/"
) {
  const info =
    getUserScopedRouteInfo(
      path
    );

  return (
    info.home
      ? info.slug
      : ""
  );
}

export function getUserScopedSlugFromPath(
  path = "/"
) {
  const info =
    getUserScopedRouteInfo(
      path
    );

  return (
    info.scoped
      ? info.slug
      : ""
  );
}

export function getUserScopedRestPath(
  path = "/"
) {
  const info =
    getUserScopedRouteInfo(
      path
    );

  return (
    info.scoped
      ? (
          info.restPath ||
          info.canonicalPath ||
          "/"
        )
      : ""
  );
}

export function isUserScopedPath(
  path = "/"
) {
  return (
    getUserScopedRouteInfo(
      path
    ).scoped === true
  );
}

export function isUserHomePath(
  path = "/"
) {
  return (
    getUserScopedRouteInfo(
      path
    ).home === true
  );
}

export function isHomePath(
  path = "/"
) {
  const clean =
    normalizePath(path);

  return (
    clean ===
      ROUTE_PATHS.PUBLIC_HOME ||
    clean ===
      ROUTE_PATHS.HOME ||
    isUserHomePath(
      clean
    )
  );
}

/* =========================================================
   VIEW LOADERS
========================================================= */

const VIEW_LOADERS =
  Object.freeze({
    "public-home":
      () =>
        import(
          "../views/public/home/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "PublicHomeView",
              ]
            )
        ),

    home:
      () =>
        import(
          "../views/home/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "HomeView",
              ]
            )
        ),

    incidencias:
      () =>
        import(
          "../views/incidencias/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "IncidenciasView",
              ]
            )
        ),

    facturas:
      () =>
        import(
          "../views/facturas/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "FacturasView",
              ]
            )
        ),

    clientes:
      () =>
        import(
          "../views/clientes/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "ClientesView",
              ]
            )
        ),

    usuarios:
      () =>
        import(
          "../views/usuarios/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "UsuariosView",
              ]
            )
        ),

    servidor:
      () =>
        import(
          "../views/server/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "ServidorView",
                "ServerView",
              ]
            )
        ),

    cuenta:
      () =>
        import(
          "../views/cuenta/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "CuentaView",
              ]
            )
        ),

    ajustes:
      () =>
        import(
          "../views/ajustes/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "AjustesView",
              ]
            )
        ),

    login:
      () =>
        import(
          "../views/public/login/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "LoginView",
              ]
            )
        ),

    "password-request":
      () =>
        import(
          "../views/public/password-reset/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "PasswordRequestView",
                "PasswordResetView",
                "ResetPasswordView",
              ]
            )
        ),

    "password-reset":
      () =>
        import(
          "../views/public/password-reset/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "PasswordResetView",
                "ResetPasswordView",
              ]
            )
        ),

    "activate-account":
      () =>
        import(
          "../views/public/activate-account/index.js"
        ).then(
          (module) =>
            pickView(
              module,
              [
                "ActivateAccountView",
              ]
            )
        ),
  });

const VIEW_CACHE =
  new Map();

async function loadView(
  viewKey = ""
) {
  const key =
    cleanName(
      viewKey
    );

  const loader =
    VIEW_LOADERS[
      key
    ];

  if (!loader) {
    throw new Error(
      `Vista no encontrada: "${key}".`
    );
  }

  if (
    !VIEW_CACHE.has(
      key
    )
  ) {
    VIEW_CACHE.set(
      key,
      Promise.resolve()
        .then(loader)
        .catch(
          (error) => {
            VIEW_CACHE.delete(
              key
            );

            throw error;
          }
        )
    );
  }

  return VIEW_CACHE.get(
    key
  );
}

function createRender(
  viewKey = ""
) {
  const key =
    cleanName(
      viewKey
    );

  return async function render(
    host = null,
    context = {}
  ) {
    const view =
      await loadView(
        key
      );

    const renderer =
      resolveRenderer(
        view,
        key
      );

    return renderer(
      host,
      {
        ...(
          isObject(
            context
          )
            ? context
            : {}
        ),

        viewKey:
          key,

        routeViewKey:
          key,
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
  const key =
    cleanName(
      viewKey
    );

  return Boolean(
    VIEW_LOADERS[
      key
    ]
  );
}

export function isRouteViewLoaded(
  viewKey = ""
) {
  const key =
    cleanName(
      viewKey
    );

  return VIEW_CACHE.has(
    key
  );
}

export function preloadRouteView(
  viewKey = ""
) {
  const key =
    cleanName(
      viewKey
    );

  if (
    !VIEW_LOADERS[
      key
    ]
  ) {
    return Promise.resolve(
      null
    );
  }

  return loadView(
    key
  ).catch(
    () => null
  );
}

export function preloadRouteByPath(
  path = "/"
) {
  const route =
    getRouteByPath(
      path
    );

  if (
    !route?.viewKey
  ) {
    return Promise.resolve(
      null
    );
  }

  return preloadRouteView(
    route.viewKey
  );
}

export function preloadRouteByName(
  name = ""
) {
  const route =
    getRouteByName(
      name
    );

  if (
    !route?.viewKey
  ) {
    return Promise.resolve(
      null
    );
  }

  return preloadRouteView(
    route.viewKey
  );
}

export function preloadRouteByViewKey(
  viewKey = ""
) {
  return preloadRouteView(
    viewKey
  );
}

export function preloadRoutes(
  values = []
) {
  const list =
    Array.isArray(values)
      ? values
      : [
          values,
        ];

  const promises = [];

  for (
    const value
    of list
  ) {
    if (
      isObject(value)
    ) {
      if (
        value.viewKey
      ) {
        promises.push(
          preloadRouteView(
            value.viewKey
          )
        );

        continue;
      }

      if (
        value.path
      ) {
        promises.push(
          preloadRouteByPath(
            value.path
          )
        );

        continue;
      }

      if (
        value.name
      ) {
        promises.push(
          preloadRouteByName(
            value.name
          )
        );

        continue;
      }
    }

    const valueText =
      cleanText(
        value,
        ""
      );

    if (!valueText) {
      continue;
    }

    if (
      valueText.startsWith(
        "/"
      )
    ) {
      promises.push(
        preloadRouteByPath(
          valueText
        )
      );
    } else {
      promises.push(
        preloadRouteView(
          valueText
        )
      );
    }
  }

  return Promise.allSettled(
    promises
  );
}

export function preloadPrivateRouteViews() {
  return preloadRoutes(
    getImmutableRoutes()
      .filter(
        (route) =>
          route.public !==
          true
      )
      .map(
        (route) =>
          route.viewKey
      )
  );
}

export function getLoadedRouteViewKeys() {
  return [
    ...VIEW_CACHE.keys(),
  ];
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
  order = 0,
}) {
  const finalPath =
    normalizePath(
      path
    );

  const finalName =
    cleanName(
      name ||
      viewKey ||
      finalPath
    );

  const finalViewKey =
    cleanName(
      viewKey ||
      finalName
    );

  const finalPublic =
    Boolean(
      isPublic ||
      pathInList(
        finalPath,
        PUBLIC_AUTH_ROUTES
      )
    );

  const finalTokenRoute =
    Boolean(
      tokenRoute ||
      pathInList(
        finalPath,
        TOKEN_ROUTE_PATHS
      )
    );

  const finalAdminOnly =
    Boolean(
      adminOnly ||
      configIsAdminRoute(
        finalPath
      )
    );

  if (
    !finalPath ||
    isBlockedRoutePath(
      finalPath
    )
  ) {
    throw new Error(
      `Ruta no permitida: "${path}".`
    );
  }

  if (
    finalPath.startsWith(
      USER_HOME_PREFIX
    )
  ) {
    throw new Error(
      `No se declaran rutas reales bajo "${USER_HOME_PREFIX}".`
    );
  }

  if (
    finalPublic &&
    finalAdminOnly
  ) {
    throw new Error(
      `Una ruta pública no puede ser admin-only: "${finalPath}".`
    );
  }

  if (
    finalTokenRoute &&
    !finalPublic
  ) {
    throw new Error(
      `Una token route debe ser pública: "${finalPath}".`
    );
  }

  if (
    !VIEW_LOADERS[
      finalViewKey
    ]
  ) {
    throw new Error(
      `No existe loader para la vista "${finalViewKey}".`
    );
  }

  return Object.freeze({
    id:
      finalName,

    version:
      ROUTES_VERSION,

    path:
      finalPath,

    canonicalPath:
      finalPath,

    name:
      finalName,

    title:
      cleanText(
        title,
        finalName
      ),

    viewKey:
      finalViewKey,

    viewName:
      finalViewKey,

    public:
      finalPublic,

    private:
      !finalPublic,

    requiresAuth:
      !finalPublic,

    guestOnly:
      Boolean(
        guestOnly
      ),

    publicOnly:
      Boolean(
        guestOnly
      ),

    adminOnly:
      finalAdminOnly,

    requiresAdmin:
      finalAdminOnly,

    roles:
      finalAdminOnly
        ? ADMIN_ROLES
        : [],

    tokenRoute:
      finalTokenRoute,

    publicTokenRoute:
      finalTokenRoute,

    preserveSearch:
      finalPublic ||
      finalTokenRoute,

    preserveHash:
      finalPublic ||
      finalTokenRoute,

    hideShell:
      finalPublic,

    showShell:
      !finalPublic,

    shell:
      !finalPublic,

    layout:
      finalPublic
        ? "auth"
        : "app",

    sidebar:
      !finalPublic,

    showInSidebar:
      !finalPublic,

    sidebarKey:
      finalViewKey,

    order:
      Number(order) ||
      0,

    render:
      createRender(
        finalViewKey
      ),

    preload:
      () =>
        preloadRouteView(
          finalViewKey
        ),
  });
}

const ROUTE_DEFINITIONS =
  Object.freeze([
    createRoute({
      path:
        ROUTE_PATHS.PUBLIC_HOME,

      name:
        ROUTE_NAMES.PUBLIC_HOME,

      title:
        "Soluciones IT",

      viewKey:
        "public-home",

      public:
        true,

      guestOnly:
        false,

      order:
        1,
    }),

    createRoute({
      path:
        ROUTE_PATHS.HOME,

      name:
        ROUTE_NAMES.HOME,

      title:
        "Inicio",

      viewKey:
        "home",

      order:
        10,
    }),

    createRoute({
      path:
        ROUTE_PATHS.INCIDENCIAS,

      name:
        ROUTE_NAMES.INCIDENCIAS,

      title:
        "Incidencias",

      viewKey:
        "incidencias",

      order:
        20,
    }),

    createRoute({
      path:
        ROUTE_PATHS.FACTURAS,

      name:
        ROUTE_NAMES.FACTURAS,

      title:
        "Facturas",

      viewKey:
        "facturas",

      order:
        30,
    }),

    createRoute({
      path:
        ROUTE_PATHS.CLIENTES,

      name:
        ROUTE_NAMES.CLIENTES,

      title:
        "Clientes",

      viewKey:
        "clientes",

      adminOnly:
        true,

      order:
        40,
    }),

    createRoute({
      path:
        ROUTE_PATHS.USUARIOS,

      name:
        ROUTE_NAMES.USUARIOS,

      title:
        "Usuarios",

      viewKey:
        "usuarios",

      adminOnly:
        true,

      order:
        50,
    }),

    createRoute({
      path:
        ROUTE_PATHS.SERVIDOR,

      name:
        ROUTE_NAMES.SERVIDOR,

      title:
        "Servidor",

      viewKey:
        "servidor",

      adminOnly:
        true,

      order:
        60,
    }),

    createRoute({
      path:
        ROUTE_PATHS.CUENTA,

      name:
        ROUTE_NAMES.CUENTA,

      title:
        "Cuenta",

      viewKey:
        "cuenta",

      order:
        70,
    }),

    createRoute({
      path:
        ROUTE_PATHS.AJUSTES,

      name:
        ROUTE_NAMES.AJUSTES,

      title:
        "Ajustes",

      viewKey:
        "ajustes",

      order:
        80,
    }),

    createRoute({
      path:
        ROUTE_PATHS.LOGIN,

      name:
        ROUTE_NAMES.LOGIN,

      title:
        "Acceso",

      viewKey:
        "login",

      public:
        true,

      guestOnly:
        true,

      order:
        100,
    }),

    createRoute({
      path:
        ROUTE_PATHS.PASSWORD_REQUEST,

      name:
        ROUTE_NAMES.PASSWORD_REQUEST,

      title:
        "Recuperar acceso",

      viewKey:
        "password-request",

      public:
        true,

      order:
        110,
    }),

    createRoute({
      path:
        ROUTE_PATHS.PASSWORD_RESET,

      name:
        ROUTE_NAMES.PASSWORD_RESET,

      title:
        "Nueva contraseña",

      viewKey:
        "password-reset",

      public:
        true,

      tokenRoute:
        true,

      order:
        120,
    }),

    createRoute({
      path:
        ROUTE_PATHS.ACTIVATE_ACCOUNT,

      name:
        ROUTE_NAMES.ACTIVATE_ACCOUNT,

      title:
        "Activar cuenta",

      viewKey:
        "activate-account",

      public:
        true,

      tokenRoute:
        true,

      order:
        130,
    }),
  ]);

let routesCache = null;

export function createRoutes() {
  return [
    ...ROUTE_DEFINITIONS,
  ].sort(
    (a, b) =>
      a.order -
      b.order
  );
}

export function getImmutableRoutes() {
  if (!routesCache) {
    routesCache =
      Object.freeze(
        createRoutes()
      );
  }

  return routesCache;
}

export function resetRoutesCacheForTests() {
  routesCache = null;

  VIEW_CACHE.clear();

  return true;
}

/* =========================================================
   LOOKUPS
========================================================= */

export function getRouteByPath(
  path = "/"
) {
  const lookup =
    resolveRouteLookupPath(
      path
    );

  if (!lookup) {
    return null;
  }

  try {
    if (
      isBlockedRoutePath(
        lookup
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return (
    getImmutableRoutes()
      .find(
        (route) =>
          route.path ===
          lookup
      ) ||
    null
  );
}

export function getRouteByName(
  name = ""
) {
  const clean =
    cleanName(
      name
    );

  return (
    getImmutableRoutes()
      .find(
        (route) =>
          route.name ===
          clean
      ) ||
    null
  );
}

export function getRouteByViewKey(
  viewKey = ""
) {
  const clean =
    cleanName(
      viewKey
    );

  return (
    getImmutableRoutes()
      .find(
        (route) =>
          route.viewKey ===
          clean
      ) ||
    null
  );
}

export function resolveRouteAlias(
  path = "/"
) {
  return resolveRouteLookupPath(
    path
  );
}

export function isPublicAuthPath(
  path = "/"
) {
  const route =
    getRouteByPath(
      path
    );

  return (
    route?.public ===
    true
  );
}

export function isTokenPublicRoutePath(
  path = "/"
) {
  const route =
    getRouteByPath(
      path
    );

  return (
    route?.tokenRoute ===
    true
  );
}

export function isPrivateRoutePath(
  path = "/"
) {
  const route =
    getRouteByPath(
      path
    );

  return Boolean(
    route &&
    route.requiresAuth ===
      true
  );
}

export function isAdminRoutePath(
  path = "/"
) {
  const route =
    getRouteByPath(
      path
    );

  return Boolean(
    route?.adminOnly ||
      route?.requiresAdmin
  );
}

export function validateRoutesTable(
  _core = null,
  routes =
    getImmutableRoutes()
) {
  if (
    !Array.isArray(
      routes
    )
  ) {
    throw new Error(
      "Tabla de rutas inválida."
    );
  }

  const seenPaths =
    new Set();

  const seenNames =
    new Set();

  for (
    const route
    of routes
  ) {
    if (
      !route?.path ||
      !route?.render
    ) {
      throw new Error(
        "Ruta inválida."
      );
    }

    if (
      seenPaths.has(
        route.path
      )
    ) {
      throw new Error(
        `Ruta duplicada: ${route.path}`
      );
    }

    if (
      seenNames.has(
        route.name
      )
    ) {
      throw new Error(
        `Nombre de ruta duplicado: ${route.name}`
      );
    }

    if (
      route.path.startsWith(
        USER_HOME_PREFIX
      )
    ) {
      throw new Error(
        `Ruta user-scoped declarada incorrectamente: ${route.path}`
      );
    }

    if (
      isBlockedRoutePath(
        route.path
      )
    ) {
      throw new Error(
        `Ruta bloqueada declarada incorrectamente: ${route.path}`
      );
    }

    if (
      !VIEW_LOADERS[
        route.viewKey
      ]
    ) {
      throw new Error(
        `Loader inexistente para vista: ${route.viewKey}`
      );
    }

    seenPaths.add(
      route.path
    );

    seenNames.add(
      route.name
    );
  }

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getRoutesSnapshot() {
  return (
    getImmutableRoutes()
      .map(
        (route) => ({
          path:
            route.path,

          name:
            route.name,

          title:
            route.title,

          viewKey:
            route.viewKey,

          public:
            route.public,

          guestOnly:
            route.guestOnly,

          requiresAuth:
            route.requiresAuth,

          adminOnly:
            route.adminOnly,

          tokenRoute:
            route.tokenRoute,

          hideShell:
            route.hideShell,

          showInSidebar:
            route.showInSidebar,

          loaded:
            isRouteViewLoaded(
              route.viewKey
            ),
        })
      )
  );
}

export function getRouteDebug(
  path = "/"
) {
  const route =
    getRouteByPath(
      path
    );

  const scoped =
    getUserScopedRouteInfo(
      path
    );

  const normalizedInput =
    normalizePath(
      path
    );

  const lookupPath =
    resolveRouteLookupPath(
      path
    );

  return {
    /*
      No devolvemos query/hash ni token:
      normalizePath elimina ambos.
    */
    input:
      normalizedInput,

    lookupPath,

    alias:
      lookupPath !==
      normalizedInput,

    found:
      Boolean(route),

    userScoped:
      scoped.scoped ===
      true,

    userHome:
      scoped.home ===
      true,

    userSlug:
      scoped.slug ||
      null,

    route:
      route
        ? {
            path:
              route.path,

            name:
              route.name,

            viewKey:
              route.viewKey,

            public:
              route.public,

            guestOnly:
              route.guestOnly,

            adminOnly:
              route.adminOnly,

            tokenRoute:
              route.tokenRoute,

            loaded:
              isRouteViewLoaded(
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
  return {
    version:
      ROUTES_VERSION,

    count:
      getImmutableRoutes()
        .length,

    routes:
      getRoutesSnapshot(),

    userHomePrefix:
      USER_HOME_PREFIX,

    publicAuthRoutes:
      [
        ...PUBLIC_AUTH_ROUTES,
      ],

    tokenRoutePaths:
      [
        ...TOKEN_ROUTE_PATHS,
      ],

    routeAliases:
      {
        ...ROUTE_ALIASES,
      },

    loadedViews:
      getLoadedRouteViewKeys(),

    policy: {
      routesOnly:
        true,

      lazyViews:
        true,

      preloadApi:
        true,

      noAuth:
        true,

      noGuards:
        true,

      noHistory:
        true,

      noStorage:
        true,

      noToast:
        true,

      noShell:
        true,

      canonicalPasswordReset:
        ROUTE_PATHS.PASSWORD_RESET,

      legacyPasswordResetAlias:
        true,
    },
  };
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
  preloadRouteView,
  preloadRouteByPath,
  preloadRouteByName,
  preloadRouteByViewKey,
  preloadRoutes,
  preloadPrivateRouteViews,
  getLoadedRouteViewKeys,

  getRoutesSnapshot,
  getRouteDebug,
  getCriticalRoutesDebug,
  getRoutesIntegritySnapshot,
};
