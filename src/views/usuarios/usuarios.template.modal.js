/* =========================================================
   Onion Support - Usuarios Detail Modal
   Archivo: /src/views/usuarios/usuarios.template.modal.js

   PRODUCTIVO · CANONICAL MODEL · SHARED MODAL CSS · V6 · STABLE PANEL

   Contrato:
   - Recibe y vuelve a normalizar únicamente con usuarios.api.js.
   - No hace HTTP directo.
   - No lee raw/profile/lifecycle/audit por su cuenta.
   - No inyecta CSS.
   - Reutiliza el contrato visual incidencias-modal-*.
   - Mantiene clases usuarios-modal-* para evolución propia.
   - No renderiza secretos, tokens, activationUrl ni raw.
   - Refresh delegado al controlador cuando existe.
   - Clipboard local seguro con fallback legacy.
   - Singleton SPA con host estable.
   - Root, overlay y panel físicamente estables durante update/refresh.
   - La animación de entrada del panel sólo ocurre en el primer mount.
   - Sin nesting del modal al rerenderizar.
   - Body-lock idempotente y reversible.
   - Escape, overlay, focus trap y retorno de foco.
   - Avatar HTTPS/SAS sólo para el Blob host aprobado.
========================================================= */

import { AppCore } from "../../core/index.js";
import { normalizeUsuarioModel } from "./usuarios.api.js";

/* =========================================================
   META / ACTIONS
========================================================= */

export const USUARIOS_MODAL_TEMPLATE_VERSION =
  "usuarios.template.modal.canonical.v6.stable-panel-no-flicker";

export const USUARIOS_DETAIL_ACTIONS = Object.freeze({
  CLOSE: "close",
  REFRESH: "refresh",
  COPY_ID: "copy-id",
});

const HOST_ID = "usuarios-detail-modal-host";
const MODAL_ID = "usuarios-detail-modal-root";
const PANEL_ID = "usuarios-detail-modal-panel";

const REFRESH_FALLBACK_TIMEOUT_MS = 15_000;

const TRUSTED_BLOB_HOST =
  "onionassets.blob.core.windows.net";

const BODY_LOCK_CLASSES = Object.freeze([
  "modal-open",
  "usuarios-modal-open",
  "usuarios-detail-open",
  "incidencias-modal-open",
  "incidencias-detail-open",
]);

/* =========================================================
   STATE
========================================================= */

const modalState = {
  detail: null,

  isOpen: false,
  isRefreshing: false,

  host: null,
  root: null,
  panel: null,

  lastActiveElement: null,

  bodyLocked: false,
  previousBodyOverflow: "",
  previousBodyClasses: new Map(),

  clickHandler: null,
  errorHandler: null,
  keydownHandler: null,

  refreshSeq: 0,
  refreshTimer: 0,
};

let busAttached = false;
const busUnsubscribers = [];

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
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function cleanText(value = "", fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
  Nunca aplanar arrays de dominio.
*/
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

  let hash = 2166136261;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash ^= text.charCodeAt(index);

    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(
    hash >>> 0
  );
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
    cleanText(
      value,
      ""
    ).toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  )
    ? email
    : "";
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

  if (!raw) {
    return "";
  }

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

/* =========================================================
   AVATAR URL POLICY
========================================================= */

function isSensitiveAppQueryParam(
  key = ""
) {
  return [
    "access_token",
    "accesstoken",
    "refresh_token",
    "refreshtoken",
    "id_token",
    "idtoken",
    "token",
    "code",
    "secret",
    "session",
    "sessionid",
    "password",
    "pwd",
    "key",
    "jwt",
    "authorization",
    "reset_token",
    "resettoken",
    "activation_token",
    "activationtoken",
  ].includes(
    normalizeKey(key)
  );
}

function hasAzureSasQuery(url = null) {
  if (!url?.searchParams) {
    return false;
  }

  return [
    ...url.searchParams.keys(),
  ].some((key) =>
    [
      "sig",
      "se",
      "sp",
      "sv",
      "sr",
      "spr",
      "st",
      "skoid",
      "sktid",
      "skt",
      "ske",
      "sks",
      "skv",
    ].includes(
      String(key)
        .toLowerCase()
    )
  );
}

function safeAvatarUrl(value = "") {
  const raw =
    cleanText(value, "");

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(
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

  const localHttp =
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    );

  if (
    !/^https:\/\//i.test(raw) &&
    !localHttp
  ) {
    return "";
  }

  try {
    const url =
      new URL(raw);

    for (
      const key
      of url.searchParams.keys()
    ) {
      if (
        isSensitiveAppQueryParam(key)
      ) {
        return "";
      }
    }

    /*
      SAS de avatar:
      sólo se acepta si pertenece al storage real de Onion.
      No se abre la puerta a SAS arbitrarias de terceros.
    */
    if (
      hasAzureSasQuery(url) &&
      url.hostname.toLowerCase() !==
        TRUSTED_BLOB_HOST
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

/* =========================================================
   PUBLIC-SAFE DETAIL CLONE
========================================================= */

function cloneDetail(detail = null) {
  if (!isObject(detail)) {
    return null;
  }

  /*
    raw se usa internamente en el API para compatibilidad,
    pero el modal no necesita volver a publicarlo en eventos/state.
  */
  const {
    raw: _raw,
    activationUrl: _activationUrl,
    activateUrl: _activateUrl,
    resetUrl: _resetUrl,
    token: _token,
    accessToken: _accessToken,
    refreshToken: _refreshToken,
    ...safeDetail
  } = detail;

  return {
    ...safeDetail,

    direccion: {
      ...safeObject(
        safeDetail.direccion
      ),
    },

    address: {
      ...safeObject(
        safeDetail.address
      ),
    },

    location: {
      ...safeObject(
        safeDetail.location
      ),
    },

    security: {
      ...safeObject(
        safeDetail.security
      ),

      activation: {
        ...safeObject(
          safeDetail.security?.activation
        ),
      },

      reset: {
        ...safeObject(
          safeDetail.security?.reset
        ),
      },
    },

    permissions: [
      ...safeArray(
        safeDetail.permissions
      ),
    ],

    roles: [
      ...safeArray(
        safeDetail.roles
      ),
    ],

    meta: {
      ...safeObject(
        safeDetail.meta
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

  if (!name) {
    return false;
  }

  /*
    AppCore es el bus canónico.
    Sólo usamos window como fallback para no emitir dos veces.
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

function subscribeEvent(
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
    return () => {};
  }

  let appBound = false;
  let windowBound = false;

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

      appBound = true;
    }
  } catch {
    // noop
  }

  if (isBrowser()) {
    try {
      window.addEventListener(
        name,
        handler
      );

      windowBound = true;
    } catch {
      // noop
    }
  }

  return () => {
    try {
      if (
        appBound &&
        isFunction(
          AppCore?.events?.off
        )
      ) {
        AppCore.events.off(
          name,
          handler
        );
      }
    } catch {
      // noop
    }

    if (isBrowser()) {
      try {
        if (windowBound) {
          window.removeEventListener(
            name,
            handler
          );
        }
      } catch {
        // noop
      }
    }
  };
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

  if (!text) {
    return false;
  }

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
        toast[type](
          text
        );

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
      // siguiente candidato
    }
  }

  return false;
}

function unwrapEventDetail(event = null) {
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
   ACTIVE CONTROLLER BRIDGE
========================================================= */

function getActiveUsuariosController() {
  const root =
    typeof globalThis !== "undefined"
      ? globalThis
      : {};

  const candidates = [
    root?.OnionUsuarios?.controller,
    root?.OnionUsuariosController,
    AppCore?.modules?.Usuarios?.controller,
  ];

  for (const candidate of candidates) {
    if (
      !candidate ||
      !isObject(candidate)
    ) {
      continue;
    }

    try {
      if (
        candidate.isDestroyed?.() ===
        true
      ) {
        continue;
      }
    } catch {
      // Si no puede consultar estado, seguimos evaluando métodos.
    }

    return candidate;
  }

  return null;
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
    if (value <= 0) {
      return 0;
    }

    return value >
      9_999_999_999
      ? value
      : value * 1000;
  }

  const raw =
    cleanText(value, "");

  if (!raw) {
    return 0;
  }

  const numeric =
    Number(raw);

  if (
    Number.isFinite(numeric) &&
    numeric > 0
  ) {
    return numeric >
      9_999_999_999
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

function formatRelativeDate(value = null) {
  const timestamp =
    toTimestamp(value);

  if (!timestamp) {
    return "Sin acceso";
  }

  const diffMs =
    timestamp -
    Date.now();

  const diffMinutes =
    Math.round(
      diffMs /
      60_000
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
      absoluteMinutes /
      60
    );

  if (hours < 24) {
    return diffMinutes > 0
      ? `En ${hours} h`
      : `Hace ${hours} h`;
  }

  const days =
    Math.round(
      hours /
      24
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

  if (tipo === "empresa") {
    return "empresa";
  }

  if (tipo === "particular") {
    return "particular";
  }

  return "";
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
          ? (
              detail.emailVerified ===
                false &&
              !detail.activatedAt
                ? "pending"
                : "inactive"
            )
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

function statusLabel(status = "") {
  return {
    active: "Activo",
    pending: "Pendiente",
    blocked: "Bloqueado",
    inactive: "Inactivo",
  }[
    getStatus({
      status,
    })
  ] || "Activo";
}

function statusCssModifier(status = "") {
  return {
    active:
      "status-resolved",

    pending:
      "status-pending",

    blocked:
      "status-urgent",

    inactive:
      "status-closed",
  }[
    getStatus({
      status,
    })
  ] || "status-resolved";
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
          detail.provincia,
          ""
        ),
        ""
      ),

    pais:
      cleanText(
        first(
          source.pais,
          source.country,
          detail.pais,
          ""
        ),
        ""
      ),
  };
}

function hasDireccion(direccion = {}) {
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
  const output = [];
  const seen = new Set();

  for (
    const value
    of safeArray(
      detail.permissions
    )
  ) {
    const permission =
      cleanText(
        value,
        ""
      );

    if (
      !permission ||
      seen.has(permission)
    ) {
      continue;
    }

    seen.add(permission);
    output.push(permission);

    if (output.length >= 100) {
      break;
    }
  }

  return output;
}

/* =========================================================
   ICONS
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

    shield:
      `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,

    user:
      `<svg ${common}><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`,

    map:
      `<svg ${common}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></svg>`,
  };

  return (
    icons[name] ||
    icons.user
  );
}

/* =========================================================
   UI PARTIALS
========================================================= */

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
                class="usuarios-modal-avatar-img"
                src="${attr(avatar)}"
                alt=""
                width="96"
                height="96"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                draggable="false"
                data-usuarios-avatar-img="true"
              >
            `
            : ""
        }

        <span
          class="usuarios-modal-avatar-fallback incidencias-modal-avatar-fallback"
        >
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

  const iconName =
    cleanText(
      options.iconName,
      ""
    );

  return `
    <div
      class="usuarios-modal-meta-card incidencias-modal-meta-card${muted ? " is-muted" : ""}"
    >
      <span>
        ${
          iconName
            ? `${icon(iconName)} `
            : ""
        }
        ${escapeHtml(label)}
      </span>

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
    <div
      class="usuarios-modal-section-head incidencias-modal-section-head"
    >
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
    <div
      class="usuarios-modal-info-row incidencias-modal-meta-card"
    >
      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(
          text ||
          "—"
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

  if (!text) {
    return "";
  }

  return `
    <div
      class="usuarios-modal-linked-field incidencias-modal-meta-card"
    >
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
   DETAIL SECTIONS
========================================================= */

function renderContactSection(detail = {}) {
  const email =
    getEmail(detail);

  const phone =
    getPhone(detail);

  const username =
    getUsername(detail);

  return `
    <section
      class="usuarios-modal-section incidencias-modal-contact-section"
    >
      ${renderSectionHeader(
        "Identidad y contacto",
        "Datos de acceso y contacto registrados"
      )}

      <div
        class="usuarios-modal-contact-grid incidencias-modal-contact-grid"
      >
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
          username || "—",
          {
            iconName: "user",
          }
        )}

        ${renderMetaCard(
          "Slug",
          detail.slug || "—"
        )}
      </div>
    </section>
  `;
}

function renderAddressSection(detail = {}) {
  const address =
    getDireccion(detail);

  if (
    !hasDireccion(address)
  ) {
    return "";
  }

  return `
    <section
      class="usuarios-modal-section incidencias-modal-description-section"
    >
      ${renderSectionHeader(
        "Dirección",
        "Dirección registrada en el usuario"
      )}

      <div
        class="usuarios-modal-address-grid incidencias-modal-meta-grid"
      >
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

function renderSecuritySection(detail = {}) {
  const security =
    getSecurity(detail);

  const twofaEnabled =
    security.twofaEnabled ===
    true;

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

  return `
    <section
      class="usuarios-modal-section incidencias-modal-description-section"
    >
      ${renderSectionHeader(
        "Seguridad y preferencias",
        "Información segura expuesta por el backend"
      )}

      <div
        class="usuarios-modal-security-grid incidencias-modal-meta-grid"
      >
        ${renderMetaCard(
          "Email verificado",
          booleanLabel(
            detail.emailVerified ===
            true
          ),
          {
            iconName: "shield",
          }
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
            detail.privacyMode ===
              true,
            "Activado",
            "Desactivado"
          )
        )}

        ${renderMetaCard(
          "Apariencia",
          detail.darkMode ===
            true
            ? "Oscuro"
            : "Claro"
        )}
      </div>
    </section>
  `;
}

function renderPermissionsSection(detail = {}) {
  const permissions =
    getPermissions(detail);

  if (
    !permissions.length
  ) {
    return "";
  }

  return `
    <section
      class="usuarios-modal-section incidencias-modal-description-section"
    >
      ${renderSectionHeader(
        "Permisos",
        `${permissions.length} permiso${permissions.length === 1 ? "" : "s"} asignado${permissions.length === 1 ? "" : "s"}`
      )}

      <div
        class="usuarios-modal-chip-list"
      >
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

function renderLifecycleSection(detail = {}) {
  const events = [
    {
      label: "Creación",
      value: detail.createdAt,
      actor: "",
    },
    {
      label: "Activación",
      value: detail.activatedAt,
      actor: cleanText(
        first(
          detail.activatedBy,
          detail.activatedByRole,
          ""
        ),
        ""
      ),
    },
    {
      label: "Última conexión",
      value: detail.lastLoginAt,
      actor: "",
    },
    {
      label: "Última actualización",
      value: detail.updatedAt,
      actor: cleanText(
        detail.updatedBy,
        ""
      ),
    },
    {
      label: "Desactivación",
      value: detail.deactivatedAt,
      actor: cleanText(
        first(
          detail.deactivatedBy,
          detail.deactivatedByRole,
          ""
        ),
        ""
      ),
    },
  ].filter(
    (event) =>
      toTimestamp(
        event.value
      ) > 0
  );

  if (
    !events.length
  ) {
    return "";
  }

  return `
    <section
      class="usuarios-modal-section incidencias-modal-history-section"
    >
      ${renderSectionHeader(
        "Actividad",
        `${events.length} hito${events.length === 1 ? "" : "s"} disponible${events.length === 1 ? "" : "s"}`
      )}

      <div
        class="usuarios-timeline-list incidencias-timeline-list"
      >
        ${events
          .map(
            (event) => `
              <article
                class="usuarios-timeline-card incidencias-timeline-card"
              >
                <div
                  class="usuarios-timeline-accent incidencias-timeline-accent"
                ></div>

                <div
                  class="usuarios-timeline-main incidencias-timeline-main"
                >
                  <div
                    class="usuarios-timeline-title-row incidencias-timeline-title-row"
                  >
                    <strong
                      class="usuarios-timeline-title incidencias-timeline-title"
                    >
                      ${escapeHtml(event.label)}
                    </strong>
                  </div>

                  <p
                    class="usuarios-timeline-body incidencias-timeline-body"
                  >
                    ${escapeHtml(
                      event.label ===
                        "Última conexión"
                        ? formatRelativeDate(
                            event.value
                          )
                        : formatDate(
                            event.value
                          )
                    )}
                  </p>

                  ${
                    event.actor
                      ? `
                        <p
                          class="usuarios-timeline-actor"
                        >
                          ${escapeHtml(
                            `Actor · ${event.actor}`
                          )}
                        </p>
                      `
                      : ""
                  }
                </div>

                <div
                  class="usuarios-timeline-meta incidencias-timeline-meta"
                >
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

function renderAdminMetadataSection(detail = {}) {
  const items = [
    [
      "Cliente vinculado",
      detail.clienteId ||
      detail.clientId ||
      "",
    ],

    [
      "NIF / CIF",
      detail.nif ||
      "",
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
      detail.updatedBy ||
      "",
    ],

    [
      "Activado por",
      detail.activatedBy ||
      detail.activatedByRole ||
      "",
    ],

    [
      "Desactivado por",
      detail.deactivatedBy ||
      detail.deactivatedByRole ||
      "",
    ],

    [
      "Motivo desactivación",
      detail.deactivationReason ||
      "",
    ],
  ].filter(
    ([, value]) =>
      cleanText(
        value,
        ""
      )
  );

  if (
    !items.length
  ) {
    return "";
  }

  return `
    <section
      class="usuarios-modal-section incidencias-modal-description-section"
    >
      ${renderSectionHeader(
        "Datos administrativos",
        "Campos seguros del detalle de administración"
      )}

      <div
        class="usuarios-modal-admin-grid incidencias-modal-meta-grid"
      >
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
      <div
        class="usuarios-modal-footer-actions"
      >
        <button
          type="button"
          class="usuarios-modal-action-btn incidencias-modal-view-btn"
          data-usuarios-modal-action="${USUARIOS_DETAIL_ACTIONS.COPY_ID}"
          ${
            !userId ||
            isRefreshing
              ? 'disabled aria-disabled="true"'
              : ""
          }
        >
          <span
            class="incidencias-modal-action-icon"
          >
            ${icon("copy")}
          </span>

          <span>
            Copiar ID
          </span>
        </button>

        <button
          type="button"
          class="usuarios-modal-action-btn incidencias-modal-view-btn"
          data-usuarios-modal-action="${USUARIOS_DETAIL_ACTIONS.REFRESH}"
          ${
            !userId ||
            isRefreshing
              ? 'disabled aria-disabled="true"'
              : ""
          }
          ${
            isRefreshing
              ? 'aria-busy="true"'
              : ""
          }
        >
          <span
            class="incidencias-modal-action-icon"
          >
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

export function renderUsuariosDetailModal(input = {}) {
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

  const email =
    getEmail(detail);

  const username =
    getUsername(detail);

  if (
    !userId &&
    !email &&
    !username
  ) {
    return "";
  }

  const name =
    getName(detail);

  const status =
    getStatus(detail);

  const city =
    getDireccion(
      detail
    ).ciudad;

  const isRefreshing =
    data.isRefreshing ===
    true;

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
          aria-busy="${isRefreshing ? "true" : "false"}"
          tabindex="-1"
        >
          <header
            class="usuarios-modal-header incidencias-modal-header"
          >
            <div
              class="usuarios-modal-hero incidencias-modal-hero"
            >
              ${renderAvatar(detail)}

              <div
                class="usuarios-modal-hero-content incidencias-modal-hero-content"
              >
                <div
                  class="usuarios-modal-hero-chips incidencias-modal-hero-chips"
                >
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
              aria-label="Cerrar detalle de ${attr(name)}"
            >
              ${icon("close")}
            </button>
          </header>

          <main
            class="usuarios-modal-body incidencias-modal-body"
          >
            <div
              class="usuarios-modal-meta-grid incidencias-modal-meta-grid"
            >
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
                  detail.emailVerified ===
                  true
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
   HOST / ROOT
========================================================= */

function getHost() {
  if (!isBrowser()) {
    return null;
  }

  const host =
    document.getElementById(
      HOST_ID
    ) ||
    document.querySelector(
      "[data-usuarios-modal-host='true']"
    );

  if (host) {
    modalState.host =
      host;
  }

  return host;
}

function ensureHost() {
  if (!isBrowser()) {
    return null;
  }

  let host =
    getHost();

  if (host) {
    return host;
  }

  host =
    document.createElement(
      "div"
    );

  host.id =
    HOST_ID;

  host.setAttribute(
    "data-usuarios-modal-host",
    "true"
  );

  document.body.appendChild(
    host
  );

  modalState.host =
    host;

  return host;
}

function getModalRoot() {
  if (!isBrowser()) {
    return null;
  }

  const host =
    modalState.host ||
    getHost();

  const root =
    host?.querySelector?.(
      `#${MODAL_ID}`
    ) ||
    null;

  modalState.root =
    root;

  modalState.panel =
    root?.querySelector?.(
      "[data-usuarios-modal-panel='true']"
    ) ||
    null;

  return root;
}

function removeDuplicateHosts(keep = null) {
  if (!isBrowser()) {
    return 0;
  }

  let removed = 0;

  for (
    const node
    of document.querySelectorAll(
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

function htmlFragment(html = "") {
  if (!isBrowser()) {
    return null;
  }

  const template =
    document.createElement(
      "template"
    );

  template.innerHTML =
    String(
      html ||
      ""
    ).trim();

  return template.content;
}


function syncElementAttributes(
  current = null,
  next = null
) {
  if (
    !current ||
    !next
  ) {
    return false;
  }

  try {
    for (
      const attribute
      of Array.from(
        current.attributes ||
        []
      )
    ) {
      if (
        !next.hasAttribute(
          attribute.name
        )
      ) {
        current.removeAttribute(
          attribute.name
        );
      }
    }

    for (
      const attribute
      of Array.from(
        next.attributes ||
        []
      )
    ) {
      current.setAttribute(
        attribute.name,
        attribute.value
      );
    }

    return true;
  } catch {
    return false;
  }
}

function captureMountedScroll(
  panel = null
) {
  if (!panel) {
    return null;
  }

  const body =
    panel.querySelector(
      ".usuarios-modal-body, .incidencias-modal-body"
    );

  return {
    bodyTop:
      Number(
        body?.scrollTop ||
        0
      ),

    bodyLeft:
      Number(
        body?.scrollLeft ||
        0
      ),
  };
}

function restoreMountedScroll(
  panel = null,
  snapshot = null
) {
  if (
    !panel ||
    !snapshot
  ) {
    return false;
  }

  const body =
    panel.querySelector(
      ".usuarios-modal-body, .incidencias-modal-body"
    );

  if (!body) {
    return false;
  }

  try {
    body.scrollTop =
      Number(
        snapshot.bodyTop ||
        0
      );

    body.scrollLeft =
      Number(
        snapshot.bodyLeft ||
        0
      );

    return true;
  } catch {
    return false;
  }
}

function captureMountedFocus(
  panel = null
) {
  if (
    !isBrowser() ||
    !panel
  ) {
    return null;
  }

  const active =
    document.activeElement;

  if (
    !active ||
    !panel.contains(active)
  ) {
    return null;
  }

  if (active === panel) {
    return {
      panel: true,
    };
  }

  return {
    panel: false,

    id:
      cleanText(
        active.id,
        ""
      ),

    action:
      cleanText(
        active.getAttribute?.(
          "data-usuarios-modal-action"
        ),
        ""
      ),

    href:
      cleanText(
        active.getAttribute?.(
          "href"
        ),
        ""
      ),

    tag:
      cleanText(
        active.tagName,
        ""
      ).toLowerCase(),
  };
}

function restoreMountedFocus(
  panel = null,
  snapshot = null
) {
  if (
    !panel ||
    !snapshot
  ) {
    return false;
  }

  if (
    snapshot.panel ===
    true
  ) {
    try {
      panel.focus?.({
        preventScroll: true,
      });

      return true;
    } catch {
      return false;
    }
  }

  let target = null;

  try {
    if (snapshot.id) {
      target =
        panel.querySelector(
          `#${globalThis?.CSS?.escape ? globalThis.CSS.escape(snapshot.id) : snapshot.id}`
        );
    }

    if (
      !target &&
      snapshot.action
    ) {
      target =
        panel.querySelector(
          `[data-usuarios-modal-action="${snapshot.action}"]`
        );
    }

    if (
      !target &&
      snapshot.href
    ) {
      target =
        Array.from(
          panel.querySelectorAll(
            "a[href]"
          )
        ).find(
          (node) =>
            cleanText(
              node.getAttribute(
                "href"
              ),
              ""
            ) === snapshot.href
        ) ||
        null;
    }

    if (
      target?.focus &&
      target.getAttribute?.(
        "aria-disabled"
      ) !== "true" &&
      !target.disabled
    ) {
      target.focus({
        preventScroll: true,
      });

      return true;
    }
  } catch {
    // panel fallback debajo
  }

  try {
    panel.focus?.({
      preventScroll: true,
    });

    return true;
  } catch {
    return false;
  }
}

function patchMountedShell(
  host = null,
  fragment = null
) {
  if (
    !host ||
    !fragment
  ) {
    return false;
  }

  const currentRoot =
    host.querySelector(
      `#${MODAL_ID}`
    );

  const currentOverlay =
    currentRoot?.querySelector?.(
      "[data-usuarios-modal-overlay='true']"
    );

  const currentPanel =
    currentRoot?.querySelector?.(
      "[data-usuarios-modal-panel='true']"
    );

  const nextRoot =
    fragment.querySelector?.(
      `#${MODAL_ID}`
    );

  const nextOverlay =
    nextRoot?.querySelector?.(
      "[data-usuarios-modal-overlay='true']"
    );

  const nextPanel =
    nextRoot?.querySelector?.(
      "[data-usuarios-modal-panel='true']"
    );

  if (
    !currentRoot ||
    !currentOverlay ||
    !currentPanel ||
    !nextRoot ||
    !nextOverlay ||
    !nextPanel
  ) {
    return false;
  }

  const currentId =
    cleanText(
      currentRoot.getAttribute(
        "data-user-id"
      ),
      ""
    );

  const nextId =
    cleanText(
      nextRoot.getAttribute(
        "data-user-id"
      ),
      ""
    );

  /*
    Para el mismo usuario hacemos patch estable.
    Si cambia la identidad explícitamente, permitimos un mount limpio.
  */
  if (
    currentId &&
    nextId &&
    currentId !== nextId
  ) {
    return false;
  }

  const scrollSnapshot =
    captureMountedScroll(
      currentPanel
    );

  const focusSnapshot =
    captureMountedFocus(
      currentPanel
    );

  syncElementAttributes(
    currentRoot,
    nextRoot
  );

  syncElementAttributes(
    currentOverlay,
    nextOverlay
  );

  syncElementAttributes(
    currentPanel,
    nextPanel
  );

  /*
    ANTI-PARPADEO:
    NO sustituimos root/overlay/panel.
    incidencias/detail.css anima overlay y panel al entrar; si esos nodos
    se recrean tras el GET de detalle, la animación vuelve a empezar y el
    usuario ve un doble open/flicker.
  */
  currentPanel.replaceChildren(
    ...Array.from(
      nextPanel.childNodes
    )
  );

  modalState.root =
    currentRoot;

  modalState.panel =
    currentPanel;

  restoreMountedScroll(
    currentPanel,
    scrollSnapshot
  );

  restoreMountedFocus(
    currentPanel,
    focusSnapshot
  );

  return true;
}

/* =========================================================
   BODY LOCK
========================================================= */

function lockBody() {
  if (!isBrowser()) {
    return false;
  }

  if (
    modalState.bodyLocked
  ) {
    return true;
  }

  try {
    modalState.previousBodyOverflow =
      document.body.style.overflow ||
      "";

    modalState.previousBodyClasses =
      new Map();

    for (
      const className
      of BODY_LOCK_CLASSES
    ) {
      modalState.previousBodyClasses.set(
        className,
        document.body.classList.contains(
          className
        )
      );

      document.body.classList.add(
        className
      );
    }

    document.body.style.overflow =
      "hidden";

    modalState.bodyLocked =
      true;

    return true;
  } catch {
    return false;
  }
}

function unlockBody() {
  if (!isBrowser()) {
    modalState.bodyLocked =
      false;

    return false;
  }

  if (
    !modalState.bodyLocked
  ) {
    return true;
  }

  try {
    for (
      const className
      of BODY_LOCK_CLASSES
    ) {
      const existedBefore =
        modalState.previousBodyClasses.get(
          className
        ) === true;

      if (!existedBefore) {
        document.body.classList.remove(
          className
        );
      }
    }

    document.body.style.overflow =
      modalState.previousBodyOverflow ||
      "";

    modalState.previousBodyOverflow =
      "";

    modalState.previousBodyClasses =
      new Map();

    modalState.bodyLocked =
      false;

    return true;
  } catch {
    modalState.bodyLocked =
      false;

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
    active !==
      document.body
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
    getModalRoot()?.querySelector?.(
      "[data-usuarios-modal-panel='true']"
    );

  if (!panel) {
    return false;
  }

  try {
    panel.focus?.({
      preventScroll: true,
    });

    return true;
  } catch {
    try {
      panel.focus?.();
      return true;
    } catch {
      return false;
    }
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

  if (!panel) {
    return [];
  }

  return Array.from(
    panel.querySelectorAll(
      [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",")
    )
  ).filter(
    (element) =>
      element &&
      !element.hidden &&
      element.getAttribute?.(
        "aria-hidden"
      ) !== "true" &&
      element.getAttribute?.(
        "aria-disabled"
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
    (
      active ===
        firstElement ||
      !modalState.panel?.contains?.(
        active
      )
    )
  ) {
    event.preventDefault?.();
    lastElement.focus?.();

    return true;
  }

  if (
    !event.shiftKey &&
    (
      active ===
        lastElement ||
      !modalState.panel?.contains?.(
        active
      )
    )
  ) {
    event.preventDefault?.();
    firstElement.focus?.();

    return true;
  }

  return false;
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function onRootClick(event = null) {
  const target =
    event?.target;

  if (
    typeof Element ===
      "undefined" ||
    !(
      target instanceof
      Element
    )
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
      void handleRefresh();
      return;
    }
  }

  const overlay =
    target.closest(
      "[data-usuarios-modal-overlay='true']"
    );

  if (
    overlay &&
    event.target ===
      overlay
  ) {
    closeUsuariosModal();
  }
}

function onRootError(event = null) {
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

  if (!frame) {
    return;
  }

  target.hidden =
    true;

  frame.setAttribute(
    "data-has-avatar",
    "false"
  );

  frame.setAttribute(
    "data-fallback",
    "true"
  );

  frame.classList.add(
    "usuarios-modal-avatar-frame--fallback",
    "incidencias-modal-avatar-frame--fallback"
  );
}

function onDocumentKeydown(event = null) {
  if (
    !modalState.isOpen
  ) {
    return;
  }

  if (
    event?.key ===
    "Escape"
  ) {
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

  const host =
    modalState.host ||
    ensureHost();

  if (!host) {
    return false;
  }

  detachRootBindings();

  modalState.clickHandler =
    onRootClick;

  modalState.errorHandler =
    onRootError;

  modalState.keydownHandler =
    onDocumentKeydown;

  host.addEventListener(
    "click",
    modalState.clickHandler
  );

  host.addEventListener(
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

  const host =
    modalState.host;

  try {
    if (
      host &&
      modalState.clickHandler
    ) {
      host.removeEventListener(
        "click",
        modalState.clickHandler
      );
    }

    if (
      host &&
      modalState.errorHandler
    ) {
      host.removeEventListener(
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
   RENDER CONTROL
========================================================= */

function renderMounted({
  focus = false,
  forceMount = false,
} = {}) {
  if (!isBrowser()) {
    return null;
  }

  const host =
    ensureHost();

  if (!host) {
    return null;
  }

  removeDuplicateHosts(
    host
  );

  const html =
    modalState.isOpen
      ? renderUsuariosDetailModal({
          detail:
            modalState.detail,

          isRefreshing:
            modalState.isRefreshing,
        })
      : "";

  const fragment =
    htmlFragment(html);

  if (!fragment) {
    return null;
  }

  const hasMountedPanel =
    Boolean(
      host.querySelector(
        "[data-usuarios-modal-panel='true']"
      )
    );

  /*
    Primer open:
      mount completo -> la animación CSS se ejecuta una sola vez.

    update()/refresh():
      root, overlay y panel permanecen físicamente iguales.
      Sólo cambia el interior del panel.
  */
  const patched =
    (
      !forceMount &&
      hasMountedPanel
    )
      ? patchMountedShell(
          host,
          fragment
        )
      : false;

  if (!patched) {
    detachRootBindings();

    host.replaceChildren(
      fragment
    );

    modalState.root =
      host.querySelector(
        `#${MODAL_ID}`
      );

    modalState.panel =
      host.querySelector(
        "[data-usuarios-modal-panel='true']"
      );
  }

  modalState.host =
    host;

  /*
    Los listeners viven en el host/document, no dentro del contenido
    sustituido, así que el patch estable no necesita desmontarlos.
  */
  attachRootBindings();

  if (focus) {
    focusPanel();
  }

  return host;
}

function clearRefreshTimer() {
  if (
    !modalState.refreshTimer ||
    !isBrowser()
  ) {
    modalState.refreshTimer =
      0;

    return false;
  }

  try {
    window.clearTimeout(
      modalState.refreshTimer
    );
  } catch {
    // noop
  }

  modalState.refreshTimer =
    0;

  return true;
}

function finishRefresh(
  sequence = 0,
  {
    render = true,
  } = {}
) {
  if (
    sequence &&
    modalState.refreshSeq !==
      sequence
  ) {
    return false;
  }

  clearRefreshTimer();

  modalState.isRefreshing =
    false;

  if (
    render &&
    modalState.isOpen
  ) {
    renderMounted({
      focus: false,
    });
  }

  return true;
}

function armRefreshFallback(
  sequence = 0
) {
  if (!isBrowser()) {
    return false;
  }

  clearRefreshTimer();

  modalState.refreshTimer =
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

        finishRefresh(
          sequence,
          {
            render: true,
          }
        );
      },
      REFRESH_FALLBACK_TIMEOUT_MS
    );

  return true;
}

/* =========================================================
   CLIPBOARD
========================================================= */

async function writeClipboardText(text = "") {
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
      navigator?.clipboard
        ?.writeText
    ) {
      await navigator.clipboard
        .writeText(
          value
        );

      return true;
    }
  } catch {
    // textarea fallback debajo
  }

  let textarea = null;

  try {
    textarea =
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

    textarea.style.inset =
      "0 auto auto -9999px";

    textarea.style.opacity =
      "0";

    textarea.style.pointerEvents =
      "none";

    document.body.appendChild(
      textarea
    );

    textarea.focus();
    textarea.select();

    const copied =
      document.execCommand(
        "copy"
      );

    return Boolean(copied);
  } catch {
    return false;
  } finally {
    try {
      textarea?.remove?.();
    } catch {
      // noop
    }
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

  const controller =
    getActiveUsuariosController();

  if (
    isFunction(
      controller?.copyUsuarioId
    )
  ) {
    try {
      const result =
        await controller.copyUsuarioId(
          userId
        );

      if (result !== false) {
        return true;
      }
    } catch {
      // clipboard local debajo
    }
  }

  const copied =
    await writeClipboardText(
      userId
    );

  if (copied) {
    showToast(
      "ID de usuario copiado.",
      "success"
    );

    safeEmit(
      "usuarios:modal:copied",
      {
        userId,
        source:
          USUARIOS_MODAL_TEMPLATE_VERSION,
      }
    );

    return true;
  }

  showToast(
    "No se pudo copiar el ID del usuario.",
    "error"
  );

  return false;
}

/* =========================================================
   REFRESH
========================================================= */

async function handleRefresh() {
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

  clearRefreshTimer();

  modalState.isRefreshing =
    true;

  modalState.refreshSeq += 1;

  const sequence =
    modalState.refreshSeq;

  renderMounted({
    focus: false,
  });

  const controller =
    getActiveUsuariosController();

  if (
    isFunction(
      controller?.refreshUsuario
    )
  ) {
    try {
      const detail =
        await controller.refreshUsuario(
          userId
        );

      /*
        refreshUsuario del controlador ya puede haber ejecutado
        modal.update(detail). Si eso ocurrió, refreshSeq cambia y
        no debemos renderizar dos veces.
      */
      if (
        modalState.refreshSeq !==
        sequence
      ) {
        return Boolean(detail);
      }

      if (detail) {
        const normalized =
          normalizeDetail(
            detail
          );

        if (
          getUserId(normalized) ===
          userId
        ) {
          modalState.detail =
            normalized;
        }
      }

      finishRefresh(
        sequence,
        {
          render: true,
        }
      );

      return Boolean(detail);
    } catch (error) {
      if (
        modalState.refreshSeq ===
        sequence
      ) {
        finishRefresh(
          sequence,
          {
            render: true,
          }
        );
      }

      showToast(
        cleanText(
          first(
            error?.message,
            "No se pudo actualizar el usuario."
          ),
          "No se pudo actualizar el usuario."
        ),
        "error"
      );

      return false;
    }
  }

  /*
    Compatibilidad con controladores antiguos:
    delegamos por event bus y usamos timeout defensivo.
  */
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
    finishRefresh(
      sequence,
      {
        render: true,
      }
    );

    showToast(
      "No se pudo solicitar la actualización del usuario.",
      "error"
    );

    return false;
  }

  armRefreshFallback(
    sequence
  );

  return true;
}

/* =========================================================
   PUBLIC OPEN / CLOSE / UPDATE
========================================================= */

export function openUsuariosModal(detail = {}) {
  attachBus();

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

  const wasOpen =
    modalState.isOpen;

  if (isBrowser()) {
    const host =
      ensureHost();

    removeDuplicateHosts(
      host
    );

    /*
      Sólo capturamos el foco externo al abrir de verdad.
      Un open() sobre modal ya abierto no puede sustituir el
      elemento al que debemos devolver el foco al cerrar.
    */
    if (!wasOpen) {
      modalState.lastActiveElement =
        captureActiveElement();
    }
  }

  modalState.detail =
    normalized;

  modalState.isOpen =
    true;

  modalState.isRefreshing =
    false;

  modalState.refreshSeq += 1;

  clearRefreshTimer();

  lockBody();

  renderMounted({
    focus: !wasOpen,
    forceMount: !wasOpen,
  });

  safeEmit(
    wasOpen
      ? "usuarios:modal:updated"
      : "usuarios:modal:opened",
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
  const wasOpen =
    modalState.isOpen;

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

  clearRefreshTimer();

  modalState.detail =
    null;

  detachRootBindings();

  const host =
    modalState.host ||
    getHost();

  try {
    host?.replaceChildren?.();
  } catch {
    try {
      if (host) {
        host.innerHTML = "";
      }
    } catch {
      // noop
    }
  }

  modalState.root =
    null;

  modalState.panel =
    null;

  unlockBody();

  if (isBrowser()) {
    window.setTimeout(
      () =>
        restoreFocus(),
      0
    );
  } else {
    modalState.lastActiveElement =
      null;
  }

  if (wasOpen) {
    safeEmit(
      "usuarios:modal:closed",
      {
        userId,

        source:
          USUARIOS_MODAL_TEMPLATE_VERSION,
      }
    );
  }

  return true;
}

export function updateUsuariosModal(detail = {}) {
  const normalized =
    normalizeDetail(detail);

  if (
    !getUserId(normalized) &&
    !getEmail(normalized) &&
    !getUsername(normalized)
  ) {
    return false;
  }

  if (
    !modalState.isOpen
  ) {
    /*
      update() no abre.
      Evita que una respuesta asíncrona tardía reabra un modal cerrado.
      La apertura pertenece exclusivamente a openUsuariosModal().
    */
    return false;
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
    currentId !==
      incomingId
  ) {
    return false;
  }

  modalState.detail =
    normalized;

  modalState.isRefreshing =
    false;

  modalState.refreshSeq += 1;

  clearRefreshTimer();

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

export async function refreshUsuariosModal() {
  return handleRefresh();
}

export async function copyUsuariosModalId() {
  return handleCopyId();
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail =
    unwrapEventDetail(
      event
    );

  if (
    !Object.keys(detail)
      .length
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
    unwrapEventDetail(
      event
    );

  if (
    !Object.keys(detail)
      .length
  ) {
    return;
  }

  updateUsuariosModal(
    detail
  );
}

function handleDetailRefreshEvent(event) {
  const detail =
    unwrapEventDetail(
      event
    );

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

  const normalized =
    normalizeDetail(
      detail
    );

  const incomingId =
    getUserId(
      normalized
    );

  if (
    currentId &&
    incomingId &&
    currentId !==
      incomingId
  ) {
    return;
  }

  updateUsuariosModal(
    normalized
  );
}

function attachBus() {
  if (busAttached) {
    return true;
  }

  const subscriptions = [
    [
      "usuarios:modal:open",
      handleOpenEvent,
    ],

    [
      "usuarios:modal:close",
      handleCloseEvent,
    ],

    [
      "usuarios:modal:update",
      handleUpdateEvent,
    ],

    [
      "usuarios:detail:refresh",
      handleDetailRefreshEvent,
    ],

    [
      "usuarios:detail:success",
      handleDetailRefreshEvent,
    ],
  ];

  for (
    const [
      eventName,
      handler,
    ]
    of subscriptions
  ) {
    busUnsubscribers.push(
      subscribeEvent(
        eventName,
        handler
      )
    );
  }

  busAttached =
    true;

  return true;
}

function detachBus() {
  while (
    busUnsubscribers.length
  ) {
    const unsubscribe =
      busUnsubscribers.pop();

    try {
      unsubscribe?.();
    } catch {
      // noop
    }
  }

  busAttached =
    false;

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
      "activationUrl",
      "activationToken",
      "resetUrl",
      "resetToken",
      "password",
      "raw",
    ],

    architecture: {
      http:
        false,

      localModelNormalization:
        false,

      canonicalApiModel:
        true,

      cssInjection:
        false,

      templateInlineStyles:
        false,

      inlineHandlers:
        false,

      sharedDetailCss:
        "incidencias-modal-*",

      stableHost:
        HOST_ID,

      modalRoot:
        MODAL_ID,

      stableHostRerender:
        true,

      stableRootOverlayPanel:
        true,

      panelEntryAnimationOnce:
        true,

      innerContentPatchOnUpdate:
        true,

      scrollPreservedOnPatch:
        true,

      focusPreservedOnPatch:
        true,

      updateNeverOpensClosedModal:
        true,

      noNestedModalOnRerender:
        true,

      bodyLockIdempotent:
        true,

      bodyClassRestore:
        true,

      dataImageAvatarAllowed:
        false,

      azureSasAvatarHost:
        TRUSTED_BLOB_HOST,

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

      refreshEventFallback:
        true,

      copyViaControllerOrClipboard:
        true,

      publicStateRawRemoved:
        true,
    },
  };
}

export const getSnapshot =
  getUsuariosModalSnapshot;

/* =========================================================
   DESTROY
========================================================= */

function destroyUsuariosModal() {
  const wasOpen =
    modalState.isOpen;

  const userId =
    getUserId(
      modalState.detail ||
      {}
    );

  clearRefreshTimer();

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
    modalState.host ||
    getHost();

  try {
    host?.remove?.();
  } catch {
    // noop
  }

  modalState.host =
    null;

  modalState.root =
    null;

  modalState.panel =
    null;

  if (
    wasOpen &&
    isBrowser()
  ) {
    window.setTimeout(
      () =>
        restoreFocus(),
      0
    );
  } else {
    modalState.lastActiveElement =
      null;
  }

  detachBus();

  if (wasOpen) {
    safeEmit(
      "usuarios:modal:destroyed",
      {
        userId,
        source:
          USUARIOS_MODAL_TEMPLATE_VERSION,
      }
    );
  }

  return true;
}

/* =========================================================
   PUBLIC BRIDGE
========================================================= */

export const OnionUsuariosModal =
  Object.freeze({
    version:
      USUARIOS_MODAL_TEMPLATE_VERSION,

    actions:
      USUARIOS_DETAIL_ACTIONS,

    open(detail = {}) {
      return openUsuariosModal(
        detail
      );
    },

    close() {
      return closeUsuariosModal();
    },

    update(detail = {}) {
      return updateUsuariosModal(
        detail
      );
    },

    refresh() {
      return refreshUsuariosModal();
    },

    copyId() {
      return copyUsuariosModalId();
    },

    getState:
      getUsuariosModalState,

    getSnapshot:
      getUsuariosModalSnapshot,

    render:
      renderUsuariosDetailModal,

    renderClosed:
      renderUsuariosDetailModalClosed,

    destroy:
      destroyUsuariosModal,
  });

export const open =
  openUsuariosModal;

export const close =
  closeUsuariosModal;

export const update =
  updateUsuariosModal;

export const refresh =
  refreshUsuariosModal;

export const copyId =
  copyUsuariosModalId;

export const destroy =
  destroyUsuariosModal;

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
