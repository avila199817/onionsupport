/* =========================================================
   Onion Support - Cuenta Index
   Archivo: /src/views/cuenta/index.js

   PRODUCTIVO · API BOUNDARY · SELF ACCOUNT CONTROLLER · V5

   Arquitectura:
   - cuenta.api.js      = HTTP + contrato backend + modelo canónico
   - cuenta.template.js = HTML puro
   - index.js           = estado UI + DOM + acciones

   Backend actual:
   - GET    /api/auth/me
   - POST   /api/auth/change-password
   - POST   /api/auth/deactivate/self
   - POST   /api/users/avatar
   - DELETE /api/users/avatar
   - GET    /api/users/sessions

   No existe update self para:
   - nombre
   - teléfono
   - darkMode
   - privacyMode
   - lang

   Reglas:
   - Sin Http/fetch/storage.
   - Sin /api/users/:id.
   - Sin payload aliases inventados.
   - Sin cache global paralela del perfil.
   - No guardar passwords en state/snapshot.
   - Acciones self-update no soportadas se bloquean en UI
     sin llamar siquiera al API legacy 405.
========================================================= */

import {
  CUENTA_API_VERSION,
  CUENTA_SELF_UPDATE_SUPPORTED,
  CUENTA_PASSWORD_POLICY,
  CUENTA_AVATAR_POLICY,

  normalizeCuentaDetail,
  hydrateCuentaFromCache,

  loadCuenta as loadCuentaApi,

  validateCuentaPasswordPayload,
  changePassword as changePasswordApi,

  validateCuentaAvatarFile,
  uploadCuentaAvatar as uploadCuentaAvatarApi,
  deleteCuentaAvatar as deleteCuentaAvatarApi,

  loadCuentaSessions as loadCuentaSessionsApi,

  deactivateCuenta as deactivateCuentaApi,

  getCuentaApiSnapshot,
} from "./cuenta.api.js";

import {
  CUENTA_TEMPLATE_VERSION,
  renderCuentaTemplate,
  renderErrorState,
} from "./cuenta.template.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const CUENTA_INDEX_VERSION =
  "cuenta.index.api-boundary.v5.self-account";

export const CUENTA_VIEW_VERSION =
  CUENTA_INDEX_VERSION;

export const CUENTA_INDEX_SOURCE =
  "views.cuenta.index";

export {
  CUENTA_API_VERSION,
  CUENTA_TEMPLATE_VERSION,
  CUENTA_SELF_UPDATE_SUPPORTED,
  CUENTA_PASSWORD_POLICY,
  CUENTA_AVATAR_POLICY,
};

const ACTION_SELECTOR =
  "[data-cuenta-action], [data-action]";

const FIELD_SELECTOR =
  "[data-cuenta-field], [data-field]";

const ROUTER_EVENT_HANDLED_KEY =
  "__onionRouterHandled";

const INSTANCES =
  new WeakMap();

const REFRESH_ACTIONS =
  new Set([
    "refresh-cuenta",
    "reload-cuenta",
    "refresh",
    "reload",
  ]);

const UNSUPPORTED_SAVE_ACTIONS =
  new Set([
    "save-cuenta",
    "save",
    "save-profile",
    "save-perfil",
  ]);

const UNSUPPORTED_THEME_ACTIONS =
  new Set([
    "toggle-theme",
    "change-theme",
    "update-theme",
    "set-theme",
  ]);

const UNSUPPORTED_LANGUAGE_ACTIONS =
  new Set([
    "change-language",
    "update-language",
    "set-language",
  ]);

const UNSUPPORTED_PRIVACY_ACTIONS =
  new Set([
    "toggle-privacy",
    "change-privacy",
    "update-privacy",
    "set-privacy",
    "save-privacy",
  ]);

const PASSWORD_ACTIONS =
  new Set([
    "change-password",
    "update-password",
    "save-password",
  ]);

const UPLOAD_AVATAR_ACTIONS =
  new Set([
    "upload-avatar",
    "upload-cuenta-avatar",
  ]);

const DELETE_AVATAR_ACTIONS =
  new Set([
    "delete-avatar",
    "delete-cuenta-avatar",
    "remove-avatar",
  ]);

const LOAD_SESSIONS_ACTIONS =
  new Set([
    "load-sessions",
    "load-cuenta-sessions",
    "refresh-sessions",
  ]);

const DEACTIVATE_ACTIONS =
  new Set([
    "deactivate-account",
    "deactivate-cuenta",
    "deactivate-self",
  ]);

const UNSUPPORTED_SELF_UPDATE_MESSAGE =
  "El backend actual todavía no permite guardar nombre, teléfono, apariencia, idioma o privacidad desde Cuenta.";

let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function isFunction(value) {
  return (
    typeof value === "function"
  );
}

function isDomNode(value) {
  return Boolean(
    value &&
      value.nodeType === 1 &&
      isFunction(
        value.querySelectorAll
      )
  );
}

function safeObject(
  value,
  fallback = {}
) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function cleanText(
  value = "",
  fallback = ""
) {
  const text =
    String(value ?? "")
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    text ||
    fallback
  );
}

function first(...values) {
  for (
    const value of
    values.flat(Infinity)
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function hasContent(value) {
  return (
    isObject(value) &&
    Object.keys(value)
      .length > 0
  );
}

function safeError(
  error = null,
  fallback =
    "No se pudo procesar la cuenta."
) {
  return cleanText(
    first(
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data
        ?.message,
      error?.response?.message,
      error?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function safeErrorCode(
  error = null
) {
  return cleanText(
    first(
      error?.code,
      error?.error,
      error?.data?.code,
      error?.payload?.code,
      error?.response?.code,
      ""
    ),
    ""
  );
}

function signature(value) {
  try {
    return JSON.stringify(
      value ?? null
    );
  } catch {
    return String(
      value ?? ""
    );
  }
}

function now() {
  return Date.now();
}

/* =========================================================
   EVENTS
========================================================= */

function emitCuentaEvent(
  name = "",
  detail = {}
) {
  const eventName =
    cleanText(
      name,
      ""
    );

  if (
    !eventName ||
    typeof window ===
      "undefined" ||
    typeof CustomEvent ===
      "undefined"
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(
        eventName,
        {
          detail,
        }
      )
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DOM HELPERS
========================================================= */

function closestFrom(
  target,
  selector
) {
  const node =
    target?.nodeType === 3
      ? target.parentElement
      : target;

  return (
    node?.closest?.(
      selector
    ) ||
    null
  );
}

function getActionName(
  node = null
) {
  return cleanText(
    first(
      node?.dataset
        ?.cuentaAction,
      node?.dataset
        ?.action,
      node?.getAttribute?.(
        "data-cuenta-action"
      ),
      node?.getAttribute?.(
        "data-action"
      ),
      ""
    ),
    ""
  );
}

function getFieldName(
  node = null
) {
  return cleanText(
    first(
      node?.dataset
        ?.cuentaField,
      node?.dataset
        ?.field,
      node?.name,
      ""
    ),
    ""
  );
}

function getFieldValue(
  node = null
) {
  if (!node) {
    return "";
  }

  if (
    node.type === "checkbox"
  ) {
    return Boolean(
      node.checked
    );
  }

  if (
    node.type === "radio"
  ) {
    return node.checked
      ? node.value
      : undefined;
  }

  if (
    node.type === "file"
  ) {
    return (
      node.files?.[0] ||
      null
    );
  }

  return node.value;
}

function readField(
  host = null,
  fieldName = ""
) {
  const name =
    cleanText(
      fieldName,
      ""
    );

  if (
    !host ||
    !name
  ) {
    return "";
  }

  const escapedName =
    typeof CSS !== "undefined" &&
    isFunction(CSS.escape)
      ? CSS.escape(name)
      : name.replace(
          /["\\]/g,
          "\\$&"
        );

  const node =
    host.querySelector?.(
      `[data-cuenta-field="${escapedName}"], [data-field="${escapedName}"], [name="${escapedName}"]`
    );

  return getFieldValue(
    node
  );
}

function clearSensitiveInputs(
  host = null
) {
  if (!host) {
    return false;
  }

  for (
    const name of [
      "currentPassword",
      "newPassword",
      "confirmPassword",
      "deactivatePassword",
      "password",
    ]
  ) {
    let nodes = [];

    try {
      nodes = [
        ...host.querySelectorAll(
          `[data-cuenta-field="${name}"], [data-field="${name}"], [name="${name}"]`
        ),
      ];
    } catch {
      nodes = [];
    }

    for (
      const node of nodes
    ) {
      try {
        if (
          node?.type ===
          "password"
        ) {
          node.value = "";
        }
      } catch {
        // noop
      }
    }
  }

  return true;
}

function resolveAvatarFile(
  host = null,
  input = null
) {
  if (
    input &&
    typeof input === "object" &&
    typeof input.type === "string" &&
    Number.isFinite(
      Number(input.size)
    ) &&
    !isFunction(
      input.matches
    )
  ) {
    return input;
  }

  const node =
    input?.matches?.(
      'input[type="file"]'
    )
      ? input
      : host?.querySelector?.(
          'input[type="file"][data-cuenta-field="avatar"], input[type="file"][data-field="avatar"], input[type="file"][name="avatar"]'
        );

  return (
    node?.files?.[0] ||
    null
  );
}

function clearHost(
  host = null
) {
  try {
    host?.replaceChildren?.();
  } catch {
    if (host) {
      host.textContent = "";
    }
  }
}

/* =========================================================
   CANONICAL RESULT
========================================================= */

function canonicalItem(
  value = null,
  fallback = {}
) {
  if (!value) {
    return null;
  }

  return normalizeCuentaDetail(
    value,
    fallback
  );
}

function resultItem(
  result = null,
  fallback = {}
) {
  if (!result) {
    return null;
  }

  const nested =
    first(
      result?.item,
      result?.user,
      result?.account,
      result?.profile,
      result?.cuenta,
      result
    );

  return canonicalItem(
    nested,
    fallback
  );
}

/* =========================================================
   CONTROLLER
========================================================= */

function destroyPrevious(
  host = null
) {
  const previous =
    host
      ? INSTANCES.get(
          host
        )
      : null;

  if (
    !previous?.destroy
  ) {
    return false;
  }

  previous.destroy({
    keepDom: true,
    remount: true,
  });

  return true;
}

function createCuentaController(
  host = null,
  context = {}
) {
  let destroyed = false;
  let mounted = false;
  let bound = false;

  let item = null;

  let loading = false;
  let refreshing = false;
  let saving = false;

  let sessions = [];
  let sessionsLoaded = false;
  let sessionsLoading = false;
  let sessionsError = "";

  let authRefreshRequired = false;
  let deactivated = false;

  let lastError = "";
  let lastErrorCode = "";
  let lastSuccess = "";

  let lastHTML = "";
  let lastRenderAt = 0;
  let mountedFrom = "empty";

  let loadSeq = 0;
  let actionSeq = 0;
  let loadPromise = null;

  const localContext = {
    ...safeObject(
      context
    ),
  };

  /* =======================================================
     STATE
  ======================================================= */

  function capabilities() {
    return {
      readSelf: true,

      updateSelfProfile:
        false,

      updateSelfTheme:
        false,

      updateSelfPrivacy:
        false,

      updateSelfLanguage:
        false,

      changePassword:
        true,

      avatarUpload:
        true,

      avatarDelete:
        true,

      sessionsRead:
        true,

      deactivateSelf:
        true,
    };
  }

  function makeState(
    extra = {}
  ) {
    return {
      loading:
        extra.loading ??
        loading,

      refreshing:
        extra.refreshing ??
        refreshing,

      saving:
        extra.saving ??
        saving,

      error:
        extra.error ??
        lastError,

      errorCode:
        extra.errorCode ??
        lastErrorCode,

      item:
        extra.item ??
        item,

      sessions: {
        items:
          sessions,

        loaded:
          sessionsLoaded,

        loading:
          sessionsLoading,

        error:
          sessionsError,

        count:
          sessions.length,
      },

      capabilities:
        capabilities(),

      selfUpdateSupported:
        CUENTA_SELF_UPDATE_SUPPORTED,

      authRefreshRequired,
      deactivated,

      view: {
        capabilities:
          capabilities(),

        selfUpdateSupported:
          CUENTA_SELF_UPDATE_SUPPORTED,

        successMessage:
          extra.successMessage ??
          lastSuccess,

        /*
          Deliberadamente no hay form persistido.
          Passwords y archivos nunca se copian al state.
        */
        form: {},
      },

      action: {
        saving:
          extra.saving ??
          saving,

        sessionsLoading,
      },
    };
  }

  function getSnapshot() {
    const apiSnapshot =
      getCuentaApiSnapshot();

    return {
      version:
        CUENTA_VIEW_VERSION,

      apiVersion:
        CUENTA_API_VERSION,

      templateVersion:
        CUENTA_TEMPLATE_VERSION,

      mounted,
      destroyed,

      loading,
      refreshing,
      saving,

      hasHost:
        Boolean(host),

      hasItem:
        hasContent(item),

      mountedFrom,

      lastError,
      lastErrorCode,
      lastSuccess,
      lastRenderAt,

      authRefreshRequired,
      deactivated,

      sessions: {
        loaded:
          sessionsLoaded,

        loading:
          sessionsLoading,

        count:
          sessions.length,

        error:
          sessionsError,
      },

      capabilities:
        capabilities(),

      item: item
        ? {
            userId:
              item.userId
                ? "***"
                : "",

            id:
              item.id
                ? "***"
                : "",

            username:
              item.username ||
              "",

            email:
              item.email
                ? "***"
                : "",

            role:
              item.role ||
              "",

            status:
              item.status ||
              "",

            hasAvatar:
              item.hasAvatar ===
              true,
          }
        : null,

      architecture: {
        apiBoundary: true,

        directHttp: false,
        rawFetch: false,
        storage: false,

        globalProfileCache:
          false,

        canonicalModelFromApi:
          true,

        adminUsersRoute:
          false,

        selfUpdateNetwork:
          false,

        unsupportedActionsBlockedInController:
          true,

        passwordStoredInState:
          false,

        fileStoredInState:
          false,

        sessionsOnDemand:
          true,
      },

      api:
        apiSnapshot
          ? {
              version:
                apiSnapshot.version,

              capabilities:
                apiSnapshot
                  .capabilities,
            }
          : null,
    };
  }

  /* =======================================================
     RENDER
  ======================================================= */

  function setHostFlags() {
    if (!host) {
      return;
    }

    const busy =
      loading ||
      refreshing ||
      saving ||
      sessionsLoading;

    try {
      host.dataset.view =
        "cuenta";

      host.dataset.cuentaController =
        CUENTA_VIEW_VERSION;

      host.dataset.cuentaApi =
        CUENTA_API_VERSION;

      host.dataset.cuentaMounted =
        mounted
          ? "true"
          : "false";

      host.dataset.cuentaLoading =
        loading
          ? "true"
          : "false";

      host.dataset.cuentaRefreshing =
        refreshing
          ? "true"
          : "false";

      host.dataset.cuentaSaving =
        saving
          ? "true"
          : "false";

      host.dataset.cuentaSelfUpdate =
        "false";

      host.dataset.cuentaAuthRefreshRequired =
        authRefreshRequired
          ? "true"
          : "false";

      host.dataset.cuentaDeactivated =
        deactivated
          ? "true"
          : "false";

      host.setAttribute(
        "aria-busy",
        busy
          ? "true"
          : "false"
      );
    } catch {
      // noop
    }
  }

  function render(
    extra = {}
  ) {
    if (
      destroyed ||
      !host
    ) {
      return false;
    }

    setHostFlags();

    let html = "";

    try {
      html =
        renderCuentaTemplate({
          item:
            extra.item ??
            item,

          state:
            makeState(
              extra
            ),
        });
    } catch (error) {
      html =
        renderErrorState(
          safeError(
            error,
            "No se pudo renderizar la cuenta."
          )
        );
    }

    if (
      html === lastHTML ||
      (
        !lastHTML &&
        host.innerHTML === html
      )
    ) {
      lastHTML = html;
      lastRenderAt = now();

      return false;
    }

    host.innerHTML =
      html;

    lastHTML = html;
    lastRenderAt = now();

    return true;
  }

  function setFeedback({
    error = "",
    errorCode = "",
    success = "",
    paint = true,
  } = {}) {
    lastError =
      cleanText(
        error,
        ""
      );

    lastErrorCode =
      cleanText(
        errorCode,
        ""
      );

    lastSuccess =
      cleanText(
        success,
        ""
      );

    if (paint) {
      render();
    }

    return {
      error:
        lastError,

      errorCode:
        lastErrorCode,

      success:
        lastSuccess,
    };
  }

  function clearFeedback({
    paint = false,
  } = {}) {
    return setFeedback({
      error: "",
      errorCode: "",
      success: "",
      paint,
    });
  }

  function fail(
    error,
    fallback =
      "No se pudo procesar la cuenta."
  ) {
    loading = false;
    refreshing = false;
    saving = false;

    setFeedback({
      error:
        safeError(
          error,
          fallback
        ),

      errorCode:
        safeErrorCode(
          error
        ),

      success: "",
      paint: true,
    });

    return null;
  }

  function commit(
    nextItem = null
  ) {
    if (
      !nextItem
    ) {
      return item;
    }

    const next =
      canonicalItem(
        nextItem,
        item ||
        {}
      );

    if (
      hasContent(next)
    ) {
      item = next;
    }

    return item;
  }

  /* =======================================================
     LOAD
  ======================================================= */

  async function load(
    options = {}
  ) {
    if (destroyed) {
      return null;
    }

    const force =
      options.force ===
        true ||
      options.forceRefresh ===
        true;

    const silent =
      options.silent ===
      true;

    if (
      loadPromise &&
      !force
    ) {
      return loadPromise;
    }

    const seq =
      ++loadSeq;

    const hadItem =
      hasContent(item);

    clearFeedback({
      paint: false,
    });

    if (!silent) {
      loading =
        !hadItem;

      refreshing =
        hadItem;

      render();
    }

    let task = null;

    task = (async () => {
      try {
        const result =
          await loadCuentaApi({
            force,
          });

        if (
          destroyed ||
          seq !== loadSeq
        ) {
          return result ||
            null;
        }

        const before =
          signature(item);

        commit(result);

        loading = false;
        refreshing = false;

        const changed =
          before !==
          signature(item);

        if (
          !silent ||
          changed ||
          !hadItem
        ) {
          render();
        }

        emitCuentaEvent(
          force
            ? "cuenta:refreshed"
            : "cuenta:loaded",

          {
            source:
              CUENTA_INDEX_SOURCE,

            userId:
              item?.userId ||
              "",

            force,
          }
        );

        return item;
      } catch (error) {
        if (
          destroyed ||
          seq !== loadSeq
        ) {
          return null;
        }

        loading = false;
        refreshing = false;

        lastError =
          safeError(
            error,
            "No se pudo cargar la cuenta."
          );

        lastErrorCode =
          safeErrorCode(
            error
          );

        lastSuccess = "";

        if (
          !silent ||
          !hasContent(item)
        ) {
          render();
        }

        return null;
      } finally {
        if (
          loadPromise ===
          task
        ) {
          loadPromise =
            null;
        }
      }
    })();

    if (!force) {
      loadPromise = task;
    }

    return task;
  }

  async function refresh() {
    return load({
      force: true,
      silent: false,
    });
  }

  /* =======================================================
     UNSUPPORTED SELF UPDATES
  ======================================================= */

  function rejectSelfUpdate(
    capability =
      "profile"
  ) {
    const label = {
      profile:
        "perfil",

      theme:
        "apariencia",

      language:
        "idioma",

      privacy:
        "privacidad",
    }[capability] ||
    "cuenta";

    setFeedback({
      error:
        `${UNSUPPORTED_SELF_UPDATE_MESSAGE} No se ha enviado ningún cambio de ${label}.`,

      errorCode:
        "CUENTA_SELF_UPDATE_NOT_SUPPORTED",

      success: "",
      paint: true,
    });

    emitCuentaEvent(
      "cuenta:update:unsupported",
      {
        source:
          CUENTA_INDEX_SOURCE,

        capability:
          label,

        code:
          "CUENTA_SELF_UPDATE_NOT_SUPPORTED",
      }
    );

    return false;
  }

  function saveCuenta() {
    return rejectSelfUpdate(
      "profile"
    );
  }

  function updateTheme() {
    return rejectSelfUpdate(
      "theme"
    );
  }

  function updateLanguage() {
    return rejectSelfUpdate(
      "language"
    );
  }

  function updatePrivacy() {
    return rejectSelfUpdate(
      "privacy"
    );
  }

  /* =======================================================
     PASSWORD
  ======================================================= */

  function readPasswordPayload() {
    return {
      currentPassword:
        String(
          readField(
            host,
            "currentPassword"
          ) ??
          ""
        ),

      newPassword:
        String(
          readField(
            host,
            "newPassword"
          ) ??
          ""
        ),

      confirmPassword:
        String(
          readField(
            host,
            "confirmPassword"
          ) ??
          ""
        ),
    };
  }

  async function changePassword(
    explicitPayload = null
  ) {
    if (
      destroyed ||
      saving
    ) {
      return false;
    }

    const payload =
      isObject(
        explicitPayload
      )
        ? {
            currentPassword:
              String(
                explicitPayload
                  .currentPassword ??
                ""
              ),

            newPassword:
              String(
                explicitPayload
                  .newPassword ??
                ""
              ),

            confirmPassword:
              String(
                explicitPayload
                  .confirmPassword ??
                ""
              ),
          }
        : readPasswordPayload();

    const validation =
      validateCuentaPasswordPayload(
        payload
      );

    if (!validation.ok) {
      clearSensitiveInputs(
        host
      );

      setFeedback({
        error:
          validation.message ||
          "Contraseña inválida.",

        errorCode:
          validation.code ||
          "INVALID_PASSWORD",

        success: "",
        paint: true,
      });

      return false;
    }

    const seq =
      ++actionSeq;

    saving = true;

    clearFeedback({
      paint: false,
    });

    /*
      El password vive únicamente en `payload`.
      No se copia a state ni al payload de render.
    */
    render();

    try {
      const result =
        await changePasswordApi(
          payload,
          {
            source:
              `${CUENTA_INDEX_SOURCE}.password`,
          }
        );

      if (
        destroyed ||
        seq !== actionSeq
      ) {
        return false;
      }

      const nextItem =
        resultItem(
          result,
          item ||
          {}
        );

      if (
        hasContent(
          nextItem
        )
      ) {
        commit(
          nextItem
        );
      }

      authRefreshRequired =
        result
          ?.authRefreshRequired ===
        true;

      saving = false;

      clearSensitiveInputs(
        host
      );

      setFeedback({
        error: "",
        errorCode: "",

        success:
          authRefreshRequired
            ? "Contraseña actualizada. La sesión debe renovarse para seguir operando con la nueva credencial."
            : "Contraseña actualizada correctamente.",

        paint: true,
      });

      emitCuentaEvent(
        "cuenta:password:changed",
        {
          source:
            CUENTA_INDEX_SOURCE,

          authRefreshRequired,
        }
      );

      if (
        authRefreshRequired
      ) {
        emitCuentaEvent(
          "cuenta:auth-refresh-required",
          {
            source:
              CUENTA_INDEX_SOURCE,

            reason:
              "password_changed",
          }
        );
      }

      return true;
    } catch (error) {
      if (
        destroyed ||
        seq !== actionSeq
      ) {
        return false;
      }

      clearSensitiveInputs(
        host
      );

      return Boolean(
        fail(
          error,
          "No se pudo cambiar la contraseña."
        )
      );
    } finally {
      /*
        Defense-in-depth:
        el objeto efímero deja de ser referenciado al salir.
        Nunca entra en getSnapshot().
      */
    }
  }

  /* =======================================================
     AVATAR
  ======================================================= */

  async function uploadAvatar(
    input = null
  ) {
    if (
      destroyed ||
      saving
    ) {
      return null;
    }

    const file =
      resolveAvatarFile(
        host,
        input
      );

    const validation =
      validateCuentaAvatarFile(
        file
      );

    if (!validation.ok) {
      setFeedback({
        error:
          validation.message ||
          "Avatar inválido.",

        errorCode:
          validation.code ||
          "INVALID_AVATAR",

        success: "",
        paint: true,
      });

      return null;
    }

    const seq =
      ++actionSeq;

    saving = true;

    clearFeedback({
      paint: false,
    });

    render();

    try {
      const result =
        await uploadCuentaAvatarApi(
          file,
          {
            source:
              `${CUENTA_INDEX_SOURCE}.avatar.upload`,
          }
        );

      if (
        destroyed ||
        seq !== actionSeq
      ) {
        return null;
      }

      commit(result);

      saving = false;

      setFeedback({
        error: "",
        errorCode: "",

        success:
          "Avatar actualizado correctamente.",

        paint: true,
      });

      emitCuentaEvent(
        "cuenta:avatar:updated",
        {
          source:
            CUENTA_INDEX_SOURCE,

          hasAvatar:
            item?.hasAvatar ===
            true,
        }
      );

      return item;
    } catch (error) {
      if (
        destroyed ||
        seq !== actionSeq
      ) {
        return null;
      }

      return fail(
        error,
        "No se pudo subir el avatar."
      );
    }
  }

  async function deleteAvatar() {
    if (
      destroyed ||
      saving
    ) {
      return null;
    }

    const seq =
      ++actionSeq;

    saving = true;

    clearFeedback({
      paint: false,
    });

    render();

    try {
      const result =
        await deleteCuentaAvatarApi({
          source:
            `${CUENTA_INDEX_SOURCE}.avatar.delete`,
        });

      if (
        destroyed ||
        seq !== actionSeq
      ) {
        return null;
      }

      commit(result);

      saving = false;

      setFeedback({
        error: "",
        errorCode: "",

        success:
          "Avatar eliminado correctamente.",

        paint: true,
      });

      emitCuentaEvent(
        "cuenta:avatar:deleted",
        {
          source:
            CUENTA_INDEX_SOURCE,

          hasAvatar: false,
        }
      );

      return item;
    } catch (error) {
      if (
        destroyed ||
        seq !== actionSeq
      ) {
        return null;
      }

      return fail(
        error,
        "No se pudo eliminar el avatar."
      );
    }
  }

  /* =======================================================
     SESSIONS
  ======================================================= */

  async function loadSessions({
    force = false,
  } = {}) {
    if (
      destroyed ||
      sessionsLoading
    ) {
      return sessions;
    }

    if (
      sessionsLoaded &&
      !force
    ) {
      return sessions;
    }

    sessionsLoading = true;
    sessionsError = "";

    render();

    try {
      const result =
        await loadCuentaSessionsApi({
          source:
            `${CUENTA_INDEX_SOURCE}.sessions`,
        });

      if (destroyed) {
        return [];
      }

      sessions =
        safeArray(
          result?.sessions
        );

      sessionsLoaded = true;
      sessionsLoading = false;

      render();

      emitCuentaEvent(
        "cuenta:sessions:loaded",
        {
          source:
            CUENTA_INDEX_SOURCE,

          count:
            sessions.length,
        }
      );

      return sessions;
    } catch (error) {
      if (destroyed) {
        return [];
      }

      sessionsLoading = false;

      sessionsError =
        safeError(
          error,
          "No se pudieron cargar las sesiones."
        );

      render();

      return [];
    }
  }

  /* =======================================================
     DEACTIVATE SELF
  ======================================================= */

  function readDeactivatePassword() {
    return String(
      first(
        readField(
          host,
          "deactivatePassword"
        ),

        readField(
          host,
          "password"
        ),

        ""
      ) ??
      ""
    );
  }

  async function deactivateAccount(
    explicitPayload = null
  ) {
    if (
      destroyed ||
      saving
    ) {
      return false;
    }

    const password =
      isObject(
        explicitPayload
      )
        ? String(
            explicitPayload
              .password ??
            ""
          )
        : readDeactivatePassword();

    if (!password.trim()) {
      clearSensitiveInputs(
        host
      );

      setFeedback({
        error:
          "Introduce tu contraseña para confirmar la desactivación.",

        errorCode:
          "PASSWORD_REQUIRED",

        success: "",
        paint: true,
      });

      return false;
    }

    const seq =
      ++actionSeq;

    saving = true;

    clearFeedback({
      paint: false,
    });

    render();

    try {
      const result =
        await deactivateCuentaApi(
          {
            password,
          },
          {
            source:
              `${CUENTA_INDEX_SOURCE}.deactivate`,
          }
        );

      if (
        destroyed ||
        seq !== actionSeq
      ) {
        return false;
      }

      const nextItem =
        resultItem(
          result,
          {
            ...safeObject(
              item
            ),

            active: false,
            enabled: false,
            disabled: true,
            status: "disabled",
          }
        );

      if (
        hasContent(
          nextItem
        )
      ) {
        commit(
          nextItem
        );
      }

      deactivated =
        result?.deactivated ===
        true;

      authRefreshRequired =
        result?.loggedOut ===
          true ||
        deactivated;

      saving = false;

      clearSensitiveInputs(
        host
      );

      setFeedback({
        error: "",
        errorCode: "",

        success:
          result?.alreadyDisabled
            ? "La cuenta ya estaba desactivada."
            : "Cuenta desactivada correctamente.",

        paint: true,
      });

      emitCuentaEvent(
        "cuenta:deactivated",
        {
          source:
            CUENTA_INDEX_SOURCE,

          deactivated,

          alreadyDisabled:
            result
              ?.alreadyDisabled ===
            true,

          loggedOut:
            result?.loggedOut ===
            true,
        }
      );

      emitCuentaEvent(
        "cuenta:auth-refresh-required",
        {
          source:
            CUENTA_INDEX_SOURCE,

          reason:
            "account_deactivated",
        }
      );

      return true;
    } catch (error) {
      if (
        destroyed ||
        seq !== actionSeq
      ) {
        return false;
      }

      clearSensitiveInputs(
        host
      );

      fail(
        error,
        "No se pudo desactivar la cuenta."
      );

      return false;
    }
  }

  /* =======================================================
     ACTION ROUTER
  ======================================================= */

  async function handleAction(
    action = "",
    node = null
  ) {
    const type =
      cleanText(
        action,
        ""
      );

    if (!type) {
      return false;
    }

    if (
      REFRESH_ACTIONS.has(
        type
      )
    ) {
      return Boolean(
        await refresh()
      );
    }

    if (
      UNSUPPORTED_SAVE_ACTIONS.has(
        type
      )
    ) {
      return saveCuenta();
    }

    if (
      UNSUPPORTED_THEME_ACTIONS.has(
        type
      )
    ) {
      return updateTheme();
    }

    if (
      UNSUPPORTED_LANGUAGE_ACTIONS.has(
        type
      )
    ) {
      return updateLanguage();
    }

    if (
      UNSUPPORTED_PRIVACY_ACTIONS.has(
        type
      )
    ) {
      return updatePrivacy();
    }

    if (
      PASSWORD_ACTIONS.has(
        type
      )
    ) {
      return Boolean(
        await changePassword()
      );
    }

    if (
      UPLOAD_AVATAR_ACTIONS.has(
        type
      )
    ) {
      return Boolean(
        await uploadAvatar(
          node
        )
      );
    }

    if (
      DELETE_AVATAR_ACTIONS.has(
        type
      )
    ) {
      return Boolean(
        await deleteAvatar()
      );
    }

    if (
      LOAD_SESSIONS_ACTIONS.has(
        type
      )
    ) {
      await loadSessions({
        force:
          type ===
          "refresh-sessions",
      });

      return true;
    }

    if (
      DEACTIVATE_ACTIONS.has(
        type
      )
    ) {
      return Boolean(
        await deactivateAccount()
      );
    }

    return false;
  }

  /* =======================================================
     DOM EVENTS
  ======================================================= */

  function onClick(event) {
    if (destroyed) {
      return;
    }

    const node =
      closestFrom(
        event.target,
        ACTION_SELECTOR
      );

    if (
      !node ||
      !host?.contains?.(
        node
      )
    ) {
      return;
    }

    if (
      node.disabled ||
      node.getAttribute?.(
        "aria-disabled"
      ) === "true"
    ) {
      return;
    }

    const action =
      getActionName(
        node
      );

    if (!action) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();

    try {
      event[
        ROUTER_EVENT_HANDLED_KEY
      ] = true;
    } catch {
      // noop
    }

    void handleAction(
      action,
      node
    );
  }

  function onSubmit(event) {
    const formNode =
      event.target
        ?.closest?.("form");

    if (
      !formNode ||
      !host?.contains?.(
        formNode
      )
    ) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();

    try {
      event[
        ROUTER_EVENT_HANDLED_KEY
      ] = true;
    } catch {
      // noop
    }

    /*
      No asumimos que "submit" = guardar perfil.
      Si el form declara una acción, se respeta.
      Sin acción, guardar perfil sigue no soportado.
    */
    const action =
      cleanText(
        first(
          formNode.dataset
            ?.cuentaAction,
          formNode.dataset
            ?.action,
          ""
        ),
        ""
      );

    if (action) {
      void handleAction(
        action,
        formNode
      );

      return;
    }

    saveCuenta();
  }

  function bind() {
    if (
      bound ||
      !host
    ) {
      return false;
    }

    host.addEventListener(
      "click",
      onClick
    );

    host.addEventListener(
      "submit",
      onSubmit
    );

    bound = true;

    return true;
  }

  function unbind() {
    if (
      !bound ||
      !host
    ) {
      return false;
    }

    host.removeEventListener(
      "click",
      onClick
    );

    host.removeEventListener(
      "submit",
      onSubmit
    );

    bound = false;

    return true;
  }

  /* =======================================================
     MOUNT / DESTROY
  ======================================================= */

  function getInitialItem(
    options = {}
  ) {
    const contextItem =
      first(
        options.item,
        options.cuenta,
        localContext.item,
        localContext.cuenta,
        null
      );

    if (
      hasContent(
        contextItem
      )
    ) {
      const normalized =
        canonicalItem(
          contextItem,
          {}
        );

      if (
        hasContent(
          normalized
        )
      ) {
        mountedFrom =
          "context";

        return normalized;
      }
    }

    try {
      const hydrated =
        hydrateCuentaFromCache();

      if (
        hasContent(
          hydrated
        )
      ) {
        mountedFrom =
          "auth-core";

        return hydrated;
      }
    } catch {
      // load real debajo
    }

    mountedFrom =
      "empty";

    return null;
  }

  function shouldLoadOnMount(
    options = {}
  ) {
    if (
      options.force === true ||
      options.forceRefresh ===
        true ||
      options.refreshOnMount ===
        true
    ) {
      return true;
    }

    /*
      Incluso con Auth hidratado hacemos /api/auth/me
      en background para obtener el contrato completo.
    */
    return true;
  }

  function mount(
    options = {}
  ) {
    if (
      destroyed ||
      !host
    ) {
      return controller;
    }

    if (mounted) {
      return controller;
    }

    mounted = true;
    bind();

    item =
      getInitialItem(
        safeObject(options)
      );

    loading =
      !hasContent(item);

    refreshing = false;
    saving = false;

    sessions = [];
    sessionsLoaded = false;
    sessionsLoading = false;
    sessionsError = "";

    authRefreshRequired = false;
    deactivated = false;

    clearFeedback({
      paint: false,
    });

    render();

    if (
      shouldLoadOnMount(
        options
      )
    ) {
      const force =
        options.force === true ||
        options.forceRefresh ===
          true;

      const silent =
        hasContent(item) &&
        !force;

      void load({
        force,
        silent,
      });
    }

    return controller;
  }

  function resetPresentation() {
    item = null;

    loading = false;
    refreshing = false;
    saving = false;

    sessions = [];
    sessionsLoaded = false;
    sessionsLoading = false;
    sessionsError = "";

    authRefreshRequired = false;
    deactivated = false;

    clearFeedback({
      paint: false,
    });

    lastHTML = "";

    if (
      mounted &&
      !destroyed
    ) {
      render();
    }

    return true;
  }

  function destroy({
    keepDom = false,
  } = {}) {
    if (destroyed) {
      return true;
    }

    destroyed = true;
    mounted = false;

    loading = false;
    refreshing = false;
    saving = false;

    sessionsLoading = false;

    loadSeq += 1;
    actionSeq += 1;

    loadPromise = null;

    clearSensitiveInputs(
      host
    );

    unbind();

    if (!keepDom) {
      clearHost(
        host
      );

      lastHTML = "";
    }

    if (
      host &&
      INSTANCES.get(
        host
      ) === controller
    ) {
      INSTANCES.delete(
        host
      );
    }

    if (
      lastInstance ===
      controller
    ) {
      lastInstance = null;
    }

    return true;
  }

  const controller = {
    version:
      CUENTA_VIEW_VERSION,

    apiVersion:
      CUENTA_API_VERSION,

    templateVersion:
      CUENTA_TEMPLATE_VERSION,

    mount,

    destroy,
    unmount:
      destroy,
    cleanup:
      destroy,
    dispose:
      destroy,

    load,
    refresh,
    reload:
      refresh,

    saveCuenta,
    save:
      saveCuenta,
    saveProfile:
      saveCuenta,
    savePerfil:
      saveCuenta,
    updateProfile:
      saveCuenta,
    updatePerfil:
      saveCuenta,
    updateCuenta:
      saveCuenta,

    updateTheme,
    updateCuentaTheme:
      updateTheme,
    setTheme:
      updateTheme,
    setCuentaTheme:
      updateTheme,

    updateLanguage,
    updateCuentaLanguage:
      updateLanguage,
    setLanguage:
      updateLanguage,
    setCuentaLanguage:
      updateLanguage,

    updatePrivacy,
    updateCuentaPrivacy:
      updatePrivacy,
    setPrivacy:
      updatePrivacy,
    setCuentaPrivacy:
      updatePrivacy,

    changePassword,
    updatePassword:
      changePassword,
    savePassword:
      changePassword,

    uploadAvatar,
    uploadCuentaAvatar:
      uploadAvatar,

    deleteAvatar,
    deleteCuentaAvatar:
      deleteAvatar,

    loadSessions,
    loadCuentaSessions:
      loadSessions,
    refreshSessions() {
      return loadSessions({
        force: true,
      });
    },

    deactivateAccount,
    deactivateCuenta:
      deactivateAccount,

    clearFeedback,

    resetPresentation,

    getItem() {
      return item;
    },

    getCuenta() {
      return item;
    },

    getSessions() {
      return [
        ...sessions,
      ];
    },

    getState:
      getSnapshot,

    getSnapshot,

    getDebugSnapshot:
      getSnapshot,
  };

  return controller;
}

/* =========================================================
   VIEW ENTRY
========================================================= */

export function CuentaView(
  host = null,
  context = {}
) {
  if (
    !isDomNode(host)
  ) {
    return null;
  }

  destroyPrevious(
    host
  );

  const controller =
    createCuentaController(
      host,
      safeObject(
        context
      )
    );

  INSTANCES.set(
    host,
    controller
  );

  lastInstance =
    controller;

  return controller.mount(
    safeObject(
      context
    )
  );
}

export const CuentaIndex =
  CuentaView;

export const View =
  CuentaView;

export const view =
  CuentaView;

export const component =
  CuentaView;

export const page =
  CuentaView;

export const mount =
  CuentaView;

export const init =
  CuentaView;

export const bootstrap =
  CuentaView;

export const render =
  CuentaView;

/* =========================================================
   GLOBAL INSTANCE WRAPPERS
========================================================= */

export function destroy() {
  try {
    return Boolean(
      lastInstance
        ?.destroy?.()
    );
  } catch {
    return false;
  }
}

export const unmount =
  destroy;

export const cleanup =
  destroy;

export const dispose =
  destroy;

export function refresh() {
  try {
    return (
      lastInstance
        ?.refresh?.() ||
      null
    );
  } catch {
    return null;
  }
}

export const reload =
  refresh;

export const loadCuenta =
  refresh;

export const refreshCuenta =
  refresh;

/*
  Compatibilidad:
  estos wrappers YA NO ejecutan ningún update self.
*/
export function saveCuenta() {
  try {
    return (
      lastInstance
        ?.saveCuenta?.() ??
      false
    );
  } catch {
    return false;
  }
}

export const save =
  saveCuenta;

export const saveProfile =
  saveCuenta;

export const savePerfil =
  saveCuenta;

export const updateProfile =
  saveCuenta;

export const updatePerfil =
  saveCuenta;

export const updateCuenta =
  saveCuenta;

export function updateTheme() {
  try {
    return (
      lastInstance
        ?.updateTheme?.() ??
      false
    );
  } catch {
    return false;
  }
}

export const updateCuentaTheme =
  updateTheme;

export const setTheme =
  updateTheme;

export const setCuentaTheme =
  updateTheme;

export function updateLanguage() {
  try {
    return (
      lastInstance
        ?.updateLanguage?.() ??
      false
    );
  } catch {
    return false;
  }
}

export const updateCuentaLanguage =
  updateLanguage;

export const setLanguage =
  updateLanguage;

export const setCuentaLanguage =
  updateLanguage;

export function updatePrivacy() {
  try {
    return (
      lastInstance
        ?.updatePrivacy?.() ??
      false
    );
  } catch {
    return false;
  }
}

export const updateCuentaPrivacy =
  updatePrivacy;

export const setPrivacy =
  updatePrivacy;

export const setCuentaPrivacy =
  updatePrivacy;

export function changePassword(
  payload = null
) {
  try {
    return (
      lastInstance
        ?.changePassword?.(
          payload
        ) ||
      null
    );
  } catch {
    return null;
  }
}

export const updatePassword =
  changePassword;

export const savePassword =
  changePassword;

export function uploadAvatar(
  input = null
) {
  try {
    return (
      lastInstance
        ?.uploadAvatar?.(
          input
        ) ||
      null
    );
  } catch {
    return null;
  }
}

export const uploadCuentaAvatar =
  uploadAvatar;

export function deleteAvatar() {
  try {
    return (
      lastInstance
        ?.deleteAvatar?.() ||
      null
    );
  } catch {
    return null;
  }
}

export const deleteCuentaAvatar =
  deleteAvatar;

export function loadSessions(
  options = {}
) {
  try {
    return (
      lastInstance
        ?.loadSessions?.(
          options
        ) ||
      null
    );
  } catch {
    return null;
  }
}

export const loadCuentaSessions =
  loadSessions;

export function refreshSessions() {
  return loadSessions({
    force: true,
  });
}

export function deactivateAccount(
  payload = null
) {
  try {
    return (
      lastInstance
        ?.deactivateAccount?.(
          payload
        ) ||
      null
    );
  } catch {
    return null;
  }
}

export const deactivateCuenta =
  deactivateAccount;

export function getItem() {
  try {
    return (
      lastInstance
        ?.getItem?.() ||
      null
    );
  } catch {
    return null;
  }
}

export const getCuenta =
  getItem;

export function getSessions() {
  try {
    return (
      lastInstance
        ?.getSessions?.() ||
      []
    );
  } catch {
    return [];
  }
}

/*
  Ya no hay "cache" de perfil en el index.
  Se conserva el nombre para logout/remounts antiguos.
*/
export function clearCuentaViewCache() {
  try {
    lastInstance
      ?.resetPresentation?.();

    return true;
  } catch {
    return false;
  }
}

export function getSnapshot() {
  if (
    lastInstance
      ?.getSnapshot
  ) {
    return lastInstance
      .getSnapshot();
  }

  const api =
    getCuentaApiSnapshot();

  return {
    version:
      CUENTA_VIEW_VERSION,

    apiVersion:
      CUENTA_API_VERSION,

    templateVersion:
      CUENTA_TEMPLATE_VERSION,

    mounted: false,
    destroyed: false,

    loading: false,
    refreshing: false,
    saving: false,

    hasHost: false,
    hasItem: false,

    mountedFrom:
      "none",

    lastError: "",
    lastErrorCode: "",
    lastSuccess: "",
    lastRenderAt: 0,

    authRefreshRequired:
      false,

    deactivated:
      false,

    sessions: {
      loaded: false,
      loading: false,
      count: 0,
      error: "",
    },

    capabilities: {
      readSelf: true,

      updateSelfProfile:
        false,

      updateSelfTheme:
        false,

      updateSelfPrivacy:
        false,

      updateSelfLanguage:
        false,

      changePassword:
        true,

      avatarUpload:
        true,

      avatarDelete:
        true,

      sessionsRead:
        true,

      deactivateSelf:
        true,
    },

    item: null,

    architecture: {
      apiBoundary: true,

      directHttp: false,
      rawFetch: false,
      storage: false,

      globalProfileCache:
        false,

      canonicalModelFromApi:
        true,

      adminUsersRoute:
        false,

      selfUpdateNetwork:
        false,

      unsupportedActionsBlockedInController:
        true,

      passwordStoredInState:
        false,

      fileStoredInState:
        false,

      sessionsOnDemand:
        true,
    },

    api:
      api
        ? {
            version:
              api.version,

            capabilities:
              api.capabilities,
          }
        : null,
  };
}

export const getDebugSnapshot =
  getSnapshot;

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default CuentaView;
