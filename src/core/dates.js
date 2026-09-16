import { cleanText } from "./presentation-text.js";

// Dates: one parser from a payload value to epoch milliseconds, with named
// policies for the text forms a domain accepts.
//
// Mechanism (what the retired copies did, in this order): null, undefined
// and "" are 0; a Date is its time (an invalid Date is 0); a finite number
// is epoch seconds up to 9_999_999_999 (Cosmos _ts, the WhatsApp webhook)
// and epoch milliseconds above that; numeric text follows the same rule;
// other text is parsed as a date; anything else is 0. toDate composes it
// into a Date, or null when there is no timestamp.
//
// Policies name what a domain reads in text:
// - epoch: text through Date.parse (date-only text is UTC midnight).
// - invoiceDay: date-only text is local midnight ("2026-09-16T00:00:00",
//   the civil invoice date); text without "T" takes that suffix, as the
//   Facturas copies did.
// - invoiceText: invoiceDay plus Spanish "dd/mm/yyyy[, hh:mm[:ss]]" read
//   as a local date (the Facturas list template).
export const TIMESTAMP_POLICIES = Object.freeze({
  epoch: Object.freeze({ dateOnly: "utc", spanish: false }),
  invoiceDay: Object.freeze({ dateOnly: "local", spanish: false }),
  invoiceText: Object.freeze({ dateOnly: "local", spanish: true }),
});

const EPOCH_SECONDS_MAX = 9_999_999_999;
const NUMERIC_TEXT = /^[+-]?\d+(?:\.\d+)?$/;
const SPANISH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

const epochMs = (number) => (number > EPOCH_SECONDS_MAX ? number : number * 1000);
const finiteOrZero = (ms) => (Number.isFinite(ms) ? ms : 0);

export function toTimestamp(value, policy) {
  if (value === null || value === undefined || value === "") return 0;
  if (value instanceof Date) return finiteOrZero(value.getTime());
  if (typeof value === "number") return Number.isFinite(value) ? epochMs(value) : 0;
  const raw = cleanText(value, "");
  if (!raw) return 0;
  if (NUMERIC_TEXT.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return epochMs(numeric);
  }
  if (policy.spanish) {
    const match = raw.match(SPANISH_DATE);
    if (match) {
      const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
      return finiteOrZero(new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime());
    }
  }
  return finiteOrZero(policy.dateOnly === "local" && !raw.includes("T") ? new Date(`${raw}T00:00:00`).getTime() : Date.parse(raw));
}

export function toDate(value, policy) {
  const ms = toTimestamp(value, policy);
  return ms ? new Date(ms) : null;
}
