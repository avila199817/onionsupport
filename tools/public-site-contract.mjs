import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PUBLIC_SITE, PUBLIC_PAGES, pageMetadata, publicPageSchema } from "../src/core/public-site.js";
import { synchronize } from "./sync-public-site.mjs";

await synchronize({ check: true });
assert.equal(pageMetadata("/").title, "Soporte informático y asistencia técnica | Onion Support");
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
  }
  assert.doesNotMatch(head.match(/<title>(.*?)<\/title>/)?.[1] || "", /Sant Vicenç|Barcelona/);
}
const robots = await readFile(new URL("../robots.txt", import.meta.url), "utf8");
assert.doesNotMatch(robots, /Disallow:\s*\/login/);
const sitemap = await readFile(new URL("../sitemap.xml", import.meta.url), "utf8");
assert.doesNotMatch(sitemap, /\/login/);
console.log("Public site contract: PASS · generated documents · one metadata owner · canonical services · crawlable noindex login · preserved legal address");
