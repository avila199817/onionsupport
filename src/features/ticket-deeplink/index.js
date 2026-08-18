/* =========================================================
   Onion Support - Ticket Mail Deep Link
   Archivo: /src/features/ticket-deeplink/index.js

   Responsabilidad:
   - Compatibilidad con enlaces históricos /tickets/<INC-...>.
   - Canonicalizar esos enlaces a /incidencias?ticketId=<INC-...>
     ANTES de que arranque el Router principal.
   - Abrir el modal existente de Incidencias usando el contrato DOM
     ya expuesto por la vista; no crea otro modal ni hace fetch propio.
   - Mantener el ticketId sólo en memoria/URL durante el arranque.
   - Limpiar ticketId de la URL cuando el modal ya está abierto.
   - Sin storage, sin Auth, sin API paralela.
========================================================= */

export const TICKET_DEEPLINK_VERSION =
  "ticket-deeplink.v1-mail-modal";

const CANONICAL_INCIDENCIAS_PATH =
  "/incidencias";

const LEGACY_TICKETS_PREFIX =
  "/tickets/";

const TICKET_ID_PATTERN =
  /^INC-[A-Z0-9-]{6,120}$/i;

const SEARCH_INPUT_SELECTOR =
  "[data-incidencias-search-input='true']";

const MODAL_ROOT_SELECTOR =
  "[data-incidencias-modal-root='true']";

const MAX_WAIT_MS = 20_000;

let ticketId = "";
let searchApplied = false;
let rowActivated = false;
let observer = null;
let timeoutId = 0;
let finished = false;

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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
  const id = cleanText(
    safeDecode(value)
  );

  return TICKET_ID_PATTERN.test(id)
    ? id.toUpperCase()
    : "";
}

function legacyTicketIdFromPath(pathname = "") {
  const path =
    cleanText(pathname, "");

  if (
    !path.toLowerCase().startsWith(
      LEGACY_TICKETS_PREFIX
    )
  ) {
    return "";
  }

  const suffix =
    path.slice(
      LEGACY_TICKETS_PREFIX.length
    );

  if (
    !suffix ||
    suffix.includes("/")
  ) {
    return "";
  }

  return normalizeTicketId(suffix);
}

function ticketIdFromUrl(url = null) {
  if (!url) {
    return "";
  }

  const legacy =
    legacyTicketIdFromPath(
      url.pathname
    );

  if (legacy) {
    return legacy;
  }

  return normalizeTicketId(
    url.searchParams.get("ticketId") ||
    url.searchParams.get("incidenciaId") ||
    ""
  );
}

function canonicalizeLegacyUrl() {
  if (!isBrowser()) {
    return "";
  }

  let url;

  try {
    url = new URL(
      window.location.href
    );
  } catch {
    return "";
  }

  const legacyId =
    legacyTicketIdFromPath(
      url.pathname
    );

  if (!legacyId) {
    return ticketIdFromUrl(url);
  }

  const next =
    new URL(
      window.location.href
    );

  next.pathname =
    CANONICAL_INCIDENCIAS_PATH;

  next.searchParams.set(
    "ticketId",
    legacyId
  );

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${next.pathname}${next.search}${next.hash}`
    );
  } catch {
    return legacyId;
  }

  return legacyId;
}

function cssEscape(value = "") {
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.escape === "function"
  ) {
    return CSS.escape(value);
  }

  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function exactTicketRow(id = "") {
  if (!id) {
    return null;
  }

  const escaped =
    cssEscape(id);

  return (
    document.querySelector(
      `[data-ticket-row='true'][data-ticket-id="${escaped}"]`
    ) ||
    document.querySelector(
      `[data-incidencia-row='true'][data-incidencia-id="${escaped}"]`
    ) ||
    null
  );
}

function modalIsOpen() {
  return Boolean(
    document.querySelector(
      MODAL_ROOT_SELECTOR
    )
  );
}

function applyTicketSearch(id = "") {
  if (
    !id ||
    searchApplied
  ) {
    return false;
  }

  const input =
    document.querySelector(
      SEARCH_INPUT_SELECTOR
    );

  if (!input) {
    return false;
  }

  searchApplied = true;

  try {
    input.value = id;

    input.dispatchEvent(
      new Event(
        "input",
        {
          bubbles: true,
          composed: true,
        }
      )
    );

    return true;
  } catch {
    return false;
  }
}

function activateTicketRow(id = "") {
  if (
    !id ||
    rowActivated
  ) {
    return false;
  }

  const row =
    exactTicketRow(id);

  if (!row) {
    return false;
  }

  rowActivated = true;

  try {
    row.click();
    return true;
  } catch {
    try {
      row.dispatchEvent(
        new MouseEvent(
          "click",
          {
            bubbles: true,
            cancelable: true,
            composed: true,
          }
        )
      );

      return true;
    } catch {
      rowActivated = false;
      return false;
    }
  }
}

function cleanTicketQueryFromUrl() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const url =
      new URL(
        window.location.href
      );

    url.searchParams.delete(
      "ticketId"
    );

    url.searchParams.delete(
      "incidenciaId"
    );

    const search =
      url.searchParams.toString();

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
  if (finished) {
    return false;
  }

  finished = true;

  try {
    observer?.disconnect?.();
  } catch {
    // noop
  }

  observer = null;

  if (timeoutId) {
    try {
      window.clearTimeout(
        timeoutId
      );
    } catch {
      // noop
    }

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
  if (
    finished ||
    !ticketId ||
    !isBrowser()
  ) {
    return false;
  }

  if (modalIsOpen()) {
    return finishSuccess();
  }

  if (
    activateTicketRow(
      ticketId
    )
  ) {
    return true;
  }

  applyTicketSearch(
    ticketId
  );

  return false;
}

function startObserver() {
  if (
    !isBrowser() ||
    !ticketId ||
    finished
  ) {
    return false;
  }

  attemptOpen();

  if (finished) {
    return true;
  }

  observer =
    new MutationObserver(() => {
      attemptOpen();
    });

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-ticket-id",
        "data-incidencia-id",
        "data-incidencias-modal-root",
      ],
    }
  );

  timeoutId =
    window.setTimeout(() => {
      /*
        Si no se pudo abrir, conservamos ticketId en la URL.
        Así un refresh o un login posterior puede volver a intentarlo.
      */
      stop();
    }, MAX_WAIT_MS);

  return true;
}

function boot() {
  if (!isBrowser()) {
    return false;
  }

  ticketId =
    canonicalizeLegacyUrl();

  if (!ticketId) {
    try {
      ticketId =
        ticketIdFromUrl(
          new URL(
            window.location.href
          )
        );
    } catch {
      ticketId = "";
    }
  }

  if (!ticketId) {
    return false;
  }

  startObserver();
  return true;
}

boot();

export function getTicketDeeplinkSnapshot() {
  return Object.freeze({
    version:
      TICKET_DEEPLINK_VERSION,
    active:
      Boolean(ticketId),
    searchApplied,
    rowActivated,
    modalOpen:
      isBrowser()
        ? modalIsOpen()
        : false,
    finished,
  });
}

export default Object.freeze({
  version:
    TICKET_DEEPLINK_VERSION,
  getSnapshot:
    getTicketDeeplinkSnapshot,
});
