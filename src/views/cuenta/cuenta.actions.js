/* =========================================================
   Onion SPA - Cuenta Actions
   Archivo: src/views/cuenta/cuenta.actions.js

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de cuenta
   - resolver detalle de cuenta desde store + backend
   - abrir detalle a nivel de datos, no de UI
   - copiar id de usuario / cuenta
   - exportar colección a CSV
   - desacoplar la vista principal de la lógica operativa
   - mantener compatibilidad con cuentaView.js

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
  getCuentaByIdRequest,
} from "./cuenta.api.js";

import {
  getCuentaByIdStore,
  getSortedCuentasStore,
} from "./cuenta.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./cuenta.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "cuenta.csv";

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

function normalizeCuentaId(value = "") {
  return safeText(value, "");
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isLikelyCuenta(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.userId ||
      value.id ||
      value.accountId ||
      value.profileId ||
      value.username ||
      value.email ||
      value.name ||
      value.nombre
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.account ||
      obj.cuenta ||
      obj.profile ||
      obj.user ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (isLikelyCuenta(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyCuenta(obj.account)) {
    return obj.account;
  }

  if (isLikelyCuenta(obj.cuenta)) {
    return obj.cuenta;
  }

  if (isLikelyCuenta(obj.profile)) {
    return obj.profile;
  }

  if (isLikelyCuenta(obj.user)) {
    return obj.user;
  }

  if (isLikelyCuenta(obj.item)) {
    return obj.item;
  }

  if (isLikelyCuenta(obj.result)) {
    return obj.result;
  }

  if (isLikelyCuenta(obj.payload)) {
    return obj.payload;
  }

  if (isLikelyCuenta(obj.data)) {
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
      item.accountId,
      item.profileId
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
      item.alias
    ),
    "Sin usuario"
  );
}

function getDisplayName(item = {}) {
  return safeText(
    first(
      item.displayName,
      item.name,
      item.nombre,
      item.fullName,
      item.full_name
    ),
    "Sin nombre"
  );
}

function getEmail(item = {}) {
  return safeText(
    first(
      item.email,
      item.mail,
      item.userEmail
    ),
    "Sin email"
  );
}

function getPhone(item = {}) {
  return safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile,
      item.telefonoMovil
    ),
    "Sin teléfono"
  );
}

function getRole(item = {}) {
  const roleObject = first(
    item.role,
    item.rol,
    item.accountRole,
    item.profileRole
  );

  if (isObject(roleObject)) {
    return safeText(
      first(
        roleObject.name,
        roleObject.nombre,
        roleObject.code,
        roleObject.id
      ),
      "user"
    );
  }

  return safeText(roleObject, "user");
}

function getPlan(item = {}) {
  const planObject = first(
    item.plan,
    item.subscription,
    item.suscripcion,
    item.membership
  );

  if (isObject(planObject)) {
    return safeText(
      first(
        planObject.name,
        planObject.nombre,
        planObject.code,
        planObject.id
      ),
      "Sin plan"
    );
  }

  return safeText(
    first(
      item.planName,
      item.subscriptionName,
      item.planLabel,
      planObject
    ),
    "Sin plan"
  );
}

function getStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.accountStatus,
      item.profileStatus
    ),
    "active"
  );
}

function getAvatarUrl(item = {}) {
  return safeText(
    first(
      item.avatar,
      item.avatarUrl,
      item.photoURL,
      item.photoUrl,
      item.image,
      item.imagen
    ),
    ""
  );
}

function getLanguage(item = {}) {
  return safeText(
    first(
      item.lang,
      item.language,
      item.locale,
      item.idioma
    ),
    "es"
  );
}

function getTheme(item = {}) {
  return safeText(
    first(
      item.theme,
      item.tema,
      item.preferences?.theme,
      item.settings?.theme
    ),
    "dark"
  );
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.created_at,
    item.fechaCreacion,
    item.date
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.updated_at,
    item.modifiedAt,
    item.lastUpdate,
    item.fechaActualizacion,
    item.createdAt
  );
}

function getLastLoginAt(item = {}) {
  return first(
    item.lastLoginAt,
    item.lastLogin,
    item.ultimoLogin,
    item.lastAccessAt,
    item.lastSeenAt
  );
}

function getSecurity(item = {}) {
  const security = safeObject(
    first(
      item.security,
      item.seguridad,
      item.securitySettings
    )
  );

  return {
    twoFactorEnabled: Boolean(
      first(
        security.twoFactorEnabled,
        security.twoFA,
        security.mfaEnabled,
        item.twoFactorEnabled,
        item.mfaEnabled
      )
    ),
    emailVerified: Boolean(
      first(
        security.emailVerified,
        item.emailVerified
      )
    ),
    phoneVerified: Boolean(
      first(
        security.phoneVerified,
        item.phoneVerified
      )
    ),
  };
}

function getAddresses(item = {}) {
  return safeArray(
    first(
      item.addresses,
      item.direcciones,
      item.addressBook
    )
  ).map((entry) => {
    const row = safeObject(entry);

    return {
      label: safeText(
        first(
          row.label,
          row.tipo,
          row.name
        ),
        "Dirección"
      ),
      address: safeText(
        first(
          row.address,
          row.direccion,
          row.line1,
          row.fullAddress
        ),
        "Sin dirección"
      ),
      city: safeText(
        first(row.city, row.ciudad),
        ""
      ),
      postalCode: safeText(
        first(row.postalCode, row.cp, row.zip),
        ""
      ),
      country: safeText(
        first(row.country, row.pais),
        ""
      ),
      raw: row,
    };
  });
}

function getSessions(item = {}) {
  return safeArray(
    first(
      item.sessions,
      item.activeSessions,
      item.devices,
      item.dispositivos
    )
  ).map((entry) => {
    const row = safeObject(entry);

    return {
      id: safeText(
        first(
          row.id,
          row.sessionId,
          row.deviceId
        ),
        ""
      ),
      label: safeText(
        first(
          row.label,
          row.name,
          row.deviceName,
          row.browser
        ),
        "Sesión"
      ),
      lastSeenAt: first(
        row.lastSeenAt,
        row.lastAccessAt,
        row.updatedAt
      ),
      ip: safeText(first(row.ip, row.ipAddress), ""),
      raw: row,
    };
  });
}

function normalizeCuentaDetail(detail = {}) {
  const raw = safeObject(detail);
  const security = getSecurity(raw);

  return {
    ...raw,
    userId: getId(raw),
    username: getUsername(raw),
    displayName: getDisplayName(raw),
    email: getEmail(raw),
    phone: getPhone(raw),
    role: getRole(raw),
    plan: getPlan(raw),
    status: getStatus(raw),
    avatarUrl: getAvatarUrl(raw),
    lang: getLanguage(raw),
    theme: getTheme(raw),
    createdAt: getCreatedAt(raw),
    updatedAt: getUpdatedAt(raw),
    lastLoginAt: getLastLoginAt(raw),
    security,
    twoFactorEnabled: security.twoFactorEnabled,
    emailVerified: security.emailVerified,
    phoneVerified: security.phoneVerified,
    addresses: getAddresses(raw),
    sessions: getSessions(raw),
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
    "displayName",
    "email",
    "phone",
    "role",
    "plan",
    "status",
    "lang",
    "theme",
    "emailVerified",
    "phoneVerified",
    "twoFactorEnabled",
    "createdAt",
    "updatedAt",
    "lastLoginAt",
  ];

  const rows = safeArray(items).map((item) => [
    getId(item),
    getUsername(item),
    getDisplayName(item),
    getEmail(item),
    getPhone(item),
    getRole(item),
    getPlan(item),
    getStatus(item),
    getLanguage(item),
    getTheme(item),
    String(getSecurity(item).emailVerified),
    String(getSecurity(item).phoneVerified),
    String(getSecurity(item).twoFactorEnabled),
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

export function getCuentaDetailFromStoreAction({
  userId = "",
} = {}) {
  const id = normalizeCuentaId(userId);

  if (!id) return null;

  try {
    const detail = getCuentaByIdStore(id);
    const picked = pickDetail(detail);

    if (!picked) return null;

    return normalizeCuentaDetail(picked);
  } catch {
    return null;
  }
}

export async function getCuentaDetailAction({
  userId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeCuentaId(userId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver la cuenta.", "error");
    }
    return null;
  }

  const fallbackStoreDetail =
    getCuentaDetailFromStoreAction({
      userId: id,
    });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("cuenta:detail:request", {
      userId: id,
      source: "backend",
    });

    const response =
      await getCuentaByIdRequest(id);

    const detail = pickDetail(response);

    if (!detail) {
      if (fallbackStoreDetail) {
        safeEmit("cuenta:detail:fallback", {
          userId: id,
          source: "store",
        });
        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_CUENTA_DETAIL");
    }

    const normalized = normalizeCuentaDetail(detail);

    safeEmit("cuenta:detail:success", {
      userId: id,
      source: "backend",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("cuenta:detail:fallback", {
        userId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("cuenta:detail:error", {
      userId: id,
      error,
    });

    if (!silent) {
      showToast(
        "No se pudo cargar el detalle de la cuenta.",
        "error"
      );
    }

    return null;
  }
}

export async function openCuentaAction({
  userId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeCuentaId(userId);

  if (!id) {
    if (!silent) {
      showToast("Cuenta inválida.", "error");
    }
    return null;
  }

  safeEmit("cuenta:open", {
    userId: id,
  });

  const detail = await getCuentaDetailAction({
    userId: id,
    preferFresh,
    silent,
  });

  if (!detail) {
    return null;
  }

  safeEmit("cuenta:open:success", {
    userId: id,
    detail,
  });

  return detail;
}

export async function refreshCuentaDetailAction({
  userId = "",
  silent = true,
} = {}) {
  return getCuentaDetailAction({
    userId,
    preferFresh: true,
    silent,
  });
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyCuentaIdAction({
  userId = "",
  silent = false,
} = {}) {
  const id = normalizeCuentaId(userId);

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

  safeEmit("cuenta:copy-id", {
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

export function exportCuentaCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems = Array.isArray(items)
    ? items
    : getSortedCuentasStore();

  const list = safeArray(sourceItems);

  if (!list.length) {
    if (!silent) {
      showToast("No hay datos de cuenta para exportar.", "info");
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

    safeEmit("cuenta:export:csv", {
      total: list.length,
      filename: safeText(filename, CSV_FILENAME),
    });

    if (!silent) {
      showToast("CSV exportado", "success");
    }

    return true;
  } catch (error) {
    safeEmit("cuenta:export:error", {
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
   NAVIGATION ACTIONS
========================================================= */

export async function editCuentaAction({
  route = "/cuenta/editar",
  fallbackEvent = "cuenta:edit",
  silent = false,
} = {}) {
  const targetRoute = safeText(route, "/cuenta/editar");

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
        "No se pudo abrir la edición de cuenta.",
        "error"
      );
    }

    return false;
  }
}

export async function openCuentaSecurityAction({
  route = "/cuenta/seguridad",
  fallbackEvent = "cuenta:security",
  silent = false,
} = {}) {
  const targetRoute = safeText(route, "/cuenta/seguridad");

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
        "No se pudo abrir la sección de seguridad.",
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
  getId as getCuentaIdAction,
  getUsername as getCuentaUsernameAction,
  getDisplayName as getCuentaDisplayNameAction,
  getEmail as getCuentaEmailAction,
  getPhone as getCuentaPhoneAction,
  getRole as getCuentaRoleAction,
  getPlan as getCuentaPlanAction,
  getStatus as getCuentaStatusAction,
  getAvatarUrl as getCuentaAvatarUrlAction,
  getLanguage as getCuentaLanguageAction,
  getTheme as getCuentaThemeAction,
  getCreatedAt as getCuentaCreatedAtAction,
  getUpdatedAt as getCuentaUpdatedAtAction,
  getLastLoginAt as getCuentaLastLoginAtAction,
  getSecurity as getCuentaSecurityAction,
  getAddresses as getCuentaAddressesAction,
  getSessions as getCuentaSessionsAction,
  normalizeCuentaDetail as normalizeCuentaDetailAction,
};
