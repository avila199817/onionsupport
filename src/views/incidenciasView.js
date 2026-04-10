/* =========================================================
   Onion SPA - Incidencias View (FULL PRO SAAS PANEL · FINAL PRO SYSTEM v3)
   Archivo: src/views/incidenciasView.js

   Responsabilidades:
   - pintar panel de incidencias con shell inmediata
   - cargar incidencias del backend nuevo con estrategia cache-first
   - guardar incidencias en Store
   - soportar búsqueda local fina
   - preparar búsqueda remota futura
   - filtros por estado / prioridad / asignación / mías
   - KPIs rápidos orientados a operación real
   - tabla desktop pro
   - cards responsive mobile
   - gestión robusta de loading / refreshing / error / vacío
   - normalizar tickets del backend nuevo
   - quick create de incidencia
   - acciones rápidas base para detalle / edición / recarga
   - compatibilidad real con design tokens globales
   - zero hardcoded visual noise / full variable driven UI
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";
import { Http } from "../services/http.js";

export const IncidenciasView = (() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const SCOPE = "view:incidencias";

  const ENDPOINTS = {
    list: "/api/tickets",
    stats: "/api/tickets/stats",
    create: "/api/tickets",
  };

  const PRIORITY_ORDER = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };

  const STATUS_ORDER = {
    open: 1,
    pending: 2,
    in_progress: 3,
    resolved: 4,
    closed: 5,
  };

  const CACHE_KEY = "incidencias.cache";
  const CACHE_TTL = 1000 * 60 * 3; // 3 min

  /* =========================================================
     ESTADO LOCAL
  ========================================================= */
  const localState = {
    bootstrapped: false,
    hydrated: false,

    loading: false,
    refreshing: false,
    loaded: false,
    error: null,

    query: "",
    status: "all",
    priority: "all",
    assigned: "all",
    mine: "all",
    sort: "updated_desc",
    view: "table",

    remoteCount: 0,
    lastSyncAt: 0,
    stats: {
      active: 0,
      total: 0,
      open: 0,
      pending: 0,
      inProgress: 0,
      closed: 0,
      urgent: 0,
    },

    createForm: {
      subject: "",
      description: "",
      priority: "medium",
      category: "general",
      sending: false,
      error: null,
      success: null,
    },
  };

  let dom = {};
  let renderScheduled = false;
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

  function buildAvatar(name = "") {
    return getInitials(name || "Usuario");
  }

  function getCurrentUser() {
    return AppCore?.state?.user || null;
  }

  function getCurrentUserEmail() {
    const user = getCurrentUser();

    return normalizeText(
      user?.email ||
      user?.correo ||
      user?.mail ||
      user?.username ||
      ""
    );
  }

  function isMine(item) {
    const currentEmail = getCurrentUserEmail();
    if (!currentEmail) return false;

    return [
      item.clientEmail,
      item.createdBy?.email,
      item.receptor?.email,
    ]
      .filter(Boolean)
      .map(normalizeText)
      .includes(currentEmail);
  }

  function schedulePaint(mode = "content") {
    if (renderScheduled) return;

    renderScheduled = true;

    requestAnimationFrame(() => {
      renderScheduled = false;

      if (!localState.hydrated) {
        render();
        return;
      }

      if (mode === "header") {
        patchHeader();
        patchList();
        return;
      }

      patchContent();
    });
  }

  function getStorageApi() {
    return AppCore?.storage || AppCore?.utils?.storage || null;
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
     NORMALIZACIÓN BACKEND
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
    const id = item.id ?? item.ticketId ?? item._id ?? null;
    const ticketId = item.ticketId ?? item.id ?? item._id ?? null;

    const status = normalizeStatus(item.status ?? item.estado ?? "open");
    const priority = normalizePriority(
      item.priority ?? item.prioridad ?? "medium"
    );

    const clienteNombre =
      item.cliente?.nombre ??
      item.name ??
      item.receptor?.name ??
      item.createdBy?.name ??
      item.user?.name ??
      "Usuario";

    const clienteEmail =
      item.cliente?.email ??
      item.email ??
      item.receptor?.email ??
      item.createdBy?.email ??
      item.user?.email ??
      "-";

    const tecnicoNombre =
      item.tecnico?.name ??
      item.assignedTo?.name ??
      item.assigned_to?.name ??
      item.assignee?.name ??
      "No asignado";

    const tecnicoEmail =
      item.tecnico?.email ??
      item.assignedTo?.email ??
      item.assigned_to?.email ??
      item.assignee?.email ??
      "";

    const createdAt = item.createdAt ?? item.fechaCreacion ?? null;
    const updatedAt =
      item.updatedAt ??
      item.closedAt ??
      item.fechaActualizacion ??
      createdAt ??
      null;
    const closedAt = item.closedAt ?? null;

    const attachments = safeArray(item.attachments);
    const history = safeArray(item.history);

    const meta = item.meta || {};
    const assignedFlag =
      meta.isAssigned === true ||
      normalizeText(tecnicoNombre) !== "no asignado" ||
      Boolean(safeString(tecnicoEmail));

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
      assignedEmail: tecnicoEmail,

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
        email: tecnicoEmail,
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
        isAssigned: assignedFlag,
        isMine: isMine({
          clientEmail: clienteEmail,
          createdBy: item.createdBy || {},
          receptor: item.receptor || {},
        }),
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
     LABELS / TOKENS STATUS
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
      open:
        "background:color-mix(in srgb, var(--info) 14%, transparent); border:1px solid color-mix(in srgb, var(--info) 32%, transparent); color:var(--text-soft);",
      pending:
        "background:color-mix(in srgb, var(--warning) 14%, transparent); border:1px solid color-mix(in srgb, var(--warning) 32%, transparent); color:var(--text-soft);",
      in_progress:
        "background:color-mix(in srgb, var(--accent-2) 18%, transparent); border:1px solid color-mix(in srgb, var(--accent-2) 34%, transparent); color:var(--text-soft);",
      resolved:
        "background:color-mix(in srgb, var(--success) 14%, transparent); border:1px solid color-mix(in srgb, var(--success) 32%, transparent); color:var(--text-soft);",
      closed:
        "background:color-mix(in srgb, var(--text-dim) 14%, transparent); border:1px solid color-mix(in srgb, var(--text-dim) 28%, transparent); color:var(--text-muted);",
    };

    return tones[status] || tones.open;
  }

  function getPriorityTone(priority) {
    const tones = {
      low:
        "background:color-mix(in srgb, var(--success) 12%, transparent); border:1px solid color-mix(in srgb, var(--success) 28%, transparent); color:var(--text-soft);",
      medium:
        "background:color-mix(in srgb, var(--info) 12%, transparent); border:1px solid color-mix(in srgb, var(--info) 28%, transparent); color:var(--text-soft);",
      high:
        "background:color-mix(in srgb, var(--warning) 12%, transparent); border:1px solid color-mix(in srgb, var(--warning) 28%, transparent); color:var(--text-soft);",
      urgent:
        "background:color-mix(in srgb, var(--error) 12%, transparent); border:1px solid color-mix(in srgb, var(--error) 28%, transparent); color:var(--text-soft);",
    };

    return tones[priority] || tones.medium;
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
     FILTRO / ORDEN / KPIS
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

    if (localState.mine === "mine") {
      items = items.filter((item) => item.meta?.isMine);
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

      if (localState.sort === "status_asc") {
        return (STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0);
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
      mine: items.filter((item) => item.meta?.isMine).length,
      withAttachments: items.filter((item) => item.attachmentsCount > 0).length,
    };
  }

  function computeStatsFromItems(items = []) {
    return {
      active: items.filter((item) => item.status !== "closed").length,
      total: items.length,
      open: items.filter((item) => item.status === "open").length,
      pending: items.filter((item) => item.status === "pending").length,
      inProgress: items.filter((item) => item.status === "in_progress").length,
      closed: items.filter((item) => item.status === "closed").length,
      urgent: items.filter((item) => item.priority === "urgent").length,
    };
  }

  /* =========================================================
     HELPERS VISUALES 100% VARIABLES
  ========================================================= */
  function statCard({ label, value, hint, icon, accent = "var(--accent)" }) {
    return `
      <article
        class="incidencias-stat-card"
        style="
          display:grid;
          gap:var(--space-lg);
          padding:var(--space-xl);
          border-radius:var(--card-radius);
          border:1px solid var(--card-border);
          background:var(--card-bg);
          box-shadow:var(--card-shadow);
          min-height:154px;
          position:relative;
          overflow:hidden;
        "
      >
        <div style="
          position:absolute;
          inset:auto -14% 64% auto;
          width:110px;
          height:110px;
          border-radius:50%;
          background:${accent};
          opacity:.08;
          filter:blur(24px);
          pointer-events:none;
        "></div>

        <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-md); position:relative; z-index:1;">
          <span style="
            font-size:var(--font-md);
            font-weight:var(--weight-medium);
            color:var(--text-muted);
            letter-spacing:var(--letter-wide);
          ">
            ${escapeHtml(label)}
          </span>

          <span style="
            width:44px;
            height:44px;
            display:grid;
            place-items:center;
            border-radius:var(--radius-lg);
            border:1px solid var(--border-default);
            background:var(--surface-glass);
            box-shadow:var(--shadow-xs);
            font-size:18px;
          ">
            ${icon}
          </span>
        </div>

        <div style="display:grid; gap:var(--space-xs); position:relative; z-index:1;">
          <strong style="
            font-size:clamp(28px, 3.2vw, 34px);
            line-height:1;
            letter-spacing:var(--letter-tight);
            color:var(--text-strong);
            font-weight:var(--weight-black);
          ">
            ${escapeHtml(String(value))}
          </strong>

          <span style="
            font-size:var(--font-sm);
            color:var(--text-dim);
          ">
            ${escapeHtml(hint)}
          </span>
        </div>
      </article>
    `;
  }

  function baseButtonStyle(variant = "ghost") {
    if (variant === "primary") {
      return `
        min-height:var(--btn-height-sm);
        padding:10px 14px;
        border-radius:var(--btn-radius);
        border:1px solid var(--btn-primary-border);
        background:var(--btn-primary-bg);
        color:var(--btn-primary-text);
        box-shadow:var(--btn-primary-shadow);
        font-size:var(--font-md);
        font-weight:var(--weight-bold);
        letter-spacing:var(--letter-normal);
        cursor:pointer;
        transition:
          transform var(--duration-normal) var(--ease-standard),
          opacity var(--duration-normal) var(--ease-standard),
          background var(--duration-normal) var(--ease-standard),
          border-color var(--duration-normal) var(--ease-standard),
          box-shadow var(--duration-normal) var(--ease-standard);
      `;
    }

    return `
      min-height:var(--btn-height-sm);
      padding:10px 14px;
      border-radius:var(--btn-radius);
      border:1px solid var(--btn-secondary-border);
      background:var(--btn-secondary-bg);
      color:var(--btn-secondary-text);
      box-shadow:var(--btn-secondary-shadow);
      font-size:var(--font-md);
      font-weight:var(--weight-bold);
      letter-spacing:var(--letter-normal);
      cursor:pointer;
      transition:
        transform var(--duration-normal) var(--ease-standard),
        opacity var(--duration-normal) var(--ease-standard),
        background var(--duration-normal) var(--ease-standard),
        border-color var(--duration-normal) var(--ease-standard),
        box-shadow var(--duration-normal) var(--ease-standard);
    `;
  }

  function smallActionButtonStyle() {
    return `
      min-height:36px;
      padding:8px 12px;
      border-radius:var(--radius-sm);
      border:1px solid var(--border-default);
      background:var(--surface-glass);
      color:var(--text-soft);
      box-shadow:var(--shadow-xs);
      cursor:pointer;
      font-size:var(--font-sm);
      font-weight:var(--weight-bold);
      transition:
        transform var(--duration-fast) var(--ease-standard),
        background var(--duration-normal) var(--ease-standard),
        border-color var(--duration-normal) var(--ease-standard),
        color var(--duration-normal) var(--ease-standard);
    `;
  }

  function inputStyle(multiline = false) {
    return `
      width:100%;
      min-height:${multiline ? "140px" : "var(--input-height)"};
      padding:${multiline ? "14px 16px" : "0 16px"};
      border-radius:${multiline ? "var(--radius-lg)" : "var(--input-radius)"};
      border:1px solid var(--input-border);
      background:var(--input-bg);
      color:var(--input-text);
      box-shadow:var(--input-shadow);
      outline:none;
      resize:${multiline ? "vertical" : "none"};
      font-size:var(--font-base);
      transition:
        background var(--duration-normal) var(--ease-standard),
        border-color var(--duration-normal) var(--ease-standard),
        box-shadow var(--duration-normal) var(--ease-standard);
    `;
  }

  function panelStyle(extra = "") {
    return `
      border-radius:var(--panel-radius);
      border:1px solid var(--panel-border);
      background:var(--panel-bg);
      box-shadow:var(--panel-shadow);
      ${extra}
    `;
  }

  function chipStyle(extra = "") {
    return `
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      min-height:34px;
      padding:7px 12px;
      border-radius:var(--radius-pill);
      border:1px solid var(--chip-border);
      background:var(--chip-bg);
      color:var(--chip-text);
      font-size:var(--font-sm);
      font-weight:var(--weight-semibold);
      ${extra}
    `;
  }

  /* =========================================================
     UI PARTS
  ========================================================= */
  function renderShell() {
    return `
      <section class="incidencias-view" style="display:grid; gap:var(--space-xl); padding:var(--content-padding);">
        <section style="
          display:grid;
          gap:var(--space-xl);
          padding:var(--space-xl);
          ${panelStyle()}
        ">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:var(--space-xl); flex-wrap:wrap;">
            <div style="display:grid; gap:var(--space-sm); min-width:0;">
              <div style="width:240px; height:18px; border-radius:var(--radius-pill); background:var(--surface-glass-strong);"></div>
              <div style="width:min(760px, 80vw); height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
              <div style="width:min(600px, 70vw); height:12px; border-radius:var(--radius-pill); background:var(--surface-disabled);"></div>
            </div>

            <div style="display:flex; gap:var(--space-sm);">
              <div style="width:120px; height:42px; border-radius:var(--btn-radius); background:var(--surface-glass-strong);"></div>
              <div style="width:152px; height:42px; border-radius:var(--btn-radius); background:var(--surface-glass-strong);"></div>
            </div>
          </div>
        </section>

        <section style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));
          gap:var(--space-md);
        ">
          ${Array.from({ length: 6 })
            .map(
              () => `
                <article style="
                  display:grid;
                  gap:var(--space-md);
                  min-height:150px;
                  padding:var(--space-xl);
                  ${panelStyle()}
                ">
                  <div style="width:72%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass-strong);"></div>
                  <div style="width:42%; height:30px; border-radius:var(--radius-pill); background:var(--surface-hover-strong);"></div>
                  <div style="width:78%; height:11px; border-radius:var(--radius-pill); background:var(--surface-disabled);"></div>
                </article>
              `
            )
            .join("")}
        </section>

        <section class="incidencias-main-grid" style="
          display:grid;
          grid-template-columns:minmax(320px, 420px) 1fr;
          gap:var(--space-lg);
        ">
          <article style="padding:var(--space-xl); ${panelStyle()}">
            <div style="display:grid; gap:var(--space-md);">
              <div style="width:160px; height:14px; border-radius:var(--radius-pill); background:var(--surface-glass-strong);"></div>
              <div style="height:52px; border-radius:var(--input-radius); background:var(--surface-glass);"></div>
              <div style="height:150px; border-radius:var(--radius-lg); background:var(--surface-glass);"></div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-sm);">
                <div style="height:52px; border-radius:var(--input-radius); background:var(--surface-glass);"></div>
                <div style="height:52px; border-radius:var(--input-radius); background:var(--surface-glass);"></div>
              </div>
              <div style="width:170px; height:42px; border-radius:var(--btn-radius); background:var(--surface-glass-strong);"></div>
            </div>
          </article>

          <article style="padding:var(--space-xl); ${panelStyle()}">
            <div style="display:grid; gap:var(--space-md);">
              <div style="height:54px; border-radius:var(--radius-lg); background:var(--surface-glass);"></div>
              ${Array.from({ length: 6 })
                .map(
                  () => `
                    <div style="
                      height:72px;
                      border-radius:var(--radius-lg);
                      background:var(--surface-glass);
                      border:1px solid var(--border-soft);
                    "></div>
                  `
                )
                .join("")}
            </div>
          </article>
        </section>
      </section>
    `;
  }

  function renderHeader() {
    const kpis = getKpis();

    return `
      <section style="display:grid; gap:var(--space-xl);">
        <div style="
          display:grid;
          gap:var(--space-xl);
          padding:var(--space-xl);
          border-radius:var(--card-radius-lg);
          border:1px solid var(--card-border);
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 12%, transparent), transparent 34%),
            var(--card-bg);
          box-shadow:var(--shadow-md);
        ">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:var(--space-xl); flex-wrap:wrap;">
            <div style="display:grid; gap:var(--space-sm); min-width:0;">
              <h2 style="
                margin:0;
                font-size:clamp(28px, 4vw, 36px);
                line-height:var(--line-tight);
                letter-spacing:var(--letter-tight);
                color:var(--text-strong);
                font-weight:var(--weight-black);
              ">
                Centro de Incidencias
              </h2>

              <p style="
                margin:0;
                max-width:900px;
                color:var(--text-muted);
                font-size:var(--font-lg);
                line-height:var(--line-relaxed);
              ">
                Panel operativo limpio, serio y rápido para crear, consultar y gestionar incidencias
                con una UX consistente con el shell principal de Onion Support.
              </p>

              <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap; margin-top:2px;">
                <span style="${chipStyle()}">
                  ${localState.refreshing ? "⟳" : "●"}
                  ${localState.lastSyncAt
                    ? `Última sync: ${escapeHtml(formatRelativeDate(localState.lastSyncAt))}`
                    : "Sincronizando"}
                </span>

                <span style="${chipStyle()}">
                  ${escapeHtml(String(localState.remoteCount || kpis.total))} tickets visibles
                </span>
              </div>
            </div>

            <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap; align-items:center;">
              <button
                type="button"
                id="incidencias-toggle-view-btn"
                style="${baseButtonStyle("ghost")}"
              >
                Vista: ${localState.view === "table" ? "Tabla" : "Cards"}
              </button>

              <button
                type="button"
                id="incidencias-refresh-btn"
                style="${baseButtonStyle("primary")}"
              >
                ${localState.refreshing ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>
        </div>

        <div style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
          gap:var(--space-md);
        ">
          ${statCard({
            label: "Total",
            value: kpis.total,
            hint: "Incidencias cargadas",
            icon: "🎫",
            accent: "var(--accent)",
          })}

          ${statCard({
            label: "Abiertas",
            value: kpis.open,
            hint: `${localState.stats.active || 0} activas`,
            icon: "🟦",
            accent: "var(--info)",
          })}

          ${statCard({
            label: "Pendientes",
            value: kpis.pending,
            hint: "Esperando acción",
            icon: "🟨",
            accent: "var(--warning)",
          })}

          ${statCard({
            label: "Urgentes",
            value: kpis.urgent,
            hint: "Prioridad máxima",
            icon: "🟥",
            accent: "var(--error)",
          })}

          ${statCard({
            label: "Asignadas",
            value: kpis.assigned,
            hint: "Con técnico asociado",
            icon: "🧑‍💻",
            accent: "var(--accent-2)",
          })}

          ${statCard({
            label: "Mías",
            value: kpis.mine,
            hint: "Relacionadas con mi cuenta",
            icon: "🙋",
            accent: "var(--success)",
          })}
        </div>
      </section>
    `;
  }

  function renderQuickCreate() {
    const form = localState.createForm;

    return `
      <section style="
        display:grid;
        gap:var(--space-lg);
        padding:var(--space-xl);
        ${panelStyle()}
      ">
        <div style="display:grid; gap:var(--space-xs);">
          <h3 style="
            margin:0;
            font-size:var(--font-2xl);
            line-height:var(--line-snug);
            color:var(--text-strong);
            font-weight:var(--weight-bold);
          ">
            Crear incidencia
          </h3>

          <p style="
            margin:0;
            font-size:var(--font-md);
            color:var(--text-muted);
            line-height:var(--line-relaxed);
          ">
            Alta rápida orientada a cliente final. Menos fricción, mejor trazabilidad y entrada directa al flujo operativo.
          </p>
        </div>

        <form id="incidencias-create-form" style="display:grid; gap:var(--space-md);">
          <div style="display:grid; gap:var(--space-xs);">
            <label for="incidencias-create-subject" style="font-size:var(--font-md); color:var(--text-muted);">
              Asunto
            </label>

            <input
              id="incidencias-create-subject"
              name="subject"
              type="text"
              maxlength="160"
              value="${escapeHtml(form.subject)}"
              placeholder="Ej. No puedo acceder al panel"
              style="${inputStyle(false)}"
            >
          </div>

          <div style="display:grid; gap:var(--space-xs);">
            <label for="incidencias-create-description" style="font-size:var(--font-md); color:var(--text-muted);">
              Descripción
            </label>

            <textarea
              id="incidencias-create-description"
              name="description"
              rows="6"
              placeholder="Describe el problema con detalle: qué ocurre, desde cuándo y qué intentaste hacer."
              style="${inputStyle(true)}"
            >${escapeHtml(form.description)}</textarea>
          </div>

          <div class="incidencias-create-grid" style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:var(--space-sm);
          ">
            <div style="display:grid; gap:var(--space-xs);">
              <label for="incidencias-create-priority" style="font-size:var(--font-md); color:var(--text-muted);">
                Prioridad
              </label>

              <select
                id="incidencias-create-priority"
                name="priority"
                style="${inputStyle(false)}"
              >
                <option value="low"${form.priority === "low" ? " selected" : ""}>Baja</option>
                <option value="medium"${form.priority === "medium" ? " selected" : ""}>Media</option>
                <option value="high"${form.priority === "high" ? " selected" : ""}>Alta</option>
                <option value="urgent"${form.priority === "urgent" ? " selected" : ""}>Urgente</option>
              </select>
            </div>

            <div style="display:grid; gap:var(--space-xs);">
              <label for="incidencias-create-category" style="font-size:var(--font-md); color:var(--text-muted);">
                Categoría
              </label>

              <select
                id="incidencias-create-category"
                name="category"
                style="${inputStyle(false)}"
              >
                <option value="general"${form.category === "general" ? " selected" : ""}>General</option>
                <option value="facturacion"${form.category === "facturacion" ? " selected" : ""}>Facturación</option>
                <option value="tecnico"${form.category === "tecnico" ? " selected" : ""}>Técnico</option>
                <option value="acceso"${form.category === "acceso" ? " selected" : ""}>Acceso</option>
                <option value="cuenta"${form.category === "cuenta" ? " selected" : ""}>Cuenta</option>
              </select>
            </div>
          </div>

          ${
            form.error
              ? `
                <div style="
                  padding:12px 14px;
                  border-radius:var(--radius-md);
                  border:1px solid var(--border-error);
                  background:var(--error-bg);
                  color:var(--text-soft);
                  font-size:var(--font-md);
                ">
                  ${escapeHtml(form.error)}
                </div>
              `
              : ""
          }

          ${
            form.success
              ? `
                <div style="
                  padding:12px 14px;
                  border-radius:var(--radius-md);
                  border:1px solid var(--border-success);
                  background:var(--success-bg);
                  color:var(--text-soft);
                  font-size:var(--font-md);
                ">
                  ${escapeHtml(form.success)}
                </div>
              `
              : ""
          }

          <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap;">
            <button
              type="submit"
              style="${baseButtonStyle("primary")} min-width:176px;"
              ${form.sending ? "disabled" : ""}
            >
              ${form.sending ? "Creando..." : "Crear incidencia"}
            </button>

            <button
              type="button"
              id="incidencias-create-clear-btn"
              style="${baseButtonStyle("ghost")}"
            >
              Limpiar
            </button>
          </div>
        </form>
      </section>
    `;
  }

  function renderFilters() {
    return `
      <section style="
        display:grid;
        gap:var(--space-lg);
        padding:var(--space-xl);
        ${panelStyle()}
      ">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-sm); flex-wrap:wrap;">
          <h3 style="
            margin:0;
            font-size:var(--font-xl);
            color:var(--text-strong);
            font-weight:var(--weight-bold);
          ">
            Gestión y filtros
          </h3>

          <span style="
            font-size:var(--font-md);
            color:var(--text-dim);
          ">
            Búsqueda local instantánea sobre la colección cargada
          </span>
        </div>

        <div
          class="incidencias-filters-grid"
          style="
            display:grid;
            grid-template-columns:minmax(220px, 1.6fr) repeat(5, minmax(132px, .7fr));
            gap:var(--space-sm);
          "
        >
          <input
            id="incidencias-search"
            type="text"
            placeholder="Buscar por ticket, asunto, cliente, email, técnico..."
            value="${escapeHtml(localState.query)}"
            style="${inputStyle(false)}"
          >

          <select id="incidencias-status-filter" style="${inputStyle(false)}">
            <option value="all"${localState.status === "all" ? " selected" : ""}>Estado</option>
            <option value="open"${localState.status === "open" ? " selected" : ""}>Abiertas</option>
            <option value="pending"${localState.status === "pending" ? " selected" : ""}>Pendientes</option>
            <option value="in_progress"${localState.status === "in_progress" ? " selected" : ""}>En proceso</option>
            <option value="resolved"${localState.status === "resolved" ? " selected" : ""}>Resueltas</option>
            <option value="closed"${localState.status === "closed" ? " selected" : ""}>Cerradas</option>
          </select>

          <select id="incidencias-priority-filter" style="${inputStyle(false)}">
            <option value="all"${localState.priority === "all" ? " selected" : ""}>Prioridad</option>
            <option value="low"${localState.priority === "low" ? " selected" : ""}>Baja</option>
            <option value="medium"${localState.priority === "medium" ? " selected" : ""}>Media</option>
            <option value="high"${localState.priority === "high" ? " selected" : ""}>Alta</option>
            <option value="urgent"${localState.priority === "urgent" ? " selected" : ""}>Urgente</option>
          </select>

          <select id="incidencias-assigned-filter" style="${inputStyle(false)}">
            <option value="all"${localState.assigned === "all" ? " selected" : ""}>Asignación</option>
            <option value="assigned"${localState.assigned === "assigned" ? " selected" : ""}>Asignadas</option>
            <option value="unassigned"${localState.assigned === "unassigned" ? " selected" : ""}>Sin asignar</option>
          </select>

          <select id="incidencias-mine-filter" style="${inputStyle(false)}">
            <option value="all"${localState.mine === "all" ? " selected" : ""}>Relación</option>
            <option value="mine"${localState.mine === "mine" ? " selected" : ""}>Solo mis incidencias</option>
          </select>

          <select id="incidencias-sort" style="${inputStyle(false)}">
            <option value="updated_desc"${localState.sort === "updated_desc" ? " selected" : ""}>Actualización ↓</option>
            <option value="updated_asc"${localState.sort === "updated_asc" ? " selected" : ""}>Actualización ↑</option>
            <option value="created_desc"${localState.sort === "created_desc" ? " selected" : ""}>Creación ↓</option>
            <option value="created_asc"${localState.sort === "created_asc" ? " selected" : ""}>Creación ↑</option>
            <option value="priority_desc"${localState.sort === "priority_desc" ? " selected" : ""}>Prioridad ↓</option>
            <option value="priority_asc"${localState.sort === "priority_asc" ? " selected" : ""}>Prioridad ↑</option>
            <option value="status_asc"${localState.sort === "status_asc" ? " selected" : ""}>Estado</option>
            <option value="title_asc"${localState.sort === "title_asc" ? " selected" : ""}>Título A-Z</option>
            <option value="title_desc"${localState.sort === "title_desc" ? " selected" : ""}>Título Z-A</option>
          </select>
        </div>
      </section>
    `;
  }

  function renderErrorBlock(message) {
    return `
      <section style="
        display:grid;
        gap:var(--space-md);
        padding:var(--space-xl);
        ${panelStyle()}
      ">
        <h3 style="
          margin:0;
          font-size:var(--font-xl);
          color:var(--text-strong);
        ">
          No se pudo cargar el listado
        </h3>

        <p style="
          margin:0;
          color:var(--text-soft);
          font-size:var(--font-base);
        ">
          ${escapeHtml(message)}
        </p>

        <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap;">
          <button id="incidencias-retry-btn" type="button" style="${baseButtonStyle("primary")}">
            Reintentar
          </button>
        </div>
      </section>
    `;
  }

  function renderEmptyState(message) {
    return `
      <section style="
        display:grid;
        gap:var(--space-md);
        padding:var(--space-xl);
        ${panelStyle()}
      ">
        <h3 style="
          margin:0;
          font-size:var(--font-xl);
          color:var(--text-strong);
        ">
          Sin incidencias
        </h3>

        <p style="
          margin:0;
          color:var(--text-muted);
          font-size:var(--font-base);
        ">
          ${escapeHtml(message)}
        </p>
      </section>
    `;
  }

  function renderTable(items) {
    return `
      <section style="
        display:grid;
        gap:var(--space-lg);
        padding:var(--space-xl);
        ${panelStyle()}
      ">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-sm); flex-wrap:wrap;">
          <h3 style="
            margin:0;
            font-size:var(--font-xl);
            color:var(--text-strong);
            font-weight:var(--weight-bold);
          ">
            Listado
          </h3>

          <span style="font-size:var(--font-md); color:var(--text-dim);">
            ${items.length} resultado(s)
          </span>
        </div>

        <div style="
          overflow:auto;
          border-radius:var(--radius-lg);
          border:1px solid var(--table-head-border);
          background:var(--surface-glass);
        ">
          <table style="
            width:100%;
            min-width:1140px;
            border-collapse:collapse;
            background:var(--table-bg);
          ">
            <thead>
              <tr style="
                text-align:left;
                background:var(--table-head-bg);
                border-bottom:1px solid var(--table-head-border);
              ">
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Ticket</th>
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Asunto</th>
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Cliente</th>
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Asignado</th>
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Estado</th>
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Prioridad</th>
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Adj.</th>
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Actualizada</th>
                <th style="padding:14px 12px; font-size:var(--font-md); color:var(--text-dim); font-weight:var(--weight-semibold);">Acciones</th>
              </tr>
            </thead>

            <tbody>
              ${items
                .map(
                  (item) => `
                    <tr
                      data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                      class="incidencia-row"
                      style="border-bottom:1px solid var(--table-border); background:var(--table-row-bg);"
                    >
                      <td style="padding:16px 12px; font-size:var(--font-md); white-space:nowrap; vertical-align:top;">
                        <div style="display:grid; gap:var(--space-2xs);">
                          <strong style="font-size:var(--font-base); color:var(--text-strong);">${escapeHtml(item.code || item.id || "—")}</strong>
                          <span style="font-size:var(--font-sm); color:var(--text-dim);">${escapeHtml(item.tipo || "general")}</span>
                        </div>
                      </td>

                      <td style="padding:16px 12px; min-width:300px; vertical-align:top;">
                        <div style="display:grid; gap:var(--space-2xs);">
                          <strong style="
                            font-size:var(--font-base);
                            color:var(--text-strong);
                            line-height:var(--line-snug);
                          ">
                            ${escapeHtml(item.title)}
                          </strong>

                          <span style="
                            font-size:var(--font-sm);
                            color:var(--text-dim);
                            line-height:var(--line-relaxed);
                          ">
                            ${escapeHtml(truncate(item.preview || item.description || "Sin descripción", 128))}
                          </span>
                        </div>
                      </td>

                      <td style="padding:16px 12px; min-width:220px; vertical-align:top;">
                        <div style="display:grid; gap:var(--space-2xs);">
                          <strong style="font-size:var(--font-base); color:var(--text-soft);">${escapeHtml(item.client)}</strong>
                          <span style="font-size:var(--font-sm); color:var(--text-dim);">${escapeHtml(item.clientEmail || "-")}</span>
                        </div>
                      </td>

                      <td style="padding:16px 12px; min-width:190px; vertical-align:top;">
                        <div style="display:grid; gap:var(--space-2xs);">
                          <strong style="font-size:var(--font-base); color:var(--text-soft);">${escapeHtml(item.assignedTo)}</strong>
                          <span style="font-size:var(--font-sm); color:var(--text-dim);">${escapeHtml(item.assignedEmail || "Sin email")}</span>
                        </div>
                      </td>

                      <td style="padding:16px 12px; vertical-align:top;">
                        <span style="
                          ${chipStyle(getStatusTone(item.status))}
                          min-height:30px;
                          padding:6px 10px;
                        ">
                          ${escapeHtml(getStatusLabel(item.status))}
                        </span>
                      </td>

                      <td style="padding:16px 12px; vertical-align:top;">
                        <span style="
                          ${chipStyle(getPriorityTone(item.priority))}
                          min-height:30px;
                          padding:6px 10px;
                        ">
                          ${escapeHtml(getPriorityLabel(item.priority))}
                        </span>
                      </td>

                      <td style="padding:16px 12px; white-space:nowrap; vertical-align:top; font-size:var(--font-md); color:var(--text-soft);">
                        ${escapeHtml(String(item.attachmentsCount || 0))}
                      </td>

                      <td style="padding:16px 12px; white-space:nowrap; vertical-align:top;">
                        <div style="display:grid; gap:var(--space-2xs);">
                          <strong style="font-size:var(--font-md); color:var(--text-soft);">
                            ${escapeHtml(formatRelativeDate(item.updatedAt))}
                          </strong>
                          <span style="font-size:var(--font-sm); color:var(--text-dim);">
                            ${escapeHtml(formatDate(item.updatedAt))}
                          </span>
                        </div>
                      </td>

                      <td style="padding:16px 12px; vertical-align:top;">
                        <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                          <button
                            type="button"
                            data-action="open-ticket"
                            data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                            style="${smallActionButtonStyle()}"
                          >
                            Abrir
                          </button>

                          <button
                            type="button"
                            data-action="copy-ticket"
                            data-ticket-code="${escapeHtml(item.code || item.id || "")}"
                            style="${smallActionButtonStyle()}"
                          >
                            Copiar ID
                          </button>
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

  function renderCards(items) {
    return `
      <section class="incidencias-cards-mobile" style="display:grid; gap:var(--space-sm);">
        ${items
          .map(
            (item) => `
              <article
                data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                class="incidencia-card-mobile"
                style="
                  display:grid;
                  gap:var(--space-md);
                  padding:var(--space-lg);
                  ${panelStyle("cursor:pointer;")}
                "
              >
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:var(--space-sm);">
                  <div style="display:grid; gap:var(--space-2xs); min-width:0;">
                    <strong style="font-size:var(--font-base); color:var(--text-strong);">
                      ${escapeHtml(item.code || item.id || "—")}
                    </strong>

                    <span style="
                      font-size:var(--font-sm);
                      color:var(--text-dim);
                      line-height:var(--line-snug);
                    ">
                      ${escapeHtml(item.title)}
                    </span>
                  </div>

                  <span style="
                    width:42px;
                    height:42px;
                    display:grid;
                    place-items:center;
                    border-radius:var(--radius-lg);
                    border:1px solid var(--border-default);
                    background:var(--surface-glass);
                    color:var(--text-soft);
                    font-size:var(--font-sm);
                    font-weight:var(--weight-black);
                    flex:0 0 auto;
                  ">
                    ${escapeHtml(String(item.attachmentsCount || 0))}
                  </span>
                </div>

                <div style="display:grid; gap:var(--space-sm);">
                  <div style="
                    font-size:var(--font-md);
                    color:var(--text-muted);
                    line-height:var(--line-relaxed);
                  ">
                    ${escapeHtml(truncate(item.preview || item.description || "Sin descripción", 140))}
                  </div>

                  <div style="display:grid; gap:var(--space-2xs); font-size:var(--font-md); color:var(--text-soft);">
                    <span><strong style="color:var(--text-strong);">Cliente:</strong> ${escapeHtml(item.client)}</span>
                    <span><strong style="color:var(--text-strong);">Técnico:</strong> ${escapeHtml(item.assignedTo)}</span>
                    <span><strong style="color:var(--text-strong);">Actualizada:</strong> ${escapeHtml(formatRelativeDate(item.updatedAt))}</span>
                  </div>
                </div>

                <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                  <span style="${chipStyle(getStatusTone(item.status))}">
                    ${escapeHtml(getStatusLabel(item.status))}
                  </span>

                  <span style="${chipStyle(getPriorityTone(item.priority))}">
                    ${escapeHtml(getPriorityLabel(item.priority))}
                  </span>
                </div>

                <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                  <button
                    type="button"
                    data-action="open-ticket"
                    data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                    style="${smallActionButtonStyle()}"
                  >
                    Abrir
                  </button>

                  <button
                    type="button"
                    data-action="copy-ticket"
                    data-ticket-code="${escapeHtml(item.code || item.id || "")}"
                    style="${smallActionButtonStyle()}"
                  >
                    Copiar ID
                  </button>
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderListArea() {
    if (localState.loading && !getIncidencias().length) {
      return `
        <section style="
          display:grid;
          gap:var(--space-lg);
          padding:var(--space-xl);
          ${panelStyle()}
        ">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-sm);">
            <h3 style="margin:0; font-size:var(--font-xl); color:var(--text-strong);">Listado</h3>
            <span style="font-size:var(--font-md); color:var(--text-dim);">Cargando...</span>
          </div>

          <div style="display:grid; gap:var(--space-sm);">
            ${Array.from({ length: 6 })
              .map(
                () => `
                  <div style="
                    height:72px;
                    border-radius:var(--radius-lg);
                    background:var(--surface-glass);
                    border:1px solid var(--border-soft);
                  "></div>
                `
              )
              .join("")}
          </div>
        </section>
      `;
    }

    if (localState.error && !getIncidencias().length) {
      return renderErrorBlock(localState.error);
    }

    const items = getFilteredIncidencias();

    if (!items.length) {
      return renderEmptyState(
        localState.query ||
        localState.status !== "all" ||
        localState.priority !== "all" ||
        localState.assigned !== "all" ||
        localState.mine !== "all"
          ? "No hay incidencias que coincidan con los filtros actuales."
          : "Todavía no hay incidencias registradas. Usa el panel de creación para abrir la primera."
      );
    }

    return localState.view === "table"
      ? renderTable(items)
      : renderCards(items);
  }

  function renderContent() {
    return `
      <section
        class="incidencias-main-grid"
        style="
          display:grid;
          grid-template-columns:minmax(320px, 420px) 1fr;
          gap:var(--space-lg);
          align-items:start;
        "
      >
        <div style="display:grid; gap:var(--space-lg);">
          ${renderQuickCreate()}
        </div>

        <div style="display:grid; gap:var(--space-lg);">
          ${renderFilters()}
          ${renderListArea()}
        </div>
      </section>
    `;
  }

  /* =========================================================
     ROOT RENDER
  ========================================================= */
  function collectDomRefs() {
    const container = getContainer();

    dom = {
      container,
      headerSlot: container?.querySelector("#incidencias-header-slot") || null,
      contentSlot: container?.querySelector("#incidencias-content-slot") || null,
    };
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Incidencias");
    AppCore.clearDynamicContainers?.();

    container.innerHTML = `
      <section class="incidencias-view" style="
        display:grid;
        gap:var(--space-xl);
        padding:var(--content-padding);
        max-width:var(--content-max);
        width:100%;
        margin:0 auto;
      ">
        <style>
          .incidencias-view input::placeholder,
          .incidencias-view textarea::placeholder {
            color: var(--input-placeholder);
          }

          .incidencias-view input,
          .incidencias-view textarea,
          .incidencias-view select,
          .incidencias-view button {
            font-family: var(--font-family);
          }

          .incidencias-view input:hover,
          .incidencias-view textarea:hover,
          .incidencias-view select:hover {
            background: var(--input-bg-hover) !important;
            border-color: var(--input-border-hover) !important;
            box-shadow: var(--input-shadow-hover) !important;
          }

          .incidencias-view input:focus,
          .incidencias-view textarea:focus,
          .incidencias-view select:focus {
            background: var(--input-bg-focus) !important;
            border-color: var(--input-border-focus) !important;
            box-shadow: var(--input-shadow-focus) !important;
          }

          .incidencias-view button:hover {
            transform: translateY(-1px);
            filter: brightness(1.03);
          }

          .incidencias-view button:active {
            transform: translateY(0);
          }

          .incidencias-view button:disabled {
            opacity: .65;
            cursor: not-allowed;
            transform: none !important;
          }

          .incidencia-row:hover {
            background: var(--table-row-hover) !important;
          }

          .incidencia-card-mobile:hover {
            background: var(--panel-bg-hover) !important;
            border-color: var(--panel-border-hover) !important;
          }

          @media (max-width: 1180px) {
            .incidencias-main-grid {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 980px) {
            .incidencias-filters-grid {
              grid-template-columns: 1fr 1fr !important;
            }
          }

          @media (max-width: 720px) {
            .incidencias-view {
              padding: var(--space-lg) !important;
            }

            .incidencias-filters-grid,
            .incidencias-create-grid {
              grid-template-columns: 1fr !important;
            }
          }
        </style>

        <div id="incidencias-header-slot">
          ${renderHeader()}
        </div>

        <div id="incidencias-content-slot">
          ${renderContent()}
        </div>
      </section>
    `;

    localState.hydrated = true;
    collectDomRefs();
    bind();
  }

  function patchHeader() {
    if (!dom.headerSlot) return;
    dom.headerSlot.innerHTML = renderHeader();
    bindHeaderOnly();
  }

  function patchList() {
    patchContent();
  }

  function patchContent() {
    if (!dom.contentSlot) return;
    dom.contentSlot.innerHTML = renderContent();
    bindContentOnly();
  }

  /* =========================================================
     REQUESTS
  ========================================================= */
  async function loadStats() {
    try {
      const response = await Http.get(ENDPOINTS.stats);

      localState.stats = {
        active: safeNumber(response?.active, response?.data?.active || 0),
        total: safeNumber(response?.total, response?.data?.total || getIncidencias().length),
        open: safeNumber(response?.open, response?.data?.open || 0),
        pending: safeNumber(response?.pending, response?.data?.pending || 0),
        inProgress: safeNumber(response?.inProgress, response?.data?.inProgress || 0),
        closed: safeNumber(response?.closed, response?.data?.closed || 0),
        urgent: safeNumber(response?.urgent, response?.data?.urgent || 0),
      };
    } catch {
      localState.stats = computeStatsFromItems(getIncidencias());
    }
  }

  function hydrateFromCache() {
    const cache = readCache();
    if (!cache || !Array.isArray(cache.items)) return false;

    const items = cache.items.map(normalizeIncidencia);

    setIncidencias(items);

    localState.remoteCount = safeNumber(cache.remoteCount, items.length);
    localState.lastSyncAt = safeNumber(cache.timestamp, 0);
    localState.stats = cache.stats || computeStatsFromItems(items);
    localState.loaded = true;

    return true;
  }

  async function loadIncidencias({ silent = false, force = false } = {}) {
    if (inflightLoad && !force) return inflightLoad;

    const cached = readCache();
    const freshCache = isFreshCache(cached);

    if (!localState.loaded && cached?.items?.length) {
      hydrateFromCache();

      if (!localState.hydrated) {
        render();
      } else {
        schedulePaint("content");
      }
    }

    if (freshCache && !force) {
      return Promise.resolve(getIncidencias());
    }

    if (!silent && !getIncidencias().length) {
      localState.loading = true;
      localState.error = null;

      if (!localState.hydrated) {
        const container = getContainer();

        if (container) {
          AppCore.cleanup.run(SCOPE);
          AppCore.setDocumentTitle("Incidencias");
          AppCore.clearDynamicContainers?.();
          container.innerHTML = renderShell();
        }
      } else {
        schedulePaint("content");
      }
    } else {
      localState.refreshing = true;
      localState.error = null;
      schedulePaint("header");
    }

    inflightLoad = (async () => {
      try {
        const [listResponse] = await Promise.all([
          Http.get(ENDPOINTS.list),
          loadStats(),
        ]);

        const items = extractItems(listResponse).map(normalizeIncidencia);

        setIncidencias(items);

        localState.remoteCount =
          safeNumber(listResponse?.count, items.length) || items.length;

        localState.lastSyncAt = Date.now();
        localState.loaded = true;
        localState.loading = false;
        localState.refreshing = false;
        localState.error = null;

        if (!localState.stats?.total) {
          localState.stats = computeStatsFromItems(items);
        }

        saveCache({
          timestamp: localState.lastSyncAt,
          remoteCount: localState.remoteCount,
          stats: localState.stats,
          items,
        });

        if (!localState.hydrated) {
          render();
        } else {
          schedulePaint("content");
        }

        return items;
      } catch (error) {
        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;

        localState.error =
          error?.data?.message ||
          error?.message ||
          "No se pudieron cargar las incidencias.";

        if (!localState.hydrated) {
          render();
        } else {
          schedulePaint("content");
        }

        throw error;
      } finally {
        inflightLoad = null;
      }
    })();

    return inflightLoad;
  }

  async function createIncidencia(payload = {}) {
    const subject = safeString(payload.subject);
    const description = safeString(payload.description);
    const priority = normalizePriority(payload.priority || "medium");
    const category = safeString(payload.category, "general");

    if (subject.length < 4) {
      throw new Error("El asunto debe tener al menos 4 caracteres.");
    }

    if (description.length < 8) {
      throw new Error("La descripción debe tener al menos 8 caracteres.");
    }

    const body = {
      subject,
      description,
      priority,
      categoria: category,
      category,
      tipo: category,
    };

    return Http.post(ENDPOINTS.create, body);
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  async function handleSubmitCreate(event) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form) return;

    const subject = safeString(form.subject?.value);
    const description = safeString(form.description?.value);
    const priority = safeString(form.priority?.value, "medium");
    const category = safeString(form.category?.value, "general");

    localState.createForm.subject = subject;
    localState.createForm.description = description;
    localState.createForm.priority = priority;
    localState.createForm.category = category;
    localState.createForm.sending = true;
    localState.createForm.error = null;
    localState.createForm.success = null;

    schedulePaint("content");

    try {
      const created = await createIncidencia({
        subject,
        description,
        priority,
        category,
      });

      localState.createForm = {
        subject: "",
        description: "",
        priority: "medium",
        category: "general",
        sending: false,
        error: null,
        success: "Incidencia creada correctamente.",
      };

      if (created) {
        await loadIncidencias({ silent: true, force: true });
      } else {
        schedulePaint("content");
      }
    } catch (error) {
      localState.createForm.sending = false;
      localState.createForm.error =
        error?.data?.message ||
        error?.message ||
        "No se pudo crear la incidencia.";
      localState.createForm.success = null;

      schedulePaint("content");
    }
  }

  function clearCreateForm() {
    localState.createForm = {
      subject: "",
      description: "",
      priority: "medium",
      category: "general",
      sending: false,
      error: null,
      success: null,
    };

    schedulePaint("content");
  }

  function openTicket(ticketId) {
    if (!ticketId) return;

    if (typeof AppCore.events?.emit === "function") {
      AppCore.events.emit("incidencias:open", { ticketId });
    }

    // Base lista para enchufar detalle real:
    // Router.navigate(`/incidencias/${ticketId}`);
  }

  async function copyTicketCode(code) {
    const value = safeString(code);
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      AppCore?.utils?.log?.("[Incidencias] Ticket copiado:", value);
    } catch {
      AppCore?.utils?.log?.("[Incidencias] No se pudo copiar ticket:", value);
    }
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bindHeaderOnly() {
    const scope = AppCore.cleanup.scope(`${SCOPE}:header`);

    const refreshBtn = document.getElementById("incidencias-refresh-btn");
    const toggleViewBtn = document.getElementById("incidencias-toggle-view-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        await loadIncidencias({ force: true, silent: true });
      });
    }

    if (toggleViewBtn) {
      AppCore.cleanup.on(scope, toggleViewBtn, "click", () => {
        localState.view = localState.view === "table" ? "cards" : "table";
        schedulePaint("header");
      });
    }
  }

  function bindContentOnly() {
    const scope = AppCore.cleanup.scope(`${SCOPE}:content`);

    const searchInput = document.getElementById("incidencias-search");
    const statusFilter = document.getElementById("incidencias-status-filter");
    const priorityFilter = document.getElementById("incidencias-priority-filter");
    const assignedFilter = document.getElementById("incidencias-assigned-filter");
    const mineFilter = document.getElementById("incidencias-mine-filter");
    const sortSelect = document.getElementById("incidencias-sort");

    const createForm = document.getElementById("incidencias-create-form");
    const clearBtn = document.getElementById("incidencias-create-clear-btn");
    const retryBtn = document.getElementById("incidencias-retry-btn");

    if (searchInput) {
      AppCore.cleanup.on(
        scope,
        searchInput,
        "input",
        AppCore.utils.debounce((event) => {
          localState.query = event.target.value.trim();
          schedulePaint("content");
        }, 120)
      );
    }

    if (statusFilter) {
      AppCore.cleanup.on(scope, statusFilter, "change", (event) => {
        localState.status = event.target.value;
        schedulePaint("content");
      });
    }

    if (priorityFilter) {
      AppCore.cleanup.on(scope, priorityFilter, "change", (event) => {
        localState.priority = event.target.value;
        schedulePaint("content");
      });
    }

    if (assignedFilter) {
      AppCore.cleanup.on(scope, assignedFilter, "change", (event) => {
        localState.assigned = event.target.value;
        schedulePaint("content");
      });
    }

    if (mineFilter) {
      AppCore.cleanup.on(scope, mineFilter, "change", (event) => {
        localState.mine = event.target.value;
        schedulePaint("content");
      });
    }

    if (sortSelect) {
      AppCore.cleanup.on(scope, sortSelect, "change", (event) => {
        localState.sort = event.target.value;
        schedulePaint("content");
      });
    }

    if (createForm) {
      AppCore.cleanup.on(scope, createForm, "submit", handleSubmitCreate);
    }

    if (clearBtn) {
      AppCore.cleanup.on(scope, clearBtn, "click", clearCreateForm);
    }

    if (retryBtn) {
      AppCore.cleanup.on(scope, retryBtn, "click", async () => {
        await loadIncidencias({ force: true });
      });
    }

    const ticketOpenButtons = document.querySelectorAll('[data-action="open-ticket"]');
    ticketOpenButtons.forEach((button) => {
      AppCore.cleanup.on(scope, button, "click", (event) => {
        event.stopPropagation();
        openTicket(button.getAttribute("data-ticket-id"));
      });
    });

    const ticketCopyButtons = document.querySelectorAll('[data-action="copy-ticket"]');
    ticketCopyButtons.forEach((button) => {
      AppCore.cleanup.on(scope, button, "click", async (event) => {
        event.stopPropagation();
        await copyTicketCode(button.getAttribute("data-ticket-code"));
      });
    });

    const clickableRows = document.querySelectorAll(".incidencia-row, .incidencia-card-mobile");
    clickableRows.forEach((row) => {
      AppCore.cleanup.on(scope, row, "click", () => {
        const ticketId = row.getAttribute("data-ticket-id");
        openTicket(ticketId);
      });
    });
  }

  function bind() {
    AppCore.cleanup.run(`${SCOPE}:header`);
    AppCore.cleanup.run(`${SCOPE}:content`);

    bindHeaderOnly();
    bindContentOnly();

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;

      hydrateFromCache();

      if (!localState.loaded && !localState.hydrated) {
        render();
      }

      loadIncidencias({
        silent: Boolean(getIncidencias().length),
        force: !isFreshCache(readCache()),
      });
    }
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    render,
    loadIncidencias,
  };
})();
