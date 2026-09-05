import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getHomeTemplateSnapshot,
  renderHomeTemplate,
} from "../../src/views/home/home.template.js";

const adminHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "admin",
  },
  role: "admin",
  routes: {
    incidencias: "/incidencias",
  },
  dashboard: {
    admin: true,
    summary: {
      incidencias: 0,
      facturas: 0,
      clientes: 0,
      usuarios: 0,
      invoiceStatsAvailable: false,
    },
    activity: [],
    facturas: [],
  },
});

const userHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "user",
  },
  role: "user",
  dashboard: {
    admin: false,
    summary: {
      incidencias: 0,
      facturas: 0,
      invoiceStatsAvailable: false,
    },
    activity: [],
    facturas: [],
  },
});

const loadingHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "admin",
  },
  role: "admin",
  loading: true,
  dashboard: {
    admin: true,
    summary: {},
    activity: [],
    facturas: [],
  },
});

assert.match(
  adminHtml,
  /data-home-onboarding-pilot="welcome-v1"/,
  "Admin Home must expose the first visual onboarding pilot"
);
assert.match(adminHtml, /Hola, Marta/);
assert.match(adminHtml, /aria-label="Paso 1 de 5">1 de 5</);
assert.match(adminHtml, /<form method="dialog" class="home-welcome-pilot__surface">/);
assert.match(adminHtml, />Ahora no<\/button>/);
assert.match(
  adminHtml,
  /data-onboarding-pilot-primary="true"/,
  "Pilot must expose a unique primary CTA marker"
);
assert.match(
  adminHtml,
  /data-home-action="navigate"[\s\S]*data-route="\/incidencias"[\s\S]*data-onboarding-pilot-primary="true"/,
  "Pilot CTA must reuse Home canonical navigation and point to Incidencias"
);
assert.equal(
  (adminHtml.match(/data-home-navigation-control="true"/g) || []).length,
  5,
  "Pilot CTA must not become a sixth canonical Home navigation control"
);
assert.doesNotMatch(
  userHtml,
  /data-home-onboarding-pilot=/,
  "Visual pilot must remain admin-only until the persisted onboarding contract is activated"
);
assert.doesNotMatch(
  loadingHtml,
  /data-home-onboarding-pilot=/,
  "Pilot must not flash over the initial loading state"
);

const snapshot = getHomeTemplateSnapshot();
assert.equal(snapshot.onboardingPilotVersion, "welcome-v1");
assert.equal(snapshot.policy.onboardingPilotAdminOnly, true);
assert.equal(snapshot.policy.onboardingPilotVisualOnly, true);
assert.equal(snapshot.policy.onboardingPilotPersistsProgress, false);

const [templateSource, entryCss, pilotCss] = await Promise.all([
  readFile("src/views/home/home.template.js", "utf8"),
  readFile("src/css/compositions/home-extreme.css", "utf8"),
  readFile("src/css/compositions/home-onboarding-pilot.css", "utf8"),
]);

for (const forbidden of [
  /localStorage/,
  /sessionStorage/,
  /document\./,
  /window\./,
  /addEventListener/,
  /onclick\s*=/i,
  /style\s*=/i,
]) {
  assert.doesNotMatch(
    templateSource,
    forbidden,
    `Home onboarding pilot template must remain declarative: ${forbidden}`
  );
}

assert.equal(
  (entryCss.match(/@import url\("\.\/home-onboarding-pilot\.css"\);/g) || []).length,
  1,
  "Home onboarding pilot CSS must have one composition entry"
);
assert.doesNotMatch(pilotCss, /!important/);
assert.doesNotMatch(pilotCss, /#[0-9a-f]{3,8}\b/i, "Pilot CSS must consume global theme tokens, not a local palette");
assert.match(pilotCss, /\.home-view-root \.home-welcome-pilot \{/);
assert.match(pilotCss, /@media \(max-width: 640px\)/);
assert.match(pilotCss, /@media \(forced-colors: active\)/);
assert.match(pilotCss, /@media print/);

console.log("home onboarding welcome pilot contract: PASS");
