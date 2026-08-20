/* =========================================================
   Onion Support - Public Support Submission Progress
   Archivo: /src/features/public-support-progress/index.js

   Responsabilidad:
   - Reflejar el estado real data-submitting del formulario público.
   - Mostrar un loader fullscreen sólo durante el POST activo.
   - Bloquear scroll/interacción del Home durante el envío.
   - Restaurar foco y accesibilidad al finalizar.
   - Observar únicamente el mount del Router, no todo el documento.
========================================================= */

export const PUBLIC_SUPPORT_PROGRESS_VERSION =
  "public-support.progress.v2-router-view-observer";

const VIEW_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const FORM_SELECTOR = "[data-public-support-form='true']";
const HOME_SELECTOR = "[data-public-home]";
const STATUS_SELECTOR = "[data-public-support-status='true']";
const OVERLAY_SELECTOR = "[data-public-support-submit-overlay='true']";
const ROOT_BUSY_CLASS = "public-support-submission-active";

let observer = null;
let activeForm = null;
let activeHome = null;
let homeWasInert = false;
let previousFocus = null;
let destroyed = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function viewRoot() {
  return isBrowser() ? document.querySelector(VIEW_ROOT_SELECTOR) : null;
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "public-support-submit-overlay";
  overlay.dataset.publicSupportSubmitOverlay = "true";
  overlay.hidden = true;
  overlay.tabIndex = -1;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("aria-labelledby", "public-support-submit-overlay-title");
  overlay.setAttribute("aria-describedby", "public-support-submit-overlay-copy");
  overlay.innerHTML = `
    <div class="public-support-submit-overlay-card">
      <div class="public-support-submit-spinner" aria-hidden="true"><span></span></div>
      <p class="public-support-submit-overlay-kicker">Enviando solicitud</p>
      <h2 id="public-support-submit-overlay-title">Creando tu incidencia…</h2>
      <p id="public-support-submit-overlay-copy">
        Estamos registrando tu solicitud y preparando el seguimiento.
        No cierres esta ventana.
      </p>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function overlayNode() {
  if (!isBrowser()) return null;
  return document.querySelector(OVERLAY_SELECTOR) || createOverlay();
}

function setRootBusy(value) {
  if (!isBrowser()) return false;

  for (const root of [document.documentElement, document.body].filter(Boolean)) {
    root.classList.toggle(ROOT_BUSY_CLASS, value);

    if (value) root.dataset.publicSupportSubmissionActive = "true";
    else delete root.dataset.publicSupportSubmissionActive;
  }

  return true;
}

function setHomeInert(form, value) {
  if (!form) return false;
  const home = form.closest?.(HOME_SELECTOR) || null;

  if (value) {
    if (activeHome !== home) {
      activeHome = home;
      homeWasInert = Boolean(home?.inert);
    }

    if (home) {
      home.inert = true;
      home.dataset.publicSupportSubmissionBlocked = "true";
    }
    return true;
  }

  const target = activeHome || home;
  if (target) {
    target.inert = homeWasInert;
    delete target.dataset.publicSupportSubmissionBlocked;
  }

  activeHome = null;
  homeWasInert = false;
  return true;
}

function focusNode(node) {
  if (!node?.isConnected || typeof node.focus !== "function") return false;

  try {
    node.focus({ preventScroll: true });
  } catch {
    node.focus();
  }
  return true;
}

function focusAfterSubmission(form) {
  if (!form?.isConnected) return false;

  const status = form.querySelector?.(STATUS_SELECTOR) || null;
  if (status && status.hidden !== true && String(status.textContent || "").trim()) {
    const hadTabindex = status.hasAttribute("tabindex");
    if (!hadTabindex) status.setAttribute("tabindex", "-1");

    focusNode(status);

    if (!hadTabindex) {
      window.setTimeout(() => status.removeAttribute("tabindex"), 0);
    }
    return true;
  }

  return focusNode(previousFocus);
}

function show(form) {
  if (
    !isBrowser() ||
    destroyed ||
    !form ||
    form.dataset.submitting !== "true"
  ) {
    return false;
  }

  const overlay = overlayNode();
  if (!overlay) return false;

  if (activeForm !== form) {
    previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  activeForm = form;
  setHomeInert(form, true);
  setRootBusy(true);

  overlay.hidden = false;
  overlay.dataset.active = "true";
  overlay.setAttribute("aria-hidden", "false");

  window.requestAnimationFrame(() => {
    if (activeForm === form && !overlay.hidden) focusNode(overlay);
  });

  return true;
}

function hide({ restoreFocus = true } = {}) {
  if (!isBrowser()) return false;

  const form = activeForm;
  const overlay = document.querySelector(OVERLAY_SELECTOR);

  if (overlay) {
    overlay.hidden = true;
    delete overlay.dataset.active;
    overlay.setAttribute("aria-hidden", "true");
  }

  setHomeInert(form, false);
  setRootBusy(false);
  activeForm = null;

  if (restoreFocus) focusAfterSubmission(form);
  previousFocus = null;
  return true;
}

export function syncPublicSupportProgress() {
  if (!isBrowser() || destroyed) return false;

  if (
    activeForm &&
    (!activeForm.isConnected || activeForm.dataset.submitting !== "true")
  ) {
    hide({ restoreFocus: activeForm.isConnected });
  }

  if (activeForm) return true;

  const busyForm = viewRoot()?.querySelector?.(
    `${FORM_SELECTOR}[data-submitting='true']`
  );

  return busyForm ? show(busyForm) : false;
}

function onPageHide() {
  hide({ restoreFocus: false });
}

function install() {
  if (!isBrowser() || destroyed || observer) return false;

  const root = viewRoot();
  if (!root || typeof MutationObserver === "undefined") return false;

  overlayNode();
  observer = new MutationObserver(syncPublicSupportProgress);
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-submitting"],
  });

  window.addEventListener("pagehide", onPageHide);
  syncPublicSupportProgress();
  return true;
}

export function destroyPublicSupportProgress() {
  if (!isBrowser() || destroyed) return false;
  destroyed = true;

  observer?.disconnect();
  observer = null;
  window.removeEventListener("pagehide", onPageHide);

  hide({ restoreFocus: false });
  document.querySelector(OVERLAY_SELECTOR)?.remove?.();
  return true;
}

export function getPublicSupportProgressSnapshot() {
  return Object.freeze({
    version: PUBLIC_SUPPORT_PROGRESS_VERSION,
    active: Boolean(activeForm),
    formConnected: Boolean(activeForm?.isConnected),
    overlayVisible: Boolean(
      isBrowser() &&
      document.querySelector(`${OVERLAY_SELECTOR}[data-active='true']`)
    ),
    observerScope: "router-view",
  });
}

if (isBrowser()) install();

export default Object.freeze({
  version: PUBLIC_SUPPORT_PROGRESS_VERSION,
  sync: syncPublicSupportProgress,
  destroy: destroyPublicSupportProgress,
  getSnapshot: getPublicSupportProgressSnapshot,
});
