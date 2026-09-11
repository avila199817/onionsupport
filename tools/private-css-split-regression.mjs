import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const configPath = resolve(process.argv[2] || resolve(ROOT, "vite.config.js"));
const configSource = readFileSync(configPath, "utf8");
const appCss = readFileSync(resolve(ROOT, "src/css/app.css"), "utf8");
const privateCss = readFileSync(resolve(ROOT, "src/css/private.css"), "utf8");
const fullview = '@import url("./compositions/private-fullview-routes.css") layer(compositions);';
const parity = '@import url("./compositions/private-admin-parity.css") layer(compositions);';
const interactions = '@import url("./compositions/private-admin-interactions.css") layer(compositions);';
const avatar = '@import url("./components/avatar-system.css") layer(guardrails);';

// Independent, pre-R06 boundary: expected output is not generated from Vite's
// candidate import list. These ten source imports already belong to private.css.
const previousImports = [
  '@import url("./layout/sidebar.css") layer(layout);',
  '@import url("./layout/sidebar.executive.css") layer(layout);',
  '@import url("./layout/sidebar.executive.interactions.css") layer(layout);',
  '@import url("./layout/topbar.css") layer(layout);',
  '@import url("./layout/topbar.executive.css") layer(layout);',
  '@import url("./layout/chrome.css") layer(layout);',
  parity,
  interactions,
  '@import url("./compositions/private-create-modal.css") layer(compositions);',
  '@import url("./compositions/private-amounts.css") layer(compositions);',
];
let priorPublicCss = appCss;
for (const statement of previousImports) {
  assert.equal(priorPublicCss.split(statement).length - 1, 1);
  priorPublicCss = priorPublicCss.replace(statement, "");
}
assert.equal(priorPublicCss.split(fullview).length - 1, 1);

const withoutFullview = privateCss.replace(fullview, "");
const activated = withoutFullview.replace(parity, `${parity}\n${fullview}`);

// Evaluate the actual config/plugin, not a copied transform. Vite's identity
// wrapper and the unrelated invoice chunk policy are isolated here; the real
// Vite build, artifact and trusted byte comparison remain separate mandatory CI.
async function loadPlugin(privateSource) {
  const context = createContext({ URL, Buffer, process: { env: {} } });
  const configRoot = fileURLToPath(new URL(".", pathToFileURL(configPath)));
  const privatePath = resolve(configRoot, "src/css/private.css");
  let reads = 0;
  const modules = new Map();
  const wrapped = (name, exports) => {
    if (!modules.has(name)) {
      modules.set(name, new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context, identifier: name }));
    }
    return modules.get(name);
  };
  const config = new SourceTextModule(configSource, {
    context,
    identifier: pathToFileURL(configPath).href,
    initializeImportMeta(meta) { meta.url = pathToFileURL(configPath).href; },
  });
  await config.link(async (name) => {
    if (name === "node:fs") return wrapped(name, {
      existsSync(path) {
        assert.equal(path, privatePath);
        return privateSource !== null;
      },
      readFileSync(path, encoding) {
        assert.equal(path, privatePath);
        assert.equal(encoding, "utf8");
        assert.notEqual(privateSource, null);
        reads += 1;
        return privateSource;
      },
    });
    if (name === "vite") return wrapped(name, { defineConfig: (value) => value });
    if (name === "./tools/invoice-api-split.mjs") {
      return wrapped(name, { invoiceApiSplitOutput: () => ({}) });
    }
    assert.ok(["node:fs/promises", "node:path", "node:os", "node:url"].includes(name), `Unexpected dependency: ${name}`);
    return wrapped(name, await import(name));
  });
  await config.evaluate();
  return {
    plugin: config.namespace.default.plugins.find((item) => item.name === "onion-private-css-entry-split"),
    appPath: resolve(configRoot, "src/css/app.css"),
    reads,
  };
}

const absent = await loadPlugin(null);
assert.equal(absent.plugin, undefined, "No private entry means no split plugin.");
assert.equal(absent.reads, 0);

const prior = await loadPlugin(withoutFullview);
assert.equal(prior.plugin.apply, "build");
assert.equal(prior.plugin.enforce, "pre");
assert.equal(prior.plugin.transform(appCss, prior.appPath).code, priorPublicCss, "Preparation must preserve pre-activation public CSS byte for byte.");

const commented = await loadPlugin(`${withoutFullview}\n/* ${fullview} */`);
assert.equal(commented.plugin.transform(appCss, commented.appPath).code, priorPublicCss, "A comment cannot activate private loading.");

const active = await loadPlugin(activated);
const expected = priorPublicCss.replace(fullview, "");
assert.equal(active.plugin.transform(appCss, active.appPath).code, expected, "Activation must remove only the private full-view import in addition to the previous boundary.");
assert.equal(active.plugin.transform(appCss, `${active.appPath}?direct`).code, expected);
assert.equal(active.plugin.transform(appCss, active.appPath).map, null);
assert.equal(active.plugin.transform("untouched", resolve(ROOT, "src/css/other.css")), null);
assert.equal(appCss.includes(fullview), true, "Source-mode CSS remains complete.");

await assert.rejects(loadPlugin(`${activated}\n${fullview}`), /one canonical compositions import/);
await assert.rejects(loadPlugin(activated.replace(fullview, fullview.replace("layer(compositions)", "layer(layout)"))), /one canonical compositions import/);
assert.throws(() => active.plugin.transform(appCss.replace(fullview, ""), active.appPath), /Private CSS boundary drift/);
assert.throws(() => active.plugin.transform(`${appCss}\n${fullview}`, active.appPath), /Private CSS boundary drift/);
assert.throws(() => active.plugin.transform(appCss.replace(previousImports[0], ""), active.appPath), /Private CSS boundary drift/);
assert.throws(() => prior.plugin.transform(`${appCss}\n${previousImports[0]}`, prior.appPath), /Private CSS boundary drift/);

// Check the real candidate's ordering too, in both foundation and activation.
const uncommentedPrivate = privateCss.replace(/\/\*[\s\S]*?\*\//g, "");
if (uncommentedPrivate.includes("private-fullview-routes.css")) {
  assert.equal(uncommentedPrivate.split(fullview).length - 1, 1);
  assert.ok(uncommentedPrivate.indexOf(parity) < uncommentedPrivate.indexOf(fullview));
  assert.ok(uncommentedPrivate.indexOf(fullview) < uncommentedPrivate.indexOf(interactions));
}
assert.equal(uncommentedPrivate.trim().endsWith(avatar), true, "AvatarSystem remains the final private paint authority.");

console.log("Private CSS split regression: PASS · absent/inactive/active · source preservation · comments/layer/duplicates/drift · order/avatar");
