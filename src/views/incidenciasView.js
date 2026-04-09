/* =========================================================
   Onion SPA - Incidencias View (EXTREME PRO CLIENT DESK)
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

  function getCurrentUser() {
    return AppCore?.state?.user || null;
  }

  function getCurrentUserEmail() {
    const user = getCurrentUser();
    return normalizeText(
      user?.email || user?.correo || user?.mail || user?.username || ""
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

      localStorage.setItem(`${AppCore.config?.storagePrefix || "onion"}:${CACHE_KEY}`, JSON.stringify(payload));
    } catch {}
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
    const priority = normalizePriority(item.priority ?? item.prioridad ?? "medium");

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
    const updatedAt = item.updatedAt ?? item.closedAt ?? item.fechaActualizacion ?? createdAt ?? null;
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
      attachmentsCount: safeNumber(item.attachmentsCount, attachments.length) || 0,

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
     UI TOKENS
  ========================================================= */
  function cardStyle() {
    return `
      border:1px solid rgba(255,255,255,.08);
      background:
        linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.025));
      border-radius:22px;
      box-shadow:0 14px 34px rgba(0,0,0,.16);
    `;
  }

  function glassButtonStyle(primary = false) {
    return `
      padding:12px 16px;
      border-radius:14px;
      border:1px solid ${primary ? "rgba(99,102,241,.45)" : "rgba(255,255,255,.08)"};
      background:${primary ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.04)"};
      color:inherit;
      cursor:pointer;
      font-weight:700;
      transition:all .18s ease;
    `;
  }

  /* =========================================================
     UI PARTS
  ========================================================= */
  function statCard({ label, value, hint, icon }) {
    return `
      <article style="
        display:grid;
        gap:14px;
        padding:18px;
        ${cardStyle()}
      ">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <span style="font-size:13px; opacity:.72;">${escapeHtml(label)}</span>
          <span style="
            width:42px;
            height:42px;
            display:grid;
            place-items:center;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.08);
            background:rgba(255,255,255,.04);
            font-size:18px;
          ">${icon}</span>
        </div>

        <div style="display:grid; gap:4px;">
          <strong style="font-size:30px; line-height:1;">${escapeHtml(value)}</strong>
          <span style="font-size:12px; opacity:.65;">${escapeHtml(hint)}</span>
        </div>
      </article>
    `;
  }

  function renderShell() {
    return `
      <section class="incidencias-view" style="display:grid; gap:24px; padding:24px;">
        <section style="
          display:grid;
          gap:20px;
          padding:24px;
          ${cardStyle()}
        ">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
            <div style="display:grid; gap:10px;">
              <div style="width:220px; height:18px; border-radius:999px; background:rgba(255,255,255,.08);"></div>
              <div style="width:min(760px, 80vw); height:12px; border-radius:999px; background:rgba(255,255,255,.06);"></div>
              <div style="width:min(600px, 70vw); height:12px; border-radius:999px; background:rgba(255,255,255,.04);"></div>
            </div>
            <div style="display:flex; gap:12px;">
              <div style="width:120px; height:44px; border-radius:14px; background:rgba(255,255,255,.08);"></div>
              <div style="width:150px; height:44px; border-radius:14px; background:rgba(255,255,255,.08);"></div>
            </div>
          </div>
        </section>

        <section style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
          gap:16px;
        ">
          ${Array.from({ length: 6 })
            .map(
              () => `
              <article style="
                display:grid;
                gap:14px;
                padding:18px;
                ${cardStyle()}
              ">
                <div style="width:70%; height:12px; border-radius:999px; background:rgba(255,255,255,.08);"></div>
                <div style="width:40%; height:28px; border-radius:999px; background:rgba(255,255,255,.10);"></div>
                <div style="width:75%; height:11px; border-radius:999px; background:rgba(255,255,255,.05);"></div>
              </article>
            `
            )
            .join("")}
        </section>

        <section style="display:grid; grid-template-columns: minmax(300px, 420px) 1fr; gap:20px;" class="incidencias-main-grid">
          <article style="padding:20px; ${cardStyle()}">
            <div style="display:grid; gap:12px;">
              <div style="width:160px; height:14px; border-radius:999px; background:rgba(255,255,255,.08);"></div>
              <div style="height:46px; border-radius:14px; background:rgba(255,255,255,.05);"></div>
              <div style="height:120px; border-radius:16px; background:rgba(255,255,255,.05);"></div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div style="height:46px; border-radius:14px; background:rgba(255,255,255,.05);"></div>
                <div style="height:46px; border-radius:14px; background:rgba(255,255,255,.05);"></div>
              </div>
              <div style="height:46px; width:160px; border-radius:14px; background:rgba(255,255,255,.08);"></div>
            </div>
          </article>

          <article style="padding:20px; ${cardStyle()}">
            <div style="display:grid; gap:12px;">
              <div style="height:52px; border-radius:16px; background:rgba(255,255,255,.05);"></div>
              ${Array.from({ length: 6 })
                .map(
                  () => `
                    <div style="height:70px; border-radius:16px; background:rgba(255,255,255,.04);"></div>
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
      <section style="display:grid; gap:20px;">
        <div style="
          display:grid;
          gap:16px;
          padding:24px;
          ${cardStyle()}
          background:
            radial-gradient(circle at top right, rgba(99,102,241,.20), transparent 32%),
            linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.025));
        ">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap;">
            <div style="display:grid; gap:8px; min-width:0;">
              <h2 style="margin:0; font-size:32px; line-height:1.05;">Centro de Incidencias</h2>
              <p style="margin:0; opacity:.76; max-width:880px;">
                Panel operativo para crear, consultar y gestionar incidencias desde una vista más rápida,
                limpia y pensada para cliente final y equipo soporte.
              </p>

              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;">
                <span style="
                  display:inline-flex;
                  align-items:center;
                  gap:8px;
                  padding:8px 12px;
                  border-radius:999px;
                  border:1px solid rgba(255,255,255,.08);
                  background:rgba(255,255,255,.04);
                  font-size:12px;
                  opacity:.88;
                ">
                  ${localState.refreshing ? "⟳" : "●"} ${
      localState.lastSyncAt ? `Última sync: ${escapeHtml(formatRelativeDate(localState.lastSyncAt))}` : "Sincronizando"
    }
                </span>

                <span style="
                  display:inline-flex;
                  align-items:center;
                  gap:8px;
                  padding:8px 12px;
                  border-radius:999px;
                  border:1px solid rgba(255,255,255,.08);
                  background:rgba(255,255,255,.04);
                  font-size:12px;
                  opacity:.88;
                ">
                  ${escapeHtml(String(localState.remoteCount || kpis.total))} tickets visibles
                </span>
              </div>
            </div>

            <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
              <button
                type="button"
                id="incidencias-toggle-view-btn"
                style="${glassButtonStyle(false)}"
              >
                Vista: ${localState.view === "table" ? "Tabla" : "Cards"}
              </button>

              <button
                type="button"
                id="incidencias-refresh-btn"
                style="${glassButtonStyle(true)}"
              >
                ${localState.refreshing ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>
        </div>

        <div style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));
          gap:16px;
        ">
          ${statCard({
            label: "Total",
            value: kpis.total,
            hint: "Incidencias cargadas",
            icon: "🎫",
          })}
          ${statCard({
            label: "Abiertas",
            value: kpis.open,
            hint: `${localState.stats.active || 0} activas`,
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
          ${statCard({
            label: "Asignadas",
            value: kpis.assigned,
            hint: "Con técnico asociado",
            icon: "🧑‍💻",
          })}
          ${statCard({
            label: "Mías",
            value: kpis.mine,
            hint: "Relacionadas con mi cuenta",
            icon: "🙋",
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
        gap:16px;
        padding:20px;
        ${cardStyle()}
      ">
        <div style="display:grid; gap:6px;">
          <h3 style="margin:0; font-size:20px;">Crear incidencia</h3>
          <p style="margin:0; font-size:13px; opacity:.72;">
            Alta rápida para cliente final. Pensado para reducir fricción y dejar el ticket creado en segundos.
          </p>
        </div>

        <form id="incidencias-create-form" style="display:grid; gap:14px;">
          <div style="display:grid; gap:8px;">
            <label for="incidencias-create-subject" style="font-size:13px; opacity:.8;">Asunto</label>
            <input
              id="incidencias-create-subject"
              name="subject"
              type="text"
              maxlength="160"
              value="${escapeHtml(form.subject)}"
              placeholder="Ej. No puedo acceder al panel"
              style="
                width:100%;
                padding:14px 16px;
                border-radius:14px;
                border:1px solid rgba(255,255,255,.10);
                background:rgba(255,255,255,.02);
                color:inherit;
              "
            >
          </div>

          <div style="display:grid; gap:8px;">
            <label for="incidencias-create-description" style="font-size:13px; opacity:.8;">Descripción</label>
            <textarea
              id="incidencias-create-description"
              name="description"
              rows="6"
              placeholder="Describe el problema con detalle: qué ocurre, desde cuándo y qué intentaste hacer."
              style="
                width:100%;
                padding:14px 16px;
                border-radius:16px;
                border:1px solid rgba(255,255,255,.10);
                background:rgba(255,255,255,.02);
                color:inherit;
                resize:vertical;
                min-height:140px;
              "
            >${escapeHtml(form.description)}</textarea>
          </div>

          <div style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:12px;
          " class="incidencias-create-grid">
            <div style="display:grid; gap:8px;">
              <label for="incidencias-create-priority" style="font-size:13px; opacity:.8;">Prioridad</label>
              <select
                id="incidencias-create-priority"
                name="priority"
                style="
                  width:100%;
                  padding:14px 16px;
                  border-radius:14px;
                  border:1px solid rgba(255,255,255,.10);
                  background:rgba(255,255,255,.02);
                  color:inherit;
                "
              >
                <option value="low"${form.priority === "low" ? " selected" : ""}>Baja</option>
                <option value="medium"${form.priority === "medium" ? " selected" : ""}>Media</option>
                <option value="high"${form.priority === "high" ? " selected" : ""}>Alta</option>
                <option value="urgent"${form.priority === "urgent" ? " selected" : ""}>Urgente</option>
              </select>
            </div>

            <div style="display:grid; gap:8px;">
              <label for="incidencias-create-category" style="font-size:13px; opacity:.8;">Categoría</label>
              <select
                id="incidencias-create-category"
                name="category"
                style="
                  width:100%;
                  padding:14px 16px;
                  border-radius:14px;
                  border:1px solid rgba(255,255,255,.10);
                  background:rgba(255,255,255,.02);
                  color:inherit;
                "
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
                border-radius:14px;
                border:1px solid rgba(239,68,68,.35);
                background:rgba(239,68,68,.10);
                color:#ffb4b4;
                font-size:13px;
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
                border-radius:14px;
                border:1px solid rgba(34,197,94,.30);
                background:rgba(34,197,94,.10);
                color:#b8f2c8;
                font-size:13px;
              ">
                ${escapeHtml(form.success)}
              </div>
            `
              : ""
          }

          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button
              type="submit"
              style="${glassButtonStyle(true)} min-width:170px;"
              ${form.sending ? "disabled" : ""}
            >
              ${form.sending ? "Creando..." : "Crear incidencia"}
            </button>

            <button
              type="button"
              id="incidencias-create-clear-btn"
              style="${glassButtonStyle(false)}"
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
        gap:16px;
        padding:20px;
        ${cardStyle()}
      ">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Gestión y filtros</h3>
          <span style="font-size:13px; opacity:.65;">
            Búsqueda local instantánea sobre la colección cargada
          </span>
        </div>

        <div
          class="incidencias-filters-grid"
          style="
            display:grid;
            grid-template-columns:minmax(220px, 1.6fr) repeat(5, minmax(132px, .7fr));
            gap:12px;
          "
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
              background:rgba(255,255,255,.02);
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
              background:rgba(255,255,255,.02);
              color:inherit;
            "
          >
            <option value="all"${localState.status === "all" ? " selected" : ""}>Estado</option>
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
              background:rgba(255,255,255,.02);
              color:inherit;
            "
          >
            <option value="all"${localState.priority === "all" ? " selected" : ""}>Prioridad</option>
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
              background:rgba(255,255,255,.02);
              color:inherit;
            "
          >
            <option value="all"${localState.assigned === "all" ? " selected" : ""}>Asignación</option>
            <option value="assigned"${localState.assigned === "assigned" ? " selected" : ""}>Asignadas</option>
            <option value="unassigned"${localState.assigned === "unassigned" ? " selected" : ""}>Sin asignar</option>
          </select>

          <select
            id="incidencias-mine-filter"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:rgba(255,255,255,.02);
              color:inherit;
            "
          >
            <option value="all"${localState.mine === "all" ? " selected" : ""}>Relación</option>
            <option value="mine"${localState.mine === "mine" ? " selected" : ""}>Solo mis incidencias</option>
          </select>

          <select
            id="incidencias-sort"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:rgba(255,255,255,.02);
              color:inherit;
            "
          >
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
        gap:12px;
        padding:24px;
        ${cardStyle()}
      ">
        <h3 style="margin:0;">No se pudo cargar el listado</h3>
        <p style="margin:0; color:#ffb4b4;">${escapeHtml(message)}</p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button id="incidencias-retry-btn" type="button" style="${glassButtonStyle(true)}">
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
        gap:12px;
        padding:24px;
        ${cardStyle()}
      ">
        <h3 style="margin:0;">Sin incidencias</h3>
        <p style="margin:0; opacity:.72;">${escapeHtml(message)}</p>
      </section>
    `;
  }

  function renderTable(items) {
    return `
      <section style="
        display:grid;
        gap:16px;
        padding:20px;
        ${cardStyle()}
      ">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Listado</h3>
          <span style="font-size:13px; opacity:.65;">${items.length} resultado(s)</span>
        </div>

        <div style="overflow:auto;">
          <table style="
            width:100%;
            border-collapse:collapse;
            min-width:1120px;
          ">
            <thead>
              <tr style="text-align:left; border-bottom:1px solid rgba(255,255,255,.08);">
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Ticket</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Asunto</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Cliente</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Asignado</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Estado</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Prioridad</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Adj.</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Actualizada</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Acciones</th>
              </tr>
            </thead>

            <tbody>
              ${items
                .map(
                  (item) => `
                    <tr
                      data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                      class="incidencia-row"
                      style="border-bottom:1px solid rgba(255,255,255,.06);"
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
                        <span style="
                          display:inline-flex;
                          align-items:center;
                          justify-content:center;
                          padding:7px 10px;
                          border-radius:999px;
                          font-size:12px;
                          font-weight:700;
                          background:${getStatusTone(item.status)};
                        ">
                          ${escapeHtml(getStatusLabel(item.status))}
                        </span>
                      </td>

                      <td style="padding:14px 10px;">
                        <span style="
                          display:inline-flex;
                          align-items:center;
                          justify-content:center;
                          padding:7px 10px;
                          border-radius:999px;
                          font-size:12px;
                          font-weight:700;
                          background:${getPriorityTone(item.priority)};
                        ">
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

                      <td style="padding:14px 10px;">
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                          <button
                            type="button"
                            data-action="open-ticket"
                            data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                            style="
                              padding:8px 10px;
                              border-radius:12px;
                              border:1px solid rgba(255,255,255,.08);
                              background:rgba(255,255,255,.04);
                              color:inherit;
                              cursor:pointer;
                              font-size:12px;
                              font-weight:700;
                            "
                          >
                            Abrir
                          </button>

                          <button
                            type="button"
                            data-action="copy-ticket"
                            data-ticket-code="${escapeHtml(item.code || item.id || "")}"
                            style="
                              padding:8px 10px;
                              border-radius:12px;
                              border:1px solid rgba(255,255,255,.08);
                              background:rgba(255,255,255,.04);
                              color:inherit;
                              cursor:pointer;
                              font-size:12px;
                              font-weight:700;
                            "
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
      <section class="incidencias-cards-mobile" style="display:grid; gap:14px;">
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
                  ${cardStyle()}
                  cursor:pointer;
                "
              >
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                  <div style="display:grid; gap:4px; min-width:0;">
                    <strong style="font-size:14px;">${escapeHtml(item.code || item.id || "—")}</strong>
                    <span style="font-size:12px; opacity:.65;">${escapeHtml(item.title)}</span>
                  </div>

                  <span style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    min-width:40px;
                    height:40px;
                    padding:0 10px;
                    border-radius:14px;
                    background:rgba(255,255,255,.05);
                    border:1px solid rgba(255,255,255,.08);
                    font-size:12px;
                    font-weight:800;
                  ">
                    ${escapeHtml(String(item.attachmentsCount || 0))}
                  </span>
                </div>

                <div style="display:grid; gap:8px;">
                  <div style="font-size:13px; opacity:.75;">
                    ${escapeHtml(truncate(item.preview || item.description || "Sin descripción", 140))}
                  </div>

                  <div style="display:grid; gap:5px; font-size:13px;">
                    <span><strong>Cliente:</strong> ${escapeHtml(item.client)}</span>
                    <span><strong>Técnico:</strong> ${escapeHtml(item.assignedTo)}</span>
                    <span><strong>Actualizada:</strong> ${escapeHtml(formatRelativeDate(item.updatedAt))}</span>
                  </div>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <span style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    padding:7px 10px;
                    border-radius:999px;
                    font-size:12px;
                    font-weight:700;
                    background:${getStatusTone(item.status)};
                  ">
                    ${escapeHtml(getStatusLabel(item.status))}
                  </span>

                  <span style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    padding:7px 10px;
                    border-radius:999px;
                    font-size:12px;
                    font-weight:700;
                    background:${getPriorityTone(item.priority)};
                  ">
                    ${escapeHtml(getPriorityLabel(item.priority))}
                  </span>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button
                    type="button"
                    data-action="open-ticket"
                    data-ticket-id="${escapeHtml(item.ticketId || item.id || "")}"
                    style="
                      padding:10px 12px;
                      border-radius:12px;
                      border:1px solid rgba(255,255,255,.08);
                      background:rgba(255,255,255,.04);
                      color:inherit;
                      cursor:pointer;
                      font-size:12px;
                      font-weight:700;
                    "
                  >
                    Abrir
                  </button>

                  <button
                    type="button"
                    data-action="copy-ticket"
                    data-ticket-code="${escapeHtml(item.code || item.id || "")}"
                    style="
                      padding:10px 12px;
                      border-radius:12px;
                      border:1px solid rgba(255,255,255,.08);
                      background:rgba(255,255,255,.04);
                      color:inherit;
                      cursor:pointer;
                      font-size:12px;
                      font-weight:700;
                    "
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
          gap:16px;
          padding:20px;
          ${cardStyle()}
        ">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <h3 style="margin:0; font-size:18px;">Listado</h3>
            <span style="font-size:13px; opacity:.65;">Cargando...</span>
          </div>

          <div style="display:grid; gap:12px;">
            ${Array.from({ length: 6 })
              .map(
                () => `
                <div style="
                  height:72px;
                  border-radius:16px;
                  background:rgba(255,255,255,.04);
                  border:1px solid rgba(255,255,255,.05);
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

    return localState.view === "table" ? renderTable(items) : renderCards(items);
  }

  function renderContent() {
    return `
      <section
        class="incidencias-main-grid"
        style="
          display:grid;
          grid-template-columns:minmax(320px, 420px) 1fr;
          gap:20px;
          align-items:start;
        "
      >
        <div style="display:grid; gap:20px;">
          ${renderQuickCreate()}
        </div>

        <div style="display:grid; gap:20px;">
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
      <section class="incidencias-view" style="display:grid; gap:24px; padding:24px;">
        <style>
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

    try {
      const response = await Http.post(ENDPOINTS.create, body);
      return response;
    } catch (error) {
      throw error;
    }
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
