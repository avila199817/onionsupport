/* =========================================================
   Onion Support - Correo View
   Archivo: /src/views/correo/index.js

   VISTA PREVIA · INTERACCIÓN LOCAL · CERO INTEGRACIÓN

   Responsabilidad:
   - Montar la vista visual de correo.
   - Selección, búsqueda y filtros únicamente sobre datos demo locales.
   - Mostrar feedback local para acciones aún no conectadas.
   - Sin HTTP, Auth, Router, Store, Storage, tokens ni Microsoft Graph.
========================================================= */

import {
  CORREO_DEMO_MESSAGES,
  renderCorreoMessageRows,
  renderCorreoReader,
  renderCorreoTemplate,
} from "./correo.template.js";

export const CORREO_VIEW_VERSION =
  "correo.view.preview.v1";

const INSTANCES = new WeakMap();
let lastInstance = null;

function isDomNode(value = null) {
  return Boolean(
    typeof Node !== "undefined" &&
      value &&
      value instanceof Node
  );
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

function messageById(id = "") {
  const cleanId = cleanText(id, "");
  return CORREO_DEMO_MESSAGES.find((message) => message.id === cleanId) || null;
}

function createCorreoController(host, context = {}) {
  const signal = context?.signal || null;

  let mounted = false;
  let destroyed = false;
  let selectedId = CORREO_DEMO_MESSAGES[0]?.id || "";
  let activeFilter = "todos";
  let searchTerm = "";

  function getVisibleMessages() {
    const query = safeLower(searchTerm);

    return CORREO_DEMO_MESSAGES.filter((message) => {
      if (activeFilter === "no-leidos" && message.unread !== true) return false;
      if (activeFilter === "adjuntos" && !message.attachment) return false;

      if (!query) return true;

      const haystack = safeLower([
        message.sender,
        message.email,
        message.subject,
        message.preview,
        ...(Array.isArray(message.body) ? message.body : []),
      ].join(" "));

      return haystack.includes(query);
    });
  }

  function notice(message = "") {
    const target = host.querySelector("[data-correo-notice-text]");
    if (!target) return false;

    target.textContent = cleanText(
      message,
      "Vista previa: esta acción aún no está conectada."
    );

    return true;
  }

  function syncSelection() {
    const rows = host.querySelectorAll("[data-correo-action='select-message']");

    for (const row of rows) {
      const active = row.dataset.correoMessageId === selectedId;
      row.classList.toggle("is-selected", active);
      row.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function renderReader() {
    const reader = host.querySelector("[data-correo-reader]");
    const message = messageById(selectedId);

    if (!reader || !message) return false;
    reader.innerHTML = renderCorreoReader(message);
    return true;
  }

  function renderList() {
    const list = host.querySelector("[data-correo-message-list]");
    const count = host.querySelector("[data-correo-count]");
    if (!list) return false;

    const messages = getVisibleMessages();

    if (!messages.some((message) => message.id === selectedId)) {
      selectedId = messages[0]?.id || "";
    }

    list.innerHTML = renderCorreoMessageRows(messages, selectedId);

    if (count) {
      count.textContent = `${messages.length} ${messages.length === 1 ? "mensaje" : "mensajes"}`;
    }

    if (selectedId) {
      renderReader();
    }

    return true;
  }

  function setActiveFilter(filter = "todos") {
    activeFilter = ["todos", "no-leidos", "adjuntos"].includes(filter)
      ? filter
      : "todos";

    const buttons = host.querySelectorAll("[data-correo-filter]");
    for (const button of buttons) {
      const active = button.dataset.correoFilter === activeFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }

    renderList();
  }

  function setActiveFolder(button) {
    const folder = cleanText(button?.dataset?.correoFolder, "Bandeja de entrada");
    const buttons = host.querySelectorAll("[data-correo-action='folder']");
    const title = host.querySelector("[data-correo-folder-title]");

    for (const item of buttons) {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    }

    if (title) title.textContent = folder;

    notice(
      folder === "Bandeja de entrada"
        ? "Bandeja de entrada de demostración. Ningún mensaje procede de Outlook."
        : `${folder}: carpeta visual preparada. El contenido real se cargará cuando se conecte Outlook.`
    );
  }

  function onClick(event) {
    if (destroyed) return;

    const target = event.target?.closest?.("[data-correo-action]");
    if (!target || !host.contains(target)) return;

    const action = cleanText(target.dataset.correoAction, "");
    if (!action) return;

    if (action === "select-message") {
      const nextId = cleanText(target.dataset.correoMessageId, "");
      if (!messageById(nextId)) return;

      selectedId = nextId;
      syncSelection();
      renderReader();
      return;
    }

    if (action === "filter") {
      setActiveFilter(target.dataset.correoFilter);
      return;
    }

    if (action === "folder") {
      setActiveFolder(target);
      return;
    }

    if (action === "connect") {
      notice("Conexión desactivada: no se ha iniciado OAuth ni se ha enviado ninguna solicitud a Microsoft.");
      return;
    }

    if (action === "compose") {
      notice("Compositor preparado visualmente para una fase posterior. No se ha creado ni enviado ningún correo.");
      return;
    }

    if (action === "reply") {
      notice("Respuesta desactivada en modo diseño. No se ha creado ningún borrador.");
      return;
    }

    if (action === "forward") {
      notice("Reenvío desactivado en modo diseño. No se ha enviado ningún mensaje.");
      return;
    }

    if (action === "attachment-preview") {
      notice("Adjunto de demostración: no existe ningún archivo real que descargar.");
    }
  }

  function onInput(event) {
    if (destroyed) return;

    const target = event.target;
    if (!target?.matches?.("[data-correo-search]")) return;

    searchTerm = cleanText(target.value, "");
    renderList();
  }

  function mount() {
    if (destroyed || mounted || !host) return controller;
    if (signal?.aborted === true) return controller;

    host.innerHTML = renderCorreoTemplate({ selectedId });
    host.dataset.view = "correo";
    host.setAttribute("data-correo-host", "true");

    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);

    mounted = true;
    return controller;
  }

  function destroy(options = {}) {
    if (destroyed) return true;

    destroyed = true;
    mounted = false;

    host.removeEventListener("click", onClick);
    host.removeEventListener("input", onInput);

    if (options?.clear === true || options?.keepDom === false) {
      host.replaceChildren();
    }

    if (INSTANCES.get(host) === controller) {
      INSTANCES.delete(host);
    }

    return true;
  }

  const controller = {
    version: CORREO_VIEW_VERSION,
    mount,
    destroy,
    unmount: destroy,
    getSnapshot() {
      return Object.freeze({
        version: CORREO_VIEW_VERSION,
        mounted,
        destroyed,
        selectedId,
        activeFilter,
        searchTerm,
        previewOnly: true,
        outlookConnected: false,
        networkEnabled: false,
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

  return controller.mount();
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
      previewOnly: true,
      outlookConnected: false,
      networkEnabled: false,
    });
  } catch {
    return Object.freeze({
      version: CORREO_VIEW_VERSION,
      mounted: false,
      previewOnly: true,
      outlookConnected: false,
      networkEnabled: false,
    });
  }
}

export default CorreoView;
