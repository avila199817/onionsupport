/* =========================================================
   Onion SPA - Clientes Model
   Archivo: src/views/clientes/clientes.model.js

   FULL PRO 10/10

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store
   - exponer modelo consistente Cliente
   - labels estado / tier
   - flags computados
   - avatars / initials
   - fechas base
   - collections helpers
   - sorting helpers
   - stats helpers
   - defensive parsing enterprise ready
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 10;

export const STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  LEAD: "lead",
  BLOCKED: "blocked",
});

export const TIER = Object.freeze({
  BASIC: "basic",
  PRO: "pro",
  VIP: "vip",
  ENTERPRISE: "enterprise",
});

/* =========================================================
   SAFE CORE
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
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

/* =========================================================
   HASH
========================================================= */

function hashString(value = "") {
  const str = String(value || "onion");
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

/* =========================================================
   LABELS
========================================================= */

export function normalizeStatus(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "active":
    case "activo":
    case "activa":
      return STATUS.ACTIVE;

    case "inactive":
    case "inactivo":
      return STATUS.INACTIVE;

    case "lead":
    case "prospect":
    case "prospecto":
      return STATUS.LEAD;

    case "blocked":
    case "bloqueado":
      return STATUS.BLOCKED;

    default:
      return STATUS.ACTIVE;
  }
}

export function normalizeTier(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "basic":
      return TIER.BASIC;

    case "pro":
      return TIER.PRO;

    case "vip":
    case "premium":
      return TIER.VIP;

    case "enterprise":
    case "corp":
      return TIER.ENTERPRISE;

    default:
      return TIER.BASIC;
  }
}

export function getStatusLabel(value = "") {
  switch (normalizeStatus(value)) {
    case STATUS.ACTIVE:
      return "Activo";

    case STATUS.INACTIVE:
      return "Inactivo";

    case STATUS.LEAD:
      return "Lead";

    case STATUS.BLOCKED:
      return "Bloqueado";

    default:
      return "Activo";
  }
}

export function getTierLabel(value = "") {
  switch (normalizeTier(value)) {
    case TIER.BASIC:
      return "Basic";

    case TIER.PRO:
      return "Pro";

    case TIER.VIP:
      return "VIP";

    case TIER.ENTERPRISE:
      return "Enterprise";

    default:
      return "Basic";
  }
}

/* =========================================================
   DATES
========================================================= */

export function toDate(value = null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toTimestamp(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

/* =========================================================
   VISUALS
========================================================= */

export function getInitials(value = "") {
  const text = safeText(value, "CL");

  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) return "CL";

  return parts
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

export function getAvatarTheme(seed = "") {
  const themes = [
    "violet",
    "emerald",
    "blue",
    "amber",
    "rose",
    "purple",
    "cyan",
    "orange",
  ];

  return themes[
    hashString(seed) % themes.length
  ];
}

/* =========================================================
   CORE NORMALIZER
========================================================= */

export function normalizeClienteModel(
  payload = {}
) {
  const item = safeObject(payload);

  const clientId = safeText(
    first(
      item.clientId,
      item.id,
      item.code
    ),
    ""
  );

  const name = safeText(
    first(
      item.name,
      item.nombre,
      item.fullName,
      item.company
    ),
    "Cliente"
  );

  const email = safeText(
    first(
      item.email,
      item.mail
    ),
    "Sin email"
  );

  const phone = safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile
    ),
    "Sin teléfono"
  );

  const company = safeText(
    first(
      item.company,
      item.empresa,
      item.businessName
    ),
    name
  );

  const avatar = safeText(
    first(
      item.avatar,
      item.avatarUrl,
      item.logo,
      item.logoUrl
    ),
    ""
  );

  const notes = safeText(
    first(
      item.notes,
      item.notas,
      item.internalNotes
    ),
    ""
  );

  const status = normalizeStatus(
    first(
      item.status,
      item.estado
    )
  );

  const tier = normalizeTier(
    first(
      item.tier,
      item.plan,
      item.segment
    )
  );

  const createdAt = first(
    item.createdAt,
    item.fechaAlta
  );

  const updatedAt = first(
    item.updatedAt,
    item.modifiedAt,
    createdAt
  );

  const createdAtTs =
    toTimestamp(createdAt);

  const updatedAtTs =
    toTimestamp(updatedAt);

  const initials =
    getInitials(name);

  const avatarTheme =
    getAvatarTheme(
      clientId ||
      email ||
      name
    );

  const isActive =
    status === STATUS.ACTIVE;

  const isLead =
    status === STATUS.LEAD;

  const isBlocked =
    status === STATUS.BLOCKED;

  const isEnterprise =
    tier === TIER.ENTERPRISE;

  return {
    clientId,
    id: clientId,

    name,
    email,
    phone,
    company,
    avatar,
    notes,

    status,
    statusLabel:
      getStatusLabel(status),

    tier,
    tierLabel:
      getTierLabel(tier),

    createdAt,
    updatedAt,
    createdAtTs,
    updatedAtTs,

    initials,
    avatarTheme,

    isActive,
    isLead,
    isBlocked,
    isEnterprise,

    raw: item,
  };
}

/* =========================================================
   COLLECTION
========================================================= */

export function unwrapClientesPayload(
  payload = null
) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (Array.isArray(obj.items)) {
    return obj.items;
  }

  if (Array.isArray(obj.clientes)) {
    return obj.clientes;
  }

  if (Array.isArray(obj.clients)) {
    return obj.clients;
  }

  if (Array.isArray(obj.data)) {
    return obj.data;
  }

  if (
    obj.data &&
    typeof obj.data === "object"
  ) {
    return unwrapClientesPayload(
      obj.data
    );
  }

  return [];
}

export function normalizeClientesCollection(
  payload = []
) {
  return unwrapClientesPayload(
    payload
  ).map(
    normalizeClienteModel
  );
}

/* =========================================================
   SORT
========================================================= */

export function sortClientesByUpdatedDesc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      b.updatedAtTs -
      a.updatedAtTs
  );
}

export function sortClientesByNameAsc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeText(a.name)
        .localeCompare(
          safeText(b.name),
          "es"
        )
  );
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateClientes(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list =
    safeArray(items);

  const size = Math.max(
    1,
    safeNumber(
      pageSize,
      DEFAULT_PAGE_SIZE
    )
  );

  const total =
    list.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(total / size)
    );

  const current =
    Math.min(
      Math.max(
        1,
        safeNumber(page, 1)
      ),
      totalPages
    );

  const start =
    (current - 1) * size;

  const end =
    start + size;

  return {
    page: current,
    pageSize: size,
    total,
    totalPages,
    items:
      list.slice(
        start,
        end
      ),
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeClientesStats(
  items = []
) {
  const list =
    safeArray(items);

  return {
    total:
      list.length,

    active:
      list.filter(
        (x) => x.isActive
      ).length,

    leads:
      list.filter(
        (x) => x.isLead
      ).length,

    blocked:
      list.filter(
        (x) => x.isBlocked
      ).length,

    enterprise:
      list.filter(
        (x) =>
          x.isEnterprise
      ).length,
  };
}

/* =========================================================
   FINDER
========================================================= */

export function findClienteById(
  items = [],
  clientId = ""
) {
  const id = safeText(
    clientId,
    ""
  );

  return (
    safeArray(items).find(
      (item) =>
        safeText(
          item.clientId
        ) === id
    ) || null
  );
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  normalizeClienteModel,
  normalizeClientesCollection,
  unwrapClientesPayload,
  sortClientesByUpdatedDesc,
  sortClientesByNameAsc,
  paginateClientes,
  computeClientesStats,
  findClienteById,
  getStatusLabel,
  getTierLabel,
  normalizeStatus,
  normalizeTier,
};
