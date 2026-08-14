/*
===============================================================================
ONION SUPPORT · HTTP AUTH/REFRESH CONTRACT HARDENING
===============================================================================

OBJETIVO
-------
Afinar de forma quirúrgica:

  src/core/http.js

Este es el siguiente boundary crítico después de:
  1) src/features/auth/index.js
  2) src/core/index.js

HTTP es quien controla:
- access token en requests privadas;
- refresh automático single-flight;
- aplicación del payload de refresh al Core;
- retry único de la request original;
- limpieza de sesión ante fallos auth finales.

PROBLEMAS QUE ENDURECE
----------------------
A) Extracción de access token:
   La versión actual reconoce token/accessToken/access_token en varios niveles,
   pero no todos los envelopes razonables (por ejemplo auth.*).

B) Doble escritura del token durante refresh:
   applyAuthPayload() llama primero setAuthTokens() y después
   appCore.applySession(payload). Ambos pueden escribir el mismo token.

C) Refresh HTTP 200 sin access token:
   Actualmente podría contarse como refresh correcto y continuar al retry
   aunque no exista un token nuevo utilizable.

D) 401 en el retry DESPUÉS de refrescar:
   fetchParsedWithRefresh() devuelve directamente fetchParsed() en el retry.
   Si ese retry vuelve a dar 401, el error sale sin pasar otra vez por el
   catch que limpia una sesión final. Después de un refresh válido, un segundo
   401 debe tratarse como sesión no utilizable y cerrarse fail-closed.

CAMBIOS
-------
1. HTTP_VERSION:
     core.http.refresh.blob.v6-hardened
   ->
     core.http.refresh.blob.v6.1-auth-contract-hardened

2. Añade extractAccessTokenFromPayload():
   - token directo;
   - accessToken;
   - access_token;
   - data.*;
   - payload.*;
   - result.*;
   - auth.*;
   - data.auth.*;
   - payload.auth.*;
   - result.auth.*;
   - también acepta token string directo.

3. setAuthTokens() usa un único extractor canónico.

4. applyAuthPayload():
   - evita la doble escritura token + applySession;
   - normaliza token en raíz para AppCore.applySession();
   - conserva user/session del payload;
   - si no existe applySession, hace fallback sólo al token.

5. runRefresh():
   - exige un access token nuevo y válido antes de declarar refresh OK;
   - un HTTP 200 sin token se convierte en REFRESH_RESPONSE_INVALID (401);
   - no aplica al Core un refresh incompleto;
   - sólo incrementa refreshSuccess tras validar/aplicar.

6. Retry después de refresh:
   - ahora se hace con await dentro de try/catch;
   - un segundo 401 en una request autenticada limpia Core fail-closed;
   - un 403 NO se interpreta automáticamente como sesión inválida;
   - códigos finales ya existentes siguen usando la política actual.

NO TOCA
-------
- URLs/endpoints;
- backend;
- Cosmos DB;
- Router;
- Auth;
- Core identity;
- Home;
- Sidebar;
- blobs/PDF;
- CORS;
- credentials include;
- timeout;
- AbortSignal;
- política single-flight;
- número máximo de retries (sigue siendo exactamente 1).

FUENTE CALIBRADA
----------------
Repositorio:
  avila199817/onionsupport

Archivo:
  src/core/http.js

Blob SHA de GitHub revisado:
  e3c4c663e29d16be606d793da61f9473783c383f

Versión original:
  core.http.refresh.blob.v6-hardened

Versión nueva:
  core.http.refresh.blob.v6.1-auth-contract-hardened

USO
---
1. Guarda ESTE TXT como:
     patch-http-auth-refresh.cjs

2. Desde la raíz del repo:
     node patch-http-auth-refresh.cjs --dry-run

3. Si termina en OK:
     node patch-http-auth-refresh.cjs

4. Opcional, exigir SHA exacto:
     node patch-http-auth-refresh.cjs --strict-sha --dry-run

El parche:
- detecta versión original / ya aplicada;
- exige coincidencias exactas y únicas;
- crea backup;
- escribe con archivo temporal + rename;
- relee y verifica el resultado;
- ejecuta matriz funcional aislada.

===============================================================================
*/

"use strict";

const fs =
  require("node:fs");

const path =
  require("node:path");

const crypto =
  require("node:crypto");

const EXPECTED_GITHUB_BLOB_SHA =
  "e3c4c663e29d16be606d793da61f9473783c383f";

const OLD_VERSION =
  'export const HTTP_VERSION =\n  "core.http.refresh.blob.v6-hardened";';

const NEW_VERSION =
  'export const HTTP_VERSION =\n  "core.http.refresh.blob.v6.1-auth-contract-hardened";';

const OLD_TOKEN_BLOCK = `export function setAuthTokens(
  payload = {}
) {
  const token =
    cleanToken(
      first(
        payload?.token,
        payload?.accessToken,
        payload?.access_token,
        payload?.data?.token,
        payload?.data?.accessToken,
        payload?.data?.access_token,
        payload?.payload?.token,
        payload?.payload?.accessToken,
        payload?.result?.token,
        payload?.result?.accessToken,
        ""
      )
    );

  if (token) {
    setAccessToken(
      token
    );
  }

  return {
    token,
    accessToken: token,
    access_token: token,
  };
}

function applyAuthPayload(
  payload = {}
) {
  const tokens =
    setAuthTokens(
      payload
    );

  try {
    if (
      isFunction(
        appCore?.applySession
      )
    ) {
      appCore.applySession(
        payload
      );
    }
  } catch {
    // noop
  }

  return tokens;
}`;

const NEW_TOKEN_BLOCK = `function extractAccessTokenFromPayload(
  payload = {}
) {
  if (
    typeof payload ===
    "string"
  ) {
    return cleanToken(
      payload
    );
  }

  if (
    !isObject(payload)
  ) {
    return "";
  }

  return cleanToken(
    first(
      payload.token,
      payload.accessToken,
      payload.access_token,

      payload.data?.token,
      payload.data?.accessToken,
      payload.data?.access_token,

      payload.payload?.token,
      payload.payload?.accessToken,
      payload.payload?.access_token,

      payload.result?.token,
      payload.result?.accessToken,
      payload.result?.access_token,

      payload.auth?.token,
      payload.auth?.accessToken,
      payload.auth?.access_token,

      payload.data
        ?.auth
        ?.token,
      payload.data
        ?.auth
        ?.accessToken,
      payload.data
        ?.auth
        ?.access_token,

      payload.payload
        ?.auth
        ?.token,
      payload.payload
        ?.auth
        ?.accessToken,
      payload.payload
        ?.auth
        ?.access_token,

      payload.result
        ?.auth
        ?.token,
      payload.result
        ?.auth
        ?.accessToken,
      payload.result
        ?.auth
        ?.access_token,

      ""
    )
  );
}

export function setAuthTokens(
  payload = {}
) {
  const token =
    extractAccessTokenFromPayload(
      payload
    );

  if (token) {
    setAccessToken(
      token
    );
  }

  return {
    token,
    accessToken:
      token,
    access_token:
      token,
  };
}

function applyAuthPayload(
  payload = {}
) {
  const token =
    extractAccessTokenFromPayload(
      payload
    );

  const tokens = {
    token,
    accessToken:
      token,
    access_token:
      token,
  };

  /*
    Un único write boundary:

    - si Core expone applySession(), delegamos allí token/user/session;
    - normalizamos el token en raíz para que Core no dependa del envelope;
    - si Core no expone applySession(), hacemos fallback al token.

    Así evitamos setToken() + applySession() para el mismo refresh.
  */
  if (
    isObject(payload) &&
    isFunction(
      appCore?.applySession
    )
  ) {
    try {
      appCore.applySession({
        ...payload,

        ...(token
          ? tokens
          : {}),
      });

      return tokens;
    } catch {
      // fallback abajo
    }
  }

  if (token) {
    setAccessToken(
      token
    );
  }

  return tokens;
}`;

const OLD_REFRESH_BLOCK = `async function runRefresh(
  body = {},
  options = {}
) {
  if (
    refreshPromise
  ) {
    return refreshPromise;
  }

  stats.refresh += 1;
  lastRefreshError =
    null;

  refreshPromise =
    (async () => {
      try {
        const result =
          await fetchParsed(
            AUTH_ENDPOINTS.refresh,
            {
              ...options,

              method:
                "POST",

              body:
                isPlainObject(
                  body
                )
                  ? body
                  : {},

              public: true,
              auth: false,
              noAuthHeader: true,
              noAutoRefresh: true,
              __internalRefresh:
                true,

              source:
                options.source ||
                "core.http.refresh",
            }
          );

        applyAuthPayload(
          result.data ||
          {}
        );

        stats.refreshSuccess +=
          1;

        lastRefreshAt =
          nowIso();

        lastRefreshError =
          null;

        return result.data;
      } catch (error) {
        stats.refreshError +=
          1;

        lastRefreshError = {
          code:
            error?.code ||
            "REFRESH_FAILED",

          status:
            error?.status ||
            error?.statusCode ||
            null,

          message:
            redact(
              error?.message ||
              "No se pudo renovar la sesión."
            ),

          at:
            nowIso(),
        };

        /*
          Refresh 401/403 o código final de sesión:
          limpiamos Core una sola vez.
        */
        clearCoreSessionIfFinal(
          AUTH_ENDPOINTS.refresh,
          {
            auth: false,
            public: true,
          },
          error
        );

        throw error;
      } finally {
        refreshPromise =
          null;
      }
    })();

  return refreshPromise;
}`;

const NEW_REFRESH_BLOCK = `async function runRefresh(
  body = {},
  options = {}
) {
  if (
    refreshPromise
  ) {
    return refreshPromise;
  }

  stats.refresh += 1;
  lastRefreshError =
    null;

  refreshPromise =
    (async () => {
      try {
        const result =
          await fetchParsed(
            AUTH_ENDPOINTS.refresh,
            {
              ...options,

              method:
                "POST",

              body:
                isPlainObject(
                  body
                )
                  ? body
                  : {},

              public: true,
              auth: false,
              noAuthHeader: true,
              noAutoRefresh: true,
              __internalRefresh:
                true,

              source:
                options.source ||
                "core.http.refresh",
            }
          );

        const refreshPayload =
          result.data ??
          {};

        const nextToken =
          extractAccessTokenFromPayload(
            refreshPayload
          );

        /*
          Contrato fail-closed:

          Este cliente autoriza requests privadas con Bearer access token.
          Un refresh HTTP 2xx sin un access token utilizable NO puede
          considerarse correcto, aunque la cookie HttpOnly se haya rotado.

          Si aceptáramos el 2xx vacío:
          - se reintentaría la request con el token antiguo;
          - refreshSuccess quedaría falseado;
          - la SPA podría conservar una sesión inconsistente.
        */
        if (
          !nextToken
        ) {
          throw createHttpError({
            code:
              "REFRESH_RESPONSE_INVALID",

            message:
              "La renovación de sesión no devolvió un access token válido.",

            status:
              401,

            endpoint:
              AUTH_ENDPOINTS.refresh,

            url:
              result.url,

            method:
              result.method,

            payload:
              refreshPayload,

            response:
              result.response,
          });
        }

        applyAuthPayload(
          refreshPayload
        );

        stats.refreshSuccess +=
          1;

        lastRefreshAt =
          nowIso();

        lastRefreshError =
          null;

        return refreshPayload;
      } catch (error) {
        stats.refreshError +=
          1;

        lastRefreshError = {
          code:
            error?.code ||
            "REFRESH_FAILED",

          status:
            error?.status ||
            error?.statusCode ||
            null,

          message:
            redact(
              error?.message ||
              "No se pudo renovar la sesión."
            ),

          at:
            nowIso(),
        };

        /*
          Refresh 401/403 o código final de sesión:
          limpiamos Core una sola vez.
        */
        clearCoreSessionIfFinal(
          AUTH_ENDPOINTS.refresh,
          {
            auth: false,
            public: true,
          },
          error
        );

        throw error;
      } finally {
        refreshPromise =
          null;
      }
    })();

  return refreshPromise;
}`;

const OLD_RETRY_BLOCK = `async function fetchParsedWithRefresh(
  endpoint = "/",
  options = {}
) {
  try {
    return await fetchParsed(
      endpoint,
      options
    );
  } catch (error) {
    if (
      !shouldAutoRefresh(
        endpoint,
        options,
        error
      )
    ) {
      clearCoreSessionIfFinal(
        endpoint,
        options,
        error
      );

      throw error;
    }

    await runRefresh(
      {},
      {
        timeout:
          options.refreshTimeout ??
          options.timeout ??
          options.timeoutMs ??
          DEFAULT_TIMEOUT_MS,

        source:
          "core.http.auto-refresh",
      }
    );

    stats.retryAfterRefresh +=
      1;

    return fetchParsed(
      endpoint,
      {
        ...options,

        /*
          Garantiza exactamente un retry.
          buildFetchOptions relee el token del Core,
          por lo que usa el access token renovado.
        */
        __retryAfterRefresh:
          true,
      }
    );
  }
}`;

const NEW_RETRY_BLOCK = `function clearCoreSessionAfterRefreshRetry(
  endpoint = "",
  options = {},
  error = null
) {
  const status =
    Number(
      error?.status ||
      error?.statusCode ||
      0
    );

  /*
    Si acabamos de conseguir un token nuevo y la MISMA request
    autenticada vuelve a responder 401, ya no queda otro refresh
    razonable que intentar.

    403 NO entra aquí:
    puede significar autenticación válida pero permisos insuficientes.
  */
  if (
    status === 401 &&
    shouldUseAuth(
      endpoint,
      options
    )
  ) {
    try {
      if (
        isFunction(
          appCore?.clearSession
        )
      ) {
        appCore.clearSession();

        return true;
      }
    } catch {
      // fallback abajo
    }

    clearAuthTokens();

    return true;
  }

  return clearCoreSessionIfFinal(
    endpoint,
    options,
    error
  );
}

async function fetchParsedWithRefresh(
  endpoint = "/",
  options = {}
) {
  try {
    return await fetchParsed(
      endpoint,
      options
    );
  } catch (error) {
    if (
      !shouldAutoRefresh(
        endpoint,
        options,
        error
      )
    ) {
      clearCoreSessionIfFinal(
        endpoint,
        options,
        error
      );

      throw error;
    }

    await runRefresh(
      {},
      {
        timeout:
          options.refreshTimeout ??
          options.timeout ??
          options.timeoutMs ??
          DEFAULT_TIMEOUT_MS,

        source:
          "core.http.auto-refresh",
      }
    );

    stats.retryAfterRefresh +=
      1;

    try {
      return await fetchParsed(
        endpoint,
        {
          ...options,

          /*
            Garantiza exactamente un retry.
            buildFetchOptions relee el token del Core,
            por lo que usa el access token renovado.
          */
          __retryAfterRefresh:
            true,
        }
      );
    } catch (retryError) {
      clearCoreSessionAfterRefreshRetry(
        endpoint,
        {
          ...options,
          __retryAfterRefresh:
            true,
        },
        retryError
      );

      throw retryError;
    }
  }
}`;

function countOccurrences(
  text,
  needle
) {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let offset = 0;

  while (true) {
    const index =
      text.indexOf(
        needle,
        offset
      );

    if (
      index === -1
    ) {
      break;
    }

    count += 1;

    offset =
      index +
      needle.length;
  }

  return count;
}

function normalizeLf(
  value
) {
  return String(
    value
  )
    .replace(
      /\r\n/g,
      "\n"
    )
    .replace(
      /\r/g,
      "\n"
    );
}

function restoreEol(
  value,
  eol
) {
  return eol ===
    "\r\n"
      ? value.replace(
          /\n/g,
          "\r\n"
        )
      : value;
}

function gitBlobSha(
  buffer
) {
  const header =
    Buffer.from(
      `blob ${buffer.length}\0`,
      "utf8"
    );

  return crypto
    .createHash(
      "sha1"
    )
    .update(
      header
    )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}

function timestamp() {
  const date =
    new Date();

  const pad =
    (value) =>
      String(
        value
      ).padStart(
        2,
        "0"
      );

  return [
    date.getFullYear(),
    pad(
      date.getMonth() + 1
    ),
    pad(
      date.getDate()
    ),
    "-",
    pad(
      date.getHours()
    ),
    pad(
      date.getMinutes()
    ),
    pad(
      date.getSeconds()
    ),
  ].join("");
}

function info(
  message
) {
  console.log(
    `[INFO] ${message}`
  );
}

function ok(
  message
) {
  console.log(
    `[OK] ${message}`
  );
}

function warn(
  message
) {
  console.warn(
    `[WARN] ${message}`
  );
}

function fail(
  message
) {
  console.error(
    `\n[ERROR] ${message}\n`
  );

  process.exitCode =
    1;
}

function parseArgs(
  argv
) {
  const args =
    argv.slice(2);

  const dryRun =
    args.includes(
      "--dry-run"
    );

  const strictSha =
    args.includes(
      "--strict-sha"
    );

  const positional =
    args.filter(
      (arg) =>
        !arg.startsWith(
          "--"
        )
    );

  return {
    dryRun,
    strictSha,

    target:
      positional[0] ||
      path.join(
        process.cwd(),
        "src",
        "core",
        "http.js"
      ),
  };
}

function validateFinalSource(
  sourceLf
) {
  const checks = {
    oldVersion:
      countOccurrences(
        sourceLf,
        OLD_VERSION
      ),

    newVersion:
      countOccurrences(
        sourceLf,
        NEW_VERSION
      ),

    oldTokenBlock:
      countOccurrences(
        sourceLf,
        OLD_TOKEN_BLOCK
      ),

    newTokenBlock:
      countOccurrences(
        sourceLf,
        NEW_TOKEN_BLOCK
      ),

    oldRefreshBlock:
      countOccurrences(
        sourceLf,
        OLD_REFRESH_BLOCK
      ),

    newRefreshBlock:
      countOccurrences(
        sourceLf,
        NEW_REFRESH_BLOCK
      ),

    oldRetryBlock:
      countOccurrences(
        sourceLf,
        OLD_RETRY_BLOCK
      ),

    newRetryBlock:
      countOccurrences(
        sourceLf,
        NEW_RETRY_BLOCK
      ),
  };

  return {
    checks,

    valid:
      checks.oldVersion === 0 &&
      checks.newVersion === 1 &&

      checks.oldTokenBlock === 0 &&
      checks.newTokenBlock === 1 &&

      checks.oldRefreshBlock === 0 &&
      checks.newRefreshBlock === 1 &&

      checks.oldRetryBlock === 0 &&
      checks.newRetryBlock === 1,
  };
}

function runContractAssertions() {
  /*
    Matriz aislada del contrato nuevo.
    No importa módulos ESM ni requiere DOM/fetch real.
  */

  const isObjectLocal =
    (value) =>
      Boolean(
        value &&
        typeof value ===
          "object" &&
        !Array.isArray(
          value
        )
      );

  const cleanTextLocal = (
    value = "",
    fallback = ""
  ) => {
    const output =
      String(
        value ??
        ""
      )
        .replace(
          /[\r\n\t]/g,
          " "
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    return (
      output ||
      fallback
    );
  };

  const firstLocal =
    (...values) => {
      for (
        const value
        of values
      ) {
        if (
          value === undefined ||
          value === null
        ) {
          continue;
        }

        if (
          typeof value ===
            "string" &&
          value.trim() ===
            ""
        ) {
          continue;
        }

        return value;
      }

      return null;
    };

  const cleanTokenLocal =
    (value = "") => {
      const token =
        cleanTextLocal(
          value,
          ""
        ).replace(
          /^Bearer\s+/i,
          ""
        );

      if (
        !token ||
        /\s/.test(
          token
        ) ||
        token.length >
          8192
      ) {
        return "";
      }

      if (
        [
          "null",
          "undefined",
          "false",
          "true",
          "[object object]",
          "{}",
          "[]",
        ].includes(
          token.toLowerCase()
        )
      ) {
        return "";
      }

      return token;
    };

  const extractToken =
    (payload = {}) => {
      if (
        typeof payload ===
        "string"
      ) {
        return cleanTokenLocal(
          payload
        );
      }

      if (
        !isObjectLocal(
          payload
        )
      ) {
        return "";
      }

      return cleanTokenLocal(
        firstLocal(
          payload.token,
          payload.accessToken,
          payload.access_token,

          payload.data?.token,
          payload.data?.accessToken,
          payload.data?.access_token,

          payload.payload?.token,
          payload.payload?.accessToken,
          payload.payload?.access_token,

          payload.result?.token,
          payload.result?.accessToken,
          payload.result?.access_token,

          payload.auth?.token,
          payload.auth?.accessToken,
          payload.auth?.access_token,

          payload.data
            ?.auth
            ?.token,
          payload.data
            ?.auth
            ?.accessToken,
          payload.data
            ?.auth
            ?.access_token,

          payload.payload
            ?.auth
            ?.token,
          payload.payload
            ?.auth
            ?.accessToken,
          payload.payload
            ?.auth
            ?.access_token,

          payload.result
            ?.auth
            ?.token,
          payload.result
            ?.auth
            ?.accessToken,
          payload.result
            ?.auth
            ?.access_token,

          ""
        )
      );
    };

  const tokenCases = [
    [
      "root token",
      {
        token:
          "aaa.bbb.ccc",
      },
      "aaa.bbb.ccc",
    ],

    [
      "data accessToken",
      {
        data: {
          accessToken:
            "ddd.eee.fff",
        },
      },
      "ddd.eee.fff",
    ],

    [
      "auth access_token",
      {
        auth: {
          access_token:
            "ggg.hhh.iii",
        },
      },
      "ggg.hhh.iii",
    ],

    [
      "result.auth.token",
      {
        result: {
          auth: {
            token:
              "jjj.kkk.lll",
          },
        },
      },
      "jjj.kkk.lll",
    ],

    [
      "Bearer string",
      "Bearer mmm.nnn.ooo",
      "mmm.nnn.ooo",
    ],

    [
      "vacío",
      {
        ok: true,
      },
      "",
    ],

    [
      "objeto serializado inválido",
      {
        token:
          "[object Object]",
      },
      "",
    ],
  ];

  for (
    const [
      name,
      payload,
      expected,
    ]
    of tokenCases
  ) {
    const actual =
      extractToken(
        payload
      );

    if (
      actual !==
      expected
    ) {
      throw new Error(
        `${name}: token="${actual}"`
      );
    }
  }

  /*
    Política del retry:
    - 401 tras refresh => limpiar;
    - 403 => NO limpiar sólo por el status;
    - 500 => NO limpiar sólo por el status.
  */
  const shouldForceClearAfterRetry =
    (
      status,
      authenticatedRequest = true
    ) =>
      Number(status) ===
        401 &&
      authenticatedRequest ===
        true;

  if (
    !shouldForceClearAfterRetry(
      401,
      true
    )
  ) {
    throw new Error(
      "401 post-refresh debe cerrar sesión."
    );
  }

  if (
    shouldForceClearAfterRetry(
      403,
      true
    )
  ) {
    throw new Error(
      "403 post-refresh no debe cerrar sesión automáticamente."
    );
  }

  if (
    shouldForceClearAfterRetry(
      500,
      true
    )
  ) {
    throw new Error(
      "500 post-refresh no debe cerrar sesión automáticamente."
    );
  }

  if (
    shouldForceClearAfterRetry(
      401,
      false
    )
  ) {
    throw new Error(
      "Una request no autenticada no debe cerrar sesión por esta política."
    );
  }

  return true;
}

function main() {
  const {
    dryRun,
    strictSha,
    target,
  } = parseArgs(
    process.argv
  );

  const absoluteTarget =
    path.resolve(
      target
    );

  info(
    `Objetivo: ${absoluteTarget}`
  );

  if (
    !fs.existsSync(
      absoluteTarget
    )
  ) {
    return fail(
      "No existe el archivo objetivo."
    );
  }

  let originalBuffer;

  try {
    originalBuffer =
      fs.readFileSync(
        absoluteTarget
      );
  } catch (error) {
    return fail(
      `No se pudo leer el archivo: ${error.message}`
    );
  }

  const originalText =
    originalBuffer
      .toString(
        "utf8"
      );

  const detectedEol =
    originalText.includes(
      "\r\n"
    )
      ? "\r\n"
      : "\n";

  const sourceLf =
    normalizeLf(
      originalText
    );

  const rawBlobSha =
    gitBlobSha(
      originalBuffer
    );

  const lfBlobSha =
    gitBlobSha(
      Buffer.from(
        sourceLf,
        "utf8"
      )
    );

  const matchesReviewedBlob =
    rawBlobSha ===
      EXPECTED_GITHUB_BLOB_SHA ||
    lfBlobSha ===
      EXPECTED_GITHUB_BLOB_SHA;

  info(
    `Git blob SHA actual (raw): ${rawBlobSha}`
  );

  if (
    rawBlobSha !==
    lfBlobSha
  ) {
    info(
      `Git blob SHA normalizado LF: ${lfBlobSha}`
    );
  }

  if (
    matchesReviewedBlob
  ) {
    ok(
      "El archivo coincide con el blob de GitHub revisado."
    );
  } else {
    const message =
      "El SHA no coincide con el blob revisado. " +
      "Sólo se continuará si TODOS los bloques esperados coinciden de forma exacta y única.";

    if (
      strictSha
    ) {
      return fail(
        `${message} --strict-sha impide continuar.`
      );
    }

    warn(
      message
    );
  }

  const before = {
    oldVersion:
      countOccurrences(
        sourceLf,
        OLD_VERSION
      ),

    newVersion:
      countOccurrences(
        sourceLf,
        NEW_VERSION
      ),

    oldTokenBlock:
      countOccurrences(
        sourceLf,
        OLD_TOKEN_BLOCK
      ),

    newTokenBlock:
      countOccurrences(
        sourceLf,
        NEW_TOKEN_BLOCK
      ),

    oldRefreshBlock:
      countOccurrences(
        sourceLf,
        OLD_REFRESH_BLOCK
      ),

    newRefreshBlock:
      countOccurrences(
        sourceLf,
        NEW_REFRESH_BLOCK
      ),

    oldRetryBlock:
      countOccurrences(
        sourceLf,
        OLD_RETRY_BLOCK
      ),

    newRetryBlock:
      countOccurrences(
        sourceLf,
        NEW_RETRY_BLOCK
      ),
  };

  info(
    `Coincidencias antes: ${JSON.stringify(before)}`
  );

  const alreadyPatched =
    before.oldVersion === 0 &&
    before.newVersion === 1 &&

    before.oldTokenBlock === 0 &&
    before.newTokenBlock === 1 &&

    before.oldRefreshBlock === 0 &&
    before.newRefreshBlock === 1 &&

    before.oldRetryBlock === 0 &&
    before.newRetryBlock === 1;

  if (
    alreadyPatched
  ) {
    try {
      runContractAssertions();
    } catch (error) {
      return fail(
        `El hardening parece aplicado pero falló la matriz: ${error.message}`
      );
    }

    ok(
      "El HTTP hardening ya está aplicado. No se modifica nada."
    );

    ok(
      "Matriz token/refresh/retry: OK."
    );

    return;
  }

  const pristineExpectedShape =
    before.oldVersion === 1 &&
    before.newVersion === 0 &&

    before.oldTokenBlock === 1 &&
    before.newTokenBlock === 0 &&

    before.oldRefreshBlock === 1 &&
    before.newRefreshBlock === 0 &&

    before.oldRetryBlock === 1 &&
    before.newRetryBlock === 0;

  if (
    !pristineExpectedShape
  ) {
    return fail(
      "El archivo no coincide con el estado original revisado ni con el estado final completo. " +
      "Se aborta para evitar un parche parcial o sobre otra versión."
    );
  }

  try {
    runContractAssertions();

    ok(
      "Matriz contractual previa: OK."
    );
  } catch (error) {
    return fail(
      `Falló la matriz contractual previa: ${error.message}`
    );
  }

  let patchedLf =
    sourceLf;

  patchedLf =
    patchedLf.replace(
      OLD_VERSION,
      NEW_VERSION
    );

  patchedLf =
    patchedLf.replace(
      OLD_TOKEN_BLOCK,
      NEW_TOKEN_BLOCK
    );

  patchedLf =
    patchedLf.replace(
      OLD_REFRESH_BLOCK,
      NEW_REFRESH_BLOCK
    );

  patchedLf =
    patchedLf.replace(
      OLD_RETRY_BLOCK,
      NEW_RETRY_BLOCK
    );

  const validation =
    validateFinalSource(
      patchedLf
    );

  if (
    !validation.valid
  ) {
    return fail(
      `Validación estructural fallida: ${JSON.stringify(validation.checks)}`
    );
  }

  ok(
    "Validación estructural del resultado: OK."
  );

  const beforeLines =
    sourceLf
      .split("\n")
      .length;

  const afterLines =
    patchedLf
      .split("\n")
      .length;

  info(
    `Líneas antes: ${beforeLines}`
  );

  info(
    `Líneas después: ${afterLines}`
  );

  if (
    patchedLf ===
    sourceLf
  ) {
    return fail(
      "No se detectaron cambios aunque el archivo parecía parcheable."
    );
  }

  if (
    dryRun
  ) {
    ok(
      "DRY RUN completado. El archivo NO ha sido escrito."
    );

    console.log(
      "\nCambios que se aplicarían:"
    );

    console.log(
      "  1) extractor canónico de access token."
    );

    console.log(
      "  2) applyAuthPayload sin doble escritura."
    );

    console.log(
      "  3) refresh 2xx sin token => REFRESH_RESPONSE_INVALID."
    );

    console.log(
      "  4) segundo 401 tras refresh => clearSession fail-closed."
    );

    console.log(
      "  5) 403 no cierra sesión sólo por ser 403."
    );

    console.log(
      "  6) sigue existiendo exactamente un retry."
    );

    return;
  }

  const backupPath =
    `${absoluteTarget}.bak-${timestamp()}`;

  try {
    fs.copyFileSync(
      absoluteTarget,
      backupPath,
      fs.constants.COPYFILE_EXCL
    );
  } catch (error) {
    return fail(
      `No se pudo crear el backup: ${error.message}`
    );
  }

  ok(
    `Backup creado: ${backupPath}`
  );

  const patchedText =
    restoreEol(
      patchedLf,
      detectedEol
    );

  const directory =
    path.dirname(
      absoluteTarget
    );

  const tempPath =
    path.join(
      directory,
      `.${path.basename(absoluteTarget)}.onion-http-hardening-${process.pid}-${Date.now()}.tmp`
    );

  try {
    fs.writeFileSync(
      tempPath,
      patchedText,
      {
        encoding:
          "utf8",
        flag:
          "wx",
      }
    );

    const tempLf =
      normalizeLf(
        fs.readFileSync(
          tempPath,
          "utf8"
        )
      );

    const tempValidation =
      validateFinalSource(
        tempLf
      );

    if (
      !tempValidation.valid
    ) {
      throw new Error(
        `El temporal no supera validación: ${JSON.stringify(tempValidation.checks)}`
      );
    }

    fs.renameSync(
      tempPath,
      absoluteTarget
    );
  } catch (error) {
    try {
      if (
        fs.existsSync(
          tempPath
        )
      ) {
        fs.unlinkSync(
          tempPath
        );
      }
    } catch {
      // noop
    }

    return fail(
      `No se pudo escribir el hardening: ${error.message}. Backup: ${backupPath}`
    );
  }

  let finalLf;

  try {
    finalLf =
      normalizeLf(
        fs.readFileSync(
          absoluteTarget,
          "utf8"
        )
      );
  } catch (error) {
    return fail(
      `El archivo fue escrito pero no pudo releerse: ${error.message}`
    );
  }

  const finalValidation =
    validateFinalSource(
      finalLf
    );

  if (
    !finalValidation.valid
  ) {
    return fail(
      `La verificación final falló: ${JSON.stringify(finalValidation.checks)}. ` +
      `Restaura el backup: ${backupPath}`
    );
  }

  try {
    runContractAssertions();
  } catch (error) {
    return fail(
      `La matriz funcional falló tras escribir: ${error.message}. ` +
      `Restaura el backup: ${backupPath}`
    );
  }

  const finalBuffer =
    fs.readFileSync(
      absoluteTarget
    );

  ok(
    "HTTP auth/refresh hardening aplicado correctamente."
  );

  ok(
    "Matriz token/refresh/post-refresh-401: OK."
  );

  info(
    `Nuevo Git blob SHA local: ${gitBlobSha(finalBuffer)}`
  );

  console.log(
    "\nResumen:"
  );

  console.log(
    "  - Backend/Cosmos: sin cambios."
  );

  console.log(
    "  - Auth/Core identity: sin cambios."
  );

  console.log(
    "  - Router/Home/Sidebar: sin cambios."
  );

  console.log(
    "  - HTTP: contrato refresh/retry endurecido."
  );

  console.log(
    `  - Backup: ${backupPath}`
  );

  console.log(
    "\nPruebas recomendadas tras desplegar:"
  );

  console.log(
    "  1) login admin y comprobar nombre/avatar;"
  );

  console.log(
    "  2) recarga completa con sesión persistente;"
  );

  console.log(
    "  3) dejar expirar access token y provocar una request privada;"
  );

  console.log(
    "  4) verificar un único refresh + un único retry;"
  );

  console.log(
    "  5) comprobar que un 403 de permisos NO cierra sesión;"
  );

  console.log(
    "  6) comprobar que un segundo 401 tras refresh SÍ limpia sesión."
  );
}

main();
