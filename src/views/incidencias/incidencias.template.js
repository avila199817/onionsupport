/* =========================================================
   Onion Support - Incidencias Template
   Archivo: /src/views/incidencias/incidencias.template.js

   CSS 1:1 · PRODUCTIVO
   - Clases alineadas con /src/css/views/incidencias/index.css.
   - No renderiza modales. No HTTP. No DOM. No Store.
   - Acepta items/tickets/incidencias/rows/results/data.items/etc.
========================================================= */

export const INCIDENCIAS_TEMPLATE_VERSION = "incidencias.template.css-1-1.v12";

export const INCIDENCIAS_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  CREATE_OPEN: "create-open",
  FILTER: "filter",
  SORT_TOGGLE: "sort-toggle",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",
  OPEN_DETAIL: "open-detail",
  LOAD_MORE: "load-more",
});

const DEFAULT_ROUTE = "/incidencias";
const DEFAULT_VISIBLE_ROWS = 20;
const DEFAULT_CURRENCY = "EUR";
const DEFAULT_SORT_ORDER = "desc";
const TABLE_SCALE = "110";

const FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "open", label: "Abiertas" },
  { key: "closed", label: "Cerradas" },
]);

export const INCIDENCIAS_TABLE_COLUMNS = Object.freeze([
  { key: "main", label: "Incidencia", colClass: "incidencias-col--main", thClass: "incidencias-th incidencias-th--main", cellClass: "incidencias-cell incidencias-cell--main" },
  { key: "status", label: "Estado", colClass: "incidencias-col--status", thClass: "incidencias-th incidencias-th--status", cellClass: "incidencias-cell incidencias-cell--status" },
  { key: "created", label: "Creada", colClass: "incidencias-col--created", thClass: "incidencias-th incidencias-th--created", cellClass: "incidencias-cell incidencias-cell--date incidencias-cell--created" },
  { key: "updated", label: "Última novedad", colClass: "incidencias-col--updated", thClass: "incidencias-th incidencias-th--updated", cellClass: "incidencias-cell incidencias-cell--date incidencias-cell--updated" },
  { key: "amount", label: "Importe", colClass: "incidencias-col--amount incidencias-col--importe", thClass: "incidencias-th incidencias-th--amount incidencias-th--importe", cellClass: "incidencias-cell incidencias-cell--amount incidencias-cell--importe" },
  { key: "attachments", label: "Adjuntos", colClass: "incidencias-col--attachments", thClass: "incidencias-th incidencias-th--attachments", cellClass: "incidencias-cell incidencias-cell--attachments" },
]);

/* =========================================================
   HELPERS
========================================================= */

const isObj = (v) => Boolean(v && typeof v === "object" && !Array.isArray(v));
const obj = (v, fb = {}) => (isObj(v) ? v : fb);

function arr(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object" && typeof v.length === "number" && typeof v !== "string") {
    try { return Array.from(v); } catch { return []; }
  }
  return [];
}

function txt(v = "", fb = "") {
  const out = String(v ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return out || fb;
}

function first(...values) {
  for (const v of values.flat(Infinity)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (isObj(v) && !Object.keys(v).length) continue;
    return v;
  }
  return null;
}

function num(v = 0, fb = 0) {
  if (v === null || v === undefined || v === "") return fb;
  if (typeof v === "number") return Number.isFinite(v) ? v : fb;
  if (typeof v === "string") {
    let clean = v.trim().replace(/[€$£¥%]/g, "").replace(/[^\d.,+\-\s]/g, "").replace(/\s+/g, "");
    if (!clean || clean === "-" || clean === "+") return fb;
    const hasComma = clean.includes(",");
    const hasDot = clean.includes(".");
    if (hasComma && hasDot) {
      const lastComma = clean.lastIndexOf(",");
      const lastDot = clean.lastIndexOf(".");
      clean = lastComma > lastDot ? clean.replace(/\./g, "").replace(/,/g, ".") : clean.replace(/,/g, "");
    } else if (hasComma) clean = clean.replace(/,/g, ".");
    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : fb;
  }
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fb;
}

function esc(v = "") {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const at = (v = "") => esc(txt(v, ""));
const cls = (...v) => v.flat(Infinity).map((x) => txt(x, "")).filter(Boolean).join(" ");
const key = (v = "") => txt(v, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_").replace(/[^\w:.]/g, "").replace(/^_+|_+$/g, "");
const searchKey = (v = "") => txt(v, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

function htmlAttrs(attrs = {}) {
  return Object.entries(obj(attrs))
    .map(([k, v]) => {
      if (!k || v === false || v === null || v === undefined) return "";
      if (v === true) return esc(k);
      return `${esc(k)}="${esc(v)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function safeUrl(v = "") {
  const raw = txt(v, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  if (/^https:\/\//i.test(raw) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    try { return new URL(raw).href; } catch { return ""; }
  }
  return "";
}

function firstUrl(...values) {
  for (const v of values.flat(Infinity)) {
    if (v === null || v === undefined) continue;
    if (isObj(v)) {
      const nested = firstUrl(
        v.avatarUrl, v.avatar, v.picture, v.photoUrl, v.photoURL, v.imageUrl,
        v.userAvatar, v.userAvatarUrl, v.clienteAvatar, v.clienteAvatarUrl,
        v.clientAvatar, v.clientAvatarUrl,
        v.profile?.avatarUrl, v.profile?.avatar, v.profile?.picture, v.profile?.photoUrl, v.profile?.photoURL,
        v.raw?.avatarUrl, v.raw?.avatar, v.raw?.picture
      );
      if (nested) return nested;
      continue;
    }
    const url = safeUrl(v);
    if (url) return url;
  }
  return "";
}

function hash(v = "") {
  const s = txt(v, "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function initials(v = "") {
  return txt(v, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("").slice(0, 2) || "ON";
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    ticket: `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,
    refresh: `<svg ${common}><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M21 21v-5h-5"/></svg>`,
    plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close: `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    paperclip: `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,
    euro: `<svg ${common}><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2C8.9 4 5 7.6 5 12s3.9 8 8.8 8A7.7 7.7 0 0 0 19 18"/></svg>`,
    chevronDown: `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,
    calendar: `<svg ${common}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
    hash: `<svg ${common}><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="m16 3-2 18"/></svg>`,
  };
  return icons[name] || icons.ticket;
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatNumber(v = 0) {
  try { return new Intl.NumberFormat("es-ES").format(num(v, 0)); }
  catch { return String(num(v, 0)); }
}

function formatMoney(v = 0, currency = DEFAULT_CURRENCY) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: txt(currency, DEFAULT_CURRENCY).toUpperCase(), maximumFractionDigits: 2 }).format(num(v, 0));
  } catch {
    return `${num(v, 0).toFixed(2)} €`;
  }
}

function formatDate(v = "") {
  const raw = first(v, "");
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return txt(raw, "—");
  try { return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d); }
  catch { return d.toISOString(); }
}

function formatShortDate(v = "") {
  const raw = first(v, "");
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return txt(raw, "—");
  try { return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(d); }
  catch { return d.toISOString().slice(0, 10); }
}

function formatRelativeDate(v = "") {
  const raw = first(v, "");
  if (!raw) return "—";
  const d = new Date(raw);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return txt(raw, "—");
  const diff = Math.abs(Date.now() - ms);
  const minute = 60000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "ahora";
  if (diff < hour) return `hace ${Math.max(1, Math.round(diff / minute))} min`;
  if (diff < day) return `hace ${Math.max(1, Math.round(diff / hour))} h`;
  if (diff < 7 * day) return `hace ${Math.max(1, Math.round(diff / day))} d`;
  return formatShortDate(raw);
}

const dateMs = (v = "") => {
  const raw = first(v, "");
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
};

/* =========================================================
   DATA GETTERS
========================================================= */

function unwrap(v = {}) {
  const it = obj(v, {});
  return obj(first(it.ticket, it.incidencia, it.item, it.detail, it.data?.ticket, it.data?.incidencia, it.data?.item, it.data, it), it);
}

const getId = (it = {}) => txt(first(unwrap(it).ticketId, unwrap(it).incidenciaId, unwrap(it).id, unwrap(it).entityId, unwrap(it).code, unwrap(it).numero, unwrap(it).ticketCode, unwrap(it).reference, unwrap(it).ref, ""), "");
const getSubject = (it = {}) => txt(first(unwrap(it).subject, unwrap(it).asunto, unwrap(it).title, unwrap(it).name, "Sin asunto"), "Sin asunto");
const getDesc = (it = {}) => txt(first(unwrap(it).preview, unwrap(it).description, unwrap(it).descripcion, unwrap(it).message, unwrap(it).body, ""), "");
const getStatusRaw = (it = {}) => txt(first(unwrap(it).status, unwrap(it).estado, unwrap(it).statusKey, unwrap(it).lifecycle?.status, "open"), "open");
const getPriorityRaw = (it = {}) => txt(first(unwrap(it).priority, unwrap(it).prioridad, unwrap(it).severity, "medium"), "medium");
const getCategory = (it = {}) => txt(first(unwrap(it).category, unwrap(it).categoria, unwrap(it).tipo, unwrap(it).type, "general"), "general");

function getClientName(it = {}) {
  const r = unwrap(it), rs = obj(r.requesterSnapshot), c = obj(r.cliente), rec = obj(r.receptor), u = obj(r.user);
  return txt(first(r.displayName, r.name, r.nombre, r.clientName, r.clienteNombre, r.requesterName, rs.displayName, rs.name, rs.nombre, c.displayName, c.name, c.nombre, rec.displayName, rec.name, rec.nombre, u.displayName, u.name, u.nombre, r.email, getId(r), "Usuario"), "Usuario");
}

function getClientEmail(it = {}) {
  const r = unwrap(it), rs = obj(r.requesterSnapshot), c = obj(r.cliente), rec = obj(r.receptor), u = obj(r.user);
  return txt(first(r.email, r.emailLower, r.userEmail, r.clienteEmail, rs.email, rs.emailLower, c.email, c.emailLower, rec.email, rec.emailLower, u.email, u.emailLower, ""), "");
}

function getAvatar(it = {}) {
  const r = unwrap(it);
  return firstUrl(r.avatarUrl, r.avatar, r.userAvatarUrl, r.userAvatar, r.clienteAvatarUrl, r.clienteAvatar, r.requesterSnapshot, r.cliente, r.receptor, r.user);
}

function getAssignedName(it = {}) {
  const r = unwrap(it), a = obj(r.assignment), tec = obj(r.tecnico), asg = obj(r.assignedTo), t = obj(r.technician);
  return txt(first(r.assignedToName, r.technicianName, r.tecnicoName, r.agentName, a.assignedToName, a.technician?.name, a.technician?.displayName, tec.displayName, tec.name, tec.nombre, asg.displayName, asg.name, asg.nombre, t.displayName, t.name, t.nombre, "Cristian Ávila Luque"), "Cristian Ávila Luque");
}

function getAssignedEmail(it = {}) {
  const r = unwrap(it), a = obj(r.assignment), tec = obj(r.tecnico), asg = obj(r.assignedTo), t = obj(r.technician);
  return txt(first(r.assignedToEmail, r.technicianEmail, r.tecnicoEmail, r.agentEmail, a.assignedToEmail, a.technician?.email, tec.email, asg.email, t.email, ""), "");
}

function getAssignedAvatar(it = {}) {
  const r = unwrap(it), a = obj(r.assignment);
  return firstUrl(r.assignedToAvatarUrl, r.assignedToAvatar, r.technicianAvatarUrl, r.technicianAvatar, r.tecnicoAvatarUrl, r.tecnicoAvatar, r.agentAvatarUrl, r.agentAvatar, a.assignedToAvatarUrl, a.assignedToAvatar, a.technicianAvatarUrl, a.technicianAvatar, a.agentAvatarUrl, a.agentAvatar, a.avatarUrl, a.avatar, a.technician, r.tecnico, r.assignedTo, r.technician);
}

const getCreated = (it = {}) => first(unwrap(it).createdAt, unwrap(it).fechaCreacion, unwrap(it).created_at, unwrap(it).lifecycle?.createdAt, "");
const getUpdated = (it = {}) => first(unwrap(it).lastActivityAt, unwrap(it).updatedAt, unwrap(it).modifiedAt, unwrap(it).updated_at, unwrap(it).lifecycle?.lastActivityAt, unwrap(it).lifecycle?.updatedAt, getCreated(it), "");

function getAttachmentsCount(it = {}) {
  const r = unwrap(it);
  const files = arr(first(r.attachments, r.files, r.adjuntos, []));
  return Math.max(files.length, num(r.attachmentsCount, 0), num(r.attachmentCount, 0), num(r.filesCount, 0), num(r.adjuntosCount, 0), num(r.meta?.attachmentsCount, 0), num(r.meta?.filesCount, 0));
}

function getInvoiceTotal(it = {}) {
  const r = unwrap(it);
  return num(first(r.invoiceTotal, r.invoicesTotal, r.facturasTotal, r.importeFacturas, r.facturaTotal, r.facturaImporte, r.importeFactura, r.totalFactura, r.invoiceAmount, r.billing?.total, r.billing?.amount, r.linkedInvoices?.total, r.linkedInvoices?.amount, r.meta?.invoiceTotal, 0), 0);
}

function getCurrency(it = {}) {
  const r = unwrap(it);
  return txt(first(r.currency, r.moneda, r.facturaCurrency, r.facturaMoneda, r.billing?.currency, r.linkedInvoices?.currency, r.meta?.invoiceCurrency, DEFAULT_CURRENCY), DEFAULT_CURRENCY).toUpperCase();
}

/* =========================================================
   NORMALIZATION
========================================================= */

function statusKey(v = "") {
  const k = key(v || "open");
  const map = {
    open: "open", opened: "open", abierta: "open", abierto: "open",
    pending: "pending", pendiente: "pending", new: "pending", nueva: "pending", nuevo: "pending",
    in_progress: "progress", inprogress: "progress", progress: "progress", proceso: "progress", en_proceso: "progress", working: "progress", assigned: "progress", asignada: "progress", asignado: "progress",
    resolved: "resolved", resuelta: "resolved", resuelto: "resolved", solved: "resolved",
    closed: "closed", close: "closed", cerrada: "closed", cerrado: "closed",
    cancelled: "closed", canceled: "closed", cancelada: "closed", cancelado: "closed", archived: "closed", archivada: "closed", archivado: "closed",
  };
  return map[k] || k || "open";
}

function statusLabel(v = "") {
  return ({ open: "Abierta", pending: "Pendiente", progress: "En proceso", resolved: "Resuelta", closed: "Cerrada" })[statusKey(v)] || txt(v, "Abierta");
}

function priorityKey(it = {}) {
  const k = key(getPriorityRaw(it) || "medium");
  const map = {
    low: "low", baja: "low", minor: "low", p3: "low",
    medium: "medium", media: "medium", normal: "medium", p2: "medium",
    high: "urgent", alta: "urgent", p1: "urgent",
    urgent: "urgent", urgente: "urgent",
    critical: "critical", critica: "critical", critico: "critical", crítico: "critical", crítica: "critical", p0: "critical",
  };
  return map[k] || k || "medium";
}

function priorityLabel(it = {}) {
  const raw = key(getPriorityRaw(it));
  if (["high", "alta", "p1"].includes(raw)) return "Alta";
  return ({ low: "Baja", medium: "Media", urgent: "Urgente", critical: "Crítica" })[priorityKey(it)] || priorityKey(it);
}

const isOpen = (it = {}) => ["open", "pending", "progress"].includes(statusKey(getStatusRaw(it)));
const isClosed = (it = {}) => ["resolved", "closed"].includes(statusKey(getStatusRaw(it)));
const isUrgent = (it = {}) => ["urgent", "critical"].includes(priorityKey(it));
const amountKey = (it = {}) => (getInvoiceTotal(it) > 0 ? "paid" : "idle");
const amountLabel = (it = {}) => (getInvoiceTotal(it) > 0 ? formatMoney(getInvoiceTotal(it), getCurrency(it)) : "—");

function normalizeFilter(v = "all") {
  const k = key(v || "all");
  if (["all", "todas", "todos"].includes(k)) return "all";
  if (["open", "abiertas", "abiertos", "active", "activas", "activos", "pending", "progress", "in_progress"].includes(k)) return "open";
  if (["closed", "cerradas", "cerrados", "resolved", "resueltas", "resueltos"].includes(k)) return "closed";
  return "all";
}

function normalizeSort(v = DEFAULT_SORT_ORDER) {
  const k = key(v || DEFAULT_SORT_ORDER);
  return ["asc", "ascending", "menor", "menor_mayor", "menor_a_mayor", "menor-a-mayor", "oldest"].includes(k) ? "asc" : "desc";
}

const sortLabel = (o = DEFAULT_SORT_ORDER) => (normalizeSort(o) === "asc" ? "Fecha ↑" : "Fecha ↓");
const nextSort = (o = DEFAULT_SORT_ORDER) => (normalizeSort(o) === "asc" ? "desc" : "asc");

function itemTime(it = {}) {
  return dateMs(getUpdated(it)) || dateMs(getCreated(it)) || 0;
}

function sortItems(items = [], order = DEFAULT_SORT_ORDER) {
  const dir = normalizeSort(order) === "asc" ? 1 : -1;
  return [...arr(items)].sort((a, b) => {
    const diff = itemTime(a) - itemTime(b);
    if (diff) return diff * dir;
    return getId(a).localeCompare(getId(b), "es", { numeric: true, sensitivity: "base" }) * dir;
  });
}

function itemMatchesFilter(it = {}, filter = "all") {
  const f = normalizeFilter(filter);
  if (f === "open") return isOpen(it);
  if (f === "closed") return isClosed(it);
  return true;
}

function itemText(it = {}) {
  return searchKey([getId(it), getSubject(it), getDesc(it), getClientName(it), getClientEmail(it), getAssignedName(it), getAssignedEmail(it), getCategory(it), statusLabel(getStatusRaw(it)), priorityLabel(it)].join(" "));
}

function itemMatchesSearch(it = {}, q = "") {
  const needle = searchKey(q);
  return !needle || itemText(it).includes(needle);
}

function statsFrom(items = []) {
  return arr(items).reduce((a, it) => {
    a.total += 1;
    if (isOpen(it)) a.open += 1;
    if (isClosed(it)) a.closed += 1;
    if (isUrgent(it)) a.urgent += 1;
    a.attachments += getAttachmentsCount(it);
    a.invoiceTotal += getInvoiceTotal(it);
    a.lastUpdateTs = Math.max(a.lastUpdateTs, itemTime(it));
    return a;
  }, { total: 0, open: 0, closed: 0, urgent: 0, attachments: 0, invoiceTotal: 0, lastUpdateTs: 0 });
}

function mergeStats(items = [], provided = {}) {
  const local = statsFrom(items);
  const s = obj(provided);
  if (local.total > 0) return local;
  return {
    total: num(first(s.total, local.total), local.total),
    open: num(first(s.open, local.open), local.open),
    closed: num(first(s.closed, local.closed), local.closed),
    urgent: num(first(s.urgent, local.urgent), local.urgent),
    attachments: num(first(s.attachments, local.attachments), local.attachments),
    invoiceTotal: num(first(s.invoiceTotal, local.invoiceTotal), local.invoiceTotal),
    lastUpdateTs: num(first(s.lastUpdateTs, local.lastUpdateTs), local.lastUpdateTs),
  };
}

function filterCounts(items = []) {
  const rows = arr(items);
  return { all: rows.length, open: rows.filter(isOpen).length, closed: rows.filter(isClosed).length };
}

/* =========================================================
   ARRAY EXTRACTION
========================================================= */

function arrayCandidates(input = {}) {
  const d = obj(input);
  const data = obj(d.data), payload = obj(d.payload), result = obj(d.result), response = obj(d.response), body = obj(d.body), meta = obj(d.meta);
  return [
    d.items, d.visibleItems, d.filteredItems, d.rows, d.results, d.records, d.docs, d.documents, d.value, d.list, d.tickets, d.incidencias,
    Array.isArray(d.data) ? d.data : null, data.items, data.visibleItems, data.filteredItems, data.rows, data.results, data.records, data.docs, data.documents, data.value, data.list, data.tickets, data.incidencias,
    Array.isArray(d.payload) ? d.payload : null, payload.items, payload.rows, payload.results, payload.tickets, payload.incidencias,
    Array.isArray(d.result) ? d.result : null, result.items, result.rows, result.results, result.tickets, result.incidencias,
    Array.isArray(d.response) ? d.response : null, response.items, response.rows, response.results, response.tickets, response.incidencias,
    Array.isArray(d.body) ? d.body : null, body.items, body.rows, body.results, body.tickets, body.incidencias,
    meta.items, meta.rows,
  ].filter(Array.isArray);
}

function normalizeItems(input = {}) {
  const candidates = Array.isArray(input) ? [input] : arrayCandidates(input);
  const map = new Map();
  for (const candidate of candidates) {
    for (const original of arr(candidate)) {
      const it = unwrap(original);
      const id = getId(it);
      if (!id) continue;
      map.set(id, map.has(id) ? { ...map.get(id), ...it } : it);
    }
    if (map.size) break;
  }
  return sortItems([...map.values()], DEFAULT_SORT_ORDER);
}

function remoteTotal(input = {}, fb = 0) {
  const d = obj(input), data = obj(d.data), payload = obj(d.payload), result = obj(d.result), response = obj(d.response);
  return Math.max(fb, num(first(d.total, d.count, d.totalCount, d.remoteCount, d.meta?.total, d.meta?.count, d.pagination?.total, d.pagination?.totalCount, data.total, data.count, data.totalCount, data.meta?.total, payload.total, payload.count, result.total, result.count, response.total, response.count, fb), fb));
}

function buildVm(input = {}) {
  const d = obj(input);
  const items = normalizeItems(d);
  const filter = normalizeFilter(d.filter);
  const search = txt(d.search, "");
  const order = normalizeSort(first(d.sortOrder, d.order, d.sort?.order, d.sort?.direction, DEFAULT_SORT_ORDER));
  const visibleLimit = Math.max(1, num(d.visibleLimit, DEFAULT_VISIBLE_ROWS));
  const filtered = sortItems(items.filter((it) => itemMatchesFilter(it, filter)).filter((it) => itemMatchesSearch(it, search)), order);
  const visible = filtered.slice(0, visibleLimit);
  const total = remoteTotal(d, items.length);
  const stats = mergeStats(items, d.stats);
  return {
    data: d,
    route: txt(first(d.route, d.routes?.incidencias, DEFAULT_ROUTE), DEFAULT_ROUTE),
    admin: Boolean(d.admin || d.role === "admin"),
    items,
    filteredItems: filtered,
    visibleItems: visible,
    total,
    filteredTotal: filtered.length,
    visibleCount: visible.length,
    visibleLimit,
    remainingCount: Math.max(0, filtered.length - visible.length),
    hasMore: filtered.length > visible.length,
    loading: d.loading === true,
    refreshing: d.refreshing === true,
    creating: d.creating === true,
    loadingMore: d.loadingMore === true,
    error: txt(d.error, ""),
    filter,
    search,
    sortOrder: order,
    sortLabel: sortLabel(order),
    nextSortOrder: nextSort(order),
    nextSortLabel: sortLabel(nextSort(order)),
    filterCounts: filterCounts(items),
    stats,
    openingTicketId: txt(d.openingTicketId, ""),
    diagnostics: {
      totalGreaterThanItems: total > 0 && items.length === 0,
      extractedItems: items.length,
      templateVersion: INCIDENCIAS_TEMPLATE_VERSION,
    },
  };
}

/* =========================================================
   ROWS
========================================================= */

function renderAvatar(it = {}) {
  const name = getClientName(it);
  const src = getAvatar(it);
  return `
    <span class="incidencias-avatar${src ? " has-image" : " is-fallback"}" data-avatar-tone="${at(String(hash(`${getId(it)}:${name}`) % 10))}" data-has-avatar="${src ? "true" : "false"}" data-fallback="${src ? "false" : "true"}" aria-hidden="true">
      ${src ? `<img class="incidencias-avatar-img" src="${at(src)}" alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}
      <span class="incidencias-avatar-fallback">${esc(initials(name))}</span>
    </span>
  `;
}

function renderStatusChip(it = {}) {
  const k = statusKey(getStatusRaw(it));
  return `
    <span class="incidencias-status-chip incidencias-status-chip--${at(k)} is-${at(k)}" data-status-chip="${at(k)}">
      <span class="incidencias-status-dot" aria-hidden="true"></span>
      <span>${esc(statusLabel(getStatusRaw(it)))}</span>
    </span>
  `;
}

function renderPriorityBadge(it = {}) {
  const k = priorityKey(it);
  return `
    <span class="incidencias-priority-badge incidencias-priority-badge--${at(k)}" data-priority-badge="${at(k)}">
      <span class="incidencias-badge-icon incidencias-priority-badge-icon" aria-hidden="true">${icon(k === "urgent" || k === "critical" ? "alert" : "ticket")}</span>
      <span>${esc(priorityLabel(it))}</span>
    </span>
  `;
}

function renderAssignedBadge(it = {}) {
  const name = getAssignedName(it);
  const norm = key(name);
  if (!name || norm === "no_asignado" || norm === "sin_asignar") return "";
  const avatar = getAssignedAvatar(it);
  return `
    <span class="incidencias-assigned-badge" data-assigned="true" title="${at(name)}">
      <span class="incidencias-assigned-avatar${avatar ? " has-image" : " is-fallback"}" aria-hidden="true">
        ${avatar ? `<img src="${at(avatar)}" alt="" width="20" height="20" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}
        <span>${esc(initials(name))}</span>
      </span>
      <span class="incidencias-assigned-name">${esc(name)}</span>
    </span>
  `;
}

function renderImporteChip(it = {}) {
  const k = amountKey(it);
  return `
    <span class="incidencias-importe-chip incidencias-importe-chip--${at(k)}" data-importe-status="${at(k)}">
      ${k !== "idle" ? icon("euro") : ""}
      <span>${esc(amountLabel(it))}</span>
    </span>
  `;
}

function renderAttachmentPill(it = {}) {
  const count = getAttachmentsCount(it);
  return `
    <span class="incidencias-attachments-pill${count > 0 ? " has-attachments" : " is-empty"}" data-attachments-count="${at(String(count))}">
      ${icon("paperclip")}
      <span>${esc(formatNumber(count))}</span>
    </span>
  `;
}

function renderRow(it = {}, vm = {}) {
  const id = getId(it);
  const st = statusKey(getStatusRaw(it));
  const rowStatus = st === "resolved" ? "closed" : st;
  const isOpening = vm.openingTicketId && vm.openingTicketId === id;
  const email = getClientEmail(it);
  return `
    <tr class="incidencias-row incidencias-row--clickable incidencias-row--${at(rowStatus)}${isOpening ? " is-loading" : ""}" data-ticket-row="true" data-incidencia-row="true" data-detail-target="true" data-ticket-id="${at(id)}" data-incidencia-id="${at(id)}" data-incidencias-action="${INCIDENCIAS_ACTIONS.OPEN_DETAIL}" tabindex="0" role="button" aria-label="Abrir incidencia ${at(id)}" ${htmlAttrs({ "aria-busy": isOpening ? "true" : false })}>
      <td class="incidencias-cell incidencias-cell--main" data-column="main">
        <div class="incidencias-main">
          ${renderAvatar(it)}
          <div class="incidencias-main-copy">
            <div class="incidencias-ticket-line">
              <span class="incidencias-ticket-id">${esc(id || "Sin ID")}</span>
              <span class="incidencias-category-pill">${esc(getCategory(it) || "General")}</span>
            </div>
            <div class="incidencias-ticket-subject">${esc(getSubject(it))}</div>
            <div class="incidencias-ticket-description">${esc(getDesc(it) || "Sin descripción.")}</div>
            <div class="incidencias-client-line">
              <span class="incidencias-client-name">${esc(getClientName(it))}</span>
              ${email ? `<span class="incidencias-client-separator">·</span><span class="incidencias-client-email">${esc(email)}</span>` : ""}
            </div>
            <div class="incidencias-row-badges">
              ${renderPriorityBadge(it)}
              ${renderAssignedBadge(it)}
            </div>
          </div>
        </div>
      </td>
      <td class="incidencias-cell incidencias-cell--status" data-column="status">${renderStatusChip(it)}</td>
      <td class="incidencias-cell incidencias-cell--date incidencias-cell--created" data-column="created"><span class="incidencias-date-inline" title="${at(formatDate(getCreated(it)))}">${esc(formatShortDate(getCreated(it)))}</span></td>
      <td class="incidencias-cell incidencias-cell--date incidencias-cell--updated" data-column="updated"><span class="incidencias-date-inline" title="${at(formatDate(getUpdated(it)))}">${esc(formatRelativeDate(getUpdated(it)))}</span></td>
      <td class="incidencias-cell incidencias-cell--amount incidencias-cell--importe" data-column="amount">${renderImporteChip(it)}</td>
      <td class="incidencias-cell incidencias-cell--attachments" data-column="attachments">${renderAttachmentPill(it)}</td>
    </tr>
  `;
}

/* =========================================================
   HEADER
========================================================= */

const spinner = (label = "Cargando...") => `<span class="incidencias-spinner" aria-hidden="true"></span><span>${esc(label)}</span>`;

function renderHeader(vm = {}) {
  const s = vm.stats;
  const updatedAt = s.lastUpdateTs ? new Date(s.lastUpdateTs).toISOString() : "";
  return `
    <section class="incidencias-hero" data-incidencias-hero="true">
      <div class="incidencias-hero-top">
        <div class="incidencias-hero-copy">
          <h1 class="incidencias-title">Tus incidencias y solicitudes</h1>
          <p class="incidencias-subtitle">Consulta el estado de tus incidencias, revisa actualizaciones y crea nuevas solicitudes.</p>
        </div>
        <div class="incidencias-hero-actions">
          <button type="button" id="incidencias-create-btn" class="incidencias-btn incidencias-btn--create" data-incidencias-action="${INCIDENCIAS_ACTIONS.CREATE_OPEN}" ${htmlAttrs({ disabled: vm.creating || vm.loading, "aria-disabled": vm.creating || vm.loading ? "true" : false, "aria-busy": vm.creating ? "true" : false })}>
            ${vm.creating ? spinner("Creando...") : `${icon("plus")}<span>Nueva incidencia</span>`}
          </button>
          <button type="button" id="incidencias-refresh-btn" class="incidencias-btn${vm.refreshing ? " is-loading" : ""}" data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}" ${htmlAttrs({ disabled: vm.refreshing || vm.loading, "aria-disabled": vm.refreshing || vm.loading ? "true" : false, "aria-busy": vm.refreshing ? "true" : false })}>
            ${vm.refreshing ? spinner("Actualizando...") : `${icon("refresh")}<span>Actualizar</span>`}
          </button>
        </div>
      </div>
      <div class="incidencias-hero-meta">
        <span class="incidencias-meta-pill" data-meta="total">${icon("ticket")}<span>${esc(`${formatNumber(vm.total)} solicitudes registradas`)}</span></span>
        <span class="incidencias-meta-pill" data-meta="updated">${icon("refresh")}<span>${updatedAt ? esc(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}</span></span>
        <span class="incidencias-meta-pill" data-meta="attachments">${icon("paperclip")}<span>${esc(`${formatNumber(s.attachments)} adjuntos`)}</span></span>
        <span class="incidencias-meta-pill" data-meta="amount">${icon("euro")}<span>${esc(formatMoney(s.invoiceTotal, DEFAULT_CURRENCY))}</span></span>
      </div>
      <div class="incidencias-stats">
        <article class="incidencias-stat-card incidencias-stat-card--open" data-stat="open"><div class="incidencias-stat-label">Abiertas</div><div class="incidencias-stat-value">${esc(formatNumber(s.open))}</div><div class="incidencias-stat-text">Solicitudes activas, pendientes o en proceso.</div></article>
        <article class="incidencias-stat-card incidencias-stat-card--closed" data-stat="closed"><div class="incidencias-stat-label">Cerradas</div><div class="incidencias-stat-value">${esc(formatNumber(s.closed))}</div><div class="incidencias-stat-text">Casos resueltos o cerrados.</div></article>
        <article class="incidencias-stat-card incidencias-stat-card--urgent" data-stat="urgent"><div class="incidencias-stat-label">Urgentes</div><div class="incidencias-stat-value">${esc(formatNumber(s.urgent))}</div><div class="incidencias-stat-text">Incidencias marcadas como urgentes o críticas.</div></article>
        <article class="incidencias-stat-card incidencias-stat-card--amount" data-stat="amount"><div class="incidencias-stat-label">Importe asociado</div><div class="incidencias-stat-value">${esc(formatMoney(s.invoiceTotal, DEFAULT_CURRENCY))}</div><div class="incidencias-stat-text">Total vinculado a facturas visibles.</div></article>
      </div>
    </section>
  `;
}

/* =========================================================
   FILTERS
========================================================= */

function renderSearch(vm = {}) {
  return `
    <div class="incidencias-search" role="search" aria-label="Buscar incidencias">
      <span class="incidencias-search-icon" aria-hidden="true">${icon("search")}</span>
      <input id="incidencias-search-input" class="incidencias-search-input" type="search" value="${at(vm.search)}" placeholder="Buscar cliente, asunto, ID..." autocomplete="off" spellcheck="false" data-incidencias-search-input="true" data-incidencias-field="search" data-field="search" aria-label="Buscar incidencias por cliente, asunto o identificador">
      ${vm.search ? `<button type="button" class="incidencias-search-clear" data-incidencias-action="${INCIDENCIAS_ACTIONS.CLEAR_SEARCH}" aria-label="Limpiar búsqueda">${icon("close")}</button>` : ""}
    </div>
  `;
}

function renderFilters(vm = {}) {
  const order = normalizeSort(vm.sortOrder);
  const next = nextSort(order);
  return `
    <div class="incidencias-filters" data-incidencias-filters="true">
      <div class="incidencias-filter-pills" role="tablist" aria-label="Filtrar incidencias">
        ${FILTERS.map((f) => {
          const active = f.key === vm.filter;
          return `<button type="button" role="tab" class="incidencias-filter-pill${active ? " is-active" : ""}" data-incidencias-action="${INCIDENCIAS_ACTIONS.FILTER}" data-filter="${at(f.key)}" aria-selected="${active ? "true" : "false"}" aria-pressed="${active ? "true" : "false"}"><span>${esc(f.label)}</span><strong>${esc(formatNumber(vm.filterCounts?.[f.key] || 0))}</strong></button>`;
        }).join("")}
      </div>
      <div class="incidencias-sort-pills" data-incidencias-sort-pills="true">
        <button type="button" class="incidencias-sort-pill is-active" data-incidencias-action="${INCIDENCIAS_ACTIONS.SORT_TOGGLE}" data-sort-order="${at(order)}" data-next-sort-order="${at(next)}" aria-pressed="true" aria-label="Cambiar orden a ${at(sortLabel(next))}" title="Cambiar orden a ${at(sortLabel(next))}">${icon("calendar")}<span>${esc(sortLabel(order))}</span></button>
      </div>
      ${renderSearch(vm)}
    </div>
  `;
}

/* =========================================================
   TABLE / STATES
========================================================= */

function renderColgroup() {
  return `<colgroup>${INCIDENCIAS_TABLE_COLUMNS.map((c) => `<col class="${at(c.colClass)}">`).join("")}</colgroup>`;
}

function renderThead() {
  return `<thead><tr>${INCIDENCIAS_TABLE_COLUMNS.map((c) => `<th class="${at(c.thClass)}" scope="col" data-column="${at(c.key)}">${esc(c.label)}</th>`).join("")}</tr></thead>`;
}

function renderTableLoading(rows = DEFAULT_VISIBLE_ROWS) {
  const count = Math.max(4, num(rows, DEFAULT_VISIBLE_ROWS));
  return `
    <div class="incidencias-table-wrap is-loading" data-incidencias-table-wrap="true">
      <div class="incidencias-table-loading" aria-hidden="true">
        <div class="incidencias-table-shell">
          <table class="incidencias-table incidencias-table--no-actions incidencias-table--scale-110" role="table" aria-label="Cargando incidencias" data-table-columns="6" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}">
            ${renderColgroup()}${renderThead()}
            <tbody>${Array.from({ length: count }).map((_, i) => `<tr class="incidencias-row incidencias-row--skeleton" aria-hidden="true" data-skeleton-row="${i + 1}">${INCIDENCIAS_TABLE_COLUMNS.map((c) => `<td class="${at(c.cellClass)}" data-column="${at(c.key)}"><span class="incidencias-skeleton incidencias-skeleton--${at(c.key)}"></span></td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderRefreshOverlay() {
  return `<div class="incidencias-refresh-overlay" aria-live="polite" aria-busy="true"><span class="incidencias-inline-loading"><span class="incidencias-inline-spinner" aria-hidden="true"></span><span>Actualizando incidencias...</span></span></div>`;
}

function renderEmpty(vm = {}) {
  const hasError = Boolean(vm.error);
  const filtering = vm.filter !== "all" || Boolean(vm.search);
  const mismatch = vm.total > 0 && !vm.visibleItems.length && !filtering && !hasError;
  const title = hasError ? "No se pudieron cargar las incidencias" : filtering ? "No hay incidencias con esos filtros" : mismatch ? "Hay incidencias, pero no llegaron filas al listado" : "Todavía no hay incidencias";
  const text = hasError ? vm.error : filtering ? "Prueba a limpiar la búsqueda o cambia el filtro activo para volver al historial completo." : mismatch ? "La API está entregando total, pero no está entregando ningún array de filas compatible." : "Cuando haya solicitudes registradas aparecerán aquí con su estado, seguimiento, adjuntos y facturación asociada.";
  return `
    <div class="incidencias-empty${mismatch ? " is-data-mismatch" : ""}" data-incidencias-empty="true">
      <div class="incidencias-empty-icon" aria-hidden="true">${hasError || mismatch ? icon("alert") : icon("ticket")}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${hasError || mismatch ? `<button type="button" class="incidencias-btn" data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}">${icon("refresh")}<span>Reintentar</span></button>` : filtering ? `<button type="button" class="incidencias-btn" data-incidencias-action="${INCIDENCIAS_ACTIONS.CLEAR_FILTERS}">${icon("close")}<span>Limpiar filtros</span></button>` : ""}
    </div>
  `;
}

function renderFeedFooter(vm = {}) {
  if (!vm.total || !vm.visibleCount) return `<div class="incidencias-feed-sentinel" data-incidencias-load-more="true" data-incidencias-infinite-sentinel="true" aria-hidden="true"></div>`;
  if (!vm.hasMore) return `<div class="incidencias-feed-end" data-incidencias-feed-end="true" data-incidencias-load-more="false"><span class="incidencias-feed-end-text">Has visto todas las incidencias disponibles.</span></div>`;
  return `
    <div class="incidencias-feed-more" data-incidencias-feed-more="true">
      <button type="button" class="incidencias-load-more-btn${vm.loadingMore ? " is-loading" : ""}" data-incidencias-action="${INCIDENCIAS_ACTIONS.LOAD_MORE}" data-incidencias-load-more-button="true" ${htmlAttrs({ disabled: vm.loadingMore, "aria-disabled": vm.loadingMore ? "true" : false, "aria-busy": vm.loadingMore ? "true" : false })}>
        ${vm.loadingMore ? spinner("Cargando más incidencias...") : `${icon("chevronDown")}<span>Mostrar más</span><span class="incidencias-load-more-count">${esc(`${formatNumber(vm.remainingCount)} restantes`)}</span>`}
      </button>
      <div class="incidencias-feed-sentinel" data-incidencias-load-more="true" data-incidencias-infinite-sentinel="true" data-load-more-sentinel="true" aria-hidden="true"></div>
    </div>
  `;
}

function renderTable(vm = {}) {
  if (!vm.visibleItems.length) return renderEmpty(vm);
  return `
    <div class="incidencias-table-shell">
      <table class="incidencias-table incidencias-table--no-actions incidencias-table--scale-110" role="table" aria-label="Listado de incidencias" data-table-columns="6" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" data-sort-order="${at(vm.sortOrder)}">
        ${renderColgroup()}${renderThead()}
        <tbody>${vm.visibleItems.map((it) => renderRow(it, vm)).join("")}</tbody>
      </table>
    </div>
    ${renderFeedFooter(vm)}
  `;
}

function renderHistory(vm = {}) {
  const initialLoading = vm.loading && !vm.visibleItems.length;
  const refreshing = vm.refreshing && vm.visibleItems.length;
  const activeLabel = FILTERS.find((f) => f.key === vm.filter)?.label || "Todas";
  const criteria = [vm.filter !== "all" ? activeLabel : "", vm.search ? `búsqueda “${vm.search}”` : ""].filter(Boolean);
  const subtitle = initialLoading
    ? "Cargando incidencias..."
    : vm.filter !== "all" || vm.search
      ? `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}${criteria.length ? ` · ${criteria.join(" · ")}` : ""} · orden ${sortLabel(vm.sortOrder).toLowerCase()}`
      : `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.total)} · orden ${sortLabel(vm.sortOrder).toLowerCase()}`;

  return `
    <section class="incidencias-history" data-incidencias-scroll-host="true" data-incidencias-scroll-mode="infinite">
      <div class="incidencias-history-head" data-incidencias-history-head="true">
        <div class="incidencias-history-copy"><h2 class="incidencias-history-title">Historial de incidencias</h2><p class="incidencias-history-subtitle">${esc(subtitle)}</p></div>
        ${renderFilters(vm)}
      </div>
      ${initialLoading ? renderTableLoading(DEFAULT_VISIBLE_ROWS) : `<div class="incidencias-table-wrap${refreshing ? " is-refreshing" : ""}" data-incidencias-table-wrap="true" data-incidencias-scroll-mode="infinite">${refreshing ? renderRefreshOverlay() : ""}${renderTable(vm)}</div>`}
    </section>
  `;
}

/* =========================================================
   EXPORTS
========================================================= */

export function renderIncidenciasLoadingState(input = {}) {
  const vm = buildVm({ ...obj(input), loading: true });
  return `
    <section class="incidencias-view-root incidencias-view-root--loading is-loading" data-incidencias-scope="true" data-template-version="${at(INCIDENCIAS_TEMPLATE_VERSION)}" data-total="${at(String(vm.total))}" data-visible="${at(String(vm.visibleCount))}" data-filter="${at(vm.filter)}" data-sort-order="${at(vm.sortOrder)}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" aria-busy="true">
      ${renderHeader(vm)}${renderHistory(vm)}
    </section>
  `;
}

export function renderIncidenciasErrorState(message = "No se pudieron cargar las incidencias.") {
  return `
    <section class="incidencias-view-root incidencias-view-root--error has-error" data-incidencias-scope="true" data-template-version="${at(INCIDENCIAS_TEMPLATE_VERSION)}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" aria-busy="false">
      <section class="incidencias-error">
        <h3 class="incidencias-error-title">No se pudo renderizar la vista de incidencias</h3>
        <p class="incidencias-error-text">${esc(txt(message, "Error desconocido al cargar la vista."))}</p>
        <button type="button" class="incidencias-btn" data-incidencias-action="${INCIDENCIAS_ACTIONS.REFRESH}">${icon("refresh")}<span>Reintentar</span></button>
      </section>
    </section>
  `;
}

export function renderIncidenciasTemplate(input = {}) {
  const vm = buildVm(input);
  return `
    <section class="${cls("incidencias-view-root", vm.loading ? "is-loading" : "", vm.refreshing ? "is-refreshing" : "", vm.creating ? "is-creating" : "", vm.error ? "has-error" : "")}" data-incidencias-scope="true" data-template-version="${at(INCIDENCIAS_TEMPLATE_VERSION)}" data-route="${at(vm.route)}" data-total="${at(String(vm.total))}" data-visible="${at(String(vm.visibleCount))}" data-filter="${at(vm.filter)}" data-search-active="${vm.search ? "true" : "false"}" data-sort-order="${at(vm.sortOrder)}" data-loading="${vm.loading ? "true" : "false"}" data-refreshing="${vm.refreshing ? "true" : "false"}" data-table-actions="false" data-table-scale="${at(TABLE_SCALE)}" data-items-extracted="${at(String(vm.items.length))}" data-total-greater-than-items="${vm.diagnostics.totalGreaterThanItems ? "true" : "false"}" aria-busy="${vm.loading || vm.refreshing ? "true" : "false"}">
      ${vm.error ? `<div class="incidencias-alert" role="alert">${icon("alert")}<span>${esc(vm.error)}</span></div>` : ""}
      ${renderHeader(vm)}${renderHistory(vm)}
    </section>
  `;
}

export function getIncidenciasTemplateSnapshot(input = {}) {
  const vm = buildVm(input);
  return {
    version: INCIDENCIAS_TEMPLATE_VERSION,
    total: vm.total,
    extractedItems: vm.items.length,
    visibleCount: vm.visibleCount,
    filteredTotal: vm.filteredTotal,
    filter: vm.filter,
    searchLength: vm.search.length,
    sortOrder: vm.sortOrder,
    totalGreaterThanItems: vm.diagnostics.totalGreaterThanItems,
    cssContract: {
      filters: "incidencias-filters/incidencias-filter-pills/incidencias-filter-pill/incidencias-sort-pills/incidencias-sort-pill",
      row: "incidencias-row incidencias-row--clickable data-detail-target=true",
      mainCell: "incidencias-main/incidencias-ticket-line/incidencias-ticket-id/incidencias-ticket-subject/incidencias-client-line/incidencias-row-badges",
      table: "incidencias-table incidencias-table--no-actions incidencias-table--scale-110",
    },
    acceptedArrayAliases: ["items", "visibleItems", "filteredItems", "tickets", "incidencias", "rows", "results", "records", "data.items", "data.rows", "data.tickets", "data.incidencias", "payload.items", "result.items", "response.items", "body.items"],
  };
}

export const getSnapshot = getIncidenciasTemplateSnapshot;
export const renderTemplate = renderIncidenciasTemplate;
export default renderIncidenciasTemplate;
