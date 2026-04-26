/* =========================================================
   Onion SPA - Clientes Table Template
   Archivo: src/views/clientes/clientes.table.template.js

   FINAL PRODUCTION TEMPLATE · CLIENTES VIEW · CLON 1:1 USUARIOS

   RESPONSABILIDADES:
   - render del hero/header de clientes
   - render de tabla productiva con paginación real
   - compatibilidad con clientesView.js
   - estado loading visual en "Ver detalle"
   - estado loading visual en "Nuevo cliente"
   - estado loading visual en refresh / retry / export
   - soporte para payloads backend heterogéneos
   - soporte para envelope backend { ok, count, clientes }
   - lenguaje visual alineado 1:1 con usuarios
   - versión desktop + cards mobile
   - columna email dedicada
   - columna responsable dedicada
   - columna nivel dedicada
   - actividad mostrando última actualización
   - límite fijo de 5 clientes por hoja

   HARDENING PRO:
   - no depende de imports externos
   - tolera payload heterogéneo
   - soporta state + props directas
   - paginación defensiva
   - estilos encapsulados
   - responsive robusto
   - acciones compatibles con data-clientes-action y data-action
   - restricción admin no duplicada: la controla la View
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const PAGE_SIZE = 5;

/* =========================================================
   HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function truncate(value = "", max = 96) {
  const text = normalizeWhitespace(value);

  if (!text) return "";

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function formatDate(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatDateTime(value = null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return "Ahora mismo";

  if (absMin < 60) {
    return diffMin > 0 ? `En ${absMin} min` : `Hace ${absMin} min`;
  }

  const diffHours = Math.round(absMin / 60);

  if (diffHours < 24) {
    return diffMin > 0 ? `En ${diffHours} h` : `Hace ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays <= 7) {
    return diffMin > 0
      ? `En ${diffDays} día${diffDays === 1 ? "" : "s"}`
      : `Hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  return formatDateTime(value);
}

function formatLastUpdate(value = null) {
  if (!value) return "Sin actualización";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin actualización";

  const diffHours = Math.abs(Date.now() - date.getTime()) / 3600000;

  if (diffHours <= 72) {
    return formatRelativeDate(value);
  }

  return formatDateTime(value);
}

/* =========================================================
   BACKEND ENVELOPE / RESOLVE
========================================================= */

function unwrapItemsEnvelope(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const obj = safeObject(value);

  if (Array.isArray(obj.clientes)) return obj.clientes;
  if (Array.isArray(obj.clients)) return obj.clients;
  if (Array.isArray(obj.customers)) return obj.customers;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;

  if (obj.data && typeof obj.data === "object") {
    return unwrapItemsEnvelope(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return unwrapItemsEnvelope(obj.payload);
  }

  if (obj.response && typeof obj.response === "object") {
    return unwrapItemsEnvelope(obj.response);
  }

  if (obj.result && typeof obj.result === "object") {
    return unwrapItemsEnvelope(obj.result);
  }

  return [];
}

function getResolvedItems(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  const candidates = [
    data.items,
    data.rows,
    data.clientes,
    data.clients,
    data.customers,
    data.data,
    data.results,
    data.payload,
    data.response,

    state.items,
    state.rows,
    state.clientes,
    state.clients,
    state.customers,
    state.data,
    state.results,
    state.payload,
    state.response,

    input,
  ];

  for (const candidate of candidates) {
    const rows = unwrapItemsEnvelope(candidate);

    if (rows.length) {
      return sortClientesByUpdatedDesc(rows);
    }
  }

  return [];
}

function resolveRemoteCount(input = {}, items = []) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  const payload = safeObject(first(data.payload, state.payload));
  const response = safeObject(first(data.response, state.response));
  const lastResponse = safeObject(first(data.lastResponse, state.lastResponse));
  const stats = safeObject(first(data.stats, state.stats));

  return Math.max(
    safeArray(items).length,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        data.count,
        data.total,

        state.remoteCount,
        state.totalCount,
        state.count,
        state.total,

        stats.total,
        payload.count,
        payload.total,
        response.count,
        response.total,
        lastResponse.count,
        lastResponse.total,

        safeArray(items).length
      ),
      safeArray(items).length
    )
  );
}

function shouldRenderRestricted(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return Boolean(
    data.forbidden === true ||
      data.accessDenied === true ||
      state.forbidden === true ||
      state.accessDenied === true
  );
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getClienteId(item = {}) {
  return safeText(
    first(
      item.clientId,
      item.clienteId,
      item.customerId,
      item.id,
      item.code,
      item.clientCode,
      item.clienteCode,
      item.email,

      item?.raw?.clientId,
      item?.raw?.clienteId,
      item?.raw?.customerId,
      item?.raw?.id,
      item?.raw?.code,
      item?.raw?.clientCode,
      item?.raw?.clienteCode,
      item?.raw?.email
    ),
    ""
  );
}

function getClienteCode(item = {}) {
  return safeText(
    first(
      item.clientCode,
      item.clienteCode,
      item.customerCode,
      item.clientId,
      item.clienteId,
      item.customerId,
      item.id,
      item.code,
      item.email,

      item?.raw?.clientCode,
      item?.raw?.clienteCode,
      item?.raw?.customerCode,
      item?.raw?.clientId,
      item?.raw?.clienteId,
      item?.raw?.customerId,
      item?.raw?.id,
      item?.raw?.code,
      item?.raw?.email
    ),
    "CLI-SIN-ID"
  );
}

function getClienteName(item = {}) {
  return safeText(
    first(
      item.clientName,
      item.clienteName,
      item.customerName,
      item.nombre,
      item.name,
      item.fullName,
      item.displayName,
      item.company,
      item.empresa,
      item.businessName,
      item.razonSocial,

      item?.cliente?.nombre,
      item?.cliente?.name,
      item?.client?.name,
      item?.customer?.name,
      item?.profile?.name,
      item?.profile?.displayName,

      item?.raw?.clientName,
      item?.raw?.clienteName,
      item?.raw?.customerName,
      item?.raw?.nombre,
      item?.raw?.name,
      item?.raw?.fullName,
      item?.raw?.displayName,
      item?.raw?.company,
      item?.raw?.empresa,
      item?.raw?.businessName,
      item?.raw?.razonSocial,
      item?.raw?.cliente?.nombre,
      item?.raw?.cliente?.name,
      item?.raw?.client?.name,
      item?.raw?.customer?.name,
      item?.raw?.profile?.name,
      item?.raw?.profile?.displayName,

      item.email,
      item?.raw?.email
    ),
    "Cliente"
  );
}

function getClienteDescription(item = {}) {
  return safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      item.description,
      item.descripcion,
      item.notes,
      item.tipo,
      item.segment,

      item?.cliente?.phone,
      item?.cliente?.telefono,
      item?.client?.phone,
      item?.customer?.phone,
      item?.profile?.phone,

      item?.raw?.phone,
      item?.raw?.telefono,
      item?.raw?.mobile,
      item?.raw?.description,
      item?.raw?.descripcion,
      item?.raw?.notes,
      item?.raw?.tipo,
      item?.raw?.segment,
      item?.raw?.cliente?.phone,
      item?.raw?.cliente?.telefono,
      item?.raw?.client?.phone,
      item?.raw?.customer?.phone,
      item?.raw?.profile?.phone
    ),
    "Sin teléfono"
  );
}

function getClienteEmail(item = {}) {
  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.customerEmail,
      item.email,
      item.mail,

      item?.cliente?.email,
      item?.client?.email,
      item?.customer?.email,
      item?.profile?.email,
      item?.contact?.email,

      item?.raw?.clientEmail,
      item?.raw?.clienteEmail,
      item?.raw?.customerEmail,
      item?.raw?.email,
      item?.raw?.mail,
      item?.raw?.cliente?.email,
      item?.raw?.client?.email,
      item?.raw?.customer?.email,
      item?.raw?.profile?.email,
      item?.raw?.contact?.email
    ),
    "Sin email"
  );
}

function getClienteLocation(item = {}) {
  return safeText(
    first(
      item.city,
      item.ciudad,
      item.locationCity,
      item.location?.city,
      item.location?.ciudad,
      item.ubicacion?.city,
      item.ubicacion?.ciudad,
      item.address?.city,
      item.address?.ciudad,
      item.direccion?.city,
      item.direccion?.ciudad,
      item.profile?.city,
      item.profile?.ciudad,
      item.cliente?.city,
      item.cliente?.ciudad,

      item?.raw?.city,
      item?.raw?.ciudad,
      item?.raw?.locationCity,
      item?.raw?.location?.city,
      item?.raw?.location?.ciudad,
      item?.raw?.ubicacion?.city,
      item?.raw?.ubicacion?.ciudad,
      item?.raw?.address?.city,
      item?.raw?.address?.ciudad,
      item?.raw?.direccion?.city,
      item?.raw?.direccion?.ciudad,
      item?.raw?.profile?.city,
      item?.raw?.profile?.ciudad,
      item?.raw?.cliente?.city,
      item?.raw?.cliente?.ciudad
    ),
    "Sin ciudad"
  );
}

function getClienteManager(item = {}) {
  return safeText(
    first(
      item.manager?.name,
      item.assignedTo?.name,
      item.owner?.name,
      item.responsable?.name,
      item.accountManager?.name,

      item.manager,
      item.assignedTo,
      item.owner,
      item.responsable,
      item.accountManager,

      item?.raw?.manager?.name,
      item?.raw?.assignedTo?.name,
      item?.raw?.owner?.name,
      item?.raw?.responsable?.name,
      item?.raw?.accountManager?.name,

      item?.raw?.manager,
      item?.raw?.assignedTo,
      item?.raw?.owner,
      item?.raw?.responsable,
      item?.raw?.accountManager
    ),
    "No asignado"
  );
}

function getClienteAvatarUrl(item = {}) {
  return safeText(
    first(
      item.clientAvatar,
      item.clientAvatarUrl,
      item.clienteAvatar,
      item.clienteAvatarUrl,
      item.customerAvatar,
      item.customerAvatarUrl,
      item.avatar,
      item.avatarUrl,
      item.logo,
      item.logoUrl,
      item.image,
      item.imageUrl,

      item?.cliente?.avatar,
      item?.cliente?.avatarUrl,
      item?.client?.avatar,
      item?.client?.avatarUrl,
      item?.customer?.avatar,
      item?.customer?.avatarUrl,
      item?.profile?.avatar,
      item?.profile?.avatarUrl,

      item?.raw?.clientAvatar,
      item?.raw?.clientAvatarUrl,
      item?.raw?.clienteAvatar,
      item?.raw?.clienteAvatarUrl,
      item?.raw?.customerAvatar,
      item?.raw?.customerAvatarUrl,
      item?.raw?.avatar,
      item?.raw?.avatarUrl,
      item?.raw?.logo,
      item?.raw?.logoUrl,
      item?.raw?.image,
      item?.raw?.imageUrl,
      item?.raw?.cliente?.avatar,
      item?.raw?.cliente?.avatarUrl,
      item?.raw?.client?.avatar,
      item?.raw?.client?.avatarUrl,
      item?.raw?.customer?.avatar,
      item?.raw?.customer?.avatarUrl,
      item?.raw?.profile?.avatar,
      item?.raw?.profile?.avatarUrl
    ),
    ""
  );
}

function getClienteInitials(item = {}) {
  const text = normalizeWhitespace(
    first(
      item.clientInitials,
      item.clienteInitials,
      item.initials,
      getClienteName(item),
      getClienteCode(item),
      "CL"
    )
  );

  if (!text) return "CL";

  const parts = text.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "CL";
}

function getStatusValue(item = {}) {
  return first(
    item.status,
    item.estado,
    item.state,
    item.accountStatus,
    item.clientStatus,
    item.customerStatus,

    item?.raw?.status,
    item?.raw?.estado,
    item?.raw?.state,
    item?.raw?.accountStatus,
    item?.raw?.clientStatus,
    item?.raw?.customerStatus,

    typeof item.isActive === "boolean"
      ? item.isActive
        ? "active"
        : "inactive"
      : null,

    typeof item.enabled === "boolean"
      ? item.enabled
        ? "active"
        : "inactive"
      : null,

    typeof item?.raw?.isActive === "boolean"
      ? item.raw.isActive
        ? "active"
        : "inactive"
      : null,

    typeof item?.raw?.enabled === "boolean"
      ? item.raw.enabled
        ? "active"
        : "inactive"
      : null,

    "active"
  );
}

function getTierValue(item = {}) {
  return first(
    item.tier,
    item.plan,
    item.segment,
    item.category,
    item.categoria,
    item.tipo,
    item.customerType,
    item.clientType,

    item?.raw?.tier,
    item?.raw?.plan,
    item?.raw?.segment,
    item?.raw?.category,
    item?.raw?.categoria,
    item?.raw?.tipo,
    item?.raw?.customerType,
    item?.raw?.clientType,

    "standard"
  );
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (["active", "activo", "activa", "enabled", "habilitado"].includes(key)) {
    return "active";
  }

  if (["pending", "pendiente", "invited", "invitado", "invite"].includes(key)) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "bloqueada",
      "suspended",
      "suspendido",
      "suspendida",
      "locked",
    ].includes(key)
  ) {
    return "blocked";
  }

  if (
    [
      "disabled",
      "inactive",
      "inactivo",
      "inactiva",
      "deshabilitado",
      "deshabilitada",
    ].includes(key)
  ) {
    return "inactive";
  }

  return "active";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "active") return "Activo";
  if (key === "pending") return "Pendiente";
  if (key === "blocked") return "Bloqueado";
  if (key === "inactive") return "Inactivo";

  return safeText(value, "Activo");
}

function getTierKey(value = "") {
  const key = normalizeKey(value);

  if (["vip"].includes(key)) return "vip";
  if (["enterprise", "empresa_enterprise"].includes(key)) return "enterprise";
  if (["pro", "premium"].includes(key)) return "pro";
  if (["starter", "basic", "basico", "básico"].includes(key)) return "starter";
  if (["empresa", "company"].includes(key)) return "enterprise";
  if (["particular", "personal"].includes(key)) return "standard";

  return "standard";
}

function getTierLabel(value = "") {
  const key = getTierKey(value);

  if (key === "vip") return "VIP";
  if (key === "enterprise") return "Enterprise";
  if (key === "pro") return "Pro";
  if (key === "starter") return "Starter";

  return safeText(value, "Estándar");
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.created_at,
    item.fechaCreacion,
    item.registeredAt,
    item.created,
    item.date,
    item.updatedAt,

    item?.raw?.createdAt,
    item?.raw?.created_at,
    item?.raw?.fechaCreacion,
    item?.raw?.registeredAt,
    item?.raw?.created,
    item?.raw?.date,
    item?.raw?.updatedAt
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.updated_at,
    item.lastContactAt,
    item.last_contact_at,
    item.modifiedAt,
    item.lastModifiedAt,
    item.lastActivityAt,
    item.createdAt,
    item.created_at,

    item?.raw?.updatedAt,
    item?.raw?.updated_at,
    item?.raw?.lastContactAt,
    item?.raw?.last_contact_at,
    item?.raw?.modifiedAt,
    item?.raw?.lastModifiedAt,
    item?.raw?.lastActivityAt,
    item?.raw?.createdAt,
    item?.raw?.created_at
  );
}

function getSortTimestamp(item = {}) {
  const value = first(getUpdatedAt(item), getCreatedAt(item), 0);
  const date = new Date(value);
  const time = date.getTime();

  return Number.isFinite(time) ? time : 0;
}

function sortClientesByUpdatedDesc(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
}

/* =========================================================
   STATS / PAGINATION
========================================================= */

function isActiveLike(item = {}) {
  return getStatusKey(getStatusValue(item)) === "active";
}

function isPendingLike(item = {}) {
  return getStatusKey(getStatusValue(item)) === "pending";
}

function isBlockedLike(item = {}) {
  return ["blocked", "inactive"].includes(getStatusKey(getStatusValue(item)));
}

function isVipLike(item = {}) {
  return ["vip", "enterprise"].includes(getTierKey(getTierValue(item)));
}

function computeStats(items = []) {
  const rows = safeArray(items);

  return {
    total: rows.length,
    activeCount: rows.filter((item) => isActiveLike(item)).length,
    pendingCount: rows.filter((item) => isPendingLike(item)).length,
    blockedCount: rows.filter((item) => isBlockedLike(item)).length,
    vipCount: rows.filter((item) => isVipLike(item)).length,
  };
}

function getPagination(items = [], input = {}) {
  const allItems = safeArray(items);
  const data = safeObject(input);
  const runtime = safeObject(data.state);

  const pageSize = PAGE_SIZE;

  const reportedTotal = Math.max(
    allItems.length,
    safeNumber(
      first(
        data.totalCount,
        data.remoteCount,
        data.count,
        data.total,
        runtime.totalCount,
        runtime.remoteCount,
        runtime.count,
        runtime.total,
        allItems.length
      ),
      allItems.length
    )
  );

  const totalPagesFromProps = safeNumber(
    first(data.totalPages, runtime.totalPages),
    0
  );

  const totalPages = Math.max(
    1,
    totalPagesFromProps || Math.ceil((reportedTotal || 1) / pageSize)
  );

  const currentPage = Math.min(
    Math.max(
      1,
      safeNumber(first(data.page, runtime.page, runtime.currentPage, 1), 1)
    ),
    totalPages
  );

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = allItems.slice(startIndex, startIndex + pageSize);

  const rangeStart = reportedTotal && pageItems.length ? startIndex + 1 : 0;
  const rangeEnd = reportedTotal
    ? Math.min(startIndex + pageItems.length, reportedTotal)
    : 0;

  return {
    allItems,
    pageItems,
    pageSize,
    currentPage,
    totalPages,
    totalCount: reportedTotal,
    rangeStart,
    rangeEnd,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="clientes-inline-loading">
      <span class="clientes-inline-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function getStableHash(value = "") {
  const source = String(value || "onion");
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getFallbackAvatarTheme(seed = "") {
  const themes = [
    {
      bg: "linear-gradient(135deg, rgba(124,92,255,.22), rgba(88,72,200,.10))",
      border: "rgba(124,92,255,.20)",
      text: "#f3eeff",
    },
    {
      bg: "linear-gradient(135deg, rgba(54,198,144,.22), rgba(35,131,95,.10))",
      border: "rgba(54,198,144,.20)",
      text: "#e7fff4",
    },
    {
      bg: "linear-gradient(135deg, rgba(96,165,250,.22), rgba(37,99,235,.10))",
      border: "rgba(96,165,250,.20)",
      text: "#edf5ff",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,188,66,.22), rgba(217,119,6,.10))",
      border: "rgba(255,188,66,.20)",
      text: "#fff6df",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,107,107,.22), rgba(190,24,93,.10))",
      border: "rgba(255,107,107,.20)",
      text: "#fff0f0",
    },
    {
      bg: "linear-gradient(135deg, rgba(179,136,255,.22), rgba(109,40,217,.10))",
      border: "rgba(179,136,255,.20)",
      text: "#f7efff",
    },
  ];

  return themes[getStableHash(seed) % themes.length];
}

function renderAvatar(item = {}) {
  const fullName = getClienteName(item);
  const initials = getClienteInitials(item);
  const avatarUrl = getClienteAvatarUrl(item);
  const theme = getFallbackAvatarTheme(
    first(getClienteId(item), fullName, getClienteEmail(item), getClienteCode(item))
  );

  if (avatarUrl) {
    return `
      <div
        class="clientes-avatar"
        style="
          --avatar-fallback-bg:${theme.bg};
          --avatar-fallback-border:${theme.border};
          --avatar-fallback-text:${theme.text};
        "
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
        />
        <span class="clientes-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="clientes-avatar clientes-avatar--fallback"
      style="
        --avatar-fallback-bg:${theme.bg};
        --avatar-fallback-border:${theme.border};
        --avatar-fallback-text:${theme.text};
      "
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
    >
      <span class="clientes-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = getStatusValue(item);
  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="clientes-chip clientes-chip--${escapeHtml(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderTierChip(item = {}) {
  const rawTier = getTierValue(item);
  const key = getTierKey(rawTier);
  const label = getTierLabel(rawTier);

  return `
    <span class="clientes-chip clientes-chip--tier-${escapeHtml(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderOpenClienteButton({ clienteId = "", isOpening = false } = {}) {
  return `
    <button
      type="button"
      class="clientes-detail-btn${isOpening ? " is-loading" : ""}"
      data-clientes-action="detail"
      data-action="open-cliente"
      data-cliente-id="${escapeHtml(clienteId)}"
      data-client-id="${escapeHtml(clienteId)}"
      ${isOpening ? 'disabled aria-busy="true"' : ""}
    >
      ${
        isOpening
          ? renderSpinner("Cargando...")
          : '<span class="clientes-btn-text">Ver detalle</span>'
      }
    </button>
  `;
}

function renderClienteRow(item = {}, state = {}) {
  const runtime = safeObject(state);

  const clienteId = getClienteId(item);
  const code = getClienteCode(item);
  const name = getClienteName(item);
  const preview = truncate(getClienteDescription(item), 96);
  const email = getClienteEmail(item);
  const city = getClienteLocation(item);
  const manager = getClienteManager(item);
  const createdAt = formatDate(getCreatedAt(item));
  const updatedAtRaw = getUpdatedAt(item);
  const updatedAt = updatedAtRaw
    ? formatLastUpdate(updatedAtRaw)
    : "Sin actualización";

  const openingClienteId = safeText(
    first(runtime.openingClienteId, runtime.openingClientId),
    ""
  );

  const isOpening = Boolean(openingClienteId && openingClienteId === clienteId);

  return `
    <tr class="clientes-row" data-cliente-id="${escapeHtml(clienteId)}">
      <td class="clientes-cell clientes-cell--main">
        <div class="clientes-main">
          ${renderAvatar(item)}

          <div class="clientes-main-copy">
            <div class="clientes-user-id">${escapeHtml(code)}</div>
            <div class="clientes-user-subject">${escapeHtml(name)}</div>
            <div class="clientes-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>
      </td>

      <td class="clientes-cell clientes-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="clientes-cell clientes-cell--tier">
        ${renderTierChip(item)}
      </td>

      <td class="clientes-cell clientes-cell--date">
        <span class="clientes-date-inline">${escapeHtml(createdAt)}</span>
      </td>

      <td class="clientes-cell clientes-cell--email">
        <span class="clientes-email-inline">${escapeHtml(email)}</span>
      </td>

      <td class="clientes-cell clientes-cell--location">
        <span class="clientes-location-inline">${escapeHtml(city)}</span>
      </td>

      <td class="clientes-cell clientes-cell--manager">
        <span class="clientes-manager-inline">${escapeHtml(manager)}</span>
      </td>

      <td class="clientes-cell clientes-cell--activity">
        <span class="clientes-activity-inline">${escapeHtml(updatedAt)}</span>
      </td>

      <td class="clientes-cell clientes-cell--actions">
        ${renderOpenClienteButton({ clienteId, isOpening })}
      </td>
    </tr>
  `;
}

function renderMobileClienteCard(item = {}, state = {}) {
  const runtime = safeObject(state);

  const clienteId = getClienteId(item);
  const code = getClienteCode(item);
  const name = getClienteName(item);
  const preview = truncate(getClienteDescription(item), 120);
  const email = getClienteEmail(item);
  const city = getClienteLocation(item);
  const manager = getClienteManager(item);
  const createdAt = formatDate(getCreatedAt(item));
  const updatedAtRaw = getUpdatedAt(item);
  const updatedAt = updatedAtRaw
    ? formatLastUpdate(updatedAtRaw)
    : "Sin actualización";

  const openingClienteId = safeText(
    first(runtime.openingClienteId, runtime.openingClientId),
    ""
  );

  const isOpening = Boolean(openingClienteId && openingClienteId === clienteId);

  return `
    <article class="clientes-mobile-card" data-cliente-id="${escapeHtml(clienteId)}">
      <div class="clientes-mobile-top">
        <div class="clientes-mobile-main">
          ${renderAvatar(item)}

          <div class="clientes-main-copy">
            <div class="clientes-user-id">${escapeHtml(code)}</div>
            <div class="clientes-user-subject">${escapeHtml(name)}</div>
            <div class="clientes-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>

        ${renderStatusChip(item)}
      </div>

      <div class="clientes-mobile-tier">
        ${renderTierChip(item)}
      </div>

      <div class="clientes-mobile-meta">
        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Alta</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(createdAt)}</strong>
        </div>

        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Email</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(email)}</strong>
        </div>

        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Ciudad</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(city)}</strong>
        </div>

        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Responsable</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(manager)}</strong>
        </div>

        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Actualización</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(updatedAt)}</strong>
        </div>
      </div>

      <div class="clientes-mobile-actions">
        ${renderOpenClienteButton({ clienteId, isOpening })}
      </div>
    </article>
  `;
}

function renderEmptyContent({ hasError = false, message = "" } = {}) {
  return `
    <div class="clientes-empty">
      <h3 class="clientes-empty-title">
        ${
          hasError
            ? "No se pudieron cargar los clientes"
            : "No hay clientes para mostrar"
        }
      </h3>

      <p class="clientes-empty-text">
        ${
          hasError
            ? escapeHtml(
                safeText(
                  message,
                  "Puedes reintentar la carga desde el botón de actualizar."
                )
              )
            : "Cuando haya clientes registrados aparecerán aquí."
        }
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              id="clientes-retry-btn"
              class="clientes-btn clientes-btn--primary"
              data-clientes-action="retry"
              data-action="retry"
            >
              Reintentar
            </button>
          `
          : `
            <button
              type="button"
              id="clientes-create-empty-btn"
              class="clientes-btn clientes-btn--primary"
              data-clientes-action="create"
              data-action="create-cliente"
            >
              Crear cliente
            </button>
          `
      }
    </div>
  `;
}

function renderAccessDeniedContent() {
  return `
    <div class="clientes-empty clientes-empty--forbidden">
      <h3 class="clientes-empty-title">Acceso restringido</h3>
      <p class="clientes-empty-text">
        La vista de clientes está reservada para administradores.
      </p>
    </div>
  `;
}

function renderTableLoading(rows = PAGE_SIZE) {
  return `
    <div class="clientes-table-loading" aria-hidden="true">
      ${Array.from({ length: rows })
        .map(
          () => `
            <div class="clientes-table-loading-row">
              <div class="clientes-skeleton clientes-skeleton--avatar"></div>
              <div class="clientes-table-loading-copy">
                <div class="clientes-skeleton clientes-skeleton--xs"></div>
                <div class="clientes-skeleton clientes-skeleton--lg"></div>
                <div class="clientes-skeleton clientes-skeleton--md"></div>
              </div>
              <div class="clientes-skeleton clientes-skeleton--pill"></div>
              <div class="clientes-skeleton clientes-skeleton--pill"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--email"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div class="clientes-refresh-overlay" aria-live="polite">
      <div class="clientes-refresh-card">
        ${renderSpinner("Actualizando clientes...")}
      </div>
    </div>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style>
      .clientes-view-root{
        display:grid;
        gap:18px;
      }

      .clientes-hero{
        position:relative;
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.36)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 92%, transparent);
        box-shadow:
          0 10px 30px rgba(15,23,42,.04),
          0 1px 0 rgba(255,255,255,.55) inset;
        padding:22px 24px 22px;
      }

      .clientes-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
      }

      .clientes-hero-copy{
        min-width:0;
        display:grid;
        gap:10px;
      }

      .clientes-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(26px, 2.6vw, 42px);
        line-height:.98;
        letter-spacing:-.05em;
        font-weight:780;
        color:var(--text-strong, #0f172a);
        white-space:nowrap;
      }

      .clientes-page-subtitle{
        margin:0;
        max-width:860px;
        font-size:15px;
        line-height:1.58;
        color:var(--text-dim, #6b7280);
      }

      .clientes-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }

      .clientes-btn{
        min-height:44px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 92%, transparent);
        background:rgba(255,255,255,.72);
        color:var(--text-strong, #111827);
        font-size:13px;
        font-weight:680;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        box-shadow:0 4px 14px rgba(15,23,42,.04);
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          border-color .16s ease,
          background .16s ease,
          opacity .16s ease;
      }

      .clientes-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 8px 18px rgba(15,23,42,.06);
      }

      .clientes-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 86%, white 14%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .clientes-btn.is-loading,
      .clientes-detail-btn.is-loading{
        cursor:wait;
        opacity:.9;
      }

      .clientes-btn:disabled,
      .clientes-detail-btn:disabled{
        pointer-events:none;
        opacity:.72;
      }

      .clientes-hero-meta{
        margin-top:14px;
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .clientes-meta-pill{
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.52);
        color:#7a8392;
        font-size:11px;
        font-weight:760;
        letter-spacing:.045em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .clientes-stats{
        margin-top:16px;
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:12px;
      }

      .clientes-stat-card{
        display:grid;
        gap:8px;
        min-height:122px;
        padding:16px 18px;
        border-radius:20px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
        box-shadow:0 6px 20px rgba(15,23,42,.03);
      }

      .clientes-stat-card--total{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
      }

      .clientes-stat-card--active{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 18%, rgba(15,23,42,.06));
      }

      .clientes-stat-card--pending{
        border-color:color-mix(in srgb, var(--warning-strong, #ffbc42) 18%, rgba(15,23,42,.06));
      }

      .clientes-stat-card--blocked{
        border-color:color-mix(in srgb, var(--danger-strong, #ff6b6b) 18%, rgba(15,23,42,.06));
      }

      .clientes-stat-label{
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7b8494;
      }

      .clientes-stat-value{
        font-size:40px;
        line-height:.92;
        letter-spacing:-.045em;
        font-weight:780;
        color:var(--text-strong, #111827);
      }

      .clientes-stat-text{
        font-size:13px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .clientes-history{
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.6), rgba(255,255,255,.4)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 94%, transparent);
        box-shadow:
          0 10px 30px rgba(15,23,42,.04),
          0 1px 0 rgba(255,255,255,.5) inset;
      }

      .clientes-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:14px;
        align-items:start;
        padding:14px 18px 12px;
        border-bottom:1px solid rgba(15,23,42,.06);
      }

      .clientes-history-copy{
        min-width:0;
        display:grid;
        gap:2px;
      }

      .clientes-history-title{
        margin:0;
        font-size:16px;
        line-height:1.2;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .clientes-history-subtitle{
        margin:0;
        font-size:12px;
        line-height:1.4;
        color:var(--text-dim, #7b8494);
      }

      .clientes-pagination{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .clientes-pagination-btn{
        min-height:38px;
        padding:0 14px;
        border-radius:13px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.66);
        color:#273142;
        font-size:12px;
        font-weight:680;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        transition:
          background .16s ease,
          border-color .16s ease,
          opacity .16s ease;
      }

      .clientes-pagination-btn:hover{
        background:rgba(255,255,255,.9);
        border-color:rgba(15,23,42,.10);
      }

      .clientes-pagination-btn[disabled],
      .clientes-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
        pointer-events:none;
      }

      .clientes-table-wrap{
        position:relative;
        min-height:120px;
      }

      .clientes-table-wrap.is-refreshing .clientes-table-shell,
      .clientes-table-wrap.is-refreshing .clientes-mobile-list{
        opacity:.56;
        filter:blur(.7px);
        transition:opacity .18s ease, filter .18s ease;
      }

      .clientes-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:opacity .18s ease, filter .18s ease;
      }

      .clientes-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1240px;
      }

      .clientes-table thead th{
        padding:12px 18px;
        text-align:left;
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#97a0af;
        background:rgba(248,250,252,.62);
        border-bottom:1px solid rgba(15,23,42,.06);
        white-space:nowrap;
      }

      .clientes-table tbody td{
        padding:14px 18px;
        vertical-align:middle;
        border-bottom:1px solid rgba(15,23,42,.055);
      }

      .clientes-table tbody tr:last-child td{
        border-bottom:none;
      }

      .clientes-row{
        transition:background .16s ease;
      }

      .clientes-row:hover{
        background:rgba(124,92,255,.018);
      }

      .clientes-main{
        display:grid;
        grid-template-columns:44px minmax(0, 1fr);
        gap:12px;
        align-items:center;
        min-width:0;
      }

      .clientes-avatar{
        position:relative;
        width:44px;
        height:44px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 44px;
        background:var(--avatar-fallback-bg, linear-gradient(135deg, rgba(124,92,255,.12), rgba(139,92,246,.24)));
        border:1px solid var(--avatar-fallback-border, rgba(124,92,255,.18));
      }

      .clientes-avatar img{
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .clientes-avatar-fallback{
        position:absolute;
        inset:0;
        display:none;
        align-items:center;
        justify-content:center;
        font-size:18px;
        font-weight:780;
        color:var(--avatar-fallback-text, #fff);
        letter-spacing:-.03em;
      }

      .clientes-avatar[data-fallback="true"] .clientes-avatar-fallback{
        display:flex;
      }

      .clientes-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .clientes-avatar--fallback .clientes-avatar-fallback{
        display:flex;
      }

      .clientes-main-copy{
        min-width:0;
        display:grid;
        gap:3px;
      }

      .clientes-user-id{
        font-size:12px;
        line-height:1.15;
        font-weight:760;
        letter-spacing:.055em;
        color:#667084;
        text-transform:uppercase;
      }

      .clientes-user-subject{
        font-size:15px;
        line-height:1.14;
        font-weight:760;
        letter-spacing:-.025em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .clientes-user-description{
        font-size:13px;
        line-height:1.3;
        color:#8a93a3;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .clientes-chip{
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:11px;
        font-weight:760;
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .clientes-chip--active{
        color:#258a59;
        background:rgba(54,198,144,.10);
        border-color:rgba(54,198,144,.22);
      }

      .clientes-chip--pending{
        color:#b7791f;
        background:rgba(255,188,66,.11);
        border-color:rgba(255,188,66,.22);
      }

      .clientes-chip--blocked{
        color:#b42318;
        background:rgba(255,107,107,.10);
        border-color:rgba(255,107,107,.22);
      }

      .clientes-chip--inactive{
        color:#64748b;
        background:rgba(100,116,139,.10);
        border-color:rgba(100,116,139,.18);
      }

      .clientes-chip--tier-vip{
        color:#c2410c;
        background:rgba(251,146,60,.12);
        border-color:rgba(251,146,60,.22);
      }

      .clientes-chip--tier-enterprise{
        color:#6d28d9;
        background:rgba(167,139,250,.12);
        border-color:rgba(167,139,250,.24);
      }

      .clientes-chip--tier-pro{
        color:#0369a1;
        background:rgba(56,189,248,.12);
        border-color:rgba(56,189,248,.24);
      }

      .clientes-chip--tier-starter{
        color:#a16207;
        background:rgba(250,204,21,.12);
        border-color:rgba(250,204,21,.24);
      }

      .clientes-chip--tier-standard{
        color:#475569;
        background:rgba(148,163,184,.10);
        border-color:rgba(148,163,184,.20);
      }

      .clientes-date-inline,
      .clientes-email-inline,
      .clientes-location-inline,
      .clientes-manager-inline,
      .clientes-activity-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:650;
        font-variant-numeric:tabular-nums;
        color:#344054;
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .clientes-cell--email{
        max-width:220px;
      }

      .clientes-cell--location{
        max-width:150px;
      }

      .clientes-cell--manager{
        max-width:170px;
      }

      .clientes-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .clientes-detail-btn{
        width:auto;
        min-width:0;
        min-height:34px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.68);
        color:#1f2937;
        font-size:13px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color .16s ease,
          background .16s ease,
          transform .16s ease,
          opacity .16s ease;
      }

      .clientes-detail-btn:hover{
        border-color:rgba(15,23,42,.11);
        background:rgba(255,255,255,.9);
        transform:translateY(-1px);
      }

      .clientes-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .clientes-inline-spinner{
        width:13px;
        height:13px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.30);
        border-top-color:currentColor;
        animation:clientesSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .clientes-btn:not(.clientes-btn--primary) .clientes-inline-spinner,
      .clientes-detail-btn .clientes-inline-spinner{
        border-color:rgba(15,23,42,.16);
        border-top-color:currentColor;
      }

      .clientes-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:linear-gradient(180deg, rgba(255,255,255,.24), rgba(255,255,255,.12));
        backdrop-filter:blur(2px);
      }

      .clientes-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:42px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.82);
        color:#344054;
        font-size:13px;
        font-weight:720;
        box-shadow:0 10px 26px rgba(15,23,42,.08);
      }

      .clientes-table-loading{
        padding:12px 18px 16px;
        display:grid;
        gap:12px;
      }

      .clientes-table-loading-row{
        display:grid;
        grid-template-columns:44px minmax(220px, 1.45fr) 112px 112px 140px 180px 130px 130px 112px;
        gap:12px;
        align-items:center;
      }

      .clientes-table-loading-copy{
        display:grid;
        gap:7px;
      }

      .clientes-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:999px;
        background:rgba(148,163,184,.14);
      }

      .clientes-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,.55),
          transparent
        );
        animation:clientesSkeleton 1.2s ease-in-out infinite;
      }

      .clientes-skeleton--avatar{
        width:44px;
        height:44px;
        border-radius:999px;
      }

      .clientes-skeleton--xs{
        width:120px;
        height:10px;
      }

      .clientes-skeleton--lg{
        width:74%;
        height:14px;
      }

      .clientes-skeleton--md{
        width:56%;
        height:12px;
      }

      .clientes-skeleton--pill{
        width:86px;
        height:30px;
      }

      .clientes-skeleton--date{
        width:124px;
        height:12px;
      }

      .clientes-skeleton--email{
        width:160px;
        height:12px;
      }

      .clientes-skeleton--btn{
        width:98px;
        height:34px;
      }

      .clientes-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:44px 20px 48px;
        text-align:center;
      }

      .clientes-empty-title{
        margin:0;
        font-size:18px;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .clientes-empty-text{
        margin:0;
        max-width:520px;
        font-size:13px;
        line-height:1.55;
        color:var(--text-dim, #6b7280);
      }

      .clientes-mobile-list{
        display:none;
        gap:12px;
        padding:12px;
      }

      .clientes-mobile-card{
        display:grid;
        gap:12px;
        padding:16px;
        border-radius:18px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
      }

      .clientes-mobile-top{
        display:flex;
        gap:12px;
        align-items:flex-start;
        justify-content:space-between;
      }

      .clientes-mobile-main{
        display:flex;
        gap:12px;
        min-width:0;
        flex:1;
      }

      .clientes-mobile-tier{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .clientes-mobile-meta{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:10px;
      }

      .clientes-mobile-meta-card{
        display:grid;
        gap:4px;
        padding:12px;
        border-radius:14px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.52);
      }

      .clientes-mobile-meta-label{
        font-size:11px;
        color:#97a0af;
        font-weight:760;
        letter-spacing:.05em;
        text-transform:uppercase;
      }

      .clientes-mobile-meta-value{
        color:var(--text-strong, #111827);
        font-size:13px;
        line-height:1.35;
        font-weight:700;
        word-break:break-word;
      }

      .clientes-mobile-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      @keyframes clientesSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes clientesSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .clientes-hero,
      [data-theme="light"] .clientes-history{
        background:
          linear-gradient(180deg, rgba(255,255,255,.82), rgba(248,250,252,.74)),
          rgba(255,255,255,.82);
        box-shadow:
          0 12px 28px rgba(15,23,42,.035),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .clientes-stat-card,
      [data-theme="light"] .clientes-mobile-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.48)),
          rgba(255,255,255,.56);
      }

      [data-theme="dark"] .clientes-hero,
      [data-theme="dark"] .clientes-history{
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent), transparent 34%),
          linear-gradient(180deg, var(--surface-2, #171922), var(--surface-1, #10121a));
        border-color:var(--border-soft, rgba(255,255,255,.08));
      }

      [data-theme="dark"] .clientes-page-title,
      [data-theme="dark"] .clientes-history-title,
      [data-theme="dark"] .clientes-stat-value,
      [data-theme="dark"] .clientes-user-subject,
      [data-theme="dark"] .clientes-empty-title,
      [data-theme="dark"] .clientes-mobile-meta-value{
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .clientes-page-subtitle,
      [data-theme="dark"] .clientes-history-subtitle,
      [data-theme="dark"] .clientes-stat-text,
      [data-theme="dark"] .clientes-user-description,
      [data-theme="dark"] .clientes-empty-text{
        color:var(--text-dim, #94a3b8);
      }

      [data-theme="dark"] .clientes-btn,
      [data-theme="dark"] .clientes-pagination-btn,
      [data-theme="dark"] .clientes-detail-btn,
      [data-theme="dark"] .clientes-refresh-card{
        background:rgba(255,255,255,.06);
        border-color:rgba(255,255,255,.08);
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .clientes-table thead th{
        background:rgba(255,255,255,.035);
        border-bottom-color:rgba(255,255,255,.07);
      }

      [data-theme="dark"] .clientes-table tbody td{
        border-bottom-color:rgba(255,255,255,.055);
      }

      [data-theme="dark"] .clientes-date-inline,
      [data-theme="dark"] .clientes-email-inline,
      [data-theme="dark"] .clientes-location-inline,
      [data-theme="dark"] .clientes-manager-inline,
      [data-theme="dark"] .clientes-activity-inline{
        color:var(--text-soft, #cbd5e1);
      }

      [data-theme="dark"] .clientes-mobile-card,
      [data-theme="dark"] .clientes-mobile-meta-card{
        background:rgba(255,255,255,.04);
        border-color:rgba(255,255,255,.07);
      }

      @media (max-width: 1240px){
        .clientes-page-title{
          font-size:clamp(24px, 2.4vw, 36px);
        }

        .clientes-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 1180px){
        .clientes-hero{
          padding:20px;
        }

        .clientes-hero-top{
          grid-template-columns:1fr;
        }

        .clientes-hero-actions{
          justify-content:flex-start;
        }

        .clientes-page-title{
          white-space:normal;
        }
      }

      @media (max-width: 980px){
        .clientes-desktop-table{
          display:none;
        }

        .clientes-mobile-list{
          display:grid;
        }
      }

      @media (max-width: 760px){
        .clientes-view-root{
          gap:16px;
        }

        .clientes-hero{
          padding:18px 16px;
          border-radius:20px;
        }

        .clientes-history{
          border-radius:20px;
        }

        .clientes-history-head{
          grid-template-columns:1fr;
          padding:14px 14px 12px;
        }

        .clientes-pagination{
          justify-content:flex-start;
        }

        .clientes-stats{
          grid-template-columns:1fr;
        }

        .clientes-page-title{
          font-size:clamp(24px, 8vw, 34px);
          line-height:1;
          white-space:normal;
        }

        .clientes-page-subtitle{
          font-size:14px;
        }

        .clientes-hero-actions{
          width:100%;
        }

        .clientes-btn{
          flex:1 1 auto;
        }

        .clientes-mobile-meta{
          grid-template-columns:1fr;
        }
      }
    </style>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);
  const stats = computeStats(items);
  const remoteCount = resolveRemoteCount(data, items);

  const updatedAt = first(
    data.lastUpdatedAt,
    data.updatedAt,
    state.lastSyncAt,
    state.lastUpdatedAt,
    state.updatedAt,
    ...items.map((item) => getUpdatedAt(item))
  );

  const title = safeText(
    first(data.title, "Clientes y cuentas"),
    "Clientes y cuentas"
  );

  const subtitle = safeText(
    first(
      data.subtitle,
      "Consulta clientes registrados, revisa su estado, nivel de cuenta, responsable y última actualización desde una vista clara, compacta y alineada con el sistema."
    ),
    ""
  );

  const creating = Boolean(state.creating);
  const refreshing = Boolean(state.refreshing);
  const loading = Boolean(state.loading);

  return `
    ${renderStyles()}

    <section class="clientes-hero">
      <div class="clientes-hero-top">
        <div class="clientes-hero-copy">
          <h1 class="clientes-page-title">${escapeHtml(title)}</h1>
          <p class="clientes-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="clientes-hero-actions">
          <button
            type="button"
            id="clientes-refresh-btn"
            class="clientes-btn${refreshing ? " is-loading" : ""}"
            data-clientes-action="refresh"
            data-action="refresh"
            ${refreshing || loading ? 'disabled aria-busy="true"' : ""}
          >
            ${
              refreshing
                ? renderSpinner("Actualizando...")
                : '<span class="clientes-btn-text">Actualizar</span>'
            }
          </button>

          <button
            type="button"
            id="clientes-export-btn"
            class="clientes-btn"
            data-clientes-action="export"
            data-action="export-csv"
            ${loading || refreshing || !items.length ? "disabled" : ""}
          >
            <span class="clientes-btn-text">Exportar historial</span>
          </button>

          <button
            type="button"
            id="clientes-create-btn"
            class="clientes-btn clientes-btn--primary${creating ? " is-loading" : ""}"
            data-clientes-action="create"
            data-action="create-cliente"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${
              creating
                ? renderSpinner("Abriendo...")
                : '<span class="clientes-btn-text">Nuevo cliente</span>'
            }
          </button>
        </div>
      </div>

      <div class="clientes-hero-meta">
        <span class="clientes-meta-pill">Panel admin</span>

        <span class="clientes-meta-pill">
          ${escapeHtml(`${remoteCount} clientes registrados`)}
        </span>

        <span class="clientes-meta-pill">
          ${
            updatedAt
              ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
              : "Sin sincronización reciente"
          }
        </span>
      </div>

      <div class="clientes-stats">
        <article class="clientes-stat-card clientes-stat-card--total">
          <div class="clientes-stat-label">Clientes visibles</div>
          <div class="clientes-stat-value">${escapeHtml(String(stats.total))}</div>
          <div class="clientes-stat-text">Registros cargados en la colección actual.</div>
        </article>

        <article class="clientes-stat-card clientes-stat-card--active">
          <div class="clientes-stat-label">Activos</div>
          <div class="clientes-stat-value">${escapeHtml(String(stats.activeCount))}</div>
          <div class="clientes-stat-text">Cuentas operativas o habilitadas actualmente.</div>
        </article>

        <article class="clientes-stat-card clientes-stat-card--pending">
          <div class="clientes-stat-label">Pendientes</div>
          <div class="clientes-stat-value">${escapeHtml(String(stats.pendingCount))}</div>
          <div class="clientes-stat-text">Cuentas pendientes de completar o revisar.</div>
        </article>

        <article class="clientes-stat-card clientes-stat-card--blocked">
          <div class="clientes-stat-label">Bloqueados / VIP</div>
          <div class="clientes-stat-value">${escapeHtml(`${stats.blockedCount} / ${stats.vipCount}`)}</div>
          <div class="clientes-stat-text">Cuentas restringidas y clientes prioritarios.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   TABLE
========================================================= */

function renderDesktopTable(items = [], state = {}) {
  return `
    <div class="clientes-desktop-table">
      <div class="clientes-table-shell">
        <table class="clientes-table" role="table" aria-label="Listado de clientes">
          <colgroup>
            <col style="width:29%;">
            <col style="width:10%;">
            <col style="width:10%;">
            <col style="width:11%;">
            <col style="width:16%;">
            <col style="width:10%;">
            <col style="width:11%;">
            <col style="width:12%;">
            <col style="width:7%;">
          </colgroup>

          <thead>
            <tr>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Nivel</th>
              <th>Alta</th>
              <th>Email</th>
              <th>Ciudad</th>
              <th>Responsable</th>
              <th>Actualización</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${safeArray(items).map((item) => renderClienteRow(item, state)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div class="clientes-mobile-list">
      ${safeArray(items).map((item) => renderMobileClienteCard(item, state)).join("")}
    </div>
  `;
}

export function renderTable(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  const pagination = getPagination(items, {
    ...data,
    remoteCount: resolveRemoteCount(data, items),
    pageSize: PAGE_SIZE,
  });

  const loading = Boolean(state.loading);
  const refreshing = Boolean(state.refreshing);
  const hasError = Boolean(safeText(first(state.error, data.error), ""));
  const errorMessage = safeText(first(state.error, data.error), "");

  const showInitialLoading = loading && !pagination.pageItems.length;
  const showRefreshOverlay = refreshing && pagination.pageItems.length;

  return `
    <section class="clientes-history">
      <div class="clientes-history-head">
        <div class="clientes-history-copy">
          <h2 class="clientes-history-title">Historial de clientes</h2>
          <p class="clientes-history-subtitle">
            ${
              showInitialLoading
                ? "Cargando clientes..."
                : escapeHtml(
                    `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · página ${pagination.currentPage} de ${pagination.totalPages}`
                  )
            }
          </p>
        </div>

        <div class="clientes-pagination">
          <button
            type="button"
            class="clientes-pagination-btn"
            data-clientes-action="prev-page"
            data-action="prev-page"
            data-page="${escapeHtml(String(Math.max(1, pagination.currentPage - 1)))}"
            ${!pagination.hasPrev || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            Anterior
          </button>

          <button
            type="button"
            class="clientes-pagination-btn"
            data-clientes-action="next-page"
            data-action="next-page"
            data-page="${escapeHtml(String(Math.min(pagination.totalPages, pagination.currentPage + 1)))}"
            ${!pagination.hasNext || loading || refreshing ? 'disabled aria-disabled="true"' : ""}
          >
            Siguiente
          </button>
        </div>
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(Math.max(3, pagination.pageSize || PAGE_SIZE))
          : `
            <div class="clientes-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${showRefreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `
                    ${renderDesktopTable(pagination.pageItems, state)}
                    ${renderMobileCards(pagination.pageItems, state)}
                  `
                  : renderEmptyContent({ hasError, message: errorMessage })
              }
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   BACKWARD COMPAT EXPORTS
========================================================= */

export function renderLoadingState(rows = PAGE_SIZE) {
  return `
    ${renderStyles()}

    <section class="clientes-history">
      <div class="clientes-history-head">
        <div class="clientes-history-copy">
          <h2 class="clientes-history-title">Historial de clientes</h2>
          <p class="clientes-history-subtitle">Cargando clientes...</p>
        </div>
      </div>

      ${renderTableLoading(Math.max(3, safeNumber(rows, PAGE_SIZE)))}
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la colección.") {
  return `
    ${renderStyles()}

    <section class="clientes-history">
      ${renderEmptyContent({
        hasError: true,
        message: safeText(message, "Error desconocido al cargar la vista."),
      })}
    </section>
  `;
}

export function renderEmptyState(options = {}) {
  return `
    ${renderStyles()}

    <section class="clientes-history">
      ${renderEmptyContent({
        hasError: Boolean(options?.hasError),
        message: safeText(options?.message, ""),
      })}
    </section>
  `;
}

export function renderEmptyClientesState() {
  return renderEmptyState({
    hasError: false,
  });
}

export function renderAccessDeniedState() {
  return `
    ${renderStyles()}

    <section class="clientes-history">
      ${renderAccessDeniedContent()}
    </section>
  `;
}

export function renderCards(input = {}) {
  return renderTable(input);
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderClientesTableTemplate(input = {}) {
  const data = safeObject(input);

  if (shouldRenderRestricted(data)) {
    return `
      <section class="clientes-view-root">
        ${renderAccessDeniedState()}
      </section>
    `;
  }

  return `
    <section class="clientes-view-root">
      ${renderHeader(data)}
      ${renderTable(data)}
    </section>
  `;
}

export default renderClientesTableTemplate;
