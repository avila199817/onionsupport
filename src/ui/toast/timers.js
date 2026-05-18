/* =========================================================
   Onion Support - Toast Timers
   Archivo: /src/ui/toast/timers.js

   Responsabilidad:
   - Compat mínima de timers para Toast legacy.
   - Auto close simple.
   - Pause / resume simple.
   - Progress visual opcional si existe progressEl.
   - Sin imports.
   - Sin api.js.
   - Sin constants.js.
   - Sin helpers.js.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store global.
   - Sin CustomEvent.
   - Sin magia negra.
   - El Toast real vive en src/ui/toast/index.js.
========================================================= */

export const TOAST_TIMERS_VERSION = "simple";

const LOADING_TYPE = "loading";
const PAUSED_CLASS = "is-paused";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function number(value, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function now() {
  return Date.now();
}

function ms(value, fallback = 0) {
  return Math.max(0, Math.round(number(value, fallback)));
}

function hasTimer(id = null) {
  return id !== null && id !== undefined;
}

function safeSetTimeout(fn, delay = 0) {
  if (!isFunction(fn)) return null;

  try {
    return window.setTimeout(fn, ms(delay, 0));
  } catch {
    try {
      return setTimeout(fn, ms(delay, 0));
    } catch {
      return null;
    }
  }
}

function safeClearTimeout(id = null) {
  if (!hasTimer(id)) return false;

  try {
    window.clearTimeout(id);
    return true;
  } catch {
    try {
      clearTimeout(id);
      return true;
    } catch {
      return false;
    }
  }
}

function requestFrame(fn = null) {
  if (!isFunction(fn)) return null;

  if (!isBrowser()) {
    try {
      fn();
    } catch {
      // noop
    }

    return null;
  }

  try {
    return window.requestAnimationFrame(fn);
  } catch {
    return safeSetTimeout(fn, 0);
  }
}

function cancelFrame(id = null) {
  if (!hasTimer(id) || !isBrowser()) return false;

  try {
    window.cancelAnimationFrame(id);
    return true;
  } catch {
    return safeClearTimeout(id);
  }
}

function prefersReducedMotion() {
  if (!isBrowser()) return false;

  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

/* =========================================================
   ITEM STATE
========================================================= */

function itemId(item = null) {
  return text(item?.id, "");
}

function itemType(item = null) {
  return text(item?.type, "info").toLowerCase();
}

function itemDuration(item = null) {
  return ms(item?.duration, 0);
}

function itemRemaining(item = null) {
  const remaining = ms(item?.remaining, 0);
  return remaining > 0 ? remaining : itemDuration(item);
}

function isDismissed(item = null) {
  return Boolean(!item || item.dismissed === true);
}

function isLoading(item = null) {
  return itemType(item) === LOADING_TYPE;
}

function isPersistent(item = null) {
  return itemDuration(item) <= 0;
}

function isAutoCloseable(item = null) {
  return Boolean(
    item &&
      itemId(item) &&
      !isDismissed(item) &&
      !isPersistent(item) &&
      !isLoading(item)
  );
}

function token(id = "toast") {
  return `${text(id, "toast")}:${now()}:${Math.random().toString(36).slice(2)}`;
}

function finishToast(item = null, reason = "timeout") {
  if (!item || item.dismissed === true) return false;

  item.dismissed = true;
  item.dismissReason = reason;
  item.dismissedAt = now();
  item.remaining = 0;
  item.startedAt = 0;
  item.timeoutId = null;
  item.timerToken = "";
  item.paused = false;
  item.timerPaused = false;

  setPausedVisual(item, false);
  hideToastProgress(item);

  try {
    if (isFunction(item.onTimeout)) {
      item.onTimeout(item);
      return true;
    }

    if (isFunction(item.onDismiss)) {
      item.onDismiss(item, reason);
      return true;
    }

    if (isFunction(item.dismiss)) {
      item.dismiss(item.id, { reason });
      return true;
    }
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   VISUAL
========================================================= */

function progressElement(item = null) {
  return item?.progressEl || null;
}

function progressRatio(item = null, remainingOverride = null) {
  const duration = itemDuration(item);

  if (duration <= 0) return 1;

  const remaining = remainingOverride === null || remainingOverride === undefined
    ? itemRemaining(item)
    : ms(remainingOverride, duration);

  return Math.max(0, Math.min(1, remaining / duration));
}

function setPausedVisual(item = null, paused = false) {
  if (!item) return false;

  const value = Boolean(paused);

  item.paused = value;
  item.timerPaused = value;

  try {
    item.toastEl?.classList?.toggle?.(PAUSED_CLASS, value);
  } catch {
    // noop
  }

  try {
    item.progressEl?.classList?.toggle?.(PAUSED_CLASS, value);
  } catch {
    // noop
  }

  try {
    if (value) item.toastEl?.setAttribute?.("data-toast-paused", "true");
    else item.toastEl?.removeAttribute?.("data-toast-paused");
  } catch {
    // noop
  }

  return true;
}

function clearProgressFrame(item = null) {
  if (!item?.progressFrameId) return false;

  cancelFrame(item.progressFrameId);
  item.progressFrameId = null;

  return true;
}

/* =========================================================
   CLEAR
========================================================= */

export function clearToastTimer(item = null) {
  if (!item) return false;

  const hadTimer = hasTimer(item.timeoutId);

  if (hadTimer) {
    safeClearTimeout(item.timeoutId);
  }

  clearProgressFrame(item);

  item.timeoutId = null;
  item.timerToken = "";
  item.startedAt = 0;
  item.paused = false;
  item.timerPaused = false;

  setPausedVisual(item, false);

  return hadTimer;
}

/* =========================================================
   PROGRESS
========================================================= */

export function resetToastProgress(item = null) {
  const el = progressElement(item);

  if (!el) return false;

  clearProgressFrame(item);

  try {
    el.style.display = "";
    el.style.opacity = "";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = "scaleX(1)";
    el.style.transformOrigin = "left center";
    delete el.dataset.toastProgressDuration;
    return true;
  } catch {
    return false;
  }
}

export function hideToastProgress(item = null) {
  const el = progressElement(item);

  if (!el) return false;

  clearProgressFrame(item);

  try {
    el.style.display = "none";
    el.style.opacity = "0";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = "scaleX(1)";
    el.style.transformOrigin = "left center";
    delete el.dataset.toastProgressDuration;
    return true;
  } catch {
    return false;
  }
}

export function freezeToastProgress(item = null) {
  const el = progressElement(item);

  if (!el) return false;

  clearProgressFrame(item);

  const ratio = progressRatio(item);

  try {
    el.style.display = "";
    el.style.opacity = "";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = `scaleX(${ratio})`;
    el.style.transformOrigin = "left center";
    el.dataset.toastProgressDuration = String(itemRemaining(item));

    setPausedVisual(item, true);

    return true;
  } catch {
    return false;
  }
}

export function runToastProgress(item = null, duration = 0) {
  const el = progressElement(item);

  if (!el) return false;

  const safeDuration = ms(duration, 0);

  if (
    safeDuration <= 0 ||
    isPersistent(item) ||
    isLoading(item) ||
    isDismissed(item)
  ) {
    hideToastProgress(item);
    return true;
  }

  clearProgressFrame(item);

  try {
    el.style.display = "";
    el.style.opacity = "";
    el.style.animation = "none";
    el.style.transition = "none";
    el.style.transform = `scaleX(${progressRatio(item, safeDuration)})`;
    el.style.transformOrigin = "left center";
    el.dataset.toastProgressDuration = String(safeDuration);
  } catch {
    return false;
  }

  if (prefersReducedMotion()) return true;

  item.progressFrameId = requestFrame(() => {
    item.progressFrameId = null;

    if (isDismissed(item) || progressElement(item) !== el) return;

    try {
      void el.offsetWidth;
      el.style.transition = `transform ${safeDuration}ms linear`;
      el.style.transform = "scaleX(0)";
    } catch {
      // noop
    }
  });

  return true;
}

/* =========================================================
   START / PAUSE / RESUME
========================================================= */

export function startToastTimer(item = null) {
  if (!isAutoCloseable(item)) return false;

  const id = itemId(item);
  const remaining = Math.max(0, itemRemaining(item));

  clearToastTimer(item);

  if (remaining <= 0) {
    finishToast(item, "timeout");
    return false;
  }

  const timerToken = token(id);

  item.timerToken = timerToken;
  item.remaining = remaining;
  item.startedAt = now();
  item.paused = false;
  item.timerPaused = false;

  setPausedVisual(item, false);

  item.timeoutId = safeSetTimeout(() => {
    if (
      isDismissed(item) ||
      itemId(item) !== id ||
      item.timerToken !== timerToken
    ) {
      return;
    }

    finishToast(item, "timeout");
  }, remaining);

  if (!hasTimer(item.timeoutId)) {
    item.timerToken = "";
    item.startedAt = 0;
    return false;
  }

  runToastProgress(item, remaining);

  return true;
}

export function pauseToastTimer(item = null) {
  if (!isAutoCloseable(item)) return false;
  if (!hasTimer(item.timeoutId) || ms(item.startedAt, 0) <= 0) return false;

  const elapsed = Math.max(0, now() - number(item.startedAt, 0));
  const remaining = Math.max(0, itemRemaining(item) - elapsed);

  safeClearTimeout(item.timeoutId);

  item.timeoutId = null;
  item.timerToken = "";
  item.startedAt = 0;
  item.remaining = remaining;

  if (remaining <= 0) {
    finishToast(item, "timeout");
    return false;
  }

  freezeToastProgress(item);

  return true;
}

export function resumeToastTimer(item = null) {
  if (!isAutoCloseable(item)) return false;

  if (hasTimer(item.timeoutId) && ms(item.startedAt, 0) > 0) {
    return true;
  }

  const remaining = itemRemaining(item);

  if (remaining <= 0) {
    finishToast(item, "timeout");
    return false;
  }

  item.remaining = remaining;
  item.paused = false;
  item.timerPaused = false;

  setPausedVisual(item, false);

  return startToastTimer(item);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getToastTimerSnapshot(item = null) {
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
    loading: isLoading(item),
    paused: Boolean(item.paused || item.timerPaused),

    duration: itemDuration(item),
    remaining: itemRemaining(item),
    startedAt: number(item.startedAt, 0),

    hasTimer: hasTimer(item.timeoutId),
    hasTimerToken: Boolean(item.timerToken),

    hasProgress: Boolean(item.progressEl),
    hasProgressFrame: Boolean(item.progressFrameId),
    progressConnected: Boolean(item.progressEl?.isConnected),
    progressRatio: progressRatio(item),

    reducedMotion: prefersReducedMotion(),

    policy: {
      compatOnly: true,
      noImports: true,
      noApiImport: true,
      noStore: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
    },
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
