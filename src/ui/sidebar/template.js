/* =========================================================
   Onion Support - Sidebar Template
   Archivo: /src/ui/sidebar/template.js

   Responsabilidad:
   - Construir el DOM del sidebar.
   - Exponer estructura estable para CSS SaaS.
   - Preparar header, navegación y cuenta estilo ChatGPT.
   - Header logo-only: sin texto visible de marca.
   - Logo de empresa real usando favicon_white.png / favicon_black.png.
   - Sin SVG fallback como logo de marca.
   - Pintar avatar si user.js entrega avatarUrl.
   - Pintar fallback de iniciales si no hay avatar o falla la imagen.
   - Pintar metadata admin/roles si index.js/rutas la entregan.
   - Preparar markup del dropdown de cuenta.
   - Recibir datos ya normalizados desde index.js/user.js.
   - Construir hrefs privados visibles del dropdown con /@{user.slug}/{ruta} si existe slug.
   - Delegar seguridad de href en constants.js -> core/config.js.
   - No navegar.
   - No leer sesión.
   - No leer rutas dinámicas.
   - No hacer logout.
   - No decidir visibilidad.
   - No decidir permisos.
   - No abrir/cerrar dropdown.
   - No depender de Auth / Router / Core / Store.
   - No usar HTML string.
   - No duplicar lógica de negocio.
   - Sin denylist local.
   - Sin HTTP.
   - Sin Toast.
========================================================= */

import {
  AJUSTES_ROUTE,
  CUENTA_ROUTE,
  SIDEBAR_ATTRS,
  SIDEBAR_BRAND_HREF,
  SIDEBAR_BRAND_LABEL,
  SIDEBAR_CLASSES,
  SIDEBAR_ICONS,
  SIDEBAR_ROOT_ID,
  SIDEBAR_ROLE_ADMIN,
  SIDEBAR_ROLE_USER,
  USER_HOME_PREFIX,
  isSidebarBlockedRoute,
  normalizeSidebarIcon,
  normalizeSidebarPath,
  normalizeSidebarSlug,
} from "./constants.js";

import {
  createElement,
  isBrowser,
  text,
} from "./dom.js";

export const SIDEBAR_TEMPLATE_VERSION = "sidebar.template.v14.user-scoped-account-links";

/* =========================================================
   BRAND ASSETS
========================================================= */

const BRAND_LOGOS = Object.freeze({
  white: new URL("../../media/img/favicon_white.png", import.meta.url).href,
  black: new URL("../../media/img/favicon_black.png", import.meta.url).href,
});

const ROLE_LABEL_ADMIN = "Administrador";
const ROLE_LABEL_STANDARD = "Estándar";

const ATTR_USER_AVATAR = SIDEBAR_ATTRS.userAvatar || "data-sidebar-user-avatar";
const ATTR_USER_NAME = SIDEBAR_ATTRS.userName || "data-sidebar-user-name";
const ATTR_USER_ROLE = SIDEBAR_ATTRS.userRole || "data-sidebar-user-role";

/* =========================================================
   ICON PATHS
========================================================= */

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

  help:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9.75 9a2.35 2.35 0 0 1 4.55.8c0 1.55-1.18 2.1-2 2.75-.55.45-.8.9-.8 1.7 M12 17.25h.01",

  logout:
    "M15.75 17.25 21 12l-5.25-5.25 M20.25 12H9.75 M11.75 20.25H5.5A2.5 2.5 0 0 1 3 17.75V6.25a2.5 2.5 0 0 1 2.5-2.5h6.25",
});

/* =========================================================
   BASICS
========================================================= */

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
  if (isSidebarBlockedRoute(raw)) return "";

  const href = normalizeSidebarPath(raw);

  if (!href) return "";
  if (!href.startsWith("/")) return "";
  if (href.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return "";
  if (/[\r\n\t\\]/.test(href)) return "";
  if (hasSensitiveQuery(href)) return "";
  if (isSidebarBlockedRoute(href)) return "";

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

  if (/^https?:\/\//i.test(src) && !hasSensitiveQuery(src)) {
    try {
      const url = new URL(src);

      if (url.protocol === "https:") return url.href;

      if (isBrowser() && url.origin === window.location.origin) {
        return url.href;
      }

      return fallback;
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

  if (/^https:\/\//i.test(src)) {
    try {
      return new URL(src).href;
    } catch {
      return "";
    }
  }

  return "";
}

function createSpan(className = "", textContent = "", attrs = {}) {
  return createElement("span", {
    className,
    textContent,
    attrs,
  });
}

function normalizeRole(value = "") {
  const role = text(value, "").toLowerCase();

  if (role === SIDEBAR_ROLE_ADMIN) return SIDEBAR_ROLE_ADMIN;
  if (role === SIDEBAR_ROLE_USER) return SIDEBAR_ROLE_USER;

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

function itemRoles(item = {}) {
  return [
    ...normalizeRoleList(item.role),
    ...normalizeRoleList(item.roles),
    ...normalizeRoleList(item.requiredRole),
    ...normalizeRoleList(item.requiredRoles),
  ];
}

function roleText(value = "") {
  if (Array.isArray(value)) {
    return value
      .map((item) => text(item, ""))
      .filter(Boolean)
      .join(" ");
  }

  return text(value, "");
}

function isAdminUser(user = {}) {
  const roles = normalizeRoleList([
    user.role,
    user.rol,
    user.roles,
  ]);

  return Boolean(
    user.isAdmin === true ||
      roles.includes(SIDEBAR_ROLE_ADMIN)
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

  if (!parts.length) return "";

  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";

  return `${first}${second}`.toUpperCase();
}

function templateUserSlug(user = {}) {
  return normalizeSidebarSlug(
    user.slug ||
      user.publicSlug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      ""
  );
}

function userScopedPrivateHref(path = "", user = {}) {
  const canonical = safeInternalHref(path, "");

  if (!canonical) return "";

  const slug = templateUserSlug(user);

  if (!slug) return canonical;
  if (canonical === "/") return safeInternalHref(`${USER_HOME_PREFIX}${slug}`, canonical);

  return safeInternalHref(`${USER_HOME_PREFIX}${slug}${canonical}`, canonical);
}

/* =========================================================
   NORMALIZE
========================================================= */

function normalizeItem(item = {}) {
  const rawHref = item.href || item.path || "";
  const href = safeInternalHref(rawHref, "");
  const label = text(item.label || item.title || item.name, href);
  const icon = normalizeSidebarIcon(item.icon || SIDEBAR_ICONS.home);
  const roles = itemRoles(item);
  const adminOnly = Boolean(
    item.adminOnly === true ||
      item.requiresAdmin === true ||
      item.admin === true ||
      (
        roles.includes(SIDEBAR_ROLE_ADMIN) &&
        !roles.includes(SIDEBAR_ROLE_USER)
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

    badge: text(item.badge, ""),
    requiredRole: text(item.requiredRole || item.role, ""),
    requiredRoles: roleText(roles.length ? roles : item.requiredRoles),
  };
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
    initialsFromName(name) || "U"
  )
    .slice(0, 2)
    .toUpperCase();

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
    name,
    initials,
    avatarUrl,
    roleLabel: text(user.roleLabel, defaultRoleLabel(user)),
  };
}

/* =========================================================
   ICON
========================================================= */

export function createSidebarIcon(
  name = SIDEBAR_ICONS.home,
  className = "sidebar-icon"
) {
  if (!isBrowser()) return null;

  const iconName = normalizeSidebarIcon(name);
  const pathData = ICON_PATHS[iconName] || ICON_PATHS[name] || ICON_PATHS.home;

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

function createIconSlot(className = "", iconName = SIDEBAR_ICONS.home, svgClass = "") {
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
   BRAND LOGO
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
    className: "sidebar-brand-logo sidebar-brand-logo--image",
    attrs: {
      "aria-hidden": "true",
      "data-sidebar-brand-logo": "true",
      "data-sidebar-brand-logo-mode": "image",
      "data-sidebar-brand-logo-white": whiteLogo,
      "data-sidebar-brand-logo-black": blackLogo,
    },
  });

  appendChildren(
    logo,
    createElement("img", {
      className: "sidebar-brand-logo-img",
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

function createUserAvatar(user = {}, className = SIDEBAR_CLASSES.userAvatar) {
  const normalizedUser = normalizeUser(user);
  const hasImage = Boolean(normalizedUser.avatarUrl);

  const avatar = createElement("span", {
    className: classNames(
      className,
      hasImage ? "has-image" : "is-fallback"
    ),
    attrs: {
      "aria-hidden": "true",
      [ATTR_USER_AVATAR]: "true",
      "data-fallback": hasImage ? "false" : "true",
      "data-avatar-state": hasImage ? "image" : "fallback",
    },
  });

  if (hasImage) {
    const img = createElement("img", {
      className: SIDEBAR_CLASSES.userAvatarImage || "sidebar-user-avatar-img",
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
      SIDEBAR_CLASSES.userAvatarFallback || "sidebar-user-avatar-fallback",
      normalizedUser.initials,
      {
        "data-sidebar-avatar-fallback": "true",
      }
    )
  );

  return avatar;
}

/* =========================================================
   HEADER
========================================================= */

export function createSidebarHeader(options = {}) {
  const brandLabel = text(options.brandLabel, SIDEBAR_BRAND_LABEL);
  const brandHref = safeInternalHref(options.brandHref, SIDEBAR_BRAND_HREF);
  const open = options.open !== false;

  const header = createElement("header", {
    className: classNames(
      SIDEBAR_CLASSES.header,
      "sidebar-header-chatgpt",
      "sidebar-header--chatgpt"
    ),
    attrs: {
      [SIDEBAR_ATTRS.header]: "true",
      "data-sidebar-section": "header",
      "data-sidebar-header-layout": "logo-only",
    },
  });

  const brand = createElement("a", {
    className: classNames(
      SIDEBAR_CLASSES.brand,
      "sidebar-brand-chatgpt",
      "sidebar-brand-logo-only",
      "sidebar-brand--chatgpt",
      "sidebar-brand--logo-only"
    ),
    attrs: {
      href: brandHref,

      [SIDEBAR_ATTRS.spa]: "",
      [SIDEBAR_ATTRS.brand]: "true",
      [SIDEBAR_ATTRS.link]: "true",
      [SIDEBAR_ATTRS.route]: brandHref,

      "aria-label": brandLabel,
      "data-sidebar-action": "brand",
      "data-sidebar-brand-logo-only": "true",
    },
  });

  const brandContent = createElement("span", {
    className: "sidebar-brand-content sidebar-brand-content-logo sidebar-brand-content--logo",
    attrs: {
      "data-sidebar-brand-content": "true",
    },
  });

  appendChildren(brandContent, createSidebarBrandLogo());
  appendChildren(brand, brandContent);

  const toggle = createElement("button", {
    className: classNames(
      SIDEBAR_CLASSES.toggle,
      "sidebar-toggle-chatgpt",
      "sidebar-toggle-panel",
      "sidebar-toggle--chatgpt",
      "sidebar-toggle--panel"
    ),
    attrs: {
      type: "button",
      [SIDEBAR_ATTRS.toggle]: "true",
      "aria-label": open ? "Cerrar barra lateral" : "Abrir barra lateral",
      "aria-expanded": open ? "true" : "false",
      "data-sidebar-action": "toggle",
      "data-state": open ? "open" : "collapsed",
      "data-sidebar-toggle-kind": "panel",
    },
  });

  appendChildren(toggle, [
    createSidebarIcon(SIDEBAR_ICONS.menu, "sidebar-toggle-svg"),
    createSpan(
      "sidebar-toggle-label",
      open ? "Cerrar barra lateral" : "Abrir barra lateral"
    ),
  ]);

  appendChildren(header, [brand, toggle]);

  return header;
}

/* =========================================================
   NAV
========================================================= */

export function createSidebarNav(items = []) {
  const nav = createElement("nav", {
    className: classNames(SIDEBAR_CLASSES.nav, "sidebar-nav--chatgpt"),
    attrs: {
      [SIDEBAR_ATTRS.nav]: "true",
      "aria-label": "Navegación principal",
      "data-sidebar-section": "navigation",
    },
  });

  const list = createElement("ul", {
    className: SIDEBAR_CLASSES.list,
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
    className: SIDEBAR_CLASSES.item,
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
      SIDEBAR_CLASSES.link,
      "sidebar-link--chatgpt",
      item.active ? SIDEBAR_CLASSES.active : "",
      item.disabled ? SIDEBAR_CLASSES.disabled : ""
    ),
    attrs: cleanAttrs({
      href: item.href,

      [SIDEBAR_ATTRS.spa]: "",
      [SIDEBAR_ATTRS.link]: "true",
      [SIDEBAR_ATTRS.navLink]: "true",
      [SIDEBAR_ATTRS.route]: item.href,
      [SIDEBAR_ATTRS.active]: item.active ? "true" : "false",
      [SIDEBAR_ATTRS.disabled]: item.disabled ? "true" : "false",

      "aria-current": item.active ? "page" : null,
      "aria-disabled": item.disabled ? "true" : null,

      "data-sidebar-action": "navigate",
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
    className: "sidebar-link-content",
  });

  appendChildren(content, [
    createSpan(SIDEBAR_CLASSES.linkLabel, item.label),
  ]);

  if (item.badge) {
    appendChildren(
      content,
      createElement("span", {
        className: SIDEBAR_CLASSES.linkBadge,
        textContent: item.badge,
      })
    );
  }

  appendChildren(link, [
    createIconSlot(
      SIDEBAR_CLASSES.linkIcon,
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
  iconName = SIDEBAR_ICONS.cuenta,
  action = "",
  href = "",
  danger = false,
  logout = false,
} = {}) {
  const finalLabel = text(label, "");
  const finalAction = text(action, "");
  const finalHref = href ? safeInternalHref(href, "") : "";

  const attrs = cleanAttrs({
    type: finalHref ? null : "button",
    href: finalHref || null,

    [SIDEBAR_ATTRS.spa]: finalHref ? "" : null,
    [SIDEBAR_ATTRS.link]: finalHref ? "true" : null,
    [SIDEBAR_ATTRS.route]: finalHref || null,
    [SIDEBAR_ATTRS.logout]: logout ? "true" : null,

    [SIDEBAR_ATTRS.dropdownItem]: "true",
    "data-sidebar-action": finalAction || null,
    "data-sidebar-menu-action": finalAction || null,
    "data-danger": danger ? "true" : null,
    "aria-label": finalLabel,
  });

  const element = createElement(finalHref ? "a" : "button", {
    className: classNames(
      "sidebar-account-menu-item",
      danger ? "is-danger" : ""
    ),
    attrs,
  });

  appendChildren(element, [
    createIconSlot(
      "sidebar-account-menu-icon",
      iconName,
      "sidebar-account-menu-svg"
    ),
    createSpan("sidebar-account-menu-label", finalLabel),
  ]);

  return element;
}

function createAccountDropdown(user = {}, options = {}) {
  const normalizedUser = normalizeUser(user);
  const menuId = `${SIDEBAR_ROOT_ID}-account-menu`;

  const cuentaHref = safeInternalHref(
    options.cuentaHref || options.accountHref || "",
    ""
  ) || userScopedPrivateHref(CUENTA_ROUTE, user);

  const ajustesHref = safeInternalHref(
    options.ajustesHref || options.settingsHref || "",
    ""
  ) || userScopedPrivateHref(AJUSTES_ROUTE, user);

  const dropdown = createElement("div", {
    className: "sidebar-account-dropdown",
    attrs: {
      "data-sidebar-account-dropdown": "true",
      [SIDEBAR_ATTRS.dropdown]: "account",
    },
  });

  const trigger = createElement("button", {
    className: classNames(SIDEBAR_CLASSES.user, "sidebar-account-trigger"),
    attrs: {
      type: "button",
      [SIDEBAR_ATTRS.user]: "true",
      "data-sidebar-user-card": "true",
      [SIDEBAR_ATTRS.dropdownTrigger]: "account",
      "data-sidebar-action": "account-menu",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-controls": menuId,
      "aria-label": `Cuenta de ${normalizedUser.name}`,
    },
  });

  const info = createElement("span", {
    className: SIDEBAR_CLASSES.userInfo,
  });

  appendChildren(info, [
    createElement("span", {
      className: SIDEBAR_CLASSES.userName,
      textContent: normalizedUser.name,
      attrs: {
        [ATTR_USER_NAME]: "true",
      },
    }),
    createElement("span", {
      className: SIDEBAR_CLASSES.userRole,
      textContent: normalizedUser.roleLabel,
      attrs: {
        [ATTR_USER_ROLE]: "true",
      },
    }),
  ]);

  appendChildren(trigger, [
    createUserAvatar(normalizedUser),
    info,
    createIconSlot(
      "sidebar-account-chevron",
      "chevron",
      "sidebar-account-chevron-svg"
    ),
  ]);

  const menu = createElement("div", {
    className: "sidebar-account-menu",
    attrs: {
      id: menuId,
      role: "menu",
      hidden: true,
      [SIDEBAR_ATTRS.dropdownMenu]: "account",
      "data-sidebar-account-menu": "true",
    },
  });

  const menuHeader = createElement("div", {
    className: "sidebar-account-menu-header",
    attrs: {
      "data-sidebar-account-menu-header": "true",
    },
  });

  const menuHeaderInfo = createElement("span", {
    className: "sidebar-account-menu-user-info",
  });

  appendChildren(menuHeaderInfo, [
    createSpan("sidebar-account-menu-user-name", normalizedUser.name, {
      [ATTR_USER_NAME]: "true",
    }),
    createSpan("sidebar-account-menu-user-meta", normalizedUser.roleLabel, {
      [ATTR_USER_ROLE]: "true",
    }),
  ]);

  appendChildren(menuHeader, [
    createUserAvatar(normalizedUser, "sidebar-account-menu-avatar"),
    menuHeaderInfo,
  ]);

  const menuGroup = createElement("div", {
    className: "sidebar-account-menu-group",
    attrs: {
      "data-sidebar-account-menu-group": "primary",
    },
  });

  appendChildren(menuGroup, [
    createAccountMenuItem({
      label: "Cuenta",
      iconName: SIDEBAR_ICONS.cuenta,
      action: "navigate",
      href: cuentaHref,
    }),
    createAccountMenuItem({
      label: "Ajustes",
      iconName: SIDEBAR_ICONS.ajustes,
      action: "navigate",
      href: ajustesHref,
    }),
  ]);

  const menuDangerGroup = createElement("div", {
    className: "sidebar-account-menu-group sidebar-account-menu-group--danger",
    attrs: {
      "data-sidebar-account-menu-group": "session",
    },
  });

  appendChildren(menuDangerGroup, [
    createAccountMenuItem({
      label: "Salir",
      iconName: SIDEBAR_ICONS.logout,
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

/* =========================================================
   FOOTER
========================================================= */

export function createSidebarFooter(user = {}, options = {}) {
  const footer = createElement("footer", {
    className: classNames(SIDEBAR_CLASSES.footer, "sidebar-footer--chatgpt"),
    attrs: {
      [SIDEBAR_ATTRS.footer]: "true",
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

  const open = options.open !== false;
  const state = open ? "open" : "collapsed";

  const sidebar = createElement("aside", {
    className: classNames(
      SIDEBAR_CLASSES.root,
      SIDEBAR_CLASSES.appRoot,
      "sidebar-root--chatgpt",
      open ? SIDEBAR_CLASSES.open : SIDEBAR_CLASSES.collapsed
    ),
    attrs: {
      id: text(options.id, SIDEBAR_ROOT_ID),
      [SIDEBAR_ATTRS.root]: "true",
      "aria-label": text(options.ariaLabel, "Panel lateral"),
      "aria-hidden": "false",
      "data-sidebar-state": state,
    },
    dataset: {
      open: open ? "true" : "false",
      version: SIDEBAR_TEMPLATE_VERSION,
    },
  });

  appendChildren(sidebar, [
    createElement("div", {
      className: "sidebar-inner",
      attrs: {
        "data-sidebar-inner": "true",
      },
    }),
  ]);

  const inner = sidebar.querySelector?.("[data-sidebar-inner='true']") || sidebar;

  appendChildren(inner, [
    createSidebarHeader({
      brandLabel: options.brandLabel,
      brandHref: options.brandHref,
      open,
    }),
    createSidebarNav(options.items),
    createSidebarFooter(options.user, {
      accountLinks: options.accountLinks,
    }),
  ]);

  return sidebar;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarTemplateSnapshot() {
  return {
    version: SIDEBAR_TEMPLATE_VERSION,

    icons: Object.keys(ICON_PATHS),

    brandLogo: {
      white: BRAND_LOGOS.white,
      black: BRAND_LOGOS.black,
    },

    roleLabels: {
      admin: ROLE_LABEL_ADMIN,
      user: ROLE_LABEL_STANDARD,
      fallback: ROLE_LABEL_STANDARD,
    },

    policy: {
      buildsDom: true,
      stableCssStructure: true,
      noHtmlString: true,

      logoOnlyHeaderBrand: true,
      companyLogoImage: true,
      usesCanonicalSpaLogos: true,
      faviconWhiteLogo: true,
      faviconBlackLogo: true,
      noSvgBrandLogo: true,
      noBrandSvgFallback: true,
      noImageLogoOverlap: true,
      textOnlyHeaderBrand: false,
      panelCollapseIcon: true,

      avatarMarkupOnly: true,
      avatarSourceComesFromUserViewModel: true,
      avatarImageWithInitialsFallback: true,
      avatarInternalOrHttpsOnly: true,

      navItemRoleMetadataOnly: true,
      adminOnlyMetadataFromInput: true,

      accountDropdownLinksUserScopedWhenSlugExists: true,
      accountDropdownCanonicalFallbackWithoutSlug: true,

      standardRoleLabelForNonAdmin: true,
      adminRoleLabelPreserved: true,

      legacyBrandClassesKept: true,

      safeInternalHref: true,
      safeAssetSrc: true,
      noSensitiveHrefInDom: true,
      blocksLegacyRoutesViaConstantsAndCoreConfig: true,
      noLocalBlockedRouteList: true,

      noNavigation: true,
      noSessionRead: true,
      noRouteRead: true,
      noLogout: true,

      noAuth: true,
      noRouter: true,
      noCore: true,
      noStore: true,
      noHttp: true,
      noToast: true,

      dropdownMarkupOnly: true,
      noDropdownBehavior: true,

      noPermissionDecision: true,
      noVisibilityDecision: true,
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

  getSidebarTemplateSnapshot,
  getSnapshot: getSidebarTemplateSnapshot,
  getDebugSnapshot: getSidebarTemplateSnapshot,
};

export default SidebarTemplate;
