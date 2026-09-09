/* Canonical record identifiers shared by domain owners and Home projections.
   A visible document number is a label, never a replacement for an existing ID.
   Pure selection only: no persistence, routing, normalization or network. */
const TICKET_KEYS = Object.freeze(["ticketId", "incidenciaId", "id", "code", "numero", "ticketCode"]);
const INVOICE_KEYS = Object.freeze(["id", "facturaId", "invoiceId", "numeroFacturaLegal", "numeroFacturaSistema", "numeroFactura", "numero", "number", "invoiceNumber"]);

function recordId(record, keys) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) continue;
    const id = String(value).replace(/[\r\n\t]+/g, " ").trim();
    if (id) return id;
  }
  return "";
}

export const getIncidenciaEntityId = (record = {}) => recordId(record, TICKET_KEYS);
export const getFacturaEntityId = (record = {}) => recordId(record, INVOICE_KEYS);
