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

// Date presets name the es-ES option sets more than one domain shows; a
// preset used by one module stays with that module.
// - dateTime: 16/09/2026, 04:05 (Clientes, Usuarios, Facturas, the
//   Incidencias modal)
// - date: 16/09/2026 (Facturas)
// - shortMonthDate: 16 sept 2026 (Clientes, Usuarios, the Incidencias list)
// - shortMonthDateTime: 16 sept 2026, 04:05 (Home, the Incidencias detail)
export const DATE_PRESETS = Object.freeze({
  dateTime: Object.freeze({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  date: Object.freeze({ day: "2-digit", month: "2-digit", year: "numeric" }),
  shortMonthDate: Object.freeze({ day: "2-digit", month: "short", year: "numeric" }),
  shortMonthDateTime: Object.freeze({ day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
});

const CURRENCY_FORMATTERS = new Map();
const DATE_FORMATTERS = new Map();
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

// The es-ES date formatter for a preset, built once.
export function dateFormatter(preset) {
  const key = JSON.stringify(preset);
  if (!DATE_FORMATTERS.has(key)) DATE_FORMATTERS.set(key, new Intl.DateTimeFormat("es-ES", preset));
  return DATE_FORMATTERS.get(key);
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
