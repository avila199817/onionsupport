import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = [
  {
    path: "src/ui/sidebar/index.js",
    version: "sidebar.controller.v6-committed-route-context",
    reader: "readCoreState",
  },
  {
    path: "src/ui/topbar/index.js",
    version: "topbar.controller.backend-search.v8-native-runtime-state",
    reader: "getCoreState",
  },
];

for (const file of files) {
  const source = await readFile(file.path, "utf8");

  assert.equal(
    source.includes(file.version),
    true,
    `${file.path} must expose the native runtime-state version`
  );
  assert.equal(
    source.includes("AppCore.runtimeState.read()"),
    true,
    `${file.path} must consume Core's zero-copy runtime read port`
  );
  assert.equal(
    source.includes("AppCore.getState()"),
    false,
    `${file.path} hot sync must not build a public Core snapshot`
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
      `${file.path} must not depend on direct AppCore.state access: ${pattern}`
    );
  }

  const readerIndex = source.indexOf(`function ${file.reader}()`);
  assert.notEqual(readerIndex, -1, `${file.path} must keep its state reader`);
  const nextFunctionIndex = source.indexOf("\nfunction ", readerIndex + 10);
  const readerSource = source.slice(
    readerIndex,
    nextFunctionIndex === -1 ? source.length : nextFunctionIndex
  );
  assert.equal(
    readerSource.includes("runtimeState?.read"),
    true,
    `${file.path} state reader must feature-detect runtimeState.read`
  );
  assert.equal(
    readerSource.includes("return {};"),
    true,
    `${file.path} state reader must fail closed when the runtime port is unavailable`
  );
}

const sidebarSource = await readFile("src/ui/sidebar/index.js", "utf8");
const contextStart = sidebarSource.indexOf("function getContext(");
const contextEnd = sidebarSource.indexOf("\nfunction shouldRenderSidebar(", contextStart);
assert.ok(
  contextStart >= 0 && contextEnd > contextStart,
  "Sidebar contract must isolate getContext()"
);
const contextSource = sidebarSource.slice(contextStart, contextEnd);

assert.match(
  contextSource,
  /const\s+publicPath\s*=\s*supplied\.publicPath\s*\|\|\s*currentPublicPath\s*\(\s*state\s*\)/s,
  "Sidebar must reuse Router's committed publicPath before consulting Router again"
);
assert.match(
  contextSource,
  /const\s+canonicalPath\s*=\s*normalizePath\s*\(\s*supplied\.canonicalPath\s*\|\|\s*currentCanonicalPath\s*\(\s*state\s*\)\s*\)/s,
  "Sidebar must reuse Router's committed canonicalPath before consulting Router again"
);
assert.match(
  contextSource,
  /route:\s*supplied\.route\s*\|\|\s*getCurrentRoute\s*\(/s,
  "Sidebar must reuse Router's already-resolved committed route"
);

const syncStart = sidebarSource.indexOf("function sync(");
const syncEnd = sidebarSource.indexOf(
  "\n/* =========================================================\n   ACTIONS",
  syncStart
);
assert.ok(
  syncStart >= 0 && syncEnd > syncStart,
  "Sidebar contract must isolate sync()"
);
const syncSource = sidebarSource.slice(syncStart, syncEnd);
assert.match(
  syncSource,
  /function\s+sync\s*\(\s*options\s*=\s*\{\}\s*\)/s,
  "Sidebar sync must accept Router's committed context"
);
assert.match(
  syncSource,
  /getContext\s*\(\s*options\s*\)/s,
  "Sidebar sync must pass committed context into getContext()"
);

console.log(
  "Shell runtime contract OK · Sidebar committed Router context reuse · Sidebar/Topbar zero-copy Core reads"
);
