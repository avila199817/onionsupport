/* =========================================================
   Onion SPA - Toast Timers
   Archivo: src/ui/toast/timers.js

   Responsabilidades:
   - auto close timers
   - pause on hover
   - resume
   - progress animation
   - clear timers
   - endurecer race conditions / updates / hover spam
   - tolerar SSR/tests sin window/document
   - evitar timeouts obsoletos tras update/re-render
========================================================= */

import { dismissToast } from "./api.js";

import {
  prefersReducedMotion,
} from "./helpers.js";

/* =========================================================
   RUNTIME
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function nowMs() {
  try {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }
  } catch {}

  return Date.now();
}

function safeSetTimeout(fn, delay = 0) {
  if (typeof fn !== "function") {
    return null;
  }

  const ms =
    Math.max(
      0,
      Number(delay) || 0
    );

  try {
    if (
      typeof window !== "undefined" &&
      typeof window.setTimeout === "function"
    ) {
      return window.setTimeout(fn, ms);
    }
  } catch {}

  try {
    return setTimeout(fn, ms);
  } catch {
    return null;
  }
}

function safeClearTimeout(id = null) {
  if (
    id === null ||
    id === undefined
  ) {
    return false;
  }

  try {
    if (
      typeof window !== "undefined" &&
      typeof window.clearTimeout === "function"
    ) {
      window.clearTimeout(id);
      return true;
    }
  } catch {}

  try {
    clearTimeout(id);
    return true;
  } catch {
    return false;
  }
}

function nextFrame(callback) {
  if (typeof callback !== "function") {
    return;
  }

  try {
    if (
      isBrowser() &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(() => {
        try {
          callback();
        } catch {}
      });

      return;
    }
  } catch {}

  safeSetTimeout(callback, 0);
}

/* =========================================================
   HELPERS
========================================================= */

function isFiniteNumber(value) {
  return Number.isFinite(
    Number(value)
  );
}

function getSafeDuration(
  value,
  fallback = 0
) {
  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.max(
    0,
    Math.round(n)
  );
}

function isPersistent(item) {
  return (
    !item ||
    getSafeDuration(
      item.duration,
      0
    ) <= 0
  );
}

function isLoadingToast(item) {
  return (
    String(item?.type || "")
      .trim()
      .toLowerCase() === "loading"
  );
}

function isDismissed(item) {
  return Boolean(
    !item ||
      item.dismissed === true
  );
}

function getRemaining(item) {
  if (!item) {
    return 0;
  }

  return getSafeDuration(
    item.remaining,
    item.duration
  );
}

function ensureTimerToken(item) {
  if (!item) {
    return "";
  }

  const token =
    `${item.id || "toast"}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2)}`;

  item.timerToken = token;

  return token;
}

function isSameTimerToken(item, token = "") {
  return Boolean(
    item &&
      token &&
      item.timerToken === token
  );
}

function getProgressElement(item) {
  return item?.progressEl || null;
}

function canUseProgress(item) {
  const el =
    getProgressElement(item);

  return Boolean(
    el &&
      isBrowser()
  );
}

/* =========================================================
   TIMER
========================================================= */

export function clearToastTimer(item) {
  if (!item) {
    return false;
  }

  const hadTimer =
    item.timeoutId !== null &&
    item.timeoutId !== undefined;

  if (hadTimer) {
    safeClearTimeout(
      item.timeoutId
    );
  }

  item.timeoutId = null;
  item.startedAt = 0;

  /*
    Invalidamos cualquier callback viejo pendiente.
  */
  item.timerToken = "";

  return hadTimer;
}

/* =========================================================
   PROGRESS
========================================================= */

export function freezeToastProgress(item) {
  if (!canUseProgress(item)) {
    return false;
  }

  const el =
    getProgressElement(item);

  try {
    const computed =
      window.getComputedStyle?.(el);

    const transform =
      computed?.transform || "";

    el.style.animation = "none";

    el.style.transform =
      transform && transform !== "none"
        ? transform
        : el.style.transform || "scaleX(1)";

    el.style.transformOrigin =
      "left center";

    return true;
  } catch {
    try {
      el.style.animation = "none";
      el.style.transform =
        el.style.transform || "scaleX(1)";
      el.style.transformOrigin =
        "left center";

      return true;
    } catch {
      return false;
    }
  }
}

export function resetToastProgress(item) {
  const el =
    getProgressElement(item);

  if (!el) {
    return false;
  }

  try {
    el.style.display = "";
    el.style.opacity = "";
    el.style.animation = "none";
    el.style.transform = "scaleX(1)";
    el.style.transformOrigin = "left center";

    return true;
  } catch {
    return false;
  }
}

export function hideToastProgress(item) {
  const el =
    getProgressElement(item);

  if (!el) {
    return false;
  }

  try {
    el.style.display = "none";
    el.style.opacity = "0";
    el.style.animation = "none";
    el.style.transform = "scaleX(1)";
    el.style.transformOrigin = "left center";

    return true;
  } catch {
    return false;
  }
}

export function runToastProgress(
  item,
  duration
) {
  const el =
    getProgressElement(item);

  if (!el) {
    return false;
  }

  const safeDuration =
    getSafeDuration(
      duration,
      0
    );

  if (
    safeDuration <= 0 ||
    isPersistent(item) ||
    isLoadingToast(item)
  ) {
    hideToastProgress(item);
    return true;
  }

  try {
    el.style.display = "";
    el.style.opacity = "";
    el.style.animation = "none";
    el.style.transform = "scaleX(1)";
    el.style.transformOrigin = "left center";
  } catch {
    return false;
  }

  if (
    prefersReducedMotion()
  ) {
    return true;
  }

  nextFrame(() => {
    if (
      isDismissed(item) ||
      !item.progressEl ||
      item.progressEl !== el
    ) {
      return;
    }

    try {
      /*
        Fuerza reflow para reiniciar animación.
      */
      void el.offsetWidth;

      el.style.animation =
        `toastProgress ${safeDuration}ms linear forwards`;
    } catch {}
  });

  return true;
}

/* =========================================================
   START
========================================================= */

export function startToastTimer(item) {
  if (
    !item ||
    item.dismissed
  ) {
    return false;
  }

  clearToastTimer(item);

  if (
    isPersistent(item) ||
    isLoadingToast(item)
  ) {
    hideToastProgress(item);

    item.remaining = 0;
    item.startedAt = 0;
    item.timeoutId = null;

    return false;
  }

  const remaining =
    Math.max(
      0,
      getRemaining(item)
    );

  if (remaining <= 0) {
    dismissToast(item.id);
    return false;
  }

  const currentId =
    String(item.id || "");

  if (!currentId) {
    return false;
  }

  const token =
    ensureTimerToken(item);

  item.remaining =
    remaining;

  item.startedAt =
    nowMs();

  item.timeoutId =
    safeSetTimeout(() => {
      /*
        Blindaje:
        - si se pausó/reanudó/updateó, token cambia
        - si se hizo dismiss, no actúa
        - si el id mutó, no actúa
      */
      if (
        isDismissed(item) ||
        item.id !== currentId ||
        !isSameTimerToken(item, token)
      ) {
        return;
      }

      item.timeoutId = null;
      item.startedAt = 0;
      item.remaining = 0;
      item.timerToken = "";

      dismissToast(currentId);
    }, remaining);

  if (!item.timeoutId) {
    return false;
  }

  runToastProgress(
    item,
    remaining
  );

  return true;
}

/* =========================================================
   PAUSE
========================================================= */

export function pauseToastTimer(item) {
  if (
    !item ||
    item.dismissed ||
    isPersistent(item) ||
    isLoadingToast(item)
  ) {
    return false;
  }

  if (
    !isFiniteNumber(item.startedAt) ||
    Number(item.startedAt) <= 0
  ) {
    return false;
  }

  const elapsed =
    Math.max(
      0,
      nowMs() - Number(item.startedAt)
    );

  const previousRemaining =
    getRemaining(item);

  const remaining =
    Math.max(
      0,
      previousRemaining - elapsed
    );

  safeClearTimeout(
    item.timeoutId
  );

  item.timeoutId = null;
  item.startedAt = 0;
  item.remaining = remaining;
  item.timerToken = "";

  freezeToastProgress(item);

  return true;
}

/* =========================================================
   RESUME
========================================================= */

export function resumeToastTimer(item) {
  if (
    !item ||
    item.dismissed ||
    isPersistent(item) ||
    isLoadingToast(item)
  ) {
    return false;
  }

  /*
    Si ya está corriendo, no duplicamos timer.
  */
  if (
    item.timeoutId &&
    isFiniteNumber(item.startedAt) &&
    Number(item.startedAt) > 0
  ) {
    return true;
  }

  const remaining =
    getRemaining(item);

  if (remaining <= 0) {
    dismissToast(item.id);
    return false;
  }

  item.remaining =
    remaining;

  return startToastTimer(item);
}

/* =========================================================
   DEBUG
========================================================= */

export function getToastTimerSnapshot(item) {
  if (!item) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,

    id:
      item.id || null,

    type:
      item.type || null,

    dismissed:
      Boolean(item.dismissed),

    persistent:
      isPersistent(item),

    loading:
      isLoadingToast(item),

    duration:
      getSafeDuration(
        item.duration,
        0
      ),

    remaining:
      getRemaining(item),

    startedAt:
      Number(item.startedAt || 0),

    hasTimer:
      item.timeoutId !== null &&
      item.timeoutId !== undefined,

    hasTimerToken:
      Boolean(item.timerToken),

    hasProgress:
      Boolean(item.progressEl),

    progressConnected:
      Boolean(item.progressEl?.isConnected),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  clearToastTimer,

  freezeToastProgress,
  resetToastProgress,
  hideToastProgress,
  runToastProgress,

  startToastTimer,
  pauseToastTimer,
  resumeToastTimer,

  getToastTimerSnapshot,
};
