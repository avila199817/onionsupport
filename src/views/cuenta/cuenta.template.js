/* =========================================================
   Onion Support - Cuenta Template
   Archivo: /src/views/cuenta/cuenta.template.js

   PRODUCTIVO · SELF ACCOUNT · PURE TEMPLATE · V3

   Contrato:
   - cuenta.api.js = backend + modelo canónico.
   - index.js      = estado UI + DOM + acciones.
   - este archivo  = HTML puro.
   - Sin HTTP, Store, Router, listeners ni estilos inline.
   - Sin controles de edición que el backend self no soporta.
   - Passwords y session IDs nunca se renderizan.
========================================================= */

export const CUENTA_TEMPLATE_VERSION =
  "cuenta.template.backend-contract.v3.system-ui-runtime-safe";

export const CUENTA_TEMPLATE_CAPABILITIES = Object.freeze({
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

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value = "", fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
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

const escapeAttr = escapeHtml;

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const key = normalizeKey(value);
  if (["true", "1", "yes", "si", "on", "enabled", "active", "dark"].includes(key)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive", "light"].includes(key)) return false;
  return Boolean(fallback);
}

function joinClasses(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : String(value || "").split(/\s+/g))
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function boolAttr(condition, attr = "") {
  return condition ? attr : "";
}

function isAzureBlobHost(hostname = "") {
  const host = safeText(hostname, "").toLowerCase();
  return host === "blob.core.windows.net" || host.endsWith(".blob.core.windows.net");
}

function isSensitiveQueryParam(key = "") {
  return [
    "access_token", "accesstoken", "refresh_token", "refreshtoken",
    "id_token", "idtoken", "token", "code", "secret", "session",
    "sessionid", "password", "pwd", "key", "jwt", "authorization",
    "reset_token", "resettoken", "activation_token", "activationtoken",
  ].includes(normalizeKey(key));
}

function isAzureSasParam(key = "") {
  return [
    "sig", "se", "sp", "sv", "sr", "spr", "st",
    "skoid", "sktid", "skt", "ske", "sks", "skv",
  ].includes(String(key).toLowerCase());
}

function safeAvatarUrl(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";
  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(raw)
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  const localHttp = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw);
  if (!/^https:\/\//i.test(raw) && !localHttp) return "";

  try {
    const url = new URL(raw);
    const keys = [...url.searchParams.keys()];
    if (keys.some(isSensitiveQueryParam)) return "";
    if (keys.some(isAzureSasParam) && !isAzureBlobHost(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function toDate(value = null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value = null) {
  const date = toDate(value);
  if (!date) return "—";
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

function formatRelativeDate(value = null) {
  const date = toDate(value);
  if (!date) return "Sin fecha";

  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
  const absoluteMinutes = Math.abs(diffMinutes);
  if (absoluteMinutes < 1) return "Ahora mismo";
  if (absoluteMinutes < 60) return diffMinutes > 0 ? `En ${absoluteMinutes} min` : `Hace ${absoluteMinutes} min`;

  const hours = Math.round(absoluteMinutes / 60);
  if (hours < 24) return diffMinutes > 0 ? `En ${hours} h` : `Hace ${hours} h`;

  const days = Math.round(hours / 24);
  if (days <= 7) {
    return diffMinutes > 0
      ? `En ${days} día${days === 1 ? "" : "s"}`
      : `Hace ${days} día${days === 1 ? "" : "s"}`;
  }

  return formatDate(date);
}

function resolveCuentaItem(item = null) {
  return isObject(item) ? item : null;
}

function resolveLocalState(state = {}) {
  const source = safeObject(state);
  const sessions = safeObject(source.sessions);

  return {
    loading: Boolean(source.loading),
    refreshing: Boolean(source.refreshing),
    saving: Boolean(source.saving),
    error: safeText(source.error, ""),
    errorCode: safeText(source.errorCode, ""),
    authRefreshRequired: source.authRefreshRequired === true,
    deactivated: source.deactivated === true,
    selfUpdateSupported: source.selfUpdateSupported === true,
    capabilities: {
      ...CUENTA_TEMPLATE_CAPABILITIES,
      ...safeObject(source.capabilities),
      ...safeObject(source.view?.capabilities),
    },
    sessions: {
      items: safeArray(sessions.items),
      loaded: sessions.loaded === true,
      loading: sessions.loading === true,
      error: safeText(sessions.error, ""),
      count: Number.isFinite(Number(sessions.count))
        ? Number(sessions.count)
        : safeArray(sessions.items).length,
    },
    view: {
      ...safeObject(source.view),
      form: {},
    },
    action: { ...safeObject(source.action) },
  };
}

function getDisplayName(detail = {}) {
  return safeText(first(
    detail.name, detail.displayName, detail.fullName, detail.nombre,
    detail.username, detail.email, "Usuario Onion"
  ), "Usuario Onion");
}

function getEmail(detail = {}) {
  return safeText(first(detail.email, detail.emailLower, ""), "Sin email");
}

function getUsername(detail = {}) {
  return safeText(first(detail.username, detail.usernameLower, detail.slug, ""), "sin-usuario");
}

function getUserId(detail = {}) {
  return safeText(first(detail.userId, detail.id, detail.uid, ""), "—");
}

function getClienteId(detail = {}) {
  return safeText(first(
    detail.clienteId, detail.clientId, detail.customerId,
    detail.cliente?.clienteId, detail.cliente?.id, ""
  ), "—");
}

function getRoleValue(detail = {}) {
  return normalizeKey(first(detail.role, detail.rol, safeArray(detail.roles)[0], "user"));
}

function getRole(detail = {}) {
  return getRoleValue(detail) === "admin" ? "Administrador" : "Usuario";
}

function getPhone(detail = {}) {
  return safeText(first(detail.phone, detail.telefono, ""), "No configurado");
}

function getThemeValue(detail = {}) {
  const darkMode = safeBoolean(detail.darkMode, false);
  const theme = normalizeKey(first(
    detail.theme, detail.mode, detail.appearance,
    darkMode ? "dark" : "light"
  ));
  return theme === "dark" ? "dark" : "light";
}

function getThemeLabel(detail = {}) {
  return getThemeValue(detail) === "dark" ? "Oscuro" : "Claro";
}

function getLangValue(detail = {}) {
  const lang = normalizeKey(first(detail.lang, detail.language, detail.locale, "es"));
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ca")) return "ca";
  return "es";
}

function getLangLabel(detail = {}) {
  const lang = getLangValue(detail);
  if (lang === "en") return "English";
  if (lang === "ca") return "Català";
  return "Español";
}

function getPrivacyMode(detail = {}) {
  return safeBoolean(detail.privacyMode, false);
}

function getPrivacyLabel(detail = {}) {
  return getPrivacyMode(detail) ? "Activada" : "Estándar";
}

function getAccountStatus(detail = {}) {
  const status = normalizeKey(first(
    detail.status,
    detail.estado,
    detail.active === false ? "disabled" : "active"
  ));

  if (["active", "enabled"].includes(status)) return "Activa";
  if (status === "pending") return "Pendiente";
  if (["disabled", "inactive", "blocked", "suspended", "deleted", "archived"].includes(status)) {
    return "Desactivada";
  }
  return safeText(status, "Activa");
}

function getAccountStatusTone(detail = {}) {
  const status = normalizeKey(getAccountStatus(detail));
  if (status === "activa") return "success";
  if (status === "pendiente") return "warning";
  if (status === "desactivada") return "danger";
  return "default";
}

function getAvatarUrl(detail = {}) {
  return safeAvatarUrl(first(detail.avatarUrl, detail.avatar, detail.picture, ""));
}

function getInitials(value = "") {
  const parts = safeText(value, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "ON";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || "ON";
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

function getCreatedAt(detail = {}) {
  return first(detail.createdAt, null);
}

function getUpdatedAt(detail = {}) {
  return first(detail.updatedAt, detail.preferences?.updatedAt, null);
}

function getLastLoginAt(detail = {}) {
  return first(detail.lastLoginAt, detail.lastSeenAt, null);
}

function getLastPasswordChangeAt(detail = {}) {
  return first(detail.lastPasswordChangeAt, null);
}

function icon(name = "") {
  const common = `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    user: `<svg ${common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
    image: `<svg ${common}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`,
    settings: `<svg ${common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4V9.6h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.4h4v.1A1.7 1.7 0 0 0 15 4.2a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1Z"/></svg>`,
    activity: `<svg ${common}><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>`,
    lock: `<svg ${common}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
    monitor: `<svg ${common}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`,
    power: `<svg ${common}><path d="M12 2v10"/><path d="M6.3 5.3a8 8 0 1 0 11.4 0"/></svg>`,
    shield: `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>`,
    check: `<svg ${common}><path d="m5 12 4 4L19 6"/></svg>`,
    alert: `<svg ${common}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    upload: `<svg ${common}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>`,
    trash: `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  };
  return icons[name] || icons.user;
}

function actionAttrs(action = "") {
  const value = safeText(action, "");
  return value
    ? `data-action="${escapeAttr(value)}" data-cuenta-action="${escapeAttr(value)}"`
    : "";
}

function renderSpinner(label = "") {
  return `
    <span class="cuenta-inline-loading" aria-hidden="${label ? "false" : "true"}">
      <span class="cuenta-inline-spinner" aria-hidden="true"></span>
      ${label ? `<span class="cuenta-inline-loading-text">${escapeHtml(label)}</span>` : ""}
    </span>
  `;
}

function renderButton({
  id = "",
  action = "",
  label = "",
  iconName = "",
  variant = "",
  type = "button",
  loading = false,
  loadingLabel = "Procesando...",
  disabled = false,
  extraClass = "",
} = {}) {
  const isBusy = Boolean(loading || disabled);
  const classes = joinClasses(
    "cuenta-btn",
    variant ? `cuenta-btn--${normalizeKey(variant)}` : "",
    loading ? "is-loading" : "",
    extraClass
  );

  return `
    <button
      ${id ? `id="${escapeAttr(id)}"` : ""}
      type="${type === "submit" ? "submit" : "button"}"
      class="${escapeAttr(classes)}"
      ${actionAttrs(action)}
      ${boolAttr(isBusy, 'disabled aria-disabled="true"')}
      ${boolAttr(loading, 'aria-busy="true"')}
    >
      ${loading
        ? renderSpinner(loadingLabel)
        : `${iconName ? icon(iconName) : ""}<span>${escapeHtml(label)}</span>`}
    </button>
  `;
}

function renderChip(label = "", tone = "default") {
  const text = safeText(label, "");
  if (!text) return "";
  return `<span class="cuenta-chip cuenta-chip--${escapeAttr(normalizeKey(tone) || "default")}">${escapeHtml(text)}</span>`;
}

function renderMiniStat({ label = "", value = "", tone = "default" } = {}) {
  return `
    <div class="cuenta-mini-stat cuenta-mini-stat--${escapeAttr(normalizeKey(tone) || "default")}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderMetaRow(label = "", value = "", tone = "default") {
  return `
    <div class="cuenta-meta-row cuenta-meta-row--${escapeAttr(normalizeKey(tone) || "default")}">
      <span class="cuenta-meta-label">${escapeHtml(label)}</span>
      <strong class="cuenta-meta-value">${escapeHtml(safeText(value, "—"))}</strong>
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
    <label class="${escapeAttr(joinClasses("cuenta-field", wide ? "cuenta-field--wide" : ""))}">
      <span class="cuenta-field-label">${escapeHtml(label)}</span>
      <input
        ${id ? `id="${escapeAttr(id)}"` : ""}
        type="${escapeAttr(type)}"
        value="${escapeAttr(safeText(value, ""))}"
        ${autocomplete ? `autocomplete="${escapeAttr(autocomplete)}"` : ""}
        readonly aria-readonly="true" tabindex="-1"
      >
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
  const fieldName = safeText(field || name, "");
  return `
    <label class="${escapeAttr(joinClasses("cuenta-field", wide ? "cuenta-field--wide" : ""))}">
      <span class="cuenta-field-label">${escapeHtml(label)}</span>
      <input
        ${id ? `id="${escapeAttr(id)}"` : ""}
        ${name ? `name="${escapeAttr(name)}"` : ""}
        data-cuenta-field="${escapeAttr(fieldName)}"
        data-field="${escapeAttr(fieldName)}"
        type="password"
        value=""
        placeholder="${escapeAttr(placeholder)}"
        ${autocomplete ? `autocomplete="${escapeAttr(autocomplete)}"` : ""}
        ${boolAttr(disabled, 'disabled aria-disabled="true"')}
      >
    </label>
  `;
}

function renderAvatar(detail = {}, size = "hero") {
  const name = getDisplayName(detail);
  const avatarUrl = getAvatarUrl(detail);
  const hasImage = Boolean(avatarUrl);

  return `
    <div
      class="${escapeAttr(joinClasses(
        "cuenta-avatar",
        `cuenta-avatar--${normalizeKey(size) || "hero"}`,
        hasImage ? "has-image" : ""
      ))}"
      role="img"
      aria-label="${escapeAttr(name)}"
      data-has-avatar="${hasImage ? "true" : "false"}"
    >
      ${hasImage ? `
        <img
          src="${escapeAttr(avatarUrl)}"
          alt=""
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          draggable="false"
          data-role="cuenta-avatar-img"
        >
      ` : ""}
      <span class="cuenta-avatar-fallback" aria-hidden="true">${escapeHtml(getInitials(name))}</span>
    </div>
  `;
}

function renderFeedback({ state = {}, hasDetail = false } = {}) {
  const localState = resolveLocalState(state);
  const error = localState.error;
  const success = safeText(localState.view?.successMessage, "");
  const authNotice = localState.authRefreshRequired === true;
  const deactivated = localState.deactivated === true;

  if (!hasDetail && error) return "";
  if (!error && !success && !authNotice && !deactivated) return "";

  return `
    <section class="cuenta-feedback" aria-live="polite">
      ${error ? `
        <div class="cuenta-feedback-item cuenta-feedback-item--error" role="alert">
          <span class="cuenta-feedback-icon" aria-hidden="true">${icon("alert")}</span>
          <div><strong>No se pudo completar</strong><span>${escapeHtml(error)}</span></div>
        </div>
      ` : ""}
      ${success ? `
        <div class="cuenta-feedback-item cuenta-feedback-item--success" role="status">
          <span class="cuenta-feedback-icon" aria-hidden="true">${icon("check")}</span>
          <div><strong>Operación completada</strong><span>${escapeHtml(success)}</span></div>
        </div>
      ` : ""}
      ${authNotice && !deactivated ? `
        <div class="cuenta-banner cuenta-banner--warning" role="status">
          Has cambiado una credencial de acceso. Si la sesión actual deja de ser válida, inicia sesión de nuevo.
        </div>
      ` : ""}
      ${deactivated ? `
        <div class="cuenta-banner cuenta-banner--error" role="alert">
          La cuenta está desactivada y ya no debería aceptar nuevos accesos.
        </div>
      ` : ""}
    </section>
  `;
}

export function renderHeader({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item) || {};
  const localState = resolveLocalState(state);
  const loading = localState.loading;
  const refreshing = localState.refreshing;

  const role = item ? getRole(detail) : "Usuario";
  const status = item ? getAccountStatus(detail) : "Activa";
  const statusTone = item ? getAccountStatusTone(detail) : "success";
  const updatedAt = item ? getUpdatedAt(detail) : null;
  const updatedText = updatedAt ? formatRelativeDate(updatedAt) : "Sin sincronización reciente";

  return `
    <section class="cuenta-hero" data-cuenta-section="hero">
      <div class="cuenta-hero-top">
        <div class="cuenta-hero-copy">
          <span class="cuenta-eyebrow">Cuenta personal</span>
          <h1 class="cuenta-title">Tu cuenta</h1>
          <p class="cuenta-subtitle">
            Revisa tu identidad, avatar y preferencias, protege el acceso y consulta tus sesiones desde un único lugar.
          </p>
        </div>

        <div class="cuenta-hero-actions">
          ${renderButton({
            id: "cuenta-hero-refresh-btn",
            action: "refresh-cuenta",
            label: "Actualizar",
            iconName: "refresh",
            loading: refreshing || loading,
            loadingLabel: "Actualizando...",
            disabled: refreshing || loading,
          })}
        </div>
      </div>

      <div class="cuenta-command-strip cuenta-account-strip">
        ${renderAvatar(detail, "hero")}
        <div class="cuenta-account-copy">
          <div class="cuenta-account-name">${escapeHtml(item ? getDisplayName(detail) : "Cuenta")}</div>
          <div class="cuenta-account-line">${escapeHtml(item ? getEmail(detail) : "Usuario autenticado")}</div>
          <div class="cuenta-account-line">@${escapeHtml(item ? getUsername(detail) : "sin-usuario")} · ${escapeHtml(role)}</div>
        </div>
        <div class="cuenta-account-stats">
          ${renderMiniStat({ label: "Estado", value: status, tone: statusTone })}
          ${renderMiniStat({ label: "Apariencia", value: item ? getThemeLabel(detail) : "—" })}
          ${renderMiniStat({ label: "Idioma", value: item ? getLangLabel(detail) : "—" })}
        </div>
      </div>

      <div class="cuenta-hero-meta">
        ${renderChip(`Rol · ${role}`, "accent")}
        ${renderChip(`Privacidad · ${item ? getPrivacyLabel(detail) : "—"}`, getPrivacyMode(detail) ? "success" : "default")}
        ${renderChip(`Actualizado · ${updatedText}`, refreshing || loading ? "warning" : "default")}
      </div>
    </section>
  `;
}

export function renderLoadingState() {
  return `
    <section class="cuenta-state cuenta-loading-state" aria-busy="true">
      <div class="cuenta-loading-grid">
        ${Array.from({ length: 4 }).map(() => `
          <article class="cuenta-skeleton-card" aria-hidden="true">
            <div class="cuenta-skeleton cuenta-skeleton--title"></div>
            <div class="cuenta-skeleton cuenta-skeleton--line"></div>
            <div class="cuenta-skeleton cuenta-skeleton--line-sm"></div>
            <div class="cuenta-skeleton cuenta-skeleton--control"></div>
            <div class="cuenta-skeleton cuenta-skeleton--line"></div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la cuenta.") {
  return `
    <section class="cuenta-state cuenta-error-state" role="alert">
      <span class="cuenta-state-icon cuenta-state-icon--error" aria-hidden="true">${icon("alert")}</span>
      <h3 class="cuenta-state-title">No se pudo cargar tu cuenta</h3>
      <p class="cuenta-state-text">${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}</p>
      ${renderButton({
        id: "cuenta-retry-btn",
        action: "refresh-cuenta",
        label: "Reintentar",
        iconName: "refresh",
        variant: "primary",
      })}
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="cuenta-state cuenta-empty-state">
      <span class="cuenta-state-icon" aria-hidden="true">${icon("user")}</span>
      <h3 class="cuenta-state-title">No hay datos de cuenta</h3>
      <p class="cuenta-state-text">No hemos recibido un perfil utilizable para la sesión actual. Puedes forzar una nueva consulta.</p>
      ${renderButton({
        id: "cuenta-empty-refresh-btn",
        action: "refresh-cuenta",
        label: "Actualizar cuenta",
        iconName: "refresh",
        variant: "primary",
      })}
    </section>
  `;
}

function renderCardHead({ title = "", text = "", iconName = "user" } = {}) {
  return `
    <div class="cuenta-card-head">
      <div class="cuenta-card-copy">
        <h2 class="cuenta-card-title">${escapeHtml(title)}</h2>
        <p class="cuenta-card-text">${escapeHtml(text)}</p>
      </div>
      <div class="cuenta-card-icon" aria-hidden="true">${icon(iconName)}</div>
    </div>
  `;
}

export function renderIdentityCard(detail = {}) {
  return `
    <article class="cuenta-card cuenta-card--accent" data-cuenta-card="identity">
      ${renderCardHead({
        title: "Identidad",
        text: "Información principal asociada a tu acceso a Onion Support.",
        iconName: "user",
      })}

      <div class="cuenta-banner cuenta-banner--info">
        Estos datos son informativos en esta vista. Los cambios administrativos se gestionan por los canales de soporte correspondientes.
      </div>

      <div class="cuenta-profile-grid">
        ${renderReadonlyField({ id: "cuenta-name-readonly", label: "Nombre", value: getDisplayName(detail), autocomplete: "name" })}
        ${renderReadonlyField({ id: "cuenta-username-readonly", label: "Usuario", value: `@${getUsername(detail)}`, autocomplete: "username" })}
        ${renderReadonlyField({ id: "cuenta-email-readonly", label: "Email", value: getEmail(detail), type: "email", autocomplete: "email" })}
        ${renderReadonlyField({ id: "cuenta-phone-readonly", label: "Teléfono", value: getPhone(detail), type: "tel", autocomplete: "tel" })}
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow("ID de usuario", getUserId(detail))}
        ${renderMetaRow("ID de cliente", getClienteId(detail))}
        ${renderMetaRow("Rol", getRole(detail))}
        ${renderMetaRow("Estado", getAccountStatus(detail), getAccountStatusTone(detail))}
      </div>
    </article>
  `;
}

export function renderAvatarCard(detail = {}, state = {}) {
  const localState = resolveLocalState(state);
  const busy = localState.saving || localState.refreshing;
  const hasAvatar = Boolean(getAvatarUrl(detail));

  return `
    <article class="cuenta-card" data-cuenta-card="avatar">
      ${renderCardHead({
        title: "Avatar",
        text: "Actualiza la imagen que te representa en el panel.",
        iconName: "image",
      })}

      <div class="cuenta-avatar-editor">
        ${renderAvatar(detail, "small")}
        <div class="cuenta-control-copy">
          <strong class="cuenta-control-title">Imagen de perfil</strong>
          <span class="cuenta-control-description">PNG, JPEG, WebP, GIF o AVIF · máximo 2 MB.</span>
        </div>
      </div>

      <label class="cuenta-field cuenta-file-field">
        <span class="cuenta-field-label">Seleccionar imagen</span>
        <input
          id="cuenta-avatar-input"
          name="avatar"
          data-cuenta-field="avatar"
          data-field="avatar"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          ${boolAttr(busy, 'disabled aria-disabled="true"')}
        >
      </label>

      <div class="cuenta-control-actions">
        ${renderButton({
          id: "cuenta-avatar-upload-btn",
          action: "upload-avatar",
          label: "Subir avatar",
          iconName: "upload",
          variant: "primary",
          loading: localState.saving,
          loadingLabel: "Subiendo...",
          disabled: busy,
        })}
        ${renderButton({
          id: "cuenta-avatar-delete-btn",
          action: "delete-avatar",
          label: "Eliminar",
          iconName: "trash",
          variant: "danger-ghost",
          disabled: busy || !hasAvatar,
        })}
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow("Avatar", hasAvatar ? "Configurado" : "Sin imagen", hasAvatar ? "success" : "default")}
        ${renderMetaRow("Última actualización", detail.avatarUpdatedAt ? formatDate(detail.avatarUpdatedAt) : "—")}
      </div>
    </article>
  `;
}

export function renderPreferencesCard(detail = {}) {
  const preferences = safeObject(detail.preferences);
  const privacy = getPrivacyMode(detail);

  return `
    <article class="cuenta-card" data-cuenta-card="preferences">
      ${renderCardHead({
        title: "Preferencias",
        text: "Configuración asociada actualmente a tu cuenta.",
        iconName: "settings",
      })}

      <div class="cuenta-banner cuenta-banner--info">
        La apariencia, el idioma y la privacidad se muestran aquí como referencia y no se guardan desde esta pantalla.
      </div>

      <div class="cuenta-meta-list">
        ${renderMetaRow("Apariencia", getThemeLabel(detail))}
        ${renderMetaRow("Privacidad", getPrivacyLabel(detail), privacy ? "success" : "default")}
        ${renderMetaRow("Idioma", getLangLabel(detail))}
        ${renderMetaRow("Zona horaria", safeText(first(detail.timezone, preferences.timezone, "Europe/Madrid"), "Europe/Madrid"))}
        ${renderMetaRow("Moneda", safeText(preferences.currency, "EUR"))}
      </div>
    </article>
  `;
}

export function renderActivityCard(detail = {}) {
  const updatedAt = getUpdatedAt(detail);
  const createdAt = getCreatedAt(detail);
  const lastLoginAt = getLastLoginAt(detail);
  const passwordChangedAt = getLastPasswordChangeAt(detail);

  return `
    <article class="cuenta-card cuenta-card--success" data-cuenta-card="activity">
      ${renderCardHead({
        title: "Actividad",
        text: "Fechas relevantes y señales de actividad de tu cuenta.",
        iconName: "activity",
      })}

      <div class="cuenta-meta-list">
        ${renderMetaRow("Última actualización", updatedAt ? formatDate(updatedAt) : "—")}
        ${renderMetaRow("Actividad reciente", updatedAt ? formatRelativeDate(updatedAt) : "Sin fecha")}
        ${renderMetaRow("Cuenta creada", createdAt ? formatDate(createdAt) : "—")}
        ${renderMetaRow("Último acceso", lastLoginAt ? formatDate(lastLoginAt) : "—")}
        ${renderMetaRow("Cambio de contraseña", passwordChangedAt ? formatDate(passwordChangedAt) : "—")}
        ${renderMetaRow("Email verificado", detail.emailVerified === true ? "Sí" : "No", detail.emailVerified === true ? "success" : "warning")}
      </div>
    </article>
  `;
}

export function renderSecurityCard(detail = {}, state = {}) {
  const localState = resolveLocalState(state);
  const busy = localState.saving || localState.refreshing;

  return `
    <article class="cuenta-card cuenta-card--warning" data-cuenta-card="security">
      ${renderCardHead({
        title: "Seguridad",
        text: "Cambia tu contraseña sin almacenar credenciales en el estado de la vista.",
        iconName: "lock",
      })}

      <form
        class="cuenta-password-block"
        data-cuenta-action="change-password"
        data-action="change-password"
        autocomplete="on"
        novalidate
      >
        <div class="cuenta-control-copy">
          <strong class="cuenta-control-title">Cambiar contraseña</strong>
          <span class="cuenta-control-description">Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo.</span>
        </div>

        <div class="cuenta-password-grid">
          ${renderPasswordField({
            id: "cuenta-current-password",
            name: "currentPassword",
            field: "currentPassword",
            label: "Contraseña actual (si aplica)",
            placeholder: "Contraseña actual",
            autocomplete: "current-password",
            disabled: busy,
          })}
          ${renderPasswordField({
            id: "cuenta-new-password",
            name: "newPassword",
            field: "newPassword",
            label: "Nueva contraseña",
            placeholder: "Nueva contraseña",
            autocomplete: "new-password",
            disabled: busy,
          })}
          ${renderPasswordField({
            id: "cuenta-confirm-password",
            name: "confirmPassword",
            field: "confirmPassword",
            label: "Confirmar contraseña",
            placeholder: "Repite la nueva contraseña",
            autocomplete: "new-password",
            disabled: busy,
            wide: true,
          })}
        </div>

        <div class="cuenta-password-actions">
          ${renderButton({
            id: "cuenta-password-btn",
            type: "submit",
            label: "Cambiar contraseña",
            iconName: "lock",
            variant: "primary",
            loading: localState.saving,
            loadingLabel: "Procesando...",
            disabled: busy,
          })}
        </div>
      </form>

      <div class="cuenta-meta-list">
        ${renderMetaRow("Último cambio", getLastPasswordChangeAt(detail) ? formatDate(getLastPasswordChangeAt(detail)) : "—")}
        ${renderMetaRow(
          "Estado de sesión",
          localState.authRefreshRequired ? "Renovación requerida" : "Sin renovación pendiente",
          localState.authRefreshRequired ? "warning" : "success"
        )}
      </div>
    </article>
  `;
}

function renderSessionRow(session = {}) {
  const item = safeObject(session);
  const device = safeText(item.device, "Dispositivo desconocido");
  const location = [safeText(item.location, ""), safeText(item.country, "")]
    .filter(Boolean)
    .join(" · ") || "Ubicación no disponible";
  const network = safeText(item.ip, "IP no disponible");
  const activeAt = item.lastActiveAt ? formatRelativeDate(item.lastActiveAt) : "Sin actividad reciente";
  const current = item.isCurrent === true;

  return `
    <div class="cuenta-session-row" data-cuenta-session-current="${current ? "true" : "false"}">
      <span class="cuenta-session-icon" aria-hidden="true">${icon("monitor")}</span>
      <div class="cuenta-session-copy">
        <strong>${escapeHtml(`${device}${current ? " · Actual" : ""}`)}</strong>
        <span>${escapeHtml(`${activeAt} · ${location}`)}</span>
      </div>
      <span class="cuenta-session-network" title="${escapeAttr(`${network} · ${location}`)}">${escapeHtml(network)}</span>
    </div>
  `;
}

export function renderSessionsCard(state = {}) {
  const localState = resolveLocalState(state);
  const sessions = localState.sessions;
  const busy = localState.saving || localState.refreshing;

  return `
    <article class="cuenta-card" data-cuenta-card="sessions">
      ${renderCardHead({
        title: "Sesiones",
        text: "Consulta los dispositivos con sesiones asociadas a tu cuenta.",
        iconName: "monitor",
      })}

      <div class="cuenta-control-actions">
        ${renderButton({
          id: "cuenta-sessions-load-btn",
          action: sessions.loaded ? "refresh-sessions" : "load-sessions",
          label: sessions.loaded ? "Actualizar sesiones" : "Cargar sesiones",
          iconName: "refresh",
          variant: "soft",
          loading: sessions.loading,
          loadingLabel: "Consultando...",
          disabled: busy || sessions.loading,
        })}
      </div>

      ${sessions.error ? `<div class="cuenta-banner cuenta-banner--error" role="alert">${escapeHtml(sessions.error)}</div>` : ""}

      ${sessions.loaded
        ? `<div class="cuenta-sessions-list">${sessions.items.length
            ? sessions.items.map(renderSessionRow).join("")
            : `<div class="cuenta-empty-inline">No hay sesiones activas.</div>`}</div>`
        : `<div class="cuenta-banner cuenta-banner--info">Las sesiones se consultan únicamente cuando tú lo solicitas.</div>`}
    </article>
  `;
}

export function renderDeactivateCard(detail = {}, state = {}) {
  const localState = resolveLocalState(state);
  const busy = localState.saving || localState.refreshing;
  const inactive =
    detail.active === false ||
    getAccountStatusTone(detail) === "danger" ||
    localState.deactivated;

  return `
    <article class="cuenta-card cuenta-card--danger" data-cuenta-card="deactivate">
      ${renderCardHead({
        title: "Desactivar cuenta",
        text: "Bloquea el acceso a tu cuenta. Esta operación requiere tu contraseña.",
        iconName: "power",
      })}

      ${inactive
        ? `<div class="cuenta-banner cuenta-banner--error">La cuenta figura como desactivada. No es necesario repetir la operación.</div>`
        : `
          <form
            class="cuenta-password-block"
            data-cuenta-action="deactivate-account"
            data-action="deactivate-account"
            autocomplete="on"
            novalidate
          >
            <div class="cuenta-control-copy">
              <strong class="cuenta-control-title">Confirmación</strong>
              <span class="cuenta-control-description">Introduce tu contraseña para confirmar la desactivación de la cuenta.</span>
            </div>

            <div class="cuenta-password-grid">
              ${renderPasswordField({
                id: "cuenta-deactivate-password",
                name: "deactivatePassword",
                field: "deactivatePassword",
                label: "Contraseña",
                placeholder: "Confirma tu contraseña",
                autocomplete: "current-password",
                disabled: busy,
                wide: true,
              })}
            </div>

            <div class="cuenta-password-actions">
              ${renderButton({
                id: "cuenta-deactivate-btn",
                type: "submit",
                label: "Desactivar mi cuenta",
                iconName: "power",
                variant: "danger",
                loading: localState.saving,
                loadingLabel: "Desactivando...",
                disabled: busy,
              })}
            </div>
          </form>
        `}

      <div class="cuenta-meta-list">
        ${renderMetaRow("Estado actual", getAccountStatus(detail), getAccountStatusTone(detail))}
        ${renderMetaRow("Consecuencia", "Acceso bloqueado y posible cierre de sesión", "warning")}
      </div>
    </article>
  `;
}

export function renderPanel({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = resolveLocalState(state);
  const loading = localState.loading;
  const refreshing = localState.refreshing;
  const saving = localState.saving;
  const busy = saving || refreshing;

  if (loading && !detail) return renderLoadingState();
  if (localState.error && !detail) return renderErrorState(localState.error);
  if (!detail) return renderEmptyState();

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
          ${renderIdentityCard(detail)}
          ${renderAvatarCard(detail, localState)}
          ${renderActivityCard(detail)}
        </div>
        <div class="cuenta-column">
          ${renderPreferencesCard(detail)}
          ${renderSecurityCard(detail, localState)}
          ${renderSessionsCard(localState)}
          ${renderDeactivateCard(detail, localState)}
        </div>
      </div>

      ${busy ? `
        <div class="cuenta-panel-overlay" aria-live="polite" aria-busy="true">
          <div class="cuenta-panel-overlay-card">
            <span class="cuenta-panel-overlay-spinner" aria-hidden="true"></span>
            <strong>${saving ? "Procesando operación..." : "Actualizando cuenta..."}</strong>
          </div>
        </div>
      ` : ""}
    </section>
  `;
}

export function renderCuentaTemplate({ item = null, state = {} } = {}) {
  const localState = resolveLocalState(state);
  const detail = resolveCuentaItem(item);

  return `
    <div
      class="cuenta-view"
      data-view="cuenta"
      data-cuenta-scope="true"
      data-cuenta-template="${escapeAttr(CUENTA_TEMPLATE_VERSION)}"
      data-cuenta-has-item="${detail ? "true" : "false"}"
      data-cuenta-loading="${localState.loading ? "true" : "false"}"
      data-cuenta-refreshing="${localState.refreshing ? "true" : "false"}"
      data-cuenta-saving="${localState.saving ? "true" : "false"}"
      data-cuenta-self-update="false"
      data-cuenta-auth-refresh-required="${localState.authRefreshRequired ? "true" : "false"}"
      data-cuenta-deactivated="${localState.deactivated ? "true" : "false"}"
    >
      ${renderHeader({ item: detail, state: localState })}
      ${renderFeedback({ state: localState, hasDetail: Boolean(detail) })}
      ${renderPanel({ item: detail, state: localState })}
    </div>
  `;
}

export function renderCuentaViewTemplate({ item = null, state = {} } = {}) {
  return renderCuentaTemplate({ item, state });
}

export function getCuentaTemplateSnapshot({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = resolveLocalState(state);

  return {
    version: CUENTA_TEMPLATE_VERSION,
    hasItem: Boolean(detail),
    loading: localState.loading,
    refreshing: localState.refreshing,
    saving: localState.saving,
    authRefreshRequired: localState.authRefreshRequired,
    deactivated: localState.deactivated,
    sessions: {
      loaded: localState.sessions.loaded,
      loading: localState.sessions.loading,
      count: localState.sessions.items.length,
    },
    capabilities: { ...localState.capabilities },
    renderedActions: [
      "refresh-cuenta",
      "upload-avatar",
      "delete-avatar",
      "change-password",
      "load-sessions",
      "refresh-sessions",
      "deactivate-account",
    ],
    unsupportedActionsRendered: [],
    architecture: {
      pureTemplate: true,
      http: false,
      store: false,
      router: false,
      listeners: false,
      rawBackendParsing: false,
      editableProfile: false,
      editableTheme: false,
      editablePrivacy: false,
      editableLanguage: false,
      sessionIdRendered: false,
      passwordValueRendered: false,
      keyboardFormSubmit: true,
      safeAvatarUrls: true,
      azureAvatarSasRuntimeOnly: true,
    },
  };
}

export function getSnapshot(input = {}) {
  return getCuentaTemplateSnapshot(input);
}

export default {
  version: CUENTA_TEMPLATE_VERSION,
  capabilities: CUENTA_TEMPLATE_CAPABILITIES,
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
