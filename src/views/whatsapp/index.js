/* =========================================================
   Onion Support - WhatsApp
   Archivo: /src/views/whatsapp/index.js

   PROFESSIONAL INBOX · ADMIN ONLY · V2
   - El Router compromete la vista sin esperar red.
   - Toda I/O pasa por whatsapp.api.js -> Onion backend.
   - Avatar System global = única autoridad visual de identidad.
   - Polling acotado mientras la vista vive; sin sockets/storage.
========================================================= */

"use strict";

import { AppCore } from "../../core/index.js";
import {
  synchronizeAvatars,
} from "../../features/avatar-system/index.js";
import {
  loadUsuarioDetail,
} from "../usuarios/usuarios.api.js";
import {
  loadClienteDetail,
} from "../clientes/clientes.api.js";
import {
  WHATSAPP_API_VERSION,
  WHATSAPP_MAX_TEXT_LENGTH,
  loadWhatsAppMeta,
  loadWhatsAppConversations,
  loadWhatsAppMessages,
  sendWhatsAppText,
} from "./whatsapp.api.js";
import renderWhatsAppInbox, {
  WHATSAPP_TEMPLATE_VERSION,
} from "./whatsapp.template.js";
import { cleanText } from "../../core/presentation-text.js";


export const WHATSAPP_VIEW_VERSION =
  "whatsapp.view.v2.professional-inbox";
export const WHATSAPP_VIEW_NAME = "WhatsAppView";
export const WHATSAPP_CANONICAL_PATH = "/whatsapp";

const POLL_INTERVAL_MS = 12_000;
const SEARCH_DEBOUNCE_MS = 120;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}



function normalizeSearch(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function errorText(error = null, fallback = "No se pudo completar la operación de WhatsApp.") {
  return cleanText(
    error?.data?.message ||
      error?.payload?.message ||
      error?.response?.message ||
      error?.message ||
      error?.code ||
      fallback,
    fallback
  );
}

function showToast(message, type = "info") {
  const value = cleanText(message, "");
  if (!value) return false;

  for (const toast of [AppCore?.toast, AppCore?.ui?.toast, AppCore?.Toast]) {
    try {
      if (typeof toast?.[type] === "function") {
        return Boolean(toast[type](value) ?? true);
      }
      if (typeof toast?.show === "function") {
        return Boolean(toast.show(value, type) ?? true);
      }
    } catch {
      // noop
    }
  }
  return false;
}

function entityDisplayName(entity = {}) {
  const source = safeObject(entity);
  const contacto = safeObject(source.contacto);
  return cleanText(
    source.displayName ||
      source.fullName ||
      source.name ||
      source.nombre ||
      source.contactoNombre ||
      contacto.nombre ||
      source.nombreFiscal ||
      source.razonSocial ||
      source.username ||
      "",
    ""
  );
}

function conversationSignature(items = []) {
  return safeArray(items)
    .map((item) => [
      item?.conversationId,
      item?.lastMessageAt,
      item?.lastInboundAt,
      item?.lastOutboundAt,
      item?.whatsappProfileName,
      item?.linkedEntityType,
      item?.linkedEntityId,
      item?.identityMatch,
    ].map((value) => String(value ?? "")).join("|"))
    .join("\n");
}

function messageSignature(items = []) {
  return safeArray(items)
    .map((item) => [item?.id, item?.timestamp, item?.status, item?.direction]
      .map((value) => String(value ?? ""))
      .join("|"))
    .join("\n");
}

function createIdempotencyKey() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return `onion-wa-${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    // fallback below
  }

  const random = Math.random().toString(36).slice(2, 12);
  return `onion-wa-${Date.now().toString(36)}-${random}`;
}

function requestSignal(controllers, key, externalSignal = null) {
  try {
    controllers.get(key)?.abort?.("whatsapp-request-replaced");
  } catch {
    // noop
  }

  if (typeof AbortController === "undefined") {
    return externalSignal || undefined;
  }

  const controller = new AbortController();
  controllers.set(key, controller);

  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason || "route-aborted");
  } else if (externalSignal?.addEventListener) {
    externalSignal.addEventListener(
      "abort",
      () => {
        try {
          controller.abort(externalSignal.reason || "route-aborted");
        } catch {
          controller.abort();
        }
      },
      { once: true }
    );
  }

  return controller.signal;
}

function abortAll(controllers) {
  for (const controller of controllers.values()) {
    try {
      if (!controller.signal?.aborted) controller.abort("whatsapp-view-destroyed");
    } catch {
      // noop
    }
  }
  controllers.clear();
}

export function WhatsAppView(host = null, context = {}) {
  if (
    !isBrowser() ||
    !host ||
    host.nodeType !== 1 ||
    typeof host.replaceChildren !== "function"
  ) {
    return null;
  }

  let destroyed = false;
  let pollTimer = 0;
  let searchTimer = 0;
  let conversationEpoch = 0;
  let messageEpoch = 0;
  let identityEpoch = 0;
  let sendEpoch = 0;

  const controllers = new Map();
  const routeSignal = context?.signal || null;

  const state = {
    version: WHATSAPP_VIEW_VERSION,
    apiVersion: WHATSAPP_API_VERSION,
    templateVersion: WHATSAPP_TEMPLATE_VERSION,
    meta: null,
    conversations: [],
    filteredConversations: [],
    selectedConversationId: "",
    messages: [],
    identities: Object.create(null),
    loadingMeta: true,
    loadingConversations: true,
    loadingMessages: false,
    loadingIdentity: false,
    refreshing: false,
    sending: false,
    errorMeta: "",
    errorConversations: "",
    errorMessages: "",
    errorIdentity: "",
    sendError: "",
    search: "",
    draft: "",
    mobilePanel: "list",
    lastSyncAt: 0,
  };

  function selectedConversation() {
    return state.conversations.find(
      (item) => item?.conversationId === state.selectedConversationId
    ) || null;
  }

  function filterConversations() {
    const query = normalizeSearch(state.search);
    if (!query) {
      state.filteredConversations = [...state.conversations];
      return state.filteredConversations;
    }

    state.filteredConversations = state.conversations.filter((item) => {
      const identity = safeObject(state.identities?.[item.conversationId]);
      const blob = normalizeSearch([
        item.whatsappProfileName,
        item.waId,
        item.phone,
        item.linkedEntityType,
        entityDisplayName(identity),
        identity.email,
        identity.username,
      ].filter(Boolean).join(" "));
      return blob.includes(query);
    });

    return state.filteredConversations;
  }

  function captureThreadScroll() {
    const node = host.querySelector?.("[data-whatsapp-thread-scroll='true']");
    if (!node) return null;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    return {
      top: node.scrollTop,
      distanceFromBottom,
      nearBottom: distanceFromBottom <= 80,
    };
  }

  function restoreThreadScroll(snapshot, mode = "preserve") {
    const node = host.querySelector?.("[data-whatsapp-thread-scroll='true']");
    if (!node) return;

    queueMicrotask(() => {
      if (destroyed || !node.isConnected) return;
      if (mode === "bottom" || !snapshot || snapshot.nearBottom) {
        node.scrollTop = node.scrollHeight;
        return;
      }
      node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight - snapshot.distanceFromBottom);
    });
  }

  function render({
    focus = "",
    caret = null,
    threadScroll = "preserve",
  } = {}) {
    if (destroyed) return false;

    filterConversations();
    const scroll = captureThreadScroll();

    host.innerHTML = renderWhatsAppInbox({ state });
    host.dataset.whatsappView = WHATSAPP_VIEW_VERSION;
    host.dataset.whatsappApi = WHATSAPP_API_VERSION;

    try {
      synchronizeAvatars(host);
    } catch {
      // Global observer also handles dynamic DOM.
    }

    if (focus === "search") {
      const input = host.querySelector("[data-whatsapp-search='true']");
      if (input) {
        input.focus({ preventScroll: true });
        const end = String(input.value || "").length;
        const position = Math.min(Number.isFinite(caret) ? caret : end, end);
        try { input.setSelectionRange(position, position); } catch { /* noop */ }
      }
    }

    if (focus === "draft") {
      const input = host.querySelector("[data-whatsapp-draft='true']");
      if (input) {
        input.focus({ preventScroll: true });
        const end = String(input.value || "").length;
        const position = Math.min(Number.isFinite(caret) ? caret : end, end);
        try { input.setSelectionRange(position, position); } catch { /* noop */ }
      }
    }

    restoreThreadScroll(scroll, threadScroll);
    return true;
  }

  function syncDraftControls(input) {
    if (!input || destroyed) return;
    const value = String(input.value ?? "").slice(0, WHATSAPP_MAX_TEXT_LENGTH);
    state.draft = value;
    const button = host.querySelector(".whatsapp-send-button");
    if (button) button.disabled = state.sending || !value.trim();
    const counter = host.querySelector(".whatsapp-composer-meta span:last-child");
    if (counter) counter.textContent = `${value.length} / ${WHATSAPP_MAX_TEXT_LENGTH}`;
    if (state.sendError) {
      state.sendError = "";
      host.querySelector(".whatsapp-compose-error")?.remove?.();
    }
  }

  async function loadMeta({ silent = false } = {}) {
    if (destroyed) return null;
    state.loadingMeta = !silent && !state.meta;
    if (!silent) render();

    try {
      const meta = await loadWhatsAppMeta({
        signal: requestSignal(controllers, "meta", routeSignal),
        source: "views.whatsapp.index.meta",
      });
      if (destroyed) return null;
      state.meta = meta;
      state.errorMeta = "";
      return meta;
    } catch (error) {
      if (!destroyed) state.errorMeta = errorText(error, "No se pudo comprobar el canal.");
      return null;
    } finally {
      if (!destroyed) {
        state.loadingMeta = false;
        if (!silent) render();
      }
    }
  }

  async function loadIdentity(conversationId = "", { force = false } = {}) {
    const conversation = state.conversations.find(
      (item) => item?.conversationId === conversationId
    );
    if (!conversation || destroyed) return null;

    const type = cleanText(conversation.linkedEntityType, "").toLowerCase();
    const id = cleanText(conversation.linkedEntityId, "");

    if (!id || !["user", "cliente"].includes(type)) {
      state.errorIdentity = conversation.identityMatch === "ambiguous"
        ? "El teléfono coincide con más de una identidad Onion."
        : "";
      return null;
    }

    if (!force && state.identities[conversationId]) {
      return state.identities[conversationId];
    }

    const epoch = ++identityEpoch;
    state.loadingIdentity = true;
    state.errorIdentity = "";
    render();

    try {
      const signal = requestSignal(controllers, "identity", routeSignal);
      const detail = type === "user"
        ? await loadUsuarioDetail(id, {
            force,
            dedupe: true,
            allowCacheFallback: true,
            signal,
          })
        : await loadClienteDetail(id, {
            dedupe: true,
            signal,
          });

      if (destroyed || epoch !== identityEpoch || state.selectedConversationId !== conversationId) {
        return null;
      }

      if (detail) {
        state.identities[conversationId] = safeObject(detail);
        state.errorIdentity = "";
      }
      return detail || null;
    } catch (error) {
      if (!destroyed && epoch === identityEpoch) {
        state.errorIdentity = errorText(error, "No se pudo resolver la identidad Onion.");
      }
      return null;
    } finally {
      if (!destroyed && epoch === identityEpoch) {
        state.loadingIdentity = false;
        render();
      }
    }
  }

  async function loadMessages({
    conversationId = state.selectedConversationId,
    silent = false,
    scrollBottom = false,
  } = {}) {
    const id = cleanText(conversationId, "");
    if (!id || destroyed) return [];

    const epoch = ++messageEpoch;
    state.loadingMessages = !silent && !state.messages.length;
    if (!silent) render();

    try {
      const result = await loadWhatsAppMessages(id, {
        signal: requestSignal(controllers, "messages", routeSignal),
        source: "views.whatsapp.index.messages",
      });

      if (destroyed || epoch !== messageEpoch || state.selectedConversationId !== id) {
        return state.messages;
      }

      const next = safeArray(result.items);
      const changed = messageSignature(next) !== messageSignature(state.messages);
      state.messages = [...next];
      state.errorMessages = "";
      state.lastSyncAt = Date.now();

      if (changed || !silent) {
        render({ threadScroll: scrollBottom || !silent ? "bottom" : "preserve" });
      }
      return state.messages;
    } catch (error) {
      if (!destroyed && epoch === messageEpoch && state.selectedConversationId === id) {
        state.errorMessages = errorText(error, "No se pudo cargar el historial.");
        if (!silent) render();
      }
      return state.messages;
    } finally {
      if (!destroyed && epoch === messageEpoch && state.selectedConversationId === id) {
        state.loadingMessages = false;
        if (!silent && !state.errorMessages) render({ threadScroll: "bottom" });
      }
    }
  }

  async function selectConversation(conversationId = "", { preserveMobile = false } = {}) {
    const id = cleanText(conversationId, "");
    const conversation = state.conversations.find((item) => item?.conversationId === id);
    if (!conversation || destroyed) return false;

    if (state.selectedConversationId !== id) {
      state.selectedConversationId = id;
      state.messages = [];
      state.errorMessages = "";
      state.errorIdentity = "";
      state.draft = "";
      state.sendError = "";
    }

    if (!preserveMobile) state.mobilePanel = "thread";
    render();

    void loadMessages({ conversationId: id, scrollBottom: true });
    void loadIdentity(id);
    return true;
  }

  async function loadConversations({ silent = false, forceSelection = false } = {}) {
    if (destroyed) return state.conversations;

    const epoch = ++conversationEpoch;
    state.loadingConversations = !silent && !state.conversations.length;
    state.refreshing = !state.loadingConversations && !silent;
    if (!silent) render();

    try {
      const result = await loadWhatsAppConversations({
        signal: requestSignal(controllers, "conversations", routeSignal),
        source: "views.whatsapp.index.conversations",
      });

      if (destroyed || epoch !== conversationEpoch) return state.conversations;

      const next = safeArray(result.items);
      const changed = conversationSignature(next) !== conversationSignature(state.conversations);
      state.conversations = [...next];
      state.errorConversations = "";
      state.lastSyncAt = Date.now();

      const currentStillExists = state.conversations.some(
        (item) => item?.conversationId === state.selectedConversationId
      );

      if (!currentStillExists) {
        state.selectedConversationId = "";
        state.messages = [];
      }

      if (!state.selectedConversationId && state.conversations.length && forceSelection) {
        state.selectedConversationId = state.conversations[0].conversationId;
      }

      if (changed || !silent) render();

      if (state.selectedConversationId && (forceSelection || !state.identities[state.selectedConversationId])) {
        void loadIdentity(state.selectedConversationId);
      }

      return state.conversations;
    } catch (error) {
      if (!destroyed && epoch === conversationEpoch) {
        state.errorConversations = errorText(error, "No se pudo cargar la bandeja.");
        if (!silent) render();
      }
      return state.conversations;
    } finally {
      if (!destroyed && epoch === conversationEpoch) {
        state.loadingConversations = false;
        state.refreshing = false;
        if (!silent) render();
      }
    }
  }

  async function refreshAll({ silent = false } = {}) {
    if (destroyed) return false;
    const selected = state.selectedConversationId;

    await Promise.allSettled([
      loadMeta({ silent: true }),
      loadConversations({ silent }),
      selected ? loadMessages({ conversationId: selected, silent: true }) : Promise.resolve([]),
    ]);

    if (!destroyed && !silent) render();
    return true;
  }

  async function sendCurrentMessage() {
    const conversation = selectedConversation();
    const draft = String(state.draft ?? "").trim();
    if (!conversation || !draft || state.sending || destroyed) return false;

    const epoch = ++sendEpoch;
    state.sending = true;
    state.sendError = "";
    render({ focus: "draft" });

    try {
      const result = await sendWhatsAppText({
        to: conversation.waId || conversation.phone,
        text: draft,
        idempotencyKey: createIdempotencyKey(),
        signal: requestSignal(controllers, "send", routeSignal),
      });

      if (destroyed || epoch !== sendEpoch) return false;
      if (result.ok === false || result.success === false) {
        throw new Error("El backend no confirmó el envío.");
      }

      state.draft = "";
      state.sendError = "";
      showToast(result.duplicate ? "Mensaje ya confirmado anteriormente." : "Mensaje enviado.", "success");

      await Promise.allSettled([
        loadMessages({ conversationId: conversation.conversationId, silent: true, scrollBottom: true }),
        loadConversations({ silent: true }),
      ]);
      return true;
    } catch (error) {
      if (!destroyed && epoch === sendEpoch) {
        state.sendError = errorText(error, "No se pudo enviar el mensaje.");
        showToast(state.sendError, "error");
      }
      return false;
    } finally {
      if (!destroyed && epoch === sendEpoch) {
        state.sending = false;
        render({ focus: "draft", threadScroll: "bottom" });
      }
    }
  }

  function startPolling() {
    if (pollTimer || destroyed) return false;
    pollTimer = globalThis.setInterval?.(() => {
      if (destroyed || document.visibilityState === "hidden") return;
      void refreshAll({ silent: true });
    }, POLL_INTERVAL_MS) || 0;
    return Boolean(pollTimer);
  }

  function stopPolling() {
    if (!pollTimer) return false;
    try { globalThis.clearInterval?.(pollTimer); } catch { /* noop */ }
    pollTimer = 0;
    return true;
  }

  const onClick = (event) => {
    const trigger = event?.target?.closest?.("[data-whatsapp-action]");
    if (!trigger || !host.contains(trigger) || destroyed) return;
    const action = cleanText(trigger.dataset.whatsappAction, "");

    if (action === "select-conversation") {
      void selectConversation(trigger.dataset.conversationId || "");
      return;
    }
    if (action === "refresh") {
      void refreshAll({ silent: false });
      return;
    }
    if (action === "retry-messages") {
      void loadMessages({ scrollBottom: true });
      return;
    }
    if (action === "back-to-list") {
      state.mobilePanel = "list";
      render();
    }
  };

  const onInput = (event) => {
    const search = event?.target?.closest?.("[data-whatsapp-search='true']");
    if (search && host.contains(search)) {
      state.search = String(search.value ?? "");
      if (searchTimer) clearTimeout(searchTimer);
      const caret = Number.isFinite(search.selectionStart) ? search.selectionStart : state.search.length;
      searchTimer = setTimeout(() => {
        searchTimer = 0;
        render({ focus: "search", caret });
      }, SEARCH_DEBOUNCE_MS);
      return;
    }

    const draft = event?.target?.closest?.("[data-whatsapp-draft='true']");
    if (draft && host.contains(draft)) syncDraftControls(draft);
  };

  const onKeyDown = (event) => {
    const draft = event?.target?.closest?.("[data-whatsapp-draft='true']");
    if (!draft || !host.contains(draft) || destroyed) return;
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      syncDraftControls(draft);
      void sendCurrentMessage();
    }
  };

  const onSubmit = (event) => {
    const form = event?.target?.closest?.("[data-whatsapp-composer='true']");
    if (!form || !host.contains(form) || destroyed) return;
    event.preventDefault();
    const draft = form.querySelector("[data-whatsapp-draft='true']");
    if (draft) syncDraftControls(draft);
    void sendCurrentMessage();
  };

  host.addEventListener("click", onClick);
  host.addEventListener("input", onInput);
  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("submit", onSubmit);

  render();

  // La ruta queda visible ya. La red nunca bloquea el commit del Router.
  void Promise.allSettled([
    loadMeta(),
    loadConversations({ forceSelection: true }),
  ]).then(() => {
    if (destroyed) return;
    if (state.selectedConversationId) {
      void loadMessages({ scrollBottom: true });
      void loadIdentity(state.selectedConversationId);
    }
  });
  startPolling();

  const controller = {
    version: WHATSAPP_VIEW_VERSION,
    apiVersion: WHATSAPP_API_VERSION,
    templateVersion: WHATSAPP_TEMPLATE_VERSION,
    path: WHATSAPP_CANONICAL_PATH,
    state,
    render,
    refresh: refreshAll,
    reload: refreshAll,
    selectConversation,
    send: sendCurrentMessage,
    destroy() {
      if (destroyed) return true;
      destroyed = true;
      conversationEpoch += 1;
      messageEpoch += 1;
      identityEpoch += 1;
      sendEpoch += 1;
      stopPolling();
      if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = 0;
      }
      abortAll(controllers);
      host.removeEventListener("click", onClick);
      host.removeEventListener("input", onInput);
      host.removeEventListener("keydown", onKeyDown);
      host.removeEventListener("submit", onSubmit);
      host.replaceChildren();
      return true;
    },
  };

  controller.cleanup = controller.destroy;
  controller.unmount = controller.destroy;
  controller.dispose = controller.destroy;
  return controller;
}

export default WhatsAppView;
