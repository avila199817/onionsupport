/* =========================================================
   Onion Support - Sidebar Constants
   Archivo: /src/ui/sidebar/constants.js

   Responsabilidad:
   - Constantes compartidas del sidebar.
   - Rutas públicas reales.
   - Selectores comunes.
   - Clases comunes.
   - Metadatos visuales mínimos de rutas.
   - Roles únicos: admin / user.
   - Sin imports.
   - Sin DOM.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin storage.
   - Sin dropdown.
   - Sin rutas legacy.
   - Sin compatibilidad fantasma.
========================================================= */

export const SIDEBAR_CONSTANTS_VERSION = "sidebar.constants.v1";

/* =========================================================
   HELPERS INTERNOS
========================================================= */

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
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

export function normalizeSidebarRole(value = "") {
  if (Array.isArray(value)) {
    return value.map(normalizeSidebarRole).includes(SIDEBAR_ROLE_ADMIN)
      ? SIDEBAR_ROLE_ADMIN
      : SIDEBAR_ROLE_USER;
  }

  return String(value || "").toLowerCase() === SIDEBAR_ROLE_ADMIN
    ? SIDEBAR_ROLE_ADMIN
    : SIDEBAR_ROLE_USER;
}

/* =========================================================
   ROUTES
========================================================= */

export const HOME_ROUTE = "/";
export const INCIDENCIAS_ROUTE = "/incidencias";
export const FACTURAS_ROUTE = "/facturas";
export const USUARIOS_ROUTE = "/usuarios";
export const CLIENTES_ROUTE = "/clientes";
export const CUENTA_ROUTE = "/cuenta";
export const AJUSTES_ROUTE = "/ajustes";
export const SERVER_ROUTE = "/servidor";

export const LOGIN_ROUTE = "/login";
export const PASSWORD_REQUEST_ROUTE = "/password-request";
export const PASSWORD_RESET_ROUTE = "/password-reset";
export const ACTIVATE_ACCOUNT_ROUTE = "/activate-account";

export const SIDEBAR_PUBLIC_ROUTES = freeze([
  LOGIN_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  PASSWORD_RESET_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,
]);

export const SIDEBAR_PRIVATE_FALLBACK_ROUTES = freeze([
  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  USUARIOS_ROUTE,
  SERVER_ROUTE,
]);

export const SIDEBAR_ADMIN_FALLBACK_ROUTES = freeze([
  USUARIOS_ROUTE,
  SERVER_ROUTE,
]);

export function normalizeSidebarPath(path = "/") {
  let value = text(path, "/").replace(/\\/g, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    } catch {
      value = "/";
    }
  }

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

export function canonicalSidebarPath(path = "/") {
  let value = normalizeSidebarPath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || "/";
}

export function isSidebarPublicRoute(path = "/") {
  return SIDEBAR_PUBLIC_ROUTES.includes(canonicalSidebarPath(path));
}

export function isSidebarAdminFallbackRoute(path = "/") {
  return SIDEBAR_ADMIN_FALLBACK_ROUTES.includes(canonicalSidebarPath(path));
}

/* =========================================================
   ROUTE META
========================================================= */

export const SIDEBAR_ROUTE_META = freeze({
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

  [USUARIOS_ROUTE]: freeze({
    key: "usuarios",
    label: "Usuarios",
    icon: "usuarios",
    order: 70,
    adminOnly: true,
  }),

  [SERVER_ROUTE]: freeze({
    key: "servidor",
    label: "Servidor",
    icon: "servidor",
    order: 80,
    adminOnly: true,
  }),
});

export function getSidebarRouteMeta(path = "/") {
  const route = canonicalSidebarPath(path);

  return (
    SIDEBAR_ROUTE_META[route] ||
    freeze({
      key: route.replace(/^\//, "") || "home",
      label:
        route === "/"
          ? "Inicio"
          : route
              .replace(/^\//, "")
              .replace(/[-_]+/g, " ")
              .replace(/^\w/, (letter) => letter.toUpperCase()),
      icon: "home",
      order: 999,
    })
  );
}

export function getSidebarRouteLabel(path = "/", fallback = "") {
  return text(fallback, getSidebarRouteMeta(path).label);
}

export function getSidebarRouteIcon(path = "/", fallback = "") {
  return text(fallback, getSidebarRouteMeta(path).icon);
}

export function getSidebarRouteOrder(path = "/", fallback = null) {
  const value = fallback ?? getSidebarRouteMeta(path).order;
  const number = Number(value);

  return Number.isFinite(number) ? number : 999;
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
  link: "data-sidebar-link",
  navLink: "data-sidebar-nav-link",
  brand: "data-sidebar-brand",
  toggle: "data-sidebar-toggle",
  logout: "data-sidebar-logout",
  route: "data-route",
  active: "data-active",
  disabled: "data-disabled",
  spa: "data-spa",
});

export const SIDEBAR_SELECTORS = freeze({
  mount: `#${SIDEBAR_MOUNT_ID}, [data-sidebar-mount], #${SIDEBAR_ROOT_ID}, [data-sidebar-root]`,
  root: `#${SIDEBAR_ROOT_ID}, [data-sidebar-root]`,
  header: "[data-sidebar-header]",
  nav: "[data-sidebar-nav]",
  footer: "[data-sidebar-footer]",
  user: "[data-sidebar-user]",
  link: "[data-sidebar-link]",
  navLink: "[data-sidebar-nav-link]",
  brand: "[data-sidebar-brand]",
  toggle: "[data-sidebar-toggle]",
  logout: "[data-sidebar-logout]",
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
  userInfo: "sidebar-user-info",
  userName: "sidebar-user-name",
  userRole: "sidebar-user-role",

  logout: "sidebar-logout",
  logoutIcon: "sidebar-logout-icon",
  logoutLabel: "sidebar-logout-label",
});

/* =========================================================
   ICON NAMES
========================================================= */

export const SIDEBAR_ICONS = freeze({
  brand: "brand",
  menu: "menu",
  home: "home",
  incidencias: "incidencias",
  facturas: "facturas",
  clientes: "clientes",
  usuarios: "usuarios",
  cuenta: "cuenta",
  ajustes: "ajustes",
  servidor: "servidor",
  logout: "logout",
});

export function normalizeSidebarIcon(value = "") {
  const icon = text(value, "home").toLowerCase();

  return SIDEBAR_ICONS[icon] || SIDEBAR_ICONS.home;
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
      public: SIDEBAR_PUBLIC_ROUTES,
      privateFallback: SIDEBAR_PRIVATE_FALLBACK_ROUTES,
      adminFallback: SIDEBAR_ADMIN_FALLBACK_ROUTES,
    },

    roles: SIDEBAR_ROLES,
    selectors: SIDEBAR_SELECTORS,
    attrs: SIDEBAR_ATTRS,
    classes: SIDEBAR_CLASSES,
    icons: SIDEBAR_ICONS,
    actions: SIDEBAR_ACTIONS,
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
  normalizeSidebarRole,

  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  SERVER_ROUTE,

  LOGIN_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  PASSWORD_RESET_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,

  SIDEBAR_PUBLIC_ROUTES,
  SIDEBAR_PRIVATE_FALLBACK_ROUTES,
  SIDEBAR_ADMIN_FALLBACK_ROUTES,

  normalizeSidebarPath,
  canonicalSidebarPath,
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
