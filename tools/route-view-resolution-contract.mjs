import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One authority resolves a route to its view: the module registry in src/router/routes.js.
//
// pickView(module, names) walks the declared names and, finding none, falls back to
// `module?.default || module`. The fallback is a safety net, not a way to register a route:
// a route that declares no names resolves implicitly, so nothing states which export is its
// entry point, nothing can check that export still exists, and renaming it breaks the route
// with no failing test. /agenda was the only route in the registry doing that.
//
// So: every registered route declares the names it resolves by, and every declared name is
// really exported by the module it points at. The fallback stays for robustness at runtime;
// it just stops being how a route is wired.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const routes = await readFile(resolve(ROOT, "src/router/routes.js"), "utf8");

const ENTRY = /^ {2}([A-Za-z0-9_$-]+): Object\.freeze\(\{\n(.*?)^ {2}\}\),/gmsu;
const MODULE_PATH = /import\(\s*"([^"]+)"\s*\)/u;
const NAMES = /names: Object\.freeze\(\[(.*?)\]\)/su;

const entries = [];
for (const match of routes.matchAll(ENTRY)) {
  const [, key, body] = match;
  if (!body.includes("loadModule")) continue;
  const modulePath = body.match(MODULE_PATH)?.[1] ?? "";
  const declared = body.match(NAMES)?.[1] ?? "";
  const names = [...declared.matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
  entries.push({ key, modulePath, names });
}

assert.ok(entries.length >= 13, `Route module registry not found or too small: ${entries.length}`);

const implicit = entries.filter((entry) => entry.names.length === 0).map((entry) => entry.key);
assert.deepEqual(
  implicit,
  [],
  "a registered route resolves its view implicitly through module.default: declare the names it resolves by"
);

const missingModule = entries.filter((entry) => !entry.modulePath.startsWith("../")).map((e) => e.key);
assert.deepEqual(missingModule, [], "every registered route names the module it loads");

// Each declared name must really be exported where the route points, so a rename cannot
// silently fall through to the default and keep the route limping.
const EXPORTED = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gmu;
const LISTED = /^export\s*\{([^}]*)\}/gmu;
const unresolved = [];
for (const entry of entries) {
  const path = resolve(ROOT, "src/router", entry.modulePath);
  const source = await readFile(path, "utf8");
  const exported = new Set();
  for (const m of source.matchAll(EXPORTED)) exported.add(m[1]);
  for (const m of source.matchAll(LISTED)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/u).pop();
      if (name) exported.add(name);
    }
  }
  for (const name of entry.names) {
    if (!exported.has(name)) unresolved.push(`${entry.key} -> ${entry.modulePath}#${name}`);
  }
}
assert.deepEqual(
  unresolved,
  [],
  "a route declares a view name its module does not export: the route would fall back to the default"
);

const total = entries.reduce((sum, entry) => sum + entry.names.length, 0);
console.log(
  `Route view resolution contract: PASS · ${entries.length} registered routes, all explicit · ` +
    `${total} declared view names, each exported by the module its route loads`
);
