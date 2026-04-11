/* =========================================================
   Onion SPA - Sidebar Dropdown
   Archivo: src/ui/sidebar/dropdown.js

   Responsabilidades:
   - gestionar apertura / cierre del dropdown de usuario
   - sincronizar estado visual del dropdown
   - sincronizar atributos a11y
   - evitar warnings de aria-hidden al cerrar
   - abrir sidebar automáticamente antes de abrir dropdown
========================================================= */

import { getElements, blurIfInside, sanitizeFooterTooltipState, isShellHidden } from "./dom.js";

/* =========================================================
   A11Y
========================================================= */
export function syncDropdownA11y(AppCore, open) {
  const { userToggle, userDropdown } = getElements(AppCore);

  if (userToggle) {
    userToggle.setAttribute("aria-haspopup", "menu");
    userToggle.setAttribute("aria-expanded", String(open));
    userToggle.removeAttribute("data-tooltip");
    userToggle.removeAttribute("title");
  }

  if (userDropdown) {
    userDropdown.setAttribute("aria-hidden", String(!open));
    userDropdown.removeAttribute("data-tooltip");
    userDropdown.removeAttribute("title");
  }

  sanitizeFooterTooltipState(AppCore);
}

/* =========================================================
   INTERNAL STATE WRITE
========================================================= */
export function setDropdownOpen(AppCore, localState, value) {
  const { userDropdown, userToggle } = getElements(AppCore);

  localState.dropdownOpen = Boolean(value);

  if (!userDropdown) {
    syncDropdownA11y(AppCore, localState.dropdownOpen);
    return;
  }

  if (!localState.dropdownOpen) {
    blurIfInside(userDropdown);
  }

  userDropdown.classList.toggle("open", localState.dropdownOpen);
  userDropdown.classList.toggle("active", localState.dropdownOpen);
  userDropdown.hidden = !localState.dropdownOpen;

  if (userToggle) {
    userToggle.classList.toggle("active", localState.dropdownOpen);
    userToggle.removeAttribute("data-tooltip");
    userToggle.removeAttribute("title");
  }

  userDropdown.removeAttribute("data-tooltip");
  userDropdown.removeAttribute("title");

  syncDropdownA11y(AppCore, localState.dropdownOpen);

  AppCore?.events?.emit?.("sidebar:dropdown:change", {
    open: localState.dropdownOpen,
  });
}

/* =========================================================
   PUBLIC ACTIONS
========================================================= */
export function openDropdown(AppCore, localState, ensureSidebarOpenForUserMenu) {
  if (isShellHidden(AppCore)) return;

  if (typeof ensureSidebarOpenForUserMenu === "function") {
    ensureSidebarOpenForUserMenu();
  }

  setDropdownOpen(AppCore, localState, true);
}

export function closeDropdown(AppCore, localState) {
  setDropdownOpen(AppCore, localState, false);
}

export function toggleDropdown(AppCore, localState, ensureSidebarOpenForUserMenu) {
  if (isShellHidden(AppCore)) {
    closeDropdown(AppCore, localState);
    return;
  }

  const sidebarWasForcedOpen =
    typeof ensureSidebarOpenForUserMenu === "function"
      ? Boolean(ensureSidebarOpenForUserMenu())
      : false;

  if (sidebarWasForcedOpen) {
    setDropdownOpen(AppCore, localState, true);
    return;
  }

  setDropdownOpen(AppCore, localState, !localState.dropdownOpen);
}
