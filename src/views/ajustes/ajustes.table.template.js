/* =========================================================
   Onion SPA - Ajustes Table Template
   Archivo: src/views/ajustes/ajustes.table.template.js

   FINAL PRO SYSTEM · AJUSTES VIEW · CSP CLEAN · 10/10
   SETTINGS COMMAND CENTER · CLIENT SETTINGS READY

   RESPONSABILIDADES:
   - render del hero/header de ajustes
   - render de colección de ajustes en cards productivas
   - render loading / error / empty
   - soportar payloads heterogéneos y envelopes anidados
   - acciones compatibles con data-ajustes-action y data-action
   - sin CSS inline
   - sin estilos inyectados por JS
   - sin renderStyles()
   - compatible con CSS externo:
     · /src/css/views/ajustes/index.css
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_TITLE = "Ajustes";
const DEFAULT_SUBTITLE =
  "Gestiona preferencias, configuración operativa y ajustes asociados a clientes desde un panel centralizado.";

const STATUS_MAP = Object.freeze({
  active: {
    label: "Activo",
    key: "active",
  },
  enabled: {
    label: "Activo",
    key: "active",
  },
  activo: {
    label: "Activo",
    key: "active",
  },
  true: {
    label: "Activo",
    key: "active",
  },

  pending: {
    label: "Pendiente",
    key: "pending",
  },
  pendiente: {
    label: "Pendiente",
    key: "pending",
  },
  draft: {
    label: "Borrador",
    key: "pending",
  },
  borrador: {
    label: "Borrador",
    key: "pending",
  },

  inactive: {
    label: "Inactivo",
    key: "inactive",
  },
  disabled: {
    label: "Inactivo",
    key: "inactive",
  },
  inactivo: {
    label: "Inactivo",
    key: "inactive",
  },
  false: {
    label: "Inactivo",
    key: "inactive",
  },

  error: {
    label: "Error",
    key: "danger",
  },
  failed: {
    label: "Error",
    key: "danger",
  },
  bloqueado: {
    label: "Bloqueado",
    key: "danger",
  },
  blocked: {
    label: "Bloqueado",
    key: "danger",
  },
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

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

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function truncate(value = "", max = 120) {
  const text = normalizeWhitespace(value);
  const limit = Math.max(1, safeNumber(max, 120));

  if (!text) return "";
  if (text.length <= limit) return text;

  return `${text.slice(0, limit - 1).trim()}…`;
}

function boolish(value, fallback = false) {
  if (typeof value === "boolean") return value;

  const key = normalizeKey(value);

  if (["true", "1", "yes", "si", "sí", "on", "active", "activo", "enabled"].includes(key)) {
    return true;
  }

  if (["false", "0", "no", "off", "inactive", "inactivo", "disabled"].includes(key)) {
    return false;
  }

  return Boolean(fallback);
}

/* =========================================================
   FORMATTERS
========================================================= */

function toTimestamp(value = null) {
  if (!value) return 0;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric : numeric * 1000;
  }

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDate(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  const ts = toTimestamp(value);

  if (!ts) return "Sin fecha";

  const diffMs = ts - Date.now();
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
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    'aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const icons = {
    settings: `<svg ${common}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.5a2 2 0 0 1-1 1.73l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.73v-.5a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    save: `<svg ${common}><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8"/><path d="M7 21v-8h10v8"/></svg>`,
    client: `<svg ${common}><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    empty: `<svg ${common}><path d="M3 7h18"/><path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M10 12h4"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    toggle: `<svg ${common}><path d="M12 20h9"/><path d="M3 20h3"/><path d="M18 20a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z"/><path d="M3 4h9"/><path d="M18 4h3"/><path d="M12 4a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  };

  return icons[name] || icons.settings;
}

/* =========================================================
   ENVELOPE / DATA RESOLUTION
========================================================= */

function unwrapItemsEnvelope(value) {
  if (Array.isArray(value)) return value;

  const obj = safeObject(value);

  if (Array.isArray(obj.ajustes)) return obj.ajustes;
  if (Array.isArray(obj.settings)) return obj.settings;
  if (Array.isArray(obj.preferences)) return obj.preferences;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.records)) return obj.records;

  if (obj.data && typeof obj.data === "object") return unwrapItemsEnvelope(obj.data);
  if (obj.payload && typeof obj.payload === "object") return unwrapItemsEnvelope(obj.payload);
  if (obj.response && typeof obj.response === "object") return unwrapItemsEnvelope(obj.response);
  if (obj.result && typeof obj.result === "object") return unwrapItemsEnvelope(obj.result);
  if (obj.body && typeof obj.body === "object") return unwrapItemsEnvelope(obj.body);

  return [];
}

function getResolvedItems(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  const candidates = [
    data.items,
    data.rows,
    data.ajustes,
    data.settings,
    data.preferences,
    data.data,
    data.results,
    data.records,
    data.payload,
    data.response,
    data.result,
    data.body,

    state.items,
    state.rows,
    state.ajustes,
    state.settings,
    state.preferences,
    state.data,
    state.results,
    state.records,
    state.payload,
    state.response,
    state.result,
    state.body,

    input,
  ];

  for (const candidate of candidates) {
    const rows = unwrapItemsEnvelope(candidate);
    if (rows.length) return sortAjustesNewestFirst(rows);
  }

  return [];
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getAjusteId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.id,
      item.settingId,
      item.ajusteId,
      item.preferenceId,
      item.key,
      item.code,
      item.name,
      raw.id,
      raw.settingId,
      raw.ajusteId,
      raw.preferenceId,
      raw.key,
      raw.code,
      raw.name
    ),
    "ajuste"
  );
}

function getClienteName(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.cliente?.nombre,
      item.cliente?.name,
      item.client?.name,
      item.customer?.name,
      item.clientName,
      item.clienteName,
      item.customerName,
      item.company,
      item.empresa,
      item.razonSocial,
      item.title,
      raw.cliente?.nombre,
      raw.cliente?.name,
      raw.client?.name,
      raw.customer?.name,
      raw.clientName,
      raw.clienteName,
      raw.customerName,
      raw.company,
      raw.empresa,
      raw.razonSocial,
      raw.title
    ),
    "Cliente"
  );
}

function getClienteId(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.cliente?.clienteId,
      item.cliente?.id,
      item.client?.id,
      item.customer?.id,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.cliente?.clienteId,
      raw.cliente?.id,
      raw.client?.id,
      raw.customer?.id
    ),
    "—"
  );
}

function getAjusteTitle(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.title,
      item.label,
      item.name,
      item.nombre,
      item.settingName,
      item.preferenceName,
      item.key,
      item.code,
      raw.title,
      raw.label,
      raw.name,
      raw.nombre,
      raw.settingName,
      raw.preferenceName,
      raw.key,
      raw.code
    ),
    "Ajuste"
  );
}

function getAjusteDescription(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.description,
      item.descripcion,
      item.summary,
      item.notes,
      item.help,
      item.meta?.description,
      raw.description,
      raw.descripcion,
      raw.summary,
      raw.notes,
      raw.help,
      raw.meta?.description
    ),
    "Configuración asociada al cliente."
  );
}

function getAjusteCategory(item = {}) {
  const raw = safeObject(item?.raw);

  return safeText(
    first(
      item.category,
      item.categoria,
      item.group,
      item.section,
      item.module,
      item.type,
      item.tipo,
      raw.category,
      raw.categoria,
      raw.group,
      raw.section,
      raw.module,
      raw.type,
      raw.tipo
    ),
    "General"
  );
}

function getAjusteValue(item = {}) {
  const raw = safeObject(item?.raw);

  const value = first(
    item.value,
    item.valor,
    item.enabled,
    item.active,
    item.isEnabled,
    item.isActive,
    item.config?.value,
    item.preferences?.value,
    raw.value,
    raw.valor,
    raw.enabled,
    raw.active,
    raw.isEnabled,
    raw.isActive,
    raw.config?.value,
    raw.preferences?.value
  );

  if (typeof value === "boolean") {
    return value ? "Activado" : "Desactivado";
  }

  if (value && typeof value === "object") {
    return "Configurado";
  }

  return safeText(value, "Sin valor");
}

function getAjusteStatusValue(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.status,
    item.estado,
    item.state,
    item.lifecycle?.status,
    item.enabled,
    item.active,
    item.isEnabled,
    item.isActive,
    raw.status,
    raw.estado,
    raw.state,
    raw.lifecycle?.status,
    raw.enabled,
    raw.active,
    raw.isEnabled,
    raw.isActive,
    "active"
  );
}

function getAjusteStatus(item = {}) {
  const value = getAjusteStatusValue(item);

  if (typeof value === "boolean") {
    return value
      ? STATUS_MAP.active
      : STATUS_MAP.inactive;
  }

  const key = normalizeKey(value);
  return STATUS_MAP[key] || {
    label: safeText(value, "Activo"),
    key: "active",
  };
}

function getUpdatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.updatedAt,
    item.updated_at,
    item.modifiedAt,
    item.lastUpdatedAt,
    item.audit?.updatedAt,
    item.lifecycle?.updatedAt,
    raw.updatedAt,
    raw.updated_at,
    raw.modifiedAt,
    raw.lastUpdatedAt,
    raw.audit?.updatedAt,
    raw.lifecycle?.updatedAt,
    item.createdAt,
    item.created_at,
    raw.createdAt,
    raw.created_at
  );
}

function getCreatedAt(item = {}) {
  const raw = safeObject(item?.raw);

  return first(
    item.createdAt,
    item.created_at,
    item.created,
    item.audit?.createdAt,
    item.lifecycle?.createdAt,
    raw.createdAt,
    raw.created_at,
    raw.created,
    raw.audit?.createdAt,
    raw.lifecycle?.createdAt
  );
}

function getSortTimestamp(item = {}) {
  const raw = safeObject(item?.raw);

  return (
    safeNumber(item?.meta?.updatedAtMs, 0) ||
    safeNumber(raw?.meta?.updatedAtMs, 0) ||
    toTimestamp(getUpdatedAt(item)) ||
    toTimestamp(getCreatedAt(item)) ||
    toTimestamp(raw?._ts) ||
    0
  );
}

function compareAjustesNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);
  if (diff !== 0) return diff;

  return getAjusteTitle(a).localeCompare(getAjusteTitle(b), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortAjustesNewestFirst(items = []) {
  return [...safeArray(items)].sort(compareAjustesNewestFirst);
}

/* =========================================================
   STATS
========================================================= */

function computeStats(items = []) {
  const rows = safeArray(items);

  const clientIds = new Set();

  return rows.reduce(
    (acc, item) => {
      const status = getAjusteStatus(item);
      const clientId = getClienteId(item);

      acc.total += 1;

      if (status.key === "active") acc.active += 1;
      if (status.key === "pending") acc.pending += 1;
      if (status.key === "inactive") acc.inactive += 1;
      if (status.key === "danger") acc.danger += 1;

      if (clientId && clientId !== "—") {
        clientIds.add(clientId);
      }

      acc.clients = clientIds.size;

      return acc;
    },
    {
      total: 0,
      active: 0,
      pending: 0,
      inactive: 0,
      danger: 0,
      clients: 0,
    }
  );
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="ajustes-inline-loading">
      <span class="ajustes-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="ajustes-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderMetaPill(label = "", iconName = "settings") {
  return `
    <span class="ajustes-meta-pill">
      ${icon(iconName)}
      ${escapeHtml(label)}
    </span>
  `;
}

function renderStatCard({
  label = "",
  value = "",
  text = "",
  tone = "default",
} = {}) {
  return `
    <article class="ajustes-stat-card ajustes-stat-card--${escapeHtml(tone)}">
      <div class="ajustes-stat-label">${escapeHtml(label)}</div>
      <div class="ajustes-stat-value">${escapeHtml(value)}</div>
      <div class="ajustes-stat-text">${escapeHtml(text)}</div>
    </article>
  `;
}

function renderStatusChip(item = {}) {
  const status = getAjusteStatus(item);

  return `
    <span class="ajustes-chip ajustes-chip--${escapeHtml(status.key)}">
      <span class="ajustes-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(status.label)}
    </span>
  `;
}

function renderActionButton({
  action = "detail",
  ajusteId = "",
  label = "Detalle",
  iconName = "eye",
  loading = false,
  disabled = false,
} = {}) {
  const finalDisabled = Boolean(disabled || loading);

  return `
    <button
      type="button"
      class="ajustes-action-btn${loading ? " is-loading" : ""}"
      data-ajustes-action="${escapeHtml(action)}"
      data-action="${escapeHtml(action)}"
      data-ajuste-id="${escapeHtml(ajusteId)}"
      ${finalDisabled ? 'disabled aria-disabled="true"' : ""}
      ${loading ? 'aria-busy="true"' : ""}
    >
      ${
        loading
          ? renderSpinner("Cargando...")
          : `
            <span class="ajustes-action-icon">${icon(iconName)}</span>
            <span class="ajustes-btn-text">${escapeHtml(label)}</span>
          `
      }
    </button>
  `;
}

function renderAjusteCard(item = {}, state = {}) {
  const runtime = safeObject(state);

  const ajusteId = getAjusteId(item);
  const title = getAjusteTitle(item);
  const description = truncate(getAjusteDescription(item), 150);
  const category = getAjusteCategory(item);
  const value = getAjusteValue(item);
  const clientName = getClienteName(item);
  const clientId = getClienteId(item);
  const updatedAt = getUpdatedAt(item);
  const status = getAjusteStatus(item);

  const openingId = safeText(
    first(
      runtime.openingAjusteId,
      runtime.detailAjusteId,
      runtime.loadingAjusteId
    ),
    ""
  );

  const savingId = safeText(
    first(
      runtime.savingAjusteId,
      runtime.updatingAjusteId
    ),
    ""
  );

  const isOpening = openingId && openingId === ajusteId;
  const isSaving = savingId && savingId === ajusteId;

  return `
    <article
      class="ajustes-card ajustes-card--${escapeHtml(status.key)}"
      data-ajuste-card="true"
      data-ajuste-id="${escapeHtml(ajusteId)}"
      data-cliente-id="${escapeHtml(clientId)}"
    >
      <div class="ajustes-card-head">
        <div class="ajustes-card-icon" aria-hidden="true">
          ${icon("settings")}
        </div>

        <div class="ajustes-card-copy">
          <div class="ajustes-card-kicker">
            ${escapeHtml(category)}
          </div>

          <h3 class="ajustes-card-title">
            ${escapeHtml(title)}
          </h3>

          <p class="ajustes-card-text">
            ${escapeHtml(description)}
          </p>
        </div>

        <div class="ajustes-card-status">
          ${renderStatusChip(item)}
        </div>
      </div>

      <dl class="ajustes-card-meta">
        <div class="ajustes-card-meta-row">
          <dt>Cliente</dt>
          <dd>${escapeHtml(clientName)}</dd>
        </div>

        <div class="ajustes-card-meta-row">
          <dt>Cliente ID</dt>
          <dd>${escapeHtml(clientId)}</dd>
        </div>

        <div class="ajustes-card-meta-row">
          <dt>Valor</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>

        <div class="ajustes-card-meta-row">
          <dt>Actualización</dt>
          <dd>${escapeHtml(updatedAt ? formatRelativeDate(updatedAt) : "Sin fecha")}</dd>
        </div>
      </dl>

      <div class="ajustes-card-actions">
        ${renderActionButton({
          action: "detail",
          ajusteId,
          label: "Detalle",
          iconName: "eye",
          loading: Boolean(isOpening),
          disabled: Boolean(runtime.loading || runtime.refreshing),
        })}

        ${renderActionButton({
          action: "toggle",
          ajusteId,
          label: "Cambiar",
          iconName: "toggle",
          loading: Boolean(isSaving),
          disabled: Boolean(runtime.loading || runtime.refreshing),
        })}
      </div>
    </article>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const items = getResolvedItems(data);
  const stats = computeStats(items);

  const title = safeText(first(data.title, state.title, DEFAULT_TITLE), DEFAULT_TITLE);
  const subtitle = safeText(first(data.subtitle, state.subtitle, DEFAULT_SUBTITLE), DEFAULT_SUBTITLE);

  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const loading = Boolean(first(state.loading, data.loading));
  const saving = Boolean(first(state.saving, data.saving));

  const updatedAt = first(
    data.lastUpdatedAt,
    data.updatedAt,
    state.lastSyncAt,
    state.lastUpdatedAt,
    state.updatedAt,
    ...items.map((item) => getUpdatedAt(item))
  );

  return `
    <section class="ajustes-hero" data-ajustes-header="true">
      <div class="ajustes-hero-top">
        <div class="ajustes-hero-copy">
          <span class="ajustes-eyebrow">
            ${icon("settings")}
            Configuración
          </span>

          <h1 class="ajustes-page-title">
            ${escapeHtml(title)}
          </h1>

          <p class="ajustes-page-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        <div class="ajustes-hero-actions">
          <button
            type="button"
            id="ajustes-refresh-btn"
            class="ajustes-btn${refreshing ? " is-loading" : ""}"
            data-ajustes-action="refresh"
            data-action="refresh-ajustes"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="ajustes-btn-text">Actualizar</span>`
            }
          </button>

          <button
            type="button"
            id="ajustes-save-btn"
            class="ajustes-btn ajustes-btn--primary${saving ? " is-loading" : ""}"
            data-ajustes-action="save"
            data-action="save-ajustes"
            ${saving || loading || refreshing ? 'disabled aria-busy="true"' : ""}
          >
            ${
              saving
                ? renderSpinner("Guardando...")
                : `${icon("save")}<span class="ajustes-btn-text">Guardar cambios</span>`
            }
          </button>
        </div>
      </div>

      <div class="ajustes-hero-meta">
        ${renderMetaPill(`${stats.total} ajustes`, "settings")}
        ${renderMetaPill(`${stats.clients} clientes`, "client")}
        ${renderMetaPill(`${stats.active} activos`, "shield")}
        ${renderMetaPill(updatedAt ? `Sync · ${formatRelativeDate(updatedAt)}` : "Sin sincronización", "clock")}
      </div>

      <div class="ajustes-stats">
        ${renderStatCard({
          label: "Ajustes visibles",
          value: String(stats.total),
          text: "Configuraciones cargadas en la colección actual.",
          tone: "accent",
        })}

        ${renderStatCard({
          label: "Activos",
          value: String(stats.active),
          text: "Preferencias habilitadas o aplicadas.",
          tone: "success",
        })}

        ${renderStatCard({
          label: "Pendientes",
          value: String(stats.pending),
          text: "Ajustes pendientes de revisión o aplicación.",
          tone: "warning",
        })}

        ${renderStatCard({
          label: "Inactivos / error",
          value: `${stats.inactive} / ${stats.danger}`,
          text: "Configuraciones desactivadas o con incidencia.",
          tone: "danger",
        })}
      </div>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    <section class="ajustes-history ajustes-history--loading" aria-busy="true">
      <div class="ajustes-loading-grid">
        ${Array.from({ length: 6 })
          .map(
            () => `
              <article class="ajustes-skeleton-card">
                <div class="ajustes-skeleton ajustes-skeleton--icon"></div>
                <div class="ajustes-skeleton ajustes-skeleton--title"></div>
                <div class="ajustes-skeleton ajustes-skeleton--line"></div>
                <div class="ajustes-skeleton ajustes-skeleton--line-sm"></div>
                <div class="ajustes-skeleton ajustes-skeleton--control"></div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la colección.") {
  return `
    <section class="ajustes-state ajustes-state--error">
      <div class="ajustes-state-icon" aria-hidden="true">
        ${icon("alert")}
      </div>

      <h3 class="ajustes-state-title">
        No se pudieron cargar los ajustes
      </h3>

      <p class="ajustes-state-text">
        ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
      </p>

      <button
        type="button"
        id="ajustes-retry-btn"
        class="ajustes-btn ajustes-btn--primary"
        data-ajustes-action="retry"
        data-action="retry-ajustes"
      >
        ${icon("refresh")}
        <span class="ajustes-btn-text">Reintentar</span>
      </button>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="ajustes-state ajustes-state--empty">
      <div class="ajustes-state-icon" aria-hidden="true">
        ${icon("empty")}
      </div>

      <h3 class="ajustes-state-title">
        No hay ajustes
      </h3>

      <p class="ajustes-state-text">
        Cuando existan preferencias o configuraciones de cliente aparecerán aquí.
      </p>

      <button
        type="button"
        id="ajustes-refresh-empty-btn"
        class="ajustes-btn ajustes-btn--primary"
        data-ajustes-action="refresh"
        data-action="refresh-ajustes"
      >
        ${icon("refresh")}
        <span class="ajustes-btn-text">Actualizar ajustes</span>
      </button>
    </section>
  `;
}

/* =========================================================
   MAIN CONTENT
========================================================= */

export function renderTable(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const items = getResolvedItems(data);

  const loading = Boolean(first(state.loading, data.loading));
  const refreshing = Boolean(first(state.refreshing, data.refreshing));
  const error = safeText(first(state.error, data.error), "");

  if (loading && !items.length) {
    return renderLoadingState();
  }

  if (error && !items.length) {
    return renderErrorState(error);
  }

  if (!items.length) {
    return renderEmptyState();
  }

  return `
    <section class="ajustes-history" data-ajustes-history="true">
      <div class="ajustes-history-head">
        <div class="ajustes-history-copy">
          <h2 class="ajustes-history-title">
            Ajustes de cliente
          </h2>

          <p class="ajustes-history-subtitle">
            ${escapeHtml(`${items.length} configuraciones visibles · ${refreshing ? "actualizando" : "sincronizado"}`)}
          </p>
        </div>
      </div>

      <div class="ajustes-grid${refreshing ? " is-refreshing" : ""}">
        ${
          refreshing
            ? `
              <div class="ajustes-refresh-overlay" aria-live="polite" aria-busy="true">
                <div class="ajustes-refresh-card">
                  ${renderSpinner("Actualizando ajustes...")}
                </div>
              </div>
            `
            : ""
        }

        ${items.map((item) => renderAjusteCard(item, state)).join("")}
      </div>
    </section>
  `;
}

export function renderCards(input = {}) {
  return renderTable(input);
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderAjustesTableTemplate(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  const payload = {
    ...data,
    items,
    state,
  };

  return `
    <section class="ajustes-view-root" data-ajustes-scope="true">
      ${renderHeader(payload)}
      ${renderTable(payload)}
    </section>
  `;
}

export function renderAjustesTemplate(input = {}) {
  return renderAjustesTableTemplate(input);
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  renderHeader,
  renderLoadingState,
  renderErrorState,
  renderEmptyState,
  renderTable,
  renderCards,
  renderAjustesTableTemplate,
  renderAjustesTemplate,
};
