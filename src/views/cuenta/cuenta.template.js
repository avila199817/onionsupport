/* =========================================================
   Onion Support - Cuenta Template
   Archivo: /src/views/cuenta/cuenta.template.js

   PRODUCTIVO · FOCUSED SELF-SERVICE · V4

   Cuenta queda reducida a cuatro bloques útiles:
   1) Foto de perfil.
   2) Contraseña.
   3) Apariencia e idioma.
   4) Desactivación de cuenta.

   Sin botón manual de actualizar, sesiones, actividad, privacidad,
   zona horaria, moneda ni ficha administrativa duplicada.
========================================================= */

export const CUENTA_TEMPLATE_VERSION =
  "cuenta.template.productivo.v4.focused-self-service";

export const CUENTA_TEMPLATE_CAPABILITIES = Object.freeze({
  readSelf: true,
  changePassword: true,
  avatarUpload: true,
  avatarDelete: true,
  deactivateSelf: true,
  localThemePreference: true,
  localAccentPreference: true,
  localLanguagePreference: true,
  manualRefreshUi: false,
});

export const CUENTA_ACTIONS = Object.freeze({
  RETRY: "retry-cuenta",
  CHOOSE_AVATAR: "choose-avatar",
  DELETE_AVATAR: "delete-avatar",
  CHANGE_PASSWORD: "change-password",
  SET_THEME: "set-theme",
  SET_ACCENT: "set-accent",
  SET_LOCALE: "set-locale",
  DEACTIVATE: "deactivate-account",
});

const ACCENTS = Object.freeze([
  { key: "graphite", label: "Graphite", value: "#696969" },
  { key: "blue", label: "Blue", value: "#3b82f6" },
  { key: "violet", label: "Violet", value: "#8b5cf6" },
  { key: "emerald", label: "Emerald", value: "#10b981" },
  { key: "rose", label: "Rose", value: "#f43f5e" },
]);

const COPY = Object.freeze({
  es: Object.freeze({
    eyebrow: "Cuenta personal",
    title: "Cuenta",
    subtitle: "Lo esencial para mantener tu acceso, tu foto y la apariencia de Onion Support bajo control.",
    active: "Activa",
    disabled: "Desactivada",
    pending: "Pendiente",
    roleAdmin: "Administrador",
    roleUser: "Usuario",
    photoTitle: "Foto de perfil",
    photoText: "Cambia la imagen que aparece en el panel.",
    choosePhoto: "Cambiar foto",
    removePhoto: "Quitar foto",
    photoHint: "PNG, JPEG, WebP, GIF o AVIF · máximo 2 MB.",
    passwordTitle: "Contraseña",
    passwordText: "Actualiza tu credencial de acceso de forma segura.",
    currentPassword: "Contraseña actual",
    newPassword: "Nueva contraseña",
    confirmPassword: "Repetir contraseña",
    passwordHint: "Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo.",
    passwordButton: "Cambiar contraseña",
    appearanceTitle: "Apariencia e idioma",
    appearanceText: "Personaliza la web sin esperar a una actualización del servidor.",
    modeLabel: "Modo",
    system: "Sistema",
    light: "Claro",
    dark: "Oscuro",
    colorLabel: "Color",
    languageLabel: "Idioma",
    deactivateTitle: "Desactivar cuenta",
    deactivateText: "Bloquea tu acceso. Requiere tu contraseña y puede cerrar la sesión actual.",
    deactivatePassword: "Contraseña para confirmar",
    deactivateButton: "Desactivar mi cuenta",
    deactivatedNotice: "La cuenta ya figura como desactivada.",
    danger: "Esta acción afecta al acceso de la cuenta.",
    retryTitle: "No se pudo cargar la cuenta",
    retryText: "No hemos podido obtener tus datos. Reintenta la consulta.",
    retry: "Reintentar",
    loading: "Cargando cuenta",
    successTitle: "Hecho",
    errorTitle: "No se pudo completar",
  }),
  ca: Object.freeze({
    eyebrow: "Compte personal",
    title: "Compte",
    subtitle: "L'essencial per mantenir l'accés, la foto i l'aparença d'Onion Support sota control.",
    active: "Actiu",
    disabled: "Desactivat",
    pending: "Pendent",
    roleAdmin: "Administrador",
    roleUser: "Usuari",
    photoTitle: "Foto de perfil",
    photoText: "Canvia la imatge que apareix al panell.",
    choosePhoto: "Canviar foto",
    removePhoto: "Treure foto",
    photoHint: "PNG, JPEG, WebP, GIF o AVIF · màxim 2 MB.",
    passwordTitle: "Contrasenya",
    passwordText: "Actualitza la credencial d'accés de forma segura.",
    currentPassword: "Contrasenya actual",
    newPassword: "Contrasenya nova",
    confirmPassword: "Repetir contrasenya",
    passwordHint: "Mínim 10 caràcters amb majúscula, minúscula, número i símbol.",
    passwordButton: "Canviar contrasenya",
    appearanceTitle: "Aparença i idioma",
    appearanceText: "Personalitza el web sense esperar una actualització del servidor.",
    modeLabel: "Mode",
    system: "Sistema",
    light: "Clar",
    dark: "Fosc",
    colorLabel: "Color",
    languageLabel: "Idioma",
    deactivateTitle: "Desactivar compte",
    deactivateText: "Bloqueja el teu accés. Requereix la contrasenya i pot tancar la sessió actual.",
    deactivatePassword: "Contrasenya per confirmar",
    deactivateButton: "Desactivar el meu compte",
    deactivatedNotice: "El compte ja figura com a desactivat.",
    danger: "Aquesta acció afecta l'accés del compte.",
    retryTitle: "No s'ha pogut carregar el compte",
    retryText: "No hem pogut obtenir les teves dades. Torna-ho a provar.",
    retry: "Reintentar",
    loading: "Carregant compte",
    successTitle: "Fet",
    errorTitle: "No s'ha pogut completar",
  }),
  en: Object.freeze({
    eyebrow: "Personal account",
    title: "Account",
    subtitle: "The essentials to keep your access, profile photo and Onion Support appearance under control.",
    active: "Active",
    disabled: "Disabled",
    pending: "Pending",
    roleAdmin: "Administrator",
    roleUser: "User",
    photoTitle: "Profile photo",
    photoText: "Change the image shown across the dashboard.",
    choosePhoto: "Change photo",
    removePhoto: "Remove photo",
    photoHint: "PNG, JPEG, WebP, GIF or AVIF · maximum 2 MB.",
    passwordTitle: "Password",
    passwordText: "Update your access credential securely.",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Repeat password",
    passwordHint: "At least 10 characters with upper case, lower case, a number and a symbol.",
    passwordButton: "Change password",
    appearanceTitle: "Appearance and language",
    appearanceText: "Personalize the website without waiting for a server update.",
    modeLabel: "Mode",
    system: "System",
    light: "Light",
    dark: "Dark",
    colorLabel: "Color",
    languageLabel: "Language",
    deactivateTitle: "Deactivate account",
    deactivateText: "Blocks access to your account. Your password is required and the current session may close.",
    deactivatePassword: "Password to confirm",
    deactivateButton: "Deactivate my account",
    deactivatedNotice: "The account is already marked as disabled.",
    danger: "This action affects account access.",
    retryTitle: "Account could not be loaded",
    retryText: "We could not retrieve your account data. Try again.",
    retry: "Retry",
    loading: "Loading account",
    successTitle: "Done",
    errorTitle: "Could not complete",
  }),
});

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeText(value = "", fallback = "") {
  const text = String(value ?? "")
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

const attr = escapeHtml;

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeLocale(value = "") {
  const key = normalizeKey(value).replace(/_/g, "-");
  if (key.startsWith("ca")) return "ca";
  if (key.startsWith("en")) return "en";
  return "es";
}

function normalizeThemeMode(value = "") {
  const key = normalizeKey(value);
  return ["system", "light", "dark"].includes(key) ? key : "system";
}

function normalizeAccent(value = "") {
  const key = normalizeKey(value);
  return ACCENTS.some((item) => item.key === key) ? key : "graphite";
}

function resolveState(state = {}) {
  const source = safeObject(state);
  const preferences = safeObject(source.preferences);
  return {
    loading: source.loading === true,
    saving: source.saving === true,
    savingAction: safeText(source.savingAction, ""),
    error: safeText(source.error, ""),
    success: safeText(first(source.success, source.view?.successMessage, ""), ""),
    deactivated: source.deactivated === true,
    preferences: {
      themeMode: normalizeThemeMode(first(preferences.themeMode, "system")),
      accent: normalizeAccent(first(preferences.accent, "graphite")),
      locale: normalizeLocale(first(preferences.locale, "es")),
    },
  };
}

function copyFor(state = {}) {
  const locale = resolveState(state).preferences.locale;
  return COPY[locale] || COPY.es;
}

function isAzureBlobHost(hostname = "") {
  const host = safeText(hostname, "").toLowerCase();
  return host === "blob.core.windows.net" || host.endsWith(".blob.core.windows.net");
}

function safeAvatarUrl(value = "") {
  const raw = safeText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw) || /^(javascript|data|vbscript|file):/i.test(raw)) {
    return "";
  }
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  const localHttp = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw);
  if (!/^https:\/\//i.test(raw) && !localHttp) return "";
  try {
    const url = new URL(raw);
    const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
    const sensitive = ["access_token", "refresh_token", "id_token", "token", "code", "secret", "session", "password", "pwd", "key", "jwt", "authorization"];
    if (keys.some((key) => sensitive.includes(key))) return "";
    const sas = ["sig", "se", "sp", "sv", "sr", "spr", "st", "skoid", "sktid", "skt", "ske", "sks", "skv"];
    if (keys.some((key) => sas.includes(key)) && !isAzureBlobHost(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function getName(detail = {}) {
  return safeText(first(detail.name, detail.displayName, detail.fullName, detail.username, detail.email, "Usuario Onion"), "Usuario Onion");
}

function getEmail(detail = {}) {
  return safeText(first(detail.email, detail.emailLower, ""), "—");
}

function getUsername(detail = {}) {
  return safeText(first(detail.username, detail.usernameLower, detail.slug, ""), "—");
}

function getRole(detail = {}, state = {}) {
  const key = normalizeKey(first(detail.role, detail.rol, "user"));
  const c = copyFor(state);
  return key === "admin" ? c.roleAdmin : c.roleUser;
}

function getStatus(detail = {}, state = {}) {
  const c = copyFor(state);
  const key = normalizeKey(first(detail.status, detail.estado, detail.active === false ? "disabled" : "active"));
  if (key === "pending") return { label: c.pending, tone: "warning" };
  if (["disabled", "inactive", "blocked", "suspended"].includes(key) || detail.active === false) {
    return { label: c.disabled, tone: "danger" };
  }
  return { label: c.active, tone: "success" };
}

function initials(name = "") {
  const parts = safeText(name, "ON").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function icon(name = "") {
  const common = 'aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const icons = {
    image: `<svg ${common}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`,
    lock: `<svg ${common}><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    palette: `<svg ${common}><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 4-4 4h-1.8a2 2 0 0 0-1.7 3l.3.5A1.7 1.7 0 0 1 13.3 22H12Z"/></svg>`,
    power: `<svg ${common}><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>`,
    upload: `<svg ${common}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>`,
    trash: `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></svg>`,
    alert: `<svg ${common}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    check: `<svg ${common}><path d="m5 12 4 4L19 6"/></svg>`,
    globe: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20"/><path d="M12 2a15.3 15.3 0 0 0 0 20"/></svg>`,
    user: `<svg ${common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  };
  return icons[name] || icons.user;
}

function renderButton({ action = "", label = "", iconName = "", variant = "", disabled = false, type = "button", value = "" } = {}) {
  return `
    <button
      type="${attr(type)}"
      class="cuenta-btn${variant ? ` cuenta-btn--${attr(variant)}` : ""}"
      ${action ? `data-cuenta-action="${attr(action)}" data-action="${attr(action)}"` : ""}
      ${value ? `data-value="${attr(value)}"` : ""}
      ${disabled ? 'disabled aria-disabled="true"' : ""}
    >
      ${iconName ? icon(iconName) : ""}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderAvatar(detail = {}, size = "hero") {
  const name = getName(detail);
  const src = safeAvatarUrl(first(detail.avatarUrl, detail.avatar, detail.picture, ""));
  return `
    <span class="cuenta-avatar cuenta-avatar--${attr(size)}${src ? " has-image" : " is-fallback"}" role="img" aria-label="${attr(name)}">
      ${src ? `<img class="cuenta-avatar-img" src="${attr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}
      <span class="cuenta-avatar-fallback" aria-hidden="true">${escapeHtml(initials(name))}</span>
    </span>
  `;
}

function renderCardHead(title, text, iconName) {
  return `
    <div class="cuenta-card-head">
      <div class="cuenta-card-heading">
        <h2 class="cuenta-card-title">${escapeHtml(title)}</h2>
        <p class="cuenta-card-text">${escapeHtml(text)}</p>
      </div>
      <span class="cuenta-card-icon" aria-hidden="true">${icon(iconName)}</span>
    </div>
  `;
}

function renderPasswordField({ name, label, placeholder, autocomplete, disabled = false } = {}) {
  return `
    <label class="cuenta-field">
      <span class="cuenta-field-label">${escapeHtml(label)}</span>
      <input
        type="password"
        name="${attr(name)}"
        data-cuenta-field="${attr(name)}"
        autocomplete="${attr(autocomplete || "off")}"
        placeholder="${attr(placeholder || label)}"
        ${disabled ? 'disabled aria-disabled="true"' : ""}
      >
    </label>
  `;
}

export function renderHeader({ item = null, state = {} } = {}) {
  const detail = safeObject(item);
  const local = resolveState(state);
  const c = copyFor(local);
  const status = getStatus(detail, local);
  return `
    <section class="cuenta-hero" data-cuenta-section="hero">
      <div class="cuenta-hero-copy">
        <span class="cuenta-eyebrow">${escapeHtml(c.eyebrow)}</span>
        <h1 class="cuenta-title">${escapeHtml(c.title)}</h1>
        <p class="cuenta-subtitle">${escapeHtml(c.subtitle)}</p>
      </div>

      <div class="cuenta-profile-summary">
        ${renderAvatar(detail, "hero")}
        <div class="cuenta-profile-copy">
          <strong class="cuenta-profile-name">${escapeHtml(getName(detail))}</strong>
          <span class="cuenta-profile-email">${escapeHtml(getEmail(detail))}</span>
          <span class="cuenta-profile-user">@${escapeHtml(getUsername(detail))}</span>
        </div>
        <div class="cuenta-profile-badges">
          <span class="cuenta-chip cuenta-chip--accent">${escapeHtml(getRole(detail, local))}</span>
          <span class="cuenta-chip cuenta-chip--${attr(status.tone)}">${escapeHtml(status.label)}</span>
        </div>
      </div>
    </section>
  `;
}

export function renderFeedback({ state = {} } = {}) {
  const local = resolveState(state);
  const c = copyFor(local);
  if (!local.error && !local.success) return "";
  return `
    <section class="cuenta-feedback" aria-live="polite">
      ${local.error ? `<div class="cuenta-feedback-item cuenta-feedback-item--error" role="alert"><span>${icon("alert")}</span><div><strong>${escapeHtml(c.errorTitle)}</strong><p>${escapeHtml(local.error)}</p></div></div>` : ""}
      ${local.success ? `<div class="cuenta-feedback-item cuenta-feedback-item--success" role="status"><span>${icon("check")}</span><div><strong>${escapeHtml(c.successTitle)}</strong><p>${escapeHtml(local.success)}</p></div></div>` : ""}
    </section>
  `;
}

export function renderLoadingState(state = {}) {
  const c = copyFor(state);
  return `
    <section class="cuenta-loading" aria-busy="true" aria-label="${attr(c.loading)}">
      ${Array.from({ length: 4 }).map(() => `<article class="cuenta-card cuenta-card--skeleton" aria-hidden="true"><span class="cuenta-skeleton cuenta-skeleton--title"></span><span class="cuenta-skeleton"></span><span class="cuenta-skeleton cuenta-skeleton--short"></span><span class="cuenta-skeleton cuenta-skeleton--control"></span></article>`).join("")}
    </section>
  `;
}

export function renderErrorState(message = "", state = {}) {
  const c = copyFor(state);
  return `
    <section class="cuenta-error" role="alert">
      <span class="cuenta-error-icon">${icon("alert")}</span>
      <div><h2>${escapeHtml(c.retryTitle)}</h2><p>${escapeHtml(message || c.retryText)}</p></div>
      ${renderButton({ action: CUENTA_ACTIONS.RETRY, label: c.retry, iconName: "alert", variant: "primary" })}
    </section>
  `;
}

export function renderEmptyState(state = {}) {
  return renderErrorState("", state);
}

export function renderAvatarCard(detail = {}, state = {}) {
  const local = resolveState(state);
  const c = copyFor(local);
  const busy = local.saving && local.savingAction === "avatar";
  const hasAvatar = Boolean(safeAvatarUrl(first(detail.avatarUrl, detail.avatar, detail.picture, "")));
  return `
    <article class="cuenta-card cuenta-card--photo" data-cuenta-card="avatar">
      ${renderCardHead(c.photoTitle, c.photoText, "image")}
      <div class="cuenta-photo-control">
        ${renderAvatar(detail, "card")}
        <div class="cuenta-photo-copy"><strong>${escapeHtml(getName(detail))}</strong><span>${escapeHtml(c.photoHint)}</span></div>
      </div>
      <input class="cuenta-file-input" type="file" name="avatar" data-cuenta-field="avatar" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" ${busy ? "disabled" : ""}>
      <div class="cuenta-actions">
        ${renderButton({ action: CUENTA_ACTIONS.CHOOSE_AVATAR, label: c.choosePhoto, iconName: "upload", variant: "primary", disabled: busy })}
        ${renderButton({ action: CUENTA_ACTIONS.DELETE_AVATAR, label: c.removePhoto, iconName: "trash", variant: "ghost", disabled: busy || !hasAvatar })}
      </div>
    </article>
  `;
}

export function renderSecurityCard(detail = {}, state = {}) {
  void detail;
  const local = resolveState(state);
  const c = copyFor(local);
  const busy = local.saving && local.savingAction === "password";
  return `
    <article class="cuenta-card cuenta-card--security" data-cuenta-card="security">
      ${renderCardHead(c.passwordTitle, c.passwordText, "lock")}
      <form class="cuenta-form" data-cuenta-action="${CUENTA_ACTIONS.CHANGE_PASSWORD}" autocomplete="on" novalidate>
        <p class="cuenta-hint">${escapeHtml(c.passwordHint)}</p>
        <div class="cuenta-password-grid">
          ${renderPasswordField({ name: "currentPassword", label: c.currentPassword, autocomplete: "current-password", disabled: busy })}
          ${renderPasswordField({ name: "newPassword", label: c.newPassword, autocomplete: "new-password", disabled: busy })}
          ${renderPasswordField({ name: "confirmPassword", label: c.confirmPassword, autocomplete: "new-password", disabled: busy })}
        </div>
        <div class="cuenta-actions">${renderButton({ type: "submit", label: c.passwordButton, iconName: "lock", variant: "primary", disabled: busy })}</div>
      </form>
    </article>
  `;
}

function renderThemeOption(key, label, selected) {
  return `
    <button type="button" class="cuenta-segment${selected ? " is-active" : ""}" data-cuenta-action="${CUENTA_ACTIONS.SET_THEME}" data-value="${attr(key)}" aria-pressed="${selected ? "true" : "false"}">${escapeHtml(label)}</button>
  `;
}

export function renderAppearanceCard(detail = {}, state = {}) {
  void detail;
  const local = resolveState(state);
  const c = copyFor(local);
  const pref = local.preferences;
  return `
    <article class="cuenta-card cuenta-card--appearance" data-cuenta-card="appearance">
      ${renderCardHead(c.appearanceTitle, c.appearanceText, "palette")}

      <div class="cuenta-preference-group">
        <span class="cuenta-preference-label">${escapeHtml(c.modeLabel)}</span>
        <div class="cuenta-segments" role="group" aria-label="${attr(c.modeLabel)}">
          ${renderThemeOption("system", c.system, pref.themeMode === "system")}
          ${renderThemeOption("light", c.light, pref.themeMode === "light")}
          ${renderThemeOption("dark", c.dark, pref.themeMode === "dark")}
        </div>
      </div>

      <div class="cuenta-preference-group">
        <span class="cuenta-preference-label">${escapeHtml(c.colorLabel)}</span>
        <div class="cuenta-swatches" role="radiogroup" aria-label="${attr(c.colorLabel)}">
          ${ACCENTS.map((accent) => `
            <button
              type="button"
              class="cuenta-swatch${pref.accent === accent.key ? " is-active" : ""}"
              data-cuenta-action="${CUENTA_ACTIONS.SET_ACCENT}"
              data-value="${attr(accent.key)}"
              data-accent-preview="${attr(accent.key)}"
              role="radio"
              aria-checked="${pref.accent === accent.key ? "true" : "false"}"
              aria-label="${attr(accent.label)}"
              title="${attr(accent.label)}"
            ><span></span></button>
          `).join("")}
        </div>
      </div>

      <label class="cuenta-field cuenta-field--select">
        <span class="cuenta-field-label">${escapeHtml(c.languageLabel)}</span>
        <span class="cuenta-select-wrap">${icon("globe")}
          <select data-cuenta-field="locale" data-cuenta-action="${CUENTA_ACTIONS.SET_LOCALE}" aria-label="${attr(c.languageLabel)}">
            <option value="es" ${pref.locale === "es" ? "selected" : ""}>Español</option>
            <option value="ca" ${pref.locale === "ca" ? "selected" : ""}>Català</option>
            <option value="en" ${pref.locale === "en" ? "selected" : ""}>English</option>
          </select>
        </span>
      </label>
    </article>
  `;
}

export function renderDeactivateCard(detail = {}, state = {}) {
  const local = resolveState(state);
  const c = copyFor(local);
  const status = getStatus(detail, local);
  const inactive = status.tone === "danger" || local.deactivated;
  const busy = local.saving && local.savingAction === "deactivate";
  return `
    <article class="cuenta-card cuenta-card--danger" data-cuenta-card="deactivate">
      ${renderCardHead(c.deactivateTitle, c.deactivateText, "power")}
      ${inactive
        ? `<div class="cuenta-danger-notice">${escapeHtml(c.deactivatedNotice)}</div>`
        : `<form class="cuenta-form" data-cuenta-action="${CUENTA_ACTIONS.DEACTIVATE}" autocomplete="on" novalidate>
            <p class="cuenta-hint cuenta-hint--danger">${escapeHtml(c.danger)}</p>
            ${renderPasswordField({ name: "deactivatePassword", label: c.deactivatePassword, autocomplete: "current-password", disabled: busy })}
            <div class="cuenta-actions">${renderButton({ type: "submit", label: c.deactivateButton, iconName: "power", variant: "danger", disabled: busy })}</div>
          </form>`}
    </article>
  `;
}

/* Compatibilidad pública: la UI V4 ya no renderiza estos bloques. */
export function renderIdentityCard() { return ""; }
export function renderPreferencesCard(detail = {}, state = {}) { return renderAppearanceCard(detail, state); }
export function renderActivityCard() { return ""; }
export function renderSessionsCard() { return ""; }

export function renderPanel({ item = null, state = {} } = {}) {
  const detail = isObject(item) ? item : null;
  const local = resolveState(state);
  if (local.loading && !detail) return renderLoadingState(local);
  if (local.error && !detail) return renderErrorState(local.error, local);
  if (!detail) return renderEmptyState(local);

  return `
    <section class="cuenta-panel" data-cuenta-section="panel">
      <div class="cuenta-cards-grid">
        ${renderAvatarCard(detail, local)}
        ${renderSecurityCard(detail, local)}
        ${renderAppearanceCard(detail, local)}
        ${renderDeactivateCard(detail, local)}
      </div>
    </section>
  `;
}

export function renderCuentaTemplate({ item = null, state = {} } = {}) {
  const local = resolveState(state);
  const detail = isObject(item) ? item : null;
  return `
    <div
      class="cuenta-view"
      data-view="cuenta"
      data-cuenta-scope="true"
      data-cuenta-template="${attr(CUENTA_TEMPLATE_VERSION)}"
      data-cuenta-loading="${local.loading ? "true" : "false"}"
      data-cuenta-saving="${local.saving ? "true" : "false"}"
      data-cuenta-locale="${attr(local.preferences.locale)}"
      data-cuenta-accent="${attr(local.preferences.accent)}"
      data-cuenta-theme-mode="${attr(local.preferences.themeMode)}"
    >
      ${detail ? renderHeader({ item: detail, state: local }) : ""}
      ${renderFeedback({ state: local })}
      ${renderPanel({ item: detail, state: local })}
    </div>
  `;
}

export const renderCuentaViewTemplate = renderCuentaTemplate;

export function getCuentaTemplateSnapshot({ item = null, state = {} } = {}) {
  const local = resolveState(state);
  return {
    version: CUENTA_TEMPLATE_VERSION,
    hasItem: isObject(item),
    loading: local.loading,
    saving: local.saving,
    preferences: { ...local.preferences },
    renderedCards: ["avatar", "security", "appearance", "deactivate"],
    renderedActions: [
      CUENTA_ACTIONS.CHOOSE_AVATAR,
      CUENTA_ACTIONS.DELETE_AVATAR,
      CUENTA_ACTIONS.CHANGE_PASSWORD,
      CUENTA_ACTIONS.SET_THEME,
      CUENTA_ACTIONS.SET_ACCENT,
      CUENTA_ACTIONS.SET_LOCALE,
      CUENTA_ACTIONS.DEACTIVATE,
    ],
    architecture: {
      pureTemplate: true,
      manualRefreshUi: false,
      sessionsUi: false,
      activityUi: false,
      privacyUi: false,
      administrativeProfileUi: false,
      passwordValueRendered: false,
      safeAvatarUrls: true,
      focusedSelfService: true,
    },
  };
}

export const getSnapshot = getCuentaTemplateSnapshot;

export default Object.freeze({
  version: CUENTA_TEMPLATE_VERSION,
  capabilities: CUENTA_TEMPLATE_CAPABILITIES,
  actions: CUENTA_ACTIONS,
  renderHeader,
  renderFeedback,
  renderLoadingState,
  renderErrorState,
  renderEmptyState,
  renderAvatarCard,
  renderSecurityCard,
  renderAppearanceCard,
  renderDeactivateCard,
  renderIdentityCard,
  renderPreferencesCard,
  renderActivityCard,
  renderSessionsCard,
  renderPanel,
  renderCuentaTemplate,
  renderCuentaViewTemplate,
  getCuentaTemplateSnapshot,
  getSnapshot,
});
