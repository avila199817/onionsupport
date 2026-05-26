/* =========================================================
   Onion Support - Sidebar Constants
   Archivo: /src/ui/sidebar/constants.js

   Responsabilidad:
   - Constantes compartidas del sidebar.
   - Rutas base desde core/config.js.
   - Rutas públicas reales desde core/config.js.
   - Rutas privadas visibles con /@{user.slug}/{ruta}.
   - Selectores comunes.
   - Clases comunes.
   - Metadatos visuales mínimos de rutas.
   - Clientes: sólo admin.
   - Usuarios: sólo admin si core/config.js define ROUTES.usuarios.
   - Servidor: sólo admin si core/config.js define ROUTES.servidor o ROUTES.server.
   - Avatar: sólo constantes visuales; datos reales resueltos en user/template.
   - Roles únicos: admin / user.
   - Home interna: /
   - Home visible de usuario: /@{user.slug}
   - Bloqueos delegados en core/config.js.
   - Respetar info.routable explícito de core/config.js.
   - No inventar rutas opcionales.
   - Sin DOM.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin storage.
   - Sin comportamiento de dropdown.
   - Sin rutas legacy.
   - Sin /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
   - Sin compatibilidad fantasma.
========================================================= */

import {
  ROUTES,
  PUBLIC_ROUTES,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  isAdminRoute as configIsAdminRoute,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isPublicRoute as configIsPublicRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

export const SIDEBAR_CONSTANTS_VERSION = "sidebar.constants.v9.aligned-router";

/* =========================================================
   HELPERS INTERNOS
========================================================= */

const CONFIG_ROUTES = ROUTES && typeof ROUTES === "object" ? ROUTES : {};

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function compact(values = []) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => text(value, ""))
    .filter(Boolean);
}

function unique(values = []) {
  return [...new Set(compact(values))];
}

/* =========================================================
   MODULE
========================================================= */

export const SIDEBAR_SOURCE = "sidebar.ui";
export const SIDEBAR_MODULE_KEY = "sidebar";
export const SIDEBAR_MODULE_NAME = "SidebarUI";

export const SIDEBAR_ROOT_ID = "app-sidebar";
export const SIDEBAR_MOUNT_ID = "sidebar-mount";

export const SIDEBAR_BRAND_LABEL = "Onion Support";

/*
  Fallback interno.
  El controlador del sidebar debe resolver la Home visible real:
    /@{user.slug}
*/
export const SIDEBAR_BRAND_HREF = "/";

/* =========================================================
   ROLES
========================================================= */

export const SIDEBAR_ROLE_ADMIN = "admin";
export const SIDEBAR_ROLE_USER = "user";

export const SIDEBAR_ROLES = freeze({
  admin: SIDEBAR_ROLE_ADMIN,
  user: SIDEBAR_ROLE_USER,
});

export function isSidebarRole(value = "") {
  const role = String(value || "").toLowerCase();
  return role === SIDEBAR_ROLE_ADMIN || role === SIDEBAR_ROLE_USER;
}

export function normalizeSidebarRole(value = "", fallback = SIDEBAR_ROLE_USER) {
  if (Array.isArray(value)) {
    const roles = value
      .map((role) => normalizeSidebarRole(role, ""))
      .filter(Boolean);

    if (roles.includes(SIDEBAR_ROLE_ADMIN)) return SIDEBAR_ROLE_ADMIN;
    if (roles.includes(SIDEBAR_ROLE_USER)) return SIDEBAR_ROLE_USER;

    return isSidebarRole(fallback) ? fallback : SIDEBAR_ROLE_USER;
  }

  const role = String(value || "").toLowerCase();

  if (role === SIDEBAR_ROLE_ADMIN) return SIDEBAR_ROLE_ADMIN;
  if (role === SIDEBAR_ROLE_USER) return SIDEBAR_ROLE_USER;

  return isSidebarRole(fallback) ? fallback : SIDEBAR_ROLE_USER;
}

/* =========================================================
   ROUTES
========================================================= */

export const HOME_ROUTE = "/";
export const USER_HOME_PREFIX = CONFIG_USER_HOME_PREFIX || "/@";

export const INCIDENCIAS_ROUTE = CONFIG_ROUTES.incidencias || "/incidencias";
export const FACTURAS_ROUTE = CONFIG_ROUTES.facturas || "/facturas";
export const CLIENTES_ROUTE = CONFIG_ROUTES.clientes || "/clientes";
export const CUENTA_ROUTE = CONFIG_ROUTES.cuenta || "/cuenta";
export const AJUSTES_ROUTE = CONFIG_ROUTES.ajustes || "/ajustes";

/*
  Admin opcionales.
  No se inventan por fallback: sólo existen si core/config.js los define.
  Servidor acepta compat secundaria ROUTES.server sólo si viene de config.
*/
export const USUARIOS_ROUTE = CONFIG_ROUTES.usuarios || "";
export const SERVIDOR_ROUTE = CONFIG_ROUTES.servidor || CONFIG_ROUTES.server || "";
export const SERVER_ROUTE = SERVIDOR_ROUTE;

export const LOGIN_ROUTE = CONFIG_ROUTES.login || "/login";
export const PASSWORD_REQUEST_ROUTE = CONFIG_ROUTES.passwordRequest || "/password-request";
export const PASSWORD_RESET_ROUTE = CONFIG_ROUTES.passwordReset || "/password-reset";
export const ACTIVATE_ACCOUNT_ROUTE = CONFIG_ROUTES.activateAccount || "/activate-account";

/*
  Compat export.
  No es fuente de bloqueo. El bloqueo real se delega en core/config.js.
*/
export const SIDEBAR_BLOCKED_ROUTES = freeze([]);

export const SIDEBAR_PUBLIC_ROUTES = freeze(
  unique(
    Array.isArray(PUBLIC_ROUTES) && PUBLIC_ROUTES.length
      ? PUBLIC_ROUTES
      : [
          LOGIN_ROUTE,
          PASSWORD_REQUEST_ROUTE,
          PASSWORD_RESET_ROUTE,
          ACTIVATE_ACCOUNT_ROUTE,
        ]
  )
);

export const SIDEBAR_PRIVATE_FALLBACK_ROUTES = freeze(
  unique([
    HOME_ROUTE,
    INCIDENCIAS_ROUTE,
    FACTURAS_ROUTE,
    CLIENTES_ROUTE,
    CUENTA_ROUTE,
    AJUSTES_ROUTE,
    USUARIOS_ROUTE,
    SERVIDOR_ROUTE,
  ])
);

export const SIDEBAR_ADMIN_FALLBACK_ROUTES = freeze(
  unique([
    CLIENTES_ROUTE,
    USUARIOS_ROUTE,
    SERVIDOR_ROUTE,
  ])
);

const SIDEBAR_USER_SCOPED_ROUTES = freeze([
  ...SIDEBAR_PRIVATE_FALLBACK_ROUTES,
]);

/* =========================================================
   PATH NORMALIZATION
========================================================= */

function normalizeHashPath(value = "/") {
  const raw = text(value, "/");

  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || HOME_ROUTE;
  if (raw.startsWith("#/")) return raw.slice(1) || HOME_ROUTE;

  return raw;
}

function pathFromInput(value = "/") {
  try {
    return configRoutePathFromUrlLike(value) || HOME_ROUTE;
  } catch {
    const raw = normalizeHashPath(value);

    if (!raw) return HOME_ROUTE;
    if (raw.startsWith("//")) return HOME_ROUTE;

    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      return HOME_ROUTE;
    }

    if (/[\r\n\t\\]/.test(raw)) {
      return HOME_ROUTE;
    }

    return raw;
  }
}

function normalizePathname(pathname = "/") {
  try {
    return configNormalizeRoutePath(pathname) || HOME_ROUTE;
  } catch {
    let value = text(pathname, HOME_ROUTE).replace(/\\/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = value.replace(/\/{2,}/g, "/");

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || HOME_ROUTE;
    }

    return value || HOME_ROUTE;
  }
}

function normalizeSearch(search = "") {
  const value = text(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = text(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitSidebarPath(path = "/") {
  let raw = pathFromInput(path);
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || HOME_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || HOME_ROUTE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinSidebarPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || HOME_ROUTE),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

export function normalizeSidebarPath(path = "/") {
  const output = joinSidebarPath(splitSidebarPath(path));

  return isSidebarBlockedRoute(output) ? HOME_ROUTE : output;
}

export function canonicalSidebarPath(path = "/") {
  const route = splitSidebarPath(path).pathname || HOME_ROUTE;

  return isSidebarBlockedRoute(route) ? HOME_ROUTE : route;
}

function rawCanonicalSidebarPath(path = "/") {
  return splitSidebarPath(path).pathname || HOME_ROUTE;
}

export function isSidebarBlockedRoute(path = "/") {
  const route = rawCanonicalSidebarPath(path);

  try {
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // noop
  }

  try {
    if (configIsBlockedRoutePath(route) === true) return true;
  } catch {
    // noop
  }

  try {
    const scoped = configGetUserScopedRouteInfo(route);

    if (scoped?.scoped && scoped?.restPath) {
      return configIsBlockedRoutePath(scoped.restPath) === true;
    }
  } catch {
    // noop
  }

  return false;
}

export function normalizeSidebarSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = text(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

export function getSidebarUserScopedRouteInfo(path = "/") {
  const route = rawCanonicalSidebarPath(path);

  if (isSidebarBlockedRoute(route)) {
    return freeze({
      scoped: false,
      routable: false,
      home: false,
      slug: "",
      restPath: route,
      lookupPath: route,
      blocked: true,
    });
  }

  try {
    const info = configGetUserScopedRouteInfo(route);

    if (info && typeof info === "object") {
      const restPath = normalizePathname(
        info.restPath ||
          info.canonicalPath ||
          route
      );

      const lookupPath = normalizePathname(
        info.lookupPath ||
          info.canonicalPath ||
          restPath
      );

      const hasExplicitRoutable = Object.prototype.hasOwnProperty.call(
        info,
        "routable"
      );

      const routable =
        !isSidebarBlockedRoute(restPath) &&
        (
          hasExplicitRoutable
            ? Boolean(info.routable)
            : SIDEBAR_USER_SCOPED_ROUTES.includes(restPath)
        );

      return freeze({
        scoped: Boolean(info.scoped),
        routable: Boolean(routable),
        home: Boolean(info.home && routable),
        slug: normalizeSidebarSlug(info.slug || ""),
        restPath,
        lookupPath: routable ? lookupPath : route,
        blocked: false,
      });
    }
  } catch {
    // fallback local abajo
  }

  if (!route.startsWith(USER_HOME_PREFIX)) {
    return freeze({
      scoped: false,
      routable: SIDEBAR_USER_SCOPED_ROUTES.includes(route),
      home: route === HOME_ROUTE,
      slug: "",
      restPath: route,
      lookupPath: route,
      blocked: false,
    });
  }

  const rest = route.slice(USER_HOME_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeSidebarSlug(slugSegment);

  if (!slug) {
    return freeze({
      scoped: false,
      routable: false,
      home: false,
      slug: "",
      restPath: route,
      lookupPath: route,
      blocked: false,
    });
  }

  const restPath = restSegments.length
    ? normalizePathname(`/${restSegments.join("/")}`)
    : HOME_ROUTE;

  const routable =
    !isSidebarBlockedRoute(restPath) &&
    SIDEBAR_USER_SCOPED_ROUTES.includes(restPath);

  return freeze({
    scoped: true,
    routable,
    home: routable && restPath === HOME_ROUTE,
    slug,
    restPath,
    lookupPath: routable ? restPath : route,
    blocked: false,
  });
}

export function getSidebarUserHomeSlugFromPath(path = "/") {
  const info = getSidebarUserScopedRouteInfo(path);
  return info.home ? info.slug : "";
}

export function getSidebarUserScopedSlugFromPath(path = "/") {
  const info = getSidebarUserScopedRouteInfo(path);
  return info.scoped && info.routable ? info.slug : "";
}

export function getSidebarUserScopedRestPath(path = "/") {
  const info = getSidebarUserScopedRouteInfo(path);
  return info.scoped && info.routable ? info.restPath : "";
}

export function isSidebarUserHomeRoute(path = "/") {
  return Boolean(getSidebarUserScopedRouteInfo(path).home);
}

export function isSidebarUserScopedRoute(path = "/") {
  const info = getSidebarUserScopedRouteInfo(path);
  return Boolean(info.scoped && info.routable);
}

export function isSidebarHomeRoute(path = "/") {
  const route = rawCanonicalSidebarPath(path);
  return route === HOME_ROUTE || isSidebarUserHomeRoute(route);
}

export function sidebarHomeLookupPath(path = "/") {
  const info = getSidebarUserScopedRouteInfo(path);

  if (info.blocked) return "";
  if (info.scoped && info.routable) return info.lookupPath;

  return info.home ? HOME_ROUTE : canonicalSidebarPath(path);
}

export function isSidebarPublicRoute(path = "/") {
  const route = canonicalSidebarPath(path);
  const scoped = getSidebarUserScopedRouteInfo(path);

  if (!route || isSidebarBlockedRoute(route) || scoped.scoped) return false;

  try {
    if (configIsPublicRoute(route) === true) return true;
  } catch {
    // fallback abajo
  }

  return SIDEBAR_PUBLIC_ROUTES.includes(route);
}

export function isSidebarAdminFallbackRoute(path = "/") {
  const route = sidebarHomeLookupPath(path);

  if (!route || isSidebarBlockedRoute(route)) return false;

  try {
    if (configIsAdminRoute(route) === true) return true;
  } catch {
    // fallback abajo
  }

  return SIDEBAR_ADMIN_FALLBACK_ROUTES.includes(route);
}

/* =========================================================
   ROUTE META
========================================================= */

const BASE_ROUTE_META = {
  [HOME_ROUTE]: freeze({
    key: "home",
    label: "Inicio",
    icon: "home",
    order: 10,
  }),

  [INCIDENCIAS_ROUTE]: freeze({
    key: "incidencias",
    label: "Incidencias",
    icon: "incidencias",
    order: 20,
  }),

  [FACTURAS_ROUTE]: freeze({
    key: "facturas",
    label: "Facturas",
    icon: "facturas",
    order: 30,
  }),

  [CLIENTES_ROUTE]: freeze({
    key: "clientes",
    label: "Clientes",
    icon: "clientes",
    order: 40,
    adminOnly: true,
  }),

  [CUENTA_ROUTE]: freeze({
    key: "cuenta",
    label: "Cuenta",
    icon: "cuenta",
    order: 50,
  }),

  [AJUSTES_ROUTE]: freeze({
    key: "ajustes",
    label: "Ajustes",
    icon: "ajustes",
    order: 60,
  }),
};

if (USUARIOS_ROUTE) {
  BASE_ROUTE_META[USUARIOS_ROUTE] = freeze({
    key: "usuarios",
    label: "Usuarios",
    icon: "usuarios",
    order: 70,
    adminOnly: true,
  });
}

if (SERVIDOR_ROUTE) {
  BASE_ROUTE_META[SERVIDOR_ROUTE] = freeze({
    key: "servidor",
    label: "Servidor",
    icon: "servidor",
    order: 80,
    adminOnly: true,
  });
}

export const SIDEBAR_ROUTE_META = freeze(BASE_ROUTE_META);

function knownSidebarRouteMeta(path = "/") {
  const route = sidebarHomeLookupPath(path);

  if (!route || isSidebarBlockedRoute(route)) return null;

  if (route === HOME_ROUTE) {
    return SIDEBAR_ROUTE_META[HOME_ROUTE];
  }

  return SIDEBAR_ROUTE_META[route] || null;
}

function fallbackRouteMeta(path = "/") {
  const route = sidebarHomeLookupPath(path);

  if (!route || isSidebarBlockedRoute(route)) {
    return freeze({
      key: "blocked",
      label: "",
      icon: "home",
      order: 999,
      hidden: true,
    });
  }

  const key = route.replace(/^\//, "") || "home";

  return freeze({
    key,
    label:
      route === HOME_ROUTE
        ? "Inicio"
        : key
            .split("/")
            .filter(Boolean)
            .pop()
            .replace(/[-_]+/g, " ")
            .replace(/^\w/, (letter) => letter.toUpperCase()),
    icon: "home",
    order: 999,
  });
}

export function getSidebarRouteMeta(path = "/") {
  return knownSidebarRouteMeta(path) || fallbackRouteMeta(path);
}

export function getSidebarRouteLabel(path = "/", fallback = "") {
  const known = knownSidebarRouteMeta(path);

  if (known) return known.label;

  return text(fallback, getSidebarRouteMeta(path).label);
}

export function getSidebarRouteIcon(path = "/", fallback = "") {
  return text(fallback, getSidebarRouteMeta(path).icon);
}

export function getSidebarRouteOrder(path = "/", fallback = null) {
  const value = fallback ?? getSidebarRouteMeta(path).order;
  const output = Number(value);

  return Number.isFinite(output) ? output : 999;
}

/* =========================================================
   ATTRS / SELECTORS
========================================================= */

export const SIDEBAR_ATTRS = freeze({
  root: "data-sidebar-root",
  mount: "data-sidebar-mount",
  header: "data-sidebar-header",
  nav: "data-sidebar-nav",
  footer: "data-sidebar-footer",
  user: "data-sidebar-user",
  userAvatar: "data-sidebar-user-avatar",
  userName: "data-sidebar-user-name",
  userRole: "data-sidebar-user-role",
  link: "data-sidebar-link",
  navLink: "data-sidebar-nav-link",
  brand: "data-sidebar-brand",
  toggle: "data-sidebar-toggle",
  logout: "data-sidebar-logout",
  route: "data-route",
  active: "data-active",
  disabled: "data-disabled",
  spa: "data-spa",

  dropdown: "data-sidebar-dropdown",
  dropdownTrigger: "data-sidebar-dropdown-trigger",
  dropdownMenu: "data-sidebar-dropdown-menu",
  dropdownItem: "data-sidebar-dropdown-item",
});

export const SIDEBAR_SELECTORS = freeze({
  mount: `#${SIDEBAR_MOUNT_ID}, [data-sidebar-mount], #${SIDEBAR_ROOT_ID}, [data-sidebar-root]`,
  root: `#${SIDEBAR_ROOT_ID}, [data-sidebar-root]`,
  header: "[data-sidebar-header]",
  nav: "[data-sidebar-nav]",
  footer: "[data-sidebar-footer]",
  user: "[data-sidebar-user]",
  userAvatar: "[data-sidebar-user-avatar]",
  userName: "[data-sidebar-user-name]",
  userRole: "[data-sidebar-user-role]",
  link: "[data-sidebar-link]",
  navLink: "[data-sidebar-nav-link]",
  brand: "[data-sidebar-brand]",
  toggle: "[data-sidebar-toggle]",
  logout: "[data-sidebar-logout], [data-sidebar-action='logout'], [data-sidebar-menu-action='logout']",

  dropdown: "[data-sidebar-dropdown]",
  dropdownTrigger: "[data-sidebar-dropdown-trigger]",
  dropdownMenu: "[data-sidebar-dropdown-menu]",
  dropdownItem: "[data-sidebar-dropdown-item='true']",
  accountDropdown: "[data-sidebar-dropdown='account']",
  accountTrigger: "[data-sidebar-dropdown-trigger='account']",
  accountMenu: "[data-sidebar-dropdown-menu='account']",
});

/* =========================================================
   CLASSES
========================================================= */

export const SIDEBAR_CLASSES = freeze({
  root: "sidebar",
  appRoot: "app-sidebar",

  open: "is-open",
  collapsed: "is-collapsed",
  active: "is-active",
  disabled: "is-disabled",
  hidden: "is-hidden",
  loading: "is-loading",

  header: "sidebar-header",
  brand: "sidebar-brand",
  brandIcon: "sidebar-brand-icon",
  brandText: "sidebar-brand-text",
  toggle: "sidebar-toggle",

  nav: "sidebar-nav",
  list: "sidebar-list",
  item: "sidebar-item",
  link: "sidebar-link",
  linkIcon: "sidebar-link-icon",
  linkLabel: "sidebar-link-label",
  linkBadge: "sidebar-link-badge",

  footer: "sidebar-footer",
  user: "sidebar-user",
  userAvatar: "sidebar-user-avatar",
  userAvatarImage: "sidebar-user-avatar-image",
  userAvatarFallback: "sidebar-user-avatar-fallback",
  userInfo: "sidebar-user-info",
  userName: "sidebar-user-name",
  userRole: "sidebar-user-role",

  dropdown: "sidebar-account-dropdown",
  dropdownTrigger: "sidebar-account-trigger",
  dropdownMenu: "sidebar-account-menu",
  dropdownItem: "sidebar-account-menu-item",

  logout: "sidebar-logout",
  logoutIcon: "sidebar-logout-icon",
  logoutLabel: "sidebar-logout-label",
});

/* =========================================================
   ICON NAMES
========================================================= */

export const SIDEBAR_ICONS = freeze({
  menu: "menu",
  chevron: "chevron",

  home: "home",
  incidencias: "incidencias",
  facturas: "facturas",
  clientes: "clientes",
  usuarios: "usuarios",
  cuenta: "cuenta",
  ajustes: "ajustes",
  servidor: "servidor",
  help: "help",

  logout: "logout",
});

export function normalizeSidebarIcon(value = "") {
  const icon = text(value, "home")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return Object.values(SIDEBAR_ICONS).includes(icon)
    ? icon
    : SIDEBAR_ICONS.home;
}

/* =========================================================
   ACTIONS
========================================================= */

export const SIDEBAR_ACTIONS = freeze({
  navigate: "navigate",
  toggle: "toggle",
  open: "open",
  close: "close",
  logout: "logout",
  sync: "sync",
  accountMenu: "account-menu",
});

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarConstantsSnapshot() {
  return freeze({
    version: SIDEBAR_CONSTANTS_VERSION,

    module: {
      source: SIDEBAR_SOURCE,
      key: SIDEBAR_MODULE_KEY,
      name: SIDEBAR_MODULE_NAME,
    },

    root: {
      id: SIDEBAR_ROOT_ID,
      mountId: SIDEBAR_MOUNT_ID,
      brandLabel: SIDEBAR_BRAND_LABEL,
      brandHref: SIDEBAR_BRAND_HREF,
    },

    routes: {
      home: HOME_ROUTE,
      userHomePrefix: USER_HOME_PREFIX,

      public: SIDEBAR_PUBLIC_ROUTES,
      privateFallback: SIDEBAR_PRIVATE_FALLBACK_ROUTES,
      adminFallback: SIDEBAR_ADMIN_FALLBACK_ROUTES,
      userScoped: SIDEBAR_USER_SCOPED_ROUTES,

      blocked: SIDEBAR_BLOCKED_ROUTES,
      blockedOwner: "core/config.js",

      optionalAdmin: {
        usuarios: Boolean(USUARIOS_ROUTE),
        servidor: Boolean(SERVIDOR_ROUTE),
        servidorSource: SERVIDOR_ROUTE
          ? CONFIG_ROUTES.servidor
            ? "servidor"
            : "server"
          : null,
      },
    },

    roles: SIDEBAR_ROLES,
    selectors: SIDEBAR_SELECTORS,
    attrs: SIDEBAR_ATTRS,
    classes: SIDEBAR_CLASSES,
    icons: SIDEBAR_ICONS,
    actions: SIDEBAR_ACTIONS,

    policy: {
      constantsOnly: true,
      configDrivenRoutes: true,
      blockedRoutesDelegatedToCoreConfig: true,
      noLocalBlockedRouteList: true,

      clientesAdminOnly: true,
      optionalAdminRoutesRequireConfig: true,
      usuariosAdminOnly: true,
      servidorAdminOnly: true,
      servidorCompatServerKey: true,

      respectsExplicitCoreRoutable: true,
      doesNotReenableCoreNonRoutableUserScope: true,

      noDom: true,
      noAuth: true,
      noRouter: true,
      noStore: true,
      noStorage: true,

      noDropdownBehavior: true,
      dropdownSelectorsOnly: true,

      blocksHomeAlias: true,
      blocks403Route: true,
      blocks404Route: true,
      noLegacyRoutes: true,
      noHomeRoute: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,

      noSvgBrandIcon: true,
      companyLogoHandledByTemplateAndCss: true,
      avatarConstantsOnly: true,
      avatarHandledByUserAndTemplate: true,

      userSlugHome: true,
      userScopedPrivateRoutes: true,
      validatesAtSlugShape: true,

      roles: [SIDEBAR_ROLE_ADMIN, SIDEBAR_ROLE_USER],
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default freeze({
  SIDEBAR_CONSTANTS_VERSION,

  SIDEBAR_SOURCE,
  SIDEBAR_MODULE_KEY,
  SIDEBAR_MODULE_NAME,

  SIDEBAR_ROOT_ID,
  SIDEBAR_MOUNT_ID,
  SIDEBAR_BRAND_LABEL,
  SIDEBAR_BRAND_HREF,

  SIDEBAR_ROLE_ADMIN,
  SIDEBAR_ROLE_USER,
  SIDEBAR_ROLES,
  isSidebarRole,
  normalizeSidebarRole,

  HOME_ROUTE,
  USER_HOME_PREFIX,

  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  USUARIOS_ROUTE,
  SERVIDOR_ROUTE,
  SERVER_ROUTE,

  LOGIN_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  PASSWORD_RESET_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,

  SIDEBAR_BLOCKED_ROUTES,
  SIDEBAR_PUBLIC_ROUTES,
  SIDEBAR_PRIVATE_FALLBACK_ROUTES,
  SIDEBAR_ADMIN_FALLBACK_ROUTES,

  normalizeSidebarPath,
  canonicalSidebarPath,
  isSidebarBlockedRoute,

  normalizeSidebarSlug,
  getSidebarUserScopedRouteInfo,
  getSidebarUserHomeSlugFromPath,
  getSidebarUserScopedSlugFromPath,
  getSidebarUserScopedRestPath,
  isSidebarUserHomeRoute,
  isSidebarUserScopedRoute,
  isSidebarHomeRoute,
  sidebarHomeLookupPath,

  isSidebarPublicRoute,
  isSidebarAdminFallbackRoute,

  SIDEBAR_ROUTE_META,
  getSidebarRouteMeta,
  getSidebarRouteLabel,
  getSidebarRouteIcon,
  getSidebarRouteOrder,

  SIDEBAR_ATTRS,
  SIDEBAR_SELECTORS,
  SIDEBAR_CLASSES,
  SIDEBAR_ICONS,
  normalizeSidebarIcon,

  SIDEBAR_ACTIONS,

  getSidebarConstantsSnapshot,
});
