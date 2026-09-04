import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_SITE, PUBLIC_PAGES, PUBLIC_SERVICES, pageMetadata, pageMetaEntries, publicPageSchema } from "../src/core/public-site.js";
import content from "./public-service-content.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const START = "<!-- public-site-v3: generated metadata -->";
const END = "<!-- /public-site-v3 -->";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function renderMetadata(page) {
  const schema = publicPageSchema(page);
  return `${START}\n  <title>${escape(page.title)}</title>\n${pageMetaEntries(page).filter(([, , value]) => value != null).map(([attribute, key, value]) => `  <meta ${attribute}="${key}" content="${escape(value)}">`).join("\n")}\n  <link rel="canonical" href="${escape(page.canonical)}">${page.indexable ? `\n  <link rel="alternate" hreflang="es-ES" href="${escape(page.canonical)}">\n  <link rel="alternate" hreflang="x-default" href="${escape(page.canonical)}">` : ""}${schema ? `\n  <script type="application/ld+json" data-onion-site-metadata="v3" data-onion-schema="service-hierarchy">\n${JSON.stringify(schema, null, 2).replace(/</g, "\\u003c")}\n  </script>` : ""}\n  ${END}`;
}

export function materializeDocument(source, page) {
  const generated = renderMetadata(page);
  if (source.includes(START)) return source.replace(/<!-- public-site-v3: generated metadata -->[\s\S]*?<!-- \/public-site-v3 -->/, generated);
  // One-time migration of existing public documents. Unowned head/body stays intact.
  const keys = new Set(pageMetaEntries(page).map(([, key]) => key));
  return source.replace(/<head>([\s\S]*?)<\/head>/, (_, head) => {
    const clean = head.replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/gi, "")
      .replace(/<meta\b[^>]*>\s*/gi, (tag) => {
        const key = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1];
        return keys.has(key) ? "" : tag;
      })
      .replace(/<link\b[^>]*>\s*/gi, (tag) => /rel=["']canonical["']|hreflang=/i.test(tag) ? "" : tag)
      .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, "");
    return `<head>${clean.trimEnd()}\n  ${generated}\n</head>`;
  });
}

export function renderService(page) {
  const details = content[page.path];
  const whatsapp = `https://wa.me/${PUBLIC_SITE.phoneInternational}?text=${encodeURIComponent(`Hola Cristian, vengo desde ${page.canonical}. Quiero consultar el servicio de ${page.label.toLowerCase()}.`)}`;
  const links = (current = false) => PUBLIC_SERVICES.map((item) => `<a href="${item.path}"${current && item.path === page.path ? ' aria-current="page"' : ""}>${escape(item.label)}</a>`).join("\n        ");
  return `<!doctype html>
<html lang="es" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="theme-color" content="#030712">
  ${renderMetadata(page)}
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="stylesheet" href="/src/css/seo/public-service.css">
  <script type="module" src="/src/analytics/google-tag.js"></script>
</head>
<body>
  <header class="seo-header"><div class="seo-shell seo-header-inner">
    <a class="seo-brand" href="/" aria-label="Onion Support, inicio"><img src="/favicon.ico" alt="" width="48" height="48"><span><span class="seo-brand-name">ONION <strong>SUPPORT</strong></span><small>Soporte informático</small></span></a>
    <nav class="seo-nav" aria-label="Servicios de Onion Support">
        ${links(true)}
        <a href="/login">Iniciar sesión</a>
    </nav>
  </div></header>
  <main class="seo-shell">
    <div class="seo-hero"><div>
      <p class="seo-eyebrow">${escape(page.label)}</p>
      <h1>${escape(details.heading)}</h1>
      <p class="seo-lead">${escape(details.lead)}</p>
      <p>${escape(PUBLIC_SITE.coverage)}</p>
      <div class="seo-actions">
        <a class="seo-button seo-button--primary" href="${escape(whatsapp)}" target="_blank" rel="noopener noreferrer">Consultar mi caso</a>
        <a class="seo-button seo-button--secondary" href="mailto:${PUBLIC_SITE.email}">Enviar email</a>
      </div>
    </div><aside class="seo-card" aria-label="Resumen del servicio"><strong>Diagnóstico claro y atención directa</strong><ul>${details.highlights.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></aside></div>
    <div class="seo-content">
      ${details.sections.map((section) => `<section><h2>${escape(section.heading)}</h2><p>${escape(section.body)}</p></section>`).join("\n      ")}
      <section><h2>Atención adaptada a tu caso</h2><p>${escape(PUBLIC_SITE.coverage)} Antes de intervenir, confirmamos contigo el alcance, la modalidad de atención y el presupuesto.</p></section>
    </div>
    <section class="seo-links" aria-labelledby="otros-servicios"><h2 id="otros-servicios">Otros servicios de Onion Support</h2><div class="seo-link-grid">
        ${links()}
        <a href="/">Inicio</a>
        <a href="/login">Iniciar sesión</a>
    </div></section>
    <section class="seo-contact" aria-labelledby="contacto"><div><h2 id="contacto">¿Tienes una incidencia concreta?</h2><p>Describe el equipo, el síntoma y desde cuándo ocurre. Te indicamos el siguiente paso antes de intervenir.</p></div><a class="seo-button seo-button--primary" href="${escape(whatsapp)}" target="_blank" rel="noopener noreferrer">Hablar por WhatsApp</a></section>
  </main>
  <footer class="seo-footer"><div class="seo-shell"><span>© 2026 ${PUBLIC_SITE.name} · Soporte informático</span><span>·</span><a href="tel:${PUBLIC_SITE.phoneTel}">${PUBLIC_SITE.phoneDisplay}</a><span>·</span><a href="mailto:${PUBLIC_SITE.email}">${PUBLIC_SITE.email}</a></div></footer>
</body>
</html>
`;
}

export async function synchronize({ check = false, root = ROOT } = {}) {
  const outputs = new Map();
  for (const record of PUBLIC_PAGES) {
    const page = pageMetadata(record.path);
    const source = await readFile(resolve(root, page.file), "utf8");
    outputs.set(page.file, page.file.startsWith("seo/") ? renderService(page) : materializeDocument(source, page));
  }
  outputs.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PAGES.filter((page) => page.indexable).map((page) => `  <url><loc>${PUBLIC_SITE.origin}${page.path}</loc></url>`).join("\n")}\n</urlset>\n`);
  const config = JSON.parse(await readFile(resolve(root, "staticwebapp.config.json"), "utf8"));
  for (const page of PUBLIC_PAGES) {
    const route = config.routes.find((item) => item.route === page.path);
    if (!route) throw new Error(`Missing Azure public route: ${page.path}`);
    route.headers["X-Robots-Tag"] = pageMetadata(page.path).robots;
  }
  outputs.set("staticwebapp.config.json", JSON.stringify(config, null, 2) + "\n");
  const manifest = JSON.parse(await readFile(resolve(root, "site.webmanifest"), "utf8"));
  Object.assign(manifest, { name: PUBLIC_SITE.name, short_name: PUBLIC_SITE.name, description: PUBLIC_SITE.description });
  outputs.set("site.webmanifest", JSON.stringify(manifest, null, 2) + "\n");
  const robots = await readFile(resolve(root, "robots.txt"), "utf8");
  outputs.set("robots.txt", robots.replace(/^#.*\n/gm, "").trimStart().replace(/Sitemap: .*/, `Sitemap: ${PUBLIC_SITE.origin}/sitemap.xml`));
  const drift = [];
  for (const [path, expected] of outputs) {
    if (await readFile(resolve(root, path), "utf8") === expected) continue;
    drift.push(path);
    if (!check) await writeFile(resolve(root, path), expected);
  }
  if (check && drift.length) throw new Error(`Public site catalog drift: ${drift.join(", ")}. Run node tools/sync-public-site.mjs.`);
  return drift;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = await synchronize({ check: process.argv.includes("--check") });
  console.log(`Public site metadata ${process.argv.includes("--check") ? "verified" : "synchronized"}: ${changed.length} changed files.`);
}
