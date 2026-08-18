/* =========================================================
   Onion Support - Correo API
   Archivo: /src/views/correo/correo.api.js

   PRODUCTIVO · MICROSOFT GRAPH VIA BACKEND ONION

   Contrato:
   - Un único cliente HTTP: core/http.js.
   - Cero tokens Microsoft en navegador.
   - OAuth siempre iniciado por /api/microsoft/connect.
   - Datos Graph normalizados por el backend.
   - Todo endpoint de correo fuerza auth Onion.
========================================================= */

import Http from "../../core/http.js";

/*
  Preferencia local por defecto: activada.
  El permiso real sigue perteneciendo al navegador y NO puede saltarse:
  si Notification.permission === "default", el usuario deberá concederlo
  una vez desde el menú de cuenta. Si ya está concedido, Correo arranca
  notificando automáticamente sin volver a exigir activación manual.
*/
const CORREO_NOTIFICATION_PREF_KEY = "onion.correo.notifications.v1";

function primeNotificationPreference() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (window.localStorage.getItem(CORREO_NOTIFICATION_PREF_KEY) === null) {
      window.localStorage.setItem(CORREO_NOTIFICATION_PREF_KEY, "1");
    }
  } catch {
    // La preferencia de UI no puede bloquear el cliente de correo.
  }
}

primeNotificationPreference();

export const CORREO_API_VERSION = "correo.api.microsoft.production.v2-default-notifications";
export const MICROSOFT_ENDPOINT = "/api/microsoft";

const DEFAULT_TIMEOUT = 20000;
const SEND_TIMEOUT = 45000;
const UPLOAD_TIMEOUT = 120000;

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function normalizeRecipient(value = null) {
  const source = safeObject(value, {});
  return Object.freeze({
    name: cleanText(source.name, ""),
    address: cleanText(source.address, "").toLowerCase(),
  });
}

function normalizeMessage(value = null) {
  const raw = safeObject(value, {});
  return Object.freeze({
    id: cleanText(raw.id, ""),
    subject: cleanText(raw.subject, "(Sin asunto)"),
    from: normalizeRecipient(raw.from),
    sender: normalizeRecipient(raw.sender),
    toRecipients: Object.freeze(safeArray(raw.toRecipients).map(normalizeRecipient)),
    ccRecipients: Object.freeze(safeArray(raw.ccRecipients).map(normalizeRecipient)),
    bccRecipients: Object.freeze(safeArray(raw.bccRecipients).map(normalizeRecipient)),
    replyTo: Object.freeze(safeArray(raw.replyTo).map(normalizeRecipient)),
    receivedDateTime: cleanText(raw.receivedDateTime, ""),
    sentDateTime: cleanText(raw.sentDateTime, ""),
    isRead: raw.isRead === true,
    isDraft: raw.isDraft === true,
    hasAttachments: raw.hasAttachments === true,
    importance: cleanText(raw.importance, "normal").toLowerCase(),
    conversationId: cleanText(raw.conversationId, ""),
    parentFolderId: cleanText(raw.parentFolderId, ""),
    internetMessageId: cleanText(raw.internetMessageId, ""),
    bodyPreview: cleanText(raw.bodyPreview, ""),
    body: Object.freeze({
      contentType: "text",
      content: String(raw?.body?.content ?? ""),
    }),
    flag: Object.freeze({
      flagStatus: cleanText(raw?.flag?.flagStatus, "notFlagged"),
    }),
    categories: Object.freeze(safeArray(raw.categories).map((item) => cleanText(item, "")).filter(Boolean)),
  });
}

function normalizeFolder(value = null) {
  const raw = safeObject(value, {});
  return Object.freeze({
    id: cleanText(raw.id, ""),
    displayName: cleanText(raw.displayName, "Carpeta"),
    parentFolderId: cleanText(raw.parentFolderId, ""),
    childFolderCount: Math.max(0, Number(raw.childFolderCount) || 0),
    totalItemCount: Math.max(0, Number(raw.totalItemCount) || 0),
    unreadItemCount: Math.max(0, Number(raw.unreadItemCount) || 0),
  });
}

function normalizeAttachment(value = null) {
  const raw = safeObject(value, {});
  return Object.freeze({
    id: cleanText(raw.id, ""),
    name: cleanText(raw.name, "Adjunto"),
    contentType: cleanText(raw.contentType, "application/octet-stream"),
    size: Math.max(0, Number(raw.size) || 0),
    isInline: raw.isInline === true,
    type: cleanText(raw.type, "attachment"),
    lastModifiedDateTime: cleanText(raw.lastModifiedDateTime, ""),
  });
}

function options(input = {}) {
  const source = safeObject(input, {});
  return {
    auth: true,
    timeout: source.timeout || DEFAULT_TIMEOUT,
    ...(source.signal ? { signal: source.signal } : {}),
  };
}

function endpoint(path = "") {
  const clean = String(path || "").replace(/^\/+/, "");
  return clean ? `${MICROSOFT_ENDPOINT}/${clean}` : MICROSOFT_ENDPOINT;
}

export async function getMicrosoftStatus(input = {}) {
  const payload = await Http.get(endpoint("status"), {
    ...options(input),
    query: input.probe === true ? { probe: "true" } : undefined,
  });

  const raw = safeObject(payload, {});
  return Object.freeze({
    connected: raw.connected === true,
    healthy: raw.healthy === undefined ? null : raw.healthy === true,
    mailbox: cleanText(raw.mailbox, ""),
    ownerEmail: cleanText(raw.ownerEmail, ""),
    displayName: cleanText(raw.displayName, ""),
    connectedAt: cleanText(raw.connectedAt, ""),
    updatedAt: cleanText(raw.updatedAt, ""),
    lastVerifiedAt: cleanText(raw.lastVerifiedAt, ""),
    scopes: Object.freeze(safeArray(raw.scopes).map((item) => cleanText(item, "")).filter(Boolean)),
    healthError: cleanText(raw.healthError, ""),
    profile: safeObject(raw.profile, null),
  });
}

export async function beginMicrosoftConnect(input = {}) {
  const payload = await Http.get(endpoint("connect"), options(input));
  const authorizationUrl = cleanText(payload?.authorizationUrl, "");
  if (!/^https:\/\/login\.microsoftonline\.com\//i.test(authorizationUrl)) {
    const error = new Error("Microsoft devolvió una URL de autorización no válida.");
    error.code = "MICROSOFT_AUTHORIZATION_URL_INVALID";
    throw error;
  }

  return Object.freeze({
    authorizationUrl,
    mailbox: cleanText(payload?.mailbox, ""),
    expiresInSeconds: Math.max(0, Number(payload?.expiresInSeconds) || 0),
  });
}

export async function disconnectMicrosoft(input = {}) {
  const payload = await Http.post(endpoint("disconnect"), {}, options(input));
  return payload?.connected === false;
}

export async function getMicrosoftProfile(input = {}) {
  const payload = await Http.get(endpoint("me"), options(input));
  return Object.freeze({
    id: cleanText(payload?.profile?.id, ""),
    displayName: cleanText(payload?.profile?.displayName, ""),
    mail: cleanText(payload?.profile?.mail, ""),
    userPrincipalName: cleanText(payload?.profile?.userPrincipalName, ""),
  });
}

export async function listMailFolders(input = {}) {
  const payload = await Http.get(endpoint("folders"), {
    ...options(input),
    query: input.includeHidden === true ? { includeHidden: "true" } : undefined,
  });
  return Object.freeze(safeArray(payload?.folders).map(normalizeFolder).filter((item) => item.id));
}

export async function listMessages(input = {}) {
  const cursor = cleanText(input.cursor, "");
  const query = cursor
    ? { cursor }
    : {
        folder: cleanText(input.folder, "inbox"),
        top: clamp(input.top, 35, 1, 100),
        ...(cleanText(input.q, "") ? { q: cleanText(input.q, "").slice(0, 160) } : {}),
        ...(cleanText(input.filter, "") ? { filter: cleanText(input.filter, "") } : {}),
      };

  const payload = await Http.get(endpoint("messages"), {
    ...options(input),
    query,
  });

  return Object.freeze({
    messages: Object.freeze(safeArray(payload?.messages).map(normalizeMessage).filter((item) => item.id)),
    nextCursor: cleanText(payload?.nextCursor, ""),
  });
}

export async function getMessage(id, input = {}) {
  const cleanId = cleanText(id, "");
  if (!cleanId) throw new Error("MAIL_MESSAGE_ID_REQUIRED");
  const payload = await Http.get(endpoint(`messages/${encodeURIComponent(cleanId)}`), options(input));
  return normalizeMessage(payload?.message);
}

export async function updateMessage(id, patch = {}, input = {}) {
  const cleanId = cleanText(id, "");
  if (!cleanId) throw new Error("MAIL_MESSAGE_ID_REQUIRED");
  const payload = await Http.patch(
    endpoint(`messages/${encodeURIComponent(cleanId)}`),
    safeObject(patch, {}),
    options(input)
  );
  return normalizeMessage(payload?.message);
}

export async function moveMessage(id, destinationId, input = {}) {
  const cleanId = cleanText(id, "");
  const destination = cleanText(destinationId, "");
  if (!cleanId || !destination) throw new Error("MAIL_MOVE_ARGUMENT_REQUIRED");
  const payload = await Http.post(
    endpoint(`messages/${encodeURIComponent(cleanId)}/move`),
    { destinationId: destination },
    options(input)
  );
  return normalizeMessage(payload?.message);
}

export async function deleteMessage(id, input = {}) {
  const cleanId = cleanText(id, "");
  if (!cleanId) throw new Error("MAIL_MESSAGE_ID_REQUIRED");
  const payload = await Http.delete(endpoint(`messages/${encodeURIComponent(cleanId)}`), options(input));
  return payload?.deleted === true;
}

function normalizeWritePayload(payload = {}) {
  const source = safeObject(payload, {});
  return {
    to: safeArray(source.to).map((item) => cleanText(item, "")).filter(Boolean),
    cc: safeArray(source.cc).map((item) => cleanText(item, "")).filter(Boolean),
    bcc: safeArray(source.bcc).map((item) => cleanText(item, "")).filter(Boolean),
    subject: cleanText(source.subject, ""),
    body: String(source.body ?? ""),
    importance: cleanText(source.importance, "normal"),
  };
}

export async function sendMessage(payload = {}, input = {}) {
  const response = await Http.post(endpoint("send"), normalizeWritePayload(payload), {
    ...options(input),
    timeout: SEND_TIMEOUT,
  });
  return response?.accepted === true;
}

export async function replyMessage(id, comment = "", input = {}) {
  const cleanId = cleanText(id, "");
  if (!cleanId) throw new Error("MAIL_MESSAGE_ID_REQUIRED");
  const response = await Http.post(
    endpoint(`messages/${encodeURIComponent(cleanId)}/reply`),
    { comment: String(comment ?? "") },
    { ...options(input), timeout: SEND_TIMEOUT }
  );
  return response?.accepted === true;
}

export async function replyAllMessage(id, comment = "", input = {}) {
  const cleanId = cleanText(id, "");
  if (!cleanId) throw new Error("MAIL_MESSAGE_ID_REQUIRED");
  const response = await Http.post(
    endpoint(`messages/${encodeURIComponent(cleanId)}/reply-all`),
    { comment: String(comment ?? "") },
    { ...options(input), timeout: SEND_TIMEOUT }
  );
  return response?.accepted === true;
}

export async function forwardMessage(id, payload = {}, input = {}) {
  const cleanId = cleanText(id, "");
  if (!cleanId) throw new Error("MAIL_MESSAGE_ID_REQUIRED");
  const response = await Http.post(
    endpoint(`messages/${encodeURIComponent(cleanId)}/forward`),
    {
      to: safeArray(payload.to).map((item) => cleanText(item, "")).filter(Boolean),
      comment: String(payload.comment ?? ""),
    },
    { ...options(input), timeout: SEND_TIMEOUT }
  );
  return response?.accepted === true;
}

export async function createDraft(payload = {}, input = {}) {
  const response = await Http.post(endpoint("drafts"), normalizeWritePayload(payload), {
    ...options(input),
    timeout: SEND_TIMEOUT,
  });
  return normalizeMessage(response?.draft);
}

export async function updateDraft(id, payload = {}, input = {}) {
  const cleanId = cleanText(id, "");
  if (!cleanId) throw new Error("MAIL_DRAFT_ID_REQUIRED");
  const response = await Http.patch(
    endpoint(`drafts/${encodeURIComponent(cleanId)}`),
    normalizeWritePayload(payload),
    { ...options(input), timeout: SEND_TIMEOUT }
  );
  return normalizeMessage(response?.draft);
}

export async function sendDraft(id, input = {}) {
  const cleanId = cleanText(id, "");
  if (!cleanId) throw new Error("MAIL_DRAFT_ID_REQUIRED");
  const response = await Http.post(
    endpoint(`drafts/${encodeURIComponent(cleanId)}/send`),
    {},
    { ...options(input), timeout: SEND_TIMEOUT }
  );
  return response?.accepted === true;
}

export async function listAttachments(messageId, input = {}) {
  const cleanId = cleanText(messageId, "");
  if (!cleanId) throw new Error("MAIL_MESSAGE_ID_REQUIRED");
  const response = await Http.get(
    endpoint(`messages/${encodeURIComponent(cleanId)}/attachments`),
    options(input)
  );
  return Object.freeze(safeArray(response?.attachments).map(normalizeAttachment).filter((item) => item.id));
}

export async function downloadAttachment(messageId, attachmentId, input = {}) {
  const cleanMessageId = cleanText(messageId, "");
  const cleanAttachmentId = cleanText(attachmentId, "");
  if (!cleanMessageId || !cleanAttachmentId) throw new Error("MAIL_ATTACHMENT_ID_REQUIRED");

  return Http.downloadBlob(
    endpoint(
      `messages/${encodeURIComponent(cleanMessageId)}/attachments/${encodeURIComponent(cleanAttachmentId)}/download`
    ),
    {
      ...options(input),
      autoDownload: input.autoDownload !== false,
      timeout: Math.max(DEFAULT_TIMEOUT, Number(input.timeout) || 60000),
    }
  );
}

export async function uploadAttachment(messageId, file, input = {}) {
  const cleanMessageId = cleanText(messageId, "");
  if (!cleanMessageId || !(file instanceof File)) throw new Error("MAIL_ATTACHMENT_REQUIRED");

  const body = new FormData();
  body.append("file", file, file.name);

  const response = await Http.post(
    endpoint(`messages/${encodeURIComponent(cleanMessageId)}/attachments`),
    body,
    {
      ...options(input),
      timeout: UPLOAD_TIMEOUT,
    }
  );

  return Object.freeze({
    attachment: normalizeAttachment(response?.attachment),
    uploadMode: cleanText(response?.uploadMode, ""),
  });
}

export const CorreoApi = Object.freeze({
  version: CORREO_API_VERSION,
  getStatus: getMicrosoftStatus,
  connect: beginMicrosoftConnect,
  disconnect: disconnectMicrosoft,
  profile: getMicrosoftProfile,
  folders: listMailFolders,
  messages: listMessages,
  message: getMessage,
  updateMessage,
  moveMessage,
  deleteMessage,
  send: sendMessage,
  reply: replyMessage,
  replyAll: replyAllMessage,
  forward: forwardMessage,
  createDraft,
  updateDraft,
  sendDraft,
  attachments: listAttachments,
  downloadAttachment,
  uploadAttachment,
});

export default CorreoApi;
