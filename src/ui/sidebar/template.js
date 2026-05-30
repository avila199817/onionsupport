/* =========================================================
   Onion Support - Sidebar Template
   Archivo: /src/ui/sidebar/template.js

   Responsabilidad:
   - Construir TODO el DOM visual del sidebar.
   - Centralizar header, navegación, usuario, avatar y dropdown.
   - Mantener estructura/clases CSS estables.
   - Gestionar sólo comportamiento DOM del dropdown/toggle.
   - Exponer callbacks para que index.js conecte Router/Auth.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store.
   - Sin logout real.
   - Sin navegación real.
   - Sin leer sesión.
   - Sin decidir permisos.
========================================================= */

import {
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute,
  buildUserScopedRoute,
  isBlockedRoutePath,
  normalizeRoutePath,
  normalizeUserSlug,
} from "../../core/config.js";

export const SIDEBAR_TEMPLATE_VERSION = "sidebar.template.unified.v1";

const SIDEBAR_ROOT_ID = "app-sidebar";
const BRAND_LABEL = "Onion Support";

const ROLE_ADMIN = "admin";
const ROLE_USER = "user";

const ROLE_LABEL_ADMIN = "Administrador";
const ROLE_LABEL_STANDARD = "Estándar";

const ACCOUNT_DROPDOWN_KEY = "account";

const BRAND_LOGOS = Object.freeze({
  white: new URL("../../media/img/favicon_white.png", import.meta.url).href,
  black: new URL("../../media/img/favicon_black.png", import.meta.url).href,
});

const CLASSES = Object.freeze({
  root: "sidebar",
  appRoot: "app-sidebar",
  open: "is-open",
  collapsed: "is-collapsed",

  inner: "sidebar-inner",

  header: "sidebar-header",
  brand: "sidebar-brand",
  brandContent: "sidebar-brand-content",
  brandLogo: "sidebar-brand-logo",
  brandLogoImg: "sidebar-brand-logo-img",
  toggle: "sidebar-toggle",

  nav: "sidebar-nav",
  list: "sidebar-menu",
  item: "sidebar-menu-item",
  link: "sidebar-link",
  linkActive: "is-active",
  linkDisabled: "is-disabled",
  linkIcon: "sidebar-link-icon",
  linkLabel: "sidebar-link-label",
  linkContent: "sidebar-link-content",
  linkBadge: "sidebar-link-badge",

  footer: "sidebar-footer",

  user: "sidebar-user",
  userSummary: "sidebar-user-summary",
  userInfo: "sidebar-user-info",
  userName: "sidebar-user-name",
  userRole: "sidebar-user-role",
  userAvatar: "sidebar-user-avatar",
  userAvatarImage: "sidebar-user-avatar-img",
  userAvatarFallback: "sidebar-user-avatar-fallback",

  accountDropdown: "sidebar-account-dropdown",
  accountTrigger: "sidebar-account-trigger",
  accountChevron: "sidebar-account-chevron",
  accountMenu: "sidebar-account-menu",
  accountMenuOpen: "is-open",
  accountMenuHeader: "sidebar-account-menu-header",
  accountMenuAvatar: "sidebar-account-menu-avatar",
  accountMenuUserInfo: "sidebar-account-menu-user-info",
  accountMenuUserName: "sidebar-account-menu-user-name",
  accountMenuUserMeta: "sidebar-account-menu-user-meta",
  accountMenuGroup: "sidebar-account-menu-group",
  accountMenuDangerGroup: "sidebar-account-menu-group--danger",
  accountMenuItem: "sidebar-account-menu-item",
  accountMenuItemDanger: "is-danger",
  accountMenuIcon: "sidebar-account-menu-icon",
  accountMenuLabel: "sidebar-account-menu-label",
});

const ICONS = Object.freeze({
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
  logout: "logout",
});

const ICON_PATHS = Object.freeze({
  menu:
    "M5.75 3.75h12.5A2.75 2.75 0 0 1 21 6.5v11a2.75 2.75 0 0 1-2.75 2.75H5.75A2.75 2.75 0 0 1 3 17.5v-11a2.75 2.75 0 0 1 2.75-2.75Z M9 3.75v16.5 M5.85 8.25h1.35 M5.85 12h1.35 M5.85 15.75h1.35",

  chevron:
    "M9.25 5.75 15.5 12l-6.25 6.25",

  home:
    "M3.75 10.75 12 4l8.25 6.75v8.05a1.7 1.7 0 0 1-1.7 1.7h-4.05v-5.7h-5v5.7H5.45a1.7 1.7 0 0 1-1.7-1.7v-8.05Z",

  incidencias:
    "M5.25 5.25h13.5A2.25 2.25 0 0 1 21 7.5v7.25A2.25 2.25 0 0 1 18.75 17H11l-5.25 3.25V17h-.5A2.25 2.25 0 0 1 3 14.75V7.5a2.25 2.25 0 0 1 2.25-2.25Z M8 9.25h8 M8 12.25h5.5",

  facturas:
    "M6.5 2.75h8.25L20.5 8.5v12.75H6.5A2.5 2.5 0 0 1 4 18.75V5.25a2.5 2.5 0 0 1 2.5-2.5Z M14.5 3v5.75h5.75 M8 12.25h8 M8 15.75h6 M8 19.25h4",

  clientes:
    "M8.25 11.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z M2.75 21c.45-3.35 2.85-5.65 5.5-5.65s5.05 2.3 5.5 5.65 M16.25 10.75a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M14.75 14.9c.55-.22 1.15-.35 1.85-.35 2.3 0 4.15 1.8 4.65 4.45",

  usuarios:
    "M12 11.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z M4.25 21c.6-4.1 3.7-6.75 7.75-6.75S19.15 16.9 19.75 21",

  cuenta:
    "M12 11.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4.75 20.75a7.25 7.25 0 0 1 14.5 0",

  ajustes:
    "M4 7h9.5 M17.5 7H20 M15.5 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M4 12h2.5 M10.5 12H20 M8.5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M4 17h9.5 M17.5 17H20 M15.5 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",

  servidor:
    "M5.5 4.25h13A2.5 2.5 0 0 1 21 6.75v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 9.25v-2.5a2.25 2.25 0 0 1 2.5-2.5Z M5.5 12.25h13A2.5 2.5 0 0 1 21 14.75v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.25v-2.5a2.5 2.5 0 0 1 2.5-2.5Z M7 8h.01 M7 16h.01 M10 8h7 M10 16h7",

  logout:
    "M15.75 17.25 21 12l-5.25-5.25 M20.25 12H9.75 M11.75 20.25H5.5A2.5 2.5 0 0 1 3 17.75V6.25a2.5 2.5 0 0 1 2.5-2.5h6.25",
});

const ROOT_SELECTOR = "[data-sidebar-root='true'], #app-sidebar";
const DROPDOWN_TRIGGER_SELECTOR = `[data-sidebar-dropdown-trigger="${ACCOUNT_DROPDOWN_KEY}"]`;
const DROPDOWN_MENU_SELECTOR = `[data-sidebar-dropdown-menu="${ACCOUNT_DROPDOWN_KEY}"]`;
const DROPDOWN_ITEM_SELECTOR = "[data-sidebar-dropdown-item='true']";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let activeDropdownRoot = null;
let documentPointerHandler = null;
let documentKeyHandler = null;

const boundRoots = new WeakMap();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isElement(value = null) {
  return Boolean(
    isBrowser() &&
      value &&
      value.nodeType === 1
  );
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function classNames(...values) {
  return values
    .flat()
    .map((value) => text(value, ""))
    .filter(Boolean)
    .join(" ");
}

function cleanAttrs(attrs = {}) {
  const output = {};

  for (const [key, value] of Object.entries(attrs || {})) {
    if (!key) continue;
    if (value === null || value === undefined || value === false) continue;

    output[key] = value === true ? "true" : value;
  }

  return output;
}

function appendChildren(parent = null, children = []) {
  if (!parent) return parent;

  const list = Array.isArray(children) ? children : [children];

  for (const child of list) {
    if (!child) continue;

    try {
      parent.appendChild(child);
    } catch {
      // noop
    }
  }

  return parent;
}

function createElement(tag = "div", options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  if (options.textContent !== undefined && options.textContent !== null) {
    node.textContent = String(options.textContent);
  }

  for (const [key, value] of Object.entries(cleanAttrs(options.attrs || {}))) {
    node.setAttribute(key, String(value));
  }

  for (const [key, value] of Object.entries(cleanAttrs(options.dataset || {}))) {
    node.dataset[key] = String(value);
  }

  return node;
}

function createSpan(className = "", textContent = "", attrs = {}) {
  return createElement("span", {
    className,
    textContent,
    attrs,
  });
}

function contains(parent = null, child = null) {
  try {
    return Boolean(parent && child && (parent === child || parent.contains(child)));
  } catch {
    return false;
  }
}

function eventElement(target = null) {
  if (!target) return null;
  return target.nodeType === 3 ? target.parentElement : target;
}

/* =========================================================
   SECURITY / PATHS
========================================================= */

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function normalizeInternalPath(value = "") {
  const raw = text(value, "");

  if (!raw) return "";
  if (!raw.startsWith("/")) return "";
  if (raw.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";

  let href = "";

  try {
    href = normalizeRoutePath(raw) || "";
  } catch {
    href = "";
  }

  if (!href) return "";
  if (!href.startsWith("/")) return "";
  if (href.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return "";
  if (/[\r\n\t\\]/.test(href)) return "";
  if (hasSensitiveQuery(href)) return "";

  try {
    if (isBlockedRoutePath(href)) return "";
  } catch {
    return "";
  }

  return href;
}

function safeInternalHref(value = "", fallback = "/") {
  const normalized = normalizeInternalPath(value);

  if (normalized) return normalized;

  if (fallback === "") return "";

  return normalizeInternalPath(fallback) || "/";
}

function safeAssetSrc(value = "", fallback = "") {
  const src = text(value, fallback);

  if (!src) return fallback;

  if (src.startsWith("/")) {
    if (src.startsWith("//")) return fallback;
    if (/[\r\n\t\\]/.test(src)) return fallback;
    if (hasSensitiveQuery(src)) return fallback;

    return src.replace(/\/{2,}/g, "/") || fallback;
  }

  if (/^https:\/\/.+/i.test(src) && !hasSensitiveQuery(src)) {
    try {
      return new URL(src).href;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function safeAvatarSrc(value = "") {
  const src = text(value, "");

  if (!src) return "";
  if (src.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(src)) return "";
  if (hasSensitiveQuery(src)) return "";

  if (src.startsWith("/")) {
    return src.replace(/\/{2,}/g, "/") || "";
  }

  if (/^https:\/\/.+/i.test(src)) {
    try {
      return new URL(src).href;
    } catch {
      return "";
    }
  }

  return "";
}

/* =========================================================
   USER / ROUTE NORMALIZATION
========================================================= */

function normalizeRole(value = "") {
  const role = text(value, "").toLowerCase();

  if (role === ROLE_ADMIN) return ROLE_ADMIN;
  if (role === ROLE_USER) return ROLE_USER;

  return "";
}

function normalizeRoleList(value = []) {
  const raw = Array.isArray(value)
    ? value.flat(Infinity)
    : text(value, "").split(/[,\s|;]+/);

  return [
    ...new Set(
      raw
        .map(normalizeRole)
        .filter(Boolean)
    ),
  ];
}

function isAdminUser(user = {}) {
  const roles = normalizeRoleList([
    user.role,
    user.rol,
    user.roles,
  ]);

  return Boolean(
    user.isAdmin === true ||
      roles.includes(ROLE_ADMIN)
  );
}

function defaultRoleLabel(user = {}) {
  return isAdminUser(user) ? ROLE_LABEL_ADMIN : ROLE_LABEL_STANDARD;
}

function initialsFromName(value = "") {
  const parts = text(value, "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return "ON";

  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";

  return `${first}${second}`.toUpperCase().slice(0, 2) || "ON";
}

function normalizeUser(user = {}) {
  const name = text(
    user.displayName ||
      user.name ||
      user.fullName ||
      user.username,
    "Usuario"
  );

  const initials = text(
    user.initials,
    initialsFromName(name)
  )
    .slice(0, 2)
    .toUpperCase();

  const slug = normalizeUserSlug(
    user.slug ||
      user.publicSlug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      user.username ||
      user.userId ||
      user.id ||
      ""
  );

  const avatarUrl = safeAvatarSrc(
    user.avatarUrl ||
      user.avatar ||
      user.photoUrl ||
      user.photoURL ||
      user.picture ||
      user.image ||
      user.profile?.avatarUrl ||
      user.profile?.avatar ||
      user.profile?.photoUrl ||
      user.profile?.photoURL ||
      user.profile?.picture ||
      ""
  );

  return {
    ...user,
    name,
    displayName: name,
    initials,
    slug,
    avatarUrl,
    hasAvatar: Boolean(avatarUrl),
    roleLabel: text(user.roleLabel, defaultRoleLabel(user)),
    isAdmin: isAdminUser(user),
  };
}

function itemRoles(item = {}) {
  return [
    ...normalizeRoleList(item.role),
    ...normalizeRoleList(item.roles),
    ...normalizeRoleList(item.requiredRole),
    ...normalizeRoleList(item.requiredRoles),
  ];
}

function normalizeIconName(value = "") {
  const icon = text(value, ICONS.home).toLowerCase();

  return ICON_PATHS[icon] ? icon : ICONS.home;
}

function userScopedPrivateHref(path = "", user = {}) {
  const canonical = safeInternalHref(path, "");

  if (!canonical) return "";

  const slug = normalizeUserSlug(user.slug || "");

  if (!slug) return canonical;

  try {
    if (canonical === "/") {
      return buildUserHomeRoute(slug) || `${USER_HOME_PREFIX}${slug}`;
    }

    return buildUserScopedRoute(slug, canonical);
  } catch {
    return canonical === "/"
      ? `${USER_HOME_PREFIX}${slug}`
      : `${USER_HOME_PREFIX}${slug}${canonical}`;
  }
}

function normalizeItem(item = {}) {
  const rawHref = item.href || item.path || "";
  const href = safeInternalHref(rawHref, "");
  const label = text(item.label || item.title || item.name, href);
  const icon = normalizeIconName(item.icon || item.viewKey || item.name || ICONS.home);
  const roles = itemRoles(item);
  const adminOnly = Boolean(
    item.adminOnly === true ||
      item.requiresAdmin === true ||
      item.admin === true ||
      (
        roles.includes(ROLE_ADMIN) &&
        !roles.includes(ROLE_USER)
      )
  );

  return {
    href,
    label,
    icon,

    active: item.active === true,
    disabled: item.disabled === true,
    hidden: item.hidden === true || !href,
    adminOnly,

    key: text(item.key || item.sidebarKey || item.viewKey || item.name || href, href),
    badge: text(item.badge, ""),
    requiredRole: text(item.requiredRole || item.role, ""),
    requiredRoles: roles.join(" "),
  };
}

/* =========================================================
   ICONS
========================================================= */

export function createSidebarIcon(name = ICONS.home, className = "sidebar-icon") {
  if (!isBrowser()) return null;

  const iconName = normalizeIconName(name);
  const pathData = ICON_PATHS[iconName] || ICON_PATHS.home;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  svg.setAttribute("class", className);
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  path.setAttribute("d", pathData);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.9");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("vector-effect", "non-scaling-stroke");

  svg.appendChild(path);

  return svg;
}

function createIconSlot(className = "", iconName = ICONS.home, svgClass = "") {
  const slot = createElement("span", {
    className,
    attrs: {
      "aria-hidden": "true",
    },
  });

  appendChildren(slot, createSidebarIcon(iconName, svgClass));

  return slot;
}

/* =========================================================
   BRAND
========================================================= */

function getPreferredBrandLogoSrc() {
  const white = safeAssetSrc(BRAND_LOGOS.white);
  const black = safeAssetSrc(BRAND_LOGOS.black);

  if (!isBrowser()) return white || black || "";

  try {
    const root = document.documentElement;

    const theme = text(
      root?.dataset?.theme ||
        root?.getAttribute?.("data-theme") ||
        root?.dataset?.appearance ||
        root?.getAttribute?.("data-appearance") ||
        "",
      ""
    ).toLowerCase();

    if (theme === "light") return black || white || "";
    if (theme === "dark") return white || black || "";

    return white || black || "";
  } catch {
    return white || black || "";
  }
}

export function createSidebarBrandLogo() {
  const whiteLogo = safeAssetSrc(BRAND_LOGOS.white);
  const blackLogo = safeAssetSrc(BRAND_LOGOS.black);
  const preferredLogo = getPreferredBrandLogoSrc();

  const logo = createElement("span", {
    className: `${CLASSES.brandLogo} sidebar-brand-logo--image`,
    attrs: {
      "aria-hidden": "true",
      "data-sidebar-brand-logo": "true",
      "data-sidebar-brand-logo-mode": "image",
      "data-sidebar-brand-logo-white": whiteLogo,
      "data-sidebar-brand-logo-black": blackLogo,
    },
  });

  if (preferredLogo) {
    appendChildren(
      logo,
      createElement("img", {
        className: CLASSES.brandLogoImg,
        attrs: {
          src: preferredLogo,
          alt: "",
          loading: "eager",
          decoding: "async",
          draggable: "false",
          "data-sidebar-brand-logo-img": "true",
          "data-logo-white-src": whiteLogo,
          "data-logo-black-src": blackLogo,
        },
      })
    );
  } else {
    logo.textContent = "ON";
  }

  return logo;
}

/* =========================================================
   AVATAR
========================================================= */

function markAvatarFallback(avatar = null, img = null) {
  if (!avatar) return false;

  try {
    avatar.classList.remove("has-image");
    avatar.classList.add("is-fallback");
    avatar.dataset.fallback = "true";
    avatar.dataset.avatarState = "fallback";

    if (img) {
      img.hidden = true;
      img.removeAttribute("src");
    }

    return true;
  } catch {
    return false;
  }
}

function createUserAvatar(user = {}, className = CLASSES.userAvatar) {
  const normalizedUser = normalizeUser(user);
  const hasImage = Boolean(normalizedUser.avatarUrl);

  const avatar = createElement("span", {
    className: classNames(
      className,
      hasImage ? "has-image" : "is-fallback"
    ),
    attrs: {
      "aria-hidden": "true",
      "data-sidebar-user-avatar": "true",
      "data-fallback": hasImage ? "false" : "true",
      "data-avatar-state": hasImage ? "image" : "fallback",
    },
  });

  if (hasImage) {
    const img = createElement("img", {
      className: CLASSES.userAvatarImage,
      attrs: {
        src: normalizedUser.avatarUrl,
        alt: "",
        loading: "lazy",
        decoding: "async",
        referrerpolicy: "no-referrer",
        draggable: "false",
        "data-sidebar-avatar-img": "true",
      },
    });

    try {
      img.addEventListener(
        "error",
        () => {
          markAvatarFallback(avatar, img);
        },
        { once: true }
      );
    } catch {
      // noop
    }

    appendChildren(avatar, img);
  }

  appendChildren(
    avatar,
    createSpan(
      CLASSES.userAvatarFallback,
      normalizedUser.initials,
      {
        "data-sidebar-avatar-fallback": "true",
      }
    )
  );

  return avatar;
}

/* =========================================================
   HEADER / NAV
========================================================= */

export function createSidebarHeader(options = {}) {
  const open = options.open !== false;
  const brandHref = safeInternalHref(options.brandHref, "/");
  const brandLabel = text(options.brandLabel, BRAND_LABEL);

  const header = createElement("header", {
    className: classNames(
      CLASSES.header,
      "sidebar-header-chatgpt",
      "sidebar-header--chatgpt"
    ),
    attrs: {
      "data-sidebar-header": "true",
      "data-sidebar-section": "header",
      "data-sidebar-header-layout": "logo-only",
    },
  });

  const brand = createElement("a", {
    className: classNames(
      CLASSES.brand,
      "sidebar-brand-chatgpt",
      "sidebar-brand-logo-only",
      "sidebar-brand--chatgpt",
      "sidebar-brand--logo-only"
    ),
    attrs: {
      href: brandHref,
      "data-spa": "true",
      "data-sidebar-brand": "true",
      "data-sidebar-link": "true",
      "data-route": brandHref,
      "aria-label": brandLabel,
      "data-sidebar-brand-logo-only": "true",
    },
  });

  const brandContent = createElement("span", {
    className: classNames(
      CLASSES.brandContent,
      "sidebar-brand-content-logo",
      "sidebar-brand-content--logo"
    ),
    attrs: {
      "data-sidebar-brand-content": "true",
    },
  });

  appendChildren(brandContent, createSidebarBrandLogo());
  appendChildren(brand, brandContent);

  const toggle = createElement("button", {
    className: classNames(
      CLASSES.toggle,
      "sidebar-toggle-chatgpt",
      "sidebar-toggle-panel",
      "sidebar-toggle--chatgpt",
      "sidebar-toggle--panel"
    ),
    attrs: {
      type: "button",
      "data-sidebar-toggle": "true",
      "data-sidebar-action": "toggle",
      "aria-label": open ? "Cerrar barra lateral" : "Abrir barra lateral",
      "aria-expanded": open ? "true" : "false",
      "data-state": open ? "open" : "collapsed",
    },
  });

  appendChildren(toggle, [
    createSidebarIcon(ICONS.menu, "sidebar-toggle-svg"),
    createSpan(
      "sidebar-toggle-label",
      open ? "Cerrar barra lateral" : "Abrir barra lateral"
    ),
  ]);

  appendChildren(header, [brand, toggle]);

  return header;
}

export function createSidebarNav(items = []) {
  const nav = createElement("nav", {
    className: classNames(CLASSES.nav, "sidebar-nav--chatgpt"),
    attrs: {
      "data-sidebar-nav": "true",
      "aria-label": "Navegación principal",
      "data-sidebar-section": "navigation",
    },
  });

  const list = createElement("ul", {
    className: CLASSES.list,
    attrs: {
      "data-sidebar-list": "true",
    },
  });

  for (const rawItem of Array.isArray(items) ? items : []) {
    const item = normalizeItem(rawItem);

    if (item.hidden) continue;

    appendChildren(list, createSidebarNavItem(item));
  }

  appendChildren(nav, list);

  return nav;
}

export function createSidebarNavItem(rawItem = {}) {
  const item = normalizeItem(rawItem);

  const li = createElement("li", {
    className: CLASSES.item,
    attrs: cleanAttrs({
      "data-sidebar-item": "true",
      "data-route": item.href,
      "data-active": item.active ? "true" : "false",
      "data-disabled": item.disabled ? "true" : "false",
      "data-admin-only": item.adminOnly ? "true" : null,
      "data-sidebar-admin-only": item.adminOnly ? "true" : null,
      "data-required-role": item.requiredRole || null,
      "data-required-roles": item.requiredRoles || null,
    }),
  });

  const link = createElement("a", {
    className: classNames(
      CLASSES.link,
      "sidebar-link--chatgpt",
      item.active ? CLASSES.linkActive : "",
      item.disabled ? CLASSES.linkDisabled : ""
    ),
    attrs: cleanAttrs({
      href: item.href,

      "data-spa": "true",
      "data-sidebar-link": "true",
      "data-sidebar-nav-link": "true",
      "data-route": item.href,
      "data-sidebar-key": item.key,
      "data-sidebar-active": item.active ? "true" : "false",
      "data-sidebar-disabled": item.disabled ? "true" : "false",

      "aria-current": item.active ? "page" : null,
      "aria-disabled": item.disabled ? "true" : null,

      "data-sidebar-label": item.label,
      "data-sidebar-icon": item.icon,
      "data-admin-only": item.adminOnly ? "true" : null,
      "data-sidebar-admin-only": item.adminOnly ? "true" : null,
      "data-required-role": item.requiredRole || null,
      "data-required-roles": item.requiredRoles || null,

      tabindex: item.disabled ? "-1" : null,
    }),
  });

  const content = createElement("span", {
    className: CLASSES.linkContent,
  });

  appendChildren(content, [
    createSpan(CLASSES.linkLabel, item.label),
  ]);

  if (item.badge) {
    appendChildren(
      content,
      createElement("span", {
        className: CLASSES.linkBadge,
        textContent: item.badge,
      })
    );
  }

  appendChildren(link, [
    createIconSlot(
      CLASSES.linkIcon,
      item.icon,
      "sidebar-link-svg"
    ),
    content,
  ]);

  appendChildren(li, link);

  return li;
}

/* =========================================================
   ACCOUNT DROPDOWN
========================================================= */

function createAccountMenuItem({
  label = "",
  iconName = ICONS.cuenta,
  action = "",
  href = "",
  danger = false,
  logout = false,
} = {}) {
  const finalLabel = text(label, "");
  const finalAction = text(action, "");
  const finalHref = href ? safeInternalHref(href, "") : "";

  const element = createElement(finalHref ? "a" : "button", {
    className: classNames(
      CLASSES.accountMenuItem,
      danger ? CLASSES.accountMenuItemDanger : ""
    ),
    attrs: cleanAttrs({
      type: finalHref ? null : "button",
      href: finalHref || null,

      "data-spa": finalHref ? "true" : null,
      "data-sidebar-link": finalHref ? "true" : null,
      "data-route": finalHref || null,
      "data-sidebar-logout": logout ? "true" : null,

      "data-sidebar-dropdown-item": "true",
      "data-sidebar-action": finalAction || null,
      "data-sidebar-menu-action": finalAction || null,
      "data-danger": danger ? "true" : null,
      "aria-label": finalLabel,
      role: "menuitem",
    }),
  });

  appendChildren(element, [
    createIconSlot(
      CLASSES.accountMenuIcon,
      iconName,
      "sidebar-account-menu-svg"
    ),
    createSpan(CLASSES.accountMenuLabel, finalLabel),
  ]);

  return element;
}

function createAccountDropdown(user = {}, options = {}) {
  const normalizedUser = normalizeUser(user);
  const menuId = `${SIDEBAR_ROOT_ID}-account-menu`;

  const cuentaHref =
    safeInternalHref(options.cuentaHref || options.accountHref || "", "") ||
    userScopedPrivateHref(ROUTES.cuenta || "/cuenta", normalizedUser);

  const ajustesHref =
    safeInternalHref(options.ajustesHref || options.settingsHref || "", "") ||
    userScopedPrivateHref(ROUTES.ajustes || "/ajustes", normalizedUser);

  const dropdown = createElement("div", {
    className: CLASSES.accountDropdown,
    attrs: {
      "data-sidebar-account-dropdown": "true",
      "data-sidebar-dropdown": ACCOUNT_DROPDOWN_KEY,
    },
  });

  const trigger = createElement("button", {
    className: classNames(CLASSES.user, CLASSES.accountTrigger),
    attrs: {
      type: "button",
      "data-sidebar-user": "true",
      "data-sidebar-user-card": "true",
      "data-sidebar-dropdown-trigger": ACCOUNT_DROPDOWN_KEY,
      "data-sidebar-action": "account-menu",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-controls": menuId,
      "aria-label": `Cuenta de ${normalizedUser.name}`,
    },
  });

  const info = createElement("span", {
    className: CLASSES.userInfo,
  });

  appendChildren(info, [
    createElement("span", {
      className: CLASSES.userName,
      textContent: normalizedUser.name,
      attrs: {
        "data-sidebar-user-name": "true",
      },
    }),
    createElement("span", {
      className: CLASSES.userRole,
      textContent: normalizedUser.roleLabel,
      attrs: {
        "data-sidebar-user-role": "true",
      },
    }),
  ]);

  appendChildren(trigger, [
    createUserAvatar(normalizedUser),
    info,
    createIconSlot(
      CLASSES.accountChevron,
      ICONS.chevron,
      "sidebar-account-chevron-svg"
    ),
  ]);

  const menu = createElement("div", {
    className: CLASSES.accountMenu,
    attrs: {
      id: menuId,
      role: "menu",
      hidden: true,
      "aria-hidden": "true",
      "data-sidebar-dropdown-menu": ACCOUNT_DROPDOWN_KEY,
      "data-sidebar-account-menu": "true",
      "data-sidebar-dropdown-state": "closed",
    },
  });

  const menuHeader = createElement("div", {
    className: CLASSES.accountMenuHeader,
    attrs: {
      "data-sidebar-account-menu-header": "true",
    },
  });

  const menuHeaderInfo = createElement("span", {
    className: CLASSES.accountMenuUserInfo,
  });

  appendChildren(menuHeaderInfo, [
    createSpan(CLASSES.accountMenuUserName, normalizedUser.name, {
      "data-sidebar-user-name": "true",
    }),
    createSpan(CLASSES.accountMenuUserMeta, normalizedUser.roleLabel, {
      "data-sidebar-user-role": "true",
    }),
  ]);

  appendChildren(menuHeader, [
    createUserAvatar(normalizedUser, CLASSES.accountMenuAvatar),
    menuHeaderInfo,
  ]);

  const menuGroup = createElement("div", {
    className: CLASSES.accountMenuGroup,
    attrs: {
      "data-sidebar-account-menu-group": "primary",
    },
  });

  appendChildren(menuGroup, [
    createAccountMenuItem({
      label: "Cuenta",
      iconName: ICONS.cuenta,
      action: "navigate",
      href: cuentaHref,
    }),
    createAccountMenuItem({
      label: "Ajustes",
      iconName: ICONS.ajustes,
      action: "navigate",
      href: ajustesHref,
    }),
  ]);

  const menuDangerGroup = createElement("div", {
    className: classNames(CLASSES.accountMenuGroup, CLASSES.accountMenuDangerGroup),
    attrs: {
      "data-sidebar-account-menu-group": "session",
    },
  });

  appendChildren(menuDangerGroup, [
    createAccountMenuItem({
      label: "Salir",
      iconName: ICONS.logout,
      action: "logout",
      danger: true,
      logout: true,
    }),
  ]);

  appendChildren(menu, [
    menuHeader,
    menuGroup,
    menuDangerGroup,
  ]);

  appendChildren(dropdown, [
    trigger,
    menu,
  ]);

  return dropdown;
}

export function createSidebarFooter(user = {}, options = {}) {
  const footer = createElement("footer", {
    className: classNames(CLASSES.footer, "sidebar-footer--chatgpt"),
    attrs: {
      "data-sidebar-footer": "true",
      "data-sidebar-section": "footer",
    },
  });

  appendChildren(footer, [
    createAccountDropdown(user, options.accountLinks || options),
  ]);

  return footer;
}

/* =========================================================
   ROOT
========================================================= */

export function createSidebarTemplate(options = {}) {
  if (!isBrowser()) return null;

  const user = normalizeUser(options.user || {});
  const open = options.open !== false;
  const state = open ? "open" : "collapsed";
  const brandHref = safeInternalHref(
    options.brandHref || userScopedPrivateHref("/", user),
    "/"
  );

  const sidebar = createElement("aside", {
    className: classNames(
      CLASSES.root,
      CLASSES.appRoot,
      "sidebar-root--chatgpt",
      open ? CLASSES.open : CLASSES.collapsed
    ),
    attrs: {
      id: text(options.id, SIDEBAR_ROOT_ID),
      "data-sidebar-root": "true",
      "aria-label": text(options.ariaLabel, "Panel lateral"),
      "aria-hidden": "false",
      "data-sidebar-state": state,
      "data-open": open ? "true" : "false",
    },
    dataset: {
      open: open ? "true" : "false",
      version: SIDEBAR_TEMPLATE_VERSION,
    },
  });

  const inner = createElement("div", {
    className: CLASSES.inner,
    attrs: {
      "data-sidebar-inner": "true",
    },
  });

  appendChildren(inner, [
    createSidebarHeader({
      brandLabel: options.brandLabel || BRAND_LABEL,
      brandHref,
      open,
    }),
    createSidebarNav(options.items),
    createSidebarFooter(user, {
      accountLinks: options.accountLinks,
    }),
  ]);

  appendChildren(sidebar, inner);

  return sidebar;
}

/* =========================================================
   DROPDOWN / TOGGLE BEHAVIOR
========================================================= */

function getDropdownTrigger(root = null) {
  try {
    return root?.querySelector?.(DROPDOWN_TRIGGER_SELECTOR) || null;
  } catch {
    return null;
  }
}

function getDropdownMenu(root = null) {
  try {
    return root?.querySelector?.(DROPDOWN_MENU_SELECTOR) || null;
  } catch {
    return null;
  }
}

function isDisabledElement(node = null) {
  if (!isElement(node)) return true;

  return Boolean(
    node.hidden === true ||
      node.disabled === true ||
      node.getAttribute("aria-disabled") === "true" ||
      node.getAttribute("aria-hidden") === "true" ||
      node.closest?.("[hidden], [aria-hidden='true'], [aria-disabled='true'], [data-disabled='true']")
  );
}

function getFocusableItems(menu = null) {
  try {
    return Array.from(menu?.querySelectorAll?.(FOCUSABLE_SELECTOR) || [])
      .filter((node) => !isDisabledElement(node));
  } catch {
    return [];
  }
}

function focusNode(node = null) {
  if (isDisabledElement(node)) return false;

  try {
    node.focus({ preventScroll: true });
    return true;
  } catch {
    try {
      node.focus();
      return true;
    } catch {
      return false;
    }
  }
}

function isSidebarOpen(root = null) {
  if (!isElement(root)) return false;

  return !(
    root.classList.contains(CLASSES.collapsed) ||
      root.dataset.open === "false" ||
      root.dataset.sidebarState === "collapsed"
  );
}

export function setSidebarTemplateOpen(root = null, open = true, options = {}) {
  if (!isElement(root)) return false;

  const value = Boolean(open);

  try {
    root.classList.toggle(CLASSES.open, value);
    root.classList.toggle(CLASSES.collapsed, !value);

    root.dataset.open = value ? "true" : "false";
    root.dataset.sidebarState = value ? "open" : "collapsed";

    const toggle = root.querySelector("[data-sidebar-toggle='true']");

    if (toggle) {
      toggle.setAttribute("aria-expanded", value ? "true" : "false");
      toggle.setAttribute("aria-label", value ? "Cerrar barra lateral" : "Abrir barra lateral");
      toggle.dataset.state = value ? "open" : "collapsed";
    }

    if (isFunction(options.onOpenChange)) {
      options.onOpenChange(value, {
        root,
        source: "sidebar.template",
      });
    }

    return true;
  } catch {
    return false;
  }
}

function isDropdownOpen(root = null) {
  const trigger = getDropdownTrigger(root);
  const menu = getDropdownMenu(root);

  return Boolean(
    root &&
      trigger &&
      menu &&
      trigger.getAttribute("aria-expanded") === "true" &&
      menu.hidden !== true
  );
}

function setDropdownDomState(root = null, open = false) {
  const trigger = getDropdownTrigger(root);
  const menu = getDropdownMenu(root);

  if (!isElement(root) || !isElement(trigger) || !isElement(menu)) {
    return false;
  }

  const nextOpen = Boolean(open);

  try {
    root.classList.toggle("is-account-menu-open", nextOpen);
    root.dataset.sidebarDropdownOpen = nextOpen ? ACCOUNT_DROPDOWN_KEY : "";
    root.dataset.sidebarAccountDropdown = nextOpen ? "open" : "closed";

    trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    trigger.dataset.sidebarDropdownState = nextOpen ? "open" : "closed";

    menu.hidden = !nextOpen;
    menu.setAttribute("aria-hidden", nextOpen ? "false" : "true");
    menu.dataset.sidebarDropdownState = nextOpen ? "open" : "closed";
    menu.classList.toggle(CLASSES.accountMenuOpen, nextOpen);

    return true;
  } catch {
    return false;
  }
}

function detachDocumentDropdownHandlers() {
  if (!isBrowser()) {
    activeDropdownRoot = null;
    documentPointerHandler = null;
    documentKeyHandler = null;
    return true;
  }

  try {
    if (documentPointerHandler) {
      document.removeEventListener("pointerdown", documentPointerHandler, true);
    }
  } catch {
    // noop
  }

  try {
    if (documentKeyHandler) {
      document.removeEventListener("keydown", documentKeyHandler);
    }
  } catch {
    // noop
  }

  activeDropdownRoot = null;
  documentPointerHandler = null;
  documentKeyHandler = null;

  return true;
}

function attachDocumentDropdownHandlers(root = null) {
  if (!isBrowser() || !isElement(root)) return false;

  if (activeDropdownRoot && activeDropdownRoot !== root) {
    closeSidebarDropdown(activeDropdownRoot, { focus: false });
  }

  if (activeDropdownRoot === root && documentPointerHandler && documentKeyHandler) {
    return true;
  }

  detachDocumentDropdownHandlers();

  documentPointerHandler = (event) => {
    const target = eventElement(event.target);

    if (contains(root, target)) return;

    closeSidebarDropdown(root, { focus: false });
  };

  documentKeyHandler = (event) => {
    if (event.key !== "Escape") return;

    event.preventDefault();

    closeSidebarDropdown(root, { focus: true });
  };

  try {
    document.addEventListener("pointerdown", documentPointerHandler, true);
    document.addEventListener("keydown", documentKeyHandler);
  } catch {
    detachDocumentDropdownHandlers();
    return false;
  }

  activeDropdownRoot = root;

  return true;
}

export function setSidebarDropdownOpen(root = null, open = false, options = {}) {
  if (!isElement(root)) return false;

  const nextOpen = Boolean(open);

  if (nextOpen && !isSidebarOpen(root)) {
    setSidebarTemplateOpen(root, true, options);
  }

  if (!setDropdownDomState(root, nextOpen)) return false;

  if (nextOpen) {
    attachDocumentDropdownHandlers(root);

    if (options.focus === true) {
      focusNode(getFocusableItems(getDropdownMenu(root))[0] || null);
    }
  } else {
    if (activeDropdownRoot === root) {
      detachDocumentDropdownHandlers();
    }

    if (options.focus === true) {
      focusNode(getDropdownTrigger(root));
    }
  }

  return true;
}

export function openSidebarDropdown(root = null, options = {}) {
  return setSidebarDropdownOpen(root, true, options);
}

export function closeSidebarDropdown(root = null, options = {}) {
  const target = isElement(root) ? root : activeDropdownRoot;

  if (!isElement(target)) {
    detachDocumentDropdownHandlers();
    return true;
  }

  return setSidebarDropdownOpen(target, false, options);
}

export function toggleSidebarDropdown(root = null, options = {}) {
  if (!isElement(root)) return false;

  return setSidebarDropdownOpen(root, !isDropdownOpen(root), options);
}

/* =========================================================
   BINDING
========================================================= */

export function bindSidebarTemplate(root = null, options = {}) {
  if (!isElement(root)) return () => false;

  if (boundRoots.has(root)) {
    return boundRoots.get(root);
  }

  const onClick = (event) => {
    const target = eventElement(event.target);

    if (!target) return;

    const dropdownTrigger = target.closest?.(DROPDOWN_TRIGGER_SELECTOR);

    if (dropdownTrigger && contains(root, dropdownTrigger) && !isDisabledElement(dropdownTrigger)) {
      event.preventDefault();
      event.stopPropagation();

      toggleSidebarDropdown(root, {
        ...options,
        focus: true,
      });

      return;
    }

    const action = target.closest?.("[data-sidebar-action]");
    const actionType = text(action?.dataset?.sidebarAction, "");

    if (actionType === "toggle") {
      event.preventDefault();

      setSidebarTemplateOpen(root, !isSidebarOpen(root), options);
      return;
    }

    if (actionType === "logout") {
      event.preventDefault();

      closeSidebarDropdown(root, {
        focus: false,
      });

      if (isFunction(options.onLogout)) {
        options.onLogout({
          event,
          root,
          source: "sidebar.template",
        });
      }

      if (isFunction(options.onAction)) {
        options.onAction("logout", {
          event,
          root,
          source: "sidebar.template",
        });
      }

      return;
    }

    const dropdownItem = target.closest?.(DROPDOWN_ITEM_SELECTOR);

    if (dropdownItem && contains(root, dropdownItem)) {
      closeSidebarDropdown(root, {
        focus: false,
      });
    }
  };

  try {
    root.addEventListener("click", onClick);
  } catch {
    return () => false;
  }

  setDropdownDomState(root, false);

  const cleanup = () => {
    try {
      root.removeEventListener("click", onClick);
    } catch {
      // noop
    }

    try {
      setDropdownDomState(root, false);
    } catch {
      // noop
    }

    if (activeDropdownRoot === root) {
      detachDocumentDropdownHandlers();
    }

    boundRoots.delete(root);
    return true;
  };

  boundRoots.set(root, cleanup);

  return cleanup;
}

export function unbindSidebarTemplate(root = null) {
  if (!isElement(root)) {
    if (activeDropdownRoot) {
      closeSidebarDropdown(activeDropdownRoot, {
        focus: false,
      });
    }

    return false;
  }

  const cleanup = boundRoots.get(root);

  if (!cleanup) return false;

  return cleanup();
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarTemplateSnapshot(root = null) {
  const currentRoot = isElement(root) ? root : null;
  const trigger = getDropdownTrigger(currentRoot);
  const menu = getDropdownMenu(currentRoot);

  return {
    version: SIDEBAR_TEMPLATE_VERSION,

    hasRoot: Boolean(currentRoot),
    open: currentRoot ? isSidebarOpen(currentRoot) : null,

    dropdown: {
      enabled: Boolean(currentRoot && trigger && menu),
      open: currentRoot ? isDropdownOpen(currentRoot) : false,
      bound: Boolean(currentRoot && boundRoots.has(currentRoot)),
      active: Boolean(currentRoot && activeDropdownRoot === currentRoot),
      triggerExpanded: trigger ? trigger.getAttribute("aria-expanded") : null,
      menuHidden: menu ? menu.hidden === true : null,
      focusableItems: getFocusableItems(menu).length,
    },

    icons: Object.keys(ICON_PATHS),

    brandLogo: {
      white: BRAND_LOGOS.white,
      black: BRAND_LOGOS.black,
    },

    policy: {
      buildsDom: true,
      centralizesDropdown: true,
      stableCssStructure: true,
      noHtmlString: true,

      noAuth: true,
      noRouter: true,
      noStore: true,
      noHttp: true,
      noToast: true,

      noRealNavigation: true,
      noRealLogout: true,
      callbackOnly: true,
    },
  };
}

/* =========================================================
   API
========================================================= */

export const SidebarTemplate = {
  version: SIDEBAR_TEMPLATE_VERSION,

  createSidebarTemplate,
  createSidebarHeader,
  createSidebarNav,
  createSidebarNavItem,
  createSidebarFooter,
  createSidebarIcon,
  createSidebarBrandLogo,

  bindSidebarTemplate,
  unbindSidebarTemplate,

  setSidebarTemplateOpen,

  setSidebarDropdownOpen,
  openSidebarDropdown,
  closeSidebarDropdown,
  toggleSidebarDropdown,

  getSidebarTemplateSnapshot,
  getSnapshot: getSidebarTemplateSnapshot,
  getDebugSnapshot: getSidebarTemplateSnapshot,
};

export default SidebarTemplate;
