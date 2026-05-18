/* =========================================================
   Onion SPA - Shared Password Field Index
   Archivo: src/shared/password-field/index.js

   Responsabilidad:
   - Fachada pública única del password-field compartido.
   - Reexportar template + DOM.
   - Mantener aliases simples de compatibilidad.
   - Sin side effects al importar.
   - Sin AppCore.
   - Sin Auth.
   - Sin Router.
   - Sin Store.
   - Sin Toast.
   - Sin CSS inline.
   - Sin inyección de estilos.
   - Sin lógica duplicada.
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
  unbindPasswordField,
  unbindPasswordFieldsInScope,
  isPasswordFieldBound,
  getPasswordFieldSnapshot,
} from "./password-field.dom.js";

export const PASSWORD_FIELD_VERSION = "password-field.index.v1";

/* =========================================================
   TEMPLATE
========================================================= */

export {
  renderPasswordField,
  getEyeIcon,
  getEyeOffIcon,
  getCapsIcon,
};

export const render = renderPasswordField;
export const getPasswordFieldTemplate = renderPasswordField;

/* =========================================================
   DOM
========================================================= */

export {
  bindPasswordField,
  bindPasswordFieldsInScope,
  unbindPasswordField,
  unbindPasswordFieldsInScope,
  isPasswordFieldBound,
  getPasswordFieldSnapshot,
};

export const bind = bindPasswordField;
export const bindAll = bindPasswordFieldsInScope;

export const unbind = unbindPasswordField;
export const unbindAll = unbindPasswordFieldsInScope;

export const isBound = isPasswordFieldBound;

export const getSnapshot = getPasswordFieldSnapshot;
export const getDebugSnapshot = getPasswordFieldSnapshot;
export const snapshot = getPasswordFieldSnapshot;

/* =========================================================
   FACADE
========================================================= */

export const PasswordField = Object.freeze({
  version: PASSWORD_FIELD_VERSION,

  render,
  renderPasswordField,
  getPasswordFieldTemplate,

  getEyeIcon,
  getEyeOffIcon,
  getCapsIcon,

  bind,
  bindPasswordField,

  bindAll,
  bindPasswordFieldsInScope,

  unbind,
  unbindPasswordField,

  unbindAll,
  unbindPasswordFieldsInScope,

  isBound,
  isPasswordFieldBound,

  getSnapshot,
  getDebugSnapshot,
  snapshot,

  getPasswordFieldSnapshot,
});

export default PasswordField;
