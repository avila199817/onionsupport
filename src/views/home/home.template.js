/* =========================================================
   Onion SPA - Home Dashboard Template
   Archivo: src/views/home/home.template.js

   FINAL EXTREME PRODUCTION TEMPLATE · HOME VIEW · USER + ADMIN · APPLE SAAS MODE · 10/10

   RESPONSABILIDADES:
   - render del home/dashboard para usuarios y administradores
   - una única plantilla role-aware: user/admin
   - consumir datos normalizados desde home.api.js / HomeView.js
   - soportar dashboard/summary/widgets como fuente principal
   - soportar colecciones heterogéneas como fallback
   - stats, widgets, acciones rápidas, actividad reciente y tabla compacta
   - loading visual en refresh / crear incidencia / navegación
   - paginación visual estable
   - responsive robusto
   - estilos encapsulados
   - compatible con HomeView.js o render directo desde Router
   - acciones compatibles con data-home-action y data-action
   - CSP friendly: sin handlers inline tipo onerror
   - rutas alineadas con src/router/routes.js

   CONTRATO SOPORTADO:
   renderHomeTemplate({
     user,
     role,
     dashboard,
     summary,
     widgets,
     tickets,
     incidencias,
     facturas,
     invoices,
     users,
     usuarios,
     clients,
     clientes,
     activity,
     recentActivity,
     state: {
       loading,
       refreshing,
       creating,
       navigatingAction,
       openingTicketId,
       role,
       user
     }
   })
========================================================= */

/* =========================================================
   ROUTES
========================================================= */

const HOME_ROUTES = Object.freeze({
  HOME: "/",
  INCIDENCIAS: "/incidencias",
  FACTURAS: "/facturas",
  USUARIOS: "/usuarios",
  CLIENTES: "/clientes",
  CUENTA: "/cuenta",
  AJUSTES: "/ajustes",
});

/* =========================================================
   HELPERS
========================================================= */

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

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyObject(value) {
  return Boolean(isObject(value) && Object.keys(value).length);
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    if (isObject(value) && Object.keys(value).length === 0) {
      continue;
    }

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

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function clampNumber(value = 0, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = safeNumber(value, min);
  return Math.min(Math.max(n, min), max);
}

function formatNumber(value = 0) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "0";
  }

  try {
    return new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

function formatMoney(value = 0, currency = "EUR") {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: safeText(currency, "EUR"),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${safeText(currency, "EUR")}`;
  }
}

function formatDateTime(value = null) {
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

  return formatDateTime(value);
}

function formatLastUpdate(value = null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffHours = Math.abs(Date.now() - date.getTime()) / 3600000;

  if (diffHours <= 72) {
    return formatRelativeDate(value);
  }

  return formatDateTime(value);
}

function normalizeRoute(route = "") {
  const raw = safeText(route, "");

  if (!raw) return "";

  const lowered = raw.toLowerCase();

  if (
    lowered.startsWith("javascript:") ||
    lowered.startsWith("mailto:") ||
    lowered.startsWith("tel:")
  ) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}

/* =========================================================
   DASHBOARD / SUMMARY
========================================================= */

function getDashboard(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return safeObject(
    first(
      data.dashboard,
      state.dashboard,
      data.raw?.dashboard,
      data.payload?.dashboard,
      {}
    )
  );
}

function getSummary(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);

  return safeObject(
    first(
      data.summary,
      data.stats,
      data.metrics,
      data.totals,
      state.summary,
      state.stats,
      dashboard.summary,
      dashboard.stats,
      dashboard.metrics,
      dashboard.totals,
      data.payload?.summary,
      data.payload?.stats,
      {}
    )
  );
}

function getSummaryValue(input = {}, keys = [], fallback = null) {
  const summary = getSummary(input);
  const dashboard = getDashboard(input);
  const state = safeObject(input.state);

  const candidates = [];

  for (const key of safeArray(keys)) {
    candidates.push(summary?.[key]);
    candidates.push(dashboard?.[key]);
    candidates.push(state?.[key]);
    candidates.push(input?.[key]);
  }

  return first(...candidates, fallback);
}

function getWidgets(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);

  return normalizeCollection(
    first(
      data.widgets,
      data.cards,
      data.kpis,
      state.widgets,
      state.cards,
      state.kpis,
      dashboard.widgets,
      dashboard.cards,
      dashboard.kpis,
      dashboard.blocks,
      data.payload?.widgets,
      []
    )
  );
}

/* =========================================================
   COLLECTION NORMALIZATION
========================================================= */

function unwrapCollectionPayload(value = null, depth = 0) {
  if (value === null || value === undefined) {
    return {};
  }

  if (depth > 8) {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      items: value,
      total: value.length,
      count: value.length,
    };
  }

  const object = safeObject(value, null);

  if (!object) {
    return {};
  }

  if (
    Array.isArray(object.items) ||
    Array.isArray(object.rows) ||
    Array.isArray(object.data) ||
    Array.isArray(object.results) ||
    Array.isArray(object.records) ||
    Array.isArray(object.value) ||
    Array.isArray(object.docs) ||
    Array.isArray(object.collection)
  ) {
    return object;
  }

  const directArray = first(
    object.tickets,
    object.incidencias,
    object.facturas,
    object.invoices,
    object.users,
    object.usuarios,
    object.clients,
    object.clientes,
    object.customers,
    object.activity,
    object.activities,
    object.recent,
    object.recentActivity
  );

  if (Array.isArray(directArray)) {
    return {
      ...object,
      items: directArray,
      total: first(object.total, object.count, object.remoteCount, directArray.length),
    };
  }

  const nested = first(
    object.payload,
    object.result,
    object.response,
    object.body,
    object.data
  );

  if (isObject(nested) || Array.isArray(nested)) {
    return unwrapCollectionPayload(nested, depth + 1);
  }

  return object;
}

function normalizeCollection(value) {
  if (Array.isArray(value)) return value;

  const object = safeObject(unwrapCollectionPayload(value));

  return safeArray(
    first(
      object.items,
      object.rows,
      object.data,
      object.results,
      object.records,
      object.value,
      object.docs,
      object.collection,
      []
    )
  );
}

function getRemoteCountFromCollection(value, fallback = 0) {
  const object = safeObject(unwrapCollectionPayload(value));

  return Math.max(
    fallback,
    safeNumber(
      first(
        object.totalCount,
        object.remoteCount,
        object.total,
        object.count,
        object.length,
        object.meta?.total,
        object.meta?.count,
        object.pagination?.total,
        object.pagination?.count,
        object.page?.total,
        object.pageInfo?.total,
        fallback
      ),
      fallback
    )
  );
}

/* =========================================================
   ROLE / USER
========================================================= */

function getUser(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);

  return safeObject(
    first(
      data.user,
      data.currentUser,
      data.profile,
      state.user,
      state.currentUser,
      state.profile,
      dashboard.user,
      dashboard.currentUser,
      data.raw?.user,
      data.raw?.currentUser,
      {}
    )
  );
}

function getRole(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const user = getUser(data);
  const dashboard = getDashboard(data);

  return normalizeKey(
    first(
      data.role,
      data.currentRole,
      state.role,
      state.currentRole,
      dashboard.role,
      user.role,
      user.rol,
      user.type,
      user.userType,
      user.permissions?.role,
      data.raw?.role,
      "user"
    )
  );
}

function isAdminRole(role = "") {
  const key = normalizeKey(role);

  return [
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super_administrador",
    "owner",
    "root",
    "staff",
    "support",
  ].includes(key);
}

function getDisplayName(input = {}) {
  const user = getUser(input);

  return safeText(
    first(
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,
      user.username,
      user.email,
      input.name,
      input.displayName
    ),
    "Usuario"
  );
}

function getAvatarUrl(input = {}) {
  const user = getUser(input);

  return safeText(
    first(
      user.avatar,
      user.avatarUrl,
      user.avatar_url,
      user.photo,
      user.photoUrl,
      user.photoURL,
      user.picture,
      user.pictureUrl,
      user.image,
      user.imageUrl,
      user.profileImage,
      input.avatar,
      input.avatarUrl
    ),
    ""
  );
}

function getInitials(value = "") {
  const text = normalizeWhitespace(value);

  if (!text) return "ON";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "ON";
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getCollections(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const dashboard = getDashboard(data);

  const ticketsSource = first(
    data.tickets,
    data.incidencias,
    data.items,
    data.rows,
    state.tickets,
    state.incidencias,
    state.items,
    state.rows,
    dashboard.tickets,
    dashboard.incidencias,
    data.payload?.tickets,
    data.payload?.incidencias,
    []
  );

  const invoicesSource = first(
    data.facturas,
    data.invoices,
    data.bills,
    state.facturas,
    state.invoices,
    state.bills,
    dashboard.facturas,
    dashboard.invoices,
    data.payload?.facturas,
    data.payload?.invoices,
    []
  );

  const usersSource = first(
    data.users,
    data.usuarios,
    state.users,
    state.usuarios,
    dashboard.users,
    dashboard.usuarios,
    data.payload?.users,
    data.payload?.usuarios,
    []
  );

  const clientsSource = first(
    data.clients,
    data.clientes,
    data.customers,
    state.clients,
    state.clientes,
    state.customers,
    dashboard.clients,
    dashboard.clientes,
    dashboard.customers,
    data.payload?.clients,
    data.payload?.clientes,
    []
  );

  const activitySource = first(
    data.activity,
    data.activities,
    data.recentActivity,
    data.recent,
    data.logs,
    state.activity,
    state.activities,
    state.recentActivity,
    state.recent,
    state.logs,
    dashboard.activity,
    dashboard.activities,
    dashboard.recentActivity,
    dashboard.recent,
    dashboard.timeline,
    data.payload?.activity,
    []
  );

  const tickets = normalizeCollection(ticketsSource);
  const invoices = normalizeCollection(invoicesSource);
  const users = normalizeCollection(usersSource);
  const clients = normalizeCollection(clientsSource);
  const activity = normalizeCollection(activitySource);

  const summary = getSummary(data);

  return {
    tickets,
    invoices,
    users,
    clients,
    activity,

    ticketsRemoteCount: Math.max(
      tickets.length,
      safeNumber(
        first(
          summary.totalTickets,
          summary.ticketsTotal,
          summary.incidenciasTotal,
          dashboard.ticketsTotal,
          dashboard.incidenciasTotal,
          getRemoteCountFromCollection(ticketsSource, tickets.length)
        ),
        tickets.length
      )
    ),

    invoicesRemoteCount: Math.max(
      invoices.length,
      safeNumber(
        first(
          summary.totalInvoices,
          summary.invoicesTotal,
          summary.facturasTotal,
          dashboard.invoicesTotal,
          dashboard.facturasTotal,
          getRemoteCountFromCollection(invoicesSource, invoices.length)
        ),
        invoices.length
      )
    ),

    usersRemoteCount: Math.max(
      users.length,
      safeNumber(
        first(
          summary.usersCount,
          summary.usuariosCount,
          dashboard.usersTotal,
          dashboard.usuariosTotal,
          getRemoteCountFromCollection(usersSource, users.length)
        ),
        users.length
      )
    ),

    clientsRemoteCount: Math.max(
      clients.length,
      safeNumber(
        first(
          summary.clientsCount,
          summary.clientesCount,
          dashboard.clientsTotal,
          dashboard.clientesTotal,
          getRemoteCountFromCollection(clientsSource, clients.length)
        ),
        clients.length
      )
    ),
  };
}

/* =========================================================
   TICKETS / INCIDENCIAS
========================================================= */

function getTicketId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.code,
      item.numero,
      item.ticketCode,
      item.id,
      item._id,
      item.raw?.ticketId,
      item.raw?.incidenciaId,
      item.raw?.code,
      item.raw?.numero,
      item.raw?.ticketCode,
      item.raw?.id,
      item.raw?._id
    ),
    "INC-SIN-ID"
  );
}

function getTicketSubject(item = {}) {
  return safeText(
    first(
      item.subject,
      item.title,
      item.asunto,
      item.name,
      item.raw?.subject,
      item.raw?.title,
      item.raw?.asunto,
      item.raw?.name
    ),
    "Incidencia sin asunto"
  );
}

function getTicketDescription(item = {}) {
  return safeText(
    first(
      item.description,
      item.preview,
      item.message,
      item.descripcion,
      item.body,
      item.raw?.description,
      item.raw?.preview,
      item.raw?.message,
      item.raw?.descripcion,
      item.raw?.body
    ),
    "Sin descripción."
  );
}

function getTicketOwnerName(item = {}) {
  return safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.customerName,
      item.userName,
      item.createdByName,
      item.ownerName,
      item.name,
      item.cliente?.nombre,
      item.cliente?.name,
      item.client?.name,
      item.client?.nombre,
      item.customer?.name,
      item.createdBy?.name,
      item.user?.name,
      item.owner?.name,
      item.raw?.clientName,
      item.raw?.clienteNombre,
      item.raw?.customerName,
      item.raw?.userName,
      item.raw?.createdByName,
      item.raw?.ownerName,
      item.raw?.name,
      item.raw?.cliente?.nombre,
      item.raw?.cliente?.name,
      item.raw?.client?.name,
      item.raw?.client?.nombre,
      item.raw?.customer?.name,
      item.raw?.createdBy?.name,
      item.raw?.user?.name,
      item.raw?.owner?.name
    ),
    getTicketSubject(item)
  );
}

function getTicketAvatarUrl(item = {}) {
  return safeText(
    first(
      item.clientAvatar,
      item.avatar,
      item.avatarUrl,
      item.avatar_url,
      item.userAvatar,
      item.createdByAvatar,
      item.ownerAvatar,
      item.cliente?.avatar,
      item.cliente?.avatarUrl,
      item.client?.avatar,
      item.client?.avatarUrl,
      item.customer?.avatar,
      item.customer?.avatarUrl,
      item.createdBy?.avatar,
      item.createdBy?.avatarUrl,
      item.user?.avatar,
      item.user?.avatarUrl,
      item.owner?.avatar,
      item.owner?.avatarUrl,
      item.raw?.clientAvatar,
      item.raw?.avatar,
      item.raw?.avatarUrl,
      item.raw?.avatar_url,
      item.raw?.userAvatar,
      item.raw?.createdByAvatar,
      item.raw?.ownerAvatar,
      item.raw?.cliente?.avatar,
      item.raw?.cliente?.avatarUrl,
      item.raw?.client?.avatar,
      item.raw?.client?.avatarUrl,
      item.raw?.customer?.avatar,
      item.raw?.customer?.avatarUrl,
      item.raw?.createdBy?.avatar,
      item.raw?.createdBy?.avatarUrl,
      item.raw?.user?.avatar,
      item.raw?.user?.avatarUrl,
      item.raw?.owner?.avatar,
      item.raw?.owner?.avatarUrl
    ),
    ""
  );
}

function getTicketStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["open", "abierta", "abierto", "new", "nueva", "nuevo"].includes(key)) return "open";

  if (
    [
      "progress",
      "in_progress",
      "inprogress",
      "en_proceso",
      "proceso",
      "working",
      "trabajando",
      "assigned",
      "asignada",
      "asignado",
    ].includes(key)
  ) {
    return "progress";
  }

  if (["resolved", "resuelta", "resuelto", "solved"].includes(key)) return "resolved";
  if (["closed", "cerrada", "cerrado"].includes(key)) return "closed";

  if (["cancelled", "cancelada", "cancelado"].includes(key)) {
    return "closed";
  }

  return "pending";
}

function getTicketStatusLabel(value = "") {
  const key = getTicketStatusKey(value);

  if (key === "open") return "Abierta";
  if (key === "pending") return "Pendiente";
  if (key === "progress") return "En proceso";
  if (key === "resolved") return "Resuelta";
  if (key === "closed") return "Cerrada";

  return safeText(value, "Pendiente");
}

function getTicketStatus(item = {}) {
  return first(
    item.status,
    item.estado,
    item.state,
    item.raw?.status,
    item.raw?.estado,
    item.raw?.state,
    "pending"
  );
}

function getTicketPriorityKey(item = {}) {
  return normalizeKey(
    first(
      item.priority,
      item.prioridad,
      item.severity,
      item.raw?.priority,
      item.raw?.prioridad,
      item.raw?.severity,
      "medium"
    )
  );
}

function isTicketUrgent(item = {}) {
  return [
    "urgent",
    "urgente",
    "critical",
    "critica",
    "crítica",
    "high",
    "alta",
    "p1",
    "p0",
  ].includes(getTicketPriorityKey(item));
}

function isTicketClosedLike(item = {}) {
  return ["closed", "resolved"].includes(getTicketStatusKey(getTicketStatus(item)));
}

function isTicketOpenLike(item = {}) {
  return ["open", "pending", "progress"].includes(
    getTicketStatusKey(getTicketStatus(item))
  );
}

function getTicketCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.fechaCreacion,
    item.createdAtES,
    item.date,
    item.fecha,
    item.raw?.createdAt,
    item.raw?.fechaCreacion,
    item.raw?.createdAtES,
    item.raw?.date,
    item.raw?.fecha
  );
}

function getTicketUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.lastUpdateAt,
    item.ultimaNovedad,
    item.modifiedAt,
    item.closedAt,
    item.createdAt,
    item.raw?.updatedAt,
    item.raw?.lastUpdateAt,
    item.raw?.ultimaNovedad,
    item.raw?.modifiedAt,
    item.raw?.closedAt,
    item.raw?.createdAt
  );
}

function getTicketAttachmentsCount(item = {}) {
  const attachments = first(
    item.attachments,
    item.files,
    item.adjuntos,
    item.documents,
    item.raw?.attachments,
    item.raw?.files,
    item.raw?.adjuntos,
    item.raw?.documents
  );

  if (Array.isArray(attachments)) return attachments.length;

  return safeNumber(
    first(
      item.attachmentsCount,
      item.filesCount,
      item.adjuntosCount,
      item.documentsCount,
      item.raw?.attachmentsCount,
      item.raw?.filesCount,
      item.raw?.adjuntosCount,
      item.raw?.documentsCount,
      0
    ),
    0
  );
}

/* =========================================================
   FACTURAS
========================================================= */

function getInvoiceId(item = {}) {
  return safeText(
    first(
      item.invoiceId,
      item.facturaId,
      item.number,
      item.numero,
      item.code,
      item.id,
      item._id,
      item.raw?.invoiceId,
      item.raw?.facturaId,
      item.raw?.number,
      item.raw?.numero,
      item.raw?.code,
      item.raw?.id,
      item.raw?._id
    ),
    "FAC-SIN-ID"
  );
}

function getInvoiceAmount(item = {}) {
  return safeNumber(
    first(
      item.total,
      item.amount,
      item.importe,
      item.price,
      item.subtotal,
      item.raw?.total,
      item.raw?.amount,
      item.raw?.importe,
      item.raw?.price,
      item.raw?.subtotal,
      0
    ),
    0
  );
}

function getInvoiceCurrency(item = {}) {
  return safeText(
    first(
      item.currency,
      item.moneda,
      item.raw?.currency,
      item.raw?.moneda,
      "EUR"
    ),
    "EUR"
  );
}

function getInvoiceStatusKey(item = {}) {
  const key = normalizeKey(
    first(
      item.paymentStatus,
      item.estadoPago,
      item.status,
      item.estado,
      item.raw?.paymentStatus,
      item.raw?.estadoPago,
      item.raw?.status,
      item.raw?.estado,
      "pending"
    )
  );

  if (["paid", "pagada", "pagado", "cobrada"].includes(key)) return "paid";
  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["overdue", "vencida", "vencido"].includes(key)) return "overdue";
  if (["partial", "parcial"].includes(key)) return "partial";
  if (["cancelled", "cancelada", "cancelado"].includes(key)) return "cancelled";
  if (["draft", "borrador"].includes(key)) return "draft";

  return "pending";
}

function isInvoicePendingLike(item = {}) {
  return ["pending", "overdue", "partial"].includes(getInvoiceStatusKey(item));
}

/* =========================================================
   STATS / ACTIVITY / PAGINATION
========================================================= */

function getLatestDateFromTickets(tickets = []) {
  const timestamps = safeArray(tickets)
    .map((item) => {
      const value = getTicketUpdatedAt(item) || getTicketCreatedAt(item);
      const date = new Date(value || 0);
      const ts = date.getTime();

      return Number.isFinite(ts) ? ts : 0;
    })
    .filter(Boolean);

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function computeHomeStats(input = {}) {
  const collections = getCollections(input);
  const role = getRole(input);
  const admin = isAdminRole(role);

  const tickets = collections.tickets;
  const invoices = collections.invoices;

  const computedOpenTickets = tickets.filter((item) => isTicketOpenLike(item)).length;
  const computedClosedTickets = tickets.filter((item) => isTicketClosedLike(item)).length;
  const computedUrgentTickets = tickets.filter((item) => isTicketUrgent(item)).length;
  const computedPendingInvoices = invoices.filter((item) => isInvoicePendingLike(item)).length;

  const computedInvoiceAmount = invoices.reduce(
    (sum, item) => sum + getInvoiceAmount(item),
    0
  );

  const attachmentsCount = tickets.reduce(
    (sum, item) => sum + getTicketAttachmentsCount(item),
    0
  );

  const lastTicketUpdate = getLatestDateFromTickets(tickets);

  const totalTickets = safeNumber(
    getSummaryValue(
      input,
      ["totalTickets", "ticketsTotal", "incidenciasTotal", "totalIncidencias"],
      collections.ticketsRemoteCount
    ),
    collections.ticketsRemoteCount
  );

  const openTickets = safeNumber(
    getSummaryValue(
      input,
      ["openTickets", "pendingTickets", "openIncidencias", "pendingIncidencias"],
      computedOpenTickets
    ),
    computedOpenTickets
  );

  const closedTickets = safeNumber(
    getSummaryValue(
      input,
      ["closedTickets", "resolvedTickets", "closedIncidencias", "resolvedIncidencias"],
      computedClosedTickets
    ),
    computedClosedTickets
  );

  const urgentTickets = safeNumber(
    getSummaryValue(
      input,
      ["urgentTickets", "urgentIncidencias", "highPriorityTickets"],
      computedUrgentTickets
    ),
    computedUrgentTickets
  );

  const totalInvoices = safeNumber(
    getSummaryValue(
      input,
      ["totalInvoices", "invoicesTotal", "facturasTotal", "totalFacturas"],
      collections.invoicesRemoteCount
    ),
    collections.invoicesRemoteCount
  );

  const pendingInvoices = safeNumber(
    getSummaryValue(
      input,
      ["pendingInvoices", "pendingFacturas", "facturasPendientes", "invoicesPending"],
      computedPendingInvoices
    ),
    computedPendingInvoices
  );

  const invoiceAmount = safeNumber(
    getSummaryValue(
      input,
      ["invoiceAmount", "billingTotal", "totalBilling", "totalFacturado", "importeFacturas"],
      computedInvoiceAmount
    ),
    computedInvoiceAmount
  );

  const usersCount = safeNumber(
    getSummaryValue(
      input,
      ["usersCount", "usuariosCount", "totalUsers", "totalUsuarios"],
      collections.usersRemoteCount
    ),
    collections.usersRemoteCount
  );

  const clientsCount = safeNumber(
    getSummaryValue(
      input,
      ["clientsCount", "clientesCount", "customersCount", "totalClients", "totalClientes"],
      collections.clientsRemoteCount
    ),
    collections.clientsRemoteCount
  );

  return {
    role,
    admin,

    totalTickets,
    visibleTickets: tickets.length,
    openTickets,
    closedTickets,
    urgentTickets,

    totalInvoices,
    visibleInvoices: invoices.length,
    pendingInvoices,
    invoiceAmount,

    usersCount,
    clientsCount,

    attachmentsCount,
    lastTicketUpdate,

    healthRatio: totalTickets
      ? clampNumber(((totalTickets - openTickets) / totalTickets) * 100, 0, 100)
      : 100,
  };
}

function buildSyntheticActivity(input = {}) {
  const collections = getCollections(input);

  const ticketActivity = collections.tickets.slice(0, 5).map((item) => ({
    type: "ticket",
    title: getTicketSubject(item),
    text: `Incidencia ${getTicketId(item)} · ${getTicketStatusLabel(
      getTicketStatus(item)
    )}`,
    date: getTicketUpdatedAt(item) || getTicketCreatedAt(item),
    route: HOME_ROUTES.INCIDENCIAS,
    action: "open-ticket",
    entityId: getTicketId(item),
  }));

  const invoiceActivity = collections.invoices.slice(0, 3).map((item) => ({
    type: "invoice",
    title: `Factura ${getInvoiceId(item)}`,
    text: `${formatMoney(getInvoiceAmount(item), getInvoiceCurrency(item))}`,
    date: first(
      item.updatedAt,
      item.modifiedAt,
      item.createdAt,
      item.date,
      item.raw?.updatedAt,
      item.raw?.createdAt,
      item.raw?.date
    ),
    route: HOME_ROUTES.FACTURAS,
    action: "open-invoice",
    entityId: getInvoiceId(item),
  }));

  return [...ticketActivity, ...invoiceActivity]
    .filter((item) => item.title || item.text)
    .sort((a, b) => {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();

      return db - da;
    });
}

function getActivity(input = {}) {
  const collections = getCollections(input);

  if (collections.activity.length) {
    return collections.activity;
  }

  return buildSyntheticActivity(input);
}

function getActivityTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.name,
      item.subject,
      item.label,
      item.raw?.title,
      item.raw?.name,
      item.raw?.subject,
      item.raw?.label
    ),
    "Actividad registrada"
  );
}

function getActivityText(item = {}) {
  return safeText(
    first(
      item.text,
      item.description,
      item.message,
      item.detail,
      item.preview,
      item.raw?.text,
      item.raw?.description,
      item.raw?.message,
      item.raw?.detail,
      item.raw?.preview
    ),
    "Sin detalle adicional."
  );
}

function getActivityDate(item = {}) {
  return first(
    item.date,
    item.createdAt,
    item.updatedAt,
    item.timestamp,
    item.raw?.date,
    item.raw?.createdAt,
    item.raw?.updatedAt,
    item.raw?.timestamp
  );
}

function getActivityType(item = {}) {
  const key = normalizeKey(
    first(
      item.type,
      item.kind,
      item.category,
      item.raw?.type,
      item.raw?.kind,
      item.raw?.category,
      "activity"
    )
  );

  if (["factura", "invoice", "billing"].includes(key)) return "invoice";
  if (["ticket", "incidencia", "support"].includes(key)) return "ticket";
  if (["cliente", "client", "customer"].includes(key)) return "client";
  if (["usuario", "user"].includes(key)) return "user";

  return key || "activity";
}

function getPagination(items = [], input = {}) {
  const allItems = safeArray(items);
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  const pageSize = Math.max(
    1,
    safeNumber(
      first(
        data.pageSize,
        data.homePageSize,
        runtime.pageSize,
        runtime.homePageSize,
        runtime.limit,
        5
      ),
      5
    )
  );

  const reportedTotal = Math.max(
    allItems.length,
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.total,
        allItems.length
      ),
      allItems.length
    )
  );

  const totalPagesFromProps = safeNumber(
    first(data.totalPages, runtime.totalPages),
    0
  );

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = Math.min(
    Math.max(
      1,
      safeNumber(
        first(data.page, data.homePage, runtime.page, runtime.homePage, 1),
        1
      )
    ),
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  return {
    allItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   WIDGETS
========================================================= */

function getWidgetId(widget = {}) {
  return safeText(
    first(
      widget.widgetId,
      widget.widgetKey,
      widget.id,
      widget.key,
      widget.slug,
      widget.code
    ),
    ""
  );
}

function getWidgetTitle(widget = {}) {
  return safeText(
    first(
      widget.title,
      widget.name,
      widget.label,
      widget.heading
    ),
    "Bloque"
  );
}

function getWidgetText(widget = {}) {
  return safeText(
    first(
      widget.description,
      widget.descripcion,
      widget.subtitle,
      widget.text,
      widget.summary
    ),
    ""
  );
}

function getWidgetValue(widget = {}) {
  return first(
    widget.value,
    widget.total,
    widget.amount,
    widget.count,
    widget.metric,
    "—"
  );
}

function getWidgetTrend(widget = {}) {
  return first(
    widget.trend,
    widget.delta,
    widget.change,
    widget.variation,
    ""
  );
}

function getWidgetType(widget = {}) {
  return normalizeKey(
    first(
      widget.type,
      widget.kind,
      widget.variant,
      widget.category,
      "widget"
    )
  );
}

function getWidgetRoute(widget = {}) {
  return normalizeRoute(
    first(
      widget.route,
      widget.href,
      widget.link,
      widget.to,
      ""
    )
  );
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="home-inline-loading">
      <span class="home-inline-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderUserAvatar(input = {}) {
  const fullName = getDisplayName(input);
  const initials = getInitials(fullName);
  const avatarUrl = getAvatarUrl(input);

  return `
    <div
      class="home-user-avatar${avatarUrl ? "" : " home-user-avatar--fallback"}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-avatar-root="true"
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

  return `
    <div
      class="home-ticket-avatar${avatarUrl ? "" : " home-ticket-avatar--fallback"}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-avatar-root="true"
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
      ${escapeHtml(label)}
    </span>
  `;
}

function renderStatCard(card = {}) {
  const value = safeText(card.value, "0");

  return `
    <article class="home-stat-card${card.modifier ? ` home-stat-card--${escapeHtml(card.modifier)}` : ""}">
      <div class="home-stat-topline">
        <div class="home-stat-label">${escapeHtml(card.label)}</div>
        ${
          card.badge
            ? `<span class="home-stat-badge">${escapeHtml(card.badge)}</span>`
            : ""
        }
      </div>

      <div class="home-stat-value" title="${escapeHtml(value)}">${escapeHtml(value)}</div>
      <div class="home-stat-text">${escapeHtml(card.text)}</div>
    </article>
  `;
}

function getStatCards(input = {}) {
  const stats = computeHomeStats(input);

  if (stats.admin) {
    return [
      {
        label: "Incidencias abiertas",
        value: formatNumber(stats.openTickets),
        text: `${formatNumber(stats.totalTickets)} solicitudes totales registradas.`,
        modifier: "open",
        badge: stats.urgentTickets ? `${formatNumber(stats.urgentTickets)} urg.` : "",
      },
      {
        label: "Facturación visible",
        value: formatMoney(stats.invoiceAmount, "EUR"),
        text: `${formatNumber(stats.pendingInvoices)} facturas pendientes o vencidas.`,
        modifier: "billing",
      },
      {
        label: "Clientes",
        value: formatNumber(stats.clientsCount),
        text: "Cuentas de cliente detectadas en el panel.",
        modifier: "clients",
      },
      {
        label: "Usuarios",
        value: formatNumber(stats.usersCount),
        text: "Usuarios activos o sincronizados en el sistema.",
        modifier: "users",
      },
    ];
  }

  return [
    {
      label: "Mis incidencias",
      value: formatNumber(stats.totalTickets),
      text: `${formatNumber(stats.openTickets)} solicitudes abiertas o en seguimiento.`,
      modifier: "open",
      badge: stats.urgentTickets ? `${formatNumber(stats.urgentTickets)} urg.` : "",
    },
    {
      label: "Facturas pendientes",
      value: formatNumber(stats.pendingInvoices),
      text: `${formatMoney(stats.invoiceAmount, "EUR")} en facturación visible.`,
      modifier: "billing",
    },
    {
      label: "Adjuntos",
      value: formatNumber(stats.attachmentsCount),
      text: "Documentos vinculados a tu historial.",
      modifier: "files",
    },
    {
      label: "Última actividad",
      value: stats.lastTicketUpdate
        ? formatRelativeDate(stats.lastTicketUpdate)
        : "Sin fecha",
      text: "Movimiento más reciente en tus solicitudes.",
      modifier: "activity",
    },
  ];
}

function getQuickActions(input = {}) {
  const role = getRole(input);
  const admin = isAdminRole(role);

  if (admin) {
    return [
      {
        title: "Centro de incidencias",
        text: "Revisar solicitudes, estados y prioridades operativas.",
        action: "go-incidencias",
        dataAction: "navigate-home",
        route: HOME_ROUTES.INCIDENCIAS,
        modifier: "primary",
      },
      {
        title: "Facturación",
        text: "Consultar importes, estados de pago y vencimientos.",
        action: "go-facturas",
        dataAction: "navigate-home",
        route: HOME_ROUTES.FACTURAS,
        modifier: "billing",
      },
      {
        title: "Clientes",
        text: "Abrir el listado de clientes y su información comercial.",
        action: "go-clientes",
        dataAction: "navigate-home",
        route: HOME_ROUTES.CLIENTES,
        modifier: "clients",
      },
      {
        title: "Usuarios",
        text: "Gestionar usuarios, roles y acceso al panel.",
        action: "go-usuarios",
        dataAction: "navigate-home",
        route: HOME_ROUTES.USUARIOS,
        modifier: "users",
      },
    ];
  }

  return [
    {
      title: "Crear nueva incidencia",
      text: "Abre una solicitud para que soporte pueda revisarla.",
      action: "create-incidencia",
      dataAction: "navigate-home",
      route: HOME_ROUTES.INCIDENCIAS,
      modifier: "primary",
    },
    {
      title: "Mis incidencias",
      text: "Consulta el estado y las últimas novedades.",
      action: "go-incidencias",
      dataAction: "navigate-home",
      route: HOME_ROUTES.INCIDENCIAS,
      modifier: "tickets",
    },
    {
      title: "Mis facturas",
      text: "Revisa facturas, importes y estados de pago.",
      action: "go-facturas",
      dataAction: "navigate-home",
      route: HOME_ROUTES.FACTURAS,
      modifier: "billing",
    },
    {
      title: "Mi cuenta",
      text: "Actualiza tus datos y preferencias de perfil.",
      action: "go-cuenta",
      dataAction: "navigate-home",
      route: HOME_ROUTES.CUENTA,
      modifier: "account",
    },
  ];
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
      <span class="home-action-card-kicker">${escapeHtml(action.route || "Onion Support")}</span>
      <strong class="home-action-card-title">
        ${isBusy ? renderSpinner("Abriendo...") : escapeHtml(action.title)}
      </strong>
      <span class="home-action-card-text">${escapeHtml(action.text)}</span>
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
      <span class="home-widget-kicker">${escapeHtml(type || "widget")}</span>
      <strong class="home-widget-value">${escapeHtml(String(value ?? "—"))}</strong>
      <span class="home-widget-title">${escapeHtml(title)}</span>
      ${
        text
          ? `<span class="home-widget-text">${escapeHtml(text)}</span>`
          : ""
      }
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
  const updatedAt = formatLastUpdate(getTicketUpdatedAt(item));
  const createdAt = formatDateTime(getTicketCreatedAt(item));
  const ownerName = getTicketOwnerName(item);
  const attachmentsCount = getTicketAttachmentsCount(item);

  const openingTicketId = safeText(state.openingTicketId, "");
  const isOpening = openingTicketId === ticketId;

  return `
    <tr class="home-ticket-row" data-ticket-id="${escapeHtml(ticketId)}">
      <td class="home-ticket-cell home-ticket-cell--main">
        <div class="home-ticket-main">
          ${renderTicketAvatar(item)}

          <div class="home-ticket-copy">
            <div class="home-ticket-id">${escapeHtml(ticketId)}</div>
            <div class="home-ticket-subject">${escapeHtml(subject)}</div>
            <div class="home-ticket-description">${escapeHtml(description)}</div>
          </div>
        </div>
      </td>

      <td class="home-ticket-cell home-ticket-cell--owner">
        <span class="home-ticket-owner">${escapeHtml(ownerName)}</span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span class="home-date-inline">${escapeHtml(createdAt)}</span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--date">
        <span class="home-date-inline">${escapeHtml(updatedAt)}</span>
      </td>

      <td class="home-ticket-cell home-ticket-cell--attachments">
        <span class="home-attachments-pill">${escapeHtml(String(attachmentsCount))}</span>
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
          ${isOpening ? 'disabled aria-busy="true"' : ""}
        >
          ${
            isOpening
              ? renderSpinner("Cargando...")
              : '<span class="home-btn-text">Ver detalle</span>'
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
  const action = safeText(first(item.action, item.raw?.action, "open-activity"), "open-activity");

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
      <span class="home-activity-dot" aria-hidden="true"></span>

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

function renderTableLoading(rows = 5) {
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
              <div class="home-skeleton home-skeleton--pill"></div>
              <div class="home-skeleton home-skeleton--pill"></div>
              <div class="home-skeleton home-skeleton--date"></div>
              <div class="home-skeleton home-skeleton--date"></div>
              <div class="home-skeleton home-skeleton--pill"></div>
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
    <style>
      .home-view-root{
        display:grid;
        gap:18px;
        isolation:isolate;
      }

      .home-hero{
        position:relative;
        overflow:hidden;
        border-radius:26px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent 38%),
          radial-gradient(circle at 84% 12%, rgba(56,189,248,.10), transparent 32%),
          linear-gradient(180deg, rgba(255,255,255,.68), rgba(255,255,255,.40)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 92%, transparent);
        box-shadow:
          0 16px 40px rgba(15,23,42,.055),
          0 1px 0 rgba(255,255,255,.60) inset;
        padding:22px 24px;
      }

      .home-hero::after{
        content:"";
        position:absolute;
        inset:auto -18% -56% 44%;
        height:220px;
        border-radius:999px;
        pointer-events:none;
        background:radial-gradient(circle, rgba(124,92,255,.10), transparent 64%);
        filter:blur(4px);
      }

      .home-hero-top{
        position:relative;
        z-index:1;
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
      }

      .home-hero-main{
        min-width:0;
        display:grid;
        grid-template-columns:58px minmax(0, 1fr);
        gap:14px;
        align-items:center;
      }

      .home-user-avatar{
        position:relative;
        width:58px;
        height:58px;
        border-radius:19px;
        overflow:hidden;
        flex:0 0 58px;
        background:
          linear-gradient(135deg, rgba(124,92,255,.22), rgba(56,189,248,.20)),
          color-mix(in srgb, var(--accent, #7c5cff) 24%, #111827);
        box-shadow:
          0 12px 28px rgba(124,92,255,.12),
          0 0 0 1px rgba(255,255,255,.38) inset;
      }

      .home-user-avatar img,
      .home-ticket-avatar img{
        position:absolute;
        inset:0;
        z-index:2;
        display:block;
        width:100%;
        height:100%;
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
        color:#fff;
        letter-spacing:-.035em;
      }

      .home-user-avatar-fallback{
        font-size:20px;
        font-weight:820;
      }

      .home-ticket-avatar-fallback{
        font-size:17px;
        font-weight:800;
      }

      .home-hero-copy{
        min-width:0;
        display:grid;
        gap:8px;
      }

      .home-page-kicker{
        width:max-content;
        max-width:100%;
        min-height:28px;
        padding:0 11px;
        border-radius:999px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.58);
        color:#7a8392;
        font-size:11px;
        font-weight:800;
        letter-spacing:.075em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .home-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(29px, 3.2vw, 48px);
        line-height:.98;
        letter-spacing:-.06em;
        font-weight:830;
        color:var(--text-strong, #0f172a);
      }

      .home-page-subtitle{
        margin:0;
        max-width:900px;
        font-size:15px;
        line-height:1.6;
        color:var(--text-dim, #6b7280);
      }

      .home-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }

      .home-btn{
        min-height:44px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 92%, transparent);
        background:rgba(255,255,255,.72);
        color:var(--text-strong, #111827);
        font-size:13px;
        font-weight:740;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        white-space:nowrap;
        box-shadow:0 5px 16px rgba(15,23,42,.045);
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          border-color .16s ease,
          background .16s ease,
          opacity .16s ease;
      }

      .home-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 10px 22px rgba(15,23,42,.07);
      }

      .home-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 18%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 88%, white 12%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
      }

      .home-btn.is-loading,
      .home-detail-btn.is-loading,
      .home-action-card.is-loading{
        cursor:wait;
        opacity:.9;
      }

      .home-btn:disabled,
      .home-detail-btn:disabled,
      .home-action-card:disabled{
        pointer-events:none;
        opacity:.72;
      }

      .home-hero-meta{
        position:relative;
        z-index:1;
        margin-top:16px;
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .home-meta-pill{
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.54);
        color:#7a8392;
        font-size:11px;
        font-weight:780;
        letter-spacing:.045em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .home-stats{
        position:relative;
        z-index:1;
        margin-top:16px;
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:12px;
      }

      .home-stat-card{
        display:grid;
        gap:8px;
        min-height:124px;
        padding:16px 18px;
        border-radius:21px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.28)),
          rgba(255,255,255,.48);
        box-shadow:0 7px 22px rgba(15,23,42,.035);
      }

      .home-stat-topline{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        min-width:0;
      }

      .home-stat-card--open{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 17%, rgba(15,23,42,.06));
      }

      .home-stat-card--billing{
        border-color:color-mix(in srgb, var(--warning-strong, #ffbc42) 22%, rgba(15,23,42,.06));
      }

      .home-stat-card--clients,
      .home-stat-card--users{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 19%, rgba(15,23,42,.06));
      }

      .home-stat-card--files,
      .home-stat-card--activity{
        border-color:color-mix(in srgb, var(--info-strong, #38bdf8) 19%, rgba(15,23,42,.06));
      }

      .home-stat-label{
        min-width:0;
        font-size:11px;
        font-weight:800;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7b8494;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-stat-badge{
        min-height:22px;
        padding:0 8px;
        border-radius:999px;
        background:rgba(255,107,107,.10);
        color:#d94d4d;
        font-size:10px;
        font-weight:820;
        letter-spacing:.04em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .home-stat-value{
        font-size:38px;
        line-height:.94;
        letter-spacing:-.05em;
        font-weight:840;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-stat-text{
        font-size:13px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .home-widgets{
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:12px;
      }

      .home-widget-card{
        min-height:118px;
        padding:15px 16px;
        border-radius:20px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 90%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.28)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 94%, transparent);
        color:inherit;
        cursor:pointer;
        text-align:left;
        display:grid;
        align-content:start;
        gap:6px;
        box-shadow:0 8px 24px rgba(15,23,42,.035);
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          border-color .16s ease,
          background .16s ease,
          opacity .16s ease;
      }

      .home-widget-card:hover{
        transform:translateY(-2px);
        box-shadow:0 14px 30px rgba(15,23,42,.07);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.08));
      }

      .home-widget-card[aria-disabled="true"]{
        cursor:default;
      }

      .home-widget-card[aria-disabled="true"]:hover{
        transform:none;
      }

      .home-widget-kicker{
        font-size:10px;
        font-weight:820;
        letter-spacing:.085em;
        text-transform:uppercase;
        color:#98a2b3;
      }

      .home-widget-value{
        font-size:28px;
        line-height:1;
        font-weight:840;
        letter-spacing:-.045em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-widget-title{
        font-size:13px;
        line-height:1.22;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .home-widget-text{
        font-size:12px;
        line-height:1.35;
        color:var(--text-dim, #6b7280);
        overflow:hidden;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .home-widget-trend{
        width:max-content;
        max-width:100%;
        min-height:22px;
        padding:0 8px;
        border-radius:999px;
        background:rgba(124,92,255,.08);
        color:#6d53d7;
        font-size:10px;
        font-weight:800;
        letter-spacing:.035em;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .home-grid{
        display:grid;
        grid-template-columns:minmax(0, 1.05fr) minmax(320px, .95fr);
        gap:18px;
        align-items:start;
      }

      .home-panel,
      .home-tickets{
        position:relative;
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.42)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 94%, transparent);
        box-shadow:
          0 12px 32px rgba(15,23,42,.045),
          0 1px 0 rgba(255,255,255,.52) inset;
      }

      .home-panel-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:14px;
        align-items:start;
        padding:16px 18px 13px;
        border-bottom:1px solid rgba(15,23,42,.06);
      }

      .home-panel-copy{
        min-width:0;
        display:grid;
        gap:3px;
      }

      .home-panel-title{
        margin:0;
        font-size:16px;
        line-height:1.2;
        font-weight:800;
        color:var(--text-strong, #111827);
      }

      .home-panel-subtitle{
        margin:0;
        font-size:12px;
        line-height:1.4;
        color:var(--text-dim, #7b8494);
      }

      .home-actions-grid{
        padding:14px;
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:12px;
      }

      .home-action-card{
        min-height:132px;
        padding:16px;
        border-radius:20px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.36)),
          rgba(255,255,255,.44);
        color:var(--text-strong, #111827);
        cursor:pointer;
        text-align:left;
        display:grid;
        align-content:start;
        gap:8px;
        box-shadow:0 6px 20px rgba(15,23,42,.028);
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          border-color .16s ease,
          background .16s ease,
          opacity .16s ease;
      }

      .home-action-card:hover{
        transform:translateY(-2px);
        box-shadow:0 13px 28px rgba(15,23,42,.065);
        border-color:rgba(15,23,42,.10);
      }

      .home-action-card--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 20%, rgba(15,23,42,.06));
      }

      .home-action-card--billing{
        border-color:color-mix(in srgb, var(--warning-strong, #ffbc42) 19%, rgba(15,23,42,.06));
      }

      .home-action-card--clients,
      .home-action-card--users{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 17%, rgba(15,23,42,.06));
      }

      .home-action-card-kicker{
        font-size:10px;
        font-weight:830;
        letter-spacing:.085em;
        text-transform:uppercase;
        color:#98a2b3;
      }

      .home-action-card-title{
        font-size:16px;
        line-height:1.15;
        font-weight:810;
        letter-spacing:-.028em;
        color:var(--text-strong, #111827);
      }

      .home-action-card-text{
        font-size:13px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .home-activity-list{
        padding:8px;
        display:grid;
        gap:6px;
      }

      .home-activity-item{
        width:100%;
        min-height:68px;
        padding:10px;
        border:0;
        border-radius:16px;
        background:transparent;
        color:inherit;
        cursor:pointer;
        text-align:left;
        display:grid;
        grid-template-columns:10px minmax(0, 1fr) auto;
        gap:10px;
        align-items:center;
        transition:
          background .16s ease,
          transform .16s ease;
      }

      .home-activity-item:hover{
        background:rgba(124,92,255,.045);
        transform:translateY(-1px);
      }

      .home-activity-dot{
        width:8px;
        height:8px;
        border-radius:999px;
        background:var(--accent, #7c5cff);
        box-shadow:0 0 0 4px color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent);
      }

      .home-activity-item--invoice .home-activity-dot{
        background:#ffbc42;
        box-shadow:0 0 0 4px rgba(255,188,66,.14);
      }

      .home-activity-item--client .home-activity-dot,
      .home-activity-item--user .home-activity-dot{
        background:#36c690;
        box-shadow:0 0 0 4px rgba(54,198,144,.14);
      }

      .home-activity-copy{
        min-width:0;
        display:grid;
        gap:3px;
      }

      .home-activity-title{
        font-size:13px;
        line-height:1.15;
        font-weight:780;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-activity-text{
        font-size:12px;
        line-height:1.35;
        color:var(--text-dim, #7b8494);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-activity-time{
        font-size:11px;
        font-weight:740;
        color:#98a2b3;
        white-space:nowrap;
      }

      .home-pagination{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .home-pagination-btn{
        min-height:38px;
        padding:0 14px;
        border-radius:13px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.68);
        color:#273142;
        font-size:12px;
        font-weight:740;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        transition:
          background .16s ease,
          border-color .16s ease,
          opacity .16s ease;
      }

      .home-pagination-btn:hover{
        background:rgba(255,255,255,.92);
        border-color:rgba(15,23,42,.10);
      }

      .home-pagination-btn[disabled],
      .home-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
      }

      .home-table-wrap{
        position:relative;
        min-height:120px;
      }

      .home-table-wrap.is-refreshing .home-table-shell{
        opacity:.56;
        filter:blur(.7px);
        transition:opacity .18s ease, filter .18s ease;
      }

      .home-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:opacity .18s ease, filter .18s ease;
      }

      .home-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1120px;
      }

      .home-table-col-main{ width:34%; }
      .home-table-col-owner{ width:14%; }
      .home-table-col-status{ width:11%; }
      .home-table-col-created{ width:15%; }
      .home-table-col-updated{ width:15%; }
      .home-table-col-attachments{ width:4%; }
      .home-table-col-actions{ width:7%; }

      .home-table thead th{
        padding:12px 18px;
        text-align:left;
        font-size:11px;
        font-weight:800;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#97a0af;
        background:rgba(248,250,252,.66);
        border-bottom:1px solid rgba(15,23,42,.06);
        white-space:nowrap;
      }

      .home-table tbody td{
        padding:14px 18px;
        vertical-align:middle;
        border-bottom:1px solid rgba(15,23,42,.055);
      }

      .home-table tbody tr:last-child td{
        border-bottom:none;
      }

      .home-ticket-row{
        transition:background .16s ease;
      }

      .home-ticket-row:hover{
        background:rgba(124,92,255,.020);
      }

      .home-ticket-main{
        display:grid;
        grid-template-columns:44px minmax(0, 1fr);
        gap:12px;
        align-items:center;
        min-width:0;
      }

      .home-ticket-avatar{
        position:relative;
        width:44px;
        height:44px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 44px;
        background:
          linear-gradient(135deg, rgba(124,92,255,.14), rgba(56,189,248,.16)),
          color-mix(in srgb, var(--accent, #7c5cff) 20%, #111827);
      }

      .home-ticket-copy{
        min-width:0;
        display:grid;
        gap:3px;
      }

      .home-ticket-id{
        font-size:12px;
        line-height:1.15;
        font-weight:790;
        letter-spacing:.055em;
        color:#667084;
        text-transform:uppercase;
      }

      .home-ticket-subject{
        font-size:15px;
        line-height:1.14;
        font-weight:790;
        letter-spacing:-.026em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .home-ticket-description{
        font-size:13px;
        line-height:1.3;
        color:#8a93a3;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-ticket-owner{
        display:inline-block;
        max-width:180px;
        font-size:13px;
        line-height:1.2;
        font-weight:700;
        color:#344054;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .home-chip{
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:11px;
        font-weight:800;
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .home-chip--pending{
        color:#b7791f;
        background:rgba(255,188,66,.11);
        border-color:rgba(255,188,66,.22);
      }

      .home-chip--open{
        color:#6d53d7;
        background:rgba(124,92,255,.09);
        border-color:rgba(124,92,255,.18);
      }

      .home-chip--progress{
        color:#1778ab;
        background:rgba(125,211,252,.12);
        border-color:rgba(125,211,252,.24);
      }

      .home-chip--resolved,
      .home-chip--closed{
        color:#258a59;
        background:rgba(54,198,144,.10);
        border-color:rgba(54,198,144,.22);
      }

      .home-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:680;
        font-variant-numeric:tabular-nums;
        color:#344054;
      }

      .home-attachments-pill{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width:32px;
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        font-size:11px;
        font-weight:800;
        white-space:nowrap;
        color:#64748b;
        background:rgba(15,23,42,.035);
        border:1px solid rgba(15,23,42,.06);
      }

      .home-ticket-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .home-detail-btn{
        width:auto;
        min-width:0;
        min-height:34px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.70);
        color:#1f2937;
        font-size:13px;
        font-weight:740;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color .16s ease,
          background .16s ease,
          transform .16s ease,
          opacity .16s ease;
      }

      .home-detail-btn:hover{
        border-color:rgba(15,23,42,.12);
        background:rgba(255,255,255,.92);
        transform:translateY(-1px);
      }

      .home-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .home-inline-spinner{
        width:13px;
        height:13px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.30);
        border-top-color:currentColor;
        animation:homeSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .home-btn:not(.home-btn--primary) .home-inline-spinner,
      .home-detail-btn .home-inline-spinner,
      .home-action-card .home-inline-spinner{
        border-color:rgba(15,23,42,.16);
        border-top-color:currentColor;
      }

      .home-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:linear-gradient(180deg, rgba(255,255,255,.25), rgba(255,255,255,.12));
        backdrop-filter:blur(2px);
      }

      .home-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:42px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.86);
        color:#344054;
        font-size:13px;
        font-weight:740;
        box-shadow:0 10px 26px rgba(15,23,42,.08);
      }

      .home-table-loading{
        padding:12px 18px 16px;
        display:grid;
        gap:12px;
      }

      .home-table-loading-row{
        display:grid;
        grid-template-columns:44px minmax(220px, 1.45fr) 130px 112px 140px 140px 70px 112px;
        gap:12px;
        align-items:center;
      }

      .home-table-loading-copy{
        display:grid;
        gap:7px;
      }

      .home-cards-loading{
        padding:14px;
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:12px;
      }

      .home-card-skeleton{
        min-height:132px;
        padding:16px;
        border-radius:20px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.44);
        display:grid;
        align-content:start;
        gap:10px;
      }

      .home-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:999px;
        background:rgba(148,163,184,.14);
      }

      .home-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,.58),
          transparent
        );
        animation:homeSkeleton 1.2s ease-in-out infinite;
      }

      .home-skeleton--avatar{
        width:44px;
        height:44px;
        border-radius:999px;
      }

      .home-skeleton--xs{
        width:120px;
        height:10px;
      }

      .home-skeleton--lg{
        width:74%;
        height:14px;
      }

      .home-skeleton--md{
        width:56%;
        height:12px;
      }

      .home-skeleton--xl{
        width:82%;
        height:22px;
      }

      .home-skeleton--pill{
        width:86px;
        height:30px;
      }

      .home-skeleton--date{
        width:124px;
        height:12px;
      }

      .home-skeleton--btn{
        width:98px;
        height:34px;
      }

      .home-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:40px 20px 44px;
        text-align:center;
      }

      .home-empty-title{
        margin:0;
        font-size:18px;
        font-weight:790;
        color:var(--text-strong, #111827);
      }

      .home-empty-text{
        margin:0;
        max-width:520px;
        font-size:13px;
        line-height:1.55;
        color:var(--text-dim, #6b7280);
      }

      @keyframes homeSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes homeSkeleton{
        to{ transform:translateX(100%); }
      }

      @media (prefers-reduced-motion: reduce){
        .home-btn,
        .home-action-card,
        .home-widget-card,
        .home-detail-btn,
        .home-activity-item,
        .home-ticket-row,
        .home-table-shell,
        .home-table-wrap.is-refreshing .home-table-shell{
          transition:none !important;
        }

        .home-inline-spinner,
        .home-skeleton::after{
          animation:none !important;
        }
      }

      [data-theme="light"] .home-hero,
      [data-theme="light"] .home-panel,
      [data-theme="light"] .home-tickets,
      [data-theme="light"] .home-widget-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.84), rgba(248,250,252,.74)),
          rgba(255,255,255,.84);
        box-shadow:
          0 12px 28px rgba(15,23,42,.038),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .home-stat-card,
      [data-theme="light"] .home-action-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.80), rgba(255,255,255,.50)),
          rgba(255,255,255,.58);
      }

      [data-theme="dark"] .home-hero,
      [data-theme="dark"] .home-panel,
      [data-theme="dark"] .home-tickets,
      [data-theme="dark"] .home-widget-card{
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 35%),
          linear-gradient(180deg, var(--surface-2, #171922), var(--surface-1, #10121a));
        border-color:var(--border-soft, rgba(255,255,255,.08));
      }

      [data-theme="dark"] .home-page-title,
      [data-theme="dark"] .home-panel-title,
      [data-theme="dark"] .home-stat-value,
      [data-theme="dark"] .home-action-card-title,
      [data-theme="dark"] .home-activity-title,
      [data-theme="dark"] .home-ticket-subject,
      [data-theme="dark"] .home-empty-title,
      [data-theme="dark"] .home-widget-value,
      [data-theme="dark"] .home-widget-title{
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .home-page-subtitle,
      [data-theme="dark"] .home-panel-subtitle,
      [data-theme="dark"] .home-stat-text,
      [data-theme="dark"] .home-action-card-text,
      [data-theme="dark"] .home-activity-text,
      [data-theme="dark"] .home-ticket-description,
      [data-theme="dark"] .home-empty-text,
      [data-theme="dark"] .home-widget-text{
        color:var(--text-dim, #94a3b8);
      }

      [data-theme="dark"] .home-btn,
      [data-theme="dark"] .home-pagination-btn,
      [data-theme="dark"] .home-detail-btn,
      [data-theme="dark"] .home-refresh-card,
      [data-theme="dark"] .home-action-card{
        background:rgba(255,255,255,.06);
        border-color:rgba(255,255,255,.08);
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .home-stat-card{
        background:rgba(255,255,255,.045);
        border-color:rgba(255,255,255,.075);
      }

      [data-theme="dark"] .home-page-kicker,
      [data-theme="dark"] .home-meta-pill{
        background:rgba(255,255,255,.06);
        border-color:rgba(255,255,255,.08);
      }

      [data-theme="dark"] .home-table thead th{
        background:rgba(255,255,255,.035);
        border-bottom-color:rgba(255,255,255,.07);
      }

      [data-theme="dark"] .home-table tbody td{
        border-bottom-color:rgba(255,255,255,.055);
      }

      [data-theme="dark"] .home-date-inline,
      [data-theme="dark"] .home-ticket-owner{
        color:var(--text-soft, #cbd5e1);
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
          padding:20px;
        }

        .home-hero-top{
          grid-template-columns:1fr;
        }

        .home-hero-actions{
          justify-content:flex-start;
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
      }

      @media (max-width: 760px){
        .home-view-root{
          gap:16px;
        }

        .home-hero,
        .home-panel,
        .home-tickets{
          border-radius:20px;
        }

        .home-hero{
          padding:18px 16px;
        }

        .home-hero-main{
          grid-template-columns:1fr;
        }

        .home-user-avatar{
          width:52px;
          height:52px;
          border-radius:17px;
        }

        .home-page-title{
          font-size:clamp(26px, 8vw, 36px);
          line-height:1;
        }

        .home-page-subtitle{
          font-size:14px;
        }

        .home-hero-actions{
          width:100%;
        }

        .home-btn{
          flex:1 1 auto;
        }

        .home-stats,
        .home-widgets{
          grid-template-columns:1fr;
        }

        .home-pagination{
          justify-content:flex-start;
        }

        .home-activity-item{
          grid-template-columns:10px minmax(0, 1fr);
        }

        .home-activity-time{
          grid-column:2;
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
      stats.admin
        ? "Panel de control"
        : `Hola, ${displayName}`
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
    ${renderStyles()}

    <section class="home-hero home-hero--${stats.admin ? "admin" : "user"}">
      <div class="home-hero-top">
        <div class="home-hero-main">
          ${renderUserAvatar(data)}

          <div class="home-hero-copy">
            <span class="home-page-kicker">
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
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : '<span class="home-btn-text">Actualizar</span>'
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
                  ${loading || refreshing ? "disabled" : ""}
                >
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
                  ${creating ? 'disabled aria-busy="true"' : ""}
                >
                  ${
                    creating
                      ? renderSpinner("Abriendo...")
                      : '<span class="home-btn-text">Crear incidencia</span>'
                  }
                </button>
              `
          }
        </div>
      </div>

      <div class="home-hero-meta">
        <span class="home-meta-pill">
          ${escapeHtml(`${formatNumber(stats.totalTickets)} incidencias registradas`)}
        </span>

        <span class="home-meta-pill">
          ${escapeHtml(`${formatNumber(stats.pendingInvoices)} facturas pendientes`)}
        </span>

        <span class="home-meta-pill">
          ${escapeHtml(`Salud operativa · ${Math.round(stats.healthRatio)}%`)}
        </span>

        <span class="home-meta-pill">
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
                  text: "Cuando haya movimientos en incidencias o facturas aparecerán aquí.",
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
  const hasError = Boolean(safeText(state.error, ""));

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

        <div class="home-pagination">
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

          <button
            type="button"
            class="home-pagination-btn"
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
          ? renderTableLoading(Math.max(3, pagination.pageSize || 5))
          : `
            <div class="home-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    <div class="home-table-shell">
                      <table class="home-table" role="table" aria-label="Resumen de incidencias del home">
                        <colgroup>
                          <col class="home-table-col-main">
                          <col class="home-table-col-owner">
                          <col class="home-table-col-status">
                          <col class="home-table-col-created">
                          <col class="home-table-col-updated">
                          <col class="home-table-col-attachments">
                          <col class="home-table-col-actions">
                        </colgroup>

                        <thead>
                          <tr>
                            <th>Incidencia</th>
                            <th>Usuario / cliente</th>
                            <th>Estado</th>
                            <th>Creación</th>
                            <th>Última novedad</th>
                            <th>Adj.</th>
                            <th>Acciones</th>
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
   FULL TEMPLATE
========================================================= */

export function renderHomeTemplate(input = {}) {
  const data = safeObject(input);

  return `
    <section class="home-view-root">
      ${renderHomeHeader(data)}
      ${renderHomeWidgets(data)}

      <section class="home-grid">
        ${renderHomeQuickActions(data)}
        ${renderHomeActivity(data)}
      </section>

      ${renderHomeTicketsTable(data)}
    </section>
  `;
}

/* =========================================================
   ALIASES COMPATIBLES
========================================================= */

export const renderHomeViewTemplate = renderHomeTemplate;
export const renderHomeDashboardTemplate = renderHomeTemplate;

export default renderHomeTemplate;
