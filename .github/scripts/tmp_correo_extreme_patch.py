#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "src/views/correo/index.js"
TEMPLATE = ROOT / "src/views/correo/correo.template.js"
CSS_INDEX = ROOT / "src/css/views/correo/index.css"
CSS_VIEWPORT = ROOT / "src/css/views/correo/viewport.css"
ROUTE_STYLES = ROOT / "src/router/styles.js"
REPO_WORKFLOW = ROOT / ".github/workflows/repo-integrity.yml"
CONTRACT = ROOT / ".github/scripts/correo_integrity.py"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def replace_one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 anchor, found {count}")
    return text.replace(old, new, 1)


def assert_absent(text: str, needle: str, label: str) -> None:
    if needle in text:
        raise SystemExit(f"{label}: forbidden marker remains: {needle}")


index = read(INDEX)
template = read(TEMPLATE)
viewport = read(CSS_VIEWPORT)
route_styles = read(ROUTE_STYLES)
repo_workflow = read(REPO_WORKFLOW)

# ---------------------------------------------------------------------------
# Controller: cache ownership/TTL, request cancellation, accessible modals,
# draft editing and IME-safe search.
# ---------------------------------------------------------------------------
index = replace_one(
    index,
    'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v6-canonical-user";',
    'export const CORREO_VIEW_VERSION = "correo.view.microsoft.production.v7-extreme-canonical";',
    "view version",
)

index = replace_one(
    index,
    '  renderComposeModal,\n  renderConnectionCard,',
    '  renderComposeModal,\n  renderConfirmModal,\n  renderConnectionCard,',
    "confirm import",
)

index = replace_one(
    index,
    'const MAX_NOTIFICATION_IDS = 80;\n',
    'const MAX_NOTIFICATION_IDS = 80;\nconst VIEW_CACHE_TTL_MS = 60_000;\n',
    "cache TTL constant",
)

index = replace_one(
    index,
    'const VIEW_CACHE = {\n  status: null,',
    'const VIEW_CACHE = {\n  ownerKey: "",\n  status: null,',
    "cache owner field",
)

index = replace_one(
    index,
    '''  const displayName = cleanText(user?.displayName, "Usuario");
  const avatarUrl = sanitizeRuntimeImageUrl(user?.avatarUrl || "");

  return Object.freeze({
    displayName,
    avatarUrl,
    initials: initialsFrom(displayName),
  });''',
    '''  const displayName = cleanText(user?.displayName, "Usuario");
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
  });''',
    "user cache key",
)

index = replace_one(
    index,
    '''function cloneCacheIntoState(state) {
  if (!VIEW_CACHE.statusKnown || !VIEW_CACHE.status) return;
  state.status = VIEW_CACHE.status;''',
    '''function cloneCacheIntoState(state, ownerKey = "") {
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
  state.status = VIEW_CACHE.status;''',
    "cache hydrate guard",
)

index = replace_one(
    index,
    '''function writeViewCache(state) {
  VIEW_CACHE.status = state.status;''',
    '''function writeViewCache(state) {
  const ownerKey = cleanText(state?.accountUser?.cacheKey, "");
  if (!ownerKey) return;
  VIEW_CACHE.ownerKey = ownerKey;
  VIEW_CACHE.status = state.status;''',
    "cache write owner",
)

index = replace_one(
    index,
    '''function clearViewCache() {
  VIEW_CACHE.status = null;''',
    '''function clearViewCache() {
  VIEW_CACHE.ownerKey = "";
  VIEW_CACHE.status = null;''',
    "cache clear owner",
)

index = replace_one(
    index,
    '''  let searchTimer = null;
  let listSequence = 0;
  let readerSequence = 0;
  let infiniteScheduled = false;''',
    '''  let searchTimer = null;
  let searchComposing = false;
  let listSequence = 0;
  let readerSequence = 0;
  let listAbortController = null;
  let readerAbortController = null;
  let infiniteScheduled = false;
  let modalReturnFocus = null;
  let confirmResolver = null;''',
    "controller runtime state",
)

index = replace_one(
    index,
    '  cloneCacheIntoState(state);',
    '  cloneCacheIntoState(state, state.accountUser.cacheKey);',
    "cache hydrate call",
)

index = replace_one(
    index,
    '''    const folder = state.folders.find((item) => item.id === state.selectedFolderId);
    const total = Math.max(Number(folder?.totalItemCount) || 0, state.messages.length);
    const count = host.querySelector("[data-correo-count]");
    if (count) count.textContent = `${total} ${total === 1 ? "mensaje" : "mensajes"}`;
    const title = host.querySelector("[data-correo-folder-title]");
    if (title) title.textContent = state.selectedFolderName || "Correo";
    writeViewCache(state);''',
    '''    writeViewCache(state);''',
    "dead list DOM writes",
)

# Modal accessibility and custom confirmation helper.
index = replace_one(
    index,
    '''  function setBusy(action = "") {
    state.busyAction = action;
    const modal = host.querySelector("[data-correo-compose-form]");
    if (!modal) return;
    for (const element of modal.querySelectorAll("button, input, textarea")) element.disabled = Boolean(action);
    const status = modal.querySelector("[data-correo-compose-status]");
    if (status) status.textContent = action ? "Procesando…" : "";
  }

  function consumeOauthQuery() {''',
    '''  function setBusy(action = "") {
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

  function consumeOauthQuery() {''',
    "modal accessibility helpers",
)

# Replace list loading with an abortable request owner.
index = replace_one(
    index,
    '''    const sequence = ++listSequence;

    if (append) {''',
    '''    const sequence = ++listSequence;
    listAbortController?.abort();
    const requestAbort = new AbortController();
    listAbortController = requestAbort;
    if (signal.aborted) requestAbort.abort();
    else signal.addEventListener("abort", () => requestAbort.abort(), { once: true });

    if (append) {''',
    "list request abort owner",
)

index = replace_one(
    index,
    '''      const result = await CorreoApi.messages(apiOptions({
        cursor: append ? state.nextCursor : "",
        folder: state.selectedFolderId || "inbox",
        top: 35,
        q: state.searchTerm,
        filter: state.searchTerm ? "" : state.activeFilter === "all" ? "" : state.activeFilter,
      }));''',
    '''      const result = await CorreoApi.messages(apiOptions({
        signal: requestAbort.signal,
        cursor: append ? state.nextCursor : "",
        folder: state.selectedFolderId || "inbox",
        top: 35,
        q: state.searchTerm,
        filter: state.searchTerm ? "" : state.activeFilter === "all" ? "" : state.activeFilter,
      }));''',
    "list request signal",
)

index = replace_one(
    index,
    '''    } catch (error) {
      if (sequence !== listSequence || signal.aborted) return;
      state.loadingMessages = false;''',
    '''    } catch (error) {
      if (sequence !== listSequence || signal.aborted || requestAbort.signal.aborted) return;
      state.loadingMessages = false;''',
    "list abort catch",
)

# Reader request cancellation + attachment truth from detail.
index = replace_one(
    index,
    '''    const sequence = ++readerSequence;
    state.selectedMessageId = messageId;''',
    '''    const sequence = ++readerSequence;
    readerAbortController?.abort();
    const requestAbort = new AbortController();
    readerAbortController = requestAbort;
    if (signal.aborted) requestAbort.abort();
    else signal.addEventListener("abort", () => requestAbort.abort(), { once: true });
    state.selectedMessageId = messageId;''',
    "reader request abort owner",
)

index = replace_one(
    index,
    '''      const summary = state.messages.find((item) => item.id === messageId) || null;
      const [detail, attachments] = await Promise.all([
        CorreoApi.message(messageId, apiOptions()),
        summary?.hasAttachments ? CorreoApi.attachments(messageId, apiOptions()).catch(() => []) : Promise.resolve([]),
      ]);''',
    '''      const summary = state.messages.find((item) => item.id === messageId) || null;
      const attachmentPromise = summary?.hasAttachments
        ? CorreoApi.attachments(messageId, apiOptions({ signal: requestAbort.signal })).catch(() => [])
        : null;
      const detail = await CorreoApi.message(messageId, apiOptions({ signal: requestAbort.signal }));
      const attachments = attachmentPromise
        ? await attachmentPromise
        : detail.hasAttachments
          ? await CorreoApi.attachments(messageId, apiOptions({ signal: requestAbort.signal })).catch(() => [])
          : [];''',
    "reader attachment truth",
)

index = replace_one(
    index,
    '          const updated = await CorreoApi.updateMessage(messageId, { isRead: true }, apiOptions());',
    '          const updated = await CorreoApi.updateMessage(messageId, { isRead: true }, apiOptions({ signal: requestAbort.signal }));',
    "reader read-state signal",
)

index = replace_one(
    index,
    '''    } catch (error) {
      if (sequence !== readerSequence || signal.aborted) return;
      state.loadingReader = false;''',
    '''    } catch (error) {
      if (sequence !== readerSequence || signal.aborted || requestAbort.signal.aborted) return;
      state.loadingReader = false;''',
    "reader abort catch",
)

# Replace native confirmations.
index = replace_one(
    index,
    '''  async function disconnect() {
    if (!window.confirm("¿Desconectar esta cuenta de Outlook de Onion Support?")) return;
    try {''',
    '''  async function disconnect() {
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
    try {''',
    "disconnect confirm",
)

index = replace_one(
    index,
    '''  async function deleteSelected() {
    const message = state.selectedMessage;
    if (!message?.id) return;
    if (!window.confirm(`¿Eliminar “${message.subject || "este mensaje"}”?`)) return;
    try {''',
    '''  async function deleteSelected() {
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
    try {''',
    "delete confirm",
)

index = replace_one(
    index,
    '''  async function sendOpenDraft() {
    const id = state.selectedMessage?.id;
    if (!id || !state.selectedMessage?.isDraft) return;
    if (!window.confirm("¿Enviar este borrador ahora?")) return;
    try {''',
    '''  async function sendOpenDraft() {
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
    try {''',
    "send draft confirm",
)

# Compose supports real draft editing and focus restoration.
index = replace_one(
    index,
    '''  function openCompose(mode = "compose") {
    const modalRoot = host.querySelector("[data-correo-modal-root]");
    if (!modalRoot) return;
    const message = state.selectedMessage || {};
    let input = { mode, messageId: message.id || "" };
    if (mode === "forward") input = { ...input, subject: message.subject || "", body: "" };
    modalRoot.innerHTML = renderComposeModal(input);
    document.documentElement.classList.add("correo-modal-open");''',
    '''  function openCompose(mode = "compose") {
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
    document.documentElement.classList.add("correo-modal-open");''',
    "draft edit compose",
)

index = replace_one(
    index,
    '''  function closeModal() {
    if (state.busyAction) return;
    const root = host.querySelector("[data-correo-modal-root]");
    if (root) root.replaceChildren();
    document.documentElement.classList.remove("correo-modal-open");
  }''',
    '''  function closeModal() {
    if (state.busyAction || confirmResolver) return;
    const root = host.querySelector("[data-correo-modal-root]");
    if (root) root.replaceChildren();
    document.documentElement.classList.remove("correo-modal-open");
    restoreModalFocus();
  }''',
    "compose close focus",
)

# sendCompose: existing draft gets updated, attachments appended, then sent.
index = replace_one(
    index,
    '''      if ((mode === "compose" || mode === "forward") && !payload.to.length) throw new Error("Indica al menos un destinatario válido.");
      if (files.some((file) => file.size > 25 * 1024 * 1024)) throw new Error("Cada adjunto debe ser de 25 MB o menos.");
      setBusy("send");

      if (mode === "reply" || mode === "reply-all") {''',
    '''      if ((mode === "compose" || mode === "forward" || mode === "draft-edit") && !payload.to.length) throw new Error("Indica al menos un destinatario válido.");
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
      } else if (mode === "reply" || mode === "reply-all") {''',
    "draft edit send",
)

index = replace_one(
    index,
    '''  async function saveDraft(form) {
    if (state.busyAction) return;
    try {
      const payload = composePayload(form);
      const files = selectedFiles(form);
      for (const file of files) if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} supera 25 MB.`);
      setBusy("draft");
      const draft = await CorreoApi.createDraft(payload, apiOptions());
      if (!draft.id) throw new Error("No se pudo crear el borrador.");
      const status = form.querySelector("[data-correo-compose-status]");
      for (let index = 0; index < files.length; index += 1) {
        if (status) status.textContent = `Adjuntando ${index + 1}/${files.length}…`;
        await CorreoApi.uploadAttachment(draft.id, files[index], apiOptions());
      }
      setBusy("");
      closeModal();
      toast("Borrador guardado en Outlook.", "success");
      await loadMessages({ openFirst: false });
    } catch (error) {''',
    '''  async function saveDraft(form) {
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
    } catch (error) {''',
    "draft save update",
)

# Action contract: add edit-draft; remove fake multiaaccount UI.
index = replace_one(
    index,
    '''    if (action === "send-open-draft") return sendOpenDraft();
    if (action === "account-menu") return toggleAccountMenu(target);''',
    '''    if (action === "send-open-draft") return sendOpenDraft();
    if (action === "edit-draft") return openCompose("draft-edit");
    if (action === "account-menu") return toggleAccountMenu(target);''',
    "edit draft action",
)

fake_account = '''    if (action === "add-account") {
      closeAccountMenu();
      return toast("Multicuenta ya tiene la interfaz preparada. El backend productivo actual sigue vinculado a una única cuenta Microsoft; no voy a simular una segunda conexión.", "info", 7000);
    }
'''
index = replace_one(index, fake_account, "", "remove fake add account handler")

# Search is IME-safe and aborts obsolete list requests through loadMessages.
search_block = '''  function onInput(event) {
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
'''
search_new = '''  function applySearchInput(target) {
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
'''
index = replace_one(index, search_block, search_new, "IME search")

# Confirm and compose focus trap / keyboard semantics.
index = replace_one(
    index,
    '''  function onKeydown(event) {
    if (destroyed) return;
    const modalOpen = Boolean(host.querySelector("[data-correo-compose-form]"));
    if (event.key === "Escape") {
      if (modalOpen && !state.busyAction) {
        event.preventDefault();
        closeModal();
      } else {
        host.querySelector("[data-correo-move-popover]")?.remove();
        closeAccountMenu();
      }
      return;
    }''',
    '''  function onKeydown(event) {
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
    }''',
    "modal keyboard trap",
)

index = replace_one(
    index,
    '''    if (action === "connect") return connect();
    if (action === "disconnect") return disconnect();''',
    '''    if (action === "confirm-accept") return closeConfirm(true);
    if (action === "confirm-cancel") return closeConfirm(false);
    if (action === "connect") return connect();
    if (action === "disconnect") return disconnect();''',
    "confirm actions",
)

index = replace_one(
    index,
    '''    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("submit", onSubmit);''',
    '''    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("compositionstart", onCompositionStart);
    host.addEventListener("compositionend", onCompositionEnd);
    host.addEventListener("submit", onSubmit);''',
    "composition listeners add",
)

index = replace_one(
    index,
    '''    clearTimeout(searchTimer);
    aborter.abort();
    host.removeEventListener("click", onClick);
    host.removeEventListener("input", onInput);
    host.removeEventListener("submit", onSubmit);''',
    '''    clearTimeout(searchTimer);
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
    host.removeEventListener("submit", onSubmit);''',
    "composition listeners remove",
)

index = replace_one(
    index,
    '''        notifications: notificationUiState().enabled,
        infiniteScroll: true,''',
    '''        notifications: notificationUiState().enabled,
        cacheIsolated: true,
        cacheTtlMs: VIEW_CACHE_TTL_MS,
        routeCommitNonBlocking: true,
        infiniteScroll: true,''',
    "snapshot architecture",
)

# ---------------------------------------------------------------------------
# Template: remove fake multiaaccount, hardcoded mailbox and dead sentinel;
# expose draft editing and Onion confirmation dialog.
# ---------------------------------------------------------------------------
template = replace_one(
    template,
    'export const CORREO_TEMPLATE_VERSION = "correo.template.microsoft.production.v6-final-polish";',
    'export const CORREO_TEMPLATE_VERSION = "correo.template.microsoft.production.v7-extreme-canonical";',
    "template version",
)

template = replace_one(
    template,
    '  userPlus: `<svg ${SVG}><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>`,\n',
    '',
    "remove userPlus icon",
)

template = replace_one(
    template,
    '''        ${message.isDraft
          ? `<button class="correo-btn correo-btn--primary" type="button" data-correo-action="send-open-draft">${icon("send")}<span>Enviar borrador</span></button>`
          : `<button class="correo-btn correo-btn--primary" type="button" data-correo-action="reply">${icon("reply")}<span>Responder</span></button><button class="correo-btn" type="button" data-correo-action="reply-all">${icon("replyAll")}<span>Responder a todos</span></button><button class="correo-btn" type="button" data-correo-action="forward">${icon("forward")}<span>Reenviar</span></button>`}''',
    '''        ${message.isDraft
          ? `<button class="correo-btn" type="button" data-correo-action="edit-draft">${icon("edit")}<span>Editar borrador</span></button><button class="correo-btn correo-btn--primary" type="button" data-correo-action="send-open-draft">${icon("send")}<span>Enviar borrador</span></button>`
          : `<button class="correo-btn correo-btn--primary" type="button" data-correo-action="reply">${icon("reply")}<span>Responder</span></button><button class="correo-btn" type="button" data-correo-action="reply-all">${icon("replyAll")}<span>Responder a todos</span></button><button class="correo-btn" type="button" data-correo-action="forward">${icon("forward")}<span>Reenviar</span></button>`}''',
    "draft reader actions",
)

template = replace_one(
    template,
    '  const mailbox = cleanText(status.mailbox, "cristian@onionsupport.com");',
    '  const mailbox = cleanText(status.mailbox, "Microsoft 365");',
    "mailbox fallback",
)

template = replace_one(
    template,
    '''        <button type="button" role="menuitem" data-correo-action="add-account">${icon("userPlus")}<span><strong>Añadir otra cuenta</strong><small>Interfaz preparada · requiere backend multicuenta</small></span></button>
''',
    '',
    "fake account menu",
)

template = replace_one(
    template,
    '''        <div class="correo-message-list" data-correo-message-list aria-busy="${loadingMessages || loadingMore ? "true" : "false"}">${loadingMessages ? renderMessageSkeletons() : renderMessageRows(messages, selectedMessageId)}${loadingMore ? `<div class="correo-infinite-loader">${icon("spinner")}<span>Cargando correos anteriores…</span></div>` : ""}</div>
        <div class="correo-infinite-sentinel" data-correo-infinite-sentinel aria-hidden="true"></div>''',
    '''        <div class="correo-message-list" data-correo-message-list aria-busy="${loadingMessages || loadingMore ? "true" : "false"}">${loadingMessages ? renderMessageSkeletons() : renderMessageRows(messages, selectedMessageId)}${loadingMore ? `<div class="correo-infinite-loader">${icon("spinner")}<span>Cargando correos anteriores…</span></div>` : ""}</div>''',
    "dead infinite sentinel",
)

# Replace compose renderer as one authoritative block.
compose_pattern = re.compile(r'export function renderComposeModal\(input = \{\}\) \{.*?\n\}\n\nexport function renderMoveMenu', re.S)
match = compose_pattern.search(template)
if not match:
    raise SystemExit("compose renderer block not found")
compose_replacement = r'''export function renderComposeModal(input = {}) {
  const mode = input.mode || "compose";
  const isReply = mode === "reply" || mode === "reply-all";
  const isForward = mode === "forward";
  const isDraftEdit = mode === "draft-edit";
  const title = isReply
    ? (mode === "reply-all" ? "Responder a todos" : "Responder")
    : isForward
      ? "Reenviar"
      : isDraftEdit
        ? "Editar borrador"
        : "Nuevo correo";
  const to = parseRecipientField(input.to || "").join(", ");
  const cc = parseRecipientField(input.cc || "").join(", ");
  const subject = cleanText(input.subject, "");
  const fullFields = !isReply;
  const canAttach = mode === "compose" || isDraftEdit;
  return `
    <div class="correo-modal-backdrop" data-correo-action="close-modal"></div>
    <section class="correo-compose" role="dialog" aria-modal="true" aria-labelledby="correo-compose-title">
      <header class="correo-compose-header"><h2 id="correo-compose-title">${escapeHtml(title)}</h2><button class="correo-icon-btn" type="button" data-correo-action="close-modal" aria-label="Cerrar">${icon("close")}</button></header>
      <form class="correo-compose-form" data-correo-compose-form data-correo-compose-mode="${attr(mode)}" data-correo-message-id="${attr(input.messageId || "")}">
        <div class="correo-compose-fields">
          ${fullFields ? `<label class="correo-field correo-field--line"><span>Para</span><input name="to" type="text" inputmode="email" autocomplete="email" placeholder="nombre@empresa.com" value="${attr(to)}" required></label><label class="correo-field correo-field--line"><span>Cc</span><input name="cc" type="text" inputmode="email" autocomplete="off" placeholder="Opcional" value="${attr(cc)}"></label>${isForward ? "" : `<label class="correo-field correo-field--line"><span>Asunto</span><input name="subject" type="text" maxlength="998" placeholder="Agregar asunto" value="${attr(subject)}"></label>`}` : ""}
        </div>
        <label class="correo-field correo-field--body"><span class="correo-field-sr-label">${isReply ? "Respuesta" : isForward ? "Comentario" : "Mensaje"}</span><textarea name="body" rows="12" placeholder="Escribe tu mensaje…">${escapeHtml(input.body || "")}</textarea></label>
        ${canAttach ? `<div class="correo-compose-attachments"><label class="correo-file-picker"><input type="file" name="attachments" multiple data-correo-attachments-input><span>${icon("paperclip")} Adjuntar</span></label><small data-correo-file-summary>${isDraftEdit ? "Los adjuntos existentes se conservan · añade otros si hace falta" : "Sin adjuntos"}</small></div>` : ""}
        <footer class="correo-compose-footer"><span class="correo-compose-status" data-correo-compose-status role="status" aria-live="polite"></span><div>${mode === "compose" || isDraftEdit ? `<button class="correo-btn" type="button" data-correo-action="save-draft">${isDraftEdit ? "Guardar cambios" : "Guardar borrador"}</button>` : ""}<button class="correo-btn correo-btn--primary" type="submit">${icon("send")}<span>${isReply ? "Enviar" : isForward ? "Reenviar" : isDraftEdit ? "Enviar borrador" : "Enviar"}</span></button></div></footer>
      </form>
    </section>`;
}

export function renderConfirmModal(input = {}) {
  const danger = input.danger === true;
  const iconName = cleanText(input.iconName, danger ? "warning" : "mail");
  const eyebrow = cleanText(input.eyebrow, danger ? "Confirmación" : "Correo");
  const title = cleanText(input.title, "¿Confirmar acción?");
  const message = cleanText(input.message, "Revisa la acción antes de continuar.");
  const confirmLabel = cleanText(input.confirmLabel, danger ? "Confirmar" : "Continuar");
  return `
    <div class="correo-confirm-overlay" data-correo-action="confirm-cancel">
      <section class="correo-confirm-dialog${danger ? " is-danger" : ""}" role="alertdialog" aria-modal="true" aria-labelledby="correo-confirm-title" aria-describedby="correo-confirm-description" tabindex="-1" data-correo-confirm-dialog>
        <span class="correo-confirm-icon" aria-hidden="true">${icon(iconName)}</span>
        <div class="correo-confirm-copy"><span class="correo-confirm-eyebrow">${escapeHtml(eyebrow)}</span><h3 id="correo-confirm-title">${escapeHtml(title)}</h3><p id="correo-confirm-description">${escapeHtml(message)}</p></div>
        <div class="correo-confirm-actions"><button class="correo-btn" type="button" data-correo-action="confirm-cancel">Cancelar</button><button class="correo-btn ${danger ? "correo-btn--danger" : "correo-btn--primary"}" type="button" data-correo-action="confirm-accept">${escapeHtml(confirmLabel)}</button></div>
      </section>
    </div>`;
}

export function renderMoveMenu'''
template = template[:match.start()] + compose_replacement + template[match.end():]

# ---------------------------------------------------------------------------
# CSS: viewport.css was already the effective final authority. Promote it to
# index.css, keep the three structural rules still needed from the old base,
# and add the new confirmation surface. No third patch stylesheet.
# ---------------------------------------------------------------------------
if '@layer views {' not in viewport:
    raise SystemExit("viewport.css missing @layer views")
closing = '} /* @layer views */'
if closing not in viewport:
    raise SystemExit("viewport.css missing canonical layer closing marker")
canonical = viewport.rsplit(closing, 1)[0].rstrip()
canonical = canonical.replace(
    'ONION SUPPORT — CORREO · OUTLOOK / FLUENT VIEWPORT FINAL',
    'ONION SUPPORT — CORREO · CANONICAL EXTREME',
    1,
)
extra_css = r'''

/* ---------- Canonical structural primitives ---------- */
.correo-field { min-inline-size: 0; display: grid; }
.correo-message-line { min-inline-size: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.correo-mini-empty { display: flex; align-items: center; gap: 8px; padding: 12px; color: var(--correo-text-3, #777); font-size: 9px; }

/* ---------- Onion confirmation surface ---------- */
.correo-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 10030;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0, 0, 0, .58);
  backdrop-filter: blur(7px);
}

.correo-confirm-dialog {
  inline-size: min(520px, 100%);
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--correo-border, #555);
  border-radius: 8px;
  outline: none;
  background: var(--correo-panel, #292929);
  color: var(--correo-text, #fff);
  box-shadow: 0 24px 80px rgba(0, 0, 0, .5);
}

.correo-confirm-dialog:focus-visible { box-shadow: 0 24px 80px rgba(0, 0, 0, .5), 0 0 0 2px var(--correo-blue, #479ef5); }
.correo-confirm-icon { inline-size: 44px; block-size: 44px; display: grid; place-items: center; border: 1px solid var(--correo-border, #555); border-radius: 7px; background: var(--correo-panel-soft, #333); color: var(--correo-blue, #479ef5); }
.correo-confirm-dialog.is-danger .correo-confirm-icon { border-color: color-mix(in srgb, var(--correo-red, #d13438) 65%, var(--correo-border, #555)); background: color-mix(in srgb, var(--correo-red, #d13438) 14%, var(--correo-panel-soft, #333)); color: var(--correo-red, #d13438); }
.correo-confirm-icon svg { inline-size: 20px; block-size: 20px; }
.correo-confirm-copy { min-inline-size: 0; display: grid; gap: 7px; }
.correo-confirm-eyebrow { color: var(--correo-text-3, #aaa); font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.correo-confirm-dialog.is-danger .correo-confirm-eyebrow { color: color-mix(in srgb, var(--correo-red, #d13438) 78%, white 22%); }
.correo-confirm-copy h3 { margin: 0; color: var(--correo-text, #fff); font-size: 18px; line-height: 1.2; font-weight: 650; }
.correo-confirm-copy p { margin: 0; color: var(--correo-text-3, #aaa); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.correo-confirm-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; margin-block-start: 4px; }
.correo-btn--danger { border-color: color-mix(in srgb, var(--correo-red, #d13438) 70%, #555); background: color-mix(in srgb, var(--correo-red, #d13438) 18%, #333); color: #fff; }
.correo-btn--danger:hover:not(:disabled) { border-color: var(--correo-red, #d13438); background: color-mix(in srgb, var(--correo-red, #d13438) 32%, #333); }

@media (max-width: 560px) {
  .correo-confirm-dialog { grid-template-columns: 1fr; padding: 16px; }
  .correo-confirm-actions { display: grid; grid-template-columns: 1fr; }
  .correo-confirm-actions .correo-btn { inline-size: 100%; }
}

html[data-theme="light"] .correo-confirm-overlay,
body[data-theme="light"] .correo-confirm-overlay { background: rgba(15, 23, 42, .36); }

'''
write(CSS_INDEX, canonical + extra_css + closing + "\n")
CSS_VIEWPORT.unlink()

# Router now has one Correo CSS authority.
route_styles = replace_one(
    route_styles,
    '''  correo: Object.freeze([
    "/src/css/views/correo/index.css",
    "/src/css/views/correo/viewport.css",
  ]),''',
    '''  correo: Object.freeze([
    "/src/css/views/correo/index.css",
  ]),''',
    "correo route CSS authority",
)

# Permanent Correo integrity contract.
contract_text = r'''#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
index = (ROOT / "src/views/correo/index.js").read_text(encoding="utf-8")
template = (ROOT / "src/views/correo/correo.template.js").read_text(encoding="utf-8")
api = (ROOT / "src/views/correo/correo.api.js").read_text(encoding="utf-8")
css = (ROOT / "src/css/views/correo/index.css").read_text(encoding="utf-8")
styles = (ROOT / "src/router/styles.js").read_text(encoding="utf-8")
errors = []

if (ROOT / "src/css/views/correo/viewport.css").exists():
    errors.append("Correo debe tener una única autoridad CSS; viewport.css no puede reaparecer")
if styles.count('/src/css/views/correo/') != 1 or '/src/css/views/correo/index.css' not in styles:
    errors.append("Router debe cargar exactamente un CSS de Correo: index.css")
for forbidden in ('window.confirm(', 'cristian@onionsupport.com', 'data-correo-action="add-account"', 'data-correo-infinite-sentinel'):
    if forbidden in index + template:
        errors.append(f"marcador legado/prohibido en Correo: {forbidden}")
for required in (
    'VIEW_CACHE_TTL_MS = 60_000', 'ownerKey', 'cacheKey',
    'listAbortController', 'readerAbortController',
    'compositionstart', 'compositionend', 'searchComposing',
    'focusableElements', 'trapModalFocus', 'confirmAction', 'renderConfirmModal',
    'CorreoApi.updateDraft(', 'draft-edit', 'routeCommitNonBlocking: true',
):
    if required not in index:
        errors.append(f"falta contrato de controlador: {required}")
for required in (
    'data-correo-action="edit-draft"', 'data-correo-action="confirm-accept"',
    'data-correo-action="confirm-cancel"', 'role="alertdialog"',
    'Los adjuntos existentes se conservan',
):
    if required not in template:
        errors.append(f"falta contrato de template: {required}")
for required in ('export async function updateDraft(', 'updateDraft,'):
    if required not in api:
        errors.append(f"API de borrador incompleta: {required}")
for required in ('.correo-confirm-overlay', '.correo-confirm-dialog', '.correo-btn--danger', '.correo-field', '.correo-message-line'):
    if required not in css:
        errors.append(f"falta CSS canónico de Correo: {required}")
if css.count('@layer views {') != 1:
    errors.append("Correo index.css debe declarar una sola capa views")

if errors:
    print("Correo integrity FAILED")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)
print("Correo integrity OK · single CSS authority · isolated cache · abortable IO · accessible modals · editable drafts")
'''
write(CONTRACT, contract_text)

# Repository Integrity runs the Correo contract permanently.
repo_workflow = replace_one(
    repo_workflow,
    '''      - name: Validate private Create modal parity
        run: python3 .github/scripts/private_create_modal_contract.py

      - name: Validate continuous-scroll markup''',
    '''      - name: Validate private Create modal parity
        run: python3 .github/scripts/private_create_modal_contract.py

      - name: Validate Correo canonical surface
        run: python3 .github/scripts/correo_integrity.py

      - name: Validate continuous-scroll markup''',
    "repo workflow Correo contract",
)

# Final writes.
write(INDEX, index)
write(TEMPLATE, template)
write(ROUTE_STYLES, route_styles)
write(REPO_WORKFLOW, repo_workflow)

# Fail closed on the exact classes of regression this patch removes.
assert_absent(index, 'window.confirm(', "native confirms")
assert_absent(index + template, 'cristian@onionsupport.com', "hardcoded mailbox")
assert_absent(index + template, 'add-account', "fake multiaaccount")
assert_absent(template, 'data-correo-infinite-sentinel', "dead sentinel")
if CSS_VIEWPORT.exists():
    raise SystemExit("viewport.css still exists")
if route_styles.count('/src/css/views/correo/') != 1:
    raise SystemExit("router still has multiple Correo styles")

print("Correo extreme patch applied successfully")
