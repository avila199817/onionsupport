/* =========================================================
   Onion SPA - Cuenta Template
   Archivo: src/views/cuenta/cuenta.template.js

   EXTREME PRO SYSTEM · ACCOUNT SETTINGS COMMAND CENTER · 14/10
   CLEAN TEMPLATE ONLY · NO INLINE CSS · NO STYLE INJECTION
   NO INLINE IMG HANDLERS · NO NATIVE TITLE TOOLTIP · CSP CLEAN
   VARIABLES.CSS + UI.CSS + CUENTA.CSS EXTERNAL ONLY

   RESPONSABILIDADES:
   - render header premium de cuenta
   - render panel productivo de ajustes
   - render perfil / apariencia / idioma / privacidad / seguridad / actividad
   - render loading / error / empty
   - soportar avatar real + fallback por iniciales
   - soportar darkMode / idioma / cambio de contraseña
   - mantener compatibilidad con cuentaView.js
   - mantener compatibilidad con cuenta.bindings.js
   - acciones compatibles con data-action y data-cuenta-action
   - inputs compatibles con data-role / data-cuenta-field / name
   - preservar valores de state.view.form en rerender
   - evitar IDs duplicados
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

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
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

function escapeAttr(value = "") {
  return escapeHtml(value);
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

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value !== 0;
  }

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

  return Boolean(fallback);
}

function truncate(value = "", max = 120) {
  const text = safeText(value, "");
  const limit = Math.max(1, safeNumber(max, 120));

  if (!text) return "";
  if (text.length <= limit) return text;

  return `${text.slice(0, limit).trim()}…`;
}

function joinClasses(...values) {
  return values
    .flatMap((value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      return String(value).split(/\s+/g);
    })
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function boolAttr(condition, attr = "") {
  return condition ? attr : "";
}

function normalizeLangValue(value = "es") {
  const key = normalizeKey(value);

  if (["en", "eng", "english", "en_us", "en_gb"].includes(key)) return "en";
  if (["ca", "cat", "catala", "catalan", "ca_es"].includes(key)) return "ca";

  return "es";
}

function normalizeThemeValue(value = "", fallbackDarkMode = false) {
  const key = normalizeKey(value);

  if (["dark", "oscuro", "night", "theme_dark"].includes(key)) return "dark";
  if (["light", "claro", "day", "theme_light"].includes(key)) return "light";

  return safeBoolean(fallbackDarkMode, false) ? "dark" : "light";
}

function isRenderableImageUrl(value = "") {
  const raw = safeText(value, "");
  if (!raw) return false;

  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(raw)) return true;
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

function normalizeDetailSafe(raw = null) {
  if (!raw || typeof raw !== "object") return null;

  try {
    const normalized = normalizeCuentaModel(raw);
    return normalized || raw;
  } catch {
    return raw;
  }
}

function resolveCuentaItem(item = null) {
  if (item && typeof item === "object") {
    return normalizeDetailSafe(item);
  }

  try {
    const fromStore = getCuentaStore();

    if (fromStore) {
      return normalizeDetailSafe(fromStore);
    }
  } catch {}

  try {
    const fromState = safeObject(cuentaState?.item);

    if (Object.keys(fromState).length) {
      return normalizeDetailSafe(fromState);
    }
  } catch {}

  return null;
}

function resolveLocalState(state = {}) {
  return {
    ...safeObject(cuentaState),
    ...safeObject(state),
    view: {
      ...safeObject(cuentaState?.view),
      ...safeObject(state?.view),
      form: {
        ...safeObject(cuentaState?.view?.form),
        ...safeObject(state?.view?.form),
      },
    },
    action: {
      ...safeObject(cuentaState?.action),
      ...safeObject(state?.action),
    },
  };
}

function resolveForm(detail = {}, state = {}) {
  const localState = resolveLocalState(state);
  const form = safeObject(localState?.view?.form);

  const rawTheme = first(
    form.theme,
    form.mode,
    form.appearance,
    detail.theme,
    detail.mode,
    detail.appearance,
    detail.preferences?.theme,
    detail.preferences?.appearance,
    detail.raw?.theme,
    ""
  );

  const darkMode = safeBoolean(
    first(
      form.darkMode,
      form.isDark,
      rawTheme === "dark" ? true : null,
      rawTheme === "light" ? false : null,
      detail.darkMode,
      detail.isDark,
      detail.preferences?.darkMode,
      detail.settings?.darkMode,
      detail.raw?.darkMode,
      false
    ),
    false
  );

  const lang = normalizeLangValue(
    first(
      form.lang,
      form.language,
      form.locale,
      detail.lang,
      detail.language,
      detail.locale,
      detail.preferences?.lang,
      detail.preferences?.language,
      detail.settings?.lang,
      detail.raw?.lang,
      detail.raw?.language,
      "es"
    )
  );

  const privacyMode = safeBoolean(
    first(
      form.privacyMode,
      form.privateMode,
      detail.privacyMode,
      detail.privateMode,
      detail.preferences?.privacyMode,
      detail.settings?.privacyMode,
      detail.raw?.privacyMode,
      false
    ),
    false
  );

  const name = safeText(
    first(
      form.name,
      form.displayName,
      form.fullName,
      detail.name,
      detail.fullName,
      detail.displayName,
      detail.nombre,
      detail.username,
      detail.email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );

  const phone = safeText(
    first(
      form.phone,
      form.telefono,
      form.mobile,
      detail.phone,
      detail.telefono,
      detail.mobile,
      detail.profile?.phone,
      detail.raw?.phone,
      detail.raw?.telefono,
      ""
    ),
    ""
  );

  return {
    name,
    displayName: name,
    fullName: name,

    phone,
    telefono: phone,

    email: safeText(first(form.email, detail.email, detail.emailLower, ""), ""),
    username: safeText(first(form.username, detail.username, detail.usernameLower, ""), ""),

    darkMode,
    privacyMode,

    lang,
    language: lang,
    locale: lang,

    theme: darkMode ? "dark" : normalizeThemeValue(rawTheme, darkMode),
    mode: darkMode ? "dark" : normalizeThemeValue(rawTheme, darkMode),
    appearance: darkMode ? "dark" : normalizeThemeValue(rawTheme, darkMode),
  };
}

function getDisplayName(detail = {}, state = {}) {
  const form = resolveForm(detail, state);

  return safeText(
    first(
      form.name,
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

function getPhone(detail = {}, state = {}) {
  const form = resolveForm(detail, state);

  return safeText(
    first(
      form.phone,
      form.telefono,
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

function getLangValue(detail = {}, state = {}) {
  const form = resolveForm(detail, state);

  return normalizeLangValue(
    first(
      form.lang,
      form.language,
      form.locale,
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
}

function getLangLabel(detail = {}, state = {}) {
  const lang = getLangValue(detail, state);

  if (lang === "ca") return "Català";
  if (lang === "en") return "English";

  return "Español";
}

function getThemeValue(detail = {}, state = {}) {
  const form = resolveForm(detail, state);

  const explicitTheme = normalizeThemeValue(
    first(
      form.theme,
      form.mode,
      form.appearance,
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
    ),
    safeBoolean(
      first(
        form.darkMode,
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
  );

  return explicitTheme;
}

function isDarkMode(detail = {}, state = {}) {
  return getThemeValue(detail, state) === "dark";
}

function getThemeLabel(detail = {}, state = {}) {
  return isDarkMode(detail, state) ? "Dark mode" : "Light mode";
}

function getThemeStatusLabel(detail = {}, state = {}) {
  return isDarkMode(detail, state) ? "Tema oscuro activo" : "Tema claro activo";
}

function getPrivacyMode(detail = {}, state = {}) {
  const form = resolveForm(detail, state);

  return safeBoolean(
    first(
      form.privacyMode,
      form.privateMode,
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

function getPrivacyLabel(detail = {}, state = {}) {
  return getPrivacyMode(detail, state) ? "Privacidad activa" : "Privacidad estándar";
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

function actionAttrs(action = "") {
  const value = safeText(action, "");

  if (!value) return "";

  return `
    data-action="${escapeAttr(value)}"
    data-cuenta-action="${escapeAttr(value)}"
  `;
}

function renderSpinner(label = "") {
  return `
    <span class="cuenta-inline-loading" aria-hidden="${label ? "false" : "true"}">
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
  const text = safeText(label, "");

  if (!text) return "";

  return `
    <span class="cuenta-chip cuenta-chip--${escapeAttr(normalizeKey(tone) || "default")}">
      ${escapeHtml(text)}
    </span>
  `;
}

function renderAvatar(detail = {}, state = {}, size = "hero") {
  const name = getDisplayName(detail, state);
  const initials = getInitials(name);
  const avatarUrl = getAvatarUrl(detail);
  const hasImage = isRenderableImageUrl(avatarUrl);

  return `
    <div
      class="${joinClasses(
        "cuenta-avatar",
        `cuenta-avatar--${normalizeKey(size) || "hero"}`,
        hasImage ? "has-image" : ""
      )}"
      role="img"
      aria-label="${escapeAttr(name)}"
      data-tooltip="${escapeAttr(name)}"
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

      <span class="cuenta-avatar-fallback" aria-hidden="${hasImage ? "true" : "false"}">
        ${escapeHtml(initials)}
      </span>
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

function renderMiniStat({ label = "", value = "", tone = "default" } = {}) {
  return `
    <div class="cuenta-mini-stat cuenta-mini-stat--${escapeAttr(normalizeKey(tone) || "default")}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderButton({
  id = "",
  action = "",
  label = "",
  variant = "",
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
      type="button"
      class="${escapeAttr(classes)}"
      ${actionAttrs(action)}
      ${boolAttr(isBusy, 'disabled aria-busy="true"')}
    >
      ${loading ? renderSpinner(loadingLabel) : escapeHtml(label)}
    </button>
  `;
}

function renderField({
  label = "",
  value = "",
  dataRole = "",
  field = "",
  id = "",
  name = "",
  type = "text",
  placeholder = "",
  readonly = false,
  disabled = false,
  autocomplete = "",
  wide = false,
} = {}) {
  const fieldName = safeText(field || name || dataRole, "");

  return `
    <label class="${joinClasses("cuenta-field", wide ? "cuenta-field--wide" : "")}">
      <span class="cuenta-field-label">${escapeHtml(label)}</span>

      <input
        ${id ? `id="${escapeAttr(id)}"` : ""}
        ${name ? `name="${escapeAttr(name)}"` : ""}
        data-role="${escapeAttr(dataRole)}"
        data-cuenta-field="${escapeAttr(fieldName)}"
        data-field="${escapeAttr(fieldName)}"
        type="${escapeAttr(type)}"
        value="${escapeAttr(safeText(value, ""))}"
        placeholder="${escapeAttr(placeholder)}"
        ${autocomplete ? `autocomplete="${escapeAttr(autocomplete)}"` : ""}
        ${boolAttr(readonly, "readonly")}
        ${boolAttr(disabled, "disabled")}
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
  field = "",
  name = "",
  action = "",
  disabled = false,
  checkedLabel = "Activo",
  uncheckedLabel = "Inactivo",
  buttonLabel = "",
  loadingLabel = "Procesando...",
} = {}) {
  const isChecked = Boolean(checked);
  const normalizedField = safeText(field || name || dataRole, "");

  return `
    <div class="cuenta-control-row">
      <div class="cuenta-control-copy">
        <strong class="cuenta-control-title">${escapeHtml(title)}</strong>
        <span class="cuenta-control-description">${escapeHtml(description)}</span>
      </div>

      <div class="cuenta-switch-area">
        <label
          for="${escapeAttr(inputId)}"
          class="${joinClasses("cuenta-switch", isChecked ? "is-checked" : "", disabled ? "is-disabled" : "")}"
          aria-label="${escapeAttr(title)}"
        >
          <span class="cuenta-switch-track" aria-hidden="true">
            <span class="cuenta-switch-thumb"></span>
          </span>
        </label>

        <input
          id="${escapeAttr(inputId)}"
          name="${escapeAttr(name || normalizedField)}"
          data-role="${escapeAttr(dataRole)}"
          data-cuenta-field="${escapeAttr(normalizedField)}"
          data-field="${escapeAttr(normalizedField)}"
          type="checkbox"
          class="cuenta-native-control"
          ${boolAttr(isChecked, "checked")}
          ${boolAttr(disabled, "disabled")}
        />

        <span class="cuenta-control-state">
          ${escapeHtml(isChecked ? checkedLabel : uncheckedLabel)}
        </span>
      </div>

      <div class="cuenta-control-actions">
        ${renderButton({
          action,
          label: buttonLabel || "Cambiar",
          variant: "soft",
          loading: disabled,
          loadingLabel,
          disabled,
        })}
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
  field = "lang",
  name = "lang",
  action = "",
  disabled = false,
} = {}) {
  const selectedValue = normalizeLangValue(value);

  return `
    <div class="cuenta-control-row cuenta-control-row--select">
      <div class="cuenta-control-copy">
        <strong class="cuenta-control-title">${escapeHtml(title)}</strong>
        <span class="cuenta-control-description">${escapeHtml(description)}</span>
      </div>

      <div class="cuenta-select-line">
        <select
          id="${escapeAttr(inputId)}"
          name="${escapeAttr(name)}"
          data-role="${escapeAttr(dataRole)}"
          data-cuenta-field="${escapeAttr(field)}"
          data-field="${escapeAttr(field)}"
          class="cuenta-select"
          ${boolAttr(disabled, "disabled")}
        >
          <option value="es" ${boolAttr(selectedValue === "es", "selected")}>Español</option>
          <option value="en" ${boolAttr(selectedValue === "en", "selected")}>English</option>
          <option value="ca" ${boolAttr(selectedValue === "ca", "selected")}>Català</option>
        </select>

        ${renderButton({
          action,
          label: "Aplicar idioma",
          variant: "soft",
          loading: disabled,
          loadingLabel: "Aplicando...",
          disabled,
        })}
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
        ${renderField({
          id: "cuenta-current-password",
          name: "currentPassword",
          dataRole: "cuenta-current-password",
          field: "currentPassword",
          label: "Contraseña actual",
          type: "password",
          placeholder: "Contraseña actual",
          autocomplete: "current-password",
          disabled,
        })}

        ${renderField({
          id: "cuenta-new-password",
          name: "newPassword",
          dataRole: "cuenta-new-password",
          field: "newPassword",
          label: "Nueva contraseña",
          type: "password",
          placeholder: "Nueva contraseña",
          autocomplete: "new-password",
          disabled,
        })}

        ${renderField({
          id: "cuenta-confirm-password",
          name: "confirmPassword",
          dataRole: "cuenta-confirm-password",
          field: "confirmPassword",
          label: "Confirmar contraseña",
          type: "password",
          placeholder: "Repite la nueva contraseña",
          autocomplete: "new-password",
          disabled,
          wide: true,
        })}
      </div>

      <div class="cuenta-password-actions">
        ${renderButton({
          id: "cuenta-password-btn",
          action: "change-password",
          label: "Cambiar contraseña",
          variant: "primary",
          loading: disabled,
          loadingLabel: "Procesando...",
          disabled,
        })}
      </div>
    </div>
  `;
}

function renderFeedback({ state = {}, hasDetail = false } = {}) {
  const localState = resolveLocalState(state);

  const error = safeText(
    first(
      localState.error,
      localState.view?.serverError,
      localState.view?.error,
      ""
    ),
    ""
  );

  const success = safeText(
    first(
      localState.view?.successMessage,
      localState.successMessage,
      ""
    ),
    ""
  );

  if (!hasDetail && error) return "";
  if (!error && !success) return "";

  return `
    <section class="cuenta-feedback" aria-live="polite">
      ${
        error
          ? `
            <div class="cuenta-feedback-item cuenta-feedback-item--error">
              <strong>Error</strong>
              <span>${escapeHtml(error)}</span>
            </div>
          `
          : ""
      }

      ${
        success
          ? `
            <div class="cuenta-feedback-item cuenta-feedback-item--success">
              <strong>Correcto</strong>
              <span>${escapeHtml(success)}</span>
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

export function renderHeader({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = resolveLocalState(state);

  const loading = Boolean(localState.loading);
  const refreshing = Boolean(localState.refreshing);
  const saving = Boolean(localState.saving);

  const name = detail ? getDisplayName(detail, localState) : "Ajustes de cuenta";
  const email = detail ? getEmail(detail) : "Preferencias del usuario";
  const username = detail ? getUsername(detail) : "sin-usuario";
  const role = detail ? getRole(detail) : "Usuario";

  const updatedAt = detail ? getUpdatedAt(detail) : null;
  const updatedText = updatedAt
    ? formatRelativeDate(updatedAt)
    : "Sin sincronización reciente";

  const status = detail ? getAccountStatus(detail) : "Activa";
  const statusTone = detail ? getAccountStatusTone(detail) : "success";

  const privacyMode = detail ? getPrivacyMode(detail, localState) : false;
  const privacyLabel = privacyMode ? "Activa" : "Estándar";
  const privacyTone = privacyMode ? "success" : "default";

  const themeLabel = detail ? getThemeLabel(detail, localState) : "Light mode";
  const langLabel = detail ? getLangLabel(detail, localState) : "Español";

  return `
    <section class="cuenta-hero" data-cuenta-section="hero">
      <div class="cuenta-hero-inner">
        <div class="cuenta-hero-top">
          <div class="cuenta-hero-copy">
            <span class="cuenta-eyebrow">Ajustes de cuenta</span>

            <h1 class="cuenta-title">Centro de control personal</h1>

            <p class="cuenta-subtitle">
              Gestiona identidad, apariencia, idioma y seguridad desde un panel sincronizado con Onion Support.
            </p>
          </div>

          <div class="cuenta-hero-actions">
            ${renderButton({
              id: "cuenta-hero-refresh-btn",
              action: "refresh-cuenta",
              label: "Actualizar",
              loading: refreshing || loading,
              loadingLabel: "Actualizando...",
              disabled: refreshing || loading,
            })}

            ${renderButton({
              id: "cuenta-save-btn",
              action: "save-cuenta",
              label: "Guardar cambios",
              variant: "primary",
              loading: saving,
              loadingLabel: "Guardando...",
              disabled: saving,
            })}
          </div>
        </div>

        <div class="cuenta-command-strip cuenta-account-strip">
          ${renderAvatar(detail || {}, localState, "hero")}

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

      ${renderButton({
        id: "cuenta-retry-btn",
        action: "refresh-cuenta",
        label: "Reintentar",
        variant: "primary",
      })}
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

      ${renderButton({
        id: "cuenta-empty-refresh-btn",
        action: "refresh-cuenta",
        label: "Actualizar cuenta",
        variant: "primary",
      })}
    </section>
  `;
}

/* =========================================================
   PANEL CARDS
========================================================= */

function renderProfileCard(detail = {}, state = {}, { disabled = false } = {}) {
  const form = resolveForm(detail, state);
  const phone = getPhone(detail, state);
  const phoneValue = phone === "No configurado" ? "" : phone;

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
          name: "name",
          field: "name",
          label: "Nombre visible",
          value: form.name,
          dataRole: "cuenta-name-input",
          placeholder: "Nombre visible",
          disabled,
          autocomplete: "name",
        })}

        ${renderField({
          id: "cuenta-username-input",
          name: "username",
          field: "username",
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
          name: "email",
          field: "email",
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
          name: "phone",
          field: "phone",
          label: "Teléfono",
          value: phoneValue,
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

function renderAppearanceCard(detail = {}, state = {}, { disabled = false } = {}) {
  const dark = isDarkMode(detail, state);

  return `
    <article class="cuenta-card">
      <div class="cuenta-card-head">
        <div class="cuenta-card-copy">
          <h2 class="cuenta-card-title">Apariencia</h2>
          <p class="cuenta-card-text">
            Ajusta el modo visual principal. El cambio sincroniza DOM, AppCore, storage y tokens CSS.
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
        field: "darkMode",
        name: "darkMode",
        action: "toggle-theme",
        disabled,
        checkedLabel: "Dark",
        uncheckedLabel: "Light",
        buttonLabel: dark ? "Cambiar a light" : "Cambiar a dark",
      })}

      <div class="cuenta-meta-list">
        ${renderMetaRow("Tema actual", getThemeLabel(detail, state))}
        ${renderMetaRow("Valor técnico", getThemeValue(detail, state))}
        ${renderMetaRow("Estado", getThemeStatusLabel(detail, state))}
      </div>
    </article>
  `;
}

function renderLanguageCard(detail = {}, state = {}, { disabled = false } = {}) {
  const langValue = getLangValue(detail, state);
  const langLabel = getLangLabel(detail, state);

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
        field: "lang",
        name: "lang",
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

function renderPrivacyCard(detail = {}, state = {}, { disabled = false } = {}) {
  const privacy = getPrivacyMode(detail, state);

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
        field: "privacyMode",
        name: "privacyMode",
        action: "save-cuenta",
        disabled,
        checkedLabel: "Activo",
        uncheckedLabel: "Estándar",
        buttonLabel: "Guardar privacidad",
      })}

      <div class="cuenta-meta-list">
        ${renderMetaRow("Privacidad", getPrivacyLabel(detail, state))}
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

function renderAuditCard(detail = {}, state = {}) {
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
        ${renderMetaRow("Tema", getThemeValue(detail, state))}
        ${renderMetaRow("Idioma", getLangValue(detail, state))}
      </div>
    </article>
  `;
}

/* =========================================================
   PANEL
========================================================= */

export function renderPanel({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = resolveLocalState(state);

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
    <section
      class="cuenta-panel"
      data-cuenta-section="panel"
      data-cuenta-busy="${busy ? "true" : "false"}"
      data-cuenta-saving="${saving ? "true" : "false"}"
      data-cuenta-refreshing="${refreshing ? "true" : "false"}"
    >
      <div class="cuenta-cards-grid">
        <div class="cuenta-column">
          ${renderProfileCard(detail, localState, {
            disabled: busy,
          })}

          ${renderAuditCard(detail, localState)}
        </div>

        <div class="cuenta-column">
          ${renderAppearanceCard(detail, localState, {
            disabled: busy,
          })}

          ${renderLanguageCard(detail, localState, {
            disabled: busy,
          })}

          ${renderPrivacyCard(detail, localState, {
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
  const localState = resolveLocalState(state);
  const detail = resolveCuentaItem(item);

  return `
    <div
      class="cuenta-view"
      data-view="cuenta"
      data-cuenta-template="true"
      data-cuenta-has-item="${detail ? "true" : "false"}"
      data-cuenta-loading="${localState.loading ? "true" : "false"}"
      data-cuenta-refreshing="${localState.refreshing ? "true" : "false"}"
      data-cuenta-saving="${localState.saving ? "true" : "false"}"
    >
      ${renderHeader({
        item: detail,
        state: localState,
      })}

      ${renderFeedback({
        state: localState,
        hasDetail: Boolean(detail),
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
