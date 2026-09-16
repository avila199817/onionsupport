import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { presentError } from "../src/core/error-rules.js";

// core/error-rules.js: the presentation layer of errors. presentError walks
// a domain's ORDERED rule list over the facts core/errors.js extracts
// (status, canonical code) and returns the domain's text or record. The
// rule lists live in their domains and may only name codes the backend
// emits (tools/backend-error-codes.json, generated from oniontech) or the
// frontend fabricates itself; dead vocabulary does not come back.
const AUTHORITY = "src/core/error-rules.js";
const CATALOG = "tools/backend-error-codes.json";
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
// Every rule list and named code set, per module, with the backend domains it may draw codes from.
const RULE_LISTS = Object.freeze({
  "src/views/public/login/index.js": { lists: ["LOGIN_ERROR_RULES"], domains: ["auth", "config"] },
  "src/views/public/password-reset/index.js": { lists: ["RESET_TOKEN_UNAVAILABLE_CODES", "RESET_ERROR_RULES"], domains: ["auth", "config"] },
  "src/views/public/activate-account/index.js": { lists: ["ACTIVATION_ERROR_RULES"], domains: ["auth", "config"] },
  "src/features/public-support/index.js": { lists: ["ACTIVE_TICKET_ERROR_CODES", "SUPPORT_ERROR_RULES"], domains: ["tickets"] },
  "src/views/usuarios/usuarios.template.create.js": { lists: ["CREATE_USER_ERROR_RULES"], domains: ["users"] },
});
// Codes the frontend fabricates (core/http.js) and may therefore interpret.
const FRONTEND_CODES = Object.freeze(["HTTP_ERROR", "NETWORK_ERROR", "REQUEST_TIMEOUT"]);
// Vocabulary pruned because the backend never emitted it; it stays out of src.
const DEAD_VOCABULARY = Object.freeze(["RESET_TOKEN_EXPIRED", "RESET_TOKEN_ALREADY_USED", "CREATE_USER_MAIL_FAILED", "ACTIVE_TICKET_EXISTS", "USER_DESACTIVADO", "USUARIO_DESACTIVADO", "USER_BLOQUEADO", "USER_DELETED", "USER_ARCHIVED", "USER_SUSPENDED", "PUBLIC_TICKET_OPEN_EXISTS", "PUBLIC_TICKET_ALREADY_OPEN"]);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(`${ROOT}${path}`, "utf8");

// Mechanism: order, OR within a rule, every condition kind, message and fallback forms, canonical codes.
const text = (t) => t;
assert.equal(presentError({ status: 401, code: "X" }, [{ statuses: [401], message: "first" }, { codes: ["X"], message: "second" }], "fb"), "first", "the first matching rule decides");
assert.equal(presentError({ status: 400, code: "X" }, [{ statuses: [401], message: "first" }, { codes: ["X"], message: "second" }], "fb"), "second");
assert.equal(presentError({ status: 400, code: "Y" }, [{ statuses: [401], message: "first" }, { codes: ["X"], message: "second" }], "fb"), "fb", "no rule: the fallback");
const locked = [{ statuses: [423], codeIncludes: ["LOCKED"], message: "locked" }];
assert.equal(presentError({ status: 423 }, locked, "fb"), "locked", "any condition of a rule matches (status)");
assert.equal(presentError({ status: 0, code: "ACCOUNT_LOCKED" }, locked, "fb"), "locked", "any condition of a rule matches (code substring)");
assert.equal(presentError({ status: 400, code: "OTHER" }, locked, "fb"), "fb");
assert.equal(presentError({}, [{ offline: true, message: "off" }], "fb"), "off", "offline is status 0");
assert.equal(presentError({ status: 400 }, [{ offline: true, message: "off" }], "fb"), "fb");
assert.equal(presentError({ status: 500 }, [{ minStatus: 500, message: "server" }], "fb"), "server");
assert.equal(presentError({ status: 503 }, [{ minStatus: 500, message: "server" }], "fb"), "server");
assert.equal(presentError({ status: 499 }, [{ minStatus: 500, message: "server" }], "fb"), "fb");
assert.equal(presentError({ code: "token-expired" }, [{ codes: ["TOKEN_EXPIRED"], message: "exp" }], "fb"), "exp", "codes compare on the canonical key");
assert.equal(presentError({ code: "TOKEN_EXPIRED_X" }, [{ codes: ["TOKEN_EXPIRED"], message: "exp" }], "fb"), "fb", "codes are exact");
assert.equal(presentError({ status: 409, code: "RESET_TOKEN_USED" }, [{ when: ({ status, code }) => status === 409 && code.includes("TOKEN"), message: "used" }], "fb"), "used", "when expresses a conjunction");
assert.equal(presentError({ status: 409, code: "OTHER" }, [{ when: ({ status, code }) => status === 409 && code.includes("TOKEN"), message: "used" }], "fb"), "fb");
assert.deepEqual(presentError({ status: 410, code: "A" }, [{ statuses: [410], message: ({ status, code, error }) => ({ status, code, same: error.code === "A" }) }], "fb"), { status: 410, code: "A", same: true }, "a message function receives the facts");
assert.deepEqual(presentError({ status: 418 }, [], ({ status }) => ({ field: "", status })), { field: "", status: 418 }, "a fallback function receives the facts");
const fresh = [{ codes: ["A"], message: () => ({ field: "token" }) }];
assert.notEqual(presentError({ code: "A" }, fresh, text), presentError({ code: "A" }, fresh, text), "record messages are built per call");
assert.equal(presentError(null, [{ offline: true, message: "off" }], "fb"), "off", "a missing error has no status");

// Catalog: well formed, sorted, unique.
const catalog = JSON.parse(read(CATALOG));
assert.equal(catalog.source, "oniontech");
assert.ok(Object.keys(catalog.domains).length >= 8, "the catalog covers the backend domains");
for (const [domain, codes] of Object.entries(catalog.domains)) {
  assert.ok(Array.isArray(codes) && codes.length > 0, `${domain} has codes`);
  assert.deepEqual(codes, [...new Set(codes)].sort((a, b) => a.localeCompare(b, "en")), `${domain} codes are sorted and unique`);
  for (const code of codes) assert.match(code, /^[A-Z][A-Z0-9_]+$/u);
}
const allBackend = new Set(Object.values(catalog.domains).flat());
const known = new Set([...allBackend, ...FRONTEND_CODES]);

// Source: one definer, each module's rule lists exist, draw their codes from the catalog and the module imports the authority.
function listText(source, name) {
  const start = source.indexOf(`const ${name} = `);
  assert.ok(start >= 0, `${name} is declared`);
  let i = source.indexOf("=", start) + 1, depth = 0, started = false;
  for (; i < source.length; i += 1) {
    const c = source[i];
    if ("([{".includes(c)) { depth += 1; started = true; } else if (")]}".includes(c)) { depth -= 1; if (started && depth === 0) break; }
  }
  return source.slice(start, i + 1);
}
const definers = [];
const consumers = [];
for (const path of Object.keys(RULE_LISTS)) {
  const source = read(path);
  assert.match(source, /import \{ presentError \} from "(?:\.\.\/)+core\/error-rules\.js";/u, `${path} imports presentError by name`);
  const { lists, domains } = RULE_LISTS[path];
  const domainCodes = new Set(domains.flatMap((d) => catalog.domains[d] || []));
  for (const name of lists) {
    const body = listText(source, name);
    assert.match(body, /^const \w+ = (?:Object\.freeze\(\[|new Set\(\[)/u, `${name} is a frozen list or a Set literal`);
    for (const literal of [...body.matchAll(/"([A-Z][A-Z0-9_]+)"/gu)].map((m) => m[1])) {
      const isSubstringPart = new RegExp(`codeIncludes: \\[[^\\]]*"${literal}"`, "u").test(body);
      if (isSubstringPart) assert.ok([...known].some((code) => code.includes(literal)), `${path} ${name}: "${literal}" is part of a code the backend emits or the frontend makes`);
      else assert.ok(domainCodes.has(literal) || FRONTEND_CODES.includes(literal), `${path} ${name}: "${literal}" is emitted by ${domains.join("/")} or made by the frontend`);
    }
    consumers.push(`${path}:${name}`);
  }
  for (const dead of DEAD_VOCABULARY) assert.ok(!source.includes(`"${dead}"`), `${path} no longer interprets ${dead}`);
}
for (const path of [AUTHORITY, ...Object.keys(RULE_LISTS), "src/core/errors.js", "src/core/http.js", ...ENTRY_AND_LEAF]) {
  const source = read(path);
  if (/^export function presentError\s*\(/mu.test(source) || /^function presentError\s*\(/mu.test(source)) definers.push(path);
}
assert.deepEqual(definers, [AUTHORITY], "presentError is defined only in the authority");
for (const path of ENTRY_AND_LEAF) assert.ok(!read(path).includes("/error-rules.js\""), `${path} never imports core/error-rules.js`);
// Fixtures that evaluate or serve the public support feature carry the authority.
assert.match(read("tools/public-support-runtime-contract.mjs"), /presentError,/u, "the public support runtime sandbox injects presentError");
assert.match(read("tools/public-support-browser-contract.mjs"), /"\/src\/core\/error-rules\.js"/u, "the public support browser fixture serves core/error-rules.js");

console.log(`Error rules contract: PASS · presentError in ${AUTHORITY} · ordered rules, any-condition match, offline/minStatus/codes/codeIncludes/when, message and fallback functions · ${consumers.length} rule lists in ${Object.keys(RULE_LISTS).length} modules draw their codes from ${CATALOG} (${allBackend.size} backend codes, ${Object.keys(catalog.domains).length} domains) · ${DEAD_VOCABULARY.length} dead codes stay out · fixtures carry the authority · entry and analytics leaf import none`);
