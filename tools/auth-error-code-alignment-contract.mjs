import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/*
  Contrato: códigos de error de autenticación alineados con el backend.

  core/http.js decide si un 401 se reintenta tras refrescar el token. La lista
  NON_REFRESHABLE_AUTH_CODES solo puede contener códigos que el backend emite
  de verdad (config/jwt.js · requireAuth, router/auth/refresh.js,
  router/auth/login.impl.js) y que un refresh no puede arreglar: sesión
  inválida/revocada/expirada o cuenta no operativa. Los códigos refrescables
  (TOKEN_EXPIRED, MISSING_TOKEN, SESSION_REQUIRED, TOKEN_VERSION_*) no pueden
  aparecer. El backend pina la misma lista en
  tools/auth-error-code-catalog-contracts.mjs.
*/

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const httpSource = readFileSync(resolve(ROOT, "src/core/http.js"), "utf8");
const loginSource = readFileSync(resolve(ROOT, "src/views/public/login/index.js"), "utf8");

const EXPECTED_NON_REFRESHABLE = [
  "INVALID_CREDENTIALS",
  "LOGIN_FAILED",
  "SESSION_INVALID",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "SESSION_NOT_FOUND",
  "SESSION_USER_MISMATCH",
  "SESSION_ID_MISMATCH",
  "SESSION_TOKEN_MISMATCH",
  "USER_INVALID",
  "USER_INACTIVE",
  "USER_DISABLED",
  "USER_NOT_FOUND",
  "USER_EMAIL_UNVERIFIED",
];

const REFRESHABLE_MUST_NOT_APPEAR = [
  "TOKEN_EXPIRED",
  "MISSING_TOKEN",
  "INVALID_TOKEN",
  "TOKEN_NOT_ACTIVE",
  "SESSION_REQUIRED",
  "TOKEN_VERSION_MISMATCH",
  "TOKEN_VERSION_MISSING",
  "TOKEN_VERSION_INVALID",
];

const NEVER_EMITTED_BY_BACKEND = [
  "BAD_CREDENTIALS",
  "MFA_REQUIRED",
  "2FA_REQUIRED",
  "OTP_REQUIRED",
  "REFRESH_TOKEN_REVOKED",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_EXPIRED",
  "USER_DESACTIVADO",
  "USUARIO_DESACTIVADO",
  "USER_DELETED",
  "USER_ARCHIVED",
  "USER_BLOCKED",
  "USER_BANNED",
  "USER_SUSPENDED",
];

const match = httpSource.match(/const NON_REFRESHABLE_AUTH_CODES =\s*new Set\(\[([\s\S]*?)\]\);/u);
assert.ok(match, "core/http.js debe declarar NON_REFRESHABLE_AUTH_CODES como Set literal");
const declared = [...match[1].matchAll(/"([A-Z0-9_]+)"/gu)].map((m) => m[1]);

assert.deepEqual(
  [...declared].sort(),
  [...EXPECTED_NON_REFRESHABLE].sort(),
  "NON_REFRESHABLE_AUTH_CODES debe ser exactamente el catálogo emitido por el backend"
);
assert.equal(new Set(declared).size, declared.length, "sin códigos repetidos");
for (const code of REFRESHABLE_MUST_NOT_APPEAR) {
  assert.ok(!declared.includes(code), `${code} se resuelve con un refresh y no puede bloquearlo`);
}
for (const code of NEVER_EMITTED_BY_BACKEND) {
  assert.ok(!declared.includes(code), `${code} no lo emite el backend`);
}
assert.match(httpSource, /Autoridad: los códigos\s+que emite el backend en config\/jwt\.js/u, "la lista documenta su autoridad backend");

// Login: el bloqueo temporal (423 ACCOUNT_TEMPORARILY_LOCKED + lockUntil) tiene mensaje propio.
assert.match(
  loginSource,
  /if \(status === 423 \|\| code\.includes\("LOCKED"\)\) \{/u,
  "authErrorMessage debe tratar 423/LOCKED antes del 401 genérico"
);
assert.ok(
  loginSource.indexOf('if (status === 423 || code.includes("LOCKED")) {') <
    loginSource.indexOf('status === 401 ||'),
  "el bloqueo temporal se evalúa antes que credenciales inválidas"
);
assert.match(loginSource, /error\?\.payload\?\.lockUntil/u, "el mensaje usa lockUntil del payload del backend");
assert.match(loginSource, /La cuenta está bloqueada temporalmente por varios intentos fallidos\./u);

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
assert.match(pkg.scripts["validate:source"], /node tools\/auth-error-code-alignment-contract\.mjs/u, "el contrato debe ejecutarse en validate:source");

console.log(`auth-error-code-alignment-contract: OK · ${declared.length} códigos no refrescables alineados con el backend · login 423`);
