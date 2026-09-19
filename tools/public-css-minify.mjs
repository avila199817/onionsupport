import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";

// Candidate policy is data only and is not part of the deployed compatibility
// trees. Absent/false preserves the old artifact while trusted tooling lands.
export const PUBLIC_CSS_POLICY = "src/public-css-build-policy.json";
const SCHEMA = "onionsupport.public-css-build-policy.v1";

export const PUBLIC_COMPATIBILITY_CSS = Object.freeze([
  "src/css/tokens/public.css",
  "src/css/views/public/home-critical.css",
  "src/css/views/public/legal-footer.css",
  "src/css/views/public/index.css",
  "src/css/views/public/support-request.css",
  "src/css/views/public/public-support-progress.css",
  "src/css/views/public/home-experience.css",
  "src/analytics/google-consent.css",
]);

// Same supported browsers as the Vite build; this transform does not bundle,
// resolve imports, rewrite asset URLs or execute candidate configuration.
const TARGETS = Object.freeze({
  chrome: 111 << 16,
  edge: 111 << 16,
  firefox: 114 << 16,
  safari: (16 << 16) | (4 << 8),
});
let lightningCss;

export function publicCssMinifyEnabled(root) {
  const sourceRoot = realpathSync(root);
  const sourceDirectory = lstatSync(resolve(sourceRoot, "src"), { throwIfNoEntry: false });
  if (sourceDirectory && (!sourceDirectory.isDirectory() || sourceDirectory.isSymbolicLink())) {
    throw new Error("Public CSS policy must remain inside the real source tree.");
  }
  const policyPath = resolve(sourceRoot, PUBLIC_CSS_POLICY);
  let stat;
  try {
    stat = lstatSync(policyPath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) {
    throw new Error("Public CSS policy must be a regular JSON file <= 1024 bytes.");
  }
  if (!realpathSync(policyPath).startsWith(`${sourceRoot}${sep}`)) {
    throw new Error("Public CSS policy must remain inside the real source tree.");
  }
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
      Object.keys(policy).sort().join(",") !== "minify,schema" ||
      policy.schema !== SCHEMA || typeof policy.minify !== "boolean") {
    throw new Error("Invalid onionsupport.public-css-build-policy.v1 policy.");
  }
  return policy.minify;
}

export function publicCompatibilityCssBytes(fileName, source, enabled = false) {
  if (enabled !== true || !PUBLIC_COMPATIBILITY_CSS.includes(fileName)) return source;

  // Resolve Vite's existing lockfile-pinned minifier, including nested installs.
  // No new dependency or candidate-supplied transform enters the trusted build.
  lightningCss ||= createRequire(import.meta.resolve("vite/package.json"))("lightningcss");
  const result = lightningCss.transform({
    filename: fileName,
    code: source,
    minify: true,
    targets: TARGETS,
  });
  if (result.warnings.length) {
    throw new Error(`Public CSS minification warning in ${fileName}: ${result.warnings.map((item) => item.message).join("; ")}`);
  }
  return result.code;
}
