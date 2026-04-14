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
========================================================= */

import { dismissToast } from "./api.js";
import { prefersReducedMotion } from "./helpers.js";

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
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.max(0, n);
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

function getRemaining(item) {
  if (!item) {
    return 0;
  }

  return getSafeDuration(
    item.remaining,
    item.duration
  );
}

/* =========================================================
   TIMER
========================================================= */

export function clearToastTimer(
  item
) {
  if (!item) {
    return false;
  }

  if (item.timeoutId) {
    window.clearTimeout(
      item.timeoutId
    );
  }

  item.timeoutId = null;

  return true;
}

/* =========================================================
   PROGRESS
========================================================= */

export function freezeToastProgress(
  item
) {
  const el =
    item?.progressEl;

  if (!el) {
    return false;
  }

  const computed =
    window.getComputedStyle(
      el
    ).transform;

  el.style.animation =
    "none";

  el.style.transform =
    computed === "none"
      ? "scaleX(1)"
      : computed;

  return true;
}

export function resetToastProgress(
  item
) {
  const el =
    item?.progressEl;

  if (!el) {
    return false;
  }

  el.style.animation =
    "none";

  el.style.transform =
    "scaleX(1)";

  el.style.opacity = "";
  el.style.display = "";

  return true;
}

export function hideToastProgress(
  item
) {
  const el =
    item?.progressEl;

  if (!el) {
    return false;
  }

  el.style.display =
    "none";

  el.style.animation =
    "none";

  el.style.transform =
    "scaleX(1)";

  return true;
}

export function runToastProgress(
  item,
  duration
) {
  const el =
    item?.progressEl;

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
    item?.type ===
      "loading"
  ) {
    hideToastProgress(
      item
    );

    return true;
  }

  el.style.display = "";
  el.style.animation =
    "none";

  el.style.transform =
    "scaleX(1)";

  el.style.transformOrigin =
    "left center";

  if (
    prefersReducedMotion()
  ) {
    return true;
  }

  void el.offsetWidth;

  el.style.animation =
    `toastProgress ${safeDuration}ms linear forwards`;

  return true;
}

/* =========================================================
   START
========================================================= */

export function startToastTimer(
  item
) {
  if (
    !item ||
    item.dismissed
  ) {
    return false;
  }

  if (
    isPersistent(item)
  ) {
    clearToastTimer(
      item
    );

    hideToastProgress(
      item
    );

    item.startedAt = 0;
    item.remaining = 0;

    return false;
  }

  clearToastTimer(item);

  const remaining =
    Math.max(
      0,
      getRemaining(item)
    );

  if (
    remaining <= 0
  ) {
    dismissToast(
      item.id
    );

    return false;
  }

  item.remaining =
    remaining;

  item.startedAt =
    Date.now();

  const currentId =
    item.id;

  item.timeoutId =
    window.setTimeout(
      () => {
        /*
          Blindaje:
          si el toast cambió de id,
          fue dismiss,
          o mutó raro, no actuamos.
        */
        if (
          item.dismissed ||
          item.id !==
            currentId
        ) {
          return;
        }

        dismissToast(
          currentId
        );
      },
      remaining
    );

  runToastProgress(
    item,
    remaining
  );

  return true;
}

/* =========================================================
   PAUSE
========================================================= */

export function pauseToastTimer(
  item
) {
  if (
    !item ||
    item.dismissed ||
    isPersistent(item)
  ) {
    return false;
  }

  if (
    !isFiniteNumber(
      item.startedAt
    ) ||
    item.startedAt <= 0
  ) {
    return false;
  }

  const elapsed =
    Math.max(
      0,
      Date.now() -
        item.startedAt
    );

  const remaining =
    Math.max(
      0,
      getRemaining(item) -
        elapsed
    );

  item.remaining =
    remaining;

  item.startedAt = 0;

  clearToastTimer(
    item
  );

  freezeToastProgress(
    item
  );

  return true;
}

/* =========================================================
   RESUME
========================================================= */

export function resumeToastTimer(
  item
) {
  if (
    !item ||
    item.dismissed ||
    isPersistent(item)
  ) {
    return false;
  }

  const remaining =
    getRemaining(item);

  if (
    remaining <= 0
  ) {
    dismissToast(
      item.id
    );

    return false;
  }

  return startToastTimer(
    item
  );
}
