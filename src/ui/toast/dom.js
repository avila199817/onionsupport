/* =========================================================
   Onion SPA - Toast DOM
   Archivo: src/ui/toast/dom.js

   Responsabilidades:
   - crear stack container
   - keyframes progreso
   - render toast node
   - iconos por tipo
   - patch visual node
   - remove node
   - endurecer container / patch / attrs / dismiss
========================================================= */

import {
  TOAST_CONTAINER_ID,
  TOAST_KEYFRAMES_ID,
  TOAST_ROLE_ALERT,
  TOAST_ROLE_STATUS,
  TOAST_LIVE_ASSERTIVE,
  TOAST_LIVE_POLITE,
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
} from "./constants.js";

import { escapeHtml } from "./helpers.js";
import { getToastCloseLabel } from "./text.js";

/* =========================================================
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function isBrowser() {
  return (
    typeof document !== "undefined" &&
    typeof window !== "undefined"
  );
}

function setNodeText(node, value = "") {
  if (!node) return;
  node.textContent = safeText(value, "");
}

function setNodeHtml(node, value = "") {
  if (!node) return;
  node.innerHTML = String(value ?? "");
}

/* =========================================================
   CONTAINER
========================================================= */

export function getToastContainer() {
  if (!isBrowser()) {
    return null;
  }

  return document.getElementById(
    TOAST_CONTAINER_ID
  );
}

export function ensureToastContainer() {
  if (!isBrowser()) {
    return null;
  }

  let el = getToastContainer();

  if (el) {
    return el;
  }

  el = document.createElement("div");
  el.id = TOAST_CONTAINER_ID;
  el.className = "toast-stack";

  el.setAttribute(
    "aria-live",
    "polite"
  );

  el.setAttribute(
    "aria-relevant",
    "additions removals"
  );

  el.setAttribute(
    "aria-atomic",
    "false"
  );

  document.body.appendChild(el);

  return el;
}

/* =========================================================
   KEYFRAMES
========================================================= */

export function ensureToastKeyframes() {
  if (!isBrowser()) {
    return null;
  }

  if (
    document.getElementById(
      TOAST_KEYFRAMES_ID
    )
  ) {
    return document.getElementById(
      TOAST_KEYFRAMES_ID
    );
  }

  const style =
    document.createElement("style");

  style.id =
    TOAST_KEYFRAMES_ID;

  style.textContent = `
    @keyframes toastProgress {
      from {
        transform: scaleX(1);
        opacity: 1;
      }
      to {
        transform: scaleX(0);
        opacity: .72;
      }
    }
  `;

  document.head.appendChild(style);

  return style;
}

/* =========================================================
   ACCESSIBILITY
========================================================= */

export function getToastRole(
  type
) {
  return type === TOAST_TYPE_ERROR ||
    type === TOAST_TYPE_WARNING
    ? TOAST_ROLE_ALERT
    : TOAST_ROLE_STATUS;
}

export function getToastLive(
  type
) {
  return type === TOAST_TYPE_ERROR ||
    type === TOAST_TYPE_WARNING
    ? TOAST_LIVE_ASSERTIVE
    : TOAST_LIVE_POLITE;
}

/* =========================================================
   ICONS
========================================================= */

export function getToastIconSvg(
  type
) {
  switch (type) {
    case TOAST_TYPE_SUCCESS:
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20 7 9 18l-5-5"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"/>
        </svg>
      `;

    case TOAST_TYPE_ERROR:
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 9 9 15"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"/>
          <path d="M9 9l6 6"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"/>
          <circle cx="12" cy="12" r="9"
            stroke="currentColor"
            stroke-width="1.7"/>
        </svg>
      `;

    case TOAST_TYPE_WARNING:
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3.8 21 19a1.2 1.2 0 0 1-1.04 1.8H4.04A1.2 1.2 0 0 1 3 19L12 3.8Z"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"/>
          <path d="M12 9v4.2"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"/>
          <circle cx="12" cy="16.8" r="1" fill="currentColor"/>
        </svg>
      `;

    case TOAST_TYPE_LOADING:
      return "";

    case TOAST_TYPE_INFO:
    default:
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9"
            stroke="currentColor"
            stroke-width="1.7"/>
          <path d="M12 10.5v5"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"/>
          <circle cx="12" cy="7.4" r="1" fill="currentColor"/>
        </svg>
      `;
  }
}

/* =========================================================
   NODE HELPERS
========================================================= */

export function createToastIconNode(
  type
) {
  const icon =
    document.createElement("div");

  icon.className = "toast-icon";

  if (type !== TOAST_TYPE_LOADING) {
    setNodeHtml(
      icon,
      getToastIconSvg(type)
    );
  }

  return icon;
}

export function createToastContentNode({
  title,
  message,
} = {}) {
  const content =
    document.createElement("div");

  content.className =
    "toast-content";

  const safeTitle =
    safeText(title, "");

  const safeMessage =
    safeText(message, "");

  if (safeTitle) {
    const titleEl =
      document.createElement("h4");
    titleEl.className =
      "toast-title";
    titleEl.textContent =
      safeTitle;
    content.appendChild(titleEl);
  }

  const messageEl =
    document.createElement("p");

  messageEl.className =
    "toast-message";
  messageEl.textContent =
    safeMessage;

  content.appendChild(
    messageEl
  );

  return content;
}

export function createToastCloseButton(
  id
) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    "toast-close";

  button.setAttribute(
    "data-toast-dismiss",
    safeText(id, "")
  );

  button.setAttribute(
    "aria-label",
    safeText(
      getToastCloseLabel(),
      "Cerrar"
    )
  );

  button.textContent = "×";

  return button;
}

export function createToastProgressNode() {
  const progress =
    document.createElement("div");

  progress.className =
    "toast-progress";

  return progress;
}

/* =========================================================
   NODE
========================================================= */

export function createToastNode({
  id,
  type,
  title,
  message,
  closable = true,
}) {
  const toastId =
    safeText(id, "");

  const toastType =
    safeText(type, TOAST_TYPE_INFO) ||
    TOAST_TYPE_INFO;

  const el =
    document.createElement("article");

  el.className =
    `toast ${toastType}`;

  el.dataset.toastId =
    toastId;

  el.setAttribute(
    "role",
    getToastRole(toastType)
  );

  el.setAttribute(
    "aria-live",
    getToastLive(toastType)
  );

  el.setAttribute(
    "aria-atomic",
    "true"
  );

  el.appendChild(
    createToastIconNode(toastType)
  );

  el.appendChild(
    createToastContentNode({
      title,
      message,
    })
  );

  if (closable) {
    el.appendChild(
      createToastCloseButton(toastId)
    );
  }

  el.appendChild(
    createToastProgressNode()
  );

  return el;
}

/* =========================================================
   PATCH
========================================================= */

export function patchToastNode(
  item
) {
  if (
    !item?.toastEl ||
    !item.toastEl.isConnected
  ) {
    return item || null;
  }

  const current =
    item.toastEl;

  current.className =
    `toast ${safeText(item.type, TOAST_TYPE_INFO)}`;

  current.dataset.toastId =
    safeText(item.id, "");

  current.setAttribute(
    "role",
    getToastRole(item.type)
  );

  current.setAttribute(
    "aria-live",
    getToastLive(item.type)
  );

  current.setAttribute(
    "aria-atomic",
    "true"
  );

  const oldIcon =
    current.querySelector(".toast-icon");
  const oldContent =
    current.querySelector(".toast-content");
  const oldClose =
    current.querySelector(".toast-close");
  const oldProgress =
    current.querySelector(".toast-progress");

  const nextIcon =
    createToastIconNode(item.type);

  const nextContent =
    createToastContentNode({
      title: item.title,
      message: item.message,
    });

  if (oldIcon) {
    oldIcon.replaceWith(nextIcon);
  } else {
    current.prepend(nextIcon);
  }

  if (oldContent) {
    oldContent.replaceWith(nextContent);
  } else {
    current.appendChild(nextContent);
  }

  if (item.closable) {
    const nextClose =
      createToastCloseButton(item.id);

    if (oldClose) {
      oldClose.replaceWith(nextClose);
    } else {
      current.appendChild(nextClose);
    }
  } else if (oldClose) {
    oldClose.remove();
  }

  if (!oldProgress) {
    current.appendChild(
      createToastProgressNode()
    );
  }

  item.toastEl = current;
  item.progressEl =
    current.querySelector(
      ".toast-progress"
    );

  return item;
}

/* =========================================================
   REMOVE
========================================================= */

export function removeToastNode(
  item
) {
  if (item?.toastEl) {
    item.toastEl.remove();
  }

  if (item) {
    item.toastEl = null;
    item.progressEl = null;
  }

  return true;
}
