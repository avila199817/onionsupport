"use strict";

export const AUTH_PASSWORD_POLICY_VERSION =
  "auth.password-policy.v1.strong-unified";

export const AUTH_PASSWORD_POLICY = Object.freeze({
  minLength: 10,
  maxLength: 256,
  requiresLowercase: true,
  requiresUppercase: true,
  requiresNumber: true,
  requiresSymbol: true,
});

export const AUTH_PASSWORD_POLICY_HELP =
  "Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo.";

export const AUTH_PASSWORD_POLICY_MESSAGE =
  "La contraseña debe tener al menos 10 caracteres e incluir mayúscula, minúscula, número y símbolo.";

function rawPassword(value = "") {
  return value === null || value === undefined ? "" : String(value);
}

export function validateAuthPassword(value = "") {
  const password = rawPassword(value);

  if (!password.trim()) {
    return Object.freeze({
      ok: false,
      code: "PASSWORD_REQUIRED",
      message: "Introduce una contraseña nueva.",
    });
  }

  if (password.length < AUTH_PASSWORD_POLICY.minLength) {
    return Object.freeze({
      ok: false,
      code: "WEAK_PASSWORD",
      message: AUTH_PASSWORD_POLICY_MESSAGE,
    });
  }

  if (password.length > AUTH_PASSWORD_POLICY.maxLength) {
    return Object.freeze({
      ok: false,
      code: "PASSWORD_TOO_LONG",
      message: "La contraseña es demasiado larga.",
    });
  }

  if (
    (AUTH_PASSWORD_POLICY.requiresLowercase && !/[a-z]/.test(password)) ||
    (AUTH_PASSWORD_POLICY.requiresUppercase && !/[A-Z]/.test(password)) ||
    (AUTH_PASSWORD_POLICY.requiresNumber && !/\d/.test(password)) ||
    (AUTH_PASSWORD_POLICY.requiresSymbol && !/[^A-Za-z\d]/.test(password))
  ) {
    return Object.freeze({
      ok: false,
      code: "WEAK_PASSWORD",
      message: AUTH_PASSWORD_POLICY_MESSAGE,
    });
  }

  return Object.freeze({
    ok: true,
    code: "PASSWORD_POLICY_OK",
    message: "",
  });
}

export default Object.freeze({
  version: AUTH_PASSWORD_POLICY_VERSION,
  policy: AUTH_PASSWORD_POLICY,
  help: AUTH_PASSWORD_POLICY_HELP,
  message: AUTH_PASSWORD_POLICY_MESSAGE,
  validate: validateAuthPassword,
});
