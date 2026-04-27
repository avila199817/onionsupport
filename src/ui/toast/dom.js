/* =========================================================
   Onion SPA - Toast DOM
   Archivo: src/ui/toast/dom.js

   Responsabilidades:
   - crear stack container
   - resolver keyframes progreso sin romper CSP
   - render toast node
   - iconos por tipo
   - patch visual node
   - remove node
   - endurecer container / patch / attrs / dismiss
   - mantener compatibilidad CSS legacy
   - evitar innerHTML con contenido de usuario

   HARDENING PRO:
   - browser guard total
   - sin inline style dinámico obligatorio
   - SVGs internos controlados
   - texto siempre con textContent
   - roles aria por tipo
   - live regions consistentes
   - clases legacy + clases BEM compatibles
   - patch estable sin perder progreso
========================================================= */

import {
  TOAST_CONTAINER_ID,
  TOAST_KEYFRAMES_ID,

  TOAST_DATA_ROOT,
  TOAST_DATA_ID,
  TOAST_DATA_TYPE,
  TOAST_DATA_DISMISSING,

  TOAST_ROLE_STATUS,
  TOAST_LIVE_POLITE,

  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
  TOAST_TYPES,

  TOAST_ROLES_BY_TYPE,
  TOAST_LIVE_BY_TYPE,

  TOAST_CLASS_CONTAINER,
  TOAST_CLASS_ITEM,
  TOAST_CLASS_VISIBLE,
  TOAST_CLASS_DISMISSING,
  TOAST_CLASS_ICON,
  TOAST_CLASS_TITLE,
  TOAST_CLASS_MESSAGE,
  TOAST_CLASS_CLOSE,
  TOAST_CLASS_PROGRESS,
  TOAST_CLASS_BY_TYPE,

  TOAST_PROGRESS_ANIMATION_NAME,
} from "./constants.js";

import {
  getToastCloseLabel,
} from "./text.js";

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function isElement(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.nodeType === 1
  );
}

function setAttr(node, name, value) {
  if (!isElement(node) || !name) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined
    ) {
      node.removeAttribute(name);
      return true;
    }

    node.setAttribute(
      name,
      String(value)
    );

    return true;
  } catch {
    return false;
  }
}

function removeAttr(node, name) {
  if (!isElement(node) || !name) {
    return false;
  }

  try {
    node.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setDataAttr(node, attrName, value) {
  if (!isElement(node) || !attrName) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      node.removeAttribute(attrName);
      return true;
    }

    node.setAttribute(
      attrName,
      String(value)
    );

    return true;
  } catch {
    return false;
  }
}

function setNodeText(node, value = "") {
  if (!isElement(node)) {
    return false;
  }

  try {
    node.textContent =
      safeText(value, "");

    return true;
  } catch {
    return false;
  }
}

function clearNode(node) {
  if (!isElement(node)) {
    return false;
  }

  try {
    while (node.firstChild) {
      node.removeChild(
        node.firstChild
      );
    }

    return true;
  } catch {
    return false;
  }
}

function appendIfNode(parent, child) {
  if (!isElement(parent) || !child) {
    return false;
  }

  try {
    parent.appendChild(child);
    return true;
  } catch {
    return false;
  }
}

function normalizeToastType(type = TOAST_TYPE_INFO) {
  const value =
    safeText(type, TOAST_TYPE_INFO)
      .toLowerCase();

  return TOAST_TYPES.includes(value)
    ? value
    : TOAST_TYPE_INFO;
}

function getTypeClass(type = TOAST_TYPE_INFO) {
  const toastType =
    normalizeToastType(type);

  return (
    TOAST_CLASS_BY_TYPE?.[toastType] ||
    `toast--${toastType}`
  );
}

function getLegacyTypeClass(type = TOAST_TYPE_INFO) {
  return normalizeToastType(type);
}

function buildToastClassName(type = TOAST_TYPE_INFO, extra = "") {
  const toastType =
    normalizeToastType(type);

  return [
    TOAST_CLASS_ITEM,
    getLegacyTypeClass(toastType),
    getTypeClass(toastType),
    safeText(extra, ""),
  ]
    .filter(Boolean)
    .join(" ");
}

function isReducedMotion() {
  if (!isBrowser()) {
    return false;
  }

  try {
    return window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches === true;
  } catch {
    return false;
  }
}

/* =========================================================
   CONTAINER
========================================================= */

export function getToastContainer() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return document.getElementById(
      TOAST_CONTAINER_ID
    );
  } catch {
    return null;
  }
}

export function ensureToastContainer() {
  if (!isBrowser()) {
    return null;
  }

  let el =
    getToastContainer();

  if (el) {
    setAttr(el, "role", "region");
    setAttr(el, "aria-label", "Notificaciones");
    setAttr(el, "aria-live", TOAST_LIVE_POLITE);
    setAttr(el, "aria-relevant", "additions removals");
    setAttr(el, "aria-atomic", "false");
    setDataAttr(el, TOAST_DATA_ROOT, "true");

    if (!el.classList.contains(TOAST_CLASS_CONTAINER)) {
      try {
        el.classList.add(TOAST_CLASS_CONTAINER);
      } catch {}
    }

    return el;
  }

  try {
    el =
      document.createElement("div");

    el.id =
      TOAST_CONTAINER_ID;

    el.className =
      TOAST_CLASS_CONTAINER || "toast-stack";

    setDataAttr(el, TOAST_DATA_ROOT, "true");

    setAttr(el, "role", "region");
    setAttr(el, "aria-label", "Notificaciones");
    setAttr(el, "aria-live", TOAST_LIVE_POLITE);
    setAttr(el, "aria-relevant", "additions removals");
    setAttr(el, "aria-atomic", "false");

    document.body.appendChild(el);

    return el;
  } catch {
    return null;
  }
}

/* =========================================================
   KEYFRAMES
========================================================= */

/**
 * CSP CLEAN:
 * Los keyframes deberían vivir en CSS:
 *
 * @keyframes toast-progress-shrink {
 *   from { transform: scaleX(1); opacity: 1; }
 *   to   { transform: scaleX(0); opacity: .72; }
 * }
 *
 * Esta función existe por compatibilidad con api.js.
 * No inyecta <style> dinámico para evitar romper CSP estricto.
 */
export function ensureToastKeyframes() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const existing =
      document.getElementById(
        TOAST_KEYFRAMES_ID
      );

    if (existing) {
      return existing;
    }

    document.documentElement?.setAttribute(
      "data-toast-keyframes",
      TOAST_PROGRESS_ANIMATION_NAME || "toast-progress-shrink"
    );

    return null;
  } catch {
    return null;
  }
}

/* =========================================================
   ACCESSIBILITY
========================================================= */

export function getToastRole(type = TOAST_TYPE_INFO) {
  const toastType =
    normalizeToastType(type);

  return (
    TOAST_ROLES_BY_TYPE?.[toastType] ||
    TOAST_ROLE_STATUS
  );
}

export function getToastLive(type = TOAST_TYPE_INFO) {
  const toastType =
    normalizeToastType(type);

  return (
    TOAST_LIVE_BY_TYPE?.[toastType] ||
    TOAST_LIVE_POLITE
  );
}

/* =========================================================
   ICONS
========================================================= */

function createSvgNode(svgMarkup = "") {
  if (!isBrowser()) {
    return null;
  }

  try {
    const template =
      document.createElement("template");

    template.innerHTML =
      String(svgMarkup || "").trim();

    const node =
      template.content.firstElementChild;

    return node || null;
  } catch {
    return null;
  }
}

export function getToastIconSvg(type = TOAST_TYPE_INFO) {
  const toastType =
    normalizeToastType(type);

  switch (toastType) {
    case TOAST_TYPE_SUCCESS:
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path
            d="M20 7 9 18l-5-5"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      `;

    case TOAST_TYPE_ERROR:
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path
            d="M15 9 9 15"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
          />
          <path
            d="M9 9l6 6"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            stroke-width="1.7"
          />
        </svg>
      `;

    case TOAST_TYPE_WARNING:
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path
            d="M12 3.8 21 19a1.2 1.2 0 0 1-1.04 1.8H4.04A1.2 1.2 0 0 1 3 19L12 3.8Z"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
          <path
            d="M12 9v4.2"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
          />
          <circle
            cx="12"
            cy="16.8"
            r="1"
            fill="currentColor"
          />
        </svg>
      `;

    case TOAST_TYPE_LOADING:
      return "";

    case TOAST_TYPE_INFO:
    default:
      return `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            stroke-width="1.7"
          />
          <path
            d="M12 10.5v5"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
          />
          <circle
            cx="12"
            cy="7.4"
            r="1"
            fill="currentColor"
          />
        </svg>
      `;
  }
}

/* =========================================================
   NODE HELPERS
========================================================= */

export function createToastIconNode(type = TOAST_TYPE_INFO) {
  if (!isBrowser()) {
    return null;
  }

  const toastType =
    normalizeToastType(type);

  const icon =
    document.createElement("div");

  icon.className =
    TOAST_CLASS_ICON || "toast-icon";

  setAttr(icon, "aria-hidden", "true");

  if (toastType === TOAST_TYPE_LOADING) {
    const spinner =
      document.createElement("span");

    spinner.className =
      "toast-spinner";

    setAttr(spinner, "aria-hidden", "true");

    appendIfNode(icon, spinner);

    return icon;
  }

  const svg =
    createSvgNode(
      getToastIconSvg(toastType)
    );

  if (svg) {
    appendIfNode(icon, svg);
  }

  return icon;
}

export function createToastContentNode({
  title = "",
  message = "",
} = {}) {
  if (!isBrowser()) {
    return null;
  }

  const content =
    document.createElement("div");

  /*
    Compatibilidad:
    - toast-content: clase usada por tu DOM actual
    - toast-body: clase nueva exportada en constants
  */
  content.className =
    "toast-content toast-body";

  const safeTitle =
    safeText(title, "");

  const safeMessage =
    safeText(message, "");

  if (safeTitle) {
    const titleEl =
      document.createElement("h4");

    titleEl.className =
      TOAST_CLASS_TITLE || "toast-title";

    setNodeText(
      titleEl,
      safeTitle
    );

    appendIfNode(
      content,
      titleEl
    );
  }

  const messageEl =
    document.createElement("p");

  messageEl.className =
    TOAST_CLASS_MESSAGE || "toast-message";

  setNodeText(
    messageEl,
    safeMessage
  );

  appendIfNode(
    content,
    messageEl
  );

  return content;
}

export function createToastCloseButton(id = "") {
  if (!isBrowser()) {
    return null;
  }

  const toastId =
    safeText(id, "");

  const button =
    document.createElement("button");

  button.type =
    "button";

  button.className =
    TOAST_CLASS_CLOSE || "toast-close";

  setAttr(
    button,
    "data-toast-dismiss",
    toastId
  );

  setAttr(
    button,
    "aria-label",
    safeText(
      getToastCloseLabel(),
      "Cerrar notificación"
    )
  );

  setAttr(
    button,
    "title",
    safeText(
      getToastCloseLabel(),
      "Cerrar"
    )
  );

  button.textContent =
    "×";

  return button;
}

export function createToastProgressNode() {
  if (!isBrowser()) {
    return null;
  }

  const progress =
    document.createElement("div");

  progress.className =
    TOAST_CLASS_PROGRESS || "toast-progress";

  setAttr(
    progress,
    "aria-hidden",
    "true"
  );

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
} = {}) {
  if (!isBrowser()) {
    return null;
  }

  const toastId =
    safeText(id, "");

  const toastType =
    normalizeToastType(type);

  const el =
    document.createElement("article");

  el.className =
    buildToastClassName(toastType);

  setDataAttr(
    el,
    TOAST_DATA_ID,
    toastId
  );

  setDataAttr(
    el,
    TOAST_DATA_TYPE,
    toastType
  );

  setDataAttr(
    el,
    TOAST_DATA_DISMISSING,
    null
  );

  /*
    Compatibilidad con código existente:
    item.toastEl.dataset.toastId
  */
  try {
    el.dataset.toastId =
      toastId;
  } catch {}

  setAttr(
    el,
    "role",
    getToastRole(toastType)
  );

  setAttr(
    el,
    "aria-live",
    getToastLive(toastType)
  );

  setAttr(
    el,
    "aria-atomic",
    "true"
  );

  setAttr(
    el,
    "tabindex",
    "-1"
  );

  appendIfNode(
    el,
    createToastIconNode(toastType)
  );

  appendIfNode(
    el,
    createToastContentNode({
      title,
      message,
    })
  );

  if (safeBool(closable, true)) {
    appendIfNode(
      el,
      createToastCloseButton(toastId)
    );
  }

  appendIfNode(
    el,
    createToastProgressNode()
  );

  return el;
}

/* =========================================================
   PATCH
========================================================= */

function getToastContentNode(root) {
  if (!isElement(root)) {
    return null;
  }

  return (
    root.querySelector(".toast-content") ||
    root.querySelector(".toast-body") ||
    null
  );
}

function getToastProgressNode(root) {
  if (!isElement(root)) {
    return null;
  }

  return (
    root.querySelector(`.${TOAST_CLASS_PROGRESS}`) ||
    root.querySelector(".toast-progress") ||
    null
  );
}

function getToastIconNode(root) {
  if (!isElement(root)) {
    return null;
  }

  return (
    root.querySelector(`.${TOAST_CLASS_ICON}`) ||
    root.querySelector(".toast-icon") ||
    null
  );
}

function getToastCloseNode(root) {
  if (!isElement(root)) {
    return null;
  }

  return (
    root.querySelector(`.${TOAST_CLASS_CLOSE}`) ||
    root.querySelector(".toast-close") ||
    null
  );
}

export function patchToastNode(item) {
  if (
    !item ||
    !item.toastEl ||
    !item.toastEl.isConnected
  ) {
    return item || null;
  }

  const current =
    item.toastEl;

  const toastType =
    normalizeToastType(item.type);

  current.className =
    buildToastClassName(
      toastType,
      item.dismissed
        ? TOAST_CLASS_DISMISSING
        : ""
    );

  if (
    item.toastEl.classList.contains(TOAST_CLASS_VISIBLE)
  ) {
    try {
      current.classList.add(
        TOAST_CLASS_VISIBLE
      );
    } catch {}
  }

  setDataAttr(
    current,
    TOAST_DATA_ID,
    safeText(item.id, "")
  );

  setDataAttr(
    current,
    TOAST_DATA_TYPE,
    toastType
  );

  setDataAttr(
    current,
    TOAST_DATA_DISMISSING,
    item.dismissed ? "true" : null
  );

  try {
    current.dataset.toastId =
      safeText(item.id, "");
  } catch {}

  setAttr(
    current,
    "role",
    getToastRole(toastType)
  );

  setAttr(
    current,
    "aria-live",
    getToastLive(toastType)
  );

  setAttr(
    current,
    "aria-atomic",
    "true"
  );

  const oldIcon =
    getToastIconNode(current);

  const oldContent =
    getToastContentNode(current);

  const oldClose =
    getToastCloseNode(current);

  const oldProgress =
    getToastProgressNode(current);

  const nextIcon =
    createToastIconNode(toastType);

  const nextContent =
    createToastContentNode({
      title: item.title,
      message: item.message,
    });

  if (oldIcon && nextIcon) {
    try {
      oldIcon.replaceWith(nextIcon);
    } catch {}
  } else if (nextIcon) {
    try {
      current.prepend(nextIcon);
    } catch {
      appendIfNode(current, nextIcon);
    }
  }

  if (oldContent && nextContent) {
    try {
      oldContent.replaceWith(nextContent);
    } catch {}
  } else if (nextContent) {
    appendIfNode(
      current,
      nextContent
    );
  }

  if (item.closable) {
    const nextClose =
      createToastCloseButton(item.id);

    if (oldClose && nextClose) {
      try {
        oldClose.replaceWith(nextClose);
      } catch {}
    } else if (nextClose) {
      /*
        El close debe ir antes del progress si existe.
      */
      try {
        const progress =
          getToastProgressNode(current);

        if (progress) {
          current.insertBefore(
            nextClose,
            progress
          );
        } else {
          current.appendChild(
            nextClose
          );
        }
      } catch {
        appendIfNode(
          current,
          nextClose
        );
      }
    }
  } else if (oldClose) {
    try {
      oldClose.remove();
    } catch {}
  }

  if (!oldProgress) {
    appendIfNode(
      current,
      createToastProgressNode()
    );
  }

  item.toastEl =
    current;

  item.progressEl =
    getToastProgressNode(current);

  return item;
}

/* =========================================================
   DISMISS VISUAL STATE
========================================================= */

export function markToastNodeDismissing(item) {
  if (!item?.toastEl) {
    return false;
  }

  try {
    item.toastEl.classList.add(
      TOAST_CLASS_DISMISSING
    );

    item.toastEl.classList.remove(
      TOAST_CLASS_VISIBLE
    );

    setDataAttr(
      item.toastEl,
      TOAST_DATA_DISMISSING,
      "true"
    );

    item.toastEl.style.pointerEvents =
      "none";

    return true;
  } catch {
    return false;
  }
}

export function unmarkToastNodeDismissing(item) {
  if (!item?.toastEl) {
    return false;
  }

  try {
    item.toastEl.classList.remove(
      TOAST_CLASS_DISMISSING
    );

    setDataAttr(
      item.toastEl,
      TOAST_DATA_DISMISSING,
      null
    );

    item.toastEl.style.pointerEvents =
      "";

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REMOVE
========================================================= */

export function removeToastNode(item) {
  if (!item) {
    return false;
  }

  try {
    if (item.toastEl?.isConnected) {
      item.toastEl.remove();
    }
  } catch {}

  try {
    item.toastEl = null;
    item.progressEl = null;
  } catch {}

  return true;
}

/* =========================================================
   DEBUG
========================================================= */

export function getToastDomSnapshot() {
  const container =
    getToastContainer();

  return {
    browser:
      isBrowser(),

    containerId:
      TOAST_CONTAINER_ID,

    hasContainer:
      Boolean(container),

    toastCount:
      container
        ? container.querySelectorAll(".toast").length
        : 0,

    reducedMotion:
      isReducedMotion(),

    keyframesId:
      TOAST_KEYFRAMES_ID,

    progressAnimation:
      TOAST_PROGRESS_ANIMATION_NAME,
  };
}

export default {
  getToastContainer,
  ensureToastContainer,

  ensureToastKeyframes,

  getToastRole,
  getToastLive,

  getToastIconSvg,
  createToastIconNode,
  createToastContentNode,
  createToastCloseButton,
  createToastProgressNode,
  createToastNode,

  patchToastNode,

  markToastNodeDismissing,
  unmarkToastNodeDismissing,
  removeToastNode,

  getToastDomSnapshot,
};
