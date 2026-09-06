/* =========================================================
   Onion Support - Clientes Create Controller
   Archivo: /src/views/clientes/clientes.create-controller.js

   CANÓNICO · CREATE-ONLY CONTROLLER

   Responsabilidad:
   - Gobernar únicamente el modal de alta de cliente.
   - Reutilizar el lifecycle modal compartido de la SPA.
   - Buscar/seleccionar usuarios y enviar POST /api/clientes vía API canónica.
   - Mantener foco, scroll y edición estable entre renders del modal.
   - No listar clientes, no paginar, no navegar y no crear un segundo ClientesView.
========================================================= */

import {
  createModalLifecycle,
  restoreModalFocus,
} from "../../features/entity-overlay/modal-lifecycle.js";
import {
  createCliente as createClienteRequest,
  loadClienteDetail as loadClienteDetailRequest,
  normalizeClienteModel,
} from "./clientes.api.js";
import {
  renderClientesCreateModal,
  CREATE_ACTIONS,
  getCreateFormDefaults,
  validateCreateForm,
  buildClienteCreatePayload,
} from "./clientes.template.create.js";
import {
  fetchUsuariosRequest,
  normalizeUsuarioModel,
} from "../usuarios/usuarios.api.js";

export const CLIENTES_CREATE_CONTROLLER_VERSION =
  "clientes.create-controller.v1.single-owner";

const USER_SEARCH_DEBOUNCE_MS = 220;
const USER_SEARCH_MIN_LENGTH = 2;
const USER_SEARCH_LIMIT = 8;
const CREATE_MODAL_ROOT_SELECTOR = "[data-clientes-create-root='true']";
const CREATE_MODAL_PANEL_SELECTOR = "[data-clientes-create-modal-panel='true']";
const CREATE_MODAL_OVERLAY_SELECTOR = "[data-clientes-create-modal-overlay='true']";
const CREATE_MODAL_BODY_SELECTOR = ".cli-create-body, .inc-create-body";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function safeError(error = null, fallback = "No se pudo crear el cliente.") {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function nextFrame(callback) {
  if (!isBrowser() || typeof callback !== "function") return 0;
  return typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 0);
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return;
  try { window.cancelAnimationFrame?.(id); } catch { /* noop */ }
  try { window.clearTimeout?.(id); } catch { /* noop */ }
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  return email && email.includes("@") ? email : "";
}

function normalizeSearchUser(value = {}) {
  const raw = safeObject(value);
  let normalized = raw;
  try { normalized = normalizeUsuarioModel(raw); } catch { /* raw fallback */ }

  const userId = cleanText(first(
    normalized.userId,
    normalized.id,
    normalized.uid,
    raw.userId,
    raw.id,
    raw.uid,
    raw.usuarioId,
    ""
  ), "");
  const clienteId = cleanText(first(
    normalized.clienteId,
    normalized.clientId,
    normalized.customerId,
    raw.clienteId,
    raw.clientId,
    raw.customerId,
    ""
  ), "");
  const displayName = cleanText(first(
    normalized.displayName,
    normalized.fullName,
    normalized.name,
    normalized.nombre,
    raw.displayName,
    raw.name,
    userId,
    "Usuario"
  ), "Usuario");
  const email = normalizeEmail(first(
    normalized.email,
    normalized.emailLower,
    raw.email,
    raw.emailLower,
    ""
  ));
  const phone = cleanText(first(
    normalized.phone,
    normalized.telefono,
    normalized.mobile,
    raw.phone,
    raw.telefono,
    ""
  ), "");
  const username = cleanText(first(
    normalized.username,
    normalized.usernameLower,
    raw.username,
    raw.usernameLower,
    ""
  ), "").toLowerCase();
  const avatarUrl = cleanText(first(
    normalized.avatarUrl,
    normalized.avatar,
    normalized.picture,
    raw.avatarUrl,
    raw.avatar,
    raw.picture,
    ""
  ), "");

  return {
    ...raw,
    ...normalized,
    id: userId,
    userId,
    uid: userId,
    clienteId,
    targetClienteId: clienteId,
    displayName,
    name: displayName,
    fullName: displayName,
    email,
    emailLower: email,
    phone,
    telefono: phone,
    username,
    usernameLower: username,
    avatarUrl,
    avatar: avatarUrl || null,
  };
}

function usersFromPayload(payload = null) {
  if (Array.isArray(payload)) return payload;
  const queue = [payload];
  const seen = new Set();

  while (queue.length) {
    const value = queue.shift();
    if (!isObject(value) || seen.has(value)) continue;
    seen.add(value);

    for (const key of [
      "items",
      "results",
      "users",
      "usuarios",
      "rows",
      "records",
      "docs",
      "documents",
      "list",
      "value",
    ]) {
      if (Array.isArray(value[key])) return value[key];
    }

    for (const key of ["data", "payload", "response", "result", "body", "value"]) {
      if (isObject(value[key])) queue.push(value[key]);
    }
  }
  return [];
}

export function createClientesCreateController({
  getRole = () => "user",
  getUser = () => null,
  isAdmin = () => false,
  showToast = () => false,
  emitEvent = () => false,
  onCreated = null,
} = {}) {
  let destroyed = false;
  let modalHost = null;
  let returnFocus = null;
  let firstModalPaint = false;
  let modalFrame = 0;
  let userSearchTimer = 0;
  let userSearchSeq = 0;
  let createSeq = 0;

  const createModal = {
    open: false,
    submitting: false,
    serverError: "",
    successMessage: "",
    createdClienteId: "",
    errors: {},
    form: getCreateFormDefaults(),
    userSearch: {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    },
  };

  const modalLifecycle = createModalLifecycle({
    getPanel: () => modalHost?.querySelector(CREATE_MODAL_PANEL_SELECTOR),
    onEscape: () => {
      if (!createModal.submitting) close();
    },
    bodyClasses: ["clientes-modal-open", "clientes-create-open"],
  });

  function snapshot() {
    return {
      version: CLIENTES_CREATE_CONTROLLER_VERSION,
      open: createModal.open,
      submitting: createModal.submitting,
      destroyed,
      userSearchLoading: createModal.userSearch.loading,
      selectedUserId: cleanText(
        first(
          createModal.userSearch.selectedUser?.userId,
          createModal.form.userId,
          ""
        ),
        ""
      ),
      serverError: createModal.serverError,
    };
  }

  function reset() {
    createModal.submitting = false;
    createModal.serverError = "";
    createModal.successMessage = "";
    createModal.createdClienteId = "";
    createModal.errors = {};
    createModal.form = getCreateFormDefaults();
    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };
  }

  function ensureModalHost() {
    if (!isBrowser() || destroyed) return null;
    if (modalHost?.isConnected) return modalHost;

    modalHost = document.createElement("div");
    modalHost.setAttribute("data-clientes-create-controller", "true");
    modalHost.setAttribute("data-clientes-modal-host", "true");
    modalHost.setAttribute("data-clientes-create-owner", "canonical");
    modalHost.addEventListener("click", handleModalClick, true);
    modalHost.addEventListener("submit", handleModalSubmit, true);
    modalHost.addEventListener("input", handleModalInput, true);
    modalHost.addEventListener("change", handleModalInput, true);
    document.body.appendChild(modalHost);
    return modalHost;
  }

  function removeModalHost() {
    cancelFrame(modalFrame);
    modalFrame = 0;
    if (!modalHost) return false;

    try {
      modalHost.removeEventListener("click", handleModalClick, true);
      modalHost.removeEventListener("submit", handleModalSubmit, true);
      modalHost.removeEventListener("input", handleModalInput, true);
      modalHost.removeEventListener("change", handleModalInput, true);
      modalHost.remove();
    } catch {
      // noop
    }
    modalHost = null;
    return true;
  }

  function syncModalAttributes(current, next) {
    if (!current || !next) return false;
    for (const attribute of Array.from(current.attributes || [])) {
      if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    }
    for (const attribute of Array.from(next.attributes || [])) {
      current.setAttribute(attribute.name, attribute.value);
    }
    return true;
  }

  function patchStableModal(html = "") {
    if (!modalHost || !isBrowser()) return false;
    const currentRoot = modalHost.querySelector(CREATE_MODAL_ROOT_SELECTOR);
    const currentOverlay = modalHost.querySelector(CREATE_MODAL_OVERLAY_SELECTOR);
    const currentPanel = modalHost.querySelector(CREATE_MODAL_PANEL_SELECTOR);
    if (!currentRoot || !currentOverlay || !currentPanel) return false;

    const template = document.createElement("template");
    template.innerHTML = html;
    const nextRoot = template.content.querySelector(CREATE_MODAL_ROOT_SELECTOR);
    const nextOverlay = template.content.querySelector(CREATE_MODAL_OVERLAY_SELECTOR);
    const nextPanel = template.content.querySelector(CREATE_MODAL_PANEL_SELECTOR);
    if (!nextRoot || !nextOverlay || !nextPanel) return false;

    const active = document.activeElement;
    const field = active && modalHost.contains(active)
      ? cleanText(active.getAttribute?.("data-field") || active.getAttribute?.("name"), "")
      : "";
    const selection = field && Number.isInteger(active?.selectionStart)
      ? [active.selectionStart, active.selectionEnd]
      : null;
    const body = currentPanel.querySelector(CREATE_MODAL_BODY_SELECTOR);
    const scrollTop = Number(body?.scrollTop || 0);

    syncModalAttributes(currentRoot, nextRoot);
    syncModalAttributes(currentOverlay, nextOverlay);
    syncModalAttributes(currentPanel, nextPanel);
    currentPanel.replaceChildren(...Array.from(nextPanel.childNodes));

    const nextBody = currentPanel.querySelector(CREATE_MODAL_BODY_SELECTOR);
    if (nextBody) nextBody.scrollTop = scrollTop;

    if (field) {
      const target = Array.from(
        currentPanel.querySelectorAll("[data-field], [name]")
      ).find((node) =>
        cleanText(
          node.getAttribute("data-field") || node.getAttribute("name"),
          ""
        ) === field
      );
      if (target) {
        try { target.focus({ preventScroll: true }); } catch { target.focus?.(); }
        if (selection && typeof target.setSelectionRange === "function") {
          const max = String(target.value || "").length;
          target.setSelectionRange(
            Math.min(selection[0], max),
            Math.min(selection[1], max)
          );
        }
      }
    }
    return true;
  }

  function renderNow() {
    if (destroyed) return false;
    if (!createModal.open) {
      removeModalHost();
      return true;
    }

    const host = ensureModalHost();
    if (!host) return false;

    const html = renderClientesCreateModal({
      ...createModal,
      admin: Boolean(isAdmin()),
      role: cleanText(getRole(), "user"),
      user: getUser(),
    });
    if (!patchStableModal(html)) host.innerHTML = html;

    if (firstModalPaint) {
      firstModalPaint = false;
      nextFrame(() => {
        const field = host.querySelector(
          "[data-field='targetUserSearch'], [data-field='nombreFiscal'], input:not([type='hidden'])"
        );
        try { field?.focus({ preventScroll: true }); } catch { field?.focus?.(); }
      });
    }
    return true;
  }

  function scheduleRender() {
    if (destroyed || !createModal.open) return 0;
    cancelFrame(modalFrame);
    modalFrame = nextFrame(() => {
      modalFrame = 0;
      renderNow();
    });
    return modalFrame;
  }

  function patchCreateForm(patch = {}) {
    createModal.form = {
      ...createModal.form,
      ...safeObject(patch),
    };
    return createModal.form;
  }

  function readCreateForm(form = null) {
    const output = { ...createModal.form };
    if (!form || typeof FormData === "undefined") return output;
    try {
      const data = new FormData(form);
      for (const [key, value] of data.entries()) {
        output[key] = typeof value === "string"
          ? value
          : cleanText(value?.name, "");
      }
    } catch {
      // noop
    }
    return output;
  }

  function normalizeUserResults(payload = null) {
    const map = new Map();
    for (const raw of usersFromPayload(payload)) {
      const user = normalizeSearchUser(raw);
      if (user.userId && !map.has(user.userId)) map.set(user.userId, user);
    }
    return [...map.values()].slice(0, USER_SEARCH_LIMIT);
  }

  async function searchUsers(query = "") {
    const q = cleanText(query, "");
    const seq = ++userSearchSeq;
    createModal.userSearch.query = q;
    createModal.userSearch.error = "";
    createModal.userSearch.empty = false;

    if (q.length < USER_SEARCH_MIN_LENGTH) {
      createModal.userSearch.loading = false;
      createModal.userSearch.results = [];
      scheduleRender();
      return [];
    }

    createModal.userSearch.loading = true;
    scheduleRender();
    try {
      const response = await fetchUsuariosRequest({
        all: false,
        limit: USER_SEARCH_LIMIT,
        includeTotal: false,
        search: q,
        q,
        timeout: 15_000,
      });
      if (seq !== userSearchSeq || destroyed || !createModal.open) return [];

      const results = normalizeUserResults(response);
      createModal.userSearch.loading = false;
      createModal.userSearch.results = results;
      createModal.userSearch.empty = results.length === 0;
      scheduleRender();
      return results;
    } catch (error) {
      if (seq !== userSearchSeq || destroyed || !createModal.open) return [];
      createModal.userSearch.loading = false;
      createModal.userSearch.error = safeError(
        error,
        "No se pudieron buscar usuarios."
      );
      createModal.userSearch.results = [];
      scheduleRender();
      return [];
    }
  }

  function selectUser(node = null) {
    if (!node) return false;
    const selected = normalizeSearchUser({
      userId: node.dataset.userId || "",
      clienteId: node.dataset.userClienteId || node.dataset.clienteId || "",
      displayName: node.dataset.userName || "",
      email: node.dataset.userEmail || node.dataset.email || "",
      phone: node.dataset.userPhone || "",
      username: node.dataset.userUsername || "",
      avatarUrl: node.dataset.userAvatar || "",
    });
    if (!selected.userId) return false;

    patchCreateForm({
      targetUserId: selected.userId,
      userId: selected.userId,
      targetClienteId: selected.clienteId || "",
      targetUserName: selected.displayName,
      targetUserEmail: selected.email,
      targetUserPhone: selected.phone,
      targetUsername: selected.username,
      targetUserAvatar: selected.avatarUrl || "",
      contactoNombre: createModal.form.contactoNombre || selected.displayName,
      contactoEmail: createModal.form.contactoEmail || selected.email,
      contactoPhone: createModal.form.contactoPhone || selected.phone,
      emailFacturacion: createModal.form.emailFacturacion || selected.email,
      username: createModal.form.username || selected.username,
      slug: createModal.form.slug || selected.username,
    });

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: selected,
      empty: false,
    };
    delete createModal.errors.userId;
    delete createModal.errors.targetUserId;
    scheduleRender();
    return true;
  }

  function clearUser() {
    patchCreateForm({
      targetUserId: "",
      userId: "",
      targetClienteId: "",
      targetUserName: "",
      targetUserEmail: "",
      targetUserPhone: "",
      targetUsername: "",
      targetUserAvatar: "",
    });
    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };
    scheduleRender();
    return true;
  }

  function copyUserContact() {
    const user = normalizeSearchUser(createModal.userSearch.selectedUser || {});
    if (!user.userId) return false;
    patchCreateForm({
      contactoNombre: user.displayName || createModal.form.contactoNombre,
      contactoEmail: user.email || createModal.form.contactoEmail,
      contactoPhone: user.phone || createModal.form.contactoPhone,
      emailFacturacion: user.email || createModal.form.emailFacturacion,
    });
    scheduleRender();
    return true;
  }

  async function submit(formNode = null) {
    if (destroyed || createModal.submitting || !isAdmin()) return false;

    const form = readCreateForm(formNode);
    const validation = validateCreateForm(form);
    createModal.form = validation.form || form;
    createModal.errors = safeObject(validation.errors);
    createModal.serverError = "";
    if (validation.valid !== true) {
      scheduleRender();
      return false;
    }

    const seq = ++createSeq;
    createModal.submitting = true;
    scheduleRender();

    try {
      const body = validation.payload || buildClienteCreatePayload(
        validation.form || form
      );
      const created = await createClienteRequest(body, {
        source: "views.clientes.create-controller.create",
      });
      if (seq !== createSeq || destroyed || !createModal.open) return false;

      const createdId = cleanText(first(
        created?.clienteId,
        created?.id,
        created?.data?.clienteId,
        created?.data?.id,
        ""
      ), "");
      if (!createdId) {
        const error = new Error("El backend no devolvió el ID del cliente creado.");
        error.code = "CLIENTE_CREATE_ID_MISSING";
        throw error;
      }

      let detail = null;
      try {
        detail = await loadClienteDetailRequest(createdId, {
          dedupe: true,
          source: "views.clientes.create-controller.detail",
        });
      } catch {
        // El ACK es suficiente; la lista canónica se reconciliará después.
      }
      const normalizedDetail = detail ? normalizeClienteModel(detail) : null;
      const eventPayload = {
        cliente: normalizedDetail,
        detail: normalizedDetail,
        clienteId: createdId,
        response: created,
        source: "views.clientes.create-controller",
      };

      try { emitEvent("clientes:create:success", eventPayload); } catch { /* noop */ }
      try { onCreated?.(eventPayload); } catch { /* noop */ }
      try { showToast(`Cliente ${createdId} creado correctamente.`, "success"); } catch { /* noop */ }

      createModal.submitting = false;
      close({ reset: true });
      return true;
    } catch (error) {
      if (seq !== createSeq || destroyed) return false;
      createModal.submitting = false;
      createModal.serverError = safeError(error, "No se pudo crear el cliente.");
      scheduleRender();
      try { showToast(createModal.serverError, "error"); } catch { /* noop */ }
      return false;
    }
  }

  function handleModalClick(event) {
    if (!modalHost?.contains(event.target)) return;

    const overlay = event.target?.closest?.(CREATE_MODAL_OVERLAY_SELECTOR);
    if (overlay && event.target === overlay && !createModal.submitting) {
      event.preventDefault();
      close();
      return;
    }

    const actionable = event.target?.closest?.("[data-create-action]");
    const action = cleanText(
      actionable?.getAttribute?.("data-create-action"),
      ""
    );
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();

    if (action === CREATE_ACTIONS.CLOSE) {
      if (!createModal.submitting) close();
      return;
    }
    if (action === CREATE_ACTIONS.SUBMIT) {
      void submit(
        actionable.closest("form") ||
        modalHost.querySelector("[data-clientes-create-form='true']")
      );
      return;
    }
    if (action === CREATE_ACTIONS.USER_SELECT) {
      selectUser(actionable);
      return;
    }
    if (action === CREATE_ACTIONS.USER_CLEAR) {
      clearUser();
      return;
    }
    if (action === CREATE_ACTIONS.COPY_USER_CONTACT) {
      copyUserContact();
    }
  }

  function handleModalSubmit(event) {
    const form = event.target?.closest?.("[data-clientes-create-form='true']");
    if (!form || !modalHost?.contains(form)) return;
    event.preventDefault();
    event.stopPropagation();
    void submit(form);
  }

  function handleModalInput(event) {
    if (!modalHost?.contains(event.target)) return;
    const target = event.target;
    const field = cleanText(
      target?.getAttribute?.("data-field") || target?.getAttribute?.("name"),
      ""
    );
    if (!field) return;

    if (field === "targetUserSearch") {
      if (isBrowser()) window.clearTimeout?.(userSearchTimer);
      const query = target.value || "";
      userSearchTimer = window.setTimeout(() => {
        userSearchTimer = 0;
        void searchUsers(query);
      }, USER_SEARCH_DEBOUNCE_MS);
      return;
    }

    const value = target.type === "checkbox"
      ? Boolean(target.checked)
      : target.value;
    patchCreateForm({ [field]: value });
    if (field === "tipo") {
      patchCreateForm({ clienteTipo: value, segmento: value });
    }
    if (field === "contactoEmail") {
      patchCreateForm({
        email: value,
        emailCliente: value,
        emailFacturacion: createModal.form.emailFacturacion || value,
      });
    }
    if (field === "contactoPhone") {
      patchCreateForm({ phone: value, telefono: value });
    }

    if (createModal.errors[field]) {
      const next = { ...createModal.errors };
      delete next[field];
      createModal.errors = next;
      target.closest?.("[data-create-field]")?.classList?.remove?.("is-error");
      target.removeAttribute?.("aria-invalid");
      modalHost.querySelector?.(`#clientes-create-${field}-error`)?.remove?.();
    }
    if (createModal.serverError) {
      createModal.serverError = "";
      modalHost.querySelector?.(
        ".cli-create-alert.is-error, .inc-create-alert.is-error"
      )?.remove?.();
    }
  }

  function open(trigger = null) {
    if (destroyed || createModal.open || !isAdmin()) return false;
    returnFocus = trigger?.isConnected
      ? trigger
      : (isBrowser() ? document.activeElement : null);
    reset();
    createModal.open = true;
    firstModalPaint = true;
    renderNow();
    modalLifecycle.activate({ opener: returnFocus });
    return true;
  }

  function close({ reset: shouldReset = true } = {}) {
    if (!createModal.open && !modalHost) return false;
    createModal.open = false;
    userSearchSeq += 1;
    if (isBrowser()) window.clearTimeout?.(userSearchTimer);
    userSearchTimer = 0;
    removeModalHost();
    modalLifecycle.deactivate({ restoreFocus: false });
    if (shouldReset) reset();

    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) {
      nextFrame(() => restoreModalFocus(target));
    }
    return true;
  }

  function destroy() {
    if (destroyed) return true;
    destroyed = true;
    createSeq += 1;
    userSearchSeq += 1;
    if (isBrowser()) window.clearTimeout?.(userSearchTimer);
    userSearchTimer = 0;
    cancelFrame(modalFrame);
    modalFrame = 0;
    createModal.open = false;
    removeModalHost();
    try { modalLifecycle.deactivate({ restoreFocus: false }); } catch { /* noop */ }
    reset();
    return true;
  }

  return Object.freeze({
    version: CLIENTES_CREATE_CONTROLLER_VERSION,
    open,
    close,
    destroy,
    getSnapshot: snapshot,
  });
}

export default Object.freeze({
  version: CLIENTES_CREATE_CONTROLLER_VERSION,
  create: createClientesCreateController,
});
