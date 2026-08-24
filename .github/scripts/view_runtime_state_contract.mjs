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

console.log(
  "View runtime contract OK · five SPA views use zero-copy read-only Core state"
);
