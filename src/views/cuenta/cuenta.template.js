/* =========================================================
   Onion SPA - Cuenta Template
   Archivo: src/views/cuenta/cuenta.template.js

   FINAL PRO SYSTEM · ACCOUNT SETTINGS MODE · SOFT APPLE MODE

   RESPONSABILIDADES:
   - render header premium de cuenta
   - render panel productivo de preferencias
   - render loading / error / empty
   - soportar darkMode / idioma / cambio de contraseña
   - mantener compatibilidad con cuentaView.js
   - mantener compatibilidad con cuenta.bindings.js
   - acciones compatibles con data-action
   - inputs compatibles con data-role
   - dark/light mode 100% conectado a variables.css + ui.css
   - estilos encapsulados
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

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

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
    .trim();
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
      detail.username,
      detail.email,
      detail.raw?.name,
      detail.raw?.fullName,
      detail.raw?.displayName,
      detail.raw?.username,
      detail.raw?.email
    ),
    "Usuario Onion"
  );
}

function getEmail(detail = {}) {
  return safeText(
    first(detail.email, detail.emailLower, detail.raw?.email, detail.raw?.emailLower),
    "Sin email"
  );
}

function getUsername(detail = {}) {
  return safeText(
    first(
      detail.username,
      detail.usernameLower,
      detail.raw?.username,
      detail.raw?.usernameLower
    ),
    "sin-usuario"
  );
}

function getRole(detail = {}) {
  const role = normalizeKey(first(detail.role, detail.raw?.role, "user"));

  if (role === "admin") return "Administrador";
  if (role === "support") return "Soporte";
  if (role === "technician" || role === "tecnico") return "Técnico";
  if (role === "user") return "Usuario";

  return safeText(role, "Usuario");
}

function getPhone(detail = {}) {
  return safeText(first(detail.phone, detail.telefono, detail.raw?.phone), "No configurado");
}

function getUpdatedAt(detail = {}) {
  return first(
    detail.updatedAt,
    detail.modifiedAt,
    detail.lastUpdatedAt,
    detail.createdAt,
    detail.raw?.updatedAt,
    detail.raw?.modifiedAt,
    detail.raw?.lastUpdatedAt,
    detail.raw?.createdAt
  );
}

function getLangValue(detail = {}) {
  const lang = normalizeKey(
    first(
      detail.lang,
      detail.language,
      detail.locale,
      detail.raw?.lang,
      detail.raw?.language,
      detail.raw?.locale,
      "es"
    )
  );

  if (["en", "english"].includes(lang)) return "en";
  if (["ca", "cat", "catala", "catalan"].includes(lang)) return "ca";

  return "es";
}

function getLangLabel(detail = {}) {
  const lang = getLangValue(detail);

  if (lang === "ca") return "Català";
  if (lang === "en") return "English";

  return "Español";
}

function getThemeValue(detail = {}) {
  return detail?.darkMode ? "dark" : "light";
}

function getThemeLabel(detail = {}) {
  return detail?.darkMode ? "Dark mode" : "Light mode";
}

function getThemeStatusLabel(detail = {}) {
  return detail?.darkMode ? "Tema oscuro activo" : "Tema claro activo";
}

function getSecurityStatusLabel() {
  return "Cambio manual";
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

function renderAvatar(detail = {}) {
  const name = getDisplayName(detail);
  const initials = getInitials(name);

  return `
    <div
      class="cuenta-avatar"
      title="${escapeHtml(name)}"
      aria-label="${escapeHtml(name)}"
      data-tooltip="${escapeHtml(name)}"
    >
      <span>${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderMetaRow(label = "", value = "") {
  return `
    <div class="cuenta-meta-row">
      <span class="cuenta-meta-label">${escapeHtml(label)}</span>
      <strong class="cuenta-meta-value">${escapeHtml(safeText(value, "—"))}</strong>
    </div>
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
          ${disabled ? renderSpinner("Procesando...") : escapeHtml(checked ? "Cambiar" : "Activar")}
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
      .cuenta-view{
        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
      }

      .cuenta-hero,
      .cuenta-panel,
      .cuenta-state{
        position:relative;
        overflow:hidden;
        border-radius:var(--view-hero-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--view-hero-border, var(--panel-border, var(--border-default, rgba(255,255,255,.08))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #262626))));
        box-shadow:var(--view-hero-shadow, var(--panel-shadow, var(--shadow-md, 0 14px 30px rgba(0,0,0,.22))));
      }

      .cuenta-hero-inner{
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
        min-height:calc(28px * var(--ui-scale, 1));
        padding:0 var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--badge-border, var(--border-default, rgba(255,255,255,.07)));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .cuenta-title{
        margin:0;
        max-width:100%;
        font-size:clamp(var(--font-3xl, 24px), 2.6vw, var(--font-5xl, 40px));
        line-height:var(--line-tight, 1.08);
        letter-spacing:var(--view-title-letter, -.045em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        color:var(--text-strong, #ffffff);
      }

      .cuenta-subtitle{
        margin:0;
        max-width:860px;
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
        border-radius:var(--btn-radius, var(--radius-md, 13px));
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
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
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .cuenta-btn--primary{
        border-color:var(--btn-primary-border, var(--accent-border, rgba(255,255,255,.05)));
        background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%)));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));
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
      }

      .cuenta-identity{
        display:grid;
        grid-template-columns:auto minmax(0, 1fr);
        gap:var(--space-sm, 12px);
        align-items:center;
        min-width:min(100%, 330px);
        padding:var(--space-md, 16px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
      }

      .cuenta-avatar{
        position:relative;
        width:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        height:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        border-radius:var(--radius-pill, 999px);
        display:grid;
        place-items:center;
        overflow:hidden;
        background:var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%));
        color:var(--avatar-text, #ffffff);
        box-shadow:
          0 12px 26px color-mix(in srgb, var(--accent, #3f3f46) 22%, transparent),
          0 0 0 3px color-mix(in srgb, var(--accent-ring, rgba(113,113,122,.30)) 64%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .cuenta-avatar::after{
        content:"";
        position:absolute;
        inset:0;
        background:
          radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.08));
        pointer-events:none;
        mix-blend-mode:screen;
      }

      .cuenta-avatar span{
        position:relative;
        z-index:1;
        font-size:var(--font-2xl, 19px);
        font-weight:var(--weight-black, 800);
        letter-spacing:-.035em;
        text-shadow:0 1px 2px rgba(0,0,0,.22);
      }

      .cuenta-identity-copy{
        min-width:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .cuenta-identity-name{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:var(--text-strong, #ffffff);
        font-size:var(--font-lg, 15px);
        font-weight:var(--weight-black, 800);
        letter-spacing:var(--letter-tight, -.03em);
      }

      .cuenta-identity-email,
      .cuenta-identity-role{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:var(--font-sm, 12px);
        line-height:1.3;
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
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .cuenta-chip--accent{
        color:var(--accent-active, var(--text-strong, #ffffff));
        background:color-mix(in srgb, var(--accent, #3f3f46) 16%, transparent);
        border-color:color-mix(in srgb, var(--accent, #3f3f46) 32%, transparent);
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

      .cuenta-cards-grid{
        display:grid;
        grid-template-columns:repeat(3, minmax(0, 1fr));
        gap:var(--space-md, 16px);
        padding:var(--space-md, 16px);
      }

      .cuenta-card{
        display:grid;
        align-content:start;
        gap:var(--space-md, 16px);
        min-height:calc(420px * var(--ui-scale, 1));
        padding:var(--space-lg, 18px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
      }

      .cuenta-card--accent{
        border-color:var(--accent-border, rgba(113,113,122,.30));
      }

      .cuenta-card--success{
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .cuenta-card--warning{
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .cuenta-card-head{
        display:grid;
        gap:var(--space-xs, 8px);
      }

      .cuenta-card-title{
        margin:0;
        color:var(--text-strong, #ffffff);
        font-size:var(--font-2xl, 19px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-black, 800);
        letter-spacing:var(--letter-tight, -.03em);
      }

      .cuenta-card-text{
        margin:0;
        color:var(--text-muted, rgba(245,245,245,.70));
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
      }

      .cuenta-control-row,
      .cuenta-password-block{
        display:grid;
        gap:var(--space-sm, 12px);
        padding:var(--space-sm, 12px) 0;
        border-top:1px solid var(--border-soft, rgba(255,255,255,.05));
        border-bottom:1px solid var(--border-soft, rgba(255,255,255,.05));
      }

      .cuenta-control-row--select{
        border-bottom:none;
      }

      .cuenta-control-copy{
        display:grid;
        gap:var(--space-2xs, 4px);
      }

      .cuenta-control-title{
        color:var(--text-strong, #ffffff);
        font-size:var(--font-lg, 15px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-bold, 700);
      }

      .cuenta-control-description{
        color:var(--text-dim, rgba(245,245,245,.50));
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
        width:calc(58px * var(--ui-scale, 1));
        height:calc(32px * var(--ui-scale, 1));
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
        width:calc(22px * var(--ui-scale, 1));
        height:calc(22px * var(--ui-scale, 1));
        border-radius:var(--radius-pill, 999px);
        background:var(--text-strong, #ffffff);
        box-shadow:0 7px 16px rgba(0,0,0,.26);
        transition:
          left var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .cuenta-switch.is-checked .cuenta-switch-track{
        background:color-mix(in srgb, var(--accent, #3f3f46) 22%, transparent);
        border-color:color-mix(in srgb, var(--accent, #3f3f46) 42%, transparent);
      }

      .cuenta-switch.is-checked .cuenta-switch-thumb{
        left:calc(32px * var(--ui-scale, 1));
        background:var(--accent, #3f3f46);
      }

      .cuenta-native-control{
        position:absolute;
        width:1px;
        height:1px;
        opacity:0;
        pointer-events:none;
      }

      .cuenta-control-state{
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
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
        min-height:var(--input-height, 42px);
        border-radius:var(--input-radius, var(--radius-md, 13px));
        border:1px solid var(--input-border, rgba(255,255,255,.09));
        background:var(--input-bg, rgba(255,255,255,.028));
        color:var(--input-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-semibold, 600);
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
        border-color:var(--input-border-focus, rgba(113,113,122,.50));
        background:var(--input-bg-focus, rgba(255,255,255,.046));
        box-shadow:var(--input-shadow-focus, 0 0 0 4px rgba(113,113,122,.14));
      }

      .cuenta-password-grid{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .cuenta-field{
        display:grid;
        gap:var(--space-2xs, 5px);
        min-width:0;
      }

      .cuenta-field-label{
        color:var(--form-label-color, var(--text-soft, rgba(245,245,245,.88)));
        font-size:var(--form-label-size, var(--font-sm, 12px));
        font-weight:var(--form-label-weight, var(--weight-semibold, 600));
      }

      .cuenta-field input{
        width:100%;
        padding:0 var(--space-sm, 12px);
      }

      .cuenta-meta-list{
        display:grid;
        gap:0;
        margin-top:auto;
      }

      .cuenta-meta-row{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:var(--space-sm, 12px);
        padding:var(--space-xs, 9px) 0;
        border-bottom:1px solid var(--border-soft, rgba(255,255,255,.05));
      }

      .cuenta-meta-row:last-child{
        border-bottom:none;
      }

      .cuenta-meta-label{
        color:var(--text-dim, rgba(245,245,245,.50));
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
        font-weight:var(--weight-black, 800);
        letter-spacing:var(--letter-tight, -.03em);
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
        border-radius:var(--card-radius, 18px);
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
        background:color-mix(in srgb, var(--surface-1, #0f1115) 72%, transparent);
        backdrop-filter:var(--blur-sm, blur(8px));
        -webkit-backdrop-filter:var(--blur-sm, blur(8px));
      }

      .cuenta-panel-overlay-card{
        display:grid;
        justify-items:center;
        gap:var(--space-sm, 12px);
        min-width:min(100%, 230px);
        padding:var(--space-lg, 18px) var(--space-xl, 22px);
        border-radius:var(--radius-xl, 18px);
        border:1px solid color-mix(in srgb, var(--accent, #3f3f46) 26%, var(--border-soft));
        background:var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));
        color:var(--text-strong, #ffffff);
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28));
      }

      .cuenta-panel-overlay-spinner{
        width:28px;
        height:28px;
        border-radius:var(--radius-pill, 999px);
        border:3px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:var(--accent, #3f3f46);
        animation:cuentaSpin .8s linear infinite;
      }

      @keyframes cuentaSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes cuentaSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .cuenta-hero,
      [data-theme="light"] .cuenta-panel,
      [data-theme="light"] .cuenta-state{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
      }

      [data-theme="light"] .cuenta-card,
      [data-theme="light"] .cuenta-identity,
      [data-theme="light"] .cuenta-skeleton-card{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--card-bg, var(--surface-elevated, #ffffff));
      }

      [data-theme="light"] .cuenta-chip--accent{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      @media (max-width: 1180px){
        .cuenta-hero-top{
          grid-template-columns:1fr;
        }

        .cuenta-hero-actions{
          justify-content:flex-start;
        }

        .cuenta-identity{
          width:100%;
        }

        .cuenta-cards-grid,
        .cuenta-loading-grid{
          grid-template-columns:1fr;
        }

        .cuenta-card{
          min-height:auto;
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
          font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px));
          line-height:1;
        }

        .cuenta-subtitle{
          font-size:var(--font-base, 14px);
        }

        .cuenta-hero-actions,
        .cuenta-select-line,
        .cuenta-control-actions,
        .cuenta-password-actions{
          width:100%;
        }

        .cuenta-btn,
        .cuenta-select{
          width:100%;
        }

        .cuenta-cards-grid{
          padding:var(--space-sm, 12px);
        }

        .cuenta-card{
          padding:var(--space-md, 16px);
        }

        .cuenta-password-grid{
          grid-template-columns:1fr;
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
  const role = detail ? getRole(detail) : "Usuario";

  const updatedAt = detail ? getUpdatedAt(detail) : null;
  const updatedText = updatedAt ? formatRelativeDate(updatedAt) : "Sin sincronización reciente";

  return `
    ${renderStyles()}

    <section class="cuenta-hero">
      <div class="cuenta-hero-inner">
        <div class="cuenta-hero-top">
          <div class="cuenta-hero-copy">
            <span class="cuenta-eyebrow">Cuenta</span>

            <h1 class="cuenta-title">Ajustes de cuenta</h1>

            <p class="cuenta-subtitle">
              Gestiona tema, idioma y seguridad desde un panel claro, compacto y conectado al sistema visual de Onion Support.
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

        <div class="cuenta-identity">
          ${renderAvatar(detail || {})}

          <div class="cuenta-identity-copy">
            <div class="cuenta-identity-name">${escapeHtml(name)}</div>
            <div class="cuenta-identity-email">${escapeHtml(email)}</div>
            <div class="cuenta-identity-role">${escapeHtml(role)}</div>
          </div>
        </div>

        <div class="cuenta-hero-meta">
          ${renderChip(`Tema · ${detail ? getThemeLabel(detail) : "Light mode"}`, "accent")}
          ${renderChip(`Idioma · ${detail ? getLangLabel(detail) : "Español"}`, "default")}
          ${renderChip(`Estado · ${detail ? getThemeStatusLabel(detail) : "Configuración estándar"}`, detail?.darkMode ? "success" : "default")}
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
   PANEL
========================================================= */

export function renderPanel({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = safeObject(state || cuentaState || {});

  const loading = Boolean(localState.loading);
  const refreshing = Boolean(localState.refreshing);
  const saving = Boolean(localState.saving);

  if (loading && !detail) {
    return renderLoadingState();
  }

  if (localState.error && !detail) {
    return renderErrorState(localState.error);
  }

  if (!detail) {
    return renderEmptyState();
  }

  const langValue = getLangValue(detail);
  const langLabel = getLangLabel(detail);
  const themeValue = getThemeValue(detail);
  const exactUpdatedAt = getUpdatedAt(detail) ? formatDate(getUpdatedAt(detail)) : "—";

  return `
    <section class="cuenta-panel">
      <div class="cuenta-cards-grid">
        <article class="cuenta-card cuenta-card--accent">
          <div class="cuenta-card-head">
            <h2 class="cuenta-card-title">Tema</h2>
            <p class="cuenta-card-text">
              Controla la preferencia visual principal del panel. El cambio debe sincronizarse con Core, variables CSS y estado persistido.
            </p>
          </div>

          ${renderSwitchRow({
            title: "Dark / Light mode",
            description: "Alterna entre modo claro y modo oscuro para toda la interfaz.",
            checked: Boolean(detail.darkMode),
            inputId: "cuenta-darkmode-input",
            dataRole: "cuenta-darkmode-input",
            action: "toggle-theme",
            disabled: saving || refreshing,
            checkedLabel: "Dark",
            uncheckedLabel: "Light",
          })}

          <div class="cuenta-meta-list">
            ${renderMetaRow("Tema actual", getThemeLabel(detail))}
            ${renderMetaRow("Valor técnico", themeValue)}
            ${renderMetaRow("Estado", getThemeStatusLabel(detail))}
            ${renderMetaRow("Última actualización", exactUpdatedAt)}
          </div>
        </article>

        <article class="cuenta-card">
          <div class="cuenta-card-head">
            <h2 class="cuenta-card-title">Idioma</h2>
            <p class="cuenta-card-text">
              Define el idioma activo de la SPA. Compatible con Español, English y Català.
            </p>
          </div>

          ${renderSelectRow({
            title: "Idioma del sistema",
            description: "Selecciona el idioma que utilizarán las vistas y componentes compatibles con i18n.",
            value: langValue,
            inputId: "cuenta-language-select",
            dataRole: "cuenta-language-select",
            action: "change-language",
            disabled: saving || refreshing,
          })}

          <div class="cuenta-meta-list">
            ${renderMetaRow("Idioma actual", langLabel)}
            ${renderMetaRow("Código", langValue)}
            ${renderMetaRow("Motor", "I18n")}
            ${renderMetaRow("Última actualización", exactUpdatedAt)}
          </div>
        </article>

        <article class="cuenta-card cuenta-card--warning">
          <div class="cuenta-card-head">
            <h2 class="cuenta-card-title">Seguridad</h2>
            <p class="cuenta-card-text">
              Actualiza la contraseña de acceso de la cuenta. La acción queda delegada a cuenta.bindings.js.
            </p>
          </div>

          ${renderPasswordRow({
            disabled: saving || refreshing,
          })}

          <div class="cuenta-meta-list">
            ${renderMetaRow("Usuario", getUsername(detail))}
            ${renderMetaRow("Email", getEmail(detail))}
            ${renderMetaRow("Teléfono", getPhone(detail))}
            ${renderMetaRow("Estado", saving ? "Procesando" : getSecurityStatusLabel())}
          </div>
        </article>
      </div>

      ${
        refreshing || saving
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
