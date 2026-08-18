/* =========================================================
   Onion Support - Correo Template
   Archivo: /src/views/correo/correo.template.js

   PRODUCTIVO · OUTLOOK / MICROSOFT GRAPH

   Responsabilidad:
   - Render puro y escapado de la experiencia de correo.
   - Cero HTTP y cero estado global.
   - Sin HTML remoto: el backend entrega body de texto.
========================================================= */

export const CORREO_TEMPLATE_VERSION = "correo.template.microsoft.production.v2";

const SVG = `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;

const ICONS = Object.freeze({
  mail: `<svg ${SVG}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  inbox: `<svg ${SVG}><path d="M4 4h16v16H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></svg>`,
  star: `<svg ${SVG}><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z"/></svg>`,
  draft: `<svg ${SVG}><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>`,
  send: `<svg ${SVG}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  archive: `<svg ${SVG}><path d="M4 7h16v13H4z"/><path d="M3 3h18v4H3z"/><path d="M9 11h6"/></svg>`,
  trash: `<svg ${SVG}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 14h8l1-14"/></svg>`,
  folder: `<svg ${SVG}><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>`,
  search: `<svg ${SVG}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`,
  plus: `<svg ${SVG}><path d="M12 5v14M5 12h14"/></svg>`,
  link: `<svg ${SVG}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>`,
  unlink: `<svg ${SVG}><path d="m2 2 20 20"/><path d="M10.5 6.5 12 5a5 5 0 0 1 7 7l-1.5 1.5"/><path d="M13.5 17.5 12 19a5 5 0 0 1-7-7l1.5-1.5"/></svg>`,
  reply: `<svg ${SVG}><path d="m9 17-6-5 6-5"/><path d="M3 12h10a7 7 0 0 1 7 7"/></svg>`,
  replyAll: `<svg ${SVG}><path d="m7 16-5-4 5-4"/><path d="M2 12h10a7 7 0 0 1 7 7"/><path d="m12 8-3-2.5L12 3"/></svg>`,
  forward: `<svg ${SVG}><path d="m15 17 6-5-6-5"/><path d="M21 12H11a7 7 0 0 0-7 7"/></svg>`,
  attachment: `<svg ${SVG}><path d="m20 12.5-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 1 1 5.7 5.7l-9 9a2 2 0 1 1-2.9-2.8l8.4-8.4"/></svg>`,
  shield: `<svg ${SVG}><path d="M12 3 5 6v5c0 4.7 2.8 8.4 7 10 4.2-1.6 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  refresh: `<svg ${SVG}><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></svg>`,
  chevron: `<svg ${SVG}><path d="m9 18 6-6-6-6"/></svg>`,
  close: `<svg ${SVG}><path d="m6 6 12 12M18 6 6 18"/></svg>`,
  more: `<svg ${SVG}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></svg>`,
  read: `<svg ${SVG}><path d="M3 6h18v12H3z"/><path d="m3 8 9 6 9-6"/></svg>`,
  unread: `<svg ${SVG}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  download: `<svg ${SVG}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  paperclip: `<svg ${SVG}><path d="M21 11.5 12.5 20a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 1 1-2.9-2.8l8.4-8.4"/></svg>`,
  check: `<svg ${SVG}><path d="m5 12 4 4L19 6"/></svg>`,
  warning: `<svg ${SVG}><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>`,
  spinner: `<svg ${SVG} class="correo-spin"><circle cx="12" cy="12" r="8" opacity=".25"/><path d="M20 12a8 8 0 0 0-8-8"/></svg>`,
});

export function icon(name = "mail") {
  return ICONS[name] || ICONS.mail;
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const parts = cleanText(value, "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((item) => item[0] || "").join("").toUpperCase().slice(0, 2) || "?";
}

function senderLabel(message = {}) {
  return cleanText(
    message?.from?.name || message?.sender?.name || message?.from?.address || message?.sender?.address,
    "Remitente"
  );
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

  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date);
  }

  const delta = Math.abs(now.getTime() - date.getTime());
  if (delta < 6 * 86400000) {
    return new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(date).replace(".", "");
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("es-ES", sameYear
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "short", year: "2-digit" }).format(date);
}

export function formatLongDate(value = "") {
  const date = safeDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  if (!folders.length) {
    return `<div class="correo-mini-empty">${icon("folder")}<span>No hay carpetas disponibles.</span></div>`;
  }

  return folders.map((folder) => {
    const active = folder.id === selectedId;
    const unread = Number(folder.unreadItemCount) || 0;
    return `
      <button
        class="correo-folder${active ? " is-active" : ""}"
        type="button"
        data-correo-action="folder"
        data-correo-folder-id="${attr(folder.id)}"
        data-correo-folder-name="${attr(folder.displayName)}"
        aria-pressed="${active ? "true" : "false"}"
      >
        <span class="correo-folder-icon">${icon(folderKind(folder))}</span>
        <span class="correo-folder-copy">
          <strong>${escapeHtml(folder.displayName)}</strong>
          <small>${folder.totalItemCount} mensajes</small>
        </span>
        ${unread ? `<span class="correo-folder-count">${unread > 999 ? "999+" : unread}</span>` : ""}
      </button>
    `;
  }).join("");
}

export function renderMessageRows(messages = [], selectedId = "") {
  if (!messages.length) {
    return `
      <div class="correo-empty correo-empty--list">
        <span class="correo-empty-icon">${icon("mail")}</span>
        <strong>No hay mensajes aquí</strong>
        <span>La carpeta o el filtro actual no contiene resultados.</span>
      </div>
    `;
  }

  const now = new Date();
  return messages.map((message) => {
    const name = senderLabel(message);
    const address = senderAddress(message);
    const flagged = message?.flag?.flagStatus === "flagged";
    const selected = message.id === selectedId;
    const date = message.receivedDateTime || message.sentDateTime;
    return `
      <button
        class="correo-message-row${selected ? " is-selected" : ""}${message.isRead ? "" : " is-unread"}"
        type="button"
        data-correo-action="select-message"
        data-correo-message-id="${attr(message.id)}"
        aria-pressed="${selected ? "true" : "false"}"
      >
        <span class="correo-message-avatar" aria-hidden="true">${escapeHtml(initials(name || address))}</span>
        <span class="correo-message-copy">
          <span class="correo-message-line correo-message-line--top">
            <strong title="${attr(address)}">${escapeHtml(name)}</strong>
            <time datetime="${attr(date)}">${escapeHtml(formatMessageTime(date, now))}</time>
          </span>
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
      </button>
    `;
  }).join("");
}

function renderRecipients(label, recipients = []) {
  if (!recipients.length) return "";
  const text = recipients
    .map((recipient) => cleanText(recipient.name || recipient.address, ""))
    .filter(Boolean)
    .join(", ");
  return text ? `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(text)}</span>` : "";
}

function renderBodyText(value = "") {
  const body = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (!body) return `<p class="correo-body-empty">Este mensaje no contiene texto.</p>`;
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function renderAttachments(attachments = [], messageId = "") {
  const visible = attachments.filter((item) => item && item.id && !item.isInline);
  if (!visible.length) return "";

  return `
    <section class="correo-attachments" aria-label="Adjuntos">
      <div class="correo-section-label"><span>${icon("paperclip")}</span><strong>${visible.length} adjunto${visible.length === 1 ? "" : "s"}</strong></div>
      <div class="correo-attachment-grid">
        ${visible.map((item) => `
          <button
            class="correo-attachment"
            type="button"
            data-correo-action="download-attachment"
            data-correo-message-id="${attr(messageId)}"
            data-correo-attachment-id="${attr(item.id)}"
            title="Descargar ${attr(item.name)}"
          >
            <span class="correo-attachment-icon">${icon("attachment")}</span>
            <span class="correo-attachment-copy">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(formatBytes(item.size))} · ${escapeHtml(item.contentType)}</small>
            </span>
            <span class="correo-attachment-download">${icon("download")}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

export function renderReader(message = null, attachments = [], loading = false) {
  if (loading) {
    return `
      <div class="correo-reader-loading" aria-live="polite">
        ${icon("spinner")}<span>Abriendo mensaje…</span>
      </div>
    `;
  }

  if (!message?.id) {
    return `
      <div class="correo-empty correo-empty--reader">
        <span class="correo-empty-icon">${icon("inbox")}</span>
        <strong>Selecciona un mensaje</strong>
        <span>Aquí aparecerá el contenido completo, sus destinatarios y adjuntos.</span>
      </div>
    `;
  }

  const name = senderLabel(message);
  const address = senderAddress(message);
  const date = message.receivedDateTime || message.sentDateTime;
  const flagged = message?.flag?.flagStatus === "flagged";

  return `
    <article class="correo-reader-card" data-correo-reader-card>
      <header class="correo-reader-header">
        <div class="correo-reader-heading">
          <p class="correo-kicker">${message.isDraft ? "Borrador" : "Mensaje"}</p>
          <h2>${escapeHtml(message.subject || "(Sin asunto)")}</h2>
          <div class="correo-reader-badges">
            ${message.importance === "high" ? `<span class="correo-badge correo-badge--danger">Importante</span>` : ""}
            ${flagged ? `<span class="correo-badge correo-badge--flag">${icon("star")} Destacado</span>` : ""}
            ${message.hasAttachments ? `<span class="correo-badge">${icon("attachment")} Adjuntos</span>` : ""}
          </div>
        </div>
        <div class="correo-reader-toolbar" aria-label="Acciones del mensaje">
          <button class="correo-icon-btn" type="button" data-correo-action="toggle-read" aria-label="${message.isRead ? "Marcar como no leído" : "Marcar como leído"}" title="${message.isRead ? "Marcar como no leído" : "Marcar como leído"}">${icon(message.isRead ? "unread" : "read")}</button>
          <button class="correo-icon-btn${flagged ? " is-active" : ""}" type="button" data-correo-action="toggle-flag" aria-label="${flagged ? "Quitar destacado" : "Destacar"}" title="${flagged ? "Quitar destacado" : "Destacar"}">${icon("star")}</button>
          <button class="correo-icon-btn" type="button" data-correo-action="move-menu" aria-label="Mover" title="Mover">${icon("folder")}</button>
          <button class="correo-icon-btn correo-icon-btn--danger" type="button" data-correo-action="delete-message" aria-label="Eliminar" title="Eliminar">${icon("trash")}</button>
        </div>
      </header>

      <div class="correo-sender">
        <span class="correo-sender-avatar" aria-hidden="true">${escapeHtml(initials(name || address))}</span>
        <span class="correo-sender-copy">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(address)}</span>
          <small>${renderRecipients("Para", message.toRecipients)} ${renderRecipients("Cc", message.ccRecipients)}</small>
        </span>
        <time datetime="${attr(date)}">${escapeHtml(formatLongDate(date))}</time>
      </div>

      <div class="correo-reader-scroll">
        <div class="correo-reader-body">${renderBodyText(message?.body?.content)}</div>
        ${renderAttachments(attachments, message.id)}
      </div>

      <footer class="correo-reader-actions">
        ${message.isDraft ? `
          <button class="correo-btn correo-btn--primary" type="button" data-correo-action="send-open-draft">${icon("send")}<span>Enviar borrador</span></button>
        ` : `
          <button class="correo-btn correo-btn--primary" type="button" data-correo-action="reply">${icon("reply")}<span>Responder</span></button>
          <button class="correo-btn" type="button" data-correo-action="reply-all">${icon("replyAll")}<span>Responder a todos</span></button>
          <button class="correo-btn" type="button" data-correo-action="forward">${icon("forward")}<span>Reenviar</span></button>
        `}
      </footer>
    </article>
  `;
}

export function renderConnectionCard(status = {}) {
  const connected = status.connected === true;
  const healthy = status.healthy !== false;
  const label = cleanText(status.displayName, connected ? "Microsoft 365" : "Microsoft Outlook");
  const mailbox = cleanText(status.mailbox, "cristian@onionsupport.com");

  return `
    <div class="correo-account-card${connected ? " is-connected" : ""}">
      <span class="correo-account-logo">${icon("mail")}</span>
      <span class="correo-account-copy">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(mailbox)}</span>
      </span>
      <span class="correo-account-state${connected && healthy ? " is-online" : ""}" title="${connected && healthy ? "Conectado" : "Sin conexión"}"></span>
    </div>
  `;
}

export function renderShell(input = {}) {
  const status = input.status || {};
  const connected = status.connected === true;
  const loading = input.loading === true;

  return `
    <section
      class="correo-view-root${connected ? " is-connected" : " is-disconnected"}"
      data-correo-scope="true"
      data-correo-template-version="${attr(CORREO_TEMPLATE_VERSION)}"
    >
      <section class="correo-hero">
        <div class="correo-hero-top">
          <div class="correo-hero-copy">
            <p class="correo-kicker">Comunicaciones</p>
            <h1 class="correo-title">Correo</h1>
            <p class="correo-subtitle">Tu Outlook de Onion Support, integrado sin sacar credenciales ni tokens de Microsoft del backend.</p>
          </div>
          <div class="correo-hero-actions">
            ${connected ? `
              <button class="correo-btn" type="button" data-correo-action="refresh">${icon("refresh")}<span>Actualizar</span></button>
              <button class="correo-btn correo-btn--primary" type="button" data-correo-action="compose">${icon("plus")}<span>Nuevo correo</span></button>
            ` : `
              <button class="correo-btn correo-btn--primary" type="button" data-correo-action="connect" ${loading ? "disabled" : ""}>${loading ? icon("spinner") : icon("link")}<span>${loading ? "Comprobando…" : "Conectar Outlook"}</span></button>
            `}
          </div>
        </div>

        <div class="correo-hero-meta" aria-label="Estado del módulo">
          <span class="correo-meta-pill correo-meta-pill--brand">${icon("mail")} Microsoft 365</span>
          <span class="correo-meta-pill ${connected ? "correo-meta-pill--online" : "correo-meta-pill--offline"}"><span class="correo-status-dot"></span>${connected ? "Conectado" : "Sin conexión"}</span>
          <span class="correo-meta-pill">Graph v1.0</span>
        </div>

        <div class="correo-notice" data-correo-notice role="status" aria-live="polite">
          <span aria-hidden="true">${connected ? icon("shield") : icon("link")}</span>
          <span data-correo-notice-text>${connected
            ? `Conectado de forma segura a ${escapeHtml(status.mailbox || "Microsoft 365")}.`
            : "Conecta tu cuenta Microsoft 365 para cargar carpetas y mensajes reales."}</span>
        </div>
      </section>

      ${connected ? renderConnectedWorkspace(input) : renderDisconnectedWorkspace(input)}

      <div class="correo-toast-stack" data-correo-toasts aria-live="polite" aria-atomic="false"></div>
      <div class="correo-modal-root" data-correo-modal-root></div>
    </section>
  `;
}

function renderDisconnectedWorkspace(input = {}) {
  return `
    <section class="correo-connect-stage">
      <div class="correo-connect-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="correo-connect-card">
        <span class="correo-connect-logo">${icon("mail")}</span>
        <p class="correo-kicker">Microsoft 365</p>
        <h2>Tu bandeja, dentro de Onion.</h2>
        <p>Lectura, búsqueda, respuestas, reenvíos, borradores y adjuntos desde una única vista. La autorización se realiza en Microsoft y los tokens permanecen cifrados en el backend.</p>
        <div class="correo-connect-features">
          <span>${icon("check")} Sesión Onion obligatoria</span>
          <span>${icon("check")} OAuth con PKCE</span>
          <span>${icon("check")} Acceso exclusivo del administrador</span>
        </div>
        <button class="correo-btn correo-btn--primary correo-connect-cta" type="button" data-correo-action="connect" ${input.loading ? "disabled" : ""}>
          ${input.loading ? icon("spinner") : icon("link")}
          <span>${input.loading ? "Comprobando conexión…" : "Conectar cristian@onionsupport.com"}</span>
        </button>
      </div>
    </section>
  `;
}

function renderConnectedWorkspace(input = {}) {
  const folders = input.folders || [];
  const messages = input.messages || [];
  const selectedFolderId = input.selectedFolderId || "";
  const selectedMessageId = input.selectedMessageId || "";
  const folderName = cleanText(input.selectedFolderName, "Bandeja de entrada");
  const loadingMessages = input.loadingMessages === true;

  return `
    <section class="correo-workspace" aria-label="Correo Microsoft 365">
      <aside class="correo-folders-panel">
        <div data-correo-account-card>${renderConnectionCard(input.status)}</div>
        <nav class="correo-folders" aria-label="Carpetas de correo" data-correo-folders>
          ${renderFolderRows(folders, selectedFolderId)}
        </nav>
        <div class="correo-security-card">
          <span class="correo-security-icon">${icon("shield")}</span>
          <div>
            <strong>Conexión protegida</strong>
            <span>Microsoft Graph delegado · tokens cifrados en servidor.</span>
          </div>
          <button class="correo-text-btn" type="button" data-correo-action="disconnect">Desconectar</button>
        </div>
      </aside>

      <section class="correo-list-panel" aria-label="Lista de mensajes">
        <header class="correo-list-header">
          <div>
            <p class="correo-kicker">Carpeta</p>
            <h2 data-correo-folder-title>${escapeHtml(folderName)}</h2>
          </div>
          <span class="correo-count" data-correo-count>${messages.length} ${messages.length === 1 ? "mensaje" : "mensajes"}</span>
        </header>

        <label class="correo-search">
          <span class="correo-search-icon">${icon("search")}</span>
          <input type="search" autocomplete="off" placeholder="Buscar en Outlook…" aria-label="Buscar en Outlook" data-correo-search value="${attr(input.searchTerm || "")}">
          <kbd>⌘ K</kbd>
        </label>

        <div class="correo-filter-row" aria-label="Filtros">
          ${filterButton("all", "Todos", input.activeFilter)}
          ${filterButton("unread", "No leídos", input.activeFilter)}
          ${filterButton("flagged", "Destacados", input.activeFilter)}
        </div>

        <div class="correo-message-list" data-correo-message-list aria-busy="${loadingMessages ? "true" : "false"}">
          ${loadingMessages ? renderMessageSkeletons() : renderMessageRows(messages, selectedMessageId)}
        </div>

        <div class="correo-pagination" data-correo-pagination ${input.nextCursor ? "" : "hidden"}>
          <button class="correo-btn correo-btn--compact" type="button" data-correo-action="load-more">Cargar más</button>
        </div>
      </section>

      <section class="correo-reader" data-correo-reader aria-label="Lectura del mensaje">
        ${renderReader(input.selectedMessage, input.attachments || [], input.loadingReader === true)}
      </section>
    </section>
  `;
}

function filterButton(key, label, active = "all") {
  return `<button class="correo-filter${key === active ? " is-active" : ""}" type="button" data-correo-action="filter" data-correo-filter="${attr(key)}" aria-pressed="${key === active ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function renderMessageSkeletons() {
  return Array.from({ length: 6 }, (_, index) => `
    <div class="correo-message-skeleton" aria-hidden="true" style="--i:${index}">
      <span></span><div><i></i><i></i><i></i></div>
    </div>
  `).join("");
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
      <header class="correo-compose-header">
        <div><p class="correo-kicker">Microsoft 365</p><h2 id="correo-compose-title">${escapeHtml(title)}</h2></div>
        <button class="correo-icon-btn" type="button" data-correo-action="close-modal" aria-label="Cerrar">${icon("close")}</button>
      </header>
      <form class="correo-compose-form" data-correo-compose-form data-correo-compose-mode="${attr(mode)}" data-correo-message-id="${attr(input.messageId || "")}">
        ${isReply ? "" : `
          <label class="correo-field correo-field--line"><span>Para</span><input name="to" type="text" autocomplete="email" placeholder="nombre@empresa.com" value="${attr(to)}" ${isForward || mode === "compose" ? "required" : ""}></label>
          <label class="correo-field correo-field--line"><span>Cc</span><input name="cc" type="text" autocomplete="off" placeholder="Opcional" value="${attr(cc)}"></label>
          ${mode === "compose" ? `<label class="correo-field correo-field--line"><span>Asunto</span><input name="subject" type="text" maxlength="998" placeholder="Asunto" value="${attr(subject)}"></label>` : ""}
        `}
        <label class="correo-field correo-field--body"><span>${isReply ? "Respuesta" : isForward ? "Comentario" : "Mensaje"}</span><textarea name="body" rows="14" placeholder="Escribe tu mensaje…">${escapeHtml(input.body || "")}</textarea></label>
        ${mode === "compose" ? `
          <label class="correo-file-picker">
            <input type="file" name="attachments" multiple data-correo-attachments-input>
            <span>${icon("paperclip")} Añadir archivos</span>
            <small data-correo-file-summary>Sin adjuntos</small>
          </label>
        ` : ""}
        <footer class="correo-compose-footer">
          <span class="correo-compose-status" data-correo-compose-status></span>
          <div>
            ${mode === "compose" ? `<button class="correo-btn" type="button" data-correo-action="save-draft">Guardar borrador</button>` : ""}
            <button class="correo-btn correo-btn--primary" type="submit">${icon("send")}<span>${isReply ? "Enviar respuesta" : isForward ? "Reenviar" : "Enviar"}</span></button>
          </div>
        </footer>
      </form>
    </section>
  `;
}

export function renderMoveMenu(folders = [], currentFolderId = "") {
  const destinations = folders.filter((folder) => folder.id && folder.id !== currentFolderId);
  return `
    <div class="correo-move-menu" role="menu">
      <strong>Mover a…</strong>
      ${destinations.map((folder) => `<button type="button" role="menuitem" data-correo-action="move-to" data-correo-destination-id="${attr(folder.id)}">${icon(folderKind(folder))}<span>${escapeHtml(folder.displayName)}</span></button>`).join("")}
    </div>
  `;
}

export default renderShell;
