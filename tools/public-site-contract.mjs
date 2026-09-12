import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { PUBLIC_SITE, PUBLIC_PAGES, PUBLIC_SERVICES, pageMetadata, publicPageSchema } from "../src/core/public-site.js";
import { synchronize, renderNoScriptSummary, materializeDocument } from "./sync-public-site.mjs";

await synchronize({ check: true });
const preload = await readFile(new URL("../src/preboot/public-home-preload.js", import.meta.url), "utf8");
for (const pathname of ["/password-request", "/password-reset", "/password-reset/confirm/example", "/reset-password/confirm/example", "/activate-account", "/activate-account/example", "/dashboard", "/incidencias"]) {
  const links = [];
  const head = { querySelector: () => null, appendChild: (link) => links.push(link) };
  const document = { head, createElement: () => ({ dataset: {}, setAttribute() {} }) };
  runInNewContext(preload, { document, window: { location: { pathname } } });
  assert.ok(links.some((link) => link.href.includes("ticket-deeplink")), "preserve token/deeplink boot hints");
  assert.equal(links.some((link) => link.href.includes("/ui/chrome/")), ["/dashboard", "/incidencias"].includes(pathname), `${pathname}: private chrome hints only where useful`);
}
const ownerMapsUrl = "https://maps.app.goo.gl/s41pMKVjSr6pDg6F9";
assert.equal(PUBLIC_SITE.googleMapsUrl, ownerMapsUrl, "preserve the owner-supplied profile URL");
assert.equal(pageMetadata("/").title, "Onion Support | Servicio técnico informático");
assert.equal(pageMetadata("/login?returnTo=%2Fcuenta").robots, "noindex, follow");
assert.equal(pageMetadata("/@private-person?token=secret", "Cuenta").canonical, null);
assert.equal(publicPageSchema(pageMetadata("/login")), null);

for (const entry of PUBLIC_PAGES) {
  const html = await readFile(new URL(`../${entry.file}`, import.meta.url), "utf8");
  const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || "";
  assert.equal([...head.matchAll(/<title\b/gi)].length, 1, `${entry.path}: one title`);
  assert.equal([...head.matchAll(/rel="canonical"/gi)].length, 1, `${entry.path}: one canonical`);
  for (const name of ["description", "robots", "googlebot", "bingbot", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"]) {
    assert.equal([...head.matchAll(new RegExp(`name="${name}"`, "g"))].length, 1, `${entry.path}: one ${name}`);
  }
  for (const property of ["og:title", "og:description", "og:url", "og:site_name", "og:image", "og:image:alt"]) {
    assert.equal([...head.matchAll(new RegExp(`property="${property}"`, "g"))].length, 1, `${entry.path}: one ${property}`);
  }
  const blocks = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, entry.indexable ? 1 : 0, `${entry.path}: single public schema owner`);
  if (entry.indexable) {
    const graph = JSON.parse(blocks[0][1])["@graph"];
    assert.equal(new Set(graph.map((node) => node["@id"])).size, graph.length, "schema identities must be unique");
    assert.equal(graph.find((node) => node["@type"] === "WebSite").name, PUBLIC_SITE.name);
    assert.equal(graph.find((node) => node["@type"] === "Organization").address.addressLocality, "Sant Vicenç de Castellet", "preserve legal locality");
    const business = graph.find((node) => node["@type"] === "Organization");
    assert.deepEqual(business.sameAs, [ownerMapsUrl], `${entry.path}: explicit business identity`);
    assert.equal(business.contactPoint.telephone, PUBLIC_SITE.phoneTel);
    assert.equal(business.contactPoint.email, PUBLIC_SITE.email);
    assert.equal(business.contactPoint.availableLanguage, "es");
    assert.deepEqual(JSON.parse(blocks[0][1]), publicPageSchema(pageMetadata(entry.path)), "static and Router schema must agree");
    assert.doesNotMatch(JSON.stringify(graph), /aggregateRating|ratingValue|reviewCount|LocalBusiness|openingHours|latitude|longitude/, "no invented reviews, storefront or coordinates");
    if (entry.path !== "/") {
      assert.ok(html.includes(`href="${ownerMapsUrl}" target="_blank" rel="noopener noreferrer"`));
      assert.ok(html.includes('<a href="#contacto">Contacto</a>'), "service contact works without a SPA transition");
      assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${entry.path}: one primary service heading in delivered HTML`);
      const navigation = html.match(/<nav class="seo-nav"[\s\S]*?<\/nav>/)?.[0] || "";
      assert.match(navigation, /<details\b/, "service navigation works without JavaScript");
      assert.ok(navigation.includes(`href="${entry.path}" aria-current="page"`), "service navigation identifies the current page");
      assert.equal([...navigation.matchAll(/aria-current="page"/g)].length, 1, "only one service is current");
      for (const service of PUBLIC_SERVICES) assert.ok(navigation.includes(`href="${service.path}"`), "every service is available from primary navigation");
      assert.match(html, /<ul class="seo-contact-preparation"><li>[^<]+<\/li>/, "contact includes useful service-specific preparation");
      for (const service of PUBLIC_SERVICES.filter((item) => item.path !== entry.path)) {
        assert.ok(html.includes(`href="${service.path}"`), `${entry.path}: discoverable ${service.path}`);
      }
    }
  }
  assert.doesNotMatch(head.match(/<title>(.*?)<\/title>/)?.[1] || "", /Sant Vicenç|Barcelona/);
}
const home = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = "<!-- public-home-summary:noscript -->";
const end = "<!-- /public-home-summary:noscript -->";
const summary = home.split(start)[1]?.split(end)[0]?.trim();
assert.equal(summary, renderNoScriptSummary(), "no-script alternative comes from the public catalog");
assert.match(summary, /class="noscript-title" role="heading" aria-level="1"/, "no-script content has a semantic primary heading");
assert.doesNotMatch(summary, /<h1\b|<script|<iframe|<form|\sid=/, "preserve the runtime H1 and avoid embeds, inactive forms or duplicate IDs");
for (const service of PUBLIC_SERVICES) assert.ok(summary.includes(`href="${service.path}"`));
for (const href of [ownerMapsUrl, `tel:${PUBLIC_SITE.phoneTel}`, `mailto:${PUBLIC_SITE.email}`, `https://wa.me/${PUBLIC_SITE.phoneInternational}`]) {
  assert.ok(summary.includes(`href="${href}"`), `no-script alternative: usable contact ${href}`);
}
assert.equal(materializeDocument(home, pageMetadata("/")), home, "generation is idempotent");
assert.throws(() => materializeDocument(home.replace(start, ""), pageMetadata("/")), /no-script summary boundary/, "missing generation boundary fails closed");
const initial = home.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
assert.doesNotMatch(initial, /data-public-noscript-summary/, "alternative content must not compete with the Router");
assert.match(initial, /id="view-container"[^>]*>\s*<\/div>/, "preserve the empty boot container");
assert.doesNotMatch(home, /<h1\b/i, "the canonical H1 still belongs to the mounted Home");

const robots = await readFile(new URL("../robots.txt", import.meta.url), "utf8");
assert.doesNotMatch(robots, /Disallow:\s*\/login/);
const sitemap = await readFile(new URL("../sitemap.xml", import.meta.url), "utf8");
assert.doesNotMatch(sitemap, /\/login/);
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), PUBLIC_PAGES.filter((page) => page.indexable).map((page) => PUBLIC_SITE.origin + page.path), "sitemap contains exactly the canonical public URLs");
console.log("Public site contract: PASS · generated documents · one metadata owner · canonical services · crawlable noindex login · preserved legal address · Maps identity · generated no-script home · empty boot container · contact and sitemap links");
