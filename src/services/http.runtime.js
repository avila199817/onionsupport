/* =========================================================
   Onion SPA - HTTP Runtime
   Archivo: src/services/http.runtime.js

   Responsabilidades:
   - gestionar esperas internas del servicio HTTP
   - controlar requests pendientes globales
   - emitir cambios de pending al event bus
   - exponer helpers de abort / cancelación
   - soportar delay cancelable por signal
========================================================= */

/* =========================================================
   DELAY
========================================================= */
export function delay(
  AppCore,
  ms = 0,
  signal = null,
  meta = {}
) {
  const waitMs = Math.max(
    0,
    Number(ms) || 0
  );

  const requestId =
    meta?.requestId ||
    null;

  AppCore?.events?.emit?.(
    "http:delay:start",
    {
      ms: waitMs,
      requestId,
      at:
        new Date().toISOString(),
    }
  );

  if (!signal) {
    return AppCore.utils
      .sleep(waitMs)
      .then((result) => {
        AppCore?.events?.emit?.(
          "http:delay:end",
          {
            ms: waitMs,
            requestId,
            at:
              new Date().toISOString(),
          }
        );

        return result;
      });
  }

  function createAbortError(
    sourceSignal
  ) {
    if (
      sourceSignal?.reason
    ) {
      return sourceSignal.reason;
    }

    if (
      typeof DOMException !==
      "undefined"
    ) {
      return new DOMException(
        "Aborted",
        "AbortError"
      );
    }

    const error =
      new Error("Aborted");
    error.name =
      "AbortError";
    return error;
  }

  return new Promise(
    (resolve, reject) => {
      if (signal.aborted) {
        AppCore?.events?.emit?.(
          "http:delay:abort",
          {
            ms: waitMs,
            requestId,
            at:
              new Date().toISOString(),
          }
        );

        reject(
          createAbortError(
            signal
          )
        );
        return;
      }

      const timeoutId =
        setTimeout(() => {
          cleanup();
          AppCore?.events?.emit?.(
            "http:delay:end",
            {
              ms: waitMs,
              requestId,
              at:
                new Date().toISOString(),
            }
          );
          resolve();
        }, waitMs);

      function onAbort() {
        clearTimeout(
          timeoutId
        );

        cleanup();

        AppCore?.events?.emit?.(
          "http:delay:abort",
          {
            ms: waitMs,
            requestId,
            at:
              new Date().toISOString(),
          }
        );

        reject(
          createAbortError(
            signal
          )
        );
      }

      function cleanup() {
        signal.removeEventListener(
          "abort",
          onAbort
        );
      }

      signal.addEventListener(
        "abort",
        onAbort,
        { once: true }
      );
    }
  );
}

/* =========================================================
   PENDING COUNTER
========================================================= */
export function incrementPendingRequests(
  AppCore,
  state,
  meta = {}
) {
  const previous =
    Math.max(
      0,
      Number(
        state.pendingRequests
      ) || 0
    );

  state.pendingRequests =
    previous + 1;

  AppCore.events.emit(
    "http:pending:change",
    {
      pending:
        state.pendingRequests,
      previous,
      source:
        meta.source ||
        "http.runtime:increment",
      requestId:
        meta.requestId ||
        null,
      at:
        new Date().toISOString(),
    }
  );

  return state.pendingRequests;
}

export function decrementPendingRequests(
  AppCore,
  state,
  meta = {}
) {
  const previous =
    Math.max(
      0,
      Number(
        state.pendingRequests
      ) || 0
    );

  state.pendingRequests =
    Math.max(
      0,
      previous - 1
    );

  AppCore.events.emit(
    "http:pending:change",
    {
      pending:
        state.pendingRequests,
      previous,
      source:
        meta.source ||
        "http.runtime:decrement",
      requestId:
        meta.requestId ||
        null,
      at:
        new Date().toISOString(),
      underflowPrevented:
        previous === 0,
    }
  );

  return state.pendingRequests;
}

/* =========================================================
   ABORT
========================================================= */
export function createAbortController() {
  return new AbortController();
}
