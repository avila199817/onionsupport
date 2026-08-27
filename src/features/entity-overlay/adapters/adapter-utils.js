/* =========================================================
   Onion Support - Entity Overlay Adapter Utilities
========================================================= */

export const ENTITY_ADAPTER_UTILS_VERSION =
  "entity-adapter-utils.v1";

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

export function normalizeAction(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_.:]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

export function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}

export function readPath(source = {}, path = "") {
  const parts = cleanText(path, "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  let current = source;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current?.[part];
  }

  return current;
}

export function firstPath(source = {}, paths = []) {
  const candidates = [
    source,
    safeObject(source?.data),
    safeObject(source?.item),
    safeObject(source?.result),
    safeObject(source?.payload),
    safeObject(source?.raw),
    safeObject(source?.raw?.data),
    safeObject(source?.raw?.item),
  ];

  for (const candidate of candidates) {
    for (const path of safeArray(paths)) {
      const value = readPath(candidate, path);
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && !value.trim()) continue;
      if (Array.isArray(value) && !value.length) continue;
      if (isObject(value) && !Object.keys(value).length) continue;
      return value;
    }
  }

  return null;
}

export function unwrapEntity(payload = null, type = "") {
  if (!payload) return null;
  if (!isObject(payload)) return payload;

  const key = cleanText(type, "").toLowerCase();
  const candidates = [
    payload.item,
    payload.data,
    payload.result,
    payload.payload,
    payload.detail,
    payload[key],
    key === "factura" ? payload.invoice : null,
    key === "incidencia" ? payload.ticket : null,
    key === "cliente" ? payload.client : null,
    key === "usuario" ? payload.user : null,
    payload,
  ];

  return candidates.find((value) => isObject(value) && Object.keys(value).length) || null;
}

export function safeError(error = null, fallback = "No se pudo cargar el detalle.") {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  )
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .slice(0, 500);
}

export async function importFirst(loaders = []) {
  let lastError = null;

  for (const loader of safeArray(loaders)) {
    if (typeof loader !== "function") continue;

    try {
      return await loader();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("ENTITY_ADAPTER_MODULE_NOT_FOUND");
}

export function pickFunction(module = {}, names = [], pattern = null) {
  const source = safeObject(module);
  const fallback = safeObject(source.default);

  for (const name of safeArray(names)) {
    if (typeof source[name] === "function") return source[name];
    if (typeof fallback[name] === "function") return fallback[name];
  }

  if (pattern instanceof RegExp) {
    for (const [name, value] of Object.entries({ ...fallback, ...source })) {
      if (typeof value === "function" && pattern.test(name)) return value;
    }
  }

  return null;
}

export function pickRenderer(module = {}, names = [], pattern = null) {
  return pickFunction(module, names, pattern || /render.*(?:detail|modal)/i);
}

export function actionFromNode(node = null, prefixes = []) {
  if (!node) return "";

  const dataset = node.dataset || {};
  const values = [
    dataset.entityOverlayAction,
    dataset.action,
    ...safeArray(prefixes).map((prefix) => dataset[`${prefix}Action`]),
    node.getAttribute?.("data-entity-overlay-action"),
    node.getAttribute?.("data-action"),
    ...safeArray(prefixes).map((prefix) =>
      node.getAttribute?.(`data-${prefix.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-action`)
    ),
  ];

  return normalizeAction(first(...values, ""));
}

export function currentRole(AppCore = null) {
  try {
    const state = AppCore?.runtimeState?.read?.() || {};
    const user = first(state.user, state.currentUser, state.session?.user, {});
    return cleanText(
      first(
        user?.role,
        user?.rol,
        Array.isArray(user?.roles) ? user.roles[0] : user?.roles,
        state.role,
        state.rol,
        "user"
      ),
      "user"
    ).toLowerCase();
  } catch {
    return "user";
  }
}

export function isAdminRole(AppCore = null) {
  try {
    const role = AppCore?.normalizeRole?.(currentRole(AppCore)) || currentRole(AppCore);
    return ["admin", "administrator", "administrador", "owner"].includes(
      cleanText(role, "").toLowerCase()
    );
  } catch {
    return false;
  }
}

export function entityIdFromData(type = "", data = {}) {
  const key = cleanText(type, "").toLowerCase();
  const paths = {
    factura: [
      "id",
      "facturaId",
      "invoiceId",
      "numeroFacturaLegal",
      "numeroFactura",
      "invoiceNumber",
      "number",
    ],
    incidencia: [
      "id",
      "ticketId",
      "incidenciaId",
      "issueId",
      "code",
      "numero",
    ],
    cliente: ["id", "clienteId", "clientId", "customerId"],
    usuario: ["id", "usuarioId", "userId"],
  };

  return cleanText(firstPath(data, paths[key] || ["id"]), "");
}

export function relationId(data = {}, type = "", node = null) {
  const dataset = node?.dataset || {};
  const key = cleanText(type, "").toLowerCase();
  const explicit = {
    factura: first(dataset.entityId, dataset.facturaId, dataset.invoiceId),
    incidencia: first(dataset.entityId, dataset.incidenciaId, dataset.ticketId),
    cliente: first(dataset.entityId, dataset.clienteId, dataset.clientId),
    usuario: first(dataset.entityId, dataset.usuarioId, dataset.userId),
  }[key];

  if (explicit) return cleanText(explicit, "");

  const paths = {
    factura: [
      "facturaId",
      "invoiceId",
      "factura.id",
      "invoice.id",
      "billing.id",
      "relations.facturaId",
      "relations.invoiceId",
    ],
    incidencia: [
      "ticketId",
      "incidenciaId",
      "ticket.id",
      "incidencia.id",
      "issue.id",
      "relations.ticketId",
      "relations.incidenciaId",
    ],
    cliente: [
      "clienteId",
      "clientId",
      "customerId",
      "cliente.id",
      "client.id",
      "customer.id",
      "relations.clienteId",
    ],
    usuario: [
      "usuarioId",
      "userId",
      "usuario.id",
      "user.id",
      "assignedTo.id",
      "assignee.id",
      "relations.usuarioId",
    ],
  };

  return cleanText(firstPath(data, paths[key] || []), "");
}

export function safeUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|vbscript|file|data):/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function resultUrl(result = null, mode = "view") {
  if (!isObject(result)) return "";

  const preferred = mode === "download"
    ? [
        result.downloadUrl,
        result.file?.downloadUrl,
        result.pdf?.downloadUrl,
        result.document?.downloadUrl,
      ]
    : [
        result.viewUrl,
        result.file?.viewUrl,
        result.pdf?.viewUrl,
        result.document?.viewUrl,
      ];

  return safeUrl(first(
    ...preferred,
    result.signedUrl,
    result.sasUrl,
    result.url,
    result.file?.signedUrl,
    result.file?.sasUrl,
    result.file?.url,
    result.pdf?.signedUrl,
    result.pdf?.sasUrl,
    result.pdf?.url,
    result.document?.signedUrl,
    result.document?.sasUrl,
    result.document?.url,
    ""
  ));
}

export function openDocumentResult(result = null, {
  mode = "view",
  filename = "documento.pdf",
} = {}) {
  if (typeof Blob !== "undefined" && result instanceof Blob) {
    const url = URL.createObjectURL(result);

    if (mode === "download") {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = cleanText(filename, "documento.pdf");
      anchor.rel = "noopener";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
      return true;
    }

    const opened = window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return Boolean(opened);
  }

  const url = resultUrl(result, mode);
  if (!url) return false;

  if (mode === "download") {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = cleanText(filename, "documento.pdf");
    anchor.rel = "noopener noreferrer";
    anchor.target = "_blank";
    anchor.click();
    return true;
  }

  return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
}

function visibleEntries(data = {}) {
  const source = safeObject(data);
  const preferred = [
    ["Nombre", first(source.name, source.nombre, source.displayName, source.title, source.titulo)],
    ["Email", first(source.email, source.correo)],
    ["Teléfono", first(source.phone, source.telefono, source.mobile, source.movil)],
    ["Estado", first(source.status, source.estado)],
    ["Creado", first(source.createdAt, source.created_at, source.fechaCreacion)],
    ["Actualizado", first(source.updatedAt, source.updated_at, source.fechaActualizacion)],
  ];

  return preferred.filter(([, value]) => value !== undefined && value !== null && cleanText(value, ""));
}

export function renderGenericDetail({
  type = "entidad",
  id = "",
  data = {},
  title = "",
  error = "",
} = {}) {
  const entityTitle = cleanText(title, `${type} ${id}`);
  const rows = visibleEntries(data)
    .map(([label, value]) => `
      <div class="entity-overlay-generic-row">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(cleanText(value, "—"))}</dd>
      </div>
    `)
    .join("");

  return `
    <div class="entity-overlay-backdrop" data-entity-overlay-backdrop="true">
      <section
        class="entity-overlay-generic-panel"
        data-entity-overlay-panel="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-overlay-generic-title"
        tabindex="-1"
      >
        <header class="entity-overlay-generic-header">
          <div>
            <span class="entity-overlay-eyebrow">Vista rápida</span>
            <h2 id="entity-overlay-generic-title">${escapeHtml(entityTitle)}</h2>
          </div>
          <button
            type="button"
            class="entity-overlay-close"
            data-entity-overlay-action="close"
            aria-label="Cerrar detalle"
          >×</button>
        </header>
        <div class="entity-overlay-generic-body">
          ${error ? `<p class="entity-overlay-error" role="alert">${escapeHtml(error)}</p>` : ""}
          ${rows ? `<dl class="entity-overlay-generic-list">${rows}</dl>` : ""}
          ${!rows && !error ? `<p class="entity-overlay-muted">Detalle disponible.</p>` : ""}
        </div>
      </section>
    </div>
  `;
}

export function renderAdapterError({ type = "entidad", id = "", error = "" } = {}) {
  return renderGenericDetail({
    type,
    id,
    title: `No se pudo abrir ${type}`,
    error: cleanText(error, "No se pudo cargar el detalle."),
  });
}

export function renderAdapterLoading({ type = "entidad", id = "" } = {}) {
  return `
    <div class="entity-overlay-backdrop" data-entity-overlay-backdrop="true">
      <section
        class="entity-overlay-loading-panel"
        data-entity-overlay-panel="true"
        role="dialog"
        aria-modal="true"
        aria-label="Cargando ${attr(type)} ${attr(id)}"
        tabindex="-1"
      >
        <span class="entity-overlay-spinner" aria-hidden="true"></span>
        <strong>Cargando detalle…</strong>
        <span>${escapeHtml(id)}</span>
      </section>
    </div>
  `;
}

export default Object.freeze({
  version: ENTITY_ADAPTER_UTILS_VERSION,
  isObject,
  safeObject,
  safeArray,
  cleanText,
  normalizeAction,
  escapeHtml,
  attr,
  first,
  readPath,
  firstPath,
  unwrapEntity,
  safeError,
  importFirst,
  pickFunction,
  pickRenderer,
  actionFromNode,
  currentRole,
  isAdminRole,
  entityIdFromData,
  relationId,
  safeUrl,
  openDocumentResult,
  renderGenericDetail,
  renderAdapterError,
  renderAdapterLoading,
});
