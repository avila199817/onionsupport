/* Onion Support · Incidencias Technician Profile v4 */

export const INCIDENCIAS_TECHNICIAN_PROFILE_VERSION =
  "incidencias-technician-profile.v4.stable-opener-lifecycle";

const VIEW = "#view-container, [data-router-view='true']";
const LIST_TECH_BADGE = ".incidencias-assigned-badge[data-assigned='true']";
const DETAIL_TECHNICIAN = ".incidencias-modal-technician-inline[data-modal-technician='true'][data-technician-assigned='true']";
const DETAIL_TECH_CARD = ".incidencias-modal-technician-card[data-technician-profile-trigger='true'][data-assigned='true']";
const TECH_TRIGGER = `${LIST_TECH_BADGE}, ${DETAIL_TECH_CARD}`;
const PRIORITY_BADGE = ".incidencias-priority-badge[data-priority-badge]";
const DETAIL_PRIORITY = ".incidencias-modal-chip[class*='incidencias-modal-chip--priority-']";
const ROW = "[data-ticket-row='true']";
const DETAIL_ROOT = "[data-incidencias-modal-root='true']";
const MODAL_HOST = "[data-incidencias-modal-host='true']";
const HOST_ID = "incidencias-technician-profile-host";
const ROOT_ID = "incidencias-technician-profile-root";
const PANEL_ID = "incidencias-technician-profile-panel";
const TRUSTED_BLOB_HOST = "onionassets.blob.core.windows.net";
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let mounted = false;
let mountRoot = null;
let observer = null;
let modalObserver = null;
let observedModalHost = null;
let frame = 0;
let requestSeq = 0;
let returnFocus = null;
let incidenceApiPromise = null;
let usersApiPromise = null;
let previousBodyOverflow = "";
let previousBodyClasses = new Map();
let bodyLocked = false;

const browser = () => typeof window !== "undefined" && typeof document !== "undefined";
const text = (value = "", fallback = "") =>
  String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim() || fallback;
const object = (value, fallback = {}) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
const array = (value) => {
  if (Array.isArray(value)) return value;
  try { return value ? Array.from(value) : []; } catch { return []; }
};

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
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

const attr = (value = "") => escapeHtml(text(value, ""));

function normalizeKey(value = "") {
  return text(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.@]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeEmail(value = "") {
  const email = text(value, "").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeAvatarUrl(value = "") {
  const raw = text(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  if (!/^https:\/\//i.test(raw)) return "";
  try {
    const url = new URL(raw);
    const blocked = ["access_token", "refresh_token", "id_token", "token", "code", "secret", "session", "password", "pwd", "key", "jwt", "authorization", "reset_token", "activation_token"];
    for (const key of url.searchParams.keys()) {
      if (blocked.includes(String(key).toLowerCase())) return "";
    }
    if (url.searchParams.has("sig") && url.hostname.toLowerCase() !== TRUSTED_BLOB_HOST) return "";
    return url.href;
  } catch {
    return "";
  }
}

function safeError(error = null) {
  const raw = text(first(error?.message, error?.data?.message, error?.payload?.message), "No se pudo cargar el perfil del técnico.");
  return raw.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***").slice(0, 240);
}

function initials(value = "") {
  return text(value, "Técnico").split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "").join("") || "TS";
}

function hash(value = "") {
  let output = 0;
  for (const char of text(value, "tecnico")) {
    output = ((output << 5) - output) + char.charCodeAt(0);
    output |= 0;
  }
  return Math.abs(output);
}

function numberLabel(value = 0) {
  try { return new Intl.NumberFormat("es-ES").format(Number(value) || 0); }
  catch { return String(Number(value) || 0); }
}

function percentLabel(value = 0) {
  return `${Math.round(Math.max(0, Math.min(100, Number(value) || 0)))} %`;
}

function dateValue(value = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 100000000000 ? value * 1000 : value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateTimeLabel(value = null, fallback = "Sin actividad registrada") {
  const stamp = dateValue(value);
  if (!stamp) return fallback;
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(stamp));
  } catch {
    return fallback;
  }
}

function technicianFromTicket(ticket = {}) {
  const raw = object(ticket);
  const assignment = object(raw.assignment);
  const nested = object(first(raw.assignedTo, raw.technician, raw.tecnico, raw.assignedTechnician, assignment.technician, assignment.assignedTo, {}));
  return {
    userId: text(first(raw.assignedToUserId, raw.technicianUserId, raw.tecnicoUserId, assignment.assignedToUserId, assignment.userId, nested.userId, nested.id), ""),
    name: text(first(raw.assignedToName, raw.technicianName, raw.tecnicoName, raw.agentName, assignment.assignedToName, nested.displayName, nested.name, nested.nombre), ""),
    email: normalizeEmail(first(raw.assignedToEmail, raw.technicianEmail, raw.tecnicoEmail, raw.agentEmail, assignment.assignedToEmail, nested.email, nested.emailLower)),
    avatar: safeAvatarUrl(first(raw.assignedToAvatarUrl, raw.technicianAvatarUrl, raw.tecnicoAvatarUrl, raw.agentAvatarUrl, assignment.assignedToAvatarUrl, nested.avatarUrl, nested.avatar)),
    role: text(first(nested.role, nested.rol, assignment.role), ""),
  };
}

function ticketId(ticket = {}) {
  return text(first(ticket.ticketId, ticket.incidenciaId, ticket.id, ticket.code, ticket.numero), "");
}

function ticketStatus(ticket = {}) {
  return normalizeKey(first(ticket.status, ticket.estado, ticket.statusKey, ticket.lifecycle?.status, "open"));
}

function ticketPriority(ticket = {}) {
  return normalizeKey(first(ticket.priority, ticket.prioridad, ticket.priorityKey, ticket.severity, "medium"));
}

function ticketTitle(ticket = {}) {
  return text(first(ticket.subject, ticket.asunto, ticket.title, ticket.titulo, ticket.summary, ticket.resumen), "Sin asunto");
}

function ticketCreatedAt(ticket = {}) {
  return first(ticket.createdAt, ticket.created_at, ticket.fechaCreacion, ticket.created, ticket.audit?.createdAt, ticket._ts);
}

function ticketStatusLabel(ticket = {}) {
  const key = ticketStatus(ticket);
  if (["closed", "resolved", "cerrada", "cerrado", "resuelta", "resuelto"].includes(key)) return "Resuelta";
  if (["pending", "pendiente", "new", "nueva", "nuevo"].includes(key)) return "Pendiente";
  if (["in_progress", "inprogress", "progress", "assigned", "proceso", "en_proceso"].includes(key)) return "En curso";
  return "Abierta";
}

function priorityLabel(ticket = {}) {
  const key = ticketPriority(ticket);
  if (["urgent", "urgente", "critical", "critica", "critico", "p0", "p1"].includes(key)) return "Urgente";
  if (["high", "alta", "alto"].includes(key)) return "Alta";
  if (["low", "baja", "bajo"].includes(key)) return "Baja";
  return "Media";
}

function sameTechnician(ticket = {}, tech = {}) {
  const current = technicianFromTicket(ticket);
  if (tech.userId && current.userId) return tech.userId.toLowerCase() === current.userId.toLowerCase();
  if (tech.email && current.email) return tech.email === current.email;
  if (tech.name && current.name) return normalizeKey(tech.name) === normalizeKey(current.name);
  return false;
}

function technicianStats(items = [], tech = {}, total = 0) {
  const assignedTickets = array(items).filter((ticket) => sameTechnician(ticket, tech));
  const closed = assignedTickets.filter((ticket) => ["closed", "resolved", "cerrada", "cerrado", "resuelta", "resuelto"].includes(ticketStatus(ticket))).length;
  const active = assignedTickets.filter((ticket) => ["open", "opened", "pending", "in_progress", "inprogress", "progress", "assigned"].includes(ticketStatus(ticket))).length;
  const urgent = assignedTickets.filter((ticket) => ["urgent", "urgente", "critical", "critica", "critico", "high", "alta", "p0", "p1"].includes(ticketPriority(ticket))).length;
  const recent = [...assignedTickets].sort((a, b) => dateValue(ticketCreatedAt(b)) - dateValue(ticketCreatedAt(a))).slice(0, 4);
  return {
    assigned: assignedTickets.length,
    active,
    closed,
    urgent,
    resolutionRate: assignedTickets.length ? (closed / assignedTickets.length) * 100 : 0,
    activeRate: assignedTickets.length ? (active / assignedTickets.length) * 100 : 0,
    exact: Number(total || assignedTickets.length) <= array(items).length,
    loaded: array(items).length,
    total: Math.max(Number(total) || 0, array(items).length),
    recent,
  };
}

function mergeTechnician(snapshot = {}, user = {}) {
  const source = object(user);
  return {
    userId: text(first(source.userId, source.usuarioId, source.id, snapshot.userId), ""),
    name: text(first(source.displayName, source.fullName, source.name, source.nombre, snapshot.name), "Técnico"),
    email: normalizeEmail(first(source.email, source.emailLower, snapshot.email)),
    phone: text(first(source.phone, source.telefono, source.mobile), ""),
    username: text(first(source.username, source.userName, source.slug), ""),
    role: text(first(source.role, source.rol, snapshot.role), ""),
    position: text(first(source.profile?.position, source.position, source.cargo), ""),
    avatar: safeAvatarUrl(first(source.avatarUrl, source.avatar, source.picture, source.profile?.avatarUrl, source.profile?.avatar, snapshot.avatar)),
    lastLoginAt: first(source.lastLoginAt, source.lastSuccessfulLoginAt, source.lastAccessAt, source.audit?.lastLoginAt),
    status: text(first(source.status, source.estado, source.active === false ? "inactive" : "active"), "active"),
  };
}

function statusLabel(value = "") {
  return ["inactive", "inactivo", "disabled", "blocked", "suspended"].includes(normalizeKey(value)) ? "Inactivo" : "Activo";
}

function sectionHeader(title = "", subtitle = "") {
  return `<div class="ui-detail-modal-section-head"><h3>${escapeHtml(title)}</h3>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}</div>`;
}

function metaCard(label = "", value = "—", hint = "") {
  const safeValue = text(value, "—");
  return `<div class="ui-detail-modal-meta-card"><span>${escapeHtml(label)}</span><strong title="${attr(safeValue)}">${escapeHtml(safeValue)}</strong>${hint ? `<span style="font-size:11px;color:var(--text-muted);font-weight:500;line-height:1.3;">${escapeHtml(hint)}</span>` : ""}</div>`;
}

function closeIcon() {
  return `<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
}

function eyeIcon() {
  return `<svg aria-hidden="true" focusable="false" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function avatarMarkup(tech = {}) {
  const src = safeAvatarUrl(tech.avatar);
  const tone = hash(tech.email || tech.userId || tech.name) % 10;
  return `<div class="ui-detail-modal-avatar"><div class="ui-detail-modal-avatar-frame" data-avatar-tone="${tone}" data-has-avatar="${src ? "true" : "false"}" aria-hidden="true">${src ? `<img src="${attr(src)}" alt="" width="72" height="72" loading="eager" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}<span class="ui-detail-modal-avatar-fallback">${escapeHtml(initials(tech.name))}</span></div></div>`;
}

function statusChip(tech = {}) {
  const active = statusLabel(tech.status) === "Activo";
  const modifier = active ? "ui-detail-modal-chip--status-resolved" : "ui-detail-modal-chip--priority-critical";
  return `<span class="ui-detail-modal-chip ${modifier}">${active ? "Activo" : "Inactivo"}</span>`;
}

function ticketStatusChip(ticket = {}) {
  const label = ticketStatusLabel(ticket);
  const modifier = label === "Resuelta"
    ? "ui-detail-modal-chip--status-resolved"
    : label === "Pendiente"
      ? "ui-detail-modal-chip--status-pending"
      : "ui-detail-modal-chip--status-open";
  return `<span class="ui-detail-modal-chip ${modifier}">${escapeHtml(label)}</span>`;
}

function priorityChip(ticket = {}) {
  const label = priorityLabel(ticket);
  const modifier = label === "Urgente"
    ? "ui-detail-modal-chip--priority-critical"
    : label === "Alta"
      ? "ui-detail-modal-chip--priority-high"
      : "";
  return `<span class="ui-detail-modal-chip ${modifier}">${escapeHtml(label)}</span>`;
}

function progressRow(label = "", value = 0, detail = "") {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div style="display:grid;gap:7px;min-width:0;"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><span style="color:var(--text-muted);font-size:var(--font-xs);font-weight:600;">${escapeHtml(label)}</span><strong style="color:var(--text-strong);font-size:var(--font-xs);">${escapeHtml(percentLabel(safe))}</strong></div><div aria-hidden="true" style="height:8px;border-radius:999px;overflow:hidden;background:var(--surface-3,var(--ui-detail-modal-card-bg));border:1px solid var(--ui-detail-modal-card-border);"><span style="display:block;height:100%;width:${safe.toFixed(2)}%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),var(--info));"></span></div>${detail ? `<span style="color:var(--text-muted);font-size:11px;line-height:1.3;">${escapeHtml(detail)}</span>` : ""}</div>`;
}

function recentTicketCard(ticket = {}) {
  const id = ticketId(ticket) || "Incidencia";
  const subject = ticketTitle(ticket);
  return `<article class="ui-detail-modal-meta-card" style="align-content:start;gap:8px;min-block-size:118px;"><span>${escapeHtml(id)}</span><strong title="${attr(subject)}" style="white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;">${escapeHtml(subject)}</strong><div class="ui-detail-modal-hero-chips" style="margin-top:auto;">${ticketStatusChip(ticket)}${priorityChip(ticket)}</div><span style="font-size:11px;color:var(--text-muted);font-weight:500;">${escapeHtml(dateTimeLabel(ticketCreatedAt(ticket), "Fecha no disponible"))}</span></article>`;
}

function renderLoading(seed = {}) {
  return renderShell({
    tech: mergeTechnician(seed, {}),
    summary: "Cargando información operativa del técnico…",
    body: `<section class="ui-detail-modal-description-section" aria-busy="true">${sectionHeader("Preparando perfil", "Sin modificar ningún dato")}<div class="ui-detail-modal-meta-grid">${metaCard("Perfil", "Cargando…")}${metaCard("Incidencias", "Calculando…")}${metaCard("Actividad", "Analizando…")}${metaCard("Contacto", "Validando…")}</div></section>`,
  });
}

function renderError(seed = {}, message = "") {
  return renderShell({
    tech: mergeTechnician(seed, {}),
    summary: "Perfil parcialmente disponible",
    body: `<section class="ui-detail-modal-description-section" role="alert">${sectionHeader("No se pudo completar el perfil", "La incidencia no se ha modificado")}<p style="margin:0;color:var(--text-muted);line-height:1.55;">${escapeHtml(message || "No se pudo cargar la información del técnico.")}</p></section>`,
  });
}

function renderProfile(tech = {}, stats = {}) {
  const email = normalizeEmail(tech.email);
  const phone = text(tech.phone, "");
  const exactText = stats.exact
    ? `${numberLabel(stats.assigned)} incidencia${stats.assigned === 1 ? "" : "s"} asignada${stats.assigned === 1 ? "" : "s"}`
    : `Métricas sobre ${numberLabel(stats.loaded)} de ${numberLabel(stats.total)} incidencias cargadas`;
  const roleLabel = text(tech.position || tech.role, "Técnico");
  const username = tech.username ? `@${tech.username.replace(/^@+/, "")}` : "No disponible";
  const recent = array(stats.recent);

  const body = `
    <section class="ui-detail-modal-description-section">
      ${sectionHeader("Resumen operativo", exactText)}
      <div class="ui-detail-modal-meta-grid">
        ${metaCard("Asignadas", numberLabel(stats.assigned), "Carga total visible")}
        ${metaCard("Activas", numberLabel(stats.active), stats.active ? "Requieren seguimiento" : "Sin pendientes activas")}
        ${metaCard("Resueltas", numberLabel(stats.closed), "Cerradas o resueltas")}
        ${metaCard("Urgentes", numberLabel(stats.urgent), stats.urgent ? "Prioridad alta o crítica" : "Sin urgencias")}
      </div>
      <div class="ui-detail-modal-contact-grid" style="margin-top:var(--space-md);">
        ${progressRow("Tasa de resolución", stats.resolutionRate, `${numberLabel(stats.closed)} de ${numberLabel(stats.assigned)} incidencias resueltas`)}
        ${progressRow("Carga activa", stats.activeRate, `${numberLabel(stats.active)} en seguimiento`) }
      </div>
    </section>

    <section class="ui-detail-modal-contact-section">
      ${sectionHeader("Perfil y contacto", "Datos canónicos del usuario")}
      <div class="ui-detail-modal-meta-grid" style="margin-bottom:var(--space-sm);">
        ${metaCard("Función", roleLabel)}
        ${metaCard("Usuario", username)}
        ${metaCard("Estado", statusLabel(tech.status))}
        ${metaCard("Último acceso", dateTimeLabel(tech.lastLoginAt))}
      </div>
      <div class="ui-detail-modal-contact-grid">
        ${metaCard("Correo", email || "No disponible")}
        ${metaCard("Teléfono", phone || "No disponible")}
      </div>
      <div style="margin-top:var(--space-sm);">${metaCard("Identificador de usuario", text(tech.userId, "No disponible"))}</div>
    </section>

    <section class="ui-detail-modal-history-section">
      ${sectionHeader("Actividad reciente", recent.length ? `${numberLabel(recent.length)} últimas incidencias visibles` : "Sin incidencias recientes")}
      ${recent.length ? `<div class="ui-detail-modal-meta-grid">${recent.map(recentTicketCard).join("")}</div>` : `<p style="margin:0;color:var(--text-muted);font-size:var(--font-sm);">No hay actividad reciente disponible para este técnico.</p>`}
    </section>

    <footer class="ui-detail-modal-footer" style="gap:8px;flex-wrap:wrap;padding-top:2px;">
      ${email ? `<a class="ui-detail-modal-view-btn" href="mailto:${attr(email)}">Enviar email</a>` : ""}
      ${phone ? `<a class="ui-detail-modal-view-btn" href="tel:${attr(phone.replace(/[^+\d]/g, ""))}">Llamar</a>` : ""}
      <button type="button" class="ui-detail-modal-submit-btn" data-technician-profile-action="close">Cerrar perfil</button>
    </footer>`;

  return renderShell({
    tech,
    body,
    summary: `${exactText} · ${percentLabel(stats.resolutionRate)} de resolución`,
  });
}

function renderShell({ tech = {}, body = "", summary = "" } = {}) {
  const name = text(tech.name, "Técnico");
  const role = text(tech.position || tech.role, "Técnico");
  return `
    <section id="${ROOT_ID}" class="ui-detail-modal-root" data-technician-profile-root="true">
      <div class="ui-detail-modal-overlay" data-technician-profile-overlay="true">
        <div id="${PANEL_ID}" class="ui-detail-modal-panel" data-technician-profile-panel="true" role="dialog" aria-modal="true" aria-labelledby="inc-technician-title" aria-describedby="inc-technician-summary" tabindex="-1">
          <header class="ui-detail-modal-header">
            <div class="ui-detail-modal-hero">
              ${avatarMarkup(tech)}
              <div class="ui-detail-modal-hero-content">
                <div class="ui-detail-modal-hero-chips"><span class="ui-detail-modal-chip">Técnico</span>${role ? `<span class="ui-detail-modal-chip">${escapeHtml(role)}</span>` : ""}${statusChip(tech)}</div>
                <h2 id="inc-technician-title" class="ui-detail-modal-title">${escapeHtml(name)}</h2>
                <span id="inc-technician-summary" class="ui-detail-modal-updated">${escapeHtml(summary || "Perfil operativo del técnico asignado")}</span>
              </div>
            </div>
            <button type="button" class="ui-detail-modal-close-btn" data-technician-profile-action="close" aria-label="Cerrar perfil de ${attr(name)}">${closeIcon()}</button>
          </header>
          <main class="ui-detail-modal-body">${body}</main>
        </div>
      </div>
    </section>`;
}

function ensureHost() {
  if (!browser()) return null;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.dataset.technicianProfileHost = "true";
    document.body.appendChild(host);
  }
  return host;
}

function lockBody() {
  if (!browser() || bodyLocked) return;
  previousBodyOverflow = document.body.style.overflow || "";
  previousBodyClasses = new Map([
    ["modal-open", document.body.classList.contains("modal-open")],
    ["ui-detail-modal-open", document.body.classList.contains("ui-detail-modal-open")],
  ]);
  document.body.classList.add("modal-open", "ui-detail-modal-open");
  document.body.style.overflow = "hidden";
  bodyLocked = true;
}

function unlockBody() {
  if (!browser() || !bodyLocked) return;
  for (const [name, existed] of previousBodyClasses.entries()) {
    if (!existed) document.body.classList.remove(name);
  }
  document.body.style.overflow = previousBodyOverflow;
  previousBodyClasses = new Map();
  previousBodyOverflow = "";
  bodyLocked = false;
}

function modalPanel() {
  return document.getElementById(PANEL_ID);
}

function paint(html = "", { focus = false } = {}) {
  const host = ensureHost();
  if (!host) return false;
  const template = document.createElement("template");
  template.innerHTML = String(html || "").trim();
  const nextRoot = template.content.querySelector(`#${ROOT_ID}`);
  const nextPanel = nextRoot?.querySelector?.(`#${PANEL_ID}`) || null;
  const currentRoot = host.querySelector(`#${ROOT_ID}`);
  const currentPanel = currentRoot?.querySelector?.(`#${PANEL_ID}`) || null;
  if (currentRoot && currentPanel && nextPanel) {
    for (const attribute of Array.from(nextPanel.attributes || [])) currentPanel.setAttribute(attribute.name, attribute.value);
    currentPanel.replaceChildren(...Array.from(nextPanel.childNodes));
  } else {
    host.replaceChildren(template.content);
  }
  lockBody();
  if (focus) queueMicrotask(() => modalPanel()?.focus?.({ preventScroll: true }));
  return true;
}

function closeProfile() {
  requestSeq += 1;
  document.getElementById(HOST_ID)?.replaceChildren();
  unlockBody();
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected && typeof target.focus === "function") {
    try { target.focus({ preventScroll: true }); } catch { /* noop */ }
  }
  return true;
}

function technicianTriggerName(trigger = null) {
  return text(first(
    trigger?.querySelector?.(".incidencias-assigned-name")?.textContent,
    trigger?.querySelector?.(".incidencias-modal-technician-copy strong")?.textContent,
    trigger?.querySelector?.("strong")?.textContent,
    trigger?.textContent
  ), "Técnico");
}

function technicianTriggerEmail(trigger = null) {
  const node = trigger?.querySelector?.(".incidencias-modal-technician-email");
  return normalizeEmail(first(node?.textContent, node?.getAttribute?.("href")?.replace(/^mailto:/i, "")));
}

function ticketIdFromTrigger(trigger = null) {
  const row = trigger?.closest?.(ROW);
  const detailRoot = trigger?.closest?.(DETAIL_ROOT);
  return text(first(
    trigger?.dataset?.ticketId,
    row?.dataset?.ticketId,
    row?.dataset?.incidenciaId,
    detailRoot?.dataset?.ticketId,
    detailRoot?.dataset?.incidenciaId
  ), "");
}

function isSupportedTrigger(trigger = null) {
  if (!trigger) return false;
  if (mountRoot?.contains?.(trigger)) return true;
  if (observedModalHost?.contains?.(trigger)) return true;
  return Boolean(trigger.closest?.(DETAIL_ROOT));
}

function decoratePriorityBadges(root = mountRoot) {
  for (const badge of root?.querySelectorAll?.(PRIORITY_BADGE) || []) {
    const label = text(badge.textContent, "");
    badge.classList.add("incidencias-meta-pill--action");
    if (label) badge.title = `Prioridad: ${label}`;
  }
}

function decorateDetailPriorityChips(root = observedModalHost) {
  for (const chip of root?.querySelectorAll?.(DETAIL_PRIORITY) || []) {
    const label = text(chip.textContent, "");
    chip.classList.add("incidencias-meta-pill--action");
    if (label) chip.title = `Prioridad: ${label}`;
  }
}

function decorateTechnicianBadges(root = mountRoot) {
  for (const badge of root?.querySelectorAll?.(LIST_TECH_BADGE) || []) {
    const name = technicianTriggerName(badge);
    badge.classList.add("incidencias-meta-pill--action");
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("aria-haspopup", "dialog");
    badge.setAttribute("aria-label", `Ver perfil del técnico ${name}`);
    badge.title = `Técnico: ${name}`;
    badge.dataset.technicianProfileTrigger = "true";
  }
}

function decorateDetailTechnicianCards(root = observedModalHost) {
  for (const inline of root?.querySelectorAll?.(DETAIL_TECHNICIAN) || []) {
    const card = inline.closest?.(".incidencias-modal-meta-card");
    if (!card) continue;

    const name = technicianTriggerName(card);
    const id = ticketIdFromTrigger(card) || text(inline.closest?.(DETAIL_ROOT)?.dataset?.ticketId, "");

    card.classList.add("incidencias-modal-technician-card", "incidencias-modal-contact-link");
    card.dataset.technicianProfileTrigger = "true";
    card.dataset.assigned = "true";
    if (id) card.dataset.ticketId = id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-label", `Ver perfil del técnico ${name}`);
    card.title = `Ver perfil del técnico ${name}`;

    const copy = inline.querySelector?.(".incidencias-modal-technician-copy");
    if (copy && !copy.querySelector?.("[data-technician-profile-eye='true']")) {
      const action = document.createElement("span");
      action.className = "incidencias-modal-contact-action-copy incidencias-modal-contact-label";
      action.dataset.technicianProfileEye = "true";
      action.setAttribute("aria-hidden", "true");
      action.innerHTML = `<span class="incidencias-modal-contact-icon">${eyeIcon()}</span><span>Ver perfil</span>`;
      copy.appendChild(action);
    }
  }
}

function syncModalObserver() {
  if (!browser()) return false;
  const nextHost = document.querySelector(MODAL_HOST);
  if (nextHost === observedModalHost) return Boolean(nextHost);

  modalObserver?.disconnect?.();
  modalObserver = null;
  observedModalHost = nextHost || null;

  if (observedModalHost && typeof MutationObserver !== "undefined") {
    modalObserver = new MutationObserver(schedule);
    modalObserver.observe(observedModalHost, { childList: true, subtree: true });
  }
  return Boolean(observedModalHost);
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return;
  syncModalObserver();
  decoratePriorityBadges();
  decorateTechnicianBadges();
  decorateDetailPriorityChips();
  decorateDetailTechnicianCards();

  /*
     El opener sólo sirve para devolver foco. Una sustitución rápida del DOM
     de la vista puede desconectarlo mientras el perfil ya está abriéndose.
     Esa pérdida de referencia no tiene autoridad para cerrar el modal ni
     invalidar la petición: simplemente renunciamos a restaurar ese foco.
  */
  if (
    document.getElementById(ROOT_ID) &&
    returnFocus &&
    !returnFocus.isConnected
  ) {
    returnFocus = null;
  }
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

const incidenceApi = () => incidenceApiPromise ||= import("../../views/incidencias/incidencias.api.js");
const usersApi = () => usersApiPromise ||= import("../../views/usuarios/usuarios.api.js");

async function loadProfile(trigger = null) {
  const id = ticketIdFromTrigger(trigger);
  if (!id) return false;

  const seed = {
    name: technicianTriggerName(trigger),
    email: technicianTriggerEmail(trigger),
    avatar: safeAvatarUrl(trigger?.querySelector?.("img")?.src || ""),
  };

  returnFocus = trigger;
  const sequence = ++requestSeq;
  paint(renderLoading(seed), { focus: true });

  try {
    const api = await incidenceApi();
    const listResponse = await api.listIncidencias({ force: false, cache: true, returnStaleOnError: true });
    if (sequence !== requestSeq) return false;

    const items = array(listResponse?.items);
    let sourceTicket = items.find((ticket) => ticketId(ticket) === id) || null;
    let snapshot = sourceTicket ? technicianFromTicket(sourceTicket) : seed;

    if (!snapshot.userId) {
      try {
        const detail = await api.loadIncidenciaDetail(id, { force: false, cache: true });
        if (sequence !== requestSeq) return false;
        if (detail) {
          sourceTicket = detail;
          snapshot = { ...seed, ...technicianFromTicket(detail) };
        }
      } catch { /* perfil parcial permitido */ }
    }

    let user = null;
    if (snapshot.userId) {
      try { user = await (await usersApi()).getUsuarioByIdRequest(snapshot.userId, { dedupe: true }); }
      catch { user = null; }
    }

    if (sequence !== requestSeq) return false;
    const tech = mergeTechnician({ ...seed, ...snapshot }, user || {});
    paint(renderProfile(tech, technicianStats(items, tech, listResponse?.total)));
    return true;
  } catch (error) {
    if (sequence !== requestSeq) return false;
    paint(renderError(seed, safeError(error)));
    return false;
  }
}

function profileTriggerFromTarget(target = null) {
  if (!target?.closest) return null;
  if (target.closest(DETAIL_TECHNICIAN) && !target.closest(DETAIL_TECH_CARD)) {
    decorateDetailTechnicianCards(target.closest(MODAL_HOST) || document);
  }
  return target.closest(TECH_TRIGGER);
}

function onClick(event) {
  const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
  if (target?.closest?.("[data-technician-profile-action='close']")) {
    event.preventDefault(); event.stopPropagation(); closeProfile(); return;
  }
  const overlay = target?.closest?.("[data-technician-profile-overlay='true']");
  if (overlay && target === overlay) {
    event.preventDefault(); event.stopPropagation(); closeProfile(); return;
  }

  const trigger = profileTriggerFromTarget(target);
  if (!trigger || !isSupportedTrigger(trigger)) return;

  const nestedLink = target?.closest?.("a[href]");
  if (nestedLink && trigger.contains(nestedLink)) return;

  event.preventDefault();
  event.stopPropagation();
  void loadProfile(trigger);
}

function trapFocus(event) {
  const panel = modalPanel();
  if (!panel) return false;
  const items = [...panel.querySelectorAll(FOCUSABLE)].filter((node) => !node.disabled && node.getAttribute("aria-hidden") !== "true");
  if (!items.length) { event.preventDefault(); panel.focus(); return true; }
  const firstItem = items[0];
  const lastItem = items.at(-1);
  if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); return true; }
  if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); return true; }
  return false;
}

function onKeydown(event) {
  if (document.getElementById(ROOT_ID)) {
    if (event.key === "Escape") { event.preventDefault(); closeProfile(); return; }
    if (event.key === "Tab") { trapFocus(event); return; }
  }
  if (event.key !== "Enter" && event.key !== " ") return;

  const trigger = profileTriggerFromTarget(event.target);
  if (!trigger || !isSupportedTrigger(trigger) || event.target?.closest?.("a[href]")) return;

  event.preventDefault();
  event.stopPropagation();
  void loadProfile(trigger);
}

export function mountIncidenciasTechnicianProfile() {
  if (!browser() || mounted) return false;
  const root = document.querySelector(VIEW);
  if (!root || typeof MutationObserver === "undefined") return false;

  mounted = true;
  mountRoot = root;
  mountRoot.addEventListener("click", onClick, true);
  mountRoot.addEventListener("keydown", onKeydown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);

  observer = new MutationObserver(schedule);
  observer.observe(mountRoot, { childList: true, subtree: true });
  schedule();
  return true;
}

export function destroyIncidenciasTechnicianProfile() {
  if (!browser() || !mounted) return false;
  mounted = false;
  requestSeq += 1;

  mountRoot?.removeEventListener("click", onClick, true);
  mountRoot?.removeEventListener("keydown", onKeydown, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeydown, true);

  observer?.disconnect?.();
  modalObserver?.disconnect?.();
  observer = null;
  modalObserver = null;
  observedModalHost = null;

  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
  closeProfile();
  document.getElementById(HOST_ID)?.remove?.();
  mountRoot = null;
  return true;
}

export function getIncidenciasTechnicianProfileSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_TECHNICIAN_PROFILE_VERSION,
    mounted,
    observerScope: "router-view+incidencias-modal-host",
    cssAuthority: "existing-incidencias-interaction-classes",
    detailModalIntegrated: Boolean(observedModalHost),
    modalOpen: Boolean(browser() && document.getElementById(ROOT_ID)),
  });
}

if (browser()) mountIncidenciasTechnicianProfile();

export default Object.freeze({
  version: INCIDENCIAS_TECHNICIAN_PROFILE_VERSION,
  mount: mountIncidenciasTechnicianProfile,
  destroy: destroyIncidenciasTechnicianProfile,
  getSnapshot: getIncidenciasTechnicianProfileSnapshot,
});
