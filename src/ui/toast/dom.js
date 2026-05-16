/* =========================================================
   Onion SPA - Toast DOM
   Archivo: src/ui/toast/dom.js

   TOAST DOM · SIMPLE
   - crea/resuelve stack container
   - renderiza toast node seguro
   - texto siempre con textContent
   - SVGs internos controlados con createElementNS
   - patch visual estable
   - remove node
   - CSP limpio: no style injection
   - sin store/timers/auth/router/http
========================================================= */

import {
  TOAST_CONTAINER_ID,
  TOAST_KEYFRAMES_ID,

  TOAST_DATA_ROOT,
  TOAST_DATA_ID,
  TOAST_DATA_TYPE,
  TOAST_DATA_DISMISSING,
  TOAST_DATA_PAUSED,
  TOAST_DATA_PERSISTENT,
  TOAST_DATA_CREATED_AT,

  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
  TOAST_TYPE_INFO,
  TOAST_TYPE_LOADING,
  TOAST_DEFAULT_TYPE,
  TOAST_TYPES,
  TOAST_TYPE_ALIASES,

  TOAST_ROLE_STATUS,
  TOAST_LIVE_POLITE,
  TOAST_ROLES_BY_TYPE,
  TOAST_LIVE_BY_TYPE,

  TOAST_CLASS_CONTAINER,
  TOAST_CLASS_ITEM,
  TOAST_CLASS_VISIBLE,
  TOAST_CLASS_DISMISSING,
  TOAST_CLASS_PAUSED,
  TOAST_CLASS_PERSISTENT,
  TOAST_CLASS_ICON,
  TOAST_CLASS_BODY,
  TOAST_CLASS_TITLE,
  TOAST_CLASS_MESSAGE,
  TOAST_CLASS_CLOSE,
  TOAST_CLASS_PROGRESS,
  TOAST_CLASS_BY_TYPE,

  TOAST_PROGRESS_ANIMATION_NAME,
} from "./constants.js";

import { getToastCloseLabel } from "./text.js";

export const TOAST_DOM_VERSION = "18.0.0-simple";

const SVG_NS = "http://www.w3.org/2000/svg";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const output = String(value).trim();
  return output || fallback;
}

function safeBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const output = safeText(value, "").toLowerCase();
  if (["true", "yes", "si", "sí", "on", "ok"].includes(output)) return true;
  if (["false", "no", "off"].includes(output)) return false;

  return Boolean(fallback);
}

function normalizeToastType(type = TOAST_DEFAULT_TYPE) {
  const raw = safeText(type, TOAST_DEFAULT_TYPE).toLowerCase();
  const alias = TOAST_TYPE_ALIASES?.[raw] || raw;
  return TOAST_TYPES.includes(alias) ? alias : TOAST_DEFAULT_TYPE;
}

function createEl(tagName = "div", className = "") {
  if (!isBrowser()) return null;

  try {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    return node;
  } catch {
    return null;
  }
}

function setAttr(node, name, value) {
  if (!isElement(node) || !name) return false;

  try {
    if (value === null || value === undefined || value === "") node.removeAttribute(name);
    else node.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function setDataAttr(node, name, value) {
  return setAttr(node, name, value);
}

function setText(node, value = "") {
  if (!isElement(node)) return false;

  try {
    node.textContent = safeText(value, "");
    return true;
  } catch {
    return false;
  }
}

function append(parent, child) {
  if (!isElement(parent) || !child) return false;

  try {
    parent.appendChild(child);
    return true;
  } catch {
    return false;
  }
}

function removeNode(node) {
  if (!node) return false;

  try {
    node.remove();
    return true;
  } catch {}

  try {
    node.parentNode?.removeChild?.(node);
    return true;
  } catch {
    return false;
  }
}

function replaceNode(current, next) {
  if (!current || !next) return false;

  try {
    current.replaceWith(next);
    return true;
  } catch {}

  try {
    current.parentNode?.replaceChild?.(next, current);
    return true;
  } catch {
    return false;
  }
}

function getTypeClass(type = TOAST_DEFAULT_TYPE) {
  const toastType = normalizeToastType(type);
  return TOAST_CLASS_BY_TYPE?.[toastType] || `toast--${toastType}`;
}

function buildToastClassName(type = TOAST_DEFAULT_TYPE, extra = "") {
  const toastType = normalizeToastType(type);

  return [
    TOAST_CLASS_ITEM || "toast",
    toastType,
    getTypeClass(toastType),
    safeText(extra, ""),
  ].filter(Boolean).join(" ");
}

function reducedMotion() {
  if (!isBrowser()) return false;

  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

/* =========================================================
   CONTAINER
========================================================= */

export function getToastContainer() {
  if (!isBrowser()) return null;

  try {
    return document.getElementById(TOAST_CONTAINER_ID) || document.querySelector("[data-toast-root]") || null;
  } catch {
    return null;
  }
}

export function ensureToastContainer() {
  if (!isBrowser()) return null;

  let container = getToastContainer();

  if (!container) {
    try {
      container = document.createElement("div");
      container.id = TOAST_CONTAINER_ID;
      container.className = TOAST_CLASS_CONTAINER || "toast-stack";
      document.body.appendChild(container);
    } catch {
      return null;
    }
  }

  try {
    if (!container.id) container.id = TOAST_CONTAINER_ID;
    container.classList.add(TOAST_CLASS_CONTAINER || "toast-stack");

    setDataAttr(container, TOAST_DATA_ROOT, "true");
    setAttr(container, "role", "region");
    setAttr(container, "aria-label", "Notificaciones");
    setAttr(container, "aria-live", TOAST_LIVE_POLITE);
    setAttr(container, "aria-relevant", "additions removals");
    setAttr(container, "aria-atomic", "false");
  } catch {}

  return container;
}

/* =========================================================
   KEYFRAMES
========================================================= */

export function ensureToastKeyframes() {
  if (!isBrowser()) return null;

  try {
    const existing = document.getElementById(TOAST_KEYFRAMES_ID);
    if (existing) return existing;

    document.documentElement?.setAttribute("data-toast-keyframes", TOAST_PROGRESS_ANIMATION_NAME || "toast-progress-shrink");
  } catch {}

  return null;
}

/* =========================================================
   A11Y
========================================================= */

export function getToastRole(type = TOAST_DEFAULT_TYPE) {
  const toastType = normalizeToastType(type);
  return TOAST_ROLES_BY_TYPE?.[toastType] || TOAST_ROLE_STATUS;
}

export function getToastLive(type = TOAST_DEFAULT_TYPE) {
  const toastType = normalizeToastType(type);
  return TOAST_LIVE_BY_TYPE?.[toastType] || TOAST_LIVE_POLITE;
}

/* =========================================================
   SVG ICONS
========================================================= */

function svgNode() {
  if (!isBrowser()) return null;

  try {
    const svg = document.createElementNS(SVG_NS, "svg");
    setAttr(svg, "viewBox", "0 0 24 24");
    setAttr(svg, "fill", "none");
    setAttr(svg, "aria-hidden", "true");
    setAttr(svg, "focusable", "false");
    return svg;
  } catch {
    return null;
  }
}

function svgPath(attrs = {}) {
  if (!isBrowser()) return null;

  try {
    const path = document.createElementNS(SVG_NS, "path");
    Object.entries(attrs).forEach(([key, value]) => path.setAttribute(key, String(value)));
    return path;
  } catch {
    return null;
  }
}

function svgCircle(attrs = {}) {
  if (!isBrowser()) return null;

  try {
    const circle = document.createElementNS(SVG_NS, "circle");
    Object.entries(attrs).forEach(([key, value]) => circle.setAttribute(key, String(value)));
    return circle;
  } catch {
    return null;
  }
}

function makeSuccessIcon() {
  const svg = svgNode();
  if (!svg) return null;

  append(svg, svgPath({
    d: "M20 7 9 18l-5-5",
    stroke: "currentColor",
    "stroke-width": "1.9",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }));

  return svg;
}

function makeErrorIcon() {
  const svg = svgNode();
  if (!svg) return null;

  append(svg, svgPath({ d: "M15 9 9 15", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round" }));
  append(svg, svgPath({ d: "M9 9l6 6", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round" }));
  append(svg, svgCircle({ cx: "12", cy: "12", r: "9", stroke: "currentColor", "stroke-width": "1.7" }));

  return svg;
}

function makeWarningIcon() {
  const svg = svgNode();
  if (!svg) return null;

  append(svg, svgPath({
    d: "M12 3.8 21 19a1.2 1.2 0 0 1-1.04 1.8H4.04A1.2 1.2 0 0 1 3 19L12 3.8Z",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linejoin": "round",
  }));
  append(svg, svgPath({ d: "M12 9v4.2", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round" }));
  append(svg, svgCircle({ cx: "12", cy: "16.8", r: "1", fill: "currentColor" }));

  return svg;
}

function makeInfoIcon() {
  const svg = svgNode();
  if (!svg) return null;

  append(svg, svgCircle({ cx: "12", cy: "12", r: "9", stroke: "currentColor", "stroke-width": "1.7" }));
  append(svg, svgPath({ d: "M12 10.5v5", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round" }));
  append(svg, svgCircle({ cx: "12", cy: "7.4", r: "1", fill: "currentColor" }));

  return svg;
}

export function getToastIconSvg(type = TOAST_DEFAULT_TYPE) {
  switch (normalizeToastType(type)) {
    case TOAST_TYPE_SUCCESS:
      return "success";
    case TOAST_TYPE_ERROR:
      return "error";
    case TOAST_TYPE_WARNING:
      return "warning";
    case TOAST_TYPE_LOADING:
      return "loading";
    case TOAST_TYPE_INFO:
    default:
      return "info";
  }
}

export function createToastIconNode(type = TOAST_DEFAULT_TYPE) {
  if (!isBrowser()) return null;

  const toastType = normalizeToastType(type);
  const icon = createEl("div", TOAST_CLASS_ICON || "toast-icon");
  if (!icon) return null;

  setAttr(icon, "aria-hidden", "true");

  if (toastType === TOAST_TYPE_LOADING) {
    const spinner = createEl("span", "toast-spinner");
    setAttr(spinner, "aria-hidden", "true");
    append(icon, spinner);
    return icon;
  }

  const svg = toastType === TOAST_TYPE_SUCCESS
    ? makeSuccessIcon()
    : toastType === TOAST_TYPE_ERROR
      ? makeErrorIcon()
      : toastType === TOAST_TYPE_WARNING
        ? makeWarningIcon()
        : makeInfoIcon();

  append(icon, svg);
  return icon;
}

/* =========================================================
   CONTENT NODES
========================================================= */

export function createToastContentNode({ title = "", message = "" } = {}) {
  const content = createEl("div", `toast-content ${TOAST_CLASS_BODY || "toast-body"}`);
  if (!content) return null;

  const cleanTitle = safeText(title, "");
  const cleanMessage = safeText(message, "");

  if (cleanTitle) {
    const titleEl = createEl("h4", TOAST_CLASS_TITLE || "toast-title");
    setText(titleEl, cleanTitle);
    append(content, titleEl);
  }

  const messageEl = createEl("p", TOAST_CLASS_MESSAGE || "toast-message");
  setText(messageEl, cleanMessage);
  append(content, messageEl);

  return content;
}

export function createToastCloseButton(id = "") {
  const button = createEl("button", TOAST_CLASS_CLOSE || "toast-close");
  if (!button) return null;

  const label = safeText(getToastCloseLabel(), "Cerrar notificación");

  button.type = "button";
  button.textContent = "×";

  setAttr(button, "data-toast-dismiss", safeText(id, ""));
  setAttr(button, "aria-label", label);
  setAttr(button, "title", label);

  return button;
}

export function createToastProgressNode() {
  const progress = createEl("div", TOAST_CLASS_PROGRESS || "toast-progress");
  if (!progress) return null;

  setAttr(progress, "aria-hidden", "true");
  return progress;
}

/* =========================================================
   TOAST NODE
========================================================= */

export function createToastNode({
  id = "",
  type = TOAST_DEFAULT_TYPE,
  title = "",
  message = "",
  closable = true,
  persistent = false,
  paused = false,
  createdAt = "",
} = {}) {
  if (!isBrowser()) return null;

  const toastId = safeText(id, "");
  const toastType = normalizeToastType(type);
  const node = createEl("article", buildToastClassName(toastType));

  if (!node) return null;

  setDataAttr(node, TOAST_DATA_ID, toastId);
  setDataAttr(node, TOAST_DATA_TYPE, toastType);
  setDataAttr(node, TOAST_DATA_DISMISSING, null);
  setDataAttr(node, TOAST_DATA_PAUSED, paused ? "true" : null);
  setDataAttr(node, TOAST_DATA_PERSISTENT, persistent ? "true" : null);
  setDataAttr(node, TOAST_DATA_CREATED_AT, createdAt || String(Date.now()));

  try {
    node.dataset.toastId = toastId;
  } catch {}

  setAttr(node, "role", getToastRole(toastType));
  setAttr(node, "aria-live", getToastLive(toastType));
  setAttr(node, "aria-atomic", "true");
  setAttr(node, "tabindex", "-1");

  append(node, createToastIconNode(toastType));
  append(node, createToastContentNode({ title, message }));

  if (safeBool(closable, true)) append(node, createToastCloseButton(toastId));

  append(node, createToastProgressNode());

  return node;
}

/* =========================================================
   QUERY PARTS
========================================================= */

function getToastContentNode(root) {
  if (!isElement(root)) return null;

  try {
    return root.querySelector(".toast-content, .toast-body");
  } catch {
    return null;
  }
}

function getToastIconNode(root) {
  if (!isElement(root)) return null;

  try {
    return root.querySelector(".toast-icon");
  } catch {
    return null;
  }
}

function getToastCloseNode(root) {
  if (!isElement(root)) return null;

  try {
    return root.querySelector(".toast-close");
  } catch {
    return null;
  }
}

function getToastProgressNode(root) {
  if (!isElement(root)) return null;

  try {
    return root.querySelector(".toast-progress");
  } catch {
    return null;
  }
}

/* =========================================================
   PATCH
========================================================= */

export function patchToastNode(item) {
  if (!item?.toastEl || !isElement(item.toastEl)) return item || null;

  const node = item.toastEl;
  const toastType = normalizeToastType(item.type);
  const wasVisible = node.classList?.contains?.(TOAST_CLASS_VISIBLE) || node.classList?.contains?.("show");

  node.className = buildToastClassName(toastType, item.dismissed ? TOAST_CLASS_DISMISSING : "");

  if (wasVisible && !item.dismissed) {
    try {
      node.classList.add(TOAST_CLASS_VISIBLE || "show");
      node.classList.add("show");
    } catch {}
  }

  if (item.paused) {
    try {
      node.classList.add(TOAST_CLASS_PAUSED);
    } catch {}
  }

  if (item.duration === 0 || item.persistent) {
    try {
      node.classList.add(TOAST_CLASS_PERSISTENT);
    } catch {}
  }

  setDataAttr(node, TOAST_DATA_ID, safeText(item.id, ""));
  setDataAttr(node, TOAST_DATA_TYPE, toastType);
  setDataAttr(node, TOAST_DATA_DISMISSING, item.dismissed ? "true" : null);
  setDataAttr(node, TOAST_DATA_PAUSED, item.paused ? "true" : null);
  setDataAttr(node, TOAST_DATA_PERSISTENT, item.duration === 0 || item.persistent ? "true" : null);
  setDataAttr(node, TOAST_DATA_CREATED_AT, item.createdAt || null);

  try {
    node.dataset.toastId = safeText(item.id, "");
  } catch {}

  setAttr(node, "role", getToastRole(toastType));
  setAttr(node, "aria-live", getToastLive(toastType));
  setAttr(node, "aria-atomic", "true");
  setAttr(node, "tabindex", "-1");

  const nextIcon = createToastIconNode(toastType);
  const oldIcon = getToastIconNode(node);

  if (oldIcon && nextIcon) replaceNode(oldIcon, nextIcon);
  else if (nextIcon) {
    try {
      node.prepend(nextIcon);
    } catch {
      append(node, nextIcon);
    }
  }

  const nextContent = createToastContentNode({ title: item.title, message: item.message });
  const oldContent = getToastContentNode(node);

  if (oldContent && nextContent) replaceNode(oldContent, nextContent);
  else if (nextContent) append(node, nextContent);

  const oldClose = getToastCloseNode(node);

  if (item.closable) {
    const nextClose = createToastCloseButton(item.id);

    if (oldClose && nextClose) replaceNode(oldClose, nextClose);
    else if (nextClose) {
      const progress = getToastProgressNode(node);

      try {
        if (progress) node.insertBefore(nextClose, progress);
        else node.appendChild(nextClose);
      } catch {
        append(node, nextClose);
      }
    }
  } else if (oldClose) {
    removeNode(oldClose);
  }

  if (!getToastProgressNode(node)) append(node, createToastProgressNode());

  item.toastEl = node;
  item.progressEl = getToastProgressNode(node);

  return item;
}

/* =========================================================
   DISMISS VISUAL STATE
========================================================= */

export function markToastNodeDismissing(item) {
  if (!item?.toastEl) return false;

  const node = item.toastEl;

  try {
    node.classList.add(TOAST_CLASS_DISMISSING);
    node.classList.add("is-dismissing");
    node.classList.remove(TOAST_CLASS_VISIBLE);
    node.classList.remove("show");

    setDataAttr(node, TOAST_DATA_DISMISSING, "true");
    setAttr(node, "aria-hidden", "true");

    return true;
  } catch {
    return false;
  }
}

export function unmarkToastNodeDismissing(item) {
  if (!item?.toastEl) return false;

  const node = item.toastEl;

  try {
    node.classList.remove(TOAST_CLASS_DISMISSING);
    node.classList.remove("is-dismissing");
    setDataAttr(node, TOAST_DATA_DISMISSING, null);
    setAttr(node, "aria-hidden", null);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REMOVE
========================================================= */

export function removeToastNode(item) {
  if (!item) return false;

  try {
    removeNode(item.toastEl);
  } catch {}

  try {
    item.toastEl = null;
    item.progressEl = null;
  } catch {}

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastDomSnapshot() {
  const container = getToastContainer();

  let toastCount = 0;

  try {
    toastCount = container
      ? container.querySelectorAll(`.${TOAST_CLASS_ITEM || "toast"}, [${TOAST_DATA_ID}]`).length
      : 0;
  } catch {}

  return {
    version: TOAST_DOM_VERSION,
    browser: isBrowser(),
    containerId: TOAST_CONTAINER_ID,
    hasContainer: Boolean(container),
    toastCount,
    reducedMotion: reducedMotion(),
    keyframesId: TOAST_KEYFRAMES_ID,
    progressAnimation: TOAST_PROGRESS_ANIMATION_NAME,
  };
}

export default {
  TOAST_DOM_VERSION,

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
