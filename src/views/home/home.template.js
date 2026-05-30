/* =========================================================
   Onion Support - Home Template
   Archivo: /src/views/home/home.template.js

   Responsabilidad:
   - Render HTML puro de Home.
   - Consumir dashboard ligero desde index.js/home.api.js.
   - Header limpio con CTA Crear incidencia.
   - Stats, actividad y facturas.
   - Admin ve clientes/usuarios.
   - Sin DOM API, listeners, Auth, Router, AppCore, HTTP,
     storage, CSS inline ni handlers inline.
========================================================= */

export const HOME_TEMPLATE_VERSION = "home.template.minimal.v1";

const ACTIONS = Object.freeze({
  RETRY: "retry",
  CREATE_INCIDENCIA: "create_incidencia",
  NAVIGATE: "navigate",
});

const DEFAULT_ROUTES = Object.freeze({
  incidencias: "/incidencias",
  facturas: "/facturas",
  clientes: "/clientes",
  usuarios: "/usuarios",
});

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
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

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
  } catch {
    return String(Number(value) || 0);
  }
}

function formatMoney(value = 0, currency = "EUR") {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
    }).format(Number(value) || 0);
  } catch {
    return `${Number(value || 0).toFixed(2)} €`;
  }
}

function formatDate(value = "") {
  const time = Date.parse(value);

  if (!Number.isFinite(time)) return "Sin fecha";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(time));
  } catch {
    return new Date(time).toLocaleString();
  }
}

function initialsFrom(value = "") {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON"
  );
}

function safeImageSrc(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature)=/i.test(raw)) return "";

  if (raw.startsWith("/")) return raw;

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function safeRoute(value = "", fallback = "/") {
  const route = cleanText(value, fallback);

  if (!route.startsWith("/")) return fallback;
  if (route.startsWith("//")) return fallback;
  if (/[\r\n\t\\]/.test(route)) return fallback;
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature)=/i.test(route)) return fallback;

  return route;
}

function icon(name = "activity") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    invoice: `<svg ${common}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
    client: `<svg ${common}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>`,
    users: `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
    activity: `<svg ${common}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    arrowRight: `<svg ${common}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
  };

  return icons[name] || icons.activity;
}

function buildVm(input = {}) {
  const data = isObject(input) ? input : {};
  const dashboard = isObject(data.dashboard) ? data.dashboard : data;
  const summary = isObject(dashboard.summary) ? dashboard.summary : {};
  const user = isObject(first(data.user, dashboard.user, {})) ? first(data.user, dashboard.user, {}) : {};
  const routes = {
    ...DEFAULT_ROUTES,
    ...(isObject(data.routes) ? data.routes : {}),
  };

  const tickets = safeArray(first(dashboard.tickets, dashboard.incidencias, []));
  const facturas = safeArray(first(dashboard.facturas, dashboard.invoices, []));
  const clientes = safeArray(first(dashboard.clientes, dashboard.clients, []));
  const users = safeArray(first(dashboard.users, dashboard.usuarios, []));
  const activity = safeArray(dashboard.activity);

  const displayName = cleanText(
    first(user.displayName, user.name, user.fullName, user.username, data.displayName),
    "Usuario"
  );

  const admin = dashboard.admin === true || dashboard.role === "admin" || user.role === "admin";

  return {
    dashboard,
    summary,
    user: {
      ...user,
      displayName,
      initials: cleanText(user.initials, initialsFrom(displayName)),
      avatarUrl: safeImageSrc(first(user.avatarUrl, user.avatar, user.picture, "")),
    },
    admin,

    tickets,
    facturas,
    clientes: admin ? clientes : [],
    users: admin ? users : [],
    activity,

    routes,

    loading: data.loading === true,
    error: cleanText(first(data.error, dashboard.error, ""), ""),
    stale: dashboard.stale === true,

    counts: {
      tickets: Number(first(summary.tickets, summary.incidencias, tickets.length, 0)) || 0,
      facturas: Number(first(summary.facturas, summary.invoices, facturas.length, 0)) || 0,
      clientes: admin ? Number(first(summary.clientes, summary.clients, clientes.length, 0)) || 0 : 0,
      users: admin ? Number(first(summary.users, summary.usuarios, users.length, 0)) || 0 : 0,
      paidTotal: Number(first(summary.paidTotal, 0)) || 0,
      currency: cleanText(summary.currency, "EUR"),
    },
  };
}

function avatar(user = {}) {
  const image = safeImageSrc(user.avatarUrl);
  const name = cleanText(user.displayName, "Usuario");
  const initials = cleanText(user.initials, initialsFrom(name));

  return `
    <span class="home-current-user-avatar ${image ? "has-image" : "is-fallback"}" aria-label="${attr(name)}">
      ${image ? `<img src="${attr(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}
      <span class="home-avatar-initials" aria-hidden="true">${escapeHtml(initials)}</span>
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

function emptyState(title = "Sin datos", text = "No hay información disponible.", iconName = "activity") {
  return `
    <div class="home-empty-state">
      <span class="home-empty-state-icon" aria-hidden="true">${icon(iconName)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function errorBanner(message = "") {
  if (!message) return "";

  return `
    <div class="home-alert home-alert--error" role="alert">
      ${icon("alert")}
      <span>${escapeHtml(message)}</span>
      <button type="button" class="home-btn home-btn--ghost" data-home-action="${ACTIONS.RETRY}" data-action="${ACTIONS.RETRY}">
        Reintentar
      </button>
    </div>
  `;
}

function createCard(vm) {
  const route = safeRoute(vm.routes.incidencias, "/incidencias");

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
      >
        <span class="home-create-card-icon" aria-hidden="true">${icon("plus")}</span>

        <span class="home-create-card-content">
          <span class="home-panel-kicker">Nueva solicitud</span>
          <strong>Crear incidencia</strong>
          <span>Abre una incidencia de soporte.</span>
        </span>

        <span class="home-create-card-arrow" aria-hidden="true">${icon("arrowRight")}</span>
      </button>
    </aside>
  `;
}

function header(vm) {
  return `
    <header class="home-header home-header--clean" data-home-section="header">
      <div class="home-header-main">
        ${avatar(vm.user)}
        <div>
          <h1>Hola, ${escapeHtml(vm.user.displayName)}</h1>
          <p class="home-subtitle">
            ${vm.admin
              ? "Resumen operativo de clientes, usuarios, incidencias y facturas."
              : "Resumen de tus incidencias y facturas."
            }
          </p>
        </div>
      </div>

      ${createCard(vm)}
    </header>
  `;
}

function statCard({ label, value, text, iconName, route, modifier }) {
  const href = safeRoute(route, "/");

  return `
    <article class="home-stat-card home-stat-card--${attr(modifier)}" data-route="${attr(href)}">
      <button
        type="button"
        class="home-stat-card-button"
        data-home-action="${ACTIONS.NAVIGATE}"
        data-action="${ACTIONS.NAVIGATE}"
        data-route="${attr(href)}"
        data-href="${attr(href)}"
        aria-label="${attr(label)}"
      >
        <span class="home-stat-icon" aria-hidden="true">${icon(iconName)}</span>
        <span class="home-stat-content">
          <span class="home-stat-label">${escapeHtml(label)}</span>
          <strong class="home-stat-value">${escapeHtml(formatNumber(value))}</strong>
          <span class="home-stat-text">${escapeHtml(text)}</span>
        </span>
      </button>
    </article>
  `;
}

function stats(vm) {
  if (vm.loading) {
    return `<section class="home-stats" data-home-section="stats">${loadingCards(vm.admin ? 4 : 2)}</section>`;
  }

  const cards = [
    {
      label: "Incidencias",
      value: vm.counts.tickets,
      text: "Incidencias visibles en el panel.",
      iconName: "ticket",
      route: vm.routes.incidencias,
      modifier: "tickets",
    },
    {
      label: "Facturas totales",
      value: vm.counts.facturas,
      text: `Pagado: ${formatMoney(vm.counts.paidTotal, vm.counts.currency)}`,
      iconName: "euro",
      route: vm.routes.facturas,
      modifier: "facturas",
    },
  ];

  if (vm.admin) {
    cards.push(
      {
        label: "Clientes",
        value: vm.counts.clientes,
        text: "Clientes visibles.",
        iconName: "client",
        route: vm.routes.clientes,
        modifier: "clientes",
      },
      {
        label: "Usuarios",
        value: vm.counts.users,
        text: "Usuarios visibles.",
        iconName: "users",
        route: vm.routes.usuarios,
        modifier: "usuarios",
      }
    );
  }

  return `<section class="home-stats" data-home-section="stats">${cards.map(statCard).join("")}</section>`;
}

function activityItem(item = {}) {
  const type = cleanText(item.type, "activity");
  const title = cleanText(item.title, "Actividad");
  const text = cleanText(item.text, "");
  const date = cleanText(item.date, "");

  return `
    <li class="home-activity-item home-activity-item--${attr(type)}">
      <span class="home-activity-icon" aria-hidden="true">${icon(type === "invoice" ? "invoice" : type === "ticket" ? "ticket" : "activity")}</span>
      <span class="home-activity-body">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text)}</span>
      </span>
      <time>${escapeHtml(formatDate(date))}</time>
    </li>
  `;
}

function activity(vm) {
  const items = vm.activity.slice(0, 5);

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
        : emptyState("Sin actividad reciente", "Todavía no hay movimientos visibles en el Home.", "activity")
      }
    </section>
  `;
}

function invoiceItem(invoice = {}) {
  const id = cleanText(first(invoice.invoiceId, invoice.facturaId, invoice.id, invoice.title), "Factura");
  const status = cleanText(invoice.status, invoice.paid ? "Pagada" : "Pendiente");
  const amount = invoice.paid ? first(invoice.paidAmount, invoice.total, invoice.amount, 0) : 0;
  const currency = cleanText(invoice.currency, "EUR");

  return `
    <li class="home-invoice-item">
      <span class="home-invoice-main">
        <strong>${escapeHtml(id)}</strong>
        <span>${escapeHtml(status)}</span>
      </span>
      <span class="home-invoice-amount">${invoice.paid ? escapeHtml(formatMoney(amount, currency)) : "—"}</span>
    </li>
  `;
}

function invoices(vm) {
  const items = vm.facturas.slice(0, 5);
  const route = safeRoute(vm.routes.facturas, "/facturas");

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
        <strong>${escapeHtml(formatMoney(vm.counts.paidTotal, vm.counts.currency))}</strong>
      </div>

      ${items.length
        ? `<ul class="home-invoice-list">${items.map(invoiceItem).join("")}</ul>`
        : emptyState("Sin facturas visibles", "Cuando haya facturas disponibles aparecerán aquí.", "invoice")
      }
    </section>
  `;
}

function entities(vm) {
  if (!vm.admin) return "";

  const clientes = vm.clientes.slice(0, 5);
  const users = vm.users.slice(0, 5);

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
          ${clientes.length
            ? `<ul class="home-mini-list">${clientes.map((client) => `
                <li>
                  <strong>${escapeHtml(cleanText(first(client.name, client.nombre, client.displayName), "Cliente"))}</strong>
                  <span>${escapeHtml(client.active === false ? "Inactivo" : "Activo")}</span>
                </li>
              `).join("")}</ul>`
            : `<p class="home-panel-muted">Sin clientes visibles.</p>`
          }
        </div>

        <div>
          <h3>Usuarios</h3>
          ${users.length
            ? `<ul class="home-mini-list">${users.map((user) => `
                <li>
                  <strong>${escapeHtml(cleanText(first(user.displayName, user.name, user.username), "Usuario"))}</strong>
                  <span>${escapeHtml(cleanText(user.role, "user"))}</span>
                </li>
              `).join("")}</ul>`
            : `<p class="home-panel-muted">Sin usuarios visibles.</p>`
          }
        </div>
      </div>
    </section>
  `;
}

export function renderHomeLoadingState(input = {}) {
  return renderHomeTemplate({
    ...input,
    loading: true,
  });
}

export function renderHomeErrorState(message = "No se pudo cargar el Home.") {
  return `
    <section class="home-view-root home-view-root--error" data-home-scope="true">
      ${errorBanner(message)}
      <section class="home-panel">
        ${emptyState("No se pudo cargar el Home", message, "alert")}
      </section>
    </section>
  `;
}

export function renderHomeTemplate(input = {}) {
  const vm = buildVm(input);

  return `
    <section
      class="home-view-root ${vm.admin ? "home-view-root--admin" : "home-view-root--user"} ${vm.loading ? "is-loading" : ""} ${vm.error ? "has-error" : ""} ${vm.stale ? "is-stale" : ""}"
      data-home-scope="true"
      data-home-template-version="${attr(HOME_TEMPLATE_VERSION)}"
      data-home-role="${vm.admin ? "admin" : "user"}"
      data-home-admin="${vm.admin ? "true" : "false"}"
      aria-busy="${vm.loading ? "true" : "false"}"
    >
      ${errorBanner(vm.error)}
      ${header(vm)}
      ${stats(vm)}

      <section class="home-grid" data-home-section="main-grid">
        ${activity(vm)}
        ${invoices(vm)}
        ${entities(vm)}
      </section>
    </section>
  `;
}

export const renderHomeViewTemplate = renderHomeTemplate;
export const renderHomeDashboardTemplate = renderHomeTemplate;
export const renderHome = renderHomeTemplate;
export const renderDashboard = renderHomeTemplate;

export function getHomeTemplateSnapshot() {
  return {
    version: HOME_TEMPLATE_VERSION,
    actions: ACTIONS,
    policy: {
      templateOnly: true,
      noImports: true,
      noDomApi: true,
      noListeners: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
    },
  };
}

export default renderHomeTemplate;
