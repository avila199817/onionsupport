#!/usr/bin/env node
/* =========================================================
   Onion Support · La frontera del arranque público

   QUÉ PROTEGE. El chrome privado --sidebar, topbar, AppChrome, avatares,
   overlay de entidad y precarga de intención-- se monta DESPUÉS del guard de
   una ruta privada. Su propia puerta lo dice: «las rutas públicas/anónimas del
   artefacto no descargan runtime privado». Un import estático desde el
   arranque convierte esa promesa en falsa sin que nada la contradiga.

   POR QUÉ NO BASTA EL PRESUPUESTO. `invoice-api-split-dist-contract.mjs` mide
   bytes y detecta que el cierre CRECIÓ; no sabe POR QUÉ. Cuando el techo tenía
   tres bytes de margen, la causa real --una arista de dependencia prohibida--
   quedaba indistinguible de un crecimiento legítimo. Un presupuesto detecta
   regresiones de tamaño; esta frontera detecta aristas prohibidas. Hacen
   falta las dos.

   CÓMO SE MIDE. Cierre transitivo de imports ESTÁTICOS desde las mismas cuatro
   raíces que declara el contrato de presupuesto. Sólo se PARSEA: ningún módulo
   del producto se enlaza ni se evalúa. `import()` dinámico no es una arista:
   es exactamente el mecanismo que mantiene privado lo privado.
========================================================= */

import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceTextModule } from "node:vm";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = resolve(ROOT, process.env.ONION_CANDIDATE_SOURCE_DIR || ROOT);

/* Las mismas raíces del cierre bootstrap/Home que mide el presupuesto:
   main, app, enhancements y la Home pública. */
const ROOTS = Object.freeze([
  "src/main.js",
  "src/app/index.js",
  "src/app/enhancements.js",
  "src/views/public/home/index.js",
]);

/* Runtime privado: sólo alcanzable tras el guard, nunca por import estático. */
const PRIVATE_RUNTIME = Object.freeze([
  "src/features/private-runtime-ui/",
  "src/features/avatar-system/",
  "src/features/entity-intent-preload/",
  "src/features/entity-overlay/index.js",
  "src/ui/sidebar/",
  "src/ui/topbar/",
  "src/ui/chrome/",
]);

/* Excepción declarada, con su motivo. La autoridad compartida de ciclo de vida
   de modales la usa el aviso de consentimiento, que es público y obligatorio
   antes de la analítica; `modal_authority_contract.mjs` ya la vincula. No es
   chrome privado: es el contrato de modales del que también depende lo público. */
const ALLOWED_FEATURE_MODULES = Object.freeze([
  "src/features/entity-overlay/modal-lifecycle.js",
]);

const posix = (value) => String(value).split(sep).join("/");
const rel = (file) => posix(relative(SOURCE, file));

function realFile(file) {
  const stat = lstatSync(file, { throwIfNoEntry: false });
  return Boolean(stat && stat.isFile() && !stat.isSymbolicLink());
}

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  assert.ok(!/[?#]/.test(specifier), `Especificador con query o fragmento: ${specifier} (${rel(fromFile)})`);
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, `${base}/index.js`]) {
    if (existsSync(candidate) && realFile(candidate)) return candidate;
  }
  return null;
}

/* SÓLO PARSEO. Nunca enlazar, evaluar ni resolver imports dinámicos. */
function staticImports(file) {
  const code = readFileSync(file, "utf8");
  const parsed = new SourceTextModule(code, { identifier: rel(file) });
  assert.equal(parsed.status, "unlinked", `${rel(file)} no debe enlazarse`);
  return [...new Set(parsed.moduleRequests?.map((item) => item.specifier) ?? parsed.dependencySpecifiers)];
}

/* Fixture: el import dinámico NO es una arista estática. Si esto dejara de ser
   cierto, el contrato entero estaría midiendo otra cosa. */
assert.deepEqual(
  [...new Set(new SourceTextModule(
    'import a from "./a.js"; export { b } from "./b.js"; await import("./lazy.js");',
    { identifier: "fixture" }
  ).moduleRequests.map((item) => item.specifier))],
  ["./a.js", "./b.js"]
);

const reached = new Map();
function visit(file, trail) {
  if (reached.has(file)) return;
  reached.set(file, trail);
  for (const specifier of staticImports(file)) {
    const target = resolveSpecifier(file, specifier);
    if (target && target.endsWith(".js")) visit(target, [...trail, file]);
  }
}

for (const entry of ROOTS) {
  const file = resolve(SOURCE, entry);
  assert.ok(realFile(file), `Raíz de arranque ausente: ${entry}`);
  visit(file, []);
}

const modules = [...reached.keys()].map(rel).sort();

/* 1 · Ninguna arista estática al runtime privado. */
const forbidden = [...reached.keys()]
  .map((file) => ({ path: rel(file), trail: reached.get(file) }))
  .filter(({ path }) => PRIVATE_RUNTIME.some((prefix) => path === prefix || path.startsWith(prefix)))
  .filter(({ path }) => !ALLOWED_FEATURE_MODULES.includes(path));

assert.deepEqual(
  forbidden.map(({ path }) => path),
  [],
  "El arranque público importa runtime privado de forma estática:\n" +
    forbidden.map(({ path, trail }) => `  - ${path}\n      vía ${[...trail.map(rel), path].join(" -> ")}`).join("\n") +
    "\n  Cárgalo con import() dinámico tras el guard de la ruta privada."
);

/* 2 · Allowlist exacta: un módulo NUEVO de features/ui en el arranque público
   falla aunque no esté en la lista de prefijos privados. La frontera se amplía
   a mano, con su motivo, no por descuido. */
const featureModules = modules.filter((path) => /^src\/(features|ui)\//u.test(path));
assert.deepEqual(
  featureModules,
  [...ALLOWED_FEATURE_MODULES].sort(),
  `El arranque público alcanza módulos de features/ui fuera de la allowlist declarada.\n` +
    `  alcanzados: ${featureModules.join(", ") || "(ninguno)"}\n` +
    `  declarados: ${[...ALLOWED_FEATURE_MODULES].sort().join(", ")}`
);

/* 3 · La excepción declarada sigue existiendo: una allowlist que nombra un
   archivo borrado deja de proteger nada. */
for (const path of ALLOWED_FEATURE_MODULES) {
  assert.ok(realFile(resolve(SOURCE, path)), `La excepción declarada no existe: ${path}`);
}

console.log("Public bootstrap boundary contract: PASS");
console.log(`- ${modules.length} módulos alcanzables por import estático desde ${ROOTS.length} raíces`);
console.log(`- 0 aristas estáticas al runtime privado (${PRIVATE_RUNTIME.length} prefijos vigilados)`);
console.log(`- allowlist features/ui: ${ALLOWED_FEATURE_MODULES.join(", ")}`);
