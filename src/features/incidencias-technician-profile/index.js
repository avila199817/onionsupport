/* =========================================================
   Onion Support · Incidencias Technician Profile
   Archivo: /src/features/incidencias-technician-profile/index.js

   Mejora progresiva UI-only:
   - hace interactiva la etiqueta del técnico sin alterar el click de la fila;
   - abre un perfil seguro con datos canónicos de Usuarios + métricas de tickets;
   - añade title descriptivo a las etiquetas de prioridad;
   - sin mutar tickets, usuarios, permisos ni contratos HTTP;
   - listeners y observer limitados al mount estable del Router;
   - CSS propiedad del manifest canónico de src/router/styles.js.
========================================================= */

export const INCIDENCIAS_TECHNICIAN_PROFILE_VERSION =
  "incidencias-technician-profile.v1.canonical-user-stats";

const VIEW = "#view-container, [data-router-view='true']";
const TECH_BADGE = ".incidencias-assigned-badge[data-assigned='true']";
const PRIORITY_BADGE = ".incidencias-priority-badge[data-priority-badge]";
const ROW = "[data-ticket-row='true']";
const HOST_ID = "incidencias-technician-profile-host";
const ROOT_ID = "incidencias-technician-profile-root";
const PANEL_ID = "incidencias-technician-profile-panel";
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const TRUSTED_BLOB_HOST = "onionassets.blob.core.windows.net";

let mounted = false;
let mountRoot = null;
let observer = null;
let frame = 0;
let requestSeq = 0;
let returnFocus = null;
let incidenceApiPromise = null;
let usersApiPromise = null;
let previousBodyOverflow = "";
let previousBodyClasses = new Map();
let bodyLocked = false;

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const text = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

const object = (value, fallback = {}) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;

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

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function safeError(error = null, fallback = "No se pudo cargar el perfil del técnico.") {
  return redact(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      fallback
    )
  ) || fallback;
}

function normalizeEmail(value = "") {
  const email = text(value, "").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function mailHref(value = "") {
  const email = normalizeEmail(value);
  return email ? `mailto:${email}` : "";
}

function phoneHref(value = "") {
  const raw = text(value, "");
  if (!raw) return "";
  const plus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `tel:${plus}${digits}` : "";
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
    const sensitive = [
      "access_token", "refresh_token", "id_token", "token", "code", "secret",
      "session", "password", "pwd", "key", "jwt", "authorization", "reset_token",
      "activation_token",
    ];

    for (const key of url.searchParams.keys()) {
      if (sensitive.includes(String(key).toLowerCase())) return "";
    }

    if (url.searchParams.has("sig") && url.hostname.toLowerCase() !== TRUSTED_BLOB_HOST) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function initials(value = "") {
  const parts = text(value, "Técnico").split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "TS";
}

function hash(value = "") {
  const source = text(value, "tecnico");
  let output = 0;
  for (let index = 0; index < source.length; index += 1) {
    output = ((output << 5) - output) + source.charCodeAt(index);
    output |= 0;
  }
  return Math.abs(output);
}

function numberLabel(value = 0) {
  try { return new Intl.NumberFormat("es-ES").format(Number(value) || 0); }
  catch { return String(Number(value) || 0); }
}

function percentLabel(value = 0) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `${Math.round(safe)} %`;
}

function technicianFromTicket(ticket = {}) {
  const raw = object(ticket);
  const assignment = object(raw.assignment);
  const nested = object(first(raw.assignedTo, raw.technician, raw.tecnico, raw.assignedTechnician, assignment.technician, assignment.assignedTo, {}));

  const userId = text(first(
    raw.assignedToUserId,
    raw.technicianUserId,
    raw.tecnicoUserId,
    assignment.assignedToUserId,
    assignment.userId,
    nested.userId,
    nested.id,
    ""
  ), "");

  const name = text(first(
    raw.assignedToName,
    raw.technicianName,
    raw.tecnicoName,
    raw.agentName,
    assignment.assignedToName,
    nested.displayName,
    nested.name,
    nested.nombre,
    ""
  ), "");

  const email = normalizeEmail(first(
    raw.assignedToEmail,
    raw.technicianEmail,
    raw.tecnicoEmail,
    raw.agentEmail,
    assignment.assignedToEmail,
    nested.email,
    nested.emailLower,
    ""
  ));

  const avatar = safeAvatarUrl(first(
    raw.assignedToAvatarUrl,
    raw.technicianAvatarUrl,
    raw.tecnicoAvatarUrl,
    raw.agentAvatarUrl,
    assignment.assignedToAvatarUrl,
    nested.avatarUrl,
    nested.avatar,
    ""
  ));

  return {
    userId,
    name,
    email,
    avatar,
    role: text(first(nested.role, nested.rol, assignment.role, ""), ""),
  };
}

function ticketId(ticket = {}) {
  const raw = object(ticket);
  return text(first(raw.ticketId, raw.incidenciaId, raw.id, raw.code, raw.numero, ""), "");
}

function ticketStatus(ticket = {}) {
  return normalizeKey(first(ticket.status, ticket.estado, ticket.statusKey, ticket.lifecycle?.status, "open"));
}

function ticketPriority(ticket = {}) {
  return normalizeKey(first(ticket.priority, ticket.prioridad, ticket.priorityKey, ticket.severity, "medium"));
}

function sameTechnician(ticket = {}, tech = {}) {
  const current = technicianFromTicket(ticket);

  if (tech.userId && current.userId) {
    return tech.userId.toLowerCase() === current.userId.toLowerCase();
  }

  if (tech.email && current.email) {
    return tech.email === current.email;
  }

  if (tech.name && current.name) {
    return normalizeKey(tech.name) === normalizeKey(current.name);
  }

  return false;
}

function technicianStats(items = [], tech = {}, total = 0) {
  const assigned = array(items).filter((ticket) => sameTechnician(ticket, tech));
  const closed = assigned.filter((ticket) => ["closed", "resolved", "cerrada", "cerrado", "resuelta", "resuelto"].includes(ticketStatus(ticket))).length;
  const active = assigned.filter((ticket) => ["open", "opened", "pending", "in_progress", "inprogress", "progress", "assigned"].includes(ticketStatus(ticket))).length;
  const urgent = assigned.filter((ticket) => ["urgent", "urgente", "critical", "critica", "critico", "high", "alta", "p0", "p1"].includes(ticketPriority(ticket))).length;
  const exact = Number(total || assigned.length) <= array(items).length;

  return {
    assigned: assigned.length,
    active,
    closed,
    urgent,
    resolutionRate: assigned.length ? (closed / assigned.length) * 100 : 0,
    exact,
    loaded: array(items).length,
    total: Math.max(Number(total) || 0, array(items).length),
  };
}

function mergeTechnician(snapshot = {}, user = {}) {
  const source = object(user);
  return {
    userId: text(first(source.userId, source.usuarioId, source.id, snapshot.userId, ""), ""),
    name: text(first(source.displayName, source.fullName, source.name, source.nombre, snapshot.name, "Técnico"), "Técnico"),
    email: normalizeEmail(first(source.email, source.emailLower, snapshot.email, "")),
    phone: text(first(source.phone, source.telefono, source.mobile, ""), ""),
    username: text(first(source.username, source.userName, ""), ""),
    role: text(first(source.role, source.rol, snapshot.role, ""), ""),
    avatar: safeAvatarUrl(first(source.avatarUrl, source.avatar, source.picture, snapshot.avatar, "")),
    lastLoginAt: first(source.lastLoginAt, source.lastAccessAt, null),
    status: text(first(source.status, source.estado, source.active === false ? "inactive" : "active"), ""),
  };
}

function sectionHeader(title = "", subtitle = "") {
  return `
    <div class="ui-detail-modal-section-head">
      <h3>${escapeHtml(title)}</h3>
      ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
    </div>
  `;
}

function metaCard(label = "", value = "—") {
  return `
    <div class="ui-detail-modal-meta-card">
      <span>${escapeHtml(label)}</span>
      <strong title="${attr(value)}">${escapeHtml(value || "—")}</strong>
    </div>
  `;
}

function closeIcon() {
  return `<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
}

function avatarMarkup(tech = {}) {
  const src = safeAvatarUrl(tech.avatar);
  const tone = hash(tech.email || tech.userId || tech.name) % 10;
  return `
    <div class="ui-detail-modal-avatar">
      <div class="ui-detail-modal-avatar-frame" data-avatar-tone="${tone}" data-has-avatar="${src ? "true" : "false"}" aria-hidden="true">
        ${src ? `<img src="${attr(src)}" alt="" width="72" height="72" loading="eager" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}
        <span class="ui-detail-modal-avatar-fallback">${escapeHtml(initials(tech.name))}</span>
      </div>
    </div>
  `;
}

function renderLoading(seed = {}) {
  const tech = mergeTechnician(seed, {});
  return renderShell({
    tech,
    body: `
      <div class="ui-detail-modal-meta-grid" aria-busy="true">
        ${metaCard("Perfil", "Cargando…")}
        ${metaCard("Contacto", "Cargando…")}
        ${metaCard("Incidencias", "Calculando…")}
        ${metaCard("Estado", "Consultando…")}
      </div>
    `,
    summary: "Cargando información del técnico…",
  });
}

function renderError(seed = {}, message = "") {
  const tech = mergeTechnician(seed, {});
  return renderShell({
    tech,
    body: `
      <section class="ui-detail-modal-description-section" role="alert">
        ${sectionHeader("No se pudo completar el perfil", "La incidencia no se ha modificado")}
        <p>${escapeHtml(message || "No se pudo cargar la información del técnico.")}</p>
      </section>
    `,
    summary: "Perfil parcialmente disponible",
  });
}

function renderProfile(tech = {}, stats = {}) {
  const email = normalizeEmail(tech.email);
  const phone = text(tech.phone, "");
  const exactText = stats.exact
    ? `${numberLabel(stats.assigned)} incidencia${stats.assigned === 1 ? "" : "s"} asignada${stats.assigned === 1 ? "" : "s"}`
    : `Métricas sobre ${numberLabel(stats.loaded)} de ${numberLabel(stats.total)} incidencias cargadas`;

  const body = `
    <div class="ui-detail-modal-meta-grid">
      ${metaCard("Asignadas", numberLabel(stats.assigned))}
      ${metaCard("Activas", numberLabel(stats.active))}
      ${metaCard("Resueltas", numberLabel(stats.closed))}
      ${metaCard("Urgentes", numberLabel(stats.urgent))}
      ${metaCard("Resolución", percentLabel(stats.resolutionRate))}
      ${metaCard("Rol", text(tech.role, "—"))}
      ${metaCard("Usuario", tech.username ? `@${tech.username}` : "—")}
      ${metaCard("ID", text(tech.userId, "—"))}
    </div>

    <section class="ui-detail-modal-contact-section">
      ${sectionHeader("Contacto", exactText)}
      <div class="ui-detail-modal-contact-grid">
        ${metaCard("Correo", email || "No disponible")}
        ${metaCard("Teléfono", phone || "No disponible")}
      </div>
    </section>

    <footer class="ui-detail-modal-footer">
      ${email ? `<a class="ui-detail-modal-view-btn" href="${attr(mailHref(email))}">Enviar email</a>` : ""}
      ${phone ? `<a class="ui-detail-modal-view-btn" href="${attr(phoneHref(phone))}">Llamar</a>` : ""}
      <button type="button" class="ui-detail-modal-submit-btn" data-technician-profile-action="close">Cerrar</button>
    </footer>
  `;

  return renderShell({
    tech,
    body,
    summary: exactText,
  });
}

function renderShell({ tech = {}, body = "", summary = "" } = {}) {
  const name = text(tech.name, "Técnico");
  const role = text(tech.role, "Técnico");
  return `
    <section id="${ROOT_ID}" class="ui-detail-modal-root" data-technician-profile-root="true">
      <div class="ui-detail-modal-overlay" data-technician-profile-overlay="true">
        <div id="${PANEL_ID}" class="ui-detail-modal-panel" data-technician-profile-panel="true" role="dialog" aria-modal="true" aria-labelledby="inc-technician-title" aria-describedby="inc-technician-summary" tabindex="-1">
          <header class="ui-detail-modal-header">
            <div class="ui-detail-modal-hero">
              ${avatarMarkup(tech)}
              <div class="ui-detail-modal-hero-content">
                <div class="ui-detail-modal-hero-chips">
                  <span class="ui-detail-modal-chip">Técnico</span>
                  ${role ? `<span class="ui-detail-modal-chip">${escapeHtml(role)}</span>` : ""}
                </div>
                <h2 id="inc-technician-title" class="ui-detail-modal-title">${escapeHtml(name)}</h2>
                <span id="inc-technician-summary" class="ui-detail-modal-updated">${escapeHtml(summary || "Perfil del técnico asignado")}</span>
              </div>
            </div>
            <button type="button" class="ui-detail-modal-close-btn" data-technician-profile-action="close" aria-label="Cerrar perfil de ${attr(name)}">${closeIcon()}</button>
          </header>
          <main class="ui-detail-modal-body">${body}</main>
        </div>
      </div>
    </section>
  `;
}

function ensureHost() {
  if (!browser()) return null;
  let host = document.getElementById(HOST_ID);
  if (host) return host;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.dataset.technicianProfileHost = "true";
  document.body.appendChild(host);
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

  if (currentRoot && currentPanel && nextRoot && nextPanel) {
    for (const attribute of Array.from(nextPanel.attributes || [])) {
      currentPanel.setAttribute(attribute.name, attribute.value);
    }
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
  const host = document.getElementById(HOST_ID);
  if (host) host.replaceChildren();
  unlockBody();

  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected && typeof target.focus === "function") {
    try { target.focus({ preventScroll: true }); } catch { /* noop */ }
  }
  return true;
}

function decoratePriorityBadges(root = mountRoot) {
  for (const badge of root?.querySelectorAll?.(PRIORITY_BADGE) || []) {
    const label = text(badge.textContent, "");
    if (!label) continue;
    badge.title = `Prioridad: ${label}`;
  }
}

function decorateTechnicianBadges(root = mountRoot) {
  for (const badge of root?.querySelectorAll?.(TECH_BADGE) || []) {
    const name = text(badge.querySelector(".incidencias-assigned-name")?.textContent || badge.textContent, "Técnico");
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("aria-haspopup", "dialog");
    badge.setAttribute("aria-label", `Ver perfil del técnico ${name}`);
    badge.title = `Técnico: ${name}`;
    badge.dataset.technicianProfileTrigger = "true";
  }
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return;
  decoratePriorityBadges();
  decorateTechnicianBadges();

  if (document.getElementById(ROOT_ID) && returnFocus && !returnFocus.isConnected) {
    closeProfile();
  }
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

const incidenceApi = () =>
  incidenceApiPromise ||= import("../../views/incidencias/incidencias.api.js");

const usersApi = () =>
  usersApiPromise ||= import("../../views/usuarios/usuarios.api.js");

async function loadProfile(trigger = null) {
  const row = trigger?.closest?.(ROW);
  const id = text(row?.dataset?.ticketId || row?.dataset?.incidenciaId, "");
  if (!id) return false;

  const seed = {
    name: text(trigger.querySelector(".incidencias-assigned-name")?.textContent || trigger.textContent, "Técnico"),
    avatar: safeAvatarUrl(trigger.querySelector("img")?.src || ""),
  };

  returnFocus = trigger;
  const sequence = ++requestSeq;
  paint(renderLoading(seed), { focus: true });

  try {
    const api = await incidenceApi();
    const listResponse = await api.listIncidencias({
      force: false,
      cache: true,
      returnStaleOnError: true,
    });

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
      } catch {
        // La lista canónica sigue permitiendo mostrar un perfil parcial.
      }
    }

    let user = null;
    if (snapshot.userId) {
      try {
        user = await (await usersApi()).getUsuarioByIdRequest(snapshot.userId, { dedupe: true });
      } catch {
        user = null;
      }
    }

    if (sequence !== requestSeq) return false;

    const tech = mergeTechnician({ ...seed, ...snapshot }, user || {});
    const stats = technicianStats(items, tech, listResponse?.total);
    paint(renderProfile(tech, stats));
    return true;
  } catch (error) {
    if (sequence !== requestSeq) return false;
    paint(renderError(seed, safeError(error)));
    return false;
  }
}

function onClick(event) {
  const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
  const close = target?.closest?.("[data-technician-profile-action='close']");
  if (close) {
    event.preventDefault();
    event.stopPropagation();
    closeProfile();
    return;
  }

  const overlay = target?.closest?.("[data-technician-profile-overlay='true']");
  if (overlay && target === overlay) {
    event.preventDefault();
    event.stopPropagation();
    closeProfile();
    return;
  }

  const trigger = target?.closest?.(TECH_BADGE);
  if (!trigger || !mountRoot?.contains(trigger)) return;

  event.preventDefault();
  event.stopPropagation();
  void loadProfile(trigger);
}

function trapFocus(event) {
  const panel = modalPanel();
  if (!panel) return false;
  const items = [...panel.querySelectorAll(FOCUSABLE)].filter((node) => !node.disabled && node.getAttribute("aria-hidden") !== "true");
  if (!items.length) {
    event.preventDefault();
    panel.focus();
    return true;
  }

  const firstItem = items[0];
  const lastItem = items.at(-1);
  if (event.shiftKey && document.activeElement === firstItem) {
    event.preventDefault();
    lastItem.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === lastItem) {
    event.preventDefault();
    firstItem.focus();
    return true;
  }
  return false;
}

function onKeydown(event) {
  if (document.getElementById(ROOT_ID)) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeProfile();
      return;
    }
    if (event.key === "Tab") {
      trapFocus(event);
      return;
    }
  }

  if (event.key !== "Enter" && event.key !== " ") return;
  const trigger = event.target?.closest?.(TECH_BADGE);
  if (!trigger || !mountRoot?.contains(trigger)) return;
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
  observer = null;
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
    observerScope: "router-view",
    cssAuthority: "router-styles",
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
