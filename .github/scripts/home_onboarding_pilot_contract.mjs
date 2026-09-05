import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getHomeTemplateSnapshot,
  renderHomeTemplate,
} from "../../src/views/home/home.template.js";
import {
  HOME_ONBOARDING_ACTIONS,
  HOME_ONBOARDING_ENDPOINT,
  normalizeHomeOnboarding,
} from "../../src/views/home/home.onboarding.js";

const legacyOnboarding = {
  schemaVersion: 1,
  assignedVersion: 0,
  completedVersion: 0,
  completedStep: 0,
  completedAt: null,
  outcome: null,
};

const assignedOnboarding = {
  schemaVersion: 1,
  assignedVersion: 1,
  completedVersion: 0,
  completedStep: 0,
  completedAt: null,
  outcome: null,
  required: true,
  nextStep: 1,
  availableSteps: 1,
  autoPrompt: true,
};

const progressedOnboarding = {
  ...assignedOnboarding,
  completedStep: 1,
  outcome: "in_progress",
  nextStep: 2,
  autoPrompt: false,
};

function dashboard(admin) {
  return {
    admin,
    summary: {
      incidencias: 0,
      facturas: 0,
      clientes: admin ? 0 : undefined,
      usuarios: admin ? 0 : undefined,
      invoiceStatsAvailable: false,
    },
    activity: [],
    facturas: [],
  };
}

const adminHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "admin",
  },
  role: "admin",
  routes: {
    incidencias: "/incidencias",
  },
  dashboard: dashboard(true),
  onboarding: legacyOnboarding,
  onboardingLoaded: true,
});

const legacyUserHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "user",
  },
  role: "user",
  dashboard: dashboard(false),
  onboarding: legacyOnboarding,
  onboardingLoaded: true,
});

const assignedUserHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "user",
  },
  role: "user",
  routes: {
    incidencias: "/incidencias",
  },
  dashboard: dashboard(false),
  onboarding: assignedOnboarding,
  onboardingLoaded: true,
});

const progressedUserHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "user",
  },
  role: "user",
  dashboard: dashboard(false),
  onboarding: progressedOnboarding,
  onboardingLoaded: true,
});

const loadingHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "admin",
  },
  role: "admin",
  loading: true,
  dashboard: dashboard(true),
  onboarding: legacyOnboarding,
  onboardingLoaded: true,
});

const savingHtml = renderHomeTemplate({
  user: {
    displayName: "Marta García López",
    role: "admin",
  },
  role: "admin",
  dashboard: dashboard(true),
  onboarding: legacyOnboarding,
  onboardingLoaded: true,
  onboardingSaving: true,
});

assert.match(
  adminHtml,
  /data-home-onboarding-pilot="welcome-v1"/,
  "Legacy admin pilot must remain available until the first choice is persisted"
);
assert.match(adminHtml, /data-home-onboarding-active="welcome-v1"/);
assert.match(adminHtml, /Hola, Marta/);
assert.match(adminHtml, /aria-label="Paso 1 de 5">1 de 5</);
assert.match(adminHtml, /data-home-onboarding-target="step-1"/);
assert.match(adminHtml, />\s*Ahora no\s*<\/button>/);
assert.match(
  adminHtml,
  /data-home-action="onboarding-choice"[\s\S]*data-onboarding-action="dismiss"/,
  "Dismiss must be a persisted onboarding choice"
);
assert.match(
  adminHtml,
  /data-home-action="onboarding-choice"[\s\S]*data-onboarding-action="open_incidencias"[\s\S]*data-route="\/incidencias"[\s\S]*data-onboarding-pilot-primary="true"/,
  "Primary CTA must persist the choice before the controller navigates"
);
assert.match(adminHtml, /Tu progreso se guarda en tu cuenta\./);
assert.equal(
  (adminHtml.match(/data-home-navigation-control="true"/g) || []).length,
  4,
  "Admin Home keeps exactly four canonical stat navigation controls"
);

assert.doesNotMatch(
  legacyUserHtml,
  /data-home-onboarding-pilot=/,
  "Explicit legacy users with assignedVersion 0 must not be prompted"
);
assert.match(
  assignedUserHtml,
  /data-home-onboarding-pilot="welcome-v1"/,
  "Post-cutover assigned users must receive the first onboarding step"
);
assert.doesNotMatch(
  progressedUserHtml,
  /data-home-onboarding-pilot=/,
  "Step 1 must never repeat after it has been persisted"
);
assert.doesNotMatch(
  loadingHtml,
  /data-home-onboarding-pilot=/,
  "Onboarding must not flash over the initial loading state"
);
assert.match(savingHtml, /aria-busy="true"/);
assert.match(savingHtml, /Guardando tu elección…/);
assert.equal(
  (savingHtml.match(/\sdisabled(?:\s|>)/g) || []).length >= 2,
  true,
  "Both onboarding choices must be disabled while persistence is in flight"
);

const snapshot = getHomeTemplateSnapshot();
assert.equal(snapshot.onboardingPilotVersion, "welcome-v1");
assert.equal(snapshot.policy.onboardingAssignmentDriven, true);
assert.equal(snapshot.policy.onboardingLegacyAdminPilot, true);
assert.equal(snapshot.policy.onboardingPilotVisualOnly, false);
assert.equal(snapshot.policy.onboardingPilotPersistsProgress, true);
assert.equal(snapshot.policy.onboardingFirstLiveStep, 1);
assert.equal(snapshot.policy.onboardingGuideVersion, 1);
assert.equal(snapshot.policy.onboardingChoiceAction, "onboarding-choice");

const normalized = normalizeHomeOnboarding(assignedOnboarding);
assert.equal(normalized.assignedVersion, 1);
assert.equal(normalized.completedStep, 0);
assert.equal(normalized.autoPrompt, true);
assert.equal(HOME_ONBOARDING_ENDPOINT, "/api/users/me/onboarding");
assert.equal(HOME_ONBOARDING_ACTIONS.OPEN_INCIDENCIAS, "open_incidencias");
assert.equal(HOME_ONBOARDING_ACTIONS.DISMISS, "dismiss");

const [
  templateSource,
  indexSource,
  onboardingSource,
  statsSource,
  entryCss,
  pilotCss,
] = await Promise.all([
  readFile("src/views/home/home.template.js", "utf8"),
  readFile("src/views/home/index.js", "utf8"),
  readFile("src/views/home/home.onboarding.js", "utf8"),
  readFile("src/views/home/home.template.stats.js", "utf8"),
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
    `Home onboarding template must remain declarative: ${forbidden}`
  );
}

assert.match(indexSource, /loadHomeOnboarding/);
assert.match(indexSource, /saveHomeOnboardingChoice/);
assert.match(indexSource, /onboardingSaving = true/);
assert.match(indexSource, /await saveHomeOnboardingChoice/);
assert.match(indexSource, /await navigateTo\(route\)/);
assert.doesNotMatch(indexSource, /Http\./);
assert.doesNotMatch(indexSource, /localStorage|sessionStorage/);

assert.match(onboardingSource, /Http\.get\(HOME_ONBOARDING_ENDPOINT/);
assert.match(onboardingSource, /Http\.put\(/);
assert.match(onboardingSource, /version:\s*cleanVersion/);
assert.match(onboardingSource, /step:\s*cleanStep/);
assert.match(onboardingSource, /action:\s*cleanAction/);
assert.doesNotMatch(onboardingSource, /fetch\s*\(/);
assert.doesNotMatch(onboardingSource, /localStorage|sessionStorage/);
assert.doesNotMatch(onboardingSource, /document\.|window\./);

assert.match(statsSource, /data-home-onboarding-target=\\?"step-1\\?"/);

assert.equal(
  (entryCss.match(/@import url\("\.\/home-onboarding-pilot\.css"\);/g) || []).length,
  1,
  "Home onboarding CSS must have one composition entry"
);
assert.doesNotMatch(pilotCss, /!important/);
assert.doesNotMatch(
  pilotCss,
  /#[0-9a-f]{3,8}\b/i,
  "Onboarding CSS must consume global theme tokens, not a local palette"
);
assert.doesNotMatch(
  pilotCss,
  /var\(--surface-elevated(?:-strong)?\)/,
  "Coachmark must not use translucent elevated surfaces over readable Home content"
);
assert.doesNotMatch(
  pilotCss,
  /calc\(var\(--z-modal\)/,
  "A non-modal coachmark must never outrank the modal authority"
);
assert.match(pilotCss, /data-home-onboarding-active="welcome-v1"/);
assert.match(pilotCss, /data-home-onboarding-target="step-1"/);
assert.match(pilotCss, /0 0 0 100vmax var\(--overlay-bg\)/);
assert.match(pilotCss, /var\(--focus-ring-strong\)/);
assert.match(pilotCss, /\.home-view-root \.home-welcome-pilot \{/);
assert.match(
  pilotCss,
  /z-index:\s*var\(--z-tooltip\)/,
  "Coachmark must use the semantic non-modal stacking token"
);
assert.match(
  pilotCss,
  /inset-inline-start:\s*auto/,
  "Coachmark must explicitly neutralize native dialog inline-start centering"
);
assert.match(
  pilotCss,
  /inset-inline-end:\s*max\(var\(--space-md\),\s*var\(--app-safe-right,\s*0px\)\)/,
  "Desktop coachmark must stay on the logical trailing edge and respect safe area"
);
assert.match(
  pilotCss,
  /background:\s*var\(--solid-bg-0,\s*var\(--card-bg\)\)/,
  "Coachmark and target must use a solid design-system surface"
);
assert.match(pilotCss, /border:\s*1px solid var\(--card-border\)/);
assert.match(pilotCss, /border-radius:\s*var\(--card-radius-lg\)/);
assert.match(pilotCss, /background:\s*var\(--btn-primary-bg\)/);
assert.match(pilotCss, /background:\s*var\(--btn-primary-bg-hover\)/);
assert.match(pilotCss, /background:\s*var\(--btn-primary-bg-active\)/);
assert.match(pilotCss, /@media \(max-width: 640px\)/);
assert.match(pilotCss, /var\(--app-safe-left,\s*0px\)/);
assert.match(pilotCss, /var\(--app-safe-bottom,\s*0px\)/);
assert.match(pilotCss, /@media \(forced-colors: active\)/);
assert.match(pilotCss, /@media print/);

console.log("home onboarding persisted step-1 contract: PASS");
