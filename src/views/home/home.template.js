/* =========================================================
   Onion SPA - Home Dashboard Template
   Archivo: src/views/home/home.template.js

   FINAL EXTREME PRODUCTION TEMPLATE · HOME VIEW · USER + ADMIN
   APPLE SAAS MODE · FACTURAS/INCIDENCIAS INSPIRED · 12/10

   PATCH · TEMPLATE TRIMMED
   PATCH · SELECTORS MOVED TO home.selectors.js
   PATCH · HTML/CSS ONLY OWNER
   PATCH · SUMMARY/WIDGETS/COUNTERS FIXED THROUGH SELECTORS

   RESPONSABILIDADES:
   - render del home/dashboard para usuarios y administradores
   - una única plantilla role-aware: user/admin/admin-like
   - consumir datos normalizados desde home.selectors.js
   - NO hacer fetch
   - NO calcular normalización pesada dentro del template
   - pintar hero, stats, widgets, acciones rápidas, actividad y tabla
   - mantener estilos encapsulados
   - compatible con HomeView.js o render directo desde Router
   - acciones compatibles con data-home-action y data-action
   - CSP friendly: sin handlers inline tipo onerror
========================================================= */

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_CURRENCY,
  HOME_ROUTES,

  safeText,
  safeArray,
  safeObject,
  first,
  isSameIdentity,
  normalizeRoute,

  formatNumber,
  formatMoney,
  formatDateTime,
  formatRelativeDate,
  formatLastUpdate,

  getAvatarStyle,
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
   CONSTANTS
========================================================= */

const STYLE_ID = "onion-home-template-styles-v13";

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

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

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
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    shield: `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.48 17.01 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
    spark: `<svg ${common}><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 21l-1.9-7.8L4 11l6.1-2.2Z"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  };

  return icons[name] || "";
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderMaybeStyles(includeStyles = false) {
  return includeStyles ? renderStyles() : "";
}

function renderSpinner(label = "") {
  return `
    <span class="home-inline-loading">
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
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="home-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderUserAvatar(input = {}) {
  const fullName = getDisplayName(input);
  const initials = getInitials(fullName);
  const avatarUrl = getAvatarUrl(input);
  const user = getUser(input);

  const seed = safeText(
    first(user.userId, user.id, user.email, user.username, fullName, "home-user"),
    "home-user"
  );

  const avatarStyle = getAvatarStyle(seed);

  return `
    <div
      class="home-user-avatar${avatarUrl ? "" : " home-user-avatar--fallback"}"
      aria-label="${escapeHtml(fullName)}"
      title="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-avatar-root="true"
      ${avatarUrl ? "" : 'data-fallback="true"'}
      style="${escapeHtml(avatarStyle)}"
    >
      <span class="home-user-avatar-fallback">${escapeHtml(initials)}</span>
      ${
        avatarUrl
          ? `
            <img
              class="home-user-avatar-img"
              src="${escapeHtml(avatarUrl)}"
              alt="${escapeHtml(fullName)}"
              loading="lazy"
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
  const seed = `${getTicketId(item)}|${fullName}`;
  const avatarStyle = getAvatarStyle(seed);

  return `
    <div
      class="home-ticket-avatar${avatarUrl ? "" : " home-ticket-avatar--fallback"}"
      aria-label="${escapeHtml(fullName)}"
      title="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-avatar-root="true"
      ${avatarUrl ? "" : 'data-fallback="true"'}
      style="${escapeHtml(avatarStyle)}"
    >
      <span class="home-ticket-avatar-fallback">${escapeHtml(initials)}</span>
      ${
        avatarUrl
          ? `
            <img
              class="home-ticket-avatar-img"
              src="${escapeHtml(avatarUrl)}"
              alt="${escapeHtml(fullName)}"
              loading="lazy"
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
    <span class="home-chip home-chip--${escapeHtml(key)}">
      <span class="home-chip-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderPriorityBadge(item = {}) {
  const key = getTicketPriorityKey(item);
  const label = getTicketPriorityLabel(item);

  return `
    <span
      class="home-mini-badge home-mini-badge--${escapeHtml(key)}"
      title="${escapeHtml(`Prioridad ${label}`)}"
      data-tooltip="${escapeHtml(`Prioridad ${label}`)}"
    >
      ${key === "critical" || key === "urgent" ? icon("alert") : icon("activity")}
      ${escapeHtml(label)}
    </span>
  `;
}

function renderCategoryBadge(item = {}) {
  const category = getTicketCategory(item);

  return `
    <span
      class="home-mini-badge home-mini-badge--category"
      title="${escapeHtml(category)}"
      data-tooltip="${escapeHtml(category)}"
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
      title="${escapeHtml(`Técnico · ${assigned}`)}"
      data-tooltip="${escapeHtml(`Técnico · ${assigned}`)}"
    >
      ${icon("users")}
      ${escapeHtml(assigned)}
    </span>
  `;
}

function renderStatCard(card = {}) {
  const value = safeText(card.value, "0");
  const iconName = safeText(card.iconName, "activity");

  return `
    <article class="home-stat-card${card.modifier ? ` home-stat-card--${escapeHtml(card.modifier)}` : ""}">
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

      <div class="home-stat-label">${escapeHtml(card.label)}</div>
      <div class="home-stat-value" title="${escapeHtml(value)}">${escapeHtml(value)}</div>
      <div class="home-stat-text">${escapeHtml(card.text)}</div>
    </article>
  `;
}

function renderQuickAction(action = {}, state = {}) {
  const navigatingAction = safeText(state.navigatingAction, "");
  const creating = Boolean(state.creating);
  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);

  const isBusy =
    navigatingAction === action.action ||
    (action.action === "create-incidencia" && creating);

  return `
    <button
      type="button"
      class="home-action-card home-action-card--${escapeHtml(action.modifier || "default")}${isBusy ? " is-loading" : ""}"
      data-home-action="${escapeHtml(action.action)}"
      data-action="${escapeHtml(action.dataAction || action.action)}"
      data-route="${escapeHtml(action.route || "")}"
      ${isBusy || loading || refreshing ? 'disabled aria-busy="true"' : ""}
    >
      <span class="home-action-card-icon" aria-hidden="true">
        ${icon(action.iconName || "arrowRight")}
      </span>

      <span class="home-action-card-kicker">${escapeHtml(action.route || "Onion Support")}</span>

      <strong class="home-action-card-title">
        ${isBusy ? renderSpinner("Abriendo...") : escapeHtml(action.title)}
      </strong>

      <span class="home-action-card-text">${escapeHtml(action.text)}</span>

      <span class="home-action-card-arrow" aria-hidden="true">
        ${icon("arrowRight")}
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

  return `
    <button
      type="button"
      class="home-widget-card home-widget-card--${escapeHtml(type || "widget")}"
      data-home-action="${route ? "navigate-home" : "open-widget"}"
      data-action="${route ? "navigate-home" : "open-widget"}"
      data-widget-id="${escapeHtml(id)}"
      data-route="${escapeHtml(route)}"
      data-status="${escapeHtml(status)}"
      ${route ? "" : 'aria-disabled="true"'}
    >
      <span class="home-widget-glow" aria-hidden="true"></span>
      <span class="home-widget-kicker">${escapeHtml(type || "widget")}</span>
      <strong class="home-widget-value">${escapeHtml(String(value ?? "—"))}</strong>
      <span class="home-widget-title">${escapeHtml(title)}</span>
      ${text ? `<span class="home-widget-text">${escapeHtml(text)}</span>` : ""}
      ${trend ? `<span class="home-widget-trend">${escapeHtml(String(trend))}</span>` : ""}
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

  const openingTicketId = safeText(state.openingTicketId, "");
  const isOpening = isSameIdentity(openingTicketId, ticketId);

  return `
    <tr
      class="home-ticket-row home-ticket-row--${escapeHtml(statusKey)}"
      data-ticket-row="true"
      data-ticket-id="${escapeHtml(ticketId)}"
      data-incidencia-id="${escapeHtml(ticketId)}"
    >
      <td class="home-ticket-cell home-ticket-cell--main">
        <div class="home-ticket-main">
          ${renderTicketAvatar(item)}

          <div class="home-ticket-copy">
            <div class="home-ticket-line">
              <span class="home-ticket-id">${escapeHtml(ticketId)}</span>
              ${renderCategoryBadge(item)}
            </div>

            <div class="home-ticket-subject">${escapeHtml(subject)}</div>
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
          title="${escapeHtml(`${ownerName} · ${ownerEmail}`)}"
          data-tooltip="${escapeHtml(`${ownerName} · ${ownerEmail}`)}"
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
          title="${escapeHtml(createdAt)}"
          data-tooltip="${escapeHtml(createdAt)}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span
          class="home-date-inline"
          title="${escapeHtml(formatDateTime(updatedAtRaw))}"
          data-tooltip="${escapeHtml(formatDateTime(updatedAtRaw))}"
        >
          ${escapeHtml(updatedAt)}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--attachments">
        <span
          class="home-attachments-pill"
          title="${escapeHtml(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
          data-tooltip="${escapeHtml(`${attachmentsCount} adjunto${attachmentsCount === 1 ? "" : "s"}`)}"
        >
          ${icon("paperclip")}
          ${escapeHtml(String(attachmentsCount))}
        </span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--actions">
        <button
          type="button"
          class="home-detail-btn${isOpening ? " is-loading" : ""}"
          data-home-action="open-ticket"
          data-action="open-ticket"
          data-ticket-id="${escapeHtml(ticketId)}"
          data-entity-id="${escapeHtml(ticketId)}"
          data-route="${escapeHtml(HOME_ROUTES.INCIDENCIAS)}"
          title="Abrir detalle de incidencia"
          data-tooltip="Abrir detalle de incidencia"
          ${isOpening ? 'disabled aria-busy="true"' : ""}
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
  const action = safeText(
    first(item.action, item.raw?.action, route ? "navigate-home" : "open-activity"),
    "open-activity"
  );

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
      class="home-activity-item home-activity-item--${escapeHtml(type || "activity")}"
      data-home-action="${escapeHtml(action)}"
      data-action="${escapeHtml(action)}"
      data-route="${escapeHtml(route)}"
      data-entity-id="${escapeHtml(entityId)}"
    >
      <span class="home-activity-icon" aria-hidden="true">
        ${
          type === "invoice"
            ? icon("invoice")
            : type === "client"
              ? icon("client")
              : type === "user"
                ? icon("users")
                : icon("ticket")
        }
      </span>

      <span class="home-activity-copy">
        <strong class="home-activity-title">${escapeHtml(title)}</strong>
        <span class="home-activity-text">${escapeHtml(text)}</span>
      </span>

      <span class="home-activity-time">${escapeHtml(formatRelativeDate(date))}</span>
    </button>
  `;
}

function renderEmptyState({ title = "", text = "", action = "", actionLabel = "" } = {}) {
  return `
    <div class="home-empty">
      <div class="home-empty-icon" aria-hidden="true">
        ${icon("spark")}
      </div>

      <h3 class="home-empty-title">${escapeHtml(title || "No hay datos para mostrar")}</h3>
      <p class="home-empty-text">${escapeHtml(text || "Cuando haya información disponible aparecerá aquí.")}</p>

      ${
        action
          ? `
            <button
              type="button"
              class="home-btn home-btn--primary"
              data-home-action="${escapeHtml(action)}"
              data-action="${escapeHtml(action)}"
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
  return `
    <div class="home-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
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
  return `
    <div class="home-cards-loading" aria-hidden="true">
      ${Array.from({ length: rows })
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

function renderRefreshOverlay() {
  return `
    <div class="home-refresh-overlay" aria-live="polite">
      <div class="home-refresh-card">
        ${renderSpinner("Actualizando home...")}
      </div>
    </div>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style id="${STYLE_ID}">
      :where(.home-view-root, [data-home-scope]){
        --home-row-accent:var(--accent, #6f59d9);
        --home-row-accent-soft:var(--accent-soft, rgba(111,89,217,.12));
        --home-create-bg:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #6f59d9 0%, #5f45d8 55%, #4f37bf 100%)));
        --home-create-bg-hover:var(--home-create-bg);
        --home-create-border:var(--btn-primary-border, color-mix(in srgb, var(--accent, #6f59d9) 46%, transparent));
        --home-table-row-height:88px;

        display:grid;
        gap:var(--view-section-gap, var(--space-lg, 18px));
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
        min-inline-size:0;
        inline-size:100%;
        max-inline-size:100%;
        container-type:inline-size;
      }

      :where(.home-view-root, [data-home-scope]) *,
      :where(.home-view-root, [data-home-scope]) *::before,
      :where(.home-view-root, [data-home-scope]) *::after{
        box-sizing:border-box;
      }

      .home-hero{
        position:relative;
        overflow:hidden;
        border-radius:var(--view-hero-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--view-hero-border, var(--panel-border, var(--border-default, rgba(255,255,255,.08))));
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 14%, transparent), transparent 38%),
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 12%, transparent), transparent 34%),
          radial-gradient(circle at 68% 110%, color-mix(in srgb, var(--success, #22c55e) 8%, transparent), transparent 36%),
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #262626))));
        box-shadow:var(--view-hero-shadow, var(--panel-shadow, var(--shadow-md, 0 14px 30px rgba(0,0,0,.22))));
        padding:var(--space-xl, 22px) var(--space-xl, 24px);
        isolation:isolate;
        min-inline-size:0;
        max-inline-size:100%;
      }

      .home-hero::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(120deg, transparent 0%, color-mix(in srgb, var(--text-strong, #ffffff) 5%, transparent) 44%, transparent 72%);
        opacity:.78;
        z-index:0;
      }

      .home-hero::after{
        content:"";
        position:absolute;
        inset:auto -8% -40% 42%;
        block-size:240px;
        pointer-events:none;
        background:radial-gradient(circle, color-mix(in srgb, var(--accent, #6f59d9) 12%, transparent), transparent 68%);
        filter:blur(10px);
        opacity:.82;
        z-index:0;
      }

      .home-hero > *{
        position:relative;
        z-index:1;
      }

      .home-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .home-hero-main{
        min-inline-size:0;
        display:grid;
        grid-template-columns:calc(62px * var(--ui-scale, 1)) minmax(0, 1fr);
        gap:var(--space-md, 14px);
        align-items:center;
      }

      .home-user-avatar{
        position:relative;
        inline-size:calc(62px * var(--ui-scale, 1));
        block-size:calc(62px * var(--ui-scale, 1));
        border-radius:var(--radius-xl, 19px);
        overflow:hidden;
        flex:0 0 calc(62px * var(--ui-scale, 1));
        background:var(--home-avatar-bg, linear-gradient(135deg, #7c3aed 0%, #ec4899 100%));
        box-shadow:
          0 14px 30px color-mix(in srgb, var(--home-avatar-b, #000000) 24%, transparent),
          0 0 0 3px color-mix(in srgb, var(--home-avatar-a, #71717a) 24%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.10));
        transform:translateZ(0);
      }

      .home-ticket-avatar{
        position:relative;
        inline-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        block-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        border-radius:var(--radius-pill, 999px);
        overflow:hidden;
        flex:0 0 var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        background:var(--home-avatar-bg, linear-gradient(135deg, #55555d 0%, #303036 100%));
        box-shadow:
          0 10px 22px color-mix(in srgb, var(--home-avatar-b, #000000) 22%, transparent),
          0 0 0 3px color-mix(in srgb, var(--home-avatar-a, #71717a) 24%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transform:translateZ(0);
      }

      .home-user-avatar::after,
      .home-ticket-avatar::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        background:
          radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.08));
        pointer-events:none;
        mix-blend-mode:screen;
        z-index:3;
      }

      .home-user-avatar-img,
      .home-ticket-avatar-img{
        position:absolute;
        inset:0;
        z-index:2;
        display:block;
        inline-size:100%;
        block-size:100%;
        object-fit:cover;
      }

      .home-user-avatar-fallback,
      .home-ticket-avatar-fallback{
        position:absolute;
        inset:0;
        z-index:1;
        display:flex;
        align-items:center;
        justify-content:center;
        color:var(--avatar-text, #ffffff);
        letter-spacing:-.035em;
        text-shadow:
          0 1px 2px rgba(0,0,0,.22),
          0 0 16px rgba(255,255,255,.20);
      }

      .home-user-avatar-fallback{
        font-size:var(--font-3xl, 22px);
        font-weight:var(--weight-black, 800);
      }

      .home-ticket-avatar-fallback{
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-black, 800);
      }

      .home-user-avatar[data-fallback="true"] img,
      .home-ticket-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .home-hero-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-xs, 8px);
      }

      .home-page-kicker{
        inline-size:max-content;
        max-inline-size:100%;
        min-block-size:calc(28px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 11px);
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
        gap:7px;
        white-space:nowrap;
      }

      .home-page-kicker svg{
        inline-size:14px;
        block-size:14px;
      }

      .home-page-title{
        margin:0;
        max-inline-size:100%;
        font-size:clamp(var(--font-3xl, 28px), 3.25vw, var(--font-6xl, 48px));
        line-height:var(--line-tight, 1.02);
        letter-spacing:var(--view-title-letter, -.055em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        color:var(--text-strong, #ffffff);
        white-space:normal;
      }

      .home-page-subtitle{
        margin:0;
        max-inline-size:920px;
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.58);
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
      }

      .home-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .home-btn{
        appearance:none;
        min-block-size:var(--btn-height, 42px);
        padding-inline:var(--space-md, 16px);
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
        gap:8px;
        text-decoration:none;
        white-space:nowrap;
        box-shadow:var(--btn-secondary-shadow, var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16)));
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          filter var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .home-btn svg{
        inline-size:16px;
        block-size:16px;
      }

      .home-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .home-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .home-btn--primary{
        border-color:var(--home-create-border);
        background:var(--home-create-bg);
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:
          0 12px 28px color-mix(in srgb, var(--accent, #6f59d9), transparent 78%),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.10));
      }

      .home-btn--primary:hover{
        transform:translateY(-2px);
        border-color:var(--home-create-border);
        background:var(--home-create-bg-hover);
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:
          0 16px 34px color-mix(in srgb, var(--accent, #6f59d9), transparent 74%),
          0 0 0 1px color-mix(in srgb, var(--text-on-accent, #ffffff) 18%, transparent) inset;
        filter:none;
      }

      .home-btn:focus-visible,
      .home-detail-btn:focus-visible,
      .home-pagination-btn:focus-visible,
      .home-action-card:focus-visible,
      .home-widget-card:focus-visible,
      .home-activity-item:focus-visible{
        outline:none;
        box-shadow:var(--focus-ring, 0 0 0 4px rgba(113,113,122,.16));
      }

      .home-btn.is-loading,
      .home-detail-btn.is-loading,
      .home-action-card.is-loading{
        cursor:wait;
        opacity:.94;
      }

      .home-btn:disabled,
      .home-detail-btn:disabled,
      .home-action-card:disabled,
      .home-widget-card[aria-disabled="true"]{
        pointer-events:none;
        opacity:.54;
        filter:saturate(.75);
      }

      .home-hero-meta{
        margin-block-start:var(--space-md, 16px);
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .home-meta-pill{
        min-block-size:calc(30px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 12px);
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
        gap:7px;
        white-space:nowrap;
      }

      .home-meta-pill svg{
        inline-size:14px;
        block-size:14px;
      }

      .home-stats{
        margin-block-start:var(--space-md, 16px);
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .home-stat-card{
        --home-stat-color:var(--accent, #6f59d9);

        position:relative;
        display:grid;
        gap:var(--space-xs, 8px);
        min-block-size:calc(132px * var(--ui-scale, 1));
        padding:var(--space-md, 16px) var(--space-lg, 18px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
        overflow:hidden;
      }

      .home-stat-card::after{
        content:"";
        position:absolute;
        inset:auto -20% -44% auto;
        inline-size:128px;
        block-size:128px;
        border-radius:50%;
        pointer-events:none;
        background:color-mix(in srgb, var(--home-stat-color) 17%, transparent);
        filter:blur(8px);
      }

      .home-stat-card--open,
      .home-stat-card--activity{
        --home-stat-color:var(--accent, #6f59d9);
        border-color:var(--accent-border, var(--border-accent, rgba(113,113,122,.30)));
      }

      .home-stat-card--billing,
      .home-stat-card--files{
        --home-stat-color:var(--warning, #f59e0b);
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .home-stat-card--clients,
      .home-stat-card--users{
        --home-stat-color:var(--success, #22c55e);
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .home-stat-topline{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:var(--space-xs, 8px);
        min-inline-size:0;
      }

      .home-stat-icon{
        inline-size:34px;
        block-size:34px;
        border-radius:var(--radius-md, 12px);
        display:grid;
        place-items:center;
        color:var(--home-stat-color);
        background:color-mix(in srgb, var(--home-stat-color) 12%, transparent);
        border:1px solid color-mix(in srgb, var(--home-stat-color) 20%, transparent);
      }

      .home-stat-icon svg{
        inline-size:16px;
        block-size:16px;
      }

      .home-stat-badge{
        min-block-size:22px;
        padding-inline:8px;
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        color:var(--error, #ef4444);
        background:var(--error-bg, rgba(239,68,68,.10));
        border:1px solid var(--border-error, rgba(239,68,68,.30));
        font-size:10px;
        font-weight:900;
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
      }

      .home-stat-label{
        min-inline-size:0;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        color:var(--text-dim, rgba(245,245,245,.50));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-stat-value{
        font-size:clamp(28px, 3vw, var(--font-5xl, 40px));
        line-height:.92;
        letter-spacing:var(--letter-tight, -.03em);
        font-weight:var(--weight-black, 800);
        color:var(--text-strong, #ffffff);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-stat-text{
        font-size:var(--font-base, 13px);
        line-height:var(--line-normal, 1.42);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .home-widgets{
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
        min-inline-size:0;
      }

      .home-widgets > .home-cards-loading{
        grid-column:1 / -1;
      }

      .home-widget-card{
        position:relative;
        min-block-size:calc(126px * var(--ui-scale, 1));
        padding:var(--space-md, 16px);
        border-radius:var(--card-radius, 20px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        color:inherit;
        cursor:pointer;
        text-align:left;
        display:grid;
        align-content:start;
        gap:var(--space-2xs, 6px);
        overflow:hidden;
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.18)));
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .home-widget-card:hover{
        transform:translateY(-2px);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.25));
        border-color:color-mix(in srgb, var(--accent, #6f59d9) 26%, var(--border-strong, rgba(255,255,255,.12)));
      }

      .home-widget-glow{
        position:absolute;
        inset:auto -22% -48% auto;
        inline-size:130px;
        block-size:130px;
        border-radius:50%;
        pointer-events:none;
        background:color-mix(in srgb, var(--accent, #6f59d9) 13%, transparent);
        filter:blur(9px);
      }

      .home-widget-kicker{
        position:relative;
        z-index:1;
        font-size:10px;
        font-weight:900;
        letter-spacing:.085em;
        text-transform:uppercase;
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .home-widget-value{
        position:relative;
        z-index:1;
        font-size:var(--font-4xl, 30px);
        line-height:1;
        font-weight:var(--weight-black, 800);
        letter-spacing:-.045em;
        color:var(--text-strong, #ffffff);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-widget-title{
        position:relative;
        z-index:1;
        font-size:var(--font-md, 13px);
        line-height:1.22;
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .home-widget-text{
        position:relative;
        z-index:1;
        font-size:var(--font-sm, 12px);
        line-height:1.35;
        color:var(--text-muted, rgba(245,245,245,.70));
        overflow:hidden;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .home-widget-trend{
        position:relative;
        z-index:1;
        inline-size:max-content;
        max-inline-size:100%;
        min-block-size:22px;
        padding-inline:8px;
        border-radius:var(--radius-pill, 999px);
        background:color-mix(in srgb, var(--accent, #6f59d9) 12%, transparent);
        color:var(--accent-active, var(--text-strong, #ffffff));
        border:1px solid color-mix(in srgb, var(--accent, #6f59d9) 22%, transparent);
        font-size:10px;
        font-weight:900;
        letter-spacing:.035em;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .home-grid{
        display:grid;
        grid-template-columns:minmax(0, 1.05fr) minmax(320px, .95fr);
        gap:var(--space-lg, 18px);
        align-items:start;
        min-inline-size:0;
      }

      .home-panel,
      .home-tickets{
        position:relative;
        overflow:hidden;
        border-radius:var(--data-table-radius, var(--card-radius-lg, 22px));
        border:1px solid var(--data-table-border, var(--card-border, var(--border-default, rgba(255,255,255,.082))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--data-table-bg, var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88))));
        box-shadow:var(--data-table-shadow, var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24))));
        min-inline-size:0;
        max-inline-size:100%;
      }

      .home-panel-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-md, 14px);
        align-items:start;
        padding:var(--space-md, 14px) var(--space-lg, 18px) var(--space-sm, 12px);
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .home-panel-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 2px);
      }

      .home-panel-title{
        margin:0;
        font-size:var(--section-title-size, var(--font-xl, 16px));
        line-height:var(--line-snug, 1.22);
        font-weight:var(--section-title-weight, var(--weight-bold, 700));
        color:var(--section-title-color, var(--text-strong, #ffffff));
      }

      .home-panel-subtitle{
        margin:0;
        font-size:var(--section-subtitle-size, var(--font-sm, 12px));
        line-height:var(--line-normal, 1.42);
        color:var(--section-subtitle-color, var(--text-dim, rgba(245,245,245,.50)));
      }

      .home-actions-grid{
        padding:var(--space-md, 14px);
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .home-action-card{
        --home-action-color:var(--accent, #6f59d9);

        appearance:none;
        position:relative;
        min-block-size:calc(142px * var(--ui-scale, 1));
        padding:var(--space-md, 16px);
        border-radius:var(--card-radius, 20px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--text-strong, #ffffff) 4%, transparent), transparent 45%),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        color:var(--text-strong, #ffffff);
        cursor:pointer;
        text-align:left;
        display:grid;
        align-content:start;
        gap:var(--space-xs, 8px);
        overflow:hidden;
        box-shadow:var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16));
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .home-action-card::after{
        content:"";
        position:absolute;
        inset:auto -22% -44% auto;
        inline-size:128px;
        block-size:128px;
        border-radius:50%;
        pointer-events:none;
        background:color-mix(in srgb, var(--home-action-color) 15%, transparent);
        filter:blur(8px);
      }

      .home-action-card:hover{
        transform:translateY(-2px);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.25));
        border-color:color-mix(in srgb, var(--home-action-color) 34%, var(--border-strong, rgba(255,255,255,.12)));
      }

      .home-action-card--primary,
      .home-action-card--tickets,
      .home-action-card--account{
        --home-action-color:var(--accent, #6f59d9);
      }

      .home-action-card--billing{
        --home-action-color:var(--warning, #f59e0b);
      }

      .home-action-card--clients,
      .home-action-card--users{
        --home-action-color:var(--success, #22c55e);
      }

      .home-action-card-icon{
        position:relative;
        z-index:1;
        inline-size:36px;
        block-size:36px;
        border-radius:var(--radius-md, 13px);
        display:grid;
        place-items:center;
        color:var(--home-action-color);
        background:color-mix(in srgb, var(--home-action-color) 12%, transparent);
        border:1px solid color-mix(in srgb, var(--home-action-color) 22%, transparent);
      }

      .home-action-card-icon svg,
      .home-action-card-arrow svg{
        inline-size:16px;
        block-size:16px;
      }

      .home-action-card-kicker,
      .home-action-card-title,
      .home-action-card-text,
      .home-action-card-arrow{
        position:relative;
        z-index:1;
      }

      .home-action-card-kicker{
        font-size:10px;
        font-weight:900;
        letter-spacing:.085em;
        text-transform:uppercase;
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .home-action-card-title{
        font-size:var(--font-xl, 16px);
        line-height:1.15;
        font-weight:var(--weight-black, 800);
        letter-spacing:-.028em;
        color:var(--text-strong, #ffffff);
      }

      .home-action-card-text{
        font-size:var(--font-md, 13px);
        line-height:1.45;
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      .home-action-card-arrow{
        position:absolute;
        inset-block-end:14px;
        inset-inline-end:14px;
        color:color-mix(in srgb, var(--home-action-color) 72%, var(--text-strong, #ffffff));
        opacity:.72;
      }

      .home-activity-list{
        padding:var(--space-xs, 8px);
        display:grid;
        gap:var(--space-2xs, 6px);
      }

      .home-activity-item{
        --home-activity-color:var(--accent, #6f59d9);

        appearance:none;
        inline-size:100%;
        min-block-size:68px;
        padding:var(--space-xs, 10px);
        border:0;
        border-radius:var(--radius-lg, 16px);
        background:transparent;
        color:inherit;
        cursor:pointer;
        text-align:left;
        display:grid;
        grid-template-columns:36px minmax(0, 1fr) auto;
        gap:var(--space-xs, 10px);
        align-items:center;
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .home-activity-item:hover{
        background:color-mix(in srgb, var(--home-activity-color) 8%, transparent);
        transform:translateY(-1px);
      }

      .home-activity-item--invoice{
        --home-activity-color:var(--warning, #f59e0b);
      }

      .home-activity-item--client,
      .home-activity-item--user{
        --home-activity-color:var(--success, #22c55e);
      }

      .home-activity-icon{
        inline-size:34px;
        block-size:34px;
        border-radius:var(--radius-md, 12px);
        display:grid;
        place-items:center;
        color:var(--home-activity-color);
        background:color-mix(in srgb, var(--home-activity-color) 12%, transparent);
        border:1px solid color-mix(in srgb, var(--home-activity-color) 22%, transparent);
      }

      .home-activity-icon svg{
        inline-size:15px;
        block-size:15px;
      }

      .home-activity-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .home-activity-title{
        font-size:var(--font-md, 13px);
        line-height:1.15;
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-activity-text{
        font-size:var(--font-sm, 12px);
        line-height:1.35;
        color:var(--text-dim, rgba(245,245,245,.50));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-activity-time{
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-dim, rgba(245,245,245,.50));
        white-space:nowrap;
      }

      .home-pagination{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .home-pagination-status{
        min-block-size:calc(34px * var(--ui-scale, 1));
        padding-inline:10px;
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-dim, rgba(245,245,245,.50));
        background:var(--badge-bg, rgba(255,255,255,.048));
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
      }

      .home-pagination-btn{
        appearance:none;
        min-block-size:calc(38px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 14px);
        border-radius:var(--radius-md, 13px);
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-sm, 12px);
        font-weight:var(--weight-bold, 700);
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .home-pagination-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-strong, rgba(255,255,255,.12));
      }

      .home-pagination-btn[disabled],
      .home-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
        transform:none;
      }

      .home-table-wrap{
        position:relative;
        min-block-size:120px;
        min-inline-size:0;
        max-inline-size:100%;
      }

      .home-table-wrap.is-refreshing .home-table-shell{
        opacity:.56;
        filter:blur(.7px);
      }

      .home-table-shell{
        inline-size:100%;
        max-inline-size:100%;
        overflow-x:auto;
        overflow-y:hidden;
        scrollbar-width:thin;
        scrollbar-color:var(--scrollbar-thumb, rgba(255,255,255,.12)) transparent;
      }

      .home-table-shell::-webkit-scrollbar{
        block-size:var(--scrollbar-size, 10px);
      }

      .home-table-shell::-webkit-scrollbar-track{
        background:transparent;
      }

      .home-table-shell::-webkit-scrollbar-thumb{
        border:2px solid transparent;
        border-radius:999px;
        background:var(--scrollbar-thumb, rgba(255,255,255,.12));
        background-clip:padding-box;
      }

      .home-table{
        display:table !important;
        inline-size:100%;
        min-inline-size:0;
        max-inline-size:100%;
        table-layout:fixed;
        border-collapse:separate;
        border-spacing:0;
        background:var(--table-bg, transparent);
        margin:0;
      }

      .home-table colgroup{
        display:table-column-group !important;
      }

      .home-table col{
        display:table-column !important;
      }

      .home-table thead{
        display:table-header-group !important;
      }

      .home-table tbody{
        display:table-row-group !important;
      }

      .home-table tr{
        display:table-row !important;
      }

      .home-table th,
      .home-table td{
        display:table-cell !important;
      }

      .home-table thead th{
        position:sticky;
        top:0;
        z-index:2;
        block-size:44px;
        padding:var(--table-cell-padding-y, 12px) var(--table-cell-padding-x, 12px);
        text-align:center;
        vertical-align:middle;
        font-size:var(--data-table-head-font-size, var(--font-xs, 11px));
        font-weight:var(--data-table-head-font-weight, var(--weight-bold, 700));
        letter-spacing:var(--data-table-head-letter, .075em);
        text-transform:uppercase;
        color:var(--data-table-head-text, var(--text-dim, rgba(245,245,245,.50)));
        background:var(--data-table-head-bg, var(--table-head-bg, rgba(255,255,255,.020)));
        border-bottom:1px solid var(--table-head-border, var(--border-default, rgba(255,255,255,.082)));
        white-space:nowrap;
      }

      .home-table thead th:first-child{
        text-align:left;
        padding-inline-start:24px;
      }

      .home-table thead th:last-child,
      .home-table tbody td:last-child{
        padding-inline-end:18px;
      }

      .home-table tbody tr{
        block-size:var(--home-table-row-height);
      }

      .home-table tbody td{
        padding:calc(12px * var(--ui-scale, 1)) var(--table-cell-padding-x, 12px);
        vertical-align:middle;
        border-bottom:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
        background:transparent;
      }

      .home-table tbody tr:last-child td{
        border-bottom:none;
      }

      .home-table tbody tr:nth-child(even) td{
        background:color-mix(in srgb, var(--surface-elevated, rgba(39,39,42,.88)) 86%, transparent);
      }

      .home-ticket-row{
        --home-row-accent:var(--accent, #6f59d9);
      }

      .home-ticket-row:hover{
        background:var(--data-table-row-hover, var(--table-row-hover, rgba(255,255,255,.024)));
      }

      .home-ticket-row--pending{
        --home-row-accent:var(--warning, #f59e0b);
      }

      .home-ticket-row--open{
        --home-row-accent:var(--accent, #6f59d9);
      }

      .home-ticket-row--progress{
        --home-row-accent:var(--info, #94a3b8);
      }

      .home-ticket-row--resolved,
      .home-ticket-row--closed{
        --home-row-accent:var(--success, #22c55e);
      }

      .home-ticket-cell{
        min-inline-size:0;
      }

      .home-ticket-cell--main{
        position:relative;
        text-align:left;
        padding-inline-start:18px !important;
      }

      .home-ticket-cell--main::before{
        content:"";
        position:absolute;
        inset-block:10px;
        inset-inline-start:0;
        inline-size:3px;
        border-radius:0 999px 999px 0;
        background:var(--home-row-accent);
        opacity:.68;
        transform:scaleY(.72);
        transition:
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .home-ticket-row:hover .home-ticket-cell--main::before{
        opacity:1;
        transform:scaleY(1);
      }

      .home-ticket-cell--owner,
      .home-ticket-cell--status,
      .home-ticket-cell--date,
      .home-ticket-cell--attachments,
      .home-ticket-cell--actions{
        text-align:center;
      }

      .home-ticket-cell--status > *,
      .home-ticket-cell--attachments > *,
      .home-ticket-cell--actions > *{
        margin-inline:auto;
      }

      .home-ticket-main{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1))) minmax(0, 1fr);
        gap:var(--space-sm, 12px);
        align-items:center;
        min-inline-size:0;
        padding-inline-start:6px;
      }

      .home-ticket-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .home-ticket-line{
        display:flex;
        align-items:center;
        gap:7px;
        min-inline-size:0;
      }

      .home-ticket-id{
        min-inline-size:0;
        font-size:var(--font-sm, 12px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.055em;
        color:var(--text-dim, rgba(245,245,245,.50));
        text-transform:uppercase;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-ticket-subject{
        font-size:var(--font-lg, 15px);
        line-height:1.14;
        font-weight:var(--weight-black, 800);
        letter-spacing:var(--letter-tight, -.03em);
        color:var(--text-strong, #ffffff);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .home-ticket-description{
        font-size:var(--font-md, 13px);
        line-height:1.3;
        color:var(--text-dim, rgba(245,245,245,.50));
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-ticket-badges{
        display:flex;
        align-items:center;
        flex-wrap:wrap;
        gap:5px;
        margin-block-start:3px;
      }

      .home-ticket-owner{
        display:grid;
        gap:3px;
        min-inline-size:0;
        max-inline-size:180px;
        margin-inline:auto;
        text-align:left;
      }

      .home-ticket-owner strong,
      .home-ticket-owner span{
        min-inline-size:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-ticket-owner strong{
        font-size:var(--font-sm, 12px);
        line-height:1.2;
        font-weight:var(--weight-bold, 700);
        color:var(--text-soft, rgba(245,245,245,.88));
      }

      .home-ticket-owner span{
        font-size:var(--font-xs, 11px);
        line-height:1.2;
        font-weight:var(--weight-semibold, 600);
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .home-mini-badge{
        min-block-size:20px;
        padding-inline:7px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        gap:4px;
        border:1px solid var(--badge-border, rgba(255,255,255,.07));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:10px;
        font-weight:800;
        line-height:1;
        letter-spacing:.035em;
        text-transform:uppercase;
        white-space:nowrap;
        max-inline-size:160px;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .home-mini-badge svg{
        inline-size:12px;
        block-size:12px;
        flex:0 0 auto;
      }

      .home-mini-badge--critical,
      .home-mini-badge--urgent{
        color:var(--error, #ef4444);
        background:var(--error-bg, rgba(239,68,68,.10));
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .home-mini-badge--medium{
        color:var(--warning, #f59e0b);
        background:var(--warning-bg, rgba(245,158,11,.10));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .home-mini-badge--low{
        color:var(--info, #94a3b8);
        background:var(--info-bg, rgba(148,163,184,.10));
        border-color:var(--border-info, rgba(148,163,184,.28));
      }

      .home-mini-badge--agent,
      .home-mini-badge--category{
        color:var(--text-dim, rgba(245,245,245,.50));
      }

      .home-chip{
        min-block-size:var(--chip-height, calc(26px * var(--ui-scale, 1)));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
        box-shadow:var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .home-chip-dot{
        inline-size:6px;
        block-size:6px;
        border-radius:999px;
        background:currentColor;
        box-shadow:0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
      }

      .home-chip--pending{
        color:var(--warning, #f59e0b);
        background:color-mix(in srgb, var(--warning-bg, rgba(245,158,11,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .home-chip--open{
        color:var(--text-strong, #ffffff);
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--text-strong, #ffffff), transparent 94%),
            transparent 48%
          ),
          color-mix(
            in srgb,
            var(--accent, #3f3f46) 34%,
            var(--surface-active, rgba(255,255,255,.066)) 66%
          );
        border-color:color-mix(
          in srgb,
          var(--accent, #3f3f46) 54%,
          var(--border-strong, rgba(255,255,255,.12)) 46%
        );
      }

      .home-chip--progress{
        color:var(--info, #94a3b8);
        background:color-mix(in srgb, var(--info-bg, rgba(148,163,184,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-info, rgba(148,163,184,.28));
      }

      .home-chip--resolved,
      .home-chip--closed{
        color:var(--success, #22c55e);
        background:color-mix(in srgb, var(--success-bg, rgba(34,197,94,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .home-date-inline{
        display:inline-flex;
        justify-content:center;
        inline-size:100%;
        white-space:nowrap;
        font-size:var(--font-sm, 12px);
        line-height:1.2;
        font-weight:var(--weight-semibold, 600);
        font-variant-numeric:tabular-nums;
        color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88)));
      }

      .home-attachments-pill{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:5px;
        min-inline-size:48px;
        min-block-size:calc(30px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        white-space:nowrap;
        color:var(--chip-text, var(--text-soft, rgba(245,245,245,.88)));
        background:var(--chip-bg, rgba(255,255,255,.034));
        border:1px solid var(--chip-border, rgba(255,255,255,.07));
      }

      .home-attachments-pill svg{
        inline-size:13px;
        block-size:13px;
        flex:0 0 auto;
      }

      .home-ticket-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .home-detail-btn{
        appearance:none;
        inline-size:calc(96px * var(--ui-scale, 1));
        min-inline-size:calc(96px * var(--ui-scale, 1));
        max-inline-size:calc(96px * var(--ui-scale, 1));
        min-block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding-inline:var(--space-xs, 8px);
        border-radius:var(--radius-md, 10px);
        border:1px solid var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color var(--duration-fast, .16s) var(--ease-standard, ease),
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          color var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease),
          filter var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .home-detail-btn:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        color:var(--text-strong, #ffffff);
        transform:translateY(var(--ui-hover-lift, -1px));
      }

      .home-detail-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .home-detail-icon{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .home-detail-icon svg{
        inline-size:14px;
        block-size:14px;
      }

      .home-detail-btn.is-loading{
        justify-content:center;
      }

      .home-loader-only{
        display:inline-flex;
        inline-size:16px;
        block-size:16px;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .home-inline-loading{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 7px);
        white-space:nowrap;
      }

      .home-inline-loading-text{
        display:inline-block;
      }

      .home-inline-spinner{
        inline-size:14px;
        block-size:14px;
        border-radius:var(--radius-pill, 999px);
        border:2px solid var(--loader-ring, rgba(255,255,255,.12));
        border-top-color:currentColor;
        animation:homeSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .home-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:color-mix(in srgb, var(--backdrop-bg, rgba(10,10,12,.28)) 72%, transparent);
        backdrop-filter:var(--blur-sm, blur(8px));
        -webkit-backdrop-filter:var(--blur-sm, blur(8px));
      }

      .home-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-block-size:var(--btn-height, 42px);
        padding-inline:var(--space-md, 16px);
        border-radius:var(--radius-md, 14px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));
        color:var(--text-soft, rgba(245,245,245,.88));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28));
      }

      .home-table-loading{
        padding:var(--space-sm, 12px) var(--space-lg, 18px) var(--space-md, 16px);
        display:grid;
        gap:var(--space-sm, 12px);
      }

      .home-table-loading-row{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, 44px) minmax(220px, 1fr) 132px 98px 122px 116px 48px 96px;
        gap:var(--space-sm, 12px);
        align-items:center;
      }

      .home-table-loading-copy{
        display:grid;
        gap:var(--space-xs, 7px);
      }

      .home-cards-loading{
        padding:var(--space-md, 14px);
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .home-card-skeleton{
        min-block-size:calc(142px * var(--ui-scale, 1));
        padding:var(--space-md, 16px);
        border-radius:var(--card-radius, 20px);
        border:1px solid var(--card-border, rgba(255,255,255,.07));
        background:var(--card-bg, rgba(255,255,255,.044));
        display:grid;
        align-content:start;
        gap:var(--space-xs, 10px);
      }

      .home-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:var(--skeleton-radius, var(--radius-md, 13px));
        background:var(--skeleton-bg, rgba(255,255,255,.050));
      }

      .home-skeleton::after{
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
        animation:homeSkeleton 1.2s var(--ease-standard, ease-in-out) infinite;
      }

      .home-skeleton--avatar{
        inline-size:var(--avatar-size-lg, 44px);
        block-size:var(--avatar-size-lg, 44px);
        border-radius:var(--radius-pill, 999px);
      }

      .home-skeleton--icon{
        inline-size:36px;
        block-size:36px;
        border-radius:var(--radius-md, 13px);
      }

      .home-skeleton--xs{
        inline-size:120px;
        block-size:var(--skeleton-height-sm, 10px);
      }

      .home-skeleton--lg{
        inline-size:74%;
        block-size:var(--skeleton-height-md, 14px);
      }

      .home-skeleton--md{
        inline-size:56%;
        block-size:12px;
      }

      .home-skeleton--xl{
        inline-size:82%;
        block-size:22px;
      }

      .home-skeleton--owner{
        inline-size:124px;
        block-size:28px;
        border-radius:var(--radius-md, 13px);
      }

      .home-skeleton--pill{
        inline-size:92px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .home-skeleton--date{
        inline-size:112px;
        block-size:12px;
      }

      .home-skeleton--attach{
        inline-size:48px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .home-skeleton--btn{
        inline-size:calc(96px * var(--ui-scale, 1));
        block-size:var(--btn-height-sm, 34px);
        border-radius:var(--radius-md, 12px);
      }

      .home-empty{
        display:grid;
        justify-items:center;
        gap:var(--space-xs, 8px);
        padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px);
        text-align:center;
      }

      .home-empty-icon{
        inline-size:54px;
        block-size:54px;
        display:grid;
        place-items:center;
        border-radius:var(--radius-xl, 18px);
        border:1px solid var(--state-empty-border, rgba(148,163,184,.20));
        background:var(--state-empty-bg, rgba(148,163,184,.10));
        color:var(--state-empty-icon, var(--info, #94a3b8));
        box-shadow:var(--shadow-soft, 0 8px 18px rgba(0,0,0,.13));
      }

      .home-empty-icon svg{
        inline-size:24px;
        block-size:24px;
      }

      .home-empty-title{
        margin:0;
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
        color:var(--text-strong, #ffffff);
      }

      .home-empty-text{
        margin:0;
        max-inline-size:58ch;
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
        color:var(--text-muted, rgba(245,245,245,.70));
      }

      @keyframes homeSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes homeSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .home-hero,
      [data-theme="light"] .home-panel,
      [data-theme="light"] .home-tickets,
      [data-theme="light"] .home-widget-card{
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent, #6f59d9) 9%, transparent), transparent 38%),
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--info, #3b82a6) 7%, transparent), transparent 34%),
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
      }

      [data-theme="light"] .home-stat-card,
      [data-theme="light"] .home-action-card,
      [data-theme="light"] .home-card-skeleton{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--card-bg, var(--surface-elevated, #ffffff));
      }

      [data-theme="light"] .home-btn--primary{
        --home-create-bg:var(--btn-primary-bg, linear-gradient(135deg, var(--accent, #6f59d9) 0%, var(--accent-hover, #5f45d8) 100%));
        --home-create-bg-hover:var(--home-create-bg);
        --home-create-border:color-mix(in srgb, var(--accent, #6f59d9) 44%, transparent);
      }

      [data-theme="light"] .home-chip--open{
        color:var(--accent-active, #533cb6);
        background:var(--accent-soft, rgba(111,89,217,.125));
        border-color:var(--accent-border-strong, rgba(111,89,217,.36));
      }

      [data-theme="light"] .home-chip--pending{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .home-chip--progress{
        color:var(--info-hover, #2f6d8d);
        background:var(--info-soft, rgba(59,130,166,.12));
        border-color:var(--border-info, rgba(59,130,166,.245));
      }

      [data-theme="light"] .home-chip--resolved,
      [data-theme="light"] .home-chip--closed{
        color:var(--success-hover, #157a4f);
        background:var(--success-soft, rgba(31,157,104,.12));
        border-color:var(--border-success, rgba(22,163,74,.245));
      }

      [data-theme="light"] .home-mini-badge--critical,
      [data-theme="light"] .home-mini-badge--urgent{
        color:var(--error-hover, #b52a39);
        background:var(--error-soft, rgba(216,60,77,.12));
        border-color:var(--border-error, rgba(220,38,38,.245));
      }

      [data-theme="light"] .home-mini-badge--medium{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .home-mini-badge--low{
        color:var(--info-hover, #2f6d8d);
        background:var(--info-soft, rgba(59,130,166,.12));
        border-color:var(--border-info, rgba(59,130,166,.245));
      }

      [data-theme="light"] .home-inline-spinner{
        border-color:rgba(15,23,42,.16);
        border-top-color:currentColor;
      }

      @media (max-width: 1240px){
        .home-stats,
        .home-widgets{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }

        .home-grid{
          grid-template-columns:1fr;
        }
      }

      @media (max-width: 1180px){
        .home-hero{
          padding:var(--space-lg, 20px);
        }

        .home-hero-top{
          grid-template-columns:1fr;
        }

        .home-hero-actions{
          justify-content:flex-start;
        }
      }

      @media (max-width: 1100px){
        .home-table{
          min-inline-size:1040px;
        }
      }

      @media (max-width: 820px){
        .home-actions-grid,
        .home-cards-loading{
          grid-template-columns:1fr;
        }

        .home-panel-head{
          grid-template-columns:1fr;
        }

        .home-pagination{
          justify-content:flex-start;
        }
      }

      @media (max-width: 760px){
        :where(.home-view-root, [data-home-scope]){
          gap:var(--space-md, 16px);
        }

        .home-hero,
        .home-panel,
        .home-tickets{
          border-radius:var(--radius-xl, 18px);
        }

        .home-hero{
          padding:var(--space-lg, 18px) var(--space-md, 16px);
        }

        .home-hero-main{
          grid-template-columns:1fr;
        }

        .home-user-avatar{
          inline-size:52px;
          block-size:52px;
          border-radius:17px;
        }

        .home-page-title{
          font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px));
          line-height:1;
        }

        .home-page-subtitle{
          font-size:var(--font-base, 14px);
        }

        .home-hero-actions{
          inline-size:100%;
        }

        .home-btn{
          flex:1 1 auto;
        }

        .home-stats,
        .home-widgets{
          grid-template-columns:1fr;
        }

        .home-activity-item{
          grid-template-columns:36px minmax(0, 1fr);
        }

        .home-activity-time{
          grid-column:2;
        }
      }

      @media (max-width: 520px){
        .home-meta-pill{
          inline-size:100%;
          justify-content:center;
        }

        .home-hero-actions{
          display:grid;
          grid-template-columns:1fr;
        }

        .home-btn{
          inline-size:100%;
        }
      }

      @media (prefers-reduced-motion: reduce){
        :where(.home-view-root, [data-home-scope]) *,
        :where(.home-view-root, [data-home-scope]) *::before,
        :where(.home-view-root, [data-home-scope]) *::after{
          animation:none !important;
          transition:none !important;
        }
      }
    </style>
  `;
}

/* =========================================================
   HEADER / HERO
========================================================= */

export function renderHomeHeader(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const stats = computeHomeStats(data);

  const displayName = getDisplayName(data);
  const roleLabel = stats.admin ? "ADMIN" : "USER";

  const title = safeText(
    first(
      data.title,
      state.title,
      stats.admin ? "Panel de control" : `Hola, ${displayName}`
    ),
    stats.admin ? "Panel de control" : "Tu home"
  );

  const subtitle = safeText(
    first(
      data.subtitle,
      state.subtitle,
      stats.admin
        ? "Resumen operativo de Onion Support: incidencias, facturación, clientes y usuarios desde una vista clara y accionable."
        : "Consulta tus incidencias, revisa tu actividad reciente y accede rápidamente a las zonas principales de tu cuenta."
    ),
    ""
  );

  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);
  const creating = Boolean(state.creating);

  const lastUpdatedAt = first(
    data.lastUpdatedAt,
    state.lastUpdatedAt,
    state.lastSyncAt,
    getDashboard(data).updatedAt,
    getDashboard(data).generatedAt,
    stats.lastTicketUpdate
  );

  return `
    ${renderMaybeStyles(Boolean(data.includeStyles))}

    <section class="home-hero home-hero--${stats.admin ? "admin" : "user"}">
      <div class="home-hero-top">
        <div class="home-hero-main">
          ${renderUserAvatar(data)}

          <div class="home-hero-copy">
            <span class="home-page-kicker">
              ${icon(stats.admin ? "shield" : "home")}
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
            class="home-btn${refreshing ? " is-loading" : ""}"
            data-home-action="refresh"
            data-action="refresh"
            title="Actualizar home"
            data-tooltip="Actualizar home"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : `${icon("refresh")}<span class="home-btn-text">Actualizar</span>`
            }
          </button>

          ${
            stats.admin
              ? `
                <button
                  type="button"
                  id="home-admin-users-btn"
                  class="home-btn"
                  data-home-action="go-usuarios"
                  data-action="navigate-home"
                  data-route="${HOME_ROUTES.USUARIOS}"
                  title="Gestionar usuarios"
                  data-tooltip="Gestionar usuarios"
                  ${loading || refreshing ? "disabled" : ""}
                >
                  ${icon("users")}
                  <span class="home-btn-text">Gestionar usuarios</span>
                </button>
              `
              : `
                <button
                  type="button"
                  id="home-create-ticket-btn"
                  class="home-btn home-btn--primary${creating ? " is-loading" : ""}"
                  data-home-action="create-incidencia"
                  data-action="navigate-home"
                  data-route="${HOME_ROUTES.INCIDENCIAS}"
                  title="Crear incidencia"
                  data-tooltip="Crear incidencia"
                  ${creating ? 'disabled aria-busy="true"' : ""}
                >
                  ${
                    creating
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
          ${escapeHtml(`${formatNumber(stats.totalTickets)} incidencias registradas`)}
        </span>

        <span class="home-meta-pill">
          ${icon("invoice")}
          ${escapeHtml(`${formatNumber(stats.pendingInvoices)} facturas pendientes`)}
        </span>

        <span class="home-meta-pill">
          ${icon("activity")}
          ${escapeHtml(`Salud operativa · ${Math.round(stats.healthRatio)}%`)}
        </span>

        <span class="home-meta-pill">
          ${icon("refresh")}
          ${
            lastUpdatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(lastUpdatedAt)}`)
              : "Sin actualizaciones recientes"
          }
        </span>
      </div>

      <div class="home-stats">
        ${getStatCards(data).map((card) => renderStatCard(card)).join("")}
      </div>
    </section>
  `;
}

/* =========================================================
   WIDGETS
========================================================= */

export function renderHomeWidgets(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const loading = Boolean(state.loading);
  const widgets = getWidgets(data).slice(0, 4);

  if (!loading && !widgets.length) {
    return "";
  }

  return `
    ${renderMaybeStyles(Boolean(data.includeStyles))}

    <section class="home-widgets" aria-label="Widgets del dashboard">
      ${
        loading && !widgets.length
          ? renderCardLoading(4)
          : widgets.map((widget, index) => renderWidgetCard(widget, index)).join("")
      }
    </section>
  `;
}

/* =========================================================
   QUICK ACTIONS
========================================================= */

export function renderHomeQuickActions(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const loading = Boolean(state.loading);

  return `
    ${renderMaybeStyles(Boolean(data.includeStyles))}

    <section class="home-panel home-panel--actions">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <h2 class="home-panel-title">Accesos rápidos</h2>
          <p class="home-panel-subtitle">
            ${escapeHtml(
              isAdminRole(getRole(data))
                ? "Atajos principales para operar el panel administrativo."
                : "Acciones principales para moverte por tu cuenta."
            )}
          </p>
        </div>
      </div>

      ${
        loading
          ? renderCardLoading(4)
          : `
            <div class="home-actions-grid">
              ${getQuickActions(data).map((action) => renderQuickAction(action, state)).join("")}
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
  const state = safeObject(data.state);
  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);

  const activity = getActivity(data).slice(0, 8);

  return `
    ${renderMaybeStyles(Boolean(data.includeStyles))}

    <section class="home-panel home-panel--activity">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <h2 class="home-panel-title">Actividad reciente</h2>
          <p class="home-panel-subtitle">
            ${
              loading
                ? "Cargando actividad..."
                : escapeHtml(`${formatNumber(activity.length)} movimientos recientes detectados`)
            }
          </p>
        </div>
      </div>

      <div class="home-table-wrap${refreshing ? " is-refreshing" : ""}">
        ${refreshing && activity.length ? renderRefreshOverlay() : ""}

        ${
          loading && !activity.length
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
                })
        }
      </div>
    </section>
  `;
}

/* =========================================================
   TICKETS TABLE
========================================================= */

export function renderHomeTicketsTable(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const collections = getCollections(data);

  const tickets = collections.tickets;
  const pagination = getPagination(tickets, {
    ...data,
    remoteCount: collections.ticketsRemoteCount,
  });

  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);
  const hasError = Boolean(safeText(first(state.error, data.error), ""));

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  return `
    ${renderMaybeStyles(Boolean(data.includeStyles))}

    <section class="home-tickets">
      <div class="home-panel-head">
        <div class="home-panel-copy">
          <h2 class="home-panel-title">
            ${escapeHtml(isAdminRole(getRole(data)) ? "Incidencias recientes" : "Tus últimas incidencias")}
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

        <div class="home-pagination" aria-label="Paginación del home">
          <button
            type="button"
            class="home-pagination-btn"
            data-home-action="prev-page"
            data-action="prev-page"
            data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
            ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            Anterior
          </button>

          <span class="home-pagination-status">
            ${escapeHtml(`${pagination.currentPage}/${pagination.totalPages}`)}
          </span>

          <button
            type="button"
            class="home-pagination-btn home-pagination-btn--next"
            data-home-action="next-page"
            data-action="next-page"
            data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
            ${!pagination.hasNext || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            Siguiente
          </button>
        </div>
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || DEFAULT_PAGE_SIZE))
          : `
            <div class="home-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="home-table-shell">
                      <table class="home-table" role="table" aria-label="Resumen de incidencias del home">
                        <colgroup>
                          <col>
                          <col style="width:150px;">
                          <col style="width:118px;">
                          <col style="width:146px;">
                          <col style="width:134px;">
                          <col style="width:70px;">
                          <col style="width:116px;">
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
                      title: hasError
                        ? "No se pudieron cargar las incidencias"
                        : "No hay incidencias para mostrar",
                      text: hasError
                        ? "Puedes reintentar la carga desde el botón de actualizar."
                        : "Cuando haya solicitudes registradas aparecerán aquí.",
                      action: hasError ? "retry" : "",
                      actionLabel: "Reintentar",
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

export function renderHomeLoadingState({ includeStyles = false } = {}) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="home-panel">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderHomeErrorState(
  message = "No se pudo cargar el home.",
  { includeStyles = false } = {}
) {
  return `
    ${renderMaybeStyles(includeStyles)}

    <section class="home-panel">
      ${renderEmptyState({
        title: "No se pudo renderizar el home",
        text: safeText(message, "Error desconocido al cargar la vista."),
        action: "retry",
        actionLabel: "Reintentar",
      })}
    </section>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderHomeTemplate(input = {}) {
  const data = safeObject(input);

  const payload = {
    ...data,
    includeStyles: false,
    state: safeObject(data.state),
  };

  return `
    <section class="home-view-root" data-home-scope="true">
      ${renderStyles()}
      ${renderHomeHeader(payload)}
      ${renderHomeWidgets(payload)}

      <section class="home-grid">
        ${renderHomeQuickActions(payload)}
        ${renderHomeActivity(payload)}
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

export default renderHomeTemplate;
