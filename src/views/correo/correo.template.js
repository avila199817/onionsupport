/* =========================================================
   Onion Support - Correo Template
   Archivo: /src/views/correo/correo.template.js

   PRODUCTIVO · OUTLOOK / FLUENT · V6 FINAL POLISH
   - Render puro y escapado.
   - Sin HTTP, tokens ni estado global.
   - Workspace denso, scroll interno e infinito.
   - Toolbar de lista compacta: filtros + actualizar + redactar.
   - Estado de notificaciones explícito; sin check redundante en perfil.
========================================================= */

export const CORREO_TEMPLATE_VERSION = "correo.template.microsoft.production.v6-final-polish";

const SVG = `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;

const ICONS = Object.freeze({
  mail: `<svg ${SVG}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  inbox: `<svg ${SVG}><path d="M4 4h16v16H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></svg>`,
  star: `<svg ${SVG}><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z"/></svg>`,
  draft: `<svg ${SVG}><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>`,
  edit: `<svg ${SVG}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="m15 5 3 3"/></svg>`,
  send: `<svg ${SVG}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  archive: `<svg ${SVG}><path d="M4 7h16v13H4z"/><path d="M3 3h18v4H3z"/><path d="M9 11h6"/></svg>`,
  trash: `<svg ${SVG}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 14h8l1-14"/></svg>`,
  folder: `<svg ${SVG}><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`,
  search: `<svg ${SVG}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`,
  plus: `<svg ${SVG}><path d="M12 5v14M5 12h14"/></svg>`,
  reply: `<svg ${SVG}><path d="m9 17-6-5 6-5"/><path d="M3 12h10a7 7 0 0 1 7 7"/></svg>`,
  replyAll: `<svg ${SVG}><path d="m7 16-5-4 5-4"/><path d="M2 12h10a7 7 0 0 1 7 7"/><path d="m12 8-3-2.5L12 3"/></svg>`,
  forward: `<svg ${SVG}><path d="m15 17 6-5-6-5"/><path d="M21 12H11a7 7 0 0 0-7 7"/></svg>`,
  attachment: `<svg ${SVG}><path d="m20 12.5-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 1 1 5.7 5.7l-9 9a2 2 0 1 1-2.9-2.8l8.4-8.4"/></svg>`,
  refresh: `<svg ${SVG}><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></svg>`,
  chevron: `<svg ${SVG}><path d="m9 18 6-6-6-6"/></svg>`,
  chevronDown: `<svg ${SVG}><path d="m6 9 6 6 6-6"/></svg>`,
  close: `<svg ${SVG}><path d="m6 6 12 12M18 6 6 18"/></svg>`,
  read: `<svg ${SVG}><path d="M3 6h18v12H3z"/><path d="m3 8 9 6 9-6"/></svg>`,
  unread: `<svg ${SVG}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  download: `<svg ${SVG}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  paperclip: `<svg ${SVG}><path d="M21 11.5 12.5 20a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 1 1-2.9-2.8l8.4-8.4"/></svg>`,
  check: `<svg ${SVG}><path d="m5 12 4 4L19 6"/></svg>`,
  warning: `<svg ${SVG}><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>`,
  spinner: `<svg ${SVG} class="correo-spin"><circle cx="12" cy="12" r="8" opacity=".25"/><path d="M20 12a8 8 0 0 0-8-8"/></svg>`,
  bell: `<svg ${SVG}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
  userPlus: `<svg ${SVG}><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`,
  logout: `<svg ${SVG}><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>`,
});

export function icon(name = "mail") {
  return ICONS[name] || ICONS.mail;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return output || fallback;
}

export function escapeHtml(value = "") {
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

function initials(value = "") {
  return cleanText(value, "?").split(/\s+/).filter(Boolean).slice(0, 2).map((item) => item[0] || "").join("").toUpperCase().slice(0, 2) || "?";
}

function safeImageSrc(value = "") {
  const raw = cleanText(value, "");
  if (!raw || /[\r\n\t\\]/.test(raw) || /^(?:javascript|data|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("/")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return "";
  }
  return "";
}

function senderLabel(message = {}) {
  return cleanText(message?.from?.name || message?.sender?.name || message?.from?.address || message?.sender?.address, "Remitente");
}

function senderAddress(message = {}) {
  return cleanText(message?.from?.address || message?.sender?.address, "");
}

function safeDate(value = "") {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time) : null;
}

export function formatMessageTime(value = "", now = new Date()) {
  const date = safeDate(value);
  if (!date) return "";
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  const delta = Math.abs(now.getTime() - date.getTime());
  if (delta < 6 * 86400000) return new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(date).replace(".", "");
  return new Intl.DateTimeFormat("es-ES", date.getFullYear() === now.getFullYear()
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "short", year: "2-digit" }).format(date);
}

export function formatLongDate(value = "") {
  const date = safeDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export function formatBytes(value = 0) {
  const size = Math.max(0, Number(value) || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

function folderKind(folder = {}) {
  const key = cleanText(folder.displayName, "").toLocaleLowerCase("es-ES");
  if (/entrada|inbox/.test(key)) return "inbox";
  if (/borrador|draft/.test(key)) return "draft";
  if (/enviado|sent/.test(key)) return "send";
  if (/eliminad|papelera|deleted|trash/.test(key)) return "trash";
  if (/archiv|archive/.test(key)) return "archive";
  if (/correo no deseado|junk|spam/.test(key)) return "warning";
  return "folder";
}

export function renderFolderRows(folders = [], selectedId = "") {
  if (!folders.length) return `<div class="correo-mini-empty">${icon("folder")}<span>Sin carpetas</span></div>`;
  return folders.map((folder) => {
    const active = folder.id === selectedId;
    const unread = Number(folder.unreadItemCount) || 0;
    return `
      <button class="correo-folder${active ? " is-active" : ""}" type="button"
        data-correo-action="folder" data-correo-folder-id="${attr(folder.id)}"
        data-correo-folder-name="${attr(folder.displayName)}" aria-pressed="${active ? "true" : "false"}">
        <span class="correo-folder-icon">${icon(folderKind(folder))}</span>
        <span class="correo-folder-copy"><strong>${escapeHtml(folder.displayName)}</strong><small>${Number(folder.totalItemCount) || 0} mensajes</small></span>
        ${unread ? `<span class="correo-folder-count">${unread > 999 ? "999+" : unread}</span>` : ""}
      </button>`;
  }).join("");
}

export function renderMessageRows(messages = [], selectedId = "") {
  if (!messages.length) {
    return `<div class="correo-empty correo-empty--list"><span class="correo-empty-icon">${icon("mail")}</span><strong>No hay mensajes</strong><span>La carpeta o el filtro actual no contiene resultados.</span></div>`;
  }
  const now = new Date();
  return messages.map((message) => {
    const name = senderLabel(message);
    const address = senderAddress(message);
    const flagged = message?.flag?.flagStatus === "flagged";
    const selected = message.id === selectedId;
    const date = message.receivedDateTime || message.sentDateTime;
    return `
      <button class="correo-message-row${selected ? " is-selected" : ""}${message.isRead ? "" : " is-unread"}" type="button"
        data-correo-action="select-message" data-correo-message-id="${attr(message.id)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="correo-message-avatar" aria-hidden="true">${escapeHtml(initials(name || address))}</span>
        <span class="correo-message-copy">
          <span class="correo-message-line correo-message-line--top"><strong title="${attr(address)}">${escapeHtml(name)}</strong><time datetime="${attr(date)}">${escapeHtml(formatMessageTime(date, now))}</time></span>
          <span class="correo-message-subject">${escapeHtml(message.subject || "(Sin asunto)")}</span>
          <span class="correo-message-preview">${escapeHtml(message.bodyPreview || "Sin vista previa")}</span>
          <span class="correo-message-meta" aria-hidden="true">
            ${message.importance === "high" ? `<span class="correo-priority">!</span>` : ""}
            ${flagged ? `<span class="correo-mini-icon is-flagged">${icon("star")}</span>` : ""}
            ${message.hasAttachments ? `<span class="correo-mini-icon">${icon("attachment")}</span>` : ""}
            ${message.isDraft ? `<span class="correo-draft-label">Borrador</span>` : ""}
            ${message.isRead ? "" : `<span class="correo-unread-dot"></span>`}
          </span>
        </span>
      </button>`;
  }).join("");
}

function renderRecipients(label, recipients = []) {
  if (!recipients.length) return "";
  const text = recipients.map((recipient) => cleanText(recipient.name || recipient.address, "")).filter(Boolean).join(", ");
  return text ? `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(text)}</span>` : "";
}

function renderBodyText(value = "") {
  const raw = String(value ?? "").replace(/\r\n?/g, "\n");
  if (!raw.trim()) return `<p class="correo-reader-empty-body">Este mensaje no contiene texto.</p>`;
  return raw.split("\n").map((line) => line.trim() ? `<p>${escapeHtml(line)}</p>` : `<p class="correo-blank-line">&nbsp;</p>`).join("");
}

function renderAttachments(attachments = [], messageId = "") {
  if (!attachments.length) return "";
  return `
    <section class="correo-attachments" aria-label="Adjuntos">
      <h3>${icon("attachment")} Adjuntos <span>${attachments.length}</span></h3>
      <div class="correo-attachment-grid">
        ${attachments.map((item) => `
          <button class="correo-attachment" type="button" data-correo-action="download-attachment"
            data-correo-message-id="${attr(messageId)}" data-correo-attachment-id="${attr(item.id)}">
            <span>${icon("download")}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(formatBytes(item.size))}</small></span>
          </button>`).join("")}
      </div>
    </section>`;
}

export function renderReader(message = null, attachments = [], loading = false) {
  if (loading) {
    return `<div class="correo-reader-loading" aria-busy="true">${icon("spinner")}<span>Cargando mensaje…</span></div>`;
  }
  if (!message?.id) {
    return `<div class="correo-empty correo-empty--reader"><span class="correo-empty-icon">${icon("inbox")}</span><strong>Selecciona un mensaje</strong><span>Aquí aparecerá su contenido.</span></div>`;
  }

  const name = senderLabel(message);
  const address = senderAddress(message);
  const date = message.receivedDateTime || message.sentDateTime;
  const flagged = message?.flag?.flagStatus === "flagged";
  return `
    <article class="correo-reader-card" data-correo-reader-card>
      <header class="correo-reader-header">
        <div class="correo-reader-heading"><p class="correo-kicker">${message.isDraft ? "Borrador" : "Mensaje"}</p><h2>${escapeHtml(message.subject || "(Sin asunto)")}</h2></div>
        <div class="correo-reader-toolbar" aria-label="Acciones del mensaje">
          <button class="correo-icon-btn" type="button" data-correo-action="toggle-read" aria-label="${message.isRead ? "Marcar como no leído" : "Marcar como leído"}" title="${message.isRead ? "Marcar como no leído" : "Marcar como leído"}">${icon(message.isRead ? "unread" : "read")}</button>
          <button class="correo-icon-btn${flagged ? " is-active" : ""}" type="button" data-correo-action="toggle-flag" aria-label="${flagged ? "Quitar destacado" : "Destacar"}" title="${flagged ? "Quitar destacado" : "Destacar"}">${icon("star")}</button>
          <button class="correo-icon-btn" type="button" data-correo-action="move-menu" aria-label="Mover" title="Mover">${icon("folder")}</button>
          <button class="correo-icon-btn correo-icon-btn--danger" type="button" data-correo-action="delete-message" aria-label="Eliminar" title="Eliminar">${icon("trash")}</button>
        </div>
      </header>
      <div class="correo-sender">
        <span class="correo-sender-avatar" aria-hidden="true">${escapeHtml(initials(name || address))}</span>
        <span class="correo-sender-copy"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(address)}</span><small>${renderRecipients("Para", message.toRecipients)} ${renderRecipients("Cc", message.ccRecipients)}</small></span>
        <time datetime="${attr(date)}">${escapeHtml(formatLongDate(date))}</time>
      </div>
      <div class="correo-reader-scroll"><div class="correo-reader-body">${renderBodyText(message?.body?.content)}</div>${renderAttachments(attachments, message.id)}</div>
      <footer class="correo-reader-actions">
        ${message.isDraft
          ? `<button class="correo-btn correo-btn--primary" type="button" data-correo-action="send-open-draft">${icon("send")}<span>Enviar borrador</span></button>`
          : `<button class="correo-btn correo-btn--primary" type="button" data-correo-action="reply">${icon("reply")}<span>Responder</span></button><button class="correo-btn" type="button" data-correo-action="reply-all">${icon("replyAll")}<span>Responder a todos</span></button><button class="correo-btn" type="button" data-correo-action="forward">${icon("forward")}<span>Reenviar</span></button>`}
      </footer>
    </article>`;
}

function renderAccountAvatar(account = {}) {
  const src = safeImageSrc(account.avatarUrl || "");
  const label = cleanText(account.displayName || account.name, "Usuario");
  if (src) return `<img class="correo-account-avatar-img" src="${attr(src)}" alt="" loading="eager" referrerpolicy="no-referrer">`;
  return `<span class="correo-account-avatar-fallback" aria-hidden="true">${escapeHtml(account.initials || initials(label))}</span>`;
}

export function renderConnectionCard(status = {}, account = {}, notifications = {}) {
  const connected = status.connected === true;
  const healthy = status.healthy !== false;
  const label = cleanText(status.displayName || account.displayName, connected ? "Microsoft 365" : "Microsoft Outlook");
  const mailbox = cleanText(status.mailbox, "cristian@onionsupport.com");
  const notificationEnabled = notifications.enabled === true;
  const notificationSupported = notifications.supported !== false;

  return `
    <div class="correo-account-wrap${connected ? " is-connected" : ""}" data-correo-account-wrap>
      <button class="correo-account-card" type="button" data-correo-action="account-menu" aria-haspopup="menu" aria-expanded="false">
        <span class="correo-account-avatar">${renderAccountAvatar(account)}</span>
        <span class="correo-account-copy"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(mailbox)}</span></span>
        <span class="correo-account-state${connected && healthy ? " is-online" : ""}" title="${connected && healthy ? "Conectado" : "Sin conexión"}"></span>
        <span class="correo-account-chevron">${icon("chevronDown")}</span>
      </button>
      <div class="correo-account-menu" data-correo-account-menu role="menu" hidden>
        <div class="correo-account-menu-current"><span>${renderAccountAvatar(account)}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(mailbox)}</small></div></div>
        <button type="button" role="menuitem" data-correo-action="add-account">${icon("userPlus")}<span><strong>Añadir otra cuenta</strong><small>Interfaz preparada · requiere backend multicuenta</small></span></button>
        <button class="correo-account-menu-notifications${notificationEnabled ? " is-enabled" : ""}" type="button" role="menuitemcheckbox" aria-checked="${notificationEnabled ? "true" : "false"}" data-correo-action="notifications">${icon("bell")}<span><strong>${notificationEnabled ? "Notificaciones activadas" : "Activar notificaciones"}</strong><small>${notificationSupported ? "Avisos del navegador cuando llegue correo" : "Este navegador no admite notificaciones"}</small></span><i class="correo-account-menu-check" aria-hidden="true">${notificationEnabled ? icon("check") : ""}</i></button>
      </div>
    </div>`;
}

function renderBootWorkspace() {
  return `
    <section class="correo-workspace correo-workspace--boot" aria-label="Comprobando Microsoft 365" aria-busy="true">
      <aside class="correo-folders-panel"><div class="correo-boot-account"></div>${Array.from({length:7},()=>`<div class="correo-boot-line"></div>`).join("")}</aside>
      <section class="correo-list-panel"><div class="correo-boot-title"></div>${Array.from({length:7},()=>`<div class="correo-message-skeleton"><span></span><div><i></i><i></i><i></i></div></div>`).join("")}</section>
      <section class="correo-reader"><div class="correo-reader-loading">${icon("spinner")}<span>Restaurando Outlook…</span></div></section>
    </section>`;
}

export function renderShell(input = {}) {
  const status = input.status || {};
  const connected = status.connected === true;
  const pending = input.statusKnown === false;
  return `
    <section class="correo-view-root${connected ? " is-connected" : pending ? " is-booting" : " is-disconnected"}" data-correo-scope="true" data-correo-template-version="${attr(CORREO_TEMPLATE_VERSION)}">
      ${pending && !connected ? renderBootWorkspace() : connected ? renderConnectedWorkspace(input) : renderDisconnectedWorkspace(input)}
      <div class="correo-toast-stack" data-correo-toasts aria-live="polite" aria-atomic="false"></div>
      <div class="correo-modal-root" data-correo-modal-root></div>
    </section>`;
}

function renderDisconnectedWorkspace(input = {}) {
  return `
    <section class="correo-connect-stage">
      <div class="correo-connect-card">
        <span class="correo-connect-logo">${icon("mail")}</span>
        <p class="correo-kicker">Microsoft 365</p>
        <h2>Conecta Outlook</h2>
        <p>Autoriza tu cuenta Microsoft 365 para leer, responder y enviar correo desde Onion Support.</p>
        <button class="correo-btn correo-btn--primary correo-connect-cta" type="button" data-correo-action="connect" ${input.loading ? "disabled" : ""}>${input.loading ? icon("spinner") : icon("mail")}<span>${input.loading ? "Comprobando…" : "Conectar Outlook"}</span></button>
      </div>
    </section>`;
}

function renderConnectedWorkspace(input = {}) {
  const folders = input.folders || [];
  const messages = input.messages || [];
  const selectedFolderId = input.selectedFolderId || "";
  const selectedMessageId = input.selectedMessageId || "";
  const loadingMessages = input.loadingMessages === true;
  const loadingMore = input.loadingMore === true;

  return `
    <section class="correo-workspace" aria-label="Correo Microsoft 365">
      <div class="correo-sr-status" data-correo-notice role="status" aria-live="polite"><span data-correo-notice-text>Outlook conectado · ${escapeHtml(input.status?.mailbox || "Microsoft 365")}</span></div>
      <aside class="correo-folders-panel">
        <div data-correo-account-card>${renderConnectionCard(input.status, input.accountUser || {}, input.notifications || {})}</div>
        <nav class="correo-folders" aria-label="Carpetas de correo" data-correo-folders>${renderFolderRows(folders, selectedFolderId)}</nav>
        <button class="correo-disconnect-btn" type="button" data-correo-action="disconnect">${icon("logout")}<span>Desconectar cuenta</span></button>
      </aside>
      <section class="correo-list-panel" aria-label="Lista de mensajes">
        <label class="correo-search"><span class="correo-search-icon">${icon("search")}</span><input type="search" autocomplete="off" placeholder="Buscar" aria-label="Buscar en Outlook" data-correo-search value="${attr(input.searchTerm || "")}"><kbd>⌘ K</kbd></label>
        <div class="correo-list-toolbar">
          <div class="correo-filter-row" aria-label="Filtros">${filterButton("all", "Todos", input.activeFilter)}${filterButton("unread", "No leídos", input.activeFilter)}${filterButton("flagged", "Destacados", input.activeFilter)}</div>
          <div class="correo-list-utilities">
            <button class="correo-icon-btn" type="button" data-correo-action="refresh" aria-label="Actualizar" title="Actualizar">${icon("refresh")}</button>
            <button class="correo-btn correo-btn--primary correo-btn--compact" type="button" data-correo-action="compose">${icon("edit")}<span>Nuevo correo</span></button>
          </div>
        </div>
        <div class="correo-message-list" data-correo-message-list aria-busy="${loadingMessages || loadingMore ? "true" : "false"}">${loadingMessages ? renderMessageSkeletons() : renderMessageRows(messages, selectedMessageId)}${loadingMore ? `<div class="correo-infinite-loader">${icon("spinner")}<span>Cargando correos anteriores…</span></div>` : ""}</div>
        <div class="correo-infinite-sentinel" data-correo-infinite-sentinel aria-hidden="true"></div>
      </section>
      <section class="correo-reader" data-correo-reader aria-label="Lectura del mensaje">${renderReader(input.selectedMessage, input.attachments || [], input.loadingReader === true)}</section>
    </section>`;
}

function filterButton(key, label, active = "all") {
  return `<button class="correo-filter${key === active ? " is-active" : ""}" type="button" data-correo-action="filter" data-correo-filter="${attr(key)}" aria-pressed="${key === active ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function renderMessageSkeletons() {
  return Array.from({ length: 7 }, (_, index) => `<div class="correo-message-skeleton" aria-hidden="true" style="--i:${index}"><span></span><div><i></i><i></i><i></i></div></div>`).join("");
}

function parseRecipientField(value = "") {
  return String(value ?? "").split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean);
}

export function renderComposeModal(input = {}) {
  const mode = input.mode || "compose";
  const isReply = mode === "reply" || mode === "reply-all";
  const isForward = mode === "forward";
  const title = isReply ? (mode === "reply-all" ? "Responder a todos" : "Responder") : isForward ? "Reenviar" : "Nuevo correo";
  const to = parseRecipientField(input.to || "").join(", ");
  const cc = parseRecipientField(input.cc || "").join(", ");
  const subject = cleanText(input.subject, "");
  return `
    <div class="correo-modal-backdrop" data-correo-action="close-modal"></div>
    <section class="correo-compose" role="dialog" aria-modal="true" aria-labelledby="correo-compose-title">
      <header class="correo-compose-header"><h2 id="correo-compose-title">${escapeHtml(title)}</h2><button class="correo-icon-btn" type="button" data-correo-action="close-modal" aria-label="Cerrar">${icon("close")}</button></header>
      <form class="correo-compose-form" data-correo-compose-form data-correo-compose-mode="${attr(mode)}" data-correo-message-id="${attr(input.messageId || "")}">
        <div class="correo-compose-fields">
          ${isReply ? "" : `<label class="correo-field correo-field--line"><span>Para</span><input name="to" type="text" inputmode="email" autocomplete="email" placeholder="nombre@empresa.com" value="${attr(to)}" required></label><label class="correo-field correo-field--line"><span>Cc</span><input name="cc" type="text" inputmode="email" autocomplete="off" placeholder="Opcional" value="${attr(cc)}"></label>${mode === "compose" ? `<label class="correo-field correo-field--line"><span>Asunto</span><input name="subject" type="text" maxlength="998" placeholder="Agregar asunto" value="${attr(subject)}"></label>` : ""}`}
        </div>
        <label class="correo-field correo-field--body"><span class="correo-field-sr-label">${isReply ? "Respuesta" : isForward ? "Comentario" : "Mensaje"}</span><textarea name="body" rows="12" placeholder="Escribe tu mensaje…">${escapeHtml(input.body || "")}</textarea></label>
        ${mode === "compose" ? `<div class="correo-compose-attachments"><label class="correo-file-picker"><input type="file" name="attachments" multiple data-correo-attachments-input><span>${icon("paperclip")} Adjuntar</span></label><small data-correo-file-summary>Sin adjuntos</small></div>` : ""}
        <footer class="correo-compose-footer"><span class="correo-compose-status" data-correo-compose-status></span><div>${mode === "compose" ? `<button class="correo-btn" type="button" data-correo-action="save-draft">Guardar borrador</button>` : ""}<button class="correo-btn correo-btn--primary" type="submit">${icon("send")}<span>${isReply ? "Enviar" : isForward ? "Reenviar" : "Enviar"}</span></button></div></footer>
      </form>
    </section>`;
}

export function renderMoveMenu(folders = [], currentFolderId = "") {
  const destinations = folders.filter((folder) => folder.id && folder.id !== currentFolderId);
  return `<div class="correo-move-menu" role="menu"><strong>Mover a…</strong>${destinations.map((folder) => `<button type="button" role="menuitem" data-correo-action="move-to" data-correo-destination-id="${attr(folder.id)}">${icon(folderKind(folder))}<span>${escapeHtml(folder.displayName)}</span></button>`).join("")}</div>`;
}

export default renderShell;