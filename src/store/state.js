/* =========================================================
   Onion SPA - Store State
   Archivo: src/store/state.js

   Responsabilidades:
   - construir estado inicial del store
   - exponer snapshots raíz seguros
   - resolver títulos desde DOM / AppCore
   - tocar metadata reactiva
   - clonar slices sin referencias peligrosas
   - resolver tema inicial desde sistema / navegador
   - evitar estados auth fantasma
   - mantener session/ui/app coherentes durante boot
   - tolerar AppCore parcial durante arranque
========================================================= */

import {
  isBrowser,
  deepClone,
  normalizeCollection,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const APP_NAME_FALLBACK = "Onion Support";
const LANG_FALLBACK = "es";
const THEME_LIGHT = "light";
const THEME_DARK = "dark";
const THEME_SYSTEM = "system";

/* =========================================================
   BASICS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
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

function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return deepClone(value);
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

    return value;
  }

  return null;
}

/* =========================================================
   APPCORE SAFE ACCESS
========================================================= */

function getCoreConfig(AppCore) {
  return safeObject(
    AppCore?.config
  );
}

function getCoreState(AppCore) {
  return safeObject(
    AppCore?.state
  );
}

function getCoreDom(AppCore) {
  return safeObject(
    AppCore?.dom
  );
}

function getAppName(AppCore) {
  return (
    safeText(
      getCoreConfig(AppCore).appName,
      ""
    ) ||
    APP_NAME_FALLBACK
  );
}

/* =========================================================
   USER / TOKEN VALIDATION
========================================================= */

function hasUsableToken(token = "") {
  return Boolean(
    safeText(token, "")
  );
}

function hasUsableUser(user = null) {
  const current =
    safeObject(user);

  return Boolean(
    safeText(current.id, "") ||
      safeText(current.userId, "") ||
      safeText(current.user_id, "") ||
      safeText(current._id, "") ||
      safeText(current.uid, "") ||
      safeText(current.username, "") ||
      safeText(current.userName, "") ||
      safeText(current.user_name, "") ||
      safeText(current.email, "") ||
      safeText(current.mail, "") ||
      safeText(current.phone, "") ||
      safeText(current.telefono, "") ||
      safeText(current.mobile, "")
  );
}

function getStateToken(AppCore) {
  const state =
    getCoreState(AppCore);

  return safeText(
    first(
      state.token,
      state.accessToken,
      state.access_token,
      state.session?.token,
      state.session?.accessToken,
      state.session?.access_token
    ),
    ""
  );
}

function getStateUser(AppCore) {
  const state =
    getCoreState(AppCore);

  const user =
    first(
      state.user,
      state.currentUser,
      state.authUser,
      state.sessionUser,
      state.session?.user,
      state.session?.currentUser,
      state.session?.authUser
    );

  return hasUsableUser(user)
    ? clone(user)
    : null;
}

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(value) {
  if (Array.isArray(value)) {
    return value
      .flat(Infinity)
      .map(normalizeRole)
      .filter(Boolean);
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value]
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function collectRolesFromState(
  AppCore,
  user = null
) {
  const state =
    getCoreState(AppCore);

  const currentUser =
    safeObject(user);

  const raw =
    safeObject(currentUser.raw);

  const roles = [
    state.role,
    state.rol,
    state.userRole,
    state.user_role,
    state.roles,
    state.permissions,
    state.scopes,

    state.session?.role,
    state.session?.rol,
    state.session?.roles,
    state.session?.permissions,
    state.session?.scopes,

    currentUser.role,
    currentUser.rol,
    currentUser.userRole,
    currentUser.user_role,
    currentUser.type,
    currentUser.userType,
    currentUser.roles,
    currentUser.permissions,
    currentUser.scopes,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.roles,
    raw.permissions,
    raw.scopes,
  ];

  if (
    state.isAdmin === true ||
    state.admin === true ||
    currentUser.isAdmin === true ||
    currentUser.admin === true ||
    raw.isAdmin === true ||
    raw.admin === true
  ) {
    roles.push("admin");
  }

  return Array.from(
    new Set(
      roles
        .flatMap((role) =>
          normalizeRoles(role)
        )
        .filter(Boolean)
    )
  );
}

function resolveSession(AppCore) {
  const state =
    getCoreState(AppCore);

  const token =
    getStateToken(AppCore);

  const user =
    getStateUser(AppCore);

  const authenticated =
    Boolean(
      state.authenticated === true &&
        hasUsableToken(token) &&
        hasUsableUser(user)
    );

  const roles =
    authenticated
      ? collectRolesFromState(
          AppCore,
          user
        )
      : [];

  const role =
    authenticated
      ? (
          normalizeRole(
            first(
              state.role,
              state.session?.role,
              user?.role,
              user?.rol,
              roles[0]
            )
          ) || null
        )
      : null;

  return {
    authenticated,

    token:
      authenticated
        ? token
        : null,

    accessToken:
      authenticated
        ? token
        : null,

    user:
      authenticated
        ? user
        : null,

    role,
    roles,

    isAdmin:
      roles.includes("admin") ||
      roles.includes("administrator") ||
      roles.includes("administrador") ||
      roles.includes("superadmin") ||
      roles.includes("super_admin") ||
      roles.includes("owner") ||
      roles.includes("root"),
  };
}

/* =========================================================
   THEME
========================================================= */

function normalizeTheme(value = "") {
  const theme =
    safeText(value, "")
      .toLowerCase();

  if (theme === THEME_LIGHT) {
    return THEME_LIGHT;
  }

  if (theme === THEME_DARK) {
    return THEME_DARK;
  }

  if (theme === THEME_SYSTEM) {
    return THEME_SYSTEM;
  }

  return "";
}

function getSystemTheme() {
  if (!isBrowser()) {
    return THEME_LIGHT;
  }

  try {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return THEME_DARK;
    }
  } catch {}

  return THEME_LIGHT;
}

function getDocumentTheme() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return normalizeTheme(
      document.documentElement?.dataset?.theme ||
        document.documentElement?.getAttribute("data-theme") ||
        ""
    );
  } catch {
    return "";
  }
}

function readStoredTheme(AppCore) {
  const config =
    getCoreConfig(AppCore);

  const prefix =
    safeText(
      config.storagePrefix,
      "onion"
    );

  const candidates = [
    "theme",
    `${prefix}:theme`,
    "onion:theme",
    "ui.theme",
    `${prefix}:ui.theme`,
  ];

  try {
    if (
      typeof AppCore?.storage?.get === "function"
    ) {
      for (const key of candidates) {
        const value =
          normalizeTheme(
            AppCore.storage.get(key)
          );

        if (value) {
          return value;
        }
      }
    }
  } catch {}

  if (!isBrowser()) {
    return "";
  }

  try {
    for (const key of candidates) {
      const value =
        normalizeTheme(
          window.localStorage?.getItem?.(key)
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  return "";
}

function resolveThemePreference(AppCore) {
  const state =
    getCoreState(AppCore);

  const config =
    getCoreConfig(AppCore);

  return (
    normalizeTheme(state.themePreference) ||
    normalizeTheme(state.themeMode) ||
    normalizeTheme(state.theme) ||
    readStoredTheme(AppCore) ||
    normalizeTheme(config.defaultTheme) ||
    THEME_SYSTEM
  );
}

function resolveTheme(AppCore) {
  const preference =
    resolveThemePreference(AppCore);

  if (preference === THEME_SYSTEM) {
    return (
      getDocumentTheme() ||
      getSystemTheme()
    );
  }

  return (
    preference ||
    getDocumentTheme() ||
    getSystemTheme()
  );
}

/* =========================================================
   LANG
========================================================= */

function resolveLang(AppCore) {
  const state =
    getCoreState(AppCore);

  const config =
    getCoreConfig(AppCore);

  return (
    safeText(state.lang, "") ||
    safeText(config.defaultLang, "") ||
    LANG_FALLBACK
  );
}

/* =========================================================
   TITLES
========================================================= */

export function safeTitle(AppCore) {
  const fallback =
    getAppName(AppCore);

  if (!isBrowser()) {
    return fallback;
  }

  try {
    return (
      safeText(
        document.title,
        ""
      ) ||
      fallback
    );
  } catch {
    return fallback;
  }
}

export function safeTopbarTitle(AppCore) {
  const dom =
    getCoreDom(AppCore);

  const domTitle =
    safeText(
      dom.topbarTitle?.textContent,
      ""
    );

  return (
    domTitle ||
    safeTitle(AppCore) ||
    getAppName(AppCore)
  );
}

/* =========================================================
   META
========================================================= */

export function touchMeta(state) {
  if (
    !state ||
    typeof state !== "object"
  ) {
    return false;
  }

  if (
    !state.meta ||
    typeof state.meta !== "object"
  ) {
    state.meta = {};
  }

  const now =
    Date.now();

  state.meta.updatedAt = now;
  state.meta.revision =
    Number(state.meta.revision || 0) + 1;

  return true;
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function buildInitialState(AppCore) {
  const state =
    getCoreState(AppCore);

  const appName =
    getAppName(AppCore);

  const session =
    resolveSession(AppCore);

  const themePreference =
    resolveThemePreference(AppCore);

  const theme =
    resolveTheme(AppCore);

  const lang =
    resolveLang(AppCore);

  const route =
    safeText(
      state.route,
      "/"
    ) || "/";

  const publicPath =
    safeText(
      state.publicPath,
      route
    ) || route;

  return {
    app: {
      ready: false,
      booted: false,

      route,
      publicPath,

      loading:
        Boolean(state.loading),

      initialized:
        Boolean(state.initialized),

      booting:
        Boolean(state.booting),

      lastError:
        state.lastError || null,
    },

    session: {
      authenticated:
        session.authenticated,

      token:
        session.token,

      accessToken:
        session.accessToken,

      user:
        session.user,

      role:
        session.role,

      roles:
        session.roles,

      isAdmin:
        Boolean(session.isAdmin),
    },

    ui: {
      theme,
      themePreference,

      lang,

      sidebarOpen:
        state.sidebarOpen ??
        true,

      pageTitle:
        safeTitle(AppCore) ||
        appName,

      topbarTitle:
        safeTopbarTitle(AppCore) ||
        appName,
    },

    entities: {
      incidencias: [],
      facturas: [],
      usuarios: [],
      clientes: [],
      recientes: [],
      dashboard: null,
    },

    flags: {
      hydrating: false,

      fetchingDashboard: false,
      fetchingIncidencias: false,
      fetchingFacturas: false,
      fetchingUsuarios: false,
      fetchingClientes: false,
    },

    meta: {
      hydrated: false,
      revision: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

/* =========================================================
   SAFE ROOT SNAPSHOT
========================================================= */

export function shallowCloneRoot(state) {
  const source =
    safeObject(state);

  const app =
    safeObject(source.app);

  const session =
    safeObject(source.session);

  const ui =
    safeObject(source.ui);

  const entities =
    safeObject(source.entities);

  const flags =
    safeObject(source.flags);

  const meta =
    safeObject(source.meta);

  return {
    ...source,

    app: {
      ...app,
    },

    session: {
      ...session,

      user:
        session.user
          ? clone(session.user)
          : null,

      roles:
        safeArray(session.roles),
    },

    ui: {
      ...ui,
    },

    entities: {
      incidencias:
        normalizeCollection(
          entities.incidencias
        ),

      facturas:
        normalizeCollection(
          entities.facturas
        ),

      usuarios:
        normalizeCollection(
          entities.usuarios
        ),

      clientes:
        normalizeCollection(
          entities.clientes
        ),

      recientes:
        normalizeCollection(
          entities.recientes
        ),

      dashboard:
        entities.dashboard
          ? clone(entities.dashboard)
          : null,
    },

    flags: {
      ...flags,
    },

    meta: {
      ...meta,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  safeTitle,
  safeTopbarTitle,

  touchMeta,
  buildInitialState,
  shallowCloneRoot,
};
