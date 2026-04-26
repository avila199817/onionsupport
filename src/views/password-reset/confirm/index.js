/* =========================================================
   Onion SPA - Reset Password Confirm Entry
   Archivo: src/views/password-reset/confirm/index.js

   FINAL PRO SYSTEM · RESET PASSWORD CONFIRM ENTRY · 10/10

   Responsabilidades:
   - exponer la vista confirm del reset password
   - delegar la orquestación real en confirmView.js
   - mantener compatibilidad default + named export
   - entrypoint limpio del submódulo confirm
   - no contener lógica de token, API ni DOM
========================================================= */

import ConfirmResetPasswordView from "./confirmView.js";

export {
  ConfirmResetPasswordView,
};

export default ConfirmResetPasswordView;
