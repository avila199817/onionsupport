/* =========================================================
   Onion SPA - Reset Password Confirm Template
   Archivo: src/views/password-reset/confirm/confirm.template.js

   Responsabilidad:
   - Compat template mínimo para confirm reset.
   - Delegar HTML real en ../reset-password.template.js.
   - Forzar modo confirm.
   - Sin layout propio.
   - Sin panel lateral.
   - Sin password-field duplicado.
   - Sin DOM.
   - Sin Auth.
   - Sin HTTP.
   - Sin Router.
   - Sin Toast.
========================================================= */

import { getResetPasswordTemplate } from "../reset-password.template.js";

export const CONFIRM_TEMPLATE_VERSION = "minimal-1";

/* =========================================================
   HELPERS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizeToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getConfirmTemplate(options = {}) {
  return getResetPasswordTemplate({
    ...options,

    mode: "confirm",
    flow: "confirm",
    isConfirm: true,

    token: normalizeToken(options.token),

    title: text(options.title, "Nueva contraseña"),
    subtitle: text(
      options.subtitle,
      `Define una nueva contraseña para ${text(options.appName, "Onion Support")}.`
    ),
    submitLabel: text(options.submitLabel, "Cambiar contraseña"),
    backLabel: text(options.backLabel, "Volver al acceso"),
    backHref: text(options.backHref, "/login"),
  });
}

export { getConfirmTemplate as ConfirmTemplate };

export default getConfirmTemplate;
