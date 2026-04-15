/* =========================================================
   Onion SPA - Entry Point
   Archivo: src/main.js

   Responsabilidades:
   - punto único de arranque de la SPA
   - esperar DOM ready de forma segura
   - boot idempotente
   - capturar errores fatales de arranque
   - integrar App + AppCore

   HARDENING PRO:
   - una sola vía de arranque
   - anti doble boot
   - CSP clean
   - fallback robusto
   - logs limpios
   - error fatal visible
========================================================= */

import { App } from "./app/index.js";
import { AppCore } from "./core/index.js";

/* =========================================================
   STATE
========================================================= */

let bootStarted = false;
let bootPromise = null;

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

function createReloadButton() {
  const button =
    document.createElement("button");

  button.type = "button";
  button.textContent = "Recargar";

  button.style.padding =
    "10px 16px";

  button.style.border = "0";
  button.style.borderRadius =
    "10px";

  button.style.cursor =
    "pointer";

  button.addEventListener(
    "click",
    () => {
      window.location.reload();
    }
  );

  return button;
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
        <h1 style="
          margin:0 0 12px;
          font-size:28px;
        ">
          Error de arranque
        </h1>

        <p style="
          margin:0 0 16px;
          opacity:.8;
        ">
          ${String(message)}
        </p>

        <div id="fatal-boot-actions"></div>
      </section>
    `;

    const actions =
      document.getElementById(
        "fatal-boot-actions"
      );

    if (actions) {
      actions.appendChild(
        createReloadButton()
      );
    }
  } catch {}
}

/* =========================================================
   BOOT
========================================================= */

async function boot() {
  if (bootStarted) {
    return bootPromise;
  }

  bootStarted = true;

  bootPromise =
    Promise.resolve()
      .then(async () => {
        safeLog(
          "Boot iniciando..."
        );

        await App.boot();

        safeLog(
          "Boot completado."
        );
      })
      .catch((error) => {
        safeError(
          "Fallo crítico en boot:",
          error
        );

        showFatalBootError(
          error
        );

        throw error;
      });

  return bootPromise;
}

/* =========================================================
   READY
========================================================= */

function onReady() {
  boot();
}

if (
  typeof document !==
  "undefined"
) {
  AppCore.ready(onReady);
} else {
  onReady();
}
