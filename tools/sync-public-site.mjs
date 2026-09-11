import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_SITE, PUBLIC_PAGES, PUBLIC_SERVICES, pageMetadata, pageMetaEntries, publicPageSchema } from "../src/core/public-site.js";
import { renderPublicLegalFooter } from "../src/core/public-legal.js";
import content from "./public-service-content.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const START = "<!-- public-site-v3: generated metadata -->";
const END = "<!-- /public-site-v3 -->";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function renderMetadata(page) {
  const schema = publicPageSchema(page);
  return `${START}\n  <title>${escape(page.title)}</title>\n${pageMetaEntries(page).filter(([, , value]) => value != null).map(([attribute, key, value]) => `  <meta ${attribute}="${key}" content="${escape(value)}">`).join("\n")}\n  <link rel="canonical" href="${escape(page.canonical)}">${page.indexable ? `\n  <link rel="alternate" hreflang="es-ES" href="${escape(page.canonical)}">\n  <link rel="alternate" hreflang="x-default" href="${escape(page.canonical)}">` : ""}${schema ? `\n  <script type="application/ld+json" data-onion-site-metadata="v3" data-onion-schema="service-hierarchy">\n${JSON.stringify(schema, null, 2).replace(/</g, "\\u003c")}\n  </script>` : ""}\n  ${END}`;
}

// Keep the established empty Router root and its single runtime H1. The
// no-script alternative uses the public catalog without forms, duplicate IDs,
// tracking embeds or unverified claims about a public storefront.
export function renderNoScriptSummary() {
  return `<section class="noscript-box" lang="es" data-public-noscript-summary="true">
          <p class="noscript-title">${escape(PUBLIC_SITE.name)}: servicio técnico informático</p>
          <p>${escape(PUBLIC_SITE.description)}</p>
          <p>Atención directa de ${escape(PUBLIC_SITE.ownerName)}, técnico informático de ${escape(PUBLIC_SITE.name)}.</p>
          <p>Base en ${escape(PUBLIC_SITE.address.addressLocality)}. ${escape(PUBLIC_SITE.coverage)}</p>
          <h2 class="noscript-services-label">Servicios informáticos</h2>
          <nav class="noscript-services" aria-label="Servicios técnicos de Onion Support">
            ${PUBLIC_SERVICES.map((service) => `<a href="${escape(service.path)}">${escape(service.label)}</a>`).join("\n            ")}
          </nav>
          <h2 class="noscript-services-label">Contacto y atención</h2>
          <p>Cuéntanos qué está fallando. Antes de intervenir confirmamos el alcance, la modalidad de atención y el presupuesto.</p>
          <nav class="noscript-services" aria-label="Contactar con Onion Support">
            <a href="tel:${escape(PUBLIC_SITE.phoneTel)}">Llamar al ${escape(PUBLIC_SITE.phoneDisplay)}</a>
            <a href="mailto:${escape(PUBLIC_SITE.email)}">${escape(PUBLIC_SITE.email)}</a>
            <a href="https://wa.me/${escape(PUBLIC_SITE.phoneInternational)}" target="_blank" rel="noopener noreferrer">Consultar por WhatsApp</a>
            <a href="${escape(PUBLIC_SITE.googleMapsUrl)}" target="_blank" rel="noopener noreferrer">Onion Support en Google Maps</a>
          </nav>
          <p class="noscript-services-label">El formulario de asistencia y el área de clientes necesitan JavaScript. También puedes solicitar atención por teléfono, correo o WhatsApp.</p>
          <nav class="noscript-services" aria-label="Área de clientes"><a href="/login">Iniciar sesión</a></nav>
        </section>`;
}

function materializeNoScriptSummary(source) {
  const start = "<!-- public-home-summary:noscript -->";
  const end = "<!-- /public-home-summary:noscript -->";
  if (source.split(start).length !== 2 || source.split(end).length !== 2) {
    throw new Error("Expected one no-script summary boundary");
  }
  const first = source.indexOf(start);
  const last = source.indexOf(end);
  if (last < first) throw new Error("Invalid no-script summary boundary");
  return source.slice(0, first) + start + "\n        " + renderNoScriptSummary() + "\n        " + source.slice(last);
}

export function materializeDocument(source, page) {
  if (page.path === "/") source = materializeNoScriptSummary(source);
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
  const serviceIcons = {
    "/reparacion-ordenadores": '<rect x="4" y="4" width="24" height="17" rx="2"></rect><path d="M11 28h10M16 21v7M8 9h8"></path>',
    "/soporte-informatico": '<path d="M6 17v-2a10 10 0 0 1 20 0v2M6 16H4v8h5v-8H6ZM26 16h2v8h-5v-8h3ZM26 24v1a3 3 0 0 1-3 3h-7"></path>',
    "/redes-wifi": '<path d="M3 11a21 21 0 0 1 26 0M7 16a15 15 0 0 1 18 0M11 21a8 8 0 0 1 10 0"></path><circle cx="16" cy="27" r="1"></circle>',
    "/impresoras": '<path d="M9 11V4h14v7M9 24H4V12h24v12h-5M9 19h14v9H9zM23 15h1"></path>',
    "/soporte-empresas": '<rect x="3" y="10" width="26" height="18" rx="3"></rect><path d="M11 10V5h10v5M3 18a34 34 0 0 0 26 0M16 17v5"></path>',
  };
  const relatedLinks = PUBLIC_SERVICES.filter((item) => item.path !== page.path).map((item) => `<a href="${item.path}"><span>${escape(item.label)}</span><span aria-hidden="true">↗</span></a>`).join("\n        ");
  return `<!doctype html>
<html lang="es" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="theme-color" content="#030712">
  ${renderMetadata(page)}
  <link rel="icon" href="/favicon.ico" sizes="any">
  <script src="/src/preboot/theme.js"></script>
  <link rel="stylesheet" href="/src/css/seo/public-service.css">
  <link rel="stylesheet" href="/src/css/views/public/legal-footer.css">
  <script type="module" src="/src/analytics/google-tag.js"></script>
</head>
<body>
  <a class="seo-skip-link" href="#contenido">Saltar al contenido</a>
  <header class="seo-header"><div class="seo-shell seo-header-inner">
    <a class="seo-brand" href="/" aria-label="Onion Support, inicio"><img src="${PUBLIC_SITE.logo}" alt="" width="44" height="44"><span class="seo-brand-name">ONION <strong>SUPPORT</strong></span></a>
    <nav class="seo-nav" aria-label="Navegación principal">
      <a href="#otros-servicios">Servicios</a>
      <a href="#contacto">Contacto</a>
      <a class="seo-nav-access" href="/login">Iniciar sesión</a>
    </nav>
  </div></header>
  <main class="seo-shell" id="contenido" tabindex="-1">
    <nav class="seo-breadcrumb" aria-label="Ruta de navegación"><a href="/">Inicio</a><span aria-hidden="true">/</span><span aria-current="page">${escape(page.label)}</span></nav>
    <div class="seo-hero"><div class="seo-hero-copy">
      <p class="seo-eyebrow">${escape(page.label)}</p>
      <h1>${escape(details.heading)}</h1>
      <p class="seo-lead">${escape(details.lead)}</p>
      <div class="seo-actions">
        <a class="seo-button seo-button--primary" href="/#incidencia">Solicitar soporte <span aria-hidden="true">→</span></a>
        <a class="seo-button seo-button--secondary" href="${escape(whatsapp)}" target="_blank" rel="noopener noreferrer">Consultar por WhatsApp <span aria-hidden="true">↗</span></a>
      </div>
      <p class="seo-coverage">${escape(PUBLIC_SITE.coverage)}</p>
    </div><aside class="seo-card" aria-labelledby="resumen-servicio">
      <span class="seo-service-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${serviceIcons[page.path]}</svg></span>
      <p class="seo-card-kicker">El servicio, de un vistazo</p>
      <h2 id="resumen-servicio">Diagnóstico claro.<br>Atención directa.</h2>
      <ul>${details.highlights.map((item) => `<li><span aria-hidden="true">✓</span>${escape(item)}</li>`).join("")}</ul>
    </aside></div>
    <section class="seo-detail" aria-labelledby="detalle-servicio">
      <div class="seo-section-heading"><p class="seo-eyebrow">En qué puedo ayudarte</p><h2 id="detalle-servicio">Una solución adaptada al problema.</h2></div>
      <div class="seo-content">
      ${details.sections.map((section, index) => `<section><span class="seo-section-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><h3>${escape(section.heading)}</h3><p>${escape(section.body)}</p></section>`).join("\n      ")}
      <section><span class="seo-section-number" aria-hidden="true">${String(details.sections.length + 1).padStart(2, "0")}</span><h3>Antes de intervenir</h3><p>Confirmamos contigo el alcance, la modalidad de atención y el presupuesto. La atención presencial se acuerda según el servicio y la ubicación.</p></section>
      </div>
    </section>
    <section class="seo-contact" aria-labelledby="contacto"><div><p class="seo-eyebrow">El siguiente paso</p><h2 id="contacto">Cuéntame qué está fallando.</h2><p>Describe el equipo, el síntoma y desde cuándo ocurre. Te indicaré cómo podemos resolverlo antes de intervenir.</p><div class="seo-contact-details"><a href="tel:${PUBLIC_SITE.phoneTel}">${PUBLIC_SITE.phoneDisplay}</a><a href="mailto:${PUBLIC_SITE.email}">${PUBLIC_SITE.email}</a></div></div><a class="seo-button seo-button--primary" href="/#incidencia">Explicar mi incidencia <span aria-hidden="true">→</span></a></section>
    <section class="seo-links" aria-labelledby="otros-servicios"><div class="seo-section-heading"><p class="seo-eyebrow">También puedo ayudarte con</p><h2 id="otros-servicios">Otros servicios</h2></div><div class="seo-link-grid">
        ${relatedLinks}
    </div>
    </section>
  </main>
  ${renderPublicLegalFooter().trim()}
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
