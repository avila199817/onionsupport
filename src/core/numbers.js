// Numeric range. clamp does not coerce: callers parse first with their own
// numeric policy (number, safeNumber) and pass a number; NaN stays NaN.
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
