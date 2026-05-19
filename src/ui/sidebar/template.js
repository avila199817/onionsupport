/* =========================================================
   Onion Support - Sidebar Template
   Archivo: /src/ui/sidebar/template.js

   Responsabilidad:
   - Construir el DOM del sidebar.
   - Exponer estructura estable para CSS SaaS.
   - Preparar header, navegación y cuenta estilo ChatGPT.
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

export const SIDEBAR_TEMPLATE_VERSION = "sidebar.template.v4";

/* =========================================================
   ICON PATHS
========================================================= */

const ICON_PATHS = Object.freeze({
  brand:
    "M12 2.5c4.3 0 7.5 3.1 7.5 7.3 0 5.1-4.5 9.5-7.5 11.7-3-2.2-7.5-6.6-7.5-11.7C4.5 5.6 7.7 2.5 12 2.5Zm0 4.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z",

  menu:
    "M4 6h16 M4 12h16 M4 18h16",

  chevron:
    "m9 18 6-6-6-6",

  home:
    "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z",

  incidencias:
    "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",

  facturas:
    "M6 2h9l5 5v15H6z M14 2v6h6 M8.5 12h7 M8.5 16h5",

  clientes:
    "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M8 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 21c0-3.3 2.8-6 6.2-6s6.2 2.7 6.2 6 M13.5 15.2c.8-.3 1.7-.5 2.7-.5 3 0 5.3 2.3 5.3 5.3",

  usuarios:
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c0-4 4-7 8-7s8 3 8 7",

  cuenta:
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5.5 21a6.5 6.5 0 0 1 13 0",

  ajustes:
    "M4 6h10 M4 12h6 M4 18h12 M16 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M18 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",

  servidor:
    "M4 5h16v5H4z M4 14h16v5H4z M8 7.5h.01 M8 16.5h.01 M11 7.5h5 M11 16.5h5",

  help:
    "M9.1 9a3 3 0 1 1 5.8 1c-.4 1.4-1.9 2-2.6 2.7-.5.5-.7 1-.7 1.8 M12 18h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",

  logout:
    "M16 17l5-5-5-5 M21 12H9 M4 4h5v16H4z",
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

function safeInternalHref(value = "", fallback = "/") {
  const href = text(value, fallback);

  if (!href.startsWith("/")) return fallback;
  if (href.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return fallback;
  if (/[\r\n\t\\]/.test(href)) return fallback;

  return href.replace(/\/{2,}/g, "/") || fallback;
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

function createSurface(className = "", attrs = {}) {
  return createElement("span", {
    className,
    attrs: {
      "aria-hidden": "true",
      ...attrs,
    },
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
      user.fullName,
    "Usuario"
  );

  const initials = text(user.initials, "U")
    .slice(0, 2)
    .toUpperCase();

  const avatarUrl = text(
    user.avatarUrl ||
      user.avatar ||
      user.photoUrl ||
      user.picture ||
      "",
    ""
  );

  return {
    name,
    initials,
    avatarUrl,
    roleLabel: text(user.roleLabel, "Usuario"),
    email: text(user.email, ""),
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
  path.setAttribute("stroke-width", "1.75");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

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
    className: classNames(SIDEBAR_CLASSES.header, "sidebar-header--chatgpt"),
    attrs: {
      [SIDEBAR_ATTRS.header]: "true",
      "data-sidebar-section": "header",
    },
  });

  const brand = createElement("a", {
    className: classNames(SIDEBAR_CLASSES.brand, "sidebar-brand--chatgpt"),
    attrs: {
      href: brandHref,

      [SIDEBAR_ATTRS.spa]: "",
      [SIDEBAR_ATTRS.brand]: "true",
      [SIDEBAR_ATTRS.link]: "true",
      [SIDEBAR_ATTRS.route]: brandHref,

      "aria-label": brandLabel,
      "data-sidebar-action": "brand",
    },
  });

  const brandContent = createElement("span", {
    className: "sidebar-brand-content",
  });

  appendChildren(brandContent, [
    createSpan(SIDEBAR_CLASSES.brandText, brandLabel),
  ]);

  appendChildren(brand, [
    createIconSlot(
      SIDEBAR_CLASSES.brandIcon,
      SIDEBAR_ICONS.brand,
      "sidebar-brand-svg"
    ),
    brandContent,
  ]);

  const toggle = createElement("button", {
    className: classNames(SIDEBAR_CLASSES.toggle, "sidebar-toggle--chatgpt"),
    attrs: {
      type: "button",
      [SIDEBAR_ATTRS.toggle]: "true",
      "aria-label": open ? "Cerrar barra lateral" : "Abrir barra lateral",
      "aria-expanded": open ? "true" : "false",
      "data-sidebar-action": "toggle",
      "data-state": open ? "open" : "collapsed",
      "data-tooltip": open ? "Cerrar barra lateral" : "Abrir barra lateral",
      title: open ? "Cerrar barra lateral" : "Abrir barra lateral",
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

    "data-sidebar-dropdown-item": "true",
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
      "data-sidebar-dropdown": "account",
    },
  });

  const trigger = createElement("button", {
    className: classNames(SIDEBAR_CLASSES.user, "sidebar-account-trigger"),
    attrs: {
      type: "button",
      [SIDEBAR_ATTRS.user]: "true",
      "data-sidebar-user-card": "true",
      "data-sidebar-dropdown-trigger": "account",
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
      "data-sidebar-dropdown-menu": "account",
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
    createSpan(
      "sidebar-account-menu-user-meta",
      normalizedUser.email || normalizedUser.roleLabel
    ),
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
      href: "/cuenta",
    }),
    createAccountMenuItem({
      label: "Ajustes",
      iconName: SIDEBAR_ICONS.ajustes,
      action: "navigate",
      href: "/ajustes",
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

    icons: Object.keys(ICON_PATHS),

    policy: {
      buildsDom: true,
      stableCssStructure: true,
      noHtmlString: true,

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

  getSidebarTemplateSnapshot,
  getSnapshot: getSidebarTemplateSnapshot,
  getDebugSnapshot: getSidebarTemplateSnapshot,
};

export default SidebarTemplate;
