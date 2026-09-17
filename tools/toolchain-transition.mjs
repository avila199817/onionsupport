/* =========================================================
   Onion Support · A01 · transición confiable de toolchain

   EL PROBLEMA QUE RESUELVE

   La validación confiable reconstruye el candidato con el tooling de la BASE
   inmutable --package.json, package-lock.json, vite.config.js y tools/-- y
   exige igualdad de bytes con el dist que el candidato publicó. Esa propiedad
   es la que impide que una PR traiga su propia maquinaria de build y la use
   para avalar su propia salida.

   Una actualización legítima de Vite rompe esa igualdad POR DEFINICIÓN: «igual»
   significa «reproducible con el tooling viejo», y un compilador nuevo emite
   bytes distintos. La propiedad que se afirma es exactamente la que la
   actualización debe romper. Por eso #595, #653 y #688 se cerraron: no eran
   PRs malas, eran PRs imposibles.

   QUÉ NO ES ESTO

   No es un permiso para cambiar dependencias. No hay ninguna bandera que el
   candidato pueda activar. La autorización vive en la BASE y ya está fusionada
   antes de que el candidato exista: la base declara, con digest exacto, el
   ÚNICO par (package.json, package-lock.json) que acepta para una transición
   concreta. El candidato no se autoriza: el candidato COINCIDE, o falla.

   POR QUÉ SE ATAN LOS DOS DIGESTS Y NO SÓLO LAS VERSIONES

   Una cadena de versión no ata contenido. Con sólo «vite: 8.3.0» un candidato
   podría traer un lockfile con otro `resolved` u otro `integrity` y colar un
   tarball distinto con el nombre correcto. El digest del lock cierra eso.

   Y el digest de package.json NO es redundante, es imprescindible: si el lock
   viene del candidato, package.json tiene que venir con él --`npm ci` exige que
   concuerden-- y package.json contiene `scripts`, que la reconstrucción
   confiable EJECUTA (`npm run build`). Sin atar su digest, una transición
   autorizada le entregaría al candidato ejecución arbitraria dentro del build
   confiable. Atado, el candidato no puede tocar ni un carácter de esos dos
   archivos sin invalidar la autorización.

   POR QUÉ NO HAY CADUCIDAD POR TIEMPO

   Un reloj dentro de un build que debe ser reproducible es una fuente de
   nondeterminismo. La caducidad es por CONTENIDO: en cuanto la base declara la
   versión de destino --es decir, en cuanto la activación se fusiona-- el `from`
   de la declaración deja de coincidir con la base y la autorización se invalida
   sola. Una declaración olvidada no autoriza nada.

   CICLO DE VIDA · AUTORIZAR -> ACTIVAR -> CERRAR
     T1  la base gana la capacidad y la declaración. No activa nada.
     T2  el candidato trae EXACTAMENTE los dos archivos declarados.
     T3  la base retira la declaración. Vuelve el modo estricto.

   El modo estricto es el de siempre y es el de por defecto: sin declaración,
   esta capacidad no existe.
========================================================= */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/* La declaración vive en tools/, que la puesta en escena copia SIEMPRE desde la
   base. Nunca se lee del candidato: ver readDeclaration(). */
export const TRANSITION_DECLARATION = "tools/toolchain-transition.json";
const SCHEMA = "onionsupport.toolchain-transition.v1";
const MAX_DECLARATION_BYTES = 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
/* Rango estrecho a propósito: una transición es de una versión exacta a otra
   versión exacta, nunca un rango semver ni una etiqueta móvil. */
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/u;
const PACKAGE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const REQUIRED_KEYS = Object.freeze([
  "from", "package", "packageJsonSha256", "packageLockSha256", "schema", "to",
]);

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readRegularFile(root, relativePath, { maxBytes = 0 } = {}) {
  const file = resolve(root, relativePath);
  const stat = lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`A01: ${relativePath} debe ser un archivo regular, no un enlace.`);
  }
  if (maxBytes && stat.size > maxBytes) {
    throw new Error(`A01: ${relativePath} supera ${maxBytes} bytes.`);
  }
  return readFileSync(file);
}

/* PARSEO ESTRICTO. Cualquier desviación es un fallo, nunca un modo degradado:
   una declaración que no se entiende no autoriza nada. */
export function parseDeclaration(bytes) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`A01: la declaración no es JSON válido (${error.message}).`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A01: la declaración debe ser un objeto JSON.");
  }
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== REQUIRED_KEYS.join(",")) {
    throw new Error(
      `A01: claves inesperadas en la declaración. Esperadas exactamente ` +
      `[${REQUIRED_KEYS.join(", ")}], recibidas [${keys.join(", ")}].`
    );
  }
  if (value.schema !== SCHEMA) {
    throw new Error(`A01: schema desconocido: ${JSON.stringify(value.schema)}.`);
  }
  if (typeof value.package !== "string" || !PACKAGE_PATTERN.test(value.package)) {
    throw new Error(`A01: nombre de paquete inválido: ${JSON.stringify(value.package)}.`);
  }
  for (const field of ["from", "to"]) {
    if (typeof value[field] !== "string" || !VERSION_PATTERN.test(value[field])) {
      throw new Error(`A01: ${field} debe ser una versión exacta x.y.z: ${JSON.stringify(value[field])}.`);
    }
  }
  if (value.from === value.to) {
    throw new Error("A01: una transición de una versión a sí misma no autoriza nada.");
  }
  for (const field of ["packageJsonSha256", "packageLockSha256"]) {
    if (typeof value[field] !== "string" || !SHA256_PATTERN.test(value[field])) {
      throw new Error(`A01: ${field} debe ser un sha256 hexadecimal de 64 caracteres.`);
    }
  }
  if (value.packageJsonSha256 === value.packageLockSha256) {
    throw new Error("A01: los dos digests no pueden ser el mismo archivo.");
  }
  return Object.freeze({ ...value });
}

/* La declaración SÓLO se lee de la base. Este parámetro se llama trustedRoot
   porque nunca puede ser otra cosa: quien llame con la raíz del candidato está
   pidiendo que el candidato se autorice a sí mismo. */
export function readDeclaration(trustedRoot) {
  const bytes = readRegularFile(trustedRoot, TRANSITION_DECLARATION, { maxBytes: MAX_DECLARATION_BYTES });
  if (!bytes) return null;
  return parseDeclaration(bytes);
}

function declaredVersion(packageJsonBytes, name) {
  let manifest;
  try {
    manifest = JSON.parse(packageJsonBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`A01: package.json ilegible (${error.message}).`);
  }
  const sections = [manifest?.devDependencies, manifest?.dependencies, manifest?.optionalDependencies];
  const found = sections.map((section) => section?.[name]).filter((value) => typeof value === "string");
  if (found.length !== 1) {
    throw new Error(`A01: ${name} debe declararse exactamente una vez en package.json (${found.length}).`);
  }
  return found[0];
}

function dependencyMap(packageJsonBytes, label) {
  let manifest;
  try {
    manifest = JSON.parse(packageJsonBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`A01: ${label} ilegible (${error.message}).`);
  }
  const map = new Map();
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, range] of Object.entries(manifest?.[section] ?? {})) {
      if (map.has(name)) throw new Error(`A01: ${label} declara ${name} más de una vez.`);
      map.set(name, String(range));
    }
  }
  return map;
}

/* La declaración NOMBRA un paquete, y ese nombre tiene que significar algo. Sin
   esta comprobación los digests autorizarían cualquier cosa que hubiera dentro
   de esos dos archivos --incluido un segundo salto no mencionado-- y el texto
   que el revisor lee al fusionar la autorización no describiría lo que autoriza.
   Aquí la diferencia de dependencias entre la base y el par autorizado tiene que
   ser EXACTAMENTE la transición declarada: una entrada, la nombrada, y nada más. */
function assertOnlyDeclaredDependencyMoves(basePackageJson, authorizedPackageJson, declaration) {
  const antes = dependencyMap(basePackageJson, "package.json de la base");
  const despues = dependencyMap(authorizedPackageJson, "package.json autorizado");

  const cambios = [];
  for (const [name, range] of despues) {
    const previo = antes.get(name);
    if (previo === undefined) cambios.push(`+${name}@${range}`);
    else if (previo !== range) cambios.push(`${name} ${previo} -> ${range}`);
  }
  for (const name of antes.keys()) {
    if (!despues.has(name)) cambios.push(`-${name}`);
  }

  const esperado = `${declaration.package} ${declaration.from} -> ${declaration.to}`;
  if (cambios.length !== 1 || cambios[0] !== esperado) {
    throw new Error(
      `A01: la transición autorizada mueve dependencias que no declara.\n` +
      `  declarado: ${esperado}\n` +
      `  observado: ${cambios.length ? cambios.join(", ") : "ninguna dependencia cambia"}`
    );
  }
}

function lockedVersion(packageLockBytes, name) {
  let lock;
  try {
    lock = JSON.parse(packageLockBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`A01: package-lock.json ilegible (${error.message}).`);
  }
  const entry = lock?.packages?.[`node_modules/${name}`];
  if (!entry || typeof entry.version !== "string") {
    throw new Error(`A01: package-lock.json no resuelve node_modules/${name}.`);
  }
  return entry.version;
}

/* ÚNICO punto de decisión sobre de dónde sale el toolchain de la
   reconstrucción confiable. Devuelve "base" salvo que TODO encaje; cualquier
   inconsistencia lanza. No existe un camino que devuelva "candidate" sin haber
   comprobado los dos digests contra la declaración de la base. */
export function resolveToolchainSource({ trustedRoot, candidateRoot } = {}) {
  if (!trustedRoot || !candidateRoot) {
    throw new Error("A01: resolveToolchainSource exige trustedRoot y candidateRoot.");
  }

  const declaration = readDeclaration(trustedRoot);
  if (!declaration) {
    return Object.freeze({ source: "base", declaration: null, reason: "sin declaración: modo estricto" });
  }

  /* La base tiene que estar todavía en `from`. Si ya declara `to`, la
     activación se fusionó y esta declaración está caduca: se retira en T3, y
     hasta entonces no autoriza nada. */
  const basePackageJson = readRegularFile(trustedRoot, "package.json");
  if (!basePackageJson) throw new Error("A01: la base no tiene package.json.");
  const baseVersion = declaredVersion(basePackageJson, declaration.package);
  if (baseVersion === declaration.to) {
    return Object.freeze({
      source: "base",
      declaration,
      reason: "declaración consumida: la base ya adoptó el destino; modo estricto",
    });
  }
  if (baseVersion !== declaration.from) {
    throw new Error(
      `A01: declaración equivocada. La base declara ${declaration.package}@${baseVersion}, ` +
      `pero la transición sólo admite ${declaration.from} -> ${declaration.to}.`
    );
  }

  const candidatePackageJson = readRegularFile(candidateRoot, "package.json");
  const candidatePackageLock = readRegularFile(candidateRoot, "package-lock.json");
  if (!candidatePackageJson || !candidatePackageLock) {
    throw new Error("A01: el candidato debe traer package.json y package-lock.json.");
  }

  const candidatePackageJsonSha256 = sha256(candidatePackageJson);
  const candidatePackageLockSha256 = sha256(candidatePackageLock);
  const packageJsonMatches = candidatePackageJsonSha256 === declaration.packageJsonSha256;
  const packageLockMatches = candidatePackageLockSha256 === declaration.packageLockSha256;

  /* El candidato no ha activado la transición: sigue siendo la base igual que
     cualquier otra PR. Esto es lo normal mientras la declaración está viva, y
     tiene que seguir siéndolo: en este repositorio casi toda PR toca `scripts`
     de package.json para dar de alta un contrato nuevo.
     Por eso «tocar el toolchain» se mide por DEPENDENCIAS y lockfile, no por
     los bytes de package.json. Cambiar un script no cambia el compilador, y en
     modo estricto la reconstrucción usa el package.json de la base de todos
     modos: los scripts del candidato ya se ignoran hoy. Medirlo por bytes
     convertiría la ventana de transición en un congelador del repositorio. */
  if (!packageJsonMatches && !packageLockMatches) {
    const baseLock = readRegularFile(trustedRoot, "package-lock.json");
    const baseDeps = dependencyMap(basePackageJson, "package.json de la base");
    const candidateDeps = dependencyMap(candidatePackageJson, "package.json del candidato");
    const sameDependencies =
      baseDeps.size === candidateDeps.size &&
      [...baseDeps].every(([name, range]) => candidateDeps.get(name) === range);
    if (baseLock && sameDependencies && sha256(baseLock) === candidatePackageLockSha256) {
      return Object.freeze({ source: "base", declaration, reason: "el candidato no toca el toolchain" });
    }
    throw new Error(
      "A01: el candidato cambia el toolchain pero no coincide con ninguna transición autorizada.\n" +
      `  package.json      candidato ${candidatePackageJsonSha256}\n` +
      `                    autorizado ${declaration.packageJsonSha256}\n` +
      `  package-lock.json candidato ${candidatePackageLockSha256}\n` +
      `                    autorizado ${declaration.packageLockSha256}`
    );
  }

  /* Media coincidencia es un fallo, nunca una aproximación: los dos archivos se
     autorizan juntos porque `npm ci` los usa juntos. */
  if (!packageJsonMatches || !packageLockMatches) {
    throw new Error(
      `A01: sólo uno de los dos archivos coincide con la autorización. ` +
      `package.json ${packageJsonMatches ? "coincide" : "NO coincide"}, ` +
      `package-lock.json ${packageLockMatches ? "coincide" : "NO coincide"}. ` +
      `Una transición se autoriza entera o no se autoriza.`
    );
  }

  /* Los digests ya atan el contenido byte a byte; estas dos comprobaciones no
     añaden seguridad, añaden DIAGNÓSTICO: si alguien autoriza un par de
     archivos que no contienen la versión que la declaración dice, el fallo
     nombra la incoherencia en vez de dejar pasar una transición mal descrita. */
  assertOnlyDeclaredDependencyMoves(basePackageJson, candidatePackageJson, declaration);

  const candidateDeclared = declaredVersion(candidatePackageJson, declaration.package);
  if (candidateDeclared !== declaration.to) {
    throw new Error(
      `A01: incoherente. La declaración autoriza ${declaration.package}@${declaration.to} ` +
      `pero el package.json autorizado declara ${candidateDeclared}.`
    );
  }
  const candidateLocked = lockedVersion(candidatePackageLock, declaration.package);
  if (candidateLocked !== declaration.to) {
    throw new Error(
      `A01: incoherente. La declaración autoriza ${declaration.package}@${declaration.to} ` +
      `pero el lockfile autorizado resuelve ${candidateLocked}.`
    );
  }

  return Object.freeze({
    source: "candidate",
    declaration,
    reason:
      `transición autorizada por la base: ${declaration.package} ` +
      `${declaration.from} -> ${declaration.to}`,
  });
}

/* Genera el texto de la declaración a partir de un árbol que YA tiene el
   toolchain de destino. Un digest escrito a mano es un digest equivocado, y un
   digest equivocado no se detecta leyendo: se detecta cuando la puerta rechaza
   la activación. Esto no autoriza nada por sí solo --sólo imprime--: autorizar
   es fusionar el resultado en main, que es un acto humano y revisable.

     node tools/toolchain-transition.mjs --authorize vite 8.2.2 8.3.0 /ruta/al/candidato */
export function buildDeclaration({ packageName, from, to, candidateRoot }) {
  const manifest = readRegularFile(candidateRoot, "package.json");
  const lockfile = readRegularFile(candidateRoot, "package-lock.json");
  if (!manifest || !lockfile) {
    throw new Error("A01: el árbol indicado debe tener package.json y package-lock.json.");
  }
  const declaration = {
    schema: SCHEMA,
    package: packageName,
    from,
    to,
    packageJsonSha256: sha256(manifest),
    packageLockSha256: sha256(lockfile),
  };
  /* Se valida contra su propio parser antes de imprimirse: nunca se emite una
     declaración que el resolutor fuese a rechazar. */
  parseDeclaration(Buffer.from(`${JSON.stringify(declaration, null, 2)}\n`));
  const declared = declaredVersion(manifest, packageName);
  const locked = lockedVersion(lockfile, packageName);
  if (declared !== to || locked !== to) {
    throw new Error(
      `A01: el árbol indicado no está en ${packageName}@${to} ` +
      `(package.json ${declared}, lockfile ${locked}). Genera la declaración sobre el árbol ya actualizado.`
    );
  }
  return `${JSON.stringify(declaration, null, 2)}\n`;
}

if (process.argv[2] === "--authorize") {
  const [, , , packageName, from, to, candidateRoot] = process.argv;
  if (!packageName || !from || !to || !candidateRoot) {
    throw new Error("Uso: node tools/toolchain-transition.mjs --authorize <paquete> <from> <to> <raíz-candidata>");
  }
  process.stdout.write(buildDeclaration({ packageName, from, to, candidateRoot: resolve(candidateRoot) }));
}
