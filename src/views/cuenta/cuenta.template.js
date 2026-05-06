/* =========================================================
   Onion SPA - Cuenta Template
   Archivo: src/views/cuenta/cuenta.template.js

   EXTREME PRO SYSTEM · ACCOUNT SETTINGS COMMAND CENTER · CLEAN TEMPLATE 10/10
   NO INLINE CSS · NO STYLE INJECTION · NO INLINE IMG HANDLERS · CSP CLEAN
   VARIABLES.CSS + UI.CSS + CUENTA.CSS EXTERNAL ONLY

   RESPONSABILIDADES:
   - render header premium de cuenta
   - render panel productivo de ajustes
   - render perfil / apariencia / idioma / seguridad / actividad
   - render loading / error / empty
   - soportar avatar real + fallback por iniciales
   - soportar darkMode / idioma / cambio de contraseña
   - mantener compatibilidad con cuentaView.js
   - mantener compatibilidad con cuenta.bindings.js
   - acciones compatibles con data-action
   - inputs compatibles con data-role
   - no inyectar CSS desde JS
   - no usar handlers inline
   - no definir :root local
========================================================= */

import { cuentaState } from "./cuenta.state.js";
import { getCuentaStore } from "./cuenta.store.js";
import { normalizeCuentaModel } from "./cuenta.model.js";

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let text = value
      .trim()
      .replace(/€/g, "")
      .replace(/%/g, "")
      .replace(/\s+/g, "");

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    if (hasComma && hasDot) {
      text = text.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma) {
      text = text.replace(/,/g, ".");
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value !== 0;
  }

  if (typeof value === "string") {
    const key = normalizeKey(value);

    if (
      [
        "true",
        "1",
        "yes",
        "y",
        "si",
        "sí",
        "on",
        "dark",
        "enabled",
        "activo",
        "activa",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "n",
        "off",
        "light",
        "disabled",
        "inactivo",
        "inactiva",
      ].includes(key)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function truncate(value = "", max = 120) {
  const text = safeText(value, "");
  const limit = Math.max(1, safeNumber(max, 120));

  if (!text) return "";
  if (text.length <= limit) return text;

  return `${text.slice(0, limit).trim()}…`;
}

function isRenderableImageUrl(value = "") {
  const raw = safeText(value, "");
  if (!raw) return false;

  if (raw.startsWith("data:image/")) return true;
  if (raw.startsWith("blob:")) return true;
  if (raw.startsWith("/")) return true;
  if (raw.startsWith("./")) return true;
  if (raw.startsWith("../")) return true;

  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/* =========================================================
   FORMAT
========================================================= */

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatDateOnly(value = null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

/* =========================================================
   DATA RESOLUTION
========================================================= */

function resolveCuentaItem(item = null) {
  if (item && typeof item === "object") {
    return normalizeCuentaModel(item);
  }

  try {
    const fromStore = getCuentaStore();

    if (fromStore) {
      return normalizeCuentaModel(fromStore);
    }
  } catch {}

  try {
    const fromState = safeObject(cuentaState?.item);

    if (Object.keys(fromState).length) {
      return normalizeCuentaModel(fromState);
    }
  } catch {}

  return null;
}

function getDisplayName(detail = {}) {
  return safeText(
    first(
      detail.name,
      detail.fullName,
      detail.displayName,
      detail.nombre,
      detail.username,
      detail.email,

      detail.profile?.name,
      detail.profile?.fullName,
      detail.profile?.displayName,

      detail.user?.name,
      detail.user?.fullName,
      detail.user?.displayName,

      detail.raw?.name,
      detail.raw?.fullName,
      detail.raw?.displayName,
      detail.raw?.nombre,
      detail.raw?.username,
      detail.raw?.email,
      detail.raw?.user?.name,
      detail.raw?.user?.displayName
    ),
    "Usuario Onion"
  );
}

function getEmail(detail = {}) {
  return safeText(
    first(
      detail.email,
      detail.emailLower,
      detail.mail,
      detail.userEmail,
      detail.profile?.email,
      detail.user?.email,
      detail.raw?.email,
      detail.raw?.emailLower,
      detail.raw?.mail,
      detail.raw?.user?.email
    ),
    "Sin email"
  );
}

function getUsername(detail = {}) {
  return safeText(
    first(
      detail.username,
      detail.usernameLower,
      detail.userName,
      detail.slug,
      detail.handle,
      detail.profile?.username,
      detail.user?.username,
      detail.raw?.username,
      detail.raw?.usernameLower,
      detail.raw?.slug,
      detail.raw?.handle,
      detail.raw?.user?.username
    ),
    "sin-usuario"
  );
}

function getUserId(detail = {}) {
  return safeText(
    first(
      detail.userId,
      detail.id,
      detail.uid,
      detail.sub,
      detail.accountId,
      detail.profileId,
      detail.user?.userId,
      detail.user?.id,
      detail.raw?.userId,
      detail.raw?.id,
      detail.raw?.uid,
      detail.raw?.sub,
      detail.raw?.user?.userId,
      detail.raw?.user?.id
    ),
    "—"
  );
}

function getClienteId(detail = {}) {
  return safeText(
    first(
      detail.clienteId,
      detail.clientId,
      detail.customerId,
      detail.cliente?.clienteId,
      detail.cliente?.id,
      detail.client?.id,
      detail.customer?.id,
      detail.raw?.clienteId,
      detail.raw?.clientId,
      detail.raw?.customerId,
      detail.raw?.cliente?.clienteId,
      detail.raw?.cliente?.id
    ),
    "—"
  );
}

function getRoleValue(detail = {}) {
  const role = first(
    detail.role,
    detail.rol,
    detail.accountRole,
    detail.profileRole,
    detail.user?.role,
    detail.raw?.role,
    detail.raw?.rol,
    detail.raw?.user?.role,
    "user"
  );

  if (role && typeof role === "object") {
    return normalizeKey(first(role.name, role.nombre, role.code, role.id, "user"));
  }

  return normalizeKey(role);
}

function getRole(detail = {}) {
  const role = getRoleValue(detail);

  if (role === "admin" || role === "administrator") return "Administrador";
  if (role === "superadmin" || role === "super_admin" || role === "root") return "Super admin";
  if (role === "support" || role === "soporte") return "Soporte";
  if (role === "technician" || role === "tecnico" || role === "técnico") return "Técnico";
  if (role === "owner") return "Owner";
  if (role === "client" || role === "cliente") return "Cliente";
  if (role === "user") return "Usuario";

  return safeText(role, "Usuario");
}

function getPhone(detail = {}) {
  return safeText(
    first(
      detail.phone,
      detail.telefono,
      detail.mobile,
      detail.telefonoMovil,
      detail.profile?.phone,
      detail.profile?.telefono,
      detail.user?.phone,
      detail.raw?.phone,
      detail.raw?.telefono,
      detail.raw?.mobile,
      detail.raw?.user?.phone
    ),
    "No configurado"
  );
}

function getAvatarUrl(detail = {}) {
  return safeText(
    first(
      detail.avatarUrl,
      detail.avatarURL,
      detail.avatar_url,
      detail.avatar,
      detail.photoUrl,
      detail.photoURL,
      detail.photo_url,
      detail.photo,
      detail.imageUrl,
      detail.image,
      detail.picture,
      detail.pictureUrl,
      detail.profilePicture,
      detail.profilePictureUrl,

      detail.profile?.avatarUrl,
      detail.profile?.avatar,
      detail.profile?.photoUrl,
      detail.profile?.photo,
      detail.profile?.imageUrl,
      detail.profile?.image,
      detail.profile?.picture,

      detail.user?.avatarUrl,
      detail.user?.avatar,
      detail.user?.photoUrl,
      detail.user?.photo,
      detail.user?.imageUrl,
      detail.user?.image,
      detail.user?.picture,

      detail.raw?.avatarUrl,
      detail.raw?.avatarURL,
      detail.raw?.avatar_url,
      detail.raw?.avatar,
      detail.raw?.photoUrl,
      detail.raw?.photoURL,
      detail.raw?.photo_url,
      detail.raw?.photo,
      detail.raw?.imageUrl,
      detail.raw?.image,
      detail.raw?.picture,
      detail.raw?.pictureUrl,
      detail.raw?.profilePicture,
      detail.raw?.profilePictureUrl,

      detail.raw?.profile?.avatarUrl,
      detail.raw?.profile?.avatar,
      detail.raw?.profile?.photoUrl,
      detail.raw?.profile?.photo,
      detail.raw?.profile?.imageUrl,
      detail.raw?.user?.avatarUrl,
      detail.raw?.user?.avatar,
      detail.raw?.user?.photoUrl,
      detail.raw?.user?.photo,
      detail.raw?.user?.imageUrl,
      detail.raw?.user?.image,
      detail.raw?.user?.picture
    ),
    ""
  );
}

function getCreatedAt(detail = {}) {
  return first(
    detail.createdAt,
    detail.created_at,
    detail.created,
    detail.registeredAt,
    detail.user?.createdAt,
    detail.raw?.createdAt,
    detail.raw?.created_at,
    detail.raw?.created,
    detail.raw?.registeredAt,
    detail.raw?.user?.createdAt
  );
}

function getUpdatedAt(detail = {}) {
  return first(
    detail.updatedAt,
    detail.updated_at,
    detail.modifiedAt,
    detail.lastUpdatedAt,
    detail.preferences?.updatedAt,
    detail.settings?.updatedAt,
    detail.user?.updatedAt,
    detail.createdAt,
    detail.raw?.updatedAt,
    detail.raw?.updated_at,
    detail.raw?.modifiedAt,
    detail.raw?.lastUpdatedAt,
    detail.raw?.preferences?.updatedAt,
    detail.raw?.settings?.updatedAt,
    detail.raw?.user?.updatedAt,
    detail.raw?.createdAt
  );
}

function getLastLoginAt(detail = {}) {
  return first(
    detail.lastLoginAt,
    detail.lastLogin,
    detail.lastSeenAt,
    detail.lastAccessAt,
    detail.session?.lastLoginAt,
    detail.raw?.lastLoginAt,
    detail.raw?.lastLogin,
    detail.raw?.lastSeenAt,
    detail.raw?.lastAccessAt,
    detail.raw?.session?.lastLoginAt
  );
}

function getLangValue(detail = {}) {
  const lang = normalizeKey(
    first(
      detail.lang,
      detail.language,
      detail.locale,
      detail.idioma,
      detail.preferences?.lang,
      detail.preferences?.language,
      detail.preferences?.locale,
      detail.settings?.lang,
      detail.settings?.language,
      detail.settings?.locale,
      detail.raw?.lang,
      detail.raw?.language,
      detail.raw?.locale,
      detail.raw?.idioma,
      detail.raw?.preferences?.lang,
      detail.raw?.preferences?.language,
      detail.raw?.settings?.lang,
      detail.raw?.settings?.language,
      "es"
    )
  );

  if (["en", "eng", "english", "en_us", "en_gb"].includes(lang)) return "en";
  if (["ca", "cat", "catala", "catalan", "ca_es"].includes(lang)) return "ca";

  return "es";
}

function getLangLabel(detail = {}) {
  const lang = getLangValue(detail);

  if (lang === "ca") return "Català";
  if (lang === "en") return "English";

  return "Español";
}

function getThemeValue(detail = {}) {
  const explicitTheme = normalizeKey(
    first(
      detail.theme,
      detail.mode,
      detail.appearance,
      detail.colorMode,
      detail.preferences?.theme,
      detail.preferences?.mode,
      detail.preferences?.appearance,
      detail.settings?.theme,
      detail.settings?.mode,
      detail.settings?.appearance,
      detail.raw?.theme,
      detail.raw?.mode,
      detail.raw?.appearance,
      detail.raw?.preferences?.theme,
      detail.raw?.settings?.theme,
      ""
    )
  );

  if (["dark", "oscuro", "night", "theme_dark"].includes(explicitTheme)) return "dark";
  if (["light", "claro", "day", "theme_light"].includes(explicitTheme)) return "light";

  return safeBoolean(
    first(
      detail.darkMode,
      detail.isDark,
      detail.preferences?.darkMode,
      detail.settings?.darkMode,
      detail.raw?.darkMode,
      detail.raw?.isDark,
      detail.raw?.preferences?.darkMode,
      detail.raw?.settings?.darkMode
    ),
    false
  )
    ? "dark"
    : "light";
}

function isDarkMode(detail = {}) {
  return getThemeValue(detail) === "dark";
}

function getThemeLabel(detail = {}) {
  return isDarkMode(detail) ? "Dark mode" : "Light mode";
}

function getThemeStatusLabel(detail = {}) {
  return isDarkMode(detail) ? "Tema oscuro activo" : "Tema claro activo";
}

function getPrivacyMode(detail = {}) {
  return safeBoolean(
    first(
      detail.privacyMode,
      detail.privateMode,
      detail.preferences?.privacyMode,
      detail.settings?.privacyMode,
      detail.raw?.privacyMode,
      detail.raw?.privateMode,
      detail.raw?.preferences?.privacyMode,
      detail.raw?.settings?.privacyMode
    ),
    false
  );
}

function getPrivacyLabel(detail = {}) {
  return getPrivacyMode(detail) ? "Privacidad activa" : "Privacidad estándar";
}

function getSecurityStatusLabel(detail = {}) {
  const lastLogin = getLastLoginAt(detail);

  if (lastLogin) {
    return `Último acceso ${formatRelativeDate(lastLogin)}`;
  }

  return "Cambio manual";
}

function getAccountStatus(detail = {}) {
  const status = normalizeKey(
    first(
      detail.status,
      detail.estado,
      detail.accountStatus,
      detail.profileStatus,
      detail.raw?.status,
      detail.raw?.estado,
      detail.raw?.accountStatus,
      "active"
    )
  );

  if (["active", "activo", "enabled"].includes(status)) return "Activa";
  if (["pending", "pendiente"].includes(status)) return "Pendiente";
  if (["blocked", "bloqueada", "disabled", "inactive", "inactivo"].includes(status)) return "Bloqueada";
  if (["suspended", "suspendida"].includes(status)) return "Suspendida";

  return safeText(status, "Activa");
}

function getAccountStatusTone(detail = {}) {
  const status = normalizeKey(getAccountStatus(detail));

  if (["activa", "active"].includes(status)) return "success";
  if (["pendiente", "pending"].includes(status)) return "warning";
  if (["bloqueada", "blocked", "disabled", "suspendida", "suspended"].includes(status)) return "danger";

  return "default";
}

function getInitials(value = "") {
  const text = normalizeWhitespace(value);

  if (!text) return "ON";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="cuenta-inline-loading">
      <span class="cuenta-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="cuenta-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderChip(label = "", tone = "default") {
  return `
    <span class="cuenta-chip cuenta-chip--${escapeHtml(tone)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderAvatar(detail = {}, size = "hero") {
  const name = getDisplayName(detail);
  const initials = getInitials(name);
  const avatarUrl = getAvatarUrl(detail);
  const hasImage = isRenderableImageUrl(avatarUrl);

  return `
    <div
      class="cuenta-avatar cuenta-avatar--${escapeHtml(size)}${hasImage ? " has-image" : ""}"
      title="${escapeHtml(name)}"
      aria-label="${escapeHtml(name)}"
      data-tooltip="${escapeHtml(name)}"
      data-has-avatar="${hasImage ? "true" : "false"}"
    >
      ${
        hasImage
          ? `
            <img
              src="${escapeHtml(avatarUrl)}"
              alt="${escapeHtml(name)}"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              data-role="cuenta-avatar-img"
            />
          `
          : ""
      }

      <span class="cuenta-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderMetaRow(label = "", value = "", tone = "default") {
  return `
    <div class="cuenta-meta-row cuenta-meta-row--${escapeHtml(tone)}">
      <span class="cuenta-meta-label">${escapeHtml(label)}</span>
      <strong class="cuenta-meta-value">${escapeHtml(safeText(value, "—"))}</strong>
    </div>
  `;
}

function renderMiniStat({ label = "", value = "", tone = "default" } = {}) {
  return `
    <div class="cuenta-mini-stat cuenta-mini-stat--${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderField({
  label = "",
  value = "",
  dataRole = "",
  id = "",
  type = "text",
  placeholder = "",
  readonly = false,
  disabled = false,
  autocomplete = "",
} = {}) {
  return `
    <label class="cuenta-field">
      <span class="cuenta-field-label">${escapeHtml(label)}</span>

      <input
        ${id ? `id="${escapeHtml(id)}"` : ""}
        data-role="${escapeHtml(dataRole)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(safeText(value, ""))}"
        placeholder="${escapeHtml(placeholder)}"
        ${autocomplete ? `autocomplete="${escapeHtml(autocomplete)}"` : ""}
        ${readonly ? "readonly" : ""}
        ${disabled ? "disabled" : ""}
      />
    </label>
  `;
}

function renderSwitchRow({
  title = "",
  description = "",
  checked = false,
  inputId = "",
  dataRole = "",
  action = "",
  disabled = false,
  checkedLabel = "Activo",
  uncheckedLabel = "Inactivo",
  buttonLabel = "",
} = {}) {
  return `
    <div class="cuenta-control-row">
      <div class="cuenta-control-copy">
        <strong class="cuenta-control-title">${escapeHtml(title)}</strong>
        <span class="cuenta-control-description">${escapeHtml(description)}</span>
      </div>

      <div class="cuenta-switch-area">
        <label
          for="${escapeHtml(inputId)}"
          class="cuenta-switch${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}"
          aria-label="${escapeHtml(title)}"
        >
          <span class="cuenta-switch-track">
            <span class="cuenta-switch-thumb"></span>
          </span>
        </label>

        <input
          id="${escapeHtml(inputId)}"
          data-role="${escapeHtml(dataRole)}"
          type="checkbox"
          class="cuenta-native-control"
          ${checked ? "checked" : ""}
          ${disabled ? "disabled" : ""}
        />

        <span class="cuenta-control-state">
          ${escapeHtml(checked ? checkedLabel : uncheckedLabel)}
        </span>
      </div>

      <div class="cuenta-control-actions">
        <button
          type="button"
          class="cuenta-btn cuenta-btn--soft"
          data-action="${escapeHtml(action)}"
          ${disabled ? 'disabled aria-busy="true"' : ""}
        >
          ${disabled ? renderSpinner("Procesando...") : escapeHtml(buttonLabel || "Cambiar")}
        </button>
      </div>
    </div>
  `;
}

function renderSelectRow({
  title = "",
  description = "",
  value = "es",
  inputId = "",
  dataRole = "",
  action = "",
  disabled = false,
} = {}) {
  return `
    <div class="cuenta-control-row cuenta-control-row--select">
      <div class="cuenta-control-copy">
        <strong class="cuenta-control-title">${escapeHtml(title)}</strong>
        <span class="cuenta-control-description">${escapeHtml(description)}</span>
      </div>

      <div class="cuenta-select-line">
        <select
          id="${escapeHtml(inputId)}"
          data-role="${escapeHtml(dataRole)}"
          class="cuenta-select"
          ${disabled ? "disabled" : ""}
        >
          <option value="es" ${value === "es" ? "selected" : ""}>Español</option>
          <option value="en" ${value === "en" ? "selected" : ""}>English</option>
          <option value="ca" ${value === "ca" ? "selected" : ""}>Català</option>
        </select>

        <button
          type="button"
          class="cuenta-btn cuenta-btn--soft"
          data-action="${escapeHtml(action)}"
          ${disabled ? 'disabled aria-busy="true"' : ""}
        >
          ${disabled ? renderSpinner("Aplicando...") : "Aplicar idioma"}
        </button>
      </div>
    </div>
  `;
}

function renderPasswordRow({ disabled = false } = {}) {
  return `
    <div class="cuenta-password-block">
      <div class="cuenta-control-copy">
        <strong class="cuenta-control-title">Cambiar contraseña</strong>
        <span class="cuenta-control-description">
          Introduce la contraseña actual y define una nueva contraseña segura.
        </span>
      </div>

      <div class="cuenta-password-grid">
        <label class="cuenta-field">
          <span class="cuenta-field-label">Contraseña actual</span>
          <input
            id="cuenta-current-password"
            data-role="cuenta-current-password"
            type="password"
            placeholder="Contraseña actual"
            autocomplete="current-password"
            ${disabled ? "disabled" : ""}
          />
        </label>

        <label class="cuenta-field">
          <span class="cuenta-field-label">Nueva contraseña</span>
          <input
            id="cuenta-new-password"
            data-role="cuenta-new-password"
            type="password"
            placeholder="Nueva contraseña"
            autocomplete="new-password"
            ${disabled ? "disabled" : ""}
          />
        </label>

        <label class="cuenta-field cuenta-field--wide">
          <span class="cuenta-field-label">Confirmar contraseña</span>
          <input
            id="cuenta-confirm-password"
            data-role="cuenta-confirm-password"
            type="password"
            placeholder="Repite la nueva contraseña"
            autocomplete="new-password"
            ${disabled ? "disabled" : ""}
          />
        </label>
      </div>

      <div class="cuenta-password-actions">
        <button
          id="cuenta-password-btn"
          type="button"
          class="cuenta-btn cuenta-btn--primary"
          data-action="change-password"
          ${disabled ? 'disabled aria-busy="true"' : ""}
        >
          ${disabled ? renderSpinner("Procesando...") : "Cambiar contraseña"}
        </button>
      </div>
    </div>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = safeObject(state || cuentaState || {});

  const loading = Boolean(localState.loading);
  const refreshing = Boolean(localState.refreshing);
  const saving = Boolean(localState.saving);

  const name = detail ? getDisplayName(detail) : "Ajustes de cuenta";
  const email = detail ? getEmail(detail) : "Preferencias del usuario";
  const username = detail ? getUsername(detail) : "sin-usuario";
  const role = detail ? getRole(detail) : "Usuario";

  const updatedAt = detail ? getUpdatedAt(detail) : null;
  const updatedText = updatedAt
    ? formatRelativeDate(updatedAt)
    : "Sin sincronización reciente";

  const status = detail ? getAccountStatus(detail) : "Activa";
  const statusTone = detail ? getAccountStatusTone(detail) : "success";

  const privacyMode = detail ? getPrivacyMode(detail) : false;
  const privacyLabel = privacyMode ? "Activa" : "Estándar";
  const privacyTone = privacyMode ? "success" : "default";

  const themeLabel = detail ? getThemeLabel(detail) : "Light mode";
  const langLabel = detail ? getLangLabel(detail) : "Español";

  return `
    <section class="cuenta-hero">
      <div class="cuenta-hero-inner">
        <div class="cuenta-hero-top">
          <div class="cuenta-hero-copy">
            <span class="cuenta-eyebrow">Ajustes de cuenta</span>

            <h1 class="cuenta-title">Centro de control personal</h1>

            <p class="cuenta-subtitle">
              Gestiona identidad, apariencia, idioma y seguridad desde un panel premium sincronizado con Onion Support.
            </p>
          </div>

          <div class="cuenta-hero-actions">
            <button
              id="cuenta-refresh-btn"
              type="button"
              class="cuenta-btn${refreshing || loading ? " is-loading" : ""}"
              data-action="refresh-cuenta"
              ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
            >
              ${refreshing || loading ? renderSpinner("Actualizando...") : "Actualizar"}
            </button>

            <button
              id="cuenta-save-btn"
              type="button"
              class="cuenta-btn cuenta-btn--primary${saving ? " is-loading" : ""}"
              data-action="save-cuenta"
              ${saving ? 'disabled aria-busy="true"' : ""}
            >
              ${saving ? renderSpinner("Guardando...") : "Guardar cambios"}
            </button>
          </div>
        </div>

        <div class="cuenta-command-strip cuenta-account-strip">
          ${renderAvatar(detail || {}, "hero")}

          <div class="cuenta-account-copy">
            <div class="cuenta-account-name">${escapeHtml(name)}</div>
            <div class="cuenta-account-line">${escapeHtml(email)}</div>
            <div class="cuenta-account-line">@${escapeHtml(username)} · ${escapeHtml(role)}</div>
          </div>

          <div class="cuenta-account-stats">
            ${renderMiniStat({
              label: "Estado",
              value: status,
              tone: statusTone,
            })}

            ${renderMiniStat({
              label: "Tema",
              value: themeLabel,
              tone: "default",
            })}

            ${renderMiniStat({
              label: "Idioma",
              value: langLabel,
              tone: "default",
            })}
          </div>
        </div>

        <div class="cuenta-hero-meta">
          ${renderChip(`Rol · ${role}`, "accent")}
          ${renderChip(`Tema · ${themeLabel}`, "default")}
          ${renderChip(`Idioma · ${langLabel}`, "default")}
          ${renderChip(`Privacidad · ${privacyLabel}`, privacyTone)}
          ${renderChip(`Estado · ${status}`, statusTone)}
          ${renderChip(`Sync · ${updatedText}`, refreshing || loading ? "warning" : "default")}
          ${saving ? renderChip("Guardando cambios", "accent") : ""}
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
    <section class="cuenta-state cuenta-loading-state" aria-busy="true">
      <div class="cuenta-loading-grid">
        ${Array.from({ length: 3 })
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

export function renderErrorState(message = "No se pudo cargar la cuenta.") {
  return `
    <section class="cuenta-state cuenta-error-state">
      <h3 class="cuenta-state-title">No se pudo cargar la cuenta</h3>

      <p class="cuenta-state-text">
        ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
      </p>

      <button
        id="cuenta-retry-btn"
        type="button"
        class="cuenta-btn cuenta-btn--primary"
        data-action="refresh-cuenta"
      >
        Reintentar
      </button>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="cuenta-state cuenta-empty-state">
      <h3 class="cuenta-state-title">No hay datos de cuenta</h3>

      <p class="cuenta-state-text">
        El recurso no devolvió preferencias utilizables. Puedes forzar una nueva sincronización.
      </p>

      <button
        id="cuenta-refresh-btn"
        type="button"
        class="cuenta-btn cuenta-btn--primary"
        data-action="refresh-cuenta"
      >
        Actualizar cuenta
      </button>
    </section>
  `;
}

/* =========================================================
   PANEL CARDS
========================================================= */

function renderProfileCard(detail = {}, { disabled = false } = {}) {
  const phone = getPhone(detail);

  return `
    <article class="cuenta-card cuenta-card--accent">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">Identidad</h2>
          <p class="cuenta-card-text">
            Datos principales asociados a la sesión, al perfil visible y al usuario autenticado.
          </p>
        </div>

        <div class="cuenta-card-icon" aria-hidden="true">ID</div>
      </div>

      <div class="cuenta-profile-grid">
        ${renderField({
          id: "cuenta-name-input",
          label: "Nombre visible",
          value: getDisplayName(detail),
          dataRole: "cuenta-name-input",
          placeholder: "Nombre visible",
          disabled,
          autocomplete: "name",
        })}

        ${renderField({
          id: "cuenta-username-input",
          label: "Usuario",
          value: getUsername(detail),
          dataRole: "cuenta-username-input",
          placeholder: "usuario",
          readonly: true,
          disabled,
          autocomplete: "username",
        })}

        ${renderField({
          id: "cuenta-email-input",
          label: "Email",
          value: getEmail(detail),
          dataRole: "cuenta-email-input",
          type: "email",
          placeholder: "email@dominio.com",
          readonly: true,
          disabled,
          autocomplete: "email",
        })}

        ${renderField({
          id: "cuenta-phone-input",
          label: "Teléfono",
          value: phone === "No configurado" ? "" : phone,
          dataRole: "cuenta-phone-input",
          type: "tel",
          placeholder: "No configurado",
          disabled,
          autocomplete: "tel",
        })}
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow("User ID", getUserId(detail))}
        ${renderMetaRow("Cliente ID", getClienteId(detail))}
        ${renderMetaRow("Rol", getRole(detail))}
        ${renderMetaRow("Estado", getAccountStatus(detail), getAccountStatusTone(detail))}
      </div>
    </article>
  `;
}

function renderAppearanceCard(detail = {}, { disabled = false } = {}) {
  const dark = isDarkMode(detail);

  return `
    <article class="cuenta-card">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">Apariencia</h2>
          <p class="cuenta-card-text">
            Ajusta el modo visual principal. El cambio sincroniza DOM, AppCore, storage y variables CSS.
          </p>
        </div>

        <div class="cuenta-card-icon" aria-hidden="true">${dark ? "DM" : "LM"}</div>
      </div>

      ${renderSwitchRow({
        title: "Dark / Light mode",
        description: "Alterna entre modo claro y modo oscuro para toda la interfaz.",
        checked: dark,
        inputId: "cuenta-darkmode-input",
        dataRole: "cuenta-darkmode-input",
        action: "toggle-theme",
        disabled,
        checkedLabel: "Dark",
        uncheckedLabel: "Light",
        buttonLabel: dark ? "Cambiar a light" : "Cambiar a dark",
      })}

      <div class="cuenta-meta-list">
        ${renderMetaRow("Tema actual", getThemeLabel(detail))}
        ${renderMetaRow("Valor técnico", getThemeValue(detail))}
        ${renderMetaRow("Estado", getThemeStatusLabel(detail))}
      </div>
    </article>
  `;
}

function renderLanguageCard(detail = {}, { disabled = false } = {}) {
  const langValue = getLangValue(detail);
  const langLabel = getLangLabel(detail);

  return `
    <article class="cuenta-card">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">Idioma</h2>
          <p class="cuenta-card-text">
            Define el idioma activo de la SPA. Compatible con Español, English y Català.
          </p>
        </div>

        <div class="cuenta-card-icon" aria-hidden="true">LG</div>
      </div>

      ${renderSelectRow({
        title: "Idioma del sistema",
        description: "Selecciona el idioma que utilizarán las vistas y componentes compatibles con i18n.",
        value: langValue,
        inputId: "cuenta-language-select",
        dataRole: "cuenta-language-select",
        action: "change-language",
        disabled,
      })}

      <div class="cuenta-meta-list">
        ${renderMetaRow("Idioma actual", langLabel)}
        ${renderMetaRow("Código", langValue)}
        ${renderMetaRow("Motor", "I18n")}
      </div>
    </article>
  `;
}

function renderPrivacyCard(detail = {}, { disabled = false } = {}) {
  const privacy = getPrivacyMode(detail);

  return `
    <article class="cuenta-card">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">Privacidad</h2>
          <p class="cuenta-card-text">
            Control local para preferencias de privacidad del perfil y futuras reglas de visibilidad.
          </p>
        </div>

        <div class="cuenta-card-icon" aria-hidden="true">PV</div>
      </div>

      ${renderSwitchRow({
        title: "Modo privacidad",
        description: "Activa una preferencia de privacidad para vistas y módulos compatibles.",
        checked: privacy,
        inputId: "cuenta-privacymode-input",
        dataRole: "cuenta-privacymode-input",
        action: "save-cuenta",
        disabled,
        checkedLabel: "Activo",
        uncheckedLabel: "Estándar",
        buttonLabel: "Guardar privacidad",
      })}

      <div class="cuenta-meta-list">
        ${renderMetaRow("Privacidad", getPrivacyLabel(detail))}
        ${renderMetaRow("Valor técnico", privacy ? "true" : "false")}
      </div>
    </article>
  `;
}

function renderSecurityCard(detail = {}, { disabled = false } = {}) {
  return `
    <article class="cuenta-card cuenta-card--warning">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">Seguridad</h2>
          <p class="cuenta-card-text">
            Actualiza la contraseña de acceso. La mutación queda delegada al bridge de cuenta.
          </p>
        </div>

        <div class="cuenta-card-icon" aria-hidden="true">SC</div>
      </div>

      ${renderPasswordRow({
        disabled,
      })}

      <div class="cuenta-meta-list">
        ${renderMetaRow("Último acceso", getLastLoginAt(detail) ? formatRelativeDate(getLastLoginAt(detail)) : "Sin dato")}
        ${renderMetaRow("Creación", getCreatedAt(detail) ? formatDateOnly(getCreatedAt(detail)) : "—")}
        ${renderMetaRow("Estado", getSecurityStatusLabel(detail))}
      </div>
    </article>
  `;
}

function renderAuditCard(detail = {}) {
  const updatedAt = getUpdatedAt(detail);
  const createdAt = getCreatedAt(detail);
  const lastLoginAt = getLastLoginAt(detail);
  const avatar = getAvatarUrl(detail);

  return `
    <article class="cuenta-card cuenta-card--success">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">Actividad</h2>
          <p class="cuenta-card-text">
            Resumen técnico de sincronización, sesión y metadatos visibles de cuenta.
          </p>
        </div>

        <div class="cuenta-card-icon" aria-hidden="true">OK</div>
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow("Actualizado", updatedAt ? formatDate(updatedAt) : "—")}
        ${renderMetaRow("Actualizado relativo", updatedAt ? formatRelativeDate(updatedAt) : "Sin fecha")}
        ${renderMetaRow("Creado", createdAt ? formatDate(createdAt) : "—")}
        ${renderMetaRow("Último login", lastLoginAt ? formatDate(lastLoginAt) : "—")}
        ${renderMetaRow("Avatar", avatar ? "Imagen detectada" : "Iniciales fallback", avatar ? "success" : "default")}
        ${renderMetaRow("Email", truncate(getEmail(detail), 42))}
        ${renderMetaRow("Username", `@${getUsername(detail)}`)}
      </div>
    </article>
  `;
}

/* =========================================================
   PANEL
========================================================= */

export function renderPanel({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = safeObject(state || cuentaState || {});

  const loading = Boolean(localState.loading);
  const refreshing = Boolean(localState.refreshing);
  const saving = Boolean(localState.saving);
  const busy = saving || refreshing;

  if (loading && !detail) {
    return renderLoadingState();
  }

  if (localState.error && !detail) {
    return renderErrorState(localState.error);
  }

  if (!detail) {
    return renderEmptyState();
  }

  return `
    <section class="cuenta-panel">
      <div class="cuenta-cards-grid">
        <div class="cuenta-column">
          ${renderProfileCard(detail, {
            disabled: busy,
          })}

          ${renderAuditCard(detail)}
        </div>

        <div class="cuenta-column">
          ${renderAppearanceCard(detail, {
            disabled: busy,
          })}

          ${renderLanguageCard(detail, {
            disabled: busy,
          })}

          ${renderPrivacyCard(detail, {
            disabled: busy,
          })}

          ${renderSecurityCard(detail, {
            disabled: busy,
          })}
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
                <span class="cuenta-panel-overlay-spinner" aria-hidden="true"></span>
                <strong>${saving ? "Guardando cambios..." : "Actualizando cuenta..."}</strong>
              </div>
            </div>
          `
          : ""
      }
    </section>
  `;
}

/* =========================================================
   MAIN ENTRY
========================================================= */

export function renderCuentaTemplate({ item = null, state = {} } = {}) {
  const localState = safeObject(state || cuentaState || {});
  const detail = resolveCuentaItem(item);

  return `
    <div class="cuenta-view">
      ${renderHeader({
        item: detail,
        state: localState,
      })}

      ${renderPanel({
        item: detail,
        state: localState,
      })}
    </div>
  `;
}

export function renderCuentaViewTemplate({ item = null, state = {} } = {}) {
  return renderCuentaTemplate({
    item,
    state,
  });
}

export default {
  renderHeader,
  renderLoadingState,
  renderErrorState,
  renderEmptyState,
  renderPanel,
  renderCuentaTemplate,
  renderCuentaViewTemplate,
};
