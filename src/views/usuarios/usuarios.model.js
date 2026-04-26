/* =========================================================
   Onion SPA - Usuarios Model
   Archivo: src/views/usuarios/usuarios.model.js

   FULL PRO 10/10 · ADMIN USERS MODEL · CLON INCIDENCIAS

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store
   - exponer modelo consistente Usuario
   - soportar envelope backend { ok, count, users }
   - soportar users / usuarios / items / rows / data / results
   - labels estado / rol
   - flags computados
   - avatars / initials
   - ciudad / contacto / fechas base
   - collections helpers
   - sorting helpers
   - stats helpers
   - finder robusto por userId / id / username / email
   - paginación defensiva compatible con UsuariosView
   - defensive parsing enterprise ready

   HARDENING PRO:
   - DEFAULT_PAGE_SIZE fijo a 5
   - preserve raw
   - tolera payloads nested usuario/profile/raw
   - no rompe con nulls
   - no fuerza rol visible en tabla, pero mantiene rol para guards/admin
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 5;

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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;

  return false;
}

function first(...values) {
  for (const value of values) {
    if (isEmptyValue(value)) continue;
    return value;
  }

  return null;
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
    .trim();
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
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
  const key = normalizeKey(value);

  if (
    [
      "active",
      "activo",
      "activa",
      "enabled",
      "habilitado",
      "habilitada",
      "ok",
      "valid",
    ].includes(key)
  ) {
    return STATUS.ACTIVE;
  }

  if (
    [
      "inactive",
      "inactivo",
      "inactiva",
      "disabled",
      "deshabilitado",
      "deshabilitada",
      "off",
    ].includes(key)
  ) {
    return STATUS.INACTIVE;
  }

  if (
    [
      "pending",
      "pendiente",
      "invited",
      "invitado",
      "invitada",
      "invite",
      "waiting",
    ].includes(key)
  ) {
    return STATUS.PENDING;
  }

  if (
    [
      "blocked",
      "bloqueado",
      "bloqueada",
      "blocked_user",
      "suspended",
      "suspendido",
      "suspendida",
      "locked",
      "ban",
      "banned",
    ].includes(key)
  ) {
    return STATUS.BLOCKED;
  }

  return STATUS.ACTIVE;
}

export function normalizeRole(value = "") {
  const key = normalizeKey(value);

  if (
    [
      "admin",
      "administrator",
      "administrador",
    ].includes(key)
  ) {
    return ROLE.ADMIN;
  }

  if (
    [
      "support",
      "soporte",
      "agent",
      "agente",
      "helpdesk",
      "operator",
      "operador",
    ].includes(key)
  ) {
    return ROLE.SUPPORT;
  }

  if (
    [
      "manager",
      "gestor",
      "gerente",
      "lead",
      "owner",
    ].includes(key)
  ) {
    return ROLE.MANAGER;
  }

  if (
    [
      "superadmin",
      "super_admin",
      "root",
      "super_administrador",
    ].includes(key)
  ) {
    return ROLE.SUPERADMIN;
  }

  return ROLE.USER;
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
  const text = normalizeWhitespace(value || "US");

  if (!text) return "US";

  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) return "US";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "US";
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

  return themes[hashString(seed) % themes.length];
}

/* =========================================================
   FIELD PICKERS
========================================================= */

function getNestedSources(item = {}) {
  const source = safeObject(item);

  return {
    item: source,
    raw: safeObject(source.raw),
    usuario: safeObject(first(source.usuario, source.raw?.usuario)),
    profile: safeObject(first(source.profile, source.raw?.profile)),
    contact: safeObject(first(source.contact, source.raw?.contact)),
    location: safeObject(first(source.location, source.raw?.location)),
    ubicacion: safeObject(first(source.ubicacion, source.raw?.ubicacion)),
    address: safeObject(first(source.address, source.raw?.address)),
    direccion: safeObject(first(source.direccion, source.raw?.direccion)),
  };
}

function pickUserId(item = {}) {
  const s = getNestedSources(item);

  return safeText(
    first(
      s.item.userId,
      s.item.usuarioId,
      s.item.id,
      s.item.code,
      s.item.username,
      s.item.userName,
      s.item.email,

      s.usuario.userId,
      s.usuario.usuarioId,
      s.usuario.id,
      s.usuario.username,
      s.usuario.userName,
      s.usuario.email,

      s.profile.userId,
      s.profile.usuarioId,
      s.profile.id,
      s.profile.username,
      s.profile.userName,
      s.profile.email,

      s.raw.userId,
      s.raw.usuarioId,
      s.raw.id,
      s.raw.code,
      s.raw.username,
      s.raw.userName,
      s.raw.email
    ),
    ""
  );
}

function pickUsername(item = {}) {
  const s = getNestedSources(item);

  return safeText(
    first(
      s.item.username,
      s.item.userName,
      s.item.nick,
      s.item.alias,

      s.usuario.username,
      s.usuario.userName,
      s.usuario.nick,
      s.usuario.alias,

      s.profile.username,
      s.profile.userName,
      s.profile.nick,
      s.profile.alias,

      s.raw.username,
      s.raw.userName,
      s.raw.nick,
      s.raw.alias,

      pickUserId(item),
      pickEmail(item)
    ),
    "Sin username"
  );
}

function pickName(item = {}) {
  const s = getNestedSources(item);

  const composedName = [
    safeText(first(s.item.firstName, s.usuario.firstName, s.profile.firstName, s.raw.firstName), ""),
    safeText(first(s.item.lastName, s.usuario.lastName, s.profile.lastName, s.raw.lastName), ""),
  ]
    .filter(Boolean)
    .join(" ");

  return safeText(
    first(
      s.item.fullName,
      s.item.displayName,
      s.item.name,
      s.item.nombre,

      s.usuario.fullName,
      s.usuario.displayName,
      s.usuario.name,
      s.usuario.nombre,

      s.profile.fullName,
      s.profile.displayName,
      s.profile.name,
      s.profile.nombre,

      s.raw.fullName,
      s.raw.displayName,
      s.raw.name,
      s.raw.nombre,

      composedName,
      pickUsername(item),
      pickEmail(item)
    ),
    "Usuario"
  );
}

function pickEmail(item = {}) {
  const s = getNestedSources(item);

  return safeText(
    first(
      s.item.email,
      s.item.mail,
      s.item.userEmail,

      s.usuario.email,
      s.usuario.mail,
      s.usuario.userEmail,

      s.profile.email,
      s.profile.mail,
      s.profile.userEmail,

      s.contact.email,
      s.contact.mail,

      s.raw.email,
      s.raw.mail,
      s.raw.userEmail
    ),
    "Sin email"
  );
}

function pickPhone(item = {}) {
  const s = getNestedSources(item);

  return safeText(
    first(
      s.item.phone,
      s.item.telefono,
      s.item.mobile,
      s.item.phoneNumber,

      s.usuario.phone,
      s.usuario.telefono,
      s.usuario.mobile,
      s.usuario.phoneNumber,

      s.profile.phone,
      s.profile.telefono,
      s.profile.mobile,
      s.profile.phoneNumber,

      s.contact.phone,
      s.contact.telefono,
      s.contact.mobile,
      s.contact.phoneNumber,

      s.raw.phone,
      s.raw.telefono,
      s.raw.mobile,
      s.raw.phoneNumber
    ),
    "Sin teléfono"
  );
}

function pickAvatar(item = {}) {
  const s = getNestedSources(item);

  return safeText(
    first(
      s.item.avatar,
      s.item.avatarUrl,
      s.item.userAvatar,
      s.item.userAvatarUrl,
      s.item.photo,
      s.item.photoUrl,
      s.item.image,
      s.item.imageUrl,

      s.usuario.avatar,
      s.usuario.avatarUrl,
      s.usuario.photo,
      s.usuario.photoUrl,
      s.usuario.image,
      s.usuario.imageUrl,

      s.profile.avatar,
      s.profile.avatarUrl,
      s.profile.photo,
      s.profile.photoUrl,
      s.profile.image,
      s.profile.imageUrl,

      s.raw.avatar,
      s.raw.avatarUrl,
      s.raw.userAvatar,
      s.raw.userAvatarUrl,
      s.raw.photo,
      s.raw.photoUrl,
      s.raw.image,
      s.raw.imageUrl
    ),
    ""
  );
}

function pickCity(item = {}) {
  const s = getNestedSources(item);

  return safeText(
    first(
      s.item.city,
      s.item.ciudad,
      s.item.locationCity,

      s.usuario.city,
      s.usuario.ciudad,
      s.usuario.locationCity,

      s.profile.city,
      s.profile.ciudad,
      s.profile.locationCity,

      s.location.city,
      s.location.ciudad,
      s.ubicacion.city,
      s.ubicacion.ciudad,
      s.address.city,
      s.address.ciudad,
      s.direccion.city,
      s.direccion.ciudad,

      s.raw.city,
      s.raw.ciudad,
      s.raw.locationCity
    ),
    "Sin ciudad"
  );
}

function pickNotes(item = {}) {
  const s = getNestedSources(item);

  return safeText(
    first(
      s.item.notes,
      s.item.notas,
      s.item.internalNotes,
      s.item.description,
      s.item.descripcion,

      s.usuario.notes,
      s.usuario.notas,
      s.usuario.internalNotes,
      s.usuario.description,
      s.usuario.descripcion,

      s.profile.notes,
      s.profile.notas,
      s.profile.description,
      s.profile.descripcion,

      s.raw.notes,
      s.raw.notas,
      s.raw.internalNotes,
      s.raw.description,
      s.raw.descripcion
    ),
    ""
  );
}

function pickStatusValue(item = {}) {
  const s = getNestedSources(item);

  return first(
    s.item.status,
    s.item.estado,
    s.item.state,
    s.item.accountStatus,
    s.item.userStatus,

    s.usuario.status,
    s.usuario.estado,
    s.usuario.state,
    s.usuario.accountStatus,
    s.usuario.userStatus,

    s.profile.status,
    s.profile.estado,
    s.profile.state,
    s.profile.accountStatus,
    s.profile.userStatus,

    s.raw.status,
    s.raw.estado,
    s.raw.state,
    s.raw.accountStatus,
    s.raw.userStatus,

    typeof s.item.isActive === "boolean"
      ? s.item.isActive
        ? STATUS.ACTIVE
        : STATUS.INACTIVE
      : null,

    typeof s.item.enabled === "boolean"
      ? s.item.enabled
        ? STATUS.ACTIVE
        : STATUS.INACTIVE
      : null,

    typeof s.item.blocked === "boolean" && s.item.blocked
      ? STATUS.BLOCKED
      : null,

    typeof s.raw.isActive === "boolean"
      ? s.raw.isActive
        ? STATUS.ACTIVE
        : STATUS.INACTIVE
      : null,

    typeof s.raw.enabled === "boolean"
      ? s.raw.enabled
        ? STATUS.ACTIVE
        : STATUS.INACTIVE
      : null,

    typeof s.raw.blocked === "boolean" && s.raw.blocked
      ? STATUS.BLOCKED
      : null,

    STATUS.ACTIVE
  );
}

function pickRolesArray(item = {}) {
  const s = getNestedSources(item);

  const roles = first(
    s.item.roles,
    s.item.permissions,
    s.usuario.roles,
    s.usuario.permissions,
    s.profile.roles,
    s.profile.permissions,
    s.raw.roles,
    s.raw.permissions
  );

  if (!Array.isArray(roles)) {
    return [];
  }

  return roles
    .map((role) => safeText(role, ""))
    .filter(Boolean);
}

function pickRoleValue(item = {}) {
  const s = getNestedSources(item);
  const roles = pickRolesArray(item);

  const explicitRole = first(
    s.item.role,
    s.item.rol,
    s.item.userRole,
    s.item.type,
    s.item.userType,

    s.usuario.role,
    s.usuario.rol,
    s.usuario.userRole,
    s.usuario.type,
    s.usuario.userType,

    s.profile.role,
    s.profile.rol,
    s.profile.userRole,
    s.profile.type,
    s.profile.userType,

    s.raw.role,
    s.raw.rol,
    s.raw.userRole,
    s.raw.type,
    s.raw.userType
  );

  if (explicitRole) {
    return explicitRole;
  }

  if (roles.some((role) => normalizeRole(role) === ROLE.SUPERADMIN)) {
    return ROLE.SUPERADMIN;
  }

  if (roles.some((role) => normalizeRole(role) === ROLE.ADMIN)) {
    return ROLE.ADMIN;
  }

  if (roles.some((role) => normalizeRole(role) === ROLE.SUPPORT)) {
    return ROLE.SUPPORT;
  }

  if (roles.some((role) => normalizeRole(role) === ROLE.MANAGER)) {
    return ROLE.MANAGER;
  }

  return ROLE.USER;
}

function pickCreatedAt(item = {}) {
  const s = getNestedSources(item);

  return first(
    s.item.createdAt,
    s.item.created_at,
    s.item.fechaAlta,
    s.item.fechaCreacion,
    s.item.registeredAt,
    s.item.created,
    s.item.date,

    s.usuario.createdAt,
    s.usuario.created_at,
    s.usuario.fechaAlta,
    s.usuario.fechaCreacion,
    s.usuario.registeredAt,

    s.profile.createdAt,
    s.profile.created_at,
    s.profile.fechaAlta,
    s.profile.fechaCreacion,
    s.profile.registeredAt,

    s.raw.createdAt,
    s.raw.created_at,
    s.raw.fechaAlta,
    s.raw.fechaCreacion,
    s.raw.registeredAt,
    s.raw.created,
    s.raw.date
  );
}

function pickUpdatedAt(item = {}) {
  const s = getNestedSources(item);

  return first(
    s.item.updatedAt,
    s.item.updated_at,
    s.item.modifiedAt,
    s.item.lastUpdate,
    s.item.lastUpdateAt,
    s.item.lastModifiedAt,

    s.usuario.updatedAt,
    s.usuario.updated_at,
    s.usuario.modifiedAt,
    s.usuario.lastUpdate,
    s.usuario.lastUpdateAt,
    s.usuario.lastModifiedAt,

    s.profile.updatedAt,
    s.profile.updated_at,
    s.profile.modifiedAt,
    s.profile.lastUpdate,
    s.profile.lastUpdateAt,
    s.profile.lastModifiedAt,

    s.raw.updatedAt,
    s.raw.updated_at,
    s.raw.modifiedAt,
    s.raw.lastUpdate,
    s.raw.lastUpdateAt,
    s.raw.lastModifiedAt,

    pickLastLoginAt(item),
    pickCreatedAt(item)
  );
}

function pickLastLoginAt(item = {}) {
  const s = getNestedSources(item);

  return first(
    s.item.lastLoginAt,
    s.item.last_login_at,
    s.item.lastAccessAt,
    s.item.ultimoAcceso,
    s.item.lastSeenAt,
    s.item.lastActivityAt,

    s.usuario.lastLoginAt,
    s.usuario.last_login_at,
    s.usuario.lastAccessAt,
    s.usuario.ultimoAcceso,
    s.usuario.lastSeenAt,
    s.usuario.lastActivityAt,

    s.profile.lastLoginAt,
    s.profile.last_login_at,
    s.profile.lastAccessAt,
    s.profile.ultimoAcceso,
    s.profile.lastSeenAt,
    s.profile.lastActivityAt,

    s.raw.lastLoginAt,
    s.raw.last_login_at,
    s.raw.lastAccessAt,
    s.raw.ultimoAcceso,
    s.raw.lastSeenAt,
    s.raw.lastActivityAt
  );
}

/* =========================================================
   CORE NORMALIZER
========================================================= */

export function normalizeUsuarioModel(payload = {}) {
  const item = safeObject(payload);
  const raw = hasOwnKeys(item.raw) ? safeObject(item.raw) : item;

  const userId = pickUserId(item);
  const username = pickUsername(item);
  const name = pickName(item);
  const email = pickEmail(item);
  const phone = pickPhone(item);
  const avatar = pickAvatar(item);
  const city = pickCity(item);
  const notes = pickNotes(item);

  const status = normalizeStatus(pickStatusValue(item));
  const role = normalizeRole(pickRoleValue(item));
  const roles = pickRolesArray(item);

  const createdAt = pickCreatedAt(item);
  const updatedAt = pickUpdatedAt(item);
  const lastLoginAt = pickLastLoginAt(item);

  const createdAtTs = toTimestamp(createdAt);
  const updatedAtTs = toTimestamp(updatedAt);
  const lastLoginAtTs = toTimestamp(lastLoginAt);

  const sortTs = Math.max(
    lastLoginAtTs,
    updatedAtTs,
    createdAtTs,
    0
  );

  const initials = getInitials(
    first(
      item.userInitials,
      item.initials,
      name !== "Usuario" ? name : "",
      username,
      email,
      "US"
    )
  );

  const avatarTheme = getAvatarTheme(
    first(
      userId,
      email,
      username,
      name,
      "usuario"
    )
  );

  const isActive = status === STATUS.ACTIVE;
  const isPending = status === STATUS.PENDING;
  const isBlocked = status === STATUS.BLOCKED || status === STATUS.INACTIVE;
  const isInactive = status === STATUS.INACTIVE;

  const roleIsAdmin =
    role === ROLE.ADMIN ||
    role === ROLE.SUPERADMIN ||
    roles.some((value) => {
      const normalized = normalizeRole(value);
      return normalized === ROLE.ADMIN || normalized === ROLE.SUPERADMIN;
    });

  const isSupport =
    role === ROLE.SUPPORT ||
    roles.some((value) => normalizeRole(value) === ROLE.SUPPORT);

  return {
    /*
      IDs / claves
    */
    userId,
    usuarioId: userId,
    id: userId,
    code: safeText(first(item.code, raw.code, username, userId), userId),
    username,
    userName: username,

    /*
      Identidad
    */
    name,
    nombre: name,
    fullName: safeText(first(item.fullName, raw.fullName, name), name),
    displayName: safeText(first(item.displayName, raw.displayName, name), name),

    /*
      Contacto
    */
    email,
    mail: email,
    userEmail: email,
    phone,
    telefono: phone,
    mobile: safeText(first(item.mobile, raw.mobile, phone), phone),

    /*
      Visual
    */
    avatar,
    avatarUrl: avatar,
    userAvatar: avatar,
    userAvatarUrl: avatar,
    initials,
    userInitials: initials,
    avatarTheme,

    /*
      Ubicación
    */
    city,
    ciudad: city,
    locationCity: city,

    /*
      Estado / rol
    */
    status,
    estado: status,
    state: status,
    statusLabel: getStatusLabel(status),

    role,
    rol: role,
    userRole: role,
    roleLabel: getRoleLabel(role),
    roles,

    /*
      Fechas
    */
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
    lastLoginAt,
    last_login_at: lastLoginAt,

    createdAtTs,
    updatedAtTs,
    lastLoginAtTs,
    sortTs,

    /*
      Texto auxiliar
    */
    notes,

    /*
      Flags computados
    */
    isActive,
    isPending,
    isBlocked,
    isInactive,
    isAdmin: roleIsAdmin,
    admin: roleIsAdmin,
    isSupport,

    /*
      Compatibilidad / trazabilidad
    */
    raw,
  };
}

/* =========================================================
   COLLECTION
========================================================= */

export function unwrapUsuariosPayload(payload = null) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (Array.isArray(obj.items)) {
    return obj.items;
  }

  if (Array.isArray(obj.rows)) {
    return obj.rows;
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

  if (Array.isArray(obj.results)) {
    return obj.results;
  }

  if (Array.isArray(obj.records)) {
    return obj.records;
  }

  if (obj.payload && typeof obj.payload === "object") {
    return unwrapUsuariosPayload(obj.payload);
  }

  if (obj.response && typeof obj.response === "object") {
    return unwrapUsuariosPayload(obj.response);
  }

  if (obj.result && typeof obj.result === "object") {
    return unwrapUsuariosPayload(obj.result);
  }

  if (obj.data && typeof obj.data === "object") {
    return unwrapUsuariosPayload(obj.data);
  }

  return [];
}

export function normalizeUsuariosCollection(payload = []) {
  return unwrapUsuariosPayload(payload)
    .map(normalizeUsuarioModel)
    .filter((item) => {
      return Boolean(
        safeText(
          first(
            item.userId,
            item.id,
            item.username,
            item.email
          ),
          ""
        )
      );
    });
}

/* =========================================================
   SORT
========================================================= */

export function sortUsuariosByUpdatedDesc(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => {
      const aTs = Math.max(
        safeNumber(a?.sortTs, 0),
        safeNumber(a?.lastLoginAtTs, 0),
        safeNumber(a?.updatedAtTs, 0),
        safeNumber(a?.createdAtTs, 0),
        toTimestamp(a?.lastLoginAt),
        toTimestamp(a?.updatedAt),
        toTimestamp(a?.createdAt)
      );

      const bTs = Math.max(
        safeNumber(b?.sortTs, 0),
        safeNumber(b?.lastLoginAtTs, 0),
        safeNumber(b?.updatedAtTs, 0),
        safeNumber(b?.createdAtTs, 0),
        toTimestamp(b?.lastLoginAt),
        toTimestamp(b?.updatedAt),
        toTimestamp(b?.createdAt)
      );

      return bTs - aTs;
    });
}

export function sortUsuariosByNameAsc(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => {
      return safeText(a?.name)
        .localeCompare(
          safeText(b?.name),
          "es",
          {
            sensitivity: "base",
          }
        );
    });
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateUsuarios(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list = safeArray(items);

  const size = Math.max(
    1,
    safeNumber(
      pageSize,
      DEFAULT_PAGE_SIZE
    )
  );

  const total = list.length;

  const totalPages = Math.max(
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

  const start = (current - 1) * size;
  const end = start + size;
  const pageItems = list.slice(start, end);

  const from = total && pageItems.length ? start + 1 : 0;
  const to = total ? Math.min(end, total) : 0;

  return {
    page: current,
    currentPage: current,
    pageSize: size,

    total,
    totalItems: total,
    totalCount: total,
    totalPages,

    start,
    end,

    from,
    to,
    rangeStart: from,
    rangeEnd: to,

    hasPrev: current > 1,
    hasNext: current < totalPages,

    items: pageItems,
    pageItems,
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeUsuariosStats(items = []) {
  const list = safeArray(items);

  return {
    total: list.length,
    totalUsuarios: list.length,

    active: list.filter((item) => item?.isActive).length,
    activeCount: list.filter((item) => item?.isActive).length,

    pending: list.filter((item) => item?.isPending).length,
    pendingCount: list.filter((item) => item?.isPending).length,

    blocked: list.filter((item) => item?.isBlocked).length,
    blockedCount: list.filter((item) => item?.isBlocked).length,

    inactive: list.filter((item) => item?.isInactive).length,
    inactiveCount: list.filter((item) => item?.isInactive).length,

    admins: list.filter((item) => item?.isAdmin).length,
    adminCount: list.filter((item) => item?.isAdmin).length,

    support: list.filter((item) => item?.isSupport).length,
    supportCount: list.filter((item) => item?.isSupport).length,
  };
}

/* =========================================================
   FINDER
========================================================= */

export function findUsuarioById(items = [], userId = "") {
  const id = safeText(userId, "");
  if (!id) return null;

  const normalizedId = normalizeKey(id);

  return (
    safeArray(items).find((item) => {
      const candidates = [
        item?.userId,
        item?.usuarioId,
        item?.id,
        item?.code,
        item?.username,
        item?.userName,
        item?.email,
        item?.mail,

        item?.raw?.userId,
        item?.raw?.usuarioId,
        item?.raw?.id,
        item?.raw?.code,
        item?.raw?.username,
        item?.raw?.userName,
        item?.raw?.email,
        item?.raw?.mail,
      ];

      return candidates.some((candidate) => {
        return normalizeKey(candidate) === normalizedId;
      });
    }) || null
  );
}

/* =========================================================
   EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,

  STATUS,
  ROLE,

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

  getInitials,
  getAvatarTheme,

  toDate,
  toTimestamp,
};
