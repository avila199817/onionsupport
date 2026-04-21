/* =========================================================
   Onion SPA - Cuenta Template
   Archivo: src/views/cuenta/cuenta.template.js

   FINAL PRO SYSTEM · ACCOUNT SETTINGS MODE

   RESPONSABILIDADES:
   - render header limpio de cuenta
   - render loading / error / empty
   - render panel simple con 3 cards
   - soportar darkMode / idioma / cambio de contraseña
   - mantener compatibilidad con cuentaView.js
   - mantener compatibilidad con cuenta.bindings.js
========================================================= */

import { cuentaState } from "./cuenta.state.js";
import { getCuentaStore } from "./cuenta.store.js";
import { normalizeCuentaModel } from "./cuenta.model.js";

/* =========================================================
   SAFE
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
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
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
    return diffMs > 0
      ? `En ${absMin} min`
      : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMs > 0
      ? `En ${diffHours} h`
      : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMs > 0
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

function getLangValue(detail = {}) {
  return safeText(
    first(
      detail.lang,
      detail.language,
      detail.locale,
      detail.raw?.lang,
      detail.raw?.language,
      detail.raw?.locale,
      "es"
    ),
    "es"
  ).toLowerCase();
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

function getAccountStatusLabel(detail = {}) {
  if (detail?.darkMode) {
    return "Tema oscuro activo";
  }

  return "Tema claro activo";
}

/* =========================================================
   UI HELPERS
========================================================= */

function renderChip(label = "", tone = "default") {
  const styles = {
    default: `
      color:var(--text-soft);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `,
    accent: `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, transparent);
    `,
    success: `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 12%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 24%, transparent);
    `,
    warning: `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 12%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 24%, transparent);
    `,
  };

  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        font-size:12px;
        font-weight:var(--weight-bold, 700);
        letter-spacing:.04em;
        text-transform:uppercase;
        ${styles[tone] || styles.default}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function renderMetaRow(label = "", value = "") {
  return `
    <div
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:12px 0;
        border-bottom:1px solid var(--border-soft);
      "
    >
      <span
        style="
          color:var(--text-dim);
          font-size:13px;
          line-height:1.3;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong);
          font-size:14px;
          line-height:1.3;
          text-align:right;
        "
      >
        ${escapeHtml(safeText(value, "—"))}
      </strong>
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
    <div
      style="
        display:grid;
        gap:10px;
        padding:14px 0;
        border-bottom:1px solid var(--border-soft);
      "
    >
      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
          flex-wrap:wrap;
        "
      >
        <div style="display:grid; gap:6px; min-width:min(100%, 260px);">
          <strong
            style="
              color:var(--text-strong);
              font-size:15px;
              line-height:1.3;
            "
          >
            ${escapeHtml(title)}
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:13px;
              line-height:1.5;
            "
          >
            ${escapeHtml(description)}
          </span>
        </div>

        <div
          style="
            display:grid;
            gap:8px;
            justify-items:end;
          "
        >
          <label
            for="${escapeHtml(inputId)}"
            style="
              display:inline-flex;
              align-items:center;
              gap:10px;
              cursor:${disabled ? "not-allowed" : "pointer"};
              user-select:none;
            "
          >
            <span
              style="
                position:relative;
                display:inline-flex;
                align-items:center;
                width:58px;
                height:32px;
                border-radius:999px;
                padding:4px;
                border:1px solid ${
                  checked
                    ? "color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent)"
                    : "var(--border-soft)"
                };
                background:${
                  checked
                    ? "color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent)"
                    : "var(--surface-glass)"
                };
                transition:all .18s ease;
              "
            >
              <span
                style="
                  position:absolute;
                  top:4px;
                  left:${checked ? "30px" : "4px"};
                  width:22px;
                  height:22px;
                  border-radius:999px;
                  background:${checked ? "var(--accent, #7c5cff)" : "rgba(255,255,255,.88)"};
                  box-shadow:0 6px 14px rgba(0,0,0,.22);
                  transition:left .18s ease, background .18s ease;
                "
              ></span>
            </span>
          </label>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold, 700);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            ${escapeHtml(checked ? checkedLabel : uncheckedLabel)}
          </span>
        </div>

        <input
          id="${escapeHtml(inputId)}"
          data-role="${escapeHtml(dataRole)}"
          type="checkbox"
          ${checked ? "checked" : ""}
          ${disabled ? "disabled" : ""}
          style="display:none;"
        />
      </div>

      <div>
        <button
          type="button"
          data-action="${escapeHtml(action)}"
          ${disabled ? "disabled" : ""}
          style="
            min-height:40px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-soft);
            font-weight:var(--weight-bold, 700);
            cursor:${disabled ? "wait" : "pointer"};
            opacity:${disabled ? ".72" : "1"};
          "
        >
          ${checked ? "Cambiar" : "Activar"}
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
    <div
      style="
        display:grid;
        gap:12px;
        padding:14px 0;
        border-bottom:1px solid var(--border-soft);
      "
    >
      <div style="display:grid; gap:6px;">
        <strong
          style="
            color:var(--text-strong);
            font-size:15px;
            line-height:1.3;
          "
        >
          ${escapeHtml(title)}
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:13px;
            line-height:1.5;
          "
        >
          ${escapeHtml(description)}
        </span>
      </div>

      <div
        style="
          display:flex;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
        "
      >
        <select
          id="${escapeHtml(inputId)}"
          data-role="${escapeHtml(dataRole)}"
          ${disabled ? "disabled" : ""}
          style="
            min-height:42px;
            min-width:220px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-strong);
            font-weight:var(--weight-semibold, 600);
            outline:none;
          "
        >
          <option value="es" ${value === "es" ? "selected" : ""}>Español</option>
          <option value="en" ${value === "en" ? "selected" : ""}>English</option>
          <option value="ca" ${value === "ca" ? "selected" : ""}>Català</option>
        </select>

        <button
          type="button"
          data-action="${escapeHtml(action)}"
          ${disabled ? "disabled" : ""}
          style="
            min-height:40px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-soft);
            font-weight:var(--weight-bold, 700);
            cursor:${disabled ? "wait" : "pointer"};
            opacity:${disabled ? ".72" : "1"};
          "
        >
          Aplicar idioma
        </button>
      </div>
    </div>
  `;
}

function renderPasswordRow({
  disabled = false,
} = {}) {
  return `
    <div
      style="
        display:grid;
        gap:12px;
        padding:14px 0;
      "
    >
      <div style="display:grid; gap:6px;">
        <strong
          style="
            color:var(--text-strong);
            font-size:15px;
            line-height:1.3;
          "
        >
          Cambiar contraseña
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:13px;
            line-height:1.5;
          "
        >
          Abre el flujo para actualizar la contraseña de tu cuenta.
        </span>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:10px;
        "
        class="cuenta-password-grid"
      >
        <input
          id="cuenta-current-password"
          data-role="cuenta-current-password"
          type="password"
          placeholder="Contraseña actual"
          ${disabled ? "disabled" : ""}
          style="
            width:100%;
            min-height:42px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-strong);
            outline:none;
          "
        />

        <input
          id="cuenta-new-password"
          data-role="cuenta-new-password"
          type="password"
          placeholder="Nueva contraseña"
          ${disabled ? "disabled" : ""}
          style="
            width:100%;
            min-height:42px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-strong);
            outline:none;
          "
        />
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="cuenta-password-btn"
          type="button"
          data-action="change-password"
          ${disabled ? "disabled" : ""}
          style="
            min-height:40px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold, 700);
            cursor:${disabled ? "wait" : "pointer"};
            opacity:${disabled ? ".72" : "1"};
          "
        >
          Cambiar contraseña
        </button>
      </div>

      <style>
        @media (max-width: 760px) {
          .cuenta-password-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </div>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = state || cuentaState || {};

  const loading = Boolean(localState?.loading);
  const refreshing = Boolean(localState?.refreshing);
  const saving = Boolean(localState?.saving);

  const updatedText = detail?.updatedAt
    ? formatRelativeDate(detail.updatedAt)
    : "Sin sincronización reciente";

  return `
    <section
      class="cuenta-hero"
      style="
        position:relative;
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div
        style="
          display:grid;
          gap:18px;
          padding:24px;
        "
      >
        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:16px;
            flex-wrap:wrap;
          "
        >
          <div style="display:grid; gap:8px;">
            <span
              style="
                display:inline-flex;
                width:max-content;
                min-height:28px;
                align-items:center;
                padding:0 12px;
                border-radius:999px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-dim);
                font-size:12px;
                font-weight:var(--weight-bold, 700);
                letter-spacing:.06em;
                text-transform:uppercase;
              "
            >
              Cuenta
            </span>

            <h1
              style="
                margin:0;
                color:var(--text-strong);
                font-size:clamp(28px, 4vw, 40px);
                line-height:1;
                letter-spacing:-.04em;
              "
            >
              Ajustes de cuenta
            </h1>

            <p
              style="
                margin:0;
                color:var(--text-dim);
                font-size:14px;
                line-height:1.6;
                max-width:760px;
              "
            >
              Gestiona tema, idioma y contraseña desde un panel simple.
            </p>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
            "
          >
            <button
              id="cuenta-refresh-btn"
              type="button"
              data-action="refresh-cuenta"
              style="
                min-height:42px;
                padding:0 14px;
                border-radius:12px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold, 700);
                cursor:pointer;
              "
            >
              Actualizar
            </button>

            <button
              id="cuenta-save-btn"
              type="button"
              ${saving ? "disabled" : ""}
              style="
                min-height:42px;
                padding:0 16px;
                border-radius:12px;
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold, 700);
                cursor:${saving ? "not-allowed" : "pointer"};
                opacity:${saving ? ".78" : "1"};
              "
            >
              ${saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>

        <div
          style="
            display:flex;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
          "
        >
          ${renderChip(`Tema · ${detail ? getThemeLabel(detail) : "Light mode"}`, "accent")}
          ${renderChip(`Idioma · ${detail ? getLangLabel(detail) : "Español"}`, "default")}
          ${renderChip(`Estado · ${detail ? getAccountStatusLabel(detail) : "Configuración estándar"}`, detail?.darkMode ? "success" : "default")}

          ${
            refreshing || loading || saving
              ? `
                ${renderChip(saving ? "Guardando" : "Sincronizando", "accent")}
              `
              : ""
          }

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.4;
            "
          >
            Última sync: ${escapeHtml(updatedText)}
          </span>
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
      class="panel-surface cuenta-loading-state"
      style="
        display:grid;
        gap:18px;
        padding:24px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div
        style="
          display:grid;
          grid-template-columns:1fr 1fr 1fr;
          gap:18px;
        "
        class="cuenta-loading-grid"
      >
        ${Array.from({ length: 3 })
          .map(
            () => `
              <div
                style="
                  display:grid;
                  gap:12px;
                  padding:20px;
                  border-radius:18px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                "
              >
                <div style="height:16px; width:140px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.2s linear infinite;"></div>
                <div style="height:14px; width:88%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.2s linear infinite;"></div>
                <div style="height:14px; width:72%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.2s linear infinite;"></div>
                <div style="height:42px; width:120px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.2s linear infinite;"></div>
              </div>
            `
          )
          .join("")}
      </div>

      <style>
        @keyframes cuentaSkeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 1100px) {
          .cuenta-loading-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la cuenta.") {
  return `
    <section
      class="panel-surface cuenta-error-state"
      style="
        display:grid;
        gap:16px;
        padding:24px;
        border-radius:var(--panel-radius);
        border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, var(--border-soft));
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div style="display:grid; gap:8px;">
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:28px;
            line-height:1.1;
            letter-spacing:-.04em;
          "
        >
          No se pudo cargar la cuenta
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            font-size:14px;
            line-height:1.65;
          "
        >
          ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
        </p>
      </div>

      <div>
        <button
          id="cuenta-retry-btn"
          type="button"
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:12px;
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
          "
        >
          Reintentar
        </button>
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section
      class="panel-surface cuenta-empty-state"
      style="
        display:grid;
        gap:16px;
        padding:24px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div style="display:grid; gap:8px;">
        <h3
          style="
            margin:0;
            color:var(--text-strong);
            font-size:28px;
            line-height:1.1;
            letter-spacing:-.04em;
          "
        >
          No hay datos de cuenta
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            font-size:14px;
            line-height:1.65;
          "
        >
          El recurso no devolvió preferencias utilizables.
        </p>
      </div>

      <div>
        <button
          id="cuenta-refresh-btn"
          type="button"
          data-action="refresh-cuenta"
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:12px;
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold, 700);
            cursor:pointer;
          "
        >
          Actualizar cuenta
        </button>
      </div>
    </section>
  `;
}

/* =========================================================
   PANEL
========================================================= */

export function renderPanel({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = state || cuentaState || {};

  const loading = Boolean(localState?.loading);
  const refreshing = Boolean(localState?.refreshing);
  const saving = Boolean(localState?.saving);

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
  const exactUpdatedAt = detail.updatedAt ? formatDate(detail.updatedAt) : "—";

  return `
    <section
      class="cuenta-panel-wrap panel-surface"
      style="
        position:relative;
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div
        style="
          display:grid;
          gap:18px;
          padding:18px;
        "
      >
        <div
          style="
            display:grid;
            grid-template-columns:1fr 1fr 1fr;
            gap:18px;
          "
          class="cuenta-cards-grid"
        >
          <article
            style="
              display:grid;
              gap:14px;
              padding:20px;
              border-radius:18px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
            "
          >
            <div style="display:grid; gap:8px;">
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:22px;
                  letter-spacing:-.03em;
                "
              >
                Tema
              </h3>

              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  font-size:14px;
                  line-height:1.6;
                "
              >
                Cambia entre modo claro y modo oscuro.
              </p>
            </div>

            ${renderSwitchRow({
              title: "Dark / Light mode",
              description: "Aplica la preferencia visual principal del panel.",
              checked: Boolean(detail.darkMode),
              inputId: "cuenta-darkmode-input",
              dataRole: "cuenta-darkmode-input",
              action: "toggle-theme",
              disabled: saving || refreshing,
              checkedLabel: "Dark",
              uncheckedLabel: "Light",
            })}

            ${renderMetaRow("Tema actual", getThemeLabel(detail))}
            ${renderMetaRow("Valor", themeValue)}
            ${renderMetaRow("Última actualización", exactUpdatedAt)}
          </article>

          <article
            style="
              display:grid;
              gap:14px;
              padding:20px;
              border-radius:18px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
            "
          >
            <div style="display:grid; gap:8px;">
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:22px;
                  letter-spacing:-.03em;
                "
              >
                Idioma
              </h3>

              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  font-size:14px;
                  line-height:1.6;
                "
              >
                Selecciona el idioma de la interfaz.
              </p>
            </div>

            ${renderSelectRow({
              title: "Idioma del sistema",
              description: "Elige entre Español, English o Català.",
              value: langValue,
              inputId: "cuenta-language-select",
              dataRole: "cuenta-language-select",
              action: "change-language",
              disabled: saving || refreshing,
            })}

            ${renderMetaRow("Idioma actual", langLabel)}
            ${renderMetaRow("Código", langValue)}
            ${renderMetaRow("Última actualización", exactUpdatedAt)}
          </article>

          <article
            style="
              display:grid;
              gap:14px;
              padding:20px;
              border-radius:18px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
            "
          >
            <div style="display:grid; gap:8px;">
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:22px;
                  letter-spacing:-.03em;
                "
              >
                Seguridad
              </h3>

              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  font-size:14px;
                  line-height:1.6;
                "
              >
                Actualiza tu contraseña desde este bloque.
              </p>
            </div>

            ${renderPasswordRow({
              disabled: saving || refreshing,
            })}

            ${renderMetaRow("Acción", "Cambio de contraseña")}
            ${renderMetaRow("Estado", saving ? "Procesando" : "Disponible")}
          </article>
        </div>
      </div>

      ${
        refreshing || saving
          ? `
            <div
              aria-live="polite"
              aria-busy="true"
              style="
                position:absolute;
                inset:0;
                display:grid;
                place-items:center;
                padding:18px;
                background:color-mix(in srgb, var(--surface-1, #0f1115) 72%, transparent);
                backdrop-filter:blur(4px);
                z-index:4;
              "
            >
              <div
                style="
                  display:grid;
                  justify-items:center;
                  gap:12px;
                  min-width:min(100%, 220px);
                  padding:18px 20px;
                  border-radius:18px;
                  border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
                  background:var(--surface-1, var(--surface-glass));
                  box-shadow:0 20px 40px rgba(0,0,0,.22);
                "
              >
                <span
                  aria-hidden="true"
                  style="
                    width:28px;
                    height:28px;
                    border-radius:999px;
                    border:3px solid color-mix(in srgb, var(--accent, #7c5cff) 16%, transparent);
                    border-top-color:var(--accent, #7c5cff);
                    animation:cuentaSpin .8s linear infinite;
                  "
                ></span>

                <strong
                  style="
                    color:var(--text-strong);
                    font-size:14px;
                    letter-spacing:-.02em;
                  "
                >
                  ${saving ? "Guardando..." : "Actualizando..."}
                </strong>
              </div>
            </div>
          `
          : ""
      }

      <style>
        @keyframes cuentaSpin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1100px) {
          .cuenta-cards-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

/* =========================================================
   MAIN ENTRY
========================================================= */

export function renderCuentaTemplate({
  item = null,
  state = {},
} = {}) {
  const localState = state || cuentaState || {};
  const detail = resolveCuentaItem(item);

  return `
    <div
      class="cuenta-view"
      style="
        display:grid;
        gap:18px;
      "
    >
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

export function renderCuentaViewTemplate({
  item = null,
  state = {},
} = {}) {
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
