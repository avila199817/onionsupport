/* =========================================================
   Onion Support - WhatsApp Template
   Archivo: /src/views/whatsapp/whatsapp.template.js

   FULL-VIEW INBOX · CORREO PARITY · GLOBAL UI/AUTHORITY CONSUMER
   - Sin header de página: el workspace ocupa toda la vista útil.
   - Tres paneles continuos: conversaciones, hilo y ficha.
   - Sin HTTP, Router, storage ni listeners.
   - Avatar System, media sanitizer, UI controls y app-icons existentes.
========================================================= */

"use strict";

import {
  resolveAvatarPresentation,
} from "../../features/avatar-system/identity.js";
import { sanitizeRuntimeImageUrl } from "../../core/media.js";
import { cleanText as text, escapeHtml } from "../../core/presentation-text.js";


export const WHATSAPP_TEMPLATE_VERSION =
  "whatsapp.template.v2.correo-fullview";

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}



function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}



function attr(value = "") {
  return escapeHtml(text(value, ""));
}

function dateMs(value = "") {
  const parsed = Date.parse(text(value, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value = "") {
  const parsed = dateMs(value);
  if (!parsed) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(parsed));
  } catch {
    return "—";
  }
}

function formatConversationTime(value = "") {
  const parsed = dateMs(value);
  if (!parsed) return "";

  const date = new Date(parsed);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      sameDay
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "short" }
    ).format(date);
  } catch {
    return "";
  }
}

function formatPhone(value = "") {
  const digits = text(value, "").replace(/\D/g, "");
  if (!digits) return "Sin teléfono";

  if (digits.startsWith("34") && digits.length === 11) {
    const local = digits.slice(2);
    return `+34 ${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
  }

  return `+${digits}`;
}

function conversationById(items = [], id = "") {
  const target = text(id, "");
  return safeArray(items).find(
    (item) => text(item?.conversationId, "") === target
  ) || null;
}

function identityName(identity = {}) {
  const source = safeObject(identity);
  const contacto = safeObject(source.contacto);
  return text(first(
    source.displayName,
    source.fullName,
    source.name,
    source.nombre,
    source.contactoNombre,
    contacto.nombre,
    source.nombreFiscal,
    source.razonSocial,
    source.username,
    ""
  ), "");
}

function identityEmail(identity = {}) {
  const source = safeObject(identity);
  const contacto = safeObject(source.contacto);
  return text(first(
    source.email,
    source.emailLower,
    source.mail,
    source.contactoEmail,
    contacto.email,
    ""
  ), "");
}

function identityUserId(identity = {}, conversation = {}) {
  const source = safeObject(identity);
  const current = safeObject(conversation);
  return text(first(
    source.userId,
    source.usuarioId,
    source.uid,
    current.linkedEntityType === "user" ? current.linkedEntityId : "",
    ""
  ), "");
}

function identityUsername(identity = {}) {
  const source = safeObject(identity);
  return text(first(source.username, source.userName, source.slug, ""), "");
}

function identityAvatar(identity = {}) {
  const source = safeObject(identity);
  return sanitizeRuntimeImageUrl(first(
    source.avatarUrl,
    source.avatar,
    source.photoUrl,
    source.picture,
    source.imageUrl,
    ""
  ));
}

function displayName(conversation = {}, identity = {}) {
  return identityName(identity) ||
    text(conversation?.whatsappProfileName, "") ||
    formatPhone(conversation?.waId || conversation?.phone);
}

function avatarModel(conversation = {}, identity = {}) {
  const name = displayName(conversation, identity);
  const presentation = resolveAvatarPresentation({
    name,
    email: identityEmail(identity),
    userId: identityUserId(identity, conversation),
    username: identityUsername(identity),
  });
  const avatarUrl = identityAvatar(identity);

  return {
    presentation,
    avatarUrl,
    hasAvatar: Boolean(avatarUrl),
  };
}

function renderAvatar(conversation = {}, identity = {}, className = "ui-avatar") {
  const { presentation, avatarUrl, hasAvatar } = avatarModel(conversation, identity);
  return `
    <span
      class="${attr(className)}"
      data-avatar-system="true"
      data-avatar-host="true"
      data-avatar-name="${attr(presentation.name)}"
      data-avatar-email="${attr(presentation.email)}"
      data-avatar-user-id="${attr(presentation.userId)}"
      data-avatar-username="${attr(presentation.username)}"
      data-avatar-tone="${attr(String(presentation.tone))}"
      data-avatar-identity="${attr(presentation.fingerprint)}"
      data-avatar-initials="${attr(presentation.initials)}"
      data-has-avatar="${hasAvatar ? "true" : "false"}"
      aria-hidden="true"
    >
      <span data-avatar-fallback="true">${escapeHtml(presentation.initials)}</span>
      ${avatarUrl ? `<img data-avatar-image="true" src="${attr(avatarUrl)}" alt="" loading="lazy" decoding="async">` : ""}
    </span>
  `;
}

function identityLabel(conversation = {}) {
  const match = text(conversation?.identityMatch, "").toLowerCase();
  const type = text(conversation?.linkedEntityType, "").toLowerCase();

  if (match === "ambiguous") return "Coincidencia ambigua";
  if (type === "user") return "Usuario Onion";
  if (type === "cliente") return "Cliente Onion";
  return "Solo WhatsApp";
}

function identityTone(conversation = {}) {
  const match = text(conversation?.identityMatch, "").toLowerCase();
  const type = text(conversation?.linkedEntityType, "").toLowerCase();
  if (match === "ambiguous") return "warning";
  if (type === "user" || type === "cliente") return "success";
  return "neutral";
}

function metaReady(meta = {}) {
  const config = safeObject(meta?.config);
  return Boolean(
    config.verifyTokenConfigured &&
    config.signatureConfigured &&
    config.phoneNumberIdConfigured &&
    config.businessAccountIdConfigured &&
    config.outboundConfigured
  );
}

function channelState(state = {}) {
  if (state.loadingMeta === true) {
    return { key: "loading", label: "Comprobando Cloud API" };
  }
  if (metaReady(state.meta)) {
    return { key: "ready", label: "Cloud API lista" };
  }
  return { key: "pending", label: "Canal pendiente" };
}

function renderConversationRow(conversation = {}, state = {}) {
  const id = text(conversation.conversationId, "");
  const selected = id && id === text(state.selectedConversationId, "");
  const identity = safeObject(state.identities?.[id]);
  const name = displayName(conversation, identity);
  const profile = text(conversation.whatsappProfileName, "");
  const phone = formatPhone(conversation.waId || conversation.phone);
  const subtitle = identityName(identity)
    ? profile && profile !== name
      ? `WhatsApp: ${profile}`
      : phone
    : phone;

  return `
    <button
      class="whatsapp-conversation${selected ? " is-active" : ""}"
      type="button"
      data-whatsapp-action="select-conversation"
      data-conversation-id="${attr(id)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      ${renderAvatar(conversation, identity, "ui-avatar whatsapp-conversation-avatar")}
      <span class="whatsapp-conversation-copy">
        <span class="whatsapp-conversation-headline">
          <strong>${escapeHtml(name)}</strong>
          <time datetime="${attr(conversation.lastMessageAt)}">${escapeHtml(formatConversationTime(conversation.lastMessageAt))}</time>
        </span>
        <span class="whatsapp-conversation-subtitle">${escapeHtml(subtitle)}</span>
        <span class="whatsapp-conversation-meta">
          <span class="whatsapp-link-label" data-tone="${attr(identityTone(conversation))}">${escapeHtml(identityLabel(conversation))}</span>
        </span>
      </span>
    </button>
  `;
}

function renderConversationList(state = {}) {
  if (state.loadingConversations && !safeArray(state.conversations).length) {
    return `
      <div class="whatsapp-pane-state" role="status">
        <span class="ui-spinner" aria-hidden="true"></span>
        <strong>Cargando conversaciones…</strong>
        <span>Consultando la bandeja central de Onion.</span>
      </div>
    `;
  }

  if (state.errorConversations && !safeArray(state.conversations).length) {
    return `
      <div class="whatsapp-pane-state whatsapp-pane-state--error" role="alert">
        <strong>No se pudo abrir la bandeja.</strong>
        <span>${escapeHtml(state.errorConversations)}</span>
        <button class="ui-btn ui-btn-secondary" type="button" data-whatsapp-action="refresh">Reintentar</button>
      </div>
    `;
  }

  const items = safeArray(state.filteredConversations);
  if (!items.length) {
    return `
      <div class="whatsapp-pane-state">
        <span class="whatsapp-empty-icon app-icon" data-app-icon="wa" aria-hidden="true"></span>
        <strong>${state.search ? "Sin coincidencias" : "Aún no hay conversaciones"}</strong>
        <span>${state.search ? "Prueba con otro nombre o teléfono." : "Los mensajes que entren por el canal aparecerán aquí automáticamente."}</span>
      </div>
    `;
  }

  return items.map((item) => renderConversationRow(item, state)).join("");
}

function renderConversationPane(state = {}) {
  const channel = channelState(state);
  const count = safeArray(state.filteredConversations).length;

  return `
    <aside class="whatsapp-pane whatsapp-conversations-pane" data-whatsapp-panel="list">
      <div class="whatsapp-pane-head">
        <div class="whatsapp-pane-title">
          <span class="whatsapp-pane-title-icon app-icon" data-app-icon="wa" aria-hidden="true"></span>
          <span class="whatsapp-pane-title-copy">
            <span class="whatsapp-pane-kicker">Bandeja</span>
            <strong>Conversaciones</strong>
          </span>
        </div>
        <div class="whatsapp-pane-actions">
          <span
            class="whatsapp-channel-mini"
            data-state="${attr(channel.key)}"
            role="status"
            aria-label="${attr(channel.label)}"
            title="${attr(channel.label)}"
          ><span class="whatsapp-channel-mini-dot" aria-hidden="true"></span></span>
          <span class="ui-chip">${escapeHtml(String(count))}</span>
          <button
            class="ui-btn ui-btn-ghost whatsapp-refresh-button"
            type="button"
            data-whatsapp-action="refresh"
            aria-label="Actualizar conversaciones"
            title="Actualizar"
            ${state.refreshing ? "disabled aria-busy=\"true\"" : ""}
          >
            ${state.refreshing
              ? `<span class="ui-spinner" aria-hidden="true"></span>`
              : `<span class="app-icon" data-app-icon="reload" aria-hidden="true"></span>`}
          </button>
        </div>
      </div>

      <div class="whatsapp-search-wrap">
        <input
          class="ui-input whatsapp-search-input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Buscar por nombre o teléfono…"
          value="${attr(state.search)}"
          data-whatsapp-search="true"
          aria-label="Buscar conversaciones de WhatsApp"
        >
      </div>

      <div class="whatsapp-conversation-list" role="list" aria-label="Conversaciones de WhatsApp">
        ${renderConversationList(state)}
      </div>
    </aside>
  `;
}

function mediaLabel(type = "") {
  const labels = {
    image: "Imagen",
    audio: "Audio",
    video: "Vídeo",
    document: "Documento",
    location: "Ubicación",
    contacts: "Contacto",
    interactive: "Respuesta interactiva",
    button: "Botón",
    reaction: "Reacción",
  };
  return labels[text(type, "").toLowerCase()] || "Contenido";
}

function messageContent(message = {}) {
  const content = safeObject(message.content);
  const type = text(message.type || content.type, "unknown").toLowerCase();

  if (type === "text") {
    return `<p class="whatsapp-message-text">${escapeHtml(String(content.text ?? ""))}</p>`;
  }

  if (["image", "audio", "video", "document"].includes(type)) {
    const media = safeObject(content.media);
    const caption = text(media.caption, "");
    const filename = text(media.filename, "");
    return `
      <div class="whatsapp-message-rich">
        <strong>${escapeHtml(mediaLabel(type))}</strong>
        ${filename ? `<span>${escapeHtml(filename)}</span>` : ""}
        ${caption ? `<p>${escapeHtml(caption)}</p>` : ""}
      </div>
    `;
  }

  if (type === "location") {
    const location = safeObject(content.location);
    const name = text(location.name, "Ubicación compartida");
    const address = text(location.address, "");
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    const coords = Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : "";
    return `
      <div class="whatsapp-message-rich">
        <strong>${escapeHtml(name)}</strong>
        ${address ? `<span>${escapeHtml(address)}</span>` : ""}
        ${coords ? `<code>${escapeHtml(coords)}</code>` : ""}
      </div>
    `;
  }

  if (type === "contacts") {
    const count = Math.max(0, Number(content.contacts?.count) || 0);
    return `<div class="whatsapp-message-rich"><strong>Contacto compartido</strong><span>${count || 1} contacto${count === 1 ? "" : "s"}</span></div>`;
  }

  if (type === "interactive") {
    const item = safeObject(content.interactive);
    return `<div class="whatsapp-message-rich"><strong>Respuesta interactiva</strong><span>${escapeHtml(text(item.title || item.description || item.id, "Respuesta registrada"))}</span></div>`;
  }

  if (type === "button") {
    const button = safeObject(content.button);
    return `<div class="whatsapp-message-rich"><strong>Botón</strong><span>${escapeHtml(text(button.text || button.payload, "Respuesta registrada"))}</span></div>`;
  }

  if (type === "reaction") {
    const reaction = safeObject(content.reaction);
    return `<div class="whatsapp-message-rich"><strong>Reacción</strong><span class="whatsapp-reaction-emoji">${escapeHtml(text(reaction.emoji, "Reacción"))}</span></div>`;
  }

  return `<div class="whatsapp-message-rich"><strong>${escapeHtml(mediaLabel(type))}</strong><span>Contenido no disponible en esta vista.</span></div>`;
}

function statusLabel(status = "") {
  const labels = {
    accepted: "Aceptado",
    sent: "Enviado",
    delivered: "Entregado",
    read: "Leído",
    failed: "Error",
    received: "Recibido",
  };
  const key = text(status, "").toLowerCase();
  return labels[key] || text(status, "");
}

function renderMessage(message = {}) {
  const outbound = text(message.direction, "").toLowerCase() === "outbound";
  const timestamp = text(message.timestamp, "");
  const status = outbound ? statusLabel(message.status) : "";

  return `
    <article class="whatsapp-message${outbound ? " is-outbound" : " is-inbound"}" data-message-id="${attr(message.id)}">
      <div class="whatsapp-message-bubble">
        ${messageContent(message)}
        <footer class="whatsapp-message-meta">
          <time datetime="${attr(timestamp)}">${escapeHtml(formatDateTime(timestamp))}</time>
          ${status ? `<span data-status="${attr(message.status)}">${escapeHtml(status)}</span>` : ""}
        </footer>
      </div>
    </article>
  `;
}

function renderThreadBody(state = {}) {
  if (!state.selectedConversationId) {
    return `
      <div class="whatsapp-thread-placeholder">
        <span class="whatsapp-empty-icon app-icon" data-app-icon="wa" aria-hidden="true"></span>
        <strong>Selecciona una conversación</strong>
        <span>Abre un contacto de la bandeja para ver el historial y responder.</span>
      </div>
    `;
  }

  if (state.loadingMessages && !safeArray(state.messages).length) {
    return `
      <div class="whatsapp-thread-placeholder" role="status">
        <span class="ui-spinner" aria-hidden="true"></span>
        <strong>Cargando mensajes…</strong>
      </div>
    `;
  }

  if (state.errorMessages && !safeArray(state.messages).length) {
    return `
      <div class="whatsapp-thread-placeholder whatsapp-pane-state--error" role="alert">
        <strong>No se pudo cargar el historial.</strong>
        <span>${escapeHtml(state.errorMessages)}</span>
        <button class="ui-btn ui-btn-secondary" type="button" data-whatsapp-action="retry-messages">Reintentar</button>
      </div>
    `;
  }

  if (!safeArray(state.messages).length) {
    return `
      <div class="whatsapp-thread-placeholder">
        <strong>Sin mensajes</strong>
        <span>Esta conversación todavía no tiene mensajes almacenados.</span>
      </div>
    `;
  }

  return safeArray(state.messages).map(renderMessage).join("");
}

function renderThreadHeader(state = {}) {
  const conversation = conversationById(state.conversations, state.selectedConversationId);
  if (!conversation) {
    return `<div class="whatsapp-thread-head whatsapp-thread-head--empty"><strong>Conversación</strong></div>`;
  }

  const identity = safeObject(state.identities?.[conversation.conversationId]);
  const name = displayName(conversation, identity);
  const phone = formatPhone(conversation.waId || conversation.phone);

  return `
    <div class="whatsapp-thread-head">
      <button class="ui-btn ui-btn-ghost whatsapp-mobile-back" type="button" data-whatsapp-action="back-to-list" aria-label="Volver a conversaciones">Volver</button>
      ${renderAvatar(conversation, identity, "ui-avatar whatsapp-thread-avatar")}
      <div class="whatsapp-thread-contact">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(phone)}</span>
      </div>
      <span class="ui-chip whatsapp-thread-link">${escapeHtml(identityLabel(conversation))}</span>
    </div>
  `;
}

function renderComposer(state = {}) {
  const conversation = conversationById(state.conversations, state.selectedConversationId);
  if (!conversation) return "";

  const chars = String(state.draft ?? "").length;
  return `
    <form class="whatsapp-composer" data-whatsapp-composer="true">
      <label class="whatsapp-composer-label" for="whatsapp-message-input">Responder</label>
      <div class="whatsapp-composer-row">
        <textarea
          class="ui-textarea whatsapp-composer-input"
          id="whatsapp-message-input"
          rows="2"
          maxlength="4096"
          placeholder="Escribe un mensaje…"
          data-whatsapp-draft="true"
          ${state.sending ? "disabled" : ""}
        >${escapeHtml(state.draft)}</textarea>
        <button
          class="ui-btn ui-btn-primary whatsapp-send-button"
          type="submit"
          ${state.sending || !String(state.draft ?? "").trim() ? "disabled" : ""}
          aria-busy="${state.sending ? "true" : "false"}"
        >${state.sending ? "Enviando…" : "Enviar"}</button>
      </div>
      <div class="whatsapp-composer-meta">
        <span>Enter para enviar · Shift+Enter para salto de línea</span>
        <span>${escapeHtml(String(chars))} / 4096</span>
      </div>
      ${state.sendError ? `<div class="whatsapp-compose-error" role="alert">${escapeHtml(state.sendError)}</div>` : ""}
    </form>
  `;
}

function renderThreadPane(state = {}) {
  return `
    <main class="whatsapp-pane whatsapp-thread-pane" data-whatsapp-panel="thread">
      ${renderThreadHeader(state)}
      <div class="whatsapp-thread-scroll" data-whatsapp-thread-scroll="true" aria-live="polite">
        ${renderThreadBody(state)}
      </div>
      ${renderComposer(state)}
    </main>
  `;
}

function renderInfoItem(label, value) {
  return `
    <div class="whatsapp-info-item">
      <span>${escapeHtml(label)}</span>
      <strong title="${attr(value)}">${escapeHtml(value || "—")}</strong>
    </div>
  `;
}

function renderInfoPane(state = {}) {
  const conversation = conversationById(state.conversations, state.selectedConversationId);
  if (!conversation) {
    return `
      <aside class="whatsapp-pane whatsapp-info-pane" data-whatsapp-panel="info">
        <div class="whatsapp-pane-head"><div><span class="whatsapp-pane-kicker">Ficha</span><strong>Contacto</strong></div></div>
        <div class="whatsapp-pane-state"><span>Selecciona una conversación para ver su información.</span></div>
      </aside>
    `;
  }

  const identity = safeObject(state.identities?.[conversation.conversationId]);
  const canonical = identityName(identity);
  const profile = text(conversation.whatsappProfileName, "");
  const phone = formatPhone(conversation.waId || conversation.phone);

  return `
    <aside class="whatsapp-pane whatsapp-info-pane" data-whatsapp-panel="info">
      <div class="whatsapp-pane-head">
        <div><span class="whatsapp-pane-kicker">Ficha</span><strong>Contacto</strong></div>
        <span class="ui-chip">${escapeHtml(identityLabel(conversation))}</span>
      </div>

      <div class="whatsapp-contact-summary">
        ${renderAvatar(conversation, identity, "ui-avatar whatsapp-contact-avatar")}
        <strong>${escapeHtml(displayName(conversation, identity))}</strong>
        <span>${escapeHtml(phone)}</span>
        ${state.loadingIdentity ? `<small>Cargando identidad Onion…</small>` : ""}
        ${state.errorIdentity ? `<small class="whatsapp-identity-warning">${escapeHtml(state.errorIdentity)}</small>` : ""}
      </div>

      <div class="whatsapp-info-grid">
        ${renderInfoItem("Nombre Onion", canonical || (conversation.linkedEntityId ? "Resolviendo…" : "Sin vínculo"))}
        ${renderInfoItem("Perfil de WhatsApp", profile || "Sin nombre de perfil")}
        ${renderInfoItem("Teléfono", phone)}
        ${renderInfoItem("Último mensaje", formatDateTime(conversation.lastMessageAt))}
        ${renderInfoItem("Último entrante", formatDateTime(conversation.lastInboundAt))}
        ${renderInfoItem("Último saliente", formatDateTime(conversation.lastOutboundAt))}
      </div>

      <div class="whatsapp-contact-note">
        <strong>Identidad centralizada</strong>
        <span>El nombre de WhatsApp es metadato. Cuando existe vínculo exacto, Onion usa la identidad canónica del usuario o cliente.</span>
      </div>
    </aside>
  `;
}

export function renderWhatsAppInbox(input = {}) {
  const state = safeObject(input.state, input);
  const mobilePanel = text(state.mobilePanel, "list");

  return `
    <section
      class="whatsapp-page"
      data-view="whatsapp"
      data-whatsapp-phase="inbox"
      data-whatsapp-mobile-panel="${attr(mobilePanel)}"
      aria-label="WhatsApp Business"
    >
      <div class="whatsapp-workspace">
        ${renderConversationPane(state)}
        ${renderThreadPane(state)}
        ${renderInfoPane(state)}
      </div>
    </section>
  `;
}

export default renderWhatsAppInbox;
