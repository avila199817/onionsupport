import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clamp, finiteNumber } from "../src/core/numbers.js";
import { SERVER_AUTO_REFRESH_DEFAULT_MS, SERVER_REQUEST_TIMEOUT_MS } from "../src/views/server/server.api.base.js";
import {
  USUARIOS_CREATE_TIMEOUT,
  USUARIOS_DELETE_TIMEOUT,
  USUARIOS_DETAIL_TIMEOUT,
  USUARIOS_LIST_TIMEOUT,
  USUARIOS_TIMEOUT,
  USUARIOS_UPDATE_TIMEOUT,
} from "../src/views/usuarios/usuarios.api.js";

// Declared timings: the cadence of the Server live mode and the request
// timeouts of Server health and Usuarios are constants with a single
// declaring module. A caller that omits the value must land on the declared
// one, not on a clamp floor or on core/http's generic default: until
// b39b62f2 these three modules parsed the omitted value with a copy whose
// value = 0 default turned it into 0, so the Server live mode ran every 5 s
// (the clamp floor) instead of 30 s, health requests took core/http's 30 s
// instead of 15 s, and every Usuarios request aborted after 1 s (the clamp
// floor) instead of 18 s or 30 s.
//
// Backend budget (oniontech, server.js): every normal route, health and
// Usuarios included, is cut by NORMAL_API_TIMEOUT_MS = 15 s, and its Cosmos
// dependency by COSMOS_REQUEST_TIMEOUT_MS = 10 s; the health thresholds call
// 1.5 s of total latency critical. So 15 s for health is the same budget the
// server gives itself (no dependency is allowed longer), and the Usuarios
// 18 s / 30 s sit above the server's cut, which is the safe direction: the
// person sees the server's answer instead of a client abort.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(`${ROOT}${path}`, "utf8");
const SERVER_VIEW = "src/views/server/index.js";
const SERVER_API = "src/views/server/server.api.base.js";
const USUARIOS_API = "src/views/usuarios/usuarios.api.js";
const HTTP = "src/core/http.js";
// Floors and ceilings the call sites clamp with, and the effective value a
// caller that omits the option must get.
const LIVE_FLOOR_MS = 5_000;
const LIVE_CEILING_MS = 600_000;
const USUARIOS_FLOOR_MS = 1_000;
const USUARIOS_CEILING_MS = 120_000;

// 1. The declared values.
assert.equal(SERVER_AUTO_REFRESH_DEFAULT_MS, 30_000, "Server live cadence");
assert.equal(SERVER_REQUEST_TIMEOUT_MS, 15_000, "Server health request timeout");
assert.equal(USUARIOS_TIMEOUT, 15_000);
assert.equal(USUARIOS_LIST_TIMEOUT, 20_000);
assert.equal(USUARIOS_DETAIL_TIMEOUT, 18_000);
assert.equal(USUARIOS_CREATE_TIMEOUT, 30_000);
assert.equal(USUARIOS_UPDATE_TIMEOUT, 30_000);
assert.equal(USUARIOS_DELETE_TIMEOUT, 30_000);

// 2. An omitted option lands on the declared value, and no clamp overrides it.
const liveInterval = (option) => clamp(finiteNumber(option, SERVER_AUTO_REFRESH_DEFAULT_MS), LIVE_FLOOR_MS, LIVE_CEILING_MS);
assert.equal(liveInterval(undefined), 30_000, "no intervalMs: the declared cadence, not the clamp floor");
assert.equal(liveInterval(null), 30_000);
assert.equal(liveInterval(""), 30_000);
assert.equal(liveInterval(60_000), 60_000, "an explicit cadence still wins");
assert.equal(liveInterval(1_000), LIVE_FLOOR_MS, "the floor still protects against a too small cadence");
assert.equal(liveInterval(0), LIVE_FLOOR_MS, "an explicit 0 is a value, and the floor answers for it");
const usuariosTimeout = (option, declared) => clamp(finiteNumber(option, declared), USUARIOS_FLOOR_MS, USUARIOS_CEILING_MS);
for (const [name, declared] of Object.entries({ USUARIOS_TIMEOUT, USUARIOS_LIST_TIMEOUT, USUARIOS_DETAIL_TIMEOUT, USUARIOS_CREATE_TIMEOUT, USUARIOS_UPDATE_TIMEOUT, USUARIOS_DELETE_TIMEOUT })) {
  assert.equal(usuariosTimeout(undefined, declared), declared, `${name}: an omitted timeout is the declared one`);
  assert.ok(declared > USUARIOS_FLOOR_MS && declared < USUARIOS_CEILING_MS, `${name} sits inside the clamp`);
}
assert.equal(usuariosTimeout(45_000, USUARIOS_DETAIL_TIMEOUT), 45_000, "an explicit timeout still wins");
assert.equal(usuariosTimeout(0, USUARIOS_DETAIL_TIMEOUT), USUARIOS_FLOOR_MS, "an explicit 0 is what used to reach the floor");

// 3. core/http does not shorten a declared timeout: normalizeTimeout only
// raises a value below its own floor and only replaces a non-positive one.
const httpSource = read(HTTP);
const normalizeTimeout = new Function("DEFAULT_TIMEOUT_MS", `${bodyOf(httpSource, "normalizeTimeout")}\nreturn normalizeTimeout;`)(30_000);
for (const declared of [SERVER_REQUEST_TIMEOUT_MS, USUARIOS_DETAIL_TIMEOUT, USUARIOS_CREATE_TIMEOUT, USUARIOS_LIST_TIMEOUT]) {
  assert.equal(normalizeTimeout(declared), declared, "a declared timeout survives core/http untouched");
}
assert.equal(normalizeTimeout(0), 30_000, "the old 0 fell back to the generic default");
assert.equal(normalizeTimeout(undefined), 30_000);
assert.equal(normalizeTimeout(500), 1_000, "core/http keeps its own floor");

// 4. One abort per request and no orphan timer: the timeout schedules with
// the declared delay, an external abort and the timer share one controller,
// and cleanup clears the timer and drops the listener.
const timers = new Map();
let nextTimer = 1;
const scheduled = [];
const fakeSetTimeout = (fn, delay) => { const id = nextTimer++; timers.set(id, fn); scheduled.push(delay); return id; };
const fakeClearTimeout = (id) => { timers.delete(id); };
const createRequestAbort = new Function(
  "DEFAULT_TIMEOUT_MS", "isFunction", "setTimeout", "clearTimeout", "AbortController",
  `${bodyOf(httpSource, "normalizeTimeout")}\n${bodyOf(httpSource, "createRequestAbort")}\nreturn createRequestAbort;`
)(30_000, (value) => typeof value === "function", fakeSetTimeout, fakeClearTimeout, AbortController);
{
  const abort = createRequestAbort({ timeoutMs: SERVER_REQUEST_TIMEOUT_MS });
  assert.deepEqual(scheduled, [SERVER_REQUEST_TIMEOUT_MS], "the timer carries the declared timeout");
  let aborts = 0;
  abort.signal.addEventListener("abort", () => { aborts += 1; });
  timers.get(1)();
  assert.equal(abort.timedOut(), true);
  assert.equal(aborts, 1, "the timeout aborts once");
  abort.cleanup();
  assert.equal(timers.size, 0, "cleanup leaves no pending timer");
}
{
  scheduled.length = 0;
  const external = new AbortController();
  const abort = createRequestAbort({ timeoutMs: USUARIOS_DETAIL_TIMEOUT, externalSignal: external.signal });
  assert.deepEqual(scheduled, [USUARIOS_DETAIL_TIMEOUT]);
  let aborts = 0;
  abort.signal.addEventListener("abort", () => { aborts += 1; });
  external.abort();
  const timerId = [...timers.keys()][0];
  timers.get(timerId)();
  assert.equal(aborts, 1, "an external abort and a later timeout never abort twice");
  assert.equal(abort.externallyAborted(), true);
  abort.cleanup();
  assert.equal(timers.size, 0, "cleanup leaves no pending timer after an external abort");
}
assert.match(httpSource, /\}\s*finally\s*\{\s*requestAbort\.cleanup\(\);/u, "every request cleans its abort up in a finally");

// 5. The call sites read the declared constants, and the live timer is
// cleared when it is replaced, stopped and on teardown.
const serverView = read(SERVER_VIEW);
const serverApi = read(SERVER_API);
const usuariosApi = read(USUARIOS_API);
assert.match(serverView, /clamp\(\s*finiteNumber\(\s*options\.intervalMs,\s*SERVER_REFRESH_INTERVAL_MS\s*\),\s*5_000,\s*600_000\s*\)/u, "the live cadence reads the declared constant");
assert.match(serverView, /const SERVER_REFRESH_INTERVAL_MS =\s*SERVER_AUTO_REFRESH_DEFAULT_MS;/u, "the view names the API's declared cadence");
assert.equal((serverApi.match(/finiteNumber\(\s*options\.timeout,\s*SERVER_REQUEST_TIMEOUT_MS\s*\)/gu) || []).length, 2, "both health transports read the declared timeout");
assert.match(serverApi, /clamp\(\s*finiteNumber\(\s*options\?\.intervalMs,\s*SERVER_AUTO_REFRESH_DEFAULT_MS\s*\)/u, "the API's auto refresh reads the declared cadence");
for (const declared of ["USUARIOS_LIST_TIMEOUT", "USUARIOS_DETAIL_TIMEOUT", "USUARIOS_CREATE_TIMEOUT", "USUARIOS_UPDATE_TIMEOUT"]) {
  assert.match(usuariosApi, new RegExp(`finiteNumber\\(\\s*options\\.timeout,\\s*${declared}\\s*\\)`, "u"), `${declared} reaches its request`);
}
assert.match(usuariosApi, /clamp\(\s*finiteNumber\(\s*options\.timeout,\s*USUARIOS_TIMEOUT\s*\),\s*1_000,\s*120_000\s*\)/u, "the shared transport clamps around the declared timeout");
assert.equal((serverView.match(/clearLiveTimer\(\);/gu) || []).length >= 2, true, "the live timer is cleared before being replaced and when stopped");
assert.match(serverView, /state\.destroyed =[\s\S]{0,400}?stopLive\(/u, "teardown stops the live timer");
assert.match(serverView, /async function refresh\(\)\s*\{\s*return load\(\{\s*force: true,\s*silent: true,/u, "the live tick refreshes silently: the panel keeps its snapshot between ticks");

function bodyOf(source, name) {
  const match = source.match(new RegExp(`(?:^|\\n)(function ${name}\\s*\\()`, "u"));
  assert.ok(match, `${name} is declared in core/http.js`);
  const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
  // Skip the parameter list first: a destructured parameter carries braces.
  let cursor = source.indexOf("(", start);
  let parens = 0;
  for (; ; cursor += 1) {
    const char = source[cursor];
    if (char === "(") parens += 1;
    else if (char === ")") { parens -= 1; if (parens === 0) break; }
  }
  let index = source.indexOf("{", cursor);
  let depth = 0;
  for (; ; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") { depth -= 1; if (depth === 0) break; }
  }
  return source.slice(start, index + 1);
}

console.log("Declared timings contract: PASS · Server live 30 s and health 15 s, Usuarios 15/20/18/30/30/30 s · an omitted option lands on the declared value, never on a clamp floor · core/http never shortens a declared timeout · one abort per request, timer cleared on cleanup and on teardown · call sites read the declaring constants · backend budget 15 s (Cosmos 10 s) documented");
