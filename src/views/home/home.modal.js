/* =========================================================
   Onion SPA - Home Modal
   Archivo: src/views/home/home.modal.js

   FINAL PRO SYSTEM · DETAIL MODAL · DASHBOARD / WIDGET INSPECTOR

   RESPONSABILIDADES:
   - renderizar modal premium de detalle de home/dashboard
   - abrir / cerrar modal limpio
   - refrescar contenido del dashboard desde el modal
   - copiar ID/key de widget desde el modal
   - soportar summary / metrics / list / recent activity / metadata
   - exponer bridge global para homeView.js
   - integrarse con AppCore.events sin acoplar la vista

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback avatar/icon -> iniciales
   - modal singleton
   - escape / overlay close
   - render incremental seguro
   - estado visual interno de refresh
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "home-detail-modal-root";
const PANEL_ID = "home-detail-modal-panel";

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

function getWidgetId(detail = {}) {
  return safeText(
    first(
      detail.widgetId,
      detail.id,
      detail.key,
      detail.slug,
      detail.code
    ),
    "—"
  );
}

function getWidgetTitle(detail = {}) {
  return safeText(
    first(
      detail.title,
      detail.name,
      detail.label,
      detail.heading
    ),
    "Bloque"
  );
}

function getWidgetDescription(detail = {}) {
  return safeText(
    first(
      detail.description,
      detail.descripcion,
      detail.subtitle,
      detail.summary,
      detail.text
    ),
    "Sin descripción."
  );
}

function getWidgetType(detail = {}) {
  return safeText(
    first(
      detail.type,
      detail.kind,
      detail.variant,
      detail.category
    ),
    "widget"
  );
}

function getWidgetStatus(detail = {}) {
  return safeText(
    first(
      detail.status,
      detail.estado,
      detail.state
    ),
    "active"
  );
}

function getWidgetValue(detail = {}) {
  return first(
    detail.value,
    detail.total,
    detail.amount,
    detail.count,
    detail.metric
  );
}

function getWidgetTrend(detail = {}) {
  return first(
    detail.trend,
    detail.delta,
    detail.change,
    detail.variation
  );
}

function getWidgetRoute(detail = {}) {
  return safeText(
    first(
      detail.route,
      detail.href,
      detail.link,
      detail.to
    ),
    ""
  );
}

function getWidgetUpdatedAt(detail = {}) {
  return first(
    detail.updatedAt,
    detail.lastUpdate,
    detail.modifiedAt,
    detail.createdAt
  );
}

function getWidgetIcon(detail = {}) {
  return safeText(
    first(
      detail.icon,
      detail.emoji,
      detail.symbol
    ),
    ""
  );
}

function getWidgetItems(detail = {}) {
  return safeArray(
    first(
      detail.items,
      detail.rows,
      detail.list,
      detail.data
    )
  ).map((item) => safeObject(item));
}

function getWidgetTags(detail = {}) {
  const rawTags = first(
    detail.tags,
    detail.labels,
    detail.badges
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

function normalizeHomeDetail(detail = {}) {
  const raw = safeObject(detail);

  return {
    ...raw,
    widgetId: getWidgetId(raw),
    title: getWidgetTitle(raw),
    description: getWidgetDescription(raw),
    type: getWidgetType(raw),
    status: getWidgetStatus(raw),
    value: getWidgetValue(raw),
    trend: getWidgetTrend(raw),
    route: getWidgetRoute(raw),
    updatedAt: getWidgetUpdatedAt(raw),
    icon: getWidgetIcon(raw),
    items: getWidgetItems(raw),
    tags: getWidgetTags(raw),
  };
}

/* =========================================================
   VISUAL HELPERS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["active", "ok", "ready", "enabled"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["warning", "pending", "degraded"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["error", "critical", "down", "disabled"].includes(key)) {
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

  if (["kpi", "metric"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["list", "table", "collection"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["activity", "timeline", "recent"].includes(key)) {
    return `
      color:#b388ff;
      background:color-mix(in srgb, #b388ff 14%, transparent);
      border:1px solid color-mix(in srgb, #b388ff 26%, transparent);
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

function getInitials(value = "") {
  const text = safeText(value, "ON");
  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return text.slice(0, 2).toUpperCase();
}

function renderAvatar(detail = {}) {
  const icon = safeText(detail.icon, "");
  const initials = getInitials(detail.title || detail.widgetId || "ON");

  if (icon) {
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
          background:linear-gradient(135deg, rgba(124,92,255,.28), rgba(88,72,200,.12));
          border:1px solid rgba(124,92,255,.28);
          color:#efeaff;
          font-size:28px;
          box-shadow:0 12px 28px rgba(124,92,255,.22);
        "
      >
        ${escapeHtml(icon)}
      </div>
    `;
  }

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
        background:linear-gradient(135deg, rgba(124,92,255,.28), rgba(88,72,200,.12));
        border:1px solid rgba(124,92,255,.28);
        color:#efeaff;
        font-size:22px;
        font-weight:var(--weight-black, 800);
        letter-spacing:.03em;
        box-shadow:0 12px 28px rgba(124,92,255,.22);
      "
    >
      ${escapeHtml(initials)}
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
  const tags = safeArray(detail.tags);

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

function renderItems(detail = {}) {
  const items = safeArray(detail.items);

  if (!items.length) {
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
        Sin elementos asociados
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
      ${items
        .slice(0, 12)
        .map((entry, index) => {
          const item = safeObject(entry);
          const title = safeText(
            first(
              item.title,
              item.name,
              item.label,
              item.subject,
              item.id,
              item.code
            ),
            `Elemento ${index + 1}`
          );

          const subtitle = safeText(
            first(
              item.description,
              item.subtitle,
              item.status,
              item.state,
              item.email
            ),
            ""
          );

          const meta = safeText(
            first(
              item.updatedAt,
              item.createdAt,
              item.date,
              item.route,
              item.href
            ),
            ""
          );

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
                  word-break:break-word;
                "
              >
                ${escapeHtml(title)}
              </strong>

              ${
                subtitle
                  ? `
                    <div
                      style="
                        color:var(--text-soft);
                        font-size:13px;
                        line-height:1.5;
                        word-break:break-word;
                      "
                    >
                      ${escapeHtml(subtitle)}
                    </div>
                  `
                  : ""
              }

              ${
                meta
                  ? `
                    <div
                      style="
                        color:var(--text-dim);
                        font-size:12px;
                      "
                    >
                      ${escapeHtml(meta)}
                    </div>
                  `
                  : ""
              }
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
            animation:homeModalSpin .8s linear infinite;
          "
        ></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:14px;
            letter-spacing:-.02em;
          "
        >
          Actualizando dashboard...
        </strong>
      </div>
    </div>
  `;
}

function renderModalInner(detail = {}, { isRefreshing = false } = {}) {
  const item = normalizeHomeDetail(detail);
  const widgetId = getWidgetId(item);
  const title = getWidgetTitle(item);
  const description = getWidgetDescription(item);
  const type = getWidgetType(item);
  const status = getWidgetStatus(item);
  const value = getWidgetValue(item);
  const trend = getWidgetTrend(item);
  const route = getWidgetRoute(item);
  const updatedAt = formatDate(item.updatedAt);
  const updatedAgo = formatRelativeDate(item.updatedAt);

  return `
    <div
      data-home-modal-overlay="true"
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
        data-home-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-modal-title"
        tabindex="-1"
        style="
          position:relative;
          width:min(1120px, 100%);
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
                  Widget ${escapeHtml(widgetId)}
                </span>

                ${renderChip(type, getTypeChipStyle(type))}
                ${renderChip(status, getStatusChipStyle(status))}
              </div>

              <div style="display:grid; gap:6px; min-width:0;">
                <h2
                  id="home-modal-title"
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
                  "
                >
                  Actualizado ${escapeHtml(updatedAgo)}
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
              data-widget-id="${escapeHtml(widgetId)}"
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
                          animation:homeModalSpin .8s linear infinite;
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
              data-modal-action="copy"
              data-widget-id="${escapeHtml(widgetId)}"
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
              Copiar ID
            </button>

            ${
              route
                ? `
                  <button
                    type="button"
                    data-modal-action="navigate"
                    data-route="${escapeHtml(route)}"
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
                    Abrir ruta
                  </button>
                `
                : ""
            }

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
            class="home-modal-meta-grid"
          >
            ${renderMetaField("ID", widgetId)}
            ${renderMetaField("Tipo", type)}
            ${renderMetaField("Estado", status)}
            ${renderMetaField("Valor", value === null || value === undefined ? "—" : String(value))}
            ${renderMetaField("Tendencia", trend === null || trend === undefined ? "—" : String(trend))}
            ${renderMetaField("Ruta", route || "—")}
            ${renderMetaField("Actualizado", updatedAt)}
            ${renderMetaField("Items", String(safeArray(item.items).length))}
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
                Widget ${escapeHtml(widgetId)}
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
              grid-template-columns:1fr 1fr;
              gap:18px;
            "
            class="home-modal-lower-grid"
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
                Elementos asociados
              </h3>

              ${renderItems(item)}
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
                Datos en bruto
              </h3>

              <div
                style="
                  padding:14px;
                  border-radius:16px;
                  border:1px solid var(--border-soft);
                  background:var(--surface-glass);
                  overflow:auto;
                "
              >
                <pre
                  style="
                    margin:0;
                    color:var(--text-soft);
                    font-size:12px;
                    line-height:1.55;
                    white-space:pre-wrap;
                    word-break:break-word;
                    font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                  "
                >${escapeHtml(JSON.stringify(item, null, 2))}</pre>
              </div>
            </section>
          </div>
        </div>

        <style>
          @keyframes homeModalSpin {
            to { transform: rotate(360deg); }
          }

          @media (max-width: 980px) {
            .home-modal-meta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .home-modal-lower-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 640px) {
            .home-modal-meta-grid {
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
      closeHomeModal();
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

export function openHomeModal(detail = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.detail = normalizeHomeDetail(detail);
  modalState.isOpen = true;
  modalState.isRefreshing = false;

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("home:modal:opened", {
    detail: modalState.detail,
    widgetId: getWidgetId(modalState.detail),
  });

  return true;
}

export function closeHomeModal() {
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

  safeEmit("home:modal:closed", {});

  return true;
}

export function updateHomeModal(detail = {}) {
  if (!modalState.isOpen) {
    return openHomeModal(detail);
  }

  modalState.detail = normalizeHomeDetail(detail);
  modalState.isRefreshing = false;

  renderModal();
  attachRootBindings();

  return true;
}

/* =========================================================
   ACTIONS
========================================================= */

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

async function handleCopy(widgetId = "") {
  const id = safeText(widgetId, "");

  if (!id) {
    showToast("No hay ID para copiar.", "error");
    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    showToast("No se pudo copiar el ID.", "error");
    return false;
  }

  safeEmit("home:modal:copy", {
    widgetId: id,
  });

  showToast("ID copiado", "success");

  return true;
}

async function handleRefresh(widgetId = "") {
  const id = safeText(widgetId, "");

  if (!id || modalState.isRefreshing) {
    return false;
  }

  modalState.isRefreshing = true;
  renderModal();
  attachRootBindings();

  safeEmit("home:modal:refresh", {
    widgetId: id,
  });

  return true;
}

async function handleNavigate(route = "") {
  const targetRoute = safeText(route, "");

  if (!targetRoute) {
    showToast("No hay ruta disponible.", "error");
    return false;
  }

  safeEmit("home:modal:navigate", {
    route: targetRoute,
  });

  try {
    if (AppCore?.router?.navigate) {
      await AppCore.router.navigate(targetRoute);
      return true;
    }

    if (AppCore?.Router?.navigate) {
      await AppCore.Router.navigate(targetRoute);
      return true;
    }

    return true;
  } catch {
    showToast("No se pudo abrir la ruta.", "error");
    return false;
  }
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
      closeHomeModal();
      return;
    }

    const refreshBtn = event.target.closest('[data-modal-action="refresh"]');
    if (refreshBtn) {
      event.preventDefault();
      await handleRefresh(refreshBtn.dataset.widgetId || "");
      return;
    }

    const copyBtn = event.target.closest('[data-modal-action="copy"]');
    if (copyBtn) {
      event.preventDefault();
      await handleCopy(copyBtn.dataset.widgetId || "");
      return;
    }

    const navigateBtn = event.target.closest('[data-modal-action="navigate"]');
    if (navigateBtn) {
      event.preventDefault();
      await handleNavigate(navigateBtn.dataset.route || "");
      return;
    }

    const overlay = event.target.closest("[data-home-modal-overlay='true']");
    const panel = event.target.closest("[data-home-modal-panel='true']");

    if (overlay && !panel && event.target === overlay) {
      closeHomeModal();
    }
  };

  root.__homeModalClickHandler = onClick;
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();
  if (!root) return;

  if (root.__homeModalClickHandler) {
    try {
      root.removeEventListener("click", root.__homeModalClickHandler);
    } catch {}
    delete root.__homeModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;
  openHomeModal(detail);
}

function handleCloseEvent() {
  closeHomeModal();
}

function handleOpenedDetailEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;

  if (modalState.isOpen) {
    updateHomeModal(detail);
  }
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("home:modal:open", handleOpenEvent);
  safeOn("home:modal:close", handleCloseEvent);
  safeOn("home:widget:open:success", handleOpenedDetailEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("home:modal:open", handleOpenEvent);
  safeOff("home:modal:close", handleCloseEvent);
  safeOff("home:widget:open:success", handleOpenedDetailEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionHomeModal = {
  open(detail = {}) {
    return openHomeModal(detail);
  },

  close() {
    return closeHomeModal();
  },

  update(detail = {}) {
    return updateHomeModal(detail);
  },

  getState() {
    return {
      ...modalState,
      detail: modalState.detail ? { ...modalState.detail } : null,
    };
  },

  destroy() {
    closeHomeModal();
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
  window.OnionHomeModal = OnionHomeModal;
  window.renderHomeWidgetModal = OnionHomeModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionHomeModal;
