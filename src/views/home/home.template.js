/* =========================================================
   Onion Support - Home Template
   Archivo: /src/views/home/home.template.js

   Responsabilidad:
   - Render HTML puro de Home.
   - Consumir view-model desde home.selectors.js.
   - Calcular el modelo una sola vez por render.
   - Home simple, visual y directo.
   - Header limpio con CTA para crear incidencia.
   - Sin accesos rápidos duplicados, widgets duplicados, health/server/ping,
     CSV, refresh superior ni card redundante para usuario normal.
   - Textos visibles en español.
   - Sin DOM API, listeners, Auth, Router, AppCore, HTTP, storage,
     CSS inline ni handlers inline.
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
  normalizeKey,

  formatNumber,
  formatMoney,
  formatDateTime,
  formatRelativeDate,
  formatLastUpdate,

  getInitials,

  buildHomeTemplateData,

  getTicketId,
  getTicketSubject,
  getTicketDescription,
  getTicketStatusKey,
  getTicketStatusLabel,
  getTicketPriorityKey,
  getTicketPriorityLabel,
  getTicketCategory,
  getTicketCreatedAt,
  getTicketUpdatedAt,
  getTicketOwnerName,
  getTicketAvatarUrl,

  getInvoiceId,
  getInvoicePaidAmount,
  getInvoiceCurrency,
  getInvoiceStatusKey,
  getInvoiceStatusLabel,
  isInvoicePaid,

  getActivityTitle,
  getActivityText,
  getActivityDate,
  getActivityType,
} from "./home.selectors.js";

export const TEMPLATE_VERSION = "home.template.v21";

const ACTIONS = Object.freeze({
  RETRY: "retry",
  CREATE_INCIDENCIA: "create_incidencia",
  NAVIGATE: "navigate_home",
  OPEN_TICKET_DETAIL: "open_ticket_detail",
  CLOSE_TICKET_DETAIL: "close_ticket_detail",
  PAGE_PREV: "page_prev",
  PAGE_NEXT: "page_next",
});

const LIMITS = Object.freeze({
  activity: 5,
  invoices: 5,
  entities: 5,
  tickets: 5,
});

const AVATAR_TONES = Object.freeze([
  "violet",
  "green",
  "cyan",
  "amber",
  "rose",
  "slate",
]);

/* =========================================================
   HTML / SANITIZE
========================================================= */

function redact(value = "") {
  return String(value || "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(redact(safeText(value, "")));
}

function joinClasses(...values) {
  return values
    .flat(Infinity)
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" ");
}

function jsonAttr(value = {}) {
  try {
    return escapeHtml(JSON.stringify(safeObject(value)));
  } catch {
    return "{}";
  }
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
    String(value || "")
  );
}

function safeImageSrc(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (raw.length > 2048) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    raw.includes("/") ||
    /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i.test(raw)
  ) {
    const clean = raw
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\/{2,}/g, "/");

    return clean ? `/${clean}` : "";
  }

  return "";
}

function safeRoute(value = "", fallback = "") {
  const route = safeText(value, "");

  if (!route) return fallback;
  if (!route.startsWith("/")) return fallback;
  if (route.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(route)) return fallback;
  if (/[\r\n\t\\]/.test(route)) return fallback;
  if (hasSensitiveQuery(route)) return fallback;

  return route;
}

const ROUTE_TARGETS = Object.freeze({
  INCIDENCIAS: safeRoute(HOME_ROUTES.INCIDENCIAS, "/incidencias"),
  FACTURAS: safeRoute(HOME_ROUTES.FACTURAS, "/facturas"),
});

function hashString(value = "") {
  const text = safeText(value, "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function avatarTone(seed = "") {
  const index = hashString(seed || "avatar") % AVATAR_TONES.length;
  return AVATAR_TONES[index] || "violet";
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
    arrowRight: `<svg ${common}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  };

  return icons[name] || icons.activity;
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildTemplateViewModel(input = {}) {
  const data = safeObject(input);
  const view = buildHomeTemplateData(data);
  const state = safeObject(first(data.state, view.state, {}));
  const dashboard = safeObject(view.dashboard);
  const user = safeObject(view.user);

  const role = safeText(first(view.role, data.role, state.role, dashboard.role, user.role, "user"), "user").toLowerCase() === "admin"
    ? "admin"
    : "user";

  const admin = Boolean(
    view.admin === true ||
      data.admin === true ||
      state.admin === true ||
      dashboard.admin === true ||
      user.isAdmin === true ||
      role === "admin"
  );

  const meta = {
    requestId: safeText(first(data.requestId, state.requestId, view.requestId, dashboard.requestId, dashboard.meta?.requestId, ""), ""),
    lastUpdatedAt: first(data.lastUpdatedAt, data.lastSyncAt, state.lastUpdatedAt, state.lastSyncAt, view.lastUpdatedAt, dashboard.updatedAt, dashboard.generatedAt, dashboard.lastSyncAt, dashboard.meta?.updatedAt, ""),
    partial: Boolean(first(dashboard.partial, data.partial, state.partial, false)),
    errorsCount: safeArray(first(dashboard.errors, data.errors, state.errors, [])).length,
  };

  const ticketRows = safeArray(first(view.ticketRows, view.incidenceRows, view.tableRows, view.pageItems, []));
  const invoiceRows = safeArray(first(view.invoiceRows, view.facturaRows, []));
  const recentTickets = safeArray(first(view.recentTickets, view.recentIncidencias, view.latestTickets, view.latestIncidencias, []));
  const recentInvoices = safeArray(first(view.recentInvoices, view.recentFacturas, view.latestInvoices, view.latestFacturas, []));
  const clients = admin ? safeArray(first(view.clients, view.clientes, view.customers, [])) : [];
  const users = admin ? safeArray(first(view.users, view.usuarios, [])) : [];
  const displayName = safeText(first(user.displayName, user.name, user.fullName, view.displayName, data.displayName), "Usuario");

  return {
    __homeTemplateVm: true,

    data,
    view,
    state: {
      loading: Boolean(state.loading || data.loading),
      refreshing: Boolean(state.refreshing || data.refreshing),
      creating: Boolean(state.creating || data.creating),
      loaded: Boolean(state.loaded || data.loaded),
      hydrated: Boolean(state.hydrated || data.hydrated),
      error: redact(safeText(first(state.error, data.error), "")),
      openingTicketId: safeText(state.openingTicketId, ""),
      selectedTicketId: safeText(first(state.selectedTicketId, data.selectedTicketId, data.selectedIncidenciaId), ""),
      navigatingAction: redact(safeText(state.navigatingAction, "")),
    },
    meta,
    admin,
    role: admin ? "admin" : "user",

    user: {
      ...user,
      displayName,
      name: displayName,
      avatarUrl: safeImageSrc(first(user.avatarUrl, user.avatar, user.photoUrl, user.picture, view.avatarUrl, data.avatarUrl, "")),
      initials: safeText(first(user.initials, view.initials, getInitials(displayName, "U")), "U").slice(0, 3).toUpperCase(),
      role: admin ? "admin" : "user",
      roleLabel: safeText(first(user.roleLabel, admin ? "Administrador" : "Estándar"), admin ? "Administrador" : "Estándar"),
      isAdmin: admin,
      isUser: !admin,
    },

    dashboard,
    summary: safeObject(view.summary),
    stats: safeObject(view.stats),

    statCards: safeArray(view.statCards),
    statusPills: safeArray(view.statusPills),
    widgets: safeArray(view.widgets),
    quickActions: safeArray(view.quickActions),

    tickets: safeArray(view.tickets),
    incidencias: safeArray(first(view.incidencias, view.tickets, [])),
    recentTickets,
    recentIncidencias: recentTickets,
    ticketRows,

    invoices: safeArray(view.invoices),
    facturas: safeArray(first(view.facturas, view.invoices, [])),
    recentInvoices,
    recentFacturas: recentInvoices,
    invoiceRows,

    users,
    usuarios: users,

    clients,
    clientes: clients,
    customers: clients,

    activity: safeArray(view.activity),
    recentActivity: safeArray(first(view.recentActivity, view.activity, [])),

    selectedTicketId: safeText(first(view.selectedTicketId, view.selectedIncidenciaId, state.selectedTicketId), ""),
    selectedIncidenciaId: safeText(first(view.selectedIncidenciaId, view.selectedTicketId, state.selectedTicketId), ""),
    selectedTicket: safeObject(first(view.selectedTicket, view.selectedIncidencia, {}), null),
    ticketModal: safeObject(first(view.ticketModal, view.incidenciaModal, {})),

    collections: safeObject(view.collections),
    pagination: {
      ...safeObject(view.pagination),
      pageItems: ticketRows,
      pageSize: LIMITS.tickets,
    },
    pageItems: ticketRows,
  };
}

function isInitialLoading(vm = {}) {
  const state = safeObject(vm.state);
  return Boolean(state.loading && !state.loaded && !state.hydrated);
}

/* =========================================================
   UI PARTS
========================================================= */

function avatar({
  name = "Usuario",
  image = "",
  initials = "",
  kind = "user",
  seed = "",
  className = "home-avatar",
} = {}) {
  const safeName = safeText(name, "Usuario");
  const safeImage = safeImageSrc(image);
  const safeInitials = safeText(initials, getInitials(safeName, "U")).slice(0, 3).toUpperCase();
  const tone = avatarTone(seed || safeName);

  return `
    <span
      class="${attr(joinClasses(className, safeImage ? "has-image" : "is-fallback"))}"
      data-avatar-kind="${attr(kind)}"
      data-avatar-tone="${attr(tone)}"
      title="${attr(safeName)}"
      aria-label="${attr(safeName)}"
    >
      ${safeImage
        ? `<img src="${attr(safeImage)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`
        : ""
      }
      <span class="home-avatar-initials" aria-hidden="true">${escapeHtml(safeInitials)}</span>
    </span>
  `;
}

function loadingCards(count = 4) {
  return Array.from({ length: count }, () => `
    <article class="home-stat-card home-stat-card--loading" aria-hidden="true">
      <span class="home-skeleton home-skeleton--icon"></span>
      <span class="home-skeleton home-skeleton--title"></span>
      <span class="home-skeleton home-skeleton--value"></span>
      <span class="home-skeleton home-skeleton--text"></span>
    </article>
  `).join("");
}

function loadingRows(count = DEFAULT_PAGE_SIZE) {
  return Array.from({ length: count }, () => `
    <div class="home-row-skeleton" aria-hidden="true">
      <span class="home-skeleton home-skeleton--avatar"></span>
      <span class="home-skeleton home-skeleton--wide"></span>
      <span class="home-skeleton home-skeleton--small"></span>
    </div>
  `).join("");
}

function emptyState({
  title = "Sin datos",
  text = "No hay información disponible.",
  action = "",
  actionLabel = "",
  iconName = "activity",
} = {}) {
  return `
    <div class="home-empty-state">
      <span class="home-empty-state-icon" aria-hidden="true">${icon(iconName)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${action
        ? `<button type="button" class="home-btn" data-home-action="${attr(action)}" data-action="${attr(action)}">${escapeHtml(actionLabel || "Actualizar")}</button>`
        : ""
      }
    </div>
  `;
}

function errorBanner(message = "") {
  const clean = safeText(message, "");

  if (!clean) return "";

  return `
    <div class="home-alert home-alert--error" role="alert">
      ${icon("alert")}
      <span>${escapeHtml(redact(clean))}</span>
      <button type="button" class="home-btn home-btn--ghost" data-home-action="${ACTIONS.RETRY}" data-action="${ACTIONS.RETRY}">
        Reintentar
      </button>
    </div>
  `;
}

function renderCreateIncidenciaCard(vm = {}) {
  const state = safeObject(vm.state);
  const route = ROUTE_TARGETS.INCIDENCIAS;

  return `
    <aside class="home-create-card home-create-card--incidencia" data-home-section="create-incidencia">
      <button
        type="button"
        class="home-create-card-button"
        data-home-action="${ACTIONS.CREATE_INCIDENCIA}"
        data-action="${ACTIONS.CREATE_INCIDENCIA}"
        data-route="${attr(route)}"
        data-href="${attr(route)}"
        aria-label="Crear incidencia"
        ${state.creating ? "aria-busy=\"true\"" : ""}
      >
        <span class="home-create-card-icon" aria-hidden="true">
          ${icon("plus")}
        </span>

        <span class="home-create-card-content">
          <span class="home-panel-kicker">Nueva solicitud</span>
          <strong>Crear incidencia</strong>
          <span>Abre una incidencia de soporte.</span>
        </span>

        <span class="home-create-card-arrow" aria-hidden="true">
          ${icon("arrowRight")}
        </span>
      </button>
    </aside>
  `;
}

function renderHomeHeader(vm = {}) {
  const user = safeObject(vm.user);
  const name = safeText(first(user.displayName, user.name), "Usuario");

  return `
    <header class="home-header home-header--clean" data-home-section="header">
      <div class="home-header-main">
        ${avatar({
          name,
          image: user.avatarUrl,
          initials: user.initials,
          kind: "current-user",
          seed: safeText(first(user.id, user.userId, user.slug, name), name),
          className: "home-current-user-avatar",
        })}
        <div>
          <h1>Hola, ${escapeHtml(name)}</h1>
          <p class="home-subtitle">
            ${vm.admin
              ? "Resumen operativo de clientes, usuarios, incidencias y facturas."
              : "Resumen de tus incidencias y facturas."
            }
          </p>
        </div>
      </div>

      ${renderCreateIncidenciaCard(vm)}
    </header>

    ${renderHomeStats(vm)}
  `;
}

function renderHomeStats(vm = {}) {
  const cards = safeArray(vm.statCards).slice(0, vm.admin ? 4 : 3);

  if (!cards.length && isInitialLoading(vm)) {
    return `
      <section class="home-stats" data-home-section="stats">
        ${loadingCards(vm.admin ? 4 : 3)}
      </section>
    `;
  }

  if (!cards.length) return "";

  return `
    <section class="home-stats" data-home-section="stats">
      ${cards.map((card) => statCard(card)).join("")}
    </section>
  `;
}

function statCard(card = {}) {
  const route = safeRoute(first(card.route, card.href, ""), ROUTE_TARGETS.INCIDENCIAS);
  const id = safeText(first(card.id, card.key, card.widgetId, card.label), "stat");
  const iconName = safeText(first(card.iconName, card.icon, "activity"), "activity");
  const label = safeText(first(card.label, card.title, "Métrica"), "Métrica");
  const value = first(card.value, card.count, card.total, 0);
  const text = safeText(first(card.text, card.description, card.subtitle, ""), "");
  const modifier = normalizeKey(first(card.modifier, card.type, card.kind, id));

  return `
    <article
      class="home-stat-card home-stat-card--${attr(modifier || "default")}"
      data-home-widget-id="${attr(id)}"
      data-widget-id="${attr(id)}"
      data-route="${attr(route)}"
    >
      <button
        type="button"
        class="home-stat-card-button"
        data-home-action="${ACTIONS.NAVIGATE}"
        data-action="${ACTIONS.NAVIGATE}"
        data-route="${attr(route)}"
        data-href="${attr(route)}"
        data-widget-id="${attr(id)}"
        aria-label="${attr(label)}"
      >
        <span class="home-stat-icon" aria-hidden="true">${icon(iconName)}</span>
        <span class="home-stat-content">
          <span class="home-stat-label">${escapeHtml(label)}</span>
          <strong class="home-stat-value">${escapeHtml(String(value))}</strong>
          ${text ? `<span class="home-stat-text">${escapeHtml(text)}</span>` : ""}
        </span>
      </button>
    </article>
  `;
}

function renderHomeActivity(vm = {}) {
  const items = safeArray(vm.activity).slice(0, LIMITS.activity);

  return `
    <section class="home-panel home-panel--activity" data-home-section="activity">
      <div class="home-panel-header">
        <div>
          <p class="home-panel-kicker">Actividad</p>
          <h2>Últimos movimientos</h2>
        </div>
      </div>

      ${items.length
        ? `<ul class="home-activity-list">${items.map(activityItem).join("")}</ul>`
        : isInitialLoading(vm)
          ? loadingRows(3)
          : emptyState({
              title: "Sin actividad reciente",
              text: "Todavía no hay movimientos visibles en el Home.",
              iconName: "activity",
            })
      }
    </section>
  `;
}

function activityItem(item = {}) {
  const type = getActivityType(item);
  const title = getActivityTitle(item);
  const text = getActivityText(item);
  const date = getActivityDate(item);

  return `
    <li class="home-activity-item home-activity-item--${attr(type)}">
      <span class="home-activity-icon" aria-hidden="true">${icon(type === "invoice" ? "invoice" : type === "ticket" ? "ticket" : "activity")}</span>
      <span class="home-activity-body">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text)}</span>
      </span>
      <time>${escapeHtml(formatRelativeDate(date))}</time>
    </li>
  `;
}

function renderHomeInvoicePreview(vm = {}) {
  const invoices = safeArray(vm.recentInvoices).slice(0, LIMITS.invoices);
  const totalPaid = safeArray(vm.invoices).reduce((sum, invoice) => {
    return isInvoicePaid(invoice) ? sum + safeNumber(getInvoicePaidAmount(invoice), 0) : sum;
  }, 0);
  const currency = safeText(first(getInvoiceCurrency(invoices[0] || {}), DEFAULT_CURRENCY), DEFAULT_CURRENCY);
  const route = ROUTE_TARGETS.FACTURAS;

  return `
    <section class="home-panel home-panel--invoices" data-home-section="invoices">
      <div class="home-panel-header">
        <div>
          <p class="home-panel-kicker">Facturación</p>
          <h2>Facturas</h2>
        </div>
        <button
          type="button"
          class="home-link-button"
          data-home-action="${ACTIONS.NAVIGATE}"
          data-action="${ACTIONS.NAVIGATE}"
          data-route="${attr(route)}"
          data-href="${attr(route)}"
        >
          Ver facturas
        </button>
      </div>

      <div class="home-billing-total">
        <span>Importe total pagado</span>
        <strong>${escapeHtml(formatMoney(totalPaid, currency))}</strong>
      </div>

      ${invoices.length
        ? `<ul class="home-invoice-list">${invoices.map(invoiceItem).join("")}</ul>`
        : isInitialLoading(vm)
          ? loadingRows(3)
          : emptyState({
              title: "Sin facturas visibles",
              text: "Cuando haya facturas disponibles aparecerán aquí.",
              iconName: "invoice",
            })
      }
    </section>
  `;
}

function invoiceItem(invoice = {}) {
  const id = getInvoiceId(invoice);
  const paid = isInvoicePaid(invoice);
  const amount = paid ? getInvoicePaidAmount(invoice) : 0;
  const currency = getInvoiceCurrency(invoice);
  const statusKey = getInvoiceStatusKey(invoice);
  const statusLabel = getInvoiceStatusLabel(invoice);

  return `
    <li class="home-invoice-item home-invoice-item--${attr(statusKey)}">
      <span class="home-invoice-main">
        <strong>${escapeHtml(id || "Factura")}</strong>
        <span>${escapeHtml(statusLabel)}</span>
      </span>
      <span class="home-invoice-amount">
        ${paid ? escapeHtml(formatMoney(amount, currency)) : "—"}
      </span>
    </li>
  `;
}

function renderHomeEntitiesPreview(vm = {}) {
  if (!vm.admin) return "";

  const clients = safeArray(vm.clients).slice(0, LIMITS.entities);
  const users = safeArray(vm.users).slice(0, LIMITS.entities);

  return `
    <section class="home-panel home-panel--entities" data-home-section="entities">
      <div class="home-panel-header">
        <div>
          <p class="home-panel-kicker">Administración</p>
          <h2>Clientes y usuarios</h2>
        </div>
      </div>

      <div class="home-entity-columns">
        <div>
          <h3>Clientes</h3>
          ${clients.length
            ? `<ul class="home-mini-list">${clients.map((client) => `
                <li>
                  <strong>${escapeHtml(safeText(first(client.name, client.nombre, client.displayName), "Cliente"))}</strong>
                  <span>${escapeHtml(client.active === false ? "Inactivo" : "Activo")}</span>
                </li>
              `).join("")}</ul>`
            : isInitialLoading(vm)
              ? loadingRows(2)
              : `<p class="home-panel-muted">Sin clientes visibles.</p>`
          }
        </div>

        <div>
          <h3>Usuarios</h3>
          ${users.length
            ? `<ul class="home-mini-list">${users.map((user) => `
                <li>
                  <strong>${escapeHtml(safeText(first(user.displayName, user.name, user.username), "Usuario"))}</strong>
                  <span>${escapeHtml(safeText(first(user.roleLabel, user.role, "user"), "user"))}</span>
                </li>
              `).join("")}</ul>`
            : isInitialLoading(vm)
              ? loadingRows(2)
              : `<p class="home-panel-muted">Sin usuarios visibles.</p>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderHomeTicketsTable(vm = {}) {
  const rows = safeArray(vm.ticketRows).slice(0, LIMITS.tickets);
  const pagination = safeObject(vm.pagination);
  const hasPrev = pagination.hasPrev === true;
  const hasNext = pagination.hasNext === true;
  const route = ROUTE_TARGETS.INCIDENCIAS;

  return `
    <section class="home-panel home-panel--tickets" data-home-section="tickets">
      <div class="home-panel-header">
        <div>
          <p class="home-panel-kicker">Incidencias</p>
          <h2>${vm.admin ? "Últimas incidencias" : "Mis incidencias"}</h2>
        </div>

        <div class="home-panel-actions">
          <button
            type="button"
            class="home-link-button"
            data-home-action="${ACTIONS.NAVIGATE}"
            data-action="${ACTIONS.NAVIGATE}"
            data-route="${attr(route)}"
            data-href="${attr(route)}"
          >
            Ver todas
          </button>
        </div>
      </div>

      ${rows.length
        ? `
          <div class="home-ticket-table" role="table" aria-label="Incidencias recientes">
            <div class="home-ticket-table-head" role="row">
              <span role="columnheader">Incidencia</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader">Actualización</span>
              <span role="columnheader">Facturas</span>
            </div>
            <div class="home-ticket-table-body">
              ${rows.map(ticketRow).join("")}
            </div>
          </div>

          <div class="home-pagination" data-home-pagination="true">
            <span>
              ${escapeHtml(formatNumber(pagination.rangeStart || 1))}
              -
              ${escapeHtml(formatNumber(pagination.rangeEnd || rows.length))}
              de
              ${escapeHtml(formatNumber(pagination.totalCount || rows.length))}
            </span>

            <div class="home-pagination-actions">
              <button
                type="button"
                class="home-btn home-btn--ghost"
                data-home-action="${ACTIONS.PAGE_PREV}"
                data-action="${ACTIONS.PAGE_PREV}"
                ${hasPrev ? "" : "disabled aria-disabled=\"true\""}
              >
                Anterior
              </button>
              <button
                type="button"
                class="home-btn home-btn--ghost"
                data-home-action="${ACTIONS.PAGE_NEXT}"
                data-action="${ACTIONS.PAGE_NEXT}"
                ${hasNext ? "" : "disabled aria-disabled=\"true\""}
              >
                Siguiente
              </button>
            </div>
          </div>
        `
        : isInitialLoading(vm)
          ? loadingRows(DEFAULT_PAGE_SIZE)
          : emptyState({
              title: "Sin incidencias visibles",
              text: "No hay incidencias para mostrar en este momento.",
              action: ACTIONS.CREATE_INCIDENCIA,
              actionLabel: "Crear incidencia",
              iconName: "ticket",
            })
      }
    </section>
  `;
}

function ticketRow(row = {}) {
  const ticketId = getTicketId(row);
  const subject = getTicketSubject(row);
  const description = getTicketDescription(row);
  const ownerName = getTicketOwnerName(row);
  const avatarUrl = getTicketAvatarUrl(row);
  const statusKey = getTicketStatusKey(row);
  const statusLabel = getTicketStatusLabel(row);
  const priorityKey = getTicketPriorityKey(row);
  const priorityLabel = getTicketPriorityLabel(row);
  const category = getTicketCategory(row);
  const updatedAt = getTicketUpdatedAt(row);
  const technician = safeObject(first(row.technician, row.tecnico, {}));
  const technicianName = safeText(first(technician.displayName, technician.name, row.assignedToName, row.technicianName), "Sin asignar");
  const invoices = safeArray(first(row.invoices, row.facturas, []));

  return `
    <button
      type="button"
      class="home-ticket-row home-ticket-row--${attr(statusKey)}"
      role="row"
      data-ticket-row="true"
      data-home-action="${ACTIONS.OPEN_TICKET_DETAIL}"
      data-action="${ACTIONS.OPEN_TICKET_DETAIL}"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      data-entity-id="${attr(ticketId)}"
      data-payload="${jsonAttr({ ticketId, incidenciaId: ticketId })}"
    >
      <span class="home-ticket-cell home-ticket-cell--main" role="cell">
        ${avatar({
          name: ownerName,
          image: avatarUrl,
          kind: "ticket-owner",
          seed: ticketId || ownerName,
          initials: getInitials(ownerName, "U"),
          className: "home-ticket-avatar",
        })}
        <span class="home-ticket-main-text">
          <span class="home-ticket-id">${escapeHtml(ticketId)}</span>
          <strong>${escapeHtml(subject)}</strong>
          ${description ? `<span>${escapeHtml(description)}</span>` : ""}
          <span class="home-ticket-meta">
            <span class="home-mini-badge home-mini-badge--${attr(priorityKey)}">${escapeHtml(priorityLabel)}</span>
            <span class="home-mini-badge home-mini-badge--category">${escapeHtml(category)}</span>
            <span class="home-mini-badge home-mini-badge--technician">Técnico: ${escapeHtml(technicianName)}</span>
          </span>
        </span>
      </span>

      <span class="home-ticket-cell" role="cell">
        <span class="home-chip home-chip--${attr(statusKey)}">
          <span class="home-chip-dot" aria-hidden="true"></span>
          ${escapeHtml(statusLabel)}
        </span>
      </span>

      <span class="home-ticket-cell" role="cell">
        ${escapeHtml(formatRelativeDate(updatedAt))}
      </span>

      <span class="home-ticket-cell" role="cell">
        ${escapeHtml(formatNumber(invoices.length))}
      </span>
    </button>
  `;
}

function modalInvoiceItem(invoice = {}) {
  const id = getInvoiceId(invoice);
  const statusKey = getInvoiceStatusKey(invoice);
  const statusLabel = getInvoiceStatusLabel(invoice);
  const paid = isInvoicePaid(invoice);
  const amount = paid ? getInvoicePaidAmount(invoice) : 0;
  const currency = getInvoiceCurrency(invoice);

  return `
    <li class="home-modal-invoice-item home-modal-invoice-item--${attr(statusKey)}">
      <span>
        <strong>${escapeHtml(id || "Factura")}</strong>
        <small>${escapeHtml(statusLabel)}</small>
      </span>
      <span>${paid ? escapeHtml(formatMoney(amount, currency)) : "—"}</span>
    </li>
  `;
}

function renderTicketModal(vm = {}) {
  const modal = safeObject(vm.ticketModal);

  if (modal.open !== true) return "";

  const ticket = safeObject(first(modal.ticket, modal.incidencia, vm.selectedTicket, {}));
  const ticketId = safeText(first(modal.ticketId, modal.incidenciaId, getTicketId(ticket), vm.selectedTicketId), "");
  const subject = getTicketSubject(ticket);
  const description = safeText(first(getTicketDescription(ticket), "Sin descripción."), "Sin descripción.");
  const statusKey = getTicketStatusKey(ticket);
  const statusLabel = getTicketStatusLabel(ticket);
  const priorityKey = getTicketPriorityKey(ticket);
  const priorityLabel = getTicketPriorityLabel(ticket);
  const createdAt = getTicketCreatedAt(ticket);
  const updatedAt = getTicketUpdatedAt(ticket);
  const invoices = safeArray(first(modal.invoices, modal.facturas, ticket.invoices, ticket.facturas, []));
  const technician = safeObject(first(modal.technician, modal.tecnico, ticket.technician, ticket.tecnico, {}));
  const technicianName = safeText(first(technician.displayName, technician.name, technician.fullName), "Sin asignar");
  const technicianAvatar = safeImageSrc(first(technician.avatarUrl, technician.avatar, technician.photoUrl, ""));
  const route = ROUTE_TARGETS.INCIDENCIAS;

  return `
    <section
      class="home-modal-backdrop"
      data-home-modal="ticket-detail"
      data-ticket-id="${attr(ticketId)}"
      data-incidencia-id="${attr(ticketId)}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-ticket-modal-title"
    >
      <div class="home-modal">
        <div class="home-modal-header">
          <div>
            <p class="home-panel-kicker">${escapeHtml(ticketId)}</p>
            <h2 id="home-ticket-modal-title">${escapeHtml(subject)}</h2>
          </div>

          <button
            type="button"
            class="home-modal-close"
            data-home-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
            data-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
            aria-label="Cerrar"
          >
            ${icon("close")}
          </button>
        </div>

        <div class="home-modal-body">
          <div class="home-modal-main">
            <div class="home-modal-section">
              <h3>Resumen</h3>
              <p>${escapeHtml(description)}</p>

              <div class="home-modal-tags">
                <span class="home-chip home-chip--${attr(statusKey)}">
                  <span class="home-chip-dot" aria-hidden="true"></span>
                  ${escapeHtml(statusLabel)}
                </span>
                <span class="home-mini-badge home-mini-badge--${attr(priorityKey)}">
                  ${icon(priorityKey === "critical" || priorityKey === "urgent" ? "alert" : "activity")}
                  ${escapeHtml(priorityLabel)}
                </span>
                <span class="home-mini-badge home-mini-badge--category">
                  ${escapeHtml(safeText(first(modal.category, modal.categoria, getTicketCategory(ticket)), "Soporte"))}
                </span>
              </div>
            </div>

            <div class="home-modal-section">
              <h3>Facturas vinculadas</h3>
              ${invoices.length
                ? `<ul class="home-modal-invoice-list">${invoices.map(modalInvoiceItem).join("")}</ul>`
                : `<p class="home-modal-muted">Esta incidencia no tiene facturas vinculadas.</p>`
              }
            </div>
          </div>

          <aside class="home-modal-side">
            <div class="home-modal-technician">
              ${avatar({
                name: technicianName,
                image: technicianAvatar,
                kind: "technician",
                seed: safeText(first(technician.userId, technician.id, technician.username, technicianName), technicianName),
                initials: technician.initials,
                className: "home-modal-technician-avatar",
              })}
              <div>
                <span class="home-panel-kicker">Técnico asignado</span>
                <strong>${escapeHtml(technicianName)}</strong>
              </div>
            </div>

            <dl class="home-modal-facts">
              <div>
                <dt>Creación</dt>
                <dd>${escapeHtml(formatDateTime(createdAt))}</dd>
              </div>
              <div>
                <dt>Última novedad</dt>
                <dd>${escapeHtml(formatLastUpdate(updatedAt))}</dd>
              </div>
              <div>
                <dt>Facturas</dt>
                <dd>${escapeHtml(formatNumber(invoices.length))}</dd>
              </div>
              <div>
                <dt>Adjuntos</dt>
                <dd>${escapeHtml(formatNumber(safeNumber(first(ticket.attachmentsCount, modal.attachmentsCount, 0), 0)))}</dd>
              </div>
            </dl>
          </aside>
        </div>

        <div class="home-modal-footer">
          <button
            type="button"
            class="home-btn"
            data-home-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
            data-action="${ACTIONS.CLOSE_TICKET_DETAIL}"
          >
            Cerrar
          </button>

          <button
            type="button"
            class="home-btn home-btn--primary"
            data-home-action="${ACTIONS.NAVIGATE}"
            data-action="${ACTIONS.NAVIGATE}"
            data-route="${attr(route)}"
            data-href="${attr(route)}"
            data-ticket-id="${attr(ticketId)}"
            data-incidencia-id="${attr(ticketId)}"
          >
            Abrir incidencias ${icon("arrowRight")}
          </button>
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   FALLBACK STATES
========================================================= */

export function renderHomeLoadingState() {
  return `
    <section class="home-view-root home-view-root--loading" data-home-scope="true" aria-busy="true">
      <section class="home-hero home-hero--frameless home-hero--loading">
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
          text: redact(safeText(message, "Error desconocido al cargar la vista.")),
          action: ACTIONS.RETRY,
          actionLabel: "Reintentar",
          iconName: "alert",
        })}
      </section>
    </section>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderHomeTemplate(input = {}) {
  const vm = buildTemplateViewModel(input);
  const state = vm.state;
  const meta = vm.meta;
  const admin = vm.admin;

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
      ${renderHomeHeader(vm)}

      <section class="home-grid" data-home-section="main-grid">
        ${renderHomeActivity(vm)}
        ${renderHomeInvoicePreview(vm)}
        ${renderHomeEntitiesPreview(vm)}
      </section>

      ${renderHomeTicketsTable(vm)}
      ${renderTicketModal(vm)}
    </section>
  `;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHomeTemplateSnapshot() {
  return {
    version: TEMPLATE_VERSION,
    source: "views.home.template",

    actions: ACTIONS,
    routes: {
      ...HOME_ROUTES,
      INCIDENCIAS: ROUTE_TARGETS.INCIDENCIAS,
      FACTURAS: ROUTE_TARGETS.FACTURAS,
    },

    policy: {
      templateOnly: true,
      pureHtmlString: true,
      modelCalculatedOncePerRender: true,
      selectorsOwnViewModel: true,

      cleanHeader: true,
      createIncidenciaHeaderCard: true,
      noVisibleRoleLabelInHeader: true,
      noTopRefreshButton: true,
      noActivityRefreshButton: true,
      noTicketsCsvExportButton: true,
      noUserRecentIncidenciasCard: true,

      noDomApi: true,
      noListeners: true,
      noAuth: true,
      noRouter: true,
      noAppCore: true,
      noHttp: true,
      noStorage: true,
      noInlineCss: true,
      noInlineHandlers: true,

      noQuickActionsDuplicateSection: true,
      noWidgetsDuplicateSection: true,
      noHealthServerReadyPing: true,
      noHomeRoute: true,

      ticketDetailModalOnly: true,
      ticketDetailDoesNotNavigate: true,
      ticketDetailActionsForBindings: true,

      escapedHtml: true,
      escapedAttributes: true,
      noSensitiveHref: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const renderHomeViewTemplate = renderHomeTemplate;
export const renderHomeDashboardTemplate = renderHomeTemplate;
export const renderHome = renderHomeTemplate;
export const renderDashboard = renderHomeTemplate;

export default renderHomeTemplate;
