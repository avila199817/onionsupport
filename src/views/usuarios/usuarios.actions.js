/* =========================================================
   Onion SPA - Usuarios Actions
   Archivo: src/views/usuarios/usuarios.actions.js

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de usuarios
   - resolver detalle usuario desde store + backend
   - abrir detalle a nivel de datos, no de UI
   - copiar id de usuario
   - exportar colección a CSV
   - desacoplar la vista principal de la lógica operativa
   - mantener compatibilidad con usuariosView.js

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback store -> backend
   - soporte envelope backend
   - export seguro con escape CSV
   - clipboard robusto con fallback legacy
   - eventos opcionales vía AppCore.events
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getUsuarioByIdRequest,
} from "./usuarios.api.js";

import {
  getUsuarioByIdStore,
  getSortedUsuariosStore,
} from "./usuarios.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./usuarios.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "usuarios.csv";

/* =========================================================
   HELPERS
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
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

function normalizeUserId(value = "") {
  return safeText(value, "");
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isLikelyUser(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.userId ||
      value.id ||
      value.uid ||
      value.code ||
      value.username ||
      value.userName ||
      value.name ||
      value.nombre ||
      value.email
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.user ||
      obj.usuario ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (isLikelyUser(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyUser(obj.user)) {
    return obj.user;
  }

  if (isLikelyUser(obj.usuario)) {
    return obj.usuario;
  }

  if (isLikelyUser(obj.item)) {
    return obj.item;
  }

  if (isLikelyUser(obj.result)) {
    return obj.result;
  }

  if (isLikelyUser(obj.payload)) {
    return obj.payload;
  }

  if (isLikelyUser(obj.data)) {
    return obj.data;
  }

  if (looksLikeEnvelope(obj.data)) {
    return pickDetail(obj.data);
  }

  return null;
}

function getId(item = {}) {
  return safeText(
    first(
      item.userId,
      item.id,
      item.uid,
      item.code
    ),
    ""
  );
}

function getUsername(item = {}) {
  return safeText(
    first(
      item.username,
      item.userName,
      item.nick,
      item.slug,
      item.login
    ),
    "usuario"
  );
}

function getName(item = {}) {
  const profileObject = first(
    item.profile,
    item.perfil,
    item.user,
    item.usuario
  );

  if (isObject(profileObject)) {
    return safeText(
      first(
        profileObject.name,
        profileObject.nombre,
        profileObject.displayName,
        profileObject.fullName
      ),
      "Usuario"
    );
  }

  return safeText(
    first(
      item.name,
      item.nombre,
      item.displayName,
      item.fullName,
      item.username,
      item.userName
    ),
    "Usuario"
  );
}

function getEmail(item = {}) {
  const profileObject = first(
    item.profile,
    item.perfil,
    item.user,
    item.usuario
  );

  if (isObject(profileObject)) {
    return safeText(
      first(
        profileObject.email,
        profileObject.mail
      ),
      "Sin email"
    );
  }

  return safeText(
    first(
      item.email,
      item.mail,
      item.correo
    ),
    "Sin email"
  );
}

function getPhone(item = {}) {
  const profileObject = first(
    item.profile,
    item.perfil,
    item.user,
    item.usuario,
    item.contact,
    item.contacto
  );

  if (isObject(profileObject)) {
    return safeText(
      first(
        profileObject.phone,
        profileObject.telefono,
        profileObject.mobile,
        profileObject.movil
      ),
      "Sin teléfono"
    );
  }

  return safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      item.movil
    ),
    "Sin teléfono"
  );
}

function getRole(item = {}) {
  const roles = safeArray(
    first(item.roles, item.permisos)
  );

  if (roles.length) {
    return safeText(
      first(
        roles[0]?.name,
        roles[0]?.nombre,
        roles[0],
        item.role,
        item.rol
      ),
      "user"
    );
  }

  return safeText(
    first(item.role, item.rol),
    "user"
  );
}

function getStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.state
    ),
    "active"
  );
}

function getCompany(item = {}) {
  const companyObject = first(
    item.company,
    item.empresa,
    item.client,
    item.cliente,
    item.organization,
    item.organizacion
  );

  if (isObject(companyObject)) {
    return safeText(
      first(
        companyObject.name,
        companyObject.nombre,
        companyObject.company,
        companyObject.empresa
      ),
      "Sin empresa"
    );
  }

  return safeText(
    first(
      item.companyName,
      item.empresaNombre,
      item.company,
      item.empresa,
      companyObject
    ),
    "Sin empresa"
  );
}

function getAvatar(item = {}) {
  const profileObject = first(
    item.profile,
    item.perfil,
    item.user,
    item.usuario
  );

  if (isObject(profileObject)) {
    return safeText(
      first(
        profileObject.avatar,
        profileObject.avatarUrl,
        profileObject.photoURL,
        profileObject.photo,
        profileObject.image
      ),
      ""
    );
  }

  return safeText(
    first(
      item.avatar,
      item.avatarUrl,
      item.photoURL,
      item.photo,
      item.image
    ),
    ""
  );
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.createdAtES,
    item.fechaCreacion,
    item.registeredAt,
    item.date
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.modifiedAt,
    item.lastUpdate,
    item.lastLoginAt,
    item.createdAt
  );
}

function getLastLoginAt(item = {}) {
  return first(
    item.lastLoginAt,
    item.lastLogin,
    item.ultimoLogin,
    item.lastAccessAt,
    item.ultimoAcceso
  );
}

function getMeta(item = {}) {
  return safeObject(
    first(
      item.meta,
      item.metadata,
      item.extra,
      item.details
    )
  );
}

function normalizeUserDetail(detail = {}) {
  const raw = safeObject(detail);

  return {
    ...raw,
    userId: getId(raw),
    username: getUsername(raw),
    name: getName(raw),
    email: getEmail(raw),
    phone: getPhone(raw),
    role: getRole(raw),
    status: getStatus(raw),
    companyName: getCompany(raw),
    avatarUrl: getAvatar(raw),
    createdAt: getCreatedAt(raw),
    updatedAt: getUpdatedAt(raw),
    lastLoginAt: getLastLoginAt(raw),
    meta: getMeta(raw),
  };
}

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "userId",
    "username",
    "name",
    "email",
    "phone",
    "role",
    "status",
    "company",
    "createdAt",
    "updatedAt",
    "lastLoginAt",
  ];

  const rows = safeArray(items).map((item) => [
    getId(item),
    getUsername(item),
    getName(item),
    getEmail(item),
    getPhone(item),
    getRole(item),
    getStatus(item),
    getCompany(item),
    getCreatedAt(item) || "",
    getUpdatedAt(item) || "",
    getLastLoginAt(item) || "",
  ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

function downloadTextFile({
  filename = CSV_FILENAME,
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  const blob = new Blob([String(content || "")], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  return true;
}

/* =========================================================
   DETAIL ACTIONS
========================================================= */

export function getUsuarioDetailFromStoreAction({
  userId = "",
} = {}) {
  const id = normalizeUserId(userId);

  if (!id) return null;

  try {
    const detail = getUsuarioByIdStore(id);
    const picked = pickDetail(detail);

    if (!picked) return null;

    return normalizeUserDetail(picked);
  } catch {
    return null;
  }
}

export async function getUsuarioDetailAction({
  userId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeUserId(userId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver el usuario.", "error");
    }
    return null;
  }

  const fallbackStoreDetail =
    getUsuarioDetailFromStoreAction({
      userId: id,
    });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("usuarios:detail:request", {
      userId: id,
      source: "backend",
    });

    const response =
      await getUsuarioByIdRequest(id);

    const detail = pickDetail(response);

    if (!detail) {
      if (fallbackStoreDetail) {
        safeEmit("usuarios:detail:fallback", {
          userId: id,
          source: "store",
        });
        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_USER_DETAIL");
    }

    const normalized = normalizeUserDetail(detail);

    safeEmit("usuarios:detail:success", {
      userId: id,
      source: "backend",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("usuarios:detail:fallback", {
        userId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("usuarios:detail:error", {
      userId: id,
      error,
    });

    if (!silent) {
      showToast(
        "No se pudo cargar el detalle del usuario.",
        "error"
      );
    }

    return null;
  }
}

export async function openUsuarioAction({
  userId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeUserId(userId);

  if (!id) {
    if (!silent) {
      showToast("Usuario inválido.", "error");
    }
    return null;
  }

  safeEmit("usuarios:open", {
    userId: id,
  });

  const detail = await getUsuarioDetailAction({
    userId: id,
    preferFresh,
    silent,
  });

  if (!detail) {
    return null;
  }

  safeEmit("usuarios:open:success", {
    userId: id,
    detail,
  });

  return detail;
}

export async function refreshUsuarioDetailAction({
  userId = "",
  silent = true,
} = {}) {
  return getUsuarioDetailAction({
    userId,
    preferFresh: true,
    silent,
  });
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyUsuarioIdAction({
  userId = "",
  silent = false,
} = {}) {
  const id = normalizeUserId(userId);

  if (!id) {
    if (!silent) {
      showToast("No hay ID para copiar.", "error");
    }
    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar el ID.", "error");
    }
    return false;
  }

  safeEmit("usuarios:copy-id", {
    userId: id,
  });

  if (!silent) {
    showToast("ID copiado", "success");
  }

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

export function exportUsuariosCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems = Array.isArray(items)
    ? items
    : getSortedUsuariosStore();

  const list = safeArray(sourceItems);

  if (!list.length) {
    if (!silent) {
      showToast("No hay usuarios para exportar.", "info");
    }
    return false;
  }

  try {
    const csv = buildCsvRows(list);

    downloadTextFile({
      filename: safeText(filename, CSV_FILENAME),
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    safeEmit("usuarios:export:csv", {
      total: list.length,
      filename: safeText(filename, CSV_FILENAME),
    });

    if (!silent) {
      showToast("CSV exportado", "success");
    }

    return true;
  } catch (error) {
    safeEmit("usuarios:export:error", {
      type: "csv",
      error,
    });

    if (!silent) {
      showToast("No se pudo exportar el CSV.", "error");
    }

    return false;
  }
}

/* =========================================================
   CREATE
========================================================= */

export async function createUsuarioAction({
  route = "/usuarios/nuevo",
  fallbackEvent = "usuarios:create",
  silent = false,
} = {}) {
  const targetRoute = safeText(route, "/usuarios/nuevo");

  try {
    safeEmit(fallbackEvent, {
      route: targetRoute,
    });

    if (AppCore?.router?.navigate) {
      await AppCore.router.navigate(targetRoute);
      return true;
    }

    if (AppCore?.Router?.navigate) {
      await AppCore.Router.navigate(targetRoute);
      return true;
    }

    return true;
  } catch (error) {
    if (!silent) {
      showToast(
        "No se pudo abrir el flujo de creación.",
        "error"
      );
    }

    return false;
  }
}

/* =========================================================
   DETAIL HELPERS EXPORT
========================================================= */

export {
  getId as getUsuarioIdAction,
  getUsername as getUsuarioUsernameAction,
  getName as getUsuarioNameAction,
  getEmail as getUsuarioEmailAction,
  getPhone as getUsuarioPhoneAction,
  getRole as getUsuarioRoleAction,
  getStatus as getUsuarioStatusAction,
  getCompany as getUsuarioCompanyAction,
  getAvatar as getUsuarioAvatarAction,
  getCreatedAt as getUsuarioCreatedAtAction,
  getUpdatedAt as getUsuarioUpdatedAtAction,
  getLastLoginAt as getUsuarioLastLoginAtAction,
  getMeta as getUsuarioMetaAction,
  normalizeUserDetail as normalizeUsuarioDetailAction,
};
