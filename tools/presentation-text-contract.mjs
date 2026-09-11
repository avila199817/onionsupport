import assert from "node:assert/strict";
import { cleanText, escapeHtml } from "../src/core/presentation-text.js";
import { cleanText as homeText, escapeHtml as homeEscape, attr } from "../src/views/home/home.template.foundation.js";
import { cleanText as overlayText, renderDetailPending, safeError } from "../src/features/entity-overlay/pending-view.js";

// Literal expectations characterize the two former owners independently of
// the candidate implementation. Escaping and whitespace normalization remain
// separate policies: HTML escaping must not trim or collapse user content.
const escapeFixtures = [
  [undefined, ""], [null, ""], ["", ""], [0, "0"], [false, "false"], [42n, "42"],
  ['&<>"\'', "&amp;&lt;&gt;&quot;&#39;"],
  ["&amp; &lt;", "&amp;amp; &amp;lt;"],
  ["  Ávila\n\t🧅 e\u0301  ", "  Ávila\n\t🧅 e\u0301  "],
  [["<", "&"], "&lt;,&amp;"], [{}, "[object Object]"],
  [{ toString() { return "<synthetic>"; } }, "&lt;synthetic&gt;"],
  [Symbol('"'), "Symbol(&quot;)"],
  [new Date(NaN), "Invalid Date"],
  ["\0\u2028\u2029", "\0\u2028\u2029"],
];
assert.equal(escapeHtml(), "");
for (const [value, expected] of escapeFixtures) {
  assert.equal(escapeHtml(value), expected);
  assert.equal(homeEscape(value), expected);
  const loading = renderDetailPending({ type: "factura", id: value });
  assert.ok(loading.includes(`<span>${expected}</span>`), "Actual overlay uses the same escaping policy");
}

const textFixtures = [
  [null, "vacío", "vacío"], [undefined, "vacío", "vacío"],
  ["  A\r\n\tB\u00a0\u2003C  ", "", "A B C"],
  [0, "x", "0"], [false, "x", "false"],
  [" \n\t ", 0, 0], [" \t ", null, null],
  ["e\u0301\n🧅", "", "e\u0301 🧅"],
  [[" A", "B "], "", "A,B"], [{}, "", "[object Object]"],
  [{ toString() { return "  < A\tB >  "; } }, "", "< A B >"],
  [Symbol(" A  B "), "", "Symbol( A B )"],
  [new Date(NaN), "", "Invalid Date"],
];
for (const owner of [cleanText, homeText, overlayText]) {
  assert.equal(owner(), "");
  for (const [value, fallback, expected] of textFixtures) assert.equal(owner(value, fallback), expected);
  const marker = {};
  assert.equal(owner(" \n ", marker), marker, "Fallback identity is preserved, not coerced");
}
const date = new Date("2026-09-11T12:00:00.000Z");
assert.equal(escapeHtml(date), String(date), "Date keeps built-in string conversion");
assert.equal(cleanText(date), String(date), "Date is not flattened as a plain object");
const conversionFailure = new Error("synthetic conversion failure");
const throwing = { toString() { throw conversionFailure; } };
for (const owner of [cleanText, escapeHtml, homeText, homeEscape, overlayText]) {
  assert.throws(() => owner(throwing), (error) => error === conversionFailure);
}

assert.equal(homeText, cleanText, "Home consumers must use the canonical function, not a copied implementation");
assert.equal(overlayText, cleanText, "Pending view consumers must use the canonical function");
assert.equal(homeEscape, escapeHtml, "Home reexport preserves live function identity");
assert.equal(attr('  " A\nB &\'  '), "&quot; A B &amp;&#39;");
const error = renderDetailPending({ type: "<cliente>", id: "unused", error: '"<img src=x> &' });
assert.ok(error.includes('aria-label="No se pudo abrir &lt;cliente&gt;"'));
assert.ok(error.includes('<p class="entity-overlay-error" role="alert">&quot;&lt;img src=x&gt; &amp;</p>'));
assert.equal(error.includes("<img src=x>"), false);
assert.equal(safeError({ message: "Error /x?token=synthetic-secret&ok=yes Bearer synthetic-key" }), "Error /x?token=***&ok=yes Bearer ***");
assert.equal(safeError({ message: "x".repeat(510) }).length, 500);
assert.equal(safeError(null), "No se pudo cargar el detalle.");
console.log("Presentation text contract: PASS · 15 escape/13 text fixtures · Unicode/coercion/fallback identity · one canonical owner · actual pending/error markup · redaction");
