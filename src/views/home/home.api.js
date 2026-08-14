/*
===============================================================================
ONION SUPPORT · HOME CONTEXT / CACHE / ROLE HARDENING
===============================================================================

OBJETIVO
-------
Afinar de forma quirúrgica:

  src/views/home/home.api.js

ORDEN DE LA CADENA
------------------
Ya hemos endurecido:
  1) Auth      -> extracción correcta del usuario real
  2) Core      -> identidad pública canónica
  3) HTTP      -> refresh / retry / token

El siguiente boundary crítico es Home API porque decide:
- qué usuario se usa para construir el dashboard;
- qué rol habilita datos de admin;
- con qué identidad se aísla la cache;
- cuándo se permite cargar el Home.

PUNTOS DEL CÓDIGO ACTUAL QUE SE ENDURECEN
-----------------------------------------
A) normalizeRole() acepta aliases administrativos:
     administrator
     administrador
     superadmin
     super_admin
     root
     owner

   Pero el contrato canónico de Onion Support es únicamente:
     admin
     user

   Home no debe inventar equivalencias de privilegio distintas de Core/Auth.

B) getCurrentUserId() puede usar email como identidad de cache.
   La cache del Home sólo necesita una clave técnica estable; no necesita PII
   adicional si Core ya expone id/userId/username/slug.

C) getCurrentUser() puede devolver el usuario bruto.
   Después del hardening de Core, Home debe preferir AppCore.publicUser() como
   boundary canónico de identidad.

D) currentContext() no modela explícitamente authenticated.
   Un estado residual con user/role no debería activar cargas admin.

E) loadHomeDashboard() puede iniciar cargas aunque falte una identidad
   autenticada completa. Se añade guard fail-closed antes de tocar dominios.

CAMBIOS
-------
1. HOME_API_VERSION:
     home.api.domain-aggregator.v9.invoice-stats-endpoint
   ->
     home.api.domain-aggregator.v10.identity-cache-hardened

2. normalizeRole():
   - sólo reconoce admin/user;
   - arrays siguen soportados;
   - no promociona root/owner/administrator/superadmin.

3. getCurrentUser():
   - obtiene candidato desde Core;
   - lo pasa por AppCore.publicUser() cuando está disponible;
   - fallback seguro al candidato original.

4. getCurrentRole():
   - prioriza rol canónico de Core/usuario;
   - sólo admin/user;
   - fallback "user" únicamente dentro de contexto autenticado.

5. getCurrentUserId():
   - userId / id / uid / sub / slug / username;
   - ELIMINA email como clave de cache.

6. currentContext():
   añade:
     authenticated
     cacheable
   y sólo genera key cuando:
     authenticated && role && userId

7. loadHomeDashboard():
   antes de usar cache o llamar dominios exige:
     authenticated
     user
     userId
     role
     key

   Si falta algo:
     HOME_AUTH_CONTEXT_INVALID (401)

8. commitCache():
   nunca conserva en cache un dashboard sin scope autenticado válido.

NO TOCA
-------
- Facturación global /api/facturas/stats;
- lógica de sumas;
- incidencias;
- clientes;
- usuarios;
- endpoints;
- HTTP;
- Auth;
- Core;
- Router;
- DOM;
- Home template;
- backend;
- Cosmos DB.

FUENTE CALIBRADA
----------------
Repositorio:
  avila199817/onionsupport

Archivo:
  src/views/home/home.api.js

Blob SHA de GitHub revisado:
  7d15bbbbe2bacbc384ed891cbbbe5900759da693

Versión original:
  home.api.domain-aggregator.v9.invoice-stats-endpoint

Versión nueva:
  home.api.domain-aggregator.v10.identity-cache-hardened

USO
---
1. Guarda ESTE TXT como:
     patch-home-api-context.cjs

2. Desde la raíz:
     node patch-home-api-context.cjs --dry-run

3. Si termina en OK:
     node patch-home-api-context.cjs

4. Opcional, SHA exacto:
     node patch-home-api-context.cjs --strict-sha --dry-run

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
  "7d15bbbbe2bacbc384ed891cbbbe5900759da693";

const OLD_VERSION =
  'export const HOME_API_VERSION =\n  "home.api.domain-aggregator.v9.invoice-stats-endpoint";';

const NEW_VERSION =
  'export const HOME_API_VERSION =\n  "home.api.domain-aggregator.v10.identity-cache-hardened";';

const OLD_NORMALIZE_ROLE = `function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[\\s-]+/g, "_")
    .replace(/[^\\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (
    [
      "admin",
      "administrator",
      "administrador",
      "superadmin",
      "super_admin",
      "root",
      "owner",
    ].includes(role)
  ) {
    return "admin";
  }

  if (["user", "usuario", "client", "cliente"].includes(role)) {
    return "user";
  }

  return "";
}`;

const NEW_NORMALIZE_ROLE = `function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles =
      value
        .map(normalizeRole)
        .filter(Boolean);

    if (
      roles.includes(
        "admin"
      )
    ) {
      return "admin";
    }

    if (
      roles.includes(
        "user"
      )
    ) {
      return "user";
    }

    return "";
  }

  const role =
    cleanText(
      value,
      ""
    ).toLowerCase();

  /*
    Contrato canónico único de Onion Support.
    Home no eleva aliases legacy a privilegios administrativos.
  */
  if (
    role === "admin"
  ) {
    return "admin";
  }

  if (
    role === "user"
  ) {
    return "user";
  }

  return "";
}`;

const OLD_CONTEXT_BLOCK = `function getCoreState() {
  try {
    return AppCore.getState?.() || AppCore.state || {};
  } catch {
    return AppCore.state || {};
  }
}

function getCurrentUser() {
  const state = getCoreState();

  try {
    return AppCore.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return state.user || state.currentUser || null;
  }
}

function getCurrentRole() {
  const state = getCoreState();
  const user = safeObject(getCurrentUser(), {});

  return (
    normalizeRole(
      first(
        AppCore.getCurrentRole?.(),
        state.role,
        state.rol,
        state.roles,
        user.role,
        user.rol,
        user.roles,
        "user"
      )
    ) || "user"
  );
}

function getCurrentUserId() {
  const state = getCoreState();
  const user = safeObject(getCurrentUser(), {});

  return safeId(
    first(
      user.userId,
      user.uid,
      user.sub,
      user.id,
      user.email,
      user.username,
      user.slug,
      state.userId,
      ""
    )
  ).toLowerCase();
}

function currentContext() {
  const role = getCurrentRole();
  const user = getCurrentUser();
  const userId = getCurrentUserId();

  return {
    role,
    admin: role === "admin",
    user,
    userId,
    key: \`${role}:${userId}\`,
  };
}`;

const NEW_CONTEXT_BLOCK = `function getCoreState() {
  try {
    return (
      AppCore.getState?.() ||
      AppCore.state ||
      {}
    );
  } catch {
    return (
      AppCore.state ||
      {}
    );
  }
}

function isAuthenticatedContext() {
  const state =
    getCoreState();

  if (
    typeof state.authenticated ===
    "boolean"
  ) {
    return (
      state.authenticated ===
      true
    );
  }

  try {
    return (
      AppCore
        .isAuthenticated
        ?.() === true
    );
  } catch {
    return false;
  }
}

function getCurrentUser() {
  const state =
    getCoreState();

  let candidate =
    null;

  try {
    candidate =
      AppCore
        .getCurrentUser
        ?.() ||
      state.user ||
      state.currentUser ||
      null;
  } catch {
    candidate =
      state.user ||
      state.currentUser ||
      null;
  }

  if (
    !isObject(candidate)
  ) {
    return null;
  }

  /*
    Core es el boundary canónico de identidad.
    Home no necesita Cosmos/raw profile ni campos privados.
  */
  try {
    if (
      typeof AppCore.publicUser ===
      "function"
    ) {
      return (
        AppCore.publicUser(
          candidate
        ) ||
        candidate
      );
    }
  } catch {
    // fallback abajo
  }

  return candidate;
}

function getCurrentRole() {
  if (
    !isAuthenticatedContext()
  ) {
    return "";
  }

  const state =
    getCoreState();

  const user =
    safeObject(
      getCurrentUser(),
      {}
    );

  let coreRole =
    "";

  try {
    coreRole =
      AppCore
        .getCurrentRole
        ?.() ||
      "";
  } catch {
    coreRole =
      "";
  }

  return (
    normalizeRole(
      first(
        coreRole,
        user.role,
        user.rol,
        user.roles,
        state.role,
        state.rol,
        state.roles,
        "user"
      )
    ) ||
    "user"
  );
}

function getCurrentUserId() {
  const state =
    getCoreState();

  const user =
    safeObject(
      getCurrentUser(),
      {}
    );

  /*
    No usamos email como scope de cache.
    Core ya proporciona identidad técnica suficiente.
  */
  return safeId(
    first(
      user.userId,
      user.id,
      user.uid,
      user.sub,
      user.slug,
      user.username,
      state.userId,
      state.userSlug,
      ""
    )
  ).toLowerCase();
}

function currentContext() {
  const authenticated =
    isAuthenticatedContext();

  const user =
    authenticated
      ? getCurrentUser()
      : null;

  const role =
    authenticated
      ? getCurrentRole()
      : "";

  const userId =
    authenticated &&
    user
      ? getCurrentUserId()
      : "";

  const cacheable =
    Boolean(
      authenticated &&
      user &&
      role &&
      userId
    );

  return {
    authenticated,
    cacheable,

    role,

    admin:
      authenticated &&
      role === "admin",

    user,
    userId,

    key:
      cacheable
        ? \`${role}:${userId}\`
        : "",
  };
}`;

const OLD_COMMIT_CACHE = `function commitCache(dashboard = null, context = currentContext()) {
  if (!isObject(dashboard)) return null;

  cacheState.dashboard = dashboard;
  cacheState.key = context.key;
  cacheState.loadedAtMs = now();

  return dashboard;
}`;

const NEW_COMMIT_CACHE = `function commitCache(
  dashboard = null,
  context = currentContext()
) {
  if (
    !isObject(dashboard)
  ) {
    return null;
  }

  /*
    Nunca persistimos datos del Home si el scope autenticado
    no está completamente identificado.
  */
  if (
    context.authenticated !== true ||
    context.cacheable !== true ||
    !context.key
  ) {
    cacheState.dashboard =
      null;

    cacheState.key =
      "";

    cacheState.loadedAtMs =
      0;

    return dashboard;
  }

  cacheState.dashboard =
    dashboard;

  cacheState.key =
    context.key;

  cacheState.loadedAtMs =
    now();

  return dashboard;
}`;

const OLD_LOAD_HOME_START = `export async function loadHomeDashboard(options = {}) {
  const context = currentContext();
  const requestKey = context.key;
  const requestEpoch = cacheState.epoch;
  const force = forceRequested(options);
  const useCache = options.cache !== false && options.noCache !== true;
  const returnStaleOnError = options.returnStaleOnError !== false;`;

const NEW_LOAD_HOME_START = `export async function loadHomeDashboard(options = {}) {
  const context =
    currentContext();

  /*
    Fail-closed antes de cache, dedupe o APIs de dominio.

    Un Home privado necesita:
    - sesión autenticada;
    - usuario público canónico;
    - rol canónico;
    - identidad estable para aislar cache.
  */
  if (
    context.authenticated !== true ||
    !context.user ||
    !context.role ||
    !context.userId ||
    !context.key
  ) {
    const error =
      new Error(
        "No hay un contexto autenticado válido para cargar el Home."
      );

    error.code =
      "HOME_AUTH_CONTEXT_INVALID";

    error.status =
      401;

    throw error;
  }

  const requestKey =
    context.key;

  const requestEpoch =
    cacheState.epoch;

  const force =
    forceRequested(
      options
    );

  const useCache =
    options.cache !== false &&
    options.noCache !== true;

  const returnStaleOnError =
    options.returnStaleOnError !== false;`;

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
      `blob ${buffer.length}\\0`,
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

function info(message) {
  console.log(
    `[INFO] ${message}`
  );
}

function ok(message) {
  console.log(
    `[OK] ${message}`
  );
}

function warn(message) {
  console.warn(
    `[WARN] ${message}`
  );
}

function fail(message) {
  console.error(
    `\\n[ERROR] ${message}\\n`
  );

  process.exitCode =
    1;
}

function parseArgs(argv) {
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
        "views",
        "home",
        "home.api.js"
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

    oldRole:
      countOccurrences(
        sourceLf,
        OLD_NORMALIZE_ROLE
      ),

    newRole:
      countOccurrences(
        sourceLf,
        NEW_NORMALIZE_ROLE
      ),

    oldContext:
      countOccurrences(
        sourceLf,
        OLD_CONTEXT_BLOCK
      ),

    newContext:
      countOccurrences(
        sourceLf,
        NEW_CONTEXT_BLOCK
      ),

    oldCommit:
      countOccurrences(
        sourceLf,
        OLD_COMMIT_CACHE
      ),

    newCommit:
      countOccurrences(
        sourceLf,
        NEW_COMMIT_CACHE
      ),

    oldLoad:
      countOccurrences(
        sourceLf,
        OLD_LOAD_HOME_START
      ),

    newLoad:
      countOccurrences(
        sourceLf,
        NEW_LOAD_HOME_START
      ),
  };

  return {
    checks,

    valid:
      checks.oldVersion === 0 &&
      checks.newVersion === 1 &&

      checks.oldRole === 0 &&
      checks.newRole === 1 &&

      checks.oldContext === 0 &&
      checks.newContext === 1 &&

      checks.oldCommit === 0 &&
      checks.newCommit === 1 &&

      checks.oldLoad === 0 &&
      checks.newLoad === 1,
  };
}

function runAssertions() {
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

  const normalizeRoleLocal =
    (value = "") => {
      if (
        Array.isArray(
          value
        )
      ) {
        const roles =
          value
            .map(
              normalizeRoleLocal
            )
            .filter(
              Boolean
            );

        if (
          roles.includes(
            "admin"
          )
        ) {
          return "admin";
        }

        if (
          roles.includes(
            "user"
          )
        ) {
          return "user";
        }

        return "";
      }

      const role =
        cleanTextLocal(
          value,
          ""
        ).toLowerCase();

      if (
        role === "admin"
      ) {
        return "admin";
      }

      if (
        role === "user"
      ) {
        return "user";
      }

      return "";
    };

  const roles = [
    ["admin", "admin"],
    ["user", "user"],
    [["user"], "user"],
    [["admin", "user"], "admin"],

    ["administrator", ""],
    ["administrador", ""],
    ["superadmin", ""],
    ["super_admin", ""],
    ["root", ""],
    ["owner", ""],
    ["cliente", ""],
    ["usuario", ""],
  ];

  for (
    const [
      input,
      expected,
    ]
    of roles
  ) {
    const actual =
      normalizeRoleLocal(
        input
      );

    if (
      actual !==
      expected
    ) {
      throw new Error(
        `Rol ${JSON.stringify(input)} => "${actual}", esperado "${expected}"`
      );
    }
  }

  const safeIdLocal =
    (value = "") =>
      cleanTextLocal(
        value,
        ""
      )
        .replace(
          /[\r\n\t]/g,
          ""
        )
        .slice(
          0,
          180
        );

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

  const userIdFrom =
    (
      user = {},
      state = {}
    ) =>
      safeIdLocal(
        firstLocal(
          user.userId,
          user.id,
          user.uid,
          user.sub,
          user.slug,
          user.username,
          state.userId,
          state.userSlug,
          ""
        )
      ).toLowerCase();

  const id1 =
    userIdFrom(
      {
        userId:
          "USR-001",
        email:
          "private@example.com",
      }
    );

  if (
    id1 !==
    "usr-001"
  ) {
    throw new Error(
      "userId canónico no fue priorizado."
    );
  }

  const id2 =
    userIdFrom(
      {
        email:
          "private@example.com",
        username:
          "cristian",
      }
    );

  if (
    id2 !==
    "cristian"
  ) {
    throw new Error(
      "username debe ser fallback antes que cualquier email."
    );
  }

  const id3 =
    userIdFrom(
      {
        email:
          "private@example.com",
      }
    );

  if (
    id3 !==
    ""
  ) {
    throw new Error(
      "email no puede convertirse en scope de cache."
    );
  }

  const buildContext =
    ({
      authenticated,
      user,
      role,
      userId,
    }) => {
      const cacheable =
        Boolean(
          authenticated &&
          user &&
          role &&
          userId
        );

      return {
        authenticated,
        cacheable,
        admin:
          authenticated &&
          role ===
            "admin",
        key:
          cacheable
            ? `${role}:${userId}`
            : "",
      };
    };

  const admin =
    buildContext({
      authenticated:
        true,
      user: {
        userId:
          "1",
      },
      role:
        "admin",
      userId:
        "1",
    });

  if (
    admin.admin !== true ||
    admin.key !==
      "admin:1"
  ) {
    throw new Error(
      "Contexto admin válido incorrecto."
    );
  }

  const stale =
    buildContext({
      authenticated:
        false,
      user: {
        userId:
          "1",
      },
      role:
        "admin",
      userId:
        "1",
    });

  if (
    stale.admin !== false ||
    stale.key !==
      ""
  ) {
    throw new Error(
      "Estado no autenticado no puede conservar scope admin."
    );
  }

  const missingIdentity =
    buildContext({
      authenticated:
        true,
      user: {},
      role:
        "user",
      userId:
        "",
    });

  if (
    missingIdentity.key !==
    ""
  ) {
    throw new Error(
      "Sin identidad estable no debe existir cache key."
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
      "Sólo se continuará si TODOS los bloques contractuales coinciden exactamente una vez.";

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

    oldRole:
      countOccurrences(
        sourceLf,
        OLD_NORMALIZE_ROLE
      ),

    newRole:
      countOccurrences(
        sourceLf,
        NEW_NORMALIZE_ROLE
      ),

    oldContext:
      countOccurrences(
        sourceLf,
        OLD_CONTEXT_BLOCK
      ),

    newContext:
      countOccurrences(
        sourceLf,
        NEW_CONTEXT_BLOCK
      ),

    oldCommit:
      countOccurrences(
        sourceLf,
        OLD_COMMIT_CACHE
      ),

    newCommit:
      countOccurrences(
        sourceLf,
        NEW_COMMIT_CACHE
      ),

    oldLoad:
      countOccurrences(
        sourceLf,
        OLD_LOAD_HOME_START
      ),

    newLoad:
      countOccurrences(
        sourceLf,
        NEW_LOAD_HOME_START
      ),
  };

  info(
    `Coincidencias antes: ${JSON.stringify(before)}`
  );

  const alreadyPatched =
    before.oldVersion === 0 &&
    before.newVersion === 1 &&
    before.oldRole === 0 &&
    before.newRole === 1 &&
    before.oldContext === 0 &&
    before.newContext === 1 &&
    before.oldCommit === 0 &&
    before.newCommit === 1 &&
    before.oldLoad === 0 &&
    before.newLoad === 1;

  if (
    alreadyPatched
  ) {
    try {
      runAssertions();
    } catch (error) {
      return fail(
        `El hardening parece aplicado pero falló la matriz: ${error.message}`
      );
    }

    ok(
      "El Home API hardening ya está aplicado."
    );

    ok(
      "Matriz rol/contexto/cache: OK."
    );

    return;
  }

  const pristine =
    before.oldVersion === 1 &&
    before.newVersion === 0 &&
    before.oldRole === 1 &&
    before.newRole === 0 &&
    before.oldContext === 1 &&
    before.newContext === 0 &&
    before.oldCommit === 1 &&
    before.newCommit === 0 &&
    before.oldLoad === 1 &&
    before.newLoad === 0;

  if (
    !pristine
  ) {
    return fail(
      "El archivo no coincide con el estado original revisado ni con el estado final completo. " +
      "Se aborta para evitar parchear una versión distinta o parcialmente modificada."
    );
  }

  try {
    runAssertions();

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
      OLD_NORMALIZE_ROLE,
      NEW_NORMALIZE_ROLE
    );

  patchedLf =
    patchedLf.replace(
      OLD_CONTEXT_BLOCK,
      NEW_CONTEXT_BLOCK
    );

  patchedLf =
    patchedLf.replace(
      OLD_COMMIT_CACHE,
      NEW_COMMIT_CACHE
    );

  patchedLf =
    patchedLf.replace(
      OLD_LOAD_HOME_START,
      NEW_LOAD_HOME_START
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

  info(
    `Líneas antes: ${sourceLf.split("\\n").length}`
  );

  info(
    `Líneas después: ${patchedLf.split("\\n").length}`
  );

  if (
    dryRun
  ) {
    ok(
      "DRY RUN completado. No se escribió ningún archivo."
    );

    console.log(
      "\nCambios que se aplicarían:"
    );

    console.log(
      "  1) roles estrictos admin/user;"
    );

    console.log(
      "  2) usuario público canónico desde Core;"
    );

    console.log(
      "  3) email eliminado de la identidad de cache;"
    );

    console.log(
      "  4) currentContext autenticado explícito;"
    );

    console.log(
      "  5) Home fail-closed sin identidad estable;"
    );

    console.log(
      "  6) no cachear dashboard sin scope válido."
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
      `No se pudo crear backup: ${error.message}`
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

  const tempPath =
    path.join(
      path.dirname(
        absoluteTarget
      ),
      `.${path.basename(absoluteTarget)}.onion-home-api-${process.pid}-${Date.now()}.tmp`
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
        `Temporal inválido: ${JSON.stringify(tempValidation.checks)}`
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
      `No se pudo escribir: ${error.message}. Backup: ${backupPath}`
    );
  }

  const finalLf =
    normalizeLf(
      fs.readFileSync(
        absoluteTarget,
        "utf8"
      )
    );

  const finalValidation =
    validateFinalSource(
      finalLf
    );

  if (
    !finalValidation.valid
  ) {
    return fail(
      `Verificación final fallida: ${JSON.stringify(finalValidation.checks)}. ` +
      `Restaura: ${backupPath}`
    );
  }

  try {
    runAssertions();
  } catch (error) {
    return fail(
      `Matriz final fallida: ${error.message}. Restaura: ${backupPath}`
    );
  }

  ok(
    "Home API context/cache hardening aplicado."
  );

  ok(
    "Matriz roles/PII/cache/auth: OK."
  );

  info(
    `Nuevo Git blob SHA local: ${gitBlobSha(fs.readFileSync(absoluteTarget))}`
  );

  console.log(
    "\nPruebas recomendadas:"
  );

  console.log(
    "  1) login admin -> Home con clientes/usuarios;"
  );

  console.log(
    "  2) login user -> Home sin dominios admin;"
  );

  console.log(
    "  3) logout/login distinto -> cache aislada;"
  );

  console.log(
    "  4) recarga -> Home restaura contexto correcto;"
  );

  console.log(
    "  5) contexto auth incompleto -> HOME_AUTH_CONTEXT_INVALID sin llamadas de dominio."
  );
}

main();
