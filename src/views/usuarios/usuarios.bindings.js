/* =========================================================
   Onion SPA - Usuarios Bindings
   Archivo: src/views/usuarios/usuarios.bindings.js

   FINAL PRO SYSTEM · DOM BINDINGS · ADMIN USERS · 10/10

   RESPONSABILIDADES:
   - bind DOM robusto
   - refresh / retry
   - export CSV
   - create usuario
   - open user modal
   - copy id
   - paginación
   - page-size compatible aunque la vista quede fijada a 5
   - rebind limpio tras rerender
   - cleanup sólido por scope
   - compatibilidad data-usuarios-action + data-action

   HARDENING PRO:
   - evita doble click handlers
   - soporta botones dinámicos
   - delegación premium
   - fallback si AppCore.cleanup no existe
   - no rompe si se usa con UsuariosView moderno
   - no rompe si se usa en legacy externo
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE = "view:usuarios";

/* =========================================================
   LOCAL CLEANUP FALLBACK
========================================================= */

const localCleanups = new Map();

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return null;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[UsuariosBindings]", ...args);
  } catch {}
}

function resolveScopeName(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
}

function getContainer(customRoot = null) {
  return (
    customRoot ||
    AppCore?.dom?.viewContainer ||
    document.getElementById("view-container") ||
    document
  );
}

/* =========================================================
   CLEANUP
========================================================= */

function runLocalCleanup(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);
  const cleanups = localCleanups.get(finalScope) || [];

  for (const cleanup of cleanups) {
    try {
      cleanup?.();
    } catch {}
  }

  localCleanups.delete(finalScope);
}

function pushLocalCleanup(scopeName = DEFAULT_SCOPE, cleanup = null) {
  if (typeof cleanup !== "function") return;

  const finalScope = resolveScopeName(scopeName);
  const cleanups = localCleanups.get(finalScope) || [];

  cleanups.push(cleanup);
  localCleanups.set(finalScope, cleanups);
}

function cleanupScope(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);

  try {
    AppCore?.cleanup?.run?.(finalScope);
  } catch {}

  runLocalCleanup(finalScope);
}

function bindEvent(scopeName, target, eventName, handler, options = undefined) {
  const finalScope = resolveScopeName(scopeName);

  if (!target || typeof target.addEventListener !== "function") {
    return () => {};
  }

  try {
    if (typeof AppCore?.cleanup?.on === "function") {
      AppCore.cleanup.on(finalScope, target, eventName, handler, options);
      return () => {
        try {
          target.removeEventListener(eventName, handler, options);
        } catch {}
      };
    }
  } catch {}

  try {
    target.addEventListener(eventName, handler, options);

    const cleanup = () => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch {}
    };

    pushLocalCleanup(finalScope, cleanup);

    return cleanup;
  } catch {
    return () => {};
  }
}

/* =========================================================
   ACTION / DATA HELPERS
========================================================= */

function getActionTarget(event, actions = []) {
  const selectors = actions
    .map((action) => {
      return [
        `[data-usuarios-action="${action}"]`,
        `[data-action="${action}"]`,
      ].join(",");
    })
    .join(",");

  if (!selectors) return null;

  return event.target?.closest?.(selectors) || null;
}

function getUserId(element = null) {
  return safeText(
    first(
      element?.dataset?.userId,
      element?.dataset?.usuarioId,
      element?.dataset?.id,
      element?.dataset?.username,
      element?.dataset?.userName,

      element?.getAttribute?.("data-user-id"),
      element?.getAttribute?.("data-usuario-id"),
      element?.getAttribute?.("data-id"),
      element?.getAttribute?.("data-username"),
      element?.getAttribute?.("data-user-name")
    ),
    ""
  );
}

function getUsername(element = null) {
  return safeText(
    first(
      element?.dataset?.username,
      element?.dataset?.userName,
      element?.dataset?.usuarioName,

      element?.getAttribute?.("data-username"),
      element?.getAttribute?.("data-user-name"),
      element?.getAttribute?.("data-usuario-name")
    ),
    ""
  );
}

function getPage(element = null, fallback = 1) {
  return Math.max(
    1,
    safeNumber(
      first(
        element?.dataset?.page,
        element?.getAttribute?.("data-page")
      ),
      fallback
    )
  );
}

async function safeReload({
  reload,
  loadUsuarios,
  force = true,
  asRefresh = true,
  silent = false,
} = {}) {
  try {
    if (typeof reload === "function") {
      await reload({
        force,
        asRefresh,
        silent,
      });
      return true;
    }

    if (typeof loadUsuarios === "function") {
      await loadUsuarios({
        force,
        silent,
      });
      return true;
    }
  } catch (error) {
    safeWarn("reload falló", error);
  }

  return false;
}

async function callMaybeAsync(fn, args = [], label = "acción") {
  try {
    if (typeof fn === "function") {
      return await fn(...args);
    }
  } catch (error) {
    safeWarn(`${label} falló`, error);
  }

  return undefined;
}

/* =========================================================
   MAIN
========================================================= */

export function bindUsuariosEvents({
  root = null,

  loadUsuarios,
  openUsuario,
  createUsuario,
  copyUsuarioId,
  copyUsuarioIdAction,
  exportCsv,
  exportUsuariosCsvAction,
  reload,

  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,

  scope = DEFAULT_SCOPE,
} = {}) {
  const scopeName = resolveScopeName(scope);

  /*
    Limpieza antes de volver a bindear.
    Evita doble handler tras rerender.
  */
  cleanupScope(scopeName);

  const container = getContainer(root);

  if (!container) {
    safeWarn("No hay contenedor para bindUsuariosEvents.");
    return () => cleanupScope(scopeName);
  }

  const handleRefresh = async ({ asRefresh = true } = {}) => {
    await safeReload({
      reload,
      loadUsuarios,
      force: true,
      asRefresh,
      silent: false,
    });
  };

  const onClick = async (event) => {
    const target = event.target;

    if (!target) return;

    /* =========================================
       OPEN DETAIL
    ========================================= */

    const openBtn =
      getActionTarget(event, [
        "detail",
        "open",
        "open-user",
        "open-usuario",
        "view-user",
        "view-usuario",
      ]);

    if (openBtn) {
      event.preventDefault();
      event.stopPropagation();

      const userId = getUserId(openBtn);

      if (!userId) {
        safeWarn("open-user sin id");
        return;
      }

      await callMaybeAsync(openUsuario, [userId], "openUsuario");
      return;
    }

    /* =========================================
       COPY ID
    ========================================= */

    const copyBtn =
      getActionTarget(event, [
        "copy",
        "copy-id",
        "copy-user-id",
        "copy-usuario-id",
      ]);

    if (copyBtn) {
      event.preventDefault();
      event.stopPropagation();

      const userId = getUserId(copyBtn);
      const username = getUsername(copyBtn);

      const fn = copyUsuarioIdAction || copyUsuarioId;

      await callMaybeAsync(
        fn,
        [
          {
            userId,
            username,
            silent: false,
          },
        ],
        "copyUsuarioId"
      );

      return;
    }

    /* =========================================
       PAGINATION
    ========================================= */

    const pageBtn =
      getActionTarget(event, [
        "page",
        "go-page",
      ]);

    if (pageBtn) {
      event.preventDefault();
      event.stopPropagation();

      const page = getPage(pageBtn, 1);

      await callMaybeAsync(goToPage, [page], "goToPage");
      return;
    }

    const prevBtn =
      getActionTarget(event, [
        "prev-page",
        "pagination-prev",
      ]);

    if (prevBtn) {
      event.preventDefault();
      event.stopPropagation();

      await callMaybeAsync(goPrevPage, [], "goPrevPage");
      return;
    }

    const nextBtn =
      getActionTarget(event, [
        "next-page",
        "pagination-next",
      ]);

    if (nextBtn) {
      event.preventDefault();
      event.stopPropagation();

      await callMaybeAsync(goNextPage, [], "goNextPage");
      return;
    }

    /* =========================================
       EXPORT
    ========================================= */

    const exportBtn =
      getActionTarget(event, [
        "export",
        "export-csv",
      ]) ||
      target.closest?.("#usuarios-export-btn");

    if (exportBtn) {
      event.preventDefault();
      event.stopPropagation();

      const fn = exportUsuariosCsvAction || exportCsv;

      await callMaybeAsync(
        fn,
        [
          {
            silent: false,
          },
        ],
        "exportUsuariosCsv"
      );

      return;
    }

    /* =========================================
       CREATE
    ========================================= */

    const createBtn =
      getActionTarget(event, [
        "create",
        "new",
        "new-user",
        "new-usuario",
        "create-user",
        "create-usuario",
      ]) ||
      target.closest?.("#usuarios-create-btn") ||
      target.closest?.("#usuarios-create-empty-btn");

    if (createBtn) {
      event.preventDefault();
      event.stopPropagation();

      await callMaybeAsync(createUsuario, [], "createUsuario");
      return;
    }

    /* =========================================
       RETRY
    ========================================= */

    const retryBtn =
      getActionTarget(event, [
        "retry",
      ]) ||
      target.closest?.("#usuarios-retry-btn");

    if (retryBtn) {
      event.preventDefault();
      event.stopPropagation();

      await handleRefresh({
        asRefresh: false,
      });

      return;
    }

    /* =========================================
       REFRESH
    ========================================= */

    const refreshBtn =
      getActionTarget(event, [
        "refresh",
        "reload",
      ]) ||
      target.closest?.("#usuarios-refresh-btn");

    if (refreshBtn) {
      event.preventDefault();
      event.stopPropagation();

      await handleRefresh({
        asRefresh: true,
      });
    }
  };

  const onChange = async (event) => {
    const field =
      event.target?.closest?.("[data-usuarios-field='page-size']") ||
      event.target?.closest?.("[data-field='page-size']");

    if (!field) return;

    event.preventDefault();

    const value = safeNumber(field.value, 5);

    await callMaybeAsync(changePageSize, [value], "changePageSize");
  };

  bindEvent(scopeName, container, "click", onClick);
  bindEvent(scopeName, container, "change", onChange);

  return () => {
    cleanupScope(scopeName);
  };
}

/* =========================================================
   LEGACY ALIASES
========================================================= */

export const bind = bindUsuariosEvents;

export function unbindUsuariosEvents(scope = DEFAULT_SCOPE) {
  cleanupScope(scope);
}

export default {
  bindUsuariosEvents,
  bind,
  unbindUsuariosEvents,
};
