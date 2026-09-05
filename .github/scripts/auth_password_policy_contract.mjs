"use strict";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTH_PASSWORD_POLICY,
  AUTH_PASSWORD_POLICY_HELP,
  AUTH_PASSWORD_POLICY_MESSAGE,
  AUTH_PASSWORD_POLICY_VERSION,
  validateAuthPassword,
} from "../../src/features/auth/password-policy.js";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

assert.equal(AUTH_PASSWORD_POLICY_VERSION, "auth.password-policy.v1.strong-unified");
assert.deepEqual(AUTH_PASSWORD_POLICY, {
  minLength: 10,
  maxLength: 256,
  requiresLowercase: true,
  requiresUppercase: true,
  requiresNumber: true,
  requiresSymbol: true,
});
assert.match(AUTH_PASSWORD_POLICY_HELP, /10/);
assert.match(AUTH_PASSWORD_POLICY_MESSAGE, /mayúscula/);
assert.match(AUTH_PASSWORD_POLICY_MESSAGE, /minúscula/);
assert.match(AUTH_PASSWORD_POLICY_MESSAGE, /número/);
assert.match(AUTH_PASSWORD_POLICY_MESSAGE, /símbolo/);

const valid = validateAuthPassword("Abcdef1!xx");
assert.equal(valid.ok, true);
assert.equal(valid.code, "PASSWORD_POLICY_OK");

for (const [password, expectedCode] of [
  ["", "PASSWORD_REQUIRED"],
  ["Ab1!short", "WEAK_PASSWORD"],
  ["abcdef1!xx", "WEAK_PASSWORD"],
  ["ABCDEF1!XX", "WEAK_PASSWORD"],
  ["Abcdefgh!x", "WEAK_PASSWORD"],
  ["Abcdefg12x", "WEAK_PASSWORD"],
  [`Aa1!${"x".repeat(253)}`, "PASSWORD_TOO_LONG"],
]) {
  const result = validateAuthPassword(password);
  assert.equal(result.ok, false, `password must be rejected: ${password.slice(0, 16)}`);
  assert.equal(result.code, expectedCode);
}

const cuenta = read("src/views/cuenta/cuenta.api.js");
const activation = read("src/views/public/activate-account/index.js");
const reset = read("src/views/public/password-reset/index.js");

assert.match(cuenta, /features\/auth\/password-policy\.js/);
assert.match(cuenta, /\.\.\.AUTH_PASSWORD_POLICY/);
assert.match(cuenta, /validateAuthPassword\(password\)/);
assert.doesNotMatch(
  cuenta,
  /!\/[a-z]\/\.test\(password\).*\!\/[A-Z]\/\.test\(password\)/s,
  "Cuenta no debe conservar una segunda regex de política."
);

for (const [name, source] of [
  ["activation", activation],
  ["reset", reset],
]) {
  assert.match(source, /features\/auth\/password-policy\.js/, `${name}: missing shared policy import`);
  assert.match(source, /validateAuthPassword\(password\)/, `${name}: missing shared validator`);
  assert.match(source, /AUTH_PASSWORD_POLICY\.minLength/, `${name}: minLength must come from authority`);
  assert.match(source, /AUTH_PASSWORD_POLICY\.maxLength/, `${name}: maxLength must come from authority`);
  assert.match(source, /setAttribute\("minlength", String\(/, `${name}: runtime DOM minimum must be hardened`);
  assert.match(source, /setAttribute\("maxlength", String\(/, `${name}: runtime DOM maximum must be hardened`);
  assert.doesNotMatch(source, /const\s+(?:MIN_)?PASSWORD_MIN_LENGTH\s*=\s*8\b/, `${name}: legacy minimum 8 reintroduced`);
}

assert.match(activation, /policy\.textContent\s*=\s*AUTH_PASSWORD_POLICY_HELP/);
assert.match(reset, /policy\.textContent\s*=\s*AUTH_PASSWORD_POLICY_HELP/);

console.log("✅ auth password policy contract · unified 10/upper/lower/number/symbol · public DOM aligned");
