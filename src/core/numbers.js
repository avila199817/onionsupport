// Numbers: one coercion (Number(value), finite or the fallback) with two
// named policies for what a blank value means, and clamp without a policy.
//
// - coercedNumber: Number() semantics for blanks. undefined, null, "" and
//   whitespace are 0 (as Number(null) and Number("") are; the retired
//   copies declared value = 0, so undefined joins them); false is 0, true
//   is 1; only NaN and infinities fall back. Counters, limits and facets
//   that read "nothing" as zero (Clientes, Incidencias, Usuarios).
// - finiteNumber: a blank (undefined, null, "") is the fallback; anything
//   else is Number(value) when finite, else the fallback. Measurements and
//   optional fields whose "nothing" must stay the fallback, often null
//   (Server, Home, the technician profile, the canonical invoice).
//
// Every module reads these two policies now: the last copies with value = 0
// (the Server view and base API, the Usuarios API) moved to finiteNumber, so
// an omitted option lands on the value its call declares (the Server live
// cadence and the Server and Usuarios request timeouts) instead of 0.
// tools/declared-timings-contract.mjs pins those effective values.
// Amount parsers (currency symbols, decimal comma, cents) live in
// core/amounts.js with their own policies; integer policies stay with
// their domains.
export function coercedNumber(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// clamp does not coerce: callers parse first with a numeric policy and
// pass a number; NaN stays NaN.
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
