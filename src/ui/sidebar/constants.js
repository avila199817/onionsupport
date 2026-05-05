/* =========================================================
   Onion SPA - Sidebar Constants
   Archivo: src/ui/sidebar/constants.js

   FINAL EXTREME SYSTEM · SIDEBAR CONSTANTS · 11/10
   PATCH · REAL SHELL FIREBREAK READY
   PATCH · ROUTE ALIASES ES/CA/EN CANONICAL
   PATCH · NO ROUTER SHELL LOOP EVENTS
   PATCH · DOM IDS SINGLE SOURCE OF TRUTH
   PATCH · DROPDOWN / INDICATOR / EVENTS READY
   PATCH · LEGACY SAFE WITHOUT CSS

   RESPONSABILIDADES:
   - centralizar constantes del módulo sidebar
   - ids del DOM
   - rutas internas del sidebar
   - aliases legacy/controlados de rutas
   - acciones semánticas del sidebar
   - selectores DOM estables
   - breakpoint mobile
   - timings visuales
   - claves de storage
   - scope de cleanup / eventos
   - eventos públicos del sidebar
   - clases visuales compartidas
   - flags de rol/admin/permisos
   - orden canónico del menú
   - compatibilidad con template.js / dom.js / state.js / events.js
   - compatibilidad con visibility.js / user.js / actions.js
   - cero imports
   - cero CSS
   - solo constantes puras

   HARDENING EXTREMO:
   - ids únicos y estables
   - rutas canónicas sin query/hash
   - aliases ES/CA/EN centralizados
   - storage key versionada / namespaced
   - compatibilidad legacy con sidebar-collapsed/sidebarOpen
   - desktop toggle alineado con DOM real: toggleSidebar
   - sidebarToggle queda solo como legacy selector
   - eventos ampliados sin romper builds anteriores
   - no incluye eventos router:shell:* en observed para evitar loops
   - permisos admin-like centralizados
   - preparado para isRealShellHidden / isLegacyShellHidden
========================================================= */

/* =========================================================
   MODULE
========================================================= */

export const SIDEBAR_MODULE_NAME = "SidebarUI";
export const SIDEBAR_MODULE_KEY = "sidebar";
export const SIDEBAR_COMPONENT_NAME = "sidebar";
export const SIDEBAR_CONSTANTS_VERSION = "sidebar-constants-v7-firebreak-extreme";

/* =========================================================
   SCOPE
========================================================= */

export const SCOPE = "ui:sidebar";
export const SIDEBAR_SCOPE = SCOPE;

export const SIDEBAR_DOM_SCOPE = `${SCOPE}:dom`;
export const SIDEBAR_CORE_SCOPE = `${SCOPE}:core`;
export const SIDEBAR_EVENTS_SCOPE = `${SCOPE}:events`;
export const SIDEBAR_FALLBACK_SCOPE = `${SCOPE}:fallback`;
export const SIDEBAR_STATE_SCOPE = `${SCOPE}:state`;
export const SIDEBAR_DROPDOWN_SCOPE = `${SCOPE}:dropdown`;
export const SIDEBAR_VISIBILITY_SCOPE = `${SCOPE}:visibility`;
export const SIDEBAR_ACTIONS_SCOPE = `${SCOPE}:actions`;
export const SIDEBAR_TEMPLATE_SCOPE = `${SCOPE}:template`;

/* =========================================================
   RESPONSIVE
========================================================= */

export const MOBILE_BREAKPOINT = 900;
export const SIDEBAR_MOBILE_BREAKPOINT = MOBILE_BREAKPOINT;

/* =========================================================
   TIMINGS
========================================================= */

export const SIDEBAR_TRANSITION_MS = 380;

export const SIDEBAR_VISUAL_SYNC_DELAY_MS = 32;
export const SIDEBAR_VISUAL_SYNC_AFTER_NAV_MS = 80;
export const SIDEBAR_VISUAL_SYNC_AFTER_RENDER_MS = 96;
export const SIDEBAR_VISUAL_SYNC_AFTER_TRANSITION_MS =
  SIDEBAR_TRANSITION_MS + 50;

export const SIDEBAR_HOVER_FLUSH_MS = 96;

export const SIDEBAR_BIND_DEDUP_WINDOW_MS = 250;
export const SIDEBAR_REPAIR_DEDUP_WINDOW_MS = 180;

export const SIDEBAR_INDICATOR_DEFAULT_DELAY_MS = 40;
export const SIDEBAR_INDICATOR_RECALC_DELAY_MS = 32;
export const SIDEBAR_INDICATOR_SETTLED_DELAY_MS =
  SIDEBAR_TRANSITION_MS + 36;

export const SIDEBAR_DROPDOWN_CLOSE_DELAY_MS = 0;
export const SIDEBAR_DROPDOWN_FOCUS_DELAY_MS = 24;

export const SIDEBAR_RESIZE_DEBOUNCE_MS = 120;
export const SIDEBAR_ROUTER_SETTLED_DELAY_MS = 140;

/* =========================================================
   DOM IDS
========================================================= */

export const SIDEBAR_ROOT_ID = "sidebar";
export const SIDEBAR_MENU_ID = "sidebar-menu";
export const SIDEBAR_RECENTS_ID = "sidebar-recents";
export const SIDEBAR_MOUNT_ID = "sidebar-mount";

/*
  DOM actual:
  - template.js usa toggleSidebar
  - sidebarToggle queda como alias legacy
*/
export const SIDEBAR_TOGGLE_ID = "toggleSidebar";
export const SIDEBAR_TOGGLE_LEGACY_ID = "sidebarToggle";

export const SIDEBAR_MOBILE_TOGGLE_ID = "toggleSidebarMobile";
export const SIDEBAR_MOBILE_TOGGLE_LEGACY_ID = "sidebarMobileToggle";

export const SIDEBAR_LOGO_ID = "homeLink";
export const SIDEBAR_LOGO_LEGACY_ID = "sidebarLogo";

export const USER_TOGGLE_ID = "userToggle";
export const USER_TOGGLE_LEGACY_ID = "sidebarUserToggle";

export const USER_DROPDOWN_ID = "userDropdown";
export const USER_DROPDOWN_LEGACY_ID = "sidebarUserDropdown";

export const LOGOUT_BUTTON_ID = "logoutBtn";
export const LOGOUT_BUTTON_LEGACY_ID = "sidebarLogout";

export const SIDEBAR_AVATAR_ID = "sidebar-avatar";
export const SIDEBAR_AVATAR_LEGACY_ID = "sidebarAvatar";

export const SIDEBAR_AVATAR_IMAGE_ID = "sidebarAvatarImage";
export const SIDEBAR_AVATAR_FALLBACK_ID = "sidebarAvatarFallback";

export const SIDEBAR_NAME_ID = "sidebar-name";
export const SIDEBAR_NAME_LEGACY_ID = "sidebarName";

export const SIDEBAR_USER_PLAN_ID = "sidebarUserPlan";

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

export const SIDEBAR_ROUTE_KEYS = Object.freeze({
  home: "home",

  tickets: "tickets",
  incidencias: "incidencias",

  invoices: "invoices",
  facturas: "facturas",

  users: "users",
  usuarios: "usuarios",

  clients: "clients",
  clientes: "clientes",

  account: "account",
  cuenta: "cuenta",

  settings: "settings",
  ajustes: "ajustes",

  server: "server",
  servidor: "servidor",

  login: "login",
});

export const SIDEBAR_ROUTES = Object.freeze({
  home: HOME_ROUTE,

  tickets: INCIDENCIAS_ROUTE,
  incidencias: INCIDENCIAS_ROUTE,

  invoices: FACTURAS_ROUTE,
  facturas: FACTURAS_ROUTE,

  users: USUARIOS_ROUTE,
  usuarios: USUARIOS_ROUTE,

  clients: CLIENTES_ROUTE,
  clientes: CLIENTES_ROUTE,

  account: CUENTA_ROUTE,
  cuenta: CUENTA_ROUTE,

  settings: AJUSTES_ROUTE,
  ajustes: AJUSTES_ROUTE,

  server: SERVER_ROUTE,
  servidor: SERVER_ROUTE,

  login: LOGIN_ROUTE,
});

export const SIDEBAR_ROUTE_ALIASES = Object.freeze({
  "/": HOME_ROUTE,
  "/home": HOME_ROUTE,
  "/inicio": HOME_ROUTE,
  "/inici": HOME_ROUTE,
  "/dashboard": HOME_ROUTE,
  "/panel": HOME_ROUTE,

  "/tickets": INCIDENCIAS_ROUTE,
  "/ticket": INCIDENCIAS_ROUTE,
  "/incidents": INCIDENCIAS_ROUTE,
  "/incident": INCIDENCIAS_ROUTE,
  "/incidencia": INCIDENCIAS_ROUTE,
  "/incidencias": INCIDENCIAS_ROUTE,
  "/incidencies": INCIDENCIAS_ROUTE,
  "/soporte": INCIDENCIAS_ROUTE,
  "/support": INCIDENCIAS_ROUTE,

  "/invoices": FACTURAS_ROUTE,
  "/invoice": FACTURAS_ROUTE,
  "/billing": FACTURAS_ROUTE,
  "/factura": FACTURAS_ROUTE,
  "/facturas": FACTURAS_ROUTE,
  "/factures": FACTURAS_ROUTE,
  "/facturacion": FACTURAS_ROUTE,
  "/facturación": FACTURAS_ROUTE,
  "/facturacio": FACTURAS_ROUTE,
  "/facturació": FACTURAS_ROUTE,

  "/users": USUARIOS_ROUTE,
  "/user": USUARIOS_ROUTE,
  "/usuario": USUARIOS_ROUTE,
  "/usuarios": USUARIOS_ROUTE,
  "/usuaris": USUARIOS_ROUTE,
  "/usuari": USUARIOS_ROUTE,

  "/clients": CLIENTES_ROUTE,
  "/client": CLIENTES_ROUTE,
  "/customers": CLIENTES_ROUTE,
  "/customer": CLIENTES_ROUTE,
  "/cliente": CLIENTES_ROUTE,
  "/clientes": CLIENTES_ROUTE,

  "/account": CUENTA_ROUTE,
  "/profile": CUENTA_ROUTE,
  "/perfil": CUENTA_ROUTE,
  "/cuenta": CUENTA_ROUTE,
  "/compte": CUENTA_ROUTE,

  "/settings": AJUSTES_ROUTE,
  "/ajustes": AJUSTES_ROUTE,
  "/config": AJUSTES_ROUTE,
  "/configuration": AJUSTES_ROUTE,
  "/configuracion": AJUSTES_ROUTE,
  "/configuración": AJUSTES_ROUTE,
  "/configuracio": AJUSTES_ROUTE,
  "/configuració": AJUSTES_ROUTE,

  "/server": SERVER_ROUTE,
  "/servidor": SERVER_ROUTE,
});

/* =========================================================
   MENU
========================================================= */

export const SIDEBAR_MENU_KEYS = Object.freeze({
  home: "home",
  tickets: "tickets",
  invoices: "invoices",
  users: "users",
  clients: "clients",
  account: "account",
  settings: "settings",
  server: "server",
});

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

export const SIDEBAR_NAV_ITEMS = Object.freeze([
  Object.freeze({
    key: SIDEBAR_MENU_KEYS.home,
    route: HOME_ROUTE,
    i18nKey: "sidebar.menu.home",
    labelFallback: "Inicio",
    icon: "home",
    adminOnly: false,
    order: 10,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.tickets,
    route: INCIDENCIAS_ROUTE,
    i18nKey: "sidebar.menu.tickets",
    labelFallback: "Incidencias",
    icon: "tickets",
    adminOnly: false,
    order: 20,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.invoices,
    route: FACTURAS_ROUTE,
    i18nKey: "sidebar.menu.invoices",
    labelFallback: "Facturas",
    icon: "invoices",
    adminOnly: false,
    order: 30,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.users,
    route: USUARIOS_ROUTE,
    i18nKey: "sidebar.menu.users",
    labelFallback: "Usuarios",
    icon: "users",
    adminOnly: true,
    requiredRole: "admin",
    order: 40,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.clients,
    route: CLIENTES_ROUTE,
    i18nKey: "sidebar.menu.clients",
    labelFallback: "Clientes",
    icon: "clients",
    adminOnly: true,
    requiredRole: "admin",
    order: 50,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.account,
    route: CUENTA_ROUTE,
    i18nKey: "sidebar.menu.account",
    labelFallback: "Cuenta",
    icon: "account",
    adminOnly: false,
    order: 60,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.settings,
    route: AJUSTES_ROUTE,
    i18nKey: "sidebar.menu.settings",
    labelFallback: "Ajustes",
    icon: "settings",
    adminOnly: false,
    order: 70,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.server,
    route: SERVER_ROUTE,
    i18nKey: "sidebar.menu.server",
    labelFallback: "Servidor",
    icon: "server",
    adminOnly: true,
    requiredRole: "admin",
    order: 80,
  }),
]);

/* =========================================================
   ACTIONS
========================================================= */

export const SIDEBAR_ACTION_NAVIGATE = "navigate";

export const SIDEBAR_ACTION_TOGGLE = "toggle-sidebar";
export const SIDEBAR_ACTION_TOGGLE_MOBILE = "mobile-sidebar-toggle";
export const SIDEBAR_ACTION_TOGGLE_USER = "toggle-user-dropdown";

export const SIDEBAR_ACTION_OPEN_USER_MENU = "open-user-menu";
export const SIDEBAR_ACTION_CLOSE_USER_MENU = "close-user-menu";

export const SIDEBAR_ACTION_ADD_ACCOUNT = "add-account";
export const SIDEBAR_ACTION_CHANGE_PLAN = "change-plan";
export const SIDEBAR_ACTION_PROFILE = "profile";
export const SIDEBAR_ACTION_SETTINGS = "settings";
export const SIDEBAR_ACTION_HELP = "help";
export const SIDEBAR_ACTION_LOGOUT = "logout";

export const SIDEBAR_ACTIONS = Object.freeze({
  navigate: SIDEBAR_ACTION_NAVIGATE,

  toggle: SIDEBAR_ACTION_TOGGLE,
  toggleSidebar: SIDEBAR_ACTION_TOGGLE,
  sidebarToggle: SIDEBAR_ACTION_TOGGLE,

  toggleMobile: SIDEBAR_ACTION_TOGGLE_MOBILE,
  mobileSidebarToggle: SIDEBAR_ACTION_TOGGLE_MOBILE,

  toggleUser: SIDEBAR_ACTION_TOGGLE_USER,
  toggleUserDropdown: SIDEBAR_ACTION_TOGGLE_USER,
  userDropdown: SIDEBAR_ACTION_TOGGLE_USER,

  openUserMenu: SIDEBAR_ACTION_OPEN_USER_MENU,
  closeUserMenu: SIDEBAR_ACTION_CLOSE_USER_MENU,

  addAccount: SIDEBAR_ACTION_ADD_ACCOUNT,
  changePlan: SIDEBAR_ACTION_CHANGE_PLAN,
  profile: SIDEBAR_ACTION_PROFILE,
  settings: SIDEBAR_ACTION_SETTINGS,
  help: SIDEBAR_ACTION_HELP,
  logout: SIDEBAR_ACTION_LOGOUT,
});

export const SIDEBAR_ACTION_ALIASES = Object.freeze({
  "navigate": SIDEBAR_ACTION_NAVIGATE,
  "go": SIDEBAR_ACTION_NAVIGATE,
  "route": SIDEBAR_ACTION_NAVIGATE,
  "nav": SIDEBAR_ACTION_NAVIGATE,

  "toggle": SIDEBAR_ACTION_TOGGLE,
  "collapse": SIDEBAR_ACTION_TOGGLE,
  "toggle-collapse": SIDEBAR_ACTION_TOGGLE,
  "sidebar-toggle": SIDEBAR_ACTION_TOGGLE,
  "toggle-sidebar": SIDEBAR_ACTION_TOGGLE,

  "mobile-toggle": SIDEBAR_ACTION_TOGGLE_MOBILE,
  "toggle-mobile": SIDEBAR_ACTION_TOGGLE_MOBILE,
  "mobile-sidebar-toggle": SIDEBAR_ACTION_TOGGLE_MOBILE,
  "toggle-mobile-sidebar": SIDEBAR_ACTION_TOGGLE_MOBILE,

  "user-menu": SIDEBAR_ACTION_TOGGLE_USER,
  "user-dropdown": SIDEBAR_ACTION_TOGGLE_USER,
  "toggle-dropdown": SIDEBAR_ACTION_TOGGLE_USER,
  "toggle-user-menu": SIDEBAR_ACTION_TOGGLE_USER,
  "toggle-user-dropdown": SIDEBAR_ACTION_TOGGLE_USER,
  "open-user-menu": SIDEBAR_ACTION_OPEN_USER_MENU,
  "close-user-menu": SIDEBAR_ACTION_CLOSE_USER_MENU,

  "profile": SIDEBAR_ACTION_PROFILE,
  "account": SIDEBAR_ACTION_PROFILE,
  "settings": SIDEBAR_ACTION_SETTINGS,
  "help": SIDEBAR_ACTION_HELP,

  "signout": SIDEBAR_ACTION_LOGOUT,
  "sign-out": SIDEBAR_ACTION_LOGOUT,
  "logout": SIDEBAR_ACTION_LOGOUT,
  "log-out": SIDEBAR_ACTION_LOGOUT,
  "cerrar-sesion": SIDEBAR_ACTION_LOGOUT,
});

/* =========================================================
   DATA ATTRIBUTES
========================================================= */

export const SIDEBAR_DATA_ATTRS = Object.freeze({
  root: "data-sidebar",
  rootFlag: "data-sidebar-root",
  component: "data-component",
  templateVersion: "data-template-version",

  mount: "data-sidebar-mount",

  menu: "data-sidebar-menu",
  recents: "data-sidebar-recents",
  recent: "data-sidebar-recent",

  item: "data-sidebar-item",
  itemKey: "data-sidebar-item-key",
  nav: "data-sidebar-nav",
  navKey: "data-nav-key",
  routeKey: "data-route-key",
  menuKey: "data-menu-key",

  action: "data-sidebar-action",
  genericAction: "data-action",

  route: "data-route",
  href: "data-href",
  to: "data-to",
  publicPath: "data-public-path",
  canonicalPath: "data-canonical-path",
  spa: "data-spa",

  role: "data-role",
  roles: "data-roles",
  adminOnly: "data-admin-only",
  sidebarAdminOnly: "data-sidebar-admin-only",
  requiresRole: "data-requires-role",
  requiresRoles: "data-requires-roles",
  requiredRole: "data-required-role",
  requiredRoles: "data-required-roles",

  permission: "data-permission",
  permissions: "data-permissions",
  sidebarPermission: "data-sidebar-permission",
  sidebarPermissions: "data-sidebar-permissions",

  sidebarVisible: "data-sidebar-visible",
  roleVisible: "data-role-visible",
  adminVisible: "data-admin-visible",

  userToggle: "data-user-toggle",
  sidebarUserToggle: "data-sidebar-user-toggle",
  userDropdown: "data-user-dropdown",
  userMenu: "data-user-menu",
  sidebarUserDropdown: "data-sidebar-user-dropdown",
  sidebarUserMenu: "data-sidebar-user-menu",

  dropdown: "data-dropdown",
  dropdownMenu: "data-dropdown-menu",
  dropdownToggle: "data-dropdown-toggle",
  dropdownTarget: "data-dropdown-target",

  avatarRoot: "data-avatar-root",
  sidebarAvatar: "data-sidebar-avatar",
  userAvatar: "data-user-avatar",
  sidebarName: "data-sidebar-name",
  userName: "data-user-name",

  tooltip: "data-tooltip",
  i18n: "data-i18n",
  i18nAriaLabel: "data-i18n-aria-label",
  i18nAlt: "data-i18n-alt",
  i18nDataTooltip: "data-i18n-data-tooltip",
});

/* =========================================================
   SELECTORS
========================================================= */

export const SIDEBAR_SELECTORS = Object.freeze({
  root: [
    `#${SIDEBAR_ROOT_ID}`,
    "aside.sidebar",
    ".sidebar[data-sidebar-root='true']",
    ".sidebar[data-sidebar-root]",
    "[data-sidebar-root='true']",
    "[data-sidebar-root]",
    "[data-sidebar='true']",
  ].join(", "),

  mount: [
    `#${SIDEBAR_MOUNT_ID}`,
    "[data-sidebar-mount]",
  ].join(", "),

  menu: [
    `#${SIDEBAR_MENU_ID}`,
    ".sidebar-menu",
    "[data-sidebar-menu]",
    "nav.sidebar-menu",
  ].join(", "),

  recents: [
    `#${SIDEBAR_RECENTS_ID}`,
    ".sidebar-recents",
    "[data-sidebar-recents]",
    "[data-sidebar-recent]",
  ].join(", "),

  logo: [
    `#${SIDEBAR_LOGO_ID}`,
    `#${SIDEBAR_LOGO_LEGACY_ID}`,
    "a.logo",
    ".logo",
    ".sidebar-logo",
    "[data-sidebar-logo]",
  ].join(", "),

  toggle: [
    `#${SIDEBAR_TOGGLE_ID}`,
    `#${SIDEBAR_TOGGLE_LEGACY_ID}`,
    ".sidebar-toggle",
    "[data-sidebar-toggle]",
    `[data-sidebar-action="${SIDEBAR_ACTION_TOGGLE}"]`,
    `[data-action="${SIDEBAR_ACTION_TOGGLE}"]`,
  ].join(", "),

  mobileToggle: [
    `#${SIDEBAR_MOBILE_TOGGLE_ID}`,
    `#${SIDEBAR_MOBILE_TOGGLE_LEGACY_ID}`,
    ".sidebar-mobile-toggle",
    "[data-sidebar-mobile-toggle]",
    `[data-sidebar-action="${SIDEBAR_ACTION_TOGGLE_MOBILE}"]`,
    `[data-action="${SIDEBAR_ACTION_TOGGLE_MOBILE}"]`,
  ].join(", "),

  userToggle: [
    `#${USER_TOGGLE_ID}`,
    `#${USER_TOGGLE_LEGACY_ID}`,
    "#sidebar-user-toggle",
    "#sidebarUserMenuToggle",
    "#sidebar-user-menu-toggle",
    "#user-toggle",
    ".user[role='button']",
    ".sidebar-user-toggle",
    ".sidebar-user__toggle",
    ".sidebar-footer-user-toggle",
    ".sidebar-footer__user-toggle",
    ".user-toggle",
    ".user-menu-toggle",
    `[aria-controls="${USER_DROPDOWN_ID}"]`,
    "[data-user-toggle]",
    "[data-user-menu-toggle]",
    "[data-sidebar-user-toggle]",
    `[data-sidebar-action="${SIDEBAR_ACTION_TOGGLE_USER}"]`,
    `[data-action="${SIDEBAR_ACTION_TOGGLE_USER}"]`,
  ].join(", "),

  userDropdown: [
    `#${USER_DROPDOWN_ID}`,
    `#${USER_DROPDOWN_LEGACY_ID}`,
    "#sidebar-user-dropdown",
    "#sidebarUserMenu",
    "#sidebar-user-menu",
    "#userDropdown",
    "#user-dropdown",
    "#userMenu",
    "#user-menu",
    ".user-dropdown",
    ".user-menu",
    ".sidebar-user-dropdown",
    ".sidebar-user-menu",
    ".sidebar-user__dropdown",
    ".sidebar-user__menu",
    ".sidebar-footer-user-dropdown",
    ".sidebar-footer-user-menu",
    ".sidebar-footer__user-dropdown",
    ".sidebar-footer__user-menu",
    "[data-user-dropdown]",
    "[data-user-menu]",
    "[data-sidebar-user-dropdown]",
    "[data-sidebar-user-menu]",
    "[data-dropdown='user']",
    "[data-dropdown-menu='user']",
    "[data-sidebar-dropdown='user']",
  ].join(", "),

  logoutButton: [
    `#${LOGOUT_BUTTON_ID}`,
    `#${LOGOUT_BUTTON_LEGACY_ID}`,
    "#logoutButton",
    "#sidebar-logout",
    ".sidebar-logout",
    ".logout-button",
    ".logout-btn",
    `[data-sidebar-action="${SIDEBAR_ACTION_LOGOUT}"]`,
    `[data-action="${SIDEBAR_ACTION_LOGOUT}"]`,
    "[data-logout]",
    "[data-sidebar-logout]",
  ].join(", "),

  avatar: [
    `#${SIDEBAR_AVATAR_ID}`,
    `#${SIDEBAR_AVATAR_LEGACY_ID}`,
    ".avatar[data-avatar-root='true']",
    ".sidebar-avatar",
    ".sidebar-user-avatar",
    "[data-sidebar-avatar]",
    "[data-user-avatar]",
  ].join(", "),

  avatarImage: [
    `#${SIDEBAR_AVATAR_IMAGE_ID}`,
    ".avatar-image",
    "[data-avatar-image]",
  ].join(", "),

  avatarFallback: [
    `#${SIDEBAR_AVATAR_FALLBACK_ID}`,
    ".avatar-fallback",
    "[data-avatar-fallback]",
  ].join(", "),

  name: [
    `#${SIDEBAR_NAME_ID}`,
    `#${SIDEBAR_NAME_LEGACY_ID}`,
    "#sidebarUserName",
    "#sidebar-user-name",
    ".sidebar-name",
    ".sidebar-user-name",
    ".user-info .name",
    "[data-sidebar-name]",
    "[data-user-name]",
  ].join(", "),

  plan: [
    `#${SIDEBAR_USER_PLAN_ID}`,
    ".plan",
    ".sidebar-user-plan",
    "[data-sidebar-user-plan]",
  ].join(", "),

  serverLink: [
    `#${SERVER_NAV_ID}`,
    `[data-sidebar-item-key="server"]`,
    `[data-nav-key="server"]`,
    `[data-route-key="server"]`,
    `[data-menu-key="server"]`,
    `[data-route="${SERVER_ROUTE}"]`,
    `[data-href="${SERVER_ROUTE}"]`,
    `[data-to="${SERVER_ROUTE}"]`,
    `[href="${SERVER_ROUTE}"]`,
  ].join(", "),

  navItems: [
    "a[data-sidebar-nav='true']",
    "a[data-sidebar-item='true']",
    "a.menu-item",
    "a[data-spa]",
    "a[data-route]",
    "a[data-href]",
    "a[data-to]",
    ".menu-item[data-route]",
  ].join(", "),

  spaLinks: "a[data-spa]",

  adminOnly: [
    "[data-admin-only='true']",
    "[data-sidebar-admin-only='true']",
    "[data-role='admin']",
    "[data-requires-role='admin']",
    "[data-required-role='admin']",
  ].join(", "),

  roleManaged: [
    "[data-role]",
    "[data-roles]",
    "[data-admin-only]",
    "[data-sidebar-admin-only]",
    "[data-requires-role]",
    "[data-requires-roles]",
    "[data-required-role]",
    "[data-required-roles]",
    "[data-sidebar-role]",
    "[data-sidebar-roles]",
    "[data-permission]",
    "[data-permissions]",
    "[data-sidebar-permission]",
    "[data-sidebar-permissions]",
    "[data-scope]",
    "[data-scopes]",
  ].join(", "),

  hiddenOrDisabled: [
    "[hidden]",
    "[inert]",
    "[aria-hidden='true']",
    "[aria-disabled='true']",
    "[data-sidebar-visible='false']",
    "[data-role-visible='false']",
    "[data-admin-visible='false']",
  ].join(", "),

  tooltipBearing: [
    "[title]",
    "[data-tooltip]",
    "[data-i18n-data-tooltip]",
    "[aria-describedby]",
  ].join(", "),

  focusable: [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "details",
    "audio[controls]",
    "video[controls]",
    "[tabindex]",
    "[role='button']",
    "[role='link']",
    "[contenteditable='true']",
  ].join(", "),
});

/* =========================================================
   STORAGE
========================================================= */

/*
  Legacy principal:
  true  => desktop colapsado
  false => desktop abierto
*/
export const DESKTOP_COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

/*
  Legacy secundario:
  true  => sidebar abierto
  false => sidebar colapsado
*/
export const LEGACY_SIDEBAR_OPEN_STORAGE_KEY = "sidebarOpen";

export const SIDEBAR_STORAGE_NAMESPACE = "ui.sidebar";
export const SIDEBAR_STORAGE_NAMESPACE_ONION = "onion.ui.sidebar";

export const SIDEBAR_STORAGE_KEYS = Object.freeze({
  desktopCollapsed: DESKTOP_COLLAPSED_STORAGE_KEY,
  legacyDesktopOpen: LEGACY_SIDEBAR_OPEN_STORAGE_KEY,

  desktopCollapsedV2: `${SIDEBAR_STORAGE_NAMESPACE}.desktopCollapsed`,
  desktopOpen: `${SIDEBAR_STORAGE_NAMESPACE}.desktopOpen`,
  mobileOpen: `${SIDEBAR_STORAGE_NAMESPACE}.mobileOpen`,
  userDropdownOpen: `${SIDEBAR_STORAGE_NAMESPACE}.userDropdownOpen`,

  onionDesktopCollapsed: `${SIDEBAR_STORAGE_NAMESPACE_ONION}.desktopCollapsed`,
  onionDesktopOpen: `${SIDEBAR_STORAGE_NAMESPACE_ONION}.desktopOpen`,
  onionMobileOpen: `${SIDEBAR_STORAGE_NAMESPACE_ONION}.mobileOpen`,

  lastActiveRoute: `${SIDEBAR_STORAGE_NAMESPACE}.lastActiveRoute`,
  lastActivePublicPath: `${SIDEBAR_STORAGE_NAMESPACE}.lastActivePublicPath`,
});

/* =========================================================
   CLASSES
========================================================= */

export const SIDEBAR_CLASSES = Object.freeze({
  root: "sidebar",

  mounted: "sidebar-mounted",
  ready: "is-ready",

  collapsed: "collapsed",
  isCollapsed: "is-collapsed",

  open: "open",
  isOpen: "is-open",
  mobileOpen: "mobile-open",

  hidden: "is-hidden",

  active: "active",
  isActive: "is-active",
  routerActive: "router-active",

  disabled: "is-disabled",
  loading: "is-loading",

  dropdownOpen: "open",
  dropdownIsOpen: "is-open",
  dropdownVisible: "is-visible",

  roleHidden: "is-role-hidden",
  adminHidden: "is-admin-hidden",

  transitioning: "is-transitioning",
  bodyTransitioning: "sidebar-transitioning",

  visualSyncing: "is-visual-syncing",
  bodyVisualSyncing: "sidebar-visual-syncing",

  tooltipsActive: "sidebar-tooltips-active",
});

/* =========================================================
   DATASET VALUES
========================================================= */

export const SIDEBAR_DATASET_VALUES = Object.freeze({
  true: "true",
  false: "false",

  open: "open",
  closed: "closed",
  hidden: "hidden",

  desktop: "desktop",
  mobile: "mobile",

  admin: "admin",
  user: "user",

  page: "page",

  ready: "ready",
  pending: "pending",
  error: "error",
});

/* =========================================================
   SHELL FLAGS
========================================================= */

export const SIDEBAR_SHELL_HIDDEN_BODY_CLASSES = Object.freeze([
  "route-shell-hidden",
  "auth-screen",
  "route-auth",
]);

export const SIDEBAR_SHELL_VISIBLE_BODY_CLASSES = Object.freeze([
  "route-shell-visible",
  "route-app",
]);

export const SIDEBAR_SHELL_DATA_VALUES = Object.freeze({
  hidden: "hidden",
  visible: "visible",
  auth: "auth",
  app: "app",
  shell: "shell",
});

/* =========================================================
   EVENTS
========================================================= */

export const SIDEBAR_EVENTS = Object.freeze({
  ready: "sidebar:ready",
  destroyed: "sidebar:destroyed",

  repaired: "sidebar:repaired",
  repairDeduped: "sidebar:repair:deduped",
  refreshed: "sidebar:refreshed",

  domMounted: "sidebar:dom:mounted",
  domRevealed: "sidebar:dom:revealed",

  eventsBound: "sidebar:events:bound",
  eventsBindSkipped: "sidebar:events:bind-skipped",
  eventsBindIgnored: "sidebar:events:bind-ignored",

  domEventsBound: "sidebar:dom-events:bound",
  coreEventsBound: "sidebar:core-events:bound",

  stateSynced: "sidebar:state:synced",
  stateChange: "sidebar:state:change",
  stateChangeStart: "sidebar:state:change:start",
  stateChangeBlocked: "sidebar:state:change:blocked",
  stateUnchanged: "sidebar:state:unchanged",
  stateRepaired: "sidebar:state:repaired",

  uiOpenSet: "sidebar:ui:open:set",

  activeItemSynced: "sidebar:active:item:synced",
  activeItemOverridden: "sidebar:active:item:overridden",
  activeRouteSynced: "sidebar:active-route:synced",
  activeInvalidated: "sidebar:active:invalidated",

  indicatorSynced: "sidebar:indicator:synced",
  indicatorDisabled: "sidebar:indicator:disabled",
  indicatorCleared: "sidebar:indicator:cleared",
  indicatorRefreshRequest: "sidebar:indicator:refresh-request",

  visualCommitted: "sidebar:visual:committed",

  transitionBegin: "sidebar:transition:begin",
  transitionEnd: "sidebar:transition:end",
  transitionStart: "sidebar:transition:start",
  transitionFinish: "sidebar:transition:finish",

  userRendered: "sidebar:user:rendered",
  userAvatarLoaded: "sidebar:user:avatar:loaded",
  userAvatarError: "sidebar:user:avatar:error",

  roleVisibilityApplied: "sidebar:role-visibility:applied",
  visibilityApplied: "sidebar:visibility:applied",
  rolesAppliedLegacy: "sidebar:roles:applied",

  dropdownChange: "sidebar:dropdown:change",
  dropdownOpen: "sidebar:dropdown:open",
  dropdownClose: "sidebar:dropdown:close",
  dropdownToggle: "sidebar:dropdown:toggle",
  dropdownBlocked: "sidebar:dropdown:blocked",
  dropdownRepaired: "sidebar:dropdown:repaired",

  navigationRequest: "sidebar:navigation:request",
  dropdownNavigationRequest: "sidebar:dropdown:navigation:request",

  fallbackAction: "sidebar:fallback:action",
  userToggleDirect: "sidebar:user-toggle:direct",

  menuInteractionRestored: "sidebar:menu:interaction-restored",

  logoutStart: "sidebar:logout:start",
  logoutRemoteStart: "sidebar:logout:remote:start",
  logoutRemoteSuccess: "sidebar:logout:remote:success",
  logoutRemoteError: "sidebar:logout:remote:error",
  logoutRemoteSkipped: "sidebar:logout:remote:skipped",
  logoutLocalCleared: "sidebar:logout:local-cleared",
  logoutNavigateStart: "sidebar:logout:navigate:start",
  logoutNavigateComplete: "sidebar:logout:navigate:complete",
  logoutComplete: "sidebar:logout:complete",
  logoutError: "sidebar:logout:error",
  logoutFinally: "sidebar:logout:finally",
});

/* =========================================================
   APP / ROUTER / AUTH EVENTS OBSERVED BY SIDEBAR
========================================================= */

export const SIDEBAR_OBSERVED_APP_EVENTS = Object.freeze([
  "app:ready",
  "app:boot:ready",
  "app:boot:complete",

  "app:user:change",
  "app:user:updated",

  "app:session:change",
  "app:session:restored",
  "app:session:cleared",
  "app:auth:change",
  "app:auth:ready",

  "app:route:change",
  "app:ui:repair-request",

  "app:lang:change",
  "i18n:change",

  "theme:change",
  "app:theme:change",
]);

export const SIDEBAR_OBSERVED_AUTH_EVENTS = Object.freeze([
  "auth:change",
  "auth:updated",

  "auth:restore:success",
  "auth:session:restored",
  "auth:session:applied",
  "auth:session:cleared",

  "login:success",
  "auth:login:success",
  "app:login:success",

  "auth:logout",
  "auth:logout:success",
  "logout:success",
]);

export const SIDEBAR_OBSERVED_ROUTER_EVENTS = Object.freeze([
  "router:bound",
  "router:before-render",
  "router:rendered",
  "router:route:change",
  "router:navigation:complete",
  "router:render:async-complete",
  "router:rendered:complete",
]);

export const SIDEBAR_BLOCKED_ROUTER_EVENTS = Object.freeze([
  "router:shell:repair",
  "router:shell:state",
  "sidebar:refreshed",
  "sidebar:repaired",
  "sidebar:state:synced",
  "app:user-ui:sync",
]);

/* =========================================================
   ROLE FLAGS
========================================================= */

export const SIDEBAR_ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-admin",
  "super_administrador",
  "super-administrador",
  "owner",
  "root",
  "staff",
  "support",
]);

export const SIDEBAR_ADMIN_PERMISSION_KEYS = Object.freeze([
  "admin:*",
  "admin.all",
  "admin.full",
  "admin.manage",
  "admin:manage",
  "admin.write",
  "admin:write",
  "admin.read",
  "admin:read",

  "users.manage",
  "users:manage",
  "users.write",
  "users:write",
  "users.admin",
  "users:admin",
  "users.access",
  "users:access",

  "usuarios.manage",
  "usuarios:manage",
  "usuarios.write",
  "usuarios:write",
  "usuarios.admin",
  "usuarios:admin",
  "usuarios.access",
  "usuarios:access",

  "manage_users",
  "can_manage_users",
  "access_users",
  "can_access_users",

  "clients.manage",
  "clients:manage",
  "clients.write",
  "clients:write",
  "clients.admin",
  "clients:admin",

  "clientes.manage",
  "clientes:manage",
  "clientes.write",
  "clientes:write",
  "clientes.admin",
  "clientes:admin",

  "server.manage",
  "server:manage",
  "server.admin",
  "server:admin",
  "server.access",
  "server:access",

  "servidor.manage",
  "servidor:manage",
  "servidor.admin",
  "servidor:admin",
  "servidor.access",
  "servidor:access",

  "tickets.manage",
  "tickets:manage",
  "tickets.admin",
  "tickets:admin",

  "incidencias.manage",
  "incidencias:manage",
  "incidencias.admin",
  "incidencias:admin",

  "facturas.manage",
  "facturas:manage",
  "facturas.admin",
  "facturas:admin",

  "invoices.manage",
  "invoices:manage",
  "invoices.admin",
  "invoices:admin",
]);

export const SIDEBAR_ADMIN_FLAG_KEYS = Object.freeze([
  "isAdmin",
  "admin",
  "is_admin",

  "isSuperAdmin",
  "superAdmin",
  "is_super_admin",

  "canManageUsers",
  "can_manage_users",

  "canAccessUsers",
  "can_access_users",

  "canManageClients",
  "can_manage_clients",

  "canAccessServer",
  "can_access_server",
]);

/* =========================================================
   EVENT HANDLED FLAGS
========================================================= */

export const SIDEBAR_HANDLED_FLAG = "__onionSidebarHandled";
export const SIDEBAR_EVENTS_HANDLED_FLAG = "__onionSidebarEventsHandled";
export const SIDEBAR_HANDLED_REASON_FLAG = "__onionSidebarReason";

/* =========================================================
   I18N KEYS
========================================================= */

export const SIDEBAR_I18N_KEYS = Object.freeze({
  ariaMain: "sidebar.aria.main",
  ariaNavigation: "sidebar.aria.navigation",

  logoAriaLabel: "sidebar.logo.ariaLabel",
  logoAlt: "sidebar.logo.alt",

  toggleCollapse: "sidebar.toggle.collapse",
  toggleExpand: "sidebar.toggle.expand",
  toggleOpen: "sidebar.toggle.open",
  toggleClose: "sidebar.toggle.close",

  menuHome: "sidebar.menu.home",
  menuTickets: "sidebar.menu.tickets",
  menuInvoices: "sidebar.menu.invoices",
  menuUsers: "sidebar.menu.users",
  menuClients: "sidebar.menu.clients",
  menuAccount: "sidebar.menu.account",
  menuSettings: "sidebar.menu.settings",
  menuServer: "sidebar.menu.server",

  recentsAriaLabel: "sidebar.recents.ariaLabel",
  recentsTitle: "sidebar.recents.title",

  userToggleAriaLabel: "sidebar.user.toggleAriaLabel",
  userAvatarAriaLabel: "sidebar.user.avatarAriaLabel",
  userDefaultName: "sidebar.user.defaultName",
  userPlan: "sidebar.user.plan",
  userDropdownAriaLabel: "sidebar.user.dropdownAriaLabel",

  userAddAccount: "sidebar.user.addAccount",
  userChangePlan: "sidebar.user.changePlan",
  userProfile: "sidebar.user.profile",
  userSettings: "sidebar.user.settings",
  userHelp: "sidebar.user.help",
  userLogout: "sidebar.user.logout",
});

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_MODULE_NAME,
  SIDEBAR_MODULE_KEY,
  SIDEBAR_COMPONENT_NAME,
  SIDEBAR_CONSTANTS_VERSION,

  SCOPE,
  SIDEBAR_SCOPE,
  SIDEBAR_DOM_SCOPE,
  SIDEBAR_CORE_SCOPE,
  SIDEBAR_EVENTS_SCOPE,
  SIDEBAR_FALLBACK_SCOPE,
  SIDEBAR_STATE_SCOPE,
  SIDEBAR_DROPDOWN_SCOPE,
  SIDEBAR_VISIBILITY_SCOPE,
  SIDEBAR_ACTIONS_SCOPE,
  SIDEBAR_TEMPLATE_SCOPE,

  MOBILE_BREAKPOINT,
  SIDEBAR_MOBILE_BREAKPOINT,

  SIDEBAR_TRANSITION_MS,
  SIDEBAR_VISUAL_SYNC_DELAY_MS,
  SIDEBAR_VISUAL_SYNC_AFTER_NAV_MS,
  SIDEBAR_VISUAL_SYNC_AFTER_RENDER_MS,
  SIDEBAR_VISUAL_SYNC_AFTER_TRANSITION_MS,
  SIDEBAR_HOVER_FLUSH_MS,
  SIDEBAR_BIND_DEDUP_WINDOW_MS,
  SIDEBAR_REPAIR_DEDUP_WINDOW_MS,
  SIDEBAR_INDICATOR_DEFAULT_DELAY_MS,
  SIDEBAR_INDICATOR_RECALC_DELAY_MS,
  SIDEBAR_INDICATOR_SETTLED_DELAY_MS,
  SIDEBAR_DROPDOWN_CLOSE_DELAY_MS,
  SIDEBAR_DROPDOWN_FOCUS_DELAY_MS,
  SIDEBAR_RESIZE_DEBOUNCE_MS,
  SIDEBAR_ROUTER_SETTLED_DELAY_MS,

  SIDEBAR_ROOT_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  SIDEBAR_MOUNT_ID,

  SIDEBAR_TOGGLE_ID,
  SIDEBAR_TOGGLE_LEGACY_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_LEGACY_ID,

  SIDEBAR_LOGO_ID,
  SIDEBAR_LOGO_LEGACY_ID,

  USER_TOGGLE_ID,
  USER_TOGGLE_LEGACY_ID,
  USER_DROPDOWN_ID,
  USER_DROPDOWN_LEGACY_ID,

  LOGOUT_BUTTON_ID,
  LOGOUT_BUTTON_LEGACY_ID,

  SIDEBAR_AVATAR_ID,
  SIDEBAR_AVATAR_LEGACY_ID,
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,

  SIDEBAR_NAME_ID,
  SIDEBAR_NAME_LEGACY_ID,

  SIDEBAR_USER_PLAN_ID,

  SERVER_NAV_ID,

  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  SERVER_ROUTE,
  LOGIN_ROUTE,

  SIDEBAR_ROUTE_KEYS,
  SIDEBAR_ROUTES,
  SIDEBAR_ROUTE_ALIASES,

  SIDEBAR_MENU_KEYS,
  SIDEBAR_MENU_ORDER,
  SIDEBAR_NAV_ITEMS,

  SIDEBAR_ACTION_NAVIGATE,
  SIDEBAR_ACTION_TOGGLE,
  SIDEBAR_ACTION_TOGGLE_MOBILE,
  SIDEBAR_ACTION_TOGGLE_USER,
  SIDEBAR_ACTION_OPEN_USER_MENU,
  SIDEBAR_ACTION_CLOSE_USER_MENU,
  SIDEBAR_ACTION_ADD_ACCOUNT,
  SIDEBAR_ACTION_CHANGE_PLAN,
  SIDEBAR_ACTION_PROFILE,
  SIDEBAR_ACTION_SETTINGS,
  SIDEBAR_ACTION_HELP,
  SIDEBAR_ACTION_LOGOUT,
  SIDEBAR_ACTIONS,
  SIDEBAR_ACTION_ALIASES,

  SIDEBAR_DATA_ATTRS,
  SIDEBAR_SELECTORS,

  DESKTOP_COLLAPSED_STORAGE_KEY,
  LEGACY_SIDEBAR_OPEN_STORAGE_KEY,
  SIDEBAR_STORAGE_NAMESPACE,
  SIDEBAR_STORAGE_NAMESPACE_ONION,
  SIDEBAR_STORAGE_KEYS,

  SIDEBAR_CLASSES,
  SIDEBAR_DATASET_VALUES,

  SIDEBAR_SHELL_HIDDEN_BODY_CLASSES,
  SIDEBAR_SHELL_VISIBLE_BODY_CLASSES,
  SIDEBAR_SHELL_DATA_VALUES,

  SIDEBAR_EVENTS,
  SIDEBAR_OBSERVED_APP_EVENTS,
  SIDEBAR_OBSERVED_AUTH_EVENTS,
  SIDEBAR_OBSERVED_ROUTER_EVENTS,
  SIDEBAR_BLOCKED_ROUTER_EVENTS,

  SIDEBAR_ADMIN_ROLE_KEYS,
  SIDEBAR_ADMIN_PERMISSION_KEYS,
  SIDEBAR_ADMIN_FLAG_KEYS,

  SIDEBAR_HANDLED_FLAG,
  SIDEBAR_EVENTS_HANDLED_FLAG,
  SIDEBAR_HANDLED_REASON_FLAG,

  SIDEBAR_I18N_KEYS,
};
