import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, lstat } from "node:fs/promises";
import { basename, dirname, resolve, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { invoiceApiSplitOutput } from "./tools/invoice-api-split.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

function buildOutputDirectory() {
  const defaultOutput = resolve(ROOT, "dist");
  const supplied = String(process.env.ONION_BUILD_OUT_DIR || "").trim();
  if (!supplied) return defaultOutput;

  const candidate = resolve(ROOT, supplied);
  const temporaryParent = dirname(candidate);
  const isReproDirectory = (
    resolve(temporaryParent).startsWith(`${resolve(tmpdir())}${sep}`) &&
    basename(temporaryParent).startsWith("onion-build-repro-") &&
    ["first", "second"].includes(basename(candidate))
  );
  if (candidate !== defaultOutput && !isReproDirectory) {
    throw new Error(`Unsafe Vite output directory: ${candidate}`);
  }
  return candidate;
}

const outputDirectory = buildOutputDirectory();

/* =========================================================
   CLAVE Y TONO · UN SOLO TROZO

   `src/core/slug-key.js` y `src/core/status-tone.js` son dos módulos diminutos
   del núcleo, y el segundo IMPORTA al primero: quien carga uno carga siempre el
   otro. Servirlos por separado cuesta una petición de más y una entrada de más
   en la tabla de precarga que vive dentro de `routes`, que sí entra en el
   cierre de arranque. Juntos no cuestan ninguna de las dos, y a la ruta le
   llegan exactamente los mismos bytes.

   El trozo se llama por lo que lleva: de un valor crudo de dominio, su CLAVE
   (slug-key) y su TONO (status-tone). Es una decisión de empaquetado, no de
   arquitectura: cada concepto sigue teniendo su fichero y su autoridad.
========================================================= */

const CORE_SEMANTICS_GROUP = Object.freeze({
  name: "key-tone",
  test: /(?:^|\/)src\/core\/(?:slug-key|status-tone)\.js(?:\?.*)?$/,
  priority: 90,
  /* No arrastrar aquí nada más: el grupo son estos dos ficheros. */
  includeDependenciesRecursively: false,
});

function coreSemanticsOutput(base = {}) {
  return {
    ...base,
    codeSplitting: {
      ...base.codeSplitting,
      groups: [...(base.codeSplitting?.groups || []), CORE_SEMANTICS_GROUP],
    },
  };
}

const HTML_INPUTS = Object.freeze({
  main: "index.html",
  login: "login.html",
  "seo-reparacion-ordenadores": "seo/reparacion-ordenadores.html",
  "seo-soporte-informatico": "seo/soporte-informatico.html",
  "seo-redes-wifi": "seo/redes-wifi.html",
  "seo-impresoras": "seo/impresoras.html",
  "seo-soporte-empresas": "seo/soporte-empresas.html",
});

const STATIC_FILES = Object.freeze([
  "staticwebapp.config.json",
  "site.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "ad1f6102f1914986b540f6a34bf6939b.txt",
]);

/*
 * Build-foundation compatibility boundary.
 *
 * RouteStyles, preboot and a small number of templates still resolve assets
 * through literal /src URLs. They remain byte-identical in this phase so the
 * introduction of a build cannot change runtime behaviour. The next CSS-entry
 * phase removes this boundary and lets Vite fingerprint those resources too.
 */
const COMPATIBILITY_DIRECTORIES = Object.freeze([
  "src/analytics",
  "src/css",
  "src/media",
  "src/preboot",
]);

/*
 * app.css stays complete in source mode so development and the immutable
 * legacy-root rollback preserve their historical CSS contract. During a
 * production build, exactly the imports that private.css declares are removed
 * from the public entry; private-runtime-ui then requests that same ordered
 * list through private.css after the authentication guard.
 *
 * private.css is declarative candidate data, never executable tooling. Each
 * statement must have the canonical form over a private-only layer and must
 * exist exactly once in app.css, so moving a stylesheet behind the guard is
 * one source change rebuilt identically by this trusted tooling. Guardrails
 * imports are shared paint authorities: both entries keep them.
 *
 * The plugin is absent until candidate data adds private.css.
 */
const PRIVATE_CSS_ENTRY = resolve(ROOT, "src/css/private.css");

const PRIVATE_CSS_IMPORT_PATTERN =
  /^@import url\("\.\/(layout|components|compositions)\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.css"\) layer\((layout|components|compositions|guardrails)\);$/;

function privateCssSplitEnabled() {
  return existsSync(PRIVATE_CSS_ENTRY);
}

function privateCssImports() {
  const source = readFileSync(PRIVATE_CSS_ENTRY, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const statements = [];

  for (const statement of source.match(/@import\b[^;]*;/g) || []) {
    const match = PRIVATE_CSS_IMPORT_PATTERN.exec(statement);
    if (!match) {
      throw new Error(`Private CSS import is not canonical: ${statement}`);
    }
    const [, directory, layer] = match;
    if (layer === "guardrails") continue;
    if (layer !== directory) {
      throw new Error(`Private CSS import layer must match its directory: ${statement}`);
    }
    if (statements.includes(statement)) {
      throw new Error(`Private CSS import is duplicated: ${statement}`);
    }
    statements.push(statement);
  }

  return statements;
}

function onionPrivateCssEntrySplit() {
  const appCssId = resolve(ROOT, "src/css/app.css");
  const statements = privateCssImports();

  return {
    name: "onion-private-css-entry-split",
    apply: "build",
    enforce: "pre",
    transform(source, id) {
      if (String(id || "").split("?")[0] !== appCssId) {
        return null;
      }

      let output = String(source || "");

      for (const statement of statements) {
        const occurrences = output.split(statement).length - 1;
        if (occurrences !== 1) {
          throw new Error(
            `Private CSS boundary drift for ${statement}: ${occurrences}`
          );
        }
        output = output.replace(statement, "");
      }

      return {
        code: output,
        map: null,
      };
    },
  };
}

function posixPath(value) {
  return String(value || "").split(sep).join("/");
}

async function filesBelow(relativeDirectory) {
  const absoluteDirectory = resolve(ROOT, relativeDirectory);
  const output = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const stat = await lstat(absolutePath);

      if (stat.isSymbolicLink()) {
        throw new Error(`Compatibility asset cannot be a symlink: ${absolutePath}`);
      }

      if (stat.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (stat.isFile()) {
        output.push(posixPath(relative(ROOT, absolutePath)));
      }
    }
  }

  await visit(absoluteDirectory);
  return output;
}

function onionStaticArtifacts() {
  return {
    name: "onion-static-artifacts",
    apply: "build",
    async buildStart() {
      const compatibilityFiles = (
        await Promise.all(COMPATIBILITY_DIRECTORIES.map(filesBelow))
      ).flat();

      const files = [...STATIC_FILES, ...compatibilityFiles]
        .map(posixPath)
        .sort((left, right) => left.localeCompare(right, "en"));

      for (const fileName of files) {
        const sourcePath = resolve(ROOT, fileName);
        const stat = await lstat(sourcePath);

        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error(`Static artifact must be a regular file: ${fileName}`);
        }

        this.emitFile({
          type: "asset",
          fileName,
          source: await readFile(sourcePath),
        });
      }
    },
    generateBundle(_options, bundle) {
      const preboot = bundle["src/preboot/public-home-preload.js"];
      if (!preboot || preboot.type !== "asset") {
        throw new Error("Built preboot compatibility asset is missing.");
      }

      const chunks = Object.values(bundle).filter((item) => item.type === "chunk");
      const replacements = new Map([
        ["/src/main.js", resolve(ROOT, "src/main.js")],
        ["/src/app/enhancements.js", resolve(ROOT, "src/app/enhancements.js")],
        ["/src/features/ticket-deeplink/index.js", resolve(ROOT, "src/features/ticket-deeplink/index.js")],
        ["/src/ui/chrome/index.js", resolve(ROOT, "src/ui/chrome/index.js")],
        ["/src/views/public/home/index.js", resolve(ROOT, "src/views/public/home/index.js")],
        ["/src/views/public/home/template.js", resolve(ROOT, "src/views/public/home/template.js")],
      ]);

      const chunkForModule = (moduleId, sourceUrl) => {
        const chunk = chunks.find((candidate) => (
          candidate.facadeModuleId === moduleId ||
          Object.prototype.hasOwnProperty.call(candidate.modules || {}, moduleId)
        ));

        if (!chunk) {
          throw new Error(`No Vite chunk found for preload module ${sourceUrl}.`);
        }

        return chunk;
      };

      let source = Buffer.isBuffer(preboot.source)
        ? preboot.source.toString("utf8")
        : String(preboot.source || "");

      for (const [sourceUrl, moduleId] of replacements) {
        const chunk = chunkForModule(moduleId, sourceUrl);
        source = source.replaceAll(sourceUrl, `/${chunk.fileName}`);
      }

      if (/\/src\/[^"']+\.js/.test(source)) {
        throw new Error("Built preboot still contains an unbundled /src JavaScript URL.");
      }

      preboot.source = source;
    },
  };
}

/*
 * Vite treats a stylesheet inside <noscript> as a normal dependency and can
 * merge its rules into the global CSS bundle. Temporarily remove only that
 * href before Vite's HTML pass, then restore the byte-for-byte conditional
 * link afterwards. The source HTML stays valid for the legacy deployment used
 * during the bootstrap PR.
 */
function onionConditionalNoscriptStyles() {
  const marker = "data-onion-build-noscript-href";
  const sourceHref = "/src/css/core/noscript.css";

  return [
    {
      name: "onion-conditional-noscript-styles-pre",
      apply: "build",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return html.replace(
            /(<noscript\b[^>]*>[\s\S]*?<link\b[^>]*?)\bhref=["']\/src\/css\/core\/noscript\.css["']([\s\S]*?<\/noscript>)/gi,
            `$1${marker}="${sourceHref}"$2`
          );
        },
      },
    },
    {
      name: "onion-conditional-noscript-styles-post",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          return html.replaceAll(`${marker}="${sourceHref}"`, `href="${sourceHref}"`);
        },
      },
    },
  ];
}

export default defineConfig({
  root: ROOT,
  base: "/",
  publicDir: false,
  plugins: [
    ...onionConditionalNoscriptStyles(),
    ...(privateCssSplitEnabled() ? [onionPrivateCssEntrySplit()] : []),
    onionStaticArtifacts(),
  ],
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    copyPublicDir: false,
    target: ["chrome111", "edge111", "firefox114", "safari16.4"],
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    manifest: true,
    sourcemap: false,
    minify: "oxc",
    cssMinify: "lightningcss",
    reportCompressedSize: true,
    rolldownOptions: {
      input: Object.fromEntries(
        Object.entries(HTML_INPUTS).map(([name, fileName]) => [
          name,
          resolve(ROOT, fileName),
        ])
      ),
      output: {
        ...coreSemanticsOutput(invoiceApiSplitOutput(ROOT)),
        entryFileNames: "assets/js/[name]-[hash].js",
        chunkFileNames: "assets/js/[name]-[hash].js",
        assetFileNames(assetInfo) {
          const originalName = String(assetInfo.names?.[0] || assetInfo.name || "asset");
          const extension = originalName.includes(".")
            ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase()
            : "";

          if (extension === ".css") return "assets/css/[name]-[hash][extname]";
          if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico"].includes(extension)) {
            return "assets/media/[name]-[hash][extname]";
          }
          if ([".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(extension)) {
            return "assets/fonts/[name]-[hash][extname]";
          }
          return "assets/misc/[name]-[hash][extname]";
        },
      },
    },
  },
});
