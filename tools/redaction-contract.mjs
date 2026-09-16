import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SENSITIVE_QUERY_PARAMS } from "../src/core/config.js";
import { SENSITIVE_QUERY_KEYS, redactSecrets, redactTokenPaths, redactUrl } from "../src/core/redact.js";

// Secret redaction lives in core/redact.js: redactSecrets (pattern pass over
// free text), redactUrl (URL-aware pass for routes and http traces, then the
// pattern pass) and redactTokenPaths (the legacy reset and activation token
// paths alone), over the compact key set SENSITIVE_QUERY_KEYS derived from
// config's SENSITIVE_QUERY_PARAMS. Sixteen modules carried a copy with four
// different name lists, two prefixes (cleanText or String) and two legacy path
// coverages; every consumer now composes the authority. main.js keeps its own
// copy because the entry imports no shared module. The names are frozen here:
// adding one changes what the router drops from a navigation and what media
// accepts, so it is a decision. The pattern also masks "sas=" (seven view
// copies did) without adding it to the parameter set.
const AUTHORITY = "src/core/redact.js";
const CONFIG = "src/core/config.js";
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
const PARAM_NAMES = Object.freeze(["token", "access_token", "accessToken", "refresh_token", "refreshToken", "id_token", "idToken", "jwt", "authorization", "session", "sessionId", "session_id", "secret", "code", "password", "pwd", "key", "sig", "signature", "reset_token", "resetToken", "activation_token", "activationToken"]);
const PATTERN_EXTRA_NAMES = Object.freeze(["sas"]);
const SECRET = "S3cr3tV4lu3XYZ";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

assert.deepEqual([...SENSITIVE_QUERY_PARAMS], PARAM_NAMES, "config names the frozen sensitive parameters; adding one is a decision");
assert.deepEqual([...SENSITIVE_QUERY_KEYS].sort(), [...new Set(PARAM_NAMES.map((name) => name.replace(/[-_\s]/g, "").toLowerCase()))].sort(), "the compact key set is exactly the config names");
assert.equal(SENSITIVE_QUERY_KEYS.has("sas"), false, "sas is a pattern extra, not a parameter key");

// Behaviour: the pattern pass.
for (const name of [...PARAM_NAMES, ...PATTERN_EXTRA_NAMES]) {
  assert.equal(redactSecrets(`/r?${name}=${SECRET}&page=2`), `/r?${name}=***&page=2`, `${name}: query assignment`);
  assert.equal(redactSecrets(`msg &${name.toUpperCase()}=${SECRET}`), `msg &${name.toUpperCase()}=***`, `${name}: case-insensitive, & separator`);
  assert.equal(redactSecrets(`#${name}=${SECRET}`), `#${name}=***`, `${name}: fragment assignment`);
}
assert.equal(redactSecrets(`/r?${SECRET}=1&tokenizer=${SECRET}`), `/r?${SECRET}=1&tokenizer=${SECRET}`, "only the listed names, whole");
assert.equal(redactSecrets(`/r?access-token=${SECRET}`), `/r?access-token=${SECRET}`, "the pattern compares names as written");
assert.equal(redactSecrets(`/password-reset/confirm/${SECRET}?x=1`), "/password-reset/confirm/***?x=1");
assert.equal(redactSecrets(`https://onionsupport.com/reset-password/confirm/${SECRET}`), "https://onionsupport.com/reset-password/confirm/***");
assert.equal(redactSecrets(`/activate-account/${SECRET}#f`), "/activate-account/***#f");
assert.equal(redactSecrets(`Authorization: Bearer ${SECRET}`), "Authorization: Bearer ***");
assert.equal(redactSecrets(`bearer\t${SECRET}`), "bearer\t***", "Bearer is case-insensitive and keeps its whitespace");
assert.equal(redactSecrets(`token ${JWT} fin`), "token *** fin", "JWT shape");
assert.equal(redactSecrets("abc.def.ghi 1.2.3 onionsupport.azurewebsites.net"), "abc.def.ghi 1.2.3 onionsupport.azurewebsites.net", "short dotted words are not JWTs");
assert.equal(redactSecrets(" a \n\t b  "), " a \n\t b  ", "whitespace is preserved: presenting modules clean first");
assert.equal(redactSecrets(null), "");
assert.equal(redactSecrets(undefined), "");
assert.equal(redactSecrets(42), "42");
assert.equal(redactTokenPaths(`/activate-account/${SECRET}?token=${SECRET}`), `/activate-account/***?token=${SECRET}`, "token paths only");

// Behaviour: the URL-aware pass.
assert.equal(redactUrl(""), "");
assert.equal(redactUrl(null), "");
assert.equal(redactUrl(`https://api.onionsupport.com/v1?token=${SECRET}&page=2#h`), "https://api.onionsupport.com/v1?token=***&page=2#h", "absolute URLs keep their origin");
assert.equal(redactUrl(`  /r?Token=${SECRET}&access-token=${SECRET}&page=2  `), "/r?Token=***&access-token=***&page=2", "relative: pathname + search + hash, compact keys, cleaned first");
assert.equal(redactUrl(`/r#access_token=${SECRET}`), "/r#access_token=***", "fragment assignments are masked by the pattern pass");
assert.equal(redactUrl(`/activate-account/${SECRET}`), "/activate-account/***");
assert.equal(redactUrl(`http://exa mple.com/?sas=${SECRET}`), "http://exa mple.com/?sas=***", "text the URL parser rejects falls back to the pattern pass");
assert.equal(redactUrl("No se pudo cargar el inicio."), "/No%20se%20pudo%20cargar%20el%20inicio.", "text that is not a URL comes back as an encoded path: redactUrl is for routes and URLs only; messages, payload strings and hashes go through redactSecrets (http-error-payload-contract)");

// Source: one definer, no inline copy of any pattern, callers import by name, entry and leaf import nothing.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const DEFINER = /^(?:export )?function (redact|redactSecrets|redactUrl|redactTokenPaths|redactLegacyResetToken|cleanErrorText)\s*\(/gmu;
const REDACTION_FINGERPRINTS = Object.freeze({
  queryAssignment: /\(\[\?&#\]\(\?:[\w|]+\)=\)\(\[\^&#\\s\]\+\)/u,
  tokenPath: /\)\(\[\^\/\?#\\s\]\+\)\/gi/u,
  bearer: /\(Bearer\\s\+\)/u,
  jwtShape: /\{10,\}\\\.\[A-Za-z0-9_-\]\{10,\}/u,
});
// Detection regexes ("does this URL carry a secret?") are another responsibility with lists of their own; upper bound for the next unit.
const QUERY_DETECTION = /\/\[\?&#\]\(\?:[\w|]+\)=\/i/u;
const QUERY_DETECTION_PENDING = Object.freeze(["src/features/topbar-executive/index.base.js", "src/ui/sidebar/index.js", "src/ui/sidebar/template.js", "src/ui/topbar/index.base.js", "src/views/clientes/clientes.model.js", "src/views/clientes/clientes.template.create.js", "src/views/clientes/clientes.template.js", "src/views/clientes/clientes.template.modal.js", "src/views/facturas/facturas.api.base.js", "src/views/facturas/facturas.template.create.js", "src/views/facturas/facturas.template.js", "src/views/home/home.template.foundation.js", "src/views/home/index.js", "src/views/incidencias/incidencias.api.impl.js", "src/views/incidencias/incidencias.template.create.impl.js", "src/views/incidencias/incidencias.template.js", "src/views/public/activate-account/index.js", "src/views/public/index.js"]);
const IMPORT = /import \{([^}]*)\} from "(?:\.\/redact\.js|[^"]*\/core\/redact\.js)";/u;
const definers = {}; const copies = []; const paramReaders = []; const detection = []; const entryImports = []; let consumers = 0;
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  const names = [...code.matchAll(DEFINER)].map((m) => m[1]);
  if (names.length) definers[path] = names;
  if (QUERY_DETECTION.test(code)) detection.push(path);
  if (path !== AUTHORITY && path !== CONFIG && /\bSENSITIVE_QUERY_PARAMS\b/u.test(code)) paramReaders.push(path);
  if (ENTRY_AND_LEAF.includes(path)) { if (IMPORT.test(code)) entryImports.push(path); continue; }
  if (path === AUTHORITY) continue;
  for (const [name, fingerprint] of Object.entries(REDACTION_FINGERPRINTS)) if (fingerprint.test(code)) copies.push(`${path}: ${name}`);
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const used = ["redactSecrets", "redactUrl", "redactTokenPaths", "SENSITIVE_QUERY_KEYS"].filter((name) => new RegExp(`(?<![\\w$.])${name}(?![\\w$])`, "u").test(executable.replace(IMPORT, "")));
  if (!used.length) continue;
  const imported = (code.match(IMPORT) || [, ""])[1].split(",").map((s) => s.trim()).filter(Boolean);
  for (const name of used) assert.ok(imported.includes(name), `${path}: imports ${name} from core/redact.js`);
  consumers++;
}
assert.deepEqual(definers, { [AUTHORITY]: ["redactTokenPaths", "redactSecrets", "redactUrl"], "src/main.js": ["redact"] }, "the three passes are defined only in the authority; main.js keeps the entry copy");
assert.deepEqual(copies, [], "no module outside the authority and main.js carries a redaction pattern");
assert.deepEqual(paramReaders, [], "SENSITIVE_QUERY_PARAMS is read only by the authority (every key set imports SENSITIVE_QUERY_KEYS)");
assert.deepEqual(entryImports, [], "main.js and analytics/google-tag.js never import core/redact");
assert.ok(Object.values(REDACTION_FINGERPRINTS).every((fingerprint) => fingerprint.test(readFileSync(join(SRC_ROOT, "main.js"), "utf8"))), "main.js still carries its own copy (revisit the exemption when it goes)");
assert.deepEqual(detection.filter((path) => !QUERY_DETECTION_PENDING.includes(path)), [], "no new detection regex outside the pending list");
for (const path of QUERY_DETECTION_PENDING) assert.ok(detection.includes(path), `${path} still carries a detection regex (drop it from the list when it migrates)`);

console.log(`Redaction contract: PASS · redactSecrets/redactUrl/redactTokenPaths in core/redact.js · ${PARAM_NAMES.length} parameter names frozen (+${PATTERN_EXTRA_NAMES.length} pattern extra) · ${consumers} consumers import by name · no inline copy outside main.js · ${QUERY_DETECTION_PENDING.length} detection regexes pending`);
