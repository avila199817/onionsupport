/* =========================================================
   Onion SPA - Sidebar Server Nav
   Archivo: src/ui/sidebar/server-nav.js

   Responsabilidades:
   - generar el item dinámico de navegación del servidor
   - inyectar el acceso admin a estado del servidor
   - mantener visibilidad robusta según rol
   - evitar duplicados del enlace
========================================================= */

import {
  SERVER_NAV_ID,
  SERVER_ROUTE,
} from "./constants.js";

import { getElements } from "./dom.js";

/* =========================================================
   TEMPLATE
========================================================= */
export function getServerNavMarkup() {
  return `
    <a
      href="${SERVER_ROUTE}"
      data-spa
      class="menu-item"
      id="${SERVER_NAV_ID}"
      data-tooltip="Estado del servidor"
      data-role="admin"
      aria-label="Estado del servidor"
    >
      <span aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="16" height="6" rx="2" stroke="currentColor" stroke-width="1.6"/>
          <rect x="4" y="14" width="16" height="6" rx="2" stroke="currentColor" stroke-width="1.6"/>
          <circle cx="8" cy="7" r="1" fill="currentColor"/>
          <circle cx="8" cy="17" r="1" fill="currentColor"/>
          <path d="M12 7h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M12 17h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </span>
      <span data-i18n="Servidor">Servidor</span>
    </a>
  `;
}

/* =========================================================
   INSERT / SYNC
========================================================= */
export function ensureServerNavItem(AppCore, isAdminFn) {
  const { sidebarMenu } = getElements(AppCore);
  if (!sidebarMenu) return null;

  const admin =
    typeof isAdminFn === "function"
      ? Boolean(isAdminFn(AppCore))
      : false;

  let serverLink = document.getElementById(SERVER_NAV_ID);

  if (serverLink) {
    serverLink.hidden = !admin;
    serverLink.setAttribute("aria-hidden", String(!admin));
    serverLink.style.display = admin ? "" : "none";
    serverLink.removeAttribute("title");
    return serverLink;
  }

  const facturasLink = sidebarMenu.querySelector('a[href="/facturas"]');
  const usuariosLink = sidebarMenu.querySelector('a[href="/usuarios"]');

  if (usuariosLink) {
    usuariosLink.insertAdjacentHTML("beforebegin", getServerNavMarkup());
  } else if (facturasLink) {
    facturasLink.insertAdjacentHTML("afterend", getServerNavMarkup());
  } else {
    sidebarMenu.insertAdjacentHTML("beforeend", getServerNavMarkup());
  }

  serverLink = document.getElementById(SERVER_NAV_ID);

  if (serverLink) {
    serverLink.hidden = !admin;
    serverLink.setAttribute("aria-hidden", String(!admin));
    serverLink.style.display = admin ? "" : "none";
    serverLink.removeAttribute("title");
  }

  return serverLink || null;
}
