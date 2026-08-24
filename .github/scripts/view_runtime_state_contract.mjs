import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const viewFiles = [
  "src/views/facturas/index.js",
  "src/views/incidencias/index.js",
  "src/views/clientes/index.js",
  "src/views/usuarios/index.js",
  "src/views/server/index.js",
];

for (const path of viewFiles) {
  const source = await readFile(path, "utf8");

  assert.equal(
    source.includes("AppCore.runtimeState.read()"),
    true,
    `${path} must consume the zero-copy Core runtime state port`
  );
  assert.equal(
    /\bAppCore\s*\.\s*getState\s*\??\.\s*\(/.test(source),
    false,
    `${path} must not build public Core state snapshots`
  );

  const directStatePatterns = [
    /\bAppCore\s*\.\s*state\s*\.\s*[A-Za-z_$][\w$]*/,
    /\bAppCore\s*\.\s*state\s*\[/,
    /\bAppCore\s*\.\s*state\s*=/,
    /\bObject\s*\.\s*assign\s*\(\s*AppCore\s*\.\s*state\b/,
    /\bdelete\s+AppCore\s*\.\s*state\b/,
  ];

  for (const pattern of directStatePatterns) {
    assert.equal(
      pattern.test(source),
      false,
      `${path} must not depend on direct AppCore.state access: ${pattern}`
    );
  }

  assert.equal(
    source.includes("AppCore.runtimeState.write("),
    false,
    `${path} view layer must remain read-only against Core runtime state`
  );
}

const usuariosSource = await readFile("src/views/usuarios/index.js", "utf8");

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const lineStart = source.lastIndexOf("\n", start) + 1;
  const indent = source.slice(lineStart, start);
  const end = source.indexOf(`\n${indent}function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `Usuarios contract must isolate ${name}()`);
  return source.slice(start, end);
}

function countCalls(source, pattern) {
  return (source.match(pattern) || []).length;
}

const currentUserSource = functionSource(
  usuariosSource,
  "getCurrentUser",
  "getCurrentRole"
);
assert.equal(
  countCalls(currentUserSource, /getAppState\s*\(/g),
  1,
  "Usuarios current-user helper must perform at most its one default operation-local Core read"
);
assert.equal(
  currentUserSource.includes("AppCore.getCurrentUser"),
  false,
  "Usuarios current-user helper must not reread Core through the public user getter"
);

const currentRoleSource = functionSource(
  usuariosSource,
  "getCurrentRole",
  "isAdminContext"
);
assert.equal(
  countCalls(currentRoleSource, /getAppState\s*\(/g),
  1,
  "Usuarios role helper must perform at most its one default operation-local Core read"
);
assert.equal(
  currentRoleSource.includes("getCurrentUser(state)"),
  true,
  "Usuarios role helper must reuse the supplied runtime state for user identity"
);
assert.equal(
  currentRoleSource.includes("AppCore.getCurrentRole"),
  false,
  "Usuarios role helper must not reread Core through the public role getter"
);

const adminSource = functionSource(
  usuariosSource,
  "isAdminContext",
  "normalizePathname"
);
assert.equal(
  countCalls(adminSource, /getAppState\s*\(/g),
  0,
  "Usuarios admin helper must preserve the explicit-admin zero-read short-circuit"
);
assert.equal(
  adminSource.includes("getCurrentRole(context)"),
  true,
  "Usuarios admin helper must delegate one-read role resolution only when needed"
);
const compactAdminSource = adminSource.replace(/\s+/g, "");
assert.equal(
  compactAdminSource.includes(
    'context.admin===true||getCurrentRole(context)==="admin"'
  ),
  true,
  "Usuarios admin helper must short-circuit explicit admin before any Core role read"
);

const payloadSource = functionSource(
  usuariosSource,
  "viewPayload",
  "captureDomState"
);
assert.equal(
  countCalls(payloadSource, /getAppState\s*\(/g),
  1,
  "Usuarios render payload must perform exactly one operation-local Core read"
);
assert.equal(
  payloadSource.includes("getCurrentRole(context, state)"),
  true,
  "Usuarios render payload must derive role from the operation-local state"
);
assert.equal(
  payloadSource.includes("isAdminContext("),
  false,
  "Usuarios render payload must not reread Core while deriving admin"
);
assert.equal(
  payloadSource.includes("role,"),
  true,
  "Usuarios render payload must reuse the already-derived role"
);

const snapshotStart = usuariosSource.indexOf("\n    getSnapshot() {");
const snapshotEnd = usuariosSource.indexOf("\n    destroy() {", snapshotStart);
assert.ok(
  snapshotStart >= 0 && snapshotEnd > snapshotStart,
  "Usuarios contract must isolate controller getSnapshot()"
);
const snapshotSource = usuariosSource.slice(snapshotStart, snapshotEnd);
assert.equal(
  countCalls(snapshotSource, /getAppState\s*\(/g),
  1,
  "Usuarios controller snapshot must perform exactly one operation-local Core read"
);
assert.equal(
  snapshotSource.includes("getCurrentRole(context, state)"),
  true,
  "Usuarios controller snapshot must reuse its operation-local state for role"
);
assert.equal(
  snapshotSource.includes("isAdminContext("),
  false,
  "Usuarios controller snapshot must not reread Core for admin"
);

const routeDebugStart = usuariosSource.indexOf(
  "export const getUsuariosRouteDebug = (context = {}) => {"
);
const routeDebugEnd = usuariosSource.indexOf(
  "\n\n/* =========================================================\n   MODAL COMPAT",
  routeDebugStart
);
assert.ok(
  routeDebugStart >= 0 && routeDebugEnd > routeDebugStart,
  "Usuarios contract must isolate getUsuariosRouteDebug()"
);
const routeDebugSource = usuariosSource.slice(routeDebugStart, routeDebugEnd);
assert.equal(
  countCalls(routeDebugSource, /getAppState\s*\(/g),
  1,
  "Usuarios route debug must perform exactly one operation-local Core read"
);
assert.equal(
  routeDebugSource.includes("getCurrentRole(context, state)"),
  true,
  "Usuarios route debug must reuse the same runtime state for role"
);
assert.equal(
  routeDebugSource.includes("isAdminContext("),
  false,
  "Usuarios route debug must not reread Core for admin"
);

console.log(
  "View runtime contract OK · five SPA views use zero-copy read-only Core state · Usuarios one-read role context"
);
