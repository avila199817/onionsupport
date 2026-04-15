/* =========================================================
   Onion SPA - Reset Password Confirm Helpers
   Archivo: src/views/password-reset/confirm/confirm.helpers.js

   Responsabilidades:
   - helpers puros del flujo confirm
   - lectura robusta de token desde URL
   - normalización de payload
   - validación de contraseña
   - normalización de respuesta backend
   - mensajes UX consistentes
   - redirects seguros post-success
========================================================= */

import { AppCore } from "../../../core/index.js";

/* =========================================================
   CONST
========================================================= */

export const DEFAULT_SUCCESS_MESSAGE =
  "La contraseña se ha actualizado correctamente.";

export const DEFAULT_ERROR_MESSAGE =
  "No se pudo restablecer la contraseña.";

export const MIN_PASSWORD_LENGTH = 6;

/* =========================================================
   BASICS
========================================================= */

export function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

export function normalizePath(
  path = "/login"
) {
  const raw =
    safeText(path, "/login") ||
    "/login";

  if (
    typeof AppCore?.utils
      ?.normalizePath ===
    "function"
  ) {
    try {
      return AppCore.utils.normalizePath(
        raw
      );
    } catch {}
  }

  if (raw === "/") {
    return "/";
  }

  return (
    raw
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") ||
    "/"
  );
}

/* =========================================================
   TOKEN
========================================================= */

export function getUrlToken() {
  try {
    const url = new URL(
      window.location.href
    );

    return (
      safeText(
        url.searchParams.get(
          "token"
        ),
        ""
      ) ||
      safeText(
        url.searchParams.get(
          "code"
        ),
        ""
      ) ||
      safeText(
        url.searchParams.get(
          "t"
        ),
        ""
      )
    );
  } catch {
    return "";
  }
}

/* =========================================================
   PAYLOAD
========================================================= */

export function createConfirmPayload({
  token = "",
  password = "",
  confirmPassword = "",
} = {}) {
  return {
    token: safeText(token, ""),
    password: String(
      password || ""
    ),
    confirmPassword: String(
      confirmPassword || ""
    ),
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateConfirmPayload(
  payload = {}
) {
  const errors = {};

  const token = safeText(
    payload.token,
    ""
  );

  const password = String(
    payload.password || ""
  );

  const confirmPassword =
    String(
      payload.confirmPassword ||
        ""
    );

  if (!token) {
    errors.global =
      "El enlace no es válido o falta el token.";
  }

  if (!password.trim()) {
    errors.password =
      "Introduce una nueva contraseña.";
  } else if (
    password.length <
    MIN_PASSWORD_LENGTH
  ) {
    errors.password =
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (!confirmPassword.trim()) {
    errors.confirmPassword =
      "Repite la contraseña.";
  } else if (
    password !==
    confirmPassword
  ) {
    errors.confirmPassword =
      "Las contraseñas no coinciden.";
  }

  return errors;
}

export function getFirstConfirmError(
  errors = {}
) {
  return (
    safeText(
      errors.global,
      ""
    ) ||
    safeText(
      errors.password,
      ""
    ) ||
    safeText(
      errors.confirmPassword,
      ""
    ) ||
    "Revisa el formulario."
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

export function normalizeConfirmResult(
  result = {}
) {
  const raw = isObject(result)
    ? result
    : {};

  const explicitOk =
    typeof raw.ok ===
    "boolean"
      ? raw.ok
      : typeof raw.success ===
          "boolean"
        ? raw.success
        : typeof raw.data?.ok ===
            "boolean"
          ? raw.data.ok
          : typeof raw.data
              ?.success ===
              "boolean"
            ? raw.data.success
            : null;

  const ok =
    explicitOk === null
      ? false
      : Boolean(explicitOk);

  const message =
    raw.message ||
    raw.mensaje ||
    raw.detail ||
    raw.error ||
    raw.data?.message ||
    raw.data?.mensaje ||
    raw.data?.detail ||
    raw.data?.error ||
    "";

  const redirectTo =
    raw.redirectTo ||
    raw.redirect ||
    raw.data?.redirectTo ||
    raw.data?.redirect ||
    "/login";

  return {
    raw,
    ok,
    success: ok,
    error: !ok,

    message: safeText(
      message,
      ok
        ? DEFAULT_SUCCESS_MESSAGE
        : DEFAULT_ERROR_MESSAGE
    ),

    redirectTo:
      normalizePath(
        redirectTo
      ),
  };
}

/* =========================================================
   ERROR MESSAGE
========================================================= */

export function resolveConfirmErrorMessage(
  error
) {
  const backendMessage =
    safeText(
      error?.data?.message,
      ""
    ) ||
    safeText(
      error?.data?.mensaje,
      ""
    ) ||
    safeText(
      error?.response?.data
        ?.message,
      ""
    ) ||
    safeText(
      error?.response?.data
        ?.mensaje,
      ""
    ) ||
    safeText(
      error?.message,
      ""
    );

  return (
    backendMessage ||
    DEFAULT_ERROR_MESSAGE
  );
}

/* =========================================================
   REDIRECT
========================================================= */

export function resolveConfirmRedirect(
  result = {},
  deps = {}
) {
  return normalizePath(
    safeText(
      deps.redirectTo,
      ""
    ) ||
      safeText(
        result.redirectTo,
        ""
      ) ||
      "/login"
  );
}
