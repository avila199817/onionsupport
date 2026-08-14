/*
===============================================================================
ONION SUPPORT · HOTFIX FULL NAME / USER ENVELOPE
===============================================================================

OBJETIVO
-------
Corregir de forma quirúrgica:

  src/features/auth/index.js

Problema corregido:
- Los payloads de login / me / refresh contienen un usuario real dentro de
  payload.user, pero algunos envelopes también exponen role / roles / slug.
- La versión actual de extractUser() evalúa primero looksLikeUser(payload).
- Como looksLikeUser() acepta role/roles como prueba suficiente, puede tratar
  el envelope completo como si fuera el usuario.
- AppCore recibe entonces un objeto sin displayName/name/fullName en raíz y
  termina usando el fallback "Usuario".

Este hotfix:
1. Prioriza SIEMPRE los contenedores explícitos de usuario:
   user, currentUser, usuario, me y account.
2. Endurece looksLikeUser() para que role/roles por sí solos NO conviertan
   un envelope de autenticación en un usuario.
3. Mantiene compatibilidad con payloads donde el propio payload sea el usuario.
4. Mantiene compatibilidad con profile sólo cuando profile realmente tiene
   forma de usuario.
5. No toca Core, Home, Sidebar, HTTP, Router ni backend.
6. No modifica login/refresh/me salvo la extracción/normalización del usuario.
7. Hace backup, valida coincidencias únicas y escribe de forma atómica.

FUENTE CALIBRADA
----------------
Repositorio:
  avila199817/onionsupport

Archivo:
  src/features/auth/index.js

Blob SHA de GitHub revisado:
  dc4187909317f54db31fe7621fa8b455dee22c5f

Versión original detectada:
  auth.minimal.v6.1-first-hotfix

Versión de este hotfix:
  auth.minimal.v6.2-user-envelope-hotfix

USO
---
1. Guarda ESTE TXT como:
     patch-auth-fullname.cjs

2. Desde la raíz del repo:
     node patch-auth-fullname.cjs --dry-run

3. Si el dry-run termina en OK:
     node patch-auth-fullname.cjs

4. Después despliega el frontend y fuerza una recarga completa del navegador.

También puedes indicar una ruta distinta:
     node patch-auth-fullname.cjs /ruta/al/src/features/auth/index.js --dry-run
     node patch-auth-fullname.cjs /ruta/al/src/features/auth/index.js

NOTA
----
El script NO toca el archivo si:
- no encuentra exactamente una copia de los bloques esperados;
- detecta una mezcla parcial entre versión antigua y hotfix;
- no puede verificar el resultado final.

===============================================================================
*/

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const EXPECTED_GITHUB_BLOB_SHA =
  "dc4187909317f54db31fe7621fa8b455dee22c5f";

const OLD_VERSION =
  'export const AUTH_VERSION =\n  "auth.minimal.v6.1-first-hotfix";';

const NEW_VERSION =
  'export const AUTH_VERSION =\n  "auth.minimal.v6.2-user-envelope-hotfix";';

const OLD_LOOKS_LIKE_USER = `function looksLikeUser(
  value = null
) {
  if (
    !isObject(value)
  ) {
    return false;
  }

  return Boolean(
    value.id ||
    value.userId ||
    value.username ||
    value.slug ||
    value.lookup?.slug ||
    value.profile?.slug ||
    value.role ||
    value.rol ||
    Array.isArray(
      value.roles
    )
  );
}`;

const NEW_LOOKS_LIKE_USER = `function looksLikeUser(
  value = null
) {
  if (
    !isObject(value)
  ) {
    return false;
  }

  /*
    IMPORTANTE:
    Un envelope de Auth puede exponer role / roles / slug en raíz y,
    simultáneamente, contener el usuario real dentro de user/currentUser.

    Si existe un contenedor explícito de usuario, este objeto NO debe
    clasificarse como usuario por sus campos derivados de sesión/routing.
  */
  const hasEmbeddedUser =
    isObject(
      value.user
    ) ||
    isObject(
      value.currentUser
    ) ||
    isObject(
      value.usuario
    ) ||
    isObject(
      value.me
    ) ||
    isObject(
      value.account
    );

  if (
    hasEmbeddedUser
  ) {
    return false;
  }

  /*
    Identidad fuerte:
    cualquiera de estos campos identifica de forma razonable a una cuenta
    aunque el payload directo no incluya todos los campos de presentación.
  */
  const strongIdentity =
    cleanText(
      first(
        value.id,
        value.userId,
        value.uid,
        value.sub,
        value.username,
        value.userName,
        value.user_name,
        value.email,
        value.emailLower,
        value.email_lower,
        value.lookup?.emailLower,
        value.lookup?.email_lower,
        ""
      ),
      ""
    );

  if (
    strongIdentity
  ) {
    return true;
  }

  const slug =
    cleanText(
      first(
        value.slug,
        value.lookup?.slug,
        value.profile?.slug,
        value.routing?.slug,
        ""
      ),
      ""
    );

  const displayName =
    cleanText(
      first(
        value.displayName,
        value.fullName,
        value.name,
        value.nombre,
        value.profile?.displayName,
        value.profile?.publicName,
        value.profile?.name,
        ""
      ),
      ""
    );

  const role =
    normalizeRole(
      first(
        value.role,
        value.rol,
        value.roles,
        ""
      )
    );

  const hasAccountSignals =
    value.active !== undefined ||
    value.enabled !== undefined ||
    value.disabled !== undefined ||
    value.status !== undefined ||
    value.estado !== undefined ||
    value.permissions !== undefined ||
    value.permisos !== undefined ||
    value.clienteId !== undefined ||
    value.tenantId !== undefined;

  /*
    role/roles NO bastan por sí solos.
    slug o nombre sí pueden completar una forma de usuario cuando aparecen
    junto a señales propias de cuenta.
  */
  return Boolean(
    (
      slug &&
      (
        role ||
        displayName ||
        hasAccountSignals
      )
    ) ||
    (
      displayName &&
      (
        role ||
        hasAccountSignals
      )
    )
  );
}`;

const OLD_EXTRACT_USER = `function extractUser(
  payload = {}
) {
  if (
    looksLikeUser(
      payload
    )
  ) {
    return payload;
  }

  const user =
    pick(
      payload,
      [
        "user",
        "currentUser",
        "usuario",
        "me",
        "account",
        "profile",
      ]
    );

  return looksLikeUser(
    user
  )
    ? user
    : null;
}`;

const NEW_EXTRACT_USER = `function extractUser(
  payload = {}
) {
  if (
    !isObject(payload)
  ) {
    return null;
  }

  /*
    PRIORIDAD CANÓNICA:
    primero extraemos el usuario explícito del envelope.

    Esto es crítico para los contratos productivos de Onion Support:
    login / me / refresh pueden tener role, roles, slug, routing, etc.
    también en el nivel superior, pero el perfil autoritativo está en user.
  */
  const explicitUser =
    pick(
      payload,
      [
        "user",
        "currentUser",
        "usuario",
        "me",
        "account",
      ]
    );

  if (
    looksLikeUser(
      explicitUser
    )
  ) {
    return explicitUser;
  }

  /*
    Compatibilidad:
    algunos contratos legacy pueden exponer un objeto profile como usuario.
    Sólo lo aceptamos si realmente tiene forma de usuario; no por existir.
  */
  const profileUser =
    pick(
      payload,
      [
        "profile",
      ]
    );

  if (
    looksLikeUser(
      profileUser
    )
  ) {
    return profileUser;
  }

  /*
    Último fallback:
    soporta respuestas donde el propio payload ES el usuario.

    Se evalúa al final para impedir que un envelope con role/roles/slugs
    derivados eclipse a payload.user.
  */
  return looksLikeUser(
    payload
  )
    ? payload
    : null;
}`;

function countOccurrences(text, needle) {
  if (!needle) return 0;

  let count = 0;
  let offset = 0;

  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) break;

    count += 1;
    offset = index + needle.length;
  }

  return count;
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8");

  return crypto
    .createHash("sha1")
    .update(header)
    .update(buffer)
    .digest("hex");
}

function timestamp() {
  const date = new Date();

  const pad = (value) =>
    String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function fail(message) {
  console.error(`\n[ERROR] ${message}\n`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function info(message) {
  console.log(`[INFO] ${message}`);
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

function parseArgs(argv) {
  const args = argv.slice(2);

  const dryRun =
    args.includes("--dry-run");

  const strictSha =
    args.includes("--strict-sha");

  const positional =
    args.filter(
      (arg) =>
        !arg.startsWith("--")
    );

  return {
    dryRun,
    strictSha,
    target:
      positional[0] ||
      path.join(
        process.cwd(),
        "src",
        "features",
        "auth",
        "index.js"
      ),
  };
}

function normalizeLf(value) {
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function restoreEol(value, eol) {
  if (eol === "\r\n") {
    return value.replace(/\n/g, "\r\n");
  }

  return value;
}

function validateFinalSource(sourceLf) {
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

    oldLooks:
      countOccurrences(
        sourceLf,
        OLD_LOOKS_LIKE_USER
      ),

    newLooks:
      countOccurrences(
        sourceLf,
        NEW_LOOKS_LIKE_USER
      ),

    oldExtract:
      countOccurrences(
        sourceLf,
        OLD_EXTRACT_USER
      ),

    newExtract:
      countOccurrences(
        sourceLf,
        NEW_EXTRACT_USER
      ),
  };

  const valid =
    checks.oldVersion === 0 &&
    checks.newVersion === 1 &&
    checks.oldLooks === 0 &&
    checks.newLooks === 1 &&
    checks.oldExtract === 0 &&
    checks.newExtract === 1;

  return {
    valid,
    checks,
  };
}

function runCompatibilityAssertions() {
  /*
    Réplica mínima y aislada de la política nueva.
    No importa módulos del frontend ni necesita DOM.
  */

  const isObjectLocal = (value) =>
    Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    );

  const cleanTextLocal = (
    value = "",
    fallback = ""
  ) => {
    const output =
      String(value ?? "")
        .replace(/[\r\n\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return output || fallback;
  };

  const firstLocal = (...values) => {
    for (const value of values) {
      if (
        value === undefined ||
        value === null
      ) {
        continue;
      }

      if (
        typeof value === "string" &&
        value.trim() === ""
      ) {
        continue;
      }

      return value;
    }

    return null;
  };

  const normalizeRoleLocal = (
    value = ""
  ) => {
    if (Array.isArray(value)) {
      const roles =
        value
          .map(normalizeRoleLocal)
          .filter(Boolean);

      if (roles.includes("admin")) {
        return "admin";
      }

      if (roles.includes("user")) {
        return "user";
      }

      return "";
    }

    const role =
      cleanTextLocal(
        value,
        ""
      ).toLowerCase();

    return [
      "admin",
      "user",
    ].includes(role)
      ? role
      : "";
  };

  const looksLikeUserLocal = (
    value = null
  ) => {
    if (!isObjectLocal(value)) {
      return false;
    }

    const hasEmbeddedUser =
      isObjectLocal(value.user) ||
      isObjectLocal(value.currentUser) ||
      isObjectLocal(value.usuario) ||
      isObjectLocal(value.me) ||
      isObjectLocal(value.account);

    if (hasEmbeddedUser) {
      return false;
    }

    const strongIdentity =
      cleanTextLocal(
        firstLocal(
          value.id,
          value.userId,
          value.uid,
          value.sub,
          value.username,
          value.userName,
          value.user_name,
          value.email,
          value.emailLower,
          value.email_lower,
          value.lookup?.emailLower,
          value.lookup?.email_lower,
          ""
        ),
        ""
      );

    if (strongIdentity) {
      return true;
    }

    const slug =
      cleanTextLocal(
        firstLocal(
          value.slug,
          value.lookup?.slug,
          value.profile?.slug,
          value.routing?.slug,
          ""
        ),
        ""
      );

    const displayName =
      cleanTextLocal(
        firstLocal(
          value.displayName,
          value.fullName,
          value.name,
          value.nombre,
          value.profile?.displayName,
          value.profile?.publicName,
          value.profile?.name,
          ""
        ),
        ""
      );

    const role =
      normalizeRoleLocal(
        firstLocal(
          value.role,
          value.rol,
          value.roles,
          ""
        )
      );

    const hasAccountSignals =
      value.active !== undefined ||
      value.enabled !== undefined ||
      value.disabled !== undefined ||
      value.status !== undefined ||
      value.estado !== undefined ||
      value.permissions !== undefined ||
      value.permisos !== undefined ||
      value.clienteId !== undefined ||
      value.tenantId !== undefined;

    return Boolean(
      (
        slug &&
        (
          role ||
          displayName ||
          hasAccountSignals
        )
      ) ||
      (
        displayName &&
        (
          role ||
          hasAccountSignals
        )
      )
    );
  };

  const payloadSourcesLocal = (
    payload = {}
  ) => {
    if (!isObjectLocal(payload)) {
      return [];
    }

    return [
      payload,
      isObjectLocal(payload.data)
        ? payload.data
        : null,
      isObjectLocal(payload.payload)
        ? payload.payload
        : null,
      isObjectLocal(payload.result)
        ? payload.result
        : null,
      isObjectLocal(payload.auth)
        ? payload.auth
        : null,
      isObjectLocal(payload.session)
        ? payload.session
        : null,
      isObjectLocal(payload.sessionData)
        ? payload.sessionData
        : null,
    ].filter(Boolean);
  };

  const pickLocal = (
    payload = {},
    names = []
  ) => {
    for (
      const source
      of payloadSourcesLocal(payload)
    ) {
      for (const name of names) {
        const value =
          source?.[name];

        if (
          value !== undefined &&
          value !== null &&
          value !== ""
        ) {
          return value;
        }
      }
    }

    return null;
  };

  const extractUserLocal = (
    payload = {}
  ) => {
    if (!isObjectLocal(payload)) {
      return null;
    }

    const explicitUser =
      pickLocal(
        payload,
        [
          "user",
          "currentUser",
          "usuario",
          "me",
          "account",
        ]
      );

    if (
      looksLikeUserLocal(
        explicitUser
      )
    ) {
      return explicitUser;
    }

    const profileUser =
      pickLocal(
        payload,
        [
          "profile",
        ]
      );

    if (
      looksLikeUserLocal(
        profileUser
      )
    ) {
      return profileUser;
    }

    return looksLikeUserLocal(
      payload
    )
      ? payload
      : null;
  };

  const adminUser = {
    id: "ON-ADMIN",
    userId: "ON-ADMIN",
    username: "cristian",
    slug: "cristian",
    displayName: "Cristian Ávila Luque",
    role: "admin",
    roles: ["admin"],
    active: true,
  };

  const standardUser = {
    id: "ON-USER",
    userId: "ON-USER",
    username: "harandou",
    slug: "harandou",
    name: "Javier Harandou",
    role: "user",
    roles: ["user"],
    active: true,
  };

  const cases = [
    {
      name:
        "login envelope admin",
      payload: {
        ok: true,
        authenticated: true,
        role: "admin",
        rol: "admin",
        roles: ["admin"],
        userSlug: "cristian",
        homePath: "/@cristian",
        user: adminUser,
        currentUser: adminUser,
      },
      expected:
        adminUser,
    },

    {
      name:
        "me envelope con slug/role en raíz",
      payload: {
        ok: true,
        authenticated: true,
        role: "admin",
        roles: ["admin"],
        slug: "cristian",
        homePath: "/@cristian",
        user: adminUser,
      },
      expected:
        adminUser,
    },

    {
      name:
        "refresh envelope",
      payload: {
        ok: true,
        authenticated: true,
        status: "refreshed",
        user: standardUser,
        routing: {
          slug: "harandou",
          homePath: "/@harandou",
        },
      },
      expected:
        standardUser,
    },

    {
      name:
        "usuario directo",
      payload:
        standardUser,
      expected:
        standardUser,
    },

    {
      name:
        "role-only NO es usuario",
      payload: {
        ok: true,
        authenticated: true,
        role: "admin",
        roles: ["admin"],
      },
      expected:
        null,
    },
  ];

  for (const test of cases) {
    const actual =
      extractUserLocal(
        test.payload
      );

    if (
      actual !==
      test.expected
    ) {
      throw new Error(
        `Assertion fallida: ${test.name}`
      );
    }
  }

  return true;
}

function main() {
  const {
    dryRun,
    strictSha,
    target,
  } = parseArgs(process.argv);

  const absoluteTarget =
    path.resolve(target);

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
    originalBuffer.toString(
      "utf8"
    );

  const detectedEol =
    originalText.includes("\r\n")
      ? "\r\n"
      : "\n";

  const sourceLf =
    normalizeLf(
      originalText
    );

  /*
    Verificamos tanto el blob del checkout tal cual como el contenido
    normalizado a LF, para no penalizar un checkout Windows con CRLF.
  */
  const rawBlobSha =
    gitBlobSha(
      originalBuffer
    );

  const lfBuffer =
    Buffer.from(
      sourceLf,
      "utf8"
    );

  const lfBlobSha =
    gitBlobSha(
      lfBuffer
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
      "Se continuará únicamente si los bloques contractuales coinciden de forma exacta y única.";

    if (strictSha) {
      return fail(
        `${message} --strict-sha impide continuar.`
      );
    }

    warn(message);
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

    oldLooks:
      countOccurrences(
        sourceLf,
        OLD_LOOKS_LIKE_USER
      ),

    newLooks:
      countOccurrences(
        sourceLf,
        NEW_LOOKS_LIKE_USER
      ),

    oldExtract:
      countOccurrences(
        sourceLf,
        OLD_EXTRACT_USER
      ),

    newExtract:
      countOccurrences(
        sourceLf,
        NEW_EXTRACT_USER
      ),
  };

  info(
    `Coincidencias antes: ${JSON.stringify(before)}`
  );

  const alreadyPatched =
    before.oldVersion === 0 &&
    before.newVersion === 1 &&
    before.oldLooks === 0 &&
    before.newLooks === 1 &&
    before.oldExtract === 0 &&
    before.newExtract === 1;

  if (
    alreadyPatched
  ) {
    ok(
      "El hotfix ya está aplicado. No se modifica nada."
    );

    try {
      runCompatibilityAssertions();
      ok(
        "Matriz de compatibilidad del hotfix: OK."
      );
    } catch (error) {
      return fail(
        `Falló la matriz de compatibilidad: ${error.message}`
      );
    }

    return;
  }

  const pristineExpectedShape =
    before.oldVersion === 1 &&
    before.newVersion === 0 &&
    before.oldLooks === 1 &&
    before.newLooks === 0 &&
    before.oldExtract === 1 &&
    before.newExtract === 0;

  if (
    !pristineExpectedShape
  ) {
    return fail(
      "El archivo no está ni en el estado original esperado ni completamente parcheado. " +
      "Se aborta para evitar una modificación parcial o sobre una versión distinta."
    );
  }

  /*
    Primero validamos la política nueva de forma aislada.
  */
  try {
    runCompatibilityAssertions();
    ok(
      "Matriz de compatibilidad previa: OK."
    );
  } catch (error) {
    return fail(
      `Falló la matriz de compatibilidad previa: ${error.message}`
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
      OLD_LOOKS_LIKE_USER,
      NEW_LOOKS_LIKE_USER
    );

  patchedLf =
    patchedLf.replace(
      OLD_EXTRACT_USER,
      NEW_EXTRACT_USER
    );

  const validation =
    validateFinalSource(
      patchedLf
    );

  if (
    !validation.valid
  ) {
    return fail(
      `Validación del resultado fallida: ${JSON.stringify(validation.checks)}`
    );
  }

  ok(
    "Validación estructural del resultado: OK."
  );

  const beforeLines =
    sourceLf.split("\n").length;

  const afterLines =
    patchedLf.split("\n").length;

  info(
    `Líneas antes: ${beforeLines}`
  );

  info(
    `Líneas después: ${afterLines}`
  );

  const changed =
    patchedLf !==
    sourceLf;

  if (!changed) {
    return fail(
      "No se detectaron cambios aunque el archivo parecía parcheable."
    );
  }

  if (dryRun) {
    ok(
      "DRY RUN completado. El archivo NO ha sido escrito."
    );

    console.log(
      "\nCambios que se aplicarían:"
    );

    console.log(
      "  1) AUTH_VERSION -> auth.minimal.v6.2-user-envelope-hotfix"
    );

    console.log(
      "  2) looksLikeUser() deja de aceptar role/roles como identidad suficiente."
    );

    console.log(
      "  3) extractUser() prioriza payload.user/currentUser antes del envelope."
    );

    console.log(
      "  4) Se mantiene fallback para usuario directo y profile legacy válido."
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
      `.${path.basename(absoluteTarget)}.onion-hotfix-${process.pid}-${Date.now()}.tmp`
    );

  try {
    fs.writeFileSync(
      tempPath,
      patchedText,
      {
        encoding: "utf8",
        flag: "wx",
      }
    );

    /*
      Validación del archivo temporal ANTES del rename.
    */
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
        `El temporal no supera la validación: ${JSON.stringify(tempValidation.checks)}`
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
      `No se pudo escribir el hotfix: ${error.message}. Backup disponible en ${backupPath}`
    );
  }

  /*
    Verificación final leyendo lo realmente guardado en disco.
  */
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
      `El archivo se escribió pero no pudo releerse: ${error.message}`
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
    runCompatibilityAssertions();
  } catch (error) {
    return fail(
      `La verificación funcional aislada falló tras escribir: ${error.message}. ` +
      `Restaura el backup: ${backupPath}`
    );
  }

  const finalBuffer =
    fs.readFileSync(
      absoluteTarget
    );

  ok(
    "Hotfix aplicado correctamente."
  );

  ok(
    "Matriz login/me/refresh/direct-user: OK."
  );

  info(
    `Nuevo Git blob SHA local: ${gitBlobSha(finalBuffer)}`
  );

  console.log(
    "\nResumen:"
  );

  console.log(
    "  - Backend: sin cambios."
  );

  console.log(
    "  - Cosmos DB: sin cambios."
  );

  console.log(
    "  - Home/Sidebar/Core/HTTP: sin cambios."
  );

  console.log(
    "  - Auth: extracción de usuario corregida."
  );

  console.log(
    `  - Backup: ${backupPath}`
  );

  console.log(
    "\nSiguiente paso recomendado:"
  );

  console.log(
    "  Despliega el frontend, cierra sesión, vuelve a iniciar sesión y haz una recarga completa."
  );
}

main();
