import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const VITE = resolve(ROOT, "node_modules/vite/bin/vite.js");
const NORMALIZE = resolve(ROOT, "tools/normalize-dist.mjs");
const FINALIZE = resolve(ROOT, "tools/finalize-dist.mjs");
const tempRoot = await mkdtemp(resolve(tmpdir(), "onion-build-repro-"));

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function posixPath(value) {
  return String(value || "").split(sep).join("/");
}

async function fingerprints(root, label) {
  const output = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      if (entry.isFile()) {
        const contents = await readFile(path);
        output.push(`${label}/${posixPath(relative(root, path))} ${createHash("sha256").update(contents).digest("hex")}`);
      }
    }
  }
  await visit(root);
  return output;
}

try {
  const first = resolve(tempRoot, "first");
  const second = resolve(tempRoot, "second");
  const firstMetadata = resolve(tempRoot, "first-metadata");
  const secondMetadata = resolve(tempRoot, "second-metadata");

  for (const [outDir, metadataDir] of [[first, firstMetadata], [second, secondMetadata]]) {
    const env = {
      ONION_BUILD_OUT_DIR: outDir,
      ONION_BUILD_METADATA_DIR: metadataDir,
    };
    run(process.execPath, [VITE, "build"], env);
    run(process.execPath, [NORMALIZE], env);
    run(process.execPath, [FINALIZE], env);
  }

  const firstHashes = [
    ...await fingerprints(first, "dist"),
    ...await fingerprints(firstMetadata, "metadata"),
  ];
  const secondHashes = [
    ...await fingerprints(second, "dist"),
    ...await fingerprints(secondMetadata, "metadata"),
  ];
  if (JSON.stringify(firstHashes) !== JSON.stringify(secondHashes)) {
    throw new Error("Two clean builds produced different path/digest inventories.");
  }

  console.log(`Reproducible build: PASS (${firstHashes.length} identical files)`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
