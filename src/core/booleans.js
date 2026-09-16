import { slugKey } from "./slug-key.js";

// Boolean parsing: one mechanism, six named token policies.
//
// Mechanism (what every retired copy did, in this order): booleans pass
// through; 1 and "1" are true, 0 and "0" are false; a policy with
// coerce "strings" answers the fallback for anything else that is not a
// string; then the slug key of the value (lower-case, accents stripped)
// is matched against the policy's token lists; otherwise the fallback.
//
// Policies reproduce what each consumer accepted before this module
// existed, including the fallback its copy returned when the caller
// passed none (undefined). They nest (switch ⊂ activity ⊂ activityEs ⊂
// activityEsExtended by tokens); converging consumers on a wider one is a
// product decision, recorded in docs/FRONTEND_SHARED_SYSTEMS.md, not a
// refactor.
const policy = (truthy, falsy, coerce, fallback) => Object.freeze({ truthy: Object.freeze(truthy), falsy: Object.freeze(falsy), coerce, fallback });

export const BOOLEAN_POLICIES = Object.freeze({
  // Query and payload switches: strings only; "1"/"0" also as padded text.
  switch: policy(["true", "1", "yes", "si", "on"], ["false", "0", "no", "off"], "strings", false),
  // The same switches on any value (Facturas templates).
  switchAny: policy(["true", "1", "yes", "si", "on"], ["false", "0", "no", "off"], "any", false),
  // Activity words on any value (the slug key of numbers, arrays and objects).
  activity: policy(["true", "yes", "si", "on", "enabled", "active"], ["false", "no", "off", "disabled", "inactive"], "any", false),
  // Spanish activity words too.
  activityEs: policy(["true", "yes", "si", "on", "enabled", "active", "activo"], ["false", "no", "off", "disabled", "inactive", "inactivo"], "any", null),
  // Same words, strings only (form fields).
  activityEsStrings: policy(["true", "yes", "si", "on", "enabled", "active", "activo"], ["false", "no", "off", "disabled", "inactive", "inactivo"], "strings", null),
  // Users API: also habilitado/deshabilitado and padded "1"/"0".
  activityEsExtended: policy(["true", "1", "yes", "si", "on", "active", "activo", "enabled", "habilitado"], ["false", "0", "no", "off", "inactive", "inactivo", "disabled", "deshabilitado"], "any", false),
});

export function parseBoolean(value, tokens, fallback = tokens.fallback) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (tokens.coerce === "strings" && typeof value !== "string") return fallback;

  const key = slugKey(value);
  if (tokens.truthy.includes(key)) return true;
  if (tokens.falsy.includes(key)) return false;

  return fallback;
}
