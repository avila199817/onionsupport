/* =========================================================
   Onion SPA - Clientes Table Template
   Archivo: src/views/clientes/clientes.table.template.js

   FINAL PRODUCTION TEMPLATE · CLIENTES VIEW · SOFT APPLE MODE · 10/10
   CLON 1:1 USUARIOS / INCIDENCIAS · PRO SAAS PANEL

   RESPONSABILIDADES:
   - render del hero/header de clientes
   - render de tabla productiva con paginación real
   - compatibilidad con clientesView.js
   - estado loading visual en "Ver detalle" sin mover tabla
   - estado loading visual en "Nuevo cliente"
   - estado loading visual en refresh / retry / export
   - soporte para payloads backend heterogéneos
   - soporte para envelope backend { ok, count, clientes }
   - lenguaje visual alineado 1:1 con usuarios/incidencias
   - título compacto y responsive
   - fechas siempre en una sola línea
   - botón "Ver detalle" mantiene tamaño fijo durante loading
   - loader centrado dentro del botón sin cambiar layout
   - loading de tabla suave en carga / refresh
   - acciones compatibles con data-clientes-action y data-action
   - avatares fallback con colores intensos pseudo-RNG estables
   - dark/light mode conectado a variables.css + ui.css
   - chips de estado alineados con tokens globales y contraste real
   - versión desktop + cards mobile
   - columna email dedicada
   - columna responsable dedicada
   - columna nivel dedicada
   - actividad mostrando última actualización
   - límite fijo de 5 clientes por hoja
   - orden descendente por actualización / actividad / creación

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

function hashString(value = "") {
  const text = safeText(value, "onion");

  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

function getNamedText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  if (typeof value !== "object") {
    return safeText(value, fallback);
  }

  const obj = safeObject(value);

  return safeText(
    first(
      obj.fullName,
      obj.displayName,
      obj.name,
      obj.nombre,
      obj.username,
      obj.userName,
      obj.email,
      obj.id,
      obj.userId,
      obj.codigo,
      obj.code
    ),
    fallback
  );
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
  if (Array.isArray(obj.records)) return obj.records;

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
    data.records,
    data.payload,
    data.response,
    data.result,

    state.items,
    state.rows,
    state.clientes,
    state.clients,
    state.customers,
    state.data,
    state.results,
    state.records,
    state.payload,
    state.response,
    state.result,

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
  const result = safeObject(first(data.result, state.result));
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
        result.count,
        result.total,
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
   AVATAR PALETTE
========================================================= */

const AVATAR_PALETTE = Object.freeze([
  {
    bg: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
    bgDark: "linear-gradient(135deg, #8b5cf6 0%, #f472b6 100%)",
    ring: "rgba(124,58,237,.36)",
    shadow: "rgba(236,72,153,.26)",
  },
  {
    bg: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)",
    bgDark: "linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)",
    ring: "rgba(37,99,235,.34)",
    shadow: "rgba(6,182,212,.24)",
  },
  {
    bg: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
    bgDark: "linear-gradient(135deg, #fb923c 0%, #f87171 100%)",
    ring: "rgba(249,115,22,.34)",
    shadow: "rgba(239,68,68,.24)",
  },
  {
    bg: "linear-gradient(135deg, #16a34a 0%, #14b8a6 100%)",
    bgDark: "linear-gradient(135deg, #22c55e 0%, #2dd4bf 100%)",
    ring: "rgba(22,163,74,.34)",
    shadow: "rgba(20,184,166,.24)",
  },
  {
    bg: "linear-gradient(135deg, #db2777 0%, #9333ea 100%)",
    bgDark: "linear-gradient(135deg, #ec4899 0%, #a855f7 100%)",
    ring: "rgba(219,39,119,.34)",
    shadow: "rgba(147,51,234,.25)",
  },
  {
    bg: "linear-gradient(135deg, #ca8a04 0%, #ea580c 100%)",
    bgDark: "linear-gradient(135deg, #facc15 0%, #fb923c 100%)",
    ring: "rgba(202,138,4,.34)",
    shadow: "rgba(234,88,12,.25)",
  },
  {
    bg: "linear-gradient(135deg, #0891b2 0%, #4f46e5 100%)",
    bgDark: "linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)",
    ring: "rgba(8,145,178,.34)",
    shadow: "rgba(79,70,229,.25)",
  },
  {
    bg: "linear-gradient(135deg, #e11d48 0%, #f59e0b 100%)",
    bgDark: "linear-gradient(135deg, #fb7185 0%, #fbbf24 100%)",
    ring: "rgba(225,29,72,.34)",
    shadow: "rgba(245,158,11,.25)",
  },
  {
    bg: "linear-gradient(135deg, #0f766e 0%, #84cc16 100%)",
    bgDark: "linear-gradient(135deg, #14b8a6 0%, #a3e635 100%)",
    ring: "rgba(15,118,110,.34)",
    shadow: "rgba(132,204,22,.24)",
  },
  {
    bg: "linear-gradient(135deg, #4338ca 0%, #c026d3 100%)",
    bgDark: "linear-gradient(135deg, #6366f1 0%, #e879f9 100%)",
    ring: "rgba(67,56,202,.34)",
    shadow: "rgba(192,38,211,.25)",
  },
]);

function getAvatarPalette(item = {}) {
  const seed = first(
    getClienteId(item),
    getClienteCode(item),
    getClienteEmail(item),
    getClienteName(item),
    "onion-client"
  );

  const index = hashString(seed) % AVATAR_PALETTE.length;

  return AVATAR_PALETTE[index];
}

function getAvatarStyle(item = {}) {
  const palette = getAvatarPalette(item);

  return [
    `--clientes-avatar-bg:${palette.bg}`,
    `--clientes-avatar-bg-dark:${palette.bgDark}`,
    `--clientes-avatar-ring:${palette.ring}`,
    `--clientes-avatar-shadow:${palette.shadow}`,
  ].join(";");
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
      item._id,
      item.code,
      item.clientCode,
      item.clienteCode,
      item.customerCode,
      item.email,

      item?.raw?.clientId,
      item?.raw?.clienteId,
      item?.raw?.customerId,
      item?.raw?.id,
      item?.raw?._id,
      item?.raw?.code,
      item?.raw?.clientCode,
      item?.raw?.clienteCode,
      item?.raw?.customerCode,
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
      item._id,
      item.code,
      item.email,

      item?.raw?.clientCode,
      item?.raw?.clienteCode,
      item?.raw?.customerCode,
      item?.raw?.clientId,
      item?.raw?.clienteId,
      item?.raw?.customerId,
      item?.raw?.id,
      item?.raw?._id,
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
      item.category,
      item.categoria,

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
      item?.raw?.category,
      item?.raw?.categoria,
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
      item.client?.city,
      item.client?.ciudad,
      item.customer?.city,
      item.customer?.ciudad,

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
      item?.raw?.cliente?.ciudad,
      item?.raw?.client?.city,
      item?.raw?.client?.ciudad,
      item?.raw?.customer?.city,
      item?.raw?.customer?.ciudad
    ),
    "Sin ciudad"
  );
}

function getClienteManager(item = {}) {
  return safeText(
    first(
      item.managerName,
      item.responsableName,
      item.ownerName,
      item.assignedToName,
      item.accountManagerName,

      getNamedText(item.manager),
      getNamedText(item.assignedTo),
      getNamedText(item.owner),
      getNamedText(item.responsable),
      getNamedText(item.accountManager),

      item?.raw?.managerName,
      item?.raw?.responsableName,
      item?.raw?.ownerName,
      item?.raw?.assignedToName,
      item?.raw?.accountManagerName,

      getNamedText(item?.raw?.manager),
      getNamedText(item?.raw?.assignedTo),
      getNamedText(item?.raw?.owner),
      getNamedText(item?.raw?.responsable),
      getNamedText(item?.raw?.accountManager)
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
      item.customerInitials,
      item.initials,
      item?.raw?.clientInitials,
      item?.raw?.clienteInitials,
      item?.raw?.customerInitials,
      item?.raw?.initials,
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
    item.level,
    item.nivel,

    item?.raw?.tier,
    item?.raw?.plan,
    item?.raw?.segment,
    item?.raw?.category,
    item?.raw?.categoria,
    item?.raw?.tipo,
    item?.raw?.customerType,
    item?.raw?.clientType,
    item?.raw?.level,
    item?.raw?.nivel,

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
  if (["enterprise", "empresa_enterprise", "empresa", "company"].includes(key)) {
    return "enterprise";
  }

  if (["pro", "premium"].includes(key)) return "pro";
  if (["starter", "basic", "basico"].includes(key)) return "starter";
  if (["particular", "personal", "standard", "estandar"].includes(key)) {
    return "standard";
  }

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
    item.activityAt,
    item.createdAt,
    item.created_at,

    item?.raw?.updatedAt,
    item?.raw?.updated_at,
    item?.raw?.lastContactAt,
    item?.raw?.last_contact_at,
    item?.raw?.modifiedAt,
    item?.raw?.lastModifiedAt,
    item?.raw?.lastActivityAt,
    item?.raw?.activityAt,
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
      ${
        label
          ? `<span class="clientes-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(label = "Cargando") {
  return `
    <span
      class="clientes-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      data-tooltip="${escapeHtml(label)}"
    >
      <span class="clientes-inline-spinner" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClienteName(item);
  const initials = getClienteInitials(item);
  const avatarUrl = getClienteAvatarUrl(item);
  const avatarStyle = getAvatarStyle(item);

  if (avatarUrl) {
    return `
      <div
        class="clientes-avatar"
        title="${escapeHtml(fullName)}"
        aria-label="${escapeHtml(fullName)}"
        data-tooltip="${escapeHtml(fullName)}"
        style="${escapeHtml(avatarStyle)}"
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
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      style="${escapeHtml(avatarStyle)}"
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
      data-customer-id="${escapeHtml(clienteId)}"
      ${isOpening ? 'disabled aria-busy="true"' : ""}
    >
      ${
        isOpening
          ? renderLoaderOnly("Cargando detalle")
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
    first(
      runtime.openingClienteId,
      runtime.openingClientId,
      runtime.openingCustomerId
    ),
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
        <span class="clientes-email-inline" title="${escapeHtml(email)}">
          ${escapeHtml(email)}
        </span>
      </td>

      <td class="clientes-cell clientes-cell--location">
        <span class="clientes-location-inline">${escapeHtml(city)}</span>
      </td>

      <td class="clientes-cell clientes-cell--manager">
        <span class="clientes-manager-inline" title="${escapeHtml(manager)}">
          ${escapeHtml(manager)}
        </span>
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
    first(
      runtime.openingClienteId,
      runtime.openingClientId,
      runtime.openingCustomerId
    ),
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
              class="clientes-btn clientes-btn--primary clientes-btn--create"
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
    <div class="clientes-refresh-overlay" aria-live="polite" aria-busy="true">
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
        gap:var(--view-section-gap, var(--space-lg, 18px));
        min-inline-size:0;
        color:var(--text, #f5f5f5);
        font-family:var(--font-family, inherit);
      }

      .clientes-hero,
      .clientes-history{
        position:relative;
        overflow:hidden;
        border-radius:var(--view-hero-radius, var(--card-radius-lg, 24px));
        border:1px solid var(--view-hero-border, var(--panel-border, var(--border-default, rgba(255,255,255,.08))));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #262626))));
        box-shadow:var(--view-hero-shadow, var(--panel-shadow, var(--shadow-md, 0 14px 30px rgba(0,0,0,.22))));
      }

      .clientes-hero{
        padding:var(--space-xl, 22px) var(--space-xl, 24px);
      }

      .clientes-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-lg, 18px);
        align-items:start;
      }

      .clientes-hero-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-xs, 10px);
      }

      .clientes-page-title{
        margin:0;
        max-inline-size:100%;
        color:var(--text-strong, #ffffff);
        font-size:clamp(var(--font-3xl, 24px), 2.6vw, var(--font-5xl, 40px));
        line-height:var(--line-tight, .98);
        letter-spacing:var(--view-title-letter, -.05em);
        font-weight:var(--view-title-weight, var(--weight-black, 800));
        white-space:nowrap;
      }

      .clientes-page-subtitle{
        margin:0;
        max-inline-size:860px;
        color:var(--view-subtitle-color, var(--text-muted, rgba(245,245,245,.70)));
        font-size:var(--font-lg, 15px);
        line-height:var(--line-relaxed, 1.58);
      }

      .clientes-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:var(--space-xs, 10px);
        flex-wrap:wrap;
      }

      .clientes-btn,
      .clientes-detail-btn,
      .clientes-pagination-btn{
        position:relative;
        isolation:isolate;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 8px);
        min-inline-size:0;
        border:1px solid transparent;
        font:inherit;
        line-height:1;
        font-weight:var(--weight-bold, 700);
        white-space:nowrap;
        text-align:center;
        text-decoration:none;
        cursor:pointer;
        user-select:none;
        -webkit-tap-highlight-color:transparent;
        transition:
          transform var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-normal, .18s) var(--ease-standard, ease),
          background var(--duration-normal, .18s) var(--ease-standard, ease),
          border-color var(--duration-normal, .18s) var(--ease-standard, ease),
          color var(--duration-normal, .18s) var(--ease-standard, ease),
          opacity var(--duration-fast, .16s) var(--ease-standard, ease),
          filter var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-btn::before,
      .clientes-detail-btn::before,
      .clientes-pagination-btn::before{
        content:"";
        position:absolute;
        inset:0;
        z-index:-1;
        border-radius:inherit;
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--text-strong, #fff), transparent 94%),
            transparent 42%
          );
        opacity:0;
        pointer-events:none;
        transition:opacity var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-btn{
        min-block-size:var(--btn-height, 42px);
        padding-inline:var(--space-md, 16px);
        border-radius:var(--btn-radius, var(--radius-md, 14px));
        border-color:var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        box-shadow:var(--btn-secondary-shadow, var(--shadow-sm, 0 6px 14px rgba(0,0,0,.16)));
      }

      .clientes-btn:hover,
      .clientes-detail-btn:hover,
      .clientes-pagination-btn:hover{
        transform:translateY(var(--ui-hover-lift, -1px));
      }

      .clientes-btn:hover::before,
      .clientes-detail-btn:hover::before,
      .clientes-pagination-btn:hover::before{
        opacity:.64;
      }

      .clientes-btn:active,
      .clientes-detail-btn:active,
      .clientes-pagination-btn:active{
        transform:translateY(0) scale(var(--ui-active-scale, .985));
      }

      .clientes-btn:focus-visible,
      .clientes-detail-btn:focus-visible,
      .clientes-pagination-btn:focus-visible{
        outline:none;
        box-shadow:var(--focus-ring, 0 0 0 4px rgba(124,92,255,.18));
      }

      .clientes-btn:disabled,
      .clientes-btn[aria-disabled="true"],
      .clientes-detail-btn:disabled,
      .clientes-detail-btn[aria-disabled="true"],
      .clientes-pagination-btn:disabled,
      .clientes-pagination-btn[aria-disabled="true"]{
        opacity:.56;
        cursor:not-allowed;
        transform:none;
        box-shadow:none;
        filter:none;
        pointer-events:none;
      }

      .clientes-btn:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        box-shadow:var(--shadow-md, 0 14px 30px rgba(0,0,0,.22));
      }

      .clientes-btn--primary,
      .clientes-btn--create{
        border-color:var(--btn-primary-border, var(--accent-border, rgba(255,255,255,.05)));
        background:var(--btn-primary-bg, var(--gradient-accent, linear-gradient(135deg, #55555d 0%, #3f3f46 55%, #2f2f35 100%)));
        color:var(--btn-primary-text, var(--text-on-accent, #ffffff));
        box-shadow:var(--btn-primary-shadow, 0 12px 28px rgba(0,0,0,.22));
      }

      .clientes-btn--primary:hover,
      .clientes-btn--create:hover{
        color:var(--btn-primary-text, #fff);
        background:var(--btn-primary-bg-hover, var(--btn-primary-bg));
        filter:brightness(1.02);
      }

      .clientes-btn.is-loading,
      .clientes-detail-btn.is-loading{
        cursor:wait;
        opacity:.92;
      }

      .clientes-hero-meta{
        margin-block-start:var(--space-md, 14px);
        display:flex;
        align-items:center;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .clientes-meta-pill{
        min-block-size:calc(30px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--badge-border, var(--border-default, rgba(255,255,255,.07)));
        background:var(--badge-bg, rgba(255,255,255,.048));
        color:var(--badge-text, var(--text-muted, rgba(245,245,245,.70)));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .clientes-stats{
        margin-block-start:var(--space-md, 16px);
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:var(--space-sm, 12px);
      }

      .clientes-stat-card{
        display:grid;
        gap:var(--space-xs, 8px);
        min-block-size:calc(122px * var(--ui-scale, 1));
        padding:var(--space-md, 16px) var(--space-lg, 18px);
        border-radius:var(--card-radius, 20px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-card, var(--card-shadow, 0 16px 36px rgba(0,0,0,.24)));
      }

      .clientes-stat-card--total{
        border-color:var(--accent-border, var(--border-accent, rgba(113,113,122,.30)));
      }

      .clientes-stat-card--active{
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .clientes-stat-card--pending{
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .clientes-stat-card--blocked{
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .clientes-stat-label{
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:var(--letter-wider, .08em);
        text-transform:uppercase;
      }

      .clientes-stat-value{
        color:var(--text-strong, #ffffff);
        font-size:var(--font-5xl, 40px);
        line-height:.92;
        letter-spacing:var(--letter-tight, -.03em);
        font-weight:var(--weight-black, 800);
      }

      .clientes-stat-text{
        color:var(--text-muted, rgba(245,245,245,.70));
        font-size:var(--font-md, 13px);
        line-height:var(--line-normal, 1.42);
      }

      .clientes-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:var(--space-md, 14px);
        align-items:start;
        padding:var(--space-md, 14px) var(--space-lg, 18px) var(--space-sm, 12px);
        border-block-end:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
      }

      .clientes-history-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 2px);
      }

      .clientes-history-title{
        margin:0;
        color:var(--section-title-color, var(--text-strong, #ffffff));
        font-size:var(--section-title-size, var(--font-xl, 16px));
        line-height:var(--line-snug, 1.22);
        font-weight:var(--section-title-weight, var(--weight-bold, 700));
      }

      .clientes-history-subtitle{
        margin:0;
        color:var(--section-subtitle-color, var(--text-dim, rgba(245,245,245,.50)));
        font-size:var(--section-subtitle-size, var(--font-sm, 12px));
        line-height:var(--line-normal, 1.42);
      }

      .clientes-pagination{
        display:flex;
        justify-content:flex-end;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .clientes-pagination-btn{
        min-block-size:calc(38px * var(--ui-scale, 1));
        padding-inline:var(--space-sm, 14px);
        border-radius:var(--radius-md, 13px);
        border-color:var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-sm, 12px);
        font-weight:var(--weight-bold, 700);
      }

      .clientes-pagination-btn:hover{
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
        border-color:var(--border-strong, rgba(255,255,255,.12));
      }

      .clientes-table-wrap{
        position:relative;
        min-block-size:120px;
      }

      .clientes-table-wrap.is-refreshing .clientes-table-shell,
      .clientes-table-wrap.is-refreshing .clientes-mobile-list{
        opacity:.56;
        filter:blur(.7px);
        transition:
          opacity var(--duration-fast, .18s) var(--ease-standard, ease),
          filter var(--duration-fast, .18s) var(--ease-standard, ease);
      }

      .clientes-table-shell{
        inline-size:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:
          opacity var(--duration-fast, .18s) var(--ease-standard, ease),
          filter var(--duration-fast, .18s) var(--ease-standard, ease);
      }

      .clientes-table{
        inline-size:100%;
        min-inline-size:1240px;
        border-collapse:separate;
        border-spacing:0;
        table-layout:fixed;
        background:var(--table-bg, transparent);
      }

      .clientes-table thead th{
        padding:var(--table-cell-padding-y, 12px) var(--table-cell-padding-x, 18px);
        border-block-end:1px solid var(--table-head-border, var(--border-default, rgba(255,255,255,.082)));
        background:var(--data-table-head-bg, var(--table-head-bg, rgba(255,255,255,.020)));
        color:var(--data-table-head-text, var(--text-dim, rgba(245,245,245,.50)));
        text-align:start;
        font-size:var(--data-table-head-font-size, var(--font-xs, 11px));
        font-weight:var(--data-table-head-font-weight, var(--weight-bold, 700));
        letter-spacing:var(--data-table-head-letter, .075em);
        text-transform:uppercase;
        white-space:nowrap;
      }

      .clientes-table tbody td{
        padding:calc(14px * var(--ui-scale, 1)) var(--table-cell-padding-x, 18px);
        border-block-end:1px solid var(--data-table-row-border, var(--table-border, rgba(255,255,255,.052)));
        color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88)));
        vertical-align:middle;
      }

      .clientes-table tbody tr:last-child td{
        border-block-end:none;
      }

      .clientes-row{
        background:transparent;
        transition:
          background var(--duration-fast, .16s) var(--ease-standard, ease),
          box-shadow var(--duration-fast, .16s) var(--ease-standard, ease);
      }

      .clientes-row:hover{
        background:var(--data-table-row-hover, var(--table-row-hover, rgba(255,255,255,.024)));
      }

      .clientes-main{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1))) minmax(0, 1fr);
        gap:var(--space-sm, 12px);
        align-items:center;
        min-inline-size:0;
      }

      .clientes-avatar{
        position:relative;
        inline-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        block-size:var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        flex:0 0 var(--avatar-size-lg, calc(44px * var(--ui-scale, 1)));
        overflow:hidden;
        border-radius:var(--radius-pill, 999px);
        background:var(--clientes-avatar-bg, var(--avatar-bg, linear-gradient(180deg, #52525b 0%, #3f3f46 100%)));
        box-shadow:
          0 10px 22px var(--clientes-avatar-shadow, rgba(0,0,0,.20)),
          0 0 0 3px color-mix(in srgb, var(--clientes-avatar-ring, var(--accent-ring, rgba(113,113,122,.30))) 58%, transparent),
          var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
        transform:translateZ(0);
      }

      .clientes-avatar::after{
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        background:
          radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.08));
        pointer-events:none;
        mix-blend-mode:screen;
      }

      .clientes-avatar img{
        position:relative;
        z-index:1;
        display:block;
        inline-size:100%;
        block-size:100%;
        object-fit:cover;
      }

      .clientes-avatar-fallback{
        position:absolute;
        inset:0;
        z-index:2;
        display:none;
        align-items:center;
        justify-content:center;
        color:var(--avatar-text, #ffffff);
        font-size:var(--font-2xl, 19px);
        font-weight:var(--weight-black, 800);
        letter-spacing:-.035em;
        text-shadow:
          0 1px 2px rgba(0,0,0,.22),
          0 0 16px rgba(255,255,255,.20);
      }

      .clientes-avatar[data-fallback="true"] .clientes-avatar-fallback,
      .clientes-avatar--fallback .clientes-avatar-fallback{
        display:flex;
      }

      .clientes-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .clientes-main-copy{
        min-inline-size:0;
        display:grid;
        gap:var(--space-3xs, 3px);
      }

      .clientes-user-id{
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:var(--font-sm, 12px);
        line-height:var(--line-snug, 1.22);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.055em;
        text-transform:uppercase;
      }

      .clientes-user-subject{
        color:var(--text-strong, #ffffff);
        font-size:var(--font-lg, 15px);
        line-height:1.14;
        font-weight:var(--weight-black, 800);
        letter-spacing:var(--letter-tight, -.03em);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .clientes-user-description{
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:var(--font-md, 13px);
        line-height:1.3;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .clientes-chip{
        min-block-size:var(--chip-height, calc(26px * var(--ui-scale, 1)));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-pill, 999px);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
        box-shadow:var(--shadow-inner, inset 0 1px 0 rgba(255,255,255,.04));
      }

      .clientes-chip--active{
        color:var(--success, #22c55e);
        background:color-mix(in srgb, var(--success-bg, rgba(34,197,94,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-success, rgba(34,197,94,.30));
      }

      .clientes-chip--pending{
        color:var(--warning, #f59e0b);
        background:color-mix(in srgb, var(--warning-bg, rgba(245,158,11,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-warning, rgba(245,158,11,.30));
      }

      .clientes-chip--blocked{
        color:var(--error, #ef4444);
        background:color-mix(in srgb, var(--error-bg, rgba(239,68,68,.10)) 78%, var(--surface-active, transparent));
        border-color:var(--border-error, rgba(239,68,68,.30));
      }

      .clientes-chip--inactive{
        color:var(--text-dim, rgba(245,245,245,.50));
        background:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 12%, transparent);
        border-color:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 22%, transparent);
      }

      .clientes-chip--tier-vip{
        color:var(--warning, #f97316);
        background:color-mix(in srgb, rgba(249,115,22,.14) 82%, var(--surface-active, transparent));
        border-color:rgba(249,115,22,.32);
      }

      .clientes-chip--tier-enterprise{
        color:var(--accent, #a78bfa);
        background:color-mix(in srgb, rgba(167,139,250,.14) 82%, var(--surface-active, transparent));
        border-color:rgba(167,139,250,.32);
      }

      .clientes-chip--tier-pro{
        color:var(--info, #38bdf8);
        background:color-mix(in srgb, rgba(56,189,248,.13) 82%, var(--surface-active, transparent));
        border-color:rgba(56,189,248,.30);
      }

      .clientes-chip--tier-starter{
        color:var(--warning, #facc15);
        background:color-mix(in srgb, rgba(250,204,21,.12) 82%, var(--surface-active, transparent));
        border-color:rgba(250,204,21,.28);
      }

      .clientes-chip--tier-standard{
        color:var(--text-dim, rgba(245,245,245,.50));
        background:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 10%, transparent);
        border-color:color-mix(in srgb, var(--text-dim, rgba(245,245,245,.50)) 18%, transparent);
      }

      .clientes-date-inline,
      .clientes-email-inline,
      .clientes-location-inline,
      .clientes-manager-inline,
      .clientes-activity-inline{
        display:inline-block;
        max-inline-size:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:var(--data-table-cell-text, var(--text-soft, rgba(245,245,245,.88)));
        font-size:var(--font-md, 13px);
        line-height:1.2;
        font-weight:var(--weight-semibold, 600);
        font-variant-numeric:tabular-nums;
      }

      .clientes-cell--email{
        max-inline-size:220px;
      }

      .clientes-cell--location{
        max-inline-size:150px;
      }

      .clientes-cell--manager{
        max-inline-size:170px;
      }

      .clientes-cell--actions{
        inline-size:1%;
        white-space:nowrap;
      }

      .clientes-detail-btn{
        inline-size:calc(104px * var(--ui-scale, 1));
        min-inline-size:calc(104px * var(--ui-scale, 1));
        max-inline-size:calc(104px * var(--ui-scale, 1));
        min-block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-md, 12px);
        border-color:var(--btn-secondary-border, var(--border-default, rgba(255,255,255,.09)));
        background:var(--btn-secondary-bg, rgba(255,255,255,.045));
        color:var(--btn-secondary-text, var(--text, #f5f5f5));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        box-shadow:none;
      }

      .clientes-detail-btn:hover{
        border-color:var(--border-strong, rgba(255,255,255,.12));
        background:var(--btn-secondary-bg-hover, rgba(255,255,255,.062));
      }

      .clientes-detail-btn.is-loading{
        inline-size:calc(104px * var(--ui-scale, 1));
        min-inline-size:calc(104px * var(--ui-scale, 1));
        max-inline-size:calc(104px * var(--ui-scale, 1));
        block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        min-block-size:var(--btn-height-sm, calc(34px * var(--ui-scale, 1)));
        padding-inline:var(--space-sm, 12px);
        border-radius:var(--radius-md, 12px);
        justify-content:center;
      }

      .clientes-loader-only{
        display:inline-flex;
        inline-size:16px;
        block-size:16px;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .clientes-inline-loading{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:var(--space-xs, 7px);
        white-space:nowrap;
      }

      .clientes-inline-loading-text{
        display:inline-block;
      }

      .clientes-inline-spinner{
        inline-size:14px;
        block-size:14px;
        flex:0 0 auto;
        border-radius:var(--radius-pill, 999px);
        border:2px solid var(--loader-ring, rgba(255,255,255,.12));
        border-block-start-color:currentColor;
        animation:clientesSpin .78s linear infinite;
      }

      .clientes-btn:not(.clientes-btn--primary):not(.clientes-btn--create) .clientes-inline-spinner,
      .clientes-detail-btn .clientes-inline-spinner{
        border-color:var(--loader-ring, rgba(255,255,255,.12));
        border-block-start-color:currentColor;
      }

      .clientes-detail-btn.is-loading .clientes-inline-spinner{
        inline-size:15px;
        block-size:15px;
      }

      .clientes-refresh-overlay{
        position:absolute;
        inset:0;
        z-index:3;
        display:grid;
        place-items:center;
        pointer-events:none;
        background:var(--backdrop-bg, rgba(10,10,12,.28));
        backdrop-filter:var(--blur-sm, blur(8px));
        -webkit-backdrop-filter:var(--blur-sm, blur(8px));
      }

      .clientes-refresh-card{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-block-size:var(--btn-height, 42px);
        padding-inline:var(--space-md, 16px);
        border-radius:var(--radius-md, 14px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:var(--popover-bg, var(--surface-elevated-strong, rgba(44,44,48,.94)));
        color:var(--text-soft, rgba(245,245,245,.88));
        font-size:var(--font-md, 13px);
        font-weight:var(--weight-bold, 700);
        box-shadow:var(--shadow-lg, 0 20px 46px rgba(0,0,0,.28));
      }

      .clientes-table-loading{
        padding:var(--space-sm, 12px) var(--space-lg, 18px) var(--space-md, 16px);
        display:grid;
        gap:var(--space-sm, 12px);
      }

      .clientes-table-loading-row{
        display:grid;
        grid-template-columns:var(--avatar-size-lg, 44px) minmax(220px, 1.45fr) 112px 112px 140px 180px 130px 130px 112px;
        gap:var(--space-sm, 12px);
        align-items:center;
      }

      .clientes-table-loading-copy{
        display:grid;
        gap:var(--space-xs, 7px);
      }

      .clientes-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:var(--skeleton-radius, var(--radius-md, 13px));
        background:var(--skeleton-bg, rgba(255,255,255,.050));
      }

      .clientes-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          var(--skeleton-shine, rgba(255,255,255,.095)),
          transparent
        );
        animation:clientesSkeleton 1.2s var(--ease-standard, ease-in-out) infinite;
      }

      .clientes-skeleton--avatar{
        inline-size:var(--avatar-size-lg, 44px);
        block-size:var(--avatar-size-lg, 44px);
        border-radius:var(--radius-pill, 999px);
      }

      .clientes-skeleton--xs{
        inline-size:120px;
        block-size:var(--skeleton-height-sm, 10px);
      }

      .clientes-skeleton--lg{
        inline-size:74%;
        block-size:var(--skeleton-height-md, 14px);
      }

      .clientes-skeleton--md{
        inline-size:56%;
        block-size:12px;
      }

      .clientes-skeleton--pill{
        inline-size:86px;
        block-size:30px;
        border-radius:var(--radius-pill, 999px);
      }

      .clientes-skeleton--date{
        inline-size:124px;
        block-size:12px;
      }

      .clientes-skeleton--email{
        inline-size:160px;
        block-size:12px;
      }

      .clientes-skeleton--btn{
        inline-size:calc(104px * var(--ui-scale, 1));
        block-size:var(--btn-height-sm, 34px);
        border-radius:var(--radius-md, 12px);
      }

      .clientes-empty{
        display:grid;
        justify-items:center;
        gap:var(--space-xs, 10px);
        padding:var(--space-4xl, 44px) var(--space-lg, 20px) var(--space-5xl, 48px);
        text-align:center;
      }

      .clientes-empty-title{
        margin:0;
        color:var(--text-strong, #ffffff);
        font-size:var(--font-2xl, 18px);
        font-weight:var(--weight-bold, 700);
      }

      .clientes-empty-text{
        margin:0;
        max-inline-size:520px;
        color:var(--text-muted, rgba(245,245,245,.70));
        font-size:var(--font-md, 13px);
        line-height:var(--line-relaxed, 1.62);
      }

      .clientes-mobile-list{
        display:none;
        gap:var(--space-sm, 12px);
        padding:var(--space-sm, 12px);
      }

      .clientes-mobile-card{
        display:grid;
        gap:var(--space-sm, 12px);
        padding:var(--space-md, 16px);
        border-radius:var(--card-radius, 18px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.082)));
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 32%)),
          var(--card-bg, var(--surface-elevated, rgba(39,39,42,.88)));
        box-shadow:var(--shadow-xs, 0 5px 16px rgba(0,0,0,.12));
      }

      .clientes-mobile-top{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:var(--space-sm, 12px);
      }

      .clientes-mobile-main{
        display:flex;
        gap:var(--space-sm, 12px);
        min-inline-size:0;
        flex:1 1 auto;
      }

      .clientes-mobile-tier{
        display:flex;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      .clientes-mobile-meta{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:var(--space-xs, 10px);
      }

      .clientes-mobile-meta-card{
        display:grid;
        gap:var(--space-3xs, 4px);
        padding:var(--space-sm, 12px);
        border-radius:var(--radius-md, 14px);
        border:1px solid var(--card-border, var(--border-default, rgba(255,255,255,.07)));
        background:var(--surface-glass, rgba(255,255,255,.035));
      }

      .clientes-mobile-meta-label{
        color:var(--text-dim, rgba(245,245,245,.50));
        font-size:var(--font-xs, 11px);
        font-weight:var(--weight-bold, 700);
        letter-spacing:.05em;
        text-transform:uppercase;
      }

      .clientes-mobile-meta-value{
        color:var(--text-strong, #ffffff);
        font-size:var(--font-md, 13px);
        line-height:1.35;
        font-weight:var(--weight-bold, 700);
        word-break:break-word;
      }

      .clientes-mobile-actions{
        display:flex;
        gap:var(--space-xs, 8px);
        flex-wrap:wrap;
      }

      @keyframes clientesSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes clientesSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="dark"] .clientes-avatar,
      :root:not([data-theme="light"]) .clientes-avatar{
        background:var(--clientes-avatar-bg-dark, var(--clientes-avatar-bg, var(--avatar-bg)));
      }

      [data-theme="light"] .clientes-hero,
      [data-theme="light"] .clientes-history{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--view-hero-bg, var(--panel-bg, var(--card-bg, var(--surface-elevated, #ffffff))));
        box-shadow:
          0 12px 28px rgba(15,23,42,.035),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .clientes-stat-card,
      [data-theme="light"] .clientes-mobile-card{
        background:
          var(--glass-shine, linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,0) 34%)),
          var(--card-bg, var(--surface-elevated, #ffffff));
      }

      [data-theme="light"] .clientes-mobile-meta-card{
        background:var(--surface-glass, rgba(255,255,255,.56));
      }

      [data-theme="light"] .clientes-chip--active{
        color:var(--success-hover, #157a4f);
        background:var(--success-soft, rgba(31,157,104,.12));
        border-color:var(--border-success, rgba(22,163,74,.245));
      }

      [data-theme="light"] .clientes-chip--pending{
        color:var(--warning-hover, #9c6110);
        background:var(--warning-soft, rgba(192,122,22,.12));
        border-color:var(--border-warning, rgba(217,119,6,.245));
      }

      [data-theme="light"] .clientes-chip--blocked{
        color:var(--error-hover, #b42318);
        background:var(--error-soft, rgba(239,68,68,.12));
        border-color:var(--border-error, rgba(220,38,38,.245));
      }

      [data-theme="light"] .clientes-chip--inactive{
        color:var(--text-muted, #64748b);
        background:color-mix(in srgb, var(--text-muted, #64748b) 10%, transparent);
        border-color:color-mix(in srgb, var(--text-muted, #64748b) 18%, transparent);
      }

      [data-theme="light"] .clientes-chip--tier-vip{
        color:#c2410c;
        background:rgba(251,146,60,.12);
        border-color:rgba(251,146,60,.24);
      }

      [data-theme="light"] .clientes-chip--tier-enterprise{
        color:#6d28d9;
        background:rgba(167,139,250,.12);
        border-color:rgba(167,139,250,.24);
      }

      [data-theme="light"] .clientes-chip--tier-pro{
        color:#0369a1;
        background:rgba(56,189,248,.12);
        border-color:rgba(56,189,248,.24);
      }

      [data-theme="light"] .clientes-chip--tier-starter{
        color:#a16207;
        background:rgba(250,204,21,.12);
        border-color:rgba(250,204,21,.24);
      }

      [data-theme="light"] .clientes-chip--tier-standard{
        color:#475569;
        background:rgba(148,163,184,.10);
        border-color:rgba(148,163,184,.20);
      }

      @media (max-width:1240px){
        .clientes-page-title{
          font-size:clamp(var(--font-3xl, 24px), 2.4vw, var(--font-4xl, 32px));
        }

        .clientes-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width:1180px){
        .clientes-hero{
          padding:var(--space-lg, 20px);
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

      @media (max-width:980px){
        .clientes-desktop-table{
          display:none;
        }

        .clientes-mobile-list{
          display:grid;
        }
      }

      @media (max-width:760px){
        .clientes-view-root{
          gap:var(--space-md, 16px);
        }

        .clientes-hero{
          padding:var(--space-lg, 18px) var(--space-md, 16px);
          border-radius:var(--radius-xl, 20px);
        }

        .clientes-history{
          border-radius:var(--radius-xl, 20px);
        }

        .clientes-history-head{
          grid-template-columns:1fr;
          padding:var(--space-md, 14px) var(--space-md, 14px) var(--space-sm, 12px);
        }

        .clientes-pagination{
          justify-content:flex-start;
        }

        .clientes-stats{
          grid-template-columns:1fr;
        }

        .clientes-page-title{
          font-size:clamp(var(--font-3xl, 24px), 8vw, var(--font-4xl, 34px));
          line-height:1;
          white-space:normal;
        }

        .clientes-page-subtitle{
          font-size:var(--font-base, 14px);
        }

        .clientes-hero-actions{
          inline-size:100%;
        }

        .clientes-btn{
          flex:1 1 auto;
        }

        .clientes-mobile-meta{
          grid-template-columns:1fr;
        }

        .clientes-mobile-top{
          display:grid;
          gap:var(--space-sm, 12px);
        }
      }

      @media (prefers-reduced-motion:reduce){
        .clientes-btn,
        .clientes-detail-btn,
        .clientes-pagination-btn,
        .clientes-row,
        .clientes-table-wrap.is-refreshing .clientes-table-shell,
        .clientes-table-wrap.is-refreshing .clientes-mobile-list,
        .clientes-inline-spinner,
        .clientes-skeleton::after{
          transition:none !important;
          animation:none !important;
        }

        .clientes-btn:hover,
        .clientes-detail-btn:hover,
        .clientes-pagination-btn:hover{
          transform:none !important;
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
    first(data.title, "Centro de control de clientes"),
    "Centro de control de clientes"
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
  const exporting = Boolean(state.exporting);

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
            id="clientes-export-btn"
            class="clientes-btn${exporting ? " is-loading" : ""}"
            data-clientes-action="export"
            data-action="export-csv"
            ${loading || refreshing || exporting || !items.length ? 'disabled aria-disabled="true"' : ""}
          >
            ${
              exporting
                ? renderSpinner("Exportando...")
                : '<span class="clientes-btn-text">Exportar CSV</span>'
            }
          </button>

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
            id="clientes-create-btn"
            class="clientes-btn clientes-btn--primary clientes-btn--create${creating ? " is-loading" : ""}"
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

function renderPagination(pagination = {}, state = {}) {
  const runtime = safeObject(state);
  const loading = Boolean(runtime.loading);
  const refreshing = Boolean(runtime.refreshing);

  return `
    <div class="clientes-pagination" aria-label="Paginación de clientes">
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
  `;
}

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

        ${renderPagination(pagination, state)}
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
