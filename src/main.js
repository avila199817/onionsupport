/* =========================================================
   Onion SPA - Entry Point
   Archivo: src/main.js

   Responsabilidades:
   - punto único de arranque de la SPA
   - esperar DOM ready de forma segura
   - boot idempotente
   - capturar errores fatales de arranque
   - integrar App + AppCore

   HARDENING:
   - evita doble boot
   - fallback DOMContentLoaded
   - logs debug
   - error handler visible
========================================================= */

import { App } from "./app/index.js";
import { AppCore } from "./core/index.js";

/* =========================================================
   STATE
========================================================= */

let bootStarted = false;

/* =========================================================
   HELPERS
========================================================= */

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(...args);
  } catch {
    console.error(...args);
  }
}

function showFatalBootError(error) {
  try {
    const root =
      document.getElementById("app") ||
      document.getElementById("view-container") ||
      document.body;

    if (!root) return;

    const message =
      error?.message ||
      "No se pudo iniciar la aplicación.";

    root.innerHTML = `
      <section style="
        padding:32px;
        max-width:720px;
        margin:40px auto;
        font-family:Inter,Arial,sans-serif;
      ">
        <h1 style="margin:0 0 12px;font-size:28px;">
          Error de arranque
        </h1>

        <p style="margin:0 0 12px;opacity:.8;">
          ${message}
        </p>

        <button
          type="button"
          onclick="window.location.reload()"
          style="
            padding:10px 16px;
            border:0;
            border-radius:10px;
            cursor:pointer;
          ">
          Recargar
        </button>
      </section>
    `;
  } catch {}
}

/* =========================================================
   BOOT
========================================================= */

async function boot() {
  if (bootStarted) {
    safeLog(
      "Boot ignorado: ya iniciado."
    );
    return;
  }

  bootStarted = true;

  try {
    safeLog("Boot iniciando...");

    await Promise.resolve(
      App.boot()
    );

    safeLog("Boot completado.");
  } catch (error) {
    safeError(
      "Fallo crítico en boot:",
      error
    );

    showFatalBootError(error);
  }
}

/* =========================================================
   READY
========================================================= */

function onReady() {
  boot();
}

if (
  typeof document !== "undefined" &&
  document.readyState === "loading"
) {
  AppCore.ready(onReady);

  document.addEventListener(
    "DOMContentLoaded",
    onReady,
    { once: true }
  );
} else {
  onReady();
}
