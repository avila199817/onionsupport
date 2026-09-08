/* Confirmed domain writes invalidate readers. This carries no entity data,
 * owns no cache, and never performs requests or observes the DOM. */
const domains = new Set(["incidencias", "facturas", "clientes", "usuarios"]);
const listeners = new Set();

export function onDomainChanged(listener) {
  if (typeof listener !== "function") throw new TypeError("A domain listener is required.");
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyDomainChanged(domain) {
  if (!domains.has(domain)) return false;
  for (const listener of [...listeners]) {
    // A presentation listener must never turn a committed write into a retry.
    try { listener(domain); } catch { /* Other subscribers still invalidate. */ }
  }
  return true;
}
