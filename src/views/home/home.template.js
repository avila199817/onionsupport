/* =========================================================
   Onion SPA - Home Dashboard Template
   Archivo: src/views/home/home.template.js

   FINAL EXTREME PRODUCTION TEMPLATE · HOME VIEW · USER + ADMIN
   APPLE SAAS MODE · FACTURAS/INCIDENCIAS INSPIRED · 12/10

   PATCH · TEMPLATE CLEAN
   PATCH · CSS EXTERNALIZED
   PATCH · NO STYLE TAGS
   PATCH · NO INLINE CSS
   PATCH · SELECTORS MOVED TO home.selectors.js
   PATCH · HTML ONLY OWNER
   PATCH · SUMMARY/WIDGETS/COUNTERS FIXED THROUGH SELECTORS

   RESPONSABILIDADES:
   - render del home/dashboard para usuarios y administradores
   - una única plantilla role-aware: user/admin/admin-like
   - consumir datos normalizados desde home.selectors.js
   - NO hacer fetch
   - NO calcular normalización pesada dentro del template
   - NO inyectar CSS desde JS
   - NO usar estilos inline
   - pintar hero, stats, widgets, acciones rápidas, actividad y tabla
   - compatible con HomeView.js o render directo desde Router
   - acciones compatibles con data-home-action y data-action
   - CSP friendly: sin handlers inline tipo onerror
========================================================= */

import {
  DEFAULT_PAGE_SIZE,
  HOME_ROUTES,

  safeText,
  safeObject,
  first,
  isSameIdentity,
  normalizeRoute,

  formatNumber,
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

  return `
    <div
      class="home-user-avatar${avatarUrl ? "" : " home-user-avatar--fallback"}"
      aria-label="${escapeHtml(fullName)}"
      title="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-avatar-root="true"
      data-avatar-kind="user"
      data-avatar-seed="${escapeHtml(seed)}"
      data-avatar-initials="${escapeHtml(initials)}"
      ${avatarUrl ? "" : 'data-fallback="true"'}
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
  const seed = safeText(`${getTicketId(item)}|${fullName}`, "home-ticket");

  return `
    <div
      class="home-ticket-avatar${avatarUrl ? "" : " home-ticket-avatar--fallback"}"
      aria-label="${escapeHtml(fullName)}"
      title="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-avatar-root="true"
      data-avatar-kind="ticket"
      data-avatar-seed="${escapeHtml(seed)}"
      data-avatar-initials="${escapeHtml(initials)}"
      ${avatarUrl ? "" : 'data-fallback="true"'}
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
  const modifier = safeText(card.modifier, "");

  return `
    <article class="home-stat-card${modifier ? ` home-stat-card--${escapeHtml(modifier)}` : ""}">
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

  const actionName = safeText(action.action, "");
  const dataAction = safeText(action.dataAction || actionName, actionName);
  const route = safeText(action.route, "");
  const modifier = safeText(action.modifier, "default");

  const isBusy =
    navigatingAction === actionName ||
    (actionName === "create-incidencia" && creating);

  return `
    <button
      type="button"
      class="home-action-card home-action-card--${escapeHtml(modifier)}${isBusy ? " is-loading" : ""}"
      data-home-action="${escapeHtml(actionName)}"
      data-action="${escapeHtml(dataAction)}"
      data-route="${escapeHtml(route)}"
      ${isBusy || loading || refreshing ? 'disabled aria-busy="true"' : ""}
    >
      <span class="home-action-card-icon" aria-hidden="true">
        ${icon(action.iconName || "arrowRight")}
      </span>

      <span class="home-action-card-kicker">${escapeHtml(route || "Onion Support")}</span>

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

export function renderHomeLoadingState() {
  return `
    <section class="home-panel">
      ${renderTableLoading(DEFAULT_PAGE_SIZE)}
    </section>
  `;
}

export function renderHomeErrorState(message = "No se pudo cargar el home.") {
  return `
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
