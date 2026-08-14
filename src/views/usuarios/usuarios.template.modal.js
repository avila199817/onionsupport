/* =========================================================
   Onion Support - Usuarios Detail Modal
   Archivo: /src/views/usuarios/usuarios.template.modal.js

   PRODUCTIVO · CANONICAL MODEL · SHARED MODAL CSS · V4

   Contrato:
   - Recibe usuario normalizado por usuarios.api.js.
   - No hace HTTP.
   - No reinterpreta raw/profile/usuario/lifecycle/audit.
   - No inyecta CSS ni estilos inline.
   - Reutiliza el contrato CSS global incidencias-modal-*.
   - Muestra únicamente datos reales del detalle seguro de /api/users/:id.
   - No inventa documentos, notas ni metadata inexistente.
   - Refresh y copy vía event bus para usuarios/index.js.
   - Singleton SPA, Escape, overlay, focus trap y retorno de foco.
========================================================= */

import { AppCore } from "../../core/index.js";
import { normalizeUsuarioModel } from "./usuarios.api.js";

/* =========================================================
   META / ACTIONS
========================================================= */

export const USUARIOS_MODAL_TEMPLATE_VERSION =
  "usuarios.template.modal.canonical.v4.shared-detail-css";

export const USUARIOS_DETAIL_ACTIONS = Object.freeze({
  CLOSE: "close",
  REFRESH: "refresh",
  COPY_ID: "copy-id",
});

const MODAL_ID = "usuarios-detail-modal-root";
const PANEL_ID = "usuarios-detail-modal-panel";
const REFRESH_FALLBACK_TIMEOUT_MS = 15_000;

/* =========================================================
   STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isRefreshing: false,

  root: null,
  panel: null,

  lastActiveElement: null,
  previousBodyOverflow: "",

  clickHandler: null,
  errorHandler: null,
  keydownHandler: null,

  refreshSeq: 0,
};

let busAttached = false;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
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

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(
    cleanText(value, "")
  );
}

function hashText(value = "") {
  const text =
    cleanText(value, "usuario");

  let hash = 0;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash =
      ((hash << 5) - hash) +
      text.charCodeAt(index);

    hash |= 0;
  }

  return Math.abs(hash);
}

function initialsFrom(value = "") {
  const parts =
    cleanText(value, "US")
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length >= 2) {
    return (
      `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`
        .toUpperCase() ||
      "US"
    );
  }

  return (
    parts[0]
      ?.slice(0, 2)
      .toUpperCase() ||
    "US"
  );
}

function normalizeEmail(value = "") {
  const email =
    cleanText(value, "")
      .toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  )
    ? email
    : "";
}

function safeAvatarUrl(value = "") {
  const raw =
    cleanText(value, "");

  if (!raw) return "";

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (
    /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
      raw
    )
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    )
  ) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function safeMailHref(value = "") {
  const email =
    normalizeEmail(value);

  return email
    ? `mailto:${email}`
    : "";
}

function safePhoneHref(value = "") {
  const raw =
    cleanText(value, "");

  if (!raw) return "";

  const plus =
    raw.startsWith("+")
      ? "+"
      : "";

  const digits =
    raw.replace(/[^\d]/g, "");

  return digits
    ? `tel:${plus}${digits}`
    : "";
}

function cloneDetail(detail = null) {
  if (!isObject(detail)) {
    return null;
  }

  return {
    ...detail,

    direccion: {
      ...safeObject(
        detail.direccion
      ),
    },

    address: {
      ...safeObject(
        detail.address
      ),
    },

    security: {
      ...safeObject(
        detail.security
      ),
    },

    permissions: [
      ...safeArray(
        detail.permissions
      ),
    ],

    meta: {
      ...safeObject(
        detail.meta
      ),
    },
  };
}

/* =========================================================
   EVENTS / TOAST
========================================================= */

function safeEmit(
  eventName = "",
  payload = {}
) {
  const name =
    cleanText(
      eventName,
      ""
    );

  if (!name) return false;

  /*
    AppCore es el bus canónico en la SPA.
    No emitimos por los dos buses a la vez para evitar duplicados.
  */
  try {
    if (
      isFunction(
        AppCore?.events?.emit
      )
    ) {
      AppCore.events.emit(
        name,
        payload
      );

      return true;
    }
  } catch {
    // window fallback debajo
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(
        name,
        {
          detail: payload,
        }
      )
    );

    return true;
  } catch {
    return false;
  }
}

function safeOn(
  eventName = "",
  handler = null
) {
  const name =
    cleanText(
      eventName,
      ""
    );

  if (
    !name ||
    !isFunction(handler)
  ) {
    return false;
  }

  let attached = false;

  try {
    if (
      isFunction(
        AppCore?.events?.on
      )
    ) {
      AppCore.events.on(
        name,
        handler
      );

      attached = true;
    }
  } catch {
    // window debajo
  }

  if (isBrowser()) {
    try {
      window.addEventListener(
        name,
        handler
      );

      attached = true;
    } catch {
      // noop
    }
  }

  return attached;
}

function safeOff(
  eventName = "",
  handler = null
) {
  const name =
    cleanText(
      eventName,
      ""
    );

  if (
    !name ||
    !isFunction(handler)
  ) {
    return false;
  }

  let detached = false;

  try {
    if (
      isFunction(
        AppCore?.events?.off
      )
    ) {
      AppCore.events.off(
        name,
        handler
      );

      detached = true;
    }
  } catch {
    // window debajo
  }

  if (isBrowser()) {
    try {
      window.removeEventListener(
        name,
        handler
      );

      detached = true;
    } catch {
      // noop
    }
  }

  return detached;
}

function showToast(
  message = "",
  type = "info"
) {
  const text =
    cleanText(
      message,
      ""
    );

  if (!text) return false;

  for (const toast of [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.Toast,
  ]) {
    try {
      if (
        isFunction(
          toast?.[type]
        )
      ) {
        toast[type](text);
        return true;
      }

      if (
        isFunction(
          toast?.show
        )
      ) {
        toast.show(
          text,
          type
        );

        return true;
      }
    } catch {
      // continue
    }
  }

  return false;
}

function unwrapEventDetail(
  event = null
) {
  const payload =
    safeObject(
      first(
        event?.detail,
        event?.payload,
        event,
        {}
      ),
      {}
    );

  return safeObject(
    first(
      payload.detail,
      payload.user,
      payload.usuario,
      payload.item,
      payload.data,
      payload,
      {}
    ),
    {}
  );
}

/* =========================================================
   DATE / FORMAT
========================================================= */

function toTimestamp(value = null) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (value instanceof Date) {
    const ms =
      value.getTime();

    return Number.isFinite(ms)
      ? ms
      : 0;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    if (value <= 0) return 0;

    return value > 9_999_999_999
      ? value
      : value * 1000;
  }

  const raw =
    cleanText(value, "");

  if (!raw) return 0;

  const numeric =
    Number(raw);

  if (
    Number.isFinite(numeric) &&
    numeric > 0
  ) {
    return numeric > 9_999_999_999
      ? numeric
      : numeric * 1000;
  }

  const parsed =
    Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatDate(value = null) {
  const timestamp =
    toTimestamp(value);

  if (!timestamp) {
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
    ).format(
      new Date(timestamp)
    );
  } catch {
    return "—";
  }
}

function formatRelativeDate(
  value = null
) {
  const timestamp =
    toTimestamp(value);

  if (!timestamp) {
    return "Sin acceso";
  }

  const diffMs =
    timestamp - Date.now();

  const diffMinutes =
    Math.round(
      diffMs / 60_000
    );

  const absoluteMinutes =
    Math.abs(
      diffMinutes
    );

  if (absoluteMinutes < 1) {
    return "Ahora mismo";
  }

  if (absoluteMinutes < 60) {
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

  return formatDate(value);
}

function booleanLabel(
  value = false,
  yes = "Sí",
  no = "No"
) {
  return value === true
    ? yes
    : no;
}

/* =========================================================
   CANONICAL DETAIL
========================================================= */

function normalizeDetail(detail = {}) {
  const source =
    safeObject(
      first(
        detail?.detail,
        detail?.user,
        detail?.usuario,
        detail?.item,
        detail,
        {}
      ),
      {}
    );

  return normalizeUsuarioModel(
    source
  );
}

function getUserId(detail = {}) {
  return cleanText(
    first(
      detail.userId,
      detail.id,
      detail.usuarioId,
      detail.uid,
      ""
    ),
    ""
  );
}

function getName(detail = {}) {
  return cleanText(
    first(
      detail.fullName,
      detail.displayName,
      detail.name,
      detail.nombre,
      detail.username,
      detail.email,
      "Usuario"
    ),
    "Usuario"
  );
}

function getUsername(detail = {}) {
  return cleanText(
    first(
      detail.username,
      detail.userName,
      detail.slug,
      ""
    ),
    ""
  );
}

function getEmail(detail = {}) {
  return normalizeEmail(
    first(
      detail.email,
      detail.emailLower,
      detail.mail,
      ""
    )
  );
}

function getPhone(detail = {}) {
  return cleanText(
    first(
      detail.phone,
      detail.telefono,
      detail.mobile,
      ""
    ),
    ""
  );
}

function getTipo(detail = {}) {
  const tipo =
    normalizeKey(
      detail.tipo
    );

  return tipo === "empresa"
    ? "empresa"
    : tipo === "particular"
      ? "particular"
      : "";
}

function tipoLabel(detail = {}) {
  const tipo =
    getTipo(detail);

  if (tipo === "empresa") {
    return "Empresa";
  }

  if (tipo === "particular") {
    return "Particular";
  }

  return "Usuario";
}

function getRole(detail = {}) {
  return normalizeKey(
    first(
      detail.role,
      detail.rol,
      "user"
    )
  ) === "admin"
    ? "admin"
    : "user";
}

function roleLabel(detail = {}) {
  return getRole(detail) ===
    "admin"
    ? "Admin"
    : "Usuario";
}

function getStatus(detail = {}) {
  const status =
    normalizeKey(
      first(
        detail.status,
        detail.estado,
        detail.state,
        detail.active === false
          ? "inactive"
          : "active"
      )
    );

  if (status === "pending") {
    return "pending";
  }

  if (status === "blocked") {
    return "blocked";
  }

  if (status === "inactive") {
    return "inactive";
  }

  return "active";
}

function statusLabel(
  status = ""
) {
  return {
    active: "Activo",
    pending: "Pendiente",
    blocked: "Bloqueado",
    inactive: "Inactivo",
  }[getStatus({
    status,
  })] || "Activo";
}

function statusCssModifier(
  status = ""
) {
  return {
    active:
      "status-resolved",

    pending:
      "status-pending",

    blocked:
      "status-urgent",

    inactive:
      "status-closed",
  }[getStatus({
    status,
  })] || "status-resolved";
}

function getAvatar(detail = {}) {
  return safeAvatarUrl(
    first(
      detail.avatarUrl,
      detail.avatar,
      detail.photoUrl,
      detail.picture,
      ""
    )
  );
}

function getDireccion(detail = {}) {
  const source =
    safeObject(
      first(
        detail.direccion,
        detail.address,
        {}
      ),
      {}
    );

  return {
    calle:
      cleanText(
        first(
          source.calle,
          source.street,
          ""
        ),
        ""
      ),

    cp:
      cleanText(
        first(
          source.cp,
          source.postalCode,
          ""
        ),
        ""
      ),

    ciudad:
      cleanText(
        first(
          source.ciudad,
          source.city,
          detail.ciudad,
          detail.city,
          ""
        ),
        ""
      ),

    provincia:
      cleanText(
        first(
          source.provincia,
          source.province,
          ""
        ),
        ""
      ),

    pais:
      cleanText(
        first(
          source.pais,
          source.country,
          ""
        ),
        ""
      ),
  };
}

function hasDireccion(
  direccion = {}
) {
  return Boolean(
    direccion.calle ||
    direccion.cp ||
    direccion.ciudad ||
    direccion.provincia ||
    direccion.pais
  );
}

function getSecurity(detail = {}) {
  return safeObject(
    detail.security,
    {}
  );
}

function getPermissions(detail = {}) {
  return safeArray(
    detail.permissions
  )
    .map(
      (permission) =>
        cleanText(
          permission,
          ""
        )
    )
    .filter(Boolean);
}

/* =========================================================
   UI PARTIALS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close:
      `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,

    copy:
      `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,

    refresh:
      `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,

    mail:
      `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a2 2 0 0 1-2.06 0L2 7"/></svg>`,

    phone:
      `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,
  };

  return (
    icons[name] ||
    icons.copy
  );
}

function renderChip(
  label = "",
  modifier = "category"
) {
  const safeModifier =
    normalizeKey(modifier) ||
    "category";

  return `
    <span
      class="usuarios-modal-chip incidencias-modal-chip incidencias-modal-chip--${attr(safeModifier)}"
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAvatar(detail = {}) {
  const name =
    getName(detail);

  const avatar =
    getAvatar(detail);

  const initials =
    initialsFrom(name);

  const tone =
    hashText(
      `${getUserId(detail)}:${getEmail(detail)}:${name}`
    ) % 10;

  return `
    <div
      class="usuarios-modal-avatar incidencias-modal-avatar"
      aria-label="${attr(name)}"
    >
      <div
        class="usuarios-modal-avatar-frame incidencias-modal-avatar-frame${avatar ? "" : " usuarios-modal-avatar-frame--fallback incidencias-modal-avatar-frame--fallback"}"
        data-usuarios-avatar-frame="true"
        data-has-avatar="${avatar ? "true" : "false"}"
        data-fallback="${avatar ? "false" : "true"}"
        data-avatar-tone="${attr(String(tone))}"
      >
        ${
          avatar
            ? `
              <img
                src="${attr(avatar)}"
                alt=""
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                draggable="false"
                data-usuarios-avatar-img="true"
              >
            `
            : ""
        }

        <span class="usuarios-modal-avatar-fallback incidencias-modal-avatar-fallback">
          ${escapeHtml(initials)}
        </span>
      </div>
    </div>
  `;
}

function renderMetaCard(
  label = "",
  value = "",
  options = {}
) {
  const muted =
    options.muted === true;

  return `
    <div
      class="usuarios-modal-meta-card incidencias-modal-meta-card${muted ? " is-muted" : ""}"
    >
      <span>${escapeHtml(label)}</span>
      <strong>
        ${escapeHtml(
          cleanText(
            value,
            "—"
          )
        )}
      </strong>
    </div>
  `;
}

function renderSectionHeader(
  title = "",
  subtitle = ""
) {
  return `
    <div class="usuarios-modal-section-head incidencias-modal-section-head">
      <h3>
        ${escapeHtml(title)}
      </h3>

      ${
        subtitle
          ? `<span>${escapeHtml(subtitle)}</span>`
          : ""
      }
    </div>
  `;
}

function renderInfoRow(
  label = "",
  value = "",
  {
    hideEmpty = true,
  } = {}
) {
  const text =
    cleanText(
      value,
      ""
    );

  if (
    !text &&
    hideEmpty
  ) {
    return "";
  }

  return `
    <div class="usuarios-modal-info-row incidencias-modal-meta-card">
      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(
          text || "—"
        )}
      </strong>
    </div>
  `;
}

function renderLinkedField({
  label = "",
  value = "",
  href = "",
  iconName = "mail",
} = {}) {
  const text =
    cleanText(
      value,
      ""
    );

  if (!text) return "";

  return `
    <div class="usuarios-modal-linked-field incidencias-modal-meta-card">
      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${
          href
            ? `
              <a
                href="${attr(href)}"
                class="usuarios-modal-link"
              >
                ${icon(iconName)}
                ${escapeHtml(text)}
              </a>
            `
            : escapeHtml(text)
        }
      </strong>
    </div>
  `;
}

/* =========================================================
   REAL DETAIL SECTIONS
========================================================= */

function renderContactSection(
  detail = {}
) {
  const email =
    getEmail(detail);

  const phone =
    getPhone(detail);

  const username =
    getUsername(detail);

  return `
    <section class="usuarios-modal-section incidencias-modal-contact-section">
      ${renderSectionHeader(
        "Identidad y contacto",
        "Datos de acceso y contacto registrados"
      )}

      <div class="usuarios-modal-contact-grid incidencias-modal-contact-grid">
        ${renderLinkedField({
          label: "Email",
          value: email,
          href: safeMailHref(email),
          iconName: "mail",
        })}

        ${renderLinkedField({
          label: "Teléfono",
          value: phone,
          href: safePhoneHref(phone),
          iconName: "phone",
        })}

        ${renderMetaCard(
          "Username",
          username || "—"
        )}

        ${renderMetaCard(
          "Slug",
          detail.slug || "—"
        )}
      </div>
    </section>
  `;
}

function renderAddressSection(
  detail = {}
) {
  const address =
    getDireccion(detail);

  if (!hasDireccion(address)) {
    return "";
  }

  return `
    <section class="usuarios-modal-section incidencias-modal-description-section">
      ${renderSectionHeader(
        "Dirección",
        "Dirección registrada en el usuario"
      )}

      <div class="usuarios-modal-address-grid incidencias-modal-meta-grid">
        ${renderInfoRow(
          "Calle",
          address.calle
        )}

        ${renderInfoRow(
          "Código postal",
          address.cp
        )}

        ${renderInfoRow(
          "Ciudad",
          address.ciudad
        )}

        ${renderInfoRow(
          "Provincia",
          address.provincia
        )}

        ${renderInfoRow(
          "País",
          address.pais
        )}
      </div>
    </section>
  `;
}

function renderSecuritySection(
  detail = {}
) {
  const security =
    getSecurity(detail);

  const twofaEnabled =
    security.twofaEnabled === true;

  const twofaMethod =
    cleanText(
      security.twofaMethod,
      ""
    );

  const lastPasswordChangeAt =
    first(
      security.lastPasswordChangeAt,
      null
    );

  const hasAny =
    Object.keys(security).length > 0 ||
    typeof detail.emailVerified === "boolean" ||
    typeof detail.privacyMode === "boolean" ||
    typeof detail.darkMode === "boolean";

  if (!hasAny) {
    return "";
  }

  return `
    <section class="usuarios-modal-section incidencias-modal-description-section">
      ${renderSectionHeader(
        "Seguridad y preferencias",
        "Información segura expuesta por el backend"
      )}

      <div class="usuarios-modal-security-grid incidencias-modal-meta-grid">
        ${renderMetaCard(
          "Email verificado",
          booleanLabel(
            detail.emailVerified === true
          )
        )}

        ${renderMetaCard(
          "2FA",
          twofaEnabled
            ? "Activado"
            : "Desactivado"
        )}

        ${
          twofaMethod
            ? renderMetaCard(
                "Método 2FA",
                twofaMethod
              )
            : ""
        }

        ${renderMetaCard(
          "Último cambio de contraseña",
          lastPasswordChangeAt
            ? formatDate(
                lastPasswordChangeAt
              )
            : "—"
        )}

        ${renderMetaCard(
          "Modo privacidad",
          booleanLabel(
            detail.privacyMode === true,
            "Activado",
            "Desactivado"
          )
        )}

        ${renderMetaCard(
          "Apariencia",
          detail.darkMode === true
            ? "Oscuro"
            : "Claro"
        )}
      </div>
    </section>
  `;
}

function renderPermissionsSection(
  detail = {}
) {
  const permissions =
    getPermissions(detail);

  if (!permissions.length) {
    return "";
  }

  return `
    <section class="usuarios-modal-section incidencias-modal-description-section">
      ${renderSectionHeader(
        "Permisos",
        `${permissions.length} permiso${permissions.length === 1 ? "" : "s"} asignado${permissions.length === 1 ? "" : "s"}`
      )}

      <div class="usuarios-modal-chip-list">
        ${permissions
          .map(
            (permission) =>
              renderChip(
                permission,
                "category"
              )
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderLifecycleSection(
  detail = {}
) {
  const events = [
    {
      label: "Creación",
      value: detail.createdAt,
    },
    {
      label: "Activación",
      value: detail.activatedAt,
    },
    {
      label: "Última conexión",
      value: detail.lastLoginAt,
    },
    {
      label: "Última actualización",
      value: detail.updatedAt,
    },
    {
      label: "Desactivación",
      value: detail.deactivatedAt,
    },
  ].filter(
    (event) =>
      toTimestamp(
        event.value
      ) > 0
  );

  if (!events.length) {
    return "";
  }

  return `
    <section class="usuarios-modal-section incidencias-modal-history-section">
      ${renderSectionHeader(
        "Actividad",
        `${events.length} hito${events.length === 1 ? "" : "s"} disponible${events.length === 1 ? "" : "s"}`
      )}

      <div class="usuarios-timeline-list incidencias-timeline-list">
        ${events
          .map(
            (event) => `
              <article class="usuarios-timeline-card incidencias-timeline-card">
                <div class="usuarios-timeline-accent incidencias-timeline-accent"></div>

                <div class="usuarios-timeline-main incidencias-timeline-main">
                  <div class="usuarios-timeline-title-row incidencias-timeline-title-row">
                    <strong class="usuarios-timeline-title incidencias-timeline-title">
                      ${escapeHtml(event.label)}
                    </strong>
                  </div>

                  <p class="usuarios-timeline-body incidencias-timeline-body">
                    ${escapeHtml(
                      event.label === "Última conexión"
                        ? formatRelativeDate(
                            event.value
                          )
                        : formatDate(
                            event.value
                          )
                    )}
                  </p>
                </div>

                <div class="usuarios-timeline-meta incidencias-timeline-meta">
                  <span>
                    ${escapeHtml(
                      formatDate(
                        event.value
                      )
                    )}
                  </span>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderAdminMetadataSection(
  detail = {}
) {
  const items = [
    [
      "Cliente vinculado",
      detail.clienteId || "",
    ],
    [
      "NIF / CIF",
      detail.nif || "",
    ],
    [
      "Tipo",
      getTipo(detail)
        ? tipoLabel(detail)
        : "",
    ],
    [
      "Avatar",
      detail.hasAvatar === true
        ? "Configurado"
        : "Sin avatar",
    ],
    [
      "Actualizado por",
      detail.updatedBy || "",
    ],
    [
      "Motivo desactivación",
      detail.deactivationReason || "",
    ],
  ].filter(
    ([, value]) =>
      cleanText(
        value,
        ""
      )
  );

  if (!items.length) {
    return "";
  }

  return `
    <section class="usuarios-modal-section incidencias-modal-description-section">
      ${renderSectionHeader(
        "Datos administrativos",
        "Campos seguros del detalle de administración"
      )}

      <div class="usuarios-modal-admin-grid incidencias-modal-meta-grid">
        ${items
          .map(
            ([label, value]) =>
              renderMetaCard(
                label,
                value,
                {
                  muted: true,
                }
              )
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFooter(
  detail = {},
  isRefreshing = false
) {
  const userId =
    getUserId(detail);

  const email =
    getEmail(detail);

  const phone =
    getPhone(detail);

  return `
    <footer
      class="usuarios-modal-footer incidencias-modal-footer"
      data-usuarios-modal-footer="true"
    >
      <div class="usuarios-modal-footer-actions">
        <button
          type="button"
          class="usuarios-modal-action-btn incidencias-modal-view-btn"
          data-usuarios-modal-action="${USUARIOS_DETAIL_ACTIONS.COPY_ID}"
          ${!userId || isRefreshing ? "disabled" : ""}
        >
          <span class="incidencias-modal-action-icon">
            ${icon("copy")}
          </span>

          <span>Copiar ID</span>
        </button>

        <button
          type="button"
          class="usuarios-modal-action-btn incidencias-modal-view-btn"
          data-usuarios-modal-action="${USUARIOS_DETAIL_ACTIONS.REFRESH}"
          ${
            !userId || isRefreshing
              ? 'disabled aria-disabled="true"'
              : ""
          }
          ${
            isRefreshing
              ? 'aria-busy="true"'
              : ""
          }
        >
          <span class="incidencias-modal-action-icon">
            ${icon("refresh")}
          </span>

          <span>
            ${
              isRefreshing
                ? "Actualizando..."
                : "Actualizar"
            }
          </span>
        </button>

        ${
          email
            ? `
              <a
                href="${attr(
                  safeMailHref(
                    email
                  )
                )}"
                class="usuarios-modal-footer-link incidencias-modal-view-btn"
              >
                ${icon("mail")}
                Email
              </a>
            `
            : ""
        }

        ${
          phone
            ? `
              <a
                href="${attr(
                  safePhoneHref(
                    phone
                  )
                )}"
                class="usuarios-modal-footer-link incidencias-modal-view-btn"
              >
                ${icon("phone")}
                Llamar
              </a>
            `
            : ""
        }
      </div>

      <button
        type="button"
        class="usuarios-modal-close-footer incidencias-modal-submit-btn"
        data-usuarios-modal-action="${USUARIOS_DETAIL_ACTIONS.CLOSE}"
      >
        Cerrar
      </button>
    </footer>
  `;
}

/* =========================================================
   PURE TEMPLATE
========================================================= */

export function renderUsuariosDetailModal(
  input = {}
) {
  const data =
    safeObject(input);

  const detail =
    normalizeDetail(
      first(
        data.detail,
        data.user,
        data.usuario,
        data.item,
        data
      )
    );

  const userId =
    getUserId(detail);

  const name =
    getName(detail);

  if (
    !userId &&
    !getEmail(detail) &&
    !getUsername(detail)
  ) {
    return "";
  }

  const status =
    getStatus(detail);

  const username =
    getUsername(detail);

  const city =
    getDireccion(
      detail
    ).ciudad;

  const isRefreshing =
    data.isRefreshing === true;

  return `
    <section
      id="${MODAL_ID}"
      class="usuarios-modal-root incidencias-modal-root"
      data-usuarios-modal-root="true"
      data-incidencias-modal-root="true"
      data-template-version="${attr(USUARIOS_MODAL_TEMPLATE_VERSION)}"
      data-user-id="${attr(userId)}"
      data-status="${attr(status)}"
      data-refreshing="${isRefreshing ? "true" : "false"}"
      data-canonical-model="true"
    >
      <div
        class="usuarios-modal-overlay incidencias-modal-overlay"
        data-usuarios-modal-overlay="true"
        data-incidencias-modal-overlay="true"
      >
        <div
          id="${PANEL_ID}"
          class="usuarios-modal-panel incidencias-modal-panel${isRefreshing ? " is-submitting" : ""}"
          data-usuarios-modal-panel="true"
          data-incidencias-modal-panel="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usuarios-detail-modal-title"
          aria-describedby="usuarios-detail-modal-summary"
          tabindex="-1"
        >
          <header class="usuarios-modal-header incidencias-modal-header">
            <div class="usuarios-modal-hero incidencias-modal-hero">
              ${renderAvatar(detail)}

              <div class="usuarios-modal-hero-content incidencias-modal-hero-content">
                <div class="usuarios-modal-hero-chips incidencias-modal-hero-chips">
                  ${renderChip(
                    statusLabel(
                      status
                    ),
                    statusCssModifier(
                      status
                    )
                  )}

                  ${renderChip(
                    roleLabel(
                      detail
                    ),
                    "category"
                  )}

                  ${
                    getTipo(detail)
                      ? renderChip(
                          tipoLabel(
                            detail
                          ),
                          "category"
                        )
                      : ""
                  }

                  ${
                    city
                      ? renderChip(
                          city,
                          "category"
                        )
                      : ""
                  }
                </div>

                <h2
                  id="usuarios-detail-modal-title"
                  class="usuarios-modal-title incidencias-modal-title"
                >
                  ${escapeHtml(name)}
                </h2>

                <span
                  id="usuarios-detail-modal-summary"
                  class="usuarios-modal-updated incidencias-modal-updated"
                >
                  ${
                    username
                      ? escapeHtml(
                          `@${username}`
                        )
                      : "Sin username"
                  }
                  ·
                  ${
                    detail.lastLoginAt
                      ? escapeHtml(
                          `Última conexión ${formatRelativeDate(detail.lastLoginAt)}`
                        )
                      : "Sin acceso registrado"
                  }
                </span>
              </div>
            </div>

            <button
              type="button"
              class="usuarios-modal-close-btn incidencias-modal-close-btn"
              data-usuarios-modal-action="${USUARIOS_DETAIL_ACTIONS.CLOSE}"
              aria-label="Cerrar modal"
            >
              ${icon("close")}
            </button>
          </header>

          <main class="usuarios-modal-body incidencias-modal-body">
            <div class="usuarios-modal-meta-grid incidencias-modal-meta-grid">
              ${renderMetaCard(
                "ID",
                userId || "—"
              )}

              ${renderMetaCard(
                "Username",
                username || "—"
              )}

              ${renderMetaCard(
                "Rol",
                roleLabel(
                  detail
                )
              )}

              ${renderMetaCard(
                "Estado",
                statusLabel(
                  status
                )
              )}

              ${renderMetaCard(
                "Creado",
                formatDate(
                  detail.createdAt
                )
              )}

              ${renderMetaCard(
                "Actualizado",
                formatDate(
                  detail.updatedAt
                )
              )}

              ${renderMetaCard(
                "Última conexión",
                detail.lastLoginAt
                  ? formatRelativeDate(
                      detail.lastLoginAt
                    )
                  : "Sin acceso"
              )}

              ${renderMetaCard(
                "Email verificado",
                booleanLabel(
                  detail.emailVerified === true
                )
              )}
            </div>

            ${renderContactSection(detail)}
            ${renderAddressSection(detail)}
            ${renderSecuritySection(detail)}
            ${renderAdminMetadataSection(detail)}
            ${renderPermissionsSection(detail)}
            ${renderLifecycleSection(detail)}
            ${renderFooter(
              detail,
              isRefreshing
            )}
          </main>
        </div>
      </div>
    </section>
  `;
}

export function renderUsuariosDetailModalClosed() {
  return "";
}

export const renderUsuarioDetailModal =
  renderUsuariosDetailModal;

export const renderUsuarioDetailModalClosed =
  renderUsuariosDetailModalClosed;

/* =========================================================
   ROOT / BODY
========================================================= */

function getRoot() {
  if (!isBrowser()) {
    return null;
  }

  const current =
    document.getElementById(
      MODAL_ID
    );

  if (current) {
    modalState.root =
      current;

    modalState.panel =
      current.querySelector(
        "[data-usuarios-modal-panel='true']"
      );
  }

  return current;
}

function ensureRoot() {
  if (!isBrowser()) {
    return null;
  }

  let root =
    getRoot();

  if (root) {
    return root;
  }

  root =
    document.createElement(
      "div"
    );

  root.id =
    `${MODAL_ID}-host`;

  root.setAttribute(
    "data-usuarios-modal-host",
    "true"
  );

  document.body.appendChild(
    root
  );

  modalState.root =
    root;

  return root;
}

function removeDuplicateHosts(
  keep = null
) {
  if (!isBrowser()) {
    return 0;
  }

  let removed = 0;

  for (
    const node of
    document.querySelectorAll(
      "[data-usuarios-modal-host='true']"
    )
  ) {
    if (node === keep) {
      continue;
    }

    try {
      node.remove();
      removed += 1;
    } catch {
      // noop
    }
  }

  return removed;
}

function lockBody() {
  if (!isBrowser()) {
    return false;
  }

  try {
    modalState.previousBodyOverflow =
      document.body.style.overflow ||
      "";

    document.body.classList.add(
      "modal-open",
      "usuarios-modal-open",
      "usuarios-detail-open",
      "incidencias-modal-open",
      "incidencias-detail-open"
    );

    /*
      Compat defensiva con navegadores/CSS antiguo.
      El contrato principal ya lo cubren las clases.
    */
    document.body.style.overflow =
      "hidden";

    return true;
  } catch {
    return false;
  }
}

function unlockBody() {
  if (!isBrowser()) {
    return false;
  }

  try {
    document.body.classList.remove(
      "modal-open",
      "usuarios-modal-open",
      "usuarios-detail-open",
      "incidencias-modal-open",
      "incidencias-detail-open"
    );

    document.body.style.overflow =
      modalState.previousBodyOverflow ||
      "";

    modalState.previousBodyOverflow =
      "";

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FOCUS
========================================================= */

function captureActiveElement() {
  if (!isBrowser()) {
    return null;
  }

  const active =
    document.activeElement;

  return (
    active &&
    active !== document.body
      ? active
      : null
  );
}

function focusPanel() {
  if (!isBrowser()) {
    return false;
  }

  const panel =
    modalState.panel ||
    getRoot()?.querySelector?.(
      "[data-usuarios-modal-panel='true']"
    );

  try {
    panel?.focus?.({
      preventScroll: true,
    });

    return Boolean(panel);
  } catch {
    return false;
  }
}

function restoreFocus() {
  const target =
    modalState.lastActiveElement;

  modalState.lastActiveElement =
    null;

  if (
    !target?.focus ||
    !target?.isConnected
  ) {
    return false;
  }

  try {
    target.focus({
      preventScroll: true,
    });

    return true;
  } catch {
    try {
      target.focus();
      return true;
    } catch {
      return false;
    }
  }
}

function getFocusableElements() {
  const panel =
    modalState.panel;

  if (!panel) return [];

  return Array.from(
    panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (element) =>
      element &&
      !element.hidden &&
      element.getAttribute?.(
        "aria-hidden"
      ) !== "true"
  );
}

function trapFocus(event = null) {
  if (
    event?.key !== "Tab" ||
    !modalState.isOpen
  ) {
    return false;
  }

  const focusable =
    getFocusableElements();

  if (!focusable.length) {
    event.preventDefault?.();
    focusPanel();
    return true;
  }

  const firstElement =
    focusable[0];

  const lastElement =
    focusable[
      focusable.length - 1
    ];

  const active =
    document.activeElement;

  if (
    event.shiftKey &&
    active === firstElement
  ) {
    event.preventDefault?.();
    lastElement.focus?.();
    return true;
  }

  if (
    !event.shiftKey &&
    active === lastElement
  ) {
    event.preventDefault?.();
    firstElement.focus?.();
    return true;
  }

  return false;
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function renderMounted({
  focus = false,
} = {}) {
  const host =
    ensureRoot();

  if (!host) {
    return null;
  }

  detachRootBindings();

  host.innerHTML =
    modalState.isOpen
      ? renderUsuariosDetailModal({
          detail:
            modalState.detail,
          isRefreshing:
            modalState.isRefreshing,
        })
      : "";

  modalState.root =
    host;

  modalState.panel =
    host.querySelector(
      "[data-usuarios-modal-panel='true']"
    );

  attachRootBindings();

  if (focus) {
    focusPanel();
  }

  return host;
}

/* =========================================================
   CLIPBOARD / ACTIONS
========================================================= */

async function writeClipboardText(
  text = ""
) {
  const value =
    cleanText(
      text,
      ""
    );

  if (
    !value ||
    !isBrowser()
  ) {
    return false;
  }

  try {
    if (
      navigator?.clipboard?.writeText
    ) {
      await navigator.clipboard
        .writeText(value);

      return true;
    }
  } catch {
    // textarea debajo
  }

  try {
    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value =
      value;

    textarea.readOnly =
      true;

    textarea.setAttribute(
      "aria-hidden",
      "true"
    );

    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.focus();
    textarea.select();

    const copied =
      document.execCommand(
        "copy"
      );

    textarea.remove();

    return Boolean(copied);
  } catch {
    return false;
  }
}

async function handleCopyId() {
  const userId =
    getUserId(
      modalState.detail ||
      {}
    );

  if (!userId) {
    showToast(
      "No hay ID para copiar.",
      "error"
    );

    return false;
  }

  /*
    Con controlador activo, index.js es la autoridad del clipboard.
  */
  const emitted =
    safeEmit(
      "usuarios:modal:copy",
      {
        userId,
        detail:
          cloneDetail(
            modalState.detail
          ),
        source:
          USUARIOS_MODAL_TEMPLATE_VERSION,
      }
    );

  if (emitted) {
    return true;
  }

  const copied =
    await writeClipboardText(
      userId
    );

  if (copied) {
    showToast(
      "ID copiado.",
      "success"
    );

    return true;
  }

  showToast(
    "No se pudo copiar el ID.",
    "error"
  );

  return false;
}

function handleRefresh() {
  const userId =
    getUserId(
      modalState.detail ||
      {}
    );

  if (
    !userId ||
    modalState.isRefreshing
  ) {
    return false;
  }

  modalState.isRefreshing =
    true;

  modalState.refreshSeq += 1;

  const sequence =
    modalState.refreshSeq;

  renderMounted({
    focus: false,
  });

  const emitted =
    safeEmit(
      "usuarios:modal:refresh",
      {
        userId,
        detail:
          cloneDetail(
            modalState.detail
          ),
        source:
          USUARIOS_MODAL_TEMPLATE_VERSION,
      }
    );

  if (!emitted) {
    modalState.isRefreshing =
      false;

    renderMounted({
      focus: false,
    });

    showToast(
      "No se pudo solicitar la actualización del usuario.",
      "error"
    );

    return false;
  }

  if (isBrowser()) {
    window.setTimeout(
      () => {
        if (
          !modalState.isOpen ||
          !modalState.isRefreshing ||
          modalState.refreshSeq !==
            sequence
        ) {
          return;
        }

        modalState.isRefreshing =
          false;

        renderMounted({
          focus: false,
        });
      },
      REFRESH_FALLBACK_TIMEOUT_MS
    );
  }

  return true;
}

/* =========================================================
   PUBLIC OPEN / CLOSE / UPDATE
========================================================= */

export function openUsuariosModal(
  detail = {}
) {
  const normalized =
    normalizeDetail(detail);

  if (
    !getUserId(normalized) &&
    !getEmail(normalized) &&
    !getUsername(normalized)
  ) {
    showToast(
      "No se pudo abrir el detalle del usuario.",
      "error"
    );

    return false;
  }

  if (isBrowser()) {
    modalState.lastActiveElement =
      captureActiveElement();

    removeDuplicateHosts(
      ensureRoot()
    );
  }

  modalState.detail =
    normalized;

  modalState.isOpen =
    true;

  modalState.isRefreshing =
    false;

  modalState.refreshSeq += 1;

  lockBody();

  renderMounted({
    focus: true,
  });

  safeEmit(
    "usuarios:modal:opened",
    {
      detail:
        cloneDetail(
          normalized
        ),

      userId:
        getUserId(
          normalized
        ),

      source:
        USUARIOS_MODAL_TEMPLATE_VERSION,
    }
  );

  return true;
}

export function closeUsuariosModal() {
  const userId =
    getUserId(
      modalState.detail ||
      {}
    );

  modalState.isOpen =
    false;

  modalState.isRefreshing =
    false;

  modalState.refreshSeq += 1;

  modalState.detail =
    null;

  detachRootBindings();

  const host =
    modalState.root ||
    getRoot();

  if (host) {
    host.innerHTML = "";
  }

  modalState.panel =
    null;

  unlockBody();

  if (isBrowser()) {
    window.setTimeout(
      () => restoreFocus(),
      0
    );
  } else {
    modalState.lastActiveElement =
      null;
  }

  safeEmit(
    "usuarios:modal:closed",
    {
      userId,
      source:
        USUARIOS_MODAL_TEMPLATE_VERSION,
    }
  );

  return true;
}

export function updateUsuariosModal(
  detail = {}
) {
  const normalized =
    normalizeDetail(detail);

  if (
    !getUserId(normalized) &&
    !getEmail(normalized) &&
    !getUsername(normalized)
  ) {
    return false;
  }

  if (!modalState.isOpen) {
    return openUsuariosModal(
      normalized
    );
  }

  const currentId =
    getUserId(
      modalState.detail ||
      {}
    );

  const incomingId =
    getUserId(
      normalized
    );

  if (
    currentId &&
    incomingId &&
    currentId !== incomingId
  ) {
    return false;
  }

  modalState.detail =
    normalized;

  modalState.isRefreshing =
    false;

  modalState.refreshSeq += 1;

  renderMounted({
    focus: false,
  });

  safeEmit(
    "usuarios:modal:updated",
    {
      detail:
        cloneDetail(
          normalized
        ),

      userId:
        incomingId,

      source:
        USUARIOS_MODAL_TEMPLATE_VERSION,
    }
  );

  return true;
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function onRootClick(
  event = null
) {
  const target =
    event?.target;

  if (
    typeof Element === "undefined" ||
    !(target instanceof Element)
  ) {
    return;
  }

  const actionNode =
    target.closest(
      "[data-usuarios-modal-action]"
    );

  if (actionNode) {
    const action =
      cleanText(
        actionNode.getAttribute(
          "data-usuarios-modal-action"
        ),
        ""
      );

    if (
      action ===
      USUARIOS_DETAIL_ACTIONS.CLOSE
    ) {
      event.preventDefault?.();
      closeUsuariosModal();
      return;
    }

    if (
      action ===
      USUARIOS_DETAIL_ACTIONS.COPY_ID
    ) {
      event.preventDefault?.();
      void handleCopyId();
      return;
    }

    if (
      action ===
      USUARIOS_DETAIL_ACTIONS.REFRESH
    ) {
      event.preventDefault?.();
      handleRefresh();
      return;
    }
  }

  const overlay =
    target.closest(
      "[data-usuarios-modal-overlay='true']"
    );

  const panel =
    target.closest(
      "[data-usuarios-modal-panel='true']"
    );

  if (
    overlay &&
    !panel &&
    event.target === overlay
  ) {
    closeUsuariosModal();
  }
}

function onRootError(
  event = null
) {
  const target =
    event?.target;

  if (
    typeof HTMLImageElement ===
      "undefined" ||
    !(
      target instanceof
      HTMLImageElement
    ) ||
    !target.matches(
      "[data-usuarios-avatar-img='true']"
    )
  ) {
    return;
  }

  const frame =
    target.closest(
      "[data-usuarios-avatar-frame='true']"
    );

  if (!frame) return;

  target.hidden = true;

  frame.setAttribute(
    "data-fallback",
    "true"
  );

  frame.classList.add(
    "usuarios-modal-avatar-frame--fallback",
    "incidencias-modal-avatar-frame--fallback"
  );
}

function onDocumentKeydown(
  event = null
) {
  if (!modalState.isOpen) {
    return;
  }

  if (event?.key === "Escape") {
    event.preventDefault?.();
    closeUsuariosModal();
    return;
  }

  trapFocus(event);
}

function attachRootBindings() {
  if (!isBrowser()) {
    return false;
  }

  const root =
    modalState.root ||
    ensureRoot();

  if (!root) {
    return false;
  }

  detachRootBindings();

  modalState.clickHandler =
    onRootClick;

  modalState.errorHandler =
    onRootError;

  modalState.keydownHandler =
    onDocumentKeydown;

  root.addEventListener(
    "click",
    modalState.clickHandler
  );

  root.addEventListener(
    "error",
    modalState.errorHandler,
    true
  );

  document.addEventListener(
    "keydown",
    modalState.keydownHandler
  );

  return true;
}

function detachRootBindings() {
  if (!isBrowser()) {
    modalState.clickHandler =
      null;

    modalState.errorHandler =
      null;

    modalState.keydownHandler =
      null;

    return false;
  }

  const root =
    modalState.root;

  try {
    if (
      root &&
      modalState.clickHandler
    ) {
      root.removeEventListener(
        "click",
        modalState.clickHandler
      );
    }

    if (
      root &&
      modalState.errorHandler
    ) {
      root.removeEventListener(
        "error",
        modalState.errorHandler,
        true
      );
    }

    if (
      modalState.keydownHandler
    ) {
      document.removeEventListener(
        "keydown",
        modalState.keydownHandler
      );
    }
  } catch {
    // noop
  }

  modalState.clickHandler =
    null;

  modalState.errorHandler =
    null;

  modalState.keydownHandler =
    null;

  return true;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail =
    unwrapEventDetail(event);

  if (
    !Object.keys(detail).length
  ) {
    return;
  }

  openUsuariosModal(
    detail
  );
}

function handleCloseEvent() {
  closeUsuariosModal();
}

function handleUpdateEvent(event) {
  const detail =
    unwrapEventDetail(event);

  if (
    !Object.keys(detail).length
  ) {
    return;
  }

  updateUsuariosModal(
    detail
  );
}

function handleDetailRefreshEvent(
  event
) {
  const detail =
    unwrapEventDetail(event);

  if (
    !Object.keys(detail).length ||
    !modalState.isOpen
  ) {
    return;
  }

  const currentId =
    getUserId(
      modalState.detail ||
      {}
    );

  const incomingId =
    getUserId(
      normalizeDetail(
        detail
      )
    );

  if (
    currentId &&
    incomingId &&
    currentId !== incomingId
  ) {
    return;
  }

  updateUsuariosModal(
    detail
  );
}

function attachBus() {
  if (busAttached) {
    return true;
  }

  safeOn(
    "usuarios:modal:open",
    handleOpenEvent
  );

  safeOn(
    "usuarios:modal:close",
    handleCloseEvent
  );

  safeOn(
    "usuarios:modal:update",
    handleUpdateEvent
  );

  safeOn(
    "usuarios:detail:refresh",
    handleDetailRefreshEvent
  );

  safeOn(
    "usuarios:detail:success",
    handleDetailRefreshEvent
  );

  busAttached = true;

  return true;
}

function detachBus() {
  if (!busAttached) {
    return true;
  }

  safeOff(
    "usuarios:modal:open",
    handleOpenEvent
  );

  safeOff(
    "usuarios:modal:close",
    handleCloseEvent
  );

  safeOff(
    "usuarios:modal:update",
    handleUpdateEvent
  );

  safeOff(
    "usuarios:detail:refresh",
    handleDetailRefreshEvent
  );

  safeOff(
    "usuarios:detail:success",
    handleDetailRefreshEvent
  );

  busAttached = false;

  return true;
}

/* =========================================================
   STATE / SNAPSHOT
========================================================= */

export function getUsuariosModalState() {
  return {
    version:
      USUARIOS_MODAL_TEMPLATE_VERSION,

    isOpen:
      Boolean(
        modalState.isOpen
      ),

    isRefreshing:
      Boolean(
        modalState.isRefreshing
      ),

    userId:
      modalState.detail
        ? getUserId(
            modalState.detail
          )
        : "",

    detail:
      cloneDetail(
        modalState.detail
      ),
  };
}

export function getUsuariosModalSnapshot() {
  return {
    version:
      USUARIOS_MODAL_TEMPLATE_VERSION,

    actions:
      USUARIOS_DETAIL_ACTIONS,

    model:
      "usuarios.api.normalizeUsuarioModel",

    backendContract: {
      detail:
        "GET /api/users/:id",

      detailAdminOnly:
        true,

      update:
        "PUT|PATCH /api/users/:id",

      delete:
        false,
    },

    renderedSections: [
      "identity",
      "contact",
      "address",
      "security",
      "adminMetadata",
      "permissions",
      "lifecycle",
    ],

    intentionallyNotRendered: [
      "documents",
      "notes",
      "activationToken",
      "resetToken",
      "password",
      "raw",
    ],

    architecture: {
      http: false,
      localModelNormalization:
        false,

      canonicalApiModel:
        true,

      cssInjection:
        false,

      inlineStyles:
        false,

      inlineHandlers:
        false,

      sharedDetailCss:
        "incidencias-modal-*",

      dataImageAvatarAllowed:
        false,

      focusTrap:
        true,

      restoreFocus:
        true,

      overlayToClose:
        true,

      escapeToClose:
        true,

      refreshViaController:
        true,

      copyViaController:
        true,
    },
  };
}

export const getSnapshot =
  getUsuariosModalSnapshot;

/* =========================================================
   PUBLIC BRIDGE
========================================================= */

export const OnionUsuariosModal =
  Object.freeze({
    version:
      USUARIOS_MODAL_TEMPLATE_VERSION,

    actions:
      USUARIOS_DETAIL_ACTIONS,

    open(
      detail = {}
    ) {
      return openUsuariosModal(
        detail
      );
    },

    close() {
      return closeUsuariosModal();
    },

    update(
      detail = {}
    ) {
      return updateUsuariosModal(
        detail
      );
    },

    refresh() {
      return handleRefresh();
    },

    copyId() {
      return handleCopyId();
    },

    getState:
      getUsuariosModalState,

    getSnapshot:
      getUsuariosModalSnapshot,

    render:
      renderUsuariosDetailModal,

    renderClosed:
      renderUsuariosDetailModalClosed,

    destroy() {
      detachRootBindings();

      modalState.isOpen =
        false;

      modalState.isRefreshing =
        false;

      modalState.detail =
        null;

      modalState.refreshSeq += 1;

      unlockBody();

      const host =
        modalState.root ||
        getRoot();

      try {
        host?.remove?.();
      } catch {
        // noop
      }

      modalState.root =
        null;

      modalState.panel =
        null;

      modalState.lastActiveElement =
        null;

      detachBus();

      return true;
    },
  });

export const open =
  openUsuariosModal;

export const close =
  closeUsuariosModal;

export const update =
  updateUsuariosModal;

/* =========================================================
   GLOBAL BRIDGE / AUTO BOOT
========================================================= */

if (isBrowser()) {
  try {
    window.OnionUsuariosModal =
      OnionUsuariosModal;

    window.renderUsuarioDetailModal =
      OnionUsuariosModal.open;

    window.renderUsuarioModal =
      OnionUsuariosModal.open;

    window.renderUsuariosModal =
      OnionUsuariosModal.open;
  } catch {
    // noop
  }
}

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionUsuariosModal;
