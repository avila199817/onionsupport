/* =========================================================
   Onion SPA - Ajustes Modal
   Archivo: src/views/ajustes/ajustes.modal.js

   FINAL PRO SYSTEM · DETAIL MODAL · 10/10

   RESPONSABILIDADES:
   - renderizar modal premium de detalle de ajuste
   - abrir / cerrar modal limpio
   - refrescar contenido del ajuste desde el modal
   - copiar ID / copiar KEY desde el modal
   - soportar opciones / historial / metadata
   - exponer bridge global para ajustesView.js
   - integrarse con AppCore.events sin acoplar la vista

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback avatar -> iniciales
   - modal singleton
   - escape / overlay close
   - render incremental seguro
   - estado visual interno de refresh
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  normalizeAjusteModel,
  getStatusLabel,
  getTypeLabel,
  getVisibilityLabel,
  getAvatarTheme,
  getInitials,
  stringifyValue,
} from "./ajustes.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "ajustes-detail-modal-root";
const PANEL_ID = "ajustes-detail-modal-panel";

/* =========================================================
   LOCAL STATE
========================================================= */

const modalState = {
  detail: null,
  isOpen: false,
  isRefreshing: false,
  bindingsAttached: false,
  lastActiveElement: null,
  escHandler: null,
};

/* =========================================================
   HELPERS CORE
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
}

function safeOn(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.on?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeOff(event = "", handler = null) {
  if (!event || typeof handler !== "function") return false;

  try {
    AppCore?.events?.off?.(event, handler);
    return true;
  } catch {
    return false;
  }
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function showToast(message = "", type = "info") {
  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](message);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(message, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(message);
  } catch {}
}

/* =========================================================
   DATE HELPERS
========================================================= */

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

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
  if (Number.isNaN(date.getTime())) return "Sin fecha";

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
   DETAIL NORMALIZATION
========================================================= */

function getDetail(detail = {}) {
  return normalizeAjusteModel(safeObject(detail));
}

function getSettingId(detail = {}) {
  return safeText(
    first(
      detail.settingId,
      detail.ajusteId,
      detail.paymentMethodId,
      detail.id
    ),
    "—"
  );
}

function getSettingKey(detail = {}) {
  return safeText(
    first(
      detail.key,
      detail.settingKey,
      detail.slug,
      detail.code
    ),
    "—"
  );
}

function getCategoryIcon(detail = {}) {
  return safeText(
    first(
      detail.categoryIcon,
      detail?.raw?.categoryIcon,
      detail?.raw?.icon,
      detail?.raw?.iconName
    ),
    ""
  );
}

function getDisplayDescription(detail = {}) {
  return safeText(
    first(
      detail.description,
      detail?.raw?.description,
      detail?.raw?.descripcion,
      detail?.raw?.helpText,
      detail?.raw?.help,
      detail?.raw?.summary
    ),
    "Sin descripción."
  );
}

function getCategory(detail = {}) {
  return safeText(
    first(
      detail.category,
      detail?.raw?.category,
      detail?.raw?.categoria,
      detail?.raw?.group,
      detail?.raw?.section
    ),
    "General"
  );
}

function getScope(detail = {}) {
  return safeText(
    first(
      detail.scope,
      detail.visibility,
      detail?.raw?.scope,
      detail?.raw?.visibility,
      detail?.raw?.visibilidad
    ),
    "private"
  );
}

function getTags(detail = {}) {
  const rawTags = first(
    detail.tags,
    detail?.raw?.tags,
    detail?.raw?.labels
  );

  if (Array.isArray(rawTags)) {
    return rawTags
      .map((tag) => safeText(tag, ""))
      .filter(Boolean);
  }

  if (typeof rawTags === "string") {
    return rawTags
      .split(",")
      .map((tag) => safeText(tag, ""))
      .filter(Boolean);
  }

  return [];
}

function getValuePreview(detail = {}) {
  return stringifyValue(
    first(
      detail.value,
      detail.valor,
      detail.currentValue,
      detail.defaultValue
    )
  );
}

/* =========================================================
   VISUAL HELPERS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["active", "activo", "activa", "enabled", "habilitado", "habilitada"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["inactive", "inactivo", "inactiva", "disabled", "deshabilitado", "deshabilitada"].includes(key)) {
    return `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `;
  }

  if (["draft", "borrador"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["error", "failed", "invalid", "invalido", "inválido"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getTypeChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["payment_method", "payment-method", "payment", "metodo_pago", "método_pago", "metodo de pago", "método de pago"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["boolean", "bool", "switch", "toggle"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["select", "option", "options", "dropdown"].includes(key)) {
    return `
      color:#b388ff;
      background:color-mix(in srgb, #b388ff 14%, transparent);
      border:1px solid color-mix(in srgb, #b388ff 26%, transparent);
    `;
  }

  if (["json", "object", "map"].includes(key)) {
    return `
      color:#22d3ee;
      background:color-mix(in srgb, #22d3ee 14%, transparent);
      border:1px solid color-mix(in srgb, #22d3ee 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getVisibilityChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["public", "publico", "público", "publica", "pública"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["internal", "interno", "interna"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["private", "privado", "privada"].includes(key)) {
    return `
      color:var(--text-soft);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `;
  }

  return `
    color:var(--text-soft);
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
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        font-size:12px;
        font-weight:var(--weight-bold, 700);
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

function renderAvatar(detail = {}) {
  const initials = safeText(
    detail.initials,
    getInitials(detail.category || detail.title || "AJ")
  );

  const theme = getAvatarTheme(
    safeText(
      first(
        detail.settingId,
        detail.key,
        detail.category,
        detail.title
      ),
      "onion-ajustes"
    )
  );

  const themeMap = {
    violet: {
      bg: "linear-gradient(135deg, rgba(124,92,255,.28), rgba(88,72,200,.12))",
      border: "rgba(124,92,255,.28)",
      text: "#efeaff",
      glow: "rgba(124,92,255,.22)",
    },
    emerald: {
      bg: "linear-gradient(135deg, rgba(54,198,144,.28), rgba(35,131,95,.12))",
      border: "rgba(54,198,144,.28)",
      text: "#ddfff1",
      glow: "rgba(54,198,144,.22)",
    },
    blue: {
      bg: "linear-gradient(135deg, rgba(96,165,250,.28), rgba(37,99,235,.12))",
      border: "rgba(96,165,250,.28)",
      text: "#e7f2ff",
      glow: "rgba(96,165,250,.22)",
    },
    amber: {
      bg: "linear-gradient(135deg, rgba(255,188,66,.28), rgba(217,119,6,.12))",
      border: "rgba(255,188,66,.28)",
      text: "#fff4d8",
      glow: "rgba(255,188,66,.22)",
    },
    rose: {
      bg: "linear-gradient(135deg, rgba(255,107,107,.28), rgba(190,24,93,.12))",
      border: "rgba(255,107,107,.28)",
      text: "#ffe4e4",
      glow: "rgba(255,107,107,.22)",
    },
    purple: {
      bg: "linear-gradient(135deg, rgba(179,136,255,.28), rgba(109,40,217,.12))",
      border: "rgba(179,136,255,.28)",
      text: "#f3e8ff",
      glow: "rgba(179,136,255,.22)",
    },
    cyan: {
      bg: "linear-gradient(135deg, rgba(34,211,238,.28), rgba(8,145,178,.12))",
      border: "rgba(34,211,238,.28)",
      text: "#e6fcff",
      glow: "rgba(34,211,238,.22)",
    },
    orange: {
      bg: "linear-gradient(135deg, rgba(251,146,60,.28), rgba(194,65,12,.12))",
      border: "rgba(251,146,60,.28)",
      text: "#fff0e4",
      glow: "rgba(251,146,60,.22)",
    },
  };

  const palette = themeMap[theme] || themeMap.violet;
  const icon = getCategoryIcon(detail);

  return `
    <div
      style="
        position:relative;
        flex:0 0 68px;
        width:68px;
        height:68px;
        border-radius:20px;
        display:grid;
        place-items:center;
        background:${palette.bg};
        border:1px solid ${palette.border};
        color:${palette.text};
        font-size:${icon ? "26px" : "22px"};
        font-weight:var(--weight-black, 800);
        letter-spacing:.03em;
        box-shadow:0 12px 28px ${palette.glow};
      "
    >
      ${escapeHtml(icon || initials)}
    </div>
  `;
}

/* =========================================================
   RENDER PARTIALS
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

function renderTags(detail = {}) {
  const tags = getTags(detail);

  if (!tags.length) {
    return `
      <span
        style="
          color:var(--text-dim);
          font-size:13px;
        "
      >
        Sin tags
      </span>
    `;
  }

  return `
    <div
      style="
        display:flex;
        flex-wrap:wrap;
        gap:8px;
      "
    >
      ${tags
        .map(
          (tag) => `
            <span
              style="
                display:inline-flex;
                align-items:center;
                min-height:28px;
                padding:0 10px;
                border-radius:999px;
                border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
                background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                color:var(--text-soft);
                font-size:12px;
                font-weight:var(--weight-bold, 700);
              "
            >
              ${escapeHtml(tag)}
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOptions(detail = {}) {
  const options = safeArray(detail.options);

  if (!options.length) {
    return `
      <div
        style="
          padding:14px;
          border-radius:16px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-dim);
        "
      >
        Sin opciones configuradas
      </div>
    `;
  }

  return `
    <div
      style="
        display:grid;
        gap:10px;
      "
    >
      ${options
        .map((option, index) => {
          const item = safeObject(option);
          const label = safeText(
            first(item.label, item.title, item.name, item.nombre, item.value),
            `opcion_${index + 1}`
          );
          const value = safeText(
            first(item.value, item.id, item.key, item.code),
            "—"
          );

          return `
            <article
              style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:14px;
                padding:14px;
                border-radius:16px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
              "
            >
              <span
                style="
                  min-width:0;
                  font-weight:var(--weight-semibold, 600);
                  word-break:break-word;
                  color:var(--text-strong);
                "
              >
                ${escapeHtml(label)}
              </span>

              <span
                style="
                  flex:0 0 auto;
                  color:var(--text-dim);
                  font-size:12px;
                  word-break:break-word;
                "
              >
                ${escapeHtml(value)}
              </span>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderHistory(detail = {}) {
  const history = safeArray(detail.history);

  if (!history.length) {
    return `
      <div
        style="
          padding:14px;
          border-radius:16px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-dim);
        "
      >
        Sin actividad registrada
      </div>
    `;
  }

  return `
    <div
      style="
        display:grid;
        gap:10px;
      "
    >
      ${history
        .map((entry) => {
          const item = safeObject(entry);

          return `
            <article
              style="
                display:grid;
                gap:8px;
                padding:14px;
                border-radius:16px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
              "
            >
              <strong
                style="
                  color:var(--text-strong);
                  font-size:14px;
                  line-height:1.35;
                "
              >
                ${escapeHtml(
                  safeText(
                    first(item.title, item.action, item.message, item.text),
                    "Evento"
                  )
                )}
              </strong>

              <div
                style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >
                <span
                  style="
                    color:var(--text-dim);
                    font-size:12px;
                  "
                >
                  ${escapeHtml(
                    safeText(first(item.user, item.author, item.name), "Sistema")
                  )}
                </span>

                <span
                  style="
                    color:var(--text-dim);
                    font-size:12px;
                  "
                >
                  ${escapeHtml(formatDate(first(item.createdAt, item.date, item.timestamp)))}
                </span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderLoadingOverlay() {
  return `
    <div
      style="
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:20px;
        background:color-mix(in srgb, var(--surface-1, #0f1115) 76%, transparent);
        backdrop-filter:blur(4px);
        z-index:5;
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
            animation:ajustesModalSpin .8s linear infinite;
          "
        ></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:14px;
            letter-spacing:-.02em;
          "
        >
          Actualizando ajuste...
        </strong>
      </div>
    </div>
  `;
}

function renderModalInner(detail = {}, { isRefreshing = false } = {}) {
  const item = getDetail(detail);
  const settingId = getSettingId(item);
  const settingKey = getSettingKey(item);
  const title = safeText(item.title, "Ajuste");
  const description = getDisplayDescription(item);
  const createdAt = formatDate(item.createdAt);
  const updatedAt = formatDate(item.updatedAt);
  const updatedAgo = formatRelativeDate(item.updatedAt);
  const category = getCategory(item);
  const updatedByName = safeText(item.updatedByName, "Sistema");
  const statusRaw = safeText(item.status, "active");
  const typeRaw = safeText(item.type, "text");
  const visibilityRaw = safeText(getScope(item), "private");
  const valuePreview = getValuePreview(item);
  const statusLabel = getStatusLabel(statusRaw);
  const typeLabel = getTypeLabel(typeRaw);
  const visibilityLabel = getVisibilityLabel(visibilityRaw);

  return `
    <div
      data-ajustes-modal-overlay="true"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        padding:24px;
        display:grid;
        place-items:center;
        background:rgba(0,0,0,.68);
        backdrop-filter:blur(10px);
      "
    >
      <div
        id="${PANEL_ID}"
        data-ajustes-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ajustes-modal-title"
        style="
          position:relative;
          width:min(1160px, 100%);
          max-height:92vh;
          overflow:auto;
          border-radius:28px;
          border:1px solid var(--border-soft, #2b2b2b);
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 34%),
            linear-gradient(180deg, var(--surface-2, #151515), var(--surface-1, #121212));
          box-shadow:0 40px 100px rgba(0,0,0,.45);
        "
      >
        ${isRefreshing ? renderLoadingOverlay() : ""}

        <div
          style="
            padding:24px;
            border-bottom:1px solid var(--border-soft);
            display:flex;
            justify-content:space-between;
            gap:18px;
            flex-wrap:wrap;
          "
        >
          <div
            style="
              display:flex;
              gap:16px;
              align-items:flex-start;
              min-width:min(100%, 540px);
            "
          >
            ${renderAvatar(item)}

            <div style="display:grid; gap:10px; min-width:0;">
              <div
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
                    min-height:28px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:12px;
                    font-weight:var(--weight-bold, 700);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  Ajuste ${escapeHtml(settingId)}
                </span>

                ${renderChip(statusLabel, getStatusChipStyle(statusRaw))}
                ${renderChip(typeLabel, getTypeChipStyle(typeRaw))}
                ${renderChip(visibilityLabel, getVisibilityChipStyle(visibilityRaw))}
              </div>

              <div style="display:grid; gap:6px; min-width:0;">
                <h2
                  id="ajustes-modal-title"
                  style="
                    margin:0;
                    color:var(--text-strong);
                    font-size:clamp(28px, 4vw, 42px);
                    line-height:1;
                    letter-spacing:-.04em;
                    word-break:break-word;
                  "
                >
                  ${escapeHtml(title)}
                </h2>

                <span
                  style="
                    color:var(--text-dim);
                    font-size:14px;
                    word-break:break-word;
                  "
                >
                  Key ${escapeHtml(settingKey)} · Actualizado ${escapeHtml(updatedAgo)}
                </span>
              </div>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
              align-items:flex-start;
            "
          >
            <button
              type="button"
              data-modal-action="refresh"
              data-setting-id="${escapeHtml(settingId)}"
              ${isRefreshing ? "disabled" : ""}
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold, 700);
                cursor:${isRefreshing ? "wait" : "pointer"};
                opacity:${isRefreshing ? ".78" : "1"};
              "
            >
              ${
                isRefreshing
                  ? `
                    <span style="display:inline-flex; align-items:center; gap:8px;">
                      <span
                        aria-hidden="true"
                        style="
                          width:14px;
                          height:14px;
                          border-radius:999px;
                          border:2px solid color-mix(in srgb, var(--text-soft) 22%, transparent);
                          border-top-color:var(--text-soft);
                          animation:ajustesModalSpin .8s linear infinite;
                        "
                      ></span>
                      Refrescando...
                    </span>
                  `
                  : "Actualizar"
              }
            </button>

            <button
              type="button"
              data-modal-action="copy-id"
              data-setting-id="${escapeHtml(settingId)}"
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold, 700);
                cursor:pointer;
              "
            >
              Copiar ID
            </button>

            <button
              type="button"
              data-modal-action="copy-key"
              data-setting-key="${escapeHtml(settingKey)}"
              style="
                min-height:44px;
                padding:0 16px;
                border-radius:14px;
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold, 700);
                cursor:pointer;
              "
            >
              Copiar KEY
            </button>

            <button
              type="button"
              data-modal-close="true"
              aria-label="Cerrar modal"
              style="
                width:48px;
                height:48px;
                border:none;
                border-radius:16px;
                cursor:pointer;
                font-size:20px;
                background:var(--surface-glass);
                color:var(--text-strong);
                border:1px solid var(--border-soft);
              "
            >
              ✕
            </button>
          </div>
        </div>

        <div
          style="
            padding:24px;
            display:grid;
            gap:22px;
          "
        >
          <div
            style="
              display:grid;
              grid-template-columns:repeat(4, minmax(0, 1fr));
              gap:14px;
            "
            class="ajustes-modal-meta-grid"
          >
            ${renderMetaField("Key", settingKey)}
            ${renderMetaField("Categoría", category)}
            ${renderMetaField("Tipo", typeLabel)}
            ${renderMetaField("Visibilidad", visibilityLabel)}
            ${renderMetaField("Estado", statusLabel)}
            ${renderMetaField("Actualizado por", updatedByName)}
            ${renderMetaField("Creado", createdAt)}
            ${renderMetaField("Actualizado", updatedAt)}
          </div>

          <section
            style="
              display:grid;
              gap:10px;
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
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Descripción
              </h3>

              <span
                style="
                  color:var(--text-dim);
                  font-size:12px;
                "
              >
                Ajuste ${escapeHtml(settingId)}
              </span>
            </div>

            <div
              style="
                padding:18px;
                border-radius:18px;
                background:var(--surface-glass);
                border:1px solid var(--border-soft);
                color:var(--text-soft);
                line-height:1.7;
                white-space:pre-wrap;
                word-break:break-word;
              "
            >
              ${escapeHtml(description)}
            </div>
          </section>

          <section
            style="
              display:grid;
              gap:10px;
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
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Valor actual
              </h3>

              <span
                style="
                  color:var(--text-dim);
                  font-size:12px;
                  text-transform:uppercase;
                  letter-spacing:.06em;
                "
              >
                ${escapeHtml(typeLabel)}
              </span>
            </div>

            <div
              style="
                padding:18px;
                border-radius:18px;
                background:var(--surface-glass);
                border:1px solid var(--border-soft);
                color:var(--text-soft);
                line-height:1.7;
                white-space:pre-wrap;
                word-break:break-word;
                font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size:13px;
              "
            >
              ${escapeHtml(valuePreview || "Sin valor")}
            </div>
          </section>

          <section
            style="
              display:grid;
              gap:10px;
            "
          >
            <h3
              style="
                margin:0;
                color:var(--text-strong);
                font-size:20px;
                letter-spacing:-.02em;
              "
            >
              Tags
            </h3>

            ${renderTags(item)}
          </section>

          <div
            style="
              display:grid;
              grid-template-columns:1.05fr .95fr;
              gap:18px;
            "
            class="ajustes-modal-lower-grid"
          >
            <section
              style="
                display:grid;
                gap:10px;
              "
            >
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Opciones
              </h3>

              ${renderOptions(item)}
            </section>

            <section
              style="
                display:grid;
                gap:10px;
              "
            >
              <h3
                style="
                  margin:0;
                  color:var(--text-strong);
                  font-size:20px;
                  letter-spacing:-.02em;
                "
              >
                Actividad
              </h3>

              ${renderHistory(item)}
            </section>
          </div>
        </div>

        <style>
          @keyframes ajustesModalSpin {
            to { transform: rotate(360deg); }
          }

          @media (max-width: 980px) {
            .ajustes-modal-meta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .ajustes-modal-lower-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 640px) {
            .ajustes-modal-meta-grid {
              grid-template-columns: 1fr !important;
            }
          }
        </style>
      </div>
    </div>
  `;
}

/* =========================================================
   ROOT MANAGEMENT
========================================================= */

function getRoot() {
  return document.getElementById(MODAL_ID);
}

function ensureRoot() {
  let root = getRoot();

  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = MODAL_ID;
  document.body.appendChild(root);

  return root;
}

function lockBody() {
  try {
    document.body.classList.add("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "hidden";
  } catch {}
}

function unlockBody() {
  try {
    document.body.classList.remove("modal-open");
  } catch {}

  try {
    document.body.style.overflow = "";
  } catch {}
}

function restoreFocus() {
  try {
    modalState.lastActiveElement?.focus?.();
  } catch {}
}

/* =========================================================
   ESC HANDLER
========================================================= */

function detachEscHandler() {
  if (!modalState.escHandler) {
    return;
  }

  try {
    document.removeEventListener("keydown", modalState.escHandler);
  } catch {}

  modalState.escHandler = null;
}

function attachEscHandler() {
  detachEscHandler();

  modalState.escHandler = (event) => {
    if (event.key === "Escape") {
      closeAjustesModal();
    }
  };

  try {
    document.addEventListener("keydown", modalState.escHandler);
  } catch {}
}

/* =========================================================
   RENDER CONTROL
========================================================= */

function renderModal() {
  const root = ensureRoot();

  if (!modalState.detail) {
    root.innerHTML = "";
    return root;
  }

  root.innerHTML = renderModalInner(modalState.detail, {
    isRefreshing: modalState.isRefreshing,
  });

  return root;
}

function focusPanel() {
  try {
    const panel = document.getElementById(PANEL_ID);
    panel?.focus?.();
  } catch {}
}

/* =========================================================
   OPEN / CLOSE
========================================================= */

export function openAjustesModal(detail = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.detail = getDetail(detail);
  modalState.isOpen = true;
  modalState.isRefreshing = false;

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("ajustes:modal:opened", {
    detail: modalState.detail,
    settingId: getSettingId(modalState.detail),
  });

  return true;
}

export function closeAjustesModal() {
  const root = getRoot();

  modalState.isOpen = false;
  modalState.isRefreshing = false;
  modalState.detail = null;

  if (root) {
    root.innerHTML = "";
  }

  unlockBody();
  detachEscHandler();
  restoreFocus();

  safeEmit("ajustes:modal:closed", {});

  return true;
}

export function updateAjustesModal(detail = {}) {
  if (!modalState.isOpen) {
    return openAjustesModal(detail);
  }

  modalState.detail = getDetail(detail);
  modalState.isRefreshing = false;

  renderModal();
  attachRootBindings();

  return true;
}

/* =========================================================
   ACTIONS
========================================================= */

async function handleCopyId(settingId = "") {
  const id = safeText(settingId, "");

  if (!id) {
    showToast("No hay ID para copiar.", "error");
    return false;
  }

  safeEmit("ajustes:modal:copy-id", {
    settingId: id,
  });

  showToast("ID copiado", "success");

  return true;
}

async function handleCopyKey(key = "") {
  const finalKey = safeText(key, "");

  if (!finalKey) {
    showToast("No hay clave para copiar.", "error");
    return false;
  }

  safeEmit("ajustes:modal:copy-key", {
    key: finalKey,
  });

  showToast("Clave copiada", "success");

  return true;
}

async function handleRefresh(settingId = "") {
  const id = safeText(settingId, "");

  if (!id || modalState.isRefreshing) {
    return false;
  }

  modalState.isRefreshing = true;
  renderModal();
  attachRootBindings();

  safeEmit("ajustes:modal:refresh", {
    settingId: id,
  });

  return true;
}

/* =========================================================
   ROOT BINDINGS
========================================================= */

function attachRootBindings() {
  if (modalState.bindingsAttached) {
    return;
  }

  const root = ensureRoot();

  const onClick = async (event) => {
    const closeBtn = event.target.closest("[data-modal-close='true']");
    if (closeBtn) {
      event.preventDefault();
      closeAjustesModal();
      return;
    }

    const refreshBtn = event.target.closest('[data-modal-action="refresh"]');
    if (refreshBtn) {
      event.preventDefault();
      await handleRefresh(refreshBtn.dataset.settingId || "");
      return;
    }

    const copyIdBtn = event.target.closest('[data-modal-action="copy-id"]');
    if (copyIdBtn) {
      event.preventDefault();
      await handleCopyId(copyIdBtn.dataset.settingId || "");
      return;
    }

    const copyKeyBtn = event.target.closest('[data-modal-action="copy-key"]');
    if (copyKeyBtn) {
      event.preventDefault();
      await handleCopyKey(copyKeyBtn.dataset.settingKey || "");
      return;
    }

    const overlay = event.target.closest("[data-ajustes-modal-overlay='true']");
    const panel = event.target.closest("[data-ajustes-modal-panel='true']");

    if (overlay && !panel && event.target === overlay) {
      closeAjustesModal();
    }
  };

  root.__ajustesModalClickHandler = onClick;
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();
  if (!root) return;

  if (root.__ajustesModalClickHandler) {
    try {
      root.removeEventListener("click", root.__ajustesModalClickHandler);
    } catch {}
    delete root.__ajustesModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;
  openAjustesModal(detail);
}

function handleCloseEvent() {
  closeAjustesModal();
}

function handleOpenedDetailEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;

  if (modalState.isOpen) {
    updateAjustesModal(detail);
  }
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("ajustes:modal:open", handleOpenEvent);
  safeOn("ajustes:modal:close", handleCloseEvent);
  safeOn("ajustes:open:success", handleOpenedDetailEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("ajustes:modal:open", handleOpenEvent);
  safeOff("ajustes:modal:close", handleCloseEvent);
  safeOff("ajustes:open:success", handleOpenedDetailEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionAjustesModal = {
  open(detail = {}) {
    return openAjustesModal(detail);
  },

  close() {
    return closeAjustesModal();
  },

  update(detail = {}) {
    return updateAjustesModal(detail);
  },

  getState() {
    return {
      ...modalState,
      detail: modalState.detail ? { ...modalState.detail } : null,
    };
  },

  destroy() {
    closeAjustesModal();
    detachEscHandler();
    detachRootBindings();
    detachBus();

    const root = getRoot();
    try {
      root?.remove?.();
    } catch {}

    return true;
  },
};

try {
  window.OnionAjustesModal = OnionAjustesModal;
  window.renderAjusteModal = OnionAjustesModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionAjustesModal;
