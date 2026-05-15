/* =========================================================
   Onion SPA - Shared Password Field Index
   Archivo: src/shared/password-field/index.js

   ONION SUPPORT · SHARED PASSWORD FIELD FACADE
   EXPORT CONTRACT · NO SIDE EFFECTS · 16/10

   Responsabilidades:
   - Centralizar exports públicos del sistema password-field.
   - Exponer renderer reutilizable de campos password.
   - Exponer binder DOM para eye / caps lock.
   - Simplificar imports desde login / reset / settings / cuenta.
   - Evitar imports profundos repetidos.
   - Mantener compatibilidad con named imports y default import.
   - No tocar DOM al importar.
   - No registrar listeners al importar.
   - No depender de AppCore.
   - No usar CSS inline.
   - No inyectar estilos.
========================================================= */

import {
  renderPasswordField,
  getEyeIcon,
  getEyeOffIcon,
  getCapsIcon,
} from "./password-field.template.js";

import {
  bindPasswordField,
  bindPasswordFieldsInScope,
} from "./password-field.dom.js";

/* =========================================================
   VERSION
========================================================= */

export const PASSWORD_FIELD_VERSION =
  "16.0.0-shared-facade";

/* =========================================================
   NAMED EXPORTS
========================================================= */

export {
  renderPasswordField,
  getEyeIcon,
  getEyeOffIcon,
  getCapsIcon,

  bindPasswordField,
  bindPasswordFieldsInScope,
};

/* =========================================================
   COMPAT ALIASES
========================================================= */

export const render =
  renderPasswordField;

export const bind =
  bindPasswordField;

export const bindAll =
  bindPasswordFieldsInScope;

/* =========================================================
   PUBLIC API OBJECT
========================================================= */

export const PasswordField =
  Object.freeze({
    version:
      PASSWORD_FIELD_VERSION,

    render:
      renderPasswordField,

    renderPasswordField,

    getEyeIcon,
    getEyeOffIcon,
    getCapsIcon,

    bind:
      bindPasswordField,

    bindPasswordField,

    bindAll:
      bindPasswordFieldsInScope,

    bindPasswordFieldsInScope,
  });

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default PasswordField;
