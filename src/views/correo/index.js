/* =========================================================
   Onion Support - Correo View
   Archivo: /src/views/correo/index.js

   PRODUCTIVO · MICROSOFT 365 · OUTLOOK EXTREME
   - Cache efímera entre rutas: cero flash "desconectado".
   - Scroll infinito con nextCursor.
   - Notificaciones del navegador mientras Onion esté abierto.
   - Compose corregido: captura FormData ANTES de deshabilitar campos.
   - Avatar Onion en selector de cuenta.
========================================================= */

import { AppCore } from "../../core/index.js";
import { sanitizeRuntimeImageUrl } from "../../core/media.js";
import { Auth as DefaultAuth } from "../../features/auth/index.js";
import CorreoApi from "./correo.api.js";
import {
  CORREO_TEMPLATE_VERSION,
  escapeHtml,
  formatBytes,
  icon,
  renderComposeModal,
  renderConfirmModal,
  renderConnectionCard,
  renderFolderRows,
  renderMessageRows,
  renderMoveMenu,
  renderReader,
  renderShell,
} from "./correo.template.js";

export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v6-canonical-user";

const INSTANCES = new WeakMap();
let lastInstance = null;

const NOTIFICATION_PREF_KEY = "onion.correo.notifications.v1";
const NOTIFICATION_POLL_MS = 60000;
const MAX_NOTIFICATION_IDS = 80;
const VIEW_CACHE_TTL_MS = 60_000;

function primeNotificationPreference() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (window.localStorage.getItem(NOTIFICATION_PREF_KEY) === null) {
      window.localStorage.setItem(NOTIFICATION_PREF_KEY, "1");
    }
  } catch {
    // La preferencia de UI no puede bloquear Correo.
  }
}

primeNotificationPreference();

const VIEW_CACHE = {
  ownerKey: "",
  status: null,
  statusKnown: false,
  folders: [],
  messages: [],
  selectedFolderId: "",
  selectedFolderName: "Bandeja de entrada",
  selectedMessageId: "",
  selectedMessage: null,
  attachments: [],
  searchTerm: "",
  activeFilter: "all",
  nextCursor: "",
  cachedAt: 0,
};

const MAIL_WATCHER = {
  timer: null,
  inboxFolderId: "",
  mailbox: "",
  knownIds: new Set(),
  seeded: false,
  polling: false,
  consecutiveErrors: 0,
};

function isDomNode(value = null) {
  return Boolean(typeof Node !== "undefined" && value && value instanceof Node);
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return output || fallback;
}

function safeLower(value = "") {
  return cleanText(value, "").toLocaleLowerCase("es-ES");
}

function errorMessage(error = null, fallback = "No se pudo completar la operación.") {
  return cleanText(error?.message || error?.data?.message || error?.response?.message || error?.code, fallback);
}

function errorCode(error = null) {
  return cleanText(error?.code || error?.data?.code || error?.data?.error, "");
}

function folderRank(folder = {}) {
  const name = safeLower(folder.displayName);
  if (/entrada|inbox/.test(name)) return 10;
  if (/borrador|draft/.test(name)) return 20;
  if (/enviado|sent/.test(name)) return 30;
  if (/archivo|archive/.test(name)) return 40;
  if (/eliminad|papelera|deleted|trash/.test(name)) return 50;
  if (/no deseado|junk|spam/.test(name)) return 60;
  return 100;
}

function sortFolders(folders = []) {
  return [...folders].sort((a, b) => {
    const rank = folderRank(a) - folderRank(b);
    if (rank) return rank;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""), "es");
  });
}

function findInbox(folders = []) {
  return folders.find((folder) => /entrada|inbox/.test(safeLower(folder.displayName))) || folders[0] || null;
}

function parseRecipients(value = "") {
  return [...new Set(String(value ?? "").split(/[;,\n]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function isLikelyEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function initialsFrom(value = "") {
  return cleanText(value, "ON").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("").slice(0, 2) || "ON";
}

function readOnionUser() {
  let raw = null;

  try {
    raw =
      AppCore?.getCurrentUser?.() ||
      AppCore?.getState?.()?.user ||
      AppCore?.state?.user ||
      DefaultAuth?.getUser?.() ||
      DefaultAuth?.getCurrentUser?.() ||
      null;
  } catch {
    raw = null;
  }

  let user = null;

  try {
    user = AppCore?.publicUser?.(raw) || null;
  } catch {
    user = null;
  }

  const displayName = cleanText(user?.displayName, "Usuario");
  const avatarUrl = sanitizeRuntimeImageUrl(user?.avatarUrl || "");
  const cacheKey = cleanText(
    raw?.id || raw?.userId || raw?.email || raw?.mail || raw?.sub ||
      user?.id || user?.userId || user?.email || user?.mail || displayName,
    "anonymous"
  ).toLocaleLowerCase("es-ES");

  return Object.freeze({
    displayName,
    avatarUrl,
    initials: initialsFrom(displayName),
    cacheKey,
  });
}

function cloneCacheIntoState(state, ownerKey = "") {
  const age = VIEW_CACHE.cachedAt > 0 ? Date.now() - VIEW_CACHE.cachedAt : Number.POSITIVE_INFINITY;
  const valid = Boolean(
    ownerKey &&
    VIEW_CACHE.ownerKey === ownerKey &&
    VIEW_CACHE.statusKnown &&
    VIEW_CACHE.status &&
    age >= 0 &&
    age <= VIEW_CACHE_TTL_MS
  );
  if (!valid) {
    if (VIEW_CACHE.cachedAt || VIEW_CACHE.ownerKey) clearViewCache();
    return;
  }
  state.status = VIEW_CACHE.status;
  state.statusKnown = true;
  state.folders = [...VIEW_CACHE.folders];
  state.messages = [...VIEW_CACHE.messages];
  state.selectedFolderId = VIEW_CACHE.selectedFolderId;
  state.selectedFolderName = VIEW_CACHE.selectedFolderName;
  state.selectedMessageId = VIEW_CACHE.selectedMessageId;
  state.selectedMessage = VIEW_CACHE.selectedMessage;
  state.attachments = [...VIEW_CACHE.attachments];
  state.searchTerm = VIEW_CACHE.searchTerm;
  state.activeFilter = VIEW_CACHE.activeFilter;
  state.nextCursor = VIEW_CACHE.nextCursor;
  state.loading = false;
}

function writeViewCache(state) {
  const ownerKey = cleanText(state?.accountUser?.cacheKey, "");
  if (!ownerKey) return;
  VIEW_CACHE.ownerKey = ownerKey;
  VIEW_CACHE.status = state.status;
  VIEW_CACHE.statusKnown = state.statusKnown === true;
  VIEW_CACHE.folders = [...state.folders];
  VIEW_CACHE.messages = [...state.messages];
  VIEW_CACHE.selectedFolderId = state.selectedFolderId;
  VIEW_CACHE.selectedFolderName = state.selectedFolderName;
  VIEW_CACHE.selectedMessageId = state.selectedMessageId;
  VIEW_CACHE.selectedMessage = state.selectedMessage;
  VIEW_CACHE.attachments = [...state.attachments];
  VIEW_CACHE.searchTerm = state.searchTerm;
  VIEW_CACHE.activeFilter = state.activeFilter;
  VIEW_CACHE.nextCursor = state.nextCursor;
  VIEW_CACHE.cachedAt = Date.now();
}

function clearViewCache() {
  VIEW_CACHE.ownerKey = "";
  VIEW_CACHE.status = null;
  VIEW_CACHE.statusKnown = false;
  VIEW_CACHE.folders = [];
  VIEW_CACHE.messages = [];
  VIEW_CACHE.selectedFolderId = "";
  VIEW_CACHE.selectedFolderName = "Bandeja de entrada";
  VIEW_CACHE.selectedMessageId = "";
  VIEW_CACHE.selectedMessage = null;
  VIEW_CACHE.attachments = [];
  VIEW_CACHE.searchTerm = "";
  VIEW_CACHE.activeFilter = "all";
  VIEW_CACHE.nextCursor = "";
  VIEW_CACHE.cachedAt = 0;
}

function notificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

function notificationPreference() {
  if (!notificationSupported()) return false;
  try {
    return window.localStorage.getItem(NOTIFICATION_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function setNotificationPreference(enabled) {
  try {
    if (enabled) window.localStorage.setItem(NOTIFICATION_PREF_KEY, "1");
    else window.localStorage.removeItem(NOTIFICATION_PREF_KEY);
  } catch {
    // La preferencia no es crítica.
  }
}

function notificationUiState() {
  return Object.freeze({
    supported: notificationSupported(),
    permission: notificationSupported() ? Notification.permission : "unsupported",
    enabled: notificationSupported() && Notification.permission === "granted" && notificationPreference(),
  });
}

function rememberNotificationIds(messages = []) {
  for (const message of messages) {
    if (message?.id) MAIL_WATCHER.knownIds.add(message.id);
  }
  if (MAIL_WATCHER.knownIds.size > MAX_NOTIFICATION_IDS) {
    MAIL_WATCHER.knownIds = new Set([...MAIL_WATCHER.knownIds].slice(-MAX_NOTIFICATION_IDS));
  }
}

function stopMailWatcher({ clear = false } = {}) {
  if (MAIL_WATCHER.timer) clearTimeout(MAIL_WATCHER.timer);
  MAIL_WATCHER.timer = null;
  MAIL_WATCHER.polling = false;
  MAIL_WATCHER.consecutiveErrors = 0;
  if (clear) {
    MAIL_WATCHER.inboxFolderId = "";
    MAIL_WATCHER.mailbox = "";
    MAIL_WATCHER.knownIds.clear();
    MAIL_WATCHER.seeded = false;
  }
}

function scheduleMailWatcher(delay = NOTIFICATION_POLL_MS) {
  if (!notificationUiState().enabled || !MAIL_WATCHER.inboxFolderId) return;
  if (MAIL_WATCHER.timer) clearTimeout(MAIL_WATCHER.timer);
  MAIL_WATCHER.timer = setTimeout(pollMailWatcher, delay);
}

function showBrowserNotification(message = {}) {
  if (!notificationUiState().enabled) return;
  const sender = cleanText(message?.from?.name || message?.from?.address || message?.sender?.name || message?.sender?.address, "Nuevo correo");
  const subject = cleanText(message?.subject, "(Sin asunto)");
  const preview = cleanText(message?.bodyPreview, "");
  try {
    const notification = new Notification(sender, {
      body: preview ? `${subject}\n${preview}` : subject,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: `onion-mail-${message.id || Date.now()}`,
      renotify: false,
    });
    notification.onclick = () => {
      try {
        window.focus();
        if (window.location.pathname !== "/correo") window.location.assign("/correo");
      } catch {
        // noop
      }
      notification.close();
    };
  } catch {
    // No bloquear correo por una notificación del SO.
  }
}

async function pollMailWatcher() {
  if (MAIL_WATCHER.polling || !notificationUiState().enabled || !MAIL_WATCHER.inboxFolderId) return;
  MAIL_WATCHER.polling = true;
  try {
    const result = await CorreoApi.messages({ folder: MAIL_WATCHER.inboxFolderId, top: 12 });
    const messages = result.messages || [];
    if (!MAIL_WATCHER.seeded) {
      rememberNotificationIds(messages);
      MAIL_WATCHER.seeded = true;
    } else {
      const fresh = messages.filter((message) => message.id && !MAIL_WATCHER.knownIds.has(message.id));
      rememberNotificationIds(messages);
      [...fresh].reverse().forEach(showBrowserNotification);
      if (fresh.length && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("onion:correo-new-message", { detail: { count: fresh.length } }));
      }
    }
    MAIL_WATCHER.consecutiveErrors = 0;
  } catch {
    MAIL_WATCHER.consecutiveErrors += 1;
    if (MAIL_WATCHER.consecutiveErrors >= 5) {
      stopMailWatcher();
      return;
    }
  } finally {
    MAIL_WATCHER.polling = false;
    scheduleMailWatcher();
  }
}

function configureMailWatcher({ inboxFolderId = "", mailbox = "", seedMessages = [] } = {}) {
  if (!notificationUiState().enabled || !inboxFolderId) {
    stopMailWatcher();
    return;
  }
  const accountChanged = MAIL_WATCHER.inboxFolderId !== inboxFolderId || MAIL_WATCHER.mailbox !== mailbox;
  MAIL_WATCHER.inboxFolderId = inboxFolderId;
  MAIL_WATCHER.mailbox = mailbox;
  if (accountChanged) {
    MAIL_WATCHER.knownIds.clear();
    MAIL_WATCHER.seeded = false;
  }
  if (!MAIL_WATCHER.seeded && seedMessages.length) {
    rememberNotificationIds(seedMessages.slice(0, 20));
    MAIL_WATCHER.seeded = true;
  }
  scheduleMailWatcher(1500);
}

async function requestNotifications() {
  if (!notificationSupported()) return { enabled: false, reason: "unsupported" };
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  const enabled = permission === "granted";
  setNotificationPreference(enabled);
  if (!enabled) stopMailWatcher();
  return { enabled, reason: permission };
}

function createCorreoController(host, context = {}) {
  const externalSignal = context?.signal || null;
  const aborter = new AbortController();
  const signal = aborter.signal;

  let mounted = false;
  let destroyed = false;
  let searchTimer = null;
  let searchComposing = false;
  let listSequence = 0;
  let readerSequence = 0;
  let listAbortController = null;
  let readerAbortController = null;
  let infiniteScheduled = false;
  let modalReturnFocus = null;
  let confirmResolver = null;

  const state = {
    status: Object.freeze({ connected: false, healthy: null, mailbox: "" }),
    statusKnown: false,
    accountUser: readOnionUser(),
    notifications: notificationUiState(),
    folders: [],
    messages: [],
    selectedFolderId: "",
    selectedFolderName: "Bandeja de entrada",
    selectedMessageId: "",
    selectedMessage: null,
    attachments: [],
    searchTerm: "",
    activeFilter: "all",
    nextCursor: "",
    loading: true,
    loadingMessages: false,
    loadingMore: false,
    loadingReader: false,
    busyAction: "",
  };

  cloneCacheIntoState(state, state.accountUser.cacheKey);

  function apiOptions(extra = {}) {
    return { signal, ...extra };
  }

  function notice(message = "", tone = "info") {
    const target = host.querySelector("[data-correo-notice-text]");
    const box = host.querySelector("[data-correo-notice]");
    if (target) target.textContent = cleanText(message, "Correo Microsoft 365.");
    if (box) box.dataset.tone = tone;
  }

  function toast(message = "", tone = "info", timeout = 4200) {
    const stack = host.querySelector("[data-correo-toasts]");
    if (!stack || destroyed) return;
    const item = document.createElement("div");
    item.className = `correo-toast is-${tone}`;
    item.setAttribute("role", tone === "error" ? "alert" : "status");
    item.innerHTML = `<span>${tone === "error" ? icon("warning") : tone === "success" ? icon("check") : icon("mail")}</span><strong>${escapeHtml(cleanText(message, "Correo actualizado."))}</strong>`;
    stack.appendChild(item);
    requestAnimationFrame(() => item.classList.add("is-visible"));
    setTimeout(() => {
      item.classList.remove("is-visible");
      setTimeout(() => item.remove(), 180);
    }, timeout);
  }

  function renderAll() {
    if (destroyed) return;
    state.accountUser = readOnionUser();
    state.notifications = notificationUiState();
    host.innerHTML = renderShell(state);
    host.dataset.view = "correo";
    host.setAttribute("data-correo-host", "true");
  }

  function renderAccount() {
    const target = host.querySelector("[data-correo-account-card]");
    if (!target) return;
    state.accountUser = readOnionUser();
    state.notifications = notificationUiState();
    target.innerHTML = renderConnectionCard(state.status, state.accountUser, state.notifications);
  }

  function syncNotificationHeader() {
    state.notifications = notificationUiState();
    const button = host.querySelector(".correo-list-utilities [data-correo-action='notifications']");
    if (!button) return;
    const enabled = state.notifications.enabled === true;
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-label", enabled ? "Notificaciones activadas" : "Activar notificaciones");
    button.title = enabled ? "Notificaciones activadas" : "Activar notificaciones";
  }

  function renderFolders() {
    const target = host.querySelector("[data-correo-folders]");
    if (target) target.innerHTML = renderFolderRows(state.folders, state.selectedFolderId);
  }

  function renderList() {
    const target = host.querySelector("[data-correo-message-list]");
    if (target) {
      const previousScrollTop = target.scrollTop;
      target.setAttribute("aria-busy", state.loadingMessages || state.loadingMore ? "true" : "false");
      target.innerHTML = state.loadingMessages
        ? Array.from({ length: 7 }, (_, index) => `<div class="correo-message-skeleton" aria-hidden="true" style="--i:${index}"><span></span><div><i></i><i></i><i></i></div></div>`).join("")
        : `${renderMessageRows(state.messages, state.selectedMessageId)}${state.loadingMore ? `<div class="correo-infinite-loader">${icon("spinner")}<span>Cargando correos anteriores…</span></div>` : ""}`;
      if (!state.loadingMessages) target.scrollTop = previousScrollTop;
    }

    writeViewCache(state);
  }

  function renderReaderRegion() {
    const target = host.querySelector("[data-correo-reader]");
    if (target) target.innerHTML = renderReader(state.selectedMessage, state.attachments, state.loadingReader);
    writeViewCache(state);
  }

  function setBusy(action = "") {
    state.busyAction = action;
    const modal = host.querySelector("[data-correo-compose-form]");
    if (!modal) return;
    for (const element of modal.querySelectorAll("button, input, textarea")) element.disabled = Boolean(action);
    const status = modal.querySelector("[data-correo-compose-status]");
    if (status) status.textContent = action ? "Procesando…" : "";
  }

  function focusableElements(container) {
    if (!container) return [];
    return [...container.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hidden && element.getClientRects().length > 0);
  }

  function restoreModalFocus() {
    const target = modalReturnFocus;
    modalReturnFocus = null;
    if (target instanceof HTMLElement && target.isConnected) {
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }
  }

  function trapModalFocus(event, container) {
    if (event.key !== "Tab" || !container) return false;
    const items = focusableElements(container);
    if (!items.length) {
      event.preventDefault();
      container.focus?.({ preventScroll: true });
      return true;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  function closeConfirm(result = false) {
    if (!confirmResolver) return false;
    const resolve = confirmResolver;
    confirmResolver = null;
    const root = host.querySelector("[data-correo-modal-root]");
    if (root) root.replaceChildren();
    document.documentElement.classList.remove("correo-modal-open");
    restoreModalFocus();
    resolve(Boolean(result));
    return true;
  }

  function confirmAction(input = {}) {
    if (confirmResolver || state.busyAction) return Promise.resolve(false);
    const root = host.querySelector("[data-correo-modal-root]");
    if (!root) return Promise.resolve(false);
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.innerHTML = renderConfirmModal(input);
    document.documentElement.classList.add("correo-modal-open");
    requestAnimationFrame(() => root.querySelector("[data-correo-confirm-dialog]")?.focus());
    return new Promise((resolve) => { confirmResolver = resolve; });
  }

  function consumeOauthQuery() {
    try {
      const url = new URL(window.location.href);
      const microsoft = url.searchParams.get("microsoft");
      const code = url.searchParams.get("code");
      const result = microsoft === "connected"
        ? { message: "Outlook conectado correctamente.", tone: "success", timeout: 5200 }
        : microsoft === "error"
          ? { message: `Microsoft no pudo completar la conexión${code ? ` · ${code}` : ""}.`, tone: "error", timeout: 6500 }
          : null;
      if (microsoft || code) {
        url.searchParams.delete("microsoft");
        url.searchParams.delete("code");
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
      return result;
    } catch {
      return null;
    }
  }

  async function loadStatus({ probe = false } = {}) {
    try {
      const next = await CorreoApi.getStatus(apiOptions({ probe }));
      state.statusKnown = true;
      state.status = next;
      state.loading = false;

      if (next.connected) {
        writeViewCache(state);
        if (!host.querySelector(".correo-workspace") || host.querySelector(".correo-workspace--boot")) renderAll();
        await loadWorkspace({ initial: false });
      } else {
        stopMailWatcher({ clear: true });
        clearViewCache();
        state.folders = [];
        state.messages = [];
        state.selectedMessage = null;
        state.attachments = [];
        renderAll();
      }
    } catch (error) {
      if (signal.aborted) return;
      state.loading = false;
      if (!state.statusKnown) {
        state.statusKnown = true;
        state.status = Object.freeze({ connected: false, healthy: false, mailbox: "" });
        renderAll();
      } else if (state.status.connected) {
        state.status = Object.freeze({ ...state.status, healthy: false });
        renderAccount();
      }
      toast(errorMessage(error, "No se pudo comprobar Microsoft 365."), "error");
    }
  }

  async function loadWorkspace({ initial = false } = {}) {
    if (initial && !state.status.connected) return;
    notice(`Sincronizando ${state.status.mailbox || "Microsoft 365"}…`);
    try {
      const [folders, profile] = await Promise.all([
        CorreoApi.folders(apiOptions()),
        CorreoApi.profile(apiOptions()).catch(() => null),
      ]);

      if (profile?.displayName && profile.displayName !== state.status.displayName) {
        state.status = Object.freeze({ ...state.status, displayName: profile.displayName, healthy: true });
      } else if (state.status.healthy === false) {
        state.status = Object.freeze({ ...state.status, healthy: true });
      }

      state.folders = sortFolders(folders);
      const selectedExists = state.folders.some((folder) => folder.id === state.selectedFolderId);
      const first = selectedExists ? state.folders.find((folder) => folder.id === state.selectedFolderId) : findInbox(state.folders);
      state.selectedFolderId = first?.id || "inbox";
      state.selectedFolderName = first?.displayName || "Bandeja de entrada";

      renderAccount();
      renderFolders();
      await loadMessages({ openFirst: !state.selectedMessageId });

      const inbox = findInbox(state.folders);
      configureMailWatcher({
        inboxFolderId: inbox?.id || "",
        mailbox: state.status.mailbox || "",
        seedMessages: inbox?.id === state.selectedFolderId ? state.messages : [],
      });
      notice(`Outlook conectado · ${state.status.mailbox || "Microsoft 365"}`, "success");
      writeViewCache(state);
    } catch (error) {
      if (signal.aborted) return;
      const code = errorCode(error);
      if (/MICROSOFT_(NOT_CONNECTED|TOKEN|CACHE|ACCOUNT)/.test(code)) {
        state.statusKnown = true;
        state.status = Object.freeze({ ...state.status, connected: false, healthy: false });
        stopMailWatcher({ clear: true });
        clearViewCache();
        renderAll();
      } else {
        state.status = Object.freeze({ ...state.status, healthy: false });
        renderAccount();
      }
      toast(errorMessage(error, "No se pudo sincronizar Outlook."), "error");
    }
  }

  async function loadMessages({ append = false, openFirst = false } = {}) {
    if (!state.status.connected) return;
    if (append && (!state.nextCursor || state.loadingMore || state.loadingMessages)) return;
    const sequence = ++listSequence;
    listAbortController?.abort();
    const requestAbort = new AbortController();
    listAbortController = requestAbort;
    if (signal.aborted) requestAbort.abort();
    else signal.addEventListener("abort", () => requestAbort.abort(), { once: true });

    if (append) {
      state.loadingMore = true;
      renderList();
    } else {
      state.loadingMessages = true;
      state.loadingMore = false;
      state.nextCursor = "";
      const list = host.querySelector("[data-correo-message-list]");
      if (list) list.scrollTop = 0;
      renderList();
    }

    try {
      const result = await CorreoApi.messages(apiOptions({
        signal: requestAbort.signal,
        cursor: append ? state.nextCursor : "",
        folder: state.selectedFolderId || "inbox",
        top: 35,
        q: state.searchTerm,
        filter: state.searchTerm ? "" : state.activeFilter === "all" ? "" : state.activeFilter,
      }));

      if (sequence !== listSequence || destroyed) return;
      state.messages = append
        ? [...state.messages, ...result.messages.filter((item) => !state.messages.some((current) => current.id === item.id))]
        : [...result.messages];
      state.nextCursor = result.nextCursor;
      state.loadingMessages = false;
      state.loadingMore = false;

      if (!state.messages.some((item) => item.id === state.selectedMessageId)) {
        state.selectedMessageId = "";
        state.selectedMessage = null;
        state.attachments = [];
      }

      renderList();
      if (openFirst && !state.selectedMessageId && state.messages[0]?.id) await openMessage(state.messages[0].id);
      else renderReaderRegion();
    } catch (error) {
      if (sequence !== listSequence || signal.aborted || requestAbort.signal.aborted) return;
      state.loadingMessages = false;
      state.loadingMore = false;
      renderList();
      toast(errorMessage(error, "No se pudieron cargar los mensajes."), "error");
    }
  }

  async function openMessage(id = "") {
    const messageId = cleanText(id, "");
    if (!messageId) return;
    const sequence = ++readerSequence;
    readerAbortController?.abort();
    const requestAbort = new AbortController();
    readerAbortController = requestAbort;
    if (signal.aborted) requestAbort.abort();
    else signal.addEventListener("abort", () => requestAbort.abort(), { once: true });
    state.selectedMessageId = messageId;
    state.loadingReader = true;
    state.selectedMessage = null;
    state.attachments = [];
    renderList();
    renderReaderRegion();

    try {
      const summary = state.messages.find((item) => item.id === messageId) || null;
      const attachmentPromise = summary?.hasAttachments
        ? CorreoApi.attachments(messageId, apiOptions({ signal: requestAbort.signal })).catch(() => [])
        : null;
      const detail = await CorreoApi.message(messageId, apiOptions({ signal: requestAbort.signal }));
      const attachments = attachmentPromise
        ? await attachmentPromise
        : detail.hasAttachments
          ? await CorreoApi.attachments(messageId, apiOptions({ signal: requestAbort.signal })).catch(() => [])
          : [];
      if (sequence !== readerSequence || destroyed) return;

      state.selectedMessage = detail;
      state.attachments = [...attachments];
      state.loadingReader = false;
      const index = state.messages.findIndex((item) => item.id === messageId);
      if (index >= 0) state.messages[index] = detail;
      renderList();
      renderReaderRegion();

      if (!detail.isRead && !detail.isDraft) {
        try {
          const updated = await CorreoApi.updateMessage(messageId, { isRead: true }, apiOptions({ signal: requestAbort.signal }));
          if (sequence !== readerSequence || destroyed) return;
          state.selectedMessage = updated;
          const current = state.messages.findIndex((item) => item.id === messageId);
          if (current >= 0) state.messages[current] = updated;
          const folder = state.folders.find((item) => item.id === state.selectedFolderId);
          if (folder && folder.unreadItemCount > 0) {
            state.folders = state.folders.map((item) => item.id === folder.id
              ? Object.freeze({ ...item, unreadItemCount: Math.max(0, item.unreadItemCount - 1) })
              : item);
            renderFolders();
          }
          renderList();
          renderReaderRegion();
        } catch {
          // El mensaje sigue siendo legible aunque falle el marcado de leído.
        }
      }
    } catch (error) {
      if (sequence !== readerSequence || signal.aborted || requestAbort.signal.aborted) return;
      state.loadingReader = false;
      state.selectedMessage = null;
      renderReaderRegion();
      toast(errorMessage(error, "No se pudo abrir el mensaje."), "error");
    }
  }

  async function connect() {
    if (state.busyAction) return;
    state.busyAction = "connect";
    try {
      const connection = await CorreoApi.connect(apiOptions());
      window.location.assign(connection.authorizationUrl);
    } catch (error) {
      state.busyAction = "";
      toast(errorMessage(error, "No se pudo iniciar Microsoft OAuth."), "error");
    }
  }

  async function disconnect() {
    const accepted = await confirmAction({
      eyebrow: "Cuenta Microsoft",
      title: "¿Desconectar Outlook?",
      message: state.status.mailbox
        ? `Onion Support dejará de acceder a ${state.status.mailbox} hasta que vuelvas a conectarla.`
        : "Onion Support dejará de acceder a esta cuenta hasta que vuelvas a conectarla.",
      confirmLabel: "Desconectar",
      danger: true,
      iconName: "logout",
    });
    if (!accepted) return;
    try {
      await CorreoApi.disconnect(apiOptions());
      state.statusKnown = true;
      state.status = Object.freeze({ connected: false, healthy: null, mailbox: state.status.mailbox });
      state.folders = [];
      state.messages = [];
      state.selectedMessage = null;
      state.attachments = [];
      stopMailWatcher({ clear: true });
      clearViewCache();
      renderAll();
      toast("Outlook desconectado.", "success");
    } catch (error) {
      toast(errorMessage(error, "No se pudo desconectar Outlook."), "error");
    }
  }

  function openCompose(mode = "compose") {
    const modalRoot = host.querySelector("[data-correo-modal-root]");
    if (!modalRoot || confirmResolver) return;
    const message = state.selectedMessage || {};
    let input = { mode, messageId: message.id || "" };
    if (mode === "forward") input = { ...input, subject: message.subject || "", body: "" };
    if (mode === "draft-edit" && message.isDraft) {
      input = {
        ...input,
        to: (message.toRecipients || []).map((item) => item.address).filter(Boolean).join(", "),
        cc: (message.ccRecipients || []).map((item) => item.address).filter(Boolean).join(", "),
        subject: message.subject || "",
        body: message?.body?.content || "",
      };
    }
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRoot.innerHTML = renderComposeModal(input);
    document.documentElement.classList.add("correo-modal-open");
    requestAnimationFrame(() => {
      const preferred = mode === "compose" || mode === "forward"
        ? modalRoot.querySelector("input[name='to']")
        : modalRoot.querySelector("textarea[name='body']");
      preferred?.focus();
    });
  }

  function closeModal() {
    if (state.busyAction || confirmResolver) return;
    const root = host.querySelector("[data-correo-modal-root]");
    if (root) root.replaceChildren();
    document.documentElement.classList.remove("correo-modal-open");
    restoreModalFocus();
  }

  function composePayload(form) {
    const data = new FormData(form);
    const to = parseRecipients(data.get("to"));
    const cc = parseRecipients(data.get("cc"));
    const subject = cleanText(data.get("subject"), "");
    const body = String(data.get("body") ?? "");
    for (const address of [...to, ...cc]) {
      if (!isLikelyEmail(address)) {
        const error = new Error(`Dirección de correo no válida: ${address}`);
        error.code = "MAIL_RECIPIENT_INVALID";
        throw error;
      }
    }
    return { to, cc, subject, body, importance: "normal" };
  }

  function selectedFiles(form) {
    const input = form.querySelector("[data-correo-attachments-input]");
    return [...(input?.files || [])].filter((file) => file instanceof File && file.size > 0);
  }

  async function sendCompose(form) {
    if (state.busyAction) return;
    const mode = cleanText(form.dataset.correoComposeMode, "compose");
    const messageId = cleanText(form.dataset.correoMessageId, "");

    try {
      // IMPORTANTE: FormData ignora controles disabled. Capturamos antes de setBusy().
      const payload = composePayload(form);
      const files = selectedFiles(form);
      if ((mode === "compose" || mode === "forward" || mode === "draft-edit") && !payload.to.length) throw new Error("Indica al menos un destinatario válido.");
      if (files.some((file) => file.size > 25 * 1024 * 1024)) throw new Error("Cada adjunto debe ser de 25 MB o menos.");
      setBusy("send");

      if (mode === "draft-edit") {
        if (!messageId) throw new Error("No hay borrador que actualizar.");
        await CorreoApi.updateDraft(messageId, payload, apiOptions());
        const status = form.querySelector("[data-correo-compose-status]");
        for (let index = 0; index < files.length; index += 1) {
          if (status) status.textContent = `Adjuntando ${index + 1}/${files.length}: ${files[index].name}`;
          await CorreoApi.uploadAttachment(messageId, files[index], apiOptions());
        }
        if (status) status.textContent = "Enviando borrador…";
        await CorreoApi.sendDraft(messageId, apiOptions());
        toast("Borrador enviado.", "success");
      } else if (mode === "reply" || mode === "reply-all") {
        if (!messageId) throw new Error("No hay mensaje al que responder.");
        if (mode === "reply-all") await CorreoApi.replyAll(messageId, payload.body, apiOptions());
        else await CorreoApi.reply(messageId, payload.body, apiOptions());
        toast("Respuesta enviada.", "success");
      } else if (mode === "forward") {
        if (!messageId) throw new Error("No hay mensaje que reenviar.");
        await CorreoApi.forward(messageId, { to: payload.to, comment: payload.body }, apiOptions());
        toast("Mensaje reenviado.", "success");
      } else if (!files.length) {
        await CorreoApi.send(payload, apiOptions());
        toast("Correo enviado.", "success");
      } else {
        const draft = await CorreoApi.createDraft(payload, apiOptions());
        if (!draft.id) throw new Error("No se pudo crear el borrador para adjuntar archivos.");
        const status = form.querySelector("[data-correo-compose-status]");
        for (let index = 0; index < files.length; index += 1) {
          if (status) status.textContent = `Subiendo ${index + 1}/${files.length}: ${files[index].name}`;
          await CorreoApi.uploadAttachment(draft.id, files[index], apiOptions());
        }
        if (status) status.textContent = "Enviando mensaje…";
        await CorreoApi.sendDraft(draft.id, apiOptions());
        toast("Correo enviado.", "success");
      }

      setBusy("");
      closeModal();
      await loadMessages({ openFirst: false });
    } catch (error) {
      setBusy("");
      const status = form.querySelector("[data-correo-compose-status]");
      if (status) status.textContent = errorMessage(error);
      toast(errorMessage(error, "No se pudo enviar el correo."), "error", 6000);
    }
  }

  async function saveDraft(form) {
    if (state.busyAction) return;
    try {
      const payload = composePayload(form);
      const files = selectedFiles(form);
      const mode = cleanText(form.dataset.correoComposeMode, "compose");
      const messageId = cleanText(form.dataset.correoMessageId, "");
      for (const file of files) if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} supera 25 MB.`);
      setBusy("draft");
      const draft = mode === "draft-edit"
        ? await CorreoApi.updateDraft(messageId, payload, apiOptions())
        : await CorreoApi.createDraft(payload, apiOptions());
      if (!draft.id) throw new Error("No se pudo guardar el borrador.");
      const status = form.querySelector("[data-correo-compose-status]");
      for (let index = 0; index < files.length; index += 1) {
        if (status) status.textContent = `Adjuntando ${index + 1}/${files.length}…`;
        await CorreoApi.uploadAttachment(draft.id, files[index], apiOptions());
      }
      setBusy("");
      closeModal();
      toast(mode === "draft-edit" ? "Cambios del borrador guardados." : "Borrador guardado en Outlook.", "success");
      await loadMessages({ openFirst: false });
    } catch (error) {
      setBusy("");
      const status = form.querySelector("[data-correo-compose-status]");
      if (status) status.textContent = errorMessage(error);
      toast(errorMessage(error, "No se pudo guardar el borrador."), "error");
    }
  }

  async function updateSelected(patch = {}, successText = "Mensaje actualizado.") {
    const id = state.selectedMessage?.id;
    if (!id) return;
    try {
      const updated = await CorreoApi.updateMessage(id, patch, apiOptions());
      state.selectedMessage = updated;
      const index = state.messages.findIndex((item) => item.id === id);
      if (index >= 0) state.messages[index] = updated;
      renderList();
      renderReaderRegion();
      if (successText) toast(successText, "success", 2800);
    } catch (error) {
      toast(errorMessage(error, "No se pudo actualizar el mensaje."), "error");
    }
  }

  async function deleteSelected() {
    const message = state.selectedMessage;
    if (!message?.id) return;
    const accepted = await confirmAction({
      eyebrow: "Eliminar mensaje",
      title: `¿Eliminar “${message.subject || "este mensaje"}”?`,
      message: "El mensaje se eliminará de Outlook. Esta acción no se puede deshacer desde Onion Support.",
      confirmLabel: "Eliminar",
      danger: true,
      iconName: "trash",
    });
    if (!accepted) return;
    try {
      await CorreoApi.deleteMessage(message.id, apiOptions());
      state.messages = state.messages.filter((item) => item.id !== message.id);
      state.selectedMessageId = "";
      state.selectedMessage = null;
      state.attachments = [];
      renderList();
      renderReaderRegion();
      toast("Mensaje eliminado.", "success");
      if (state.messages[0]?.id) await openMessage(state.messages[0].id);
    } catch (error) {
      toast(errorMessage(error, "No se pudo eliminar el mensaje."), "error");
    }
  }

  function openMoveMenu(button) {
    host.querySelector("[data-correo-move-popover]")?.remove();
    const wrapper = document.createElement("div");
    wrapper.dataset.correoMovePopover = "true";
    wrapper.className = "correo-popover-anchor";
    wrapper.innerHTML = renderMoveMenu(state.folders, state.selectedFolderId);
    button.insertAdjacentElement("afterend", wrapper);
  }

  async function moveSelected(destinationId = "") {
    const id = state.selectedMessage?.id;
    if (!id || !destinationId) return;
    try {
      await CorreoApi.moveMessage(id, destinationId, apiOptions());
      host.querySelector("[data-correo-move-popover]")?.remove();
      state.messages = state.messages.filter((item) => item.id !== id);
      state.selectedMessageId = "";
      state.selectedMessage = null;
      state.attachments = [];
      renderList();
      renderReaderRegion();
      toast("Mensaje movido.", "success");
      await loadWorkspace({ initial: false });
    } catch (error) {
      toast(errorMessage(error, "No se pudo mover el mensaje."), "error");
    }
  }

  async function downloadAttachment(button) {
    const messageId = cleanText(button.dataset.correoMessageId, "");
    const attachmentId = cleanText(button.dataset.correoAttachmentId, "");
    if (!messageId || !attachmentId) return;
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      await CorreoApi.downloadAttachment(messageId, attachmentId, apiOptions());
      toast("Adjunto descargado.", "success", 2500);
    } catch (error) {
      toast(errorMessage(error, "No se pudo descargar el adjunto."), "error");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  async function sendOpenDraft() {
    const id = state.selectedMessage?.id;
    if (!id || !state.selectedMessage?.isDraft) return;
    const accepted = await confirmAction({
      eyebrow: "Borrador",
      title: "¿Enviar este borrador ahora?",
      message: state.selectedMessage.subject || "El mensaje se enviará con su contenido actual.",
      confirmLabel: "Enviar borrador",
      danger: false,
      iconName: "send",
    });
    if (!accepted) return;
    try {
      await CorreoApi.sendDraft(id, apiOptions());
      toast("Borrador enviado.", "success");
      await loadMessages({ openFirst: true });
    } catch (error) {
      toast(errorMessage(error, "No se pudo enviar el borrador."), "error");
    }
  }

  async function selectFolder(button) {
    const id = cleanText(button.dataset.correoFolderId, "");
    if (!id || id === state.selectedFolderId) return;
    state.selectedFolderId = id;
    state.selectedFolderName = cleanText(button.dataset.correoFolderName, "Correo");
    state.selectedMessageId = "";
    state.selectedMessage = null;
    state.attachments = [];
    state.searchTerm = "";
    state.activeFilter = "all";
    const search = host.querySelector("[data-correo-search]");
    if (search) search.value = "";
    renderFolders();
    renderReaderRegion();
    await loadMessages({ openFirst: true });
  }

  function toggleAccountMenu(button) {
    const wrap = button.closest("[data-correo-account-wrap]");
    const menu = wrap?.querySelector("[data-correo-account-menu]");
    if (!menu) return;
    const open = menu.hidden;
    host.querySelectorAll("[data-correo-account-menu]").forEach((item) => { item.hidden = true; });
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeAccountMenu() {
    const menu = host.querySelector("[data-correo-account-menu]:not([hidden])");
    if (!menu) return;
    menu.hidden = true;
    host.querySelector("[data-correo-action='account-menu']")?.setAttribute("aria-expanded", "false");
  }

  async function toggleNotifications() {
    closeAccountMenu();
    const result = await requestNotifications();
    state.notifications = notificationUiState();
    renderAccount();
    syncNotificationHeader();
    if (result.enabled) {
      const inbox = findInbox(state.folders);
      configureMailWatcher({ inboxFolderId: inbox?.id || "", mailbox: state.status.mailbox || "", seedMessages: inbox?.id === state.selectedFolderId ? state.messages : [] });
      toast("Notificaciones de correo activadas.", "success");
    } else if (result.reason === "unsupported") {
      toast("Este navegador no admite notificaciones de escritorio.", "error");
    } else {
      toast("El navegador no concedió permiso para notificaciones.", "error");
    }
  }

  async function onClick(event) {
    if (destroyed) return;
    const target = event.target?.closest?.("[data-correo-action]");
    if (!target || !host.contains(target)) return;
    const action = cleanText(target.dataset.correoAction, "");
    if (!action) return;

    if (action === "confirm-accept") return closeConfirm(true);
    if (action === "confirm-cancel") return closeConfirm(false);
    if (action === "connect") return connect();
    if (action === "disconnect") return disconnect();
    if (action === "refresh") return loadWorkspace({ initial: false });
    if (action === "compose") return openCompose("compose");
    if (action === "close-modal") return closeModal();
    if (action === "folder") return selectFolder(target);
    if (action === "select-message") return openMessage(target.dataset.correoMessageId);
    if (action === "reply") return openCompose("reply");
    if (action === "reply-all") return openCompose("reply-all");
    if (action === "forward") return openCompose("forward");
    if (action === "toggle-read") return updateSelected({ isRead: !state.selectedMessage?.isRead }, state.selectedMessage?.isRead ? "Marcado como no leído." : "Marcado como leído.");
    if (action === "toggle-flag") return updateSelected({ flagStatus: state.selectedMessage?.flag?.flagStatus === "flagged" ? "notFlagged" : "flagged" }, state.selectedMessage?.flag?.flagStatus === "flagged" ? "Destacado eliminado." : "Mensaje destacado.");
    if (action === "delete-message") return deleteSelected();
    if (action === "move-menu") return openMoveMenu(target);
    if (action === "move-to") return moveSelected(target.dataset.correoDestinationId);
    if (action === "download-attachment") return downloadAttachment(target);
    if (action === "send-open-draft") return sendOpenDraft();
    if (action === "edit-draft") return openCompose("draft-edit");
    if (action === "account-menu") return toggleAccountMenu(target);
    if (action === "notifications") return toggleNotifications();
    if (action === "save-draft") {
      const form = target.closest("[data-correo-compose-form]");
      if (form) return saveDraft(form);
    }
    if (action === "filter") {
      const next = cleanText(target.dataset.correoFilter, "all");
      state.activeFilter = ["all", "unread", "flagged"].includes(next) ? next : "all";
      state.searchTerm = "";
      const search = host.querySelector("[data-correo-search]");
      if (search) search.value = "";
      for (const button of host.querySelectorAll("[data-correo-filter]")) {
        const active = button.dataset.correoFilter === state.activeFilter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
      return loadMessages({ openFirst: true });
    }
  }

  function applySearchInput(target) {
    state.searchTerm = cleanText(target?.value, "");
    if (state.searchTerm) {
      state.activeFilter = "all";
      for (const button of host.querySelectorAll("[data-correo-filter]")) {
        const active = button.dataset.correoFilter === "all";
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadMessages({ openFirst: true }), 320);
  }

  function onCompositionStart(event) {
    if (event.target?.matches?.("[data-correo-search]")) searchComposing = true;
  }

  function onCompositionEnd(event) {
    if (!event.target?.matches?.("[data-correo-search]")) return;
    searchComposing = false;
    applySearchInput(event.target);
  }

  function onInput(event) {
    if (destroyed) return;
    const target = event.target;
    if (target?.matches?.("[data-correo-search]")) {
      if (searchComposing || event.isComposing) return;
      applySearchInput(target);
      return;
    }

    if (target?.matches?.("[data-correo-attachments-input]")) {
      const summary = target.closest(".correo-compose-attachments")?.querySelector("[data-correo-file-summary]");
      const files = [...(target.files || [])];
      if (summary) {
        const total = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
        summary.textContent = files.length ? `${files.length} archivo${files.length === 1 ? "" : "s"} · ${formatBytes(total)}` : "Sin adjuntos";
      }
    }
  }

  function onSubmit(event) {
    const form = event.target?.closest?.("[data-correo-compose-form]");
    if (!form || !host.contains(form)) return;
    event.preventDefault();
    sendCompose(form);
  }

  function onScroll(event) {
    const list = event.target;
    if (!list?.matches?.("[data-correo-message-list]") || !state.nextCursor || state.loadingMore || state.loadingMessages) return;
    if (list.scrollHeight - list.scrollTop - list.clientHeight > 260) return;
    if (infiniteScheduled) return;
    infiniteScheduled = true;
    requestAnimationFrame(() => {
      infiniteScheduled = false;
      loadMessages({ append: true, openFirst: false });
    });
  }

  function onKeydown(event) {
    if (destroyed) return;
    const confirmDialog = host.querySelector("[data-correo-confirm-dialog]");
    const composeDialog = host.querySelector(".correo-compose[role='dialog']");
    const modalOpen = Boolean(composeDialog);
    if (confirmDialog && event.key === "Tab") {
      trapModalFocus(event, confirmDialog);
      return;
    }
    if (composeDialog && event.key === "Tab") {
      trapModalFocus(event, composeDialog);
      return;
    }
    if (event.key === "Escape") {
      if (confirmDialog) {
        event.preventDefault();
        closeConfirm(false);
      } else if (modalOpen && !state.busyAction) {
        event.preventDefault();
        closeModal();
      } else {
        host.querySelector("[data-correo-move-popover]")?.remove();
        closeAccountMenu();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && safeLower(event.key) === "k") {
      const search = host.querySelector("[data-correo-search]");
      if (search && state.status.connected) {
        event.preventDefault();
        search.focus();
        search.select();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && modalOpen) {
      const form = host.querySelector("[data-correo-compose-form]");
      if (form && !state.busyAction) {
        event.preventDefault();
        form.requestSubmit();
      }
    }
  }

  function onDocumentClick(event) {
    const popover = host.querySelector("[data-correo-move-popover]");
    if (popover && !popover.contains(event.target) && !event.target?.closest?.("[data-correo-action='move-menu']")) popover.remove();
    const accountWrap = event.target?.closest?.("[data-correo-account-wrap]");
    if (!accountWrap) closeAccountMenu();
  }

  function onNewMail() {
    if (destroyed || !mounted || !state.status.connected) return;
    const inbox = findInbox(state.folders);
    if (inbox?.id === state.selectedFolderId) loadMessages({ openFirst: false });
    CorreoApi.folders(apiOptions()).then((folders) => {
      if (destroyed) return;
      state.folders = sortFolders(folders);
      renderFolders();
      writeViewCache(state);
    }).catch(() => {});
  }

  async function mount() {
    if (destroyed || mounted || !host) return controller;
    if (externalSignal?.aborted) return controller;
    if (externalSignal) externalSignal.addEventListener("abort", () => aborter.abort(), { once: true });

    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("compositionstart", onCompositionStart);
    host.addEventListener("compositionend", onCompositionEnd);
    host.addEventListener("submit", onSubmit);
    host.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("click", onDocumentClick);
    window.addEventListener("onion:correo-new-message", onNewMail);

    mounted = true;
    renderAll();
    const oauthNotice = consumeOauthQuery();
    await loadStatus({ probe: true });
    if (oauthNotice && !destroyed) toast(oauthNotice.message, oauthNotice.tone, oauthNotice.timeout);
    return controller;
  }

  function destroy(options = {}) {
    if (destroyed) return true;
    writeViewCache(state);
    destroyed = true;
    mounted = false;
    clearTimeout(searchTimer);
    listAbortController?.abort();
    readerAbortController?.abort();
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(false);
    }
    aborter.abort();
    host.removeEventListener("click", onClick);
    host.removeEventListener("input", onInput);
    host.removeEventListener("compositionstart", onCompositionStart);
    host.removeEventListener("compositionend", onCompositionEnd);
    host.removeEventListener("submit", onSubmit);
    host.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("click", onDocumentClick);
    window.removeEventListener("onion:correo-new-message", onNewMail);
    document.documentElement.classList.remove("correo-modal-open");
    if (options?.clear === true || options?.keepDom === false) host.replaceChildren();
    if (INSTANCES.get(host) === controller) INSTANCES.delete(host);
    return true;
  }

  const controller = {
    version: CORREO_VIEW_VERSION,
    templateVersion: CORREO_TEMPLATE_VERSION,
    mount,
    destroy,
    unmount: destroy,
    async refresh() {
      await loadStatus({ probe: true });
      return controller.getSnapshot();
    },
    getSnapshot() {
      return Object.freeze({
        version: CORREO_VIEW_VERSION,
        mounted,
        destroyed,
        connected: state.status.connected === true,
        healthy: state.status.healthy,
        mailbox: state.status.mailbox || "",
        folders: state.folders.length,
        messages: state.messages.length,
        selectedFolderId: state.selectedFolderId,
        selectedMessageId: state.selectedMessageId,
        searchTerm: state.searchTerm,
        activeFilter: state.activeFilter,
        notifications: notificationUiState().enabled,
        cacheIsolated: true,
        cacheTtlMs: VIEW_CACHE_TTL_MS,
        routeCommitNonBlocking: true,
        infiniteScroll: true,
        networkEnabled: true,
        microsoftGraph: true,
      });
    },
  };

  return controller;
}

export function CorreoView(host = null, context = {}) {
  if (!isDomNode(host)) return null;
  try { INSTANCES.get(host)?.destroy?.({ keepDom: false }); } catch { /* noop */ }
  const controller = createCorreoController(host, context && typeof context === "object" ? context : {});
  INSTANCES.set(host, controller);
  lastInstance = controller;
  controller.mount();
  return controller;
}

export function destroy(options = {}) {
  try { return Boolean(lastInstance?.destroy?.(options)); } catch { return false; }
}

export function getSnapshot() {
  try {
    return lastInstance?.getSnapshot?.() || Object.freeze({ version: CORREO_VIEW_VERSION, mounted: false, connected: Boolean(VIEW_CACHE.status?.connected), networkEnabled: true, microsoftGraph: true });
  } catch {
    return Object.freeze({ version: CORREO_VIEW_VERSION, mounted: false, connected: false, networkEnabled: true, microsoftGraph: true });
  }
}

export default CorreoView;
