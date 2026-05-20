/* =========================================================
   Onion Support - Sidebar Template
   Archivo: /src/ui/sidebar/template.js

   Responsabilidad:
   - Construir el DOM del sidebar.
   - Exponer estructura estable para CSS SaaS.
   - Preparar header, navegación y cuenta estilo ChatGPT.
   - Header logo-only: sin texto visible de marca.
   - Logo white para tema dark / logo black para tema light vía CSS.
   - Fallback SVG visible si los assets no cargan o el CSS oculta imágenes.
   - Preparar markup del dropdown de cuenta.
   - Recibir datos ya normalizados desde index.js/user.js.
   - No navegar.
   - No leer sesión.
   - No leer rutas.
   - No hacer logout.
   - No decidir visibilidad.
   - No decidir permisos.
   - No abrir/cerrar dropdown.
   - No depender de Auth / Router / Core / Store.
   - No usar HTML string.
   - No duplicar lógica de negocio.
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
  normalizeSidebarIcon,
} from "./constants.js";

import {
  createElement,
  isBrowser,
  text,
} from "./dom.js";

export const SIDEBAR_TEMPLATE_VERSION = "sidebar.template.v8";

export const SIDEBAR_LOGO_ASSETS = Object.freeze({
  dark: "/src/media/img/favicon_white_circle.png?v=6",
  light: "/src/media/img/favicon_black_circle.png?v=6",
});

/* =========================================================
   ICON PATHS
========================================================= */

const ICON_PATHS = Object.freeze({
  brand:
    "M12 2.75 20 6.25v5.55c0 4.75-3.15 8.35-8 9.45-4.85-1.1-8-4.7-8-9.45V6.25L12 2.75Z M12 7.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z",

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
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
    String(value || "")
  );
}

function safeInternalHref(value = "", fallback = "/") {
  const href = text(value, fallback);

  if (!href.startsWith("/")) return fallback;
  if (href.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return fallback;
  if (/[\r\n\t\\]/.test(href)) return fallback;
  if (hasSensitiveQuery(href)) return fallback;

  return href.replace(/\/{2,}/g, "/") || fallback;
}

function safeAssetSrc(value = "", fallback = "") {
  const src = text(value, fallback);

  if (!src.startsWith("/")) return fallback;
  if (src.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return fallback;
  if (/[\r\n\t\\]/.test(src)) return fallback;
  if (hasSensitiveQuery(src)) return fallback;

  return src.replace(/\/{2,}/g, "/") || fallback;
}

function safeImageSrc(value = "") {
  const src = text(value, "");

  if (!src) return "";

  if (src.startsWith("/")) {
    return safeAssetSrc(src, "");
  }

  if (/^https:\/\//i.test(src) && !hasSensitiveQuery(src)) {
    try {
      const url = new URL(src);
      return url.href;
    } catch {
      return "";
    }
  }

  return "";
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

function createSpan(className = "", textContent = "", attrs = {}) {
  return createElement("span", {
    className,
    textContent,
    attrs,
  });
}

/* =========================================================
   NORMALIZE
========================================================= */

function normalizeItem(item = {}) {
  const href = safeInternalHref(item.href || item.path, "/");
  const label = text(item.label || item.title || item.name, href);
  const icon = normalizeSidebarIcon(item.icon || SIDEBAR_ICONS.home);

  return {
    href,
    label,
    icon,

    active: item.active === true,
    disabled: item.disabled === true,
    hidden: item.hidden === true,
    adminOnly: item.adminOnly === true,

    badge: text(item.badge, ""),
    requiredRole: text(item.requiredRole, ""),
    requiredRoles: roleText(item.requiredRoles),
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

  const initials = text(user.initials, "U")
    .slice(0, 2)
    .toUpperCase();

  const avatarUrl = safeImageSrc(
    user.avatarUrl ||
      user.avatar ||
      user.photoUrl ||
      user.picture ||
      ""
  );

  return {
    name,
    initials,
    avatarUrl,
    roleLabel: text(user.roleLabel, "Usuario"),
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

function createSidebarBrandFallbackLogo() {
  const fallback = createElement("span", {
    className: "sidebar-brand-logo-fallback",
    attrs: {
      "aria-hidden": "true",
      "data-sidebar-brand-logo-fallback": "true",
    },
  });

  appendChildren(
    fallback,
    createSidebarIcon("brand", "sidebar-brand-logo-fallback-svg")
  );

  return fallback;
}

export function createSidebarBrandLogo(options = {}) {
  const darkSrc = safeAssetSrc(
    options.darkSrc || options.logoDarkSrc,
    SIDEBAR_LOGO_ASSETS.dark
  );

  const lightSrc = safeAssetSrc(
    options.lightSrc || options.logoLightSrc,
    SIDEBAR_LOGO_ASSETS.light
  );

  const logo = createElement("span", {
    className: "sidebar-brand-logo",
    attrs: {
      "aria-hidden": "true",
      "data-sidebar-brand-logo": "true",
    },
  });

  const fallbackLogo = createSidebarBrandFallbackLogo();

  const darkLogo = createElement("img", {
    className:
      "sidebar-brand-logo-img sidebar-brand-logo-img--theme-dark sidebar-brand-logo-img--white",
    attrs: {
      src: darkSrc,
      alt: "",
      width: "28",
      height: "28",
      loading: "eager",
      decoding: "async",
      draggable: "false",
      "data-sidebar-logo-theme": "dark",
      "data-sidebar-logo-asset": "white",
    },
  });

  const lightLogo = createElement("img", {
    className:
      "sidebar-brand-logo-img sidebar-brand-logo-img--theme-light sidebar-brand-logo-img--black",
    attrs: {
      src: lightSrc,
      alt: "",
      width: "28",
      height: "28",
      loading: "eager",
      decoding: "async",
      draggable: "false",
      "data-sidebar-logo-theme": "light",
      "data-sidebar-logo-asset": "black",
    },
  });

  appendChildren(logo, [
    fallbackLogo,
    darkLogo,
    lightLogo,
  ]);

  return logo;
}

/* =========================================================
   AVATAR
========================================================= */

function createUserAvatar(user = {}, className = SIDEBAR_CLASSES.userAvatar) {
  const normalizedUser = normalizeUser(user);

  const avatar = createElement("span", {
    className: classNames(
      className,
      normalizedUser.avatarUrl ? "has-image" : "is-fallback"
    ),
    attrs: {
      "aria-hidden": "true",
      "data-sidebar-user-avatar": "true",
      "data-fallback": normalizedUser.avatarUrl ? "false" : "true",
    },
  });

  if (normalizedUser.avatarUrl) {
    appendChildren(
      avatar,
      createElement("img", {
        className: "sidebar-user-avatar-img",
        attrs: {
          src: normalizedUser.avatarUrl,
          alt: "",
          loading: "lazy",
          decoding: "async",
          referrerpolicy: "no-referrer",
          draggable: "false",
          "data-sidebar-avatar-img": "true",
        },
      })
    );
  }

  appendChildren(
    avatar,
    createSpan("sidebar-user-avatar-fallback", normalizedUser.initials)
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

  appendChildren(
    brandContent,
    createSidebarBrandLogo({
      logoDarkSrc: options.logoDarkSrc,
      logoLightSrc: options.logoLightSrc,
    })
  );

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

function createAccountDropdown(user = {}) {
  const normalizedUser = normalizeUser(user);
  const menuId = `${SIDEBAR_ROOT_ID}-account-menu`;

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
    },
  });

  const info = createElement("span", {
    className: SIDEBAR_CLASSES.userInfo,
  });

  appendChildren(info, [
    createElement("span", {
      className: SIDEBAR_CLASSES.userName,
      textContent: normalizedUser.name,
    }),
    createElement("span", {
      className: SIDEBAR_CLASSES.userRole,
      textContent: normalizedUser.roleLabel,
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
    createSpan("sidebar-account-menu-user-name", normalizedUser.name),
    createSpan("sidebar-account-menu-user-meta", normalizedUser.roleLabel),
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
      href: CUENTA_ROUTE,
    }),
    createAccountMenuItem({
      label: "Ajustes",
      iconName: SIDEBAR_ICONS.ajustes,
      action: "navigate",
      href: AJUSTES_ROUTE,
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

export function createSidebarFooter(user = {}) {
  const footer = createElement("footer", {
    className: classNames(SIDEBAR_CLASSES.footer, "sidebar-footer--chatgpt"),
    attrs: {
      [SIDEBAR_ATTRS.footer]: "true",
      "data-sidebar-section": "footer",
    },
  });

  appendChildren(footer, [
    createAccountDropdown(user),
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
      logoDarkSrc: options.logoDarkSrc,
      logoLightSrc: options.logoLightSrc,
      open,
    }),
    createSidebarNav(options.items),
    createSidebarFooter(options.user),
  ]);

  return sidebar;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarTemplateSnapshot() {
  return {
    version: SIDEBAR_TEMPLATE_VERSION,

    logoAssets: {
      ...SIDEBAR_LOGO_ASSETS,
    },

    icons: Object.keys(ICON_PATHS),

    policy: {
      buildsDom: true,
      stableCssStructure: true,
      noHtmlString: true,

      logoOnlyHeaderBrand: true,
      visibleFallbackLogo: true,
      themeLogoPair: true,
      whiteLogoForDarkTheme: true,
      blackLogoForLightTheme: true,
      textOnlyHeaderBrand: false,
      panelCollapseIcon: true,

      legacyBrandClassesKept: true,

      safeInternalHref: true,
      noSensitiveHrefInDom: true,

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
