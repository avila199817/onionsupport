/* =========================================================
   Onion Support - Correo View
   Archivo: /src/views/correo/index.js

   PRODUCTIVO · MICROSOFT 365

   Responsabilidad:
   - Controlar la experiencia Outlook del panel privado.
   - Consumir exclusivamente correo.api.js.
   - Mantener OAuth fuera del navegador salvo navegación a Microsoft.
   - Render incremental, carreras controladas y limpieza al desmontar.
========================================================= */

import CorreoApi from "./correo.api.js";
import {
  CORREO_TEMPLATE_VERSION,
  escapeHtml,
  formatBytes,
  icon,
  renderComposeModal,
  renderConnectionCard,
  renderFolderRows,
  renderMessageRows,
  renderMoveMenu,
  renderReader,
  renderShell,
} from "./correo.template.js";

export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v2";

const INSTANCES = new WeakMap();
let lastInstance = null;

function isDomNode(value = null) {
  return Boolean(typeof Node !== "undefined" && value && value instanceof Node);
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}

function safeLower(value = "") {
  return cleanText(value, "").toLocaleLowerCase("es-ES");
}

function errorMessage(error = null, fallback = "No se pudo completar la operación.") {
  return cleanText(
    error?.message || error?.data?.message || error?.response?.message || error?.code,
    fallback
  );
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
  return [...new Set(
    String(value ?? "")
      .split(/[;,\n]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function isLikelyEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function createCorreoController(host, context = {}) {
  const externalSignal = context?.signal || null;
  const aborter = new AbortController();
  const signal = aborter.signal;

  let mounted = false;
  let destroyed = false;
  let searchTimer = null;
  let listSequence = 0;
  let readerSequence = 0;

  const state = {
    status: Object.freeze({ connected: false, healthy: null, mailbox: "" }),
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
    loadingReader: false,
    busyAction: "",
  };

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
    host.innerHTML = renderShell(state);
    host.dataset.view = "correo";
    host.setAttribute("data-correo-host", "true");
  }

  function renderAccount() {
    const target = host.querySelector("[data-correo-account-card]");
    if (target) target.innerHTML = renderConnectionCard(state.status);
  }

  function renderFolders() {
    const target = host.querySelector("[data-correo-folders]");
    if (target) target.innerHTML = renderFolderRows(state.folders, state.selectedFolderId);
  }

  function renderList() {
    const target = host.querySelector("[data-correo-message-list]");
    if (target) {
      target.setAttribute("aria-busy", state.loadingMessages ? "true" : "false");
      target.innerHTML = state.loadingMessages
        ? Array.from({ length: 6 }, (_, index) => `<div class="correo-message-skeleton" aria-hidden="true" style="--i:${index}"><span></span><div><i></i><i></i><i></i></div></div>`).join("")
        : renderMessageRows(state.messages, state.selectedMessageId);
    }

    const count = host.querySelector("[data-correo-count]");
    if (count) count.textContent = `${state.messages.length} ${state.messages.length === 1 ? "mensaje" : "mensajes"}`;

    const title = host.querySelector("[data-correo-folder-title]");
    if (title) title.textContent = state.selectedFolderName || "Correo";

    const pagination = host.querySelector("[data-correo-pagination]");
    if (pagination) pagination.hidden = !state.nextCursor;
  }

  function renderReaderRegion() {
    const target = host.querySelector("[data-correo-reader]");
    if (target) target.innerHTML = renderReader(state.selectedMessage, state.attachments, state.loadingReader);
  }

  function setBusy(action = "") {
    state.busyAction = action;
    const modal = host.querySelector("[data-correo-compose-form]");
    if (modal) {
      for (const element of modal.querySelectorAll("button, input, textarea")) {
        element.disabled = Boolean(action);
      }
      const status = modal.querySelector("[data-correo-compose-status]");
      if (status) status.textContent = action ? "Procesando…" : "";
    }
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

  async function loadStatus({ probe = false, initial = false } = {}) {
    try {
      state.loading = initial;
      if (initial) renderAll();
      state.status = await CorreoApi.getStatus(apiOptions({ probe }));

      if (state.status.connected) {
        await loadWorkspace({ initial: true });
      } else {
        state.loading = false;
        state.folders = [];
        state.messages = [];
        state.selectedMessage = null;
        renderAll();
      }
    } catch (error) {
      if (signal.aborted) return;
      state.loading = false;
      state.status = Object.freeze({ connected: false, healthy: false, mailbox: "" });
      renderAll();
      notice(errorMessage(error, "No se pudo comprobar la conexión con Microsoft."), "error");
      toast(errorMessage(error, "No se pudo comprobar Microsoft 365."), "error");
    }
  }

  async function loadWorkspace({ initial = false } = {}) {
    if (initial) {
      state.loading = false;
      renderAll();
    }

    notice(`Sincronizando ${state.status.mailbox || "Microsoft 365"}…`);

    try {
      const [folders, profile] = await Promise.all([
        CorreoApi.folders(apiOptions()),
        CorreoApi.profile(apiOptions()).catch(() => null),
      ]);

      if (profile?.displayName && profile.displayName !== state.status.displayName) {
        state.status = Object.freeze({ ...state.status, displayName: profile.displayName });
      }

      state.folders = sortFolders(folders);
      const selectedExists = state.folders.some((folder) => folder.id === state.selectedFolderId);
      const first = selectedExists
        ? state.folders.find((folder) => folder.id === state.selectedFolderId)
        : findInbox(state.folders);

      state.selectedFolderId = first?.id || "inbox";
      state.selectedFolderName = first?.displayName || "Bandeja de entrada";

      renderAccount();
      renderFolders();
      await loadMessages({ openFirst: true });
      notice(`Outlook conectado · ${state.status.mailbox || "Microsoft 365"}`, "success");
    } catch (error) {
      if (signal.aborted) return;
      const code = errorCode(error);
      if (/MICROSOFT_(NOT_CONNECTED|TOKEN|CACHE|ACCOUNT)/.test(code)) {
        state.status = Object.freeze({ ...state.status, connected: false, healthy: false });
        renderAll();
      }
      notice(errorMessage(error, "No se pudo sincronizar el correo."), "error");
      toast(errorMessage(error, "No se pudo cargar Outlook."), "error");
    }
  }

  async function loadMessages({ append = false, openFirst = false } = {}) {
    if (!state.status.connected) return;
    const sequence = ++listSequence;

    if (!append) {
      state.loadingMessages = true;
      state.nextCursor = "";
      renderList();
    }

    try {
      const result = await CorreoApi.messages(apiOptions({
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

      if (!state.messages.some((item) => item.id === state.selectedMessageId)) {
        state.selectedMessageId = "";
        state.selectedMessage = null;
        state.attachments = [];
      }

      renderList();

      if (openFirst && !state.selectedMessageId && state.messages[0]?.id) {
        await openMessage(state.messages[0].id);
      } else {
        renderReaderRegion();
      }
    } catch (error) {
      if (sequence !== listSequence || signal.aborted) return;
      state.loadingMessages = false;
      renderList();
      toast(errorMessage(error, "No se pudieron cargar los mensajes."), "error");
    }
  }

  async function openMessage(id = "") {
    const messageId = cleanText(id, "");
    if (!messageId) return;

    const sequence = ++readerSequence;
    state.selectedMessageId = messageId;
    state.loadingReader = true;
    state.selectedMessage = null;
    state.attachments = [];
    renderList();
    renderReaderRegion();

    try {
      const summary = state.messages.find((item) => item.id === messageId) || null;
      const [detail, attachments] = await Promise.all([
        CorreoApi.message(messageId, apiOptions()),
        summary?.hasAttachments
          ? CorreoApi.attachments(messageId, apiOptions()).catch(() => [])
          : Promise.resolve([]),
      ]);

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
          const updated = await CorreoApi.updateMessage(messageId, { isRead: true }, apiOptions());
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
          // Leer el mensaje no debe fallar porque no se pudo marcar leído.
        }
      }
    } catch (error) {
      if (sequence !== readerSequence || signal.aborted) return;
      state.loadingReader = false;
      state.selectedMessage = null;
      renderReaderRegion();
      toast(errorMessage(error, "No se pudo abrir el mensaje."), "error");
    }
  }

  async function connect() {
    if (state.busyAction) return;
    state.busyAction = "connect";
    notice("Preparando autorización segura con Microsoft…");

    try {
      const connection = await CorreoApi.connect(apiOptions());
      window.location.assign(connection.authorizationUrl);
    } catch (error) {
      state.busyAction = "";
      toast(errorMessage(error, "No se pudo iniciar la autorización de Microsoft."), "error");
      notice("No se pudo iniciar Microsoft OAuth.", "error");
    }
  }

  async function disconnect() {
    if (!window.confirm("¿Desconectar Outlook de Onion Support? Tendrás que autorizarlo de nuevo para volver a usar correo.")) return;

    try {
      notice("Desconectando Outlook…");
      await CorreoApi.disconnect(apiOptions());
      state.status = Object.freeze({ connected: false, healthy: null, mailbox: state.status.mailbox });
      state.folders = [];
      state.messages = [];
      state.selectedMessage = null;
      state.attachments = [];
      renderAll();
      toast("Outlook desconectado.", "success");
    } catch (error) {
      toast(errorMessage(error, "No se pudo desconectar Outlook."), "error");
    }
  }

  function openCompose(mode = "compose") {
    const modalRoot = host.querySelector("[data-correo-modal-root]");
    if (!modalRoot) return;

    const message = state.selectedMessage || {};
    let input = { mode, messageId: message.id || "" };

    if (mode === "reply") {
      input = { ...input, body: "" };
    } else if (mode === "reply-all") {
      input = { ...input, body: "" };
    } else if (mode === "forward") {
      input = { ...input, subject: message.subject || "", body: "" };
    }

    modalRoot.innerHTML = renderComposeModal(input);
    document.documentElement.classList.add("correo-modal-open");
    requestAnimationFrame(() => modalRoot.querySelector("input, textarea")?.focus());
  }

  function closeModal() {
    if (state.busyAction) return;
    const root = host.querySelector("[data-correo-modal-root]");
    if (root) root.replaceChildren();
    document.documentElement.classList.remove("correo-modal-open");
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
      setBusy("send");
      const payload = composePayload(form);

      if (mode === "reply" || mode === "reply-all") {
        if (!messageId) throw new Error("No hay mensaje al que responder.");
        if (mode === "reply-all") await CorreoApi.replyAll(messageId, payload.body, apiOptions());
        else await CorreoApi.reply(messageId, payload.body, apiOptions());
        toast("Respuesta enviada.", "success");
      } else if (mode === "forward") {
        if (!messageId) throw new Error("No hay mensaje que reenviar.");
        if (!payload.to.length) throw new Error("Indica al menos un destinatario.");
        await CorreoApi.forward(messageId, { to: payload.to, comment: payload.body }, apiOptions());
        toast("Mensaje reenviado.", "success");
      } else {
        if (!payload.to.length) throw new Error("Indica al menos un destinatario.");
        const files = selectedFiles(form);
        if (files.some((file) => file.size > 25 * 1024 * 1024)) {
          throw new Error("Cada adjunto debe ser de 25 MB o menos.");
        }

        if (!files.length) {
          await CorreoApi.send(payload, apiOptions());
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
        }
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
      setBusy("draft");
      const payload = composePayload(form);
      const files = selectedFiles(form);
      const draft = await CorreoApi.createDraft(payload, apiOptions());
      if (!draft.id) throw new Error("No se pudo crear el borrador.");

      const status = form.querySelector("[data-correo-compose-status]");
      for (let index = 0; index < files.length; index += 1) {
        if (files[index].size > 25 * 1024 * 1024) throw new Error(`${files[index].name} supera 25 MB.`);
        if (status) status.textContent = `Adjuntando ${index + 1}/${files.length}…`;
        await CorreoApi.uploadAttachment(draft.id, files[index], apiOptions());
      }

      setBusy("");
      closeModal();
      toast("Borrador guardado en Outlook.", "success");
      await loadMessages({ openFirst: false });
    } catch (error) {
      setBusy("");
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
    if (!window.confirm(`¿Eliminar “${message.subject || "este mensaje"}”?`)) return;

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

    const original = button.innerHTML;
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
      if (!button.innerHTML) button.innerHTML = original;
    }
  }

  async function sendOpenDraft() {
    const id = state.selectedMessage?.id;
    if (!id || !state.selectedMessage?.isDraft) return;
    if (!window.confirm("¿Enviar este borrador ahora?")) return;

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

  async function onClick(event) {
    if (destroyed) return;
    const target = event.target?.closest?.("[data-correo-action]");
    if (!target || !host.contains(target)) return;

    const action = cleanText(target.dataset.correoAction, "");
    if (!action) return;

    if (action === "connect") return connect();
    if (action === "disconnect") return disconnect();
    if (action === "refresh") return loadWorkspace({ initial: false });
    if (action === "compose") return openCompose("compose");
    if (action === "close-modal") return closeModal();
    if (action === "folder") return selectFolder(target);
    if (action === "select-message") return openMessage(target.dataset.correoMessageId);
    if (action === "load-more") return loadMessages({ append: true, openFirst: false });
    if (action === "reply") return openCompose("reply");
    if (action === "reply-all") return openCompose("reply-all");
    if (action === "forward") return openCompose("forward");
    if (action === "toggle-read") return updateSelected({ isRead: !state.selectedMessage?.isRead }, state.selectedMessage?.isRead ? "Marcado como no leído." : "Marcado como leído.");
    if (action === "toggle-flag") return updateSelected({ flagStatus: state.selectedMessage?.flag?.flagStatus === "flagged" ? "notFlagged" : "flagged" }, state.selectedMessage?.flag?.flagStatus === "flagged" ? "Destacado eliminado." : "Mensaje destacado.");
    if (action === "delete-message") return deleteSelected();
    if (action === "move-menu") return openMoveMenu(target);
    if (action === "move-to") return moveSelected(target.dataset.correoDestinationId);
    if (action === "download-attachment") return downloadAttachment(target);
    if (action === "save-draft") {
      const form = target.closest("[data-correo-compose-form]");
      if (form) return saveDraft(form);
    }
    if (action === "send-open-draft") return sendOpenDraft();
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

  function onInput(event) {
    if (destroyed) return;
    const target = event.target;

    if (target?.matches?.("[data-correo-search]")) {
      state.searchTerm = cleanText(target.value, "");
      if (state.searchTerm) {
        state.activeFilter = "all";
        for (const button of host.querySelectorAll("[data-correo-filter]")) {
          const active = button.dataset.correoFilter === "all";
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        }
      }
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadMessages({ openFirst: true }), 420);
      return;
    }

    if (target?.matches?.("[data-correo-attachments-input]")) {
      const summary = target.closest(".correo-file-picker")?.querySelector("[data-correo-file-summary]");
      const files = [...(target.files || [])];
      if (summary) {
        const total = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
        summary.textContent = files.length
          ? `${files.length} archivo${files.length === 1 ? "" : "s"} · ${formatBytes(total)}`
          : "Sin adjuntos";
      }
    }
  }

  function onSubmit(event) {
    const form = event.target?.closest?.("[data-correo-compose-form]");
    if (!form || !host.contains(form)) return;
    event.preventDefault();
    sendCompose(form);
  }

  function onKeydown(event) {
    if (destroyed) return;
    const modalOpen = Boolean(host.querySelector("[data-correo-compose-form]"));

    if (event.key === "Escape") {
      if (modalOpen && !state.busyAction) {
        event.preventDefault();
        closeModal();
      } else {
        host.querySelector("[data-correo-move-popover]")?.remove();
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
    if (!popover) return;
    if (popover.contains(event.target) || event.target?.closest?.("[data-correo-action='move-menu']")) return;
    popover.remove();
  }

  async function mount() {
    if (destroyed || mounted || !host) return controller;
    if (externalSignal?.aborted) return controller;

    if (externalSignal) {
      externalSignal.addEventListener("abort", () => aborter.abort(), { once: true });
    }

    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("click", onDocumentClick);

    mounted = true;
    renderAll();
    const oauthNotice = consumeOauthQuery();
    await loadStatus({ probe: true, initial: true });
    if (oauthNotice && !destroyed) {
      toast(oauthNotice.message, oauthNotice.tone, oauthNotice.timeout);
    }
    return controller;
  }

  function destroy(options = {}) {
    if (destroyed) return true;
    destroyed = true;
    mounted = false;
    clearTimeout(searchTimer);
    aborter.abort();

    host.removeEventListener("click", onClick);
    host.removeEventListener("input", onInput);
    host.removeEventListener("submit", onSubmit);
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("click", onDocumentClick);
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
      await loadStatus({ probe: true, initial: false });
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
        networkEnabled: true,
        microsoftGraph: true,
      });
    },
  };

  return controller;
}

export function CorreoView(host = null, context = {}) {
  if (!isDomNode(host)) return null;

  try {
    INSTANCES.get(host)?.destroy?.({ keepDom: false });
  } catch {
    // noop
  }

  const controller = createCorreoController(host, context && typeof context === "object" ? context : {});
  INSTANCES.set(host, controller);
  lastInstance = controller;
  controller.mount();
  return controller;
}

export function destroy(options = {}) {
  try {
    return Boolean(lastInstance?.destroy?.(options));
  } catch {
    return false;
  }
}

export function getSnapshot() {
  try {
    return lastInstance?.getSnapshot?.() || Object.freeze({
      version: CORREO_VIEW_VERSION,
      mounted: false,
      connected: false,
      networkEnabled: true,
      microsoftGraph: true,
    });
  } catch {
    return Object.freeze({
      version: CORREO_VIEW_VERSION,
      mounted: false,
      connected: false,
      networkEnabled: true,
      microsoftGraph: true,
    });
  }
}

export default CorreoView;
