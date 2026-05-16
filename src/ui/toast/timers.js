/* =========================================================
   Onion SPA - Toast Timers
   Archivo: src/ui/toast/timers.js

   Toast Timers limpio:
   - auto close timer
   - pause / resume
   - progress visual
   - callbacks obsoletos anulados por token
   - updates/re-render seguros
   - SSR safe
   - sin auth/router/http/store global
========================================================= */

import { dismissToast } from "./api.js";

import {
  TOAST_TYPE_LOADING,
  TOAST_PROGRESS_ANIMATION_NAME,
  TOAST_CLASS_PAUSED,
  TOAST_DATA_PAUSED,
} from "./constants.js";

import {
  prefersReducedMotion,
  safeNumber,
  safeText,
} from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const TOAST_TIMERS_VERSION = "17.0.0-clean";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function nowMs() {
  try {
    if (typeof performance !== "undefined" && isFn(performance.now)) {
      return performance.now();
    }
  } catch {}

  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function wallNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function normalizeMs(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.max(0, Math.round(number));
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.min(max, Math.max(min, number));
}

function hasTimerId(id) {
  return id !== null && id !== undefined;
}

function safeSetTimeout(fn, delay = 0) {
  if (!isFn(fn)) return null;

  const ms = normalizeMs(delay, 0);

  try {
    if (typeof window !== "undefined" && isFn(window.setTimeout)) {
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
  if (!hasTimerId(id)) return false;

  try {
    if (typeof window !== "undefined" && isFn(window.clearTimeout)) {
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

function safeRequestFrame(fn) {
  if (!isFn(fn)) return null;

  if (isBrowser()) {
    try {
      if (isFn(window.requestAnimationFrame)) {
        const id = window.requestAnimationFrame(() => {
          try {
            fn();
          } catch {}
        });

        return {
          type: "raf",
          id,
        };
      }
    } catch {}
  }

  const id = safeSetTimeout(() => {
    try {
      fn();
    } catch {}
  }, 0);

  return hasTimerId(id)
    ? {
        type: "timeout",
        id,
      }
    : null;
}

function safeCancelFrame(frame = null) {
  if (!frame || !hasTimerId(frame.id)) return false;

  if (frame.type === "raf") {
    try {
      window.cancelAnimationFrame?.(frame.id);
      return true;
    } catch {
      return false;
    }
  }

  return safeClearTimeout(frame.id);
}

/* =========================================================
   ITEM STATE
========================================================= */

function isDismissed(item) {
  return Boolean(!item || item.dismissed === true);
}

function isPersistent(item) {
  return normalizeMs(item?.duration, 0) <= 0;
}

function isLoadingToast(item) {
  return safeText(item?.type, "").toLowerCase() === TOAST_TYPE_LOADING;
}

function isAutoCloseable(item) {
  return Boolean(
    item &&
      !isDismissed(item) &&
      !isPersistent(item) &&
      !isLoadingToast(item) &&
      safeText(item.id, "")
  );
}

function getDuration(item) {
  return normalizeMs(item?.duration, 0);
}

function getRemaining(item) {
  if (!item) return 0;

  const remaining = normalizeMs(item.remaining, 0);

  if (remaining > 0) return remaining;

  return getDuration(item);
}

function createToken(id = "toast") {
  return `${safeText(id, "toast")}:${wallNow()}:${Math.random().toString(36).slice(2)}`;
}

function setTimerToken(item) {
  if (!item) return "";

  const token = createToken(item.id);

  item.timerToken = token;

  return token;
}

function sameTimerToken(item, token = "") {
  return Boolean(item && token && item.timerToken === token);
}

function setProgressToken(item) {
  if (!item) return "";

  const token = createToken(`${item.id}:progress`);

  item.progressToken = token;

  return token;
}

function sameProgressToken(item, token = "") {
  return Boolean(item && token && item.progressToken === token);
}

function invalidateTimer(item) {
  if (!item) return false;

  item.timerToken = "";
  item.timeoutId = null;
  item.startedAt = 0;

  return true;
}

function invalidateProgress(item) {
  if (!item) return false;

  if (item.progressFrameId) {
    safeCancelFrame(item.progressFrameId);
  }

  item.progressFrameId = null;
  item.progressToken = "";

  return true;
}

function getProgressElement(item) {
  return item?.progressEl || null;
}

function canUseProgress(item) {
  return Boolean(isBrowser() && getProgressElement(item));
}

function progressRatio(item, remainingOverride = null) {
  const total = getDuration(item);

  if (total <= 0) return 1;

  const remaining = remainingOverride !== null && remainingOverride !== undefined
    ? normalizeMs(remainingOverride, total)
    : getRemaining(item);

  return clamp(remaining / total, 0, 1);
}

function setPausedVisual(item, paused = false) {
  if (!item) return false;

  const enabled = Boolean(paused);

  item.paused = enabled;
  item.timerPaused = enabled;

  try {
    item.toastEl?.classList?.toggle?.(TOAST_CLASS_PAUSED, enabled);
  } catch {}

  try {
    item.progressEl?.classList?.toggle?.(TOAST_CLASS_PAUSED, enabled);
  } catch {}

  try {
    if (enabled) {
      item.toastEl?.setAttribute?.(TOAST_DATA_PAUSED, "true");
    } else {
      item.toastEl?.removeAttribute?.(TOAST_DATA_PAUSED);
    }
  } catch {}

  return true;
}

/* =========================================================
   CLEAR
========================================================= */

export function clearToastTimer(item) {
  if (!item) return false;

  const hadTimer = hasTimerId(item.timeoutId);

  if (hadTimer) {
    safeClearTimeout(item.timeoutId);
  }

  invalidateTimer(item);
  invalidateProgress(item);

  item.timerPaused = false;
  item.paused = false;

  setPausedVisual(item, false);

  return hadTimer;
}

/* =========================================================
   PROGRESS
========================================================= */

export function resetToastProgress(item) {
  const el = getProgressElement(item);

  if (!el) return false;

  invalidateProgress(item);

  try {
    el.style.display = "";
    el.style.opacity = "";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = "scaleX(1)";
    el.style.transformOrigin = "left center";

    delete el.dataset.toastProgressAnimation;
    delete el.dataset.toastProgressDuration;

    return true;
  } catch {
    return false;
  }
}

export function hideToastProgress(item) {
  const el = getProgressElement(item);

  if (!el) return false;

  invalidateProgress(item);

  try {
    el.style.display = "none";
    el.style.opacity = "0";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = "scaleX(1)";
    el.style.transformOrigin = "left center";

    delete el.dataset.toastProgressAnimation;
    delete el.dataset.toastProgressDuration;

    return true;
  } catch {
    return false;
  }
}

export function freezeToastProgress(item) {
  if (!canUseProgress(item)) return false;

  const el = getProgressElement(item);
  const ratio = progressRatio(item);

  invalidateProgress(item);

  try {
    el.style.display = "";
    el.style.opacity = "";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = `scaleX(${ratio})`;
    el.style.transformOrigin = "left center";

    el.dataset.toastProgressAnimation = TOAST_PROGRESS_ANIMATION_NAME;
    el.dataset.toastProgressDuration = String(getRemaining(item));

    setPausedVisual(item, true);

    return true;
  } catch {
    return false;
  }
}

export function runToastProgress(item, duration) {
  const el = getProgressElement(item);

  if (!el) return false;

  const safeDuration = normalizeMs(duration, 0);

  if (
    safeDuration <= 0 ||
    isPersistent(item) ||
    isLoadingToast(item) ||
    isDismissed(item)
  ) {
    hideToastProgress(item);
    return true;
  }

  invalidateProgress(item);

  const ratio = progressRatio(item, safeDuration);
  const token = setProgressToken(item);

  try {
    el.style.display = "";
    el.style.opacity = "";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = `scaleX(${ratio})`;
    el.style.transformOrigin = "left center";

    el.dataset.toastProgressAnimation = TOAST_PROGRESS_ANIMATION_NAME;
    el.dataset.toastProgressDuration = String(safeDuration);
  } catch {
    return false;
  }

  if (prefersReducedMotion()) {
    return true;
  }

  item.progressFrameId = safeRequestFrame(() => {
    item.progressFrameId = null;

    if (
      isDismissed(item) ||
      !sameProgressToken(item, token) ||
      item.progressEl !== el ||
      !el.isConnected
    ) {
      return;
    }

    try {
      /*
        Transition basada en transform:
        permite pause/resume limpio desde el ratio actual.
        El nombre de animación queda expuesto vía dataset para CSS/debug.
      */
      void el.offsetWidth;

      el.style.transition = `transform ${safeDuration}ms linear`;
      el.style.transform = "scaleX(0)";
    } catch {}
  });

  return true;
}

/* =========================================================
   START
========================================================= */

export function startToastTimer(item) {
  if (!isAutoCloseable(item)) return false;

  const currentId = safeText(item.id, "");
  const remaining = Math.max(0, getRemaining(item));

  clearToastTimer(item);

  if (remaining <= 0) {
    dismissToast(currentId, {
      reason: "timeout",
      source: "toast-timer",
    });

    return false;
  }

  const token = setTimerToken(item);

  item.remaining = remaining;
  item.startedAt = nowMs();
  item.timerPaused = false;
  item.paused = false;

  setPausedVisual(item, false);

  item.timeoutId = safeSetTimeout(() => {
    if (
      isDismissed(item) ||
      item.id !== currentId ||
      !sameTimerToken(item, token)
    ) {
      return;
    }

    item.remaining = 0;
    item.startedAt = 0;
    item.timeoutId = null;
    item.timerToken = "";
    item.timerPaused = false;
    item.paused = false;

    dismissToast(currentId, {
      reason: "timeout",
      source: "toast-timer",
    });
  }, remaining);

  if (!hasTimerId(item.timeoutId)) {
    invalidateTimer(item);
    return false;
  }

  runToastProgress(item, remaining);

  return true;
}

/* =========================================================
   PAUSE
========================================================= */

export function pauseToastTimer(item) {
  if (!isAutoCloseable(item)) return false;

  if (
    !isFiniteNumber(item.startedAt) ||
    Number(item.startedAt) <= 0
  ) {
    return false;
  }

  const elapsed = Math.max(0, nowMs() - Number(item.startedAt));
  const previousRemaining = getRemaining(item);
  const remaining = Math.max(0, previousRemaining - elapsed);

  safeClearTimeout(item.timeoutId);

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
  if (!isAutoCloseable(item)) return false;

  if (
    hasTimerId(item.timeoutId) &&
    isFiniteNumber(item.startedAt) &&
    Number(item.startedAt) > 0
  ) {
    return true;
  }

  const remaining = getRemaining(item);

  if (remaining <= 0) {
    dismissToast(item.id, {
      reason: "timeout",
      source: "toast-timer",
    });

    return false;
  }

  item.remaining = remaining;
  item.timerPaused = false;
  item.paused = false;

  setPausedVisual(item, false);

  return startToastTimer(item);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastTimerSnapshot(item) {
  if (!item) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,

    id: item.id || null,
    type: item.type || null,

    dismissed: Boolean(item.dismissed),
    persistent: isPersistent(item),
    loading: isLoadingToast(item),
    paused: Boolean(item.paused || item.timerPaused),

    duration: getDuration(item),
    remaining: getRemaining(item),
    startedAt: safeNumber(item.startedAt, 0),

    hasTimer: hasTimerId(item.timeoutId),
    hasTimerToken: Boolean(item.timerToken),

    hasProgress: Boolean(item.progressEl),
    hasProgressFrame: Boolean(item.progressFrameId),
    hasProgressToken: Boolean(item.progressToken),
    progressConnected: Boolean(item.progressEl?.isConnected),

    progressRatio: progressRatio(item),

    reducedMotion: prefersReducedMotion(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOAST_TIMERS_VERSION,

  clearToastTimer,

  resetToastProgress,
  hideToastProgress,
  freezeToastProgress,
  runToastProgress,

  startToastTimer,
  pauseToastTimer,
  resumeToastTimer,

  getToastTimerSnapshot,
};
