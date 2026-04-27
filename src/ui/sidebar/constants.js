/* =========================================================
   Onion SPA - Sidebar Constants
   Archivo: src/ui/sidebar/constants.js

   RESPONSABILIDADES:
   - centralizar constantes del módulo sidebar
   - ids del DOM
   - rutas internas del sidebar
   - acciones semánticas del sidebar
   - selectores DOM estables
   - breakpoint mobile
   - claves de storage
   - scope de cleanup / eventos

   HARDENING:
   - ids únicos y estables
   - rutas canónicas sin query/hash
   - storage key versionada / namespaced
   - compatibilidad legacy con sidebar-collapsed
   - constantes listas para i18n / template / eventos / estado
========================================================= */

/* =========================================================
   SCOPE
========================================================= */

export const SCOPE = "ui:sidebar";

/* =========================================================
   RESPONSIVE
========================================================= */

export const MOBILE_BREAKPOINT = 900;

/* =========================================================
   DOM IDS
========================================================= */

export const SIDEBAR_ROOT_ID = "sidebar";
export const SIDEBAR_MENU_ID = "sidebar-menu";
export const SIDEBAR_RECENTS_ID = "sidebar-recents";

export const SIDEBAR_MOUNT_ID = "sidebar-mount";

export const SIDEBAR_TOGGLE_ID = "sidebarToggle";
export const SIDEBAR_MOBILE_TOGGLE_ID = "toggleSidebarMobile";

export const USER_TOGGLE_ID = "userToggle";
export const USER_DROPDOWN_ID = "userDropdown";
export const LOGOUT_BUTTON_ID = "logoutBtn";

export const SIDEBAR_AVATAR_ID = "sidebar-avatar";
export const SIDEBAR_NAME_ID = "sidebar-name";

export const SERVER_NAV_ID = "sidebar-server-link";

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

export const SIDEBAR_ROUTES = Object.freeze({
  home: HOME_ROUTE,
  incidencias: INCIDENCIAS_ROUTE,
  facturas: FACTURAS_ROUTE,
  usuarios: USUARIOS_ROUTE,
  clientes: CLIENTES_ROUTE,
  cuenta: CUENTA_ROUTE,
  ajustes: AJUSTES_ROUTE,
  servidor: SERVER_ROUTE,
  login: LOGIN_ROUTE,
});

/* =========================================================
   ACTIONS
========================================================= */

export const SIDEBAR_ACTION_TOGGLE = "toggle-sidebar";
export const SIDEBAR_ACTION_TOGGLE_MOBILE = "mobile-sidebar-toggle";
export const SIDEBAR_ACTION_TOGGLE_USER = "toggle-user-dropdown";
export const SIDEBAR_ACTION_LOGOUT = "logout";

export const SIDEBAR_ACTIONS = Object.freeze({
  toggle: SIDEBAR_ACTION_TOGGLE,
  toggleMobile: SIDEBAR_ACTION_TOGGLE_MOBILE,
  toggleUser: SIDEBAR_ACTION_TOGGLE_USER,
  logout: SIDEBAR_ACTION_LOGOUT,
});

/* =========================================================
   DATA ATTRIBUTES
========================================================= */

export const SIDEBAR_DATA_ATTRS = Object.freeze({
  root: "data-sidebar",
  mount: "data-sidebar-mount",
  menu: "data-sidebar-menu",
  item: "data-sidebar-item",
  action: "data-sidebar-action",
  route: "data-route",
  role: "data-role",
  adminOnly: "data-admin-only",
  spa: "data-spa",
});

/* =========================================================
   SELECTORS
========================================================= */

export const SIDEBAR_SELECTORS = Object.freeze({
  root: `#${SIDEBAR_ROOT_ID}`,
  mount: `#${SIDEBAR_MOUNT_ID}, [data-sidebar-mount]`,
  menu: `#${SIDEBAR_MENU_ID}, [data-sidebar-menu]`,
  recents: `#${SIDEBAR_RECENTS_ID}`,
  toggle: `#${SIDEBAR_TOGGLE_ID}, [data-sidebar-action="${SIDEBAR_ACTION_TOGGLE}"]`,
  mobileToggle: `#${SIDEBAR_MOBILE_TOGGLE_ID}, [data-sidebar-mobile-toggle], [data-sidebar-action="${SIDEBAR_ACTION_TOGGLE_MOBILE}"]`,
  userToggle: `#${USER_TOGGLE_ID}`,
  userDropdown: `#${USER_DROPDOWN_ID}`,
  logoutButton: `#${LOGOUT_BUTTON_ID}, [data-sidebar-action="${SIDEBAR_ACTION_LOGOUT}"]`,
  avatar: `#${SIDEBAR_AVATAR_ID}`,
  name: `#${SIDEBAR_NAME_ID}`,
  serverLink: `#${SERVER_NAV_ID}`,
  spaLinks: `a[data-spa]`,
  adminOnly: `[data-admin-only="true"], [data-role="admin"]`,
});

/* =========================================================
   STORAGE
========================================================= */

/*
  Legacy:
  Se mantiene porque otros módulos pueden estar leyéndola.
*/
export const DESKTOP_COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

/*
  Nuevas claves estables.
  El storage adapter/AppCore puede prefijarlas con onion:.
*/
export const SIDEBAR_STORAGE_KEYS = Object.freeze({
  desktopCollapsed: DESKTOP_COLLAPSED_STORAGE_KEY,
  desktopOpen: "ui.sidebar.desktopOpen",
  mobileOpen: "ui.sidebar.mobileOpen",
  userDropdownOpen: "ui.sidebar.userDropdownOpen",
});

/* =========================================================
   CLASSES
========================================================= */

export const SIDEBAR_CLASSES = Object.freeze({
  root: "sidebar",
  mounted: "sidebar-mounted",
  collapsed: "collapsed",
  open: "open",
  mobileOpen: "mobile-open",
  hidden: "is-hidden",
  active: "active",
  disabled: "is-disabled",
  dropdownOpen: "open",
  adminHidden: "is-admin-hidden",
});

/* =========================================================
   EVENTS
========================================================= */

export const SIDEBAR_EVENTS = Object.freeze({
  ready: "sidebar:ready",
  destroyed: "sidebar:destroyed",
  repaired: "sidebar:repaired",
  refreshed: "sidebar:refreshed",
  eventsBound: "sidebar:events:bound",

  stateChange: "sidebar:state:change",
  userRendered: "sidebar:user:rendered",
  roleVisibilityApplied: "sidebar:role-visibility:applied",

  dropdownOpen: "sidebar:dropdown:open",
  dropdownClose: "sidebar:dropdown:close",
  dropdownToggle: "sidebar:dropdown:toggle",

  logoutStart: "sidebar:logout:start",
  logoutComplete: "sidebar:logout:complete",
  logoutError: "sidebar:logout:error",
});

/* =========================================================
   ROLE FLAGS
========================================================= */

export const SIDEBAR_ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super_administrador",
  "owner",
  "root",
]);

export const SIDEBAR_ADMIN_FLAG_KEYS = Object.freeze([
  "isAdmin",
  "admin",
  "isSuperAdmin",
  "superAdmin",
  "canManageUsers",
  "canAccessUsers",
]);

/* =========================================================
   MENU ORDER
========================================================= */

export const SIDEBAR_MENU_ORDER = Object.freeze([
  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  SERVER_ROUTE,
]);

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SCOPE,

  MOBILE_BREAKPOINT,

  SIDEBAR_ROOT_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  SIDEBAR_MOUNT_ID,

  SIDEBAR_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,

  USER_TOGGLE_ID,
  USER_DROPDOWN_ID,
  LOGOUT_BUTTON_ID,

  SIDEBAR_AVATAR_ID,
  SIDEBAR_NAME_ID,

  SERVER_NAV_ID,
  SERVER_ROUTE,

  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  LOGIN_ROUTE,

  SIDEBAR_ROUTES,
  SIDEBAR_ACTIONS,
  SIDEBAR_DATA_ATTRS,
  SIDEBAR_SELECTORS,
  SIDEBAR_STORAGE_KEYS,
  SIDEBAR_CLASSES,
  SIDEBAR_EVENTS,
  SIDEBAR_ADMIN_ROLE_KEYS,
  SIDEBAR_ADMIN_FLAG_KEYS,
  SIDEBAR_MENU_ORDER,

  DESKTOP_COLLAPSED_STORAGE_KEY,
};
