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

   USO:
   import {
     normalizeUsuarioModel,
     normalizeUsuariosCollection,
     computeUsuariosStats
   } from "./usuarios.model.js";
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 10;

export const STATUS = Object.freeze({
  ACTIVE: "active",
  PENDING: "pending",
  BLOCKED: "blocked",
  DISABLED: "disabled",
});

export const ROLE = Object.freeze({
  ADMIN: "admin",
  STAFF: "staff",
  SUPPORT: "support",
  USER: "user",
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
   IDS / HASH
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
   LABEL MAPS
========================================================= */

export function normalizeStatus(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "active":
    case "activo":
    case "activa":
      return STATUS.ACTIVE;

    case "pending":
    case "pendiente":
      return STATUS.PENDING;

    case "blocked":
    case "bloqueado":
    case "bloqueada":
      return STATUS.BLOCKED;

    case "disabled":
    case "inactive":
    case "inactivo":
    case "deshabilitado":
      return STATUS.DISABLED;

    default:
      return STATUS.ACTIVE;
  }
}

export function normalizeRole(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "admin":
    case "administrator":
      return ROLE.ADMIN;

    case "staff":
    case "empleado":
      return ROLE.STAFF;

    case "support":
    case "soporte":
    case "agent":
      return ROLE.SUPPORT;

    default:
      return ROLE.USER;
  }
}

export function getStatusLabel(value = "") {
  switch (normalizeStatus(value)) {
    case STATUS.ACTIVE:
      return "Activo";

    case STATUS.PENDING:
      return "Pendiente";

    case STATUS.BLOCKED:
      return "Bloqueado";

    case STATUS.DISABLED:
      return "Deshabilitado";

    default:
      return "Activo";
  }
}

export function getRoleLabel(value = "") {
  switch (normalizeRole(value)) {
    case ROLE.ADMIN:
      return "Admin";

    case ROLE.STAFF:
      return "Staff";

    case ROLE.SUPPORT:
      return "Soporte";

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
   INITIALS / AVATAR
========================================================= */

export function getInitials(value = "") {
  const text = safeText(value, "US");

  const parts = text
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "US";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || "US").toUpperCase();
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

  const profile = safeObject(
    first(
      item.profile,
      item.perfil,
      item.user,
      item.usuario
    )
  );

  const company = safeObject(
    first(
      item.company,
      item.empresa,
      item.client,
      item.cliente,
      item.organization
    )
  );

  const userId = safeText(
    first(
      item.userId,
      item.id,
      item.uid
    ),
    ""
  );

  const username = safeText(
    first(
      item.username,
      item.userName,
      item.login,
      item.nick
    ),
    "usuario"
  );

  const name = safeText(
    first(
      profile.name,
      profile.nombre,
      profile.displayName,
      item.name,
      item.nombre,
      item.fullName,
      username
    ),
    "Usuario"
  );

  const email = safeText(
    first(
      profile.email,
      item.email,
      item.mail
    ),
    "Sin email"
  );

  const phone = safeText(
    first(
      profile.phone,
      profile.mobile,
      item.phone,
      item.telefono,
      item.mobile
    ),
    "Sin teléfono"
  );

  const role = normalizeRole(
    first(
      item.role,
      item.rol,
      safeArray(item.roles)[0]
    )
  );

  const status = normalizeStatus(
    first(
      item.status,
      item.estado,
      item.state
    )
  );

  const companyName = safeText(
    first(
      company.name,
      company.nombre,
      item.companyName,
      item.empresaNombre,
      item.company
    ),
    "Sin empresa"
  );

  const avatarUrl = safeText(
    first(
      profile.avatar,
      profile.avatarUrl,
      item.avatar,
      item.avatarUrl,
      item.photo,
      item.image
    ),
    ""
  );

  const createdAt = first(
    item.createdAt,
    item.registeredAt,
    item.fechaCreacion,
    item.date
  );

  const updatedAt = first(
    item.updatedAt,
    item.modifiedAt,
    item.lastUpdate,
    createdAt
  );

  const lastLoginAt = first(
    item.lastLoginAt,
    item.lastLogin,
    item.ultimoLogin,
    item.lastAccessAt
  );

  const initials =
    getInitials(name);

  const avatarTheme =
    getAvatarTheme(
      userId ||
      email ||
      username
    );

  const isActive =
    status === STATUS.ACTIVE;

  const isPending =
    status === STATUS.PENDING;

  const isBlocked =
    status === STATUS.BLOCKED;

  const isDisabled =
    status === STATUS.DISABLED;

  const isAdmin =
    role === ROLE.ADMIN;

  const isStaff =
    role === ROLE.STAFF;

  const isSupport =
    role === ROLE.SUPPORT;

  const createdAtTs =
    toTimestamp(createdAt);

  const updatedAtTs =
    toTimestamp(updatedAt);

  const lastLoginAtTs =
    toTimestamp(lastLoginAt);

  return {
    /* identity */
    userId,
    id: userId,

    /* content */
    username,
    name,
    email,
    phone,

    /* org */
    companyName,

    /* enums */
    role,
    roleLabel:
      getRoleLabel(role),

    status,
    statusLabel:
      getStatusLabel(status),

    /* dates */
    createdAt,
    updatedAt,
    lastLoginAt,

    createdAtTs,
    updatedAtTs,
    lastLoginAtTs,

    /* visuals */
    avatarUrl,
    initials,
    avatarTheme,

    /* flags */
    isActive,
    isPending,
    isBlocked,
    isDisabled,
    isAdmin,
    isStaff,
    isSupport,

    /* raw */
    raw: item,
  };
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

export function unwrapUsuariosPayload(
  payload = null
) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (
    Array.isArray(obj.users)
  ) {
    return obj.users;
  }

  if (
    Array.isArray(obj.usuarios)
  ) {
    return obj.usuarios;
  }

  if (
    Array.isArray(obj.items)
  ) {
    return obj.items;
  }

  if (
    Array.isArray(obj.data)
  ) {
    return obj.data;
  }

  if (
    Array.isArray(obj.results)
  ) {
    return obj.results;
  }

  if (
    obj.data &&
    typeof obj.data ===
      "object"
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
      safeNumber(
        b.updatedAtTs
      ) -
      safeNumber(
        a.updatedAtTs
      )
  );
}

export function sortUsuariosByLastLoginDesc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeNumber(
        b.lastLoginAtTs
      ) -
      safeNumber(
        a.lastLoginAtTs
      )
  );
}

export function sortUsuariosByNameAsc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeText(
        a.name
      ).localeCompare(
        safeText(b.name),
        "es",
        {
          sensitivity:
            "base",
        }
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

  const current = Math.min(
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
    from:
      total === 0
        ? 0
        : start + 1,
    to: Math.min(
      end,
      total
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

    disabled:
      list.filter(
        (x) => x.isDisabled
      ).length,

    admins:
      list.filter(
        (x) => x.isAdmin
      ).length,

    staff:
      list.filter(
        (x) => x.isStaff
      ).length,

    support:
      list.filter(
        (x) => x.isSupport
      ).length,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findUsuarioById(
  items = [],
  userId = ""
) {
  const id = safeText(
    userId,
    ""
  );

  if (!id) return null;

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
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  unwrapUsuariosPayload,
  sortUsuariosByUpdatedDesc,
  sortUsuariosByLastLoginDesc,
  sortUsuariosByNameAsc,
  paginateUsuarios,
  computeUsuariosStats,
  findUsuarioById,
  getStatusLabel,
  getRoleLabel,
  normalizeStatus,
  normalizeRole,
};
