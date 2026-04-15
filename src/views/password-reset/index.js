/* =========================================================
   Onion SPA - Reset Password View
   Archivo: src/views/password-reset/index.js

   Responsabilidades:
   - exponer la vista de recuperación de acceso
   - delegar la orquestación real en resetPasswordView.js
   - mantener compatibilidad default + named export
   - preservar una entrypoint limpia del módulo
========================================================= */

import renderResetPasswordView from "./resetPasswordView.js";

export const ResetPasswordView =
  renderResetPasswordView;

export default renderResetPasswordView;
