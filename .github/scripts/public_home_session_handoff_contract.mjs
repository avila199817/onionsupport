import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const app = read("src/app/index.js");
const auth = read("src/features/auth/index.js");
const router = read("src/router/index.js");
const support = read("src/features/public-support/index.js");
const experience = read("src/features/public-home-experience/index.js");

const delayMatch = app.match(/const PUBLIC_HYDRATION_DELAY_MS =\s*(\d+);/);
assert.ok(delayMatch, "App debe declarar el retardo de hidratación pública");

const hydrationDelay = Number(delayMatch[1]);
assert.ok(
  Number.isFinite(hydrationDelay) && hydrationDelay >= 0 && hydrationDelay <= 500,
  "La sesión pública debe empezar tras el primer paint, nunca varios segundos después"
);

assert.match(
  app,
  /const PUBLIC_HOME_SESSION_EVENT = "public-home:session-hydrated";/,
  "App debe publicar un evento específico de sesión hidratada"
);

const hydrationStart = app.indexOf("function hydratePublicHomeInBackground");
const hydrationEnd = app.indexOf("function clearPublicHydrationSchedule", hydrationStart);
assert.ok(hydrationStart >= 0 && hydrationEnd > hydrationStart, "Falta el flujo de hidratación pública");

const hydration = app.slice(hydrationStart, hydrationEnd);
const authInitIndex = hydration.indexOf("await initAuth(payload);");
const restoreIndex = hydration.indexOf("const restored = await restoreAuth(payload);");
const notifyIndex = hydration.indexOf("notifyPublicHomeSessionHydrated();");
const toastIndex = hydration.indexOf("await initToast(payload);");

assert.ok(authInitIndex >= 0, "La home pública debe registrar Auth antes del restore");
assert.ok(restoreIndex > authInitIndex, "Auth.init debe preceder a Auth.restoreSession");
assert.ok(notifyIndex > restoreIndex, "La interfaz sólo se sincroniza después del restore");
assert.ok(toastIndex > notifyIndex, "Toast no puede bloquear identidad ni navegación privada");

assert.match(
  app,
  /PUBLIC_HOME_SESSION_EVENT,[\s\S]*?"public-home:ready"/,
  "El handoff debe emitir el evento específico y conservar compatibilidad"
);

const fastPathStart = app.indexOf("if (publicFastBoot)");
const fastPathEnd = app.indexOf("/*\n    Orden contractual para rutas no fast-path", fastPathStart);
const fastPath = app.slice(fastPathStart, fastPathEnd);
assert.ok(
  fastPath.indexOf("markReady();") < fastPath.indexOf("schedulePublicHomeHydration("),
  "El primer render público debe completarse antes de iniciar la restauración en background"
);

assert.match(
  auth,
  /AppCore\.registerModule\("auth", Auth, \{ overwrite: true \}\)/,
  "Auth.init debe registrar el módulo que consume Router"
);
assert.match(
  router,
  /AppCore\.getModule\?\.\("auth"\)/,
  "Router debe autorizar rutas privadas mediante el módulo Auth registrado"
);

assert.match(
  support,
  /function internalPanelPath\(value = ""\)/,
  "Public Support debe validar el destino privado"
);
assert.match(
  support,
  /path === "\/"[\s\S]*?url\.pathname === "\/login"/,
  "Public Support debe rechazar home pública y login como panel"
);
assert.match(
  support,
  /current\?\.postLoginTarget/,
  "Public Support debe contemplar el destino autenticado canónico"
);
assert.match(
  support,
  /return slug \? `\/@\$\{encodeURIComponent\(slug\)\}` : "\/dashboard";/,
  "Public Support debe derivar un panel real cuando el estado aún conserva /"
);
assert.match(
  support,
  /document\.addEventListener\(PUBLIC_HOME_SESSION_EVENT, queueScan, true\)/,
  "Public Support debe refrescar identidad al terminar el restore"
);

const panelPathStart = experience.indexOf("function panelPath(");
const panelPathEnd = experience.indexOf("function routeLink", panelPathStart);
assert.ok(panelPathStart >= 0 && panelPathEnd > panelPathStart, "Falta panelPath en Public Home Experience");

const panelPath = experience.slice(panelPathStart, panelPathEnd);
const stateIndex = panelPath.indexOf("const fromState = panelCandidate(");
const slugIndex = panelPath.indexOf("const slug = text(");
const storedIndex = panelPath.indexOf("const stored = panelCandidate(");
const linkIndex = panelPath.indexOf("const fromLink = panelCandidate(");

assert.ok(stateIndex >= 0, "El menú debe priorizar el estado autenticado actual");
assert.ok(slugIndex > stateIndex, "El slug debe resolver el panel cuando el estado aún vale /");
assert.ok(storedIndex > slugIndex, "Un cache anterior nunca debe ganar al estado/slug actual");
assert.ok(linkIndex > storedIndex, "El href histórico debe ser el último fallback interno");

assert.match(
  experience,
  /path === "\/"[\s\S]*?path === "\/login"/,
  "El menú debe rechazar / y /login como destinos de panel"
);
assert.match(
  experience,
  /routeLink\("Inicio del panel", homePath\)/,
  "El acceso directo debe expresar inequívocamente que abre el panel"
);
assert.match(
  experience,
  /document\.addEventListener\(PUBLIC_HOME_SESSION_EVENT, queueScan, true\)/,
  "El menú debe reconstruirse al terminar la hidratación de sesión"
);

assert.equal(
  /function\s+compactDisplayName\s*\(/.test(experience),
  false,
  "La identidad del usuario no puede recortarse en JavaScript; CSS debe controlar el overflow"
);
assert.equal(
  experience.includes("compactAccountIdentity"),
  false,
  "La home debe reutilizar la identidad completa del AvatarSystem"
);
assert.match(
  support,
  /className = "public-support-account-email"/,
  "La cuenta pública debe pintar el correo bajo el nombre"
);

for (const [name, source] of [
  ["app", app],
  ["public-support", support],
  ["public-home-experience", experience],
]) {
  assert.equal(source.includes("setInterval("), false, `${name} no puede resolver sesión mediante polling`);
}

console.log("✅ public home session handoff contract (fast restore · Auth registered · canonical panel route)");
