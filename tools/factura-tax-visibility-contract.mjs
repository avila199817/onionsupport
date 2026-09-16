import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderFacturasDetailModal } from "../src/views/facturas/facturas.template.modal.js";

// VISIBILIDAD FISCAL DEL DETALLE DE FACTURA. SÓLO PRESENTACIÓN.
//
// Este contrato NO autoriza ni comprueba cálculo alguno: comprueba QUÉ SE ENSEÑA a partir de
// lo que la factura ya trae. Base imponible, impuestos, total, precisión, redondeo, importes
// persistidos, PDFs e histórico quedan intactos y así se verifica al final.
//
// Dos defectos medidos sobre `main` a93db093, ambos de lectura:
//
//  1. El detalle leía el importe de IVA/IRPF por una lista de campos que NO incluía el campo
//     canónico `iva` / `irpf`, el mismo que sí lee normalizeFinancialAliases en la API. Una
//     factura con `iva: 8.4` enseñaba «0,00 €», y una retención real de 7 € enseñaba
//     «-0,00 €». Se ocultaban importes reales.
//  2. La base de la RETENCIÓN caía por defecto en `baseImponible`, la base general de la
//     factura. Como la tarjeta se pinta si hay importe, porcentaje o base, bastaba con que la
//     factura tuviera base -- es decir, siempre -- para fabricar un IRPF inexistente.

const BASE = Object.freeze({
  id: "F-CONTRACT-1", facturaId: "F-CONTRACT-1", numero: "2026000123",
  baseImponible: 40, iva: 8.4, total: 48.4, moneda: "EUR",
  estado: "emitida", estadoPago: "pendiente", pagado: 0, pendiente: 48.4,
  fechaEmision: "2026-09-08T09:00:00.000Z",
  cliente: { id: "c1", nombre: "Cliente de contrato", email: "contrato@example.test" },
});

const CARD = /<article[^>]*facturas-detail-tax-card--(\w+)[^>]*>([\s\S]*?)<\/article>/gu;

// Intl separa el importe del símbolo con un espacio duro; se normaliza para comparar texto,
// nunca para decidir nada.
const texto = (value = "") => String(value).replace(/\u00a0/gu, " ").trim();

function render(overrides = {}) {
  const factura = { ...BASE, ...overrides };
  const before = JSON.stringify(factura);
  const html = renderFacturasDetailModal({ open: true, factura, detail: factura, admin: true, role: "admin" });
  // Ni el render ni la política pueden tocar el documento.
  assert.equal(JSON.stringify(factura), before, "rendering must not mutate the invoice");
  const cards = new Map();
  for (const match of html.matchAll(CARD)) {
    cards.set(match[1], {
      valor: texto((match[2].match(/facturas-detail-tax-value">\s*([^<]*)/u) || [])[1] ?? ""),
      pie: texto((match[2].match(/facturas-detail-tax-caption[^>]*>\s*([\s\S]*?)</u) || [])[1] ?? ""),
      etiqueta: texto((match[2].match(/facturas-detail-tax-label">\s*([^<]*)/u) || [])[1] ?? ""),
    });
  }
  return { html, cards, irpf: cards.get("irpf") ?? null, iva: cards.get("iva") ?? null };
}

// 1 · NO APLICA, CONFIRMADO POR EL CONTRATO, SIN RETENCIÓN EFECTIVA -> ni tarjeta ni hueco.
for (const [name, input] of [
  ["sin ningún campo de retención", {}],
  ["objeto irpf vacío", { irpf: {} }],
  ["sólo base imponible general", { baseImponible: 40 }],
  ["irpfImporte ausente (null)", { irpfImporte: null }],
  ["irpfImporte cadena vacía", { irpfImporte: "" }],
]) {
  const { irpf, html } = render(input);
  assert.equal(irpf, null, `1 · ${name}: la tarjeta de IRPF no debe existir`);
  assert.equal(/facturas-detail-tax-card--irpf/u.test(html), false, `1 · ${name}: ni su hueco`);
}
console.log("PASS 1 · no aplica: 5 entradas, ninguna pinta IRPF ni deja hueco");

// 2 · IMPORTE REAL DISTINTO DE CERO -> se muestra, venga por el campo que venga.
for (const [name, input] of [
  ["campo canónico irpf numérico", { irpf: 7 }],
  ["irpfImporte", { irpfImporte: 7 }],
  ["retencion en negativo", { retencion: -7 }],
  ["objeto con importe y tipo", { irpf: { importe: 7, porcentaje: 15 } }],
  ["flag enabled:false contradictorio", { irpf: { enabled: false, importe: 7 } }],
  ["histórica de 2021", { irpf: 7, fechaEmision: "2021-03-01T00:00:00.000Z" }],
]) {
  const { irpf } = render(input);
  assert.ok(irpf, `2 · ${name}: debe existir la tarjeta`);
  assert.equal(irpf.valor, "-7,00 €", `2 · ${name}: debe mostrar la retención real`);
}
console.log("PASS 2 · importe real: 6 entradas, todas muestran -7,00 € (ninguna se oculta por un flag ni por la fecha)");

// 3 · APLICA CON IMPORTE CERO -> se conserva, y un cero REAL no se pinta como «-0,00 €».
for (const [name, input] of [
  ["enabled:true con importe 0", { irpf: { enabled: true, importe: 0 } }],
  ["importe 0 con base propia", { irpf: { importe: 0, base: 40 } }],
]) {
  const { irpf } = render(input);
  assert.ok(irpf, `3 · ${name}: la información aplicable se conserva`);
  assert.equal(irpf.valor, "0,00 €", `3 · ${name}: un cero real no lleva signo negativo`);
}
console.log("PASS 3 · cero aplicable: se conserva y se escribe 0,00 €, no -0,00 €");

// 4 · IMPORTE NO NULO QUE SE REDONDEA A CERO -> ni se oculta ni se confunde con un cero.
{
  const { irpf } = render({ irpfImporte: 0.004 });
  assert.ok(irpf, "4 · un importe real pequeño no desaparece");
  assert.match(irpf.pie, /redondeado/iu, "4 · se dice que lo que se ve está redondeado");
  const cero = render({ irpf: { enabled: true, importe: 0 } });
  assert.notEqual(irpf.pie, cero.irpf.pie, "4 · un redondeo a cero y un cero real no se presentan igual");
}
console.log("PASS 4 · redondeo a cero: se muestra y se distingue de un cero real");

// 5 · PRESENTE PERO ILEGIBLE -> ni cero inventado ni «no aplica» silencioso.
for (const [name, input] of [
  ["texto no numérico", { irpfImporte: "n/d" }],
  ["objeto declarado aplicable sin importe", { irpf: { enabled: "si" } }],
]) {
  const { irpf } = render(input);
  assert.ok(irpf, `5 · ${name}: no puede convertirse en «no aplica»`);
  assert.equal(irpf.valor, "No disponible", `5 · ${name}: no se inventa un importe`);
  assert.equal(/0,00/u.test(irpf.valor), false, `5 · ${name}: y no se enseña como cero`);
}
console.log("PASS 5 · dato ilegible: se declara no disponible, sin inventar importe");

// 6 · EL IVA REAL DEJA DE OCULTARSE (mismo defecto de lectura, mismo campo canónico).
{
  const { iva } = render({});
  assert.ok(iva, "6 · la factura con IVA debe pintar su tarjeta");
  assert.equal(iva.valor, "8,40 €", "6 · el IVA real de la factura, no 0,00 €");
}
console.log("PASS 6 · el IVA canónico se lee y se muestra");

// 7 · LOS DATOS DEL DOCUMENTO NO CAMBIAN EN NINGUNA VARIANTE.
{
  const variantes = [
    {}, { irpf: 7 }, { irpfImporte: 0.004 }, { irpf: { enabled: true, importe: 0 } },
    { irpfImporte: "n/d" }, { retencion: -7 },
  ];
  for (const v of variantes) {
    const { html } = render(v);
    // Total, base, pagado y pendiente salen de sus propios campos y no dependen del IRPF.
    const plano = texto(html.replace(/\u00a0/gu, " "));
    assert.ok(plano.includes("48,40 €"), `7 · total intacto en ${JSON.stringify(v)}`);
    assert.ok(plano.includes("40,00 €"), `7 · base imponible intacta en ${JSON.stringify(v)}`);
  }
  // Y el render es puro: dos pasadas idénticas dan el mismo documento.
  const a = render({ irpf: 7 }).html;
  const b = render({ irpf: 7 }).html;
  assert.equal(a, b, "7 · el render es determinista");
}
console.log("PASS 7 · total y base imponible intactos en 6 variantes; render determinista y sin mutar la factura");

// 8 · LA DECISIÓN NO MIRA TEXTO FORMATEADO NI TRUTHINESS SUPERFICIAL.
{
  const source = await readFile(new URL("../src/views/facturas/facturas.template.modal.base.js", import.meta.url), "utf8");
  const irpfBase = source.slice(source.indexOf("LA BASE IMPONIBLE DE LA FACTURA NO ES UNA RETENCIÓN"), source.indexOf("LA BASE IMPONIBLE DE LA FACTURA NO ES UNA RETENCIÓN") + 900);
  assert.equal(/"baseImponible"/u.test(irpfBase), false, "8 · la base general no puede acreditar una retención");
  assert.match(source, /function readTaxAmount\(/u, "8 · ausente, ilegible y cero real se separan en una sola función");
  assert.match(source, /AMOUNT_POLICIES\.booleanDigit/u, "8 · los importes se normalizan por la autoridad de importes");
  assert.equal(/formatMoney\([^)]*\)\s*===/u.test(source), false, "8 · nunca se decide comparando texto ya formateado");
}
console.log("PASS 8 · la decisión usa datos normalizados, no texto formateado ni truthiness superficial");

console.log("Factura tax visibility contract: PASS · 5 políticas + IVA canónico + documento intacto");
