import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, apiBase, api] = await Promise.all([
  readFile("src/views/server/index.js", "utf8"),
  readFile("src/views/server/server.api.base.js", "utf8"),
  readFile("src/views/server/server.api.js", "utf8"),
]);

const mountStart = index.indexOf("  async function mount(");
const destroyStart = index.indexOf("  async function destroy(");
assert.ok(mountStart >= 0 && destroyStart > mountStart, "Servidor mount/destroy boundaries must exist");
const mount = index.slice(mountStart, destroyStart);

assert.match(index, /servidor\.index\.api-boundary\.v3\.nonblocking-observability/);
assert.match(mount, /void load\(\{/);
assert.match(mount, /paintPending:\s*false/);
assert.match(mount, /return controller;/);
assert.doesNotMatch(mount, /await load\(\{/);

assert.match(index, /loadAbortController:\s*null/);
assert.match(index, /function abortLoad\(/);
assert.match(index, /server-view-destroyed/);
assert.match(index, /signal:\s*requestSignal/);

const baseSignalCount = (apiBase.match(/signal:\s*\n\s*options\.signal\s*\|\|\s*\n\s*null/g) || []).length;
assert.equal(baseSignalCount, 2, "Health GET/request must both forward the abort signal");

const costSignalCount = (api.match(/signal:\s*options\.signal\s*\|\|\s*null/g) || []).length;
assert.equal(costSignalCount, 2, "Cost GET/request must both forward the abort signal");

assert.match(api, /const healthPromise = Base\.loadServerSnapshot\(opts\);/);
assert.match(api, /const costsPromise = resolveCostsForDashboard\(opts\);/);

console.log("Servidor navigation performance contract: PASS · immediate route commit · single entry paint · abortable health/cost I/O");
