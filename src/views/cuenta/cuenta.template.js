/* =========================================================
   Onion SPA - Cuenta Template
   Archivo: src/views/cuenta/cuenta.template.js

   EXTREME PRO SYSTEM · ACCOUNT SETTINGS COMMAND CENTER · 14/10
   PREMIUM SETTINGS PANEL · REAL AVATAR · PROFILE/THEME/LANG/SECURITY
   VARIABLES.CSS + UI.CSS ALIGNED · BINDINGS SAFE · RESPONSIVE GOD MODE

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
   - dark/light mode conectado a variables.css + ui.css
   - estilos encapsulados sin :root local
   - responsive robusto
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
   DATA
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
      detail.raw?.profile?.image,
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
      ${hasImage ? 'data-has-avatar="true"' : 'data-has-avatar="false"'}
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
              onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
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
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style>
      @keyframes cuentaSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes cuentaSkeleton{
        to{ transform:translateX(100%); }
      }

      @keyframes cuentaFloatIn{
        from{
          opacity:0;
          transform:translateY(10px) scale(.995);
        }
        to{
          opacity:1;
          transform:translateY(0) scale(1);
        }
      }

      .cuenta-view{
        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
      }

      .cuenta-view *,
      .cuenta-view *::before,
      .cuenta-view *::after{
        box-sizing:border-box;
      }

      .cuenta-hero,
      .cuenta-panel,
      .cuenta-state{
        position:relative;
        overflow:hidden;
        border-radius:var(--view-hero-radius, var(--card-radius-lg, 26px));
        border:1px solid var(--view-hero-border, var(--panel-border, var(--border-default, rgba(255,255,255,.08))));
        background:
          radial-gradient(circle at 0 0, color-mix(in srgb, var(--accent, #6f59d9) 20%, transparent), transparent 36%),
          radial-gradient(circle at 100% 0, rgba(255,255,255,.10), transparent 32%),
          linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,0) 38%),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #262626))));
        box-shadow:var(--view-hero-shadow, var(--panel-shadow, var(--shadow-md, 0 14px 30px rgba(0,0,0,.22))));
        animation:cuentaFloatIn .28s ease both;
      }

      .cuenta-hero::before,
      .cuenta-panel::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(135deg, rgba(255,255,255,.075), transparent 30%),
          linear-gradient(180deg, rgba(255,255,255,.030), transparent 48%);
        opacity:.76;
      }

      .cuenta-hero-inner{
        position:relative;
        z-index:1;
        display:grid;
        gap:var(--space-lg, 18px);
        padding:var(--space-xl, 24px);
      }

      .cuenta-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .cuenta-hero-copy{
        min-width:0;
        display:grid;
        gap:var(--space-xs, 10px);
      }

      .cuenta-eyebrow{
        width:max-content;
        min-height:calc(30px * var(--ui-scale, 1));
        padding:0 var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid color-mix(in srgb, var(--accent, #6f59d9) 30%, var(--badge-border, rgba(255,255,255,.08)));
        background:color-mix(in srgb, var(--accent, #6f59d9) 13%, transparent);
        color:var(--accent-active, var(--text-strong, #ffffff));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-black, 900);
        letter-spacing:var(--letter-wider, .095em);
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .cuenta-title{
        margin:0;
        max-width:100%;
        font-size:clamp(var(--font-3xl, 25px), 3vw, var(--font-5xl, 44px));
        line-height:.98;
        letter-spacing:var(--view-title-letter, -.06em);
        font-weight:var(--view-title-weight, var(--weight-black, 900));
        color:var(--text-strong, #ffffff);
      }

      .cuenta-subtitle{
        margin:0;
        max-width:920px;
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
      }

      .cuenta-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .cuenta-btn{
        min-height:var(--btn-height, 42px);
        padding:0 var(--space-md, 16px);
        border-radius:var(--btn-radius, var(--radius-md, 14px));
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 800);
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        white-space:nowrap;
        box-shadow:var(--btn-secondary-shadow, var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16)));
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .cuenta-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 26%, var(--btn-secondary-border, rgba(255,255,255,.09)));
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .cuenta-btn--primary{
        border-color:var(--btn-primary-border, color-mix(in srgb, var(--accent, #6f59d9) 42%, transparent));
        background:var(--btn-primary-bg, var(--accent, #6f59d9));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:var(--btn-primary-shadow, 0 14px 30px color-mix(in srgb, var(--accent, #6f59d9) 22%, transparent));
      }

      .cuenta-btn--soft{
        min-height:calc(38px * var(--ui-scale, 1));
        padding:0 var(--space-sm, 12px);
        font-size:var(--font-sm, 12px);
        box-shadow:none;
      }

      .cuenta-btn:disabled{
        pointer-events:none;
        cursor:wait;
        opacity:.72;
        transform:none;
        box-shadow:none;
      }

      .cuenta-command-strip{
        display:grid;
        grid-template-columns:auto minmax(0, 1fr) auto;
        gap:var(--space-md, 16px);
        align-items:center;
        padding:var(--space-md, 16px);
        border-radius:var(--card-radius, 22px);
        border:1px solid color-mix(in srgb, var(--accent, #6f59d9) 20%, var(--card-border, rgba(255,255,255,.08)));
        background:
          radial-gradient(circle at 0 0, color-mix(in srgb, var(--accent, #6f59d9) 18%, transparent), transparent 44%),
          linear-gradient(180deg, rgba(255,255,255,.050), rgba(255,255,255,.015)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
      }

      .cuenta-avatar{
        position:relative;
        display:grid;
        place-items:center;
        overflow:hidden;
        border-radius:var(--radius-pill, 999px);
        background:
          radial-gradient(circle at 30% 20%, rgba(255,255,255,.42), transparent 30%),
          linear-gradient(135deg, var(--accent, #6f59d9), color-mix(in srgb, var(--accent, #6f59d9) 42%, #111827));
        color:var(--avatar-text, #ffffff);
        isolation:isolate;
        box-shadow:
          0 16px 34px color-mix(in srgb, var(--accent, #6f59d9) 24%, transparent),
          0 0 0 4px color-mix(in srgb, var(--accent-ring, rgba(113,113,122,.30)) 72%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.06));
      }

      .cuenta-avatar--hero{
        width:calc(72px * var(--ui-scale, 1));
        height:calc(72px * var(--ui-scale, 1));
        min-width:calc(72px * var(--ui-scale, 1));
      }

      .cuenta-avatar--small{
        width:calc(42px * var(--ui-scale, 1));
        height:calc(42px * var(--ui-scale, 1));
        min-width:calc(42px * var(--ui-scale, 1));
      }

      .cuenta-avatar::before{
        content:"";
        position:absolute;
        inset:-34%;
        z-index:0;
        background:conic-gradient(
          from 120deg,
          transparent,
          color-mix(in srgb, var(--accent, #6f59d9) 32%, transparent),
          transparent,
          rgba(255,255,255,.18),
          transparent
        );
        opacity:.92;
      }

      .cuenta-avatar::after{
        content:"";
        position:absolute;
        inset:0;
        z-index:3;
        background:
          radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.12));
        pointer-events:none;
        mix-blend-mode:screen;
      }

      .cuenta-avatar img{
        position:absolute;
        inset:0;
        z-index:2;
        width:100%;
        height:100%;
        object-fit:cover;
        border-radius:inherit;
      }

      .cuenta-avatar-fallback{
        position:relative;
        z-index:2;
        font-size:var(--font-3xl, 25px);
        font-weight:var(--weight-black, 900);
        letter-spacing:-.055em;
        text-shadow:0 1px 2px rgba(0,0,0,.26);
      }

      .cuenta-avatar.has-image .cuenta-avatar-fallback{
        display:none;
      }

      .cuenta-avatar[data-fallback="true"] .cuenta-avatar-fallback{
        display:block;
      }

      .cuenta-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .cuenta-account-copy{
        display:grid;
        gap:var(--space-3xs, 4px);
        min-width:0;
      }

      .cuenta-account-name{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:var(--text-strong, #ffffff);
        font-size:clamp(var(--font-xl, 17px), 1.6vw, var(--font-3xl, 24px));
        line-height:1.05;
        font-weight:var(--weight-black, 900);
        letter-spacing:-.045em;
      }

      .cuenta-account-line{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:var(--text-dim, rgba(245,245,245,.58));
        font-size:var(--font-sm, 12px);
        line-height:1.35;
      }

      .cuenta-account-stats{
        display:flex;
        justify-content:flex-end;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .cuenta-mini-stat{
        min-width:124px;
        display:grid;
        gap:var(--space-3xs, 3px);
        padding:var(--space-xs, 10px) var(--space-sm, 12px);
        border-radius:var(--radius-lg, 16px);
        border:1px solid var(--border-soft, rgba(255,255,255,.07));
        background:var(--surface-glass, rgba(255,255,255,.045));
      }

      .cuenta-mini-stat span{
        color:var(--text-dim, rgba(245,245,245,.55));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 800);
        letter-spacing:.075em;
        text-transform:uppercase;
      }

      .cuenta-mini-stat strong{
        color:var(--text-strong, #ffffff);
        font-size:var(--font-sm, 12px);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .cuenta-mini-stat--success{
        border-color:var(--border-success, rgba(34,197,94,.30));
        background:var(--success-bg, rgba(34,197,94,.10));
      }

      .cuenta-mini-stat--warning{
        border-color:var(--border-warning, rgba(245,158,11,.30));
        background:var(--warning-bg, rgba(245,158,11,.10));
      }

      .cuenta-mini-stat--danger{
        border-color:var(--border-danger, rgba(239,68,68,.30));
        background:var(--danger-bg, rgba(239,68,68,.10));
      }

      .cuenta-hero-meta{
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .cuenta-chip{
        min-height:calc(30px * var(--ui-scale, 1));
        padding:0 var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--badge-border, var(--border-default, rgba(255,255,255,.07)));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 800);
        letter-spacing:var(--letter-wider, .075em);
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .cuenta-chip--accent{
        color:var(--accent-active, var(--text-strong, #ffffff));
        background:color-mix(in srgb, var(--accent, #6f59d9) 16%, transparent);
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 34%, transparent);
      }

      .cuenta-chip--success{
        color:var(--success, #22c55e);
        background:var(--success-bg, rgba(34,197,94,.10));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .cuenta-chip--warning{
        color:var(--warning, #f59e0b);
        background:var(--warning-bg, rgba(245,158,11,.10));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .cuenta-chip--danger{
        color:var(--danger, #ef4444);
        background:var(--danger-bg, rgba(239,68,68,.10));
        border-color:var(--border-danger, rgba(239,68,68,.30));
      }

      .cuenta-cards-grid{
        position:relative;
        z-index:1;
        display:grid;
        grid-template-columns:minmax(0, 1.08fr) minmax(360px, .92fr);
        gap:var(--space-md, 16px);
        padding:var(--space-md, 16px);
      }

      .cuenta-column{
        display:grid;
        gap:var(--space-md, 16px);
        min-width:0;
        align-content:start;
      }

      .cuenta-card{
        display:grid;
        align-content:start;
        gap:var(--space-md, 16px);
        padding:var(--space-lg, 18px);
        border-radius:var(--card-radius, 22px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          linear-gradient(180deg, rgba(255,255,255,.050), rgba(255,255,255,.012)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
        transition:
          transform .16s ease,
          border-color .16s ease,
          box-shadow .16s ease,
          background .16s ease;
      }

      .cuenta-card:hover{
        transform:translateY(-1px);
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 20%, var(--card-border, rgba(255,255,255,.082)));
        box-shadow:var(--shadow-lg, 0 22px 48px rgba(0,0,0,.24));
      }

      .cuenta-card--accent{
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 30%, var(--card-border, rgba(255,255,255,.082)));
      }

      .cuenta-card--success{
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .cuenta-card--warning{
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .cuenta-card-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-sm, 12px);
        align-items:start;
      }

      .cuenta-card-copy{
        display:grid;
        gap:var(--space-xs, 8px);
        min-width:0;
      }

      .cuenta-card-title{
        margin:0;
        color:var(--text-strong, #ffffff);
        font-size:var(--font-2xl, 19px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-black, 900);
        letter-spacing:var(--letter-tight, -.035em);
      }

      .cuenta-card-text{
        margin:0;
        color:var(--text-muted, rgba(245,245,245,.70));
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
      }

      .cuenta-card-icon{
        width:44px;
        height:44px;
        border-radius:var(--radius-lg, 16px);
        display:grid;
        place-items:center;
        border:1px solid color-mix(in srgb, var(--accent, #6f59d9) 24%, transparent);
        background:color-mix(in srgb, var(--accent, #6f59d9) 12%, transparent);
        color:var(--accent-active, var(--text-strong, #ffffff));
        font-size:13px;
        font-weight:900;
        letter-spacing:-.03em;
      }

      .cuenta-profile-grid{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .cuenta-control-row,
      .cuenta-password-block{
        display:grid;
        gap:var(--space-sm, 12px);
        padding:var(--space-sm, 12px) 0;
        border-top:1px solid var(--border-soft, rgba(255,255,255,.05));
      }

      .cuenta-control-copy{
        display:grid;
        gap:var(--space-2xs, 4px);
      }

      .cuenta-control-title{
        color:var(--text-strong, #ffffff);
        font-size:var(--font-lg, 15px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-bold, 800);
      }

      .cuenta-control-description{
        color:var(--text-dim, rgba(245,245,245,.56));
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
      }

      .cuenta-switch-area{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:var(--space-sm, 12px);
        flex-wrap:wrap;
      }

      .cuenta-switch{
        display:inline-flex;
        cursor:pointer;
        user-select:none;
      }

      .cuenta-switch.is-disabled{
        cursor:not-allowed;
        opacity:.72;
      }

      .cuenta-switch-track{
        position:relative;
        display:inline-flex;
        width:calc(62px * var(--ui-scale, 1));
        height:calc(34px * var(--ui-scale, 1));
        border-radius:var(--radius-pill, 999px);
        padding:4px;
        border:1px solid var(--switch-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--switch-bg, rgba(255,255,255,.12));
        box-shadow:var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .cuenta-switch-thumb{
        position:absolute;
        top:4px;
        left:4px;
        width:calc(24px * var(--ui-scale, 1));
        height:calc(24px * var(--ui-scale, 1));
        border-radius:var(--radius-pill, 999px);
        background:var(--text-strong, #ffffff);
        box-shadow:0 7px 16px rgba(0,0,0,.26);
        transition:
          left var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .cuenta-switch.is-checked .cuenta-switch-track{
        background:color-mix(in srgb, var(--accent, #6f59d9) 24%, transparent);
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 46%, transparent);
      }

      .cuenta-switch.is-checked .cuenta-switch-thumb{
        left:calc(34px * var(--ui-scale, 1));
        background:var(--accent, #6f59d9);
      }

      .cuenta-native-control{
        position:absolute;
        width:1px;
        height:1px;
        opacity:0;
        pointer-events:none;
      }

      .cuenta-control-state{
        color:var(--text-dim, rgba(245,245,245,.56));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 800);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
      }

      .cuenta-control-actions,
      .cuenta-password-actions{
        display:flex;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .cuenta-select-line{
        display:flex;
        align-items:center;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .cuenta-select,
      .cuenta-field input{
        min-height:var(--input-height, 44px);
        border-radius:var(--input-radius, var(--radius-md, 14px));
        border:1px solid var(--input-border, rgba(255,255,255,.09));
        background:var(--input-bg, rgba(255,255,255,.028));
        color:var(--input-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-semibold, 650);
        outline:none;
        box-shadow:var(--input-shadow, inset 0 1px 0 rgba(255,255,255,.018));
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .cuenta-select{
        min-width:min(100%, 240px);
        padding:0 var(--space-sm, 12px);
      }

      .cuenta-select:focus,
      .cuenta-field input:focus{
        border-color:var(--input-border-focus, color-mix(in srgb, var(--accent, #6f59d9) 46%, transparent));
        background:var(--input-bg-focus, rgba(255,255,255,.046));
        box-shadow:var(--input-shadow-focus, 0 0 0 4px color-mix(in srgb, var(--accent, #6f59d9) 13%, transparent));
      }

      .cuenta-field input[readonly]{
        opacity:.86;
        cursor:default;
      }

      .cuenta-password-grid{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .cuenta-field--wide{
        grid-column:1 / -1;
      }

      .cuenta-field{
        display:grid;
        gap:var(--space-2xs, 5px);
        min-width:0;
      }

      .cuenta-field-label{
        color:var(--form-label-color, var(--text-soft, rgba(245,245,245,.88)));
        font-size:var(--form-label-size, var(--font-sm, 12px));
        font-weight:var(--form-label-weight, var(--weight-semibold, 700));
      }

      .cuenta-field input{
        width:100%;
        padding:0 var(--space-sm, 12px);
      }

      .cuenta-meta-list{
        display:grid;
        gap:0;
        margin-top:auto;
        border-top:1px solid var(--border-soft, rgba(255,255,255,.05));
      }

      .cuenta-meta-row{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:var(--space-sm, 12px);
        padding:var(--space-xs, 10px) 0;
        border-bottom:1px solid var(--border-soft, rgba(255,255,255,.05));
      }

      .cuenta-meta-row:last-child{
        border-bottom:none;
      }

      .cuenta-meta-label{
        color:var(--text-dim, rgba(245,245,245,.56));
        font-size:var(--font-sm, 12px);
        line-height:1.3;
      }

      .cuenta-meta-value{
        min-width:0;
        color:var(--text-strong, #ffffff);
        font-size:var(--font-sm, 12px);
        line-height:1.3;
        text-align:right;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .cuenta-inline-loading{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 7px);
        white-space:nowrap;
      }

      .cuenta-inline-spinner{
        width:14px;
        height:14px;
        border-radius:var(--radius-pill, 999px);
        border:2px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
        animation:cuentaSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .cuenta-state{
        display:grid;
        justify-items:center;
        gap:var(--space-sm, 12px);
        padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px);
        text-align:center;
      }

      .cuenta-state-title{
        margin:0;
        color:var(--text-strong, #ffffff);
        font-size:var(--font-3xl, 24px);
        line-height:var(--line-tight, 1.08);
        font-weight:var(--weight-black, 900);
        letter-spacing:var(--letter-tight, -.04em);
      }

      .cuenta-state-text{
        margin:0;
        max-width:620px;
        color:var(--text-muted, rgba(245,245,245,.70));
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
      }

      .cuenta-loading-grid{
        display:grid;
        grid-template-columns:repeat(3, minmax(0, 1fr));
        gap:var(--space-md, 16px);
        width:100%;
      }

      .cuenta-skeleton-card{
        display:grid;
        gap:var(--space-sm, 12px);
        min-height:260px;
        padding:var(--space-lg, 18px);
        border-radius:var(--card-radius, 20px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
      }

      .cuenta-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:var(--skeleton-radius, var(--radius-md, 13px));
        background:var(--skeleton-bg, rgba(255,255,255,.050));
      }

      .cuenta-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          var(--skeleton-shine, rgba(255,255,255,.095)),
          transparent
        );
        animation:cuentaSkeleton 1.2s var(--ease-standard, ease-in-out) infinite;
      }

      .cuenta-skeleton--title{
        width:62%;
        height:18px;
      }

      .cuenta-skeleton--line{
        width:100%;
        height:12px;
      }

      .cuenta-skeleton--line-sm{
        width:76%;
        height:12px;
      }

      .cuenta-skeleton--control{
        width:100%;
        height:44px;
        margin-top:var(--space-md, 16px);
      }

      .cuenta-panel-overlay{
        position:absolute;
        inset:0;
        z-index:4;
        display:grid;
        place-items:center;
        padding:var(--space-lg, 18px);
        background:color-mix(in srgb, var(--surface-1, #0f1115) 76%, transparent);
        backdrop-filter:var(--blur-sm, blur(8px));
        -webkit-backdrop-filter:var(--blur-sm, blur(8px));
      }

      .cuenta-panel-overlay-card{
        display:grid;
        justify-items:center;
        gap:var(--space-sm, 12px);
        min-width:min(100%, 260px);
        padding:var(--space-lg, 18px) var(--space-xl, 22px);
        border-radius:var(--radius-xl, 18px);
        border:1px solid color-mix(in srgb, var(--accent, #6f59d9) 32%, var(--border-soft, rgba(255,255,255,.08)));
        background:var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));
        color:var(--text-strong, #ffffff);
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 800);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28));
      }

      .cuenta-panel-overlay-spinner{
        width:30px;
        height:30px;
        border-radius:var(--radius-pill, 999px);
        border:3px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:var(--accent, #6f59d9);
        animation:cuentaSpin .8s linear infinite;
      }

      [data-theme="light"] .cuenta-hero,
      [data-theme="light"] .cuenta-panel,
      [data-theme="light"] .cuenta-state{
        background:
          radial-gradient(circle at 0 0, color-mix(in srgb, var(--accent, #6f59d9) 9%, transparent), transparent 34%),
          radial-gradient(circle at 100% 0, rgba(255,255,255,.90), transparent 28%),
          linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,0) 34%),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
        box-shadow:
          0 24px 60px rgba(15,23,42,.10),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .cuenta-card,
      [data-theme="light"] .cuenta-command-strip,
      [data-theme="light"] .cuenta-skeleton-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,0) 34%),
          var(--card-bg, var(--surface-elevated, #ffffff));
        box-shadow:0 18px 42px rgba(15,23,42,.08);
      }

      [data-theme="light"] .cuenta-title,
      [data-theme="light"] .cuenta-account-name,
      [data-theme="light"] .cuenta-card-title,
      [data-theme="light"] .cuenta-control-title,
      [data-theme="light"] .cuenta-meta-value,
      [data-theme="light"] .cuenta-mini-stat strong,
      [data-theme="light"] .cuenta-state-title{
        color:var(--text-strong, #111827);
      }

      [data-theme="light"] .cuenta-subtitle,
      [data-theme="light"] .cuenta-account-line,
      [data-theme="light"] .cuenta-card-text,
      [data-theme="light"] .cuenta-control-description,
      [data-theme="light"] .cuenta-control-state,
      [data-theme="light"] .cuenta-meta-label,
      [data-theme="light"] .cuenta-state-text{
        color:var(--text-dim, #6b7280);
      }

      [data-theme="light"] .cuenta-chip--accent{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      [data-theme="light"] .cuenta-select,
      [data-theme="light"] .cuenta-field input{
        background:var(--input-bg, rgba(255,255,255,.84));
        color:var(--input-text, #111827);
        border-color:var(--input-border, rgba(15,23,42,.10));
      }

      [data-theme="light"] .cuenta-panel-overlay{
        background:rgba(248,250,252,.72);
      }

      [data-theme="light"] .cuenta-panel-overlay-card{
        background:#ffffff;
        color:#111827;
      }

      @media (max-width: 1180px){
        .cuenta-hero-top,
        .cuenta-command-strip,
        .cuenta-cards-grid{
          grid-template-columns:1fr;
        }

        .cuenta-hero-actions,
        .cuenta-account-stats{
          justify-content:flex-start;
        }

        .cuenta-loading-grid{
          grid-template-columns:1fr;
        }
      }

      @media (max-width: 760px){
        .cuenta-view{
          gap:var(--space-md, 16px);
        }

        .cuenta-hero-inner{
          padding:var(--space-lg, 18px) var(--space-md, 16px);
        }

        .cuenta-title{
          font-size:clamp(var(--font-3xl, 25px), 8vw, var(--font-4xl, 34px));
          line-height:1;
        }

        .cuenta-subtitle{
          font-size:var(--font-base, 14px);
        }

        .cuenta-hero-actions,
        .cuenta-select-line,
        .cuenta-control-actions,
        .cuenta-password-actions,
        .cuenta-account-stats{
          width:100%;
        }

        .cuenta-btn,
        .cuenta-select,
        .cuenta-mini-stat{
          width:100%;
        }

        .cuenta-cards-grid{
          padding:var(--space-sm, 12px);
        }

        .cuenta-card{
          padding:var(--space-md, 16px);
        }

        .cuenta-card-head,
        .cuenta-profile-grid,
        .cuenta-password-grid{
          grid-template-columns:1fr;
        }

        .cuenta-field--wide{
          grid-column:auto;
        }

        .cuenta-meta-row{
          align-items:flex-start;
          flex-direction:column;
          gap:var(--space-2xs, 4px);
        }

        .cuenta-meta-value{
          text-align:left;
          white-space:normal;
        }

        .cuenta-avatar--hero{
          width:62px;
          height:62px;
          min-width:62px;
        }
      }

      @media (prefers-reduced-motion: reduce){
        .cuenta-view *,
        .cuenta-view *::before,
        .cuenta-view *::after{
          animation:none !important;
          transition:none !important;
        }
      }
    </style>
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
  const updatedText = updatedAt ? formatRelativeDate(updatedAt) : "Sin sincronización reciente";

  const status = detail ? getAccountStatus(detail) : "Activa";
  const statusTone = detail ? getAccountStatusTone(detail) : "success";

  return `
    ${render";

  const status = detail ? getAccountStatus(detail) : "Activa";
  const statusTone = detail ? getAccountStatusTone(detail) : "Styles()}

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

        <div class="cuenta-command-strip">
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
              value: detail ? getThemeLabel(detail) : "Light mode",
              tone: "default",
            })}

            ${renderMiniStat({
              label: "Idioma",
              value: detail ? getLangLabel(detail) : "Español",
              tone: "default",
            })}
          </div>
        </div>

        <div class="cuenta-hero-meta">
          ${renderChip(`Rol · ${role}`, "accent")}
          ${renderChip(`Tema · ${detail ? getThemeLabel(detail) : "Light mode"}`, "default")}
          ${renderChip(`Idioma · ${detail ? getLangLabel(detail) : "Español"}`, "default")}
          ${renderChip(`Privacidad · ${detail ? getPrivacyLabel(detail) : "Estándar"}`, detail && getPrivacyMode(detail) ? "success" : "default")}
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
          value: getPhone(detail) === "No configurado" ? "" : getPhone(detail),
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

        <div class="cuenta-card-icon" aria-hidden="true">${dark ? "☾" : "☼"}</div>
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
