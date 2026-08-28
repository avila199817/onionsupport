/* =========================================================
   Onion Support - Incidencia Canonical Deep Link

   Contrato:
   - URL canónica compartible: /@{slug}/incidencias/<INC-ID>.
   - Un deeplink de incidencia abre la vista propietaria Incidencias y su
     controller/modal canónico, con Histórico, adjuntos, edición y cierre.
   - El overlay global queda reservado para aperturas rápidas desde otras vistas.
   - Mantiene compatibilidad con /tickets/<INC-ID>, /incidencias/<INC-ID>,
     ?ticketId=..., ?incidenciaId=... y ?entity=incidencia&entityId=....
   - Sin clicks sintéticos, sin búsqueda de filas y sin HTTP propio.
========================================================= */

export const TICKET_DEEPLINK_VERSION =
  "ticket-deeplink.v4-canonical-owner-modal";

const INCIDENCIAS_PATH = "/incidencias";
const LEGACY_TICKETS_PREFIX = "/tickets/";
const TICKET_ID_PATTERN = /^INC-[A-Z0-9-]{6,120}$/i;
const SCOPED_DETAIL_PATTERN = /^\/@([^/]+)\/incidencias\/([^/?#]+)\/?$/i;
const UNSCOPED_DETAIL_PATTERN = /^\/incidencias\/([^/?#]+)\/?$/i;
const VIEW_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const MODAL_ROOT_SELECTOR = "[data-incidencias-modal-root='true']";
const MAX_WAIT_MS = 20_000;

let ticketId = "";
let source = "";
let observer = null;
let observerInstallHandler = null;
let timeoutId = 0;
let attemptPromise = null;
let modalOpened = false;
let finished = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDecode(value = "") {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
}

function normalizeTicketId(value = "") {
  const id = cleanText(safeDecode(value));
  return TICKET_ID_PATTERN.test(id) ? id.toUpperCase() : "";
}

function currentUrl() {
  if (!isBrowser()) return null;

  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

function scopedDetailFromPath(pathname = "") {
  const match = cleanText(pathname).match(SCOPED_DETAIL_PATTERN);
  const id = normalizeTicketId(match?.[2] || "");

  return id
    ? {
        slug: cleanText(match?.[1], ""),
        id,
      }
    : null;
}

function unscopedDetailFromPath(pathname = "") {
  const match = cleanText(pathname).match(UNSCOPED_DETAIL_PATTERN);
  return normalizeTicketId(match?.[1] || "");
}

function legacyTicketFromPath(pathname = "") {
  const path = cleanText(pathname);
  if (!path.toLowerCase().startsWith(LEGACY_TICKETS_PREFIX)) return "";

  const suffix = path.slice(LEGACY_TICKETS_PREFIX.length);
  if (!suffix || suffix.includes("/")) return "";
  return normalizeTicketId(suffix);
}

function queryTicket(url = null) {
  if (!url) return "";

  return normalizeTicketId(
    url.searchParams.get("ticketId") ||
    url.searchParams.get("incidenciaId") ||
    (
      url.searchParams.get("entity") === "incidencia"
        ? url.searchParams.get("entityId")
        : ""
    ) ||
    ""
  );
}

function scopedBase(pathname = "") {
  const match = cleanText(pathname).match(/^\/@([^/]+)(?:\/incidencias)?\/?$/i);
  return match?.[1]
    ? `/@${match[1]}`
    : "";
}

function clearLegacyQuery(url = null) {
  if (!url) return false;
  url.searchParams.delete("ticketId");
  url.searchParams.delete("incidenciaId");
  url.searchParams.delete("entity");
  url.searchParams.delete("entityId");
  return true;
}

function replaceUrl(url = null) {
  if (!url || !isBrowser()) return false;

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    return true;
  } catch {
    return false;
  }
}

function resolveAndCanonicalize() {
  const url = currentUrl();
  if (!url) return "";

  const scoped = scopedDetailFromPath(url.pathname);
  if (scoped?.id) {
    source = "scoped-detail";
    clearLegacyQuery(url);
    replaceUrl(url);
    return scoped.id;
  }

  const unscoped = unscopedDetailFromPath(url.pathname);
  if (unscoped) {
    source = "unscoped-detail";
    clearLegacyQuery(url);
    replaceUrl(url);
    return unscoped;
  }

  const legacy = legacyTicketFromPath(url.pathname);
  if (legacy) {
    source = "legacy-ticket-path";
    url.pathname = `${INCIDENCIAS_PATH}/${legacy}`;
    clearLegacyQuery(url);
    replaceUrl(url);
    return legacy;
  }

  const queryId = queryTicket(url);
  if (!queryId) return "";

  source = "legacy-query";
  const base = scopedBase(url.pathname);
  url.pathname = base
    ? `${base}${INCIDENCIAS_PATH}/${queryId}`
    : `${INCIDENCIAS_PATH}/${queryId}`;
  clearLegacyQuery(url);
  replaceUrl(url);
  return queryId;
}

function viewRoot() {
  return isBrowser()
    ? document.querySelector(VIEW_ROOT_SELECTOR)
    : null;
}

function modalIsOpen(root = viewRoot()) {
  return Boolean(root?.querySelector?.(MODAL_ROOT_SELECTOR));
}

function baseIncidenciasPath(pathname = "") {
  const scoped = scopedDetailFromPath(pathname);
  if (scoped?.slug) {
    return `/@${scoped.slug}${INCIDENCIAS_PATH}`;
  }

  return INCIDENCIAS_PATH;
}

function cleanUrlAfterClose() {
  const url = currentUrl();
  if (!url) return false;

  url.pathname = baseIncidenciasPath(url.pathname);
  clearLegacyQuery(url);
  return replaceUrl(url);
}

function stop() {
  if (finished) return false;
  finished = true;

  observer?.disconnect?.();
  observer = null;

  if (observerInstallHandler) {
    window.removeEventListener("onion:main:ready", observerInstallHandler);
    observerInstallHandler = null;
  }

  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutId = 0;
  }

  return true;
}

async function attemptOpen() {
  if (finished || !ticketId || !isBrowser()) return false;
  if (attemptPromise) return attemptPromise;

  attemptPromise = (async () => {
    try {
      const module = await import("../../views/incidencias/index.js");
      const open = module?.openIncidenciaDetailById;
      if (typeof open !== "function") return false;

      const opened = await open(ticketId, null);
      if (!opened) return false;

      modalOpened = true;
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    attemptPromise = null;
  });

  return attemptPromise;
}

function onMutation() {
  if (finished) return;

  if (!modalOpened) {
    void attemptOpen();
    return;
  }

  if (!modalIsOpen()) {
    cleanUrlAfterClose();
    stop();
  }
}

function installObserver() {
  if (!isBrowser() || !ticketId || finished) return false;
  if (observer) return true;

  const root = viewRoot();
  if (!root) return false;

  observer = new MutationObserver(onMutation);
  observer.observe(root, {
    childList: true,
    subtree: true,
  });

  void attemptOpen();

  timeoutId = window.setTimeout(() => {
    stop();
  }, MAX_WAIT_MS);

  return true;
}

function scheduleObserver() {
  if (!ticketId || !isBrowser()) return false;
  if (installObserver()) return true;

  if (!observerInstallHandler) {
    observerInstallHandler = () => {
      observerInstallHandler = null;
      installObserver();
      void attemptOpen();
    };

    window.addEventListener(
      "onion:main:ready",
      observerInstallHandler,
      { once: true }
    );
  }

  return false;
}

ticketId = resolveAndCanonicalize();
scheduleObserver();

export function destroyTicketDeeplink() {
  if (!isBrowser()) return false;
  return stop();
}

export function getTicketDeeplinkSnapshot() {
  return Object.freeze({
    version: TICKET_DEEPLINK_VERSION,
    active: Boolean(ticketId),
    ticketId: ticketId ? "***" : "",
    source,
    modalOpened,
    modalOpen: isBrowser() ? modalIsOpen() : false,
    finished,
    strategy: "canonical-owner-modal",
  });
}

export default Object.freeze({
  version: TICKET_DEEPLINK_VERSION,
  getSnapshot: getTicketDeeplinkSnapshot,
  destroy: destroyTicketDeeplink,
});
