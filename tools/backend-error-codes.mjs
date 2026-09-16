// Catalog of the error codes the backend (oniontech) emits, per router domain.
//
//   node tools/backend-error-codes.mjs --from ../oniontech          writes tools/backend-error-codes.json
//   node tools/backend-error-codes.mjs --from ../oniontech --check  fails when the committed catalog drifts
//
// The catalog is data for error-rules-contract: every code a frontend rule
// list interprets must be one the backend emits (or one the frontend itself
// fabricates, listed in the contract). Regenerate it when the backend adds
// or renames codes. Sources read: router/, config/, lib/, middleware/, utils/.
// Emission shapes covered: local sendError helpers (the code argument by the
// helper's own parameter list, or its default), errorPayload(req, "CODE"),
// status-first constructors (sendAuthError, fail, domainError, paidFlowError,
// new HttpError, new WhatsAppError), code-first constructors
// (createAuthError("CODE", ...)), inline code:/error: literals and .code =.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT = fileURLToPath(new URL("./backend-error-codes.json", import.meta.url));
const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
if (fromIndex === -1 || !args[fromIndex + 1]) {
  console.error("usage: node tools/backend-error-codes.mjs --from <oniontech checkout> [--check]");
  process.exit(2);
}
const ROOT = resolve(args[fromIndex + 1]);
const CHECK = args.includes("--check");
const LITERAL = /^["'`]([A-Z][A-Z0-9_]+)["'`]$/u;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : files(path);
    return path.endsWith(".js") ? [path] : [];
  });
}
function splitArgs(text) {
  const out = [];
  let depth = 0, current = "", quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { current += c; if (c === "\\") { current += text[i + 1]; i += 1; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; current += c; continue; }
    if ("([{".includes(c)) depth += 1;
    if (")]}".includes(c)) depth -= 1;
    if (c === "," && depth === 0) { out.push(current.trim()); current = ""; continue; }
    current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
function callArgs(src, open) {
  let depth = 0, quote = null;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (quote) { if (c === "\\") { i += 1; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(") depth += 1;
    else if (c === ")") { depth -= 1; if (depth === 0) return splitArgs(src.slice(open + 1, i)); }
  }
  return null;
}
const domains = {};
const add = (domain, code) => { (domains[domain] ||= new Set()).add(code); };
const roots = ["router", "config", "lib", "middleware", "utils"].filter((d) => existsSync(join(ROOT, d)));
for (const file of roots.flatMap((d) => files(join(ROOT, d)))) {
  const rel = relative(ROOT, file).split("\\").join("/");
  const domain = rel.startsWith("router/") ? rel.split("/")[1] : rel.split("/")[0];
  const src = readFileSync(file, "utf8");
  const helper = /function sendError\s*\(([^)]*)\)/u.exec(src);
  if (helper) {
    const params = helper[1].split(",").map((p) => p.trim());
    const codeIndex = params.findIndex((p) => p.split("=")[0].trim() === "code");
    if (codeIndex >= 0) {
      const dflt = LITERAL.exec((params[codeIndex].split("=")[1] || "").trim());
      const calls = /(?<![\w$.])sendError\s*\(/gu;
      for (let m = calls.exec(src); m; m = calls.exec(src)) {
        if (/function\s*$/u.test(src.slice(Math.max(0, m.index - 10), m.index))) continue;
        const callArguments = callArgs(src, m.index + m[0].length - 1);
        if (!callArguments) continue;
        const arg = callArguments[codeIndex];
        if (arg === undefined) { if (dflt) add(domain, dflt[1]); continue; }
        const literal = LITERAL.exec(arg);
        if (literal) add(domain, literal[1]);
      }
    }
  }
  for (const m of src.matchAll(/\berrorPayload\(\s*\w+\s*,\s*["']([A-Z][A-Z0-9_]+)["']/gu)) add(domain, m[1]);
  for (const m of src.matchAll(/\b(?:sendAuthError|fail|domainError|paidFlowError|new \w*Error)\(\s*(?:\w+\s*,\s*)?(?:\d{3}|status|\w+)\s*,\s*["']([A-Z][A-Z0-9_]+)["']/gu)) add(domain, m[1]);
  for (const m of src.matchAll(/\bfail\(\s*["']([A-Z][A-Z0-9_]+)["']/gu)) add(domain, m[1]);
  for (const m of src.matchAll(/\b[a-zA-Z]*[eE]rror\(\s*["']([A-Z][A-Z0-9_]+)["']\s*,/gu)) add(domain, m[1]);
  for (const m of src.matchAll(/\b(?:code|error)\s*:\s*["']([A-Z][A-Z0-9_]+)["']/gu)) add(domain, m[1]);
  for (const m of src.matchAll(/\.code\s*=\s*["']([A-Z][A-Z0-9_]+)["']/gu)) add(domain, m[1]);
}
const catalog = {
  source: "oniontech",
  domains: Object.fromEntries(Object.entries(domains).sort(([a], [b]) => a.localeCompare(b, "en")).map(([d, codes]) => [d, [...codes].sort((a, b) => a.localeCompare(b, "en"))])),
};
const text = `${JSON.stringify(catalog, null, 2)}\n`;
if (CHECK) {
  const committed = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
  if (committed !== text) {
    console.error("backend-error-codes.json drifts from the backend checkout; regenerate it without --check");
    process.exit(1);
  }
  console.log("backend-error-codes.json matches the backend checkout");
} else {
  writeFileSync(OUTPUT, text);
  console.log(`backend-error-codes.json: ${Object.entries(catalog.domains).map(([d, c]) => `${d} ${c.length}`).join(", ")}`);
}
