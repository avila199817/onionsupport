/* =========================================================
Onion Support - Clientes Index
Archivo: /src/views/clientes/index.js
PRODUCTIVO · STALE-WHILE-REVALIDATE · V8
Objetivos:
- Pintar cache inmediatamente y revalidar en segundo plano.
- No mostrar loaders de página al volver a /clientes.
- Un único controller por host y un único GET de listado en vuelo.
- Mantener creación y detalle como islas estables.
- Sin botón manual de actualizar; refresh queda sólo como API pública.
========================================================= */
import { AppCore } from "../../core/index.js";
import { ROUTES } from "../../core/config.js";
import {
CLIENTES_API_VERSION,
CLIENTES_ENDPOINT,
CLIENTES_FETCH_LIMIT,
CLIENTES_MAX_LIMIT,
CLIENTES_MAX_PAGES,
CLIENTES_CACHE_KEY,
CLIENTES_CACHE_TTL_MS,
hydrateClientesFromCache,
loadClientes as loadClientesRequest,
refreshClientes as refreshClientesRequest,
loadClienteDetail as loadClienteDetailRequest,
createCliente as createClienteRequest,
normalizeClienteModel,
normalizeClientesCollection,
findClienteById as findClienteByIdApi,
} from "./clientes.api.js";
import {
renderClientesTemplate,
CLIENTES_ACTIONS,
} from "./clientes.template.js";
import {
renderClientesCreateModal,
CREATE_ACTIONS,
getCreateFormDefaults,
validateCreateForm,
buildClienteCreatePayload,
} from "./clientes.template.create.js";
import {
openClientesDetailModal,
closeClientesDetailModal,
} from "./clientes.template.modal.js";
import {
fetchUsuariosRequest,
normalizeUsuarioModel,
} from "../usuarios/usuarios.api.js";
export const CLIENTES_MODULE_NAME = "clientes";
export const CLIENTES_VIEW_NAME = "ClientesView";
export const CLIENTES_CANONICAL_PATH = "/clientes";
export const CLIENTES_INDEX_VERSION = "clientes.index.productivo.v8.swr-stable-islands";
export const CLIENTES_VIEW_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_MODULE_VERSION = CLIENTES_INDEX_VERSION;
export const CLIENTES_INDEX_SOURCE = "views.clientes.index";
export {
CLIENTES_ENDPOINT,
CLIENTES_FETCH_LIMIT,
CLIENTES_MAX_LIMIT,
CLIENTES_MAX_PAGES,
CLIENTES_CACHE_KEY,
CLIENTES_CACHE_TTL_MS,
};
const DEFAULT_VISIBLE_LIMIT = 20;
const VISIBLE_STEP = 20;
const DEFAULT_SORT_ORDER = "desc";
const SEARCH_DEBOUNCE_MS = 220;
const USER_SEARCH_DEBOUNCE_MS = 220;
const USER_SEARCH_MIN_LENGTH = 2;
const USER_SEARCH_LIMIT = 8;
const REVALIDATE_MIN_AGE_MS = 15_000;
const CREATE_MODAL_ROOT_SELECTOR = "[data-clientes-create-root='true']";
const CREATE_MODAL_PANEL_SELECTOR = "[data-clientes-create-modal-panel='true']";
const CREATE_MODAL_OVERLAY_SELECTOR = "[data-clientes-create-modal-overlay='true']";
const CREATE_MODAL_BODY_SELECTOR = ".cli-create-body, .inc-create-body";
const INSTANCES = new WeakMap();
let lastInstance = null;
let controllerSequence = 0;
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
if (Array.isArray(value)) return value;
if (value && typeof value === "object" && typeof value.length === "number" && typeof value !== "string") {
try { return Array.from(value); } catch { return []; }
}
return [];
}
function cleanText(value = "", fallback = "") {
const text = String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
return text || fallback;
}
function first(...values) {
for (const value of values) {
if (value === undefined || value === null) continue;
if (typeof value === "string" && value.trim() === "") continue;
if (Array.isArray(value) && value.length === 0) continue;
if (isObject(value) && Object.keys(value).length === 0) continue;
return value;
}
return null;
}
function number(value = 0, fallback = 0) {
const parsed = Number(value);
return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeKey(value = "") {
return cleanText(value, "")
.toLowerCase()
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.replace(/[\s-]+/g, "_")
.replace(/[^\w:.]/g, "")
.replace(/^_+|_+$/g, "");
}
function normalizeEmail(value = "") {
const email = cleanText(value, "").toLowerCase();
return email && email.includes("@") ? email : "";
}
function safeError(error = null, fallback = "No se pudieron cargar los clientes.") {
return cleanText(first(error?.message, error?.data?.message, error?.payload?.message, error?.response?.data?.message, error?.response?.message, error?.error, error?.code, fallback), fallback);
}
function isDomNode(value = null) {
return Boolean(value && typeof value === "object" && value.nodeType === 1 && "innerHTML" in value && typeof value.addEventListener === "function");
}
function isElement(value = null) {
return Boolean(typeof Element !== "undefined" && value instanceof Element);
}
function nextFrame(callback) {
if (!isBrowser() || typeof callback !== "function") return 0;
return typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame(callback) : window.setTimeout(callback, 0);
}
function cancelFrame(id = 0) {
if (!id || !isBrowser()) return;
try { window.cancelAnimationFrame?.(id); } catch { /* noop */ }
try { window.clearTimeout?.(id); } catch { /* noop */ }
}
function getGlobalObject() {
try { return globalThis; } catch { return {}; }
}
function getAppState() {
try { return AppCore.getState?.() || AppCore.state || {}; }
catch { return AppCore.state || {}; }
}
function getCurrentUser() {
const state = getAppState();
try { return AppCore.getCurrentUser?.() || state.user || state.currentUser || null; }
catch { return state.user || state.currentUser || null; }
}
function getCurrentRole(context = {}) {
const state = getAppState();
const user = safeObject(getCurrentUser());
try {
return AppCore.normalizeRole(first(context.role, context.rol, context.user?.role, context.user?.rol, AppCore.getCurrentRole?.(), state.role, state.rol, state.roles, user.role, user.rol, user.roles, "")) || "user";
} catch {
return normalizeKey(first(context.role, state.role, user.role, "user")) === "admin" ? "admin" : "user";
}
}
function isAdmin(context = {}) {
return context.admin === true || getCurrentRole(context) === "admin";
}
function getRoutes() {
return {
incidencias: ROUTES?.incidencias || "/incidencias",
facturas: ROUTES?.facturas || "/facturas",
clientes: ROUTES?.clientes || "/clientes",
usuarios: ROUTES?.usuarios || "/usuarios",
servidor: ROUTES?.servidor || "/servidor",
};
}
function normalizePath(path = "/") {
let value = cleanText(path, "/").replace(/\\/g, "/").replace(/\/{2,}/g, "/");
if (!value.startsWith("/")) value = `/${value}`;
value = value.split("?")[0].split("#")[0] || "/";
if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";
const segments = value.split("/").filter(Boolean);
if (segments[0]?.startsWith("@")) value = `/${segments.slice(1).join("/")}` || "/";
return value;
}
function currentPath(context = {}) {
if (isBrowser()) {
try {
const hash = window.location.hash || "";
if (hash.startsWith("#/")) return normalizePath(hash.slice(1));
if (hash.startsWith("#!/")) return normalizePath(hash.slice(2));
return normalizePath(window.location.pathname || "/");
} catch { /* noop */ }
}
return normalizePath(first(context.canonicalPath, context.routePath, context.route?.path, context.path, CLIENTES_CANONICAL_PATH));
}
function isClientesRoute(context = {}) {
return currentPath(context) === CLIENTES_CANONICAL_PATH;
}
function resolveHost(host = null, context = {}) {
if (isDomNode(host)) return host;
for (const candidate of [context.host, context.root, context.container]) if (isDomNode(candidate)) return candidate;
if (!isBrowser()) return null;
return document.querySelector("[data-view-host='clientes']") || document.querySelector("[data-clientes-host='true']") || document.querySelector("#app-content") || document.querySelector("main") || null;
}
function showToast(message = "", type = "info") {
const text = cleanText(message, "");
if (!text) return false;
for (const toast of [AppCore?.toast, AppCore?.ui?.toast, AppCore?.Toast]) {
try {
if (typeof toast?.[type] === "function") { toast[type](text); return true; }
if (typeof toast?.show === "function") { toast.show(text, type); return true; }
} catch { /* noop */ }
}
return false;
}
function emitEvent(name = "", payload = {}) {
const eventName = cleanText(name, "");
if (!eventName) return false;
try {
if (typeof AppCore?.events?.emit === "function") { AppCore.events.emit(eventName, payload); return true; }
} catch { /* fallback */ }
try {
if (isBrowser()) { window.dispatchEvent(new CustomEvent(eventName, { detail: payload })); return true; }
} catch { /* noop */ }
return false;
}
function cloneItems(items = []) {
return normalizeClientesCollection(safeArray(items)).map((item) => ({ ...item }));
}
function getClienteId(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return cleanText(first(current.clienteId, current.clientId, current.customerId, current.id, current._id, current.uid, ""), "");
}
function getClienteName(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return cleanText(first(current.nombreFiscal, current.razonSocial, current.displayName, current.name, current.email, current.clienteId, "Cliente"), "Cliente");
}
function getClienteCode(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return cleanText(first(current.code, current.codigo, current.clienteId, current.nif, current.email, "CLI-SIN-ID"), "CLI-SIN-ID");
}
function getClienteEmail(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return normalizeEmail(first(current.email, current.emailLower, current.contactEmail, current.billingEmail, ""));
}
function getClientePhone(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return cleanText(first(current.phone, current.telefono, current.mobile, current.movil, ""), "");
}
function getClienteCity(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return cleanText(first(current.city, current.ciudad, current.direccion?.ciudad, current.address?.city, ""), "");
}
function getClienteNif(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return cleanText(first(current.nif, current.cif, current.taxId, ""), "").toUpperCase();
}
function getClienteStatus(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return cleanText(first(current.status, current.estado, "active"), "active");
}
function getClienteType(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return cleanText(first(current.tipo, current.type, "cliente"), "cliente");
}
function getClienteAmount(item = {}) {
const current = normalizeClienteModel(safeObject(item));
return number(first(current.totalAmount, current.totalImporte, current.facturasTotal, 0), 0);
}
function csvEscape(value = "") {
let text = String(value ?? "");
if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
return `"${text.replace(/"/g, '""')}"`;
}
function normalizeSearchUser(value = {}) {
const raw = safeObject(value);
let normalized = raw;
try { normalized = normalizeUsuarioModel(raw); } catch { /* raw */ }
const userId = cleanText(first(normalized.userId, normalized.id, normalized.uid, raw.userId, raw.id, raw.uid, raw.usuarioId, ""), "");
const clienteId = cleanText(first(normalized.clienteId, normalized.clientId, normalized.customerId, raw.clienteId, raw.clientId, raw.customerId, ""), "");
const displayName = cleanText(first(normalized.displayName, normalized.fullName, normalized.name, normalized.nombre, raw.displayName, raw.name, userId, "Usuario"), "Usuario");
const email = normalizeEmail(first(normalized.email, normalized.emailLower, raw.email, raw.emailLower, ""));
const phone = cleanText(first(normalized.phone, normalized.telefono, normalized.mobile, raw.phone, raw.telefono, ""), "");
const username = cleanText(first(normalized.username, normalized.usernameLower, raw.username, raw.usernameLower, ""), "").toLowerCase();
const avatarUrl = cleanText(first(normalized.avatarUrl, normalized.avatar, normalized.picture, raw.avatarUrl, raw.avatar, raw.picture, ""), "");
return { ...raw, ...normalized, id: userId, userId, uid: userId, clienteId, targetClienteId: clienteId, displayName, name: displayName, fullName: displayName, email, emailLower: email, phone, telefono: phone, username, usernameLower: username, avatarUrl, avatar: avatarUrl || null };
}
function usersFromPayload(payload = null) {
if (Array.isArray(payload)) return payload;
const queue = [payload];
const seen = new Set();
while (queue.length) {
const value = queue.shift();
if (!isObject(value) || seen.has(value)) continue;
seen.add(value);
for (const key of ["items", "results", "users", "usuarios", "rows", "records", "docs", "documents", "list", "value"]) {
if (Array.isArray(value[key])) return value[key];
}
for (const key of ["data", "payload", "response", "result", "body", "value"]) if (isObject(value[key])) queue.push(value[key]);
}
return [];
}
function createClientesController(host = null, initialContext = {}) {
const id = ++controllerSequence;
let root = resolveHost(host, initialContext);
let context = safeObject(initialContext);
let destroyed = false;
let mounted = false;
let items = [];
let total = 0;
let lastSyncAt = 0;
let loading = false;
let refreshing = false;
let creating = false;
let loadingMore = false;
let error = "";
let filter = "all";
let search = "";
let sortOrder = DEFAULT_SORT_ORDER;
let visibleLimit = DEFAULT_VISIBLE_LIMIT;
let openingClienteId = "";
let loadPromise = null;
let loadSeq = 0;
let detailSeq = 0;
let createSeq = 0;
let userSearchSeq = 0;
let searchTimer = 0;
let userSearchTimer = 0;
let renderFrame = 0;
let modalFrame = 0;
let deferredRender = false;
let modalHost = null;
let returnFocus = null;
let firstModalPaint = false;
const createModal = {
open: false,
submitting: false,
serverError: "",
successMessage: "",
createdClienteId: "",
errors: {},
form: getCreateFormDefaults(),
userSearch: { query: "", loading: false, error: "", results: [], selectedUser: null, empty: false },
};
function alive() {
return !destroyed && isClientesRoute(context);
}
function payload(extra = {}) {
return {
id,
user: getCurrentUser(),
role: getCurrentRole(context),
admin: isAdmin(context),
routes: getRoutes(),
route: getRoutes().clientes,
items,
clientes: items,
clients: items,
rows: items,
total,
remoteCount: total,
lastSyncAt,
loading,
refreshing,
creating,
loadingMore,
error,
filter,
search,
sortOrder,
visibleLimit,
openingClienteId,
createModal,
apiVersion: CLIENTES_API_VERSION,
indexVersion: CLIENTES_INDEX_VERSION,
...extra,
};
}
function snapshot() {
return { ...payload(), items: cloneItems(items), clientes: cloneItems(items), clients: cloneItems(items), rows: cloneItems(items), mounted, destroyed };
}
function setItems(nextItems = [], syncAt = Date.now()) {
items = normalizeClientesCollection(nextItems);
total = items.length;
lastSyncAt = number(syncAt, Date.now());
error = "";
}
function captureSearchFocus() {
if (!isBrowser() || !root) return null;
const active = document.activeElement;
if (!active || !root.contains(active) || !active.matches?.("[data-clientes-search-input], [data-search-input='clientes']")) return null;
return { start: Number.isInteger(active.selectionStart) ? active.selectionStart : null, end: Number.isInteger(active.selectionEnd) ? active.selectionEnd : null };
}
function restoreSearchFocus(state = null) {
if (!state || !root) return;
const target = root.querySelector("[data-clientes-search-input], [data-search-input='clientes']");
if (!target) return;
try {
target.focus({ preventScroll: true });
if (state.start !== null && state.end !== null && typeof target.setSelectionRange === "function") {
const max = String(target.value || "").length;
target.setSelectionRange(Math.min(state.start, max), Math.min(state.end, max));
}
} catch { /* noop */ }
}
function renderNow({ force = false } = {}) {
if (!root || destroyed || !isClientesRoute(context)) return false;
if (createModal.open && !force) { deferredRender = true; return false; }
cancelFrame(renderFrame);
renderFrame = 0;
const focusState = captureSearchFocus();
try {
root.innerHTML = renderClientesTemplate(payload());
root.dataset.view = "clientes";
root.dataset.clientesVersion = CLIENTES_INDEX_VERSION;
root.dataset.clientesApiVersion = CLIENTES_API_VERSION;
restoreSearchFocus(focusState);
deferredRender = false;
return true;
} catch (renderError) {
error = safeError(renderError, "No se pudo renderizar la vista de clientes.");
root.textContent = error;
return false;
}
}
function scheduleRender(options = {}) {
if (!root || destroyed) return 0;
if (createModal.open && options.force !== true) { deferredRender = true; return 0; }
cancelFrame(renderFrame);
renderFrame = nextFrame(() => { renderFrame = 0; renderNow(options); });
return renderFrame;
}
async function runLoad({ force = false, silent = false } = {}) {
if (!alive()) return snapshot();
const seq = ++loadSeq;
const hasRows = items.length > 0;
/*
Silent revalidation is intentionally invisible. If rows already exist,
we do not mutate loading/refreshing and we do not repaint before I/O.
*/
if (!silent) {
loading = !hasRows;
refreshing = hasRows;
error = "";
renderNow();
} else if (!hasRows) {
loading = true;
error = "";
renderNow();
}
try {
const response = force
? await refreshClientesRequest({ source: "views.clientes.index.refresh" })
: await loadClientesRequest({ source: "views.clientes.index.load" });
if (seq !== loadSeq || !alive()) return snapshot();
setItems(safeArray(response?.items), first(response?.lastSyncAt, Date.now()));
emitEvent("clientes:loaded", { ...snapshot(), source: CLIENTES_INDEX_SOURCE, controllerId: id });
return snapshot();
} catch (loadError) {
if (seq === loadSeq && !destroyed) error = safeError(loadError);
emitEvent("clientes:error", { message: error, source: CLIENTES_INDEX_SOURCE, controllerId: id });
return snapshot();
} finally {
if (seq === loadSeq && !destroyed) {
loading = false;
refreshing = false;
if (root && isClientesRoute(context)) renderNow();
}
}
}
function load(options = {}) {
if (!alive()) return Promise.resolve(snapshot());
if (loadPromise) return loadPromise;
loadPromise = runLoad(options).finally(() => { loadPromise = null; });
return loadPromise;
}
function refresh() {
return load({ force: true, silent: true });
}
function setSearch(value = "") {
search = cleanText(value, "");
visibleLimit = DEFAULT_VISIBLE_LIMIT;
scheduleRender();
return search;
}
function setFilter(value = "all") {
const key = normalizeKey(value || "all");
filter = ["all", "active", "pending", "blocked"].includes(key) ? key : "all";
visibleLimit = DEFAULT_VISIBLE_LIMIT;
scheduleRender();
return filter;
}
function setSortOrder(value = DEFAULT_SORT_ORDER) {
sortOrder = ["asc", "ascending", "oldest", "antiguos"].includes(normalizeKey(value)) ? "asc" : "desc";
visibleLimit = DEFAULT_VISIBLE_LIMIT;
scheduleRender();
return sortOrder;
}
function clearFilters() {
filter = "all";
search = "";
sortOrder = DEFAULT_SORT_ORDER;
visibleLimit = DEFAULT_VISIBLE_LIMIT;
scheduleRender();
return true;
}
function loadMore(limit = null) {
loadingMore = true;
visibleLimit = Math.min(CLIENTES_MAX_LIMIT, Math.max(1, number(limit, visibleLimit + VISIBLE_STEP)));
scheduleRender();
nextFrame(() => { if (!destroyed) { loadingMore = false; scheduleRender(); } });
return visibleLimit;
}
function exportCsv() {
const rows = normalizeClientesCollection(items);
const header = ["ID", "Código", "Nombre", "Email", "Teléfono", "Ciudad", "NIF", "Estado", "Tipo", "Importe"];
const lines = [header, ...rows.map((item) => [getClienteId(item), getClienteCode(item), getClienteName(item), getClienteEmail(item), getClientePhone(item), getClienteCity(item), getClienteNif(item), getClienteStatus(item), getClienteType(item), String(getClienteAmount(item)).replace(".", ",")])];
const csv = lines.map((row) => row.map(csvEscape).join(";")).join("\n");
if (!isBrowser()) return csv;
try {
const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
document.body.appendChild(link);
link.click();
link.remove();
window.setTimeout(() => URL.revokeObjectURL(url), 1000);
showToast("Clientes exportados.", "success");
return true;
} catch { return csv; }
}
async function openCliente(idValue = "") {
const clienteId = cleanText(idValue, "");
if (!clienteId || openingClienteId === clienteId) return Boolean(clienteId);
const seq = ++detailSeq;
openingClienteId = clienteId;
try {
let current = findClienteByIdApi(items, clienteId);
if (isAdmin(context)) {
try { current = await loadClienteDetailRequest(clienteId, { dedupe: true }); }
catch { /* snapshot fallback */ }
}
if (seq !== detailSeq || !alive() || !current) return false;
const normalized = normalizeClienteModel(current);
if (getClienteId(normalized) !== clienteId) return false;
const map = new Map(items.map((item) => [getClienteId(item), item]));
map.set(clienteId, normalized);
items = normalizeClientesCollection([...map.values()]);
total = items.length;
const opened = openClientesDetailModal(normalized);
return opened !== false;
} catch (detailError) {
showToast(safeError(detailError, "No se pudo abrir el cliente."), "error");
return false;
} finally {
if (seq === detailSeq) {
openingClienteId = "";
}
}
}
function ensureModalHost() {
if (!isBrowser()) return null;
if (modalHost?.isConnected) return modalHost;
modalHost = document.createElement("div");
modalHost.setAttribute("data-clientes-modal-host", "true");
modalHost.setAttribute("data-controller-id", String(id));
modalHost.addEventListener("click", handleModalClick, true);
modalHost.addEventListener("submit", handleModalSubmit, true);
modalHost.addEventListener("input", handleModalInput, true);
modalHost.addEventListener("change", handleModalInput, true);
modalHost.addEventListener("keydown", handleModalKeydown, true);
document.body.appendChild(modalHost);
return modalHost;
}
function removeModalHost() {
cancelFrame(modalFrame);
modalFrame = 0;
if (!modalHost) return;
try {
modalHost.removeEventListener("click", handleModalClick, true);
modalHost.removeEventListener("submit", handleModalSubmit, true);
modalHost.removeEventListener("input", handleModalInput, true);
modalHost.removeEventListener("change", handleModalInput, true);
modalHost.removeEventListener("keydown", handleModalKeydown, true);
modalHost.remove();
} catch { /* noop */ }
modalHost = null;
}
function syncModalAttributes(current, next) {
if (!current || !next) return;
for (const attribute of Array.from(current.attributes || [])) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
for (const attribute of Array.from(next.attributes || [])) current.setAttribute(attribute.name, attribute.value);
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
const field = active && modalHost.contains(active) ? cleanText(active.getAttribute?.("data-field") || active.getAttribute?.("name"), "") : "";
const selection = field && Number.isInteger(active?.selectionStart) ? [active.selectionStart, active.selectionEnd] : null;
const body = currentPanel.querySelector(CREATE_MODAL_BODY_SELECTOR);
const scrollTop = Number(body?.scrollTop || 0);
syncModalAttributes(currentRoot, nextRoot);
syncModalAttributes(currentOverlay, nextOverlay);
syncModalAttributes(currentPanel, nextPanel);
currentPanel.replaceChildren(...Array.from(nextPanel.childNodes));
const nextBody = currentPanel.querySelector(CREATE_MODAL_BODY_SELECTOR);
if (nextBody) nextBody.scrollTop = scrollTop;
if (field) {
const target = Array.from(currentPanel.querySelectorAll("[data-field], [name]")).find((node) => cleanText(node.getAttribute("data-field") || node.getAttribute("name"), "") === field);
if (target) {
try { target.focus({ preventScroll: true }); } catch { target.focus?.(); }
if (selection && typeof target.setSelectionRange === "function") {
const max = String(target.value || "").length;
target.setSelectionRange(Math.min(selection[0], max), Math.min(selection[1], max));
}
}
}
return true;
}
function renderCreateModalNow() {
if (destroyed) return false;
if (!createModal.open) { removeModalHost(); return true; }
const hostNode = ensureModalHost();
if (!hostNode) return false;
const html = renderClientesCreateModal({ ...createModal, admin: isAdmin(context), role: getCurrentRole(context), user: getCurrentUser(), routes: getRoutes() });
const patched = patchStableModal(html);
if (!patched) hostNode.innerHTML = html;
if (firstModalPaint) {
firstModalPaint = false;
nextFrame(() => {
const field = hostNode.querySelector("[data-field='targetUserSearch'], [data-field='nombreFiscal'], input:not([type='hidden'])");
try { field?.focus({ preventScroll: true }); } catch { field?.focus?.(); }
});
}
return true;
}
function scheduleModalRender() {
if (destroyed || !createModal.open) return 0;
cancelFrame(modalFrame);
modalFrame = nextFrame(() => { modalFrame = 0; renderCreateModalNow(); });
return modalFrame;
}
function resetCreateModal() {
createModal.submitting = false;
createModal.serverError = "";
createModal.successMessage = "";
createModal.createdClienteId = "";
createModal.errors = {};
createModal.form = getCreateFormDefaults();
createModal.userSearch = { query: "", loading: false, error: "", results: [], selectedUser: null, empty: false };
}
function openCreate(trigger = null) {
if (!isAdmin(context) || createModal.open) return false;
returnFocus = trigger?.isConnected ? trigger : (isBrowser() ? document.activeElement : null);
resetCreateModal();
createModal.open = true;
firstModalPaint = true;
renderCreateModalNow();
try { document.body?.classList.add("modal-open", "clientes-modal-open", "clientes-create-open"); } catch { /* noop */ }
return true;
}
function closeCreate({ reset = true } = {}) {
if (!createModal.open && !modalHost) return false;
createModal.open = false;
removeModalHost();
try { document.body?.classList.remove("clientes-create-open"); if (!document.querySelector("[data-clientes-detail-modal-host='true'] [data-open='true']")) document.body?.classList.remove("modal-open", "clientes-modal-open"); } catch { /* noop */ }
if (reset) resetCreateModal();
const target = returnFocus;
returnFocus = null;
if (target?.isConnected) nextFrame(() => { try { target.focus({ preventScroll: true }); } catch { target.focus?.(); } });
if (deferredRender) renderNow({ force: true });
return true;
}
function patchCreateForm(patch = {}) {
createModal.form = { ...createModal.form, ...safeObject(patch) };
return createModal.form;
}
function readCreateForm(form = null) {
const output = { ...createModal.form };
if (!form || typeof FormData === "undefined") return output;
try {
const data = new FormData(form);
for (const [key, value] of data.entries()) output[key] = typeof value === "string" ? value : cleanText(value?.name, "");
} catch { /* noop */ }
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
scheduleModalRender();
return [];
}
createModal.userSearch.loading = true;
scheduleModalRender();
try {
const response = await fetchUsuariosRequest({ all: false, limit: USER_SEARCH_LIMIT, includeTotal: false, search: q, q, timeout: 15_000 });
if (seq !== userSearchSeq || destroyed || !createModal.open) return [];
const results = normalizeUserResults(response);
createModal.userSearch.loading = false;
createModal.userSearch.results = results;
createModal.userSearch.empty = results.length === 0;
scheduleModalRender();
return results;
} catch (searchError) {
if (seq !== userSearchSeq || destroyed || !createModal.open) return [];
createModal.userSearch.loading = false;
createModal.userSearch.error = safeError(searchError, "No se pudieron buscar usuarios.");
createModal.userSearch.results = [];
scheduleModalRender();
return [];
}
}
function selectUser(node) {
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
createModal.userSearch = { query: "", loading: false, error: "", results: [], selectedUser: selected, empty: false };
delete createModal.errors.userId;
delete createModal.errors.targetUserId;
scheduleModalRender();
return true;
}
function clearUser() {
patchCreateForm({ targetUserId: "", userId: "", targetClienteId: "", targetUserName: "", targetUserEmail: "", targetUserPhone: "", targetUsername: "", targetUserAvatar: "" });
createModal.userSearch = { query: "", loading: false, error: "", results: [], selectedUser: null, empty: false };
scheduleModalRender();
return true;
}
function copyUserContact() {
const user = normalizeSearchUser(createModal.userSearch.selectedUser || {});
if (!user.userId) return false;
patchCreateForm({ contactoNombre: user.displayName || createModal.form.contactoNombre, contactoEmail: user.email || createModal.form.contactoEmail, contactoPhone: user.phone || createModal.form.contactoPhone, emailFacturacion: user.email || createModal.form.emailFacturacion });
scheduleModalRender();
return true;
}
async function submitCreate(formNode = null) {
if (createModal.submitting || !isAdmin(context)) return false;
const form = readCreateForm(formNode);
const validation = validateCreateForm(form);
createModal.form = validation.form || form;
createModal.errors = safeObject(validation.errors);
createModal.serverError = "";
if (validation.valid !== true) { scheduleModalRender(); return false; }
const seq = ++createSeq;
createModal.submitting = true;
creating = true;
scheduleModalRender();
try {
const body = validation.payload || buildClienteCreatePayload(validation.form || form);
const created = await createClienteRequest(body, { source: "views.clientes.index.create" });
if (seq !== createSeq || !alive()) return false;
const createdId = cleanText(first(created?.clienteId, created?.id, created?.data?.clienteId, created?.data?.id, ""), "");
if (!createdId) throw new Error("CLIENTE_CREATE_ID_MISSING");
let detail = null;
try { detail = await loadClienteDetailRequest(createdId, { dedupe: true }); } catch { /* list reconciliation below */ }
if (detail) {
const map = new Map(items.map((item) => [getClienteId(item), item]));
map.set(createdId, normalizeClienteModel(detail));
items = normalizeClientesCollection([...map.values()]);
total = items.length;
lastSyncAt = Date.now();
}
emitEvent("clientes:create:success", { cliente: detail, detail, clienteId: createdId, response: created, source: CLIENTES_INDEX_SOURCE, controllerId: id });
showToast(`Cliente ${createdId} creado correctamente.`, "success");
creating = false;
createModal.submitting = false;
closeCreate({ reset: true });
await load({ force: true, silent: true });
return true;
} catch (submitError) {
if (seq !== createSeq || destroyed) return false;
creating = false;
createModal.submitting = false;
createModal.serverError = safeError(submitError, "No se pudo crear el cliente.");
scheduleModalRender();
showToast(createModal.serverError, "error");
return false;
}
}
function handleModalClick(event) {
if (!modalHost?.contains(event.target)) return;
const overlay = event.target?.closest?.(CREATE_MODAL_OVERLAY_SELECTOR);
if (overlay && event.target === overlay && !createModal.submitting) { event.preventDefault(); closeCreate(); return; }
const actionable = event.target?.closest?.("[data-create-action]");
const action = cleanText(actionable?.getAttribute?.("data-create-action"), "");
if (!action) return;
event.preventDefault();
event.stopPropagation();
if (action === CREATE_ACTIONS.CLOSE) { if (!createModal.submitting) closeCreate(); return; }
if (action === CREATE_ACTIONS.SUBMIT) { void submitCreate(actionable.closest("form") || modalHost.querySelector("[data-clientes-create-form='true']")); return; }
if (action === CREATE_ACTIONS.USER_SELECT) { selectUser(actionable); return; }
if (action === CREATE_ACTIONS.USER_CLEAR) { clearUser(); return; }
if (action === CREATE_ACTIONS.COPY_USER_CONTACT) copyUserContact();
}
function handleModalSubmit(event) {
const form = event.target?.closest?.("[data-clientes-create-form='true']");
if (!form || !modalHost?.contains(form)) return;
event.preventDefault();
event.stopPropagation();
void submitCreate(form);
}
function handleModalInput(event) {
if (!modalHost?.contains(event.target) || !isElement(event.target)) return;
const target = event.target;
const field = cleanText(target.getAttribute("data-field") || target.getAttribute("name"), "");
if (!field) return;
if (field === "targetUserSearch") {
window.clearTimeout?.(userSearchTimer);
const query = target.value || "";
userSearchTimer = window.setTimeout(() => { userSearchTimer = 0; void searchUsers(query); }, USER_SEARCH_DEBOUNCE_MS);
return;
}
const value = target.type === "checkbox" ? Boolean(target.checked) : target.value;
patchCreateForm({ [field]: value });
if (field === "tipo") patchCreateForm({ clienteTipo: value, segmento: value });
if (field === "contactoEmail") patchCreateForm({ email: value, emailCliente: value, emailFacturacion: createModal.form.emailFacturacion || value });
if (field === "contactoPhone") patchCreateForm({ phone: value, telefono: value });
if (createModal.errors[field]) {
const next = { ...createModal.errors }; delete next[field]; createModal.errors = next;
target.closest?.("[data-create-field]")?.classList?.remove?.("is-error");
target.removeAttribute?.("aria-invalid");
modalHost.querySelector?.(`#clientes-create-${field}-error`)?.remove?.();
}
if (createModal.serverError) {
createModal.serverError = "";
modalHost.querySelector?.(".cli-create-alert.is-error, .inc-create-alert.is-error")?.remove?.();
}
}
function handleModalKeydown(event) {
if (!modalHost?.contains(event.target)) return;
if (event.key === "Tab") {
const panel = modalHost.querySelector(CREATE_MODAL_PANEL_SELECTOR);
const nodes = panel ? Array.from(panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true") : [];
if (nodes.length) {
const firstNode = nodes[0];
const lastNode = nodes[nodes.length - 1];
const active = document.activeElement;
if (event.shiftKey && active === firstNode) { event.preventDefault(); lastNode.focus(); }
else if (!event.shiftKey && active === lastNode) { event.preventDefault(); firstNode.focus(); }
}
return;
}
if (event.key === "Escape" && !createModal.submitting) { event.preventDefault(); event.stopPropagation(); closeCreate(); }
}
function actionInfo(target) {
if (!isElement(target)) return null;
const element = target.closest("[data-clientes-action], [data-action]");
if (!element || !root?.contains(element)) return null;
return { element, action: cleanText(element.getAttribute("data-clientes-action") || element.getAttribute("data-action"), "") };
}
function handleClick(event) {
const info = actionInfo(event.target);
if (!info?.action) return;
const { element, action } = info;
if (
action === CLIENTES_ACTIONS.OPEN_DETAIL &&
event.target?.closest?.("a[href], button, input, select, textarea, [data-stop-row='true']") &&
event.target !== element
) return;
event.preventDefault();
if ([CLIENTES_ACTIONS.OPEN_DETAIL, "detail", "open-client", "open-cliente"].includes(action)) {
const row = element.closest("[data-client-id], [data-cliente-id]");
void openCliente(element.getAttribute("data-client-id") || element.getAttribute("data-cliente-id") || row?.getAttribute("data-client-id") || row?.getAttribute("data-cliente-id") || "");
return;
}
if ([CLIENTES_ACTIONS.CREATE_OPEN, "create", "create-client", "create-cliente"].includes(action)) { openCreate(element); return; }
if ([CLIENTES_ACTIONS.EXPORT, "export-csv"].includes(action)) { exportCsv(); return; }
if (action === CLIENTES_ACTIONS.FILTER) { setFilter(element.getAttribute("data-filter") || "all"); return; }
if (action === CLIENTES_ACTIONS.SORT_TOGGLE) { setSortOrder(element.getAttribute("data-next-sort-order") || (sortOrder === "asc" ? "desc" : "asc")); return; }
if (action === CLIENTES_ACTIONS.CLEAR_SEARCH) { setSearch(""); return; }
if (action === CLIENTES_ACTIONS.CLEAR_FILTERS) { clearFilters(); return; }
if (action === CLIENTES_ACTIONS.LOAD_MORE) { loadMore(element.getAttribute("data-visible-limit")); return; }
/* Compatibilidad: refresh puede invocarse desde integraciones, pero no existe en UI. */
if (action === CLIENTES_ACTIONS.REFRESH || action === "retry") void refresh();
}
function handleInput(event) {
const target = event.target;
if (!isElement(target) || !target.matches("[data-clientes-search-input], [data-search-input='clientes']")) return;
window.clearTimeout?.(searchTimer);
const value = target.value;
searchTimer = window.setTimeout(() => { searchTimer = 0; setSearch(value); }, SEARCH_DEBOUNCE_MS);
}
function handleKeydown(event) {
if (!isElement(event.target) || !["Enter", " "].includes(event.key)) return;
const row = event.target.closest("[data-client-row='true'], [data-cliente-row='true']");
if (!row || !root?.contains(row)) return;
if (event.target !== row && event.target.closest("a, button, input, select, textarea")) return;
event.preventDefault();
void openCliente(row.getAttribute("data-client-id") || row.getAttribute("data-cliente-id") || "");
}
function attach() {
if (!root || mounted) return;
root.addEventListener("click", handleClick);
root.addEventListener("input", handleInput);
root.addEventListener("keydown", handleKeydown);
mounted = true;
}
function detach() {
try {
root?.removeEventListener("click", handleClick);
root?.removeEventListener("input", handleInput);
root?.removeEventListener("keydown", handleKeydown);
} catch { /* noop */ }
if (isBrowser()) {
window.clearTimeout?.(searchTimer);
window.clearTimeout?.(userSearchTimer);
}
searchTimer = 0;
userSearchTimer = 0;
mounted = false;
}
async function mount(nextHost = null, nextContext = {}) {
if (destroyed) return snapshot();
context = { ...context, ...safeObject(nextContext) };
root = resolveHost(nextHost, context) || root;
if (!root) throw new Error("CLIENTES_HOST_NOT_FOUND");
if (!isClientesRoute(context)) return snapshot();
attach();
/*
Stale-while-revalidate: use even expired safe cache for instant paint.
It is always reconciled in background; no visible refresh state.
*/
const cached = hydrateClientesFromCache({ freshOnly: false, stale: true });
const cachedItems = normalizeClientesCollection(safeArray(cached?.items));
if (cachedItems.length || cached?.ok === true) {
setItems(cachedItems, first(cached?.lastSyncAt, 0));
loading = false;
refreshing = false;
renderNow();
const age = lastSyncAt ? Math.max(0, Date.now() - lastSyncAt) : Number.POSITIVE_INFINITY;
if (age >= REVALIDATE_MIN_AGE_MS) void load({ force: false, silent: true });
} else {
loading = true;
renderNow();
await load({ force: false, silent: false });
}
return snapshot();
}
async function destroy({ clear = true } = {}) {
if (destroyed) return true;
destroyed = true;
loadSeq += 1;
detailSeq += 1;
createSeq += 1;
userSearchSeq += 1;
cancelFrame(renderFrame);
cancelFrame(modalFrame);
detach();
try { closeClientesDetailModal(); } catch { /* noop */ }
closeCreate({ reset: true });
if (clear && root) root.replaceChildren();
if (root && INSTANCES.get(root) === controller) INSTANCES.delete(root);
if (lastInstance === controller) lastInstance = null;
return true;
}
const controller = {
id,
version: CLIENTES_INDEX_VERSION,
get state() { return { ...snapshot(), host: root, context }; },
getSnapshot: snapshot,
getState: snapshot,
mount,
render: mount,
init: mount,
bootstrap: mount,
load,
reload: refresh,
refresh,
setSearch,
setFilter,
setSortOrder,
toggleSortOrder: () => setSortOrder(sortOrder === "asc" ? "desc" : "asc"),
clearSearch: () => setSearch(""),
clearFilters,
loadMore,
openCliente,
openClient: openCliente,
openCreate,
createCliente: openCreate,
createClient: openCreate,
exportCsv,
destroy,
unmount: destroy,
dispose: destroy,
};
return controller;
}
function ensureController(host = null, context = {}) {
const resolved = resolveHost(host, context);
if (resolved) {
const existing = INSTANCES.get(resolved);
if (existing && !existing.state.destroyed) { lastInstance = existing; return existing; }
}
if (!resolved && lastInstance && !lastInstance.state.destroyed) return lastInstance;
const controller = createClientesController(resolved, context);
if (resolved) INSTANCES.set(resolved, controller);
lastInstance = controller;
return controller;
}
function parseInitArgs(hostOrContext = null, maybeContext = {}) {
return isDomNode(hostOrContext)
? { host: hostOrContext, context: safeObject(maybeContext) }
: { host: null, context: safeObject(hostOrContext) };
}
export async function init(hostOrContext = null, maybeContext = {}) {
const { host, context } = parseInitArgs(hostOrContext, maybeContext);
return ensureController(host, context).mount(host, context);
}
export const mount = init;
export const bootstrap = init;
export const render = init;
export async function reload() { return ensureController().refresh(); }
export async function refresh() { return ensureController().refresh(); }
export async function destroy(options = {}) { return lastInstance ? lastInstance.destroy(options) : true; }
export const unmount = destroy;
export const dispose = destroy;
export function getClientes() { return cloneItems(ensureController().state.items); }
export const getItems = getClientes;
export function getClientesCount() { return ensureController().state.items.length; }
export function hasClientes() { return getClientesCount() > 0; }
export function getState() { return ensureController().getSnapshot(); }
export const getSnapshot = getState;
export function getClienteById(id = "") { return findClienteByIdApi(ensureController().state.items, id); }
export function setClientesSearch(value = "") { return ensureController().setSearch(value); }
export function setClientesFilter(value = "all") { return ensureController().setFilter(value); }
export function setClientesSortOrder(value = DEFAULT_SORT_ORDER) { return ensureController().setSortOrder(value); }
export function toggleClientesSortOrder() { return ensureController().toggleSortOrder(); }
export function loadMoreClientes(limit = null) { return ensureController().loadMore(limit); }
export async function openCliente(id = "") { return ensureController().openCliente(id); }
export async function openCreate() { return ensureController().openCreate(); }
export async function createCliente() { return openCreate(); }
export function exportCsv() { return ensureController().exportCsv(); }
export const ClientesView = {
version: CLIENTES_INDEX_VERSION,
apiVersion: CLIENTES_API_VERSION,
init, mount, bootstrap, render,
reload, refresh, destroy, unmount, dispose,
getState, getSnapshot, getClientes, getItems,
getClientesCount, hasClientes, getClienteById,
setSearch: setClientesSearch,
setFilter: setClientesFilter,
setSortOrder: setClientesSortOrder,
toggleSortOrder: toggleClientesSortOrder,
loadMore: loadMoreClientes,
openCliente, openClient: openCliente,
openCreate, createCliente,
exportCsv,
};
try {
const global = getGlobalObject();
global.ClientesView = ClientesView;
global.OnionClientesView = ClientesView;
global.OnionClientes = ClientesView;
if (AppCore?.modules && typeof AppCore.modules === "object") {
AppCore.modules.Clientes = ClientesView;
AppCore.modules.clientes = ClientesView;
}
} catch { /* noop */ }
export default ClientesView;
