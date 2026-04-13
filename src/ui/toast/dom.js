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
   CONTAINER
========================================================= */

export function getToastContainer() {
  return document.getElementById(
    TOAST_CONTAINER_ID
  );
}

export function ensureToastContainer() {
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
  if (
    document.getElementById(
      TOAST_KEYFRAMES_ID
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    TOAST_KEYFRAMES_ID;

  style.textContent = `
    @keyframes toastProgress{
      from{
        transform:scaleX(1);
        opacity:1;
      }
      to{
        transform:scaleX(0);
        opacity:.72;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}

/* =========================================================
   ACCESSIBILITY
========================================================= */

export function getToastRole(
  type
) {
  return type ===
    TOAST_TYPE_ERROR ||
    type ===
      TOAST_TYPE_WARNING
    ? TOAST_ROLE_ALERT
    : TOAST_ROLE_STATUS;
}

export function getToastLive(
  type
) {
  return type ===
    TOAST_TYPE_ERROR ||
    type ===
      TOAST_TYPE_WARNING
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
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M20 7 9 18l-5-5"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"/>
        </svg>
      `;

    case TOAST_TYPE_ERROR:
      return `
        <svg viewBox="0 0 24 24" fill="none">
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
        <svg viewBox="0 0 24 24" fill="none">
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
        <svg viewBox="0 0 24 24" fill="none">
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
   NODE
========================================================= */

export function createToastNode({
  id,
  type,
  title,
  message,
  closable = true,
}) {
  const el =
    document.createElement(
      "article"
    );

  el.className =
    `toast ${type}`;

  el.dataset.toastId = id;

  el.setAttribute(
    "role",
    getToastRole(type)
  );

  el.setAttribute(
    "aria-live",
    getToastLive(type)
  );

  el.setAttribute(
    "aria-atomic",
    "true"
  );

  const icon =
    type ===
    TOAST_TYPE_LOADING
      ? `<div class="toast-icon"></div>`
      : `<div class="toast-icon">${getToastIconSvg(type)}</div>`;

  el.innerHTML = `
    ${icon}

    <div class="toast-content">
      ${
        title
          ? `<h4 class="toast-title">${escapeHtml(title)}</h4>`
          : ""
      }

      <p class="toast-message">
        ${escapeHtml(message)}
      </p>
    </div>

    ${
      closable
        ? `
        <button
          type="button"
          class="toast-close"
          data-toast-dismiss="${escapeHtml(id)}"
          aria-label="${escapeHtml(getToastCloseLabel())}">
          ×
        </button>
      `
        : ""
    }

    <div class="toast-progress"></div>
  `;

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
    !item.toastEl
      .isConnected
  ) {
    return;
  }

  const next =
    createToastNode({
      id: item.id,
      type: item.type,
      title: item.title,
      message:
        item.message,
      closable:
        item.closable,
    });

  item.toastEl.replaceWith(
    next
  );

  item.toastEl = next;
  item.progressEl =
    next.querySelector(
      ".toast-progress"
    );
}

/* =========================================================
   REMOVE
========================================================= */

export function removeToastNode(
  item
) {
  if (
    item?.toastEl
  ) {
    item.toastEl.remove();
  }
}
