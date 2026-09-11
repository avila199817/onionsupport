import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

// Candidate data, never executable configuration. tools/ and Vite are copied
// from the immutable trusted base. Keep this out of COMPATIBILITY_DIRECTORIES.
export const INVOICE_SPLIT_POLICY = "src/build-policy.json";
const SCHEMA = "onionsupport.build-policy.v1";

export function invoiceApiSplitEnabled(root) {
  const sourceRoot = realpathSync(root);
  const sourceDirectory = lstatSync(resolve(sourceRoot, "src"), { throwIfNoEntry: false });
  if (sourceDirectory && (!sourceDirectory.isDirectory() || sourceDirectory.isSymbolicLink())) {
    throw new Error("Invoice split policy must remain inside the real source tree.");
  }
  const policyPath = resolve(sourceRoot, INVOICE_SPLIT_POLICY);
  let stat;
  try {
    stat = lstatSync(policyPath);
  } catch (error) {
    // Absence is the byte-preserving bootstrap/rollback state. Other failures
    // must not silently disable a requested release policy.
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) {
    throw new Error("Invoice split policy must be a regular JSON file <= 1024 bytes.");
  }
  if (!realpathSync(policyPath).startsWith(`${sourceRoot}${sep}`)) {
    throw new Error("Invoice split policy must remain inside the real source tree.");
  }
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
      Object.keys(policy).sort().join(",") !== "invoiceApiSplit,schema" ||
      policy.schema !== SCHEMA || typeof policy.invoiceApiSplit !== "boolean") {
    throw new Error("Invalid onionsupport.build-policy.v1 invoice split policy.");
  }
  return policy.invoiceApiSplit;
}

export function invoiceApiSplitOutput(root) {
  if (!invoiceApiSplitEnabled(root)) return {};
  return {
    codeSplitting: {
      groups: [{
        name: "invoice-api",
        test: /(?:^|\/)src\/views\/facturas\/facturas\.api(?:\.[^/?]+)?\.js(?:\?.*)?$/,
        priority: 100,
        // Do not pull the shared Rolldown runtime or HTTP into invoice-api.
        includeDependenciesRecursively: false,
      }],
    },
  };
}
