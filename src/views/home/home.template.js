/* =========================================================
   Onion Support - Home Template
   Archivo: /src/views/home/home.template.js

   Responsabilidad:
   - Render HTML puro de Home.
   - Consumir datos normalizados desde home.selectors.js.
   - Pintar hero, métricas, acciones, actividad,
     facturas/directorio e incidencias.
   - Home distinto para admin/user.
   - User nunca pinta clientes/usuarios.
   - Usar sólo roles reales: admin / user.
   - Sin fetch.
   - Sin Auth.
   - Sin Router.
   - Sin storage.
   - Sin CSS inline.
   - Sin handlers inline.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin rutas detalle.
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

export const TEMPLATE_VERSION = "home.template.v3";

/* =========================================================
   CONSTANTS
========================================================= */

const ROUTES = Object.freeze({
  HOME: HOME_ROUTES?.HOME || "/",
  INCIDENCIAS: HOME_ROUTES?.INCIDENCIAS || "/incidencias",
  FACTURAS: HOME_ROUTES?.FACTURAS || "/facturas",
  CLIENTES: HOME_ROUTES?.CLIENTES || "/clientes",
  USUARIOS: HOME_ROUTES?.USUARIOS || "/usuarios",
  CUENTA: HOME_ROUTES?.CUENTA || "/cuenta",
  AJUSTES: HOME_ROUTES?.AJUSTES || "/ajustes",
});

const ACTIONS = Object.freeze({
  REFRESH: "refresh",
  RETRY: "retry",
  CREATE_INCIDENCIA: "create_incidencia",

  NAVIGATE: "navigate_home",
  OPEN_WIDGET: "open_widget",
  COPY_ID: "copy_widget_id",

  PREV_PAGE: "prev_page",
  NEXT_PAGE: "next_page",
  GO_PAGE: "page",

  EXPORT_CSV: "export_csv",
});

const LIMITS = Object.freeze({
  widgets: 4,
  activity: 6,
  invoices: 4,
  entities: 5,
});

const STATUS_ORDER = Object.freeze([
  "pending",
  "open",
  "progress",
  "resolved",
  "closed",
]);

/* =========================================================
   SAFE HTML
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

function joinClasses(...values) {
  return values
    .flat(Infinity)
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function boolAttr(condition = false, value = "") {
  return condition ? value : "";
}

function jsonAttr(value = {}) {
  try {
    return escapeHtml(JSON.stringify(value || {}));
  } catch {
    return "{}";
  }
}

/* =========================================================
   STATE / ROLE / META
========================================================= */

function getState(input = {}) {
  return safeObject(input.state);
}

function getLoadingState(input = {}) {
  const data = safeObject(input);
  const state = getState(data);

  return {
    loading: Boolean(state.loading || data.loading),
    refreshing: Boolean(state.refreshing || data.refreshing),
    creating: Boolean(state.creating || data.creating),
    loaded: Boolean(state.loaded || data.loaded),
    hydrated: Boolean(state.hydrated || data.hydrated),
    error: safeText(first(state.error, data.error), ""),
    openingTicketId: safeText(state.openingTicketId, ""),
    selectedTicketId: safeText(state.selectedTicketId, ""),
    navigatingAction: safeText(state.navigatingAction, ""),
  };
}

function getTemplateMeta(input = {}) {
  const data = safeObject(input);
  const state = getState(data);
  const dashboard = getDashboard(data);

  const lastUpdatedAt = first(
    data.lastUpdatedAt,
    data.lastSyncAt,
    state.lastUpdatedAt,
    state.lastSyncAt,
    dashboard.updatedAt,
    dashboard.generatedAt,
    dashboard.lastSyncAt,
    dashboard.meta?.updatedAt
  );

  return {
    requestId: safeText(first(data.requestId, state.requestId, dashboard.requestId, dashboard.meta?.requestId), ""),
    lastUpdatedAt,
    partial: Boolean(first(dashboard.partial, data.partial, false)),
    errorsCount: safeArray(first(dashboard.errors, data.errors, [])).length,
  };
}

function isAdmin(input = {}) {
  return isAdminRole(getRole(input));
}

function filterActivityForRole(input = {}, rows = []) {
  if (isAdmin(input)) return safeArray(rows);

  return safeArray(rows).filter((item) => {
    const type = normalizeKey(first(item.type, item.kind, item.category, ""));

    return !["client", "cliente", "customer", "user", "usuario", "member"].includes(type);
  });
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "activity") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    home: `<svg ${common}><path d="m3 10.5 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    invoice: `<svg ${common}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
    client: `<svg ${common}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M9 17h.01"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.48 17.01 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
    spark: `<svg ${common}><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 21l-1.9-7.8L4 11l6.1-2.2Z"/></svg>`,
    eye: `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    copy: `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    download: `<svg ${common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`,
    chevronLeft: `<svg ${common}><path d="m15 18-6-6 6-6"/></svg>`,
    chevronRight: `<svg ${common}><path d="m9 18 6-6-6-6"/></svg>`,
    arrowRight: `<svg ${common}><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
  };

  return icons[name] || icons.activity;
}

/* =========================================================
   SMALL UI
========================================================= */

function spinner(label = "Cargando") {
  return `
    <span class="home-inline-loading" role="status" aria-label="${attr(label)}">
      <span class="home-inline-spinner" aria-hidden="true"></span>
      <span class="home-inline-loading-text">${escapeHtml(label)}</span>
    </span>
  `;
}

function emptyState({
  title = "No hay datos para mostrar",
  text = "Cuando haya información disponible aparecerá aquí.",
  action = "",
  actionLabel = "Continuar",
  iconName = "spark",
} = {}) {
  return `
    <div class="home-empty">
      <div class="home-empty-icon" aria-hidden="true">${icon(iconName)}</div>
      <h3 class="home-empty-title">${escapeHtml(title)}</h3>
      <p class="home-empty-text">${escapeHtml(text)}</p>

      ${
        action
          ? `
            <button
              type="button"
              class="home-btn home-btn--primary"
              data-home-action="${attr(action)}"
              data-action="${attr(action)}"
            >
              ${escapeHtml(actionLabel)}
            </button>
          `
          : ""
      }
    </div>
  `;
}

function loadingCards(count = 4) {
  return `
    <div class="home-cards-loading" aria-hidden="true">
      ${Array.from({ length: Math.max(1, safeNumber(count, 4)) })
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

function loadingRows(count = DEFAULT_PAGE_SIZE) {
  return `
    <div class="home-table-loading" aria-hidden="true">
      ${Array.from({ length: Math.max(1, safeNumber(count, DEFAULT_PAGE_SIZE)) })
        .map(
          () => `
            <div class="home-table-loading-row">
              <div class="home-skeleton home-skeleton--avatar"></div>
              <div class="home-table-loading-copy">
                <div class="home-skeleton home-skeleton--xs"></div>
                <div class="home-skeleton home-skeleton--lg"></div>
                <div class="home-skeleton home-skeleton--md"></div>
              </div>
              <div class="home-skeleton home-skeleton--pill"></div>
              <div class="home-skeleton home-skeleton--date"></div>
              <div class="home-skeleton home-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function errorBanner(message = "") {
  const text = safeText(message, "");

  if (!text) return "";

  return `
    <div class="home-error-banner" role="status" data-home-error-banner="true">
      <span class="home-error-banner-icon" aria-hidden="true">${icon("alert")}</span>
      <span class="home-error-banner-text">${escapeHtml(text)}</span>
      <button
        type="button"
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
   AVATARS / BADGES
========================================================= */

function avatar({
  name = "Usuario",
  image = "",
  kind = "user",
  seed = "",
  className = "home-avatar",
} = {}) {
  const label = safeText(name, "Usuario");
  const initials = getInitials(label);
  const src = safeText(image, "");
  const avatarSeed = safeText(seed, label);

  return `
    <div
      class="${joinClasses(className, src ? "" : `${className}--fallback`)}"
      aria-label="${attr(label)}"
      data-avatar-root="true"
      data-avatar-kind="${attr(kind)}"
      data-avatar-seed="${attr(avatarSeed)}"
      data-avatar-initials="${attr(initials)}"
      ${boolAttr(!src, 'data-fallback="true"')}
    >
      <span class="${className}-fallback" aria-hidden="true">${escapeHtml(initials)}</span>

      ${
        src
          ? `
            <img
              class="${className}-img"
              src="${attr(src)}"
              alt="${attr(label)}"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
            >
          `
          : ""
      }
    </div>
  `;
}

function statusChip(item = {}) {
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

function priorityBadge(item = {}) {
  const key = getTicketPriorityKey(item);
  const label = getTicketPriorityLabel(item);

  return `
    <span class="home-mini-badge home-mini-badge--${attr(key)}" data-priority-key="${attr(key)}">
      ${icon(key === "critical" || key === "urgent" ? "alert" : "activity")}
      ${escapeHtml(label)}
    </span>
  `;
}

/* =========================================================
   HEADER / STATS
========================================================= */

function heroMetrics(stats = {}) {
  const items = [
    ["Abiertas", stats.openTickets, "open"],
    ["Cerradas", stats.closedTickets, "closed"],
    ["Urgentes", stats.urgentTickets, "urgent"],
    ["Salud", `${Math.round(safeNumber(stats.healthRatio, 100))}%`, "health"],
  ];

  return `
    <div class="home-hero-minimetrics" aria-label="Métricas rápidas">
      ${items
        .map(
          ([label, value, key]) => `
            <span class="home-minimetric home-minimetric--${attr(key)}">
              <strong>${escapeHtml(String(value ?? 0))}</strong>
              <span>${escapeHtml(label)}</span>
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function statCard(card = {}, index = 0) {
  const value = safeText(card.value, "0");
  const iconName = safeText(card.iconName, "activity");
  const modifier = normalizeKey(card.modifier || iconName || `stat-${index + 1}`);

  return `
    <article
      class="home-stat-card home-stat-card--${attr(modifier)}"
      data-home-stat-card="true"
      data-stat-index="${attr(index + 1)}"
      data-stat-modifier="${attr(modifier)}"
    >
      <div class="home-stat-topline">
        <div class="home-stat-icon" aria-hidden="true">${icon(iconName)}</div>
        ${card.badge ? `<span class="home-stat-badge">${escapeHtml(card.badge)}</span>` : ""}
      </div>

      <div class="home-stat-label">${escapeHtml(safeText(card.label, "Métrica"))}</div>
      <div class="home-stat-value" data-stat-value="${attr(value)}">${escapeHtml(value)}</div>
      ${card.text ? `<div class="home-stat-text">${escapeHtml(card.text)}</div>` : ""}
    </article>
  `;
}

export function renderHomeHeader(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const stats = computeHomeStats(data);
  const meta = getTemplateMeta(data);
  const admin = isAdmin(data);

  const displayName = getDisplayName(data);
  const title = admin ? "Centro de control Onion" : `Hola, ${displayName}`;
  const subtitle = admin
    ? "Resumen operativo de incidencias, facturación, clientes y usuarios."
    : "Consulta tus incidencias, facturas y actividad reciente.";

  return `
    <section
      class="home-hero home-hero--${admin ? "admin" : "user"}"
      data-home-section="hero"
      data-home-role="${admin ? "admin" : "user"}"
    >
      <div class="home-hero-bg" aria-hidden="true">
        <span class="home-hero-orb home-hero-orb--one"></span>
        <span class="home-hero-orb home-hero-orb--two"></span>
        <span class="home-hero-orb home-hero-orb--three"></span>
      </div>

      <div class="home-hero-top">
        <div class="home-hero-main">
          ${avatar({
            name: displayName,
            image: getAvatarUrl(data),
            kind: "user",
            seed: safeText(first(getUser(data).userId, getUser(data).id, getUser(data).username, displayName), displayName),
            className: "home-user-avatar",
          })}

          <div class="home-hero-copy">
            <span class="home-page-kicker">
              ${icon(admin ? "shield" : "home")}
              Onion Support · ${admin ? "Admin" : "Usuario"}
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
            aria-label="Actualizar Home"
            ${boolAttr(state.refreshing || state.loading, 'disabled aria-busy="true"')}
          >
            ${state.refreshing ? spinner("Actualizando...") : `${icon("refresh")}<span class="home-btn-text">Actualizar</span>`}
          </button>

          <button
            type="button"
            id="home-export-btn"
            class="home-btn home-btn--ghost"
            data-home-action="${ACTIONS.EXPORT_CSV}"
            data-action="${ACTIONS.EXPORT_CSV}"
            data-export-mode="tickets"
            data-export-filename="home-incidencias.csv"
            ${boolAttr(state.loading || state.refreshing, "disabled")}
          >
            ${icon("download")}
            <span class="home-btn-text">Exportar</span>
          </button>

          <button
            type="button"
            id="home-create-ticket-btn"
            class="${joinClasses("home-btn home-btn--primary", state.creating ? "is-loading" : "")}"
            data-home-action="${ACTIONS.CREATE_INCIDENCIA}"
            data-action="${ACTIONS.CREATE_INCIDENCIA}"
            data-route="${attr(ROUTES.INCIDENCIAS)}"
            data-href="${attr(ROUTES.INCIDENCIAS)}"
            ${boolAttr(state.creating || state.loading || state.refreshing, 'disabled aria-busy="true"')}
          >
            ${state.creating ? spinner("Abriendo...") : `${icon("plus")}<span class="home-btn-text">Crear incidencia</span>`}
          </button>
        </div>
      </div>

      <div class="home-hero-meta">
        <span class="home-meta-pill">${icon("ticket")}${escapeHtml(`${formatNumber(stats.totalTickets)} incidencias`)}</span>
        <span class="home-meta-pill">${icon("invoice")}${escapeHtml(`${formatNumber(stats.pendingInvoices)} facturas pendientes`)}</span>
        <span class="home-meta-pill">${icon("activity")}${escapeHtml(`Salud · ${Math.round(safeNumber(stats.healthRatio, 100))}%`)}</span>
        <span class="home-meta-pill">
          ${icon("refresh")}
          ${meta.lastUpdatedAt ? escapeHtml(`Actualizado · ${formatRelativeDate(meta.lastUpdatedAt)}`) : "Sin sincronización reciente"}
        </span>
      </div>

      ${heroMetrics(stats)}

      <div class="home-stats" data-home-section="stats">
        ${getStatCards(data).map(statCard).join("")}
      </div>
    </section>
  `;
}

/* =========================================================
   WIDGETS / QUICK ACTIONS
========================================================= */

function widgetCard(widget = {}, index = 0) {
  const id = getWidgetId(widget) || `widget-${index + 1}`;
  const type = getWidgetType(widget);
  const route = normalizeRoute(getWidgetRoute(widget) || "");
  const modifier = normalizeKey(type || "widget");

  return `
    <button
      type="button"
      class="home-widget-card home-widget-card--${attr(modifier)}"
      data-home-action="${attr(route ? ACTIONS.NAVIGATE : ACTIONS.OPEN_WIDGET)}"
      data-action="${attr(route ? ACTIONS.NAVIGATE : ACTIONS.OPEN_WIDGET)}"
      data-widget-id="${attr(id)}"
      data-widget-key="${attr(id)}"
      data-widget-type="${attr(type)}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-payload="${jsonAttr({ widgetId: id, type, route })}"
    >
      <span class="home-widget-glow" aria-hidden="true"></span>

      <span class="home-widget-head">
        <span class="home-widget-kicker">${escapeHtml(type || "widget")}</span>
        <span class="home-widget-icon" aria-hidden="true">
          ${
            modifier.includes("factur") || modifier.includes("invoice")
              ? icon("invoice")
              : modifier.includes("user") || modifier.includes("usuario")
                ? icon("users")
                : modifier.includes("client") || modifier.includes("cliente")
                  ? icon("client")
                  : icon("activity")
          }
        </span>
      </span>

      <strong class="home-widget-value">${escapeHtml(String(getWidgetValue(widget) ?? "—"))}</strong>
      <span class="home-widget-title">${escapeHtml(getWidgetTitle(widget))}</span>
      ${getWidgetText(widget) ? `<span class="home-widget-text">${escapeHtml(getWidgetText(widget))}</span>` : ""}
      ${getWidgetTrend(widget) ? `<span class="home-widget-trend">${escapeHtml(String(getWidgetTrend(widget)))}</span>` : ""}
    </button>
  `;
}

export function renderHomeWidgets(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const widgets = getWidgets(data).slice(0, LIMITS.widgets);

  return `
    <section class="home-widgets" data-home-section="widgets" aria-label="Widgets del dashboard">
      ${
        state.loading && !widgets.length
          ? loadingCards(LIMITS.widgets)
          : widgets.length
            ? widgets.map(widgetCard).join("")
            : emptyState({
                title: "Sin widgets disponibles",
                text: "El resumen se actualizará cuando haya métricas disponibles.",
              })
      }
    </section>
  `;
}

function normalizeQuickAction(action = {}) {
  const raw = safeObject(action);
  const actionName = safeText(raw.action, "");
  const key = normalizeKey(actionName);

  const isCreate = [
    ACTIONS.CREATE_INCIDENCIA,
    "create",
    "new",
    "new_ticket",
    "create_ticket",
    "create_incidencia",
    "new_incidencia",
  ].includes(key);

  return {
    ...raw,
    action: isCreate ? ACTIONS.CREATE_INCIDENCIA : actionName || ACTIONS.NAVIGATE,
    dataAction: isCreate ? ACTIONS.CREATE_INCIDENCIA : safeText(raw.dataAction || ACTIONS.NAVIGATE, ACTIONS.NAVIGATE),
    route: isCreate ? ROUTES.INCIDENCIAS : normalizeRoute(raw.route || raw.href || ""),
    modifier: normalizeKey(raw.modifier || actionName || "default"),
    isCreate,
  };
}

function quickActionCard(action = {}, state = {}) {
  const item = normalizeQuickAction(action);

  const busy =
    state.navigatingAction === item.action ||
    state.navigatingAction === item.dataAction ||
    (item.isCreate && state.creating);

  return `
    <button
      type="button"
      class="${joinClasses("home-action-card", `home-action-card--${item.modifier}`, busy ? "is-loading" : "")}"
      data-home-action="${attr(item.action)}"
      data-action="${attr(item.dataAction)}"
      data-route="${attr(item.route)}"
      data-href="${attr(item.route)}"
      data-payload="${jsonAttr({ action: item.action, route: item.route })}"
      ${boolAttr(busy || state.loading || state.refreshing, 'disabled aria-busy="true"')}
    >
      <span class="home-action-card-icon" aria-hidden="true">${icon(item.iconName || (item.isCreate ? "plus" : "arrowRight"))}</span>
      <span class="home-action-card-kicker">${escapeHtml(item.route || "Onion Support")}</span>
      <strong class="home-action-card-title">${busy ? spinner(item.isCreate ? "Abriendo..." : "Navegando...") : escapeHtml(item.title || "Acción")}</strong>
      <span class="home-action-card-text">${escapeHtml(item.text || "")}</span>
      <span class="home-action-card-arrow" aria-hidden="true">${icon(item.isCreate ? "plus" : "arrowRight")}</span>
    </button>
  `;
}

export function renderHomeQuickActions(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const admin = isAdmin(data);
  const actions = getQuickActions(data);

  return `
    <section class="home-panel home-panel--actions" data-home-section="quick-actions">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">${admin ? "Operación admin" : "Acciones"}</span>
          <h2 class="home-panel-title">Accesos rápidos</h2>
          <p class="home-panel-subtitle">
            ${escapeHtml(admin ? "Atajos principales para operar el panel." : "Acciones principales para moverte por tu cuenta.")}
          </p>
        </div>
      </div>

      ${
        state.loading && !actions.length
          ? loadingCards(4)
          : `<div class="home-actions-grid">${actions.map((item) => quickActionCard(item, state)).join("")}</div>`
      }
    </section>
  `;
}

/* =========================================================
   ACTIVITY / SIDE PANELS
========================================================= */

function activityItem(input = {}, item = {}) {
  const type = getActivityType(item);
  const admin = isAdmin(input);

  if (!admin && ["client", "cliente", "customer", "user", "usuario", "member"].includes(normalizeKey(type))) {
    return "";
  }

  const route =
    normalizeRoute(first(item.route, item.href, item.link, item.raw?.route, "")) ||
    (type === "invoice"
      ? ROUTES.FACTURAS
      : type === "client"
        ? ROUTES.CLIENTES
        : type === "user"
          ? ROUTES.USUARIOS
          : ROUTES.INCIDENCIAS);

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

  return `
    <button
      type="button"
      class="home-activity-item home-activity-item--${attr(type || "activity")}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-entity-id="${attr(entityId)}"
      data-payload="${jsonAttr({ type, route, entityId })}"
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
        <strong class="home-activity-title">${escapeHtml(getActivityTitle(item))}</strong>
        <span class="home-activity-text">${escapeHtml(getActivityText(item))}</span>
      </span>

      <span class="home-activity-time" title="${attr(formatDateTime(getActivityDate(item)))}">
        ${escapeHtml(formatRelativeDate(getActivityDate(item)))}
      </span>
    </button>
  `;
}

export function renderHomeActivity(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const activity = filterActivityForRole(data, getActivity(data)).slice(0, LIMITS.activity);

  return `
    <section class="home-panel home-panel--activity" data-home-section="activity">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Actividad</span>
          <h2 class="home-panel-title">Actividad reciente</h2>
          <p class="home-panel-subtitle">
            ${state.loading && !activity.length ? "Cargando actividad..." : escapeHtml(`${formatNumber(activity.length)} movimientos recientes`)}
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(ROUTES.INCIDENCIAS)}"
          data-href="${attr(ROUTES.INCIDENCIAS)}"
        >
          Ver incidencias ${icon("arrowRight")}
        </button>
      </div>

      ${
        state.loading && !activity.length
          ? loadingCards(3)
          : activity.length
            ? `<div class="home-activity-list">${activity.map((item) => activityItem(data, item)).join("")}</div>`
            : emptyState({
                title: "Sin actividad reciente",
                text: "Cuando haya movimientos aparecerán aquí.",
                iconName: "clock",
              })
      }
    </section>
  `;
}

function invoiceItem(item = {}) {
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
      data-route="${attr(ROUTES.FACTURAS)}"
      data-href="${attr(ROUTES.FACTURAS)}"
      data-invoice-id="${attr(id)}"
      data-factura-id="${attr(id)}"
      data-entity-id="${attr(id)}"
      data-payload="${jsonAttr({ invoiceId: id, facturaId: id })}"
    >
      <span class="home-invoice-mini-icon" aria-hidden="true">${icon("invoice")}</span>
      <span class="home-invoice-mini-copy">
        <strong>${escapeHtml(id || "Factura")}</strong>
        <span>${escapeHtml(formatMoney(amount, currency || DEFAULT_CURRENCY))}</span>
      </span>
      <span class="home-invoice-mini-status">${escapeHtml(status || "estado")}</span>
    </button>
  `;
}

export function renderHomeInvoicePreview(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);
  const invoices = safeArray(collections.invoices).slice(0, LIMITS.invoices);

  return `
    <section class="home-panel home-panel--invoice-preview" data-home-section="invoice-preview">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Facturación</span>
          <h2 class="home-panel-title">${isAdmin(data) ? "Facturación rápida" : "Mis facturas"}</h2>
          <p class="home-panel-subtitle">
            ${state.loading && !invoices.length ? "Cargando facturas..." : escapeHtml(`${formatNumber(collections.invoicesRemoteCount || invoices.length)} facturas detectadas`)}
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(ROUTES.FACTURAS)}"
          data-href="${attr(ROUTES.FACTURAS)}"
        >
          Ver facturas ${icon("arrowRight")}
        </button>
      </div>

      ${
        state.loading && !invoices.length
          ? loadingCards(3)
          : invoices.length
            ? `<div class="home-invoice-mini-list">${invoices.map(invoiceItem).join("")}</div>`
            : emptyState({
                title: "Sin facturas visibles",
                text: "Cuando haya facturas disponibles aparecerán aquí.",
                iconName: "invoice",
              })
      }
    </section>
  `;
}

/* =========================================================
   ADMIN DIRECTORY
========================================================= */

function entityName(item = {}, type = "client") {
  return safeText(
    first(
      item.displayName,
      item.fullName,
      item.name,
      item.nombre,
      item.razonSocial,
      item.company,
      item.username,
      item.email,
      item.raw?.displayName,
      item.raw?.fullName,
      item.raw?.name,
      item.raw?.nombre,
      item.raw?.razonSocial,
      item.raw?.company,
      item.raw?.username,
      item.raw?.email
    ),
    type === "user" ? "Usuario" : "Cliente"
  );
}

function entityItem(item = {}, type = "client") {
  const isUser = type === "user";
  const label = entityName(item, type);
  const route = isUser ? ROUTES.USUARIOS : ROUTES.CLIENTES;

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

  return `
    <button
      type="button"
      class="home-entity-mini home-entity-mini--${isUser ? "user" : "client"}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(route)}"
      data-href="${attr(route)}"
      data-entity-id="${attr(entityId)}"
      data-payload="${jsonAttr({ type, entityId })}"
    >
      <span class="home-entity-mini-avatar" data-avatar-seed="${attr(label)}" aria-hidden="true">
        ${escapeHtml(getInitials(label))}
      </span>

      <span class="home-entity-mini-copy">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(safeText(first(item.email, item.mail, item.raw?.email, item.raw?.mail), "Sin email"))}</span>
      </span>

      <span class="home-entity-mini-arrow" aria-hidden="true">${icon("chevronRight")}</span>
    </button>
  `;
}

export function renderHomeEntitiesPreview(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);

  if (!isAdmin(data)) return "";

  const clients = safeArray(collections.clients).slice(0, LIMITS.entities);
  const users = safeArray(collections.users).slice(0, LIMITS.entities);

  return `
    <section class="home-panel home-panel--entities" data-home-section="entities">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Directorio</span>
          <h2 class="home-panel-title">Clientes y usuarios</h2>
          <p class="home-panel-subtitle">
            ${
              state.loading && !clients.length && !users.length
                ? "Cargando directorio..."
                : escapeHtml(`${formatNumber(collections.clientsRemoteCount || clients.length)} clientes · ${formatNumber(collections.usersRemoteCount || users.length)} usuarios`)
            }
          </p>
        </div>

        <button
          type="button"
          class="home-panel-link"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(ROUTES.CLIENTES)}"
          data-href="${attr(ROUTES.CLIENTES)}"
        >
          Ver clientes ${icon("arrowRight")}
        </button>
      </div>

      ${
        state.loading && !clients.length && !users.length
          ? loadingCards(3)
          : `
            <div class="home-entities-list">
              ${
                clients.length
                  ? clients.map((item) => entityItem(item, "client")).join("")
                  : emptyState({
                      title: "Sin clientes visibles",
                      text: "Cuando haya clientes disponibles aparecerán aquí.",
                      iconName: "client",
                    })
              }

              ${
                users.length
                  ? `
                    <div class="home-entities-separator" aria-hidden="true"></div>
                    ${users.map((item) => entityItem(item, "user")).join("")}
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
   TICKETS
========================================================= */

function statusSummary(input = {}) {
  const tickets = safeArray(getCollections(input).tickets);
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));

  for (const ticket of tickets) {
    const key = getTicketStatusKey(getTicketStatus(ticket));
    counts[key] = safeNumber(counts[key], 0) + 1;
  }

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

function ticketRow(item = {}, state = {}) {
  const ticketId = getTicketId(item);
  const subject = getTicketSubject(item);
  const description = getTicketDescription(item);
  const statusKey = getTicketStatusKey(getTicketStatus(item));
  const priorityKey = getTicketPriorityKey(item);
  const createdAt = getTicketCreatedAt(item);
  const updatedAt = getTicketUpdatedAt(item);

  const isOpening = isSameIdentity(state.openingTicketId, ticketId);
  const isSelected = isSameIdentity(state.selectedTicketId, ticketId);

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
          ${avatar({
            name: getTicketOwnerName(item),
            image: getTicketAvatarUrl(item),
            kind: "ticket",
            seed: `${ticketId}|${getTicketOwnerName(item)}`,
            className: "home-ticket-avatar",
          })}

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
              >
                ${escapeHtml(ticketId)}
              </button>

              <span class="home-mini-badge home-mini-badge--category">
                ${escapeHtml(getTicketCategory(item))}
              </span>
            </div>

            <button
              type="button"
              class="home-ticket-subject"
              data-home-action="${ACTIONS.NAVIGATE}"
              data-action="${ACTIONS.NAVIGATE}"
              data-ticket-id="${attr(ticketId)}"
              data-incidencia-id="${attr(ticketId)}"
              data-entity-id="${attr(ticketId)}"
              data-route="${attr(ROUTES.INCIDENCIAS)}"
              data-href="${attr(ROUTES.INCIDENCIAS)}"
              data-payload="${jsonAttr({ ticketId, incidenciaId: ticketId })}"
            >
              ${escapeHtml(subject)}
            </button>

            <div class="home-ticket-description">${escapeHtml(description)}</div>

            <div class="home-ticket-badges">
              ${priorityBadge(item)}
              <span class="home-mini-badge home-mini-badge--agent">
                ${icon("users")}
                ${escapeHtml(getTicketAssignedTo(item))}
              </span>
            </div>
          </div>
        </div>
      </td>

      <td class="home-ticket-cell home-ticket-cell--owner">
        <span class="home-ticket-owner">
          <strong>${escapeHtml(getTicketOwnerName(item))}</strong>
          <span>${escapeHtml(getTicketOwnerEmail(item) || "Sin email")}</span>
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--status">${statusChip(item)}</td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span class="home-date-inline" title="${attr(formatDateTime(createdAt))}">
          ${escapeHtml(formatDateTime(createdAt))}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span class="home-date-inline" title="${attr(formatDateTime(updatedAt))}">
          ${escapeHtml(formatLastUpdate(updatedAt))}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--attachments">
        <span class="home-attachments-pill">
          ${icon("paperclip")}
          ${escapeHtml(String(getTicketAttachmentsCount(item)))}
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
          data-route="${attr(ROUTES.INCIDENCIAS)}"
          data-href="${attr(ROUTES.INCIDENCIAS)}"
          data-payload="${jsonAttr({ ticketId, incidenciaId: ticketId })}"
          ${boolAttr(isOpening, 'disabled aria-busy="true"')}
        >
          ${isOpening ? spinner("Cargando...") : `${icon("eye")}<span class="home-btn-text">Detalle</span>`}
        </button>
      </td>
    </tr>
  `;
}

function normalizePagination(pagination = {}, rows = []) {
  const pageItems = safeArray(first(pagination.pageItems, pagination.items, rows));
  const currentPage = safeNumber(first(pagination.currentPage, pagination.page), 1);
  const totalPages = Math.max(1, safeNumber(pagination.totalPages, 1));
  const totalCount = Math.max(pageItems.length, safeNumber(first(pagination.totalCount, pagination.total), rows.length));

  return {
    ...pagination,
    pageItems,
    currentPage,
    page: currentPage,
    totalPages,
    totalCount,
    rangeStart: safeNumber(pagination.rangeStart, totalCount && pageItems.length ? 1 : 0),
    rangeEnd: safeNumber(pagination.rangeEnd, pageItems.length),
    hasPrev: Boolean(pagination.hasPrev || currentPage > 1),
    hasNext: Boolean(pagination.hasNext || currentPage < totalPages),
  };
}

export function renderHomeTicketsTable(input = {}) {
  const data = safeObject(input);
  const state = getLoadingState(data);
  const collections = getCollections(data);
  const tickets = safeArray(collections.tickets);

  const pagination = normalizePagination(
    getPagination(tickets, {
      ...data,
      remoteCount: collections.ticketsRemoteCount,
      totalCount: collections.ticketsRemoteCount,
    }),
    tickets
  );

  const initialLoading = state.loading && !pagination.pageItems.length;

  return `
    <section class="home-tickets" data-home-section="tickets">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <span class="home-panel-kicker">Incidencias</span>
          <h2 class="home-panel-title">${isAdmin(data) ? "Incidencias recientes" : "Tus últimas incidencias"}</h2>
          <p class="home-panel-subtitle">
            ${
              initialLoading
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
          ${statusSummary(data)}

          <div class="home-pagination" aria-label="Paginación del Home">
            <button
              type="button"
              class="home-pagination-btn"
              data-home-action="${ACTIONS.PREV_PAGE}"
              data-action="${ACTIONS.PREV_PAGE}"
              data-page="${attr(String(Math.max(1, pagination.currentPage - 1)))}"
              ${boolAttr(!pagination.hasPrev || state.loading || state.refreshing, 'disabled aria-disabled="true"')}
            >
              ${icon("chevronLeft")}
              <span>Anterior</span>
            </button>

            <span class="home-pagination-status">${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}</span>

            <button
              type="button"
              class="home-pagination-btn home-pagination-btn--next"
              data-home-action="${ACTIONS.NEXT_PAGE}"
              data-action="${ACTIONS.NEXT_PAGE}"
              data-page="${attr(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
              ${boolAttr(!pagination.hasNext || state.loading || state.refreshing, 'disabled aria-disabled="true"')}
            >
              <span>Siguiente</span>
              ${icon("chevronRight")}
            </button>
          </div>
        </div>
      </div>

      ${
        initialLoading
          ? loadingRows(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="${joinClasses("home-table-wrap", state.refreshing ? "is-refreshing" : "")}">
              ${
                pagination.pageItems.length
                  ? `
                    <div class="home-table-shell">
                      <table class="home-table" role="table" aria-label="Resumen de incidencias del Home">
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
                          ${pagination.pageItems.map((item) => ticketRow(item, state)).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : emptyState({
                      title: state.error ? "No se pudieron cargar las incidencias" : "No hay incidencias para mostrar",
                      text: state.error ? "Puedes reintentar la carga desde el botón de actualizar." : "Cuando haya solicitudes registradas aparecerán aquí.",
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
   FALLBACK STATES
========================================================= */

export function renderHomeLoadingState() {
  return `
    <section class="home-view-root home-view-root--loading" data-home-scope="true">
      <section class="home-hero home-hero--loading">
        ${loadingCards(4)}
      </section>

      <section class="home-panel">
        ${loadingRows(DEFAULT_PAGE_SIZE)}
      </section>
    </section>
  `;
}

export function renderHomeErrorState(message = "No se pudo cargar el Home.") {
  return `
    <section class="home-view-root home-view-root--error" data-home-scope="true">
      <section class="home-panel">
        ${emptyState({
          title: "No se pudo renderizar el Home",
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
  const admin = isAdmin(data);
  const dashboard = getDashboard(data);

  const payload = {
    ...data,
    dashboard,
    state: {
      ...safeObject(data.state),
      ...state,
    },
  };

  return `
    <section
      class="${joinClasses(
        "home-view-root",
        admin ? "home-view-root--admin" : "home-view-root--user",
        state.loading ? "is-loading" : "",
        state.refreshing ? "is-refreshing" : "",
        state.creating ? "is-creating" : "",
        state.error ? "has-error" : "",
        meta.partial ? "is-partial" : ""
      )}"
      data-home-scope="true"
      data-home-data-scope="home-dashboard"
      data-home-template-version="${attr(TEMPLATE_VERSION)}"
      data-home-role="${admin ? "admin" : "user"}"
      data-home-admin="${admin ? "true" : "false"}"
      data-request-id="${attr(meta.requestId)}"
      data-last-updated-at="${attr(meta.lastUpdatedAt || "")}"
      data-partial="${meta.partial ? "true" : "false"}"
      data-errors-count="${attr(String(meta.errorsCount || 0))}"
      aria-busy="${state.loading || state.refreshing ? "true" : "false"}"
    >
      ${errorBanner(state.error)}

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

export const renderHomeViewTemplate = renderHomeTemplate;
export const renderHomeDashboardTemplate = renderHomeTemplate;
export const renderHome = renderHomeTemplate;
export const renderDashboard = renderHomeTemplate;

export default renderHomeTemplate;
