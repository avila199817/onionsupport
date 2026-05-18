/* =========================================================
   Onion Support - Sidebar Dropdown
   Archivo: /src/ui/sidebar/dropdown.js

   Responsabilidad:
   - Compatibilidad mínima mientras se limpian imports antiguos.
   - El sidebar actual NO tiene dropdown de usuario.
   - No crear DOM.
   - No leer DOM.
   - No tocar AppCore.
   - No emitir eventos.
   - No usar timers.
   - No gestionar focus.
   - No inventar estados.
   - No duplicar lógica de sidebar.
========================================================= */

export const SIDEBAR_DROPDOWN_VERSION = "sidebar.dropdown.disabled.v1";

const DROPDOWN_DISABLED_REASON = "sidebar-dropdown-disabled";

/* =========================================================
   RESULT
========================================================= */

function disabledResult() {
  return {
    ok: true,
    enabled: false,
    open: false,
    reason: DROPDOWN_DISABLED_REASON,
  };
}

/* =========================================================
   API NO-OP
========================================================= */

export function syncDropdownA11y() {
  return disabledResult();
}

export function setDropdownOpen() {
  return false;
}

export function openDropdown() {
  return false;
}

export function closeDropdown() {
  return true;
}

export function toggleDropdown() {
  return false;
}

export function repairDropdown() {
  return disabledResult();
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getDropdownSnapshot() {
  return {
    version: SIDEBAR_DROPDOWN_VERSION,
    enabled: false,
    open: false,
    reason: DROPDOWN_DISABLED_REASON,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_DROPDOWN_VERSION,

  syncDropdownA11y,
  setDropdownOpen,

  openDropdown,
  closeDropdown,
  toggleDropdown,

  repairDropdown,
  getDropdownSnapshot,
};
