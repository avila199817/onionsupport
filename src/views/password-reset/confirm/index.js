/* =========================================================
   Onion SPA - Reset Password Confirm Entry
   Archivo: src/views/password-reset/confirm/index.js

   Responsabilidades:
   - exponer la vista confirm del reset password
   - delegar la orquestación en confirmView.js
   - mantener compatibilidad default + named export
   - entrypoint limpio del submódulo confirm
========================================================= */

import ConfirmResetPasswordView from "./confirmView.js";

export {
  ConfirmResetPasswordView,
};

export default ConfirmResetPasswordView;
