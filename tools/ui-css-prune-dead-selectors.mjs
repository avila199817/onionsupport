/* =========================================================
   Onion Support · Poda estructural de selectores muertos en ui.css
   Archivo: /tools/ui-css-prune-dead-selectors.mjs

   POR QUÉ UN PARSER Y NO UNA EXPRESIÓN REGULAR

   Retirar un selector de una lista compartida con búsqueda y reemplazo es
   exactamente lo que dejó `.facturas-detail-btn,` seguido de `}` dentro de
   `@media (forced-colors: active)` y con ello ocho superficies sin
   `forced-color-adjust`. Ese incidente es el motivo de que exista
   tools/css-block-integrity-contract.mjs.

   Aquí se usa postcss --ya presente como dependencia transitiva de Vite, no se
   añade nada al proyecto-- para trabajar sobre el árbol: las at-rules, las
   capas, las media queries y los comentarios se conservan porque nunca se
   tocan como texto.

   QUÉ CUENTA COMO MUERTO

   Una clase está muerta si su nombre COMPLETO no aparece en ningún sitio fuera
   de ui.css: ni en el JS o el HTML que pintan el DOM, ni en otra hoja, ni en
   una fixture de contrato. El límite es de palabra, así que `dropdown-item` no
   se da por vivo porque exista `data-sidebar-dropdown-item`: son clases
   distintas y `.dropdown-item` no casa con la segunda.

   QUÉ SE PODA

   - Una RAMA del selector muere si contiene una clase muerta: el elemento que
     describe no existe, así que la rama no puede casar nunca.
   - Una REGLA sólo desaparece si TODAS sus ramas están muertas. Si sobrevive
     alguna, la regla se queda con las vivas y su especificidad intacta.
   - Una rama con `:not()`, `:is()`, `:where()` o `:has()` NO se poda aunque
     mencione una clase muerta: dentro de una negación una clase inexistente
     AMPLÍA lo que casa, y dentro de `:is()`/`:where()` puede acompañar a
     selectores vivos. Se conservan por precaución.
   - Los `@keyframes` no se tocan.

   Uso:
     node tools/ui-css-prune-dead-selectors.mjs            # informe, no escribe
     node tools/ui-css-prune-dead-selectors.mjs --write    # aplica la poda
========================================================= */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TARGET = "src/css/components/ui.css";
const WRITE = process.argv.includes("--write");

/* =========================================================
   INVENTARIO DE CONSUMIDORES
========================================================= */

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "__pycache__"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const files = [
  ...walk("src"),
  ...walk("tools"),
  ...walk(".github"),
  ...walk("public"),
  ...walk("seo"),
  "index.html",
  "login.html",
].filter((path) => {
  try {
    return statSync(join(ROOT, path)).isFile();
  } catch {
    return false;
  }
});

/* Este fichero se excluye de su propio inventario: sus comentarios nombran
   clases de ejemplo y darían por vivas clases que no lo están. */
const SELF = "tools/ui-css-prune-dead-selectors.mjs";

const haystack = [];
for (const path of files) {
  if (path === TARGET || path === SELF) continue;
  if (![".css", ".js", ".mjs", ".html", ".json", ".txt", ".md", ".py", ".sh"].includes(extname(path))) continue;
  try {
    haystack.push(readFileSync(join(ROOT, path), "utf8"));
  } catch { /* binario u otro */ }
}
const consumers = haystack.join("\n");

/* =========================================================
   CLASES QUE ui.css PINTA
========================================================= */

const source = readFileSync(join(ROOT, TARGET), "utf8");
const root = postcss.parse(source);

const inKeyframes = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) return true;
  }
  return false;
};

const classesOf = (selector) =>
  [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

const styled = new Set();
root.walkRules((rule) => {
  if (inKeyframes(rule)) return;
  for (const name of classesOf(rule.selector)) styled.add(name);
});

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isUsed = (name) =>
  new RegExp(`(?<![\\w-])${escape(name)}(?![\\w-])`).test(consumers);

const dead = new Set([...styled].filter((name) => !isUsed(name)));

/* =========================================================
   PODA
========================================================= */

/*
  Una clase muerta sólo mata la rama si aparece FUERA de una pseudo-clase
  funcional. Dentro de `:not()` una clase inexistente amplía lo que casa, y
  dentro de `:is()`/`:where()`/`:has()` puede acompañar a selectores vivos. Se
  vacían esos paréntesis --de dentro hacia fuera, para soportar anidamiento-- y
  se examina lo que queda, que es el sujeto real de la rama.
*/
const FUNCTIONAL = /:(?:not|is|where|has)\(([^()]*)\)/g;

const subjectOf = (branch) => {
  let previous;
  let current = branch;
  do {
    previous = current;
    current = current.replace(FUNCTIONAL, "");
  } while (current !== previous);
  return current;
};

const branchIsDead = (branch) =>
  classesOf(subjectOf(branch)).some((name) => dead.has(name));

const removedRules = [];
const trimmedRules = [];

root.walkRules((rule) => {
  if (inKeyframes(rule)) return;

  const branches = rule.selectors;
  const live = branches.filter((branch) => !branchIsDead(branch));

  if (live.length === branches.length) return;

  if (live.length === 0) {
    removedRules.push(rule.selector.replace(/\s+/g, " ").trim());
    rule.remove();
    return;
  }

  trimmedRules.push({
    before: rule.selector.replace(/\s+/g, " ").trim(),
    dropped: branches.filter(branchIsDead),
  });

  /* Se conserva el separador original: si la lista venía en varias líneas,
     se devuelve en varias líneas con su misma sangría. */
  const multiline = /,\s*\n/.test(rule.selector);
  const indent = multiline
    ? (rule.selector.match(/,\s*\n(\s*)/) || [, ""])[1]
    : "";
  rule.selector = live.join(multiline ? `,\n${indent}` : ", ");
});

/* At-rules que se quedaron sin ninguna regla dentro. */
const removedAtRules = [];
let pass = 0;
let pruned = true;
while (pruned && pass < 10) {
  pruned = false;
  pass += 1;
  root.walkAtRules((atRule) => {
    if (!atRule.nodes || /keyframes$/i.test(atRule.name)) return;
    const meaningful = atRule.nodes.filter((node) => node.type !== "comment");
    if (meaningful.length === 0) {
      removedAtRules.push(`@${atRule.name} ${atRule.params}`.replace(/\s+/g, " ").trim());
      atRule.remove();
      pruned = true;
    }
  });
}

const output = root.toResult().css;

/* =========================================================
   INFORME
========================================================= */

const beforeBytes = Buffer.byteLength(source, "utf8");
const afterBytes = Buffer.byteLength(output, "utf8");
const beforeLines = source.split("\n").length;
const afterLines = output.split("\n").length;

console.log(`clases que pinta ui.css : ${styled.size}`);
console.log(`sin ningún consumidor   : ${dead.size}`);
console.log(`reglas retiradas enteras: ${removedRules.length}`);
console.log(`reglas podadas en parte : ${trimmedRules.length}`);
console.log(`at-rules vacías retirada: ${removedAtRules.length}`);
console.log(`líneas : ${beforeLines} -> ${afterLines} (${afterLines - beforeLines})`);
console.log(`bytes  : ${beforeBytes} -> ${afterBytes} (${afterBytes - beforeBytes})`);

if (trimmedRules.length) {
  console.log("\nreglas que conservan ramas vivas:");
  for (const { before, dropped } of trimmedRules) {
    console.log(`  ${before}`);
    console.log(`     - ramas retiradas: ${dropped.join(" | ")}`);
  }
}
if (removedAtRules.length) {
  console.log("\nat-rules vacías:");
  for (const name of removedAtRules) console.log(`  ${name}`);
}

if (WRITE) {
  writeFileSync(join(ROOT, TARGET), output, "utf8");
  console.log(`\nESCRITO en ${TARGET}`);
} else {
  console.log("\n(informe; usa --write para aplicar)");
}
