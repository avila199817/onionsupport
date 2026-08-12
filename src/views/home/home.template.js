/* =========================================================
   Onion Support - Plantilla de Inicio
   Archivo: /src/views/home/home.template.js

   PRODUCTIVO · TOTAL FACTURADO GLOBAL

   Responsabilidad:
   - Renderizar HTML puro de Inicio desde un ViewModel estable.
   - Mantener clases/estructura consumidas por /src/css/views/home/index.css.
   - Mantener navegación/acciones declarativas para index.js.
   - Mostrar el TOTAL FACTURADO global recibido desde Home API.
   - NO confundir facturado con pagado.
   - Sin DOM API, listeners, Auth, Router, HTTP, Store ni Storage.
   - Sin CSS ni handlers inline.
========================================================= */

export const HOME_TEMPLATE_VERSION =
  "home.template.inicio.v8.total-invoiced.production";

const ACTIONS = Object.freeze({
  RETRY: "retry",
  NAVIGATE: "navigate",
});

const DEFAULT_ROUTES = Object.freeze({
  home: "/dashboard",
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
  processing: "En curso",
  resolved: "Resuelta",
  closed: "Cerrada",
  solved: "Resuelta",

  paid: "Pagada",
  unpaid: "Pendiente",
  pending_payment: "Pendiente",
  partial: "Parcial",
  overdue: "Vencida",
  issued: "Emitida",
  draft: "Borrador",
  cancelled: "Cancelada",
  canceled: "Cancelada",
  refunded: "Reembolsada",

  active: "Activo",
  inactive: "Inactivo",
  enabled: "Activo",
  disabled: "Inactivo",
});

const SVG_COMMON =
  `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;

const ICONS = Object.freeze({
  ticket: `<svg ${SVG_COMMON}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
  invoice: `<svg ${SVG_COMMON}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
  client: `<svg ${SVG_COMMON}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>`,
  users: `<svg ${SVG_COMMON}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
  activity: `<svg ${SVG_COMMON}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  euro: `<svg ${SVG_COMMON}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 5a7.7 7.7 0 0 0-5.2-2C8.4 3 4 7 4 12s4.4 9 9.8 9a7.7 7.7 0 0 0 5.2-2"/></svg>`,
  alert: `<svg ${SVG_COMMON}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  arrowRight: `<svg ${SVG_COMMON}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
  clock: `<svg ${SVG_COMMON}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("es-ES");
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const MONEY_FORMATTERS = new Map();

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
   CRÍTICO:
   No usar flat(Infinity). Los arrays son valores completos.
*/
function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w.:]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function hasAmount(value = null) {
  return optionalNumber(value) !== null;
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatNumber(value = 0) {
  try {
    return NUMBER_FORMATTER.format(number(value, 0));
  } catch {
    return String(number(value, 0));
  }
}

function getMoneyFormatter(currency = "EUR") {
  const code = cleanText(currency, "EUR").toUpperCase();

  if (!MONEY_FORMATTERS.has(code)) {
    try {
      MONEY_FORMATTERS.set(
        code,
        new Intl.NumberFormat("es-ES", {
          style: "currency",
          currency: code,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    } catch {
      MONEY_FORMATTERS.set(code, null);
    }
  }

  return {
    code,
    formatter: MONEY_FORMATTERS.get(code),
  };
}

function formatMoney(value = 0, currency = "EUR") {
  const amount = number(value, 0);
  const { code, formatter } = getMoneyFormatter(currency);

  if (formatter) {
    try {
      return formatter.format(amount);
    } catch {
      // fallback below
    }
  }

  return `${amount.toFixed(2).replace(".", ",")} ${code}`;
}

function formatBillingAmount(value, currency = "EUR", available = true) {
  if (!available || optionalNumber(value) === null) {
    return "No disponible";
  }

  return formatMoney(value, currency);
}

function toDate(value = "") {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time) : null;
}

function formatDate(value = "") {
  const date = toDate(value);
  if (!date) return "Sin fecha";

  try {
    return DATE_TIME_FORMATTER.format(date);
  } catch {
    return date.toLocaleString("es-ES");
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

function normalizeStatus(value = "") {
  const raw = cleanText(value, "");
  return STATUS_LABELS[normalizeKey(raw)] || raw || "Sin estado";
}

function visibleText(value = "", fallback = "") {
  const text = cleanText(value, "");
  if (!text) return fallback;

  return STATUS_LABELS[normalizeKey(text)] || text;
}

/* =========================================================
   URL SAFETY
========================================================= */

function safeImageSrc(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";
  if (raw.startsWith("//")) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|vbscript|file):/i.test(raw)) return "";
  if (
    /[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization)=/i.test(
      raw
    )
  ) {
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
  if (
    /[?&#](?:token|access_token|refresh_token|password|secret|sig|signature|jwt|authorization)=/i.test(
      route
    )
  ) {
    return fallback;
  }

  return route;
}

function icon(name = "activity") {
  return ICONS[name] || ICONS.activity;
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(input = {}) {
  const data = isObject(input) ? input : {};
  const dashboard = isObject(data.dashboard) ? data.dashboard : data;
  const summary = isObject(dashboard.summary) ? dashboard.summary : {};

  const userCandidate = first(data.user, dashboard.user, {});
  const user = isObject(userCandidate) ? userCandidate : {};

  const role = cleanText(
    first(data.role, dashboard.role, user.role, user.rol, "user"),
    "user"
  ).toLowerCase();

  const admin =
    dashboard.admin === true ||
    normalizeKey(role) === "admin" ||
    normalizeKey(user.role) === "admin";

  const routes = {
    ...DEFAULT_ROUTES,
    ...(isObject(data.routes) ? data.routes : {}),
  };

  const incidencias = safeArray(
    first(dashboard.incidencias, dashboard.tickets, [])
  );

  const facturas = safeArray(
    first(dashboard.facturas, dashboard.invoices, [])
  );

  const clientes = admin
    ? safeArray(first(dashboard.clientes, dashboard.clients, []))
    : [];

  const usuarios = admin
    ? safeArray(first(dashboard.usuarios, dashboard.users, []))
    : [];

  const activity = safeArray(
    first(dashboard.activity, dashboard.actividad, dashboard.movimientos, [])
  );

  const displayName = cleanText(
    first(
      user.displayName,
      user.name,
      user.fullName,
      user.nombre,
      user.username,
      data.displayName
    ),
    "Usuario"
  );

  /*
     CANÓNICO:
     El total se recibe ya calculado por /api/facturas/stats.
     No se suma el array facturas.
  */
  const totalInvoiced = optionalNumber(
    first(
      summary.totalInvoiced,
      summary.totalAmount,
      summary.grossAmount,
      summary.totalFacturado,
      null
    )
  );

  const paidTotal = optionalNumber(
    first(
      summary.paidTotal,
      summary.paidAmount,
      summary.totalPaid,
      summary.totalPagado,
      null
    )
  );

  const currency = cleanText(
    first(
      summary.currency,
      summary.moneda,
      facturas[0]?.currency,
      facturas[0]?.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  const invoiceStatsAvailable =
    summary.invoiceStatsAvailable === true &&
    totalInvoiced !== null;

  return {
    user: {
      ...user,
      displayName,
      initials: cleanText(user.initials, initialsFrom(displayName)),
      avatarUrl: safeImageSrc(
        first(
          user.avatarUrl,
          user.avatar,
          user.picture,
          user.photoUrl,
          user.photoURL,
          user.imageUrl,
          ""
        )
      ),
    },

    role,
    admin,
    incidencias,
    facturas,
    activity,
    routes,

    loading: data.loading === true,
    error: cleanText(first(data.error, dashboard.error, ""), ""),
    stale: dashboard.stale === true,

    counts: {
      incidencias: number(
        first(summary.incidencias, summary.tickets, incidencias.length, 0),
        0
      ),

      facturas: number(
        first(summary.facturas, summary.invoices, facturas.length, 0),
        0
      ),

      clientes: admin
        ? number(first(summary.clientes, summary.clients, clientes.length, 0), 0)
        : 0,

      usuarios: admin
        ? number(first(summary.usuarios, summary.users, usuarios.length, 0), 0)
        : 0,

      totalInvoiced,
      totalAmount: totalInvoiced,
      paidTotal,
      currency,
      invoiceStatsAvailable,
    },
  };
}

/* =========================================================
   SMALL PARTS
========================================================= */

function avatar(user = {}) {
  const image = safeImageSrc(user.avatarUrl);
  const name = cleanText(user.displayName, "Usuario");
  const initials = cleanText(user.initials, initialsFrom(name));

  return `
    <span
      class="home-current-user-avatar ${image ? "has-image" : "is-fallback"}"
      aria-label="${attr(name)}"
      data-has-avatar="${image ? "true" : "false"}"
    >
      ${
        image
          ? `<img src="${attr(image)}" alt="${attr(name)}" loading="eager" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" draggable="false">`
          : ""
      }
      <span class="home-avatar-initials" aria-hidden="${image ? "true" : "false"}">${escapeHtml(initials)}</span>
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

function emptyState(
  title = "Sin datos",
  text = "No hay información disponible.",
  iconName = "activity"
) {
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
      >Reintentar</button>
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
  iconName = "arrowRight",
  className = "home-link-button",
  ariaLabel = "",
} = {}) {
  const href = safeRoute(route, "/");

  return `
    <button
      type="button"
      class="${attr(className)}"
      data-home-action="${ACTIONS.NAVIGATE}"
      data-route="${attr(href)}"
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

function header(vm) {
  return `
    <header class="home-header home-header--clean" data-home-section="header">
      <div class="home-header-main">
        ${avatar(vm.user)}
        <div class="home-header-copy">
          <h1 class="home-title">Hola, ${escapeHtml(vm.user.displayName)}</h1>
          <p class="home-subtitle">${
            vm.admin
              ? "Resumen operativo de incidencias, facturas, clientes y usuarios."
              : "Resumen de tus incidencias y facturas."
          }</p>
        </div>
      </div>
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
    <article class="home-stat-card home-stat-card--${attr(key)}" data-home-stat="${attr(key)}">
      <button
        type="button"
        class="home-stat-card-button"
        data-home-action="${ACTIONS.NAVIGATE}"
        data-route="${attr(href)}"
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

  const billedText = vm.counts.invoiceStatsAvailable
    ? `Facturado: ${formatBillingAmount(
        vm.counts.totalInvoiced,
        vm.counts.currency,
        true
      )}`
    : "Facturado: no disponible";

  const cards = [
    {
      label: "Incidencias",
      value: vm.counts.incidencias,
      text: "Incidencias visibles en el panel.",
      iconName: "ticket",
      route: vm.routes.incidencias,
      modifier: "incidencias",
    },
    {
      label: "Facturas",
      value: vm.counts.facturas,
      text: billedText,
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
        value: vm.counts.usuarios,
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
  const key = normalizeKey(type);

  if (key.includes("invoice") || key.includes("factura")) return "invoice";
  if (key.includes("ticket") || key.includes("incidencia")) return "ticket";
  if (key.includes("client") || key.includes("cliente")) return "client";
  if (key.includes("user") || key.includes("usuario")) return "users";

  return "activity";
}

function activityItem(item = {}) {
  const source = isObject(item) ? item : {};
  const type = normalizeKey(first(source.type, source.tipo, "activity"));

  const title = visibleText(
    first(
      source.title,
      source.titulo,
      source.subject,
      source.asunto,
      source.name,
      source.nombre
    ),
    "Actividad registrada"
  );

  const statusText = normalizeStatus(first(source.status, source.estado, ""));

  const bodyText = visibleText(
    first(source.text, source.description, source.descripcion, ""),
    statusText || "Actualización registrada."
  );

  const date = first(
    source.date,
    source.fecha,
    source.updatedAt,
    source.createdAt,
    source.creadoEn,
    ""
  );

  return `
    <li class="home-activity-item home-activity-item--${attr(type)}">
      <span class="home-activity-icon" aria-hidden="true">${icon(activityIcon(type))}</span>
      <span class="home-activity-body">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(bodyText)}</span>
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
      ${
        items.length
          ? `<ul class="home-activity-list">${items.map(activityItem).join("")}</ul>`
          : emptyState(
              "Sin actividad reciente",
              "Todavía no hay movimientos visibles en el inicio.",
              "activity"
            )
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
    first(
      source.facturaId,
      source.invoiceId,
      source.id,
      source.numeroFacturaLegal,
      source.invoiceNumber
    ),
    "Factura"
  );

  const title = visibleText(
    first(
      source.title,
      source.titulo,
      source.name,
      source.nombre,
      source.concepto,
      source.numeroFacturaLegal,
      source.invoiceNumber
    ),
    "Factura disponible para consulta."
  );

  const status = normalizeStatus(
    first(
      source.paymentStatus,
      source.estadoPago,
      source.status,
      source.estado,
      source.paid ? "paid" : "issued"
    )
  );

  const amount = first(
    source.total,
    source.totalFactura,
    source.invoiceAmount,
    source.amount,
    source.importe,
    source.paidAmount,
    0
  );

  const currency = cleanText(
    first(source.currency, source.moneda, "EUR"),
    "EUR"
  );

  return `
    <li class="home-invoice-item" data-home-invoice="${attr(id)}">
      <span class="home-invoice-main">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(status)}</span>
      </span>
      <span class="home-invoice-amount">${
        hasAmount(amount) ? escapeHtml(formatMoney(amount, currency)) : "—"
      }</span>
    </li>
  `;
}

function invoices(vm) {
  const items = vm.facturas.slice(0, 5);
  const route = safeRoute(vm.routes.facturas, "/facturas");

  const billedAmount = formatBillingAmount(
    vm.counts.totalInvoiced,
    vm.counts.currency,
    vm.counts.invoiceStatsAvailable
  );

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

      <div
        class="home-billing-total"
        data-home-billing-total="invoiced"
        data-home-billing-source="api-facturas-stats"
      >
        <span>Importe total facturado</span>
        <strong>${escapeHtml(billedAmount)}</strong>
      </div>

      ${
        items.length
          ? `<ul class="home-invoice-list">${items.map(invoiceItem).join("")}</ul>`
          : emptyState(
              "Sin facturas visibles",
              "Cuando haya facturas disponibles aparecerán aquí.",
              "invoice"
            )
      }
    </section>
  `;
}

/* =========================================================
   STATES / MAIN TEMPLATE
========================================================= */

export function renderHomeLoadingState(input = {}) {
  return renderHomeTemplate({
    ...input,
    loading: true,
  });
}

export function renderHomeErrorState(
  message = "No se pudo cargar el inicio."
) {
  const safeMessage = cleanText(message, "No se pudo cargar el inicio.");

  return `
    <section
      class="home-view-root home-view-root--error"
      data-home-scope="true"
      data-home-template-version="${attr(HOME_TEMPLATE_VERSION)}"
      aria-busy="false"
    >
      ${errorBanner(safeMessage)}
      <section class="home-panel">
        ${emptyState("No se pudo cargar el inicio", safeMessage, "alert")}
      </section>
    </section>
  `;
}

export function renderHomeTemplate(input = {}) {
  const vm = buildVm(input);

  const stateClasses = [
    vm.admin ? "home-view-root--admin" : "home-view-root--user",
    vm.loading ? "is-loading" : "",
    vm.error ? "has-error" : "",
    vm.stale ? "is-stale" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <section
      class="home-view-root ${stateClasses}"
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

export function getHomeTemplateSnapshot() {
  return {
    version: HOME_TEMPLATE_VERSION,
    actions: ACTIONS,
    policy: {
      templateOnly: true,
      invoiceTotalMeaning: "total_invoiced",
      invoiceStatsSource: "/api/facturas/stats",
      neverAggregateVisibleInvoiceRows: true,
      noArrayFlatten: true,
      cachedIntlFormatters: true,
      staticIconRegistry: true,
      noDomApi: true,
      noListeners: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noStorage: true,
      noCssInline: true,
      noInlineHandlers: true,
      visibleTextLanguage: "es",
    },
  };
}

export default renderHomeTemplate;
