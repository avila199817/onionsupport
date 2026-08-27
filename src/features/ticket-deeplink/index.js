/* =========================================================
   Onion Support - Ticket Deep Link -> Global Entity Overlay

   Mantiene enlaces históricos, pero ya no monta Incidencias, no busca filas y
   no simula clicks. Sólo expresa una intención de entidad en la URL; el overlay
   privado la resuelve cuando Auth y AppCore están listos.
========================================================= */

export const TICKET_DEEPLINK_VERSION =
  "ticket-deeplink.v3-global-entity-intent";

const LEGACY_TICKETS_PREFIX = "/tickets/";
const PRIVATE_HOME_PATH = "/dashboard";
const TICKET_ID_PATTERN = /^INC-[A-Z0-9-]{6,120}$/i;
const ENTITY_TYPE = "incidencia";

let ticketId = "";
let legacyPath = false;
let canonicalized = false;

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

function ticketFromLegacyPath(pathname = "") {
  const path = cleanText(pathname);
  if (!path.toLowerCase().startsWith(LEGACY_TICKETS_PREFIX)) return "";

  const suffix = path.slice(LEGACY_TICKETS_PREFIX.length);
  if (!suffix || suffix.includes("/")) return "";
  return normalizeTicketId(suffix);
}

function resolveTicket(url = null) {
  if (!url) return "";

  return (
    ticketFromLegacyPath(url.pathname) ||
    normalizeTicketId(
      url.searchParams.get("ticketId") ||
      url.searchParams.get("incidenciaId") ||
      (url.searchParams.get("entity") === ENTITY_TYPE
        ? url.searchParams.get("entityId")
        : "") ||
      ""
    )
  );
}

function canonicalize() {
  const url = currentUrl();
  if (!url) return false;

  ticketId = resolveTicket(url);
  if (!ticketId) return false;

  legacyPath = Boolean(ticketFromLegacyPath(url.pathname));
  if (legacyPath) url.pathname = PRIVATE_HOME_PATH;

  url.searchParams.delete("ticketId");
  url.searchParams.delete("incidenciaId");
  url.searchParams.set("entity", ENTITY_TYPE);
  url.searchParams.set("entityId", ticketId);

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    canonicalized = true;
    return true;
  } catch {
    return false;
  }
}

canonicalize();

export function getTicketDeeplinkSnapshot() {
  return Object.freeze({
    version: TICKET_DEEPLINK_VERSION,
    active: Boolean(ticketId),
    ticketId: ticketId ? "***" : "",
    legacyPath,
    canonicalized,
    searchApplied: false,
    rowActivated: false,
    modalOpen: false,
    finished: canonicalized,
    strategy: "global-entity-intent",
  });
}

export default Object.freeze({
  version: TICKET_DEEPLINK_VERSION,
  getSnapshot: getTicketDeeplinkSnapshot,
});
