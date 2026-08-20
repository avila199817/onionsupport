/* =========================================================
   Onion Support - Ticket Mail Deep Link
   Archivo: /src/features/ticket-deeplink/index.js

   Responsabilidad:
   - Compatibilidad con enlaces históricos /tickets/<INC-...>.
   - Canonicalizar a /incidencias?ticketId=<INC-...> antes del Router.
   - Abrir el modal canónico de Incidencias sin HTTP ni UI paralela.
   - Mantener ticketId únicamente en memoria/URL.
   - Observar sólo el mount del Router mientras existe un deeplink pendiente.
========================================================= */

export const TICKET_DEEPLINK_VERSION =
  "ticket-deeplink.v2-router-view-observer";

const CANONICAL_INCIDENCIAS_PATH = "/incidencias";
const LEGACY_TICKETS_PREFIX = "/tickets/";
const TICKET_ID_PATTERN = /^INC-[A-Z0-9-]{6,120}$/i;

const VIEW_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const SEARCH_INPUT_SELECTOR = "[data-incidencias-search-input='true']";
const MODAL_ROOT_SELECTOR = "[data-incidencias-modal-root='true']";
const MAX_WAIT_MS = 20_000;

let ticketId = "";
let searchApplied = false;
let rowActivated = false;
let observer = null;
let timeoutId = 0;
let finished = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDecode(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeTicketId(value = "") {
  const id = cleanText(safeDecode(value));
  return TICKET_ID_PATTERN.test(id) ? id.toUpperCase() : "";
}

function legacyTicketIdFromPath(pathname = "") {
  const path = cleanText(pathname);
  if (!path.toLowerCase().startsWith(LEGACY_TICKETS_PREFIX)) return "";

  const suffix = path.slice(LEGACY_TICKETS_PREFIX.length);
  if (!suffix || suffix.includes("/")) return "";
  return normalizeTicketId(suffix);
}

function ticketIdFromUrl(url = null) {
  if (!url) return "";

  return (
    legacyTicketIdFromPath(url.pathname) ||
    normalizeTicketId(
      url.searchParams.get("ticketId") ||
      url.searchParams.get("incidenciaId") ||
      ""
    )
  );
}

function currentUrl() {
  if (!isBrowser()) return null;

  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

function canonicalizeLegacyUrl() {
  const url = currentUrl();
  if (!url) return "";

  const legacyId = legacyTicketIdFromPath(url.pathname);
  if (!legacyId) return ticketIdFromUrl(url);

  url.pathname = CANONICAL_INCIDENCIAS_PATH;
  url.searchParams.set("ticketId", legacyId);

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch {
    // La canonicalización visual no debe impedir que el Router reciba el id.
  }

  return legacyId;
}

function cssEscape(value = "") {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function viewRoot() {
  return isBrowser() ? document.querySelector(VIEW_ROOT_SELECTOR) : null;
}

function exactTicketRow(id = "", root = viewRoot()) {
  if (!id || !root) return null;

  const escaped = cssEscape(id);
  return (
    root.querySelector(
      `[data-ticket-row='true'][data-ticket-id="${escaped}"]`
    ) ||
    root.querySelector(
      `[data-incidencia-row='true'][data-incidencia-id="${escaped}"]`
    ) ||
    null
  );
}

function modalIsOpen(root = viewRoot()) {
  return Boolean(root?.querySelector?.(MODAL_ROOT_SELECTOR));
}

function applyTicketSearch(id = "", root = viewRoot()) {
  if (!id || searchApplied || !root) return false;

  const input = root.querySelector(SEARCH_INPUT_SELECTOR);
  if (!input) return false;

  try {
    input.value = id;
    input.dispatchEvent(
      new Event("input", {
        bubbles: true,
        composed: true,
      })
    );
    searchApplied = true;
    return true;
  } catch {
    return false;
  }
}

function activateTicketRow(id = "", root = viewRoot()) {
  if (!id || rowActivated || !root) return false;

  const row = exactTicketRow(id, root);
  if (!row) return false;

  try {
    row.click();
    rowActivated = true;
    return true;
  } catch {
    try {
      row.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
      rowActivated = true;
      return true;
    } catch {
      return false;
    }
  }
}

function cleanTicketQueryFromUrl() {
  const url = currentUrl();
  if (!url) return false;

  url.searchParams.delete("ticketId");
  url.searchParams.delete("incidenciaId");

  try {
    const search = url.searchParams.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${search ? `?${search}` : ""}${url.hash}`
    );
    return true;
  } catch {
    return false;
  }
}

function stop() {
  if (finished) return false;
  finished = true;

  observer?.disconnect?.();
  observer = null;

  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutId = 0;
  }

  return true;
}

function finishSuccess() {
  cleanTicketQueryFromUrl();
  stop();
  return true;
}

function attemptOpen() {
  if (finished || !ticketId || !isBrowser()) return false;

  const root = viewRoot();
  if (!root) return false;

  if (modalIsOpen(root)) return finishSuccess();
  if (activateTicketRow(ticketId, root)) return true;

  applyTicketSearch(ticketId, root);
  return false;
}

function startObserver() {
  if (!isBrowser() || !ticketId || finished) return false;

  const root = viewRoot();
  if (!root) return false;

  attemptOpen();
  if (finished) return true;

  observer = new MutationObserver(() => {
    attemptOpen();
  });

  /*
    Las filas, resultados y el modal entran como nodos del Router view.
    No hace falta observar atributos ni todo documentElement.
  */
  observer.observe(root, {
    childList: true,
    subtree: true,
  });

  timeoutId = window.setTimeout(() => {
    /*
      Si no se pudo abrir, el query permanece en la URL. Un refresh posterior
      vuelve a activar el deeplink sin persistir nada en storage.
    */
    stop();
  }, MAX_WAIT_MS);

  return true;
}

function boot() {
  if (!isBrowser()) return false;

  ticketId = canonicalizeLegacyUrl();
  if (!ticketId) return false;

  return startObserver();
}

boot();

export function getTicketDeeplinkSnapshot() {
  return Object.freeze({
    version: TICKET_DEEPLINK_VERSION,
    active: Boolean(ticketId),
    searchApplied,
    rowActivated,
    modalOpen: isBrowser() ? modalIsOpen() : false,
    finished,
  });
}

export default Object.freeze({
  version: TICKET_DEEPLINK_VERSION,
  getSnapshot: getTicketDeeplinkSnapshot,
});
