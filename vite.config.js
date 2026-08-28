import { readdir, readFile, lstat } from "node:fs/promises";
import { basename, dirname, resolve, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

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
 * production build, only these exact private imports are removed from the
 * public entry. private-runtime-ui then requests the same ordered list through
 * private.css after the authentication guard.
 */
const PRIVATE_CSS_IMPORTS = Object.freeze([
  "./layout/sidebar.css",
  "./layout/sidebar.executive.css",
  "./layout/sidebar.executive.interactions.css",
  "./layout/topbar.css",
  "./layout/topbar.executive.css",
  "./layout/chrome.css",
  "./compositions/private-admin-parity.css",
  "./compositions/private-admin-interactions.css",
  "./compositions/private-create-modal.css",
  "./compositions/private-amounts.css",
]);

function privateCssImportStatement(spec) {
  const layer = spec.startsWith("./layout/")
    ? "layout"
    : "compositions";

  return `@import url("${spec}") layer(${layer});`;
}

function onionPrivateCssEntrySplit() {
  const appCssId = resolve(ROOT, "src/css/app.css");
  const statements = PRIVATE_CSS_IMPORTS.map(privateCssImportStatement);

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
    onionPrivateCssEntrySplit(),
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
