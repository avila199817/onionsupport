/* =========================================================
   Onion SPA - Shared Password Field Index
   Archivo: src/shared/password-field/index.js

   Responsabilidades:
   - centralizar exports públicos del sistema password-field
   - exponer renderer reutilizable de campos password
   - exponer binder DOM para eye / caps lock
   - simplificar imports desde login / reset / settings
   - evitar imports profundos repetidos
========================================================= */

export {
  renderPasswordField,
  getEyeIcon,
  getEyeOffIcon,
  getCapsIcon,
} from "./password-field.template.js";

export {
  bindPasswordField,
  bindPasswordFieldsInScope,
} from "./password-field.dom.js";
