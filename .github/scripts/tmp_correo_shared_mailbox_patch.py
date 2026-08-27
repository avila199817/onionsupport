#!/usr/bin/env python3
from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    return text.replace(old, new, 1)

# ---------------- API ----------------
p = Path('src/views/correo/correo.api.js')
text = p.read_text(encoding='utf-8')
text = replace_once(text,
    'export const CORREO_API_VERSION = "correo.api.microsoft.production.v3-pure-http";',
    'export const CORREO_API_VERSION = "correo.api.microsoft.production.v4-mailbox-context";',
    'api version')

api_helpers = r'''
function mailboxValue(input = {}) {
  return cleanText(input?.mailbox, "").toLowerCase();
}

function withMailboxQuery(input = {}, query = {}) {
  const mailbox = mailboxValue(input);
  return {
    ...safeObject(query, {}),
    ...(mailbox ? { mailbox } : {}),
  };
}

function mailboxEndpoint(path = "", input = {}) {
  const base = endpoint(path);
  const mailbox = mailboxValue(input);
  if (!mailbox) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}mailbox=${encodeURIComponent(mailbox)}`;
}
'''
text = replace_once(text, 'function endpoint(path = "") {\n  const clean = String(path || "").replace(/^\\/+/, "");\n  return clean ? `${MICROSOFT_ENDPOINT}/${clean}` : MICROSOFT_ENDPOINT;\n}\n', 'function endpoint(path = "") {\n  const clean = String(path || "").replace(/^\\/+/, "");\n  return clean ? `${MICROSOFT_ENDPOINT}/${clean}` : MICROSOFT_ENDPOINT;\n}\n' + api_helpers, 'mailbox API helpers')

status_old = '''    scopes: Object.freeze(safeArray(raw.scopes).map((item) => cleanText(item, "")).filter(Boolean)),\n    healthError: cleanText(raw.healthError, ""),'''
status_new = '''    scopes: Object.freeze(safeArray(raw.scopes).map((item) => cleanText(item, "")).filter(Boolean)),\n    sharedScopes: Object.freeze(safeArray(raw.sharedScopes).map((item) => cleanText(item, "")).filter(Boolean)),\n    mailboxes: Object.freeze(safeArray(raw.mailboxes).map((item) => {\n      const source = safeObject(item, {});\n      return Object.freeze({\n        mailbox: cleanText(source.mailbox, "").toLowerCase(),\n        displayName: cleanText(source.displayName, cleanText(source.mailbox, "Buzón")),\n        type: cleanText(source.type, "primary").toLowerCase() === "shared" ? "shared" : "primary",\n      });\n    }).filter((item) => item.mailbox)),\n    healthError: cleanText(raw.healthError, ""),'''
text = replace_once(text, status_old, status_new, 'status mailboxes')

folders_old = '''  const payload = await Http.get(endpoint("folders"), {\n    ...options(input),\n    query: input.includeHidden === true ? { includeHidden: "true" } : undefined,\n  });'''
folders_new = '''  const payload = await Http.get(endpoint("folders"), {\n    ...options(input),\n    query: withMailboxQuery(input, input.includeHidden === true ? { includeHidden: "true" } : {}),\n  });'''
text = replace_once(text, folders_old, folders_new, 'folders mailbox query')

messages_old = '''  const query = cursor\n    ? { cursor }\n    : {\n        folder: cleanText(input.folder, "inbox"),\n        top: clamp(input.top, 35, 1, 100),\n        ...(cleanText(input.q, "") ? { q: cleanText(input.q, "").slice(0, 160) } : {}),\n        ...(cleanText(input.filter, "") ? { filter: cleanText(input.filter, "") } : {}),\n      };'''
messages_new = '''  const query = withMailboxQuery(input, cursor\n    ? { cursor }\n    : {\n        folder: cleanText(input.folder, "inbox"),\n        top: clamp(input.top, 35, 1, 100),\n        ...(cleanText(input.q, "") ? { q: cleanText(input.q, "").slice(0, 160) } : {}),\n        ...(cleanText(input.filter, "") ? { filter: cleanText(input.filter, "") } : {}),\n      });'''
text = replace_once(text, messages_old, messages_new, 'messages mailbox query')

# All mailbox-aware single-resource endpoints carry mailbox in URL query.
replacements = [
  ('Http.get(endpoint(`messages/${encodeURIComponent(cleanId)}`), options(input))', 'Http.get(mailboxEndpoint(`messages/${encodeURIComponent(cleanId)}`, input), options(input))', 'get message'),
  ('endpoint(`messages/${encodeURIComponent(cleanId)}`),\n    safeObject(patch, {})', 'mailboxEndpoint(`messages/${encodeURIComponent(cleanId)}`, input),\n    safeObject(patch, {})', 'update message'),
  ('endpoint(`messages/${encodeURIComponent(cleanId)}/move`),\n    { destinationId: destination }', 'mailboxEndpoint(`messages/${encodeURIComponent(cleanId)}/move`, input),\n    { destinationId: destination }', 'move message'),
  ('Http.delete(endpoint(`messages/${encodeURIComponent(cleanId)}`), options(input))', 'Http.delete(mailboxEndpoint(`messages/${encodeURIComponent(cleanId)}`, input), options(input))', 'delete message'),
  ('Http.post(endpoint("send"), normalizeWritePayload(payload)', 'Http.post(mailboxEndpoint("send", input), normalizeWritePayload(payload)', 'send'),
  ('endpoint(`messages/${encodeURIComponent(cleanId)}/reply`),', 'mailboxEndpoint(`messages/${encodeURIComponent(cleanId)}/reply`, input),', 'reply'),
  ('endpoint(`messages/${encodeURIComponent(cleanId)}/reply-all`),', 'mailboxEndpoint(`messages/${encodeURIComponent(cleanId)}/reply-all`, input),', 'reply all'),
  ('endpoint(`messages/${encodeURIComponent(cleanId)}/forward`),', 'mailboxEndpoint(`messages/${encodeURIComponent(cleanId)}/forward`, input),', 'forward'),
  ('Http.post(endpoint("drafts"), normalizeWritePayload(payload)', 'Http.post(mailboxEndpoint("drafts", input), normalizeWritePayload(payload)', 'create draft'),
  ('endpoint(`drafts/${encodeURIComponent(cleanId)}`),\n    normalizeWritePayload(payload)', 'mailboxEndpoint(`drafts/${encodeURIComponent(cleanId)}`, input),\n    normalizeWritePayload(payload)', 'update draft'),
  ('endpoint(`drafts/${encodeURIComponent(cleanId)}/send`),', 'mailboxEndpoint(`drafts/${encodeURIComponent(cleanId)}/send`, input),', 'send draft'),
  ('endpoint(`messages/${encodeURIComponent(cleanId)}/attachments`),\n    options(input)', 'mailboxEndpoint(`messages/${encodeURIComponent(cleanId)}/attachments`, input),\n    options(input)', 'list attachments'),
  ('`messages/${encodeURIComponent(cleanMessageId)}/attachments/${encodeURIComponent(cleanAttachmentId)}/download`\n    ),', '`messages/${encodeURIComponent(cleanMessageId)}/attachments/${encodeURIComponent(cleanAttachmentId)}/download`,\n      input\n    ),', 'download attachment'),
  ('endpoint(`messages/${encodeURIComponent(cleanMessageId)}/attachments`),\n    body,', 'mailboxEndpoint(`messages/${encodeURIComponent(cleanMessageId)}/attachments`, input),\n    body,', 'upload attachment'),
]
for old, new, label in replacements:
    text = replace_once(text, old, new, label)

# downloadAttachment function used endpoint wrapper; change outer call.
text = replace_once(text, '''  return Http.downloadBlob(\n    endpoint(\n      `messages/${encodeURIComponent(cleanMessageId)}/attachments/${encodeURIComponent(cleanAttachmentId)}/download`,\n      input\n    ),''', '''  return Http.downloadBlob(\n    mailboxEndpoint(\n      `messages/${encodeURIComponent(cleanMessageId)}/attachments/${encodeURIComponent(cleanAttachmentId)}/download`,\n      input\n    ),''', 'download mailbox endpoint wrapper')
p.write_text(text, encoding='utf-8')

# ---------------- Template ----------------
p = Path('src/views/correo/correo.template.js')
text = p.read_text(encoding='utf-8')
text = replace_once(text,
    'export const CORREO_TEMPLATE_VERSION = "correo.template.microsoft.production.v7-extreme-canonical";',
    'export const CORREO_TEMPLATE_VERSION = "correo.template.microsoft.production.v8-shared-mailbox";',
    'template version')

mailbox_helpers = r'''
function normalizeMailboxEntries(status = {}) {
  const primary = cleanText(status.mailbox, "").toLowerCase();
  const entries = Array.isArray(status.mailboxes) ? status.mailboxes : [];
  const normalized = entries.map((item) => ({
    mailbox: cleanText(item?.mailbox, "").toLowerCase(),
    displayName: cleanText(item?.displayName, cleanText(item?.mailbox, "Buzón")),
    type: cleanText(item?.type, "primary").toLowerCase() === "shared" ? "shared" : "primary",
  })).filter((item) => item.mailbox);
  if (primary && !normalized.some((item) => item.mailbox === primary)) {
    normalized.unshift({ mailbox: primary, displayName: cleanText(status.displayName, primary), type: "primary" });
  }
  return normalized;
}

function renderMailboxAvatar(mailbox = {}, account = {}, primaryMailbox = "") {
  const isPrimary = mailbox.type !== "shared" && mailbox.mailbox === primaryMailbox;
  if (isPrimary) return renderAccountAvatar(account);
  return `<span class="correo-mailbox-avatar-fallback" aria-hidden="true">${escapeHtml(initials(mailbox.displayName || mailbox.mailbox))}</span>`;
}

function renderMailboxOptions(status = {}, account = {}, activeMailbox = "") {
  const entries = normalizeMailboxEntries(status);
  if (entries.length < 2) return "";
  const primaryMailbox = cleanText(status.mailbox, "").toLowerCase();
  return `
    <div class="correo-account-menu-mailboxes" role="group" aria-label="Buzones disponibles">
      <span class="correo-account-menu-section-label">Buzones</span>
      ${entries.map((mailbox) => {
        const selected = mailbox.mailbox === activeMailbox;
        return `<button class="correo-mailbox-option${selected ? " is-selected" : ""}" type="button" role="menuitemradio" aria-checked="${selected ? "true" : "false"}" data-correo-action="mailbox" data-correo-mailbox="${attr(mailbox.mailbox)}">
          <span class="correo-mailbox-option-avatar">${renderMailboxAvatar(mailbox, account, primaryMailbox)}</span>
          <span><strong>${escapeHtml(mailbox.displayName)}</strong><small>${escapeHtml(mailbox.mailbox)}</small></span>
          <i class="correo-mailbox-option-check" aria-hidden="true">${selected ? icon("check") : ""}</i>
        </button>`;
      }).join("")}
    </div>`;
}
'''
text = replace_once(text, 'export function renderConnectionCard(status = {}, account = {}, notifications = {}) {', mailbox_helpers + '\nexport function renderConnectionCard(status = {}, account = {}, notifications = {}, activeMailbox = "") {', 'mailbox render helpers')

connection_old = '''  const connected = status.connected === true;\n  const healthy = status.healthy !== false;\n  const label = cleanText(status.displayName || account.displayName, connected ? "Microsoft 365" : "Microsoft Outlook");\n  const mailbox = cleanText(status.mailbox, "Microsoft 365");\n  const notificationEnabled = notifications.enabled === true;'''
connection_new = '''  const connected = status.connected === true;\n  const healthy = status.healthy !== false;\n  const primaryMailbox = cleanText(status.mailbox, "").toLowerCase();\n  const mailboxes = normalizeMailboxEntries(status);\n  const selectedMailbox = mailboxes.find((item) => item.mailbox === cleanText(activeMailbox, "").toLowerCase())\n    || mailboxes.find((item) => item.mailbox === primaryMailbox)\n    || { mailbox: primaryMailbox || "Microsoft 365", displayName: status.displayName || account.displayName || "Microsoft 365", type: "primary" };\n  const mailbox = cleanText(selectedMailbox.mailbox, primaryMailbox || "Microsoft 365");\n  const shared = selectedMailbox.type === "shared";\n  const label = shared\n    ? cleanText(selectedMailbox.displayName, "Soporte")\n    : cleanText(status.displayName || account.displayName, connected ? "Microsoft 365" : "Microsoft Outlook");\n  const activeAvatar = shared ? renderMailboxAvatar(selectedMailbox, account, primaryMailbox) : renderAccountAvatar(account);\n  const notificationEnabled = notifications.enabled === true;'''
text = replace_once(text, connection_old, connection_new, 'active mailbox card data')
text = replace_once(text, '<span class="correo-account-avatar">${renderAccountAvatar(account)}</span>', '<span class="correo-account-avatar${shared ? " is-shared" : ""}">${activeAvatar}</span>', 'card mailbox avatar')
text = replace_once(text, '<div class="correo-account-menu-current"><span>${renderAccountAvatar(account)}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(mailbox)}</small></div></div>', '<div class="correo-account-menu-current"><span>${activeAvatar}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(mailbox)}</small></div></div>\n        ${renderMailboxOptions(status, account, mailbox)}', 'account menu mailbox options')
p.write_text(text, encoding='utf-8')

# ---------------- Controller ----------------
p = Path('src/views/correo/index.js')
text = p.read_text(encoding='utf-8')
text = replace_once(text,
    'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v6-canonical-user";',
    'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v7-shared-mailbox";',
    'view version')
text = replace_once(text, 'const SIGNATURE_STORAGE_PREFIX = "onion.correo.signature.v1";\n', 'const SIGNATURE_STORAGE_PREFIX = "onion.correo.signature.v1";\nconst MAILBOX_PREF_STORAGE_PREFIX = "onion.correo.mailbox.v1";\n', 'mailbox pref constant')

storage_old = '''function signatureStorageKey(ownerKey = "") {\n  const owner = cleanText(ownerKey, "anonymous").toLocaleLowerCase("es-ES");\n  return `${SIGNATURE_STORAGE_PREFIX}:${encodeURIComponent(owner)}`;\n}\n'''
storage_new = '''function mailboxPreferenceKey(ownerKey = "") {\n  const owner = cleanText(ownerKey, "anonymous").toLocaleLowerCase("es-ES");\n  return `${MAILBOX_PREF_STORAGE_PREFIX}:${encodeURIComponent(owner)}`;\n}\n\nfunction readMailboxPreference(ownerKey = "") {\n  if (typeof window === "undefined") return "";\n  try { return cleanText(window.localStorage.getItem(mailboxPreferenceKey(ownerKey)), "").toLowerCase(); } catch { return ""; }\n}\n\nfunction writeMailboxPreference(ownerKey = "", mailbox = "") {\n  if (typeof window === "undefined") return false;\n  try {\n    const value = cleanText(mailbox, "").toLowerCase();\n    if (value) window.localStorage.setItem(mailboxPreferenceKey(ownerKey), value);\n    else window.localStorage.removeItem(mailboxPreferenceKey(ownerKey));\n    return true;\n  } catch { return false; }\n}\n\nfunction signatureStorageKey(ownerKey = "", mailbox = "", primaryMailbox = "") {\n  const owner = cleanText(ownerKey, "anonymous").toLocaleLowerCase("es-ES");\n  const base = `${SIGNATURE_STORAGE_PREFIX}:${encodeURIComponent(owner)}`;\n  const selected = cleanText(mailbox, "").toLowerCase();\n  const primary = cleanText(primaryMailbox, "").toLowerCase();\n  if (!selected || !primary || selected === primary) return base;\n  return `${base}:mailbox:${encodeURIComponent(selected)}`;\n}\n'''
text = replace_once(text, storage_old, storage_new, 'mailbox preference + signature key')
text = replace_once(text, 'function readSignaturePreference(ownerKey = "") {', 'function readSignaturePreference(ownerKey = "", mailbox = "", primaryMailbox = "") {', 'read signature args')
text = replace_once(text, 'window.localStorage.getItem(signatureStorageKey(ownerKey))', 'window.localStorage.getItem(signatureStorageKey(ownerKey, mailbox, primaryMailbox))', 'read signature key')
text = replace_once(text, 'function writeSignaturePreference(ownerKey = "", preference = {}) {', 'function writeSignaturePreference(ownerKey = "", mailbox = "", primaryMailbox = "", preference = {}) {', 'write signature args')
text = replace_once(text, 'window.localStorage.setItem(signatureStorageKey(ownerKey), JSON.stringify(value));', 'window.localStorage.setItem(signatureStorageKey(ownerKey, mailbox, primaryMailbox), JSON.stringify(value));', 'write signature key')

# cache fields
text = replace_once(text, '  ownerKey: "",\n  status: null,', '  ownerKey: "",\n  activeMailbox: "",\n  mailboxes: [],\n  status: null,', 'cache mailbox fields')
text = replace_once(text, '    VIEW_CACHE.ownerKey === ownerKey &&\n    VIEW_CACHE.statusKnown', '    VIEW_CACHE.ownerKey === ownerKey &&\n    (!state.activeMailbox || !VIEW_CACHE.activeMailbox || VIEW_CACHE.activeMailbox === state.activeMailbox) &&\n    VIEW_CACHE.statusKnown', 'cache mailbox validation')
text = replace_once(text, '  state.status = VIEW_CACHE.status;\n', '  state.activeMailbox = VIEW_CACHE.activeMailbox || state.activeMailbox;\n  state.mailboxes = [...VIEW_CACHE.mailboxes];\n  state.status = VIEW_CACHE.status;\n', 'cache clone mailbox')
text = replace_once(text, '  VIEW_CACHE.ownerKey = ownerKey;\n  VIEW_CACHE.status = state.status;', '  VIEW_CACHE.ownerKey = ownerKey;\n  VIEW_CACHE.activeMailbox = cleanText(state.activeMailbox, "").toLowerCase();\n  VIEW_CACHE.mailboxes = [...state.mailboxes];\n  VIEW_CACHE.status = state.status;', 'cache write mailbox')
text = replace_once(text, '  VIEW_CACHE.ownerKey = "";\n  VIEW_CACHE.status = null;', '  VIEW_CACHE.ownerKey = "";\n  VIEW_CACHE.activeMailbox = "";\n  VIEW_CACHE.mailboxes = [];\n  VIEW_CACHE.status = null;', 'cache clear mailbox')

# watcher mailbox context
text = replace_once(text, 'const result = await CorreoApi.messages({ folder: MAIL_WATCHER.inboxFolderId, top: 12 });', 'const result = await CorreoApi.messages({ mailbox: MAIL_WATCHER.mailbox, folder: MAIL_WATCHER.inboxFolderId, top: 12 });', 'watcher mailbox context')

# state initialization with persisted mailbox
state_old = '''  const state = {\n    status: Object.freeze({ connected: false, healthy: null, mailbox: "" }),\n    statusKnown: false,\n    accountUser: readOnionUser(),'''
state_new = '''  const initialAccountUser = readOnionUser();\n  const state = {\n    status: Object.freeze({ connected: false, healthy: null, mailbox: "", mailboxes: [] }),\n    statusKnown: false,\n    accountUser: initialAccountUser,\n    mailboxes: [],\n    activeMailbox: readMailboxPreference(initialAccountUser.cacheKey),'''
text = replace_once(text, state_old, state_new, 'state active mailbox')

text = replace_once(text, '  function apiOptions(extra = {}) {\n    return { signal, ...extra };\n  }', '  function apiOptions(extra = {}) {\n    const mailbox = cleanText(state.activeMailbox, "").toLowerCase();\n    return { signal, ...extra, ...(mailbox ? { mailbox } : {}) };\n  }', 'central API mailbox')
text = replace_once(text, 'target.innerHTML = renderConnectionCard(state.status, state.accountUser, state.notifications);', 'target.innerHTML = renderConnectionCard(state.status, state.accountUser, state.notifications, state.activeMailbox);', 'render active mailbox')

# resolve mailboxes on status
status_assign = '''      state.statusKnown = true;\n      state.status = next;\n      state.loading = false;'''
status_assign_new = '''      state.statusKnown = true;\n      state.status = next;\n      state.mailboxes = [...(next.mailboxes || [])];\n      const primaryMailbox = cleanText(next.mailbox, "").toLowerCase();\n      const preferredMailbox = cleanText(state.activeMailbox || readMailboxPreference(state.accountUser.cacheKey), "").toLowerCase();\n      const allowedMailboxes = state.mailboxes.map((item) => cleanText(item.mailbox, "").toLowerCase()).filter(Boolean);\n      state.activeMailbox = allowedMailboxes.includes(preferredMailbox) ? preferredMailbox : primaryMailbox;\n      if (state.activeMailbox) writeMailboxPreference(state.accountUser.cacheKey, state.activeMailbox);\n      state.loading = false;'''
text = replace_once(text, status_assign, status_assign_new, 'status mailbox resolution')

# workspace labels and shared reconnect handling
text = replace_once(text, 'notice(`Sincronizando ${state.status.mailbox || "Microsoft 365"}…`);', 'notice(`Sincronizando ${state.activeMailbox || state.status.mailbox || "Microsoft 365"}…`);', 'workspace active notice')
text = replace_once(text, '        mailbox: state.status.mailbox || "",', '        mailbox: state.activeMailbox || state.status.mailbox || "",', 'watcher active mailbox')
text = replace_once(text, '      notice(`Outlook conectado · ${state.status.mailbox || "Microsoft 365"}`, "success");', '      notice(`Outlook conectado · ${state.activeMailbox || state.status.mailbox || "Microsoft 365"}`, "success");', 'workspace active success')

catch_anchor = '''    } catch (error) {\n      if (signal.aborted) return;\n      const code = errorCode(error);\n      if (/MICROSOFT_(NOT_CONNECTED|TOKEN|CACHE|ACCOUNT)/.test(code)) {'''
catch_new = '''    } catch (error) {\n      if (signal.aborted) return;\n      const code = errorCode(error);\n      const primaryMailbox = cleanText(state.status.mailbox, "").toLowerCase();\n      const sharedSelected = Boolean(state.activeMailbox && primaryMailbox && state.activeMailbox !== primaryMailbox);\n      if (code === "MICROSOFT_RECONNECT_REQUIRED" && sharedSelected) {\n        writeMailboxPreference(state.accountUser.cacheKey, state.activeMailbox);\n        toast("Microsoft necesita confirmar una vez los permisos del buzón compartido.", "info", 5000);\n        try {\n          const connection = await CorreoApi.connect({ signal });\n          window.location.assign(connection.authorizationUrl);\n        } catch (connectError) {\n          toast(errorMessage(connectError, "No se pudo renovar el permiso Microsoft."), "error", 6000);\n        }\n        return;\n      }\n      if (/MICROSOFT_(NOT_CONNECTED|TOKEN|CACHE|ACCOUNT)/.test(code)) {'''
text = replace_once(text, catch_anchor, catch_new, 'shared reconnect flow')

# signatures by mailbox
text = replace_once(text, 'readSignaturePreference(state.accountUser.cacheKey))', 'readSignaturePreference(state.accountUser.cacheKey, state.activeMailbox, state.status.mailbox))', 'compose mailbox signature')
text = replace_once(text, 'const preference = readSignaturePreference(state.accountUser.cacheKey);', 'const preference = readSignaturePreference(state.accountUser.cacheKey, state.activeMailbox, state.status.mailbox);', 'signature settings mailbox')
text = replace_once(text, 'const saved = writeSignaturePreference(state.accountUser.cacheKey, { text: textValue, enabled });', 'const saved = writeSignaturePreference(state.accountUser.cacheKey, state.activeMailbox, state.status.mailbox, { text: textValue, enabled });', 'save mailbox signature')
text = replace_once(text, 'signatureConfigured: Boolean(readSignaturePreference(state.accountUser.cacheKey).text.trim()),', 'signatureConfigured: Boolean(readSignaturePreference(state.accountUser.cacheKey, state.activeMailbox, state.status.mailbox).text.trim()),', 'snapshot mailbox signature')

# mailbox switch function before toggleAccountMenu
mailbox_switch = r'''
  async function selectMailbox(button) {
    const mailbox = cleanText(button?.dataset?.correoMailbox, "").toLowerCase();
    if (!mailbox || mailbox === state.activeMailbox || state.busyAction) {
      closeAccountMenu();
      return;
    }
    const allowed = state.mailboxes.some((item) => cleanText(item?.mailbox, "").toLowerCase() === mailbox);
    if (!allowed) {
      toast("Ese buzón no está autorizado en Onion Correo.", "error");
      return;
    }

    closeAccountMenu();
    listSequence += 1;
    readerSequence += 1;
    listAbortController?.abort();
    readerAbortController?.abort();
    stopMailWatcher({ clear: true });

    state.activeMailbox = mailbox;
    writeMailboxPreference(state.accountUser.cacheKey, mailbox);
    state.folders = [];
    state.messages = [];
    state.selectedFolderId = "";
    state.selectedFolderName = "Bandeja de entrada";
    state.selectedMessageId = "";
    state.selectedMessage = null;
    state.attachments = [];
    state.searchTerm = "";
    state.activeFilter = "all";
    state.nextCursor = "";
    state.loadingMessages = true;
    state.loadingMore = false;
    state.loadingReader = false;
    renderAll();
    await loadWorkspace({ initial: false });
  }

'''
text = replace_once(text, '  function toggleAccountMenu(button) {', mailbox_switch + '  function toggleAccountMenu(button) {', 'mailbox switch controller')
text = replace_once(text, '    if (action === "account-menu") return toggleAccountMenu(target);\n', '    if (action === "account-menu") return toggleAccountMenu(target);\n    if (action === "mailbox") return selectMailbox(target);\n', 'mailbox click action')

# snapshot active mailbox
text = replace_once(text, '        mailbox: state.status.mailbox || "",\n        folders:', '        mailbox: state.status.mailbox || "",\n        activeMailbox: state.activeMailbox || state.status.mailbox || "",\n        mailboxCount: state.mailboxes.length,\n        folders:', 'snapshot mailbox state')
p.write_text(text, encoding='utf-8')

# ---------------- CSS ----------------
p = Path('src/css/views/correo/index.css')
text = p.read_text(encoding='utf-8')
css_anchor = '''.correo-account-menu button:hover { background:#3e3e3e; }\n.correo-account-menu button > svg { color:#c8c8c8; }'''
css_insert = '''.correo-account-menu button:hover { background:#3e3e3e; }\n.correo-account-menu button > svg { color:#c8c8c8; }\n\n.correo-account-menu-mailboxes {\n  display: grid;\n  gap: 2px;\n  padding: 6px;\n  border-block-end: 1px solid #424242;\n}\n.correo-account-menu-section-label { padding: 3px 5px 5px; color: #8f8f8f; font-size: 8.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }\n.correo-account-menu [data-correo-action="mailbox"] {\n  grid-template-columns: 30px minmax(0,1fr) 18px;\n  gap: 8px;\n  padding: 7px 8px;\n  border-radius: 5px;\n}\n.correo-account-menu [data-correo-action="mailbox"].is-selected { background: #343434; }\n.correo-mailbox-option-avatar { inline-size: 30px; block-size: 30px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; background: #0f6cbd; color: #fff; font-size: 10px; font-weight: 750; }\n.correo-mailbox-option-avatar .correo-account-avatar-img,\n.correo-mailbox-option-avatar .correo-account-avatar-fallback,\n.correo-mailbox-option-avatar .correo-mailbox-avatar-fallback { inline-size: 100%; block-size: 100%; display: grid; place-items: center; object-fit: cover; }\n.correo-mailbox-option > span:nth-child(2) { min-inline-size: 0; display: grid; gap: 1px; }\n.correo-mailbox-option strong, .correo-mailbox-option small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.correo-mailbox-option strong { color: #fff; font-size: 11px; font-weight: 650; }\n.correo-mailbox-option small { color: #9f9f9f; font-size: 9px; }\n.correo-mailbox-option-check { inline-size: 18px; block-size: 18px; display: grid; place-items: center; color: #62abf5; }\n.correo-mailbox-option-check svg { inline-size: 13px; block-size: 13px; }\n.correo-account-avatar.is-shared,\n.correo-account-menu-current > span:has(.correo-mailbox-avatar-fallback) { background: #881798; }\n.correo-mailbox-avatar-fallback { inline-size: 100%; block-size: 100%; display: grid; place-items: center; color: #fff; font-weight: 750; }'''
text = replace_once(text, css_anchor, css_insert, 'mailbox selector CSS')
p.write_text(text, encoding='utf-8')

# ---------------- Integrity contract ----------------
p = Path('.github/scripts/correo_integrity.py')
text = p.read_text(encoding='utf-8')
required_controller_anchor = '''    'CorreoApi.updateDraft(', 'draft-edit', 'routeCommitNonBlocking: true',\n):'''
required_controller_new = '''    'CorreoApi.updateDraft(', 'draft-edit', 'routeCommitNonBlocking: true',\n    'MAILBOX_PREF_STORAGE_PREFIX', 'activeMailbox', 'selectMailbox',\n    'readMailboxPreference', 'writeMailboxPreference', 'MAIL_WATCHER.mailbox',\n):'''
text = replace_once(text, required_controller_anchor, required_controller_new, 'integrity controller mailbox')
required_template_anchor = '''    'Los adjuntos existentes se conservan',\n):'''
required_template_new = '''    'Los adjuntos existentes se conservan',\n    'data-correo-action="mailbox"', 'correo-account-menu-mailboxes',\n):'''
text = replace_once(text, required_template_anchor, required_template_new, 'integrity template mailbox')
text = replace_once(text, "for required in ('export async function updateDraft(', 'updateDraft,'):", "for required in ('export async function updateDraft(', 'updateDraft,', 'withMailboxQuery', 'mailboxEndpoint', 'mailboxes: Object.freeze'):", 'integrity api mailbox')
text = replace_once(text, "for required in ('.correo-confirm-overlay', '.correo-confirm-backdrop', '.correo-confirm-dialog', '.correo-btn--danger', '.correo-field', '.correo-message-line'):", "for required in ('.correo-confirm-overlay', '.correo-confirm-backdrop', '.correo-confirm-dialog', '.correo-btn--danger', '.correo-field', '.correo-message-line', '.correo-account-menu-mailboxes', '.correo-mailbox-option'):", 'integrity CSS mailbox')
text = replace_once(text, "print(\"Correo integrity OK · canonical CSS · fixed boot geometry · polished compose CTA · account-scoped signature · abortable IO · accessible modals\")", "print(\"Correo integrity OK · canonical CSS · shared mailbox selector · mailbox-scoped signature · fixed boot geometry · abortable IO · accessible modals\")", 'integrity summary')
p.write_text(text, encoding='utf-8')

print('Correo shared mailbox selector patch applied')
