import { pageMetadata, pageMetaEntries, publicPageSchema } from "../core/public-site.js";

function upsert(document, selector, tagName, attributes) {
  const matches = [...document.head.querySelectorAll(selector)];
  if (attributes === null) {
    matches.forEach((element) => element.remove());
    return;
  }
  const element = matches.shift() || document.createElement(tagName);
  matches.forEach((duplicate) => duplicate.remove());
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (!element.parentNode) document.head.append(element);
  return element;
}

export function syncPageMetadata(route = {}, document = globalThis.document) {
  if (!document?.head) return false;
  const page = pageMetadata(route?.path ?? "/__unresolved", route?.title || route?.name);
  document.title = page.title;
  for (const [attribute, key, value] of pageMetaEntries(page)) {
    upsert(document, `meta[${attribute}="${key}"]`, "meta", value == null ? null : { [attribute]: key, content: value });
  }
  upsert(document, 'link[rel="canonical"]', "link", page.canonical ? { rel: "canonical", href: page.canonical } : null);
  // A private route must not retain public alternate URLs or structured data.
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((element) => element.remove());
  if (page.indexable) {
    for (const language of ["es-ES", "x-default"]) upsert(document, `link[rel="alternate"][hreflang="${language}"]`, "link", { rel: "alternate", hreflang: language, href: page.canonical });
  }
  const schema = publicPageSchema(page);
  const node = upsert(document, 'script[data-onion-site-metadata="v3"]', "script", schema ? { type: "application/ld+json", "data-onion-site-metadata": "v3", "data-onion-schema": "service-hierarchy" } : null);
  if (node) node.textContent = JSON.stringify(schema).replace(/</g, "\\u003c");
  return true;
}
