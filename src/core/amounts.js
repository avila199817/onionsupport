// Amounts: one text mechanism for money and quantities (currency symbols and
// percent dropped, thousands and decimal separators resolved by the last
// separator) with named policies for values that are not text.
//
// parseAmount(value = 0, fallback = 0, policy):
// - undefined is 0 (the ten retired copies declared value = 0; the Home API,
//   which did not, names its blank as null); null and "" are the fallback.
// - a number is itself when finite, else the fallback.
// - text: trimmed; € $ £ ¥ % dropped; anything but digits, "." "," sign and
//   spaces dropped; spaces dropped. Empty or a lone sign is the fallback.
//   With both separators the last one is the decimal separator and the other
//   is thousands ("1.234,56" and "1,234.56" are 1234.56); with only commas
//   the comma is decimal ("1,5" is 1.5, "1,234" is 1.234); with only dots
//   Number() reads them ("1.234" is 1.234). Then Number() when finite, else
//   the fallback ("1.5.5" and "--5" fall back; "1e3" is 13: letters drop).
// - booleans and objects (arrays, Date, plain objects) follow the policy:
//   AMOUNT_POLICIES.coerced: Number(value) when finite, else the fallback
//     (true is 1, [12] is 12, [] and new Date(0) are 0, {} is the fallback).
//     Clientes model and modal, Incidencias API and list.
//   AMOUNT_POLICIES.booleanDigit: true is 1, false is 0; objects are the
//     fallback. Facturas API base, create form and detail modal base.
//   AMOUNT_POLICIES.textOnly: booleans and objects are the fallback.
//     Facturas list, Home API, Incidencias modal.
// - anything else (bigint, symbol, function) is Number(value) when finite.
//
// round2(value): cents rounding of a number, or of text Number() reads:
// Math.round((Number(value) + Number.EPSILON) * 100) / 100. Modules that
// parse before rounding compose round2(parseAmount(value, 0, policy)).
export const AMOUNT_POLICIES = Object.freeze({
  coerced: Object.freeze({ booleans: "number", objects: "number" }),
  booleanDigit: Object.freeze({ booleans: "number", objects: "fallback" }),
  textOnly: Object.freeze({ booleans: "fallback", objects: "fallback" }),
});

const CURRENCY_NOISE = /[€$£¥%]/g;
const NOT_AMOUNT = /[^\d.,+\-\s]/g;
const SPACES = /\s+/g;

function finiteOr(parsed, fallback) {
  return Number.isFinite(parsed) ? parsed : fallback;
}

// The cleaned text with "." as the decimal separator, or "" when nothing numeric remains.
function amountText(value) {
  let text = value.trim().replace(CURRENCY_NOISE, "").replace(NOT_AMOUNT, "").replace(SPACES, "");
  if (!text || text === "-" || text === "+") return "";
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(/,/g, ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    text = text.replace(/,/g, ".");
  }
  return text;
}

export function parseAmount(value = 0, fallback = 0, policy) {
  if (value === null || value === "") return fallback;
  if (typeof value === "number") return finiteOr(value, fallback);
  if (typeof value === "string") {
    const text = amountText(value);
    return text ? finiteOr(Number(text), fallback) : fallback;
  }
  if (typeof value === "boolean") return policy.booleans === "number" ? Number(value) : fallback;
  if (typeof value === "object") return policy.objects === "number" ? finiteOr(Number(value), fallback) : fallback;
  return finiteOr(Number(value), fallback);
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
