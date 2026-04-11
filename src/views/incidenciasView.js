/* =========================================================
   Onion SPA - Incidencias View (LEAN PRO SAAS PANEL)
   Archivo: src/views/incidenciasView.js

   Responsabilidades:
   - pintar SOLO cards de incidencias existentes
   - respetar el layout real del shell
   - usar content-wrapper / panel-content / grid del sistema
   - cargar incidencias con estrategia cache-first simple
   - guardar incidencias en Store
   - normalizar tickets del backend nuevo
   - estados mínimos: loading / error / vacío
   - reducir ruido al máximo
========================================================= */

import { AppCore } from "../core/index.js";
import { Store } from "../store/index.js";
import { Http } from "../services/index.js";

export const IncidenciasView = (() => {
  "use strict";

  const SCOPE = "view:incidencias";
  const ENDPOINT = "/api/tickets";

  const CACHE_KEY = "incidencias.cache";
  const CACHE_TTL = 1000 * 60 * 3; // 3 min

  const localState = {
    hydrated: false,
    loading: false,
    loaded: false,
    error: null,
    lastSyncAt: 0,
  };

  let inflightLoad = null;

  /* =========================================================
     HELPERS BASE
  ========================================================= */
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

  function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function truncate(value = "", max = 160) {
    const text = safeString(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}…`;
  }

  function toMs(value) {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
    if (diff < hour) return `Hace ${Math.floor(diff / minute)} min`;
    if (diff < day) return `Hace ${Math.floor(diff / hour)} h`;
    if (diff < day * 7) return `Hace ${Math.floor(diff / day)} d`;

    return formatDate(value);
  }

  function getInitials(value = "") {
    return (
      String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
        .slice(0, 2) || "ON"
    );
  }

  function getStorageApi() {
    return AppCore?.storage || null;
  }

  function saveCache(payload) {
    try {
      const storage = getStorageApi();

      if (storage?.set) {
        storage.set(CACHE_KEY, payload);
        return;
      }

      localStorage.setItem(
        `${AppCore.config?.storagePrefix || "onion"}:${CACHE_KEY}`,
        JSON.stringify(payload)
      );
    } catch {
      /* noop */
    }
  }

  function readCache() {
    try {
      const storage = getStorageApi();

      if (storage?.get) {
        return storage.get(CACHE_KEY);
      }

      const raw = localStorage.getItem(
        `${AppCore.config?.storagePrefix || "onion"}:${CACHE_KEY}`
      );

      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function isFreshCache(cache) {
    if (!cache || !cache.timestamp) return false;
    return Date.now() - safeNumber(cache.timestamp, 0) < CACHE_TTL;
  }

  /* =========================================================
     STORE
  ========================================================= */
  function getIncidencias() {
    return Store.get("entities.incidencias") || [];
  }

  function setIncidencias(items = []) {
    if (Store?.actions?.setCollection) {
      Store.actions.setCollection("incidencias", items);
      return;
    }

    if (Store?.set) {
      Store.set("entities.incidencias", items);
    }
  }

  /* =========================================================
     NORMALIZACIÓN
  ========================================================= */
  function normalizeStatus(value = "open") {
    const map = {
      abierta: "open",
      abierto: "open",
      open: "open",

      pending: "pending",
      pendiente: "pending",

      "en proceso": "in_progress",
      en_proceso: "in_progress",
      in_progress: "in_progress",

      resuelta: "resolved",
      resuelto: "resolved",
      resolved: "resolved",

      cerrada: "closed",
      cerrado: "closed",
      closed: "closed",
    };

    const key = normalizeText(String(value ?? "").replaceAll("_", " "));
    return map[key] || "open";
  }

  function normalizePriority(value = "medium") {
    const map = {
      low: "low",
      baja: "low",

      medium: "medium",
      media: "medium",
      normal: "medium",

      high: "high",
      alta: "high",

      urgent: "urgent",
      urgente: "urgent",
      critical: "urgent",
      critica: "urgent",
      crítica: "urgent",
    };

    const key = normalizeText(value);
    return map[key] || "medium";
  }

  function normalizeIncidencia(item = {}) {
    const id = item.id ?? item.ticketId ?? item._id ?? null;
    const ticketId = item.ticketId ?? item.id ?? item._id ?? null;

    const status = normalizeStatus(item.status ?? item.estado ?? "open");
    const priority = normalizePriority(
      item.priority ?? item.prioridad ?? "medium"
    );

    const clientName =
      item.cliente?.nombre ??
      item.name ??
      item.receptor?.name ??
      item.createdBy?.name ??
      item.user?.name ??
      "Usuario";

    const clientEmail =
      item.cliente?.email ??
      item.email ??
      item.receptor?.email ??
      item.createdBy?.email ??
      item.user?.email ??
      "-";

    const assignedName =
      item.tecnico?.name ??
      item.assignedTo?.name ??
      item.assigned_to?.name ??
      item.assignee?.name ??
      "No asignado";

    const assignedEmail =
      item.tecnico?.email ??
      item.assignedTo?.email ??
      item.assigned_to?.email ??
      item.assignee?.email ??
      "";

    const createdAt = item.createdAt ?? item.fechaCreacion ?? null;
    const updatedAt =
      item.updatedAt ??
      item.fechaActualizacion ??
      item.closedAt ??
      createdAt ??
      null;

    const attachments = safeArray(item.attachments);

    return {
      id,
      ticketId,
      code: ticketId || id || null,
      title:
        item.subject ??
        item.asunto ??
        item.title ??
        `Ticket ${ticketId || id || "sin asunto"}`,
      description:
        item.descripcion ??
        item.message ??
        item.description ??
        item.preview ??
        "",
      preview:
        item.preview ??
        item.descripcion ??
        item.message ??
        item.description ??
        "",
      status,
      priority,
      tipo: safeString(item.tipo, "general"),
      categoria: safeString(item.categoria, "general"),
      client: clientName,
      clientEmail,
      assignedTo: assignedName,
      assignedEmail,
      attachmentsCount:
        safeNumber(item.attachmentsCount, attachments.length) || 0,
      createdAt,
      updatedAt,
      meta: {
        timestampMs: toMs(updatedAt) || toMs(createdAt) || 0,
        initials: getInitials(clientName),
      },
      raw: item,
    };
  }

  function extractItems(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.tickets)) return response.tickets;
    if (Array.isArray(response?.items)) return response.items;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.data?.tickets)) return response.data.tickets;
    if (Array.isArray(response?.data?.items)) return response.data.items;
    if (Array.isArray(response?.results)) return response.results;
    return [];
  }

  /* =========================================================
     LABELS VISUALES
  ========================================================= */
  function getStatusLabel(status) {
    const labels = {
      open: "Abierta",
      pending: "Pendiente",
      in_progress: "En proceso",
      resolved: "Resuelta",
      closed: "Cerrada",
    };

    return labels[status] || "Abierta";
  }

  function getPriorityLabel(priority) {
    const labels = {
      low: "Baja",
      medium: "Media",
      high: "Alta",
      urgent: "Urgente",
    };

    return labels[priority] || "Media";
  }

  function getStatusChipStyle(status) {
    const tones = {
      open:
        "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
      pending:
        "background:var(--warning-bg); border-color:var(--border-warning); color:var(--text-soft);",
      in_progress:
        "background:var(--accent-soft-2); border-color:var(--border-accent); color:var(--text-soft);",
      resolved:
        "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);",
      closed:
        "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);",
    };

    return tones[status] || tones.open;
  }

  function getPriorityChipStyle(priority) {
    const tones = {
      low:
        "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);",
      medium:
        "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
      high:
        "background:var(--warning-bg); border-color:var(--border-warning); color:var(--text-soft);",
      urgent:
        "background:var(--error-bg); border-color:var(--border-error); color:var(--text-soft);",
    };

    return tones[priority] || tones.medium;
  }

  /* =========================================================
     DATA
  ========================================================= */
  function hydrateFromCache() {
    const cache = readCache();
    if (!cache || !Array.isArray(cache.items)) return false;

    const items = cache.items.map(normalizeIncidencia);

    setIncidencias(items);
    localState.lastSyncAt = safeNumber(cache.timestamp, 0);
    localState.loaded = true;

    return true;
  }

  async function loadIncidencias({ force = false } = {}) {
    if (inflightLoad && !force) return inflightLoad;

    const cache = readCache();

    if (!localState.loaded && cache?.items?.length) {
      hydrateFromCache();
      render();
    }

    if (isFreshCache(cache) && !force) {
      return Promise.resolve(getIncidencias());
    }

    localState.loading = true;
    localState.error = null;
    render();

    inflightLoad = (async () => {
      try {
        const response = await Http.get(ENDPOINT);
        const items = extractItems(response).map(normalizeIncidencia);

        setIncidencias(items);

        localState.lastSyncAt = Date.now();
        localState.loaded = true;
        localState.loading = false;
        localState.error = null;

        saveCache({
          timestamp: localState.lastSyncAt,
          items,
        });

        render();
        return items;
      } catch (error) {
        localState.loading = false;
        localState.loaded = true;
        localState.error =
          error?.data?.message ||
          error?.message ||
          "No se pudieron cargar las incidencias.";

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
  function openTicket(ticketId) {
    if (!ticketId) return;

    if (typeof AppCore.events?.emit === "function") {
      AppCore.events.emit("incidencias:open", { ticketId });
    }

    // Base lista para detalle real si lo conectas luego:
    // Router.navigate(`/incidencias/${ticketId}`);
  }

  /* =========================================================
     RENDER PARTS
  ========================================================= */
  function renderHeader() {
    const items = getIncidencias();

    return `
      <header class="page-header">
        <div class="page-header-main">
          <h1 class="page-title">Incidencias</h1>
          <p class="page-subtitle">
            Listado simple de incidencias existentes. Sin ruido. Solo lectura rápida y clara.
          </p>
        </div>

        <div class="page-header-actions">
          <button
            type="button"
            id="incidencias-refresh-btn"
            class="ui-btn ui-btn-secondary"
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
            ${localState.loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </header>

      <section class="section">
        <div class="section-header">
          <div class="section-header-main">
            <h2 class="section-title">${items.length} incidencia(s)</h2>
            <p class="section-subtitle">
              ${
                localState.lastSyncAt
                  ? `Última sincronización: ${escapeHtml(formatRelativeDate(localState.lastSyncAt))}`
                  : "Sin sincronización registrada"
              }
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
              <article class="card-surface" style="padding:var(--space-lg); display:grid; gap:var(--space-md); min-height:220px;">
                <div style="display:flex; justify-content:space-between; gap:var(--space-sm);">
                  <div style="display:grid; gap:var(--space-xs); flex:1;">
                    <div style="width:92px; height:14px; border-radius:var(--radius-pill); background:var(--surface-glass-strong);"></div>
                    <div style="width:76%; height:16px; border-radius:var(--radius-pill); background:var(--surface-hover-strong);"></div>
                  </div>
                  <div style="width:44px; height:44px; border-radius:var(--radius-lg); background:var(--surface-glass);"></div>
                </div>

                <div style="display:grid; gap:var(--space-xs);">
                  <div style="width:100%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:88%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:66%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                </div>

                <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                  <div style="width:92px; height:30px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:92px; height:30px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
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
            id="incidencias-retry-btn"
            class="ui-btn ui-btn-primary"
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
          <div class="empty-state-icon">🎫</div>
          <h3 class="empty-state-title">Sin incidencias</h3>
          <p class="empty-state-text">
            No hay incidencias registradas en este momento.
          </p>
        </div>
      </section>
    `;
  }

  function renderCards() {
    const items = [...getIncidencias()].sort(
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
                class="card-surface hover-lift incidencia-card"
                data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
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
                      ${escapeHtml(item.code || item.id || "—")}
                    </span>

                    <h3 style="
                      margin:0;
                      font-size:var(--font-lg);
                      line-height:var(--line-snug);
                      color:var(--text-strong);
                      font-weight:var(--weight-bold);
                    ">
                      ${escapeHtml(item.title)}
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
                  ${escapeHtml(truncate(item.preview || item.description || "Sin descripción", 180))}
                </p>

                <div style="
                  display:grid;
                  gap:var(--space-xs);
                  font-size:var(--font-md);
                  color:var(--text-soft);
                ">
                  <span><strong style="color:var(--text-strong);">Cliente:</strong> ${escapeHtml(item.client)}</span>
                  <span><strong style="color:var(--text-strong);">Email:</strong> ${escapeHtml(item.clientEmail || "-")}</span>
                  <span><strong style="color:var(--text-strong);">Asignado:</strong> ${escapeHtml(item.assignedTo || "No asignado")}</span>
                  <span><strong style="color:var(--text-strong);">Actualizada:</strong> ${escapeHtml(formatRelativeDate(item.updatedAt))}</span>
                </div>

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
                    ${getStatusChipStyle(item.status)}
                  ">
                    ${escapeHtml(getStatusLabel(item.status))}
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
                    ${getPriorityChipStyle(item.priority)}
                  ">
                    ${escapeHtml(getPriorityLabel(item.priority))}
                  </span>

                  <span style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    min-height:30px;
                    padding:6px 10px;
                    border-radius:var(--radius-pill);
                    border:1px solid var(--chip-border);
                    background:var(--chip-bg);
                    color:var(--chip-text);
                    font-size:var(--font-sm);
                    font-weight:var(--weight-semibold);
                  ">
                    Adjuntos: ${escapeHtml(String(item.attachmentsCount || 0))}
                  </span>
                </div>

                <div class="divider"></div>

                <div style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:var(--space-sm);
                  flex-wrap:wrap;
                ">
                  <div style="
                    display:grid;
                    gap:2px;
                    min-width:0;
                  ">
                    <span style="
                      font-size:var(--font-sm);
                      color:var(--text-dim);
                    ">
                      ${escapeHtml(formatDate(item.updatedAt))}
                    </span>
                  </div>

                  <button
                    type="button"
                    data-action="open-ticket"
                    data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
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
                    Ver incidencia
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
     BIND
  ========================================================= */
  function bind() {
    AppCore.cleanup.run(SCOPE);

    const scope = AppCore.cleanup.scope(SCOPE);

    const refreshBtn = document.getElementById("incidencias-refresh-btn");
    const retryBtn = document.getElementById("incidencias-retry-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        await loadIncidencias({ force: true });
      });
    }

    if (retryBtn) {
      AppCore.cleanup.on(scope, retryBtn, "click", async () => {
        await loadIncidencias({ force: true });
      });
    }

    const openButtons = document.querySelectorAll('[data-action="open-ticket"]');
    openButtons.forEach((button) => {
      AppCore.cleanup.on(scope, button, "click", (event) => {
        event.stopPropagation();
        openTicket(button.getAttribute("data-ticket-id"));
      });
    });

    const cards = document.querySelectorAll(".incidencia-card");
    cards.forEach((card) => {
      AppCore.cleanup.on(scope, card, "click", () => {
        openTicket(card.getAttribute("data-ticket-id"));
      });
    });
  }

  /* =========================================================
     RENDER ROOT
  ========================================================= */
  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.setDocumentTitle("Incidencias");
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
     API
  ========================================================= */
  return {
    render,
    loadIncidencias,
  };
})();
