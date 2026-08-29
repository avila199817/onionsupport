import assert from "node:assert/strict";
import fs from "node:fs";
import { renderHeader } from "../../src/views/facturas/facturas.template.js";

const indexSource = fs.readFileSync(new URL("../../src/views/facturas/index.js", import.meta.url), "utf8");
assert.match(indexSource, /loadFacturasStats/);
assert.match(indexSource, /authoritativeStats/);
assert.match(indexSource, /statsAuthoritative:\s*Boolean\(authoritativeStats\)/);
assert.match(indexSource, /void refreshAuthoritativeStats\(\)/);

const html = renderHeader({
  items: [{ id: "FAC-1", total: 10, paymentStatus: "paid" }],
  total: 10,
  remoteCount: 10,
  statsAuthoritative: true,
  stats: {
    invoiceCount: 10,
    totalAmount: 500,
    paidCount: 7,
    pendingCount: 2,
    overdueCount: 1,
    countWithPdf: 9,
    sentCount: 8,
    outstandingAmount: 120,
  },
  state: { statsAuthoritative: true },
});

assert.match(html, /Facturas totales/);
assert.match(html, />10<\/div>/);
assert.match(html, /Total facturado/);
assert.match(html, /500,00/);
assert.match(html, /9 con PDF/);
assert.match(html, /8 enviadas/);
assert.match(html, /1 \/ 7/);
assert.match(html, /Exportar cargadas/);
console.log("Facturas authoritative stats contract: OK");
