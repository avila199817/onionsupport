/* =========================================================
   Onion SPA - Cuenta Template (FINAL PRO SETTINGS GOD MODE)
   Archivo: src/views/cuenta/cuenta.template.js

   EXTREME MODE · USER PREFERENCES REAL API READY · 10/10

   Responsabilidades:
   - renderizar header premium de la vista cuenta
   - renderizar estados loading / error / empty
   - renderizar panel premium de preferencias
   - mostrar loader SOLO en la sección principal
   - mostrar estado visual al guardar / refrescar
   - mantener compatibilidad directa con cuentaView.js
   - consumir datos reales del backend /api/user/preferences
   - compartir lenguaje visual y densidad con Facturas / Incidencias

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para envelope backend { ok, preferences, darkMode, privacyMode }
   - lectura preferente del shape normalizado del store/model
   - diseño premium orientado a single resource
   - toolbar / skeleton / cards / mobile consistentes
========================================================= */

import { cuentaState } from "./cuenta.state.js";

import {
  getCuentaStore,
} from "./cuenta.store.js";

import {
  normalizeCuentaModel,
  getThemeLabel,
  getPrivacyLabel,
  getAccountStatusLabel,
} from "./cuenta.model.js";

/* =========================================================
   SAFE
========================================================= */

function safeText(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
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
    return diffMin > 0
      ? `En ${absMin} min`
      : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0
      ? `En ${diffHours} h`
      : `Hace ${diffHours} h`;
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
   DATA RESOLVE
========================================================= */

function looksLikeCuentaEnvelope(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.preferences ||
      obj.account ||
      obj.cuenta ||
      obj.user ||
      obj.item ||
      obj.result ||
      obj.payload ||
      Object.prototype.hasOwnProperty.call(obj, "darkMode") ||
      Object.prototype.hasOwnProperty.call(obj, "privacyMode")
  );
}

function unwrapCuentaEnvelope(value = null) {
  if (!value) return null;

  if (looksLikeCuentaEnvelope(value)) {
    const obj = safeObject(value);

    if (obj.preferences) return unwrapCuentaEnvelope(obj.preferences);
    if (obj.account) return unwrapCuentaEnvelope(obj.account);
    if (obj.cuenta) return unwrapCuentaEnvelope(obj.cuenta);
    if (obj.user) return unwrapCuentaEnvelope(obj.user);
    if (obj.item) return unwrapCuentaEnvelope(obj.item);
    if (obj.result) return unwrapCuentaEnvelope(obj.result);
    if (obj.payload) return unwrapCuentaEnvelope(obj.payload);
    if (obj.data && typeof obj.data === "object") return unwrapCuentaEnvelope(obj.data);

    return obj;
  }

  return null;
}

function resolveCuentaItem(item = null) {
  if (item && typeof item === "object") {
    const direct = unwrapCuentaEnvelope(item) || item;
    return normalizeCuentaModel(direct);
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

/* =========================================================
   LABELS / CHIPS
========================================================= */

function getStatusChipStyle(detail = {}) {
  const item = safeObject(detail);

  if (item.isHardened) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (item.isPrivacyFocused) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getThemeChipStyle(detail = {}) {
  const item = safeObject(detail);

  if (item.isDarkMode) {
    return `
      color:#efeaff;
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  return `
    color:#1f2937;
    background:rgba(255,255,255,.9);
    border:1px solid rgba(255,255,255,.55);
  `;
}

function getPrivacyChipStyle(detail = {}) {
  const item = safeObject(detail);

  if (item.isPrivacyMode) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  return `
    color:var(--text-dim);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function renderChip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        font-size:12px;
        font-weight:var(--weight-bold);
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

/* =========================================================
   STATS
========================================================= */

function computeStats(item = null) {
  const detail = safeObject(item);

  return {
    total: detail ? 1 : 0,
    darkMode: detail?.isDarkMode ? 1 : 0,
    privacyOn: detail?.isPrivacyMode ? 1 : 0,
    hardened: detail?.isHardened ? 1 : 0,
  };
}

function renderStatCard({
  label = "",
  value = "0",
  caption = "",
  accent = false,
} = {}) {
  return `
    <article
      class="cuenta-stat-card panel-surface"
      style="
        position:relative;
        overflow:hidden;
        display:grid;
        gap:10px;
        min-height:132px;
        padding:20px;
        border-radius:var(--panel-radius);
        border:1px solid ${
          accent
            ? "color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft))"
            : "var(--border-soft)"
        };
        background:${
          accent
            ? "linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 72%), var(--surface-1, var(--surface-glass))"
            : "var(--surface-1, var(--surface-glass))"
        };
        box-shadow:var(--shadow-sm);
      "
    >
      <span
        style="
          font-size:12px;
          line-height:1;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:var(--text-dim);
          font-weight:var(--weight-bold);
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          font-size:clamp(24px, 3vw, 34px);
          line-height:1;
          letter-spacing:-.04em;
          color:var(--text-strong);
          font-weight:var(--weight-black);
        "
      >
        ${escapeHtml(value)}
      </strong>

      <p
        style="
          margin:0;
          color:var(--text-dim);
          font-size:var(--font-sm);
          line-height:1.45;
        "
      >
        ${escapeHtml(caption)}
      </p>
    </article>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = state || cuentaState || {};
  const stats = computeStats(detail);

  const loading = Boolean(localState?.loading);
  const refreshing = Boolean(localState?.refreshing);
  const saving = Boolean(localState?.saving);

  const updatedText = detail?.updatedAt
    ? formatRelativeDate(detail.updatedAt)
    : "Sin sincronización reciente";

  const statusLabel = detail
    ? getAccountStatusLabel(detail.status, detail)
    : "Configuración estándar";

  return `
    <section
      class="cuenta-hero"
      style="
        position:relative;
        overflow:hidden;
        border-radius:calc(var(--panel-radius) + 6px);
        border:1px solid var(--border-soft);
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent), transparent 34%),
          linear-gradient(180deg, var(--surface-2, var(--surface-glass)), var(--surface-1, var(--surface-glass)));
        box-shadow:var(--shadow-md);
      "
    >
      <div
        style="
          display:grid;
          gap:var(--space-lg);
          padding:clamp(20px, 3vw, 30px);
        "
      >
        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:18px;
            flex-wrap:wrap;
          "
        >
          <div style="display:grid; gap:10px; min-width:min(100%, 560px);">
            <span
              style="
                display:inline-flex;
                align-items:center;
                width:max-content;
                min-height:28px;
                padding:0 12px;
                border-radius:999px;
                border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                color:var(--text-soft);
                font-size:12px;
                font-weight:var(--weight-bold);
                letter-spacing:.06em;
                text-transform:uppercase;
              "
            >
              Cuenta / preferencias
            </span>

            <div style="display:grid; gap:8px;">
              <h1
                class="page-title"
                style="
                  margin:0;
                  font-size:clamp(30px, 5vw, 48px);
                  line-height:.98;
                  letter-spacing:-.05em;
                  color:var(--text-strong);
                "
              >
                Centro de control de cuenta
              </h1>

              <p
                class="page-subtitle"
                style="
                  margin:0;
                  max-width:860px;
                  color:var(--text-dim);
                  font-size:clamp(14px, 2vw, 16px);
                  line-height:1.6;
                "
              >
                Gestiona el modo oscuro, la privacidad y el estado operativo
                de la cuenta desde un panel premium orientado a preferencias
                persistidas del usuario autenticado.
              </p>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
              align-items:center;
            "
          >
            <button
              id="cuenta-open-modal-btn"
              type="button"
              style="
                min-height:42px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border, var(--border-soft));
                background:var(--btn-secondary-bg, var(--surface-glass));
                color:var(--btn-secondary-text, var(--text-soft));
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Ver detalle
            </button>

            <button
              id="cuenta-save-btn"
              type="button"
              ${saving ? "disabled" : ""}
              style="
                min-height:42px;
                padding:0 16px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold);
                cursor:${saving ? "not-allowed" : "pointer"};
                opacity:${saving ? ".78" : "1"};
                box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
              "
            >
              ${saving ? "Guardando..." : "Guardar preferencias"}
            </button>
          </div>
        </div>

        <div
          class="cuenta-hero-meta"
          style="
            display:flex;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
          "
        >
          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            Recurso único persistido
          </span>

          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            Última sync · ${escapeHtml(updatedText)}
          </span>

          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            Estado · ${escapeHtml(statusLabel)}
          </span>

          ${
            refreshing || loading || saving
              ? `
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    gap:8px;
                    min-height:30px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                    background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                    color:var(--text-soft);
                    font-size:12px;
                    font-weight:var(--weight-bold);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  <span
                    aria-hidden="true"
                    style="
                      width:10px;
                      height:10px;
                      border-radius:999px;
                      background:var(--accent, #7c5cff);
                      box-shadow:0 0 0 0 color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent);
                      animation:cuentaPulse 1.35s ease-in-out infinite;
                    "
                  ></span>
                  ${saving ? "Guardando" : "Sincronizando"}
                </span>
              `
              : ""
          }
        </div>

        <div
          class="cuenta-hero-stats"
          style="
            display:grid;
            grid-template-columns:repeat(4, minmax(0, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderStatCard({
            label: "Recurso",
            value: String(stats.total),
            caption: "La cuenta funciona como single resource persistido.",
            accent: true,
          })}

          ${renderStatCard({
            label: "Dark mode",
            value: String(stats.darkMode),
            caption: "Preferencia visual activa en el recurso actual.",
          })}

          ${renderStatCard({
            label: "Privacy mode",
            value: String(stats.privacyOn),
            caption: "Indicador de privacidad persistida para la cuenta.",
          })}

          ${renderStatCard({
            label: "Perfil reforzado",
            value: String(stats.hardened),
            caption: "Combinación dark + privacy activa sobre el recurso.",
          })}
        </div>
      </div>

      <style>
        @keyframes cuentaPulse {
          0% { transform:scale(.92); opacity:.75; }
          50% { transform:scale(1.08); opacity:1; }
          100% { transform:scale(.92); opacity:.75; }
        }

        @media (max-width: 1100px) {
          .cuenta-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 720px) {
          .cuenta-hero-stats {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    <section
      class="panel-surface cuenta-shell-loading"
      style="
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
          padding:22px;
        "
      >
        <div
          style="
            display:grid;
            grid-template-columns:1.2fr .8fr;
            gap:18px;
          "
          class="cuenta-loading-top-grid"
        >
          <div
            style="
              display:grid;
              gap:14px;
              padding:20px;
              border-radius:18px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
            "
          >
            <div style="height:14px; width:120px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
            <div style="height:34px; width:62%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
            <div style="height:14px; width:92%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
            <div style="height:14px; width:78%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
          </div>

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
            <div style="height:14px; width:100px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
            <div style="height:44px; width:100%; border-radius:16px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
            <div style="height:44px; width:100%; border-radius:16px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
          </div>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(3, minmax(0, 1fr));
            gap:18px;
          "
          class="cuenta-loading-card-grid"
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
                  <div style="height:14px; width:110px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
                  <div style="height:14px; width:85%; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
                  <div style="height:48px; width:100%; border-radius:16px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:cuentaSkeleton 1.25s linear infinite;"></div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      <style>
        @keyframes cuentaSkeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 980px) {
          .cuenta-loading-top-grid,
          .cuenta-loading-card-grid {
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
        gap:18px;
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, var(--border-soft));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 72%),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
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
            border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
            background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 12%, transparent);
            color:var(--danger-strong, #ff6b6b);
            font-size:12px;
            letter-spacing:.06em;
            text-transform:uppercase;
            font-weight:var(--weight-bold);
          "
        >
          Error de carga
        </span>

        <h3
          style="
            margin:0;
            font-size:clamp(24px, 3vw, 34px);
            line-height:1.05;
            color:var(--text-strong);
            letter-spacing:-.04em;
          "
        >
          No se pudo renderizar la vista de cuenta
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            font-size:var(--font-base);
            line-height:1.65;
            max-width:780px;
          "
        >
          ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="cuenta-retry-btn"
          type="button"
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:var(--btn-radius);
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold);
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
        gap:18px;
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
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
            letter-spacing:.06em;
            text-transform:uppercase;
            font-weight:var(--weight-bold);
          "
        >
          Sin datos
        </span>

        <h3
          style="
            margin:0;
            font-size:clamp(24px, 3vw, 34px);
            line-height:1.05;
            color:var(--text-strong);
            letter-spacing:-.04em;
          "
        >
          No hay preferencias disponibles
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            font-size:var(--font-base);
            line-height:1.65;
            max-width:760px;
          "
        >
          El recurso de cuenta no devolvió datos utilizables en la carga actual.
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="cuenta-refresh-btn"
          type="button"
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:var(--btn-radius);
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold);
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
   PARTIALS
========================================================= */

function renderMetaField(label = "", value = "") {
  return `
    <div
      style="
        display:grid;
        gap:6px;
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
      "
    >
      <span
        style="
          font-size:11px;
          color:var(--text-faint, #8b8b8b);
          text-transform:uppercase;
          letter-spacing:.08em;
          font-weight:var(--weight-bold, 700);
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          color:var(--text-strong, #fff);
          font-size:14px;
          line-height:1.4;
          word-break:break-word;
        "
      >
        ${escapeHtml(safeText(value, "—"))}
      </strong>
    </div>
  `;
}

function renderSwitchCard({
  title = "",
  description = "",
  checked = false,
  inputId = "",
  dataRole = "",
  action = "",
  activeLabel = "Activo",
  inactiveLabel = "Inactivo",
  disabled = false,
} = {}) {
  return `
    <article
      style="
        display:grid;
        gap:16px;
        padding:20px;
        border-radius:20px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
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
        <div style="display:grid; gap:8px; min-width:min(100%, 320px);">
          <h3
            style="
              margin:0;
              color:var(--text-strong);
              font-size:20px;
              letter-spacing:-.02em;
            "
          >
            ${escapeHtml(title)}
          </h3>

          <p
            style="
              margin:0;
              color:var(--text-dim);
              font-size:14px;
              line-height:1.6;
            "
          >
            ${escapeHtml(description)}
          </p>
        </div>

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
            border:1px solid ${
              checked
                ? "color-mix(in srgb, var(--success-strong, #36c690) 28%, transparent)"
                : "var(--border-soft)"
            };
            background:${
              checked
                ? "color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent)"
                : "var(--surface-glass)"
            };
            color:${
              checked
                ? "var(--success-strong, #36c690)"
                : "var(--text-dim)"
            };
          "
        >
          ${escapeHtml(checked ? activeLabel : inactiveLabel)}
        </span>
      </div>

      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
          flex-wrap:wrap;
        "
      >
        <label
          for="${escapeHtml(inputId)}"
          style="
            display:inline-flex;
            align-items:center;
            gap:12px;
            cursor:${disabled ? "not-allowed" : "pointer"};
            user-select:none;
          "
        >
          <span
            style="
              color:var(--text-soft);
              font-size:14px;
              font-weight:var(--weight-semibold, 600);
            "
          >
            ${escapeHtml(title)}
          </span>

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
                background:${checked ? "var(--accent, #7c5cff)" : "rgba(255,255,255,.85)"};
                box-shadow:0 6px 14px rgba(0,0,0,.22);
                transition:left .18s ease, background .18s ease;
              "
            ></span>
          </span>
        </label>

        <input
          id="${escapeHtml(inputId)}"
          data-role="${escapeHtml(dataRole)}"
          type="checkbox"
          ${checked ? "checked" : ""}
          ${disabled ? "disabled" : ""}
          style="display:none;"
        />

        <button
          type="button"
          data-action="${escapeHtml(action)}"
          ${disabled ? "disabled" : ""}
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-soft);
            font-weight:var(--weight-bold);
            cursor:${disabled ? "wait" : "pointer"};
            opacity:${disabled ? ".72" : "1"};
          "
        >
          ${checked ? "Desactivar" : "Activar"}
        </button>
      </div>
    </article>
  `;
}

function renderSnapshot(detail = {}) {
  const item = safeObject(detail);

  const snapshot = {
    darkMode: Boolean(item.darkMode),
    privacyMode: Boolean(item.privacyMode),
    theme: safeText(item.theme, item.darkMode ? "dark" : "light"),
    privacy: safeText(item.privacy, item.privacyMode ? "active" : "inactive"),
    status: safeText(item.status, "standard"),
    updatedAt: item.updatedAt || null,
    endpoint: safeText(item.endpoint, "/api/user/preferences"),
  };

  return `
    <pre
      style="
        margin:0;
        padding:18px;
        border-radius:18px;
        background:var(--surface-glass);
        border:1px solid var(--border-soft);
        color:var(--text-soft);
        font-size:13px;
        line-height:1.7;
        overflow:auto;
        white-space:pre-wrap;
        word-break:break-word;
      "
    >${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre>
  `;
}

function renderSectionToolbar({
  updatedAt = "",
  refreshing = false,
  saving = false,
} = {}) {
  return `
    <div
      class="cuenta-panel-toolbar"
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        padding:16px 18px;
        border-bottom:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 6%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        flex-wrap:wrap;
      "
    >
      <div style="display:grid; gap:4px;">
        <strong
          style="
            color:var(--text-strong);
            font-size:var(--font-base);
            letter-spacing:-.02em;
          "
        >
          Panel de preferencias
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:var(--font-sm);
          "
        >
          Recurso único · actualizado ${escapeHtml(updatedAt || "sin fecha")}
        </span>
      </div>

      <div
        style="
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        "
      >
        <span
          style="
            display:inline-flex;
            align-items:center;
            min-height:30px;
            padding:0 10px;
            border-radius:999px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-dim);
            font-size:12px;
            font-weight:var(--weight-bold);
            letter-spacing:.04em;
            text-transform:uppercase;
          "
        >
          Vista settings
        </span>

        ${
          refreshing || saving
            ? `
              <span
                style="
                  display:inline-flex;
                  align-items:center;
                  gap:8px;
                  min-height:30px;
                  padding:0 10px;
                  border-radius:999px;
                  border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
                  background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                  color:var(--text-soft);
                  font-size:12px;
                  font-weight:var(--weight-bold);
                  letter-spacing:.04em;
                  text-transform:uppercase;
                "
              >
                <span
                  aria-hidden="true"
                  style="
                    width:8px;
                    height:8px;
                    border-radius:999px;
                    background:var(--accent, #7c5cff);
                    animation:cuentaPulse 1.25s ease-in-out infinite;
                  "
                ></span>
                ${saving ? "Guardando" : "Actualizando"}
              </span>
            `
            : ""
        }

        <button
          type="button"
          id="cuenta-refresh-btn"
          data-action="refresh-cuenta"
          style="
            min-height:34px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-soft);
            font-weight:var(--weight-bold);
            cursor:pointer;
          "
        >
          Actualizar
        </button>
      </div>
    </div>
  `;
}

function renderPanelOverlay(message = "Actualizando cuenta...") {
  return `
    <div
      class="cuenta-panel-overlay"
      aria-live="polite"
      aria-busy="true"
      style="
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:18px;
        background:color-mix(in srgb, var(--surface-1, #0f1115) 74%, transparent);
        backdrop-filter:blur(4px);
        z-index:4;
      "
    >
      <div
        style="
          display:grid;
          justify-items:center;
          gap:12px;
          min-width:min(100%, 240px);
          padding:18px 20px;
          border-radius:18px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
          background:linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent), var(--surface-1, var(--surface-glass));
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
          ${escapeHtml(message)}
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:12px;
          "
        >
          Solo se está actualizando el panel principal
        </span>
      </div>
    </div>
  `;
}

/* =========================================================
   MAIN PANEL
========================================================= */

export function renderPanel({ item = null, state = {} } = {}) {
  const detail = resolveCuentaItem(item);
  const localState = state || cuentaState || {};

  const refreshing = Boolean(localState?.refreshing);
  const loading = Boolean(localState?.loading);
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

  const updatedAtText = detail.updatedAt
    ? formatRelativeDate(detail.updatedAt)
    : "sin fecha";

  const exactUpdatedAt = detail.updatedAt
    ? formatDate(detail.updatedAt)
    : "—";

  const themeLabel = first(
    detail.themeLabel,
    getThemeLabel(detail.theme),
    "Dark mode"
  );

  const privacyLabel = first(
    detail.privacyLabel,
    getPrivacyLabel(detail.privacy),
    "Privacidad desactivada"
  );

  const statusLabel = first(
    detail.statusLabel,
    getAccountStatusLabel(detail.status, detail),
    "Configuración estándar"
  );

  return `
    <section
      class="cuenta-panel-wrap panel-surface"
      style="
        position:relative;
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 60%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      ${renderSectionToolbar({
        updatedAt: updatedAtText,
        refreshing,
        saving,
      })}

      <div
        style="
          display:grid;
          gap:18px;
          padding:18px;
        "
      >
        <section
          style="
            display:grid;
            grid-template-columns:1.05fr .95fr;
            gap:18px;
          "
          class="cuenta-top-grid"
        >
          <article
            style="
              display:grid;
              gap:16px;
              padding:20px;
              border-radius:20px;
              border:1px solid var(--border-soft);
              background:
                radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 44%),
                var(--surface-1, var(--surface-glass));
              box-shadow:var(--shadow-sm);
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
              <div style="display:grid; gap:10px;">
                <div
                  style="
                    display:flex;
                    align-items:center;
                    gap:10px;
                    flex-wrap:wrap;
                  "
                >
                  ${renderChip(statusLabel, getStatusChipStyle(detail))}
                  ${renderChip(themeLabel, getThemeChipStyle(detail))}
                  ${renderChip(privacyLabel, getPrivacyChipStyle(detail))}
                </div>

                <div style="display:grid; gap:6px;">
                  <h2
                    style="
                      margin:0;
                      color:var(--text-strong);
                      font-size:clamp(26px, 4vw, 38px);
                      line-height:1;
                      letter-spacing:-.04em;
                    "
                  >
                    Preferencias persistidas
                  </h2>

                  <p
                    style="
                      margin:0;
                      color:var(--text-dim);
                      font-size:14px;
                      line-height:1.65;
                      max-width:720px;
                    "
                  >
                    El panel opera sobre un recurso único del usuario autenticado
                    y mantiene coherencia entre store, state, bindings, modal y API.
                  </p>
                </div>
              </div>

              <div
                style="
                  flex:0 0 auto;
                  width:74px;
                  height:74px;
                  border-radius:22px;
                  display:grid;
                  place-items:center;
                  background:
                    radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 24%, transparent), transparent 58%),
                    linear-gradient(135deg, rgba(124,92,255,.20), rgba(255,255,255,.04));
                  border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                  color:var(--text-strong);
                  font-size:28px;
                  font-weight:var(--weight-black);
                  letter-spacing:.03em;
                  box-shadow:0 18px 42px rgba(0,0,0,.24);
                "
                aria-hidden="true"
              >
                ${detail.isDarkMode ? "◐" : "☼"}
              </div>
            </div>

            <div
              style="
                display:grid;
                grid-template-columns:repeat(4, minmax(0, 1fr));
                gap:12px;
              "
              class="cuenta-meta-grid"
            >
              ${renderMetaField("Tema", themeLabel)}
              ${renderMetaField("Privacidad", privacyLabel)}
              ${renderMetaField("Estado", statusLabel)}
              ${renderMetaField("Actualizado", exactUpdatedAt)}
            </div>
          </article>

          <article
            style="
              display:grid;
              gap:14px;
              padding:20px;
              border-radius:20px;
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
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Acciones rápidas
              </h3>

              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  font-size:14px;
                  line-height:1.6;
                "
              >
                Acceso directo a refresco, detalle modal y guardado del estado actual.
              </p>
            </div>

            <div style="display:grid; gap:10px;">
              <button
                id="cuenta-theme-btn"
                type="button"
                data-action="toggle-theme"
                ${saving || refreshing ? "disabled" : ""}
                style="
                  min-height:44px;
                  padding:0 14px;
                  border-radius:14px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                  color:var(--text-soft);
                  font-weight:var(--weight-bold);
                  cursor:${saving || refreshing ? "wait" : "pointer"};
                  opacity:${saving || refreshing ? ".72" : "1"};
                "
              >
                ${detail.isDarkMode ? "Desactivar dark mode" : "Activar dark mode"}
              </button>

              <button
                id="cuenta-privacy-btn"
                type="button"
                data-action="toggle-privacy"
                ${saving || refreshing ? "disabled" : ""}
                style="
                  min-height:44px;
                  padding:0 14px;
                  border-radius:14px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                  color:var(--text-soft);
                  font-weight:var(--weight-bold);
                  cursor:${saving || refreshing ? "wait" : "pointer"};
                  opacity:${saving || refreshing ? ".72" : "1"};
                "
              >
                ${detail.isPrivacyMode ? "Desactivar privacy mode" : "Activar privacy mode"}
              </button>

              <button
                type="button"
                data-action="save-cuenta"
                ${saving || refreshing ? "disabled" : ""}
                style="
                  min-height:44px;
                  padding:0 14px;
                  border-radius:14px;
                  border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                  background:var(--btn-primary-bg, var(--accent, #7c5cff));
                  color:var(--btn-primary-text, #fff);
                  font-weight:var(--weight-bold);
                  cursor:${saving || refreshing ? "wait" : "pointer"};
                  opacity:${saving || refreshing ? ".78" : "1"};
                "
              >
                ${saving ? "Guardando..." : "Guardar estado actual"}
              </button>
            </div>
          </article>
        </section>

        <section
          style="
            display:grid;
            grid-template-columns:repeat(2, minmax(0, 1fr));
            gap:18px;
          "
          class="cuenta-switch-grid"
        >
          ${renderSwitchCard({
            title: "Dark mode",
            description:
              "Conmuta el tema visual persistido usando la semántica del endpoint fino /theme y el estado local del módulo.",
            checked: Boolean(detail.darkMode),
            inputId: "cuenta-darkmode-input",
            dataRole: "cuenta-darkmode-input",
            action: "toggle-theme",
            activeLabel: "Activo",
            inactiveLabel: "Inactivo",
            disabled: saving || refreshing,
          })}

          ${renderSwitchCard({
            title: "Privacy mode",
            description:
              "Activa o desactiva el modo privacidad persistido sobre /api/user/preferences para el usuario autenticado.",
            checked: Boolean(detail.privacyMode),
            inputId: "cuenta-privacymode-input",
            dataRole: "cuenta-privacy-input",
            action: "toggle-privacy",
            activeLabel: "Activo",
            inactiveLabel: "Inactivo",
            disabled: saving || refreshing,
          })}
        </section>

        <section
          style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:18px;
          "
          class="cuenta-bottom-grid"
        >
          <article
            style="
              display:grid;
              gap:12px;
              padding:20px;
              border-radius:20px;
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
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Estado operativo
              </h3>

              <p
                style="
                  margin:0;
                  color:var(--text-dim);
                  font-size:14px;
                  line-height:1.6;
                "
              >
                Resumen visual del recurso actual según el model normalizado de cuenta.
              </p>
            </div>

            <div
              style="
                display:grid;
                gap:12px;
              "
            >
              ${renderMetaField("Theme key", safeText(detail.theme, "dark"))}
              ${renderMetaField("Privacy key", safeText(detail.privacy, "inactive"))}
              ${renderMetaField("Status key", safeText(detail.status, "standard"))}
              ${renderMetaField("Endpoint", safeText(detail.endpoint, "/api/user/preferences"))}
            </div>
          </article>

          <article
            style="
              display:grid;
              gap:12px;
              padding:20px;
              border-radius:20px;
              border:1px solid var(--border-soft);
              background:var(--surface-1, var(--surface-glass));
              box-shadow:var(--shadow-sm);
            "
          >
            <div
              style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                flex-wrap:wrap;
              "
            >
              <div style="display:grid; gap:8px;">
                <h3
                  style="
                    margin:0;
                    color:var(--text-strong);
                    font-size:20px;
                    letter-spacing:-.02em;
                  "
                >
                  Snapshot técnico
                </h3>

                <p
                  style="
                    margin:0;
                    color:var(--text-dim);
                    font-size:14px;
                    line-height:1.6;
                  "
                >
                  Vista rápida del payload persistido utilizable para debug y modal.
                </p>
              </div>

              <button
                type="button"
                id="cuenta-copy-snapshot-btn"
                data-action="open-cuenta-modal"
                style="
                  min-height:40px;
                  padding:0 12px;
                  border-radius:12px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                  color:var(--text-soft);
                  font-weight:var(--weight-bold);
                  cursor:pointer;
                "
              >
                Abrir modal
              </button>
            </div>

            ${renderSnapshot(detail)}
          </article>
        </section>
      </div>

      ${
        refreshing
          ? renderPanelOverlay("Actualizando cuenta...")
          : saving
          ? renderPanelOverlay("Guardando preferencias...")
          : ""
      }

      <style>
        @keyframes cuentaSpin {
          to { transform:rotate(360deg); }
        }

        @media (max-width: 1100px) {
          .cuenta-top-grid,
          .cuenta-bottom-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 980px) {
          .cuenta-switch-grid,
          .cuenta-meta-grid {
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
        gap:var(--space-lg, 18px);
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
