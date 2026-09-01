import assert from "node:assert/strict";
import { renderHomeTemplate } from "../../src/views/home/home.template.js";

const html = renderHomeTemplate({
  user: { displayName: "Cristian Ávila Luque", role: "admin" },
  role: "admin",
  dashboard: {
    admin: true,
    summary: {
      incidencias: 23,
      facturas: 15,
      clientes: 4,
      usuarios: 12,
      invoiceStatsAvailable: true,
      totalInvoiced: 971.6,
      currency: "EUR",
    },
  },
});

assert.match(html, /Hola, Cristian Ávila Luque/);
assert.doesNotMatch(html, /<p class="home-panel-kicker">Inicio<\/p>/);
assert.doesNotMatch(html, />Inicio<\/p>/);
console.log("Home header clean contract: OK");
