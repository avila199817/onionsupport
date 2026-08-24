import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = "src/views/home/home.api.js";
const source = await readFile(path, "utf8");

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${path} must define ${name}()`);

  const open = source.indexOf("{", start);
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
  source.includes("AppCore?.runtimeState?.read?.()"),
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
  `${path} must remain read-only against Core runtime state`
);

const contextBody = functionBody("currentContext");
assert.match(
  contextBody,
  /const\s+state\s*=\s*getCoreState\(\)\s*;/,
  "currentContext() must read Core once into an operation-local state"
);
assert.match(
  contextBody,
  /getCurrentUser\(state\)/,
  "currentContext() must derive user from the same state read"
);
assert.match(
  contextBody,
  /getCurrentRole\(state\s*,\s*user\)/,
  "currentContext() must derive role from the same state/user"
);
assert.match(
  contextBody,
  /getCurrentUserId\(state\s*,\s*user\)/,
  "currentContext() must derive userId from the same state/user"
);
assert.equal(
  contextBody.includes("await "),
  false,
  "currentContext() must remain a synchronous derivation"
);

for (const helper of ["getCurrentUser", "getCurrentRole", "getCurrentUserId"]) {
  assert.equal(
    functionBody(helper).includes("getCoreState("),
    false,
    `${helper}() must not reread Core when currentContext passes state`
  );
}

const userBody = functionBody("getCurrentUser");
assert.match(
  userBody,
  /\.\.\.rawUser/,
  "Home must retain an isolated user object rather than the canonical reference"
);
for (const field of ["roles", "permissions", "permisos"]) {
  assert.match(
    userBody,
    new RegExp(`${field}:\\s*Array\\.isArray\\(rawUser\\.${field}\\)\\s*\\?\\s*\\[\\.\\.\\.rawUser\\.${field}\\]`),
    `Home must isolate ${field} when retaining user data`
  );
}

assert.equal(
  source.includes("currentContext().key !== requestKey"),
  true,
  "Home must preserve the post-await session/context race guard"
);

console.log(
  "Home runtime-state contract OK · one operation-local Core read, no public snapshots, isolated retained user"
);
