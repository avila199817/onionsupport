import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

const CRITICAL_PATH = "src/css/views/public/home-critical.css";
const HOME_PATH = "src/css/views/public/index.css";
const HOME_TEMPLATE_PATH = "src/views/public/home/template.js";
const PUBLIC_SUPPORT_PATH = "src/features/public-support/index.js";
const PROFILE_PNG_PATH = "src/media/img/Cristian_Avila.png";
const SUPPORT_PNG_PATH = "src/media/img/Cristian_Avila_Formulario.png";
const PROFILE_WEBP_PATH = "src/media/img/Cristian_Avila_960.webp";
const SUPPORT_WEBP_PATH = "src/media/img/Cristian_Avila_Formulario_960.webp";

const criticalCss = read(CRITICAL_PATH);
const executableCriticalCss = stripComments(criticalCss);
const homeCss = read(HOME_PATH);
const homeTemplate = read(HOME_TEMPLATE_PATH);
const publicSupport = read(PUBLIC_SUPPORT_PATH);

assert.equal(
  executableCriticalCss.includes("!important"),
  false,
  "El encuadre crítico del avatar no puede depender de !important"
);

assert.match(
  criticalCss,
  /\.public-home \.public-home-command-portrait\s*\{\s*--public-home-profile-photo-offset-y:\s*5px;\s*\}/,
  "Desktop debe conservar el ajuste óptico canónico de 5px"
);

assert.match(
  criticalCss,
  /\.public-home \.public-home-command-photo\s*\{[\s\S]*?object-position:\s*center\s*calc\(50% \+ var\(--public-home-profile-photo-offset-y\)\);[\s\S]*?\}/,
  "La fotografía debe consumir la variable mediante object-position"
);

assert.match(
  criticalCss,
  /@media \(max-width: 720px\)\s*\{[\s\S]*?\.public-home \.public-home-command-portrait\s*\{\s*--public-home-profile-photo-offset-y:\s*40px;\s*\}[\s\S]*?\}/,
  "Móvil debe compensar el recorte vertical con un offset de 40px"
);

const mobileMatch = criticalCss.match(
  /@media \(max-width: 720px\)\s*\{(?<body>[\s\S]*?)\n\}/
);

assert.ok(
  mobileMatch?.groups?.body,
  "No se pudo aislar el contrato móvil del retrato"
);

assert.doesNotMatch(
  stripComments(mobileMatch.groups.body),
  /(?:transform|translate|position|inset|margin|padding|inline-size|block-size|min-|max-|width|height)\s*:/,
  "El ajuste móvil no puede modificar geometría ni desplazar el marco"
);

assert.match(
  homeCss,
  /\.public-home-command-photo\s*\{[\s\S]*?object-fit:\s*cover;/,
  "La fotografía debe conservar object-fit: cover en la fuente visual"
);

assert.match(
  homeCss,
  /@media \(max-width: 720px\)/,
  "El breakpoint del encuadre debe coincidir con la frontera móvil de la Home"
);

assert.ok(existsSync(PROFILE_WEBP_PATH), "Falta el fallback WebP 960 del perfil público");
assert.ok(existsSync(SUPPORT_WEBP_PATH), "Falta el fallback WebP 960 del formulario público");
assert.equal(existsSync(PROFILE_PNG_PATH), false, "El PNG legado del perfil no debe volver al release");
assert.equal(existsSync(SUPPORT_PNG_PATH), false, "El PNG legado del formulario no debe volver al release");

assert.match(
  homeTemplate,
  /const CRISTIAN_PROFILE_PHOTO = "src\/media\/img\/Cristian_Avila_960\.webp";/,
  "La Home debe usar WebP 960 como fallback canónico"
);
assert.doesNotMatch(
  homeTemplate,
  /Cristian_Avila\.png/,
  "La Home no puede reintroducir el PNG legado"
);
assert.match(
  publicSupport,
  /const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = "\/src\/media\/img\/Cristian_Avila_Formulario_960\.webp";/,
  "El intake debe usar WebP 960 como fallback canónico"
);
assert.doesNotMatch(
  publicSupport,
  /Cristian_Avila_Formulario\.png/,
  "El intake no puede reintroducir el PNG legado"
);
assert.match(
  publicSupport,
  /width="960"\s+height="1200"/,
  "El fallback del intake debe declarar las dimensiones reales del WebP 960"
);

console.log(
  "✅ public profile photo contract (desktop 5px · mobile 40px · WebP-only fallbacks · legacy PNGs retired)"
);
