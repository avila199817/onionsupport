import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { getFacturaEntityId, getIncidenciaEntityId } from "../src/core/entity-identity.js";
import { loadHomeDashboard, clearHomeDashboardCache } from "../src/views/home/home.api.js";
import { renderHomeTemplate } from "../src/views/home/home.template.js";
import { entityTriggerAttributes } from "../src/views/home/home.template.activity.js";

const invoice = { id: "fixture-invoice-canonical", facturaId: "legacy-invoice-alias", numeroFacturaLegal: "2026/00123", total: 25 };
const ticket = { id: "INC-CANONICAL-123", code: "INC-VISIBLE-456", subject: "Prueba", status: "open" };
assert.equal(getFacturaEntityId(invoice), invoice.id);
assert.equal(getIncidenciaEntityId(ticket), ticket.id);
assert.equal(getFacturaEntityId({ id: {}, facturaId: "usable-id" }), "usable-id");
assert.equal(getFacturaEntityId({ id: ["unsafe"] }), "");
assert.equal(getIncidenciaEntityId({ ticketId: "canonical-ticket", id: "database-row" }), "canonical-ticket");
const originalGet = Http.get;
const originalFetch = globalThis.fetch;
const requested = [];
try {
  globalThis.fetch = () => { throw new Error("No external requests are permitted"); };
  AppCore.setUser({ userId: "ON-IDENTITY-CONTRACT", name: "Fixture", role: "admin", email: "fixture@example.test" });
  Http.get = async (path) => {
    requested.push(path);
    if (path === "/api/tickets") return { ok: true, items: [ticket], total: 1, totalKnown: true };
    if (path === "/api/facturas") return { ok: true, items: [invoice], total: 1 };
    if (path === "/api/facturas/stats") return { ok: true, stats: { invoiceCount: 1, totalAmount: 25, paidAmount: 0, pendingAmount: 25 } };
    if (["/api/clientes/stats", "/api/users/stats"].includes(path)) return { ok: true, total: 1 };
    throw new Error(`Unexpected request: ${path}`);
  };
  clearHomeDashboardCache();
  const dashboard = await loadHomeDashboard({ force: true, cache: false, returnStaleOnError: false });
  const projected = dashboard.activity.find((item) => item.type === "invoice");
  assert.equal(projected.entityId, getFacturaEntityId(dashboard.facturas[0]));
  assert.equal(projected.displayId, invoice.numeroFacturaLegal);
  const html = renderHomeTemplate({ role: "admin", dashboard });
  assert.ok(html.includes(`data-entity-id="${projected.entityId}"`));
  assert.ok(!html.includes(`data-entity-id="${invoice.numeroFacturaLegal}"`));
  assert.ok(html.includes(invoice.numeroFacturaLegal), "The legal label remains visible");
  assert.equal(requested.length, 5, "Identity presentation never fetches individual entities");
  const longId = "invoice-" + "a".repeat(110);
  assert.ok(entityTriggerAttributes("factura", longId).includes(`data-entity-id="${longId}"`), "Display truncation never modifies the request ID");
  assert.equal(entityTriggerAttributes("factura", "javascript:alert(1)"), "", "Invalid targets never acquire a clickable intent");
  for (const [path, helper] of [["incidencias/index.impl.js", "getIncidenciaEntityId"], ["facturas/index.js", "getFacturaEntityId"]]) {
    const owner = await readFile(new URL(`../src/views/${path}`, import.meta.url), "utf8");
    assert.ok(owner.includes(`return ${helper}(item);`), "Home and detail owners use the same identity selector");
  }
  for (const path of ["incidencias-media-preview/index.js", "incidencias-video-preview/core.js", "incidencias-video-preview/gallery.js"]) {
    const source = await readFile(new URL(`../src/features/${path}`, import.meta.url), "utf8");
    assert.ok(source.includes("host !== mountRoot"), "A stale owner cannot dispose a newer media session");
    assert.ok(!source.includes("document.querySelector(HOST)") && !source.includes("document.querySelector(MODAL_HOST)"), "Media does not discover an unrelated modal through the global document");
    assert.ok(!source.includes("document.querySelector(VIEW)"), "Attachments do not depend on a mounted route");
  }
} finally {
  Http.get = originalGet;
  globalThis.fetch = originalFetch;
  clearHomeDashboardCache();
  AppCore.clearSession();
}
console.log("Home entity identity: PASS · canonical IDs separate from legal labels · shared owner selectors · explicit media ownership · no extra HTTP");
