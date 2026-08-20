/* =========================================================
   Onion Support - Sidebar Template
   Archivo: /src/ui/sidebar/template.js

   Responsabilidad:
   - Construir TODO el DOM visual del sidebar.
   - Mantener clases/data-* canónicos consumidos por CSS/index.js.
   - Gestionar sólo toggle, dropdown y foco local.
   - Exponer callbacks para Router/Auth sin ejecutarlos aquí.
   - Estados DOM idempotentes y callbacks async protegidos.
   - Sin Auth / Router / HTTP / Toast / Store / navegación real.
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
import { sanitizeRuntimeImageUrl } from "../../core/media.js";

export const SIDEBAR_TEMPLATE_VERSION =
  "sidebar.template.unified.v5-runtime-media-policy";

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
  servidor:
    "M5.5 4.25h13A2.5 2.5 0 0 1 21 6.75v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 9.25v-2.5a2.25 2.25 0 0 1 2.5-2.5Z M5.5 12.25h13A2.5 2.5 0 0 1 21 14.75v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.25v-2.5a2.5 2.5 0 0 1 2.5-2.5Z M7 8h.01 M7 16h.01 M10 8h7 M10 16h7",
  logout:
    "M15.75 17.25 21 12l-5.25-5.25 M20.25 12H9.75 M11.75 20.25H5.5A2.5 2.5 0 0 1 3 17.75V6.25a2.5 2.5 0 0 1 2.5-2.5h6.25",
});

const DROPDOWN_TRIGGER_SELECTOR =
  `[data-sidebar-dropdown-trigger="${ACCOUNT_DROPDOWN_KEY}"]`;
const DROPDOWN_MENU_SELECTOR =
  `[data-sidebar-dropdown-menu="${ACCOUNT_DROPDOWN_KEY}"]`;
const DROPDOWN_ITEM_SELECTOR =
  "[data-sidebar-dropdown-item='true']";
const FOCUSABLE_SELECTOR =
  "a[href],button:not([disabled]),[tabindex]:not([tabindex='-1'])";

let activeDropdownRoot = null;
let documentPointerHandler = null;
let documentKeyHandler = null;

const boundRoots = new WeakMap();

/* =========================================================
   BASICS / DOM PATCH
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isElement(value = null) {
  return Boolean(isBrowser() && value && value.nodeType === 1);
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

function normalizeKey(value = "") {
  return text(value).replace(/[-_\s]/g, "").toLowerCase();
}

function classNames(...values) {
  return values.flat().map((value) => text(value)).filter(Boolean).join(" ");
}

function cleanAttrs(attrs = {}) {
  const output = {};

  for (const [key, value] of Object.entries(isObject(attrs) ? attrs : {})) {
    if (!key || value === null || value === undefined || value === false) continue;
    output[key] = value === true ? "true" : String(value);
  }

  return output;
}

function el(tag = "div", options = {}) {
  const node = document.createElement(tag);

  if (options.className) node.className = options.className;
  if (options.textContent !== undefined && options.textContent !== null) {
    node.textContent = String(options.textContent);
  }

  for (const [key, value] of Object.entries(cleanAttrs(options.attrs))) {
    node.setAttribute(key, value);
  }

  for (const [key, value] of Object.entries(cleanAttrs(options.dataset))) {
    node.dataset[key] = value;
  }

  return node;
}

function span(className = "", textContent = "", attrs = {}) {
  return el("span", { className, textContent, attrs });
}

function append(parent, children = []) {
  if (!parent) return parent;

  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child) parent.appendChild(child);
  }

  return parent;
}

function contains(parent = null, child = null) {
  try {
    return Boolean(parent && child && (parent === child || parent.contains(child)));
  } catch {
    return false;
  }
}

function eventElement(target = null) {
  return target?.nodeType === 3 ? target.parentElement : target;
}

function setAttr(node, name, value) {
  if (!node || !name) return false;
  const next = String(value);
  if (node.getAttribute(name) === next) return false;
  node.setAttribute(name, next);
  return true;
}

function setData(node, key, value) {
  if (!node?.dataset || !key) return false;
  const next = String(value);
  if (node.dataset[key] === next) return false;
  node.dataset[key] = next;
  return true;
}

function removeData(node, key) {
  if (!node?.dataset || !key || node.dataset[key] === undefined) return false;
  delete node.dataset[key];
  return true;
}

function setClass(node, className, enabled) {
  if (!node?.classList || !className) return false;
  const next = enabled === true;
  if (node.classList.contains(className) === next) return false;
  node.classList.toggle(className, next);
  return true;
}

function setText(node, value) {
  if (!node) return false;
  const next = String(value);
  if (node.textContent === next) return false;
  node.textContent = next;
  return true;
}

function setHidden(node, hidden) {
  if (!node) return false;
  const next = hidden === true;
  if (node.hidden === next) return false;
  node.hidden = next;
  return true;
}

function invokeCallback(callback, ...args) {
  if (!isFunction(callback)) return false;

  try {
    const result = callback(...args);

    if (result && isFunction(result.then)) {
      Promise.resolve(result).catch(() => {});
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SECURITY / PATHS
========================================================= */

function hasSensitiveQuery(value = "") {
  const raw = String(value || "");
  return /[?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(raw);
}

function normalizeInternalPath(value = "") {
  const raw = text(value);
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
    /[\r\n\t\\]/.test(raw) ||
    hasSensitiveQuery(raw)
  ) {
    return "";
  }

  let href = "";

  try {
    href = normalizeRoutePath(raw) || "";
  } catch {
    return "";
  }

  if (
    !href ||
    !href.startsWith("/") ||
    href.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(href) ||
    /[\r\n\t\\]/.test(href) ||
    hasSensitiveQuery(href)
  ) {
    return "";
  }

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

function safeImageSrc(value = "", fallback = "") {
  return (
    sanitizeRuntimeImageUrl(
      value,
      {
        allowRelative: true,
        allowBlobObjectUrl: true,
        allowSameOrigin: true,
        allowOnionApi: true,
        allowAzureBlob: true,
        allowAzureBlobSas: true,
      }
    ) ||
    sanitizeRuntimeImageUrl(
      fallback,
      {
        allowRelative: true,
        allowBlobObjectUrl: true,
        allowSameOrigin: true,
        allowOnionApi: true,
        allowAzureBlob: true,
        allowAzureBlobSas: true,
      }
    )
  );
}

/* =========================================================
   USER / ITEM NORMALIZATION
========================================================= */

function normalizeRoleList(value = []) {
  const raw = Array.isArray(value)
    ? value.flat(Infinity)
    : text(value).split(/[,\s|;]+/);

  return [...new Set(raw.map(normalizeRole).filter(Boolean))];
}

function isAdminUser(user = {}) {
  const roles = normalizeRoleList([user.role, user.rol, user.roles]);
  return user.isAdmin === true || roles.includes(ROLE_ADMIN);
}

function initialsFromName(value = "") {
  const parts = text(value).split(/\s+/).filter(Boolean);
  if (!parts.length) return "ON";

  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts.at(-1)?.[0] || "" : "";

  return `${first}${last}`.toUpperCase().slice(0, 2) || "ON";
}

function normalizeUser(user = {}) {
  const source = isObject(user) ? user : {};
  const name = text(
    source.displayName || source.name || source.fullName || source.username,
    "Usuario"
  );

  const slug = normalizeUserSlug(
    source.slug ||
      source.publicSlug ||
      source.lookup?.slug ||
      source.profile?.slug ||
      source.username ||
      source.userId ||
      source.id ||
      ""
  );

  const avatarUrl = safeImageSrc(
    source.avatarUrl ||
      source.avatar ||
      source.photoUrl ||
      source.photoURL ||
      source.picture ||
      source.image ||
      source.profile?.avatarUrl ||
      source.profile?.avatar ||
      source.profile?.photoUrl ||
      source.profile?.photoURL ||
      source.profile?.picture ||
      "",
    ""
  );

  return {
    ...source,
    name,
    displayName: name,
    initials: text(source.initials, initialsFromName(name)).slice(0, 2).toUpperCase(),
    slug,
    avatarUrl,
    hasAvatar: Boolean(avatarUrl),
    roleLabel: text(
      source.roleLabel,
      isAdminUser(source) ? ROLE_LABEL_ADMIN : ROLE_LABEL_STANDARD
    ),
    isAdmin: isAdminUser(source),
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

    return buildUserScopedRoute(slug, canonical) || canonical;
  } catch {
    return canonical === "/"
      ? `${USER_HOME_PREFIX}${slug}`
      : `${USER_HOME_PREFIX}${slug}${canonical}`;
  }
}

function normalizeItem(item = {}) {
  const source = isObject(item) ? item : {};
  const href = safeInternalHref(source.href || source.path || "", "");
  const roles = itemRoles(source);

  return {
    href,
    label: text(source.label || source.title || source.name, href),
    icon: normalizeIconName(
      source.icon || source.viewKey || source.name || ICONS.home
    ),
    key: text(
      source.key || source.sidebarKey || source.viewKey || source.name || href,
      href
    ),
    badge: text(source.badge),
    active: source.active === true,
    disabled: source.disabled === true,
    hidden: source.hidden === true || !href,
    adminOnly: Boolean(
      source.adminOnly === true ||
        source.requiresAdmin === true ||
        source.admin === true ||
        (roles.includes(ROLE_ADMIN) && !roles.includes(ROLE_USER))
    ),
  };
}

/* =========================================================
   ICONS / BRAND / AVATAR
========================================================= */

export function createSidebarIcon(
  name = ICONS.home,
  className = "sidebar-icon"
) {
  if (!isBrowser()) return null;

  const iconName = normalizeIconName(name);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  svg.setAttribute("class", className);
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  path.setAttribute("d", ICON_PATHS[iconName] || ICON_PATHS.home);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.9");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("vector-effect", "non-scaling-stroke");

  svg.appendChild(path);
  return svg;
}

function createIconSlot(className, iconName, svgClass) {
  return append(
    el("span", { className, attrs: { "aria-hidden": "true" } }),
    createSidebarIcon(iconName, svgClass)
  );
}

function getPreferredBrandLogoSrc() {
  const white = safeImageSrc(BRAND_LOGOS.white);
  const black = safeImageSrc(BRAND_LOGOS.black);

  if (!isBrowser()) return white || black || "";

  try {
    const theme = text(document.documentElement?.dataset?.theme).toLowerCase();
    return theme === "light" ? black || white || "" : white || black || "";
  } catch {
    return white || black || "";
  }
}

export function createSidebarBrandLogo() {
  const preferredLogo = getPreferredBrandLogoSrc();

  const logo = el("span", {
    className: CLASSES.brandLogo,
    attrs: {
      "aria-hidden": "true",
      "data-sidebar-brand-logo": "true",
      "data-sidebar-brand-logo-mode": preferredLogo ? "image" : "fallback",
    },
  });

  if (!preferredLogo) {
    logo.textContent = "ON";
    return logo;
  }

  append(
    logo,
    el("img", {
      className: CLASSES.brandLogoImg,
      attrs: {
        src: preferredLogo,
        alt: "",
        loading: "eager",
        decoding: "async",
        draggable: "false",
        "data-sidebar-brand-logo-img": "true",
      },
    })
  );

  return logo;
}

function markAvatarFallback(avatar = null, img = null) {
  if (!avatar) return false;

  setClass(avatar, "has-image", false);
  setClass(avatar, "is-fallback", true);
  setData(avatar, "fallback", "true");
  setData(avatar, "avatarState", "fallback");

  if (img) {
    setHidden(img, true);
    if (img.hasAttribute?.("src")) img.removeAttribute("src");
  }

  return true;
}

function createUserAvatar(
  user = {},
  className = CLASSES.userAvatar,
  normalized = false
) {
  const currentUser = normalized ? user : normalizeUser(user);
  const hasImage = Boolean(currentUser?.avatarUrl);

  const avatar = el("span", {
    className: classNames(className, hasImage ? "has-image" : "is-fallback"),
    attrs: {
      "aria-hidden": "true",
      "data-sidebar-user-avatar": "true",
      "data-fallback": hasImage ? "false" : "true",
      "data-avatar-state": hasImage ? "image" : "fallback",
    },
  });

  if (hasImage) {
    const img = el("img", {
      className: CLASSES.userAvatarImage,
      attrs: {
        src: currentUser.avatarUrl,
        alt: "",
        loading: "lazy",
        decoding: "async",
        referrerpolicy: "no-referrer",
        draggable: "false",
        "data-sidebar-avatar-img": "true",
      },
    });

    img.addEventListener(
      "error",
      () => markAvatarFallback(avatar, img),
      { once: true }
    );

    append(avatar, img);
  }

  append(
    avatar,
    span(
      CLASSES.userAvatarFallback,
      currentUser?.initials || "ON",
      { "data-sidebar-avatar-fallback": "true" }
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
  const toggleLabel = open ? "Cerrar barra lateral" : "Abrir barra lateral";

  const header = el("header", {
    className: CLASSES.header,
    attrs: {
      "data-sidebar-header": "true",
      "data-sidebar-section": "header",
    },
  });

  const brand = el("a", {
    className: CLASSES.brand,
    attrs: {
      href: brandHref,
      "data-spa": "true",
      "data-sidebar-brand": "true",
      "data-sidebar-link": "true",
      "data-route": brandHref,
      "aria-label": brandLabel,
    },
  });

  append(
    brand,
    append(
      el("span", {
        className: CLASSES.brandContent,
        attrs: { "data-sidebar-brand-content": "true" },
      }),
      createSidebarBrandLogo()
    )
  );

  const toggle = el("button", {
    className: CLASSES.toggle,
    attrs: {
      type: "button",
      "data-sidebar-toggle": "true",
      "data-sidebar-action": "toggle",
      "aria-label": toggleLabel,
      "aria-expanded": open ? "true" : "false",
      "data-state": open ? "open" : "collapsed",
    },
  });

  append(toggle, [
    createSidebarIcon(ICONS.menu, "sidebar-toggle-svg"),
    span("sidebar-toggle-label", toggleLabel, {
      "data-sidebar-toggle-label": "true",
    }),
  ]);

  return append(header, [brand, toggle]);
}

export function createSidebarNav(items = []) {
  const nav = el("nav", {
    className: CLASSES.nav,
    attrs: {
      "data-sidebar-nav": "true",
      "aria-label": "Navegación principal",
      "data-sidebar-section": "navigation",
    },
  });

  const list = el("ul", {
    className: CLASSES.list,
    attrs: { "data-sidebar-list": "true" },
  });

  for (const rawItem of (Array.isArray(items) ? items : [])) {
    const item = normalizeItem(rawItem);
    if (!item.hidden) append(list, createSidebarNavItem(item));
  }

  return append(nav, list);
}

export function createSidebarNavItem(rawItem = {}) {
  const item = normalizeItem(rawItem);

  const li = el("li", {
    className: CLASSES.item,
    attrs: {
      "data-sidebar-item": "true",
      "data-route": item.href,
      "data-active": item.active ? "true" : "false",
      "data-disabled": item.disabled ? "true" : "false",
      "data-admin-only": item.adminOnly ? "true" : null,
    },
  });

  const link = el("a", {
    className: classNames(
      CLASSES.link,
      item.active ? CLASSES.linkActive : "",
      item.disabled ? CLASSES.linkDisabled : ""
    ),
    attrs: {
      href: item.disabled ? null : item.href,
      "data-spa": item.disabled ? null : "true",
      "data-sidebar-link": "true",
      "data-sidebar-nav-link": "true",
      "data-route": item.disabled ? null : item.href,
      "data-sidebar-key": item.key,
      "data-sidebar-active": item.active ? "true" : "false",
      "data-sidebar-disabled": item.disabled ? "true" : "false",
      "aria-current": item.active ? "page" : null,
      "aria-disabled": item.disabled ? "true" : null,
      tabindex: item.disabled ? "-1" : null,
    },
  });

  const copy = append(
    el("span", { className: CLASSES.linkContent }),
    span(CLASSES.linkLabel, item.label)
  );

  if (item.badge) {
    append(copy, span(CLASSES.linkBadge, item.badge));
  }

  append(link, [
    createIconSlot(CLASSES.linkIcon, item.icon, "sidebar-link-svg"),
    copy,
  ]);

  return append(li, link);
}

/* =========================================================
   ACCOUNT
========================================================= */

function createAccountMenuItem({
  label = "",
  iconName = ICONS.cuenta,
  action = "",
  href = "",
  danger = false,
  logout = false,
} = {}) {
  const finalLabel = text(label);
  const finalAction = text(action);
  const finalHref = href ? safeInternalHref(href, "") : "";

  const item = el(finalHref ? "a" : "button", {
    className: classNames(
      CLASSES.accountMenuItem,
      danger ? CLASSES.accountMenuItemDanger : ""
    ),
    attrs: {
      type: finalHref ? null : "button",
      href: finalHref || null,
      "data-spa": finalHref ? "true" : null,
      "data-sidebar-link": finalHref ? "true" : null,
      "data-route": finalHref || null,
      "data-sidebar-logout": logout ? "true" : null,
      "data-sidebar-dropdown-item": "true",
      "data-sidebar-action": finalAction || null,
      "data-danger": danger ? "true" : null,
      "aria-label": finalLabel,
      role: "menuitem",
    },
  });

  return append(item, [
    createIconSlot(
      CLASSES.accountMenuIcon,
      iconName,
      "sidebar-account-menu-svg"
    ),
    span(CLASSES.accountMenuLabel, finalLabel),
  ]);
}

function createAccountDropdown(user = {}, options = {}) {
  const currentUser = normalizeUser(user);
  const menuId = `${SIDEBAR_ROOT_ID}-account-menu`;

  const cuentaHref =
    safeInternalHref(options.cuentaHref || options.accountHref || "", "") ||
    userScopedPrivateHref(ROUTES.cuenta || "/cuenta", currentUser);

  const dropdown = el("div", {
    className: CLASSES.accountDropdown,
    attrs: {
      "data-sidebar-account-dropdown": "true",
      "data-sidebar-dropdown": ACCOUNT_DROPDOWN_KEY,
    },
  });

  const trigger = el("button", {
    className: CLASSES.accountTrigger,
    attrs: {
      type: "button",
      "data-sidebar-dropdown-trigger": ACCOUNT_DROPDOWN_KEY,
      "data-sidebar-action": "account-menu",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-controls": menuId,
      "aria-label": `Cuenta de ${currentUser.name}`,
    },
  });

  const info = append(
    el("span", { className: CLASSES.userInfo }),
    [
      span(CLASSES.userName, currentUser.name, {
        "data-sidebar-user-name": "true",
      }),
      span(CLASSES.userRole, currentUser.roleLabel, {
        "data-sidebar-user-role": "true",
      }),
    ]
  );

  append(trigger, [
    createUserAvatar(currentUser, CLASSES.userAvatar, true),
    info,
    createIconSlot(
      CLASSES.accountChevron,
      ICONS.chevron,
      "sidebar-account-chevron-svg"
    ),
  ]);

  const menu = el("div", {
    className: CLASSES.accountMenu,
    attrs: {
      id: menuId,
      role: "menu",
      "aria-hidden": "true",
      "data-sidebar-dropdown-menu": ACCOUNT_DROPDOWN_KEY,
      "data-sidebar-account-menu": "true",
      "data-sidebar-dropdown-state": "closed",
    },
  });
  menu.hidden = true;

  const menuHeaderInfo = append(
    el("span", { className: CLASSES.accountMenuUserInfo }),
    [
      span(CLASSES.accountMenuUserName, currentUser.name, {
        "data-sidebar-user-name": "true",
      }),
      span(CLASSES.accountMenuUserMeta, currentUser.roleLabel, {
        "data-sidebar-user-role": "true",
      }),
    ]
  );

  const menuHeader = append(
    el("div", {
      className: CLASSES.accountMenuHeader,
      attrs: { "data-sidebar-account-menu-header": "true" },
    }),
    [
      createUserAvatar(currentUser, CLASSES.accountMenuAvatar, true),
      menuHeaderInfo,
    ]
  );

  const primary = append(
    el("div", {
      className: CLASSES.accountMenuGroup,
      attrs: { "data-sidebar-account-menu-group": "primary" },
    }),
    [
      createAccountMenuItem({
        label: "Cuenta",
        iconName: ICONS.cuenta,
        action: "navigate",
        href: cuentaHref,
      }),
    ]
  );

  const danger = append(
    el("div", {
      className: classNames(
        CLASSES.accountMenuGroup,
        CLASSES.accountMenuDangerGroup
      ),
      attrs: { "data-sidebar-account-menu-group": "session" },
    }),
    createAccountMenuItem({
      label: "Salir",
      iconName: ICONS.logout,
      action: "logout",
      danger: true,
      logout: true,
    })
  );

  append(menu, [menuHeader, primary, danger]);
  return append(dropdown, [trigger, menu]);
}

export function createSidebarFooter(user = {}, options = {}) {
  return append(
    el("footer", {
      className: CLASSES.footer,
      attrs: {
        "data-sidebar-footer": "true",
        "data-sidebar-section": "footer",
      },
    }),
    createAccountDropdown(user, options.accountLinks || options)
  );
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

  const root = el("aside", {
    className: classNames(
      CLASSES.root,
      CLASSES.appRoot,
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
      version: SIDEBAR_TEMPLATE_VERSION,
    },
  });

  const inner = el("div", {
    className: CLASSES.inner,
    attrs: { "data-sidebar-inner": "true" },
  });

  append(inner, [
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

  return append(root, inner);
}

/* =========================================================
   LOOKUPS / FOCUS
========================================================= */

function query(root, selector) {
  try {
    return root?.querySelector?.(selector) || null;
  } catch {
    return null;
  }
}

function getDropdownTrigger(root) {
  return query(root, DROPDOWN_TRIGGER_SELECTOR);
}

function getDropdownMenu(root) {
  return query(root, DROPDOWN_MENU_SELECTOR);
}

function isDisabledElement(node = null) {
  if (!isElement(node)) return true;

  return Boolean(
    node.hidden === true ||
      node.disabled === true ||
      node.getAttribute("aria-disabled") === "true" ||
      node.getAttribute("aria-hidden") === "true" ||
      node.closest?.(
        "[hidden], [aria-hidden='true'], [aria-disabled='true'], [data-disabled='true']"
      )
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

function focusMenuEdge(menu, edge = "first") {
  const items = getFocusableItems(menu);
  if (!items.length) return false;

  return focusNode(edge === "last" ? items.at(-1) : items[0]);
}

function focusMenuRelative(menu, current, delta = 1) {
  const items = getFocusableItems(menu);
  if (!items.length) return false;

  let index = items.indexOf(current);
  if (index < 0) index = delta < 0 ? 0 : -1;

  const next = (index + delta + items.length) % items.length;
  return focusNode(items[next]);
}

/* =========================================================
   OPEN / DROPDOWN STATE
========================================================= */

function isSidebarOpen(root = null) {
  if (!isElement(root)) return false;

  return !(
    root.classList.contains(CLASSES.collapsed) ||
    root.dataset.open === "false" ||
    root.dataset.sidebarState === "collapsed"
  );
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

export function setSidebarTemplateOpen(root = null, open = true, options = {}) {
  if (!isElement(root)) return false;

  const value = Boolean(open);
  const wasOpen = isSidebarOpen(root);
  const state = value ? "open" : "collapsed";
  const label = value ? "Cerrar barra lateral" : "Abrir barra lateral";

  setClass(root, CLASSES.open, value);
  setClass(root, CLASSES.collapsed, !value);
  setData(root, "open", value ? "true" : "false");
  setData(root, "sidebarState", state);

  const toggle = query(root, "[data-sidebar-toggle='true']");
  const toggleLabel = query(root, "[data-sidebar-toggle-label='true']");

  if (toggle) {
    setAttr(toggle, "aria-expanded", value ? "true" : "false");
    setAttr(toggle, "aria-label", label);
    setData(toggle, "state", state);
  }

  if (toggleLabel) setText(toggleLabel, label);

  /*
    El v2 cerraba visualmente el menú al colapsar pero dejaba
    vivos los listeners globales. Aquí se cierra por la API completa.
  */
  if (
    !value &&
    (isDropdownOpen(root) || activeDropdownRoot === root)
  ) {
    closeSidebarDropdown(root, { focus: false });
  }

  if (wasOpen !== value) {
    invokeCallback(options.onOpenChange, value, {
      root,
      source: "sidebar.template",
    });
  }

  return true;
}

function setDropdownDomState(root = null, open = false) {
  const trigger = getDropdownTrigger(root);
  const menu = getDropdownMenu(root);

  if (!isElement(root) || !isElement(trigger) || !isElement(menu)) {
    return false;
  }

  const value = Boolean(open);

  setClass(root, "is-account-menu-open", value);
  setData(root, "sidebarAccountDropdown", value ? "open" : "closed");

  if (value) {
    setData(root, "sidebarDropdownOpen", ACCOUNT_DROPDOWN_KEY);
  } else {
    removeData(root, "sidebarDropdownOpen");
  }

  setAttr(trigger, "aria-expanded", value ? "true" : "false");
  setData(trigger, "sidebarDropdownState", value ? "open" : "closed");

  setHidden(menu, !value);
  setAttr(menu, "aria-hidden", value ? "false" : "true");
  setData(menu, "sidebarDropdownState", value ? "open" : "closed");
  setClass(menu, CLASSES.accountMenuOpen, value);

  return true;
}

/* =========================================================
   DOCUMENT HANDLERS
========================================================= */

function detachDocumentDropdownHandlers() {
  if (isBrowser()) {
    try {
      if (documentPointerHandler) {
        document.removeEventListener(
          "pointerdown",
          documentPointerHandler,
          true
        );
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

  if (
    activeDropdownRoot === root &&
    documentPointerHandler &&
    documentKeyHandler
  ) {
    return true;
  }

  detachDocumentDropdownHandlers();

  documentPointerHandler = (event) => {
    const target = eventElement(event.target);
    if (!contains(root, target)) {
      closeSidebarDropdown(root, { focus: false });
    }
  };

  documentKeyHandler = (event) => {
    if (event.key !== "Escape" || !isDropdownOpen(root)) return;

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

export function setSidebarDropdownOpen(
  root = null,
  open = false,
  options = {}
) {
  if (!isElement(root)) return false;

  const value = Boolean(open);

  /*
    El dropdown pertenece al drawer completo.
    Si estaba collapsed, abrir cuenta abre primero el Sidebar.
  */
  if (value && !isSidebarOpen(root)) {
    setSidebarTemplateOpen(root, true, options);
  }

  if (!setDropdownDomState(root, value)) return false;

  if (value) {
    attachDocumentDropdownHandlers(root);

    if (options.focus === true) {
      focusMenuEdge(
        getDropdownMenu(root),
        options.focusEdge === "last" ? "last" : "first"
      );
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

function handleMenuKeydown(event, root) {
  if (!isDropdownOpen(root)) return false;

  const target = eventElement(event.target);
  const menu = getDropdownMenu(root);

  if (!menu || !contains(menu, target)) return false;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      return focusMenuRelative(menu, target, 1);

    case "ArrowUp":
      event.preventDefault();
      return focusMenuRelative(menu, target, -1);

    case "Home":
      event.preventDefault();
      return focusMenuEdge(menu, "first");

    case "End":
      event.preventDefault();
      return focusMenuEdge(menu, "last");

    default:
      return false;
  }
}

export function bindSidebarTemplate(root = null, options = {}) {
  if (!isElement(root)) return () => false;
  if (boundRoots.has(root)) return boundRoots.get(root);

  const onClick = (event) => {
    const target = eventElement(event.target);
    if (!target) return;

    const dropdownTrigger = target.closest?.(DROPDOWN_TRIGGER_SELECTOR);

    if (
      dropdownTrigger &&
      contains(root, dropdownTrigger) &&
      !isDisabledElement(dropdownTrigger)
    ) {
      event.preventDefault();
      event.stopPropagation();

      toggleSidebarDropdown(root, {
        ...options,
        focus: true,
      });
      return;
    }

    const action = target.closest?.("[data-sidebar-action]");
    const actionType = text(action?.dataset?.sidebarAction);

    if (actionType === "toggle") {
      event.preventDefault();
      setSidebarTemplateOpen(root, !isSidebarOpen(root), options);
      return;
    }

    if (actionType === "logout") {
      event.preventDefault();
      closeSidebarDropdown(root, { focus: false });

      const detail = {
        event,
        root,
        source: "sidebar.template",
      };

      /*
        Evita unhandled rejection si el callback del controller es async.
      */
      invokeCallback(options.onLogout, detail);
      invokeCallback(options.onAction, "logout", detail);
      return;
    }

    const dropdownItem = target.closest?.(DROPDOWN_ITEM_SELECTOR);

    if (dropdownItem && contains(root, dropdownItem)) {
      closeSidebarDropdown(root, { focus: false });
    }
  };

  const onKeydown = (event) => {
    const target = eventElement(event.target);
    const trigger = target?.closest?.(DROPDOWN_TRIGGER_SELECTOR);

    if (
      trigger &&
      contains(root, trigger) &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();

      openSidebarDropdown(root, {
        ...options,
        focus: true,
        focusEdge: event.key === "ArrowUp" ? "last" : "first",
      });
      return;
    }

    handleMenuKeydown(event, root);
  };

  try {
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKeydown);
  } catch {
    try {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
    } catch {
      // noop
    }
    return () => false;
  }

  /*
    Estado inicial cerrado sin listeners globales.
  */
  setDropdownDomState(root, false);

  const cleanup = () => {
    try {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeydown);
    } catch {
      // noop
    }

    if (activeDropdownRoot === root) {
      detachDocumentDropdownHandlers();
    }

    setDropdownDomState(root, false);
    boundRoots.delete(root);
    return true;
  };

  boundRoots.set(root, cleanup);
  return cleanup;
}

export function unbindSidebarTemplate(root = null) {
  if (!isElement(root)) {
    if (activeDropdownRoot) {
      closeSidebarDropdown(activeDropdownRoot, { focus: false });
    }
    return false;
  }

  const cleanup = boundRoots.get(root);
  return cleanup ? cleanup() : false;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarTemplateSnapshot(root = null) {
  const currentRoot = isElement(root) ? root : null;
  const trigger = getDropdownTrigger(currentRoot);
  const menu = getDropdownMenu(currentRoot);

  return Object.freeze({
    version: SIDEBAR_TEMPLATE_VERSION,
    hasRoot: Boolean(currentRoot),
    open: currentRoot ? isSidebarOpen(currentRoot) : null,

    dropdown: Object.freeze({
      enabled: Boolean(currentRoot && trigger && menu),
      open: currentRoot ? isDropdownOpen(currentRoot) : false,
      bound: Boolean(currentRoot && boundRoots.has(currentRoot)),
      active: Boolean(currentRoot && activeDropdownRoot === currentRoot),
      triggerExpanded: trigger?.getAttribute("aria-expanded") ?? null,
      menuHidden: menu ? menu.hidden === true : null,
      focusableItems: getFocusableItems(menu).length,
    }),

    icons: Object.freeze(Object.keys(ICON_PATHS)),

    brandLogo: Object.freeze({
      white: Boolean(BRAND_LOGOS.white),
      black: Boolean(BRAND_LOGOS.black),
    }),

    policy: Object.freeze({
      buildsDom: true,
      canonicalCssClasses: true,
      legacyCompatClasses: false,
      centralizesDropdown: true,
      idempotentOpenState: true,
      idempotentDropdownState: true,
      dropdownHandlersDetachOnCollapse: true,
      asyncCallbacksHandled: true,
      keyboardMenuNavigation: true,
      noHtmlString: true,
      noAuth: true,
      noRouter: true,
      noStore: true,
      noHttp: true,
      noToast: true,
      noRealNavigation: true,
      noRealLogout: true,
      callbackOnly: true,
    }),
  });
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
