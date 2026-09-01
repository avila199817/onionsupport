/* =========================================================
   Onion Support - Public Support Extreme
   Archivo: /src/features/public-support-extreme/index.js

   Mejora progresiva del intake público:
   - Explica de forma inequívoca la autoridad de correo + móvil.
   - La sesión iniciada nunca se presenta como propietaria automática.
   - Convierte estados transitorios en warnings accionables y accesibles.
   - Conserva el formulario y comunica que el reintento es idempotente.
   - No duplica Auth, HTTP, Router ni lógica de identidad del backend.
========================================================= */

import "../../css/views/public/support-extreme.css";

export const PUBLIC_SUPPORT_EXTREME_VERSION =
  "public-support.extreme.v2-client-facing-feedback";

const HOME = "[data-public-home]";
const FORM = "[data-public-support-form]";
const STATUS = "[data-public-support-status]";
const AUTHORITY = "[data-public-support-contact-authority]";
const SUBMIT_LABEL = "[data-public-support-submit-label]";
const PUBLIC_HOME_SESSION_EVENT = "public-home:session-hydrated";

const TRANSIENT_MESSAGES = Object.freeze(new Map([
  [
    "El servicio no ha podido completar la solicitud. Espera unos segundos y vuelve a intentarlo.",
    "No hemos podido confirmar el registro todavía. Tus datos siguen en el formulario. Espera unos segundos y vuelve a intentarlo: reutilizaremos el mismo intento para evitar duplicados. Si continúa, puedes usar WhatsApp.",
  ],
  [
    "El formulario de incidencias no está disponible ahora mismo. Puedes contactar por WhatsApp mientras tanto.",
    "El formulario no está disponible temporalmente. Tus datos siguen aquí; puedes reintentar en unos instantes o usar WhatsApp mientras se recupera el servicio.",
  ],
  [
    "Has realizado varias solicitudes seguidas. Espera un momento y vuelve a intentarlo.",
    "Hemos pausado temporalmente los envíos para evitar duplicados. Espera un momento y vuelve a intentarlo con estos mismos datos.",
  ],
  [
    "No se pudo enviar la solicitud. Comprueba tu conexión e inténtalo de nuevo.",
    "No hemos podido confirmar el envío. Comprueba tu conexión y vuelve a intentarlo; el formulario conserva tus datos.",
  ],
]));

let observer = null;
let frame = 0;
let mountRoot = null;
let installed = false;
let destroyed = false;

function cleanText(value = "", fallback = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function createAuthorityIcon() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const shield = document.createElementNS(namespace, "path");
  shield.setAttribute(
    "d",
    "M12 3.3 18.3 6v5.25c0 4.25-2.55 7.62-6.3 9.45-3.75-1.83-6.3-5.2-6.3-9.45V6L12 3.3Z"
  );

  const check = document.createElementNS(namespace, "path");
  check.setAttribute("d", "m8.8 11.9 2.05 2.05 4.45-4.55");

  svg.append(shield, check);
  return svg;
}

function ensureAuthorityNotice(form = null) {
  if (!form) return false;

  const existing = form.querySelector(AUTHORITY);
  if (existing) return true;

  const head = form.querySelector(".public-support-form-head");
  if (!head) return false;

  const notice = document.createElement("aside");
  notice.className = "public-support-contact-authority";
  notice.dataset.publicSupportContactAuthority = "true";
  notice.setAttribute("role", "note");
  notice.setAttribute("aria-label", "Cómo se vincula la incidencia");

  const icon = document.createElement("span");
  icon.className = "public-support-contact-authority-icon";
  icon.appendChild(createAuthorityIcon());

  const copy = document.createElement("div");

  const title = document.createElement("strong");
  title.textContent = "Tus datos vinculan la incidencia";

  const description = document.createElement("p");
  description.textContent =
    "Usaremos el correo y el móvil que indiques. Si ya tienes cuenta, la reutilizamos sin cambiar tus datos; si es tu primera vez, recibirás un acceso seguro.";

  copy.append(title, description);
  notice.append(icon, copy);
  head.insertAdjacentElement("afterend", notice);

  const secure = form.querySelector(".public-support-secure");
  if (secure && cleanText(secure.textContent) === "Acceso por email") {
    secure.textContent = "Datos protegidos";
  }

  form.dataset.publicSupportAuthorityReady = "true";
  return true;
}

function feedbackSeverity(node = null) {
  const current = cleanText(node?.dataset?.status, "info").toLowerCase();
  const message = cleanText(node?.textContent);

  if (TRANSIENT_MESSAGES.has(message)) return "warning";
  if (["success", "error", "warning", "info"].includes(current)) return current;
  return "info";
}

function isTransientMessage(message = "") {
  return TRANSIENT_MESSAGES.has(cleanText(message));
}

function setRetryState(form = null, enabled = false) {
  if (!form) return false;

  const busy = form.dataset.submitting === "true";
  const blocked = form.dataset.activeTicket === "true";
  const label = form.querySelector(SUBMIT_LABEL);
  const nextRetry = enabled ? "true" : "false";

  if (form.dataset.publicSupportRetry !== nextRetry) {
    form.dataset.publicSupportRetry = nextRetry;
  }

  if (!label || busy || blocked) return false;

  const current = cleanText(label.textContent);

  if (enabled) {
    if (current === "Crear incidencia") {
      label.textContent = "Reintentar incidencia";
      return true;
    }
    return false;
  }

  if (current === "Reintentar incidencia") {
    label.textContent = "Crear incidencia";
    return true;
  }

  return false;
}

function normalizeFeedback(form = null) {
  if (!form) return false;

  const node = form.querySelector(STATUS);
  if (!node) return false;

  const message = cleanText(node.textContent);

  if (!message || node.hidden) {
    if (node.dataset.publicSupportFeedback !== "idle") {
      node.dataset.publicSupportFeedback = "idle";
    }
    setRetryState(form, false);
    return true;
  }

  const replacement = TRANSIENT_MESSAGES.get(message) || message;
  const transient = isTransientMessage(message);
  const severity = transient ? "warning" : feedbackSeverity(node);

  if (replacement !== message) {
    node.textContent = replacement;
  }

  if (node.dataset.status !== severity) {
    node.dataset.status = severity;
  }

  if (node.dataset.publicSupportFeedback !== severity) {
    node.dataset.publicSupportFeedback = severity;
  }

  const role = severity === "error" || severity === "warning" ? "alert" : "status";
  const live = severity === "error" || severity === "warning" ? "assertive" : "polite";

  if (node.getAttribute("role") !== role) {
    node.setAttribute("role", role);
  }
  if (node.getAttribute("aria-live") !== live) {
    node.setAttribute("aria-live", live);
  }
  if (node.getAttribute("aria-atomic") !== "true") {
    node.setAttribute("aria-atomic", "true");
  }

  setRetryState(form, transient || severity === "warning");
  return true;
}

function enhanceHome(root = null) {
  if (!root) return false;

  let changed = false;

  root.querySelectorAll(FORM).forEach((form) => {
    changed = ensureAuthorityNotice(form) || changed;
    changed = normalizeFeedback(form) || changed;
  });

  if (changed) {
    if (root.dataset.publicSupportExtreme !== "true") {
      root.dataset.publicSupportExtreme = "true";
    }
    if (root.dataset.publicSupportExtremeVersion !== PUBLIC_SUPPORT_EXTREME_VERSION) {
      root.dataset.publicSupportExtremeVersion = PUBLIC_SUPPORT_EXTREME_VERSION;
    }
  }

  return changed;
}

function scan() {
  if (destroyed || typeof document === "undefined") return false;

  const scope = mountRoot || document;
  let found = false;

  scope.querySelectorAll(HOME).forEach((root) => {
    found = enhanceHome(root) || found;
  });

  return found;
}

function queueScan() {
  if (destroyed || typeof window === "undefined" || frame) return false;

  frame = window.requestAnimationFrame(() => {
    frame = 0;
    scan();
  });

  return true;
}

function install() {
  if (typeof window === "undefined" || destroyed || installed) return false;

  mountRoot =
    document.querySelector("#view-container, [data-router-view='true']") ||
    document.body ||
    null;

  if (!mountRoot || typeof MutationObserver === "undefined") return false;

  installed = true;
  observer = new MutationObserver(queueScan);
  observer.observe(mountRoot, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "data-status", "data-submitting", "data-active-ticket"],
  });

  window.addEventListener("onion:main:ready", queueScan);
  window.addEventListener("onion:public-support:accepted", queueScan);
  window.addEventListener("onion:public-support:active-ticket", queueScan);
  document.addEventListener(PUBLIC_HOME_SESSION_EVENT, queueScan, true);
  document.addEventListener("public-home:ready", queueScan, true);

  scan();
  return true;
}

export function destroyPublicSupportExtreme() {
  if (typeof window === "undefined" || destroyed) return false;

  destroyed = true;
  observer?.disconnect();
  observer = null;

  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;

  window.removeEventListener("onion:main:ready", queueScan);
  window.removeEventListener("onion:public-support:accepted", queueScan);
  window.removeEventListener("onion:public-support:active-ticket", queueScan);
  document.removeEventListener(PUBLIC_HOME_SESSION_EVENT, queueScan, true);
  document.removeEventListener("public-home:ready", queueScan, true);

  mountRoot = null;
  installed = false;
  return true;
}

export function getPublicSupportExtremeSnapshot() {
  return Object.freeze({
    version: PUBLIC_SUPPORT_EXTREME_VERSION,
    installed,
    mounted: Boolean(mountRoot?.querySelector?.(HOME)),
    authorityReady: Boolean(mountRoot?.querySelector?.(AUTHORITY)),
  });
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_SUPPORT_EXTREME_VERSION,
  scan,
  destroy: destroyPublicSupportExtreme,
  getSnapshot: getPublicSupportExtremeSnapshot,
});
