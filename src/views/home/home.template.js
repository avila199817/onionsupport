/* =========================================================
   Onion Support - Home Template
   Archivo: /src/views/home/home.template.js

   Responsabilidad:
   - Render HTML puro del Home.
   - Consumir dashboard ligero desde index.js/home.api.js.
   - Header limpio con CTA Crear incidencia.
   - Stats principales.
   - Actividad reciente.
   - Facturación resumida.
   - Admin mantiene accesos resumidos en stats.
   - User ve sólo incidencias/facturas propias según backend.
   - Sin DOM API.
   - Sin listeners.
   - Sin Auth.
   - Sin Router.
   - Sin AppCore.
   - Sin HTTP.
   - Sin Store.
   - Sin storage.
   - Sin CSS inline.
   - Sin handlers inline.
========================================================= */

export const HOME_TEMPLATE_VERSION = "home.template.dashboard.v3.clean";

const ACTIONS = Object.freeze({
  RETRY: "retry",
  CREATE_INCIDENCIA: "create_incidencia",
  NAVIGATE: "navigate",
});

const DEFAULT_ROUTES = Object.freeze({
  home: "/",
  incidencias: "/incidencias",
  facturas: "/facturas",
  clientes: "/clientes",
  usuarios: "/usuarios",
  servidor: "/servidor",
  cuenta: "/cuenta",
  ajustes: "/ajustes",
});

const STATUS_LABELS = Object.freeze({
  open: "Abierta",
  opened: "Abierta",
  new: "Nueva",
  pending: "Pendiente",
  in_progress: "En curso",
  progress: "En curso",
  resolved: "Resuelta",
  closed: "Cerrada",
  paid: "Pagada",
  unpaid: "Pendiente",
  overdue: "Vencida",
  active: "Activo",
  inactive: "Inactivo",
});

const PRIORITY_LABELS = Object.freeze({
  low: "Baja",
  normal: "Normal",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
  critical: "Crítica",
});

/* =========================================================
   BASICS
========================================================= */

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
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

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function number(value = 0, fallback = 0) {
  const output = Number(value);
  return Number.isFinite(output) ? output : fallback;
}

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(number(value, 0));
  } catch {
    return String(number(value, 0));
  }
}

function formatMoney(value = 0, currency = "EUR") {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: cleanText(currency, "EUR"),
      maximumFractionDigits: 2,
    }).format(number(value, 0));
  } catch {
    return `${number(value, 0).toFixed(2)} €`;
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
    return new Date(time).toLocaleString("es-ES");
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
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization)=/i.test(raw)) {
    return "";
  }

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
  if (/[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization)=/i.test(route)) {
    return fallback;
  }

  return route;
}

function normalizeStatus(value = "") {
  const status = cleanText(value, "").toLowerCase();
  return STATUS_LABELS[status] || cleanText(value, "Sin estado");
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "activity") {
  const common =
    `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;

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
    clock: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  };

  return icons[name] || icons.activity;
}

/* =========================================================
   VM
========================================================= */

function buildVm(input = {}) {
  const data = isObject(input) ? input : {};
  const dashboard = isObject(data.dashboard) ? data.dashboard : data;
  const summary = isObject(dashboard.summary) ? dashboard.summary : {};
  const user = isObject(first(data.user, dashboard.user, {}))
    ? first(data.user, dashboard.user, {})
    : {};

  const role = cleanText(
    first(data.role, dashboard.role, user.role, user.rol, "user"),
    "user"
  ).toLowerCase();

  const admin = dashboard.admin === true || role === "admin" || user.role === "admin";

  const routes = {
    ...DEFAULT_ROUTES,
    ...(isObject(data.routes) ? data.routes : {}),
  };

  const tickets = safeArray(first(dashboard.tickets, dashboard.incidencias, []));
  const facturas = safeArray(first(dashboard.facturas, dashboard.invoices, []));
  const clientes = admin ? safeArray(first(dashboard.clientes, dashboard.clients, [])) : [];
  const users = admin ? safeArray(first(dashboard.users, dashboard.usuarios, [])) : [];
  const activity = safeArray(dashboard.activity);

  const displayName = cleanText(
    first(user.displayName, user.name, user.fullName, user.username, data.displayName),
    "Usuario"
  );

  const paidTotal = number(first(summary.paidTotal, summary.totalPaid, 0), 0);
  const currency = cleanText(summary.currency, facturas[0]?.currency || "EUR");

  return {
    dashboard,
    summary,

    user: {
      ...user,
      displayName,
      initials: cleanText(user.initials, initialsFrom(displayName)),
      avatarUrl: safeImageSrc(first(user.avatarUrl, user.avatar, user.picture, "")),
    },

    role,
    admin,

    tickets,
    facturas,
    activity,

    routes,

    loading: data.loading === true,
    error: cleanText(first(data.error, dashboard.error, ""), ""),
    stale: dashboard.stale === true,

    counts: {
      tickets: number(first(summary.tickets, summary.incidencias, tickets.length, 0), 0),
      facturas: number(first(summary.facturas, summary.invoices, facturas.length, 0), 0),
      clientes: admin ? number(first(summary.clientes, summary.clients, clientes.length, 0), 0) : 0,
      users: admin ? number(first(summary.users, summary.usuarios, users.length, 0), 0) : 0,
      paidTotal,
      currency,
    },
  };
}

/* =========================================================
   SMALL PARTIALS
========================================================= */

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
  return Array.from({ length: count }, (_, index) => `
    <article class="home-stat-card home-stat-card--loading" aria-hidden="true" data-home-loading-card="${index + 1}">
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
  const text = cleanText(message, "");

  if (!text) return "";

  return `
    <div class="home-alert home-alert--error" role="alert">
      <span class="home-alert-icon" aria-hidden="true">${icon("alert")}</span>
      <span>${escapeHtml(text)}</span>
      <button
        type="button"
        class="home-btn home-btn--ghost"
        data-home-action="${ACTIONS.RETRY}"
        data-action="${ACTIONS.RETRY}"
      >
        Reintentar
      </button>
    </div>
  `;
}

function staleBanner(stale = false) {
  if (!stale) return "";

  return `
    <div class="home-alert home-alert--stale" role="status">
      <span class="home-alert-icon" aria-hidden="true">${icon("clock")}</span>
      <span>Mostrando datos guardados temporalmente.</span>
    </div>
  `;
}

function actionButton({
  label = "",
  route = "/",
  action = ACTIONS.NAVIGATE,
  iconName = "arrowRight",
  className = "home-link-button",
  ariaLabel = "",
} = {}) {
  const href = safeRoute(route, "/");

  return `
    <button
      type="button"
      class="${attr(className)}"
      data-home-action="${attr(action)}"
      data-action="${attr(action)}"
      data-route="${attr(href)}"
      data-href="${attr(href)}"
      aria-label="${attr(ariaLabel || label)}"
    >
      <span>${escapeHtml(label)}</span>
      <span aria-hidden="true">${icon(iconName)}</span>
    </button>
  `;
}

/* =========================================================
   HEADER
========================================================= */

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

        <div class="home-header-copy">
          <p class="home-eyebrow">${vm.admin ? "Panel administrador" : "Panel privado"}</p>

          <h1>Hola, ${escapeHtml(vm.user.displayName)}</h1>

          <p class="home-subtitle">
            ${vm.admin
              ? "Resumen operativo de incidencias, facturas y accesos principales."
              : "Resumen de tus incidencias y facturas."
            }
          </p>
        </div>
      </div>

      ${createCard(vm)}
    </header>
  `;
}

/* =========================================================
   STATS
========================================================= */

function statCard({ label, value, text, iconName, route, modifier }) {
  const href = safeRoute(route, "/");
  const key = normalizeKey(modifier || label || "stat");

  return `
    <article class="home-stat-card home-stat-card--${attr(key)}" data-home-stat="${attr(key)}" data-route="${attr(href)}">
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
    return `
      <section class="home-stats" data-home-section="stats">
        ${loadingCards(vm.admin ? 4 : 2)}
      </section>
    `;
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
      label: "Facturas",
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
        text: "Usuarios activos o registrados.",
        iconName: "users",
        route: vm.routes.usuarios,
        modifier: "usuarios",
      }
    );
  }

  return `
    <section class="home-stats" data-home-section="stats">
      ${cards.map(statCard).join("")}
    </section>
  `;
}

/* =========================================================
   ACTIVITY
========================================================= */

function activityIcon(type = "") {
  const normalized = cleanText(type, "").toLowerCase();

  if (normalized.includes("invoice") || normalized.includes("factura")) return "invoice";
  if (normalized.includes("ticket") || normalized.includes("incidencia")) return "ticket";
  if (normalized.includes("client") || normalized.includes("cliente")) return "client";
  if (normalized.includes("user") || normalized.includes("usuario")) return "users";

  return "activity";
}

function activityItem(item = {}) {
  const source = isObject(item) ? item : {};
  const type = normalizeKey(source.type || "activity");
  const title = cleanText(first(source.title, source.subject, source.name), "Actividad");
  const text = cleanText(first(source.text, source.description, source.status), "Actualización registrada.");
  const date = first(source.date, source.updatedAt, source.createdAt, "");

  return `
    <li class="home-activity-item home-activity-item--${attr(type)}">
      <span class="home-activity-icon" aria-hidden="true">${icon(activityIcon(type))}</span>

      <span class="home-activity-body">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text)}</span>
      </span>

      <time datetime="${attr(date || "")}">${escapeHtml(formatDate(date))}</time>
    </li>
  `;
}

function activity(vm) {
  const items = vm.activity.slice(0, 6);

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

/* =========================================================
   INVOICES
========================================================= */

function invoiceItem(invoice = {}) {
  const source = isObject(invoice) ? invoice : {};
  const id = cleanText(
    first(source.invoiceId, source.facturaId, source.id, source.title),
    "Factura"
  );

  const title = cleanText(first(source.title, source.name, source.concepto), id);
  const status = cleanText(source.status, source.paid ? "paid" : "pending");
  const amount = source.paid
    ? first(source.paidAmount, source.total, source.amount, 0)
    : first(source.total, source.amount, 0);

  const currency = cleanText(source.currency, "EUR");

  return `
    <li class="home-invoice-item">
      <span class="home-invoice-main">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(normalizeStatus(status))}</span>
      </span>

      <span class="home-invoice-amount">
        ${source.paid ? escapeHtml(formatMoney(amount, currency)) : "—"}
      </span>
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

        ${actionButton({
          label: "Ver facturas",
          route,
          iconName: "arrowRight",
          className: "home-link-button",
          ariaLabel: "Ver facturas",
        })}
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

/* =========================================================
   STATES
========================================================= */

export function renderHomeLoadingState(input = {}) {
  return renderHomeTemplate({
    ...input,
    loading: true,
  });
}

export function renderHomeErrorState(message = "No se pudo cargar el Home.") {
  return `
    <section
      class="home-view-root home-view-root--error"
      data-home-scope="true"
      data-home-template-version="${attr(HOME_TEMPLATE_VERSION)}"
      aria-busy="false"
    >
      ${errorBanner(message)}

      <section class="home-panel">
        ${emptyState("No se pudo cargar el Home", message, "alert")}
      </section>
    </section>
  `;
}

/* =========================================================
   MAIN TEMPLATE
========================================================= */

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
      ${staleBanner(vm.stale)}
      ${header(vm)}
      ${stats(vm)}

      <section class="home-grid" data-home-section="main-grid">
        ${activity(vm)}
        ${invoices(vm)}
      </section>
    </section>
  `;
}

/* =========================================================
   COMPAT EXPORTS
========================================================= */

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
      noStorage: true,
      noCssInline: true,
      noInlineHandlers: true,
    },
  };
}

export default renderHomeTemplate;
