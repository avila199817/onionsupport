/* =========================================================
   Onion SPA - Home Dashboard Template
   Archivo: src/views/home/home.template.js

   FINAL EXTREME PRODUCTION TEMPLATE · HOME VIEW · USER + ADMIN + SUPPORT
   APPLE SAAS MODE · FACTURAS/INCIDENCIAS INSPIRED · 14/10

   PATCH · TEMPLATE CLEAN
   PATCH · CSS EXTERNALIZED
   PATCH · NO STYLE TAGS
   PATCH · NO INLINE CSS
   PATCH · SELECTORS MOVED TO home.selectors.js
   PATCH · HTML ONLY OWNER
   PATCH · SUMMARY/WIDGETS/COUNTERS FIXED THROUGH SELECTORS
   PATCH · CREATE ACTION DOES NOT COLLIDE WITH NAVIGATE
   PATCH · ACTION ALIASES COMPATIBLE WITH homeView.js + home.bindings.js
   PATCH · AVATAR FALLBACK CSP SAFE
   PATCH · EXTREME EMPTY/LOADING/REFRESH STATES
   PATCH · FULL DATA ATTR CONTRACT FOR BRIDGES
   PATCH · MODULAR BACKEND READY WITHOUT /api/dashboard/*
   PATCH · USERS UI ONLY FOR REAL ADMIN ROLE

   Responsabilidades:
   - Render del home/dashboard para usuarios, soporte y administradores.
   - Una única plantilla role-aware.
   - Consumir datos normalizados desde home.selectors.js.
   - NO hacer fetch.
   - NO calcular normalización pesada dentro del template.
   - NO inyectar CSS desde JS.
   - NO usar estilos inline.
   - Pintar hero, stats, widgets, acciones rápidas, actividad, facturas y tabla.
   - Compatible con HomeView.js o render directo desde Router.
   - Acciones compatibles con data-home-action y data-action.
   - CSP friendly: sin handlers inline tipo onerror.
========================================================= */

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_CURRENCY,
  HOME_ROUTES,

  safeText,
  safeNumber,
  safeArray,
  safeObject,
  first,
  isSameIdentity,
  normalizeRoute,
  normalizeKey,

  formatNumber,
  formatMoney,
  formatDateTime,
  formatRelativeDate,
  formatLastUpdate,

  getInitials,

  getDashboard,
  getWidgets,
  getCollections,
  computeHomeStats,
  getStatCards,
  getQuickActions,

  getUser,
  getRole,
  isAdminRole,
  isSupportRole,
  canSeeUsersModule,
  getDisplayName,
  getAvatarUrl,

  getTicketId,
  getTicketSubject,
  getTicketDescription,
  getTicketOwnerName,
  getTicketOwnerEmail,
  getTicketAvatarUrl,
  getTicketStatus,
  getTicketStatusKey,
  getTicketStatusLabel,
  getTicketPriorityKey,
  getTicketPriorityLabel,
  getTicketCategory,
  getTicketAssignedTo,
  getTicketCreatedAt,
  getTicketUpdatedAt,
  getTicketAttachmentsCount,

  getInvoiceId,
  getInvoiceAmount,
  getInvoiceCurrency,
  getInvoiceStatusKey,

  getWidgetId,
  getWidgetTitle,
  getWidgetText,
  getWidgetValue,
  getWidgetTrend,
  getWidgetType,
  getWidgetRoute,

  getActivity,
  getActivityTitle,
  getActivityText,
  getActivityDate,
  getActivityType,

  getPagination,
} from "./home.selectors.js";

/* =========================================================
   TEMPLATE CONSTANTS
========================================================= */

export const TEMPLATE_VERSION = "14.0.0";

const HOME_DATA_SCOPE = "home-dashboard";

const ACTIONS = Object.freeze({
  REFRESH: "refresh",
  RETRY: "retry",

  CREATE_INCIDENCIA: "create_incidencia",

  OPEN_WIDGET: "open_widget",

  NAVIGATE: "navigate_home",

  COPY_ID: "copy_widget_id",

  PREV_PAGE: "prev_page",
  NEXT_PAGE: "next_page",
  GO_PAGE: "page",
});

const STATUS_ORDER = Object.freeze([
  "pending",
  "open",
  "progress",
  "resolved",
  "closed",
]);

const WIDGET_LIMIT = 4;
const ACTIVITY_LIMIT = 8;
const INVOICE_LIMIT = 5;
const CLIENT_LIMIT = 5;
const USER_LIMIT = 5;

/* =========================================================
   TEMPLATE SAFE HELPERS
========================================================= */

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(safeText(value, ""));
}

function boolAttr(condition, text) {
  return condition ? text : "";
}

function joinClasses(...values) {
  return values
    .flat(Infinity)
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function datasetJson(value = {}) {
  try {
    return escapeHtml(JSON.stringify(value));
  } catch {
    return "{}";
  }
}

function getState(input = {}) {
  return safeObject(input.state);
}

function getLoadingState(input = {}) {
  const state = getState(input);

  return {
    loading: Boolean(state.loading || input.loading),
    refreshing: Boolean(state.refreshing || input.refreshing),
    creating: Boolean(state.creating || input.creating),
    loaded: Boolean(state.loaded || input.loaded),
    hydrated: Boolean(state.hydrated || input.hydrated),
    error: safeText(first(state.error, input.error), ""),
    openingTicketId: safeText(state.openingTicketId, ""),
    selectedTicketId: safeText(state.selectedTicketId, ""),
    navigatingAction: safeText(state.navigatingAction, ""),
  };
}

function getTemplateMeta(input = {}) {
  const data = safeObject(input);
  const state = getState(data);
  const dashboard = getDashboard(data);

  return {
    version: TEMPLATE_VERSION,
    requestId: safeText(
      first(
        data.requestId,
        state.requestId,
        dashboard.requestId,
        dashboard.meta?.requestId
      ),
      ""
    ),
    lastUpdatedAt: first(
      data.lastUpdatedAt,
      data.lastSyncAt,
      state.lastUpdatedAt,
      state.lastSyncAt,
      dashboard.updatedAt,
      dashboard.generatedAt,
      dashboard.lastSyncAt,
      dashboard.meta?.updatedAt
    ),
    partial: Boolean(first(dashboard.partial, data.partial, false)),
    errorsCount: safeArray(first(dashboard.errors, data.errors, [])).length,
  };
}

function renderSrOnly(text = "") {
  const label = safeText(text, "");

  if (!label) {
    return "";
  }

  return `<span class="sr-only">${escapeHtml(label)}</span>`;
}

function renderSoftLabel(value = "", fallback = "—") {
  return escapeHtml(safeText(value, fallback));
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    home: `<svg ${common}><path d="m3 10.5 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    invoice: `<svg ${common}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    client: `<svg ${common}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M9 17h.01"/></svg>`,
    account: `<svg ${common}><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,
    settings: `<svg ${common}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    arrowRight: `<svg ${common}><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>`,
    arrowLeft: `<svg ${common}><path d="M19 12H5"/><path d="m11 19-7-7 7-7"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.48 17.01 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
    spark: `<svg ${common}><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 21l-1.9-7.8L4 11l6.1-2.2Z"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    copy: `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    dots: `<svg ${common}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
    check: `<svg ${common}><path d="M20 6 9 17l-5-5"/></svg>`,
    x: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    chevronRight: `<svg ${common}><path d="m9 18 6-6-6-6"/></svg>`,
    chevronLeft: `<svg ${common}><path d="m15 18-6-6 6-6"/></svg>`,
    download: `<svg ${common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`,
  };

  return icons[name] || icons.activity;
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="home-inline-loading" role="status" aria-label="${attr(label || "Cargando")}">
      <span class="home-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="home-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="home-loader-only"
      role="status"
      aria-label="${attr(label)}"
      data-tooltip="${attr(label)}"
    >
      <span class="home-inline-spinner" aria-hidden="true"></span>
      ${renderSrOnly(label)}
    </span>
  `;
}

function renderUserAvatar(input = {}) {
  const user = getUser(input);
  const fullName = getDisplayName(input);
  const initials = getInitials(fullName);
  const avatarUrl = getAvatarUrl(input);

  const seed = safeText(
    first(user.userId, user.id, user.email, user.username, user.phone, fullName, "home-user"),
    "home-user"
  );

  return `
    <div
      class="${joinClasses("home-user-avatar", avatarUrl ? "" : "home-user-avatar--fallback")}"
      aria-label="${attr(fullName)}"
      data-tooltip="${attr(fullName)}"
      data-avatar-root="true"
      data-avatar-kind="user"
      data-avatar-seed="${attr(seed)}"
      data-avatar-initials="${attr(initials)}"
      ${boolAttr(!avatarUrl, 'data-fallback="true"')}
    >
      <span class="home-user-avatar-fallback" aria-hidden="true">${escapeHtml(initials)}</span>
      ${
        avatarUrl
          ? `
            <img
              class="home-user-avatar-img"
              src="${attr(avatarUrl)}"
              alt="${attr(fullName)}"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
              data-avatar-image="true"
            >
          `
          : ""
      }
    </div>
  `;
}

function renderTicketAvatar(item = {}) {
  const fullName = getTicketOwnerName(item);
  const initials = getInitials(fullName);
  const avatarUrl = getTicketAvatarUrl(item);
  const seed = safeText(`${getTicketId(item)}|${fullName}`, "home-ticket");

  return `
    <div
      class="${joinClasses("home-ticket-avatar", avatarUrl ? "" : "home-ticket-avatar--fallback")}"
      aria-label="${attr(fullName)}"
      data-tooltip="${attr(fullName)}"
      data-avatar-root="true"
      data-avatar-kind="ticket"
      data-avatar-seed="${attr(seed)}"
      data-avatar-initials="${attr(initials)}"
      ${boolAttr(!avatarUrl, 'data-fallback="true"')}
    >
      <span class="home-ticket-avatar-fallback" aria-hidden="true">${escapeHtml(initials)}</span>
      ${
        avatarUrl
          ? `
            <img
              class="home-ticket-avatar-img"
              src="${attr(avatarUrl)}"
              alt="${attr(fullName)}"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
              data-avatar-image="true"
            >
          `
          : ""
      }
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = getTicketStatus(item);
  const key = getTicketStatusKey(rawStatus);
  const label = getTicketStatusLabel(rawStatus);

  return `
    <span class="home-chip home-chip--${attr(key)}" data-status-key="${attr(key)}">
      <span class="home-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderPriorityBadge(item = {}) {
  const key = getTicketPriorityKey(item);
  const label = getTicketPriorityLabel(item);
  const urgent = key === "critical" || key === "urgent";

  return `
    <span
      class="home-mini-badge home-mini-badge--${attr(key)}"
      data-tooltip="${attr(`Prioridad ${label}`)}"
      data-priority-key="${attr(key)}"
    >
      ${urgent ? icon("alert") : icon("activity")}
      ${escapeHtml(label)}
    </span>
  `;
}

function renderCategoryBadge(item = {}) {
  const category = getTicketCategory(item);

  return `
    <span
      class="home-mini-badge home-mini-badge--category"
      data-tooltip="${attr(category)}"
    >
      ${escapeHtml(category)}
    </span>
  `;
}

function renderAssignedBadge(item = {}) {
  const assigned = getTicketAssignedTo(item);

  return `
    <span
      class="home-mini-badge home-mini-badge--agent"
      data-tooltip="${attr(`Técnico · ${assigned}`)}"
    >
      ${icon("users")}
      ${escapeHtml(assigned)}
    </span>
  `;
}

function renderMetricMiniList(stats = {}) {
  const items = [
    {
      label: "Abiertas",
      value: stats.openTickets,
      modifier: "open",
    },
    {
      label: "Cerradas",
      value: stats.closedTickets,
      modifier: "closed",
    },
    {
      label: "Urgentes",
      value: stats.urgentTickets,
      modifier: "urgent",
    },
    {
      label: "Salud",
      value: `${Math.round(safeNumber(stats.healthRatio, 100))}%`,
      modifier: "health",
    },
  ];

  return `
    <div class="home-hero-minimetrics" aria-label="Métricas rápidas">
      ${items
        .map(
          (item) => `
            <span class="home-minimetric home-minimetric--${attr(item.modifier)}">
              <strong>${escapeHtml(String(item.value))}</strong>
              <span>${escapeHtml(item.label)}</span>
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStatCard(card = {}, index = 0) {
  const value = safeText(card.value, "0");
  const iconName = safeText(card.iconName, "activity");
  const modifier = normalizeKey(card.modifier || iconName || `stat-${index + 1}`);
  const label = safeText(card.label, "Métrica");
  const text = safeText(card.text, "");

  return `
    <article
      class="home-stat-card home-stat-card--${attr(modifier)}"
      data-home-stat-card="true"
      data-stat-index="${attr(index + 1)}"
      data-stat-modifier="${attr(modifier)}"
    >
      <div class="home-stat-topline">
        <div class="home-stat-icon" aria-hidden="true">
          ${icon(iconName)}
        </div>

        ${
          card.badge
            ? `<span class="home-stat-badge">${escapeHtml(card.badge)}</span>`
            : ""
        }
      </div>

      <div class="home-stat-label">${escapeHtml(label)}</div>

      <div class="home-stat-value" data-stat-value="${attr(value)}">
        ${escapeHtml(value)}
      </div>

      ${text ? `<div class="home-stat-text">${escapeHtml(text)}</div>` : ""}
    </article>
  `;
}

function normalizeQuickAction(action = {}) {
  const actionName = safeText(action.action, "");
  const normalizedAction = normalizeKey(actionName);

  const isCreate =
    normalizedAction === ACTIONS.CREATE_INCIDENCIA ||
    normalizedAction === "create" ||
    normalizedAction === "new" ||
    normalizedAction === "new_ticket" ||
    normalizedAction === "create_ticket" ||
    normalizedAction === "create_incidencia";

  const finalAction = isCreate
    ? ACTIONS.CREATE_INCIDENCIA
    : actionName || ACTIONS.NAVIGATE;

  const dataAction = isCreate
    ? ACTIONS.CREATE_INCIDENCIA
    : safeText(action.dataAction || ACTIONS.NAVIGATE, ACTIONS.NAVIGATE);

  const route = isCreate
    ? (
        normalizeRoute(action.route || "") === HOME_ROUTES.INCIDENCIAS
          ? "/incidencias/nueva"
          : normalizeRoute(action.route || "/incidencias/nueva")
      )
    : normalizeRoute(action.route || "");

  return {
    ...safeObject(action),
    action: finalAction,
    dataAction,
    route,
    modifier: normalizeKey(action.modifier || finalAction || "default"),
  };
}

function renderQuickAction(action = {}, state = {}) {
  const item = normalizeQuickAction(action);

  const navigatingAction = safeText(state.navigatingAction, "");
  const creating = Boolean(state.creating);
  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);

  const actionName = item.action;
  const dataAction = item.dataAction;
  const route = item.route;
  const modifier = item.modifier;

  const isCreate = normalizeKey(actionName) === ACTIONS.CREATE_INCIDENCIA;

  const isBusy =
    navigatingAction === actionName ||
    navigatingAction === dataAction ||
    (isCreate && creating);

  const disabled = Boolean(isBusy || loading || refreshing);

  return `
    <button
      type="button"
      class="${joinClasses("home-action-card", `home-action-card--${modifier}`, isBusy ? "is-loading" : "")}"
      data-home-action="${attr(actionName)}"
      data-action="${attr(dataAction)}"
      data-quick-action="${attr(actionName)}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-payload="${datasetJson({ action: actionName, route })}"
      ${boolAttr(disabled, 'disabled aria-busy="true"')}
    >
      <span class="home-action-card-icon" aria-hidden="true">
        ${icon(item.iconName || (isCreate ? "plus" : "arrowRight"))}
      </span>

      <span class="home-action-card-kicker">
        ${escapeHtml(route || "Onion Support")}
      </span>

      <strong class="home-action-card-title">
        ${
          isBusy
            ? renderSpinner(isCreate ? "Abriendo..." : "Navegando...")
            : escapeHtml(item.title || "Acción")
        }
      </strong>

      <span class="home-action-card-text">${escapeHtml(item.text || "")}</span>

      <span class="home-action-card-arrow" aria-hidden="true">
        ${icon(isCreate ? "plus" : "arrowRight")}
      </span>
    </button>
  `;
}

function renderWidgetCard(widget = {}, index = 0) {
  const id = getWidgetId(widget) || `widget-${index + 1}`;
  const type = getWidgetType(widget);
  const title = getWidgetTitle(widget);
  const text = getWidgetText(widget);
  const value = getWidgetValue(widget);
  const trend = getWidgetTrend(widget);
  const route = getWidgetRoute(widget);
  const status = safeText(first(widget.status, widget.estado, widget.state), "active");

  const action = route ? ACTIONS.NAVIGATE : ACTIONS.OPEN_WIDGET;
  const modifier = normalizeKey(type || "widget");

  return `
    <button
      type="button"
      class="home-widget-card home-widget-card--${attr(modifier)}"
      data-home-action="${attr(action)}"
      data-action="${attr(action)}"
      data-widget-id="${attr(id)}"
      data-widget-key="${attr(id)}"
      data-widget-type="${attr(type)}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-status="${attr(status)}"
      data-payload="${datasetJson({ widgetId: id, type, route })}"
    >
      <span class="home-widget-glow" aria-hidden="true"></span>

      <span class="home-widget-head">
        <span class="home-widget-kicker">${escapeHtml(type || "widget")}</span>
        <span class="home-widget-icon" aria-hidden="true">
          ${
            modifier.includes("factur") || modifier.includes("billing") || modifier.includes("invoice")
              ? icon("invoice")
              : modifier.includes("user") || modifier.includes("usuario")
                ? icon("users")
                : modifier.includes("client") || modifier.includes("cliente")
                  ? icon("client")
                  : icon("activity")
          }
        </span>
      </span>

      <strong class="home-widget-value">${escapeHtml(String(value ?? "—"))}</strong>
      <span class="home-widget-title">${escapeHtml(title)}</span>
      ${text ? `<span class="home-widget-text">${escapeHtml(text)}</span>` : ""}
      ${
        trend
          ? `<span class="home-widget-trend">${escapeHtml(String(trend))}</span>`
          : ""
      }
    </button>
  `;
}

function renderTicketRow(item = {}, state = {}) {
  const ticketId = getTicketId(item);
  const subject = getTicketSubject(item);
  const description = getTicketDescription(item);
  const updatedAtRaw = getTicketUpdatedAt(item);
  const createdAtRaw = getTicketCreatedAt(item);
  const updatedAt = formatLastUpdate(updatedAtRaw);
  const createdAt = formatDateTime(createdAtRaw);
  const ownerName = getTicketOwnerName(item);
  const ownerEmail = getTicketOwnerEmail(item) || "Sin email";
  const attachmentsCount = getTicketAttachmentsCount(item);
  const statusKey = getTicketStatusKey(getTicketStatus(item));
  const priorityKey = getTicketPriorityKey(item);

  const openingTicketId = safeText(state.openingTicketId, "");
  const selectedTicketId = safeText(state.selectedTicketId, "");
  const isOpening = isSameIdentity(openingTicketId, ticketId);
  const isSelected = isSameIdentity(selectedTicketId, ticketId);

  return `
    <tr
      class="${joinClasses(
        "home-ticket-row",
        `home-ticket-row--${statusKey}`,
        `home-ticket-row--priority-${priorityKey}`,
        isOpening ? "is-opening" : "",
        isSelected ? "is-selected" : ""
      )}"
      data-ticket-row="true"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      data-entity-id="${attr(ticketId)}"
      data-status-key="${attr(statusKey)}"
      data-priority-key="${attr(priorityKey)}"
    >
      <td class="home-ticket-cell home-ticket-cell--main">
        <div class="home-ticket-main">
          ${renderTicketAvatar(item)}

          <div class="home-ticket-copy">
            <div class="home-ticket-line">
              <button
                type="button"
                class="home-ticket-id"
                data-home-action="${ACTIONS.COPY_ID}"
                data-action="${ACTIONS.COPY_ID}"
                data-widget-id="${attr(ticketId)}"
                data-widget-key="${attr(ticketId)}"
                data-entity-id="${attr(ticketId)}"
                aria-label="Copiar ID de incidencia ${attr(ticketId)}"
                data-tooltip="Copiar ID de incidencia"
              >
                ${escapeHtml(ticketId)}
              </button>

              ${renderCategoryBadge(item)}
            </div>

            <button
              type="button"
              class="home-ticket-subject"
              data-home-action="${ACTIONS.NAVIGATE}"
              data-action="${ACTIONS.NAVIGATE}"
              data-ticket-id="${attr(ticketId)}"
              data-entity-id="${attr(ticketId)}"
              data-route="${attr(HOME_ROUTES.INCIDENCIAS)}"
              data-href="${attr(HOME_ROUTES.INCIDENCIAS)}"
              data-payload="${datasetJson({ ticketId, incidenciaId: ticketId })}"
              aria-label="Abrir incidencia ${attr(ticketId)}"
              data-tooltip="${attr(subject)}"
            >
              ${escapeHtml(subject)}
            </button>

            <div class="home-ticket-description">${escapeHtml(description)}</div>

            <div class="home-ticket-badges">
              ${renderPriorityBadge(item)}
              ${renderAssignedBadge(item)}
            </div>
          </div>
        </div>
      </td>

      <td class="home-ticket-cell home-ticket-cell--owner">
        <span
          class="home-ticket-owner"
          data-tooltip="${attr(`${ownerName} · ${ownerEmail}`)}"
        >
          <strong>${escapeHtml(ownerName)}</strong>
          <span>${escapeHtml(ownerEmail)}</span>
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span
          class="home-date-inline"
          data-tooltip="${attr(createdAt)}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span
          class="home-date-inline"
          data-tooltip="${attr(formatDateTime(updatedAtRaw))}"
        >
          ${escapeHtml(updatedAt)}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--attachments">
        <span
          class="home-attachments-pill"
          data-tooltip="${attr(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
        >
          ${icon("paperclip")}
          ${escapeHtml(String(attachmentsCount))}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--actions">
        <button
          type="button"
          class="${joinClasses("home-detail-btn", isOpening ? "is-loading" : "")}"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-ticket-id="${attr(ticketId)}"
          data-incidencia-id="${attr(ticketId)}"
          data-entity-id="${attr(ticketId)}"
          data-route="${attr(HOME_ROUTES.INCIDENCIAS)}"
          data-href="${attr(HOME_ROUTES.INCIDENCIAS)}"
          data-payload="${datasetJson({ ticketId, incidenciaId: ticketId })}"
          aria-label="Abrir detalle de incidencia ${attr(ticketId)}"
          data-tooltip="Abrir detalle de incidencia"
          ${boolAttr(isOpening, 'disabled aria-busy="true"')}
        >
          ${
            isOpening
              ? renderLoaderOnly("Cargando detalle")
              : `
                <span class="home-detail-icon" aria-hidden="true">${icon("eye")}</span>
                <span class="home-btn-text">Detalle</span>
              `
          }
        </button>
      </td>
    </tr>
  `;
}

function renderActivityItem(item = {}) {
  const type = getActivityType(item);
  const title = getActivityTitle(item);
  const text = getActivityText(item);
  const date = getActivityDate(item);

  const route = normalizeRoute(first(item.route, item.href, item.link, item.raw?.route, ""));
  const entityId = safeText(
    first(
      item.entityId,
      item.id,
      item.ticketId,
      item.incidenciaId,
      item.facturaId,
      item.invoiceId,
      item.raw?.entityId,
      item.raw?.ticketId,
      item.raw?.incidenciaId,
      item.raw?.facturaId,
      item.raw?.invoiceId
    ),
    ""
  );

  const finalRoute =
    route ||
    (type === "ticket"
      ? HOME_ROUTES.INCIDENCIAS
      : type === "invoice"
        ? HOME_ROUTES.FACTURAS
        : type === "client"
          ? HOME_ROUTES.CLIENTES
          : type === "user"
            ? HOME_ROUTES.USUARIOS
            : HOME_ROUTES.HOME);

  return `
    <button
      type="button"
      class="home-activity-item home-activity-item--${attr(type || "activity")}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(finalRoute)}"
      data-href="${attr(finalRoute)}"
      data-entity-id="${attr(entityId)}"
      data-ticket-id="${type === "ticket" ? attr(entityId) : ""}"
      data-invoice-id="${type === "invoice" ? attr(entityId) : ""}"
      data-factura-id="${type === "invoice" ? attr(entityId) : ""}"
      data-payload="${datasetJson({ type, route: finalRoute, entityId })}"
    >
      <span class="home-activity-icon" aria-hidden="true">
        ${
          type === "invoice"
            ? icon("invoice")
            : type === "client"
              ? icon("client")
              : type === "user"
                ? icon("users")
                : type === "ticket"
                  ? icon("ticket")
                  : icon("activity")
        }
      </span>

      <span class="home-activity-copy">
        <strong class="home-activity-title">${escapeHtml(title)}</strong>
        <span class="home-activity-text">${escapeHtml(text)}</span>
      </span>

      <span
        class="home-activity-time"
        data-tooltip="${attr(formatDateTime(date))}"
      >
        ${escapeHtml(formatRelativeDate(date))}
      </span>
    </button>
  `;
}

function renderInvoicePreviewItem(item = {}) {
  const id = getInvoiceId(item);
  const amount = getInvoiceAmount(item);
  const currency = getInvoiceCurrency(item);
  const status = getInvoiceStatusKey(item);

  return `
    <button
      type="button"
      class="home-invoice-mini home-invoice-mini--${attr(status)}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-invoice-id="${attr(id)}"
      data-factura-id="${attr(id)}"
      data-entity-id="${attr(id)}"
      data-route="${attr(HOME_ROUTES.FACTURAS)}"
      data-href="${attr(HOME_ROUTES.FACTURAS)}"
      data-payload="${datasetJson({ invoiceId: id, facturaId: id })}"
    >
      <span class="home-invoice-mini-icon" aria-hidden="true">${icon("invoice")}</span>

      <span class="home-invoice-mini-copy">
        <strong>${escapeHtml(id)}</strong>
        <span>${escapeHtml(formatMoney(amount, currency || DEFAULT_CURRENCY))}</span>
      </span>

      <span class="home-invoice-mini-status">${escapeHtml(status)}</span>
    </button>
  `;
}

function getClientDisplayName(item = {}) {
  return safeText(
    first(
      item.name,
      item.nombre,
      item.displayName,
      item.razonSocial,
      item.company,
      item.nombreContacto,
      item.email,
      item.raw?.name,
      item.raw?.nombre,
      item.raw?.displayName,
      item.raw?.razonSocial,
      item.raw?.company,
      item.raw?.nombreContacto,
      item.raw?.email
    ),
    "Cliente"
  );
}

function getUserDisplayName(item = {}) {
  return safeText(
    first(
      item.displayName,
      item.fullName,
      item.name,
      item.nombre,
      item.username,
      item.email,
      item.raw?.displayName,
      item.raw?.fullName,
      item.raw?.name,
      item.raw?.nombre,
      item.raw?.username,
      item.raw?.email
    ),
    "Usuario"
  );
}

function renderMiniEntityItem(item = {}, type = "client") {
  const isUser = type === "user";
  const label = isUser ? getUserDisplayName(item) : getClientDisplayName(item);

  const email = safeText(
    first(
      item.email,
      item.mail,
      item.raw?.email,
      item.raw?.mail
    ),
    "Sin email"
  );

  const entityId = safeText(
    first(
      item.userId,
      item.usuarioId,
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item._id,
      item.raw?.userId,
      item.raw?.usuarioId,
      item.raw?.clienteId,
      item.raw?.clientId,
      item.raw?.customerId,
      item.raw?.id,
      item.raw?._id
    ),
    ""
  );

  const route = isUser ? HOME_ROUTES.USUARIOS : HOME_ROUTES.CLIENTES;

  return `
    <button
      type="button"
      class="home-entity-mini home-entity-mini--${isUser ? "user" : "client"}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-entity-id="${attr(entityId)}"
      data-payload="${datasetJson({ type, entityId })}"
    >
      <span class="home-entity-mini-avatar" data-avatar-seed="${attr(label)}" aria-hidden="true">
        ${escapeHtml(getInitials(label))}
      </span>

      <span class="home-entity-mini-copy">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(email)}</span>
      </span>

      <span class="home-entity-mini-arrow" aria-hidden="true">
        ${icon("chevronRight")}
      </span>
    </button>
  `;
}

function renderEmptyState({
  title = "",
  text = "",
  action = "",
  actionLabel = "",
  iconName = "spark",
} = {}) {
  return `
    <div class="home-empty">
      <div class="home-empty-icon" aria-hidden="true">
        ${icon(iconName)}
      </div>

      <h3 class="home-empty-title">${escapeHtml(title || "No hay datos para mostrar")}</h3>
      <p class="home-empty-text">${escapeHtml(text || "Cuando haya información disponible aparecerá aquí.")}</p>

      ${
        action
          ? `
            <button
              type="button"
              class="home-btn home-btn--primary"
              id="${action === ACTIONS.RETRY ? "home-retry-btn" : ""}"
              data-home-action="${attr(action)}"
              data-action="${attr(action)}"
            >
              ${escapeHtml(actionLabel || "Continuar")}
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderTableLoading(rows = DEFAULT_PAGE_SIZE) {
  const count = Math.max(1, safeNumber(rows, DEFAULT_PAGE_SIZE));

  return `
    <div class="home-table-loading" aria-hidden="true">
      ${Array.from({ length: count })
        .map(
          () => `
            <div class="home-table-loading-row">
              <div class="home-skeleton home-skeleton--avatar"></div>

              <div class="home-table-loading-copy">
                <div class="home-skeleton home-skeleton--xs"></div>
                <div class="home-skeleton home-skeleton--lg"></div>
                <div class="home-skeleton home-skeleton--md"></div>
              </div>

              <div class="home-skeleton home-skeleton--owner"></div>
              <div class="home-skeleton home-skeleton--pill"></div>
              <div class="home-skeleton home-skeleton--date"></div>
              <div class="home-skeleton home-skeleton--date"></div>
              <div class="home-skeleton home-skeleton--attach"></div>
              <div class="home-skeleton home-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCardLoading(rows = 4) {
  const count = Math.max(1, safeNumber(rows, 4));

  return `
    <div class="home-cards-loading" aria-hidden="true">
      ${Array.from({ length: count })
        .map(
          () => `
            <div class="home-card-skeleton">
              <div class="home-skeleton home-skeleton--icon"></div>
              <div class="home-skeleton home-skeleton--xs"></div>
              <div class="home-skeleton home-skeleton--xl"></div>
              <div class="home-skeleton home-skeleton--md"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay(label = "Actualizando home...") {
  return `
    <div class="home-refresh-overlay" aria-live="polite">
      <div class="home-refresh-card">
        ${renderSpinner(label)}
      </div>
    </div>
  `;
}

function renderErrorBanner(message = "") {
  const text = safeText(message, "");

  if (!text) {
    return "";
  }

  return `
    <div class="home-error-banner" role="status" data-home-error-banner="true">
      <span class="home-error-banner-icon" aria-hidden="true">${icon("alert")}</span>
      <span class="home-error-banner-text">${escapeHtml(text)}</span>
      <button
        type="button"
        id="home-retry-btn"
        class="home-error-banner-action"
        data-home-action="${ACTIONS.RETRY}"
        data-action="${ACTIONS.RETRY}"
      >
        Reintentar
      </button>
    </div>
  `;
}

/* =========================================================
   HEADER / HERO
========================================================= */

export function renderHomeHeader(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const stats = computeHomeStats(data);
  const meta = getTemplateMeta(data);

  const displayName = getDisplayName(data);
  const role = getRole(data);
  const admin = isAdminRole(role);
  const support = isSupportRole(role);

  const roleLabel = admin ? "ADMIN" : support ? "SUPPORT" : "USER";

  const title = safeText(
    first(
      data.title,
      data.state?.title,
      admin
        ? "Centro de control Onion"
        : support
          ? "Panel operativo de soporte"
          : `Hola, ${displayName}`
    ),
    "Onion Support"
  );

  const subtitle = safeText(
    first(
      data.subtitle,
      data.state?.subtitle,
      admin
        ? "Resumen ejecutivo de incidencias, facturación, clientes y usuarios desde una vista clara, rápida y accionable."
        : support
          ? "Controla incidencias, clientes visibles y actividad operativa sin ruido."
          : "Consulta tus incidencias, revisa tu actividad reciente y accede rápidamente a las zonas principales de tu cuenta."
    ),
    ""
  );

  const primaryCreateDisabled = state.creating || state.loading || state.refreshing;

  return `
    <section
      class="home-hero home-hero--${admin ? "admin" : support ? "support" : "user"}"
      data-home-section="hero"
      data-home-role="${attr(role || "user")}"
    >
      <div class="home-hero-bg" aria-hidden="true">
        <span class="home-hero-orb home-hero-orb--one"></span>
        <span class="home-hero-orb home-hero-orb--two"></span>
        <span class="home-hero-orb home-hero-orb--three"></span>
      </div>

      <div class="home-hero-top">
        <div class="home-hero-main">
          ${renderUserAvatar(data)}

          <div class="home-hero-copy">
            <span class="home-page-kicker">
              ${icon(admin ? "shield" : support ? "activity" : "home")}
              ${escapeHtml(`Onion Support · ${roleLabel}`)}
            </span>

            <h1 class="home-page-title">${escapeHtml(title)}</h1>
            <p class="home-page-subtitle">${escapeHtml(subtitle)}</p>
          </div>
        </div>

        <div class="home-hero-actions">
          <button
            type="button"
            id="home-refresh-btn"
            class="${joinClasses("home-btn", state.refreshing ? "is-loading" : "")}"
            data-home-action="${ACTIONS.REFRESH}"
            data-action="${ACTIONS.REFRESH}"
            aria-label="Actualizar home"
            data-tooltip="Actualizar home"
            ${boolAttr(state.refreshing || state.loading, 'disabled aria-busy="true"')}
          >
            ${
              state.refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="home-btn-text">Actualizar</span>`
            }
          </button>

          <button
            type="button"
            id="home-export-btn"
            class="home-btn home-btn--ghost"
            data-home-action="export_csv"
            data-action="export_csv"
            data-export-mode="tickets"
            data-export-filename="home-incidencias.csv"
            aria-label="Exportar incidencias a CSV"
            data-tooltip="Exportar incidencias a CSV"
            ${boolAttr(state.loading || state.refreshing, "disabled")}
          >
            ${icon("download")}
            <span class="home-btn-text">Exportar</span>
          </button>

          ${
            admin
              ? `
                <button
                  type="button"
                  id="home-admin-users-btn"
                  class="home-btn home-btn--primary"
                  data-home-action="go_usuarios"
                  data-action="${ACTIONS.NAVIGATE}"
                  data-route="${attr(HOME_ROUTES.USUARIOS)}"
                  data-href="${attr(HOME_ROUTES.USUARIOS)}"
                  aria-label="Gestionar usuarios"
                  data-tooltip="Gestionar usuarios"
                  ${boolAttr(state.loading || state.refreshing, "disabled")}
                >
                  ${icon("users")}
                  <span class="home-btn-text">Usuarios</span>
                </button>
              `
              : `
                <button
                  type="button"
                  id="home-create-ticket-btn"
                  class="${joinClasses("home-btn home-btn--primary", state.creating ? "is-loading" : "")}"
                  data-home-action="${ACTIONS.CREATE_INCIDENCIA}"
                  data-action="${ACTIONS.CREATE_INCIDENCIA}"
                  data-quick-action="${ACTIONS.CREATE_INCIDENCIA}"
                  data-route="/incidencias/nueva"
                  data-href="/incidencias/nueva"
                  aria-label="Crear incidencia"
                  data-tooltip="Crear incidencia"
                  ${boolAttr(primaryCreateDisabled, 'disabled aria-busy="true"')}
                >
                  ${
                    state.creating
                      ? renderSpinner("Abriendo...")
                      : `${icon("plus")}<span class="home-btn-text">Crear incidencia</span>`
                  }
                </button>
              `
          }
        </div>
      </div>

      <div class="home-hero-meta">
        <span class="home-meta-pill">
          ${icon("ticket")}
          ${escapeHtml(`${formatNumber(stats.totalTickets)} incidencias`)}
        </span>

        <span class="home-meta-pill">
          ${icon("invoice")}
          ${escapeHtml(`${formatNumber(stats.pendingInvoices)} facturas pendientes`)}
        </span>

        <span class="home-meta-pill">
          ${icon("activity")}
          ${escapeHtml(`Salud · ${Math.round(safeNumber(stats.healthRatio, 100))}%`)}
        </span>

        <span class="home-meta-pill">
          ${icon("refresh")}
          ${
            meta.lastUpdatedAt
              ? escapeHtml(`Actualizado · ${formatRelativeDate(meta.lastUpdatedAt)}`)
              : "Sin sincronización reciente"
          }
        </span>

        ${
          meta.partial
            ? `
              <span class="home-meta-pill home-meta-pill--warning">
                ${icon("alert")}
                ${escapeHtml(`Resumen parcial · ${formatNumber(meta.errorsCount)} avisos`)}
              </span>
            `
            : ""
        }
      </div>

      ${renderMetricMiniList(stats)}

      <div class="home-stats" data-home-section="stats">
        ${getStatCards(data).map((card, index) => renderStatCard(card, index)).join("")}
      </div>
    </section>
  `;
}

/* =========================================================
   WIDGETS
========================================================= */

export function renderHomeWidgets(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const widgets = getWidgets(data).slice(0, WIDGET_LIMIT);

  return `
    <section class="home-widgets" aria-label="Widgets del dashboard" data-home-section="widgets">
      ${
        state.loading && !widgets.length
          ? renderCardLoading(WIDGET_LIMIT)
          : widgets.length
            ? widgets.map((widget, index) => renderWidgetCard(widget, index)).join("")
            : renderEmptyState({
                title: "Sin widgets disponibles",
                text: "El resumen se actualizará cuando haya métricas disponibles.",
                iconName: "spark",
              })
      }
    </section>
  `;
}

/* =========================================================
   QUICK ACTIONS
========================================================= */

export function renderHomeQuickActions(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const role = getRole(data);
  const admin = isAdminRole(role);
  const support = isSupportRole(role);
  const actions = getQuickActions(data);

  return `
    <section class="home-panel home-panel--actions" data-home-section="quick-actions">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">${escapeHtml(admin ? "Operación admin" : support ? "Operación soporte" : "Acciones")}</span>
          <h2 class="home-panel-title">Accesos rápidos</h2>
          <p class="home-panel-subtitle">
            ${escapeHtml(
              admin
                ? "Atajos principales para operar el panel administrativo."
                : support
                  ? "Atajos para operar soporte sin exponer gestión de usuarios."
                  : "Acciones principales para moverte por tu cuenta."
            )}
          </p>
        </div>
      </div>

      ${
        state.loading && !actions.length
          ? renderCardLoading(4)
          : `
            <div class="home-actions-grid">
              ${actions.map((action) => renderQuickAction(action, state)).join("")}
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   ACTIVITY
========================================================= */

export function renderHomeActivity(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);

  const activity = getActivity(data).slice(0, ACTIVITY_LIMIT);

  return `
    <section class="home-panel home-panel--activity" data-home-section="activity">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Timeline</span>
          <h2 class="home-panel-title">Actividad reciente</h2>
          <p class="home-panel-subtitle">
            ${
              state.loading && !activity.length
                ? "Cargando actividad..."
                : escapeHtml(`${formatNumber(activity.length)} movimientos recientes`)
            }
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(HOME_ROUTES.INCIDENCIAS)}"
          data-href="${attr(HOME_ROUTES.INCIDENCIAS)}"
        >
          Ver incidencias
          ${icon("arrowRight")}
        </button>
      </div>

      <div class="${joinClasses("home-table-wrap", state.refreshing ? "is-refreshing" : "")}">
        ${state.refreshing && activity.length ? renderRefreshOverlay("Actualizando actividad...") : ""}

        ${
          state.loading && !activity.length
            ? renderCardLoading(4)
            : activity.length
              ? `
                <div class="home-activity-list">
                  ${activity.map((item) => renderActivityItem(item)).join("")}
                </div>
              `
              : renderEmptyState({
                  title: "Sin actividad reciente",
                  text: "Cuando haya movimientos en incidencias, facturas, clientes o usuarios aparecerán aquí.",
                  iconName: "clock",
                })
        }
      </div>
    </section>
  `;
}

/* =========================================================
   INVOICE PREVIEW
========================================================= */

export function renderHomeInvoicePreview(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);
  const invoices = safeArray(collections.invoices).slice(0, INVOICE_LIMIT);

  return `
    <section class="home-panel home-panel--invoice-preview" data-home-section="invoice-preview">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Billing</span>
          <h2 class="home-panel-title">Facturación rápida</h2>
          <p class="home-panel-subtitle">
            ${
              state.loading && !invoices.length
                ? "Cargando facturas..."
                : escapeHtml(`${formatNumber(collections.invoicesRemoteCount || invoices.length)} facturas detectadas`)
            }
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(HOME_ROUTES.FACTURAS)}"
          data-href="${attr(HOME_ROUTES.FACTURAS)}"
        >
          Ver facturas
          ${icon("arrowRight")}
        </button>
      </div>

      ${
        state.loading && !invoices.length
          ? renderCardLoading(3)
          : invoices.length
            ? `
              <div class="home-invoice-mini-list">
                ${invoices.map((item) => renderInvoicePreviewItem(item)).join("")}
              </div>
            `
            : renderEmptyState({
                title: "Sin facturas visibles",
                text: "Cuando haya facturas disponibles aparecerán en este bloque.",
                iconName: "invoice",
              })
      }
    </section>
  `;
}

/* =========================================================
   ENTITIES PREVIEW
========================================================= */

export function renderHomeEntitiesPreview(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);
  const admin = isAdminRole(getRole(data));
  const support = isSupportRole(getRole(data));
  const showUsers = canSeeUsersModule(data);

  const clients = safeArray(collections.clients).slice(0, CLIENT_LIMIT);
  const users = showUsers ? safeArray(collections.users).slice(0, USER_LIMIT) : [];

  if (!admin && !support && !clients.length) {
    return "";
  }

  return `
    <section class="home-panel home-panel--entities" data-home-section="entities">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Directorio</span>
          <h2 class="home-panel-title">${showUsers ? "Clientes y usuarios" : "Clientes"}</h2>
          <p class="home-panel-subtitle">
            ${
              state.loading && !clients.length && !users.length
                ? "Cargando directorio..."
                : escapeHtml(
                    showUsers
                      ? `${formatNumber(collections.clientsRemoteCount || clients.length)} clientes · ${formatNumber(collections.usersRemoteCount || users.length)} usuarios`
                      : `${formatNumber(collections.clientsRemoteCount || clients.length)} clientes visibles`
                  )
            }
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(HOME_ROUTES.CLIENTES)}"
          data-href="${attr(HOME_ROUTES.CLIENTES)}"
        >
          Ver clientes
          ${icon("arrowRight")}
        </button>
      </div>

      ${
        state.loading && !clients.length && !users.length
          ? renderCardLoading(3)
          : `
            <div class="home-entities-list">
              ${
                clients.length
                  ? clients.map((item) => renderMiniEntityItem(item, "client")).join("")
                  : renderEmptyState({
                      title: "Sin clientes visibles",
                      text: "Cuando haya clientes disponibles aparecerán aquí.",
                      iconName: "client",
                    })
              }

              ${
                showUsers && users.length
                  ? `
                    <div class="home-entities-separator" aria-hidden="true"></div>
                    ${users.map((item) => renderMiniEntityItem(item, "user")).join("")}
                  `
                  : ""
              }
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   TICKETS TABLE
========================================================= */

function renderStatusSummary(input = {}) {
  const collections = getCollections(input);
  const tickets = safeArray(collections.tickets);

  const counts = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  tickets.forEach((item) => {
    const key = getTicketStatusKey(getTicketStatus(item));
    counts[key] = safeNumber(counts[key], 0) + 1;
  });

  return `
    <div class="home-status-summary" aria-label="Resumen de estados">
      ${STATUS_ORDER.map(
        (status) => `
          <span class="home-status-summary-item home-status-summary-item--${attr(status)}">
            <span class="home-status-summary-dot" aria-hidden="true"></span>
            <strong>${escapeHtml(String(counts[status] || 0))}</strong>
            <span>${escapeHtml(getTicketStatusLabel(status))}</span>
          </span>
        `
      ).join("")}
    </div>
  `;
}

export function renderHomeTicketsTable(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);
  const admin = isAdminRole(getRole(data));
  const support = isSupportRole(getRole(data));

  const tickets = collections.tickets;

  const pagination = getPagination(tickets, {
    ...data,
    remoteCount: collections.ticketsRemoteCount,
    totalCount: collections.ticketsRemoteCount,
  });

  const showInitialLoading = state.loading && !pagination.pageItems.length;
  const showRefreshOverlay = state.refreshing && pagination.pageItems.length;

  return `
    <section class="home-tickets" data-home-section="tickets">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Service desk</span>

          <h2 class="home-panel-title">
            ${escapeHtml(admin || support ? "Incidencias recientes" : "Tus últimas incidencias")}
          </h2>

          <p class="home-panel-subtitle">
            ${
              showInitialLoading
                ? "Cargando incidencias..."
                : escapeHtml(
                    pagination.totalCount
                      ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`
                      : "Sin incidencias visibles"
                  )
            }
          </p>
        </div>

        <div class="home-panel-head-actions">
          ${renderStatusSummary(data)}

          <div class="home-pagination" aria-label="Paginación del home">
            <button
              type="button"
              class="home-pagination-btn"
              data-home-action="${ACTIONS.PREV_PAGE}"
              data-action="${ACTIONS.PREV_PAGE}"
              data-page="${attr(String(Math.max(1, pagination.currentPage - 1)))}"
              data-home-bindable="true"
              ${boolAttr(!pagination.hasPrev || state.loading || state.refreshing, 'disabled aria-disabled="true"')}
            >
              ${icon("chevronLeft")}
              <span>Anterior</span>
            </button>

            <span class="home-pagination-status">
              ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
            </span>

            <button
              type="button"
              class="home-pagination-btn home-pagination-btn--next"
              data-home-action="${ACTIONS.NEXT_PAGE}"
              data-action="${ACTIONS.NEXT_PAGE}"
              data-page="${attr(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
              data-home-bindable="true"
              ${boolAttr(!pagination.hasNext || state.loading || state.refreshing, 'disabled aria-disabled="true"')}
            >
              <span>Siguiente</span>
              ${icon("chevronRight")}
            </button>
          </div>
        </div>
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="${joinClasses("home-table-wrap", state.refreshing ? "is-refreshing" : "")}">
              ${showRefreshOverlay ? renderRefreshOverlay("Actualizando incidencias...") : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="home-table-shell">
                      <table class="home-table" role="table" aria-label="Resumen de incidencias del home">
                        <colgroup>
                          <col class="home-table-col home-table-col--ticket">
                          <col class="home-table-col home-table-col--owner">
                          <col class="home-table-col home-table-col--status">
                          <col class="home-table-col home-table-col--created">
                          <col class="home-table-col home-table-col--updated">
                          <col class="home-table-col home-table-col--attachments">
                          <col class="home-table-col home-table-col--actions">
                        </colgroup>

                        <thead>
                          <tr>
                            <th scope="col">Incidencia</th>
                            <th scope="col">Usuario / cliente</th>
                            <th scope="col">Estado</th>
                            <th scope="col">Creación</th>
                            <th scope="col">Última novedad</th>
                            <th scope="col">Adj.</th>
                            <th scope="col">Acciones</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${pagination.pageItems.map((item) => renderTicketRow(item, state)).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : renderEmptyState({
                      title: state.error
                        ? "No se pudieron cargar las incidencias"
                        : "No hay incidencias para mostrar",
                      text: state.error
                        ? "Puedes reintentar la carga desde el botón de actualizar."
                        : "Cuando haya solicitudes registradas aparecerán aquí.",
                      action: state.error ? ACTIONS.RETRY : "",
                      actionLabel: "Reintentar",
                      iconName: state.error ? "alert" : "ticket",
                    })
              }
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   LOADING / ERROR
========================================================= */

export function renderHomeLoadingState() {
  return `
    <section class="home-view-root home-view-root--loading" data-home-scope="true">
      <section class="home-hero home-hero--loading">
        ${renderCardLoading(4)}
      </section>

      <section class="home-panel">
        ${renderTableLoading(DEFAULT_PAGE_SIZE)}
      </section>
    </section>
  `;
}

export function renderHomeErrorState(message = "No se pudo cargar el home.") {
  return `
    <section class="home-view-root home-view-root--error" data-home-scope="true">
      <section class="home-panel">
        ${renderEmptyState({
          title: "No se pudo renderizar el home",
          text: safeText(message, "Error desconocido al cargar la vista."),
          action: ACTIONS.RETRY,
          actionLabel: "Reintentar",
          iconName: "alert",
        })}
      </section>
    </section>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderHomeTemplate(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const meta = getTemplateMeta(data);
  const role = getRole(data);
  const admin = isAdminRole(role);
  const support = isSupportRole(role);

  const dashboard = getDashboard(data);

  const payload = {
    ...data,
    dashboard,
    includeStyles: false,
    state: {
      ...safeObject(data.state),
      ...state,
    },
  };

  return `
    <section
      class="${joinClasses(
        "home-view-root",
        admin ? "home-view-root--admin" : support ? "home-view-root--support" : "home-view-root--user",
        state.loading ? "is-loading" : "",
        state.refreshing ? "is-refreshing" : "",
        state.creating ? "is-creating" : "",
        state.error ? "has-error" : "",
        meta.partial ? "is-partial" : ""
      )}"
      data-home-scope="true"
      data-home-data-scope="${attr(HOME_DATA_SCOPE)}"
      data-home-template-version="${attr(TEMPLATE_VERSION)}"
      data-home-role="${attr(role || "user")}"
      data-home-admin="${admin ? "true" : "false"}"
      data-home-support="${support ? "true" : "false"}"
      data-request-id="${attr(meta.requestId)}"
      data-last-updated-at="${attr(meta.lastUpdatedAt || "")}"
      data-partial="${meta.partial ? "true" : "false"}"
      data-errors-count="${attr(String(meta.errorsCount || 0))}"
      aria-busy="${state.loading || state.refreshing ? "true" : "false"}"
    >
      ${renderErrorBanner(state.error)}

      ${renderHomeHeader(payload)}
      ${renderHomeWidgets(payload)}

      <section class="home-grid" data-home-section="main-grid">
        ${renderHomeQuickActions(payload)}
        ${renderHomeActivity(payload)}
        ${renderHomeInvoicePreview(payload)}
        ${renderHomeEntitiesPreview(payload)}
      </section>

      ${renderHomeTicketsTable(payload)}
    </section>
  `;
}

/* =========================================================
   ALIASES COMPATIBLES
========================================================= */

export const renderHomeViewTemplate = renderHomeTemplate;
export const renderHomeDashboardTemplate = renderHomeTemplate;
export const renderHome = renderHomeTemplate;
export const renderDashboard = renderHomeTemplate;

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderHomeTemplate;
