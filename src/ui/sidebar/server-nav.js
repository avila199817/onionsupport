/* =========================================================
   Onion SPA - Sidebar Server Nav
   Archivo: src/ui/sidebar/server-nav.js

   Responsabilidades:
   - sincronizar el item de navegación del servidor ya renderizado en el template
   - mantener visibilidad robusta según rol admin
   - evitar duplicados del enlace
   - no inyectar HTML dinámico cuando el item ya vive en el sidebar
========================================================= */

import {
  SERVER_NAV_ID,
  SERVER_ROUTE,
} from "./constants.js";

import { getElements } from "./dom.js";

/* =========================================================
   HELPERS
========================================================= */
function resolveServerLink(sidebarMenu) {
  if (!sidebarMenu) return null;

  const byId = document.getElementById(SERVER_NAV_ID);
  if (byId) return byId;

  return sidebarMenu.querySelector(`a[href="${SERVER_ROUTE}"]`);
}

/* =========================================================
   SYNC
========================================================= */
export function ensureServerNavItem(AppCore, isAdminFn) {
  const { sidebarMenu } = getElements(AppCore);
  if (!sidebarMenu) return null;

  const admin =
    typeof isAdminFn === "function"
      ? Boolean(isAdminFn(AppCore))
      : false;

  const serverLink = resolveServerLink(sidebarMenu);
  if (!serverLink) return null;

  if (!serverLink.id) {
    serverLink.id = SERVER_NAV_ID;
  }

  serverLink.hidden = !admin;
  serverLink.setAttribute("aria-hidden", String(!admin));
  serverLink.style.display = admin ? "" : "none";
  serverLink.removeAttribute("title");

  return serverLink;
}
