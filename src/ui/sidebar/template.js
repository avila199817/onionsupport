/* =========================================================
   Onion Support - Sidebar Template
   Archivo: /src/ui/sidebar/template.js

   Responsabilidad:
   - Construir el DOM del sidebar.
   - Exponer estructura estable para CSS SaaS.
   - Recibir datos ya normalizados desde index.js/user.js.
   - No navegar.
   - No leer sesión.
   - No leer rutas.
   - No hacer logout.
   - No depender de Auth / Router / Core / Store.
   - No usar HTML string.
   - No duplicar lógica de negocio.
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

export const SIDEBAR_TEMPLATE_VERSION = "sidebar.template.v1";

/* =========================================================
   ICONS
========================================================= */

const ICON_PATHS = Object.freeze({
  brand:
    "M12 2.5c4.3 0 7.5 3.1 7.5 7.3 0 5.1-4.5 9.5-7.5 11.7-3-2.2-7.5-6.6-7.5-11.7C4.5 5.6 7.7 2.5 12 2.5Zm0 4.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z",

  menu:
    "M4 6h16 M4 12h16 M4 18h16",

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

function roleText(value = "") {
  if (Array.isArray(value)) {
    return value
      .map((item) => text(item, ""))
      .filter(Boolean)
      .join(" ");
  }

  return text(value, "");
}

/* =========================================================
   NORMALIZE
========================================================= */

function normalizeItem(item = {}) {
  const href = text(item.href || item.path, "/");
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
  return {
    name: text(user.displayName || user.name, "Usuario"),
    initials: text(user.initials, "U").slice(0, 2).toUpperCase(),
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

  const icon = createSidebarIcon(iconName, svgClass);

  if (icon) {
    slot.appendChild(icon);
  }

  return slot;
}

/* =========================================================
   HEADER
========================================================= */

export function createSidebarHeader(options = {}) {
  const brandLabel = text(options.brandLabel, SIDEBAR_BRAND_LABEL);
  const brandHref = text(options.brandHref, SIDEBAR_BRAND_HREF);
  const open = options.open !== false;

  const header = createElement("header", {
    className: SIDEBAR_CLASSES.header,
    attrs: {
      [SIDEBAR_ATTRS.header]: "true",
    },
  });

  const brand = createElement("a", {
    className: SIDEBAR_CLASSES.brand,
    attrs: {
      href: brandHref,
      [SIDEBAR_ATTRS.spa]: "",
      [SIDEBAR_ATTRS.brand]: "true",
      [SIDEBAR_ATTRS.link]: "true",
      "aria-label": brandLabel,
    },
  });

  brand.append(
    createIconSlot(
      SIDEBAR_CLASSES.brandIcon,
      SIDEBAR_ICONS.brand,
      "sidebar-brand-svg"
    ),
    createElement("span", {
      className: SIDEBAR_CLASSES.brandText,
      textContent: brandLabel,
    })
  );

  const toggle = createElement("button", {
    className: SIDEBAR_CLASSES.toggle,
    attrs: {
      type: "button",
      [SIDEBAR_ATTRS.toggle]: "true",
      "aria-label": open ? "Cerrar navegación" : "Abrir navegación",
      "aria-expanded": open ? "true" : "false",
    },
  });

  const toggleIcon = createSidebarIcon(SIDEBAR_ICONS.menu, "sidebar-toggle-svg");

  if (toggleIcon) {
    toggle.appendChild(toggleIcon);
  }

  header.append(brand, toggle);

  return header;
}

/* =========================================================
   NAV
========================================================= */

export function createSidebarNav(items = []) {
  const nav = createElement("nav", {
    className: SIDEBAR_CLASSES.nav,
    attrs: {
      [SIDEBAR_ATTRS.nav]: "true",
      "aria-label": "Navegación principal",
    },
  });

  const list = createElement("ul", {
    className: SIDEBAR_CLASSES.list,
  });

  for (const rawItem of Array.isArray(items) ? items : []) {
    const item = normalizeItem(rawItem);

    if (!item.hidden) {
      list.appendChild(createSidebarNavItem(item));
    }
  }

  nav.appendChild(list);

  return nav;
}

export function createSidebarNavItem(rawItem = {}) {
  const item = normalizeItem(rawItem);

  const li = createElement("li", {
    className: SIDEBAR_CLASSES.item,
  });

  const link = createElement("a", {
    className: classNames(
      SIDEBAR_CLASSES.link,
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

      "data-admin-only": item.adminOnly ? "true" : null,
      "data-required-role": item.requiredRole || null,
      "data-required-roles": item.requiredRoles || null,

      tabindex: item.disabled ? "-1" : null,
    }),
  });

  link.append(
    createIconSlot(
      SIDEBAR_CLASSES.linkIcon,
      item.icon,
      "sidebar-link-svg"
    ),
    createElement("span", {
      className: SIDEBAR_CLASSES.linkLabel,
      textContent: item.label,
    })
  );

  if (item.badge) {
    link.appendChild(
      createElement("span", {
        className: SIDEBAR_CLASSES.linkBadge,
        textContent: item.badge,
      })
    );
  }

  li.appendChild(link);

  return li;
}

/* =========================================================
   FOOTER
========================================================= */

export function createSidebarFooter(user = {}) {
  const normalizedUser = normalizeUser(user);

  const footer = createElement("footer", {
    className: SIDEBAR_CLASSES.footer,
    attrs: {
      [SIDEBAR_ATTRS.footer]: "true",
    },
  });

  const userBox = createElement("div", {
    className: SIDEBAR_CLASSES.user,
    attrs: {
      [SIDEBAR_ATTRS.user]: "true",
    },
  });

  const avatar = createElement("div", {
    className: SIDEBAR_CLASSES.userAvatar,
    textContent: normalizedUser.initials,
    attrs: {
      "aria-hidden": "true",
    },
  });

  const info = createElement("div", {
    className: SIDEBAR_CLASSES.userInfo,
  });

  info.append(
    createElement("div", {
      className: SIDEBAR_CLASSES.userName,
      textContent: normalizedUser.name,
    }),
    createElement("div", {
      className: SIDEBAR_CLASSES.userRole,
      textContent: normalizedUser.roleLabel,
    })
  );

  userBox.append(avatar, info);

  const logout = createElement("button", {
    className: SIDEBAR_CLASSES.logout,
    attrs: {
      type: "button",
      [SIDEBAR_ATTRS.logout]: "true",
      "aria-label": "Cerrar sesión",
    },
  });

  logout.append(
    createIconSlot(
      SIDEBAR_CLASSES.logoutIcon,
      SIDEBAR_ICONS.logout,
      "sidebar-logout-svg"
    ),
    createElement("span", {
      className: SIDEBAR_CLASSES.logoutLabel,
      textContent: "Salir",
    })
  );

  footer.append(userBox, logout);

  return footer;
}

/* =========================================================
   ROOT
========================================================= */

export function createSidebarTemplate(options = {}) {
  if (!isBrowser()) return null;

  const open = options.open !== false;

  const sidebar = createElement("aside", {
    className: classNames(
      SIDEBAR_CLASSES.root,
      SIDEBAR_CLASSES.appRoot,
      open ? SIDEBAR_CLASSES.open : SIDEBAR_CLASSES.collapsed
    ),
    attrs: {
      id: text(options.id, SIDEBAR_ROOT_ID),
      [SIDEBAR_ATTRS.root]: "true",
      "aria-label": text(options.ariaLabel, "Panel lateral"),
      "aria-hidden": "false",
    },
    dataset: {
      open: open ? "true" : "false",
      version: SIDEBAR_TEMPLATE_VERSION,
    },
  });

  sidebar.append(
    createSidebarHeader({
      brandLabel: options.brandLabel,
      brandHref: options.brandHref,
      open,
    }),
    createSidebarNav(options.items),
    createSidebarFooter(options.user)
  );

  return sidebar;
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
};

export default SidebarTemplate;
