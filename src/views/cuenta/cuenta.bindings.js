/* =========================================================
   Onion SPA - Cuenta Bindings
   Archivo: src/views/cuenta/cuenta.bindings.js

   Responsabilidades:
   - bind DOM robusto
   - refresh / retry
   - guardar preferencias
   - toggle dark mode / privacy mode
   - rebind limpio tras rerender
   - cleanup sólido por scope

   FIX CRÍTICO:
   - evita doble click handlers
   - soporta controles dinámicos
   - delegación premium
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE =
  "view:cuenta";

/* =========================================================
   HELPERS
========================================================= */

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[CuentaBindings]",
      ...args
    );
  } catch {}
}

function resolveScopeName(
  scope = DEFAULT_SCOPE
) {
  return safeText(
    scope,
    DEFAULT_SCOPE
  );
}

function getScope(
  scopeName = DEFAULT_SCOPE
) {
  const finalScope =
    resolveScopeName(
      scopeName
    );

  try {
    AppCore?.cleanup?.run?.(
      finalScope
    );
  } catch {}

  try {
    return (
      AppCore?.cleanup?.scope?.(
        finalScope
      ) || finalScope
    );
  } catch {
    return finalScope;
  }
}

function getContainer() {
  return (
    AppCore?.dom
      ?.viewContainer ||
    document.getElementById(
      "view-container"
    ) ||
    document
  );
}

function readCheckboxValue(
  element,
  fallback = false
) {
  if (!element) {
    return Boolean(fallback);
  }

  if (
    typeof element.checked ===
    "boolean"
  ) {
    return element.checked;
  }

  const attr =
    element?.getAttribute?.(
      "aria-checked"
    );

  if (attr === "true") return true;
  if (attr === "false") return false;

  return Boolean(fallback);
}

function findDarkModeInput() {
  return (
    document.getElementById(
      "cuenta-darkmode-input"
    ) ||
    document.querySelector(
      '[data-role="cuenta-darkmode-input"]'
    )
  );
}

function findPrivacyModeInput() {
  return (
    document.getElementById(
      "cuenta-privacymode-input"
    ) ||
    document.querySelector(
      '[data-role="cuenta-privacy-input"]'
    )
  );
}

function getCurrentPreferencesSnapshot() {
  const darkModeInput =
    findDarkModeInput();

  const privacyModeInput =
    findPrivacyModeInput();

  return {
    darkMode:
      readCheckboxValue(
        darkModeInput,
        true
      ),
    privacyMode:
      readCheckboxValue(
        privacyModeInput,
        false
      ),
  };
}

async function safeReload(
  reload,
  loadCuenta
) {
  try {
    if (
      typeof reload ===
      "function"
    ) {
      await reload();
      return;
    }

    if (
      typeof loadCuenta ===
      "function"
    ) {
      await loadCuenta({
        force: true,
      });
    }
  } catch (error) {
    safeWarn(
      "reload falló",
      error
    );
  }
}

async function safeSavePreferences({
  saveCuenta,
  updateCuenta,
  payload,
} = {}) {
  if (
    typeof saveCuenta ===
    "function"
  ) {
    return saveCuenta(payload);
  }

  if (
    typeof updateCuenta ===
    "function"
  ) {
    return updateCuenta(payload);
  }

  return null;
}

/* =========================================================
   MAIN
========================================================= */

export function bindCuentaEvents({
  loadCuenta,
  updateCuenta,
  updateCuentaTheme,
  saveCuenta,
  reload,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeRef =
    getScope(scope);

  const root =
    getContainer();

  const refreshBtn =
    document.getElementById(
      "cuenta-refresh-btn"
    );

  const retryBtn =
    document.getElementById(
      "cuenta-retry-btn"
    );

  const saveBtn =
    document.getElementById(
      "cuenta-save-btn"
    );

  const themeBtn =
    document.getElementById(
      "cuenta-theme-btn"
    );

  const privacyBtn =
    document.getElementById(
      "cuenta-privacy-btn"
    );

  const darkModeInput =
    findDarkModeInput();

  const privacyModeInput =
    findPrivacyModeInput();

  /* =========================================
     DIRECT BUTTONS
  ========================================= */

  if (refreshBtn) {
    AppCore.cleanup.on(
      scopeRef,
      refreshBtn,
      "click",
      async (event) => {
        event.preventDefault();
        await safeReload(
          reload,
          loadCuenta
        );
      }
    );
  }

  if (retryBtn) {
    AppCore.cleanup.on(
      scopeRef,
      retryBtn,
      "click",
      async (event) => {
        event.preventDefault();
        await safeReload(
          reload,
          loadCuenta
        );
      }
    );
  }

  if (saveBtn) {
    AppCore.cleanup.on(
      scopeRef,
      saveBtn,
      "click",
      async (event) => {
        event.preventDefault();

        try {
          const payload =
            getCurrentPreferencesSnapshot();

          await safeSavePreferences({
            saveCuenta,
            updateCuenta,
            payload,
          });
        } catch (error) {
          safeWarn(
            "save preferencias falló",
            error
          );
        }
      }
    );
  }

  if (themeBtn) {
    AppCore.cleanup.on(
      scopeRef,
      themeBtn,
      "click",
      async (event) => {
        event.preventDefault();

        try {
          const darkModeInputNode =
            findDarkModeInput();

          const nextValue =
            !readCheckboxValue(
              darkModeInputNode,
              true
            );

          if (
            darkModeInputNode &&
            typeof darkModeInputNode.checked ===
              "boolean"
          ) {
            darkModeInputNode.checked =
              nextValue;
          }

          await updateCuentaTheme?.(
            nextValue
          );
        } catch (error) {
          safeWarn(
            "theme toggle falló",
            error
          );
        }
      }
    );
  }

  if (privacyBtn) {
    AppCore.cleanup.on(
      scopeRef,
      privacyBtn,
      "click",
      async (event) => {
        event.preventDefault();

        try {
          const privacyInputNode =
            findPrivacyModeInput();

          const nextValue =
            !readCheckboxValue(
              privacyInputNode,
              false
            );

          if (
            privacyInputNode &&
            typeof privacyInputNode.checked ===
              "boolean"
          ) {
            privacyInputNode.checked =
              nextValue;
          }

          await safeSavePreferences({
            saveCuenta,
            updateCuenta,
            payload: {
              privacyMode: nextValue,
            },
          });
        } catch (error) {
          safeWarn(
            "privacy toggle falló",
            error
          );
        }
      }
    );
  }

  if (darkModeInput) {
    AppCore.cleanup.on(
      scopeRef,
      darkModeInput,
      "change",
      async (event) => {
        try {
          const nextValue =
            readCheckboxValue(
              event?.currentTarget,
              true
            );

          await updateCuentaTheme?.(
            nextValue
          );
        } catch (error) {
          safeWarn(
            "change darkMode falló",
            error
          );
        }
      }
    );
  }

  if (privacyModeInput) {
    AppCore.cleanup.on(
      scopeRef,
      privacyModeInput,
      "change",
      async (event) => {
        try {
          const nextValue =
            readCheckboxValue(
              event?.currentTarget,
              false
            );

          await safeSavePreferences({
            saveCuenta,
            updateCuenta,
            payload: {
              privacyMode: nextValue,
            },
          });
        } catch (error) {
          safeWarn(
            "change privacyMode falló",
            error
          );
        }
      }
    );
  }

  /* =========================================
     DELEGATED ACTIONS
  ========================================= */

  AppCore.cleanup.on(
    scopeRef,
    root,
    "click",
    async (event) => {
      const refreshActionBtn =
        event.target?.closest?.(
          '[data-action="refresh-cuenta"]'
        );

      if (refreshActionBtn) {
        event.preventDefault();
        event.stopPropagation();

        await safeReload(
          reload,
          loadCuenta
        );

        return;
      }

      const saveActionBtn =
        event.target?.closest?.(
          '[data-action="save-cuenta"]'
        );

      if (saveActionBtn) {
        event.preventDefault();
        event.stopPropagation();

        try {
          const payload =
            getCurrentPreferencesSnapshot();

          await safeSavePreferences({
            saveCuenta,
            updateCuenta,
            payload,
          });
        } catch (error) {
          safeWarn(
            "save-cuenta falló",
            error
          );
        }

        return;
      }

      const toggleThemeBtn =
        event.target?.closest?.(
          '[data-action="toggle-theme"]'
        );

      if (toggleThemeBtn) {
        event.preventDefault();
        event.stopPropagation();

        try {
          const darkModeInputNode =
            findDarkModeInput();

          const nextValue =
            !readCheckboxValue(
              darkModeInputNode,
              true
            );

          if (
            darkModeInputNode &&
            typeof darkModeInputNode.checked ===
              "boolean"
          ) {
            darkModeInputNode.checked =
              nextValue;
          }

          await updateCuentaTheme?.(
            nextValue
          );
        } catch (error) {
          safeWarn(
            "toggle-theme falló",
            error
          );
        }

        return;
      }

      const togglePrivacyBtn =
        event.target?.closest?.(
          '[data-action="toggle-privacy"]'
        );

      if (togglePrivacyBtn) {
        event.preventDefault();
        event.stopPropagation();

        try {
          const privacyInputNode =
            findPrivacyModeInput();

          const nextValue =
            !readCheckboxValue(
              privacyInputNode,
              false
            );

          if (
            privacyInputNode &&
            typeof privacyInputNode.checked ===
              "boolean"
          ) {
            privacyInputNode.checked =
              nextValue;
          }

          await safeSavePreferences({
            saveCuenta,
            updateCuenta,
            payload: {
              privacyMode: nextValue,
            },
          });
        } catch (error) {
          safeWarn(
            "toggle-privacy falló",
            error
          );
        }

        return;
      }
    }
  );

  /* =========================================
     CLEANUP
  ========================================= */

  return () => {
    try {
      AppCore?.cleanup?.run?.(
        resolveScopeName(
          scope
        )
      );
    } catch {}
  };
}

export default {
  bindCuentaEvents,
};
