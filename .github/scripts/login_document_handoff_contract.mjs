import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/views/public/login/index.js", "utf8");

assert.match(
  source,
  /login\.view\.public\.controller\.v7-document-handoff/,
  "login must expose the document-handoff version"
);
assert.match(
  source,
  /new URLSearchParams\([\s\S]*?window\.location\.search[\s\S]*?\.get\("redirect"\)/,
  "login must resolve the requested post-login redirect from the current URL"
);
assert.match(
  source,
  /!candidate\.startsWith\("\/"\)[\s\S]*?candidate\.startsWith\("\/\/"\)/,
  "redirect target must remain same-origin relative"
);
assert.match(
  source,
  /match\.route\.public === true[\s\S]*?match\.blocked === true[\s\S]*?match\.sensitive === true/,
  "redirect target must reject public, blocked and sensitive routes"
);
assert.match(
  source,
  /window\.location\.replace\(target\)/,
  "authenticated login must cross into the private app with a document navigation"
);
assert.match(
  source,
  /window\.location\.assign\(target\)/,
  "document navigation must retain an assign fallback"
);
assert.match(
  source,
  /auth\.syncAuthState\?\.\(\);[\s\S]*?await handoffAfterLogin\(/,
  "Core auth state must be synchronized before the document handoff"
);
assert.doesNotMatch(
  source,
  /login\.view\.recovery/,
  "login must not retain the former SPA recovery loop"
);
assert.doesNotMatch(
  source,
  /async function goAfterLogin\(/,
  "login view must not own a second SPA post-login navigator"
);

const handoffStart = source.indexOf("async function handoffAfterLogin(");
const handoffEnd = source.indexOf("\n/* =========================================================\n   TEMPLATE", handoffStart);
assert.ok(handoffStart >= 0 && handoffEnd > handoffStart);
const handoff = source.slice(handoffStart, handoffEnd);
const replaceIndex = handoff.indexOf("window.location.replace(target)");
const routerFallbackIndex = handoff.indexOf('source: "login.view.fallback-router"');
assert.ok(
  replaceIndex >= 0 && routerFallbackIndex > replaceIndex,
  "document navigation must be the primary handoff; Router is fallback only"
);

console.log(
  "Login document handoff contract: PASS · safe redirect · Auth sync · hard guest/private boundary"
);
