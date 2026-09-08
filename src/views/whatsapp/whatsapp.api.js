/* =========================================================
   Onion Support - WhatsApp API Boundary
   Archivo: /src/views/whatsapp/whatsapp.api.js

   PRODUCTIVO · ONION BACKEND ONLY · V1
   - Nunca llama a Meta directamente.
   - JWT/admin lo resuelve el Core Http existente.
   - Sin storage, sockets ni estado de UI.
========================================================= */

"use strict";

import Http from "../../core/http.js";

export const WHATSAPP_API_VERSION =
  "whatsapp.api.v1.onion-backend-authority";

export const WHATSAPP_ENDPOINTS = Object.freeze({
  meta: "/api/whatsapp/_meta",
  conversations: "/api/whatsapp/conversations",
  messages: "/api/whatsapp/messages",
});

export const WHATSAPP_REQUEST_TIMEOUT_MS = 15_000;
export const WHATSAPP_MAX_TEXT_LENGTH = 4096;
export const WHATSAPP_CONVERSATION_LIMIT = 100;
export const WHATSAPP_MESSAGE_LIMIT = 200;

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "", max = 4096) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, Math.max(1, Number(max) || 4096));
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function unwrap(payload) {
  let current = payload;
  const seen = new Set();

  for (let depth = 0; depth < 6; depth += 1) {
    if (!isObject(current) || seen.has(current)) break;
    seen.add(current);

    if (
      Array.isArray(current.items) ||
      current.service === "whatsapp" ||
      current.conversationId ||
      current.metaMessageId
    ) {
      break;
    }

    const nested =
      current.data ||
      current.payload ||
      current.result ||
      current.response ||
      null;

    if (!isObject(nested)) break;
    current = nested;
  }

  return safeObject(current, {});
}

function requestError(error = null, fallback = "No se pudo comunicar con WhatsApp en Onion Support.") {
  const message = cleanText(
    error?.data?.message ||
      error?.payload?.message ||
      error?.response?.data?.message ||
      error?.response?.message ||
      error?.message ||
      error?.code ||
      fallback,
    fallback,
    500
  );

  const output = new Error(message);
  output.name = "WhatsAppApiError";
  output.code = cleanText(
    error?.code ||
      error?.data?.code ||
      error?.payload?.code ||
      error?.response?.data?.code ||
      "WHATSAPP_REQUEST_FAILED",
    "WHATSAPP_REQUEST_FAILED",
    120
  );
  output.status = Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      0
  ) || 0;
  return output;
}

function normalizeConversation(item = {}) {
  const source = safeObject(item);
  const conversationId = cleanText(source.conversationId || source.id, "", 512);
  if (!conversationId) return null;

  return Object.freeze({
    ...source,
    conversationId,
    waId: cleanText(source.waId || source.phone, "", 32),
    phone: cleanText(source.phone || source.waId, "", 32),
    whatsappProfileName: cleanText(source.whatsappProfileName, "", 256),
    lastMessageAt: cleanText(source.lastMessageAt, "", 80),
    lastInboundAt: cleanText(source.lastInboundAt, "", 80),
    lastOutboundAt: cleanText(source.lastOutboundAt, "", 80),
    linkedEntityType: cleanText(source.linkedEntityType, "", 40).toLowerCase(),
    linkedEntityId: cleanText(source.linkedEntityId, "", 180),
    linkedClienteId: cleanText(source.linkedClienteId, "", 180),
    identityMatch: cleanText(source.identityMatch, "", 40).toLowerCase(),
  });
}

function normalizeMessage(item = {}) {
  const source = safeObject(item);
  const id = cleanText(source.id || source.metaMessageId, "", 512);
  const conversationId = cleanText(source.conversationId, "", 512);
  if (!id || !conversationId) return null;

  return Object.freeze({
    ...source,
    id,
    conversationId,
    metaMessageId: cleanText(source.metaMessageId, "", 512),
    waId: cleanText(source.waId, "", 32),
    direction: cleanText(source.direction, "", 20).toLowerCase(),
    type: cleanText(source.type || source.content?.type, "unknown", 40).toLowerCase(),
    content: safeObject(source.content),
    timestamp: cleanText(source.timestamp, "", 80),
    status: cleanText(source.status, "", 40).toLowerCase(),
  });
}

export async function loadWhatsAppMeta(options = {}) {
  try {
    const response = await Http.get(WHATSAPP_ENDPOINTS.meta, {
      timeout: clampInt(options.timeout, WHATSAPP_REQUEST_TIMEOUT_MS, 1000, 60_000),
      source: cleanText(options.source, "views.whatsapp.api.meta", 120),
      signal: options.signal,
    });
    return Object.freeze(unwrap(response));
  } catch (error) {
    throw requestError(error, "No se pudo consultar la configuración de WhatsApp.");
  }
}

export async function loadWhatsAppConversations(options = {}) {
  const limit = clampInt(
    options.limit,
    WHATSAPP_CONVERSATION_LIMIT,
    1,
    200
  );

  try {
    const response = unwrap(await Http.get(WHATSAPP_ENDPOINTS.conversations, {
      timeout: clampInt(options.timeout, WHATSAPP_REQUEST_TIMEOUT_MS, 1000, 60_000),
      query: { limit },
      source: cleanText(options.source, "views.whatsapp.api.conversations", 120),
      signal: options.signal,
    }));

    const items = safeArray(response.items)
      .map(normalizeConversation)
      .filter(Boolean);

    return Object.freeze({
      ok: response.ok !== false,
      items: Object.freeze(items),
      count: items.length,
    });
  } catch (error) {
    throw requestError(error, "No se pudieron cargar las conversaciones de WhatsApp.");
  }
}

export async function loadWhatsAppMessages(conversationId = "", options = {}) {
  const id = cleanText(conversationId, "", 512);
  if (!id) {
    const error = new Error("Falta la conversación de WhatsApp.");
    error.code = "WHATSAPP_CONVERSATION_REQUIRED";
    throw error;
  }

  const limit = clampInt(options.limit, WHATSAPP_MESSAGE_LIMIT, 1, 200);

  try {
    const response = unwrap(await Http.get(
      `/api/whatsapp/conversations/${encodeURIComponent(id)}/messages`,
      {
        timeout: clampInt(options.timeout, WHATSAPP_REQUEST_TIMEOUT_MS, 1000, 60_000),
        query: { limit },
        source: cleanText(options.source, "views.whatsapp.api.messages", 120),
        signal: options.signal,
      }
    ));

    const items = safeArray(response.items)
      .map(normalizeMessage)
      .filter(Boolean);

    return Object.freeze({
      ok: response.ok !== false,
      conversationId: cleanText(response.conversationId, id, 512),
      items: Object.freeze(items),
      count: items.length,
    });
  } catch (error) {
    throw requestError(error, "No se pudieron cargar los mensajes de WhatsApp.");
  }
}

export async function sendWhatsAppText({
  to = "",
  text = "",
  idempotencyKey = "",
  signal = undefined,
  timeout = WHATSAPP_REQUEST_TIMEOUT_MS,
} = {}) {
  const recipient = cleanText(to, "", 32).replace(/\D/g, "");
  const bodyText = String(text ?? "").replace(/\r\n/g, "\n").trim();
  const key = cleanText(idempotencyKey, "", 256);

  if (!recipient) {
    const error = new Error("El destinatario de WhatsApp no es válido.");
    error.code = "WHATSAPP_RECIPIENT_REQUIRED";
    throw error;
  }

  if (!bodyText) {
    const error = new Error("Escribe un mensaje antes de enviarlo.");
    error.code = "WHATSAPP_TEXT_REQUIRED";
    throw error;
  }

  if (bodyText.length > WHATSAPP_MAX_TEXT_LENGTH) {
    const error = new Error(`El mensaje supera ${WHATSAPP_MAX_TEXT_LENGTH} caracteres.`);
    error.code = "WHATSAPP_TEXT_TOO_LONG";
    throw error;
  }

  if (!key) {
    const error = new Error("No se pudo crear la clave segura del mensaje.");
    error.code = "WHATSAPP_IDEMPOTENCY_REQUIRED";
    throw error;
  }

  try {
    const response = unwrap(await Http.post(
      WHATSAPP_ENDPOINTS.messages,
      {
        to: recipient,
        text: bodyText,
        clientMessageId: key,
      },
      {
        timeout: clampInt(timeout, WHATSAPP_REQUEST_TIMEOUT_MS, 1000, 60_000),
        headers: { "Idempotency-Key": key },
        source: "views.whatsapp.api.send",
        signal,
      }
    ));

    return Object.freeze({
      ...response,
      ok: response.ok !== false,
      success: response.success !== false,
      duplicate: response.duplicate === true,
      conversationId: cleanText(response.conversationId, "", 512),
      metaMessageId: cleanText(response.metaMessageId, "", 512),
    });
  } catch (error) {
    throw requestError(error, "No se pudo enviar el mensaje de WhatsApp.");
  }
}

export default Object.freeze({
  version: WHATSAPP_API_VERSION,
  endpoints: WHATSAPP_ENDPOINTS,
  loadMeta: loadWhatsAppMeta,
  loadConversations: loadWhatsAppConversations,
  loadMessages: loadWhatsAppMessages,
  sendText: sendWhatsAppText,
});
