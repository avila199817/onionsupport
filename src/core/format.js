import { cleanText } from "./presentation-text.js";

// Formatting primitives over values the domain has already parsed (es-ES).
// The domain keeps its parser, its empty text and, where it differs from the
// standard one, its fallback text; the kernel keeps the Intl formatters (one
// per currency code and policy, built once) and the plain decimal formatter.
//
// Currency policies name the fraction digits and grouping a domain shows:
// - standard: two decimals always; es-ES groups thousands from five digits.
// - grouped: two decimals and thousands grouped from four digits (the
//   Incidencias list: 1.234,00 EUR).
// - precise: two to four decimals (Server costs).
// - currencyDigits: the currency's own minimum, two at most (the Clientes
//   and Incidencias modals; identical to standard for EUR).
export const CURRENCY_POLICIES = Object.freeze({
  standard: Object.freeze({ minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  grouped: Object.freeze({ useGrouping: "always", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  precise: Object.freeze({ minimumFractionDigits: 2, maximumFractionDigits: 4 }),
  currencyDigits: Object.freeze({ maximumFractionDigits: 2 }),
});

const CURRENCY_FORMATTERS = new Map();
let decimalFormatter = null;

export function currencyCode(value, fallback = "EUR") {
  return cleanText(value, fallback).toUpperCase();
}

// The formatter for a code and policy, or null when Intl rejects the code
// (a malformed code; a well-formed unknown code formats with its letters).
export function currencyFormatter(code, policy) {
  const key = `${code}|${JSON.stringify(policy)}`;
  if (!CURRENCY_FORMATTERS.has(key)) {
    let formatter = null;
    try {
      formatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: code, ...policy });
    } catch {
      formatter = null;
    }
    CURRENCY_FORMATTERS.set(key, formatter);
  }
  return CURRENCY_FORMATTERS.get(key);
}

export function formatCurrency(amount, code, policy) {
  const formatter = currencyFormatter(code, policy);
  if (formatter) {
    try {
      return formatter.format(amount);
    } catch {
      // text below
    }
  }
  return `${amount.toFixed(2).replace(".", ",")} ${code}`;
}

// Plain number in es-ES (grouping from five digits, up to three decimals).
export function formatDecimal(amount) {
  try {
    decimalFormatter ||= new Intl.NumberFormat("es-ES");
    return decimalFormatter.format(amount);
  } catch {
    return String(amount);
  }
}
