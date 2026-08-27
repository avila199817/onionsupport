/* =========================================================
   Onion Support - Global Entity Overlay
   Archivo: /src/features/entity-overlay/index.js

   Responsabilidad:
   - Abrir entidades canónicas desde cualquier vista sin navegar a su listado.
   - Cargar adaptadores, APIs, modales y CSS sólo al primer uso.
   - Mantener una única entidad activa y una pila segura entre relaciones.
   - Preservar el foco y el contexto de la vista situada debajo.
   - No duplicar UI de dominio: siempre reutiliza los modales productivos.
========================================================= */

import { AppCore } from "../../core/index.js";

export const ENTITY_OVERLAY_VERSION =
  "entity-overlay.v1.cross-view-canonical-detail";

const MODULE_NAME = "entities";
const OPEN_SELECTOR =
  "[data-entity-open='true'][data-entity-type][data-entity-id]";
const LOADING_STYLE =
  "/src/css/components/entity-overlay.css";
const LOADING_DELAY_MS = 110;
const MAX_STACK_DEPTH = 12;

const TYPE_ALIASES = Object.freeze({
  factura: "factura",
  facturas: "factura",
  invoice: "factura",
  invoices: "factura",

  incidencia: "incidencia",
  incidencias: "incidencia",
  ticket: "incidencia",
  tickets: "incidencia",

  cliente: "cliente",
  clientes: "cliente",
  client: "cliente",
  clients: "cliente",
  customer: "cliente",
  customers: "cliente",

  usuario: "usuario",
  usuarios: "usuario",
  user: "usuario",
  users: "usuario",
});

const ADAPTER_LOADERS = Object.freeze({
  factura: () => import("./adapters/factura.js"),
  incidencia: () => import("./adapters/incidencia.js"),
  cliente: () => import("./adapters/cliente.js"),
  usuario: () => import("./adapters/usuario.js"),
});

const STYLE_MANIFEST = Object.freeze({
  factura: Object.freeze([
    "/src/css/views/facturas/index.css",
    "/src/css/views/facturas/detail.css",
  ]),
  incidencia: Object.freeze([
    "/src/css/components/detail-modal.css",
    "/src/css/views/incidencias/index.css",
    "/src/css/views/incidencias/detail.css",
    "/src/css/views/incidencias/media-preview.css",
  ]),
  cliente: Object.freeze([
    "/src/css/components/detail-modal.css",
    "/src/css/views/clientes/index.css",
    "/src/css/views/clientes/detail.css",
  ]),
  usuario: Object.freeze([
    "/src/css/components/detail-modal.css",
    "/src/css/views/usuarios/index.css",
  ]),
});

const adapterPromises = new Map();
const adapters = new Map();
const stylePromises = new Map();

let initialized = false;
let activeRecord = null;
let stack = [];
let operation = Promise.resolve(true);
let transitionSequence = 0;

let loadingHost = null;
let loadingTimer = 0;
let loadingSequence = 0;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeEntityType(value = "") {
  return TYPE_ALIASES[normalizeKey(value)] || "";
}

export function normalizeEntityId(value = "") {
  return cleanText(value, "")
    .replace(/[\r\n\t]/g, "")
    .slice(0, 180);
}

export function normalizeEntityDescriptor(input = {}) {
  const source =
    input && typeof input === "object"
      ? input
      : {};

  const type = normalizeEntityType(
    source.type ||
    source.entityType ||
    source.kind ||
    source.entity ||
    ""
  );

  const id = normalizeEntityId(
    source.id ||
    source.entityId ||
    source.facturaId ||
    source.invoiceId ||
    source.ticketId ||
    source.incidenciaId ||
    source.clienteId ||
    source.clientId ||
    source.usuarioId ||
    source.userId ||
    ""
  );

  if (!type || !id || !ADAPTER_LOADERS[type]) {
    return null;
  }

  return Object.freeze({
    type,
    id,
    source: cleanText(source.source, "entity-overlay"),
  });
}

function safeError(error = null, fallback = "No se pudo abrir el detalle.") {
  return cleanText(
    error?.message ||
    error?.data?.message ||
    error?.payload?.message ||
    fallback,
    fallback
  )
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .slice(0, 240);
}

function showToast(message = "", type = "error") {
  const text = cleanText(message, "");
  if (!text) return false;

  for (const target of [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.Toast,
  ]) {
    try {
      if (isFunction(target?.[type])) {
        target[type](text);
        return true;
      }

      if (isFunction(target?.show)) {
        target.show(text, type);
        return true;
      }
    } catch {
      // siguiente bridge
    }
  }

  try {
    if (isFunction(AppCore?.showToast)) {
      AppCore.showToast(text, type);
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

function emit(name = "", detail = {}) {
  const eventName = cleanText(name, "");
  if (!eventName) return false;

  let emitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(eventName, detail);
      emitted = true;
    }
  } catch {
    // CustomEvent debajo
  }

  if (isBrowser()) {
    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail,
        })
      );
      emitted = true;
    } catch {
      // noop
    }
  }

  return emitted;
}

function normalizeStyleHref(value = "") {
  const raw = cleanText(value, "");

  if (
    !raw.startsWith("/src/css/") ||
    !raw.endsWith(".css")
  ) {
    throw new Error("ENTITY_OVERLAY_STYLE_NOT_ALLOWED");
  }

  if (!isBrowser()) return raw;

  const url = new URL(raw, window.location.origin);

  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith("/src/css/") ||
    !url.pathname.endsWith(".css")
  ) {
    throw new Error("ENTITY_OVERLAY_STYLE_NOT_ALLOWED");
  }

  return `${url.pathname}${url.search}`;
}

function existingStyleLink(href = "") {
  if (!isBrowser()) return null;

  return Array.from(
    document.querySelectorAll(
      "link[data-entity-overlay-style='true']"
    )
  ).find(
    (link) =>
      cleanText(
        link.getAttribute("data-entity-overlay-style-href"),
        ""
      ) === href
  ) || null;
}

function ensureStyle(href = "") {
  const normalized = normalizeStyleHref(href);

  if (!isBrowser()) {
    return Promise.resolve(normalized);
  }

  if (stylePromises.has(normalized)) {
    return stylePromises.get(normalized);
  }

  const promise = new Promise((resolve) => {
    const existing = existingStyleLink(normalized);

    if (existing?.sheet) {
      resolve(normalized);
      return;
    }

    const link = existing || document.createElement("link");
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      link.removeEventListener("load", finish);
      link.removeEventListener("error", finish);
      resolve(normalized);
    };

    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });

    if (!existing) {
      link.rel = "stylesheet";
      link.href = normalized;
      link.media = "all";
      link.setAttribute("data-entity-overlay-style", "true");
      link.setAttribute(
        "data-entity-overlay-style-href",
        normalized
      );
      document.head.appendChild(link);
    }

    if (existing?.sheet) {
      queueMicrotask(finish);
    }
  });

  stylePromises.set(normalized, promise);
  return promise;
}

async function ensureEntityStyles(type = "") {
  const hrefs = STYLE_MANIFEST[type] || [];
  await Promise.all([
    ensureStyle(LOADING_STYLE),
    ...hrefs.map(ensureStyle),
  ]);
  return true;
}

function entityLabel(type = "") {
  return {
    factura: "factura",
    incidencia: "incidencia",
    cliente: "cliente",
    usuario: "usuario",
  }[type] || "detalle";
}

function ensureLoadingHost() {
  if (!isBrowser()) return null;

  if (loadingHost?.isConnected) {
    return loadingHost;
  }

  loadingHost =
    document.querySelector(
      "[data-entity-overlay-loading-host='true']"
    ) ||
    document.createElement("div");

  loadingHost.setAttribute(
    "data-entity-overlay-loading-host",
    "true"
  );

  if (!loadingHost.isConnected) {
    document.body.appendChild(loadingHost);
  }

  return loadingHost;
}

function showLoading(descriptor = null) {
  if (!isBrowser() || !descriptor) return false;

  const host = ensureLoadingHost();
  if (!host) return false;

  const label = entityLabel(descriptor.type);

  host.innerHTML = `
    <div
      class="entity-overlay-loading"
      role="status"
      aria-live="polite"
      aria-label="Abriendo ${label}"
    >
      <div class="entity-overlay-loading-card">
        <span class="entity-overlay-loading-spinner" aria-hidden="true"></span>
        <span>
          <strong>Abriendo ${label}</strong>
          <small>Cargando el detalle solicitado…</small>
        </span>
      </div>
    </div>
  `;

  host.dataset.open = "true";
  return true;
}

function scheduleLoading(descriptor = null) {
  hideLoading();

  if (!isBrowser() || !descriptor) return 0;

  const sequence = ++loadingSequence;

  loadingTimer = window.setTimeout(() => {
    loadingTimer = 0;

    if (sequence !== loadingSequence) {
      return;
    }

    showLoading(descriptor);
  }, LOADING_DELAY_MS);

  return sequence;
}

function hideLoading() {
  loadingSequence += 1;

  if (loadingTimer && isBrowser()) {
    window.clearTimeout(loadingTimer);
  }

  loadingTimer = 0;

  if (loadingHost) {
    loadingHost.dataset.open = "false";
    loadingHost.replaceChildren();
  }

  return true;
}

function focusTarget(target = null) {
  if (
    !target ||
    !target.isConnected ||
    !isFunction(target.focus)
  ) {
    return false;
  }

  try {
    target.focus({ preventScroll: true });
    return true;
  } catch {
    try {
      target.focus();
      return true;
    } catch {
      return false;
    }
  }
}

function enqueue(task) {
  const runner = isFunction(task)
    ? task
    : () => false;

  const next = operation.then(runner, runner);
  operation = next.catch(() => false);
  return next;
}

async function getAdapter(type = "") {
  if (adapters.has(type)) {
    return adapters.get(type);
  }

  if (adapterPromises.has(type)) {
    return adapterPromises.get(type);
  }

  const loader = ADAPTER_LOADERS[type];

  if (!isFunction(loader)) {
    throw new Error("ENTITY_OVERLAY_ADAPTER_NOT_FOUND");
  }

  const promise = Promise.resolve()
    .then(loader)
    .then(async (module) => {
      const factory =
        module?.createEntityAdapter ||
        module?.default;

      if (!isFunction(factory)) {
        throw new Error("ENTITY_OVERLAY_ADAPTER_INVALID");
      }

      const adapter = await factory({
        service: api,
        type,
      });

      if (
        !adapter ||
        !isFunction(adapter.open) ||
        !isFunction(adapter.close)
      ) {
        throw new Error("ENTITY_OVERLAY_ADAPTER_INVALID");
      }

      adapters.set(type, adapter);
      return adapter;
    })
    .finally(() => {
      adapterPromises.delete(type);
    });

  adapterPromises.set(type, promise);
  return promise;
}

async function closeRecord(
  record = null,
  {
    reason = "entity-switch",
    suppressNotify = true,
    restoreFocus = false,
  } = {}
) {
  if (!record?.adapter) return true;

  try {
    return (
      await record.adapter.close({
        reason,
        suppressNotify,
        restoreFocus,
      })
    ) !== false;
  } catch {
    return false;
  }
}

async function openDescriptorNow(
  input = {},
  options = {}
) {
  const descriptor =
    normalizeEntityDescriptor(input);

  if (!descriptor) {
    showToast(
      "No se ha podido identificar el detalle solicitado.",
      "error"
    );
    return false;
  }

  const sameActive =
    activeRecord &&
    activeRecord.descriptor.type === descriptor.type &&
    activeRecord.descriptor.id === descriptor.id;

  if (sameActive) {
    try {
      return (
        await activeRecord.adapter.open({
          descriptor,
          id: descriptor.id,
          opener:
            options.opener ||
            input.opener ||
            activeRecord.returnFocus ||
            null,
          source: descriptor.source,
        })
      ) !== false;
    } catch (error) {
      showToast(safeError(error), "error");
      return false;
    }
  }

  const previous = activeRecord;
  const returnFocus =
    options.returnFocus ||
    input.opener ||
    (isBrowser() ? document.activeElement : null) ||
    previous?.returnFocus ||
    null;

  scheduleLoading(descriptor);

  try {
    await ensureEntityStyles(descriptor.type);
    const adapter = await getAdapter(descriptor.type);

    if (previous) {
      await closeRecord(previous, {
        reason: "entity-switch",
        suppressNotify: true,
        restoreFocus: false,
      });
    }

    const sequence = ++transitionSequence;

    activeRecord = {
      descriptor,
      adapter,
      returnFocus,
      openedAt: Date.now(),
      sequence,
    };

    const opened = (
      await adapter.open({
        descriptor,
        id: descriptor.id,
        opener: returnFocus,
        source: descriptor.source,
      })
    ) !== false;

    if (
      !opened ||
      !activeRecord ||
      activeRecord.sequence !== sequence
    ) {
      throw new Error("ENTITY_OVERLAY_OPEN_FAILED");
    }

    if (
      previous &&
      options.pushStack !== false &&
      options.replace !== true
    ) {
      stack = [
        ...stack,
        {
          descriptor: previous.descriptor,
          returnFocus: previous.returnFocus,
        },
      ].slice(-MAX_STACK_DEPTH);
    }

    hideLoading();

    emit("onion:entity-overlay:opened", {
      type: descriptor.type,
      id: descriptor.id,
      source: descriptor.source,
      stackDepth: stack.length,
      version: ENTITY_OVERLAY_VERSION,
    });

    return true;
  } catch (error) {
    const failed = activeRecord;

    if (
      failed &&
      failed.descriptor.type === descriptor.type &&
      failed.descriptor.id === descriptor.id
    ) {
      await closeRecord(failed, {
        reason: "entity-open-failed",
        suppressNotify: true,
        restoreFocus: false,
      });
      activeRecord = null;
    }

    hideLoading();
    showToast(safeError(error), "error");

    if (previous) {
      await openDescriptorNow(
        previous.descriptor,
        {
          replace: true,
          pushStack: false,
          returnFocus: previous.returnFocus,
        }
      );
    } else {
      focusTarget(returnFocus);
    }

    return false;
  }
}

async function adapterClosedNow(
  adapter = null,
  payload = {}
) {
  if (
    !activeRecord ||
    activeRecord.adapter !== adapter
  ) {
    return false;
  }

  const closed = activeRecord;
  activeRecord = null;
  hideLoading();

  emit("onion:entity-overlay:closed", {
    type: closed.descriptor.type,
    id: closed.descriptor.id,
    reason: cleanText(payload?.reason, "user-close"),
    stackDepth: stack.length,
    version: ENTITY_OVERLAY_VERSION,
  });

  if (stack.length) {
    const previous = stack[stack.length - 1];
    stack = stack.slice(0, -1);

    return openDescriptorNow(
      previous.descriptor,
      {
        replace: true,
        pushStack: false,
        returnFocus: previous.returnFocus,
      }
    );
  }

  focusTarget(closed.returnFocus);
  return true;
}

function descriptorFromNode(node = null) {
  if (!node) return null;

  return normalizeEntityDescriptor({
    type:
      node.dataset?.entityType ||
      node.dataset?.homeEntityType ||
      node.getAttribute?.("data-entity-type") ||
      "",
    id:
      node.dataset?.entityId ||
      node.dataset?.homeEntityId ||
      node.getAttribute?.("data-entity-id") ||
      "",
    source:
      node.dataset?.entitySource ||
      node.getAttribute?.("data-entity-source") ||
      "dom",
  });
}

function onDocumentClick(event) {
  if (
    event?.defaultPrevented ||
    (typeof event?.button === "number" && event.button !== 0)
  ) {
    return;
  }

  const node =
    event?.target?.closest?.(OPEN_SELECTOR) ||
    null;

  if (!node) return;

  const descriptor = descriptorFromNode(node);
  if (!descriptor) return;

  event.preventDefault?.();
  event.stopPropagation?.();

  void api.open({
    ...descriptor,
    opener: node,
  });
}

function onDocumentKeydown(event) {
  if (
    !["Enter", " "].includes(event?.key)
  ) {
    return;
  }

  const node =
    event?.target?.closest?.(OPEN_SELECTOR) ||
    null;

  if (!node) return;

  if (
    ["BUTTON", "A", "INPUT"].includes(
      cleanText(node.tagName, "").toUpperCase()
    )
  ) {
    return;
  }

  const descriptor = descriptorFromNode(node);
  if (!descriptor) return;

  event.preventDefault?.();
  event.stopPropagation?.();

  void api.open({
    ...descriptor,
    opener: node,
  });
}

function eventDetail(event = null) {
  const detail =
    event?.detail?.detail ||
    event?.detail?.payload ||
    event?.detail ||
    event?.payload ||
    {};

  return detail && typeof detail === "object"
    ? detail
    : {};
}

function onEntityOpenEvent(event) {
  const detail = eventDetail(event);
  void api.open(detail);
}

export function initEntityOverlay() {
  if (initialized) return api;
  initialized = true;

  try {
    AppCore?.registerModule?.(
      MODULE_NAME,
      api,
      { overwrite: true }
    );
  } catch {
    // getter directo debajo
  }

  try {
    AppCore.entities = api;
    AppCore.entityOverlay = api;
  } catch {
    // registry sigue disponible
  }

  if (isBrowser()) {
    document.addEventListener(
      "click",
      onDocumentClick
    );

    document.addEventListener(
      "keydown",
      onDocumentKeydown
    );

    window.addEventListener(
      "onion:entity-open",
      onEntityOpenEvent
    );

    void ensureStyle(LOADING_STYLE);
  }

  return api;
}

export function openEntity(
  input = {},
  options = {}
) {
  return enqueue(
    () => openDescriptorNow(input, options)
  );
}

export function closeEntity(options = {}) {
  return enqueue(async () => {
    const current = activeRecord;

    if (!current) {
      if (options.clearStack !== false) {
        stack = [];
      }
      return true;
    }

    activeRecord = null;

    await closeRecord(current, {
      reason: cleanText(options.reason, "programmatic-close"),
      suppressNotify: true,
      restoreFocus: false,
    });

    if (options.clearStack !== false) {
      stack = [];
    }

    hideLoading();

    if (options.restoreFocus !== false) {
      focusTarget(current.returnFocus);
    }

    emit("onion:entity-overlay:closed", {
      type: current.descriptor.type,
      id: current.descriptor.id,
      reason: cleanText(options.reason, "programmatic-close"),
      stackDepth: stack.length,
      version: ENTITY_OVERLAY_VERSION,
    });

    return true;
  });
}

export function backEntity() {
  return enqueue(async () => {
    if (!activeRecord) return false;

    const current = activeRecord;
    activeRecord = null;

    await closeRecord(current, {
      reason: "entity-back",
      suppressNotify: true,
      restoreFocus: false,
    });

    if (!stack.length) {
      focusTarget(current.returnFocus);
      return true;
    }

    const previous = stack[stack.length - 1];
    stack = stack.slice(0, -1);

    return openDescriptorNow(
      previous.descriptor,
      {
        replace: true,
        pushStack: false,
        returnFocus: previous.returnFocus,
      }
    );
  });
}

export function getEntityOverlaySnapshot() {
  return Object.freeze({
    version: ENTITY_OVERLAY_VERSION,
    initialized,
    active: activeRecord
      ? Object.freeze({
          type: activeRecord.descriptor.type,
          id: "***",
          source: activeRecord.descriptor.source,
        })
      : null,
    stackDepth: stack.length,
    adapters: Object.freeze([...adapters.keys()]),
    loading: Boolean(
      loadingTimer ||
      loadingHost?.dataset?.open === "true"
    ),
    policy: Object.freeze({
      oneActiveEntity: true,
      canonicalModalsOnly: true,
      lazyAdapters: true,
      lazyStyles: true,
      backgroundRoutePreserved: true,
      focusRestored: true,
      relationStack: true,
      noStorage: true,
      noRouterNavigationRequired: true,
    }),
  });
}

const api = Object.freeze({
  version: ENTITY_OVERLAY_VERSION,
  init: initEntityOverlay,
  open: openEntity,
  close: closeEntity,
  back: backEntity,
  normalizeType: normalizeEntityType,
  normalizeId: normalizeEntityId,
  normalizeDescriptor: normalizeEntityDescriptor,
  getSnapshot: getEntityOverlaySnapshot,
  getDebugSnapshot: getEntityOverlaySnapshot,

  /* Contrato interno exclusivo para adaptadores canónicos. */
  _adapterClosed(adapter = null, payload = {}) {
    return enqueue(
      () => adapterClosedNow(adapter, payload)
    );
  },
});

initEntityOverlay();

export const EntityOverlay = api;
export default api;
