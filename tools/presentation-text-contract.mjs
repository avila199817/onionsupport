import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanText } from "../src/core/presentation-text.js";
// escapeHtml moves to core/escape-html.js in the next source change; the
// trusted base tooling validates that candidate before the module exists on
// main, so resolve the authority wherever it lives.
const { escapeHtml } = await import("../src/core/escape-html.js").catch(() => import("../src/core/presentation-text.js"));
import { cleanText as homeText, escapeHtml as homeEscape, attr } from "../src/views/home/home.template.foundation.js";
import { cleanText as overlayText, renderDetailPending, safeError } from "../src/features/entity-overlay/pending-view.js";
import { escapeHtml as correoEscape, renderComposeModal, renderMessageRows } from "../src/views/correo/correo.template.js";
import { renderErrorState as renderServerError } from "../src/views/server/server.template.js";
import { renderFacturasErrorState } from "../src/views/facturas/facturas.template.js";
import { renderFacturasCreateModal } from "../src/views/facturas/facturas.template.create.js";
import { renderFacturasDetailModal } from "../src/views/facturas/facturas.template.modal.js";
import { renderIncidenciasCreateModal } from "../src/views/incidencias/incidencias.template.create.impl.js";
import { renderIncidenciasDetailModal } from "../src/views/incidencias/incidencias.template.modal.js";
import { renderClientesCreateModal } from "../src/views/clientes/clientes.template.create.js";
import { renderClientesDetailModal } from "../src/views/clientes/clientes.template.modal.js";
import { renderUsuariosDetailModal } from "../src/views/usuarios/usuarios.template.modal.js";
import { renderFeedback as renderCuentaFeedback, renderErrorState as renderCuentaError } from "../src/views/cuenta/cuenta.template.js";

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
  // The pending session shows the id as one complete, escaped text node; the
  // element around it belongs to the surface, not to the escaping policy.
  if (expected) assert.ok(loading.includes(`>${expected}<`), "Actual overlay uses the same escaping policy");
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
assert.equal(correoEscape, escapeHtml, "Correo reexport preserves the canonical HTML authority");
assert.equal(attr('  " A\nB &\'  '), "&quot; A B &amp;&#39;");
const error = renderDetailPending({ type: "<cliente>", id: "unused", error: '"<img src=x> &' });
assert.ok(error.includes('aria-label="No se pudo abrir &lt;cliente&gt;"'));
assert.ok(error.includes('role="alert"'), "A failed session is announced assertively");
assert.ok(error.includes(">&quot;&lt;img src=x&gt; &amp;<"), "The error text is one escaped text node");
assert.equal(error.includes("<img src=x>"), false);
assert.equal(safeError({ message: "Error /x?token=synthetic-secret&ok=yes Bearer synthetic-key" }), "Error /x?token=***&ok=yes Bearer ***");
assert.equal(safeError({ message: "x".repeat(510) }).length, 500);
assert.equal(safeError(null), "No se pudo cargar el detalle.");

// Exercise real consumers at the text/attribute boundary. A shared normalizer
// must not collapse the compose body or introduce markup through remote text.
const compose = renderComposeModal({
  subject: '  Asunto\n"<img src=x> &  ',
  body: '  Primera línea\n\n\t</textarea><img src=x> &  ',
  messageId: '  id\n"<&  ',
});
assert.ok(compose.includes('value="Asunto &quot;&lt;img src=x&gt; &amp;"'));
assert.ok(compose.includes('data-correo-message-id="id &quot;&lt;&amp;"'));
assert.ok(compose.includes('>  Primera línea\n\n\t&lt;/textarea&gt;&lt;img src=x&gt; &amp;  </textarea>'));
const messages = renderMessageRows([{ id: '"<id>', subject: '<img src=x>', bodyPreview: ' A\n B & ' }]);
assert.ok(messages.includes('data-correo-message-id="&quot;&lt;id&gt;"'));
assert.ok(messages.includes('&lt;img src=x&gt;'));
assert.ok(messages.includes('> A\n B &amp; </span>'));
const server = renderServerError({ error: '  Fallo\n<script> & "  ' });
assert.ok(server.includes('Fallo &lt;script&gt; &amp; &quot;'));
for (const markup of [compose, messages, server]) {
  assert.equal(markup.includes('<img src=x>'), false);
  assert.equal(markup.includes('<script>'), false);
}

// Actual invoice/ticket consumers preserve their distinction between one-line
// labels and multiline descriptions/comments after sharing the pure helpers.
const remoteLabel = '  Ávila\n"<img src=x> &  ';
const labelHtml = 'Ávila &quot;&lt;img src=x&gt; &amp;';
const remoteBody = 'Primera línea\n\n\t</textarea><img src=x> &';
const bodyHtml = 'Primera línea\n\n\t&lt;/textarea&gt;&lt;img src=x&gt; &amp;';
const invoiceError = renderFacturasErrorState(remoteLabel);
const invoiceCreate = renderFacturasCreateModal({ open: true, serverError: remoteLabel });
const invoiceDetail = renderFacturasDetailModal({ open: true,
  detail: { facturaId: '202600017', clienteNombre: remoteLabel, total: 12 },
  feedbackMessage: remoteLabel,
});
const ticketCreate = renderIncidenciasCreateModal({ open: true,
  form: { subject: remoteLabel, description: remoteBody },
});
const ticketDetail = renderIncidenciasDetailModal({ open: true, detail: {
  ticketId: 'INC-TEXT-FIXTURE', subject: remoteLabel, description: remoteBody,
  comments: [{ commentId: 'comment-text-fixture', author: remoteLabel, body: remoteBody }],
} });
for (const markup of [invoiceError, invoiceCreate, invoiceDetail, ticketCreate, ticketDetail]) {
  assert.ok(markup.includes(labelHtml), "Actual labels collapse whitespace and escape remote markup");
  assert.equal(markup.includes('<img src=x>'), false);
}
assert.ok(ticketCreate.includes(`value="${labelHtml}"`), "The ticket subject remains an escaped one-line input");
assert.ok(ticketCreate.includes(`>${bodyHtml}</textarea>`), "The description keeps its multiline content");
assert.ok(ticketDetail.includes(bodyHtml), "Ticket detail does not flatten the description");
assert.ok(ticketDetail.includes(`data-description-comment="true"`));
assert.ok(ticketDetail.includes(`<p>${bodyHtml}</p>`), "Canonical follow-up keeps multiline comments escaped");

// The remaining private templates share the authority without flattening a
// deliberately multiline error or letting a remote label become HTML.
const clientesCreate = renderClientesCreateModal({ open: true, serverError: remoteLabel });
const clientesDetail = renderClientesDetailModal({ open: true,
  detail: { clienteId: "CL-TEXT-FIXTURE", name: remoteLabel }, feedbackMessage: remoteLabel,
});
const usuariosDetail = renderUsuariosDetailModal({ detail: { userId: "ON-TEXT-FIXTURE", name: remoteLabel } });
const cuentaFeedback = renderCuentaFeedback({ state: { error: remoteLabel } });
for (const markup of [clientesCreate, clientesDetail, usuariosDetail, cuentaFeedback]) {
  assert.ok(markup.includes(labelHtml), "Actual private presentation preserves normalization and escaping");
  assert.equal(markup.includes("<img src=x>"), false);
}
const cuentaError = renderCuentaError(remoteBody);
assert.ok(cuentaError.includes(`<p>${bodyHtml}</p>`), "Direct Cuenta error retains multiline content");

// One cleanText authority. Every module outside the startup closures imports
// the canonical helper (directly or through a live reexport) instead of
// carrying a copy. The copies listed below stay until the unit that moves
// the helper into the kernel chunk and measures the startup closures
// (tools/invoice-api-split-dist-contract.mjs): the startup and kernel modules
// themselves, and the four enhancement features whose preload lists in the
// bootstrap chunk would otherwise gain a separate presentation-text chunk.
// Nothing may be added to this list.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const CLEAN_TEXT_AUTHORITY = "src/core/presentation-text.js";
const STARTUP_CLEAN_TEXT_COPIES = Object.freeze([
  "src/app/index.js",
  "src/app/loader.js",
  "src/core/http.js",
  "src/core/index.js",
  "src/features/auth/index.js",
  "src/router/index.js",
  "src/router/routes.js",
  "src/router/styles.js",
  "src/views/public/activate-account/index.js",
  "src/views/public/home/index.js",
  "src/views/public/login/index.js",
  "src/views/public/password-reset/index.js",
  "src/features/mobile-datalist/index.js",
  "src/features/public-support-extreme/index.js",
  "src/features/route-intent-preload/index.js",
  "src/features/ticket-deeplink/index.js",
]);
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const definers = [];
const callersWithoutBinding = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  const defines = /^(?:export )?(?:async )?(?:function cleanText\s*\(|(?:const|let|var) cleanText\b)/mu.test(code);
  const imports = /import\s*\{[^}]*\bcleanText\b[^}]*\}\s*from\s*"[^"]+"/u.test(code);
  if (defines) definers.push(path);
  else if (/\bcleanText\s*\(/u.test(code) && !imports) callersWithoutBinding.push(path);
}
const allowedDefiners = new Set([CLEAN_TEXT_AUTHORITY, ...STARTUP_CLEAN_TEXT_COPIES]);
assert.ok(definers.includes(CLEAN_TEXT_AUTHORITY), "the authority defines cleanText");
assert.deepEqual(definers.filter((path) => !allowedDefiners.has(path)), [], "cleanText is defined only in the authority and the pending startup copies; the list only shrinks");
assert.deepEqual(callersWithoutBinding, [], "every cleanText caller binds the canonical helper");

console.log(`Presentation text contract: PASS · Unicode/coercion/fallback identity · canonical reexports · one cleanText authority (${definers.length - 1} startup and enhancement copies pending) · actual pending, Correo, Servidor, Facturas and Incidencias markup · multiline body/comments · redaction`);
