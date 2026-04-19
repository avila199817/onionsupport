/* =========================================================
   Onion SPA - Usuarios Model
   Archivo: src/views/usuarios/usuarios.model.js

   FULL PRO 10/10

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store
   - exponer modelo consistente Usuario
   - labels estado / rol
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
  PENDING: "pending",
  BLOCKED: "blocked",
});

export const ROLE = Object.freeze({
  USER: "user",
  ADMIN: "admin",
  SUPPORT: "support",
  MANAGER: "manager",
  SUPERADMIN: "superadmin",
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
    case "enabled":
    case "habilitado":
      return STATUS.ACTIVE;

    case "inactive":
    case "inactivo":
    case "inactiva":
    case "disabled":
    case "deshabilitado":
      return STATUS.INACTIVE;

    case "pending":
    case "pendiente":
    case "invited":
    case "invitado":
      return STATUS.PENDING;

    case "blocked":
    case "bloqueado":
    case "blocked_user":
    case "suspended":
    case "suspendido":
      return STATUS.BLOCKED;

    default:
      return STATUS.ACTIVE;
  }
}

export function normalizeRole(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "admin":
    case "administrator":
    case "administrador":
      return ROLE.ADMIN;

    case "support":
    case "soporte":
    case "agent":
    case "agente":
      return ROLE.SUPPORT;

    case "manager":
    case "gestor":
    case "gerente":
      return ROLE.MANAGER;

    case "superadmin":
    case "super_admin":
    case "root":
      return ROLE.SUPERADMIN;

    case "user":
    case "usuario":
    default:
      return ROLE.USER;
  }
}

export function getStatusLabel(value = "") {
  switch (normalizeStatus(value)) {
    case STATUS.ACTIVE:
      return "Activo";

    case STATUS.INACTIVE:
      return "Inactivo";

    case STATUS.PENDING:
      return "Pendiente";

    case STATUS.BLOCKED:
      return "Bloqueado";

    default:
      return "Activo";
  }
}

export function getRoleLabel(value = "") {
  switch (normalizeRole(value)) {
    case ROLE.USER:
      return "Usuario";

    case ROLE.ADMIN:
      return "Admin";

    case ROLE.SUPPORT:
      return "Soporte";

    case ROLE.MANAGER:
      return "Manager";

    case ROLE.SUPERADMIN:
      return "Superadmin";

    default:
      return "Usuario";
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
  const text = safeText(value, "US");

  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) return "US";

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

export function normalizeUsuarioModel(
  payload = {}
) {
  const item = safeObject(payload);

  const userId = safeText(
    first(
      item.userId,
      item.usuarioId,
      item.clientId,
      item.id,
      item.code
    ),
    ""
  );

  const username = safeText(
    first(
      item.username,
      item.userName,
      item.nick,
      item.alias
    ),
    "Sin username"
  );

  const name = safeText(
    first(
      item.name,
      item.nombre,
      item.fullName,
      item.displayName,
      [
        safeText(item.firstName, ""),
        safeText(item.lastName, ""),
      ].filter(Boolean).join(" ")
    ),
    "Usuario"
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

  const avatar = safeText(
    first(
      item.avatar,
      item.avatarUrl,
      item.photo,
      item.photoUrl,
      item.image,
      item.imageUrl
    ),
    ""
  );

  const notes = safeText(
    first(
      item.notes,
      item.notas,
      item.internalNotes,
      item.description,
      item.descripcion
    ),
    ""
  );

  const status = normalizeStatus(
    first(
      item.status,
      item.estado,
      typeof item.isActive === "boolean"
        ? item.isActive
          ? "active"
          : "inactive"
        : null,
      typeof item.enabled === "boolean"
        ? item.enabled
          ? "active"
          : "inactive"
        : null
    )
  );

  const role = normalizeRole(
    first(
      item.role,
      item.rol,
      item.userRole,
      item.profile
    )
  );

  const createdAt = first(
    item.createdAt,
    item.created_at,
    item.fechaAlta,
    item.fechaCreacion
  );

  const updatedAt = first(
    item.updatedAt,
    item.updated_at,
    item.modifiedAt,
    item.lastUpdate,
    createdAt
  );

  const lastLoginAt = first(
    item.lastLoginAt,
    item.last_login_at,
    item.lastAccessAt,
    item.ultimoAcceso
  );

  const createdAtTs =
    toTimestamp(createdAt);

  const updatedAtTs =
    toTimestamp(updatedAt);

  const lastLoginAtTs =
    toTimestamp(lastLoginAt);

  const initials =
    getInitials(
      name !== "Usuario"
        ? name
        : username
    );

  const avatarTheme =
    getAvatarTheme(
      userId ||
      email ||
      username ||
      name
    );

  const isActive =
    status === STATUS.ACTIVE;

  const isPending =
    status === STATUS.PENDING;

  const isBlocked =
    status === STATUS.BLOCKED;

  const isAdmin =
    role === ROLE.ADMIN ||
    role === ROLE.SUPERADMIN;

  const isSupport =
    role === ROLE.SUPPORT;

  return {
    userId,
    id: userId,

    username,
    name,
    email,
    phone,
    avatar,
    notes,

    status,
    statusLabel:
      getStatusLabel(status),

    role,
    roleLabel:
      getRoleLabel(role),

    createdAt,
    updatedAt,
    lastLoginAt,
    createdAtTs,
    updatedAtTs,
    lastLoginAtTs,

    initials,
    avatarTheme,

    isActive,
    isPending,
    isBlocked,
    isAdmin,
    isSupport,

    raw: item,
  };
}

/* =========================================================
   COLLECTION
========================================================= */

export function unwrapUsuariosPayload(
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

  if (Array.isArray(obj.usuarios)) {
    return obj.usuarios;
  }

  if (Array.isArray(obj.users)) {
    return obj.users;
  }

  if (Array.isArray(obj.data)) {
    return obj.data;
  }

  if (
    obj.data &&
    typeof obj.data === "object"
  ) {
    return unwrapUsuariosPayload(
      obj.data
    );
  }

  return [];
}

export function normalizeUsuariosCollection(
  payload = []
) {
  return unwrapUsuariosPayload(
    payload
  ).map(
    normalizeUsuarioModel
  );
}

/* =========================================================
   SORT
========================================================= */

export function sortUsuariosByUpdatedDesc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      b.updatedAtTs -
      a.updatedAtTs
  );
}

export function sortUsuariosByNameAsc(
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

export function paginateUsuarios(
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

export function computeUsuariosStats(
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

    pending:
      list.filter(
        (x) => x.isPending
      ).length,

    blocked:
      list.filter(
        (x) => x.isBlocked
      ).length,

    admins:
      list.filter(
        (x) => x.isAdmin
      ).length,

    support:
      list.filter(
        (x) => x.isSupport
      ).length,
  };
}

/* =========================================================
   FINDER
========================================================= */

export function findUsuarioById(
  items = [],
  userId = ""
) {
  const id = safeText(
    userId,
    ""
  );

  return (
    safeArray(items).find(
      (item) =>
        safeText(
          item.userId
        ) === id
    ) || null
  );
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  unwrapUsuariosPayload,
  sortUsuariosByUpdatedDesc,
  sortUsuariosByNameAsc,
  paginateUsuarios,
  computeUsuariosStats,
  findUsuarioById,
  getStatusLabel,
  getRoleLabel,
  normalizeStatus,
  normalizeRole,
};
