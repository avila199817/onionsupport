/* =========================================================
   Onion Support - Sidebar Template
   Archivo: /src/ui/sidebar/template.js

   Responsabilidad:
   - Construir el DOM del sidebar.
   - Exponer una estructura sólida para CSS premium SaaS.
   - No navegar.
   - No leer sesión.
   - No leer rutas.
   - No hacer logout.
   - No depender de Auth / Router / Core / Store.
   - No usar HTML string.
   - No duplicar lógica de negocio.
========================================================= */

export const SIDEBAR_TEMPLATE_VERSION = "sidebar-template.v1";

/* =========================================================
   ICONS
========================================================= */

const ICONS = Object.freeze({
  brand:
    "M12 2.5c4.3 0 7.5 3.1 7.5 7.3 0 5.1-4.5 9.5-7.5 11.7-3-2.2-7.5-6.6-7.5-11.7C4.5 5.6 7.7 2.5 12 2.5Zm0 4.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z",

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

  menu:
    "M4 6h16 M4 12h16 M4 18h16",
});

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function create(tag = "div", options = {}) {
  const node = document.createElement(tag);
  const { className = "", textContent = "", attrs = {}, dataset = {} } = options;

  if (className) node.className = className;
  if (textContent) node.textContent = textContent;

  for (const [key, value] of Object.entries(isObject(attrs) ? attrs : {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }

  for (const [key, value] of Object.entries(isObject(dataset) ? dataset : {})) {
    if (value === false || value === null || value === undefined) continue;
    node.dataset[key] = String(value);
  }

  return node;
}

function append(parent, children = []) {
  for (const child of children) {
    if (child) parent.appendChild(child);
  }

  return parent;
}

/* =========================================================
   ICON
========================================================= */

export function createSidebarIcon(name = "home", className = "sidebar-icon") {
  const iconName = ICONS[name] ? name : "home";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  svg.setAttribute("class", className);
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  path.setAttribute("d", ICONS[iconName]);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.75");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);

  return svg;
}

/* =========================================================
   NORMALIZE
========================================================= */

function normalizeItem(item = {}) {
  const href = text(item.href || item.path, "/");
  const label = text(item.label || item.title || item.name, href);

  return {
    href,
    label,
    icon: text(item.icon, "home"),
    active: item.active === true,
    disabled: item.disabled === true,
    hidden: item.hidden === true,
    badge: text(item.badge, ""),
  };
}

function normalizeUser(user = {}) {
  const name = text(
    user.displayName ||
      user.fullName ||
      user.name ||
      user.nombre ||
      user.username,
    "Usuario"
  );

  return {
    name,
    initials: text(user.initials, makeInitials(name)),
    roleLabel: text(user.roleLabel || user.role, "Usuario"),
  };
}

function makeInitials(name = "") {
  const parts = text(name, "Usuario").split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return text(parts[0], "U").slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

/* =========================================================
   HEADER
========================================================= */

export function createSidebarHeader(options = {}) {
  const brandLabel = text(options.brandLabel, "Onion Support");
  const brandHref = text(options.brandHref, "/");

  const header = create("header", {
    className: "sidebar-header",
    dataset: {
      sidebarHeader: "true",
    },
  });

  const brand = create("a", {
    className: "sidebar-brand",
    attrs: {
      href: brandHref,
      "data-spa": "",
      "data-sidebar-brand": "true",
      "data-sidebar-link": "true",
      "aria-label": brandLabel,
    },
  });

  const brandIcon = create("span", {
    className: "sidebar-brand-icon",
    attrs: {
      "aria-hidden": "true",
    },
  });

  brandIcon.appendChild(createSidebarIcon("brand", "sidebar-brand-svg"));

  const brandText = create("span", {
    className: "sidebar-brand-text",
    textContent: brandLabel,
  });

  brand.append(brandIcon, brandText);

  const toggle = create("button", {
    className: "sidebar-toggle",
    attrs: {
      type: "button",
      "data-sidebar-toggle": "true",
      "aria-label": "Alternar navegación",
      "aria-expanded": options.open === false ? "false" : "true",
    },
  });

  toggle.appendChild(createSidebarIcon("menu", "sidebar-toggle-svg"));

  header.append(brand, toggle);

  return header;
}

/* =========================================================
   NAV
========================================================= */

export function createSidebarNav(items = []) {
  const nav = create("nav", {
    className: "sidebar-nav",
    attrs: {
      "aria-label": "Navegación principal",
    },
    dataset: {
      sidebarNav: "true",
    },
  });

  const list = create("ul", {
    className: "sidebar-list",
  });

  for (const rawItem of Array.isArray(items) ? items : []) {
    const item = normalizeItem(rawItem);

    if (item.hidden) continue;

    list.appendChild(createSidebarNavItem(item));
  }

  nav.appendChild(list);

  return nav;
}

export function createSidebarNavItem(item = {}) {
  const li = create("li", {
    className: "sidebar-item",
  });

  const link = create("a", {
    className: item.active ? "sidebar-link is-active" : "sidebar-link",
    attrs: {
      href: item.href,
      "data-spa": "",
      "data-sidebar-link": "true",
      "data-sidebar-nav-link": "true",
      "data-route": item.href,
      "aria-current": item.active ? "page" : null,
      "aria-disabled": item.disabled ? "true" : null,
      tabindex: item.disabled ? "-1" : null,
    },
    dataset: {
      active: item.active ? "true" : "false",
      disabled: item.disabled ? "true" : "false",
    },
  });

  const icon = create("span", {
    className: "sidebar-link-icon",
    attrs: {
      "aria-hidden": "true",
    },
  });

  icon.appendChild(createSidebarIcon(item.icon, "sidebar-link-svg"));

  const label = create("span", {
    className: "sidebar-link-label",
    textContent: item.label,
  });

  link.append(icon, label);

  if (item.badge) {
    link.appendChild(
      create("span", {
        className: "sidebar-link-badge",
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

  const footer = create("footer", {
    className: "sidebar-footer",
    dataset: {
      sidebarFooter: "true",
    },
  });

  const userBox = create("div", {
    className: "sidebar-user",
    dataset: {
      sidebarUser: "true",
    },
  });

  const avatar = create("div", {
    className: "sidebar-user-avatar",
    textContent: normalizedUser.initials,
    attrs: {
      "aria-hidden": "true",
    },
  });

  const info = create("div", {
    className: "sidebar-user-info",
  });

  const name = create("div", {
    className: "sidebar-user-name",
    textContent: normalizedUser.name,
  });

  const role = create("div", {
    className: "sidebar-user-role",
    textContent: normalizedUser.roleLabel,
  });

  info.append(name, role);
  userBox.append(avatar, info);

  const logout = create("button", {
    className: "sidebar-logout",
    attrs: {
      type: "button",
      "data-sidebar-logout": "true",
      "aria-label": "Cerrar sesión",
    },
  });

  const logoutIcon = create("span", {
    className: "sidebar-logout-icon",
    attrs: {
      "aria-hidden": "true",
    },
  });

  logoutIcon.appendChild(createSidebarIcon("logout", "sidebar-logout-svg"));

  const logoutLabel = create("span", {
    className: "sidebar-logout-label",
    textContent: "Salir",
  });

  logout.append(logoutIcon, logoutLabel);
  footer.append(userBox, logout);

  return footer;
}

/* =========================================================
   ROOT
========================================================= */

export function createSidebarTemplate(options = {}) {
  if (!isBrowser()) return null;

  const open = options.open !== false;

  const sidebar = create("aside", {
    className: open
      ? "sidebar app-sidebar is-open"
      : "sidebar app-sidebar is-collapsed",
    attrs: {
      id: text(options.id, "app-sidebar"),
      "data-sidebar-root": "true",
      "aria-label": "Panel lateral",
    },
    dataset: {
      open: open ? "true" : "false",
      version: SIDEBAR_TEMPLATE_VERSION,
    },
  });

  append(sidebar, [
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
