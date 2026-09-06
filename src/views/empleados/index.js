/* =========================================================
   Onion Support - Empleados
   Archivo: /src/views/empleados/index.js

   USUARIOS VISUAL PARITY · CURRENT EMPLOYEE · V5
   - Reutiliza template, modelo y Detail Modal canónicos de Usuarios.
   - El equipo interno actual es el usuario admin autenticado.
========================================================= */

"use strict";

import { AppCore } from "../../core/index.js";
import { renderUsuariosTableTemplate, USUARIOS_ACTIONS } from "../usuarios/usuarios.template.js";
import UsuariosDetailModal from "../usuarios/usuarios.template.modal.js";
import { loadUsuarioDetail, normalizeUsuarioModel } from "../usuarios/usuarios.api.js";

export const EMPLEADOS_VIEW_VERSION = "empleados.view.v5.usuarios-parity-current-employee";
export const EMPLEADOS_VIEW_NAME = "EmpleadosView";
export const EMPLEADOS_CANONICAL_PATH = "/empleados";

const ACTIONS = USUARIOS_ACTIONS;
const SEARCH_DEBOUNCE_MS = 160;

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const safeObject = (value, fallback = {}) => (isObject(value) ? value : fallback);
const cleanText = (value = "", fallback = "") => {
  const output = String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return output || fallback;
};
const first = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
};
const normalizeKey = (value = "") => cleanText(value, "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\s-]+/g, "_")
  .replace(/[^\w:.]/g, "")
  .replace(/^_+|_+$/g, "");

function getAppState() {
  try {
    return typeof AppCore?.runtimeState?.read === "function"
      ? safeObject(AppCore.runtimeState.read(), {})
      : {};
  } catch {
    return {};
  }
}

function currentUser(context = {}) {
  const state = getAppState();
  return safeObject(first(
    context.user,
    context.currentUser,
    state.user,
    state.currentUser,
    state.auth?.user,
    state.session?.user,
    {}
  ), {});
}

function currentRole(context = {}, user = currentUser(context)) {
  const state = getAppState();
  const raw = first(context.role, context.rol, user.role, user.rol, state.role, state.rol, state.roles, "user");
  try {
    if (typeof AppCore?.normalizeRole === "function") return cleanText(AppCore.normalizeRole(raw), "user");
  } catch {
    // fallback below
  }
  return normalizeKey(Array.isArray(raw) ? raw[0] : raw) === "admin" ? "admin" : "user";
}

const employeeId = (item = {}) => cleanText(first(item.userId, item.usuarioId, item.id, item.uid, item.email, ""), "");
const isAdmin = (context = {}, user = currentUser(context)) => context.admin === true || currentRole(context, user) === "admin";

function statusOf(item = {}) {
  const status = normalizeKey(first(item.status, item.estado, item.state, ""));
  if (["pending", "pendiente", "invited", "invitado", "new", "unverified", "awaiting_activation"].includes(status)) return "pending";
  if (["blocked", "bloqueado", "inactive", "inactivo", "disabled", "archived", "deleted", "suspended", "banned", "revoked"].includes(status)) return "blocked";
  if (item.blocked === true || item.disabled === true || item.active === false || item.enabled === false || item.isActive === false) return "blocked";
  return "active";
}

function searchBlob(item = {}) {
  return [
    item.userId, item.usuarioId, item.id, item.uid,
    item.fullName, item.displayName, item.name, item.nombre, item.username,
    item.email, item.emailLower, item.phone, item.telefono,
    item.city, item.ciudad, item.direccion?.ciudad, item.address?.city,
  ].map(normalizeKey).filter(Boolean).join(" ");
}

function replaceCopy(value = "") {
  return String(value ?? "")
    .replace(/\bUsuarios\b/g, "Empleados")
    .replace(/\busuarios\b/g, "empleados")
    .replace(/\bUsuario\b/g, "Empleado")
    .replace(/\busuario\b/g, "empleado")
    .replace(/\b1 empleados\b/g, "1 empleado");
}

function applyEmployeeCopy(root) {
  if (!root?.querySelectorAll) return;
  const walker = document.createTreeWalker(root, window.NodeFilter?.SHOW_TEXT || 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const next = replaceCopy(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  for (const element of root.querySelectorAll("[aria-label], [title], [placeholder]")) {
    for (const attr of ["aria-label", "title", "placeholder"]) {
      if (!element.hasAttribute(attr)) continue;
      element.setAttribute(attr, replaceCopy(element.getAttribute(attr)));
    }
  }
  const title = root.querySelector(".usuarios-page-title");
  const subtitle = root.querySelector(".usuarios-page-subtitle");
  const history = root.querySelector(".usuarios-history-title");
  const search = root.querySelector(".usuarios-search-input");
  if (title) title.textContent = "Empleados";
  if (subtitle) subtitle.textContent = "Gestiona el equipo interno con la misma vista operativa de Usuarios.";
  if (history) history.textContent = "Historial de empleados";
  if (search) search.placeholder = "Buscar empleado, email, ciudad...";
  root.querySelector(`[data-usuarios-action="${ACTIONS.CREATE}"]`)?.remove();
  root.dataset.empleadosScope = "true";
  root.dataset.view = "empleados";
}

function errorText(error) {
  return cleanText(first(
    error?.message,
    error?.data?.message,
    error?.payload?.message,
    error?.response?.message,
    error?.code,
    "No se pudo actualizar el empleado."
  ), "No se pudo actualizar el empleado.");
}

function showToast(message, type = "info") {
  const text = cleanText(message, "");
  if (!text) return false;
  for (const toast of [AppCore?.toast, AppCore?.ui?.toast, AppCore?.Toast]) {
    try {
      if (typeof toast?.[type] === "function") return Boolean(toast[type](text) ?? true);
      if (typeof toast?.show === "function") return Boolean(toast.show(text, type) ?? true);
    } catch {
      // noop
    }
  }
  return false;
}

function csvCell(value = "") {
  let text = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportEmployee(item = {}) {
  if (!isBrowser() || !employeeId(item)) return false;
  const row = [
    employeeId(item),
    first(item.fullName, item.displayName, item.name, item.nombre, item.username, ""),
    first(item.email, item.emailLower, item.mail, ""),
    first(item.phone, item.telefono, item.mobile, ""),
    first(item.city, item.ciudad, item.direccion?.ciudad, item.address?.city, ""),
    first(item.role, item.rol, "admin"),
    first(item.status, item.estado, item.state, item.active === false ? "inactive" : "active"),
  ];
  const csv = [
    ["ID", "Nombre", "Email", "Teléfono", "Ciudad", "Rol", "Estado"],
    row,
  ].map((cells) => cells.map(csvCell).join(",")).join("\r\n");

  try {
    const href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `empleados-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    queueMicrotask(() => URL.revokeObjectURL(href));
    return true;
  } catch {
    return false;
  }
}

export function EmpleadosView(host = null, context = {}) {
  if (!isBrowser() || !host || host.nodeType !== 1 || typeof host.replaceChildren !== "function") return null;

  const authUser = currentUser(context);
  const admin = isAdmin(context, authUser);
  let employee = Object.keys(authUser).length ? normalizeUsuarioModel({ ...authUser }) : null;
  let loading = Boolean(admin && employeeId(employee || authUser));
  let error = "";
  let search = "";
  let filter = "all";
  let lastSyncAt = 0;
  let openingUserId = "";
  let exporting = false;
  let destroyed = false;
  let loadEpoch = 0;
  let detailEpoch = 0;
  let searchTimer = null;

  const visibleItems = () => {
    if (!employee) return [];
    const query = normalizeKey(search);
    const filterOk = filter === "all" || statusOf(employee) === filter;
    return filterOk && (!query || searchBlob(employee).includes(query)) ? [employee] : [];
  };

  function render({ focusSearch = false, caret = null, focusFilter = "" } = {}) {
    if (destroyed) return false;
    const count = employee ? 1 : 0;
    const state = {
      loading, error, search, searchQuery: search, filter, activeFilter: filter,
      hasMore: false, loadingMore: false, totalKnown: true,
      totalCount: count, remoteCount: count, lastSyncAt,
      openingUserId, exporting, creating: false,
    };
    const template = document.createElement("template");
    template.innerHTML = renderUsuariosTableTemplate({
      items: visibleItems(), state, ...state, admin,
      role: admin ? "admin" : currentRole(context, authUser),
      forbidden: !admin, restricted: !admin, accessDenied: !admin,
      route: EMPLEADOS_CANONICAL_PATH,
      source: "views.empleados.index",
      version: EMPLEADOS_VIEW_VERSION,
    }).trim();
    applyEmployeeCopy(template.content.firstElementChild);
    host.replaceChildren(template.content);

    if (focusSearch) {
      const input = host.querySelector("[data-usuarios-search-input='true']");
      if (input) {
        input.focus({ preventScroll: true });
        const end = String(input.value || "").length;
        const position = Math.min(Number.isFinite(caret) ? caret : end, end);
        try { input.setSelectionRange(position, position); } catch { /* noop */ }
      }
    }
    if (focusFilter) {
      host.querySelector(`[data-usuarios-action="${ACTIONS.FILTER}"][data-filter="${focusFilter}"]`)?.focus?.({ preventScroll: true });
    }
    return true;
  }

  async function refresh({ force = false } = {}) {
    if (destroyed || !admin) return employee;
    const source = employee || currentUser(context);
    const id = employeeId(source);
    if (!id) {
      loading = false;
      error = employee ? "" : "No se pudo resolver el empleado autenticado.";
      render();
      return employee;
    }

    const epoch = ++loadEpoch;
    loading = true;
    if (force) error = "";
    render();
    try {
      const detail = await loadUsuarioDetail(id, { force: true, dedupe: true, allowCacheFallback: true });
      if (destroyed || epoch !== loadEpoch) return employee;
      if (detail) employee = normalizeUsuarioModel({ ...safeObject(source), ...safeObject(detail) });
      error = "";
      lastSyncAt = Date.now();
      return employee;
    } catch (requestError) {
      if (!destroyed && epoch === loadEpoch) error = errorText(requestError);
      return employee;
    } finally {
      if (!destroyed && epoch === loadEpoch) {
        loading = false;
        render();
      }
    }
  }

  async function openDetail(id = "") {
    const resolvedId = cleanText(id, "");
    if (!resolvedId || !employee || destroyed) return null;
    const epoch = ++detailEpoch;
    openingUserId = resolvedId;
    render();
    try { UsuariosDetailModal?.open?.(normalizeUsuarioModel(employee)); } catch { /* refresh can recover */ }
    try {
      const detail = await loadUsuarioDetail(resolvedId, { force: true, dedupe: true, allowCacheFallback: true });
      if (destroyed || epoch !== detailEpoch) return null;
      if (detail) {
        employee = normalizeUsuarioModel({ ...safeObject(employee), ...safeObject(detail) });
        error = "";
        lastSyncAt = Date.now();
        UsuariosDetailModal?.open?.(employee);
      }
      return employee;
    } catch (requestError) {
      if (!destroyed && epoch === detailEpoch) {
        error = errorText(requestError);
        showToast(error, "error");
      }
      return null;
    } finally {
      if (!destroyed && epoch === detailEpoch) {
        openingUserId = "";
        render();
      }
    }
  }

  const onClick = (event) => {
    const trigger = event?.target?.closest?.("[data-usuarios-action], [data-action]");
    if (!trigger || !host.contains(trigger) || destroyed) return;
    const action = cleanText(trigger.dataset.usuariosAction || trigger.dataset.action, "");
    if (action === ACTIONS.DETAIL || action === "open-user") {
      void openDetail(trigger.closest?.("[data-user-id]")?.dataset?.userId || "");
    } else if (action === ACTIONS.REFRESH || action === ACTIONS.RETRY) {
      void refresh({ force: true });
    } else if (action === ACTIONS.EXPORT && employee && !exporting) {
      exporting = true;
      render();
      const ok = exportEmployee(employee);
      exporting = false;
      render();
      if (!ok) showToast("No se pudo exportar el empleado.", "error");
    } else if (action === ACTIONS.FILTER) {
      filter = normalizeKey(trigger.dataset.filter) || "all";
      render({ focusFilter: filter });
    } else if (action === ACTIONS.CLEAR_SEARCH) {
      search = "";
      render({ focusSearch: true });
    }
  };

  const onInput = (event) => {
    const input = event?.target?.closest?.("[data-usuarios-search-input='true']");
    if (!input || !host.contains(input) || destroyed) return;
    search = String(input.value ?? "");
    if (searchTimer) clearTimeout(searchTimer);
    const caret = Number.isFinite(input.selectionStart) ? input.selectionStart : search.length;
    searchTimer = setTimeout(() => {
      searchTimer = null;
      render({ focusSearch: true, caret });
    }, SEARCH_DEBOUNCE_MS);
  };

  const onKeyDown = (event) => {
    const row = event?.target?.closest?.("[data-user-row='true'][data-user-id]");
    if (!row || !host.contains(row) || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    void openDetail(row.dataset.userId || "");
  };

  host.addEventListener("click", onClick);
  host.addEventListener("input", onInput);
  host.addEventListener("keydown", onKeyDown);
  render();
  if (admin) void refresh();

  return Object.freeze({
    get root() { return host.querySelector("[data-empleados-scope='true']"); },
    refresh,
    openDetail,
    getEmployee: () => (employee ? { ...employee } : null),
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      loadEpoch += 1;
      detailEpoch += 1;
      if (searchTimer) clearTimeout(searchTimer);
      host.removeEventListener("click", onClick);
      host.removeEventListener("input", onInput);
      host.removeEventListener("keydown", onKeyDown);
      try { UsuariosDetailModal?.close?.(); } catch { /* noop */ }
      host.replaceChildren();
      return true;
    },
  });
}

export const page = EmpleadosView;
export default EmpleadosView;
