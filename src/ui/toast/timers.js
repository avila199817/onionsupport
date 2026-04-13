/* =========================================================
   Onion SPA - Toast Timers
   Archivo: src/ui/toast/timers.js

   Responsabilidades:
   - auto close timers
   - pause on hover
   - resume
   - progress animation
   - clear timers
========================================================= */

import { dismissToast } from "./api.js";
import { prefersReducedMotion } from "./helpers.js";

/* =========================================================
   TIMER
========================================================= */

export function clearToastTimer(
  item
) {
  if (!item) {
    return;
  }

  if (item.timeoutId) {
    window.clearTimeout(
      item.timeoutId
    );

    item.timeoutId =
      null;
  }
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
    return;
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
}

export function runToastProgress(
  item,
  duration
) {
  const el =
    item?.progressEl;

  if (!el) {
    return;
  }

  if (
    !duration ||
    duration <= 0 ||
    item.type ===
      "loading"
  ) {
    el.style.display =
      "none";

    el.style.animation =
      "none";

    el.style.transform =
      "scaleX(1)";

    return;
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
    return;
  }

  void el.offsetWidth;

  el.style.animation =
    `toastProgress ${duration}ms linear forwards`;
}

/* =========================================================
   START
========================================================= */

export function startToastTimer(
  item
) {
  if (
    !item ||
    !item.duration ||
    item.duration <= 0
  ) {
    return;
  }

  if (item.dismissed) {
    return;
  }

  clearToastTimer(item);

  const remaining =
    Math.max(
      0,
      item.remaining ??
        item.duration
    );

  item.startedAt =
    Date.now();

  item.timeoutId =
    window.setTimeout(
      () => {
        dismissToast(
          item.id
        );
      },
      remaining
    );

  runToastProgress(
    item,
    remaining
  );
}

/* =========================================================
   PAUSE
========================================================= */

export function pauseToastTimer(
  item
) {
  if (
    !item ||
    !item.duration ||
    item.duration <= 0
  ) {
    return;
  }

  if (
    !item.startedAt
  ) {
    return;
  }

  const elapsed =
    Date.now() -
    item.startedAt;

  item.remaining =
    Math.max(
      0,
      (
        item.remaining ??
        item.duration
      ) - elapsed
    );

  item.startedAt = 0;

  clearToastTimer(item);
  freezeToastProgress(
    item
  );
}

/* =========================================================
   RESUME
========================================================= */

export function resumeToastTimer(
  item
) {
  if (
    !item ||
    !item.duration ||
    item.duration <= 0
  ) {
    return;
  }

  if (item.dismissed) {
    return;
  }

  if (
    (
      item.remaining ??
      item.duration
    ) <= 0
  ) {
    dismissToast(
      item.id
    );

    return;
  }

  startToastTimer(
    item
  );
}
