/* =========================================================
   Onion SPA - Toast UI
   Archivo: src/ui/toast.js

   Responsabilidades:
   - sistema global de toast para toda la SPA
   - success / error / warning / info / loading
   - stack superior derecha
   - auto close configurable
   - pause on hover
   - update / dismiss / clear
   - integración robusta con AppCore
   - init seguro una sola vez
   - accesible
   - compatible con ui.css
========================================================= */

import { AppCore } from "../core/core.js";

export const Toast = (() => {
  "use strict";

  const SCOPE = "ui:toast";
  const DEFAULT_DURATION = 4200;
  const MAX_TOASTS = 5;
  const CONTAINER_ID = "toast-stack";

  let initialized = false;
  let seed = 0;

  const store = new Map();

  /* =========================================================
     HELPERS
  ========================================================= */
  function nextId() {
    seed += 1;
    return `toast-${Date.now()}-${seed}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  function normalizeType(type = "info") {
    const value = String(type || "info").trim().toLowerCase();

    if (
      value === "success" ||
      value === "error" ||
      value === "warning" ||
      value === "info" ||
      value === "loading"
    ) {
      return value;
    }

    return "info";
  }

  function normalizeDuration(type, duration) {
    if (type === "loading") return 0;
    if (duration === false || duration === null) return 0;
    if (typeof duration === "number" && Number.isFinite(duration)) {
      return Math.max(0, duration);
    }
    return DEFAULT_DURATION;
  }

  function getIconSvg(type) {
    switch (type) {
      case "success":
        return `
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20 7 9 18l-5-5"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        `;

      case "error":
        return `
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

      case "warning":
        return `
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
            <circle cx="12" cy="16.8" r="1" fill="currentColor" />
          </svg>
        `;

      case "loading":
        return `
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              stroke-width="1.7"
              opacity=".28"
            />
            <path
              d="M12 3a9 9 0 0 1 9 9"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
            />
          </svg>
        `;

      case "info":
      default:
        return `
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
            <circle cx="12" cy="7.4" r="1" fill="currentColor" />
          </svg>
        `;
    }
  }

  function getAriaRole(type) {
    return type === "error" || type === "warning" ? "alert" : "status";
  }

  function getAriaLive(type) {
    return type === "error" || type === "warning" ? "assertive" : "polite";
  }

  function getContainer() {
    return document.getElementById(CONTAINER_ID);
  }

  function ensureContainer() {
    let container = getContainer();

    if (container) return container;

    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.className = "toast-stack";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-relevant", "additions removals");
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.right = "0";
    container.style.zIndex = "var(--z-toast, 100)";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "12px";
    container.style.padding = "24px";
    container.style.pointerEvents = "none";
    container.style.width = "min(560px, 100vw)";
    container.style.maxWidth = "100%";

    document.body.appendChild(container);
    return container;
  }

  function enforceMaxToasts() {
    const active = [...store.values()]
      .filter((item) => item?.toastEl?.isConnected)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    while (active.length > MAX_TOASTS) {
      const oldest = active.shift();
      if (oldest?.id) {
        dismiss(oldest.id);
      }
    }
  }

  function clearTimer(item) {
    if (!item) return;

    if (item.timeoutId) {
      window.clearTimeout(item.timeoutId);
      item.timeoutId = null;
    }
  }

  function startTimer(item) {
    if (!item || !item.duration || item.duration <= 0) return;

    clearTimer(item);

    const remaining = Math.max(0, item.remaining ?? item.duration);
    item.startedAt = Date.now();

    item.timeoutId = window.setTimeout(() => {
      dismiss(item.id);
    }, remaining);

    updateProgressAnimation(item, remaining);
  }

  function pauseTimer(item) {
    if (!item || !item.duration || item.duration <= 0) return;

    if (!item.startedAt) return;

    const elapsed = Date.now() - item.startedAt;
    item.remaining = Math.max(0, (item.remaining ?? item.duration) - elapsed);
    item.startedAt = 0;

    clearTimer(item);
    freezeProgress(item);
  }

  function resumeTimer(item) {
    if (!item || !item.duration || item.duration <= 0) return;
    if (item.remaining <= 0) {
      dismiss(item.id);
      return;
    }
    startTimer(item);
  }

  function freezeProgress(item) {
    const progressEl = item?.progressEl;
    if (!progressEl) return;

    const computed = window.getComputedStyle(progressEl).transform;
    progressEl.style.animation = "none";
    progressEl.style.transform = computed === "none" ? "scaleX(1)" : computed;
  }

  function updateProgressAnimation(item, duration) {
    const progressEl = item?.progressEl;
    if (!progressEl) return;

    if (!duration || duration <= 0 || item.type === "loading") {
      progressEl.style.display = "none";
      progressEl.style.animation = "none";
      progressEl.style.transform = "scaleX(1)";
      return;
    }

    progressEl.style.display = "";
    progressEl.style.animation = "none";
    progressEl.style.transform = "scaleX(1)";

    if (isReducedMotion()) {
      return;
    }

    // Force reflow
    void progressEl.offsetWidth;

    progressEl.style.animation = `toastProgress ${duration}ms linear forwards`;
  }

  function createToastElement({
    id,
    type,
    title,
    message,
    closable = true,
  }) {
    const toast = document.createElement("article");
    toast.className = `toast ${type}`;
    toast.dataset.toastId = id;
    toast.setAttribute("role", getAriaRole(type));
    toast.setAttribute("aria-live", getAriaLive(type));
    toast.setAttribute("aria-atomic", "true");
    toast.style.pointerEvents = "auto";

    toast.innerHTML = `
      <div class="toast-icon">${getIconSvg(type)}</div>

      <div class="toast-content">
        ${title ? `<h4 class="toast-title">${escapeHtml(title)}</h4>` : ""}
        <p class="toast-message">${escapeHtml(message)}</p>
      </div>

      ${
        closable
          ? `
            <button
              type="button"
              class="toast-close"
              aria-label="Cerrar notificación"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
                <path d="M15 9 9 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M9 9l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          `
          : ""
      }

      <div class="toast-progress" aria-hidden="true"></div>
    `;

    return toast;
  }

  function injectToastProgressKeyframes() {
    if (document.getElementById("toast-progress-keyframes")) return;

    const style = document.createElement("style");
    style.id = "toast-progress-keyframes";
    style.textContent = `
      @keyframes toastProgress{
        from{ transform:scaleX(1); opacity:1; }
        to{ transform:scaleX(0); opacity:.72; }
      }
    `;
    document.head.appendChild(style);
  }

  function registerInteractions(item) {
    const { toastEl } = item;
    if (!toastEl) return;

    const closeBtn = toastEl.querySelector(".toast-close");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        dismiss(item.id);
      });
    }

    toastEl.addEventListener("mouseenter", () => {
      pauseTimer(item);
    });

    toastEl.addEventListener("mouseleave", () => {
      resumeTimer(item);
    });
  }

  function removeElement(item) {
    if (!item?.toastEl) return;
    item.toastEl.remove();
  }

  function destroyItem(item) {
    if (!item) return;
    clearTimer(item);
    removeElement(item);
    store.delete(item.id);
  }

  /* =========================================================
     API CORE
  ========================================================= */
  function show(options = {}) {
    const type = normalizeType(options.type);
    const title = String(options.title || "").trim();
    const message = String(options.message || options.text || "").trim();

    if (!message) {
      AppCore.utils?.warn?.("Toast.show requiere message/text.");
      return null;
    }

    const id = String(options.id || nextId());
    const duration = normalizeDuration(type, options.duration);
    const closable = options.closable !== false;
    const container = ensureContainer();

    if (!container) return null;

    const existing = store.get(id);
    if (existing) {
      return update(id, {
        type,
        title,
        message,
        duration,
        closable,
      });
    }

    const toastEl = createToastElement({
      id,
      type,
      title,
      message,
      closable,
    });

    const progressEl = toastEl.querySelector(".toast-progress");

    const item = {
      id,
      type,
      title,
      message,
      duration,
      remaining: duration,
      startedAt: 0,
      timeoutId: null,
      closable,
      toastEl,
      progressEl,
      createdAt: Date.now(),
    };

    store.set(id, item);
    container.appendChild(toastEl);

    registerInteractions(item);
    updateProgressAnimation(item, duration);

    requestAnimationFrame(() => {
      toastEl.classList.add("show");
    });

    startTimer(item);
    enforceMaxToasts();

    AppCore.events?.emit?.("toast:show", {
      id,
      type,
      title,
      message,
      duration,
    });

    return id;
  }

  function update(id, patch = {}) {
    const item = store.get(String(id));
    if (!item) return null;

    const nextType = patch.type ? normalizeType(patch.type) : item.type;
    const nextTitle =
      patch.title !== undefined ? String(patch.title || "").trim() : item.title;
    const nextMessage =
      patch.message !== undefined || patch.text !== undefined
        ? String(patch.message || patch.text || "").trim()
        : item.message;

    const nextDuration =
      patch.duration !== undefined
        ? normalizeDuration(nextType, patch.duration)
        : item.duration;

    const nextClosable =
      patch.closable !== undefined ? patch.closable !== false : item.closable;

    item.type = nextType;
    item.title = nextTitle;
    item.message = nextMessage;
    item.duration = nextDuration;
    item.remaining = nextDuration;
    item.closable = nextClosable;

    const newEl = createToastElement({
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      closable: item.closable,
    });

    item.toastEl.replaceWith(newEl);
    item.toastEl = newEl;
    item.progressEl = newEl.querySelector(".toast-progress");

    registerInteractions(item);
    updateProgressAnimation(item, nextDuration);
    startTimer(item);

    newEl.classList.add("show");

    AppCore.events?.emit?.("toast:update", {
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      duration: item.duration,
    });

    return item.id;
  }

  function dismiss(id) {
    const item = store.get(String(id));
    if (!item) return false;

    clearTimer(item);

    const { toastEl } = item;
    if (!toastEl) {
      destroyItem(item);
      return true;
    }

    toastEl.classList.remove("show");
    toastEl.style.pointerEvents = "none";

    const removeNow = isReducedMotion();
    const delay = removeNow ? 0 : 220;

    window.setTimeout(() => {
      destroyItem(item);
    }, delay);

    AppCore.events?.emit?.("toast:dismiss", {
      id: item.id,
      type: item.type,
    });

    return true;
  }

  function clear() {
    [...store.keys()].forEach((id) => dismiss(id));
  }

  /* =========================================================
     SHORTCUTS
  ========================================================= */
  function success(message, options = {}) {
    return show({
      ...options,
      type: "success",
      message,
    });
  }

  function error(message, options = {}) {
    return show({
      ...options,
      type: "error",
      message,
    });
  }

  function warning(message, options = {}) {
    return show({
      ...options,
      type: "warning",
      message,
    });
  }

  function info(message, options = {}) {
    return show({
      ...options,
      type: "info",
      message,
    });
  }

  function loading(message = "Cargando...", options = {}) {
    return show({
      ...options,
      type: "loading",
      message,
      duration: 0,
      closable: options.closable ?? false,
    });
  }

  /* =========================================================
     EVENT BRIDGE
  ========================================================= */
  function bindGlobalEvents(scope) {
    if (!AppCore.cleanup?.event) return;

    AppCore.cleanup.event(scope, "toast:show", ({ detail }) => {
      if (!detail || detail.__fromToastModule) return;

      show({
        ...detail,
      });
    });

    AppCore.cleanup.event(scope, "toast:success", ({ detail }) => {
      if (!detail) return;
      success(detail.message || detail.text || "", detail);
    });

    AppCore.cleanup.event(scope, "toast:error", ({ detail }) => {
      if (!detail) return;
      error(detail.message || detail.text || "", detail);
    });

    AppCore.cleanup.event(scope, "toast:warning", ({ detail }) => {
      if (!detail) return;
      warning(detail.message || detail.text || "", detail);
    });

    AppCore.cleanup.event(scope, "toast:info", ({ detail }) => {
      if (!detail) return;
      info(detail.message || detail.text || "", detail);
    });

    AppCore.cleanup.event(scope, "toast:dismiss", ({ detail }) => {
      if (!detail?.id) return;
      dismiss(detail.id);
    });

    AppCore.cleanup.event(scope, "toast:clear", () => {
      clear();
    });
  }

  /* =========================================================
     INIT
  ========================================================= */
  function init() {
    if (initialized) {
      ensureContainer();
      return api;
    }

    injectToastProgressKeyframes();
    ensureContainer();

    const scope = AppCore.cleanup?.scope?.(SCOPE);

    if (scope) {
      bindGlobalEvents(scope);
    }

    initialized = true;

    if (AppCore.modules && !AppCore.modules.has("toast")) {
      AppCore.modules.register("toast", api);
    }

    AppCore.utils?.log?.("Toast UI inicializado correctamente.");

    return api;
  }

  const api = {
    init,
    show,
    update,
    dismiss,
    clear,
    success,
    error,
    warning,
    info,
    loading,
  };

  return api;
})();
