/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidenciasView.js

   Responsabilidades:
   - pintar el panel de incidencias
   - cargar incidencias desde backend
   - guardar incidencias en Store
   - búsqueda local
   - filtros por estado/prioridad
   - KPIs rápidos
   - tabla responsive base
   - gestión de loading / error / vacío
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";
import { Http } from "../services/http.js";

export const IncidenciasView = (() => {
  "use strict";

  const SCOPE = "view:incidencias";

  const ENDPOINTS = {
    list: "/incidencias",
  };

  const localState = {
    loading: false,
    loaded: false,
    error: null,
    query: "",
    status: "all",
    priority: "all",
    sort: "updated_desc",
  };

  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function normalizeIncidencia(item = {}) {
    return {
      id: item.id ?? item._id ?? item.uuid ?? null,
      code: item.code ?? item.codigo ?? item.reference ?? item.ref ?? null,
      title: item.title ?? item.titulo ?? item.subject ?? "Sin título",
      description: item.description ?? item.descripcion ?? "",
      status: normalizeStatus(item.status ?? item.estado ?? "open"),
      priority: normalizePriority(item.priority ?? item.prioridad ?? "medium"),
      client:
        item.client?.name ??
        item.client_name ??
        item.cliente?.nombre ??
        item.cliente ??
        "Sin cliente",
      assignedTo:
        item.assigned_to?.name ??
        item.assignedTo?.name ??
        item.tecnico?.nombre ??
        item.agent?.name ??
        item.assignee ??
        "Sin asignar",
      createdAt: item.created_at ?? item.createdAt ?? item.fecha_alta ?? null,
      updatedAt: item.updated_at ?? item.updatedAt ?? item.fecha_actualizacion ?? null,
      raw: item,
    };
  }

  function normalizeStatus(value = "open") {
    const map = {
      abierta: "open",
      abierto: "open",
      open: "open",
      pending: "pending",
      pendiente: "pending",
      en_proceso: "in_progress",
      in_progress: "in_progress",
      progress: "in_progress",
      resuelta: "resolved",
      resuelto: "resolved",
      resolved: "resolved",
      closed: "closed",
      cerrada: "closed",
      cerrado: "closed",
    };

    const key = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

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

    const key = String(value ?? "")
      .trim()
      .toLowerCase();

    return map[key] || "medium";
  }

  function extractItems(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.items)) return response.items;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.data?.items)) return response.data.items;
    if (Array.isArray(response?.results)) return response.results;
    return [];
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

  function getStatusTone(status) {
    const tones = {
      open: "rgba(59,130,246,.18)",
      pending: "rgba(245,158,11,.18)",
      in_progress: "rgba(168,85,247,.18)",
      resolved: "rgba(34,197,94,.18)",
      closed: "rgba(107,114,128,.18)",
    };

    return tones[status] || "rgba(59,130,246,.18)";
  }

  function getPriorityTone(priority) {
    const tones = {
      low: "rgba(34,197,94,.18)",
      medium: "rgba(59,130,246,.18)",
      high: "rgba(245,158,11,.18)",
      urgent: "rgba(239,68,68,.18)",
    };

    return tones[priority] || "rgba(59,130,246,.18)";
  }

  function getIncidencias() {
    return Store.get("entities.incidencias") || [];
  }

  function getFilteredIncidencias() {
    let items = [...getIncidencias()];

    if (localState.query) {
      const term = localState.query.toLowerCase();

      items = items.filter((item) => {
        return [
          item.id,
          item.code,
          item.title,
          item.description,
          item.client,
          item.assignedTo,
          getStatusLabel(item.status),
          getPriorityLabel(item.priority),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      });
    }

    if (localState.status !== "all") {
      items = items.filter((item) => item.status === localState.status);
    }

    if (localState.priority !== "all") {
      items = items.filter((item) => item.priority === localState.priority);
    }

    items.sort((a, b) => {
      if (localState.sort === "updated_desc") {
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }

      if (localState.sort === "updated_asc") {
        return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
      }

      if (localState.sort === "created_desc") {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }

      if (localState.sort === "created_asc") {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }

      if (localState.sort === "priority_desc") {
        const order = { low: 1, medium: 2, high: 3, urgent: 4 };
        return (order[b.priority] || 0) - (order[a.priority] || 0);
      }

      if (localState.sort === "priority_asc") {
        const order = { low: 1, medium: 2, high: 3, urgent: 4 };
        return (order[a.priority] || 0) - (order[b.priority] || 0);
      }

      return 0;
    });

    return items;
  }

  function getKpis() {
    const items = getIncidencias();

    return {
      total: items.length,
      open: items.filter((item) => item.status === "open").length,
      pending: items.filter((item) => item.status === "pending").length,
      urgent: items.filter((item) => item.priority === "urgent").length,
    };
  }

  function statCard({ label, value, hint, icon }) {
    return `
      <article
        style="
          display:grid;
          gap:14px;
          padding:18px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <span style="font-size:14px; opacity:.72;">${escapeHtml(label)}</span>
          <span
            style="
              width:40px;
              height:40px;
              display:grid;
              place-items:center;
              border-radius:12px;
              border:1px solid rgba(255,255,255,.08);
            "
          >
            ${icon}
          </span>
        </div>

        <div style="display:grid; gap:4px;">
          <strong style="font-size:30px; line-height:1;">${escapeHtml(value)}</strong>
          <span style="font-size:13px; opacity:.65;">${escapeHtml(hint)}</span>
        </div>
      </article>
    `;
  }

  function renderHeader() {
    const kpis = getKpis();

    return `
      <section style="display:grid; gap:20px;">
        <div
          style="
            display:grid;
            gap:14px;
            padding:24px;
            border-radius:24px;
            border:1px solid rgba(255,255,255,.08);
            background:
              radial-gradient(circle at top right, rgba(255,255,255,.06), transparent 35%),
              rgba(255,255,255,.03);
          "
        >
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap;">
            <div style="display:grid; gap:8px;">
              <h2 style="margin:0; font-size:30px;">Incidencias</h2>
              <p style="margin:0; opacity:.74; max-width:760px;">
                Controla el flujo de tickets, revisa prioridades, filtra incidencias
                y mantén una visión operativa clara del soporte.
              </p>
            </div>

            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <button
                type="button"
                id="incidencias-refresh-btn"
                style="
                  padding:12px 16px;
                  border:1px solid rgba(255,255,255,.08);
                  border-radius:14px;
                  background:rgba(255,255,255,.04);
                  cursor:pointer;
                  font-weight:600;
                "
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
            gap:16px;
          "
        >
          ${statCard({
            label: "Total incidencias",
            value: kpis.total,
            hint: "Tickets visibles en el sistema",
            icon: "🎫",
          })}

          ${statCard({
            label: "Abiertas",
            value: kpis.open,
            hint: "Necesitan atención",
            icon: "🟦",
          })}

          ${statCard({
            label: "Pendientes",
            value: kpis.pending,
            hint: "Esperando acción",
            icon: "🟨",
          })}

          ${statCard({
            label: "Urgentes",
            value: kpis.urgent,
            hint: "Prioridad máxima",
            icon: "🟥",
          })}
        </div>
      </section>
    `;
  }

  function renderFilters() {
    return `
      <section
        style="
          display:grid;
          gap:16px;
          padding:20px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Filtros</h3>
          <span style="font-size:13px; opacity:.65;">Búsqueda y clasificación local</span>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:minmax(220px, 1.5fr) repeat(3, minmax(160px, .7fr));
            gap:14px;
          "
          class="incidencias-filters-grid"
        >
          <input
            id="incidencias-search"
            type="text"
            placeholder="Buscar por título, cliente, técnico, código..."
            value="${escapeHtml(localState.query)}"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >

          <select
            id="incidencias-status-filter"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >
            <option value="all"${localState.status === "all" ? " selected" : ""}>Todos los estados</option>
            <option value="open"${localState.status === "open" ? " selected" : ""}>Abiertas</option>
            <option value="pending"${localState.status === "pending" ? " selected" : ""}>Pendientes</option>
            <option value="in_progress"${localState.status === "in_progress" ? " selected" : ""}>En proceso</option>
            <option value="resolved"${localState.status === "resolved" ? " selected" : ""}>Resueltas</option>
            <option value="closed"${localState.status === "closed" ? " selected" : ""}>Cerradas</option>
          </select>

          <select
            id="incidencias-priority-filter"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >
            <option value="all"${localState.priority === "all" ? " selected" : ""}>Todas las prioridades</option>
            <option value="low"${localState.priority === "low" ? " selected" : ""}>Baja</option>
            <option value="medium"${localState.priority === "medium" ? " selected" : ""}>Media</option>
            <option value="high"${localState.priority === "high" ? " selected" : ""}>Alta</option>
            <option value="urgent"${localState.priority === "urgent" ? " selected" : ""}>Urgente</option>
          </select>

          <select
            id="incidencias-sort"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >
            <option value="updated_desc"${localState.sort === "updated_desc" ? " selected" : ""}>Actualización ↓</option>
            <option value="updated_asc"${localState.sort === "updated_asc" ? " selected" : ""}>Actualización ↑</option>
            <option value="created_desc"${localState.sort === "created_desc" ? " selected" : ""}>Creación ↓</option>
            <option value="created_asc"${localState.sort === "created_asc" ? " selected" : ""}>Creación ↑</option>
            <option value="priority_desc"${localState.sort === "priority_desc" ? " selected" : ""}>Prioridad ↓</option>
            <option value="priority_asc"${localState.sort === "priority_asc" ? " selected" : ""}>Prioridad ↑</option>
          </select>
        </div>
      </section>
    `;
  }

  function renderTable() {
    if (localState.loading) {
      return `
        <section
          style="
            display:grid;
            gap:12px;
            padding:20px;
            border-radius:20px;
            border:1px solid rgba(255,255,255,.08);
            background:rgba(255,255,255,.03);
          "
        >
          <h3 style="margin:0;">Listado</h3>
          <p style="margin:0; opacity:.72;">Cargando incidencias...</p>
        </section>
      `;
    }

    if (localState.error) {
      return `
        <section
          style="
            display:grid;
            gap:12px;
            padding:20px;
            border-radius:20px;
            border:1px solid rgba(255,255,255,.08);
            background:rgba(255,255,255,.03);
          "
        >
          <h3 style="margin:0;">Listado</h3>
          <p style="margin:0; color:#ff6b6b;">
            ${escapeHtml(localState.error)}
          </p>
        </section>
      `;
    }

    const items = getFilteredIncidencias();

    if (!items.length) {
      return `
        <section
          style="
            display:grid;
            gap:12px;
            padding:20px;
            border-radius:20px;
            border:1px solid rgba(255,255,255,.08);
            background:rgba(255,255,255,.03);
          "
        >
          <h3 style="margin:0;">Listado</h3>
          <p style="margin:0; opacity:.72;">
            No hay incidencias que coincidan con los filtros actuales.
          </p>
        </section>
      `;
    }

    return `
      <section
        style="
          display:grid;
          gap:16px;
          padding:20px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Listado</h3>
          <span style="font-size:13px; opacity:.65;">${items.length} resultado(s)</span>
        </div>

        <div style="overflow:auto;">
          <table
            style="
              width:100%;
              border-collapse:collapse;
              min-width:980px;
            "
          >
            <thead>
              <tr style="text-align:left; border-bottom:1px solid rgba(255,255,255,.08);">
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Código</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Título</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Cliente</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Asignado</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Estado</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Prioridad</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Actualizada</th>
              </tr>
            </thead>

            <tbody>
              ${items
                .map(
                  (item) => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
                      <td style="padding:14px 10px; font-size:14px; white-space:nowrap;">
                        ${escapeHtml(item.code || item.id || "—")}
                      </td>

                      <td style="padding:14px 10px; min-width:240px;">
                        <div style="display:grid; gap:4px;">
                          <strong style="font-size:14px;">${escapeHtml(item.title)}</strong>
                          <span style="font-size:12px; opacity:.65;">
                            ${escapeHtml(item.description || "Sin descripción")}
                          </span>
                        </div>
                      </td>

                      <td style="padding:14px 10px; font-size:14px;">
                        ${escapeHtml(item.client)}
                      </td>

                      <td style="padding:14px 10px; font-size:14px;">
                        ${escapeHtml(item.assignedTo)}
                      </td>

                      <td style="padding:14px 10px;">
                        <span
                          style="
                            display:inline-flex;
                            align-items:center;
                            justify-content:center;
                            padding:7px 10px;
                            border-radius:999px;
                            font-size:12px;
                            font-weight:600;
                            background:${getStatusTone(item.status)};
                          "
                        >
                          ${escapeHtml(getStatusLabel(item.status))}
                        </span>
                      </td>

                      <td style="padding:14px 10px;">
                        <span
                          style="
                            display:inline-flex;
                            align-items:center;
                            justify-content:center;
                            padding:7px 10px;
                            border-radius:999px;
                            font-size:12px;
                            font-weight:600;
                            background:${getPriorityTone(item.priority)};
                          "
                        >
                          ${escapeHtml(getPriorityLabel(item.priority))}
                        </span>
                      </td>

                      <td style="padding:14px 10px; font-size:13px; white-space:nowrap;">
                        ${escapeHtml(formatDate(item.updatedAt))}
                      </td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Incidencias");

    container.innerHTML = `
      <section
        class="incidencias-view"
        style="
          display:grid;
          gap:24px;
          padding:24px;
        "
      >
        ${renderHeader()}
        ${renderFilters()}
        ${renderTable()}
      </section>
    `;

    bind();
  }

  async function loadIncidencias({ silent = false } = {}) {
    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    }

    try {
      const response = await Http.get(ENDPOINTS.list);
      const items = extractItems(response).map(normalizeIncidencia);

      Store.actions.setCollection("incidencias", items);

      localState.loaded = true;
      localState.loading = false;
      localState.error = null;

      render();
    } catch (error) {
      localState.loading = false;
      localState.loaded = true;
      localState.error =
        error?.data?.message ||
        error?.message ||
        "No se pudieron cargar las incidencias.";

      render();
    }
  }

  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const searchInput = document.getElementById("incidencias-search");
    const statusFilter = document.getElementById("incidencias-status-filter");
    const priorityFilter = document.getElementById("incidencias-priority-filter");
    const sortSelect = document.getElementById("incidencias-sort");
    const refreshBtn = document.getElementById("incidencias-refresh-btn");

    if (searchInput) {
      AppCore.cleanup.on(
        scope,
        searchInput,
        "input",
        AppCore.utils.debounce((event) => {
          localState.query = event.target.value.trim();
          render();
        }, 100)
      );
    }

    if (statusFilter) {
      AppCore.cleanup.on(scope, statusFilter, "change", (event) => {
        localState.status = event.target.value;
        render();
      });
    }

    if (priorityFilter) {
      AppCore.cleanup.on(scope, priorityFilter, "change", (event) => {
        localState.priority = event.target.value;
        render();
      });
    }

    if (sortSelect) {
      AppCore.cleanup.on(scope, sortSelect, "change", (event) => {
        localState.sort = event.target.value;
        render();
      });
    }

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        await loadIncidencias();
      });
    }

    const unsubscribe = Store.subscribeKey("entities.incidencias", () => {
      if (!localState.loading) {
        render();
      }
    });

    AppCore.cleanup.add(scope, unsubscribe);

    if (!localState.loaded && !localState.loading) {
      loadIncidencias();
    }
  }

  return {
    render,
    loadIncidencias,
  };
})();