/*
===============================================================================
ONION SUPPORT · CORE IDENTITY CONTRACT HARDENING
===============================================================================

OBJETIVO
-------
Afinar de forma quirúrgica:

  src/core/index.js

Este es el SIGUIENTE punto lógico después del hotfix de Auth.

Auth ya debe entregar el objeto de usuario correcto. Core es el boundary que:
- normaliza la identidad;
- conserva el usuario actual en memoria;
- expone AppCore.publicUser();
- alimenta Home, Sidebar, Cuenta y cualquier módulo que lea currentUser.

Este hardening NO intenta arreglar otro bug distinto. Su objetivo es cerrar el
contrato de identidad para que un usuario válido no vuelva a degradarse a
"Usuario" por diferencias inocuas entre nombres de campos.

CAMBIOS
-------
1. CORE_VERSION:
     core.minimal.v6-hardened
   ->
     core.minimal.v6.1-identity-hardened

2. Añade resolveUserDisplayName():
   Prioridad canónica:
     displayName
     fullName
     name
     nombre
     profile.displayName
     profile.publicName
     profile.fullName
     profile.name
     profile.nombre
     username
     userName
     user_name
     "Usuario"

3. Añade resolveUserAvatarUrl():
   Acepta de forma normalizada:
     avatarUrl
     avatar
     picture
     photoUrl
     photoURL
     imageUrl
     imageURL
     profile.avatarUrl
     profile.avatar
     profile.picture
     profile.photoUrl
     profile.photoURL
     profile.imageUrl
     profile.imageURL

4. publicUser():
   - limpia displayName;
   - limpia username;
   - conserva displayName como campo canónico;
   - emite aliases coherentes:
       fullName
       name
       nombre
     todos con el mismo valor canónico;
   - mantiene role/rol/roles;
   - mantiene status;
   - mantiene id/userId;
   - NO añade email ni secretos al estado público.

5. NO toca:
   - Auth
   - HTTP
   - Router
   - Home
   - Sidebar
   - backend
   - Cosmos DB
   - sesiones
   - tokens
   - permisos
   - política de usuarios disabled

FUENTE CALIBRADA
----------------
Repositorio:
  avila199817/onionsupport

Archivo:
  src/core/index.js

Blob SHA de GitHub revisado:
  933a4bb706480b6850a0be9f1566710e52579e13

Versión original:
  core.minimal.v6-hardened

Versión nueva:
  core.minimal.v6.1-identity-hardened

USO
---
1. Guarda ESTE TXT como:
     patch-core-identity.cjs

2. Desde la raíz del repo:
     node patch-core-identity.cjs --dry-run

3. Si termina en OK:
     node patch-core-identity.cjs

4. Opcional, exigir que el SHA coincida exactamente con el blob revisado:
     node patch-core-identity.cjs --strict-sha --dry-run

El script:
- valida coincidencias únicas;
- detecta si ya está aplicado;
- crea backup;
- escribe de forma atómica;
- verifica el archivo final;
- ejecuta una matriz funcional aislada.

===============================================================================
*/

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const EXPECTED_GITHUB_BLOB_SHA =
  "933a4bb706480b6850a0be9f1566710e52579e13";

const OLD_VERSION =
  'export const CORE_VERSION =\n  "core.minimal.v6-hardened";';

const NEW_VERSION =
  'export const CORE_VERSION =\n  "core.minimal.v6.1-identity-hardened";';

const OLD_PUBLIC_USER = `function publicUser(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return null;
  }

  const role =
    normalizeRole(
      first(
        user.role,
        user.rol,
        user.roles,
        ""
      )
    ) ||
    "user";

  const slug =
    extractUserSlug(
      user
    );

  const status =
    userStatus(
      user
    ) ||
    (
      userLooksDisabledByFlag(
        user
      )
        ? "disabled"
        : "active"
    );

  return {
    id:
      first(
        user.id,
        user.userId,
        null
      ),

    userId:
      first(
        user.userId,
        user.id,
        null
      ),

    username:
      first(
        user.username,
        user.userName,
        user.user_name,
        null
      ),

    slug,

    displayName:
      first(
        user.displayName,
        user.fullName,
        user.name,
        user.nombre,
        user.profile
          ?.displayName,
        user.profile
          ?.name,
        user.username,
        "Usuario"
      ),

    role,
    rol: role,
    roles: [role],

    avatarUrl:
      cleanText(
        first(
          user.avatarUrl,
          user.avatar,
          user.picture,
          user.photoUrl,
          user.profile
            ?.avatarUrl,
          user.profile
            ?.avatar,
          ""
        ),
        ""
      ),

    status,
  };
}`;

const NEW_PUBLIC_USER = `function resolveUserDisplayName(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return "Usuario";
  }

  return cleanText(
    first(
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,

      user.profile
        ?.displayName,
      user.profile
        ?.publicName,
      user.profile
        ?.fullName,
      user.profile
        ?.name,
      user.profile
        ?.nombre,

      user.username,
      user.userName,
      user.user_name,

      "Usuario"
    ),
    "Usuario"
  );
}

function resolveUserAvatarUrl(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return "";
  }

  return cleanText(
    first(
      user.avatarUrl,
      user.avatar,
      user.picture,
      user.photoUrl,
      user.photoURL,
      user.imageUrl,
      user.imageURL,

      user.profile
        ?.avatarUrl,
      user.profile
        ?.avatar,
      user.profile
        ?.picture,
      user.profile
        ?.photoUrl,
      user.profile
        ?.photoURL,
      user.profile
        ?.imageUrl,
      user.profile
        ?.imageURL,

      ""
    ),
    ""
  );
}

function publicUser(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return null;
  }

  const role =
    normalizeRole(
      first(
        user.role,
        user.rol,
        user.roles,
        ""
      )
    ) ||
    "user";

  const slug =
    extractUserSlug(
      user
    );

  const status =
    userStatus(
      user
    ) ||
    (
      userLooksDisabledByFlag(
        user
      )
        ? "disabled"
        : "active"
    );

  const displayName =
    resolveUserDisplayName(
      user
    );

  const username =
    cleanText(
      first(
        user.username,
        user.userName,
        user.user_name,
        ""
      ),
      ""
    ) ||
    null;

  const avatarUrl =
    resolveUserAvatarUrl(
      user
    );

  return {
    id:
      first(
        user.id,
        user.userId,
        null
      ),

    userId:
      first(
        user.userId,
        user.id,
        null
      ),

    username,

    slug,

    /*
      displayName es el campo canónico de presentación.
      Los aliases mantienen compatibilidad con vistas/contratos legacy
      sin permitir que diverjan entre sí dentro del Core.
    */
    displayName,
    fullName:
      displayName,
    name:
      displayName,
    nombre:
      displayName,

    role,
    rol: role,
    roles: [role],

    avatarUrl,

    status,
  };
}`;

function countOccurrences(text, needle) {
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

function gitBlobSha(buffer) {
  const header =
    Buffer.from(
      `blob ${buffer.length}\0`,
      "utf8"
    );

  return crypto
    .createHash("sha1")
    .update(header)
    .update(buffer)
    .digest("hex");
}

function normalizeLf(value) {
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
  return eol === "\r\n"
    ? value.replace(
        /\n/g,
        "\r\n"
      )
    : value;
}

function timestamp() {
  const date =
    new Date();

  const pad =
    (value) =>
      String(value)
        .padStart(
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
    `\n[ERROR] ${message}\n`
  );

  process.exitCode = 1;
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
        "core",
        "index.js"
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

    oldPublicUser:
      countOccurrences(
        sourceLf,
        OLD_PUBLIC_USER
      ),

    newPublicUser:
      countOccurrences(
        sourceLf,
        NEW_PUBLIC_USER
      ),
  };

  return {
    checks,

    valid:
      checks.oldVersion === 0 &&
      checks.newVersion === 1 &&
      checks.oldPublicUser === 0 &&
      checks.newPublicUser === 1,
  };
}

function runIdentityAssertions() {
  /*
    Réplica aislada del contrato nuevo.
    No importa el frontend ni requiere DOM.
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
        )
          .toLowerCase();

      return (
        role === "admin" ||
        role === "user"
      )
        ? role
        : "";
    };

  const resolveUserDisplayNameLocal =
    (user = null) => {
      if (
        !isObjectLocal(
          user
        )
      ) {
        return "Usuario";
      }

      return cleanTextLocal(
        firstLocal(
          user.displayName,
          user.fullName,
          user.name,
          user.nombre,

          user.profile
            ?.displayName,
          user.profile
            ?.publicName,
          user.profile
            ?.fullName,
          user.profile
            ?.name,
          user.profile
            ?.nombre,

          user.username,
          user.userName,
          user.user_name,

          "Usuario"
        ),
        "Usuario"
      );
    };

  const resolveUserAvatarUrlLocal =
    (user = null) => {
      if (
        !isObjectLocal(
          user
        )
      ) {
        return "";
      }

      return cleanTextLocal(
        firstLocal(
          user.avatarUrl,
          user.avatar,
          user.picture,
          user.photoUrl,
          user.photoURL,
          user.imageUrl,
          user.imageURL,

          user.profile
            ?.avatarUrl,
          user.profile
            ?.avatar,
          user.profile
            ?.picture,
          user.profile
            ?.photoUrl,
          user.profile
            ?.photoURL,
          user.profile
            ?.imageUrl,
          user.profile
            ?.imageURL,

          ""
        ),
        ""
      );
    };

  const publicUserLocal =
    (user = null) => {
      if (
        !isObjectLocal(
          user
        )
      ) {
        return null;
      }

      const role =
        normalizeRoleLocal(
          firstLocal(
            user.role,
            user.rol,
            user.roles,
            ""
          )
        ) ||
        "user";

      const displayName =
        resolveUserDisplayNameLocal(
          user
        );

      const username =
        cleanTextLocal(
          firstLocal(
            user.username,
            user.userName,
            user.user_name,
            ""
          ),
          ""
        ) ||
        null;

      return {
        displayName,
        fullName:
          displayName,
        name:
          displayName,
        nombre:
          displayName,

        username,

        role,
        rol:
          role,
        roles:
          [role],

        avatarUrl:
          resolveUserAvatarUrlLocal(
            user
          ),
      };
    };

  const tests = [
    {
      name:
        "admin displayName",
      input: {
        username:
          "cristian",
        displayName:
          "Cristian Ávila Luque",
        role:
          "admin",
      },
      expectedName:
        "Cristian Ávila Luque",
      expectedRole:
        "admin",
    },

    {
      name:
        "estándar name raíz",
      input: {
        username:
          "harandou",
        name:
          "Javier Harandou",
        role:
          "user",
      },
      expectedName:
        "Javier Harandou",
      expectedRole:
        "user",
    },

    {
      name:
        "profile.publicName",
      input: {
        username:
          "javier",
        profile: {
          publicName:
            "Javier Harandou",
        },
        role:
          "user",
      },
      expectedName:
        "Javier Harandou",
      expectedRole:
        "user",
    },

    {
      name:
        "limpieza de espacios",
      input: {
        username:
          "cristian",
        fullName:
          "  Cristian   Ávila\tLuque  ",
        role:
          "admin",
      },
      expectedName:
        "Cristian Ávila Luque",
      expectedRole:
        "admin",
    },

    {
      name:
        "fallback username",
      input: {
        username:
          "cristian",
        role:
          "admin",
      },
      expectedName:
        "cristian",
      expectedRole:
        "admin",
    },

    {
      name:
        "fallback Usuario",
      input: {
        role:
          "user",
      },
      expectedName:
        "Usuario",
      expectedRole:
        "user",
    },

    {
      name:
        "avatar photoURL",
      input: {
        username:
          "cristian",
        role:
          "admin",
        photoURL:
          "https://example.invalid/avatar.png",
      },
      expectedName:
        "cristian",
      expectedRole:
        "admin",
      expectedAvatar:
        "https://example.invalid/avatar.png",
    },

    {
      name:
        "avatar profile.imageUrl",
      input: {
        username:
          "javier",
        role:
          "user",
        profile: {
          imageUrl:
            "https://example.invalid/javier.png",
        },
      },
      expectedName:
        "javier",
      expectedRole:
        "user",
      expectedAvatar:
        "https://example.invalid/javier.png",
    },
  ];

  for (
    const test
    of tests
  ) {
    const actual =
      publicUserLocal(
        test.input
      );

    if (
      !actual
    ) {
      throw new Error(
        `${test.name}: publicUser devolvió null`
      );
    }

    if (
      actual.displayName !==
      test.expectedName
    ) {
      throw new Error(
        `${test.name}: displayName="${actual.displayName}"`
      );
    }

    if (
      actual.fullName !==
        actual.displayName ||
      actual.name !==
        actual.displayName ||
      actual.nombre !==
        actual.displayName
    ) {
      throw new Error(
        `${test.name}: aliases de nombre divergentes`
      );
    }

    if (
      actual.role !==
      test.expectedRole
    ) {
      throw new Error(
        `${test.name}: role="${actual.role}"`
      );
    }

    if (
      test.expectedAvatar !==
        undefined &&
      actual.avatarUrl !==
        test.expectedAvatar
    ) {
      throw new Error(
        `${test.name}: avatarUrl="${actual.avatarUrl}"`
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
      "Sólo se continuará si los bloques esperados coinciden de forma exacta y única.";

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

    oldPublicUser:
      countOccurrences(
        sourceLf,
        OLD_PUBLIC_USER
      ),

    newPublicUser:
      countOccurrences(
        sourceLf,
        NEW_PUBLIC_USER
      ),
  };

  info(
    `Coincidencias antes: ${JSON.stringify(before)}`
  );

  const alreadyPatched =
    before.oldVersion === 0 &&
    before.newVersion === 1 &&
    before.oldPublicUser === 0 &&
    before.newPublicUser === 1;

  if (
    alreadyPatched
  ) {
    try {
      runIdentityAssertions();
    } catch (error) {
      return fail(
        `El hotfix parece aplicado pero falló la matriz funcional: ${error.message}`
      );
    }

    ok(
      "El hardening ya está aplicado. No se modifica nada."
    );

    ok(
      "Matriz de identidad: OK."
    );

    return;
  }

  const pristineExpectedShape =
    before.oldVersion === 1 &&
    before.newVersion === 0 &&
    before.oldPublicUser === 1 &&
    before.newPublicUser === 0;

  if (
    !pristineExpectedShape
  ) {
    return fail(
      "El archivo no está en el estado original esperado ni completamente actualizado. " +
      "Se aborta para evitar tocar una versión distinta o parcialmente editada."
    );
  }

  try {
    runIdentityAssertions();

    ok(
      "Matriz de identidad previa: OK."
    );
  } catch (error) {
    return fail(
      `Falló la matriz de identidad previa: ${error.message}`
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
      OLD_PUBLIC_USER,
      NEW_PUBLIC_USER
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
      "  1) CORE_VERSION -> core.minimal.v6.1-identity-hardened"
    );

    console.log(
      "  2) displayName canónico con aliases fullName/name/nombre."
    );

    console.log(
      "  3) soporte profile.publicName/profile.fullName/profile.nombre."
    );

    console.log(
      "  4) normalización ampliada de avatar."
    );

    console.log(
      "  5) sin email ni datos sensibles añadidos al public user."
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
      `.${path.basename(absoluteTarget)}.onion-core-hardening-${process.pid}-${Date.now()}.tmp`
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
      `Se escribió el archivo pero no pudo releerse: ${error.message}`
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
    runIdentityAssertions();
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
    "Core identity hardening aplicado correctamente."
  );

  ok(
    "Matriz admin/user/profile.publicName/avatar: OK."
  );

  info(
    `Nuevo Git blob SHA local: ${gitBlobSha(finalBuffer)}`
  );

  console.log(
    "\nResumen:"
  );

  console.log(
    "  - Auth: sin cambios."
  );

  console.log(
    "  - HTTP/Router/Home/Sidebar: sin cambios."
  );

  console.log(
    "  - Backend/Cosmos: sin cambios."
  );

  console.log(
    "  - Core: contrato de identidad endurecido."
  );

  console.log(
    `  - Backup: ${backupPath}`
  );

  console.log(
    "\nDespués del despliegue:"
  );

  console.log(
    "  1) cerrar sesión;"
  );

  console.log(
    "  2) iniciar sesión como admin;"
  );

  console.log(
    "  3) comprobar nombre/avatar;"
  );

  console.log(
    "  4) repetir con usuario estándar;"
  );

  console.log(
    "  5) recargar la SPA para validar restore de sesión."
  );
}

main();
