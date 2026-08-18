/* =========================================================
   Onion Support - Correo Template
   Archivo: /src/views/correo/correo.template.js

   VISTA PREVIA · SIN OUTLOOK · SIN API · SIN DATOS REALES

   Responsabilidad:
   - Renderizar la experiencia visual del futuro módulo de correo.
   - Usar exclusivamente datos de demostración locales.
   - Mantener acciones declarativas para correo/index.js.
   - No realizar HTTP, Auth, Router, Store ni Storage.
========================================================= */

export const CORREO_TEMPLATE_VERSION =
  "correo.template.preview.v1";

const SVG_COMMON =
  `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;

const ICONS = Object.freeze({
  mail: `<svg ${SVG_COMMON}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  inbox: `<svg ${SVG_COMMON}><path d="M4 4h16v16H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></svg>`,
  star: `<svg ${SVG_COMMON}><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z"/></svg>`,
  draft: `<svg ${SVG_COMMON}><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>`,
  send: `<svg ${SVG_COMMON}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  archive: `<svg ${SVG_COMMON}><path d="M4 7h16v13H4z"/><path d="M3 3h18v4H3z"/><path d="M9 11h6"/></svg>`,
  trash: `<svg ${SVG_COMMON}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 14h8l1-14"/></svg>`,
  search: `<svg ${SVG_COMMON}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`,
  plus: `<svg ${SVG_COMMON}><path d="M12 5v14M5 12h14"/></svg>`,
  link: `<svg ${SVG_COMMON}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>`,
  reply: `<svg ${SVG_COMMON}><path d="m9 17-6-5 6-5"/><path d="M3 12h10a7 7 0 0 1 7 7"/></svg>`,
  forward: `<svg ${SVG_COMMON}><path d="m15 17 6-5-6-5"/><path d="M21 12H11a7 7 0 0 0-7 7"/></svg>`,
  attachment: `<svg ${SVG_COMMON}><path d="m20 12.5-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 1 1 5.7 5.7l-9 9a2 2 0 1 1-2.9-2.8l8.4-8.4"/></svg>`,
  shield: `<svg ${SVG_COMMON}><path d="M12 3 5 6v5c0 4.7 2.8 8.4 7 10 4.2-1.6 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  chevron: `<svg ${SVG_COMMON}><path d="m9 18 6-6-6-6"/></svg>`,
});

export const CORREO_DEMO_MESSAGES = Object.freeze([
  Object.freeze({
    id: "msg-microsoft-365",
    sender: "Microsoft 365",
    initials: "M",
    email: "billing@microsoft.example",
    subject: "Tu factura mensual está disponible",
    preview: "La factura de Microsoft 365 correspondiente a agosto ya está preparada para su consulta.",
    time: "18:42",
    unread: true,
    flagged: false,
    attachment: "Factura-M365-Agosto.pdf",
    body: [
      "Hola Cristian,",
      "La factura mensual de Microsoft 365 correspondiente a agosto ya está disponible. Esta tarjeta es únicamente una muestra visual y no contiene ningún dato recuperado de Outlook.",
      "Cuando se conecte Microsoft Graph, esta zona podrá mostrar el contenido real del mensaje y sus adjuntos.",
    ],
  }),
  Object.freeze({
    id: "msg-laura-marmoles",
    sender: "Laura · Mármoles Vallès",
    initials: "LV",
    email: "laura@cliente.example",
    subject: "Re: incidencia impresora oficina",
    preview: "Buenas tardes, después del cambio de configuración la impresora vuelve a funcionar correctamente.",
    time: "17:15",
    unread: true,
    flagged: true,
    attachment: "foto-impresora.jpg",
    body: [
      "Buenas tardes,",
      "Después del cambio de configuración la impresora vuelve a funcionar correctamente. Te adjunto una imagen para que puedas comprobar el estado final.",
      "Gracias por la ayuda.",
    ],
  }),
  Object.freeze({
    id: "msg-onion-resumen",
    sender: "Onion Support",
    initials: "ON",
    email: "soporte@onionsupport.example",
    subject: "Resumen de servicio técnico",
    preview: "Resumen interno de las actuaciones realizadas durante la jornada.",
    time: "14:08",
    unread: false,
    flagged: false,
    attachment: "",
    body: [
      "Resumen de actividad del día.",
      "Esta conversación de ejemplo permite revisar la densidad visual, jerarquía, lectura y distribución del futuro módulo de correo antes de conectar una cuenta real.",
    ],
  }),
  Object.freeze({
    id: "msg-proveedor-ssd",
    sender: "Proveedor IT",
    initials: "IT",
    email: "ventas@proveedor.example",
    subject: "Disponibilidad de SSD NVMe",
    preview: "Tenemos reposición de unidades NVMe y nuevas tarifas para pedidos de esta semana.",
    time: "Ayer",
    unread: false,
    flagged: true,
    attachment: "tarifa-nvme.pdf",
    body: [
      "Hola,",
      "Tenemos reposición de unidades NVMe y nuevas tarifas para pedidos realizados durante esta semana.",
      "El documento adjunto es una maqueta; no se descarga ni se consulta ningún recurso externo desde esta vista.",
    ],
  }),
  Object.freeze({
    id: "msg-administracion",
    sender: "Administración",
    initials: "AD",
    email: "administracion@empresa.example",
    subject: "Documentación de agosto",
    preview: "Te enviamos la relación de documentación pendiente para cerrar el mes.",
    time: "Lun",
    unread: false,
    flagged: false,
    attachment: "",
    body: [
      "Buenos días,",
      "Te enviamos la relación de documentación pendiente para cerrar el mes. Cuando exista conexión con Outlook, este panel podrá representar hilos, destinatarios y metadatos reales.",
    ],
  }),
]);

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
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

function icon(name = "mail") {
  return ICONS[name] || ICONS.mail;
}

function messageById(id = "") {
  const cleanId = cleanText(id, "");
  return CORREO_DEMO_MESSAGES.find((message) => message.id === cleanId) || CORREO_DEMO_MESSAGES[0];
}

export function renderCorreoMessageRows(
  messages = CORREO_DEMO_MESSAGES,
  selectedId = CORREO_DEMO_MESSAGES[0]?.id || ""
) {
  const safeMessages = Array.isArray(messages) ? messages : [];

  if (!safeMessages.length) {
    return `
      <div class="correo-empty" data-correo-empty="messages">
        <span class="correo-empty-icon" aria-hidden="true">${icon("search")}</span>
        <strong>Sin coincidencias</strong>
        <span>Prueba con otro remitente, asunto o palabra.</span>
      </div>
    `;
  }

  return safeMessages
    .map((message) => {
      const selected = message.id === selectedId;
      const unread = message.unread === true;

      return `
        <button
          class="correo-message-row${selected ? " is-selected" : ""}${unread ? " is-unread" : ""}"
          type="button"
          data-correo-action="select-message"
          data-correo-message-id="${attr(message.id)}"
          aria-pressed="${selected ? "true" : "false"}"
        >
          <span class="correo-message-avatar" aria-hidden="true">${escapeHtml(message.initials)}</span>
          <span class="correo-message-copy">
            <span class="correo-message-line correo-message-line--top">
              <strong>${escapeHtml(message.sender)}</strong>
              <time>${escapeHtml(message.time)}</time>
            </span>
            <span class="correo-message-subject">${escapeHtml(message.subject)}</span>
            <span class="correo-message-preview">${escapeHtml(message.preview)}</span>
            <span class="correo-message-meta" aria-hidden="true">
              ${message.flagged ? `<span class="correo-mini-icon is-flagged">${icon("star")}</span>` : ""}
              ${message.attachment ? `<span class="correo-mini-icon">${icon("attachment")}</span>` : ""}
              ${unread ? `<span class="correo-unread-dot"></span>` : ""}
            </span>
          </span>
        </button>
      `;
    })
    .join("");
}

export function renderCorreoReader(messageInput = null) {
  const message = messageInput && typeof messageInput === "object"
    ? messageInput
    : messageById(messageInput);

  const body = Array.isArray(message.body) ? message.body : [];

  return `
    <article class="correo-reader-card" data-correo-reader-card="true">
      <header class="correo-reader-header">
        <div class="correo-reader-heading">
          <p class="correo-kicker">Mensaje seleccionado</p>
          <h2>${escapeHtml(message.subject)}</h2>
        </div>
        <div class="correo-reader-toolbar" aria-label="Acciones del mensaje">
          <button class="correo-icon-btn" type="button" data-correo-action="reply" aria-label="Responder">
            ${icon("reply")}
          </button>
          <button class="correo-icon-btn" type="button" data-correo-action="forward" aria-label="Reenviar">
            ${icon("forward")}
          </button>
        </div>
      </header>

      <div class="correo-sender">
        <span class="correo-sender-avatar" aria-hidden="true">${escapeHtml(message.initials)}</span>
        <span class="correo-sender-copy">
          <strong>${escapeHtml(message.sender)}</strong>
          <span>${escapeHtml(message.email)}</span>
          <small>Para: Cristian · Cuenta Outlook pendiente de conectar</small>
        </span>
        <time>${escapeHtml(message.time)}</time>
      </div>

      <div class="correo-reader-body">
        ${body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      </div>

      ${
        message.attachment
          ? `
            <div class="correo-attachments" aria-label="Adjuntos de demostración">
              <button class="correo-attachment" type="button" data-correo-action="attachment-preview">
                <span class="correo-attachment-icon" aria-hidden="true">${icon("attachment")}</span>
                <span>
                  <strong>${escapeHtml(message.attachment)}</strong>
                  <small>Adjunto de ejemplo · no descargable</small>
                </span>
              </button>
            </div>
          `
          : ""
      }

      <footer class="correo-reader-actions">
        <button class="correo-btn correo-btn--primary" type="button" data-correo-action="reply">
          ${icon("reply")}
          <span>Responder</span>
        </button>
        <button class="correo-btn" type="button" data-correo-action="forward">
          ${icon("forward")}
          <span>Reenviar</span>
        </button>
      </footer>
    </article>
  `;
}

function folderButton({ label, iconName, count = "", active = false }) {
  return `
    <button
      class="correo-folder${active ? " is-active" : ""}"
      type="button"
      data-correo-action="folder"
      data-correo-folder="${attr(label)}"
      aria-pressed="${active ? "true" : "false"}"
    >
      <span class="correo-folder-icon" aria-hidden="true">${icon(iconName)}</span>
      <span>${escapeHtml(label)}</span>
      ${count ? `<strong>${escapeHtml(count)}</strong>` : ""}
    </button>
  `;
}

export function renderCorreoTemplate(input = {}) {
  const selectedId = cleanText(input.selectedId, CORREO_DEMO_MESSAGES[0]?.id || "");
  const selectedMessage = messageById(selectedId);

  return `
    <section
      class="correo-view-root"
      data-correo-scope="true"
      data-correo-preview="true"
      data-correo-template-version="${attr(CORREO_TEMPLATE_VERSION)}"
    >
      <section class="correo-hero">
        <div class="correo-hero-top">
          <div class="correo-hero-copy">
            <p class="correo-kicker">Comunicaciones</p>
            <h1 class="correo-title">Correo</h1>
            <p class="correo-subtitle">
              Vista preparada para Microsoft Outlook. La integración está desactivada y no se consulta ninguna cuenta real.
            </p>
          </div>

          <div class="correo-hero-actions">
            <button class="correo-btn" type="button" data-correo-action="compose">
              ${icon("plus")}
              <span>Nuevo correo</span>
            </button>
            <button class="correo-btn correo-btn--primary" type="button" data-correo-action="connect">
              ${icon("link")}
              <span>Conectar Outlook</span>
            </button>
          </div>
        </div>

        <div class="correo-hero-meta" aria-label="Estado del módulo">
          <span class="correo-meta-pill correo-meta-pill--brand">${icon("mail")} Microsoft Outlook</span>
          <span class="correo-meta-pill correo-meta-pill--offline"><span class="correo-status-dot"></span> Sin conexión</span>
          <span class="correo-meta-pill">Vista previa</span>
        </div>

        <div class="correo-notice" data-correo-notice="true" role="status" aria-live="polite">
          <span aria-hidden="true">${icon("shield")}</span>
          <span data-correo-notice-text>
            Modo diseño: los mensajes que ves son datos de ejemplo y no se realiza ninguna solicitud a Microsoft.
          </span>
        </div>
      </section>

      <section class="correo-workspace" aria-label="Vista previa de correo">
        <aside class="correo-folders-panel">
          <div class="correo-account-card">
            <span class="correo-account-logo" aria-hidden="true">${icon("mail")}</span>
            <span class="correo-account-copy">
              <strong>Microsoft Outlook</strong>
              <span>Cuenta no conectada</span>
            </span>
            <span class="correo-account-state" aria-label="Sin conexión"></span>
          </div>

          <nav class="correo-folders" aria-label="Carpetas de correo">
            ${folderButton({ label: "Bandeja de entrada", iconName: "inbox", count: "4", active: true })}
            ${folderButton({ label: "Destacados", iconName: "star" })}
            ${folderButton({ label: "Borradores", iconName: "draft", count: "2" })}
            ${folderButton({ label: "Enviados", iconName: "send" })}
            ${folderButton({ label: "Archivo", iconName: "archive" })}
            ${folderButton({ label: "Papelera", iconName: "trash" })}
          </nav>

          <div class="correo-integration-card">
            <span class="correo-integration-icon" aria-hidden="true">${icon("link")}</span>
            <div>
              <strong>Integración pendiente</strong>
              <span>OAuth y Microsoft Graph se añadirán cuando se valide esta interfaz.</span>
            </div>
          </div>
        </aside>

        <section class="correo-list-panel" aria-label="Lista de mensajes">
          <header class="correo-list-header">
            <div>
              <p class="correo-kicker">Carpeta</p>
              <h2 data-correo-folder-title>Bandeja de entrada</h2>
            </div>
            <span class="correo-count" data-correo-count>${CORREO_DEMO_MESSAGES.length} mensajes</span>
          </header>

          <label class="correo-search">
            <span class="correo-search-icon" aria-hidden="true">${icon("search")}</span>
            <input
              type="search"
              autocomplete="off"
              placeholder="Buscar en esta vista..."
              aria-label="Buscar mensajes de demostración"
              data-correo-search
            >
          </label>

          <div class="correo-filter-row" aria-label="Filtros de demostración">
            <button class="correo-filter is-active" type="button" data-correo-action="filter" data-correo-filter="todos" aria-pressed="true">Todos</button>
            <button class="correo-filter" type="button" data-correo-action="filter" data-correo-filter="no-leidos" aria-pressed="false">No leídos</button>
            <button class="correo-filter" type="button" data-correo-action="filter" data-correo-filter="adjuntos" aria-pressed="false">Adjuntos</button>
          </div>

          <div class="correo-message-list" data-correo-message-list>
            ${renderCorreoMessageRows(CORREO_DEMO_MESSAGES, selectedMessage.id)}
          </div>
        </section>

        <section class="correo-reader" data-correo-reader aria-label="Lectura del mensaje">
          ${renderCorreoReader(selectedMessage)}
        </section>
      </section>

      <footer class="correo-preview-footer">
        <span aria-hidden="true">${icon("shield")}</span>
        <span><strong>Entorno seguro de diseño.</strong> Sin tokens, sin credenciales, sin Microsoft Graph y sin envío de correo.</span>
        <span class="correo-preview-footer-arrow" aria-hidden="true">${icon("chevron")}</span>
      </footer>
    </section>
  `;
}

export default renderCorreoTemplate;
