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
  signal = null
) {
  const waitMs = Math.max(
    0,
    Number(ms) || 0
  );

  if (!signal) {
    return AppCore.utils.sleep(
      waitMs
    );
  }

  return new Promise(
    (resolve, reject) => {
      if (signal.aborted) {
        reject(
          signal.reason ||
            new DOMException(
              "Aborted",
              "AbortError"
            )
        );
        return;
      }

      const timeoutId =
        setTimeout(() => {
          cleanup();
          resolve();
        }, waitMs);

      function onAbort() {
        clearTimeout(
          timeoutId
        );

        cleanup();

        reject(
          signal.reason ||
            new DOMException(
              "Aborted",
              "AbortError"
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
  state
) {
  state.pendingRequests =
    Math.max(
      0,
      Number(
        state.pendingRequests
      ) || 0
    ) + 1;

  AppCore.events.emit(
    "http:pending:change",
    {
      pending:
        state.pendingRequests,
    }
  );

  return state.pendingRequests;
}

export function decrementPendingRequests(
  AppCore,
  state
) {
  state.pendingRequests =
    Math.max(
      0,
      (Number(
        state.pendingRequests
      ) || 0) - 1
    );

  AppCore.events.emit(
    "http:pending:change",
    {
      pending:
        state.pendingRequests,
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
