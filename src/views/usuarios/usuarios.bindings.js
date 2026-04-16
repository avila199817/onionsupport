/* =========================================================
   Onion SPA - Usuarios Bindings
   Archivo: src/views/usuarios/usuarios.bindings.js

   FINAL PRO SYSTEM · ADMIN USERS BINDINGS · 10/10

   Responsabilidades:
   - enlazar eventos reales de la vista Usuarios
   - registrar y limpiar listeners del DOM
   - delegar acciones sobre hero, toolbar, tabla y paginación
   - conectar DOM con usuarios.actions.js
   - mantener la vista desacoplada del template
   - exponer cleanup robusto para re-render seguro
   - mantener coherencia estricta con usuarios.actions.js y usuarios.store.js
   - soportar el template premium tipo incidencias / facturas
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  hydrateUsuarios,
  refreshUsuariosList,
  searchUsuarios,
  applyUsuariosRoleFilter,
  applyUsuariosStatusFilter,
  changeUsuariosSort,
  changeUsuariosPageSize,
  nextUsuariosPage,
  prevUsuariosPage,
  resetUsuariosListFilters,
  selectUsuario,
  clearUsuariosSelectionAction,
  openUsuarioDetail,
} from "./usuarios.actions.js";

import {
  patchUsuariosUi,
  setUsuariosAction,
  setUsuariosSearchDraftUi,
  readUsuariosParams,
} from "./usuarios.store.js";

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isElement(value) {
  return (
    value instanceof Element ||
    value instanceof HTMLDocument
  );
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeQuery(root, selector) {
  if (!isElement(root) || !selector) {
    return null;
  }

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function safeQueryAll(root, selector) {
  if (!isElement(root) || !selector) {
    return [];
  }

  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function addEventListenerSafe(
  target,
  eventName,
  handler,
  options
) {
  if (
    !target ||
    typeof target.addEventListener !== "function" ||
    typeof handler !== "function"
  ) {
    return () => {};
  }

  target.addEventListener(
    eventName,
    handler,
    options
  );

  return () => {
    try {
      target.removeEventListener(
        eventName,
        handler,
        options
      );
    } catch {}
  };
}

function createDisposerBag() {
  const disposers = [];

  return {
    add(disposer) {
      if (typeof disposer === "function") {
        disposers.push(disposer);
      }
    },

    flush() {
      while (disposers.length) {
        const disposer = disposers.pop();

        try {
          disposer?.();
        } catch (error) {
          console.error(
            "[UsuariosBindings] cleanup error",
            error
          );
        }
      }
    },
  };
}

function safeEmit(
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch (error) {
    console.warn(
      "[UsuariosBindings] emit warning",
      error
    );
  }
}

function getUsuariosRoot(container) {
  return (
    safeQuery(
      container,
      '[data-usuarios-view="true"]'
    ) ||
    safeQuery(
      container,
      ".usuarios-view"
    ) ||
    container ||
    null
  );
}

function getSearchInput(root) {
  return safeQuery(
    root,
    '[data-usuarios-input="search"]'
  );
}

function getSortDirForColumn(
  column = ""
) {
  const params = safeObject(
    readUsuariosParams?.()
  );

  const currentBy = safeText(
    params.sortBy,
    "createdAt"
  );

  const currentDir = safeText(
    params.sortDir,
    "desc"
  ).toLowerCase();

  if (currentBy !== column) {
    return "asc";
  }

  return currentDir === "asc"
    ? "desc"
    : "asc";
}

function getActionNodeFromEvent(
  event,
  root
) {
  const node = event?.target?.closest?.(
    "[data-usuarios-action]"
  );

  if (
    node &&
    root?.contains?.(node)
  ) {
    return node;
  }

  return null;
}

function getSortNodeFromEvent(
  event,
  root
) {
  const node = event?.target?.closest?.(
    "[data-usuarios-sort]"
  );

  if (
    node &&
    root?.contains?.(node)
  ) {
    return node;
  }

  return null;
}

function getUserIdFromNode(node) {
  return safeText(
    node?.getAttribute?.(
      "data-usuarios-user-id"
    ),
    ""
  );
}

/* =========================================================
   DOM SYNC
========================================================= */

function syncSearchDraftFromDom(root) {
  const input = getSearchInput(root);

  if (!input) {
    return "";
  }

  const value = safeText(
    input.value,
    ""
  );

  setUsuariosSearchDraftUi(value);
  return value;
}

function syncSearchDraftToDom(root) {
  const input = getSearchInput(root);

  if (!input) {
    return;
  }

  const params = safeObject(
    readUsuariosParams?.()
  );

  const currentValue = safeText(
    input.value,
    ""
  );

  const storeValue = safeText(
    params.q,
    ""
  );

  if (currentValue !== storeValue) {
    input.value = storeValue;
  }

  setUsuariosSearchDraftUi(storeValue);
}

/* =========================================================
   ACTION EXECUTORS
========================================================= */

async function handleUsuariosActionClick(
  action = "",
  element,
  root
) {
  const normalized = safeText(
    action,
    ""
  );

  if (!normalized) {
    return null;
  }

  const userId =
    getUserIdFromNode(element);

  safeEmit(
    "usuarios:bindings:action:start",
    {
      action: normalized,
      userId,
    }
  );

  let result = null;

  switch (normalized) {
    case "hydrate":
      setUsuariosAction("hydrate");
      result = await hydrateUsuarios();
      break;

    case "refresh":
      setUsuariosAction("refresh");
      result = await refreshUsuariosList();
      break;

    case "submit-search": {
      setUsuariosAction("search");
      const search =
        syncSearchDraftFromDom(root);

      result =
        await searchUsuarios(search);
      break;
    }

    case "clear-selection":
      setUsuariosAction(
        "clear-selection"
      );
      result =
        clearUsuariosSelectionAction();
      break;

    case "reset-filters":
      setUsuariosAction(
        "reset-filters"
      );
      result =
        await resetUsuariosListFilters();

      syncSearchDraftToDom(root);
      break;

    case "prev-page":
      setUsuariosAction("prev-page");
      result =
        await prevUsuariosPage();
      break;

    case "next-page":
      setUsuariosAction("next-page");
      result =
        await nextUsuariosPage();
      break;

    case "select-user":
      setUsuariosAction(
        "select-user"
      );
      result =
        selectUsuario(userId);
      break;

    case "open-detail":
      setUsuariosAction(
        "open-detail"
      );
      result =
        await openUsuarioDetail(
          userId
        );
      break;

    case "export":
      setUsuariosAction("export");
      safeEmit(
        "usuarios:export:requested",
        {
          action: normalized,
          source: "template-button",
        }
      );
      result = {
        ok: true,
        delegated: true,
        action: "export",
      };
      break;

    case "create-user":
      setUsuariosAction(
        "create-user"
      );
      safeEmit(
        "usuarios:create:requested",
        {
          action: normalized,
          source: "template-button",
        }
      );
      result = {
        ok: true,
        delegated: true,
        action: "create-user",
      };
      break;

    default:
      result = null;
      break;
  }

  safeEmit(
    result?.ok === true
      ? "usuarios:bindings:action:success"
      : "usuarios:bindings:action:error",
    {
      action: normalized,
      userId,
      result,
    }
  );

  return result;
}

async function handleUsuariosFilterChange(
  type = "",
  value = ""
) {
  const normalizedType =
    safeText(type, "");
  const normalizedValue =
    safeText(value, "");

  safeEmit(
    "usuarios:bindings:filter:change",
    {
      type: normalizedType,
      value: normalizedValue,
    }
  );

  if (normalizedType === "role") {
    setUsuariosAction(
      "filter-role"
    );

    return applyUsuariosRoleFilter(
      normalizedValue
    );
  }

  if (
    normalizedType === "status"
  ) {
    setUsuariosAction(
      "filter-status"
    );

    return applyUsuariosStatusFilter(
      normalizedValue
    );
  }

  return null;
}

async function handleUsuariosPageSizeChange(
  value = ""
) {
  const pageSize = Math.max(
    1,
    Number(value) || 5
  );

  setUsuariosAction(
    "page-size"
  );

  safeEmit(
    "usuarios:bindings:page-size:change",
    {
      pageSize,
    }
  );

  return changeUsuariosPageSize(
    pageSize
  );
}

async function handleUsuariosSortClick(
  sortBy = ""
) {
  const normalized = safeText(
    sortBy,
    ""
  );

  if (!normalized) {
    return null;
  }

  const sortDir =
    getSortDirForColumn(
      normalized
    );

  setUsuariosAction("sort");

  safeEmit(
    "usuarios:bindings:sort",
    {
      sortBy: normalized,
      sortDir,
    }
  );

  return changeUsuariosSort(
    normalized,
    sortDir
  );
}

/* =========================================================
   BINDERS
========================================================= */

function bindLifecycle({
  root,
  bag,
}) {
  safeEmit(
    "usuarios:view:bound",
    {
      root,
      rows:
        safeQueryAll(
          root,
          "[data-user-id]"
        ).length,
      actions:
        safeQueryAll(
          root,
          "[data-usuarios-action]"
        ).length,
    }
  );

  bag.add(() => {
    safeEmit(
      "usuarios:view:unbound",
      {
        root,
      }
    );
  });
}

function bindClickDelegation({
  root,
  bag,
}) {
  const onClick = async (event) => {
    const actionNode =
      getActionNodeFromEvent(
        event,
        root
      );

    if (actionNode) {
      event.preventDefault();

      try {
        await handleUsuariosActionClick(
          actionNode.getAttribute(
            "data-usuarios-action"
          ),
          actionNode,
          root
        );
      } catch (error) {
        console.error(
          "[UsuariosBindings] action click error",
          error
        );
      }

      return;
    }

    const sortNode =
      getSortNodeFromEvent(
        event,
        root
      );

    if (sortNode) {
      event.preventDefault();

      try {
        await handleUsuariosSortClick(
          sortNode.getAttribute(
            "data-usuarios-sort"
          )
        );
      } catch (error) {
        console.error(
          "[UsuariosBindings] sort click error",
          error
        );
      }
    }
  };

  bag.add(
    addEventListenerSafe(
      root,
      "click",
      onClick
    )
  );
}

function bindChangeDelegation({
  root,
  bag,
}) {
  const onChange = async (event) => {
    const target = event?.target;

    if (!target) {
      return;
    }

    const filterType =
      target.getAttribute?.(
        "data-usuarios-filter"
      );

    if (
      filterType &&
      root.contains(target)
    ) {
      try {
        await handleUsuariosFilterChange(
          filterType,
          target.value
        );
      } catch (error) {
        console.error(
          "[UsuariosBindings] filter change error",
          error
        );
      }

      return;
    }

    const isPageSize =
      target.getAttribute?.(
        "data-usuarios-page-size"
      ) === "true";

    if (
      isPageSize &&
      root.contains(target)
    ) {
      try {
        await handleUsuariosPageSizeChange(
          target.value
        );
      } catch (error) {
        console.error(
          "[UsuariosBindings] page size change error",
          error
        );
      }
    }
  };

  bag.add(
    addEventListenerSafe(
      root,
      "change",
      onChange
    )
  );
}

function bindSearchInput({
  root,
  bag,
}) {
  const input =
    getSearchInput(root);

  if (!input) {
    return;
  }

  const onInput = () => {
    const value = safeText(
      input.value,
      ""
    );

    setUsuariosSearchDraftUi(value);

    safeEmit(
      "usuarios:bindings:search:draft",
      {
        value,
      }
    );
  };

  const onKeydown = async (
    event
  ) => {
    if (
      event?.key !== "Enter"
    ) {
      return;
    }

    event.preventDefault();

    try {
      setUsuariosAction("search");

      const value = safeText(
        input.value,
        ""
      );

      setUsuariosSearchDraftUi(value);

      await searchUsuarios(value);
    } catch (error) {
      console.error(
        "[UsuariosBindings] search enter error",
        error
      );
    }
  };

  bag.add(
    addEventListenerSafe(
      input,
      "input",
      onInput
    )
  );

  bag.add(
    addEventListenerSafe(
      input,
      "keydown",
      onKeydown
    )
  );
}

function bindWindowResize({
  bag,
}) {
  if (!isBrowser()) {
    return;
  }

  const onResize = () => {
    safeEmit(
      "usuarios:view:resize",
      {
        width:
          window.innerWidth,
        height:
          window.innerHeight,
      }
    );
  };

  bag.add(
    addEventListenerSafe(
      window,
      "resize",
      onResize,
      { passive: true }
    )
  );
}

function bindHoverTelemetry({
  root,
  bag,
}) {
  const hoverables =
    safeQueryAll(
      root,
      [
        ".usuarios-hero",
        ".usuarios-stat-card",
        ".usuarios-table-wrap",
        ".usuarios-mobile-card",
        "[data-usuarios-action]",
        "[data-usuarios-sort]",
        "[data-user-id]",
      ].join(", ")
    );

  hoverables.forEach(
    (node, index) => {
      const onPointerEnter =
        () => {
          safeEmit(
            "usuarios:hover:item",
            {
              index,
              tagName:
                node.tagName,
              className:
                safeText(
                  node.className,
                  ""
                ),
              action:
                safeText(
                  node.getAttribute?.(
                    "data-usuarios-action"
                  ),
                  ""
                ),
              userId:
                safeText(
                  node.getAttribute?.(
                    "data-user-id"
                  ),
                  node.getAttribute?.(
                    "data-usuarios-user-id"
                  ) || ""
                ),
            }
          );
        };

      bag.add(
        addEventListenerSafe(
          node,
          "pointerenter",
          onPointerEnter,
          { passive: true }
        )
      );
    }
  );
}

function bindFocusTelemetry({
  root,
  bag,
}) {
  const focusables =
    safeQueryAll(
      root,
      [
        '[data-usuarios-input="search"]',
        "[data-usuarios-filter]",
        "[data-usuarios-page-size]",
        "[data-usuarios-sort]",
        "[data-usuarios-action]",
      ].join(", ")
    );

  focusables.forEach(
    (node) => {
      const onFocus = () => {
        safeEmit(
          "usuarios:focus:item",
          {
            action: safeText(
              node.getAttribute?.(
                "data-usuarios-action"
              ),
              ""
            ),
            sort: safeText(
              node.getAttribute?.(
                "data-usuarios-sort"
              ),
              ""
            ),
            filter: safeText(
              node.getAttribute?.(
                "data-usuarios-filter"
              ),
              ""
            ),
            pageSize:
              node.getAttribute?.(
                "data-usuarios-page-size"
              ) === "true",
          }
        );
      };

      bag.add(
        addEventListenerSafe(
          node,
          "focus",
          onFocus,
          true
        )
      );
    }
  );
}

/* =========================================================
   MAIN BIND
========================================================= */

export function bindUsuariosView({
  container,
} = {}) {
  if (!isBrowser()) {
    return () => {};
  }

  if (!isElement(container)) {
    console.warn(
      "[UsuariosBindings] container inválido"
    );
    return () => {};
  }

  const root =
    getUsuariosRoot(
      container
    );

  if (!root) {
    console.warn(
      "[UsuariosBindings] root no encontrado"
    );
    return () => {};
  }

  patchUsuariosUi({
    mounted: true,
  });

  syncSearchDraftToDom(root);

  const bag =
    createDisposerBag();

  bindLifecycle({
    root,
    bag,
  });

  bindClickDelegation({
    root,
    bag,
  });

  bindChangeDelegation({
    root,
    bag,
  });

  bindSearchInput({
    root,
    bag,
  });

  bindWindowResize({
    bag,
  });

  bindHoverTelemetry({
    root,
    bag,
  });

  bindFocusTelemetry({
    root,
    bag,
  });

  return function cleanupUsuariosView() {
    patchUsuariosUi({
      mounted: false,
    });

    bag.flush();
  };
}

export default bindUsuariosView;
