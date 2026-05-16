/* =========================================================
   Onion SPA - Sidebar Template
   Archivo: src/ui/sidebar/template.js

   SIDEBAR TEMPLATE · SIMPLE
   - HTML base puro del sidebar
   - ids/rutas/acciones desde constants.js
   - menú principal + footer usuario + dropdown
   - admin items ocultos de inicio, recuperables por visibility.js
   - sin JS inline, sin CSS inline, sin title nativo
========================================================= */

import { I18n } from "../../i18n/index.js";

import {
  SIDEBAR_MODULE_NAME,
  SIDEBAR_COMPONENT_NAME,
  SIDEBAR_CONSTANTS_VERSION,

  SIDEBAR_ROOT_ID,
  SIDEBAR_MOUNT_ID,
  SIDEBAR_NAV_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  SIDEBAR_FOOTER_ID,
  SIDEBAR_INDICATOR_ID,

  SIDEBAR_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,

  SIDEBAR_LOGO_ID,

  USER_SECTION_ID,
  USER_TOGGLE_ID,
  USER_DROPDOWN_ID,

  LOGOUT_BUTTON_ID,

  SIDEBAR_AVATAR_ID,
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,

  SIDEBAR_NAME_ID,
  SIDEBAR_USER_PLAN_ID,

  SERVER_NAV_ID,

  SIDEBAR_ROUTES,
  SIDEBAR_ROUTE_ALIASES,
  SIDEBAR_NAV_ITEMS,

  SIDEBAR_ACTION_NAVIGATE,
  SIDEBAR_ACTION_TOGGLE,
  SIDEBAR_ACTION_TOGGLE_USER,
  SIDEBAR_ACTION_ADD_ACCOUNT,
  SIDEBAR_ACTION_CHANGE_PLAN,
  SIDEBAR_ACTION_PROFILE,
  SIDEBAR_ACTION_SETTINGS,
  SIDEBAR_ACTION_HELP,
  SIDEBAR_ACTION_LOGOUT,

  SIDEBAR_DATA_ATTRS,
  SIDEBAR_I18N_KEYS,
} from "./constants.js";

export const SIDEBAR_TEMPLATE_VERSION = "sidebar-template-v17-simple";

/* =========================================================
   BASIC HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function attr(name = "", value = "") {
  const cleanName = safeText(name, "");
  if (!cleanName || !/^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(cleanName)) return "";
  if (value === null || value === undefined || value === false) return "";
  return ` ${cleanName}="${escapeAttr(value)}"`;
}

function boolAttr(name = "", enabled = false) {
  const cleanName = safeText(name, "");
  return cleanName && enabled ? ` ${cleanName}` : "";
}

/* =========================================================
   CONTRACT FALLBACKS
========================================================= */

const I18N_KEYS = safeObject(SIDEBAR_I18N_KEYS);
const RAW_ROUTES = safeObject(SIDEBAR_ROUTES);
const ROUTE_ALIASES = Object.freeze({ ...safeObject(SIDEBAR_ROUTE_ALIASES) });

const ACTIONS = Object.freeze({
  navigate: safeText(SIDEBAR_ACTION_NAVIGATE, "navigate"),
  toggle: safeText(SIDEBAR_ACTION_TOGGLE, "toggle-sidebar"),
  toggleUser: safeText(SIDEBAR_ACTION_TOGGLE_USER, "toggle-user-dropdown"),
  addAccount: safeText(SIDEBAR_ACTION_ADD_ACCOUNT, "add-account"),
  changePlan: safeText(SIDEBAR_ACTION_CHANGE_PLAN, "change-plan"),
  profile: safeText(SIDEBAR_ACTION_PROFILE, "profile"),
  settings: safeText(SIDEBAR_ACTION_SETTINGS, "settings"),
  help: safeText(SIDEBAR_ACTION_HELP, "help"),
  logout: safeText(SIDEBAR_ACTION_LOGOUT, "logout"),
});

const IDS = Object.freeze({
  root: safeText(SIDEBAR_ROOT_ID, "app-sidebar"),
  mount: safeText(SIDEBAR_MOUNT_ID, "sidebar-mount"),
  nav: safeText(SIDEBAR_NAV_ID, "sidebar-nav"),
  menu: safeText(SIDEBAR_MENU_ID, "sidebar-menu"),
  recents: safeText(SIDEBAR_RECENTS_ID, "sidebar-recents"),
  footer: safeText(SIDEBAR_FOOTER_ID, "sidebar-footer"),
  indicator: safeText(SIDEBAR_INDICATOR_ID, "sidebar-active-indicator"),
  toggle: safeText(SIDEBAR_TOGGLE_ID, "toggleSidebar"),
  mobileToggle: safeText(SIDEBAR_MOBILE_TOGGLE_ID, "toggleSidebarMobile"),
  logo: safeText(SIDEBAR_LOGO_ID, "sidebar-logo"),
  userSection: safeText(USER_SECTION_ID, "sidebar-user-section"),
  userToggle: safeText(USER_TOGGLE_ID, "userToggle"),
  userDropdown: safeText(USER_DROPDOWN_ID, "userDropdown"),
  logout: safeText(LOGOUT_BUTTON_ID, "logout-btn"),
  avatar: safeText(SIDEBAR_AVATAR_ID, "sidebarAvatar"),
  avatarImage: safeText(SIDEBAR_AVATAR_IMAGE_ID, "sidebarAvatarImage"),
  avatarFallback: safeText(SIDEBAR_AVATAR_FALLBACK_ID, "sidebarAvatarFallback"),
  name: safeText(SIDEBAR_NAME_ID, "sidebarName"),
  plan: safeText(SIDEBAR_USER_PLAN_ID, "sidebarUserPlan"),
  server: safeText(SERVER_NAV_ID, "server-nav"),
});

function i18nKey(name = "", fallback = "") {
  return safeText(I18N_KEYS[name], fallback);
}

function t(key = "", fallback = "", params = {}) {
  const cleanKey = safeText(key, "");
  const cleanFallback = safeText(fallback, cleanKey);
  if (!cleanKey) return cleanFallback;

  try {
    if (typeof I18n?.t === "function") {
      const attempts = [
        () => I18n.t(cleanKey, params, cleanFallback),
        () => I18n.t(cleanKey, cleanFallback, params),
        () => I18n.t(cleanKey),
      ];

      for (const attempt of attempts) {
        const value = safeText(attempt(), "");
        if (value && value !== cleanKey) return value;
      }
    }
  } catch {}

  return cleanFallback;
}

/* =========================================================
   ROUTES
========================================================= */

function isUnsafeHref(value = "") {
  const raw = safeText(value, "");
  const lower = raw.toLowerCase();

  return Boolean(
    !raw ||
      /[\r\n\t\\]/.test(raw) ||
      lower.startsWith("//") ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("vbscript:") ||
      lower.startsWith("file:") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
  );
}

function normalizePathname(pathname = "/") {
  let value = safeText(pathname, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;

  const segments = [];

  for (const rawSegment of value.split("/").filter(Boolean)) {
    let segment = rawSegment;

    try {
      segment = decodeURIComponent(rawSegment);
    } catch {}

    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(rawSegment);
  }

  value = `/${segments.join("/")}`;
  return value.length > 1 ? value.replace(/\/+$/g, "") || "/" : value || "/";
}

function splitRoute(value = "/") {
  let pathname = safeText(value, "/");
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return { pathname, search, hash };
}

function normalizeRoute(value = "/", { preserveSearch = false, preserveHash = false } = {}) {
  let text = safeText(value, "/");
  if (!text || isUnsafeHref(text)) return "/";

  if (text.startsWith("#/")) text = text.replace(/^#\/?/, "/");
  else if (text.startsWith("#!")) text = text.replace(/^#!\/?/, "/");
  else if (text.startsWith("#")) return "/";

  if (!text.startsWith("/")) text = `/${text}`;

  const parts = splitRoute(text);
  const pathname = normalizePathname(parts.pathname || "/");
  const aliased = ROUTE_ALIASES[pathname] || pathname;
  const search = preserveSearch && parts.search ? (parts.search.startsWith("?") ? parts.search : `?${parts.search}`) : "";
  const hash = preserveHash && parts.hash ? (parts.hash.startsWith("#") ? parts.hash : `#${parts.hash}`) : "";

  return `${aliased}${search}${hash}`;
}

function canonicalRoute(value = "/") {
  return normalizeRoute(value, { preserveSearch: false, preserveHash: false });
}

const ROUTES = Object.freeze({
  home: canonicalRoute(RAW_ROUTES.home || "/"),
  tickets: canonicalRoute(RAW_ROUTES.tickets || RAW_ROUTES.incidencias || "/incidencias"),
  invoices: canonicalRoute(RAW_ROUTES.invoices || RAW_ROUTES.facturas || "/facturas"),
  users: canonicalRoute(RAW_ROUTES.users || RAW_ROUTES.usuarios || "/usuarios"),
  clients: canonicalRoute(RAW_ROUTES.clients || RAW_ROUTES.clientes || "/clientes"),
  account: canonicalRoute(RAW_ROUTES.account || RAW_ROUTES.profile || "/cuenta"),
  settings: canonicalRoute(RAW_ROUTES.settings || RAW_ROUTES.configuracion || "/ajustes"),
  server: canonicalRoute(RAW_ROUTES.server || RAW_ROUTES.servidor || "/servidor"),
});

function defaultNavItems() {
  return [
    { key: "home", route: ROUTES.home, icon: "home", i18nKey: "sidebar.nav.home", labelFallback: "Inicio", order: 10 },
    { key: "tickets", route: ROUTES.tickets, icon: "tickets", i18nKey: "sidebar.nav.tickets", labelFallback: "Incidencias", order: 20 },
    { key: "invoices", route: ROUTES.invoices, icon: "invoices", i18nKey: "sidebar.nav.invoices", labelFallback: "Facturas", order: 30 },
    { key: "clients", route: ROUTES.clients, icon: "clients", i18nKey: "sidebar.nav.clients", labelFallback: "Clientes", order: 40, adminOnly: true, requiredRole: "admin" },
    { key: "users", route: ROUTES.users, icon: "users", i18nKey: "sidebar.nav.users", labelFallback: "Usuarios", order: 50, adminOnly: true, requiredRole: "admin" },
    { key: "server", route: ROUTES.server, icon: "server", i18nKey: "sidebar.nav.server", labelFallback: "Servidor", order: 60, adminOnly: true, requiredRole: "admin" },
  ];
}

function getNavItems() {
  const source = Array.isArray(SIDEBAR_NAV_ITEMS) && SIDEBAR_NAV_ITEMS.length ? SIDEBAR_NAV_ITEMS : defaultNavItems();
  const seen = new Set();

  return source
    .map((item) => {
      const src = safeObject(item);
      const route = canonicalRoute(src.route || src.path || src.href || ROUTES.home);
      const key = normalizeKey(src.key || src.id || route);
      const order = Number.isFinite(Number(src.order)) ? Number(src.order) : 999;

      return { ...src, key, route, order };
    })
    .filter((item) => {
      if (!item.key || !item.route || seen.has(item.route)) return false;
      seen.add(item.route);
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

/* =========================================================
   ICONS
========================================================= */

const ICON_PATHS = Object.freeze({
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z",
  tickets: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  invoices: "M6 2h9l5 5v15H6z M14 2v6h6 M8.5 12h7 M8.5 16h5",
  users: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c0-4 4-7 8-7s8 3 8 7",
  clients: "M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6",
  account: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5.5 21a6.5 6.5 0 0 1 13 0",
  settings: "M4 6h10 M4 12h6 M4 18h12 M16 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M18 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  server: "M4 5h16v5H4z M4 14h16v5H4z M8 7.5h.01 M8 16.5h.01 M11 7.5h5 M11 16.5h5",
  plus: "M12 5v14 M5 12h14",
  upgrade: "M12 4v12 M8 8l4-4 4 4 M5 20h14",
  help: "M12 16v-4 M12 8h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  logout: "M16 17l5-5-5-5 M21 12H9 M4 4h5v16H4z",
  chevron: "M9 6l6 6-6 6",
  toggle: "M3 4h18v16H3z M9 4v16",
});

function iconSvg(name = "home", className = "") {
  const key = safeText(name, "home");
  const path = ICON_PATHS[key] || ICON_PATHS.home;
  const cls = safeText(className, "");

  return `<svg${attr("class", cls)} width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true"><path d="${escapeAttr(path)}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* =========================================================
   LABELS
========================================================= */

function labels(overrides = {}) {
  return {
    sidebarAria: t(i18nKey("ariaMain", "sidebar.aria.main"), "Barra lateral principal"),
    navAria: t(i18nKey("ariaNavigation", "sidebar.aria.navigation"), "Navegación principal"),
    logoLink: t(i18nKey("logoAriaLabel", "sidebar.logo.ariaLabel"), "Ir al inicio"),
    logoAlt: t(i18nKey("logoAlt", "sidebar.logo.alt"), "Onion Support"),
    collapseSidebar: t(i18nKey("toggleCollapse", "sidebar.toggle.collapse"), "Contraer barra lateral"),
    expandSidebar: t(i18nKey("toggleExpand", "sidebar.toggle.expand"), "Expandir barra lateral"),
    recentsAria: t(i18nKey("recentsAriaLabel", "sidebar.recents.ariaLabel"), "Recientes"),
    recentsTitle: t(i18nKey("recentsTitle", "sidebar.recents.title"), "Recientes"),
    userToggle: t(i18nKey("userToggleAriaLabel", "sidebar.user.toggle"), "Abrir menú de usuario"),
    userAvatar: t(i18nKey("userAvatarAriaLabel", "sidebar.user.avatar"), "Avatar usuario"),
    userDefaultName: t(i18nKey("userDefaultName", "sidebar.user.defaultName"), "Usuario"),
    userPlan: t(i18nKey("userPlan", "sidebar.user.plan"), "Go Plan"),
    userMenu: t(i18nKey("userDropdownAriaLabel", "sidebar.user.menu"), "Menú de usuario"),
    addAccount: t(i18nKey("userAddAccount", "sidebar.user.addAccount"), "Añadir cuenta"),
    changePlan: t(i18nKey("userChangePlan", "sidebar.user.changePlan"), "Cambiar plan"),
    profile: t(i18nKey("userProfile", "sidebar.user.profile"), "Perfil"),
    userSettings: t(i18nKey("userSettings", "sidebar.user.settings"), "Configuración"),
    help: t(i18nKey("userHelp", "sidebar.user.help"), "Ayuda"),
    logout: t(i18nKey("userLogout", "sidebar.user.logout"), "Cerrar sesión"),
    ...safeObject(overrides),
  };
}

function menuLabel(item = {}) {
  return t(item.i18nKey || `sidebar.nav.${item.key}`, item.labelFallback || item.label || item.key || "");
}

/* =========================================================
   MENU / DROPDOWN RENDER
========================================================= */

function adminAttrs(item = {}) {
  const adminOnly = item.adminOnly === true || item.admin === true || item.requiresAdmin === true;
  if (!adminOnly) return `data-sidebar-visible="true" data-role-visible="true"`;

  const role = safeText(item.requiredRole || item.role || "admin", "admin");
  const roles = Array.isArray(item.requiredRoles) ? item.requiredRoles.join(",") : role;

  return `data-role="${escapeAttr(role)}" data-roles="${escapeAttr(roles)}" data-required-role="${escapeAttr(role)}" data-required-roles="${escapeAttr(roles)}" data-requires-role="${escapeAttr(role)}" data-requires-roles="${escapeAttr(roles)}" data-admin-only="true" data-sidebar-admin-only="true" data-sidebar-visible="false" data-role-visible="false" data-admin-visible="false" aria-hidden="true" tabindex="-1" hidden`;
}

function renderMenuItem(item = {}, index = 0) {
  const route = canonicalRoute(item.route || ROUTES.home);
  const label = menuLabel(item);
  const key = normalizeKey(item.key || item.route || label || route);
  const i18n = safeText(item.i18nKey || `sidebar.nav.${key}`, "");
  const adminOnly = item.adminOnly === true || item.admin === true || item.requiresAdmin === true;
  const server = route === ROUTES.server || key === "server";

  return `
        <a
          ${server ? `id="${IDS.server}"` : ""}
          href="${escapeAttr(route)}"
          class="menu-item${adminOnly ? " is-role-hidden is-admin-hidden" : ""}"
          data-spa="true"
          data-route="${escapeAttr(route)}"
          data-href="${escapeAttr(route)}"
          data-to="${escapeAttr(route)}"
          data-public-path="${escapeAttr(route)}"
          data-canonical-path="${escapeAttr(route)}"
          data-sidebar-nav="true"
          data-sidebar-item="true"
          data-sidebar-item-key="${escapeAttr(key)}"
          data-nav-key="${escapeAttr(key)}"
          data-route-key="${escapeAttr(key)}"
          data-menu-key="${escapeAttr(key)}"
          data-menu-index="${Number(index) || 0}"
          data-action="${ACTIONS.navigate}"
          data-sidebar-action="${ACTIONS.navigate}"
          data-active="false"
          data-current="false"
          data-selected="false"
          data-tooltip="${escapeAttr(label)}"
          ${i18n ? `data-i18n-data-tooltip="${escapeAttr(i18n)}"` : ""}
          aria-label="${escapeAttr(label)}"
          ${i18n ? `data-i18n-aria-label="${escapeAttr(i18n)}"` : ""}
          ${adminAttrs(item)}
        >
          <span class="menu-item-icon menu-icon" aria-hidden="true">${iconSvg(item.icon || key)}</span>
          <span class="menu-item-label menu-label"${i18n ? attr("data-i18n", i18n) : ""}>${escapeHtml(label)}</span>
        </a>`;
}

function renderDropdownButton({ id = "", label = "", i18nKey = "", action = "", route = "", icon = "", danger = false, disabled = false } = {}) {
  const routePath = route ? canonicalRoute(route) : "";
  const actionName = routePath ? ACTIONS.navigate : safeText(action || "dropdown-action", "dropdown-action");

  return `
          <button
            ${id ? `id="${escapeAttr(id)}"` : ""}
            type="button"
            class="dropdown-item${danger ? " dropdown-item-danger" : ""}"
            role="menuitem"
            data-dropdown-item="true"
            data-dropdown-action="${escapeAttr(action || actionName)}"
            data-sidebar-action="${escapeAttr(actionName)}"
            data-action="${escapeAttr(actionName)}"
            ${routePath ? `data-route="${escapeAttr(routePath)}" data-href="${escapeAttr(routePath)}" data-to="${escapeAttr(routePath)}" data-public-path="${escapeAttr(routePath)}" data-canonical-path="${escapeAttr(routePath)}"` : ""}
            aria-label="${escapeAttr(label)}"
            ${i18nKey ? `data-i18n-aria-label="${escapeAttr(i18nKey)}"` : ""}
            ${disabled ? `aria-disabled="true"` : ""}
            ${boolAttr("disabled", disabled)}
          >
            <span class="dropdown-item-icon" aria-hidden="true">${iconSvg(icon || "help")}</span>
            <span class="dropdown-item-label"${i18nKey ? attr("data-i18n", i18nKey) : ""}>${escapeHtml(label)}</span>
          </button>`;
}

/* =========================================================
   PARTIALS
========================================================= */

function renderLogo(l) {
  return `
        <a
          id="${IDS.logo}"
          href="${ROUTES.home}"
          class="logo"
          data-spa="true"
          data-route="${ROUTES.home}"
          data-href="${ROUTES.home}"
          data-to="${ROUTES.home}"
          data-public-path="${ROUTES.home}"
          data-canonical-path="${ROUTES.home}"
          data-sidebar-logo="true"
          data-sidebar-action="${ACTIONS.navigate}"
          data-action="${ACTIONS.navigate}"
          aria-label="${escapeAttr(l.logoLink)}"
          data-i18n-aria-label="${escapeAttr(i18nKey("logoAriaLabel", "sidebar.logo.ariaLabel"))}"
        >
          <img class="logo-dark" draggable="false" src="/src/media/img/favicon_white.png" alt="${escapeAttr(l.logoAlt)}" data-i18n-alt="${escapeAttr(i18nKey("logoAlt", "sidebar.logo.alt"))}" width="36" height="36" decoding="async" loading="eager">
          <img class="logo-light" draggable="false" src="/src/media/img/favicon_black.png" alt="${escapeAttr(l.logoAlt)}" data-i18n-alt="${escapeAttr(i18nKey("logoAlt", "sidebar.logo.alt"))}" width="36" height="36" decoding="async" loading="eager">
        </a>`;
}

function renderDesktopToggle(l, { collapsed = false } = {}) {
  const open = !collapsed;
  const text = open ? l.collapseSidebar : l.expandSidebar;
  const key = open ? i18nKey("toggleCollapse", "sidebar.toggle.collapse") : i18nKey("toggleExpand", "sidebar.toggle.expand");

  return `
        <button
          id="${IDS.toggle}"
          type="button"
          class="sidebar-toggle"
          data-sidebar-toggle="true"
          data-sidebar-action="${ACTIONS.toggle}"
          data-action="${ACTIONS.toggle}"
          data-tooltip="${escapeAttr(text)}"
          data-i18n-data-tooltip="${escapeAttr(key)}"
          aria-label="${escapeAttr(text)}"
          data-i18n-aria-label="${escapeAttr(key)}"
          aria-controls="${IDS.root} ${IDS.menu}"
          aria-expanded="${String(open)}"
          data-state="${open ? "open" : "collapsed"}"
        >${iconSvg("toggle", "sidebar-toggle-icon")}</button>`;
}

function renderMainMenu(l) {
  return `
      <nav id="${IDS.nav}" class="sidebar-nav" data-sidebar-nav-id="true" data-sidebar-nav-root="true" aria-label="${escapeAttr(l.navAria)}" data-i18n-aria-label="${escapeAttr(i18nKey("ariaNavigation", "sidebar.aria.navigation"))}">
        <div
          id="${IDS.menu}"
          class="sidebar-menu"
          data-sidebar-menu="true"
          data-nav-area="sidebar"
          data-active-route=""
          data-active-key=""
          data-indicator-ready="false"
          data-indicator-route=""
          data-indicator-current=""
          data-indicator-reason="initial"
        >
          <span id="${IDS.indicator}" class="sidebar-active-indicator" aria-hidden="true" data-sidebar-indicator="true" data-sidebar-indicator-target="" data-state="idle"></span>
${getNavItems().map(renderMenuItem).join("\n")}
        </div>
      </nav>`;
}

function renderRecents(l) {
  return `
      <section id="${IDS.recents}" class="sidebar-section" aria-label="${escapeAttr(l.recentsAria)}" data-i18n-aria-label="${escapeAttr(i18nKey("recentsAriaLabel", "sidebar.recents.ariaLabel"))}" data-sidebar-recents="true" data-sidebar-recent="true">
        <span class="section-title" data-i18n="${escapeAttr(i18nKey("recentsTitle", "sidebar.recents.title"))}">${escapeHtml(l.recentsTitle)}</span>
      </section>`;
}

function renderUserToggle(l) {
  return `
        <button
          id="${IDS.userToggle}"
          type="button"
          class="user"
          data-user-toggle="true"
          data-user-menu-toggle="true"
          data-sidebar-user-toggle="true"
          data-dropdown-toggle="user"
          data-dropdown-target="${IDS.userDropdown}"
          data-sidebar-action="${ACTIONS.toggleUser}"
          data-action="${ACTIONS.toggleUser}"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="${IDS.userDropdown}"
          aria-label="${escapeAttr(l.userToggle)}"
          data-i18n-aria-label="${escapeAttr(i18nKey("userToggleAriaLabel", "sidebar.user.toggle"))}"
          data-state="closed"
          data-dropdown-open="false"
          data-authenticated="false"
        >
          <span id="${IDS.avatar}" class="avatar" role="img" aria-label="${escapeAttr(l.userAvatar)}" data-i18n-aria-label="${escapeAttr(i18nKey("userAvatarAriaLabel", "sidebar.user.avatar"))}" data-default-avatar="ON" data-avatar-root="true" data-sidebar-avatar="true" data-user-avatar="true" data-avatar-mode="fallback" data-avatar-state="initial" data-authenticated="false">
            <img id="${IDS.avatarImage}" class="avatar-image" alt="" draggable="false" decoding="async" loading="eager" referrerpolicy="no-referrer" data-avatar-image="true" aria-hidden="true" hidden>
            <span id="${IDS.avatarFallback}" class="avatar-fallback" data-avatar-fallback="true" aria-hidden="true">ON</span>
          </span>

          <span class="user-info">
            <span id="${IDS.name}" class="name" data-sidebar-name="true" data-user-name="true" data-default-i18n="${escapeAttr(i18nKey("userDefaultName", "sidebar.user.defaultName"))}" data-default-name="${escapeAttr(l.userDefaultName)}" data-authenticated="false" aria-live="polite">${escapeHtml(l.userDefaultName)}</span>
            <span id="${IDS.plan}" class="plan" data-sidebar-user-plan="true" data-static="true" data-i18n="${escapeAttr(i18nKey("userPlan", "sidebar.user.plan"))}">${escapeHtml(l.userPlan)}</span>
          </span>

          ${iconSvg("chevron", "user-chevron")}
        </button>`;
}

function renderUserDropdown(l) {
  return `
        <div
          id="${IDS.userDropdown}"
          class="user-dropdown"
          role="menu"
          aria-label="${escapeAttr(l.userMenu)}"
          data-i18n-aria-label="${escapeAttr(i18nKey("userDropdownAriaLabel", "sidebar.user.menu"))}"
          data-user-dropdown="true"
          data-user-menu="true"
          data-sidebar-user-dropdown="true"
          data-sidebar-user-menu="true"
          data-sidebar-dropdown="user"
          data-dropdown="user"
          data-dropdown-menu="user"
          data-dropdown-state="closed"
          data-state="closed"
          data-open="false"
          aria-hidden="true"
          hidden
        >
${renderDropdownButton({ label: l.addAccount, i18nKey: i18nKey("userAddAccount", "sidebar.user.addAccount"), action: ACTIONS.addAccount, icon: "plus" })}
          <div class="dropdown-divider" role="separator" aria-hidden="true"></div>
${renderDropdownButton({ label: l.changePlan, i18nKey: i18nKey("userChangePlan", "sidebar.user.changePlan"), action: ACTIONS.changePlan, icon: "upgrade" })}
${renderDropdownButton({ label: l.profile, i18nKey: i18nKey("userProfile", "sidebar.user.profile"), action: ACTIONS.profile, route: ROUTES.account, icon: "account" })}
${renderDropdownButton({ label: l.userSettings, i18nKey: i18nKey("userSettings", "sidebar.user.settings"), action: ACTIONS.settings, route: ROUTES.settings, icon: "settings" })}
          <div class="dropdown-divider" role="separator" aria-hidden="true"></div>
${renderDropdownButton({ label: l.help, i18nKey: i18nKey("userHelp", "sidebar.user.help"), action: ACTIONS.help, icon: "help" })}
${renderDropdownButton({ id: IDS.logout, label: l.logout, i18nKey: i18nKey("userLogout", "sidebar.user.logout"), action: ACTIONS.logout, icon: "logout", danger: true })}
        </div>`;
}

function renderFooter(l) {
  return `
      <footer id="${IDS.footer}" class="sidebar-footer" data-sidebar-footer="true" data-sidebar-user-section="true" data-state="closed" data-user-dropdown-open="false">
        <div id="${IDS.userSection}" class="sidebar-user" data-sidebar-user-section="true">
${renderUserToggle(l)}
${renderUserDropdown(l)}
        </div>
      </footer>`;
}

function initialUi(options = {}) {
  const collapsed = options?.collapsed === true || options?.desktopCollapsed === true;
  const open = !collapsed;

  return {
    collapsed,
    open,
    state: collapsed ? "collapsed" : "open",
  };
}

/* =========================================================
   PUBLIC TEMPLATE
========================================================= */

export function getSidebarTemplate(options = {}) {
  const opts = safeObject(options);
  const l = labels(opts.labels);
  const ui = initialUi(opts);
  const rootClass = ["sidebar", ui.collapsed ? "collapsed is-collapsed" : ""].filter(Boolean).join(" ");

  return `
    <aside
      id="${IDS.root}"
      class="${rootClass}"
      role="complementary"
      aria-label="${escapeAttr(l.sidebarAria)}"
      data-i18n-aria-label="${escapeAttr(i18nKey("ariaMain", "sidebar.aria.main"))}"
      data-sidebar-root="true"
      data-sidebar="true"
      data-component="${escapeAttr(safeText(SIDEBAR_COMPONENT_NAME, "sidebar"))}"
      data-module="${escapeAttr(safeText(SIDEBAR_MODULE_NAME, "SidebarUI"))}"
      data-template-version="${SIDEBAR_TEMPLATE_VERSION}"
      data-constants-version="${escapeAttr(safeText(SIDEBAR_CONSTANTS_VERSION, ""))}"
      data-mounted="false"
      data-ready="false"
      data-open="${ui.open ? "true" : "false"}"
      data-collapsed="${ui.collapsed ? "true" : "false"}"
      data-state="${ui.state}"
      data-mode="desktop"
      data-viewport="desktop"
      data-user-dropdown-open="false"
      data-dropdown-open="false"
      data-active-route=""
      data-active-key=""
      data-shell-visible="true"
    >
      <div class="sidebar-top" data-sidebar-top="true">
${renderLogo(l)}
${renderDesktopToggle(l, ui)}
      </div>
${renderMainMenu(l)}
${renderRecents(l)}
${renderFooter(l)}
    </aside>`;
}

export function getSidebarTemplateSnapshot() {
  return {
    version: SIDEBAR_TEMPLATE_VERSION,
    component: safeText(SIDEBAR_COMPONENT_NAME, "sidebar"),
    module: safeText(SIDEBAR_MODULE_NAME, "SidebarUI"),
    constantsVersion: safeText(SIDEBAR_CONSTANTS_VERSION, ""),
    routes: { ...ROUTES },
    aliases: { ...ROUTE_ALIASES },
    navItems: getNavItems().map((item) => ({
      key: item.key,
      route: item.route,
      icon: item.icon,
      i18nKey: item.i18nKey || `sidebar.nav.${item.key}`,
      adminOnly: item.adminOnly === true || item.admin === true || item.requiresAdmin === true,
      order: item.order || 0,
    })),
    ids: {
      sidebarRootId: IDS.root,
      sidebarMountId: IDS.mount,
      sidebarNavId: IDS.nav,
      sidebarMenuId: IDS.menu,
      sidebarRecentsId: IDS.recents,
      sidebarFooterId: IDS.footer,
      sidebarIndicatorId: IDS.indicator,
      userToggleId: IDS.userToggle,
      userDropdownId: IDS.userDropdown,
      logoutButtonId: IDS.logout,
      sidebarAvatarId: IDS.avatar,
      sidebarNameId: IDS.name,
      logoId: IDS.logo,
      desktopToggleId: IDS.toggle,
      mobileToggleId: IDS.mobileToggle,
      mobileToggleRenderedInsideSidebar: false,
      avatarImageId: IDS.avatarImage,
      avatarFallbackId: IDS.avatarFallback,
      userPlanId: IDS.plan,
    },
    actions: { ...ACTIONS },
    contract: {
      nativeTitle: false,
      logoTooltip: false,
      dropdownInitialState: "closed",
      adminItemsHiddenButRecoverable: true,
      internalMobileToggleRendered: false,
      avatarImageInitialSrc: false,
      usesConstantsRoutes: true,
      usesConstantsIds: true,
      unsafeExternalRoutes: false,
    },
    dataAttrs: { ...safeObject(SIDEBAR_DATA_ATTRS) },
  };
}

export {
  SIDEBAR_LOGO_ID,
  SIDEBAR_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,
  SIDEBAR_USER_PLAN_ID,
  SIDEBAR_ROUTES,
  SIDEBAR_ROUTE_ALIASES,
};

export default getSidebarTemplate;
