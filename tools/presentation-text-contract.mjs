import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanText, normalizeKey } from "../src/core/presentation-text.js";
import { slugKey } from "../src/core/slug-key.js";
import { escapeHtml } from "../src/core/escape-html.js";
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

// One authority per policy: cleanText (one-line normalization) and the
// kernel's compact normalizeKey live in core/presentation-text.js, escapeHtml
// (HTML escaping) in core/escape-html.js and the views' accent-free slugKey in
// core/slug-key.js, split so the startup closures load only what the kernel
// needs. Every module imports them (directly or through a live reexport)
// instead of carrying a copy under any name, and binds them under their own
// name (no "cleanText as text" aliases): no other module may carry the
// normalizer's body (the [\r\n\t] replace) or emit the "&amp;" entity itself.
// normalizeKey named two behaviours before this unit; the four view helpers
// still called normalizeKey below build a slug with their own policy and are
// an upper bound that only shrinks, like the inline slug pipelines listed for
// the next unit.
// Listed exceptions keep a different policy on purpose: main.js redacts log
// lines (no collapse of the whole value), core/public-site.js keeps the route
// title's inner spacing, clientes.template.js attrExact keeps runs of spaces
// in exact-match attributes, analytics/google-tag.js is a consent-gated leaf
// chunk (importing the normalizer from it folds presentation-text into the
// analytics chunk and drags 31 KB into the auth closure), and
// core/public-legal.js must stay import-free for the public Home integrity guard.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const CLEAN_TEXT_AUTHORITY = "src/core/presentation-text.js";
const ESCAPE_HTML_AUTHORITY = "src/core/escape-html.js";
const SLUG_KEY_AUTHORITY = "src/core/slug-key.js";
const NORMALIZE_KEY_VARIANTS_PENDING = Object.freeze(["src/features/incidencias-technician-profile/index.js", "src/views/facturas/facturas.template.js", "src/views/facturas/facturas.template.modal.base.js", "src/views/home/home.template.foundation.js"]);
const SLUG_FINGERPRINT = /\.replace\(\s*\/\[\\s\.?-\]\+\/g,\s*"_"\s*\)/u;
const SLUG_FINGERPRINT_PENDING = Object.freeze(["src/core/http.js", "src/features/incidencias-technician-profile/index.js", "src/features/public-support/index.js", "src/views/facturas/facturas.api.alias-core.js", "src/views/facturas/facturas.api.boundary.js", "src/views/facturas/facturas.api.canonical.js", "src/views/facturas/facturas.template.js", "src/views/facturas/facturas.template.modal.base.js", "src/views/facturas/facturas.template.modal.js", "src/views/home/home.template.foundation.js", "src/views/incidencias/incidencias.api.js", "src/views/incidencias/incidencias.options.js", "src/views/incidencias/incidencias.priority-policy.js", "src/views/incidencias/incidencias.template.modal.js", "src/views/public/activate-account/index.js", "src/views/usuarios/usuarios.cursor.js"]);
const CLEAN_TEXT_FINGERPRINT = 'replace(/[\\r\\n\\t]/g, " ")';
const CLEAN_TEXT_FINGERPRINT_EXEMPT = Object.freeze(["src/analytics/google-tag.js", "src/core/public-site.js", "src/main.js", "src/views/clientes/clientes.template.js"]);
const ESCAPE_FINGERPRINT_EXEMPT = Object.freeze(["src/core/public-legal.js"]);
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const definers = { cleanText: [], escapeHtml: [], normalizeKey: [], slugKey: [] };
const slugFingerprints = [];
const aliasImports = [];
const callersWithoutBinding = [];
const escapeFingerprints = [];
const cleanTextFingerprints = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  if (path !== CLEAN_TEXT_AUTHORITY && !CLEAN_TEXT_FINGERPRINT_EXEMPT.includes(path) && code.includes(CLEAN_TEXT_FINGERPRINT)) cleanTextFingerprints.push(path);
  if (path !== SLUG_KEY_AUTHORITY && !SLUG_FINGERPRINT_PENDING.includes(path) && SLUG_FINGERPRINT.test(code)) slugFingerprints.push(path);
  if (/import\s*\{[^}]*\b(?:cleanText|escapeHtml|normalizeKey|slugKey)\s+as\s+/u.test(code)) aliasImports.push(path);
  if (path !== ESCAPE_HTML_AUTHORITY && !ESCAPE_FINGERPRINT_EXEMPT.includes(path) && code.includes("&amp;")) escapeFingerprints.push(path);
  for (const name of Object.keys(definers)) {
    const defines = new RegExp(`^(?:export )?(?:async )?(?:function ${name}\\s*\\(|(?:const|let|var) ${name}\\b)`, "mu").test(code);
    const imports = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"[^"]+"`, "u").test(code);
    if (defines) definers[name].push(path);
    else if (new RegExp(`\\b${name}\\s*\\(`, "u").test(code) && !imports) callersWithoutBinding.push(`${path} → ${name}`);
  }
}
assert.deepEqual(definers.cleanText, [CLEAN_TEXT_AUTHORITY], "cleanText is defined once, in the authority");
assert.deepEqual(definers.normalizeKey.filter((path) => path !== CLEAN_TEXT_AUTHORITY && !NORMALIZE_KEY_VARIANTS_PENDING.includes(path)), [], "the compact normalizeKey is defined in the text authority; only the listed slug variants still carry the name");
assert.ok(definers.normalizeKey.includes(CLEAN_TEXT_AUTHORITY), "the text authority defines normalizeKey");
assert.deepEqual(definers.slugKey, [SLUG_KEY_AUTHORITY], "slugKey is defined once, in core/slug-key.js");
assert.deepEqual(slugFingerprints, [], "no module builds a slug key on its own outside the authority and the pending list; the list only shrinks");
assert.deepEqual(aliasImports, [], "authorities are imported under their own name");
assert.equal(normalizeKey(" Content-Type "), "contenttype");
assert.equal(normalizeKey("Área_privada"), "áreaprivada");
assert.equal(normalizeKey(null), "");
assert.equal(slugKey("  En Curso  "), "en_curso");
assert.equal(slugKey("Prioridad Alta - Crítica"), "prioridad_alta_critica");
assert.equal(slugKey("v1.2:beta!"), "v1.2:beta");
assert.equal(slugKey("--__--"), "");
assert.equal(slugKey(undefined), "");
assert.deepEqual(cleanTextFingerprints, [], "no module normalizes text on its own under another name: only the authority and the listed policies carry the body");
assert.deepEqual(definers.escapeHtml, [ESCAPE_HTML_AUTHORITY], "escapeHtml is defined once, in the authority");
assert.deepEqual(escapeFingerprints, [], "no module escapes HTML on its own: only the authority and the import-free legal renderer emit &amp;");
assert.deepEqual(callersWithoutBinding, [], "every cleanText and escapeHtml caller binds its canonical helper");

console.log(`Presentation text contract: PASS · Unicode/coercion/fallback identity · canonical reexports · one cleanText authority (no local copies under any name; 4 listed policies) · compact normalizeKey in the text authority (${NORMALIZE_KEY_VARIANTS_PENDING.length} slug variants pending) · one slugKey authority (${SLUG_FINGERPRINT_PENDING.length} inline slug pipelines pending) · no alias imports · one escapeHtml authority (no local copies; public-legal keeps its import-free escaper) · actual pending, Correo, Servidor, Facturas and Incidencias markup · multiline body/comments · redaction`);
