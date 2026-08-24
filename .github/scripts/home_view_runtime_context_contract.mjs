import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = "src/views/home/index.js";
const source = await readFile(path, "utf8");

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${path} must define ${name}()`);

  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${path} ${name}() must close its signature`);

  const open = source.indexOf("{", signatureEnd);
  assert.notEqual(open, -1, `${path} ${name}() must have a body`);

  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }

  assert.fail(`${path} ${name}() body is not balanced`);
}

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

const payloadBody = functionBody("basePayload");
assert.match(
  payloadBody,
  /const\s+state\s*=\s*getCoreState\(\)\s*;/,
  "basePayload() must perform one operation-local Core read"
);
assert.match(
  payloadBody,
  /const\s+user\s*=\s*getCurrentUser\(context\s*,\s*state\)\s*;/,
  "basePayload() must derive user from the same state read"
);
assert.match(
  payloadBody,
  /getCurrentRole\(context\s*,\s*state\s*,\s*user\)/,
  "basePayload() must derive role from the same state/user"
);
assert.equal(
  payloadBody.match(/getCoreState\(\)/g)?.length || 0,
  1,
  "basePayload() must read Core exactly once"
);

for (const helper of ["getCurrentUser", "getCurrentRole"]) {
  assert.equal(
    functionBody(helper).includes("getCoreState("),
    false,
    `${helper}() must not reread Core when basePayload passes state`
  );
}

const userBody = functionBody("cloneRuntimeUser");
assert.match(
  userBody,
  /\.\.\.rawUser/,
  "Home view must isolate a runtime user before retaining it in a render payload"
);
for (const field of ["roles", "permissions", "permisos"]) {
  assert.match(
    userBody,
    new RegExp(`${field}:\\s*Array\\.isArray\\(rawUser\\.${field}\\)\\s*\\?\\s*\\[\\.\\.\\.rawUser\\.${field}\\]`),
    `Home view must isolate ${field}`
  );
}

assert.match(
  functionBody("viewPayload"),
  /return\s+basePayload\(context\s*,/,
  "render payloads must continue to use the operation-local identity derivation"
);
assert.match(
  functionBody("render"),
  /renderHomeTemplate\(viewPayload\(data\)\)/,
  "Home render must continue to derive a fresh payload per render"
);

console.log(
  "Home view runtime contract OK · one Core read per render payload, isolated runtime user, no public snapshots"
);
