/* =========================================================
   Onion SPA - Usuarios View (LEAN PRO SAAS PANEL)
   Archivo: src/views/usuariosView.js

   Objetivo actual:
   - pintar SOLO cards de usuarios existentes
   - respetar el layout real del shell
   - usar content-wrapper / panel-content / grid del sistema
   - cargar usuarios desde backend
   - guardar usuarios en Store
   - normalizar usuarios del backend
   - estados mínimos: loading / error / vacío
   - cero filtros
   - cero tabla
   - cero drawer
   - simplicidad máxima
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";

export const UsuariosView = (() => {
  "use strict";

  const SCOPE = "view:usuarios";
  const ENDPOINT = "/api/usuarios";

  const localState = {
    hydrated: false,
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,
    bootstrapped: false,
    remoteCount: 0,
  };

  let inflightLoad = null;

  /* =========================================================
     HELPERS SAFE
  ========================================================= */
  function safeGet(path, fallback = []) {
    try {
      if (typeof Store?.get === "function") {
        return Store.get(path) ?? fallback;
      }
    } catch {
      /* noop */
    }

    return fallback;
  }

  function safeSet(path, value) {
    try {
      if (typeof Store?.set === "function") {
        Store.set(path, value);
        return true;
      }
    } catch {
      /* noop */
    }

    return false;
  }

  function safeSetCollection(name, value) {
    try {
      if (typeof Store?.actions?.setCollection === "function") {
        Store.actions.setCollection(name, value);
        return true;
      }
    } catch {
      /* noop */
    }

    return false;
  }

  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function safeString(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
  }

  function truncate(value = "", max = 140) {
    const text = safeString(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}…`;
  }

  function normalizeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function toMs(value) {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function getInitials(value = "") {
    return (
      String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("")
        .slice(0, 2) || "ON"
    );
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  function formatRelativeDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "Hace un momento";
    if (diff < hour) return `Hace ${Math.max(1, Math.floor(diff / minute))} min`;
    if (diff < day) return `Hace ${Math.max(1, Math.floor(diff / hour))} h`;
    if (diff < 7 * day) return `Hace ${Math.max(1, Math.floor(diff / day))} d`;

    return formatDate(value);
  }

  /* =========================================================
     NORMALIZACIÓN
  ========================================================= */
  function normalizeRole(value = "user") {
    const map = {
      admin: "admin",
      administrador: "admin",

      agent: "agent",
      soporte: "agent",
      operador: "agent",

      user: "user",
      usuario: "user",
      client: "user",
      cliente: "user",
    };

    return map[normalizeText(value)] || "user";
  }

  function getRoleLabel(role = "user") {
    const labels = {
      admin: "Administrador",
      agent: "Agente",
      user: "Usuario",
    };

    return labels[role] || "Usuario";
  }

  function getRoleChipStyle(role = "user") {
    const tones = {
      admin:
        "background:var(--error-bg); border-color:var(--border-error); color:var(--text-soft);",
      agent:
        "background:var(--warning-bg); border-color:var(--border-warning); color:var(--text-soft);",
      user:
        "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
    };

    return tones[role] || tones.user;
  }

  function getStatusLabel(active = true) {
    return active ? "Activo" : "Inactivo";
  }

  function getStatusChipStyle(active = true) {
    return active
      ? "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);"
      : "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);";
  }

  function normalizeUser(item = {}) {
    const username = safeString(
      item.username ||
        item.userName ||
        item.login ||
        item.alias ||
        "",
      ""
    );

    const name =
      item.name ||
      item.nombre ||
      item.fullName ||
      item.full_name ||
      item.displayName ||
      item.display_name ||
      username ||
      item.email ||
      "Usuario";

    const email = safeString(item.email || item.mail || "", "");
    const role = normalizeRole(
      item.role ||
        item.rol ||
        item.type ||
        item.userType ||
        item.user_type ||
        "user"
    );

    const active =
      item.active ??
      item.isActive ??
      item.is_active ??
      true;

    const createdAt = item.createdAt || item.fechaCreacion || null;
    const updatedAt =
      item.updatedAt ||
      item.lastLoginAt ||
      item.last_login_at ||
      createdAt ||
      null;

    return {
      id: item.id ?? item.userId ?? item.uuid ?? item._id ?? null,
      userId: item.userId ?? item.id ?? item.uuid ?? item._id ?? null,
      username,
      name,
      email,
      role,
      active: Boolean(active),
      phone: safeString(item.phone || item.telefono || item.mobile || "", ""),
      avatar:
        item.avatar ||
        item.avatarUrl ||
        item.photo ||
        item.image ||
        item.picture ||
        null,
      company:
        safeString(
          item.company ||
            item.empresa ||
            item.cliente?.empresa ||
            item.organization ||
            "",
          ""
        ) || "-",
      createdAt,
      updatedAt,
      lastLoginAt: item.lastLoginAt || item.last_login_at || null,
      meta: {
        timestampMs: toMs(updatedAt) || toMs(createdAt) || 0,
        initials: getInitials(name),
      },
      raw: item,
    };
  }

  function extractUsers(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.usuarios)) return response.usuarios;
    if (Array.isArray(response?.users)) return response.users;
    if (Array.isArray(response?.items)) return response.items;
    if (Array.isArray(response?.data?.usuarios)) return response.data.usuarios;
    if (Array.isArray(response?.data?.users)) return response.data.users;
    if (Array.isArray(response?.results)) return response.results;
    return [];
  }

  /* =========================================================
     STORE
  ========================================================= */
  function getUsuarios() {
    return safeGet("entities.usuarios", []);
  }

  function setUsuarios(items = []) {
    if (safeSetCollection("usuarios", items)) return;
    safeSet("entities.usuarios", items);
  }

  /* =========================================================
     REQUESTS
  ========================================================= */
  async function fetchUsuarios() {
    return AppCore.apiClient.get(ENDPOINT, {
      timeout: 15000,
      auth: true,
    });
  }

  async function loadUsuarios({ silent = false } = {}) {
    if (inflightLoad) return inflightLoad;

    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    } else {
      localState.refreshing = true;
      render();
    }

    inflightLoad = (async () => {
      try {
        const response = await fetchUsuarios();
        const items = extractUsers(response).map(normalizeUser);

        setUsuarios(items);

        localState.remoteCount =
          safeNumber(response?.count, items.length) || items.length;

        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;
        localState.error = null;

        render();
        return items;
      } catch (error) {
        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;
        localState.error =
          error?.data?.message ||
          error?.message ||
          "No se pudieron cargar los usuarios.";

        render();
        throw error;
      } finally {
        inflightLoad = null;
      }
    })();

    return inflightLoad;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  function openUsuario(id) {
    if (!id) return;

    if (typeof AppCore.events?.emit === "function") {
      AppCore.events.emit("usuarios:open", { userId: id });
    }

    // Base lista para detalle real si lo conectas luego:
    // Router.navigate(`/usuarios/${id}`);
  }

  /* =========================================================
     UI
  ========================================================= */
  function renderHeader() {
    const items = getUsuarios();

    return `
      <header class="page-header">
        <div class="page-header-main">
          <h1 class="page-title">Usuarios</h1>
          <p class="page-subtitle">
            Listado simple de usuarios existentes. Solo cards, limpio y sin ruido.
          </p>
        </div>

        <div class="page-header-actions">
          <button
            type="button"
            id="usuarios-refresh-btn"
            style="
              min-height:var(--btn-height-sm);
              padding:10px 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-secondary-border);
              background:var(--btn-secondary-bg);
              color:var(--btn-secondary-text);
              box-shadow:var(--btn-secondary-shadow);
              font-weight:var(--weight-bold);
              cursor:pointer;
            "
          >
            ${localState.loading || localState.refreshing ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </header>

      <section class="section">
        <div class="section-header">
          <div class="section-header-main">
            <h2 class="section-title">${items.length} usuario(s)</h2>
            <p class="section-subtitle">
              ${escapeHtml(String(localState.remoteCount || items.length))} visibles en la colección actual
            </p>
          </div>
        </div>
      </section>
    `;
  }

  function renderLoadingState() {
    return `
      <section class="grid cols-auto dense">
        ${Array.from({ length: 6 })
          .map(
            () => `
              <article class="card-surface" style="padding:var(--space-lg); display:grid; gap:var(--space-md); min-height:230px;">
                <div style="display:flex; justify-content:space-between; gap:var(--space-sm);">
                  <div style="display:grid; gap:var(--space-xs); flex:1;">
                    <div style="width:110px; height:14px; border-radius:var(--radius-pill); background:var(--surface-glass-strong);"></div>
                    <div style="width:72%; height:16px; border-radius:var(--radius-pill); background:var(--surface-hover-strong);"></div>
                  </div>
                  <div style="width:44px; height:44px; border-radius:var(--radius-lg); background:var(--surface-glass);"></div>
                </div>

                <div style="display:grid; gap:var(--space-xs);">
                  <div style="width:100%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:84%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:62%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                </div>

                <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                  <div style="width:96px; height:30px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:96px; height:30px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderErrorState() {
    return `
      <section class="panel-surface">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3 class="empty-state-title">No se pudo cargar el listado</h3>
          <p class="empty-state-text">${escapeHtml(localState.error || "Error desconocido")}</p>
          <button
            type="button"
            id="usuarios-retry-btn"
            style="
              min-height:var(--btn-height-sm);
              padding:10px 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-primary-border);
              background:var(--btn-primary-bg);
              color:var(--btn-primary-text);
              box-shadow:var(--btn-primary-shadow);
              font-weight:var(--weight-bold);
              cursor:pointer;
            "
          >
            Reintentar
          </button>
        </div>
      </section>
    `;
  }

  function renderEmptyState() {
    return `
      <section class="panel-surface">
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <h3 class="empty-state-title">Sin usuarios</h3>
          <p class="empty-state-text">
            No hay usuarios registrados en este momento.
          </p>
        </div>
      </section>
    `;
  }

  function renderCards() {
    const items = [...getUsuarios()].sort(
      (a, b) => (b.meta?.timestampMs || 0) - (a.meta?.timestampMs || 0)
    );

    if (localState.loading && !items.length) {
      return renderLoadingState();
    }

    if (localState.error && !items.length) {
      return renderErrorState();
    }

    if (!items.length) {
      return renderEmptyState();
    }

    return `
      <section class="grid cols-auto">
        ${items
          .map(
            (item) => `
              <article
                class="card-surface hover-lift usuario-card"
                data-user-id="${escapeHtml(item.userId || item.id || "")}"
                style="
                  display:grid;
                  gap:var(--space-md);
                  padding:var(--space-lg);
                  cursor:pointer;
                "
              >
                <div style="
                  display:flex;
                  align-items:flex-start;
                  justify-content:space-between;
                  gap:var(--space-sm);
                ">
                  <div style="display:grid; gap:var(--space-xs); min-width:0;">
                    <span style="
                      font-size:var(--font-sm);
                      color:var(--text-dim);
                      font-weight:var(--weight-semibold);
                      letter-spacing:var(--letter-wide);
                    ">
                      ${escapeHtml(item.username || item.userId || item.id || "—")}
                    </span>

                    <h3 style="
                      margin:0;
                      font-size:var(--font-lg);
                      line-height:var(--line-snug);
                      color:var(--text-strong);
                      font-weight:var(--weight-bold);
                    ">
                      ${escapeHtml(item.name || "Usuario")}
                    </h3>
                  </div>

                  <div style="
                    inline-size:44px;
                    block-size:44px;
                    flex:0 0 auto;
                    display:grid;
                    place-items:center;
                    border-radius:var(--radius-lg);
                    border:1px solid var(--border-soft);
                    background:var(--avatar-bg);
                    color:var(--avatar-text);
                    font-size:var(--font-sm);
                    font-weight:var(--weight-black);
                    box-shadow:var(--shadow-xs);
                  ">
                    ${escapeHtml(item.meta?.initials || "ON")}
                  </div>
                </div>

                <p style="
                  margin:0;
                  font-size:var(--font-md);
                  line-height:var(--line-relaxed);
                  color:var(--text-muted);
                ">
                  ${escapeHtml(
                    truncate(
                      item.company && item.company !== "-"
                        ? `Empresa: ${item.company}`
                        : "Perfil de usuario disponible en el sistema.",
                      160
                    )
                  )}
                </p>

                <div style="
                  display:grid;
                  gap:var(--space-xs);
                  font-size:var(--font-md);
                  color:var(--text-soft);
                ">
                  <span><strong style="color:var(--text-strong);">Email:</strong> ${escapeHtml(item.email || "-")}</span>
                  <span><strong style="color:var(--text-strong);">Empresa:</strong> ${escapeHtml(item.company || "-")}</span>
                  <span><strong style="color:var(--text-strong);">Teléfono:</strong> ${escapeHtml(item.phone || "-")}</span>
                  <span><strong style="color:var(--text-strong);">Alta:</strong> ${escapeHtml(formatDate(item.createdAt))}</span>
                </div>

                <div style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:var(--space-sm);
                  flex-wrap:wrap;
                ">
                  <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                    <span style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      min-height:30px;
                      padding:6px 10px;
                      border-radius:var(--radius-pill);
                      border:1px solid var(--border-soft);
                      font-size:var(--font-sm);
                      font-weight:var(--weight-semibold);
                      ${getRoleChipStyle(item.role)}
                    ">
                      ${escapeHtml(getRoleLabel(item.role))}
                    </span>

                    <span style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      min-height:30px;
                      padding:6px 10px;
                      border-radius:var(--radius-pill);
                      border:1px solid var(--border-soft);
                      font-size:var(--font-sm);
                      font-weight:var(--weight-semibold);
                      ${getStatusChipStyle(item.active)}
                    ">
                      ${escapeHtml(getStatusLabel(item.active))}
                    </span>
                  </div>
                </div>

                <div class="divider"></div>

                <div style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:var(--space-sm);
                  flex-wrap:wrap;
                ">
                  <div style="display:grid; gap:2px;">
                    <span style="
                      font-size:var(--font-sm);
                      color:var(--text-dim);
                    ">
                      ${escapeHtml(formatRelativeDate(item.updatedAt))}
                    </span>

                    <span style="
                      font-size:var(--font-xs);
                      color:var(--text-faint);
                    ">
                      ${escapeHtml(item.lastLoginAt ? `Último acceso: ${formatDate(item.lastLoginAt)}` : "Sin último acceso")}
                    </span>
                  </div>

                  <button
                    type="button"
                    data-action="open-usuario"
                    data-user-id="${escapeHtml(item.userId || item.id || "")}"
                    style="
                      min-height:36px;
                      padding:8px 12px;
                      border-radius:var(--radius-sm);
                      border:1px solid var(--btn-secondary-border);
                      background:var(--btn-secondary-bg);
                      color:var(--btn-secondary-text);
                      font-size:var(--font-sm);
                      font-weight:var(--weight-bold);
                      cursor:pointer;
                    "
                  >
                    Ver usuario
                  </button>
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  /* =========================================================
     RENDER
  ========================================================= */
  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Usuarios");
    AppCore.clearDynamicContainers?.();

    container.innerHTML = `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader()}
          ${renderCards()}
        </div>
      </section>
    `;

    localState.hydrated = true;
    bind();
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const refreshBtn = document.getElementById("usuarios-refresh-btn");
    const retryBtn = document.getElementById("usuarios-retry-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (localState.loading || localState.refreshing) return;
        await loadUsuarios({ silent: true });
      });
    }

    if (retryBtn) {
      AppCore.cleanup.on(scope, retryBtn, "click", async () => {
        await loadUsuarios();
      });
    }

    const openButtons = document.querySelectorAll('[data-action="open-usuario"]');
    openButtons.forEach((button) => {
      AppCore.cleanup.on(scope, button, "click", (event) => {
        event.stopPropagation();
        openUsuario(button.getAttribute("data-user-id"));
      });
    });

    const cards = document.querySelectorAll(".usuario-card");
    cards.forEach((card) => {
      AppCore.cleanup.on(scope, card, "click", () => {
        openUsuario(card.getAttribute("data-user-id"));
      });
    });

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;
      loadUsuarios();
    }
  }

  return {
    render,
    loadUsuarios,
  };
})();
