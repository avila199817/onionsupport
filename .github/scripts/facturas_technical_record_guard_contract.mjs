import assert from "node:assert/strict";

import {
  FACTURA_TECHNICAL_UI_GUARD_VERSION,
  getFacturaStableId,
  isFacturaTechnicalRecord,
  normalizeFacturaDetailResponse,
  normalizeFacturasListResponse,
} from "../../src/views/facturas/facturas.api.js";

import {
  FACTURAS_MODAL_TEMPLATE_VERSION,
  FACTURAS_MODAL_TECHNICAL_GUARD_VERSION,
  isFacturaModalTechnicalRecord,
  renderFacturasDetailContent,
  resolveFacturaModalCanonical,
} from "../../src/views/facturas/facturas.template.modal.js";

const TECHNICAL_ID =
  "FACTURA_CREATE_IDEMP_c4c6fd57dfcb80dccfdd5d4ebc9843655f2d87e3";
const CANONICAL_ID = "FAC-2026000052-D0Q";

function invoice() {
  return {
    id: CANONICAL_ID,
    facturaId: CANONICAL_ID,
    invoiceId: CANONICAL_ID,
    clienteId: "CLI-1",
    tipoDocumento: "factura",
    entityType: "invoice",
    type: "invoice",
    numeroFacturaLegal: "2026000052",
    numeroFacturaSistema: "2026-08-27-00052",
    clienteNombre: "José Ferrandiz Martorell",
    razonSocial: "José Ferrandiz Martorell",
    clienteEmail: "josepfmartorell@gmail.com",
    fechaEmision: "2026-08-27T15:53:23.044Z",
    fechaServicio: "2026-08-26T00:00:00.000Z",
    formaPago: "transferencia_bancaria",
    ticketId: "INC-20260827-DEMO",
    baseImponible: 40,
    lineas: [
      {
        id: "LINE-1",
        concepto: "Servicio técnico",
        cantidad: 1,
        precioUnitario: 40,
        subtotal: 40,
        ivaPorcentaje: 21,
      },
    ],
    impuestos: [
      { tipo: "IVA", porcentaje: 21, base: 40, importe: 8.4 },
    ],
    ivaImporte: 8.4,
    total: 48.4,
    paidAmount: 0,
    pendingAmount: 48.4,
    estado: "issued",
    status: "issued",
    estadoPago: "pending",
    paymentStatus: "pending",
  };
}

function technicalRecord({ withSnapshot = true } = {}) {
  return {
    id: TECHNICAL_ID,
    clienteId: "CLI-1",
    tipoDocumento: "idempotency",
    entityType: "invoice_create_idempotency",
    type: "invoice_create_idempotency",
    operation: "factura.create",
    version: "factura.create.idempotency.v1",
    facturaId: CANONICAL_ID,
    numeroFacturaSistema: "2026-08-27-00052",
    total: 0,
    baseImponible: 0,
    paidAmount: 0,
    pendingAmount: 48.4,
    status: "completed",
    responseSnapshot: withSnapshot
      ? { ok: true, success: true, factura: invoice() }
      : null,
  };
}

function mergedHydratedDetail() {
  return {
    ...invoice(),
    raw: technicalRecord({ withSnapshot: false }),
  };
}

function testTechnicalClassifier() {
  assert.equal(isFacturaTechnicalRecord(technicalRecord()), true);
  assert.equal(isFacturaTechnicalRecord(invoice()), false);
  assert.equal(isFacturaModalTechnicalRecord(technicalRecord()), true);
  assert.equal(isFacturaModalTechnicalRecord(invoice()), false);
}

function testApiDetailPromotesCanonicalSnapshot() {
  const normalized = normalizeFacturaDetailResponse({
    ok: true,
    factura: technicalRecord(),
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.item.id, CANONICAL_ID);
  assert.equal(normalized.item.facturaId, CANONICAL_ID);
  assert.equal(normalized.item.numeroFacturaLegal, "2026000052");
  assert.equal(normalized.item.numeroFacturaSistema, "2026-08-27-00052");
  assert.equal(normalized.item.total, 48.4);
  assert.equal(normalized.item.baseImponible, 40);
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

  assert.deepEqual(normalized.items.map((item) => item.id), [CANONICAL_ID]);
  assert.equal(normalized.count, 1);
  assert.equal(normalized.total, 1);
  assert.equal(normalized.meta.technicalRecordsFiltered, 1);
}

function testStableIdUsesCanonicalSnapshot() {
  assert.equal(getFacturaStableId(technicalRecord()), CANONICAL_ID);
}

function assertCanonicalHtml(html) {
  assert.match(html, new RegExp(`data-factura-id="${CANONICAL_ID}"`));
  assert.match(html, />\s*2026000052\s*</);
  assert.match(html, />\s*2026-08-27-00052\s*</);
  assert.match(html, /Total[\s\S]{0,600}48,40/);
  assert.match(html, /Base imponible[\s\S]{0,600}40,00/);
  assert.match(html, /Impuestos netos[\s\S]{0,600}8,40/);
  assert.match(html, /Pendiente[\s\S]{0,500}48,40/);
  assert.doesNotMatch(html, /FACTURA_CREATE_IDEMP_/);
}

function testModalPromotesSnapshotBeforePainting() {
  const canonical = resolveFacturaModalCanonical(technicalRecord());
  assert.ok(canonical);
  assert.equal(canonical.id, CANONICAL_ID);
  assert.equal(canonical.total, 48.4);
  assert.equal(canonical.baseImponible, 40);
  assert.equal(canonical.raw.id, CANONICAL_ID);
  assert.equal(canonical.meta.technicalAliasRecovered, true);

  assertCanonicalHtml(renderFacturasDetailContent({
    factura: technicalRecord(),
    admin: true,
  }));
}

function testHydratedCanonicalRootWinsOverStaleTechnicalRaw() {
  const merged = mergedHydratedDetail();
  const canonical = resolveFacturaModalCanonical(merged);

  assert.ok(canonical);
  assert.equal(canonical.id, CANONICAL_ID);
  assert.equal(canonical.facturaId, CANONICAL_ID);
  assert.equal(canonical.total, 48.4);
  assert.equal(canonical.baseImponible, 40);
  assert.equal(canonical.pendingAmount, 48.4);
  assert.equal(canonical.meta.canonicalRootPreferred, true);
  assert.equal(canonical.raw.id, CANONICAL_ID);
  assert.notEqual(canonical.raw.tipoDocumento, "idempotency");

  assertCanonicalHtml(renderFacturasDetailContent({
    factura: merged,
    admin: true,
  }));
}

function testUnresolvedTechnicalRendersLoadingNotFalseCorruption() {
  const unresolved = technicalRecord({ withSnapshot: false });
  assert.equal(resolveFacturaModalCanonical(unresolved), null);

  const html = renderFacturasDetailContent({ factura: unresolved });
  assert.match(html, /Cargando detalle de factura/);
  assert.doesNotMatch(html, /Detalle no disponible/);
  assert.doesNotMatch(html, /FACTURA_CREATE_IDEMP_/);
}

function testVersionContract() {
  assert.equal(
    FACTURA_TECHNICAL_UI_GUARD_VERSION,
    "facturas.ui.technical-record-guard.v1"
  );
  assert.equal(
    FACTURAS_MODAL_TECHNICAL_GUARD_VERSION,
    "facturas.modal.canonical-root-first.v2"
  );
  assert.equal(
    FACTURAS_MODAL_TEMPLATE_VERSION,
    "facturas.template.modal.productivo.v6.canonical-root-first"
  );
}

const tests = [
  testTechnicalClassifier,
  testApiDetailPromotesCanonicalSnapshot,
  testListDropsTechnicalRecord,
  testStableIdUsesCanonicalSnapshot,
  testModalPromotesSnapshotBeforePainting,
  testHydratedCanonicalRootWinsOverStaleTechnicalRaw,
  testUnresolvedTechnicalRendersLoadingNotFalseCorruption,
  testVersionContract,
];

for (const test of tests) {
  test();
  console.log(`✅ ${test.name}`);
}

console.log(
  `✅ facturas technical record guard ${tests.length}/${tests.length} ` +
  `(${FACTURA_TECHNICAL_UI_GUARD_VERSION} · ${FACTURAS_MODAL_TECHNICAL_GUARD_VERSION})`
);
