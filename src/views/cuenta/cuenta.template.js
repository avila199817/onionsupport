/* =========================================================
   Onion Support - Cuenta Template
   Archivo: /src/views/cuenta/cuenta.template.js

   PRODUCTIVO · SELF ACCOUNT CONTRACT · PURE TEMPLATE · V2

   Autoridades:
   - cuenta.api.js = contrato backend + modelo canónico
   - index.js      = estado UI + acciones
   - este archivo  = HTML puro

   Capacidades reales visibles:
   - leer identidad / preferencias
   - refrescar cuenta
   - subir / eliminar avatar
   - cambiar contraseña
   - consultar sesiones bajo demanda
   - desactivar cuenta propia

   Solo lectura con backend actual:
   - nombre
   - teléfono
   - darkMode / theme
   - privacyMode
   - lang

   Reglas:
   - Sin imports.
   - Sin HTTP / fetch.
   - Sin Store / Router / listeners.
   - Sin CSS inline.
   - Sin lectura de payload backend raw.
   - Sin controles que prometan self-update inexistente.
   - Nunca renderiza sessionId.
========================================================= */

/* =========================================================
   META
========================================================= */

export const CUENTA_TEMPLATE_VERSION =
  "cuenta.template.backend-contract.v2.self-account";

export const CUENTA_TEMPLATE_CAPABILITIES =
  Object.freeze({
    readSelf: true,

    updateSelfProfile: false,
    updateSelfTheme: false,
    updateSelfPrivacy: false,
    updateSelfLanguage: false,

    changePassword: true,
    avatarUpload: true,
    avatarDelete: true,
    sessionsRead: true,
    deactivateSelf: true,
  });

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
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

function safeText(
  value = "",
  fallback = "—"
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return text || fallback;
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

function escapeHtml(
  value = ""
) {
  return String(
    value ??
    ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(
  value = ""
) {
  return escapeHtml(value);
}

function normalizeKey(
  value = ""
) {
  return safeText(
    value,
    ""
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[\s-]+/g,
      "_"
    )
    .replace(
      /[^\w]+/g,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    );
}

function safeBoolean(
  value,
  fallback = false
) {
  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    return value !== 0;
  }

  const key =
    normalizeKey(value);

  if (
    [
      "true",
      "1",
      "yes",
      "si",
      "on",
      "enabled",
      "active",
      "dark",
    ].includes(key)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
      "disabled",
      "inactive",
      "light",
    ].includes(key)
  ) {
    return false;
  }

  return Boolean(
    fallback
  );
}

function joinClasses(
  ...values
) {
  return values
    .flatMap(
      (value) => {
        if (!value) {
          return [];
        }

        if (
          Array.isArray(value)
        ) {
          return value;
        }

        return String(
          value
        ).split(
          /\s+/g
        );
      }
    )
    .map(
      (value) =>
        safeText(
          value,
          ""
        )
    )
    .filter(Boolean)
    .join(" ");
}

function boolAttr(
  condition,
  attr = ""
) {
  return condition
    ? attr
    : "";
}

function truncate(
  value = "",
  max = 120
) {
  const text =
    safeText(
      value,
      ""
    );

  const limit =
    Number.isFinite(
      Number(max)
    )
      ? Number(max)
      : 120;

  if (!text) {
    return "";
  }

  if (
    text.length <= limit
  ) {
    return text;
  }

  return `${
    text
      .slice(
        0,
        limit
      )
      .trim()
  }…`;
}

/* =========================================================
   DATE
========================================================= */

function toDate(
  value = null
) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function formatDate(
  value = null
) {
  const date =
    toDate(value);

  if (!date) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

function formatDateOnly(
  value = null
) {
  const date =
    toDate(value);

  if (!date) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(
  value = null
) {
  const date =
    toDate(value);

  if (!date) {
    return "Sin fecha";
  }

  const diffMs =
    date.getTime() -
    Date.now();

  const diffMinutes =
    Math.round(
      diffMs / 60_000
    );

  const absoluteMinutes =
    Math.abs(
      diffMinutes
    );

  if (
    absoluteMinutes < 1
  ) {
    return "Ahora mismo";
  }

  if (
    absoluteMinutes < 60
  ) {
    return diffMinutes > 0
      ? `En ${absoluteMinutes} min`
      : `Hace ${absoluteMinutes} min`;
  }

  const hours =
    Math.round(
      absoluteMinutes / 60
    );

  if (hours < 24) {
    return diffMinutes > 0
      ? `En ${hours} h`
      : `Hace ${hours} h`;
  }

  const days =
    Math.round(
      hours / 24
    );

  if (days <= 7) {
    return diffMinutes > 0
      ? `En ${days} día${days === 1 ? "" : "s"}`
      : `Hace ${days} día${days === 1 ? "" : "s"}`;
  }

  return formatDate(
    date
  );
}

/* =========================================================
   MODEL
========================================================= */

function resolveCuentaItem(
  item = null
) {
  return isObject(item)
    ? item
    : null;
}

function resolveLocalState(
  state = {}
) {
  const source =
    safeObject(state);

  const sessions =
    safeObject(
      source.sessions
    );

  const capabilities = {
    ...CUENTA_TEMPLATE_CAPABILITIES,
    ...safeObject(
      source.capabilities
    ),
    ...safeObject(
      source.view
        ?.capabilities
    ),
  };

  return {
    loading:
      Boolean(
        source.loading
      ),

    refreshing:
      Boolean(
        source.refreshing
      ),

    saving:
      Boolean(
        source.saving
      ),

    error:
      safeText(
        source.error,
        ""
      ),

    errorCode:
      safeText(
        source.errorCode,
        ""
      ),

    authRefreshRequired:
      source
        .authRefreshRequired ===
      true,

    deactivated:
      source.deactivated ===
      true,

    selfUpdateSupported:
      source
        .selfUpdateSupported ===
      true,

    capabilities,

    sessions: {
      items:
        safeArray(
          sessions.items
        ),

      loaded:
        sessions.loaded ===
        true,

      loading:
        sessions.loading ===
        true,

      error:
        safeText(
          sessions.error,
          ""
        ),

      count:
        Number.isFinite(
          Number(
            sessions.count
          )
        )
          ? Number(
              sessions.count
            )
          : safeArray(
              sessions.items
            ).length,
    },

    view: {
      ...safeObject(
        source.view
      ),

      /*
        El index v5 manda form={} deliberadamente.
        El template no depende de formulario persistido.
      */
      form: {},
    },

    action: {
      ...safeObject(
        source.action
      ),
    },
  };
}

function getDisplayName(
  detail = {}
) {
  return safeText(
    first(
      detail.name,
      detail.displayName,
      detail.fullName,
      detail.nombre,
      detail.username,
      detail.email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );
}

function getEmail(
  detail = {}
) {
  return safeText(
    first(
      detail.email,
      detail.emailLower,
      ""
    ),
    "Sin email"
  );
}

function getUsername(
  detail = {}
) {
  return safeText(
    first(
      detail.username,
      detail.usernameLower,
      detail.slug,
      ""
    ),
    "sin-usuario"
  );
}

function getUserId(
  detail = {}
) {
  return safeText(
    first(
      detail.userId,
      detail.id,
      detail.uid,
      ""
    ),
    "—"
  );
}

function getClienteId(
  detail = {}
) {
  return safeText(
    first(
      detail.clienteId,
      detail.clientId,
      detail.customerId,
      detail.cliente
        ?.clienteId,
      detail.cliente?.id,
      ""
    ),
    "—"
  );
}

function getRoleValue(
  detail = {}
) {
  return normalizeKey(
    first(
      detail.role,
      detail.rol,
      safeArray(
        detail.roles
      )[0],
      "user"
    )
  );
}

function getRole(
  detail = {}
) {
  return (
    getRoleValue(
      detail
    ) === "admin"
      ? "Administrador"
      : "Usuario"
  );
}

function getPhone(
  detail = {}
) {
  return safeText(
    first(
      detail.phone,
      detail.telefono,
      ""
    ),
    "No configurado"
  );
}

function getThemeValue(
  detail = {}
) {
  const darkMode =
    safeBoolean(
      detail.darkMode,
      false
    );

  const theme =
    normalizeKey(
      first(
        detail.theme,
        detail.mode,
        detail.appearance,
        darkMode
          ? "dark"
          : "light"
      )
    );

  return theme === "dark"
    ? "dark"
    : "light";
}

function getThemeLabel(
  detail = {}
) {
  return (
    getThemeValue(
      detail
    ) === "dark"
      ? "Dark mode"
      : "Light mode"
  );
}

function getLangValue(
  detail = {}
) {
  const lang =
    normalizeKey(
      first(
        detail.lang,
        detail.language,
        detail.locale,
        "es"
      )
    );

  if (
    lang.startsWith("en")
  ) {
    return "en";
  }

  if (
    lang.startsWith("ca")
  ) {
    return "ca";
  }

  return "es";
}

function getLangLabel(
  detail = {}
) {
  const lang =
    getLangValue(
      detail
    );

  if (lang === "en") {
    return "English";
  }

  if (lang === "ca") {
    return "Català";
  }

  return "Español";
}

function getPrivacyMode(
  detail = {}
) {
  return safeBoolean(
    detail.privacyMode,
    false
  );
}

function getPrivacyLabel(
  detail = {}
) {
  return getPrivacyMode(
    detail
  )
    ? "Activa"
    : "Estándar";
}

function getAccountStatus(
  detail = {}
) {
  const status =
    normalizeKey(
      first(
        detail.status,
        detail.estado,
        detail.active ===
          false
          ? "disabled"
          : "active"
      )
    );

  if (
    [
      "active",
      "enabled",
    ].includes(status)
  ) {
    return "Activa";
  }

  if (
    status === "pending"
  ) {
    return "Pendiente";
  }

  if (
    [
      "disabled",
      "inactive",
      "blocked",
      "suspended",
      "deleted",
      "archived",
    ].includes(status)
  ) {
    return "Desactivada";
  }

  return safeText(
    status,
    "Activa"
  );
}

function getAccountStatusTone(
  detail = {}
) {
  const status =
    normalizeKey(
      getAccountStatus(
        detail
      )
    );

  if (
    status === "activa"
  ) {
    return "success";
  }

  if (
    status === "pendiente"
  ) {
    return "warning";
  }

  if (
    status === "desactivada"
  ) {
    return "danger";
  }

  return "default";
}

function getAvatarUrl(
  detail = {}
) {
  const raw =
    safeText(
      first(
        detail.avatarUrl,
        detail.avatar,
        detail.picture,
        ""
      ),
      ""
    );

  if (!raw) {
    return "";
  }

  if (
    /^blob:/i.test(raw)
  ) {
    return raw;
  }

  if (
    raw.startsWith("/")
  ) {
    return raw;
  }

  if (
    /^https:\/\//i.test(
      raw
    )
  ) {
    return raw;
  }

  if (
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    )
  ) {
    return raw;
  }

  return "";
}

function getInitials(
  value = ""
) {
  const text =
    safeText(
      value,
      ""
    );

  if (!text) {
    return "ON";
  }

  const parts =
    text
      .split(" ")
      .filter(Boolean);

  if (
    parts.length === 1
  ) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${
    parts[0]?.[0] ||
    ""
  }${
    parts[1]?.[0] ||
    ""
  }`
    .toUpperCase() ||
    "ON";
}

function getCreatedAt(
  detail = {}
) {
  return first(
    detail.createdAt,
    null
  );
}

function getUpdatedAt(
  detail = {}
) {
  return first(
    detail.updatedAt,
    detail.preferences
      ?.updatedAt,
    null
  );
}

function getLastLoginAt(
  detail = {}
) {
  return first(
    detail.lastLoginAt,
    detail.lastSeenAt,
    null
  );
}

function getLastPasswordChangeAt(
  detail = {}
) {
  return first(
    detail
      .lastPasswordChangeAt,
    null
  );
}

/* =========================================================
   GENERIC UI
========================================================= */

function actionAttrs(
  action = ""
) {
  const value =
    safeText(
      action,
      ""
    );

  if (!value) {
    return "";
  }

  return `
    data-action="${escapeAttr(value)}"
    data-cuenta-action="${escapeAttr(value)}"
  `;
}

function renderSpinner(
  label = ""
) {
  return `
    <span
      class="cuenta-inline-loading"
      aria-hidden="${label ? "false" : "true"}"
    >
      <span
        class="cuenta-inline-spinner"
        aria-hidden="true"
      ></span>

      ${
        label
          ? `
            <span class="cuenta-inline-loading-text">
              ${escapeHtml(label)}
            </span>
          `
          : ""
      }
    </span>
  `;
}

function renderButton({
  id = "",
  action = "",
  label = "",
  variant = "",
  loading = false,
  loadingLabel =
    "Procesando...",
  disabled = false,
  extraClass = "",
} = {}) {
  const isBusy =
    Boolean(
      loading ||
      disabled
    );

  const classes =
    joinClasses(
      "cuenta-btn",

      variant
        ? `cuenta-btn--${normalizeKey(variant)}`
        : "",

      loading
        ? "is-loading"
        : "",

      extraClass
    );

  return `
    <button
      ${id ? `id="${escapeAttr(id)}"` : ""}
      type="button"
      class="${escapeAttr(classes)}"
      ${actionAttrs(action)}
      ${boolAttr(
        isBusy,
        'disabled aria-disabled="true"'
      )}
      ${boolAttr(
        loading,
        'aria-busy="true"'
      )}
    >
      ${
        loading
          ? renderSpinner(
              loadingLabel
            )
          : escapeHtml(
              label
            )
      }
    </button>
  `;
}

function renderChip(
  label = "",
  tone = "default"
) {
  const text =
    safeText(
      label,
      ""
    );

  if (!text) {
    return "";
  }

  return `
    <span
      class="cuenta-chip cuenta-chip--${escapeAttr(
        normalizeKey(
          tone
        ) ||
        "default"
      )}"
    >
      ${escapeHtml(text)}
    </span>
  `;
}

function renderMiniStat({
  label = "",
  value = "",
  tone = "default",
} = {}) {
  return `
    <div
      class="cuenta-mini-stat cuenta-mini-stat--${escapeAttr(
        normalizeKey(
          tone
        ) ||
        "default"
      )}"
    >
      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(value)}
      </strong>
    </div>
  `;
}

function renderMetaRow(
  label = "",
  value = "",
  tone = "default"
) {
  return `
    <div
      class="cuenta-meta-row cuenta-meta-row--${escapeAttr(
        normalizeKey(
          tone
        ) ||
        "default"
      )}"
    >
      <span class="cuenta-meta-label">
        ${escapeHtml(label)}
      </span>

      <strong class="cuenta-meta-value">
        ${escapeHtml(
          safeText(
            value,
            "—"
          )
        )}
      </strong>
    </div>
  `;
}

function renderReadonlyField({
  id = "",
  label = "",
  value = "",
  type = "text",
  autocomplete = "",
  wide = false,
} = {}) {
  return `
    <label
      class="${escapeAttr(
        joinClasses(
          "cuenta-field",
          wide
            ? "cuenta-field--wide"
            : ""
        )
      )}"
    >
      <span class="cuenta-field-label">
        ${escapeHtml(label)}
      </span>

      <input
        ${id ? `id="${escapeAttr(id)}"` : ""}
        type="${escapeAttr(type)}"
        value="${escapeAttr(
          safeText(
            value,
            ""
          )
        )}"
        ${autocomplete ? `autocomplete="${escapeAttr(autocomplete)}"` : ""}
        readonly
        aria-readonly="true"
        tabindex="-1"
      />
    </label>
  `;
}

function renderPasswordField({
  id = "",
  name = "",
  field = "",
  label = "",
  placeholder = "",
  autocomplete = "",
  disabled = false,
  wide = false,
} = {}) {
  const fieldName =
    safeText(
      field ||
      name,
      ""
    );

  return `
    <label
      class="${escapeAttr(
        joinClasses(
          "cuenta-field",
          wide
            ? "cuenta-field--wide"
            : ""
        )
      )}"
    >
      <span class="cuenta-field-label">
        ${escapeHtml(label)}
      </span>

      <input
        ${id ? `id="${escapeAttr(id)}"` : ""}
        ${name ? `name="${escapeAttr(name)}"` : ""}
        data-cuenta-field="${escapeAttr(fieldName)}"
        data-field="${escapeAttr(fieldName)}"
        type="password"
        value=""
        placeholder="${escapeAttr(placeholder)}"
        ${autocomplete ? `autocomplete="${escapeAttr(autocomplete)}"` : ""}
        ${boolAttr(
          disabled,
          'disabled aria-disabled="true"'
        )}
      />
    </label>
  `;
}

/* =========================================================
   AVATAR
========================================================= */

function renderAvatar(
  detail = {},
  size = "hero"
) {
  const name =
    getDisplayName(
      detail
    );

  const initials =
    getInitials(
      name
    );

  const avatarUrl =
    getAvatarUrl(
      detail
    );

  const hasImage =
    Boolean(
      avatarUrl
    );

  return `
    <div
      class="${escapeAttr(
        joinClasses(
          "cuenta-avatar",
          `cuenta-avatar--${normalizeKey(size) || "hero"}`,
          hasImage
            ? "has-image"
            : ""
        )
      )}"
      role="img"
      aria-label="${escapeAttr(name)}"
      data-has-avatar="${hasImage ? "true" : "false"}"
    >
      ${
        hasImage
          ? `
            <img
              src="${escapeAttr(avatarUrl)}"
              alt="${escapeAttr(name)}"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              data-role="cuenta-avatar-img"
            />
          `
          : ""
      }

      <span
        class="cuenta-avatar-fallback"
        aria-hidden="${hasImage ? "true" : "false"}"
      >
        ${escapeHtml(initials)}
      </span>
    </div>
  `;
}

/* =========================================================
   FEEDBACK
========================================================= */

function renderFeedback({
  state = {},
  hasDetail = false,
} = {}) {
  const localState =
    resolveLocalState(
      state
    );

  const error =
    localState.error;

  const success =
    safeText(
      localState.view
        ?.successMessage,
      ""
    );

  const authNotice =
    localState
      .authRefreshRequired ===
    true;

  const deactivated =
    localState.deactivated ===
    true;

  if (
    !hasDetail &&
    error
  ) {
    return "";
  }

  if (
    !error &&
    !success &&
    !authNotice &&
    !deactivated
  ) {
    return "";
  }

  return `
    <section
      class="cuenta-feedback"
      aria-live="polite"
    >
      ${
        error
          ? `
            <div class="cuenta-feedback-item cuenta-feedback-item--error">
              <strong>
                Error
              </strong>

              <span>
                ${escapeHtml(error)}
              </span>
            </div>
          `
          : ""
      }

      ${
        success
          ? `
            <div class="cuenta-feedback-item cuenta-feedback-item--success">
              <strong>
                Correcto
              </strong>

              <span>
                ${escapeHtml(success)}
              </span>
            </div>
          `
          : ""
      }

      ${
        authNotice &&
        !deactivated
          ? `
            <div class="cuenta-banner cuenta-banner--info">
              La credencial de sesión debe renovarse después del cambio de contraseña.
              Si la sesión actual deja de ser válida, vuelve a iniciar sesión.
            </div>
          `
          : ""
      }

      ${
        deactivated
          ? `
            <div class="cuenta-banner cuenta-banner--error">
              Esta cuenta está desactivada. La sesión actual puede cerrarse inmediatamente.
            </div>
          `
          : ""
      }
    </section>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader({
  item = null,
  state = {},
} = {}) {
  const detail =
    resolveCuentaItem(
      item
    ) ||
    {};

  const localState =
    resolveLocalState(
      state
    );

  const loading =
    localState.loading;

  const refreshing =
    localState.refreshing;

  const name =
    item
      ? getDisplayName(
          detail
        )
      : "Cuenta";

  const email =
    item
      ? getEmail(
          detail
        )
      : "Usuario autenticado";

  const username =
    item
      ? getUsername(
          detail
        )
      : "sin-usuario";

  const role =
    item
      ? getRole(
          detail
        )
      : "Usuario";

  const status =
    item
      ? getAccountStatus(
          detail
        )
      : "Activa";

  const statusTone =
    item
      ? getAccountStatusTone(
          detail
        )
      : "success";

  const updatedAt =
    item
      ? getUpdatedAt(
          detail
        )
      : null;

  const updatedText =
    updatedAt
      ? formatRelativeDate(
          updatedAt
        )
      : "Sin sincronización reciente";

  const themeLabel =
    item
      ? getThemeLabel(
          detail
        )
      : "Light mode";

  const langLabel =
    item
      ? getLangLabel(
          detail
        )
      : "Español";

  const privacyLabel =
    item
      ? getPrivacyLabel(
          detail
        )
      : "Estándar";

  return `
    <section
      class="cuenta-hero"
      data-cuenta-section="hero"
    >
      <div class="cuenta-hero-inner">
        <div class="cuenta-hero-top">
          <div class="cuenta-hero-copy">
            <span class="cuenta-eyebrow">
              Mi cuenta
            </span>

            <h1 class="cuenta-title">
              Centro de cuenta
            </h1>

            <p class="cuenta-subtitle">
              Consulta tu identidad y preferencias actuales, gestiona el avatar,
              la contraseña, las sesiones y las operaciones self-service que
              expone realmente Onion Support.
            </p>
          </div>

          <div class="cuenta-hero-actions">
            ${renderButton({
              id:
                "cuenta-hero-refresh-btn",

              action:
                "refresh-cuenta",

              label:
                "Actualizar",

              loading:
                refreshing ||
                loading,

              loadingLabel:
                "Actualizando...",

              disabled:
                refreshing ||
                loading,
            })}
          </div>
        </div>

        <div class="cuenta-command-strip cuenta-account-strip">
          ${renderAvatar(
            detail,
            "hero"
          )}

          <div class="cuenta-account-copy">
            <div class="cuenta-account-name">
              ${escapeHtml(name)}
            </div>

            <div class="cuenta-account-line">
              ${escapeHtml(email)}
            </div>

            <div class="cuenta-account-line">
              @${escapeHtml(username)} · ${escapeHtml(role)}
            </div>
          </div>

          <div class="cuenta-account-stats">
            ${renderMiniStat({
              label:
                "Estado",

              value:
                status,

              tone:
                statusTone,
            })}

            ${renderMiniStat({
              label:
                "Tema",

              value:
                themeLabel,
            })}

            ${renderMiniStat({
              label:
                "Idioma",

              value:
                langLabel,
            })}
          </div>
        </div>

        <div class="cuenta-hero-meta">
          ${renderChip(
            `Rol · ${role}`,
            "accent"
          )}

          ${renderChip(
            `Tema · ${themeLabel}`
          )}

          ${renderChip(
            `Idioma · ${langLabel}`
          )}

          ${renderChip(
            `Privacidad · ${privacyLabel}`,
            getPrivacyMode(
              detail
            )
              ? "success"
              : "default"
          )}

          ${renderChip(
            `Estado · ${status}`,
            statusTone
          )}

          ${renderChip(
            `Sync · ${updatedText}`,
            refreshing ||
            loading
              ? "warning"
              : "default"
          )}
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    <section
      class="cuenta-state cuenta-loading-state"
      aria-busy="true"
    >
      <div class="cuenta-loading-grid">
        ${Array.from({
          length: 3,
        })
          .map(
            () => `
              <article class="cuenta-skeleton-card">
                <div class="cuenta-skeleton cuenta-skeleton--title"></div>
                <div class="cuenta-skeleton cuenta-skeleton--line"></div>
                <div class="cuenta-skeleton cuenta-skeleton--line-sm"></div>
                <div class="cuenta-skeleton cuenta-skeleton--control"></div>
                <div class="cuenta-skeleton cuenta-skeleton--line"></div>
                <div class="cuenta-skeleton cuenta-skeleton--line-sm"></div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderErrorState(
  message =
    "No se pudo cargar la cuenta."
) {
  return `
    <section class="cuenta-state cuenta-error-state">
      <h3 class="cuenta-state-title">
        No se pudo cargar la cuenta
      </h3>

      <p class="cuenta-state-text">
        ${escapeHtml(
          safeText(
            message,
            "Error desconocido al cargar la vista."
          )
        )}
      </p>

      ${renderButton({
        id:
          "cuenta-retry-btn",

        action:
          "refresh-cuenta",

        label:
          "Reintentar",

        variant:
          "primary",
      })}
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="cuenta-state cuenta-empty-state">
      <h3 class="cuenta-state-title">
        No hay datos de cuenta
      </h3>

      <p class="cuenta-state-text">
        /api/auth/me no devolvió un usuario utilizable.
        Puedes forzar una nueva consulta.
      </p>

      ${renderButton({
        id:
          "cuenta-empty-refresh-btn",

        action:
          "refresh-cuenta",

        label:
          "Actualizar cuenta",

        variant:
          "primary",
      })}
    </section>
  `;
}

/* =========================================================
   IDENTITY · READ ONLY
========================================================= */

export function renderIdentityCard(
  detail = {}
) {
  const phone =
    getPhone(
      detail
    );

  return `
    <article class="cuenta-card cuenta-card--accent">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">
            Identidad
          </h2>

          <p class="cuenta-card-text">
            Datos del usuario autenticado devueltos por /api/auth/me.
          </p>
        </div>

        <div
          class="cuenta-card-icon"
          aria-hidden="true"
        >
          ID
        </div>
      </div>

      <div class="cuenta-banner cuenta-banner--info">
        Solo lectura con el backend actual. Cuenta no utiliza la ruta administrativa
        /api/users/:id para editar tu propio usuario.
      </div>

      <div class="cuenta-profile-grid">
        ${renderReadonlyField({
          id:
            "cuenta-name-readonly",

          label:
            "Nombre",

          value:
            getDisplayName(
              detail
            ),

          autocomplete:
            "name",
        })}

        ${renderReadonlyField({
          id:
            "cuenta-username-readonly",

          label:
            "Usuario",

          value:
            `@${getUsername(
              detail
            )}`,

          autocomplete:
            "username",
        })}

        ${renderReadonlyField({
          id:
            "cuenta-email-readonly",

          label:
            "Email",

          value:
            getEmail(
              detail
            ),

          type:
            "email",

          autocomplete:
            "email",
        })}

        ${renderReadonlyField({
          id:
            "cuenta-phone-readonly",

          label:
            "Teléfono",

          value:
            phone,

          type:
            "tel",

          autocomplete:
            "tel",
        })}
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow(
          "User ID",
          getUserId(
            detail
          )
        )}

        ${renderMetaRow(
          "Cliente ID",
          getClienteId(
            detail
          )
        )}

        ${renderMetaRow(
          "Rol",
          getRole(
            detail
          )
        )}

        ${renderMetaRow(
          "Estado",
          getAccountStatus(
            detail
          ),
          getAccountStatusTone(
            detail
          )
        )}
      </div>
    </article>
  `;
}

/* =========================================================
   AVATAR · REAL
========================================================= */

export function renderAvatarCard(
  detail = {},
  state = {}
) {
  const localState =
    resolveLocalState(
      state
    );

  const busy =
    localState.saving ||
    localState.refreshing;

  const hasAvatar =
    Boolean(
      getAvatarUrl(
        detail
      )
    );

  return `
    <article class="cuenta-card">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">
            Avatar
          </h2>

          <p class="cuenta-card-text">
            La imagen se guarda mediante el endpoint self de avatar.
            Máximo 2 MB.
          </p>
        </div>

        <div
          class="cuenta-card-icon"
          aria-hidden="true"
        >
          AV
        </div>
      </div>

      <div class="cuenta-control-row">
        <div class="cuenta-control-copy">
          <strong class="cuenta-control-title">
            Imagen de perfil
          </strong>

          <span class="cuenta-control-description">
            PNG, JPEG, WebP, GIF o AVIF. El archivo solo se envía al pulsar Subir avatar.
          </span>
        </div>

        <label class="cuenta-field">
          <span class="cuenta-field-label">
            Seleccionar imagen
          </span>

          <input
            id="cuenta-avatar-input"
            name="avatar"
            data-cuenta-field="avatar"
            data-field="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            ${boolAttr(
              busy,
              'disabled aria-disabled="true"'
            )}
          />
        </label>

        <div class="cuenta-control-actions">
          ${renderButton({
            id:
              "cuenta-avatar-upload-btn",

            action:
              "upload-avatar",

            label:
              "Subir avatar",

            variant:
              "primary",

            loading:
              localState.saving,

            loadingLabel:
              "Subiendo...",

            disabled:
              busy,
          })}

          ${renderButton({
            id:
              "cuenta-avatar-delete-btn",

            action:
              "delete-avatar",

            label:
              "Eliminar avatar",

            variant:
              "soft",

            disabled:
              busy ||
              !hasAvatar,
          })}
        </div>
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow(
          "Avatar",
          hasAvatar
            ? "Configurado"
            : "Sin imagen",
          hasAvatar
            ? "success"
            : "default"
        )}

        ${renderMetaRow(
          "Última actualización",
          detail.avatarUpdatedAt
            ? formatDate(
                detail.avatarUpdatedAt
              )
            : "—"
        )}
      </div>
    </article>
  `;
}

/* =========================================================
   PREFERENCES · READ ONLY
========================================================= */

export function renderPreferencesCard(
  detail = {}
) {
  const darkMode =
    getThemeValue(
      detail
    ) === "dark";

  const privacy =
    getPrivacyMode(
      detail
    );

  const preferences =
    safeObject(
      detail.preferences
    );

  return `
    <article class="cuenta-card">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">
            Preferencias reportadas
          </h2>

          <p class="cuenta-card-text">
            Valores que /api/auth/me devuelve para la cuenta actual.
          </p>
        </div>

        <div
          class="cuenta-card-icon"
          aria-hidden="true"
        >
          PF
        </div>
      </div>

      <div class="cuenta-banner cuenta-banner--info">
        Tema, privacidad e idioma son informativos en esta vista:
        el backend actual no expone PATCH/PUT self para persistirlos.
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow(
          "Tema",
          getThemeLabel(
            detail
          )
        )}

        ${renderMetaRow(
          "darkMode",
          darkMode
            ? "true"
            : "false"
        )}

        ${renderMetaRow(
          "Privacidad",
          privacy
            ? "Activa"
            : "Estándar",
          privacy
            ? "success"
            : "default"
        )}

        ${renderMetaRow(
          "privacyMode",
          privacy
            ? "true"
            : "false"
        )}

        ${renderMetaRow(
          "Idioma",
          getLangLabel(
            detail
          )
        )}

        ${renderMetaRow(
          "Código",
          getLangValue(
            detail
          )
        )}

        ${renderMetaRow(
          "Zona horaria",
          safeText(
            first(
              detail.timezone,
              preferences.timezone,
              "Europe/Madrid"
            ),
            "Europe/Madrid"
          )
        )}

        ${renderMetaRow(
          "Moneda",
          safeText(
            preferences.currency,
            "EUR"
          )
        )}
      </div>
    </article>
  `;
}

/* =========================================================
   ACTIVITY
========================================================= */

export function renderActivityCard(
  detail = {}
) {
  const updatedAt =
    getUpdatedAt(
      detail
    );

  const createdAt =
    getCreatedAt(
      detail
    );

  const lastLoginAt =
    getLastLoginAt(
      detail
    );

  const passwordChangedAt =
    getLastPasswordChangeAt(
      detail
    );

  return `
    <article class="cuenta-card cuenta-card--success">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">
            Actividad
          </h2>

          <p class="cuenta-card-text">
            Fechas y estado visibles del usuario autenticado.
          </p>
        </div>

        <div
          class="cuenta-card-icon"
          aria-hidden="true"
        >
          OK
        </div>
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow(
          "Actualizado",
          updatedAt
            ? formatDate(
                updatedAt
              )
            : "—"
        )}

        ${renderMetaRow(
          "Actualización relativa",
          updatedAt
            ? formatRelativeDate(
                updatedAt
              )
            : "Sin fecha"
        )}

        ${renderMetaRow(
          "Creación",
          createdAt
            ? formatDate(
                createdAt
              )
            : "—"
        )}

        ${renderMetaRow(
          "Último login / actividad",
          lastLoginAt
            ? formatDate(
                lastLoginAt
              )
            : "—"
        )}

        ${renderMetaRow(
          "Último cambio de contraseña",
          passwordChangedAt
            ? formatDate(
                passwordChangedAt
              )
            : "—"
        )}

        ${renderMetaRow(
          "Email verificado",
          detail.emailVerified ===
            true
            ? "Sí"
            : "No",
          detail.emailVerified ===
            true
            ? "success"
            : "warning"
        )}
      </div>
    </article>
  `;
}

/* =========================================================
   PASSWORD · REAL
========================================================= */

export function renderSecurityCard(
  detail = {},
  state = {}
) {
  const localState =
    resolveLocalState(
      state
    );

  const busy =
    localState.saving ||
    localState.refreshing;

  return `
    <article class="cuenta-card cuenta-card--warning">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">
            Seguridad
          </h2>

          <p class="cuenta-card-text">
            Cambia la contraseña mediante /api/auth/change-password.
          </p>
        </div>

        <div
          class="cuenta-card-icon"
          aria-hidden="true"
        >
          SC
        </div>
      </div>

      <div class="cuenta-password-block">
        <div class="cuenta-control-copy">
          <strong class="cuenta-control-title">
            Cambiar contraseña
          </strong>

          <span class="cuenta-control-description">
            Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo.
            La contraseña actual se envía si la introduces.
          </span>
        </div>

        <div class="cuenta-password-grid">
          ${renderPasswordField({
            id:
              "cuenta-current-password",

            name:
              "currentPassword",

            field:
              "currentPassword",

            label:
              "Contraseña actual (si aplica)",

            placeholder:
              "Contraseña actual",

            autocomplete:
              "current-password",

            disabled:
              busy,
          })}

          ${renderPasswordField({
            id:
              "cuenta-new-password",

            name:
              "newPassword",

            field:
              "newPassword",

            label:
              "Nueva contraseña",

            placeholder:
              "Nueva contraseña",

            autocomplete:
              "new-password",

            disabled:
              busy,
          })}

          ${renderPasswordField({
            id:
              "cuenta-confirm-password",

            name:
              "confirmPassword",

            field:
              "confirmPassword",

            label:
              "Confirmar contraseña",

            placeholder:
              "Repite la nueva contraseña",

            autocomplete:
              "new-password",

            disabled:
              busy,

            wide:
              true,
          })}
        </div>

        <div class="cuenta-password-actions">
          ${renderButton({
            id:
              "cuenta-password-btn",

            action:
              "change-password",

            label:
              "Cambiar contraseña",

            variant:
              "primary",

            loading:
              localState.saving,

            loadingLabel:
              "Procesando...",

            disabled:
              busy,
          })}
        </div>
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow(
          "Último cambio",
          getLastPasswordChangeAt(
            detail
          )
            ? formatDate(
                getLastPasswordChangeAt(
                  detail
                )
              )
            : "—"
        )}

        ${renderMetaRow(
          "Sesión tras cambio",
          localState
            .authRefreshRequired
            ? "Renovación requerida"
            : "Sin renovación pendiente",
          localState
            .authRefreshRequired
            ? "warning"
            : "success"
        )}
      </div>
    </article>
  `;
}

/* =========================================================
   SESSIONS · REAL ON DEMAND
========================================================= */

function renderSessionRow(
  session = {}
) {
  const item =
    safeObject(
      session
    );

  const device =
    safeText(
      item.device,
      "Dispositivo desconocido"
    );

  const location =
    [
      safeText(
        item.location,
        ""
      ),
      safeText(
        item.country,
        ""
      ),
    ]
      .filter(Boolean)
      .join(" · ") ||
    "Ubicación no disponible";

  const network =
    safeText(
      item.ip,
      "IP no disponible"
    );

  const activeAt =
    item.lastActiveAt
      ? formatRelativeDate(
          item.lastActiveAt
        )
      : "Sin actividad reciente";

  const current =
    item.isCurrent ===
    true;

  return `
    <div
      class="cuenta-meta-row"
      data-cuenta-session-current="${current ? "true" : "false"}"
    >
      <span class="cuenta-meta-label">
        ${escapeHtml(
          `${device}${current ? " · Actual" : ""}`
        )}
      </span>

      <strong
        class="cuenta-meta-value"
        title="${escapeAttr(
          `${network} · ${location}`
        )}"
      >
        ${escapeHtml(
          `${activeAt} · ${location}`
        )}
      </strong>
    </div>
  `;
}

export function renderSessionsCard(
  state = {}
) {
  const localState =
    resolveLocalState(
      state
    );

  const sessions =
    localState.sessions;

  const busy =
    localState.saving ||
    localState.refreshing;

  return `
    <article class="cuenta-card">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">
            Sesiones
          </h2>

          <p class="cuenta-card-text">
            Consulta las sesiones del usuario bajo demanda.
            Esta vista no las carga automáticamente.
          </p>
        </div>

        <div
          class="cuenta-card-icon"
          aria-hidden="true"
        >
          SS
        </div>
      </div>

      <div class="cuenta-control-actions">
        ${renderButton({
          id:
            "cuenta-sessions-load-btn",

          action:
            sessions.loaded
              ? "refresh-sessions"
              : "load-sessions",

          label:
            sessions.loaded
              ? "Actualizar sesiones"
              : "Cargar sesiones",

          variant:
            "soft",

          loading:
            sessions.loading,

          loadingLabel:
            "Consultando...",

          disabled:
            busy ||
            sessions.loading,
        })}
      </div>

      ${
        sessions.error
          ? `
            <div class="cuenta-banner cuenta-banner--error">
              ${escapeHtml(
                sessions.error
              )}
            </div>
          `
          : ""
      }

      ${
        sessions.loaded
          ? `
            <div class="cuenta-meta-list">
              ${
                sessions.items.length
                  ? sessions.items
                      .map(
                        renderSessionRow
                      )
                      .join("")
                  : renderMetaRow(
                      "Sesiones",
                      "No hay sesiones activas"
                    )
              }
            </div>
          `
          : `
            <div class="cuenta-banner cuenta-banner--info">
              Las sesiones permanecen sin consultar hasta que pulses Cargar sesiones.
            </div>
          `
      }
    </article>
  `;
}

/* =========================================================
   DEACTIVATE · REAL DANGER ZONE
========================================================= */

export function renderDeactivateCard(
  detail = {},
  state = {}
) {
  const localState =
    resolveLocalState(
      state
    );

  const busy =
    localState.saving ||
    localState.refreshing;

  const inactive =
    detail.active ===
      false ||
    getAccountStatusTone(
      detail
    ) === "danger" ||
    localState.deactivated;

  return `
    <article class="cuenta-card cuenta-card--warning">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">
            Desactivar cuenta
          </h2>

          <p class="cuenta-card-text">
            Operación self-service protegida por contraseña.
            Desactiva el acceso de la cuenta y puede cerrar la sesión actual.
          </p>
        </div>

        <div
          class="cuenta-card-icon"
          aria-hidden="true"
        >
          DZ
        </div>
      </div>

      ${
        inactive
          ? `
            <div class="cuenta-banner cuenta-banner--error">
              La cuenta figura como desactivada. No es necesario repetir la operación.
            </div>
          `
          : `
            <div class="cuenta-password-block">
              <div class="cuenta-control-copy">
                <strong class="cuenta-control-title">
                  Confirmación
                </strong>

                <span class="cuenta-control-description">
                  Introduce tu contraseña únicamente para confirmar la desactivación.
                </span>
              </div>

              <div class="cuenta-password-grid">
                ${renderPasswordField({
                  id:
                    "cuenta-deactivate-password",

                  name:
                    "deactivatePassword",

                  field:
                    "deactivatePassword",

                  label:
                    "Contraseña",

                  placeholder:
                    "Confirma tu contraseña",

                  autocomplete:
                    "current-password",

                  disabled:
                    busy,

                  wide:
                    true,
                })}
              </div>

              <div class="cuenta-password-actions">
                ${renderButton({
                  id:
                    "cuenta-deactivate-btn",

                  action:
                    "deactivate-account",

                  label:
                    "Desactivar mi cuenta",

                  variant:
                    "soft",

                  loading:
                    localState.saving,

                  loadingLabel:
                    "Desactivando...",

                  disabled:
                    busy,
                })}
              </div>
            </div>
          `
      }

      <div class="cuenta-meta-list">
        ${renderMetaRow(
          "Estado actual",
          getAccountStatus(
            detail
          ),
          getAccountStatusTone(
            detail
          )
        )}

        ${renderMetaRow(
          "Consecuencia",
          "Acceso bloqueado y posible cierre de sesión",
          "warning"
        )}
      </div>
    </article>
  `;
}

/* =========================================================
   PANEL
========================================================= */

export function renderPanel({
  item = null,
  state = {},
} = {}) {
  const detail =
    resolveCuentaItem(
      item
    );

  const localState =
    resolveLocalState(
      state
    );

  const loading =
    localState.loading;

  const refreshing =
    localState.refreshing;

  const saving =
    localState.saving;

  const busy =
    saving ||
    refreshing;

  if (
    loading &&
    !detail
  ) {
    return renderLoadingState();
  }

  if (
    localState.error &&
    !detail
  ) {
    return renderErrorState(
      localState.error
    );
  }

  if (!detail) {
    return renderEmptyState();
  }

  return `
    <section
      class="cuenta-panel"
      data-cuenta-section="panel"
      data-cuenta-busy="${busy ? "true" : "false"}"
      data-cuenta-saving="${saving ? "true" : "false"}"
      data-cuenta-refreshing="${refreshing ? "true" : "false"}"
      data-cuenta-self-update="false"
    >
      <div class="cuenta-cards-grid">
        <div class="cuenta-column">
          ${renderIdentityCard(
            detail
          )}

          ${renderAvatarCard(
            detail,
            localState
          )}

          ${renderActivityCard(
            detail
          )}
        </div>

        <div class="cuenta-column">
          ${renderPreferencesCard(
            detail
          )}

          ${renderSecurityCard(
            detail,
            localState
          )}

          ${renderSessionsCard(
            localState
          )}

          ${renderDeactivateCard(
            detail,
            localState
          )}
        </div>
      </div>

      ${
        busy
          ? `
            <div
              class="cuenta-panel-overlay"
              aria-live="polite"
              aria-busy="true"
            >
              <div class="cuenta-panel-overlay-card">
                <span
                  class="cuenta-panel-overlay-spinner"
                  aria-hidden="true"
                ></span>

                <strong>
                  ${
                    saving
                      ? "Procesando operación..."
                      : "Actualizando cuenta..."
                  }
                </strong>
              </div>
            </div>
          `
          : ""
      }
    </section>
  `;
}

/* =========================================================
   MAIN
========================================================= */

export function renderCuentaTemplate({
  item = null,
  state = {},
} = {}) {
  const localState =
    resolveLocalState(
      state
    );

  const detail =
    resolveCuentaItem(
      item
    );

  return `
    <div
      class="cuenta-view"
      data-view="cuenta"
      data-cuenta-template="${escapeAttr(CUENTA_TEMPLATE_VERSION)}"
      data-cuenta-has-item="${detail ? "true" : "false"}"
      data-cuenta-loading="${localState.loading ? "true" : "false"}"
      data-cuenta-refreshing="${localState.refreshing ? "true" : "false"}"
      data-cuenta-saving="${localState.saving ? "true" : "false"}"
      data-cuenta-self-update="false"
      data-cuenta-auth-refresh-required="${localState.authRefreshRequired ? "true" : "false"}"
      data-cuenta-deactivated="${localState.deactivated ? "true" : "false"}"
    >
      ${renderHeader({
        item:
          detail,

        state:
          localState,
      })}

      ${renderFeedback({
        state:
          localState,

        hasDetail:
          Boolean(
            detail
          ),
      })}

      ${renderPanel({
        item:
          detail,

        state:
          localState,
      })}
    </div>
  `;
}

export function renderCuentaViewTemplate({
  item = null,
  state = {},
} = {}) {
  return renderCuentaTemplate({
    item,
    state,
  });
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getCuentaTemplateSnapshot({
  item = null,
  state = {},
} = {}) {
  const detail =
    resolveCuentaItem(
      item
    );

  const localState =
    resolveLocalState(
      state
    );

  return {
    version:
      CUENTA_TEMPLATE_VERSION,

    hasItem:
      Boolean(
        detail
      ),

    loading:
      localState.loading,

    refreshing:
      localState.refreshing,

    saving:
      localState.saving,

    authRefreshRequired:
      localState
        .authRefreshRequired,

    deactivated:
      localState.deactivated,

    sessions: {
      loaded:
        localState
          .sessions
          .loaded,

      loading:
        localState
          .sessions
          .loading,

      count:
        localState
          .sessions
          .items
          .length,
    },

    capabilities: {
      ...localState
        .capabilities,
    },

    renderedActions: [
      "refresh-cuenta",
      "upload-avatar",
      "delete-avatar",
      "change-password",
      "load-sessions",
      "refresh-sessions",
      "deactivate-account",
    ],

    unsupportedActionsRendered:
      [],

    architecture: {
      pureTemplate: true,
      http: false,
      store: false,
      router: false,
      listeners: false,

      rawBackendParsing:
        false,

      editableProfile:
        false,

      editableTheme:
        false,

      editablePrivacy:
        false,

      editableLanguage:
        false,

      sessionIdRendered:
        false,

      passwordValueRendered:
        false,
    },
  };
}

export function getSnapshot(
  input = {}
) {
  return getCuentaTemplateSnapshot(
    input
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  version:
    CUENTA_TEMPLATE_VERSION,

  capabilities:
    CUENTA_TEMPLATE_CAPABILITIES,

  renderHeader,

  renderLoadingState,
  renderErrorState,
  renderEmptyState,

  renderIdentityCard,
  renderAvatarCard,
  renderPreferencesCard,
  renderActivityCard,
  renderSecurityCard,
  renderSessionsCard,
  renderDeactivateCard,

  renderPanel,

  renderCuentaTemplate,
  renderCuentaViewTemplate,

  getCuentaTemplateSnapshot,
  getSnapshot,
};
