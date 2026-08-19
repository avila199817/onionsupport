/* =========================================================
   Onion Support - Mobile DataList
   Archivo: /src/features/mobile-datalist/index.js

   Responsabilidad:
   - Anotar los listados tabulares privados para su composición móvil.
   - Leer labels de <thead> en vez de duplicar textos en CSS/JS.
   - Mantener el DOM/acciones originales de cada vista.
   - Reaplicar la anotación después de renders completos o parciales.
   - Sin API, Auth, Router, Store ni lógica de dominio.
========================================================= */

export const MOBILE_DATALIST_VERSION =
  "mobile-datalist.v1-semantic-table-card-composition";

const VIEW_CONTAINER_SELECTOR =
  "#view-container, [data-view-container='true']";

const CONFIGS = Object.freeze([
  Object.freeze({
    layout: "incidencias",
    selector: ".incidencias-table",
    shellSelector: ".incidencias-table-shell",
    slots: Object.freeze([
      "primary",
      "status",
      "created",
      "updated",
      "amount",
      "attachments",
    ]),
  }),

  Object.freeze({
    layout: "facturas",
    selector: ".facturas-table",
    shellSelector: ".facturas-table-shell",
    slots: Object.freeze([
      "primary",
      "status",
      "date",
      "amount",
      "relation",
      "actions",
    ]),
  }),

  Object.freeze({
    layout: "clientes",
    selector: ".clientes-table",
    shellSelector: ".clientes-table-shell",
    slots: Object.freeze([
      "primary",
      "status",
      "date",
      "contact",
      "amount",
    ]),
  }),

  Object.freeze({
    layout: "usuarios",
    selector: ".usuarios-table",
    shellSelector: ".usuarios-table-shell",
    slots: Object.freeze([
      "primary",
      "status",
      "date",
      "email",
      "location",
      "activity",
    ]),
  }),
]);

let initialized = false;
let observer = null;
let scheduled = false;
let scheduledRoot = null;

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectorMatches(node, selector = "") {
  return Boolean(
    node &&
    node.nodeType === 1 &&
    typeof node.matches === "function" &&
    node.matches(selector)
  );
}

function nodeTouchesTable(node, selector = "") {
  if (!node || node.nodeType !== 1 || !selector) return false;

  return Boolean(
    selectorMatches(node, selector) ||
    node.closest?.(selector) ||
    node.querySelector?.(selector)
  );
}

function tablesInside(root, selector = "") {
  if (!root || !selector) return [];

  const output = [];

  if (selectorMatches(root, selector)) {
    output.push(root);
  }

  const closest = root.nodeType === 1
    ? root.closest?.(selector)
    : null;

  if (closest) {
    output.push(closest);
  }

  if (typeof root.querySelectorAll === "function") {
    output.push(...root.querySelectorAll(selector));
  }

  return Array.from(new Set(output));
}

function getHeaderLabels(table) {
  const cells = Array.from(
    table?.querySelectorAll?.("thead th") ||
    []
  );

  return cells.map((cell) =>
    cleanText(cell.textContent)
  );
}

function enhanceCell(cell, {
  slot = "meta",
  label = "",
  index = 0,
} = {}) {
  if (!cell?.classList) return false;

  cell.classList.add("ui-datalist-cell");
  cell.dataset.mobileSlot = slot || "meta";
  cell.dataset.mobileLabel = slot === "primary" || slot === "actions"
    ? ""
    : cleanText(label);
  cell.dataset.mobileIndex = String(index);

  if (slot === "actions") {
    const actions = cell.firstElementChild;
    if (actions?.classList) {
      actions.classList.add("ui-datalist-actions");
    }
  }

  return true;
}

function enhanceRow(row, config, labels = []) {
  if (!row?.classList || !config) return false;

  row.classList.add("ui-datalist-row");
  row.dataset.mobileCard = "true";

  const cells = Array.from(row.children || [])
    .filter((cell) =>
      cell?.tagName === "TD" ||
      cell?.tagName === "TH"
    );

  cells.forEach((cell, index) => {
    enhanceCell(cell, {
      slot: config.slots[index] || "meta",
      label: labels[index] || cell.dataset?.column || "",
      index,
    });
  });

  return true;
}

function enhanceTable(table, config) {
  if (!table?.classList || !config) return false;

  table.classList.add("ui-datalist");
  table.dataset.mobileDatalist = "true";
  table.dataset.mobileDatalistLayout = config.layout;
  table.dataset.mobileDatalistVersion = MOBILE_DATALIST_VERSION;

  const shell = table.closest?.(config.shellSelector);
  if (shell?.classList) {
    shell.classList.add("ui-datalist-shell");
    shell.dataset.mobileDatalistShell = "true";
  }

  const labels = getHeaderLabels(table);

  Array.from(table.tBodies || []).forEach((tbody) => {
    tbody.classList.add("ui-datalist-body");
    tbody.dataset.mobileDatalistBody = "true";

    Array.from(tbody.rows || []).forEach((row) => {
      enhanceRow(row, config, labels);
    });
  });

  return true;
}

export function enhanceMobileDataLists(root = null) {
  if (!isBrowser()) return 0;

  const scope = root || document;
  let count = 0;

  CONFIGS.forEach((config) => {
    tablesInside(scope, config.selector).forEach((table) => {
      if (enhanceTable(table, config)) {
        count += 1;
      }
    });
  });

  return count;
}

function flushEnhancement() {
  scheduled = false;

  const root = scheduledRoot;
  scheduledRoot = null;

  enhanceMobileDataLists(root || document);
}

function scheduleEnhancement(root = null) {
  if (!isBrowser()) return false;

  scheduledRoot = root || scheduledRoot || document;

  if (scheduled) return true;
  scheduled = true;

  window.requestAnimationFrame(flushEnhancement);
  return true;
}

function attachObserver() {
  if (!isBrowser() || observer) return false;

  const container =
    document.querySelector(VIEW_CONTAINER_SELECTOR);

  if (!container) return false;

  observer = new MutationObserver((mutations) => {
    let needsEnhancement = false;

    for (const mutation of mutations) {
      if (mutation.type !== "childList" || !mutation.addedNodes.length) {
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        if (
          CONFIGS.some((config) =>
            nodeTouchesTable(node, config.selector)
          )
        ) {
          needsEnhancement = true;
          break;
        }
      }

      if (needsEnhancement) break;
    }

    if (needsEnhancement) {
      scheduleEnhancement(container);
    }
  });

  observer.observe(container, {
    childList: true,
    subtree: true,
  });

  return true;
}

export function initMobileDataList() {
  if (!isBrowser() || initialized) return MOBILE_DATALIST;

  initialized = true;
  enhanceMobileDataLists(document);
  attachObserver();

  window.addEventListener("pageshow", onPageShow);

  return MOBILE_DATALIST;
}

function onPageShow() {
  scheduleEnhancement(
    document.querySelector(VIEW_CONTAINER_SELECTOR) ||
    document
  );
}

export function destroyMobileDataList() {
  if (!isBrowser() || !initialized) return MOBILE_DATALIST;

  observer?.disconnect?.();
  observer = null;

  window.removeEventListener("pageshow", onPageShow);

  scheduled = false;
  scheduledRoot = null;
  initialized = false;

  return MOBILE_DATALIST;
}

export function getMobileDataListSnapshot() {
  if (!isBrowser()) {
    return Object.freeze({
      version: MOBILE_DATALIST_VERSION,
      initialized: false,
      tables: 0,
      layouts: [],
    });
  }

  const tables = Array.from(
    document.querySelectorAll(
      "[data-mobile-datalist='true']"
    )
  );

  return Object.freeze({
    version: MOBILE_DATALIST_VERSION,
    initialized,
    tables: tables.length,
    layouts: Array.from(
      new Set(
        tables
          .map((table) => table.dataset.mobileDatalistLayout)
          .filter(Boolean)
      )
    ),
  });
}

export const MOBILE_DATALIST = Object.freeze({
  version: MOBILE_DATALIST_VERSION,
  init: initMobileDataList,
  destroy: destroyMobileDataList,
  enhance: enhanceMobileDataLists,
  getSnapshot: getMobileDataListSnapshot,
});

initMobileDataList();

export default MOBILE_DATALIST;
