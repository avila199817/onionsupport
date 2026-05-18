/* =========================================================
   Onion Support - Toast DOM
   Archivo: /src/ui/toast/dom.js

   Responsabilidad:
   - Compat DOM mínima para Toast.
   - Crear/resolver #toast-container.
   - Crear/patch/remove nodos toast.
   - Texto siempre con textContent.
   - SVGs internos controlados.
   - Sin imports.
   - Sin store.
   - Sin timers.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin CSS runtime.
   - Sin keyframes injection.
   - Sin magia negra.
   - El Toast real vive en src/ui/toast/index.js.
========================================================= */

export const TOAST_DOM_VERSION = "simple";

const CONTAINER_ID = "toast-container";
const SVG_NS = "http://www.w3.org/2000/svg";

const TYPES = new Set([
  "success",
  "error",
  "warning",
  "info",
  "loading",
]);

const ROLE_BY_TYPE = Object.freeze({
  success: "status",
  error: "alert",
  warning: "alert",
  info: "status",
  loading: "status",
});

const LIVE_BY_TYPE = Object.freeze({
  success: "polite",
  error: "assertive",
  warning: "assertive",
  info: "polite",
  loading: "polite",
});

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizeType(type = "info") {
  const clean = text(type, "info").toLowerCase();

  if (clean === "danger" || clean === "fail" || clean === "failure") return "error";
  if (clean === "warn" || clean === "alert") return "warning";
  if (clean === "ok" || clean === "done" || clean === "saved") return "success";
  if (clean === "pending" || clean === "progress" || clean === "processing") return "loading";

  return TYPES.has(clean) ? clean : "info";
}

function createEl(tagName = "div", className = "") {
  if (!isBrowser()) return null;

  const node = document.createElement(tagName);

  if (className) node.className = className;

  return node;
}

function setAttr(node, name = "", value = "") {
  if (!isElement(node) || !name) return false;

  try {
    if (value === null || value === undefined || value === "") {
      node.removeAttribute(name);
    } else {
      node.setAttribute(name, String(value));
    }

    return true;
  } catch {
    return false;
  }
}

function setText(node, value = "") {
  if (!isElement(node)) return false;

  try {
    node.textContent = text(value, "");
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

function removeElement(node = null) {
  if (!node) return false;

  try {
    node.remove();
    return true;
  } catch {
    try {
      node.parentNode?.removeChild?.(node);
      return true;
    } catch {
      return false;
    }
  }
}

function replaceElement(current = null, next = null) {
  if (!current || !next) return false;

  try {
    current.replaceWith(next);
    return true;
  } catch {
    try {
      current.parentNode?.replaceChild?.(next, current);
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   CONTAINER
========================================================= */

export function getToastContainer() {
  if (!isBrowser()) return null;

  try {
    return (
      document.getElementById(CONTAINER_ID) ||
      document.querySelector("[data-toast-container]") ||
      document.querySelector("[data-toast-root]") ||
      null
    );
  } catch {
    return null;
  }
}

export function ensureToastContainer() {
  if (!isBrowser()) return null;

  let container = getToastContainer();

  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.className = "toast-container";
    container.dataset.toastContainer = "true";

    try {
      document.body.appendChild(container);
    } catch {
      return null;
    }
  }

  try {
    if (!container.id) container.id = CONTAINER_ID;

    container.classList.add("toast-container");
    container.dataset.toastContainer = "true";

    setAttr(container, "aria-live", "polite");
    setAttr(container, "aria-atomic", "false");
    setAttr(container, "aria-relevant", "additions removals");
  } catch {
    // noop
  }

  return container;
}

export function ensureToastKeyframes() {
  return null;
}

/* =========================================================
   A11Y
========================================================= */

export function getToastRole(type = "info") {
  return ROLE_BY_TYPE[normalizeType(type)] || "status";
}

export function getToastLive(type = "info") {
  return LIVE_BY_TYPE[normalizeType(type)] || "polite";
}

/* =========================================================
   SVG ICONS
========================================================= */

function svgRoot() {
  if (!isBrowser()) return null;

  const svg = document.createElementNS(SVG_NS, "svg");

  setAttr(svg, "viewBox", "0 0 24 24");
  setAttr(svg, "fill", "none");
  setAttr(svg, "aria-hidden", "true");
  setAttr(svg, "focusable", "false");

  return svg;
}

function svgPath(attrs = {}) {
  if (!isBrowser()) return null;

  const path = document.createElementNS(SVG_NS, "path");

  for (const [key, value] of Object.entries(attrs || {})) {
    path.setAttribute(key, String(value));
  }

  return path;
}

function svgCircle(attrs = {}) {
  if (!isBrowser()) return null;

  const circle = document.createElementNS(SVG_NS, "circle");

  for (const [key, value] of Object.entries(attrs || {})) {
    circle.setAttribute(key, String(value));
  }

  return circle;
}

function successIcon() {
  const svg = svgRoot();

  append(svg, svgPath({
    d: "M20 7 9 18l-5-5",
    stroke: "currentColor",
    "stroke-width": "1.9",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }));

  return svg;
}

function errorIcon() {
  const svg = svgRoot();

  append(svg, svgCircle({
    cx: "12",
    cy: "12",
    r: "9",
    stroke: "currentColor",
    "stroke-width": "1.7",
  }));

  append(svg, svgPath({
    d: "M15 9 9 15",
    stroke: "currentColor",
    "stroke-width": "1.9",
    "stroke-linecap": "round",
  }));

  append(svg, svgPath({
    d: "M9 9l6 6",
    stroke: "currentColor",
    "stroke-width": "1.9",
    "stroke-linecap": "round",
  }));

  return svg;
}

function warningIcon() {
  const svg = svgRoot();

  append(svg, svgPath({
    d: "M12 3.8 21 19a1.2 1.2 0 0 1-1.04 1.8H4.04A1.2 1.2 0 0 1 3 19L12 3.8Z",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linejoin": "round",
  }));

  append(svg, svgPath({
    d: "M12 9v4.2",
    stroke: "currentColor",
    "stroke-width": "1.9",
    "stroke-linecap": "round",
  }));

  append(svg, svgCircle({
    cx: "12",
    cy: "16.8",
    r: "1",
    fill: "currentColor",
  }));

  return svg;
}

function infoIcon() {
  const svg = svgRoot();

  append(svg, svgCircle({
    cx: "12",
    cy: "12",
    r: "9",
    stroke: "currentColor",
    "stroke-width": "1.7",
  }));

  append(svg, svgPath({
    d: "M12 10.5v5",
    stroke: "currentColor",
    "stroke-width": "1.9",
    "stroke-linecap": "round",
  }));

  append(svg, svgCircle({
    cx: "12",
    cy: "7.4",
    r: "1",
    fill: "currentColor",
  }));

  return svg;
}

export function getToastIconSvg(type = "info") {
  return normalizeType(type);
}

export function createToastIconNode(type = "info") {
  const toastType = normalizeType(type);
  const icon = createEl("div", "toast-icon");

  if (!icon) return null;

  setAttr(icon, "aria-hidden", "true");

  if (toastType === "loading") {
    const spinner = createEl("span", "toast-spinner");
    setAttr(spinner, "aria-hidden", "true");
    append(icon, spinner);
    return icon;
  }

  const svg =
    toastType === "success"
      ? successIcon()
      : toastType === "error"
        ? errorIcon()
        : toastType === "warning"
          ? warningIcon()
          : infoIcon();

  append(icon, svg);

  return icon;
}

/* =========================================================
   CONTENT
========================================================= */

export function createToastContentNode({ title = "", message = "" } = {}) {
  const content = createEl("div", "toast-content");

  if (!content) return null;

  const cleanTitle = text(title, "");
  const cleanMessage = text(message, "");

  if (cleanTitle) {
    const titleNode = createEl("strong", "toast-title");
    titleNode.dataset.toastTitle = "true";
    setText(titleNode, cleanTitle);
    append(content, titleNode);
  }

  const messageNode = createEl("div", "toast-message");
  messageNode.dataset.toastMessage = "true";
  setText(messageNode, cleanMessage);
  append(content, messageNode);

  return content;
}

export function createToastCloseButton(id = "") {
  const button = createEl("button", "toast-close");

  if (!button) return null;

  button.type = "button";
  button.textContent = "×";
  button.dataset.toastDismiss = text(id, "");
  button.setAttribute("aria-label", "Cerrar notificación");

  return button;
}

export function createToastProgressNode() {
  const progress = createEl("div", "toast-progress");

  if (!progress) return null;

  setAttr(progress, "aria-hidden", "true");

  return progress;
}

/* =========================================================
   TOAST NODE
========================================================= */

function toastClass(type = "info", extra = "") {
  const toastType = normalizeType(type);

  return [
    "toast",
    `toast--${toastType}`,
    text(extra, ""),
  ].filter(Boolean).join(" ");
}

export function createToastNode({
  id = "",
  type = "info",
  title = "",
  message = "",
  closable = true,
  persistent = false,
  paused = false,
  createdAt = "",
} = {}) {
  if (!isBrowser()) return null;

  const toastId = text(id, "");
  const toastType = normalizeType(type);
  const node = createEl("article", toastClass(toastType));

  if (!node) return null;

  node.dataset.toastId = toastId;
  node.dataset.toastType = toastType;
  node.dataset.toastCreatedAt = createdAt || String(Date.now());

  if (persistent) node.dataset.toastPersistent = "true";
  if (paused) node.dataset.toastPaused = "true";

  setAttr(node, "role", getToastRole(toastType));
  setAttr(node, "aria-live", getToastLive(toastType));
  setAttr(node, "aria-atomic", "true");

  append(node, createToastIconNode(toastType));

  const body = createEl("div", "toast-body");
  append(body, createToastContentNode({ title, message }));

  if (closable !== false) {
    append(body, createToastCloseButton(toastId));
  }

  append(node, body);
  append(node, createToastProgressNode());

  return node;
}

/* =========================================================
   PATCH
========================================================= */

function part(root = null, selector = "") {
  if (!isElement(root) || !selector) return null;

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

export function patchToastNode(item) {
  if (!item?.toastEl || !isElement(item.toastEl)) return item || null;

  const node = item.toastEl;
  const toastType = normalizeType(item.type);
  const visible = node.classList.contains("show");

  node.className = toastClass(toastType, item.dismissed ? "is-dismissing" : "");

  if (visible && !item.dismissed) {
    node.classList.add("show");
  }

  node.dataset.toastId = text(item.id, "");
  node.dataset.toastType = toastType;

  if (item.duration === 0 || item.persistent) {
    node.dataset.toastPersistent = "true";
  } else {
    delete node.dataset.toastPersistent;
  }

  if (item.dismissed) {
    node.dataset.toastDismissing = "true";
    setAttr(node, "aria-hidden", "true");
  } else {
    delete node.dataset.toastDismissing;
    setAttr(node, "aria-hidden", null);
  }

  setAttr(node, "role", getToastRole(toastType));
  setAttr(node, "aria-live", getToastLive(toastType));
  setAttr(node, "aria-atomic", "true");

  const oldIcon = part(node, ".toast-icon");
  const nextIcon = createToastIconNode(toastType);

  if (oldIcon && nextIcon) replaceElement(oldIcon, nextIcon);
  else if (nextIcon) node.prepend(nextIcon);

  const oldContent = part(node, ".toast-content");
  const nextContent = createToastContentNode({
    title: item.title,
    message: item.message,
  });

  if (oldContent && nextContent) replaceElement(oldContent, nextContent);

  const body = part(node, ".toast-body") || node;
  const oldClose = part(node, ".toast-close");

  if (item.closable !== false) {
    const nextClose = createToastCloseButton(item.id);

    if (oldClose && nextClose) replaceElement(oldClose, nextClose);
    else if (nextClose) append(body, nextClose);
  } else if (oldClose) {
    removeElement(oldClose);
  }

  if (!part(node, ".toast-progress")) {
    append(node, createToastProgressNode());
  }

  item.toastEl = node;
  item.progressEl = part(node, ".toast-progress");

  return item;
}

/* =========================================================
   DISMISS VISUAL STATE
========================================================= */

export function markToastNodeDismissing(item) {
  if (!item?.toastEl) return false;

  const node = item.toastEl;

  try {
    node.classList.add("is-dismissing");
    node.classList.remove("show");
    node.dataset.toastDismissing = "true";
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
    node.classList.remove("is-dismissing");
    delete node.dataset.toastDismissing;
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

  const node = isElement(item) ? item : item.toastEl;

  const removed = removeElement(node);

  try {
    if (!isElement(item)) {
      item.toastEl = null;
      item.progressEl = null;
    }
  } catch {
    // noop
  }

  return removed;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastDomSnapshot() {
  const container = getToastContainer();

  let toastCount = 0;

  try {
    toastCount = container
      ? container.querySelectorAll(".toast, [data-toast-id]").length
      : 0;
  } catch {
    toastCount = 0;
  }

  return {
    version: TOAST_DOM_VERSION,

    browser: isBrowser(),

    containerId: CONTAINER_ID,
    hasContainer: Boolean(container),
    toastCount,

    keyframes: false,
    cssRuntime: false,

    policy: {
      compatOnly: true,
      noImports: true,
      noStore: true,
      noTimers: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noCssInjection: true,
      textContentOnly: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
