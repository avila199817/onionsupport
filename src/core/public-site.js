/* Public brand and search metadata. Shared by the document generator and Router. */
export const PUBLIC_SITE_VERSION = "public-site-v3";

export const PUBLIC_SITE = Object.freeze({
  name: "Onion Support",
  origin: "https://onionsupport.com",
  domain: "onionsupport.com",
  description: "Soporte informático para particulares, autónomos y empresas en España. Asistencia remota, diagnóstico claro y soluciones para que tu tecnología funcione.",
  coverage: "Asistencia remota en España. La atención presencial se acuerda según el servicio y la ubicación.",
  email: "cristian@onionsupport.com",
  phoneDisplay: "629 946 615",
  phoneInternational: "34629946615",
  phoneTel: "+34629946615",
  ownerName: "Cristian Ávila",
  image: "/src/media/img/Cristian_Avila_480.webp",
  logo: "/src/media/img/favicon_black_circle_128.webp",
  address: Object.freeze({
    "@type": "PostalAddress",
    addressLocality: "Sant Vicenç de Castellet",
    postalCode: "08295",
    addressRegion: "Cataluña",
    addressCountry: "ES",
  }),
});

const service = (slug, label, title, description) => Object.freeze({
  path: `/${slug}`, file: `seo/${slug}.html`, label,
  title: `${title} | ${PUBLIC_SITE.name}`, description, indexable: true,
});

export const PUBLIC_SERVICES = Object.freeze([
  service("reparacion-ordenadores", "Reparación de ordenadores", "Reparación de ordenadores y portátiles", "Reparación de ordenadores y portátiles: diagnóstico de arranque, lentitud, SSD, RAM, temperatura y sistema con soluciones claras y proporcionadas."),
  service("soporte-informatico", "Soporte informático", "Soporte informático remoto y mantenimiento", "Soporte informático para particulares, autónomos y empresas. Asistencia remota, configuración, mantenimiento y solución de incidencias técnicas."),
  service("redes-wifi", "WiFi y redes", "WiFi y redes: diagnóstico y solución", "Solución de problemas WiFi y redes: cobertura, velocidad, cortes, routers, repetidores y dispositivos conectados con diagnóstico técnico claro."),
  service("impresoras", "Impresoras", "Instalación y soporte de impresoras", "Instalación y soporte de impresoras, escáneres y periféricos. Resolvemos drivers, WiFi, impresión compartida, colas y fallos de conexión."),
  service("soporte-empresas", "Soporte para empresas", "Soporte informático para empresas", "Soporte informático para empresas y autónomos: equipos, redes, impresoras, incidencias y mantenimiento IT con atención directa y soluciones claras."),
]);

export const PUBLIC_PAGES = Object.freeze([
  Object.freeze({ path: "/", file: "index.html", label: PUBLIC_SITE.name, title: "Onion Support | Servicio técnico informático", description: "Soporte informático para particulares, autónomos y empresas. Asistencia remota, reparación, redes y mantenimiento IT con soluciones claras y eficaces.", indexable: true }),
  ...PUBLIC_SERVICES,
  Object.freeze({ path: "/login", file: "login.html", label: "Iniciar sesión", title: `Iniciar sesión · ${PUBLIC_SITE.name}`, description: "Inicia sesión en Onion Support para consultar tus servicios, incidencias y datos de tu cuenta.", indexable: false }),
]);

export function pageMetadata(path = "/", routeTitle = "") {
  // Never propagate query strings, tokens, account slugs or user data into metadata.
  const pathname = String(path || "/").split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  const known = PUBLIC_PAGES.find((page) => page.path === pathname);
  if (known) return { ...known, canonical: PUBLIC_SITE.origin + known.path, robots: known.indexable ? "index, follow" : "noindex, follow" };
  const title = String(routeTitle || "Área privada").replace(/[\r\n\t]/g, " ").trim();
  return { path: pathname, title: `${title} · ${PUBLIC_SITE.name}`, description: "Área de acceso y gestión de Onion Support.", canonical: null, robots: "noindex, nofollow", indexable: false };
}

export function publicPageSchema(page) {
  if (!page.indexable) return null;
  const home = `${PUBLIC_SITE.origin}/`;
  const graph = [
    { "@type": "WebSite", "@id": `${home}#website`, url: home, name: PUBLIC_SITE.name, alternateName: PUBLIC_SITE.domain, inLanguage: "es", publisher: { "@id": `${home}#business` } },
    { "@type": "Organization", "@id": `${home}#business`, name: PUBLIC_SITE.name, url: home, image: PUBLIC_SITE.origin + PUBLIC_SITE.image, logo: PUBLIC_SITE.origin + PUBLIC_SITE.logo, email: PUBLIC_SITE.email, telephone: PUBLIC_SITE.phoneTel, description: PUBLIC_SITE.description, address: PUBLIC_SITE.address },
    { "@type": "WebPage", "@id": `${page.canonical}#webpage`, url: page.canonical, name: page.title, description: page.description, inLanguage: "es", isPartOf: { "@id": `${home}#website` }, about: { "@id": `${home}#business` }, ...(page.path === "/" ? {} : { breadcrumb: { "@id": `${page.canonical}#breadcrumb` } }) },
  ];
  if (page.path !== "/") graph.push(
    { "@type": "BreadcrumbList", "@id": `${page.canonical}#breadcrumb`, itemListElement: [{ "@type": "ListItem", position: 1, name: PUBLIC_SITE.name, item: home }, { "@type": "ListItem", position: 2, name: page.label, item: page.canonical }] },
    { "@type": "Service", "@id": `${page.canonical}#service`, name: page.label, description: `${page.description} ${PUBLIC_SITE.coverage}`, url: page.canonical, provider: { "@id": `${home}#business` } },
  );
  return { "@context": "https://schema.org", "@graph": graph };
}

export function pageMetaEntries(page) {
  return [
    ["name", "description", page.description],
    ...["robots", "googlebot", "bingbot"].map((name) => ["name", name, page.robots]),
    ["property", "og:type", "website"], ["property", "og:locale", "es_ES"],
    ["property", "og:site_name", PUBLIC_SITE.name], ["property", "og:title", page.title],
    ["property", "og:description", page.description], ["property", "og:url", page.canonical],
    ["property", "og:image", PUBLIC_SITE.origin + PUBLIC_SITE.image],
    ["property", "og:image:alt", `${PUBLIC_SITE.ownerName}, técnico informático de ${PUBLIC_SITE.name}`],
    ["name", "twitter:card", "summary"], ["name", "twitter:title", page.title],
    ["name", "twitter:description", page.description],
    ["name", "twitter:image", PUBLIC_SITE.origin + PUBLIC_SITE.image],
    ["name", "twitter:image:alt", `${PUBLIC_SITE.ownerName}, técnico informático de ${PUBLIC_SITE.name}`],
  ];
}
