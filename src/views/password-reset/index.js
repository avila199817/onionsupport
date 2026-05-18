/* =========================================================
   Onion Support - Password Reset View Entry
   Archivo: /src/views/password-reset/index.js

   Responsabilidad:
   - Entry point mínimo de password-reset.
   - Reexportar la vista real.
   - Exponer alias para password-request y password-reset.
   - Sin lógica.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin navegación.
   - Sin 2FA/MFA/OTP.
========================================================= */

import PasswordResetView from "./resetPasswordView.js";

export const PASSWORD_RESET_INDEX_VERSION = "password-reset.index.v1";

export { PasswordResetView };

export const ResetPasswordView = PasswordResetView;
export const PasswordRequestView = PasswordResetView;

export default PasswordResetView;
