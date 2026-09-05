/* =========================================================
   Onion Support · Facturas · Filter Count Parity
   Archivo: /src/features/facturas-filter-counts/index.js

   Responsabilidad:
   - Igualar visualmente los filtros de Facturas con Incidencias.
   - Mostrar un badge numérico en Todas, Pendientes, Pagadas y Vencidas.
   - Reutilizar los KPIs ya renderizados por la vista como autoridad de conteo.
   - Mantener los badges sincronizados tras refresh, filtros y rerenders SPA.
   - Aplicar la sincronización antes del siguiente paint para evitar flicker.
   - No interceptar clicks, no redisparar eventos y no alterar lógica de negocio.
========================================================= */

export const FACTURAS_FILTER_COUNTS_VERSION =
  "facturas.filter-counts.v2.pre-paint-stable";

const VIEW_HOST_SELECTOR = "[data-view-container='true'], #view-container";
const ROOT_SELECTOR = ".facturas-view-root, [data-facturas-scope='true']";
const FILTER_SELECTOR = ".facturas-filter-pill[data-filter]";
const VALUE_SELECTOR = ".facturas-stat-value";
const OWN_BADGE_SELECTOR = "strong[data-facturas-filter-count='true']";

const COUNT_CARD_SELECTORS = Object.freeze({
  all: ".facturas-stat-card--accent",
  pending: ".facturas-stat-card--warning",
  balance: ".facturas-stat-card--danger",
});

let installed = false;
let observer = null;
let observedHost = null;
let syncRuns = 0;
let ignoredMutations = 0;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function viewHost() {
  return isBrowser() ? document.querySelector(VIEW_HOST_SELECTOR) : null;
}

function viewRoot() {
  return viewHost()?.querySelector?.(ROOT_SELECTOR) || null;
}

function parseCount(value = "") {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  const match = normalized.match(/\d[\d.]*/);
  if (!match) return null;

  const parsed = Number.parseInt(match[0].replace(/\./g, ""), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function cardValue(root = null, selector = "") {
  return root
    ?.querySelector?.(selector)
    ?.querySelector?.(VALUE_SELECTOR)
    ?.textContent || "";
}

export function readFacturasFilterCounts(root = viewRoot()) {
  if (!root) return null;

  const all = parseCount(cardValue(root, COUNT_CARD_SELECTORS.all));
  const pending = parseCount(cardValue(root, COUNT_CARD_SELECTORS.pending));
  const balance = cardValue(root, COUNT_CARD_SELECTORS.balance)
    .split("/")
    .map((part) => parseCount(part));

  const overdue = balance[0] ?? null;
  const paid = balance[1] ?? null;

  if ([all, pending, paid, overdue].some((value) => value === null)) {
    return null;
  }

  return Object.freeze({ all, pending, paid, overdue });
}

function directCountBadge(button = null) {
  if (!button) return null;

  for (const child of button.children || []) {
    if (child?.matches?.(OWN_BADGE_SELECTOR)) return child;
    if (child?.tagName === "STRONG") return child;
  }

  return null;
}

function syncButton(button = null, count = 0) {
  if (!button) return false;

  let badge = directCountBadge(button);
  if (!badge) {
    badge = document.createElement("strong");
    badge.dataset.facturasFilterCount = "true";
    button.append(badge);
  } else if (badge.dataset?.facturasFilterCount !== "true") {
    badge.dataset.facturasFilterCount = "true";
  }

  const next = String(Math.max(0, Number(count) || 0));
  if (badge.textContent !== next) badge.textContent = next;

  return true;
}

export function syncFacturasFilterCounts(root = viewRoot()) {
  if (!root) return false;

  const counts = readFacturasFilterCounts(root);
  if (!counts) return false;

  let synced = 0;
  for (const button of root.querySelectorAll(FILTER_SELECTOR)) {
    const key = String(button?.dataset?.filter || "").trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(counts, key)) continue;
    if (syncButton(button, counts[key])) synced += 1;
  }

  if (synced > 0) syncRuns += 1;
  return synced > 0;
}

function isElementNode(node = null) {
  return Boolean(node && node.nodeType === 1);
}

function isOwnBadgeNode(node = null) {
  return Boolean(isElementNode(node) && node.matches?.(OWN_BADGE_SELECTOR));
}

function mutationOnlyContainsOwnBadges(mutation = null) {
  const added = Array.from(mutation?.addedNodes || []);
  const removed = Array.from(mutation?.removedNodes || []);

  return Boolean(
    added.length > 0 &&
    removed.length === 0 &&
    added.every(isOwnBadgeNode)
  );
}

function mutationTouchesFacturas(mutation = null, root = null) {
  if (!mutation || mutation.type !== "childList") return false;
  if (mutationOnlyContainsOwnBadges(mutation)) return false;

  const target = mutation.target;
  if (isElementNode(target) && (target === root || target.closest?.(ROOT_SELECTOR))) {
    return true;
  }

  const nodes = [
    ...Array.from(mutation.addedNodes || []),
    ...Array.from(mutation.removedNodes || []),
  ];

  return nodes.some((node) => {
    if (!isElementNode(node)) return false;
    return Boolean(
      node.matches?.(ROOT_SELECTOR) ||
      node.matches?.(FILTER_SELECTOR) ||
      node.querySelector?.(ROOT_SELECTOR) ||
      node.querySelector?.(FILTER_SELECTOR)
    );
  });
}

function onMutations(mutations = []) {
  const root = viewRoot();
  if (!root) return;

  const relevant = mutations.some((mutation) =>
    mutationTouchesFacturas(mutation, root)
  );

  if (!relevant) {
    ignoredMutations += mutations.length;
    return;
  }

  /*
    MutationObserver se ejecuta al cierre del microtask y antes del siguiente
    render del navegador. Sin requestAnimationFrame no existe un frame intermedio
    donde los filtros aparezcan sin conteo, eliminando el parpadeo al filtrar.
  */
  syncFacturasFilterCounts(root);

  /*
    Descartamos únicamente los records generados por nuestros propios <strong>.
    Así evitamos una segunda vuelta del observer sin silenciar mutaciones reales.
  */
  const pending = observer?.takeRecords?.() || [];
  ignoredMutations += pending.filter(mutationOnlyContainsOwnBadges).length;

  const externalPending = pending.filter(
    (mutation) => !mutationOnlyContainsOwnBadges(mutation)
  );

  if (externalPending.some((mutation) => mutationTouchesFacturas(mutation, root))) {
    syncFacturasFilterCounts(root);
  }
}

export function installFacturasFilterCounts() {
  if (!isBrowser() || installed) return false;

  const host = viewHost();
  if (!host || typeof MutationObserver !== "function") return false;

  installed = true;
  observedHost = host;

  /* Primer paint estable cuando la feature se monta sobre una vista ya lista. */
  syncFacturasFilterCounts();

  observer = new MutationObserver(onMutations);
  observer.observe(host, {
    childList: true,
    subtree: true,
  });

  return true;
}

export function destroyFacturasFilterCounts() {
  if (!installed) return false;

  installed = false;
  observer?.disconnect?.();
  observer = null;
  observedHost = null;

  return true;
}

installFacturasFilterCounts();

export const FacturasFilterCounts = Object.freeze({
  version: FACTURAS_FILTER_COUNTS_VERSION,
  install: installFacturasFilterCounts,
  destroy: destroyFacturasFilterCounts,
  sync: syncFacturasFilterCounts,
  read: readFacturasFilterCounts,
  getSnapshot() {
    return Object.freeze({
      installed,
      observing: Boolean(observer && observedHost?.isConnected),
      counts: readFacturasFilterCounts(),
      syncRuns,
      ignoredMutations,
      scheduledFrames: 0,
      clickInterception: false,
      dispatchedEvents: 0,
    });
  },
});

export default FacturasFilterCounts;
