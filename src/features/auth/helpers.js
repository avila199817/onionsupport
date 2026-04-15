/* =========================================================
   Onion SPA - Auth Helpers
   Archivo: src/features/auth/helpers.js

   Responsabilidades:
   - helpers base auth
   - normalización paths
   - saneado username / slug / tokens
   - extracción segura mensajes error
   - detección rutas auth
   - validación redirects internos
   - endurecer strings / urls / payloads backend

   HARDENING PRO:
   - tolerancia total a AppCore parcial
   - unicode safe
   - anti open redirect
   - helpers reutilizables SPA
========================================================= */

import { AppCore } from "../../core/index.js";
import { AUTH_CONSTANTS } from "./constants.js";

/* =========================================================
   BASE
========================================================= */

export function isBrowser() {
  return (
    typeof window !==
      "undefined" &&
    typeof document !==
      "undefined"
  );
}

export function safeText(
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

export function safeNumber(
  value,
  fallback = 0
) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

export function safeBool(
  value
) {
  return value === true;
}

export function isObject(
  value
) {
  return (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}

export function safeClone(
  value
) {
  try {
    if (
      typeof AppCore?.utils
        ?.safeClone ===
      "function"
    ) {
      return AppCore.utils.safeClone(
        value
      );
    }
  } catch {}

  try {
    return structuredClone(
      value
    );
  } catch {}

  return value;
}

/* =========================================================
   INTERNAL APPCORE HELPERS
========================================================= */

function coreNormalizePath(
  value
) {
  try {
    if (
      typeof AppCore?.utils
        ?.normalizePath ===
      "function"
    ) {
      return AppCore.utils.normalizePath(
        value
      );
    }
  } catch {}

  return null;
}

function coreNormalizeCanonicalPath(
  value
) {
  try {
    if (
      typeof AppCore?.utils
        ?.normalizeCanonicalPath ===
      "function"
    ) {
      return AppCore.utils.normalizeCanonicalPath(
        value
      );
    }
  } catch {}

  return null;
}

/* =========================================================
   PATH HELPERS
========================================================= */

function fallbackNormalizePath(
  value = "/"
) {
  const raw =
    safeText(
      value,
      "/"
    ) || "/";

  const noHash =
    raw.split("#")[0];

  const [pathname, search] =
    noHash.split("?");

  const cleanPath =
    String(
      pathname || "/"
    )
      .replace(
        /\/{2,}/g,
        "/"
      )
      .replace(
        /\/+$/g,
        ""
      ) || "/";

  return search
    ? `${cleanPath}?${search}`
    : cleanPath;
}

export function normalizePath(
  path = "/"
) {
  return (
    coreNormalizePath(
      path
    ) ||
    fallbackNormalizePath(
      path
    )
  );
}

export function normalizeCanonicalPath(
  path = "/"
) {
  return (
    coreNormalizeCanonicalPath(
      path
    ) ||
    coreNormalizePath(
      path
    ) ||
    fallbackNormalizePath(
      path
    )
  );
}

export function getCurrentCanonicalPath() {
  if (
    !isBrowser()
  ) {
    return "/";
  }

  const raw =
    `${window.location.pathname || "/"}${window.location.search || ""}`;

  return normalizeCanonicalPath(
    raw
  );
}

export function configLikeRoute(
  path = "/"
) {
  return normalizePath(
    path || "/"
  );
}

export function isAuthRoute(
  pathname = isBrowser()
    ? window.location.pathname
    : "/"
) {
  const path =
    normalizeCanonicalPath(
      pathname
    ).toLowerCase();

  return [
    "/login",
    "/signin",
    "/auth",
    "/auth/login",
    "/forgot-password",
    "/reset-password",
    "/recover",
    "/2fa",
    "/otp",
  ].includes(path);
}

export function isSafeRelativePath(
  path = ""
) {
  const raw =
    safeText(path);

  if (!raw) {
    return false;
  }

  if (
    !raw.startsWith("/")
  ) {
    return false;
  }

  if (
    raw.startsWith("//")
  ) {
    return false;
  }

  if (
    /^[a-z][a-z0-9+.-]*:/i.test(
      raw
    )
  ) {
    return false;
  }

  if (
    /[\r\n\t]/.test(
      raw
    )
  ) {
    return false;
  }

  return true;
}

export function sanitizeRedirectPath(
  path = "/"
) {
  const candidate =
    normalizePath(
      path
    );

  if (
    isSafeRelativePath(
      candidate
    )
  ) {
    return candidate;
  }

  return "/";
}

/* =========================================================
   USER / TOKEN
========================================================= */

export function sanitizeUsername(
  value = ""
) {
  try {
    if (
      typeof AppCore?.utils
        ?.sanitizeUsername ===
      "function"
    ) {
      return AppCore.utils.sanitizeUsername(
        value
      );
    }
  } catch {}

  return String(
    value || ""
  )
    .trim()
    .replace(
      /^@+/,
      ""
    )
    .replace(
      /\s+/g,
      ""
    )
    .replace(
      /[^a-zA-Z0-9._-]/g,
      ""
    )
    .toLowerCase()
    .slice(
      0,
      safeNumber(
        AUTH_CONSTANTS?.identifierMaxLength,
        160
      )
    );
}

export function slugify(
  value = ""
) {
  try {
    if (
      typeof AppCore?.utils
        ?.slugify ===
      "function"
    ) {
      return AppCore.utils.slugify(
        value
      );
    }
  } catch {}

  return String(
    value || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9._-]+/g,
      "-"
    )
    .replace(
      /-{2,}/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

export function normalizeTokenValue(
  token = null
) {
  if (
    token === null ||
    token === undefined
  ) {
    return null;
  }

  const normalized =
    String(token)
      .trim()
      .slice(
        0,
        safeNumber(
          AUTH_CONSTANTS?.tokenMaxLength,
          4096
        )
      );

  return normalized ||
    null;
}

export function normalizeSessionValue(
  value = null,
  maxLength =
    AUTH_CONSTANTS?.sessionValueMaxLength
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value)
      .trim()
      .slice(
        0,
        safeNumber(
          maxLength,
          200
        )
      );

  return normalized ||
    null;
}

export function hasValidToken(
  token = AppCore?.state?.token
) {
  return Boolean(
    normalizeTokenValue(
      token
    )
  );
}

/* =========================================================
   ERROR HELPERS
========================================================= */

export function extractMessage(
  error
) {
  if (!error) {
    return "Error de autenticación";
  }

  if (
    typeof error ===
    "string"
  ) {
    return error;
  }

  const candidates = [
    error?.data?.message,
    error?.data?.mensaje,
    error?.data?.detail,
    error?.data?.error,

    error?.response?.data
      ?.message,
    error?.response?.data
      ?.mensaje,
    error?.response?.data
      ?.detail,
    error?.response?.data
      ?.error,

    error?.message,
    error?.statusText,
  ];

  for (const item of candidates) {
    const text =
      safeText(
        item
      );

    if (text) {
      return text;
    }
  }

  return "Error de autenticación";
}

export function buildErrorPayload(
  error
) {
  return {
    error,
    message:
      extractMessage(
        error
      ),
  };
}
