import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AppCore } from "../src/core/index.js";
import Http from "../src/core/http.js";
import { ACCOUNT_SCOPED_PREFIXES, ANONYMOUS_DEVICE_HINT_KEY, Auth } from "../src/features/auth/index.js";

/*
  Contrato: almacenamiento local por cuenta y dispositivo anónimo.

  - Las claves de cuenta (onion.support.*, onion.correo.*, onion.topbar.*) se
    purgan cuando la identidad autenticada abandona el dispositivo (logout,
    sesión revocada) o cambia de cuenta; las claves de dispositivo (tema,
    idioma, consentimiento) nunca se tocan. La purga la ejecuta el módulo
    auth al recibir onSessionInvalidated del kernel, que se dispara en cada
    cambio de ámbito de sesión, incluidas las limpiezas desde core/http.js.
  - Tras un refresh 401 definitivo o un logout, el dispositivo queda marcado
    como anónimo y restoreSession no vuelve a llamar a /auth/refresh en las
    cargas públicas hasta que una identidad autenticada reaparezca.
  - Nada de esto entra en el kernel: los cierres estáticos de arranque no
    crecen (tools/invoice-api-split-dist-contract.mjs).
*/

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
    keys() { return [...map.keys()]; },
  };
}

const ACCOUNT_KEYS = {
  "onion.support.usuarios.cache.v4": "{}",
  "onion.correo.notifications.v1": "1",
  "onion.correo.mailbox.v1:owner%40example.test": "inbox",
  "onion.correo.signature.v1:owner%40example.test": "{}",
  "onion.topbar.notifications.v1:usr-1": "[]",
  "onion.support.server.status.memory.v2": "{}",
};
const DEVICE_KEYS = {
  "onion.ui.themeMode": "dark",
  "onion.ui.locale": "es-ES",
  "onion_google_consent_v2": "{\"analytics\":true}",
  "unrelated.key": "keep",
};

assert.deepEqual([...ACCOUNT_SCOPED_PREFIXES], ["onion.support.", "onion.correo.", "onion.topbar."]);
assert.equal(ANONYMOUS_DEVICE_HINT_KEY, "onion.auth.anon-device.v1");
for (const key of Object.keys(DEVICE_KEYS)) assert.ok(!ACCOUNT_SCOPED_PREFIXES.some((p) => key.startsWith(p)), `${key} is a device key`);
assert.ok(!ACCOUNT_SCOPED_PREFIXES.some((p) => ANONYMOUS_DEVICE_HINT_KEY.startsWith(p)), "the hint survives the purge");

/* ---------- kernel → auth module: identity transitions drive the purge ---------- */
const storage = fakeStorage();
Auth.session.accountStorage = () => storage; // test injection: no window in Node
Auth.init(); // registers the "auth" module; the kernel calls onSessionInvalidated on every scope change
const user = (id) => ({ id, userId: id, username: id, slug: id, role: "user", permissions: [] });
const seedAccountKeys = () => { for (const [key, value] of Object.entries({ ...ACCOUNT_KEYS, ...DEVICE_KEYS })) storage.setItem(key, value); };
const accountKeysPresent = () => storage.keys().filter((key) => ACCOUNT_SCOPED_PREFIXES.some((p) => key.startsWith(p))).length;
const deviceKeysIntact = () => Object.keys(DEVICE_KEYS).every((key) => storage.getItem(key) === DEVICE_KEYS[key]);
const hinted = () => storage.getItem(ANONYMOUS_DEVICE_HINT_KEY) === "1";

Auth.clearSession();
AppCore.getSessionEpoch();
storage.setItem(ANONYMOUS_DEVICE_HINT_KEY, "1");
AppCore.runtimeState.write({ token: "t.a.1", user: user("usr-a"), session: { id: "s-a", sessionId: "s-a", userId: "usr-a" }, hasRefreshToken: true });
AppCore.getSessionEpoch();
assert.equal(hinted(), false, "an authenticated identity clears the anonymous hint");

seedAccountKeys();
AppCore.runtimeState.write({ token: "t.a.2", user: { ...user("usr-a"), username: "renamed" }, session: { id: "s-a", sessionId: "s-a", userId: "usr-a" } });
AppCore.getSessionEpoch();
assert.equal(accountKeysPresent(), Object.keys(ACCOUNT_KEYS).length, "same identity: profile or token updates never purge");

Auth.clearSession();
AppCore.getSessionEpoch();
assert.equal(accountKeysPresent(), 0, "identity leaving the device purges account keys");
assert.equal(deviceKeysIntact(), true, "device keys survive logout");

AppCore.runtimeState.write({ token: "t.a.3", user: user("usr-a"), session: { id: "s-a2", sessionId: "s-a2", userId: "usr-a" }, hasRefreshToken: true });
AppCore.getSessionEpoch();
seedAccountKeys();
AppCore.runtimeState.write({ token: "t.b.1", user: user("usr-b"), session: { id: "s-b", sessionId: "s-b", userId: "usr-b" }, hasRefreshToken: true });
AppCore.getSessionEpoch();
assert.equal(accountKeysPresent(), 0, "switching account purges the previous account's keys");
assert.equal(deviceKeysIntact(), true);

// http-driven clears (non-refreshable 401 on a private request) reach the same callback through the kernel
seedAccountKeys();
Http.clearSessionForAuthError?.(Object.assign(new Error("SESSION_REVOKED"), { status: 401, code: "SESSION_REVOKED", endpoint: "/api/usuarios" }), "/api/usuarios", { auth: true });
AppCore.runtimeState.write({ token: null, user: null, session: null, hasRefreshToken: false });
AppCore.getSessionEpoch();
assert.equal(accountKeysPresent(), 0, "a session cleared outside the auth feature still purges");

// a blocked storage never breaks the session flow
Auth.session.accountStorage = () => { throw new Error("blocked"); };
assert.doesNotThrow(() => { AppCore.runtimeState.write({ token: "t.x", user: user("usr-x"), session: { id: "s-x", sessionId: "s-x", userId: "usr-x" } }); AppCore.getSessionEpoch(); Auth.clearSession(); AppCore.getSessionEpoch(); });
Auth.session.accountStorage = () => storage;

/* ---------- auth: anonymous device skips the boot refresh ---------- */
const originalRefresh = Http.refreshSession;
let refreshCalls = 0;
const noSession = Object.assign(new Error("SESSION_NOT_FOUND"), { status: 401, code: "SESSION_NOT_FOUND", endpoint: "/api/auth/refresh" });
assert.equal(Http.shouldClearSessionForAuthError(noSession), true, "precondition: a 401 SESSION_NOT_FOUND from refresh is a definitive no-session");
Http.refreshSession = async () => { refreshCalls += 1; throw noSession; };
try {
  Auth.clearSession();
  AppCore.getSessionEpoch();
  storage.removeItem(ANONYMOUS_DEVICE_HINT_KEY);
  const boot = { persistent: true, restoreOnBoot: true, silent: true, credentials: "include", skipRedirect: true, skipNavigation: true };

  const first = await Auth.restoreSession(boot);
  assert.equal(refreshCalls, 1, "first anonymous boot still asks the backend once");
  assert.equal(first.authenticated, false);
  // refreshSession clears the session (and invalidates flows) on a definitive 401, so the
  // outer restore reports either the failure or a stale flow; both are anonymous outcomes.
  assert.ok(["refresh-failed", "stale-restore"].includes(first.reason), first.reason);
  assert.equal(hinted(), true, "a definitive no-session marks the device anonymous");

  const second = await Auth.restoreSession(boot);
  assert.equal(refreshCalls, 1, "subsequent public loads do not call /auth/refresh");
  assert.equal(second.authenticated, false);
  assert.equal(second.skippedRefresh, true);
  assert.equal(second.reason, "anonymous-device");

  const forced = await Auth.restoreSession({ ...boot, forceRefresh: true });
  assert.equal(refreshCalls, 2, "an explicit forceRefresh bypasses the hint");
  assert.ok(["refresh-failed", "stale-restore"].includes(forced.reason), forced.reason);

  // an authenticated identity (login, activation, another tab) re-enables restore
  AppCore.runtimeState.write({ token: "t.c.1", user: user("usr-c"), session: { id: "s-c", sessionId: "s-c", userId: "usr-c" }, hasRefreshToken: true });
  AppCore.getSessionEpoch();
  assert.equal(hinted(), false);
} finally {
  Http.refreshSession = originalRefresh;
  Auth.clearSession();
  AppCore.getSessionEpoch();
  Auth.session.accountStorage = null;
}

/* ---------- source pins ---------- */
const core = read("src/core/index.js");
assert.doesNotMatch(core, /account-storage|purgeAccountStorage|anonymous-device/u, "the kernel stays out of it: startup closures must not grow (tools/invoice-api-split-dist-contract.mjs)");
assert.match(core, /owner\?\.onSessionInvalidated\?\.\(\)/u, "the kernel notifies registered modules on every session scope change");
const auth = read("src/features/auth/index.js");
assert.doesNotMatch(auth, /import\(/u, "no dynamic import in the auth chunk (it would drag the preload helper and main into its static graph)");
assert.match(auth, /function onSessionInvalidated\(\) \{[\s\S]*?if \(previousOwnerId\) purgeAccountStorage\(\);\s*if \(ownerId\) anonymousDevice\("clear"\);/u, "auth purges on identity change and clears the hint on identity arrival");
assert.match(auth, /getAuthHeader, onSessionInvalidated,/u, "the callback is part of the registered auth module");
assert.match(auth, /AppCore\.registerModule\("auth", Auth, \{ overwrite: true \}\)/u, "auth registers itself with the kernel");
assert.match(auth, /sessionState\.restorePromise = \(async \(\) => \{\s*try \{[\s\S]*?await null;\s*if \(isAuthenticated\(\)\)/u,
  "restoreSession yields before any synchronous return so a stale resolved restorePromise can never shadow later restores");
assert.match(auth, /if \(!hasValidToken\(\) && options\.forceRefresh !== true && options\.forceRestore !== true && isAnonymousDeviceHinted\(\)\) \{[\s\S]*?reason: "anonymous-device"/u);
assert.match(auth, /if \(flowIsCurrent\(generation\) && shouldClearSessionForAuthError\(error\)\) \{ clearSession\(\); markAnonymousDevice\(\); \}\s*throw error;/u, "refreshSession marks the device on a definitive 401");
assert.equal((auth.match(/clearSession\(\{ invalidate: false \}\);\n\s+markAnonymousDevice\(\);/gu) || []).length, 2, "both confirmed logout paths mark the device");
const pkg = JSON.parse(read("package.json"));
assert.match(pkg.scripts["validate:source"], /node tools\/account-storage-scope-contract\.mjs/u, "el contrato se ejecuta en validate:source");

console.log("account-storage-scope-contract: OK · purga por cuenta en logout, cambio de cuenta y limpieza desde http · claves de dispositivo intactas · refresh anónimo omitido tras 401 definitivo · kernel intacto");
