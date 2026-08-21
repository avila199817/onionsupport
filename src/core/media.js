/* =========================================================
   Onion Support - Runtime Media URL Policy
   Archivo: /src/core/media.js

   Responsabilidad:
   - Política única para imágenes runtime del shell privado.
   - Permitir assets locales, object URLs y hosts de imagen conocidos.
   - Permitir SAS únicamente en Azure Blob Storage.
   - Rechazar credenciales/tokens de aplicación en URLs de imagen.
   - Sin HTTP, storage, auth ni efectos secundarios.
========================================================= */

import {
  SENSITIVE_QUERY_PARAMS,
} from "./config.js";

export const MEDIA_URL_POLICY_VERSION =
  "core.media.runtime-url.v1";

const AZURE_BLOB_SUFFIX =
  ".blob.core.windows.net";

const ONION_API_HOST =
  "api.onionsupport.com";

const SENSITIVE_KEYS = new Set(
  (
    Array.isArray(SENSITIVE_QUERY_PARAMS)
      ? SENSITIVE_QUERY_PARAMS
      : []
  )
    .map(normalizeKey)
    .filter(Boolean)
);

const AZURE_SAS_ALLOWED_SENSITIVE_KEYS =
  new Set([
    "sig",
    "signature",
  ]);

function text(
  value = "",
  fallback = ""
) {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKey(
  value = ""
) {
  return text(value)
    .replace(/[-_\s]/g, "")
    .toLowerCase();
}

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isSameOrigin(
  url = null
) {
  return Boolean(
    url &&
    isBrowser() &&
    url.origin === window.location.origin
  );
}

export function isAzureBlobHostname(
  hostname = ""
) {
  const host = text(hostname)
    .toLowerCase();

  return Boolean(
    host &&
    host.endsWith(AZURE_BLOB_SUFFIX)
  );
}

export function isOnionMediaHostname(
  hostname = ""
) {
  const host = text(hostname)
    .toLowerCase();

  return Boolean(
    host === ONION_API_HOST ||
    host.endsWith(".onionsupport.com")
  );
}

function hasDisallowedCredential(
  url = null,
  {
    allowAzureBlobSas = true,
  } = {}
) {
  if (!url) {
    return true;
  }

  const azureBlob =
    isAzureBlobHostname(
      url.hostname
    );

  for (
    const key of url.searchParams.keys()
  ) {
    const normalized =
      normalizeKey(key);

    if (
      !SENSITIVE_KEYS.has(
        normalized
      )
    ) {
      continue;
    }

    if (
      allowAzureBlobSas &&
      azureBlob &&
      AZURE_SAS_ALLOWED_SENSITIVE_KEYS.has(
        normalized
      )
    ) {
      continue;
    }

    return true;
  }

  return false;
}

function safeRelativeImageUrl(
  raw = ""
) {
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw)
  ) {
    return "";
  }

  try {
    const url = new URL(
      raw,
      "https://onionsupport.local"
    );

    if (
      hasDisallowedCredential(
        url,
        {
          allowAzureBlobSas: false,
        }
      )
    ) {
      return "";
    }
  } catch {
    return "";
  }

  return raw.replace(/\/{2,}/g, "/") || "";
}

export function sanitizeRuntimeImageUrl(
  value = "",
  {
    allowRelative = true,
    allowBlobObjectUrl = true,
    allowSameOrigin = true,
    allowOnionApi = true,
    allowAzureBlob = true,
    allowAzureBlobSas = true,
  } = {}
) {
  const raw =
    text(value, "");

  if (
    !raw ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(raw)
  ) {
    return "";
  }

  if (
    allowBlobObjectUrl &&
    /^blob:/i.test(raw)
  ) {
    return raw;
  }

  if (
    allowRelative &&
    raw.startsWith("/")
  ) {
    return safeRelativeImageUrl(raw);
  }

  if (!/^https?:\/\//i.test(raw)) {
    return "";
  }

  try {
    const url =
      new URL(raw);

    const sameOrigin =
      allowSameOrigin &&
      isSameOrigin(url);

    const onionHost =
      allowOnionApi &&
      isOnionMediaHostname(
        url.hostname
      );

    const azureBlob =
      allowAzureBlob &&
      isAzureBlobHostname(
        url.hostname
      );

    if (
      !sameOrigin &&
      !onionHost &&
      !azureBlob
    ) {
      return "";
    }

    if (
      url.protocol !== "https:" &&
      !sameOrigin
    ) {
      return "";
    }

    if (
      hasDisallowedCredential(
        url,
        {
          allowAzureBlobSas:
            allowAzureBlobSas &&
            azureBlob,
        }
      )
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

export function isSafeRuntimeImageUrl(
  value = "",
  options = {}
) {
  return Boolean(
    sanitizeRuntimeImageUrl(
      value,
      options
    )
  );
}

export default Object.freeze({
  version:
    MEDIA_URL_POLICY_VERSION,

  sanitizeRuntimeImageUrl,
  isSafeRuntimeImageUrl,
  isAzureBlobHostname,
  isOnionMediaHostname,
});
