/* =========================================================
   Onion SPA - Clientes View (LEAN PRO SAAS PANEL)
   Archivo: src/views/clientesView.js

   Objetivo actual:
   - pintar SOLO cards de clientes existentes
   - respetar el layout real del shell
   - usar content-wrapper / panel-content / grid del sistema
   - cargar clientes desde backend
   - guardar clientes en Store
   - normalizar clientes del backend
   - estados mínimos: loading / error / vacío
   - cero filtros
   - cero tabla
   - cero drawer
   - simplicidad máxima
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";

export const ClientesView = (() => {
  "use strict";

  const SCOPE = "view:clientes";
  const ENDPOINT = "/api/clientes";

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

  function truncate(value = "", max = 160) {
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
        .slice(0, 2) || "CL"
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
  function normalizeClienteStatus(value) {
    const v = normalizeText(value);

    if (
      v === "activo" ||
      v === "active" ||
      v === "enabled" ||
      v === "habilitado" ||
      v === "ok"
    ) {
      return true;
    }

    if (
      v === "inactivo" ||
      v === "inactive" ||
      v === "disabled" ||
      v === "deshabilitado" ||
      v === "blocked" ||
      v === "bloqueado"
    ) {
      return false;
    }

    return null;
  }

  function getStatusLabel(active = true) {
    return active ? "Activo" : "Inactivo";
  }

  function getStatusChipStyle(active = true) {
    return active
      ? "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);"
      : "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);";
  }

  function normalizeCliente(item = {}) {
    const nombre =
      item.nombre ||
      item.name ||
      item.razonSocial ||
      item.razon_social ||
      item.empresa ||
      item.company ||
      item.comercial ||
      item.alias ||
      item.email ||
      "Cliente";

    const email = safeString(
      item.email ||
        item.mail ||
        item.contactEmail ||
        item.contact_email ||
        item.ownerEmail ||
        "",
      ""
    );

    const telefono = safeString(
      item.telefono ||
        item.phone ||
        item.mobile ||
        item.contactPhone ||
        item.contact_phone ||
        "",
      ""
    );

    const cif = safeString(
      item.cif ||
        item.nif ||
        item.taxId ||
        item.tax_id ||
        "",
      ""
    );

    const ciudad = safeString(
      item.ciudad ||
        item.city ||
        item.municipio ||
        item.localidad ||
        "",
      ""
    );

    const provincia = safeString(
      item.provincia ||
        item.state ||
        item.region ||
        "",
      ""
    );

    const pais = safeString(
      item.pais ||
        item.country ||
        "",
      ""
    );

    const comercial = safeString(
      item.comercial ||
        item.ownerName ||
        item.owner_name ||
        item.contactName ||
        item.contact_name ||
        "",
      ""
    );

    const activeRaw =
      item.active ??
      item.isActive ??
      item.is_active ??
      normalizeClienteStatus(item.status ?? item.estado);

    const active = activeRaw === null ? true : Boolean(activeRaw);

    const createdAt =
      item.createdAt ||
      item.fechaCreacion ||
      item.fecha_alta ||
      item.alta ||
      null;

    const updatedAt =
      item.updatedAt ||
      item.fechaActualizacion ||
      item.fecha_actualizacion ||
      item.modifiedAt ||
      item.lastUpdate ||
      createdAt ||
      null;

    const id =
      item.id ??
      item.clienteId ??
      item.clientId ??
      item.uuid ??
      item._id ??
      null;

    const displayLocation = [ciudad, provincia, pais].filter(Boolean).join(", ");

    return {
      id,
      clienteId: item.clienteId ?? item.clientId ?? id,
      nombre,
      email,
      telefono,
      cif,
      ciudad,
      provincia,
      pais,
      location: displayLocation || "-",
      comercial: comercial || "-",
      active,
      createdAt,
      updatedAt,
      avatar: item.avatar || item.logo || null,
      meta: {
        timestampMs: toMs(updatedAt) || toMs(createdAt) || 0,
        initials: getInitials(nombre),
      },
      raw: item,
    };
  }

  function extractClientes(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.clientes)) return response.clientes;
    if (Array.isArray(response?.clients)) return response.clients;
    if (Array.isArray(response?.items)) return response.items;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.data?.clientes)) return response.data.clientes;
    if (Array.isArray(response?.data?.clients)) return response.data.clients;
    if (Array.isArray(response?.results)) return response.results;
    if (Array.isArray(response?.rows)) return response.rows;
    return [];
  }

  /* =========================================================
     STORE
  ========================================================= */
  function getClientes() {
    return safeGet("entities.clientes", []);
  }

  function setClientes(items = []) {
    if (safeSetCollection("clientes", items)) return;
    safeSet("entities.clientes", items);
  }

  /* =========================================================
     REQUESTS
  ========================================================= */
  async function fetchClientes() {
    return AppCore.apiClient.get(ENDPOINT, {
      timeout: 15000,
      auth: true,
    });
  }

  async function loadClientes({ silent = false } = {}) {
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
        const response = await fetchClientes();
        const items = extractClientes(response).map(normalizeCliente);

        setClientes(items);

        localState.remoteCount =
          safeNumber(
            response?.count ??
              response?.total ??
              response?.totalItems ??
              response?.pagination?.total,
            items.length
          ) || items.length;

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
          "No se pudieron cargar los clientes.";

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
  function openCliente(id) {
    if (!id) return;

    if (typeof AppCore.events?.emit === "function") {
      AppCore.events.emit("clientes:open", { clienteId: id });
    }

    // Base lista para detalle real si lo conectas luego:
    // Router.navigate(`/clientes/${id}`);
  }

  /* =========================================================
     UI
  ========================================================= */
  function renderHeader() {
    const items = getClientes();

    return `
      <header class="page-header">
        <div class="page-header-main">
          <h1 class="page-title">Clientes</h1>
          <p class="page-subtitle">
            Listado simple de clientes existentes. Solo cards, limpio y consistente con el panel.
          </p>
        </div>

        <div class="page-header-actions">
          <button
            type="button"
            id="clientes-refresh-btn"
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
            <h2 class="section-title">${items.length} cliente(s)</h2>
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
            id="clientes-retry-btn"
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
          <div class="empty-state-icon">🏢</div>
          <h3 class="empty-state-title">Sin clientes</h3>
          <p class="empty-state-text">
            No hay clientes registrados en este momento.
          </p>
        </div>
      </section>
    `;
  }

  function renderCards() {
    const items = [...getClientes()].sort(
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
                class="card-surface hover-lift cliente-card"
                data-cliente-id="${escapeHtml(item.clienteId || item.id || "")}"
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
                      ${escapeHtml(item.clienteId || item.id || "—")}
                    </span>

                    <h3 style="
                      margin:0;
                      font-size:var(--font-lg);
                      line-height:var(--line-snug);
                      color:var(--text-strong);
                      font-weight:var(--weight-bold);
                    ">
                      ${escapeHtml(item.nombre || "Cliente")}
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
                    ${escapeHtml(item.meta?.initials || "CL")}
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
                      item.location && item.location !== "-"
                        ? `Ubicación: ${item.location}`
                        : "Ficha de cliente disponible en el sistema.",
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
                  <span><strong style="color:var(--text-strong);">Teléfono:</strong> ${escapeHtml(item.telefono || "-")}</span>
                  <span><strong style="color:var(--text-strong);">CIF/NIF:</strong> ${escapeHtml(item.cif || "-")}</span>
                  <span><strong style="color:var(--text-strong);">Comercial:</strong> ${escapeHtml(item.comercial || "-")}</span>
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
                      ${getStatusChipStyle(item.active)}
                    ">
                      ${escapeHtml(getStatusLabel(item.active))}
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
                      background:var(--info-bg);
                      border-color:var(--border-info);
                      color:var(--text-soft);
                    ">
                      Cliente
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
                      ${escapeHtml(item.createdAt ? `Alta: ${formatDate(item.createdAt)}` : "Sin fecha de alta")}
                    </span>
                  </div>

                  <button
                    type="button"
                    data-action="open-cliente"
                    data-cliente-id="${escapeHtml(item.clienteId || item.id || "")}"
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
                    Ver cliente
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
    AppCore.setDocumentTitle("Clientes");
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

    const refreshBtn = document.getElementById("clientes-refresh-btn");
    const retryBtn = document.getElementById("clientes-retry-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (localState.loading || localState.refreshing) return;
        await loadClientes({ silent: true });
      });
    }

    if (retryBtn) {
      AppCore.cleanup.on(scope, retryBtn, "click", async () => {
        await loadClientes();
      });
    }

    const openButtons = document.querySelectorAll('[data-action="open-cliente"]');
    openButtons.forEach((button) => {
      AppCore.cleanup.on(scope, button, "click", (event) => {
        event.stopPropagation();
        openCliente(button.getAttribute("data-cliente-id"));
      });
    });

    const cards = document.querySelectorAll(".cliente-card");
    cards.forEach((card) => {
      AppCore.cleanup.on(scope, card, "click", () => {
        openCliente(card.getAttribute("data-cliente-id"));
      });
    });

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;
      loadClientes();
    }
  }

  return {
    render,
    loadClientes,
  };
})();
