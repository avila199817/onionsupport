import assert from "node:assert/strict";

import {
  FACTURA_TECHNICAL_UI_GUARD_VERSION,
  getFacturaStableId,
  isFacturaTechnicalRecord,
  normalizeFacturaDetailResponse,
  normalizeFacturasListResponse,
} from "../../src/views/facturas/facturas.api.js";

function technicalRecord() {
  return {
    id: "FACTURA_CREATE_IDEMP_c4c6fd57dfcb80dccfdd5d4ebc9843655f2d87e3",
    clienteId: "CLI-1",
    tipoDocumento: "idempotency",
    entityType: "invoice_create_idempotency",
    type: "invoice_create_idempotency",
    operation: "factura.create",
    version: "factura.create.idempotency.v1",
    facturaId: "FAC-2026-00052",
    status: "completed",
    responseSnapshot: {
      ok: true,
      factura: invoice(),
    },
  };
}

function invoice() {
  return {
    id: "FAC-2026-00052",
    facturaId: "FAC-2026-00052",
    invoiceId: "FAC-2026-00052",
    clienteId: "CLI-1",
    tipoDocumento: "factura",
    entityType: "invoice",
    numeroFacturaLegal: "2026-08-27-00052",
    clienteNombre: "Cliente de prueba",
    baseImponible: 40,
    impuestos: [
      { tipo: "IVA", porcentaje: 21, importe: 8.4 },
    ],
    iva: 8.4,
    total: 48.4,
    paidAmount: 0,
    pendingAmount: 48.4,
    estadoPago: "pending",
    paymentStatus: "pending",
  };
}

function testTechnicalClassifier() {
  assert.equal(isFacturaTechnicalRecord(technicalRecord()), true);
  assert.equal(isFacturaTechnicalRecord(invoice()), false);
}

function testDetailPromotesCanonicalSnapshot() {
  const normalized = normalizeFacturaDetailResponse({
    ok: true,
    factura: technicalRecord(),
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.item.id, "FAC-2026-00052");
  assert.equal(normalized.item.facturaId, "FAC-2026-00052");
  assert.equal(normalized.item.numeroFacturaLegal, "2026-08-27-00052");
  assert.equal(normalized.item.total, 48.4);
  assert.equal(normalized.item.baseImponible, 40);
  assert.equal(normalized.item.iva, 8.4);
  assert.equal(normalized.item.pendingAmount, 48.4);
  assert.equal(normalized.item.meta.technicalAliasRecovered, true);
  assert.equal(
    normalized.item.meta.technicalAliasGuardVersion,
    FACTURA_TECHNICAL_UI_GUARD_VERSION
  );
}

function testListDropsTechnicalRecord() {
  const normalized = normalizeFacturasListResponse({
    ok: true,
    items: [technicalRecord(), invoice()],
    total: 2,
    count: 2,
    totalKnown: true,
  });

  assert.deepEqual(normalized.items.map((item) => item.id), ["FAC-2026-00052"]);
  assert.equal(normalized.count, 1);
  assert.equal(normalized.total, 1);
  assert.equal(normalized.meta.technicalRecordsFiltered, 1);
  assert.equal(
    normalized.meta.technicalRecordGuardVersion,
    FACTURA_TECHNICAL_UI_GUARD_VERSION
  );
}

function testStableIdUsesCanonicalSnapshot() {
  assert.equal(getFacturaStableId(technicalRecord()), "FAC-2026-00052");
}

function testVersionContract() {
  assert.equal(
    FACTURA_TECHNICAL_UI_GUARD_VERSION,
    "facturas.ui.technical-record-guard.v1"
  );
}

const tests = [
  testTechnicalClassifier,
  testDetailPromotesCanonicalSnapshot,
  testListDropsTechnicalRecord,
  testStableIdUsesCanonicalSnapshot,
  testVersionContract,
];

for (const test of tests) {
  test();
  console.log(`✅ ${test.name}`);
}

console.log(
  `✅ facturas technical record guard ${tests.length}/${tests.length} (${FACTURA_TECHNICAL_UI_GUARD_VERSION})`
);
