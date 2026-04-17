/* =========================================================
   Onion SPA - Usuarios Bindings
   Archivo: src/views/usuarios/usuarios.bindings.js

   Responsabilidades:
   - bind DOM robusto
   - refresh / retry
   - export CSV
   - open usuario modal / detail
   - copy id
   - rebind limpio tras rerender
   - cleanup sólido por scope

   FIX CRÍTICO:
   - evita doble click handlers
   - soporta botones dinámicos
   - delegación premium
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE =
  "view:usuarios";

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
      "[UsuariosBindings]",
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

function getUserId(
  element
) {
  return safeText(
    element?.dataset
      ?.userId ||
      element?.getAttribute?.(
        "data-user-id"
      ),
    ""
  );
}

function getUsername(
  element
) {
  return safeText(
    element?.dataset
      ?.username ||
      element?.getAttribute?.(
        "data-username"
      ),
    ""
  );
}

async function safeReload(
  reload,
  loadUsuarios
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
      typeof loadUsuarios ===
      "function"
    ) {
      await loadUsuarios({
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

/* =========================================================
   MAIN
========================================================= */

export function bindUsuariosEvents({
  loadUsuarios,
  openUsuario,
  copyUsuarioIdAction,
  exportUsuariosCsvAction,
  reload,
  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeRef =
    getScope(scope);

  const root =
    getContainer();

  const refreshBtn =
    document.getElementById(
      "usuarios-refresh-btn"
    );

  const retryBtn =
    document.getElementById(
      "usuarios-retry-btn"
    );

  const exportBtn =
    document.getElementById(
      "usuarios-export-btn"
    );

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
          loadUsuarios
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
          loadUsuarios
        );
      }
    );
  }

  if (exportBtn) {
    AppCore.cleanup.on(
      scopeRef,
      exportBtn,
      "click",
      async (event) => {
        event.preventDefault();

        try {
          await exportUsuariosCsvAction?.();
        } catch (error) {
          safeWarn(
            "export falló",
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
      const openBtn =
        event.target?.closest?.(
          '[data-action="open-user"]'
        );

      if (openBtn) {
        event.preventDefault();
        event.stopPropagation();

        const userId =
          getUserId(
            openBtn
          );

        if (!userId) {
          safeWarn(
            "open-user sin id"
          );
          return;
        }

        try {
          await openUsuario?.(
            userId
          );
        } catch (error) {
          safeWarn(
            "openUsuario falló",
            error
          );
        }

        return;
      }

      const copyBtn =
        event.target?.closest?.(
          '[data-action="copy-user-id"]'
        );

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        const userId =
          getUserId(
            copyBtn
          );

        const username =
          getUsername(
            copyBtn
          );

        try {
          await copyUsuarioIdAction?.({
            userId,
            username,
          });
        } catch (error) {
          safeWarn(
            "copyUsuarioIdAction falló",
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
  bindUsuariosEvents,
};
