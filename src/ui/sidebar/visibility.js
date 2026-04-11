/* =========================================================
   Onion SPA - Sidebar Visibility
   Archivo: src/ui/sidebar/visibility.js

   Responsabilidades:
   - aplicar visibilidad por rol dentro del sidebar
   - mostrar / ocultar elementos admin
   - sincronizar aria-hidden y display
   - asegurar el item dinámico de servidor
   - sanear tooltips tras cambios de visibilidad
========================================================= */

import { getElements, sanitizeFooterTooltipState } from "./dom.js";

export function applyRoleVisibility(AppCore, ensureServerNavItem, isAdminFn) {
  const admin =
    typeof isAdminFn === "function"
      ? Boolean(isAdminFn(AppCore))
      : false;

  const { sidebar } = getElements(AppCore);

  if (typeof ensureServerNavItem === "function") {
    ensureServerNavItem(AppCore, isAdminFn);
  }

  if (!sidebar) return;

  sidebar.querySelectorAll('[data-role="admin"]').forEach((element) => {
    element.hidden = !admin;
    element.setAttribute("aria-hidden", String(!admin));
    element.style.display = admin ? "" : "none";
    element.removeAttribute("title");
  });

  sanitizeFooterTooltipState(AppCore);

  AppCore?.events?.emit?.("sidebar:roles:applied", {
    isAdmin: admin,
  });
}
