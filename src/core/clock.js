// Single time source. new Date() is always a valid date, so toISOString
// cannot throw here.
export function nowIso() {
  return new Date().toISOString();
}

export function nowMs() {
  return Date.now();
}
