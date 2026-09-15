#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MODAL_HEIGHTS, MODAL_SHELL_SELECTORS, MODAL_SHELL_VERSION, MODAL_SIZES, MODAL_STATES,
  renderModalCloseButton, renderModalContent, renderModalShell, renderModalState,
} from "../src/features/entity-overlay/modal-host.js";
import { renderDetailPending } from "../src/features/entity-overlay/pending-view.js";
import { renderIncidenciasDetailModal } from "../src/views/incidencias/incidencias.template.modal.js";
import { renderFacturasDetailModal } from "../src/views/facturas/facturas.template.modal.js";

/* One modal system: the shell renders every private dialog, the structural
   stylesheet is the only place a dialog shell is drawn, and the lifecycle is
   the only owner of Escape, Tab, backdrop clicks and scroll. This contract
   fixes the shell's output and keeps a closed inventory of the historical
   shells still to be migrated; an entry must exist or be removed. */

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const AUTHORITY = "src/css/components/detail-modal.css";
const IMPORT = '@import url("./components/detail-modal.css") layer(components);';
const PRINT = process.argv.includes("--print");

/* Complete inventory of position: fixed rules outside the authority.
   shell  → a historical dialog shell; `until` names the unit that retires it.
   layer  → a fixed layer that is not a dialog (chrome, loader, toasts, public
            landing, tooltips); `reason` explains why it stays.
   A new fixed rule, or an entry that no longer exists, fails the contract. */
const pendingShell = (file, until) => ({ kind: "shell", file, until });
const fixedLayer = (file, reason) => ({ kind: "layer", file, reason });
const FIXED_INVENTORY = new Map([
  // dialog shells pending migration
  [".fpc-overlay", pendingShell("src/features/facturas-paid-confirm/style.css", "facturas-confirm-shell")],
  [".correo-modal-backdrop", pendingShell("src/css/views/correo/index.css", "correo-shell")],
  [".correo-compose", pendingShell("src/css/views/correo/index.css", "correo-shell")],
  [".correo-confirm-overlay", pendingShell("src/css/views/correo/index.css", "correo-shell")],
  [".correo-signature-dialog", pendingShell("src/css/views/correo/index.css", "correo-shell")],
  [".incidencias-media-viewer", pendingShell("src/css/views/incidencias/media-preview.core.css", "media-viewer-review")],
  [".ui-overlay", pendingShell("src/css/components/ui.css", "ui-legacy-overlay-removal")],
  [".ui-drawer", pendingShell("src/css/components/ui.css", "ui-legacy-overlay-removal")],
  // fixed layers that are not dialogs
  [".toast", fixedLayer("src/css/components/ui.css", "toast stack")],
  [".correo-toast-stack", fixedLayer("src/css/views/correo/index.css", "toast stack of the mail workspace")],
  [".login-page-glow, .login-page-grid", fixedLayer("src/css/auth/login.css", "decorative login background")],
  [".home-view-root .home-welcome-pilot", fixedLayer("src/css/compositions/home-onboarding-pilot.css", "non-blocking welcome helper")],
  [":is( .sr-only-focusable, .visually-hidden-focusable, .app-skip-link ):is( :focus, :focus-visible )", fixedLayer("src/css/core/core.css", "skip link on focus")],
  [".fixed", fixedLayer("src/css/core/core.css", "utility class")],
  [".main-content", fixedLayer("src/css/core/layout.css", "app layout frame")],
  [".table-head", fixedLayer("src/css/core/layout.css", "sticky table head")],
  ["#app-loader, .app-loader", fixedLayer("src/css/core/loader.css", "boot loader")],
  [':where( #app-chrome, [data-app-chrome="true"] )', fixedLayer("src/css/layout/chrome.css", "app chrome frame")],
  [":where( #topbar-mount, [data-topbar-mount] )", fixedLayer("src/css/layout/chrome.css", "topbar mount")],
  [":where( #sidebar-mount, [data-sidebar-mount] )", fixedLayer("src/css/layout/chrome.css", "sidebar mount")],
  [':where( .app-chrome-backdrop, [data-app-chrome-backdrop="true"] )', fixedLayer("src/css/layout/chrome.css", "mobile navigation scrim, owned by the chrome")],
  [".sidebar", fixedLayer("src/css/layout/sidebar.css", "sidebar")],
  [':where( .topbar-search-results, [data-topbar-search-results="true"] )', fixedLayer("src/css/layout/topbar.css", "search palette")],
  [".topbar-executive-ready .topbar-search", fixedLayer("src/css/layout/topbar.executive.css", "search palette")],
  [".topbar-exec-notifications-panel", fixedLayer("src/css/layout/topbar.executive.css", "notifications popover")],
  [".seo-skip-link", fixedLayer("src/css/seo/public-service.css", "public skip link")],
  [".public-home-background", fixedLayer("src/css/views/public/index.css", "public landing background")],
  [".public-home-scrollbar", fixedLayer("src/css/views/public/index.css", "public landing scrollbar")],
  [".public-home-nav", fixedLayer("src/css/views/public/index.css", "public navigation bar")],
  [".public-home-floating-whatsapp", fixedLayer("src/css/views/public/index.css", "public floating action")],
  [".public-home-nav-panel", fixedLayer("src/css/views/public/index.css", "public mobile navigation")],
  [".public-support-submit-overlay", fixedLayer("src/css/views/public/public-support-progress.css", "public submit progress, not a dialog")],
  [".public-home .public-support-info-tooltip", fixedLayer("src/css/views/public/support-request.css", "public tooltip")],
]);

/* Files still allowed to restyle structural shell classes (scoped overrides).
   They shrink with the same units; a new file is a violation. */
const STRUCTURAL_OVERRIDE_FILES = new Map([
  ["src/features/incidencias-technician-profile/style.css", "technician-profile-size-variant"],
]);

/* Dialogs already rendered through renderModalShell. Each one imports the
   shell and emits no root/overlay/panel or dialog ARIA of its own. */
const SHELL_CONSUMERS = [
  "src/features/entity-overlay/pending-view.js",
  "src/views/incidencias/incidencias.template.modal.impl.js",
  "src/views/facturas/facturas.template.modal.base.js",
  "src/views/incidencias/incidencias.template.create.impl.js",
  "src/views/facturas/facturas.template.create.js",
  "src/views/clientes/clientes.template.create.js",
  "src/views/usuarios/usuarios.template.create.js",
  "src/views/clientes/clientes.template.modal.js",
  "src/views/facturas/index.js",
];

const STRUCTURAL_CLASS = /\.ui-detail-modal-(?:root|overlay|panel|header|body|footer|close-btn)\b/u;

function cssFiles(dir, out = []) {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) cssFiles(path, out);
    else if (entry.name.endsWith(".css")) out.push(path);
  }
  return out;
}

/* Selectors of rules declaring position: fixed. Comments stripped, nesting
   respected (a rule inside @media keeps its own selector). */
function fixedSelectors(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  const stack = [];
  const found = [];
  let prelude = "";
  let body = "";
  for (const char of css) {
    if (char === "{") {
      stack.push({ prelude: prelude.replace(/\s+/gu, " ").trim(), body: "", nested: false });
      if (stack.length > 1) stack[stack.length - 2].nested = true;
      prelude = "";
      body = "";
      continue;
    }
    if (char === "}") {
      const block = stack.pop();
      if (block && !block.nested && !block.prelude.startsWith("@") && /position\s*:\s*fixed\b/u.test(block.body)) {
        found.push(block.prelude);
      }
      prelude = "";
      continue;
    }
    if (stack.length) stack[stack.length - 1].body += char;
    else prelude += char;
    if (stack.length) prelude += char; // selector text of the next rule inside a block
  }
  return found;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("shell identity", () => {
  assert.equal(MODAL_SHELL_VERSION, "ui-modal-shell.v1");
  assert.equal(typeof renderModalShell, "function");
  assert.equal(typeof renderModalContent, "function", "the shell and its host ship in one module");
  assert.ok(Object.isFrozen(MODAL_SHELL_SELECTORS));
  assert.match(read("src/features/entity-overlay/modal-host.js"), /scrollSelector = MODAL_SHELL_SELECTORS\.body,/u, "the host patches by the shell's own markers");
  assert.deepEqual(Object.keys(MODAL_SHELL_SELECTORS), ["root", "overlay", "panel", "header", "body", "footer", "close", "state"]);
  assert.deepEqual([...MODAL_SIZES], ["detail", "wide", "form", "compact", "confirm"]);
  assert.deepEqual([...MODAL_HEIGHTS], ["fixed", "auto"]);
  assert.deepEqual([...MODAL_STATES], ["loading", "error", "empty"]);
});

test("the shell emits one structure: root → overlay → panel[dialog] → header, body, optional footer", () => {
  const html = renderModalShell({
    id: "dom-modal", rootClass: "dom-root", rootAttributes: { "data-dom-root": "true", "data-open": "ignored?" },
    overlayClass: "dom-overlay", overlayAttributes: { "data-dom-overlay": "true" },
    panelId: "dom-panel", panelClass: "dom-panel", panelAttributes: { "data-dom-panel": "true" },
    labelledBy: "dom-title", describedBy: "dom-desc", size: "wide", height: "auto", submitting: true,
    prelude: "<div data-prelude></div>", header: "<h2 id='dom-title'>T</h2>", body: "<p id='dom-desc'>B</p>", footer: "<button>ok</button>",
    headerClass: "dom-header", bodyClass: "dom-body", footerClass: "dom-footer", bodyAttributes: { "data-history-mode": "ticket", "aria-busy": "true" },
  });
  const order = [
    /<section id="dom-modal" class="ui-detail-modal-root dom-root" data-modal-shell="ui-modal-shell\.v1" data-modal-size="wide" data-modal-height="auto" data-open="true" data-dom-root="true"/u,
    /<div class="ui-detail-modal-overlay dom-overlay" data-modal-overlay="true" data-dom-overlay="true">/u,
    /<div id="dom-panel" class="ui-detail-modal-panel dom-panel is-submitting" role="dialog" aria-modal="true" aria-labelledby="dom-title" aria-describedby="dom-desc" tabindex="-1" data-modal-panel="true" data-dom-panel="true">/u,
    /<div data-prelude><\/div>/u,
    /<header class="ui-detail-modal-header dom-header" data-modal-header="true"><h2 id='dom-title'>T<\/h2><\/header>/u,
    /<main class="ui-detail-modal-body dom-body" data-modal-body="true" data-history-mode="ticket" aria-busy="true"><p id='dom-desc'>B<\/p><\/main>/u,
    /<footer class="ui-detail-modal-footer dom-footer" data-modal-footer="true"><button>ok<\/button><\/footer>/u,
  ];
  let cursor = 0;
  for (const pattern of order) {
    const match = pattern.exec(html.slice(cursor));
    assert.ok(match, `structure order: ${pattern}`);
    cursor += match.index + match[0].length;
  }
  assert.equal((html.match(/role="dialog"/gu) || []).length, 1);
  assert.match(renderModalShell({ role: "alertdialog" }), /role="alertdialog" aria-modal="true"/u, "confirmations may declare alertdialog");
  assert.match(renderModalShell({ role: "menu" }), /role="dialog"/u, "unknown roles fall back to dialog");
  assert.equal((html.match(/data-open="/gu) || []).length, 2, "a domain may not redefine data-open on the root (the shell sets it once, extras come after)");
});

test("defaults, fallbacks and escaping", () => {
  const html = renderModalShell({ label: 'A "quoted" <title>', size: "huge", height: "tall", rootAttributes: { "bad name": 1, ok: true, skip: null, "data-x": '<"' } });
  assert.match(html, /data-modal-size="detail" data-modal-height="fixed"/u);
  assert.match(html, /aria-label="A &quot;quoted&quot; &lt;title&gt;"/u);
  assert.doesNotMatch(html, /aria-labelledby|aria-describedby|<footer|is-submitting/u);
  assert.match(html, / ok data-x="&lt;&quot;">/u, "boolean attributes render bare; invalid names and null values are dropped");
  assert.doesNotMatch(html, /bad name/u);
  assert.match(html, /<header class="ui-detail-modal-header" data-modal-header="true"><\/header>/u);
  assert.match(html, /<main class="ui-detail-modal-body" data-modal-body="true"><\/main>/u);
});

test("the close control and the common states belong to the shell", () => {
  const close = renderModalCloseButton({ label: "Cerrar detalle", className: "dom-close", attributes: { "data-detail-action": "detail-close" } });
  assert.match(close, /^<button type="button" class="ui-detail-modal-close-btn dom-close" data-modal-close="true" aria-label="Cerrar detalle" data-detail-action="detail-close"><svg /u);
  const loading = renderModalState({ kind: "loading", message: "INC-1" });
  assert.match(loading, /class="ui-detail-modal-state ui-detail-modal-state--loading" data-modal-state="loading" role="status" aria-live="polite" aria-busy="true"/u);
  assert.match(loading, /ui-detail-modal-spinner/u);
  const error = renderModalState({ kind: "error", title: "Fallo", message: "<b>x</b>", action: { label: "Reintentar", attributes: { "data-entity-overlay-action": "retry" } } });
  assert.match(error, /role="alert" aria-live="assertive"/u);
  assert.match(error, /&lt;b&gt;x&lt;\/b&gt;/u);
  assert.match(error, /<button type="button" class="ui-detail-modal-view-btn" data-entity-overlay-action="retry">Reintentar<\/button>/u);
  assert.doesNotMatch(error, /spinner|aria-busy/u);
  assert.match(renderModalState({ kind: "empty" }), /data-modal-state="empty" role="status"/u);
  assert.match(renderModalState({ kind: "weird" }), /data-modal-state="loading"/u);
});

test("the dispatcher's pending and failed sessions render through the shell", () => {
  const loading = renderDetailPending({ type: "factura", id: 'F<"1' });
  assert.match(loading, /data-modal-shell="ui-modal-shell\.v1" data-modal-size="compact" data-modal-height="auto"/u);
  assert.match(loading, /data-entity-overlay-pending="loading"/u);
  assert.match(loading, /data-modal-overlay="true" data-entity-overlay-backdrop="true"/u);
  assert.match(loading, /data-modal-panel="true" data-entity-overlay-panel="true"/u);
  assert.equal((loading.match(/data-entity-overlay-action="close"/gu) || []).length, 2, "close button and cancel action");
  assert.match(loading, /F&lt;&quot;1/u);
  assert.doesNotMatch(loading, /entity-overlay-backdrop"|entity-overlay-loading-panel|entity-overlay-generic/u);
  const failed = renderDetailPending({ type: "incidencia", id: "INC-1", error: "Sin red" });
  assert.match(failed, /data-entity-overlay-pending="error"/u);
  assert.match(failed, /role="alert"[^>]*>[\s\S]*Sin red/u);
  assert.match(failed, /data-entity-overlay-action="retry">Reintentar/u);
});

test("the lifecycle owns backdrop clicks and the dispatcher uses it", () => {
  const lifecycle = read("src/features/entity-overlay/modal-lifecycle.js");
  assert.match(lifecycle, /createModalLifecycle\(\{ getPanel, onEscape, onBackdrop, bodyClasses = \[\], onDetached \}/u);
  assert.match(lifecycle, /for \(const type of \['keydown', 'click'\]\) document\.addEventListener\(type, manager\.listener\);/u);
  assert.match(lifecycle, /for \(const type of \['keydown', 'click'\]\) manager\.document\.removeEventListener\(type, manager\.listener\);/u);
  assert.match(lifecycle, /event\.target !== panel\.parentElement\?\.closest\("\[data-modal-overlay='true'\]"\)\) return;/u, "only the exact shell backdrop dismisses");
  const dispatcher = read("src/features/entity-overlay/index.js");
  assert.match(dispatcher, /onBackdrop: \(\) => close\(\)/u);
  assert.doesNotMatch(dispatcher, /import "[^"]*\.css";/u, "the dispatcher no longer loads its own stylesheet");
  assert.doesNotMatch(dispatcher, /data-entity-overlay-backdrop='true'\]"\)/u, "no second backdrop handler");
  assert.doesNotMatch(dispatcher, /components\/detail-modal\.css/u, "the structural sheet is global, not per entity");
});

test("one structural stylesheet, loaded with the private area", () => {
  assert.equal(existsSync(resolve(ROOT, "src/css/features/entity-overlay.css")), false);
  const authority = read(AUTHORITY);
  assert.doesNotMatch(authority.replace(/\/\*[\s\S]*?\*\//gu, ""), /!important/u);
  assert.match(authority, /^@layer components \{/mu);
  for (const needle of [
    '.ui-detail-modal-root[data-modal-size="wide"]', '.ui-detail-modal-root[data-modal-size="form"]',
    '.ui-detail-modal-root[data-modal-size="compact"]', '.ui-detail-modal-root[data-modal-size="confirm"]',
    '.ui-detail-modal-root[data-modal-height="auto"] .ui-detail-modal-panel', ".ui-detail-modal-panel:has(> .ui-detail-modal-footer)",
    // On phones an auto (content-sized) panel fills the screen like every other dialog.
    '.ui-detail-modal-panel,\n.ui-detail-modal-root[data-modal-height="auto"] .ui-detail-modal-panel {\nblock-size: 100dvh;',
    ".ui-detail-modal-state--error", ".ui-detail-modal-spinner", ".entity-overlay-root:not([hidden])",
    // Narrow screens stack only a header that composes its own actions row; a
    // header whose close control is a direct child keeps it top-right.
    ".ui-detail-modal-header:not(:has(> .ui-detail-modal-close-btn))",
    ".ui-detail-modal-header > .ui-detail-modal-close-btn",
  ]) assert.ok(authority.includes(needle), needle);
  assert.doesNotMatch(authority, /^\.ui-detail-modal-header \{\s*grid-template-columns: minmax\(0, 1fr\);/mu, "no unconditional single-column header");
  assert.equal(read("src/css/app.css").split(IMPORT).length, 2, "app.css imports the authority once");
  assert.equal(read("src/css/private.css").split(IMPORT).length, 2, "private.css imports the authority once");
  assert.doesNotMatch(read("vite.config.js"), /detail-modal/u, "the private boundary is declared by private.css, never by tooling");
  assert.doesNotMatch(read("src/router/styles.js"), /detail-modal\.css/u, "no route loads the structural sheet on its own");
  for (const dir of ["src", "tools", ".github/scripts"]) {
    for (const file of cssFiles(dir).concat(walk(dir, /\.(?:m?js)$/u))) {
      if (file === "tools/modal-shell-contract.mjs") continue;
      assert.doesNotMatch(read(file), /features\/entity-overlay\.css/u, `${file} references the retired stylesheet`);
    }
  }
});

function walk(dir, pattern, out = []) {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, pattern, out);
    else if (pattern.test(entry.name)) out.push(path);
  }
  return out;
}

test("migrated dialogs render through the shell and emit no structure of their own", () => {
  for (const file of SHELL_CONSUMERS) {
    const source = read(file);
    assert.match(source, /import \{[^}]*\brenderModalShell\b[^}]*\} from "(?:\.\/|(?:\.\.\/)+features\/entity-overlay\/)modal-host\.js";/u, `${file} imports the shell`);
    for (const needle of ['role="dialog"', "ui-detail-modal-overlay", "ui-detail-modal-panel", "data-modal-overlay", "data-modal-panel"]) {
      assert.equal(source.includes(needle), false, `${file} emits ${needle} outside the shell`);
    }
  }
});

/* The structural skeleton of a rendered dialog: the shell's own elements and
   markers in document order, with the domain's content and identity removed. */
function structuralSkeleton(html) {
  return [...html.matchAll(/<(section|div|header|main|footer)\b([^>]*)>/gu)]
    .map(([, tag, attributes]) => {
      const markers = [...attributes.matchAll(/\b(data-modal-[a-z]+|role|aria-modal|tabindex|data-open)="([^"]*)"/gu)]
        .map(([, name, value]) => (name === "data-modal-size" || name === "data-modal-height") ? name : `${name}=${value}`);
      const shellClasses = [...attributes.matchAll(/\bui-detail-modal-(?:root|overlay|panel|header|body|footer)\b/gu)].map(([match]) => match);
      return markers.length || shellClasses.length ? `${tag}[${[...shellClasses, ...markers].join(" ")}]` : null;
    })
    .filter(Boolean);
}

test("Incidencias and Facturas share the shell's infrastructure and differ only in content", () => {
  const factura = { id: "F-1", facturaId: "F-1", numeroFacturaLegal: "2026/00001", total: 121, baseImponible: 100, cliente: { razonSocial: "ACME", email: "acme@example.test" }, estado: "emitida", paymentStatus: "pending" };
  const states = {
    loading: [renderIncidenciasDetailModal({ open: true, loading: true, loadingId: "INC-1" }), renderFacturasDetailModal({ open: true, loading: true })],
    error: [renderIncidenciasDetailModal({ open: true, error: "No tienes permiso", loadingId: "INC-1" }), renderFacturasDetailModal({ open: true, factura: null, feedbackMessage: "No tienes permiso" })],
  };
  for (const [state, [incidencias, facturas]] of Object.entries(states)) {
    const a = structuralSkeleton(incidencias);
    const b = structuralSkeleton(facturas);
    const pending = structuralSkeleton(renderDetailPending({ type: "factura", id: "F-1", error: state === "error" ? "No tienes permiso" : "" }));
    assert.deepEqual(a, b, `${state}: same structural skeleton`);
    assert.deepEqual(a, pending, `${state}: same skeleton as the dispatcher's pending surface`);
    assert.ok(a.some((entry) => entry.startsWith("div[ui-detail-modal-panel") && entry.includes("role=dialog") && entry.includes("aria-modal=true")), `${state}: one dialog panel`);
    assert.equal(a.filter((entry) => entry.includes("data-modal-body")).length, 1, `${state}: one body`);
    for (const html of [incidencias, facturas]) {
      assert.equal(html.split('data-modal-close="true"').length - 1, 1, `${state}: one close control from the shell`);
      assert.equal(html.split('data-modal-state="').length - 1, 1, `${state}: one shared state surface`);
    }
  }
  // The ready detail keeps the same shell; only the shared state surface goes away.
  const shellOnly = (entries) => entries.filter((entry) => !entry.includes("data-modal-state"));
  const ready = structuralSkeleton(renderFacturasDetailModal({ open: true, factura, admin: true }));
  assert.deepEqual(shellOnly(ready), shellOnly(structuralSkeleton(states.loading[1])), "ready: the same shell as its own loading state");
  assert.equal(ready.some((entry) => entry.includes("data-modal-state")), false, "ready: no state surface");
  assert.ok(renderFacturasDetailModal({ open: true, factura, admin: true }).includes('data-modal-size="wide"'), "Facturas declares its width as a shell variant");
});

test("every fixed layer outside the authority is inventoried: shells to migrate or non-dialog layers", () => {
  const seen = new Map();
  for (const file of [...cssFiles("src/css"), ...cssFiles("src/features")]) {
    if (file === AUTHORITY) continue;
    for (const selector of fixedSelectors(read(file))) seen.set(`${file} :: ${selector}`, { file, selector });
  }
  if (PRINT) for (const { file, selector } of seen.values()) console.log(`fixed | ${file} | ${selector}`);
  const unexpected = [...seen.values()].filter(({ file, selector }) => FIXED_INVENTORY.get(selector)?.file !== file).map(({ file, selector }) => `${file} :: ${selector}`);
  assert.deepEqual(unexpected, [], "a new position: fixed rule: a dialog shell belongs to the authority; a non-dialog layer needs an inventory entry with its reason");
  const stale = [...FIXED_INVENTORY].filter(([selector, { file }]) => !seen.has(`${file} :: ${selector}`)).map(([selector, { file }]) => `${file} :: ${selector}`);
  assert.deepEqual(stale, [], "an inventory entry no longer exists: remove it here and in the docs table");
});

test("structural shell classes are restyled only by the inventoried files", () => {
  const offenders = [];
  const present = new Set();
  for (const file of [...cssFiles("src/css"), ...cssFiles("src/features")]) {
    if (file === AUTHORITY) continue;
    if (!STRUCTURAL_CLASS.test(read(file).replace(/\/\*[\s\S]*?\*\//gu, ""))) continue;
    if (STRUCTURAL_OVERRIDE_FILES.has(file)) present.add(file);
    else offenders.push(file);
  }
  assert.deepEqual(offenders, [], "a stylesheet outside the inventory restyles ui-detail-modal root/overlay/panel/header/body/footer/close");
  assert.deepEqual([...STRUCTURAL_OVERRIDE_FILES.keys()].filter((file) => !present.has(file)), [], "inventory entry without overrides left: remove it");
});

test("registered in validate:source", () => {
  const scripts = JSON.parse(read("package.json")).scripts;
  assert.match(scripts["validate:source"], /node tools\/modal-shell-contract\.mjs(?:\s|$)/u);
});

let failed = 0;
for (const { name, fn } of tests) {
  try { await fn(); console.log(`OK   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}`); console.error(error); }
}
if (failed) { console.error(`modal-shell-contract: ${failed} failing check(s)`); process.exit(1); }
const pendingShells = [...FIXED_INVENTORY.values()].filter(({ kind }) => kind === "shell").length;
console.log(`Modal shell contract: PASS · ${tests.length} checks · ${SHELL_CONSUMERS.length} shell consumers · ${pendingShells} historical shells pending · ${STRUCTURAL_OVERRIDE_FILES.size} scoped overrides pending (${MODAL_SHELL_VERSION})`);
