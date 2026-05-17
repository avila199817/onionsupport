/* =========================================================
   Onion SPA - Shared Password Field Index
   Archivo: src/shared/password-field/index.js

   PASSWORD FIELD FACADE · SIMPLE
   - fachada pública única del password-field compartido
   - reexporta renderer + binder DOM
   - aliases compat para vistas existentes
   - sin side effects al importar
   - sin AppCore, sin CSS inline, sin inyección de estilos
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

export const PASSWORD_FIELD_VERSION = "21.0.0-simple";

export {
  renderPasswordField,
  getEyeIcon,
  getEyeOffIcon,
  getCapsIcon,
  bindPasswordField,
  bindPasswordFieldsInScope,
};

export const render = renderPasswordField;
export const bind = bindPasswordField;
export const bindAll = bindPasswordFieldsInScope;

export const PasswordField = Object.freeze({
  version: PASSWORD_FIELD_VERSION,

  render,
  renderPasswordField,

  getEyeIcon,
  getEyeOffIcon,
  getCapsIcon,

  bind,
  bindPasswordField,

  bindAll,
  bindPasswordFieldsInScope,
});

export default PasswordField;
