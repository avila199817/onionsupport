/* =========================================================
   Onion SPA - Incidencias View (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/incidenciasView.js

   Responsabilidades:
   - pintar el panel de incidencias
   - cargar incidencias desde backend nuevo
   - guardar incidencias en Store
   - soportar búsqueda local y remota
   - filtros por estado / prioridad / asignación
   - KPIs rápidos
   - tabla responsive pro
   - vista cards responsive
   - gestión de loading / error / vacío
   - normalizar tickets del nuevo backend
   - dejar base fina para detalle / edición
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";
import { Http } from "../services/http.js";

export const IncidenciasView = (() => {
  "use strict";

  const SCOPE = "view:incidencias";

  const ENDPOINTS = {
    list: "/api/tickets",
    stats: "/api/tickets/stats",
  };

  const PRIORITY_ORDER = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };

  const localState = {
    bootstrapped: false,
    loading: false,
    loaded: false,
    error: null,

    query: "",
    status: "all",
    priority: "all",
    assigned: "all",
    sort: "updated_desc",

    remoteCount: 0,
    stats: {
      active: 0,
    },
  };

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

  function toMs(value) {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function truncate(value = "", max = 140) {
    const text = safeString(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}…`;
  }

  function getInitials(value = "") {
    return String(value || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2) || "ON";
  }

  function buildAvatar(name = "") {
    return getInitials(name || "Usuario");
  }

  /* =========================================================
     NORMALIZACIÓN NUEVO BACKEND
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
      progress: "in_progress",

      resuelta: "resolved",
      resuelto: "resolved",
      resolved: "resolved",

      cerrada: "closed",
      cerrado: "closed",
      closed: "closed",
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

    const key = String(value ?? "").trim().toLowerCase();
    return map[key] || "medium";
  }

  function normalizeIncidencia(item = {}) {
    const id = item.id ?? item.ticketId ?? null;
    const ticketId = item.ticketId ?? item.id ?? null;

    const status = normalizeStatus(item.status ?? item.estado ?? "open");
    const priority = normalizePriority(
      item.priority ?? item.prioridad ?? "medium"
    );

    const clienteNombre =
      item.cliente?.nombre ??
      item.name ??
      item.receptor?.name ??
      item.createdBy?.name ??
      "Usuario";

    const clienteEmail =
      item.cliente?.email ??
      item.email ??
      item.receptor?.email ??
      item.createdBy?.email ??
      "-";

    const tecnicoNombre =
      item.tecnico?.name ??
      item.assignedTo?.name ??
      item.assigned_to?.name ??
      "No asignado";

    const createdAt = item.createdAt ?? null;
    const updatedAt = item.updatedAt ?? item.closedAt ?? createdAt ?? null;
    const closedAt = item.closedAt ?? null;

    const attachments = safeArray(item.attachments);
    const history = safeArray(item.history);

    const meta = item.meta || {};
    const isAssigned =
      meta.isAssigned === true ||
      normalizeText(tecnicoNombre) !== "no asignado" ||
      Boolean(safeString(item.tecnico?.email));

    return {
      id,
      ticketId,
      code: ticketId || id || null,

      title:
        item.subject ??
        item.asunto ??
        item.title ??
        `Ticket ${ticketId || id || "sin asunto"}`,

      preview:
        item.preview ??
        item.descripcion ??
        item.message ??
        item.description ??
        "",

      description:
        item.descripcion ??
        item.message ??
        item.description ??
        item.preview ??
        "",

      status,
      priority,

      tipo: safeString(item.tipo, "general"),
      categoria: safeString(item.categoria, "general"),

      client: clienteNombre,
      clientEmail: clienteEmail,

      assignedTo: tecnicoNombre,
      assignedEmail: safeString(item.tecnico?.email, ""),

      cliente: {
        id: item.cliente?.id ?? item.userId ?? item.clienteId ?? null,
        nombre: clienteNombre,
        email: clienteEmail,
        avatar: item.cliente?.avatar ?? null,
        initials: buildAvatar(clienteNombre),
      },

      receptor: {
        name: safeString(item.receptor?.name, ""),
        email: safeString(item.receptor?.email, ""),
      },

      createdBy: {
        userId: safeString(item.createdBy?.userId, ""),
        name: safeString(item.createdBy?.name, ""),
        email: safeString(item.createdBy?.email, ""),
      },

      tecnico: {
        name: tecnicoNombre,
        email: safeString(item.tecnico?.email, ""),
      },

      attachments,
      attachmentsCount:
        safeNumber(item.attachmentsCount, attachments.length) || 0,

      history,
      historyCount: safeNumber(item.historyCount, history.length) || 0,

      createdAt,
      createdAtES: item.createdAtES ?? null,
      updatedAt,
      closedAt,
      closedAtES: item.closedAtES ?? null,

      meta: {
        timestampMs:
          safeNumber(meta.timestampMs, 0) ||
          toMs(updatedAt) ||
          toMs(createdAt) ||
          0,
        hasAttachments:
          meta.hasAttachments === true || attachments.length > 0,
        isClosed: meta.isClosed === true || status === "closed",
        isAssigned,
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
     LABELS / TONES
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

  function getStatusTone(status) {
    const tones = {
      open: "rgba(59,130,246,.16)",
      pending: "rgba(245,158,11,.16)",
      in_progress: "rgba(168,85,247,.16)",
      resolved: "rgba(34,197,94,.16)",
      closed: "rgba(107,114,128,.16)",
    };

    return tones[status] || "rgba(59,130,246,.16)";
  }

  function getPriorityTone(priority) {
    const tones = {
      low: "rgba(34,197,94,.16)",
      medium: "rgba(59,130,246,.16)",
      high: "rgba(245,158,11,.16)",
      urgent: "rgba(239,68,68,.16)",
    };

    return tones[priority] || "rgba(59,130,246,.16)";
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
     FORMATTERS
  ========================================================= */
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

  /* =========================================================
     FILTRO / ORDEN
  ========================================================= */
  function getFilteredIncidencias() {
    let items = [...getIncidencias()];

    if (localState.query) {
      const term = normalizeText(localState.query);

      items = items.filter((item) => {
        return [
          item.id,
          item.ticketId,
          item.code,
          item.title,
          item.preview,
          item.description,
          item.client,
          item.clientEmail,
          item.assignedTo,
          item.assignedEmail,
          item.tipo,
          item.categoria,
          getStatusLabel(item.status),
          getPriorityLabel(item.priority),
        ]
          .filter(Boolean)
          .some((value) => normalizeText(value).includes(term));
      });
    }

    if (localState.status !== "all") {
      items = items.filter((item) => item.status === localState.status);
    }

    if (localState.priority !== "all") {
      items = items.filter((item) => item.priority === localState.priority);
    }

    if (localState.assigned === "assigned") {
      items = items.filter((item) => item.meta?.isAssigned);
    }

    if (localState.assigned === "unassigned") {
      items = items.filter((item) => !item.meta?.isAssigned);
    }

    items.sort((a, b) => {
      if (localState.sort === "updated_desc") {
        return (b.meta?.timestampMs || 0) - (a.meta?.timestampMs || 0);
      }

      if (localState.sort === "updated_asc") {
        return (a.meta?.timestampMs || 0) - (b.meta?.timestampMs || 0);
      }

      if (localState.sort === "created_desc") {
        return toMs(b.createdAt) - toMs(a.createdAt);
      }

      if (localState.sort === "created_asc") {
        return toMs(a.createdAt) - toMs(b.createdAt);
      }

      if (localState.sort === "priority_desc") {
        return (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0);
      }

      if (localState.sort === "priority_asc") {
        return (PRIORITY_ORDER[a.priority] || 0) - (PRIORITY_ORDER[b.priority] || 0);
      }

      if (localState.sort === "title_asc") {
        return String(a.title || "").localeCompare(String(b.title || ""), "es");
      }

      if (localState.sort === "title_desc") {
        return String(b.title || "").localeCompare(String(a.title || ""), "es");
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
      inProgress: items.filter((item) => item.status === "in_progress").length,
      urgent: items.filter((item) => item.priority === "urgent").length,
      closed: items.filter((item) => item.status === "closed").length,
      assigned: items.filter((item) => item.meta?.isAssigned).length,
      withAttachments: items.filter((item) => item.attachmentsCount > 0).length,
    };
  }

  /* =========================================================
     UI PARTS
  ========================================================= */
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
          backdrop-filter: blur(10px);
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
              background:rgba(255,255,255,.03);
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
              <p style="margin:0; opacity:.74; max-width:860px;">
                Vista operativa de tickets conectada al backend nuevo. Consulta
                estados, prioridades, asignación, adjuntos y actividad reciente
                en un panel limpio y rápido.
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
                  color:inherit;
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
            hint: `${localState.remoteCount || kpis.total} visibles desde backend`,
            icon: "🎫",
          })}

          ${statCard({
            label: "Abiertas",
            value: kpis.open,
            hint: `${localState.stats.active || 0} activas no cerradas`,
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
            hint: "Máxima prioridad",
            icon: "🟥",
          })}

          ${statCard({
            label: "Asignadas",
            value: kpis.assigned,
            hint: "Con técnico vinculado",
            icon: "🧑‍💻",
          })}

          ${statCard({
            label: "Con adjuntos",
            value: kpis.withAttachments,
            hint: "Incluyen archivos",
            icon: "📎",
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
          <span style="font-size:13px; opacity:.65;">Búsqueda y clasificación local sobre la colección cargada</span>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:minmax(220px, 1.6fr) repeat(4, minmax(150px, .65fr));
            gap:14px;
          "
          class="incidencias-filters-grid"
        >
          <input
            id="incidencias-search"
            type="text"
            placeholder="Buscar por ticket, asunto, cliente, email, técnico..."
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
            id="incidencias-assigned-filter"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >
            <option value="all"${localState.assigned === "all" ? " selected" : ""}>Asignación</option>
            <option value="assigned"${localState.assigned === "assigned" ? " selected" : ""}>Asignadas</option>
            <option value="unassigned"${localState.assigned === "unassigned" ? " selected" : ""}>Sin asignar</option>
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
            <option value="title_asc"${localState.sort === "title_asc" ? " selected" : ""}>Título A-Z</option>
            <option value="title_desc"${localState.sort === "title_desc" ? " selected" : ""}>Título Z-A</option>
          </select>
        </div>
      </section>
    `;
  }

  function renderEmptyState(message) {
    return `
      <section
        style="
          display:grid;
          gap:12px;
          padding:24px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <h3 style="margin:0;">Listado</h3>
        <p style="margin:0; opacity:.72;">${escapeHtml(message)}</p>
      </section>
    `;
  }

  function renderTable() {
    if (localState.loading) {
      return renderEmptyState("Cargando incidencias...");
    }

    if (localState.error) {
      return `
        <section
          style="
            display:grid;
            gap:12px;
            padding:24px;
            border-radius:20px;
            border:1px solid rgba(255,255,255,.08);
            background:rgba(255,255,255,.03);
          "
        >
          <h3 style="margin:0;">Listado</h3>
          <p style="margin:0; color:#ff7b7b;">
            ${escapeHtml(localState.error)}
          </p>
        </section>
      `;
    }

    const items = getFilteredIncidencias();

    if (!items.length) {
      return renderEmptyState(
        "No hay incidencias que coincidan con los filtros actuales."
      );
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
              min-width:1180px;
            "
          >
            <thead>
              <tr style="text-align:left; border-bottom:1px solid rgba(255,255,255,.08);">
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Ticket</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Asunto</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Cliente</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Asignado</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Estado</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Prioridad</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Adjuntos</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Actualizada</th>
              </tr>
            </thead>

            <tbody>
              ${items
                .map(
                  (item) => `
                    <tr
                      data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                      class="incidencia-row"
                      style="border-bottom:1px solid rgba(255,255,255,.06); cursor:pointer;"
                    >
                      <td style="padding:14px 10px; font-size:13px; white-space:nowrap;">
                        <div style="display:grid; gap:4px;">
                          <strong>${escapeHtml(item.code || item.id || "—")}</strong>
                          <span style="opacity:.6;">${escapeHtml(item.tipo || "general")}</span>
                        </div>
                      </td>

                      <td style="padding:14px 10px; min-width:280px;">
                        <div style="display:grid; gap:5px;">
                          <strong style="font-size:14px;">${escapeHtml(item.title)}</strong>
                          <span style="font-size:12px; opacity:.65;">
                            ${escapeHtml(truncate(item.preview || item.description || "Sin descripción", 120))}
                          </span>
                        </div>
                      </td>

                      <td style="padding:14px 10px; min-width:220px;">
                        <div style="display:grid; gap:5px;">
                          <strong style="font-size:14px;">${escapeHtml(item.client)}</strong>
                          <span style="font-size:12px; opacity:.65;">${escapeHtml(item.clientEmail || "-")}</span>
                        </div>
                      </td>

                      <td style="padding:14px 10px; min-width:180px;">
                        <div style="display:grid; gap:5px;">
                          <strong style="font-size:14px;">${escapeHtml(item.assignedTo)}</strong>
                          <span style="font-size:12px; opacity:.65;">${escapeHtml(item.assignedEmail || "Sin email")}</span>
                        </div>
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
                        ${escapeHtml(String(item.attachmentsCount || 0))}
                      </td>

                      <td style="padding:14px 10px; font-size:13px; white-space:nowrap;">
                        <div style="display:grid; gap:4px;">
                          <strong>${escapeHtml(formatRelativeDate(item.updatedAt))}</strong>
                          <span style="opacity:.6;">${escapeHtml(formatDate(item.updatedAt))}</span>
                        </div>
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

  function renderCards() {
    if (localState.loading || localState.error) return "";

    const items = getFilteredIncidencias();

    if (!items.length) return "";

    return `
      <section
        class="incidencias-cards-mobile"
        style="
          display:grid;
          gap:14px;
        "
      >
        ${items
          .map(
            (item) => `
              <article
                data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                class="incidencia-card-mobile"
                style="
                  display:grid;
                  gap:14px;
                  padding:18px;
                  border-radius:18px;
                  border:1px solid rgba(255,255,255,.08);
                  background:rgba(255,255,255,.03);
                  cursor:pointer;
                "
              >
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                  <div style="display:grid; gap:4px; min-width:0;">
                    <strong style="font-size:14px;">${escapeHtml(item.code || item.id || "—")}</strong>
                    <span style="font-size:12px; opacity:.65;">${escapeHtml(item.title)}</span>
                  </div>

                  <span
                    style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      min-width:38px;
                      height:38px;
                      padding:0 10px;
                      border-radius:12px;
                      background:rgba(255,255,255,.05);
                      border:1px solid rgba(255,255,255,.08);
                      font-size:12px;
                      font-weight:700;
                    "
                  >
                    ${escapeHtml(String(item.attachmentsCount || 0))}
                  </span>
                </div>

                <div style="display:grid; gap:8px;">
                  <div style="font-size:13px; opacity:.75;">${escapeHtml(truncate(item.preview || item.description || "Sin descripción", 140))}</div>

                  <div style="display:grid; gap:5px; font-size:13px;">
                    <span><strong>Cliente:</strong> ${escapeHtml(item.client)}</span>
                    <span><strong>Técnico:</strong> ${escapeHtml(item.assignedTo)}</span>
                    <span><strong>Actualizada:</strong> ${escapeHtml(formatRelativeDate(item.updatedAt))}</span>
                  </div>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
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
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Incidencias");
    AppCore.clearDynamicContainers?.();

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
        ${renderCards()}
      </section>
    `;

    bind();
  }

  /* =========================================================
     REQUESTS
  ========================================================= */
  async function loadStats() {
    try {
      const response = await Http.get(ENDPOINTS.stats);
      localState.stats = {
        active: safeNumber(response?.active, response?.data?.active || 0),
      };
    } catch {
      localState.stats = { active: 0 };
    }
  }

  async function loadIncidencias({ silent = false } = {}) {
    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    }

    try {
      const [listResponse] = await Promise.all([
        Http.get(ENDPOINTS.list),
        loadStats(),
      ]);

      const items = extractItems(listResponse).map(normalizeIncidencia);

      setIncidencias(items);

      localState.remoteCount =
        safeNumber(listResponse?.count, items.length) || items.length;

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

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const searchInput = document.getElementById("incidencias-search");
    const statusFilter = document.getElementById("incidencias-status-filter");
    const priorityFilter = document.getElementById("incidencias-priority-filter");
    const assignedFilter = document.getElementById("incidencias-assigned-filter");
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
        }, 120)
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

    if (assignedFilter) {
      AppCore.cleanup.on(scope, assignedFilter, "change", (event) => {
        localState.assigned = event.target.value;
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

    const clickableRows = document.querySelectorAll("[data-ticket-id]");
    clickableRows.forEach((row) => {
      AppCore.cleanup.on(scope, row, "click", () => {
        const ticketId = row.getAttribute("data-ticket-id");
        if (!ticketId) return;

        if (typeof AppCore.events?.emit === "function") {
          AppCore.events.emit("incidencias:open", { ticketId });
        }

        // Base lista para navegar a detalle cuando lo tengas fino:
        // Router.navigate(`/incidencias/${ticketId}`);
      });
    });

    const unsubscribe = Store.subscribeKey?.("entities.incidencias", () => {
      if (!localState.loading) {
        render();
      }
    });

    if (typeof unsubscribe === "function") {
      AppCore.cleanup.add(scope, unsubscribe);
    }

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;
      loadIncidencias();
    }
  }

  return {
    render,
    loadIncidencias,
  };
})();
