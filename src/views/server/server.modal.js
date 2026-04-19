/* =========================================================
   Onion SPA - Server Modal
   Archivo: src/views/server/server.modal.js

   FINAL PRO SYSTEM · DETAIL MODAL · SERVER / HEALTH INSPECTOR

   RESPONSABILIDADES:
   - renderizar modal premium de detalle técnico de server
   - abrir / cerrar modal limpio
   - refrescar contenido técnico desde el modal
   - copiar id/key/service desde el modal
   - soportar summary / telemetry / services / runtime / metadata / raw
   - exponer bridge global para serverView.js
   - integrarse con AppCore.events sin acoplar la vista

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback icon -> iniciales
   - modal singleton
   - escape / overlay close
   - render incremental seguro
   - estado visual interno de refresh
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MODAL_ID = "server-detail-modal-root";
const PANEL_ID = "server-detail-modal-panel";

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
   DATE / FORMAT HELPERS
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
      second: "2-digit",
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

function formatMs(value) {
  const n = safeNumber(value, 0);
  if (!n) return "—";
  return `${Math.round((n + Number.EPSILON) * 100) / 100} ms`;
}

function formatPercent(value) {
  const n = safeNumber(value, NaN);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

/* =========================================================
   DETAIL NORMALIZATION
========================================================= */

function getServerDetailId(detail = {}) {
  return safeText(
    first(
      detail.serviceId,
      detail.widgetId,
      detail.id,
      detail.key,
      detail.slug,
      detail.code,
      detail.name
    ),
    "server-detail"
  );
}

function getServerDetailTitle(detail = {}) {
  return safeText(
    first(
      detail.title,
      detail.name,
      detail.label,
      detail.heading,
      detail.service,
      detail.section
    ),
    "Detalle técnico"
  );
}

function getServerDetailDescription(detail = {}) {
  return safeText(
    first(
      detail.description,
      detail.descripcion,
      detail.subtitle,
      detail.summary,
      detail.text,
      detail.detail
    ),
    "Sin descripción."
  );
}

function getServerDetailType(detail = {}) {
  return safeText(
    first(
      detail.type,
      detail.kind,
      detail.variant,
      detail.category,
      detail.sectionType
    ),
    "server"
  );
}

function getServerDetailStatus(detail = {}) {
  return safeText(
    first(
      detail.status,
      detail.estado,
      detail.state
    ),
    "unknown"
  );
}

function getServerDetailValue(detail = {}) {
  return first(
    detail.value,
    detail.total,
    detail.amount,
    detail.count,
    detail.metric,
    detail.latencyMs,
    detail.cpuPercent,
    detail.ramPercent
  );
}

function getServerDetailTrend(detail = {}) {
  return first(
    detail.trend,
    detail.delta,
    detail.change,
    detail.variation
  );
}

function getServerDetailRoute(detail = {}) {
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

function getServerDetailUpdatedAt(detail = {}) {
  return first(
    detail.updatedAt,
    detail.lastUpdate,
    detail.modifiedAt,
    detail.createdAt,
    detail.timestamp,
    detail.generatedAt,
    detail.loadedAt
  );
}

function getServerDetailIcon(detail = {}) {
  return safeText(
    first(
      detail.icon,
      detail.emoji,
      detail.symbol
    ),
    ""
  );
}

function getServerDetailItems(detail = {}) {
  return safeArray(
    first(
      detail.items,
      detail.rows,
      detail.list,
      detail.data
    )
  ).map((item) => safeObject(item));
}

function getServerDetailTags(detail = {}) {
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

function getServerDetailMetadata(detail = {}) {
  return safeObject(
    first(
      detail.metadata,
      detail.meta,
      detail.info
    )
  );
}

function normalizeServerDetail(detail = {}) {
  const raw = safeObject(detail);

  return {
    ...raw,
    serviceId: getServerDetailId(raw),
    title: getServerDetailTitle(raw),
    description: getServerDetailDescription(raw),
    type: getServerDetailType(raw),
    status: getServerDetailStatus(raw),
    value: getServerDetailValue(raw),
    trend: getServerDetailTrend(raw),
    route: getServerDetailRoute(raw),
    updatedAt: getServerDetailUpdatedAt(raw),
    icon: getServerDetailIcon(raw),
    items: getServerDetailItems(raw),
    tags: getServerDetailTags(raw),
    metadata: getServerDetailMetadata(raw),
  };
}

/* =========================================================
   VISUAL HELPERS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = safeText(value, "").toLowerCase();

  if (["active", "ok", "ready", "enabled", "up", "healthy", "online", "success"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["warning", "pending", "degraded", "slow", "revisar"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["error", "critical", "down", "disabled", "offline", "failed"].includes(key)) {
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

  if (["service", "api", "db", "runtime"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["system", "host", "environment", "infra"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["metric", "telemetry", "health", "stats"].includes(key)) {
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
  const text = safeText(value, "SV");
  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return text.slice(0, 2).toUpperCase();
}

function renderAvatar(detail = {}) {
  const icon = safeText(detail.icon, "");
  const initials = getInitials(detail.title || detail.serviceId || "SV");

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
        .slice(0, 16)
        .map((entry, index) => {
          const item = safeObject(entry);
          const title = safeText(
            first(
              item.title,
              item.name,
              item.label,
              item.subject,
              item.id,
              item.code,
              item.key
            ),
            `Elemento ${index + 1}`
          );

          const subtitle = safeText(
            first(
              item.description,
              item.subtitle,
              item.status,
              item.state,
              item.message,
              item.detail
            ),
            ""
          );

          const meta = safeText(
            first(
              item.updatedAt,
              item.createdAt,
              item.date,
              item.route,
              item.href,
              item.timestamp
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

function renderMetadata(detail = {}) {
  const metadata = safeObject(detail.metadata);
  const entries = Object.entries(metadata);

  if (!entries.length) {
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
        Sin metadata extra
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
      ${entries
        .slice(0, 20)
        .map(([key, value]) => {
          const printable =
            value && typeof value === "object"
              ? JSON.stringify(value)
              : String(value ?? "—");

          return `
            <div
              style="
                display:grid;
                gap:6px;
                padding:14px;
                border-radius:16px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
              "
            >
              <span
                style="
                  color:var(--text-dim);
                  font-size:11px;
                  text-transform:uppercase;
                  letter-spacing:.06em;
                  font-weight:700;
                "
              >
                ${escapeHtml(key)}
              </span>

              <strong
                style="
                  color:var(--text-strong);
                  font-size:13px;
                  line-height:1.5;
                  word-break:break-word;
                "
              >
                ${escapeHtml(printable)}
              </strong>
            </div>
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
            animation:serverModalSpin .8s linear infinite;
          "
        ></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:14px;
            letter-spacing:-.02em;
          "
        >
          Actualizando estado técnico...
        </strong>
      </div>
    </div>
  `;
}

function renderModalInner(detail = {}, { isRefreshing = false } = {}) {
  const item = normalizeServerDetail(detail);
  const detailId = getServerDetailId(item);
  const title = getServerDetailTitle(item);
  const description = getServerDetailDescription(item);
  const type = getServerDetailType(item);
  const status = getServerDetailStatus(item);
  const value = getServerDetailValue(item);
  const trend = getServerDetailTrend(item);
  const route = getServerDetailRoute(item);
  const updatedAt = formatDate(item.updatedAt);
  const updatedAgo = formatRelativeDate(item.updatedAt);

  const valueLabel =
    typeof value === "number"
      ? (type.toLowerCase().includes("latency") ? formatMs(value) : String(value))
      : value === null || value === undefined
        ? "—"
        : String(value);

  return `
    <div
      data-server-modal-overlay="true"
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
        data-server-modal-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-modal-title"
        tabindex="-1"
        style="
          position:relative;
          width:min(1180px, 100%);
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
                  Server ${escapeHtml(detailId)}
                </span>

                ${renderChip(type, getTypeChipStyle(type))}
                ${renderChip(status, getStatusChipStyle(status))}
              </div>

              <div style="display:grid; gap:6px; min-width:0;">
                <h2
                  id="server-modal-title"
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
              data-detail-id="${escapeHtml(detailId)}"
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
                          animation:serverModalSpin .8s linear infinite;
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
              data-detail-id="${escapeHtml(detailId)}"
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
            class="server-modal-meta-grid"
          >
            ${renderMetaField("ID", detailId)}
            ${renderMetaField("Tipo", type)}
            ${renderMetaField("Estado", status)}
            ${renderMetaField("Valor", valueLabel)}
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
                Server ${escapeHtml(detailId)}
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
            class="server-modal-lower-grid"
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
                Metadata técnica
              </h3>

              ${renderMetadata(item)}
            </section>
          </div>

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

        <style>
          @keyframes serverModalSpin {
            to { transform: rotate(360deg); }
          }

          @media (max-width: 980px) {
            .server-modal-meta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .server-modal-lower-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 640px) {
            .server-modal-meta-grid {
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
      closeServerModal();
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

export function openServerModal(detail = {}) {
  modalState.lastActiveElement = document.activeElement || null;
  modalState.detail = normalizeServerDetail(detail);
  modalState.isOpen = true;
  modalState.isRefreshing = false;

  renderModal();
  lockBody();
  attachEscHandler();
  attachRootBindings();
  focusPanel();

  safeEmit("server:modal:opened", {
    detail: modalState.detail,
    serviceId: getServerDetailId(modalState.detail),
  });

  return true;
}

export function closeServerModal() {
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

  safeEmit("server:modal:closed", {});

  return true;
}

export function updateServerModal(detail = {}) {
  if (!modalState.isOpen) {
    return openServerModal(detail);
  }

  modalState.detail = normalizeServerDetail(detail);
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

async function handleCopy(detailId = "") {
  const id = safeText(detailId, "");

  if (!id) {
    showToast("No hay ID para copiar.", "error");
    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    showToast("No se pudo copiar el ID.", "error");
    return false;
  }

  safeEmit("server:modal:copy", {
    detailId: id,
  });

  showToast("ID copiado", "success");

  return true;
}

async function handleRefresh(detailId = "") {
  const id = safeText(detailId, "");

  if (!id || modalState.isRefreshing) {
    return false;
  }

  modalState.isRefreshing = true;
  renderModal();
  attachRootBindings();

  safeEmit("server:modal:refresh", {
    detailId: id,
  });

  return true;
}

async function handleNavigate(route = "") {
  const targetRoute = safeText(route, "");

  if (!targetRoute) {
    showToast("No hay ruta disponible.", "error");
    return false;
  }

  safeEmit("server:modal:navigate", {
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
      closeServerModal();
      return;
    }

    const refreshBtn = event.target.closest('[data-modal-action="refresh"]');
    if (refreshBtn) {
      event.preventDefault();
      await handleRefresh(refreshBtn.dataset.detailId || "");
      return;
    }

    const copyBtn = event.target.closest('[data-modal-action="copy"]');
    if (copyBtn) {
      event.preventDefault();
      await handleCopy(copyBtn.dataset.detailId || "");
      return;
    }

    const navigateBtn = event.target.closest('[data-modal-action="navigate"]');
    if (navigateBtn) {
      event.preventDefault();
      await handleNavigate(navigateBtn.dataset.route || "");
      return;
    }

    const overlay = event.target.closest("[data-server-modal-overlay='true']");
    const panel = event.target.closest("[data-server-modal-panel='true']");

    if (overlay && !panel && event.target === overlay) {
      closeServerModal();
    }
  };

  root.__serverModalClickHandler = onClick;
  root.addEventListener("click", onClick);

  modalState.bindingsAttached = true;
}

function detachRootBindings() {
  const root = getRoot();
  if (!root) return;

  if (root.__serverModalClickHandler) {
    try {
      root.removeEventListener("click", root.__serverModalClickHandler);
    } catch {}
    delete root.__serverModalClickHandler;
  }

  modalState.bindingsAttached = false;
}

/* =========================================================
   EVENT BUS BRIDGE
========================================================= */

function handleOpenEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;
  openServerModal(detail);
}

function handleCloseEvent() {
  closeServerModal();
}

function handleOpenedDetailEvent(event) {
  const detail = event?.detail?.detail || event?.detail || event || null;
  if (!detail) return;

  if (modalState.isOpen) {
    updateServerModal(detail);
  }
}

let busAttached = false;

function attachBus() {
  if (busAttached) return;

  safeOn("server:modal:open", handleOpenEvent);
  safeOn("server:modal:close", handleCloseEvent);
  safeOn("server:detail:open:success", handleOpenedDetailEvent);

  busAttached = true;
}

function detachBus() {
  if (!busAttached) return;

  safeOff("server:modal:open", handleOpenEvent);
  safeOff("server:modal:close", handleCloseEvent);
  safeOff("server:detail:open:success", handleOpenedDetailEvent);

  busAttached = false;
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const OnionServerModal = {
  open(detail = {}) {
    return openServerModal(detail);
  },

  close() {
    return closeServerModal();
  },

  update(detail = {}) {
    return updateServerModal(detail);
  },

  getState() {
    return {
      ...modalState,
      detail: modalState.detail ? { ...modalState.detail } : null,
    };
  },

  destroy() {
    closeServerModal();
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
  window.OnionServerModal = OnionServerModal;
  window.renderServerDetailModal = OnionServerModal.open;
} catch {}

/* =========================================================
   AUTO BOOT
========================================================= */

attachBus();

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionServerModal;
