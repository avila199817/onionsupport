/* =========================================================
   Onion Support - Password Reset View Entry
   Archivo: /src/views/password-reset/index.js

   Responsabilidad:
   - Entry point mínimo de password-reset.
   - Reexportar la vista real.
   - Exponer nombres de vista usados por router/routes.js.
   - PasswordRequestView y PasswordResetView comparten vista.
   - Compat de export: ResetPasswordView.
   - Sin lógica.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin navegación.
   - Sin rutas.
   - Sin aliases legacy de rutas.
   - Sin 2FA/MFA/OTP.
========================================================= */

import PasswordResetView from "./resetPasswordView.js";

export const PASSWORD_RESET_INDEX_VERSION = "password-reset.index.v3";

export { PasswordResetView };

/*
  Compat de nombre de export.
  No declara rutas nuevas ni aliases de navegación.
*/
export const ResetPasswordView = PasswordResetView;
export const PasswordRequestView = PasswordResetView;

export default PasswordResetView;
