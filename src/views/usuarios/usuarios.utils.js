/* =========================================================
   Onion SPA - Usuarios Utils
   Archivo: src/views/usuarios/usuarios.utils.js

   EXTREME MODE · 10/10

   Responsabilidades:
   - helpers puros reutilizables
   - sanitización robusta
   - fechas seguras
   - números
   - texto
   - normalización
   - cero dependencias frágiles
   - compatibilidad total con template / actions / api
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   BASE
========================================================= */

/**
 * FIX CRÍTICO:
 * fallback local si AppCore.utils.escapeHtml
 * no existe o falla.
 */
export function escapeHtml(value = "") {
  const text = String(value ?? "");

  try {
    const coreEscape =
      AppCore?.utils?.escapeHtml;

    if (
      typeof coreEscape ===
      "function"
    ) {
      const result =
        coreEscape(text);

      if (
        result !== undefined &&
        result !== null
      ) {
        return String(result);
      }
    }
  } catch {}

  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeString(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

export function safeText(
  value,
  fallback = ""
) {
  return safeString(
    value,
    fallback
  );
}

export function safeArray(
  value,
  fallback = []
) {
  return Array.isArray(value)
    ? value
    : fallback;
}

export function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

export function safeObject(
  value,
  fallback = {}
) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : fallback;
}

/* =========================================================
   UI
========================================================= */

export function showToast(
  message = "",
  type = "info",
  options = {}
) {
  const text =
    safeText(message, "");

  if (!text) {
    return false;
  }

  try {
    if (
      typeof AppCore?.modules?.get ===
      "function"
    ) {
      const toastModule =
        AppCore.modules.get(
          "toast"
        );

      if (
        typeof toastModule?.show ===
        "function"
      ) {
        toastModule.show({
          message: text,
          type,
          ...options,
        });

        return true;
      }
    }
  } catch {}

  try {
    if (
      typeof AppCore?.ui?.toast?.show ===
      "function"
    ) {
      AppCore.ui.toast.show({
        message: text,
        type,
        ...options,
      });

      return true;
    }
  } catch {}

  try {
    if (
      typeof AppCore?.toast?.show ===
      "function"
    ) {
      AppCore.toast.show({
        message: text,
        type,
        ...options,
      });

      return true;
    }
  } catch {}

  try {
    if (
      typeof window !==
        "undefined" &&
      typeof window.Toast?.show ===
        "function"
    ) {
      window.Toast.show({
        message: text,
        type,
        ...options,
      });

      return true;
    }
  } catch {}

  try {
    const logger =
      type === "error"
        ? console.error
        : type === "warning"
          ? console.warn
          : console.log;

    logger(
      `[UsuariosToast:${type}]`,
      text
    );
  } catch {}

  return false;
}

/* =========================================================
   TEXT
========================================================= */

export function normalizeText(
  value = ""
) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim();
}

export function truncate(
  value = "",
  max = 160
) {
  const text =
    safeString(value, "");

  const limit =
    safeNumber(max, 160);

  if (!text) {
    return "";
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text
    .slice(0, limit)
    .trim()}…`;
}

export function getInitials(
  value = ""
) {
  const text =
    safeString(value, "");

  if (!text) {
    return "ON";
  }

  const initials = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part
        .charAt(0)
        .toUpperCase()
    )
    .join("")
    .slice(0, 2);

  return initials || "ON";
}

/* =========================================================
   DATE
========================================================= */

export function toMs(value) {
  if (!value) {
    return 0;
  }

  const ms =
    new Date(value).getTime();

  return Number.isFinite(ms)
    ? ms
    : 0;
}

export function formatDate(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

export function formatRelativeDate(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  const diff =
    Date.now() -
    date.getTime();

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (diff < minute) {
    return "Hace un momento";
  }

  if (diff < hour) {
    return `Hace ${Math.floor(
      diff / minute
    )} min`;
  }

  if (diff < day) {
    return `Hace ${Math.floor(
      diff / hour
    )} h`;
  }

  if (diff < day * 7) {
    return `Hace ${Math.floor(
      diff / day
    )} d`;
  }

  return formatDate(value);
}

/* =========================================================
   USERS EXTRA
========================================================= */

export function normalizeRole(
  value = ""
) {
  const role =
    normalizeText(value);

  if (
    [
      "admin",
      "administrator",
    ].includes(role)
  ) {
    return "admin";
  }

  if (
    [
      "manager",
      "gestor",
    ].includes(role)
  ) {
    return "manager";
  }

  if (
    [
      "support",
      "agent",
      "soporte",
    ].includes(role)
  ) {
    return "support";
  }

  return "user";
}

export function normalizeStatus(
  value = ""
) {
  const status =
    normalizeText(value);

  if (
    [
      "inactive",
      "disabled",
      "blocked",
      "suspended",
      "inactivo",
    ].includes(status)
  ) {
    return "inactive";
  }

  if (
    [
      "pending",
      "pendiente",
    ].includes(status)
  ) {
    return "pending";
  }

  return "active";
}

export function normalizeUser(
  item = {}
) {
  const user =
    safeObject(item);

  return {
    id: safeText(
      user.id ||
        user.userId ||
        user.uid
    ),

    username: safeText(
      user.username ||
        user.user
    ),

    name: safeText(
      user.name ||
        user.fullName ||
        user.nombre
    ),

    email: safeText(
      user.email ||
        user.mail
    ),

    phone: safeText(
      user.phone ||
        user.telefono
    ),

    company: safeText(
      user.company ||
        user.empresa
    ),

    avatar: safeText(
      user.avatar ||
        user.avatarUrl
    ),

    role: normalizeRole(
      user.role ||
        user.rol
    ),

    status:
      normalizeStatus(
        user.status ||
          user.estado
      ),

    createdAt:
      user.createdAt ||
      user.created_at ||
      null,

    updatedAt:
      user.updatedAt ||
      user.updated_at ||
      null,

    lastLogin:
      user.lastLogin ||
      user.last_login ||
      null,
  };
}
