import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCommentIdentityIndex,
  resolveCommentProfile,
} from "../../src/features/incidencias-comment-identity/index.js";

import {
  AVATAR_TONE_COUNT,
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/identity.js";

const LEGACY_FEATURE_PATH =
  "src/features/incidencias-avatar-fallback/index.js";
const IDENTITY_PATH =
  "src/features/incidencias-comment-identity/index.js";
const COMMENT_AVATARS_PATH =
  "src/features/incidencias-comment-avatars/index.js";
const COMMENT_AVATARS_STYLE_PATH =
  "src/features/incidencias-comment-avatars/style.css";
const FOLLOWUP_PATH =
  "src/features/incidencias-followup-avatars/index.js";
const FOLLOWUP_STYLE_PATH =
  "src/features/incidencias-followup-avatars/style.css";
const DETAIL_MODAL_STYLE_PATH =
  "src/css/components/detail-modal.css";
const ENHANCEMENTS_PATH =
  "src/app/enhancements.js";
const DETAIL_COMMENT_RENDERER_PATHS = [
  "src/features/incidencias-detail-experience/index.js",
  "src/features/incidencias-detail-live-sync/index.js",
  "src/features/incidencias-detail-state/index.js",
];
const PRIVATE_INTERACTIONS_STYLE_PATH =
  "src/css/compositions/private-admin-interactions.css";

const identitySource = fs.readFileSync(IDENTITY_PATH, "utf8");
const commentSource = fs.readFileSync(COMMENT_AVATARS_PATH, "utf8");
const commentStyle = fs.readFileSync(COMMENT_AVATARS_STYLE_PATH, "utf8");
const followupSource = fs.readFileSync(FOLLOWUP_PATH, "utf8");
const followupStyle = fs.readFileSync(FOLLOWUP_STYLE_PATH, "utf8");
const detailModalStyle = fs.readFileSync(DETAIL_MODAL_STYLE_PATH, "utf8");
const enhancementsSource = fs.readFileSync(ENHANCEMENTS_PATH, "utf8");
const privateInteractionsStyle = fs.readFileSync(
  PRIVATE_INTERACTIONS_STYLE_PATH,
  "utf8"
);
const detailCommentRendererSources = DETAIL_COMMENT_RENDERER_PATHS.map(
  (rendererPath) => [rendererPath, fs.readFileSync(rendererPath, "utf8")]
);

assert.equal(
  fs.existsSync(LEGACY_FEATURE_PATH),
  false,
  "incidencias-avatar-fallback debe permanecer eliminado: AvatarSystem gestiona fallos globales"
);

assert.match(
  identitySource,
  /incidencias\.comment-identity\.v1-pure-stable-aliases/u
);
assert.doesNotMatch(identitySource, /\bdocument\b|\bwindow\b|MutationObserver|fetch\s*\(/u);
assert.doesNotMatch(identitySource, /avatarTone|data-avatar-tone|%\s*(?:10|20)/u);
assert.match(identitySource, /entry\.byUserId/u);
assert.match(identitySource, /entry\.byEmail/u);
assert.match(identitySource, /stableIdentity\?\.hasStableIdentity/u);
assert.match(
  identitySource,
  /return matchProfileByStableIdentity\(stableIdentity, profiles\)/u,
  "con identidad estable no se permite apropiarse de una foto sólo por nombre"
);

assert.match(
  commentSource,
  /incidencias\.comment-avatars\.v1-global-avatar-authority/u
);
assert.match(commentSource, /loadIncidenciaDetail/u);
assert.match(commentSource, /const detailIdentityState = new WeakMap\(\)/u);
assert.match(commentSource, /resolveAvatarPresentation/u);
assert.match(commentSource, /buildCommentIdentityIndex/u);
assert.match(commentSource, /resolveCommentProfile/u);
assert.match(commentSource, /data(?:set)?\.avatarSystem|dataset\.avatarSystem/u);
assert.match(commentSource, /dataset\.avatarHost/u);
assert.match(commentSource, /dataset\.avatarTone/u);
assert.match(commentSource, /dataset\.avatarIdentity/u);
assert.match(commentSource, /dataset\.avatarInitials/u);
assert.match(commentSource, /dataset\.avatarEmail/u);
assert.match(commentSource, /dataset\.avatarUserId/u);
assert.match(commentSource, /dataset\.avatarImage/u);
assert.match(commentSource, /dataset\.avatarFallback/u);
assert.match(commentSource, /MutationObserver/u);
assert.doesNotMatch(commentSource, /document\.addEventListener\(\s*["']error["']/u);
assert.doesNotMatch(commentSource, /IncidenciasAvatarFallbackInternals/u);
assert.doesNotMatch(commentSource, /avatarToneFromIdentity|resolveAvatarTone|%\s*(?:10|20)/u);
assert.doesNotMatch(commentSource, /createElement\(["']style["']\)/u);

assert.match(
  followupSource,
  /incidencias\.followup-avatars\.v6\.global-avatar-authority/u
);
assert.match(followupSource, /import\s+["']\.\/style\.css["'];/u);
assert.match(followupSource, /resolveAvatarPresentation/u);
assert.match(followupSource, /incidencias-comment-identity\/index\.js/u);
assert.match(followupSource, /dataset\.avatarSystem/u);
assert.match(followupSource, /dataset\.avatarHost/u);
assert.match(followupSource, /dataset\.avatarEmail/u);
assert.match(followupSource, /dataset\.avatarUserId/u);
assert.match(followupSource, /dataset\.avatarImage/u);
assert.match(followupSource, /dataset\.avatarFallback/u);
assert.match(followupSource, /MutationObserver/u);
assert.doesNotMatch(followupSource, /IncidenciasAvatarFallbackInternals/u);
assert.doesNotMatch(followupSource, /avatarToneFromIdentity|resolveAvatarTone|%\s*(?:10|20)/u);
assert.doesNotMatch(followupSource, /addEventListener\([\s\S]{0,80}["']error["']/u);
assert.doesNotMatch(followupSource, /createElement\(["']style["']\)/u);

for (const [label, source] of [
  ["timeline comments", commentStyle],
  ["Seguimiento", followupStyle],
]) {
  assert.doesNotMatch(
    source,
    /\[data-avatar-tone=|linear-gradient|box-shadow\s*:|(?:^|\n)\s*(?:color|background|border(?:-color)?)\s*:/u,
    `${label} sólo puede adaptar contexto/tamaño; AvatarSystem posee el paint`
  );
  assert.doesNotMatch(source, /!important/u);
}

assert.match(commentStyle, /inline-size:\s*22px/u);
assert.match(commentStyle, /block-size:\s*22px/u);
assert.match(followupStyle, /inline-size:\s*28px/u);
assert.match(followupStyle, /block-size:\s*28px/u);
assert.match(
  followupStyle,
  /@media \(max-width: 720px\)[\s\S]*?inline-size:\s*26px;[\s\S]*?block-size:\s*26px;/u
);

assert.doesNotMatch(
  detailModalStyle,
  /\[data-avatar-tone=["'][0-9]+["']\]/u,
  "detail-modal no puede reintroducir una paleta enumerada; sólo AvatarSystem puede poseerla"
);
assert.doesNotMatch(
  detailModalStyle,
  /--ui-detail-avatar-(?:a|b)\s*:/u,
  "detail-modal no puede conservar su viejo motor de gradientes"
);
assert.match(
  detailModalStyle,
  /\.ui-detail-modal-avatar-frame\s*\{[\s\S]*?display:\s*grid;/u
);

assert.match(
  enhancementsSource,
  /key:\s*["']incidencias-comment-avatars["'][\s\S]*?scope:\s*["']incidencias["'][\s\S]*?features\/incidencias-comment-avatars\/index\.js/u
);
assert.match(
  enhancementsSource,
  /key:\s*["']incidencias-followup-avatars["'][\s\S]*?scope:\s*["']incidencias["'][\s\S]*?features\/incidencias-followup-avatars\/index\.js/u
);
assert.doesNotMatch(enhancementsSource, /incidencias-avatar-fallback/u);

for (const [rendererPath, rendererSource] of detailCommentRendererSources) {
  assert.match(
    rendererSource,
    /date\.className\s*=\s*["']incidencias-modal-description-comment-date["']/u,
    `${rendererPath} debe mantener clase semántica propia para la fecha`
  );
}
assert.match(
  privateInteractionsStyle,
  /\.incidencias-modal-description-comment-date\s*\{[\s\S]*?color:\s*var\(--text-muted\);/u
);
assert.doesNotMatch(
  privateInteractionsStyle,
  /\.incidencias-modal-description-comment-head\s+span\s*\{/u
);

const requester = Object.freeze({
  source: "requester",
  name: "Cristian Ávila Luque",
  userId: "on-requester",
  email: "requester@example.com",
  src: "https://example.test/requester.jpg",
});
const technician = Object.freeze({
  source: "technician",
  name: "Cristian Ávila",
  userId: "on-technician",
  email: "technician@example.com",
  src: "https://example.test/technician.jpg",
});
const profiles = [requester, technician];

{
  const index = buildCommentIdentityIndex({
    comments: [{
      byName: "Cristian Ávila",
      byUserId: "on-technician",
      byEmail: "technician@example.com",
    }],
  });
  assert.equal(
    resolveCommentProfile("Cristian Ávila", index, profiles)?.source,
    "technician"
  );
}

{
  const index = buildCommentIdentityIndex({
    comments: [{
      byName: "Cristian Ávila",
      byUserId: "on-third-person",
      byEmail: "third@example.com",
    }],
  });
  assert.equal(
    resolveCommentProfile("Cristian Ávila", index, profiles),
    null,
    "una identidad estable que no coincide debe fallar cerrado"
  );
}

{
  const index = buildCommentIdentityIndex({
    comments: [{ byName: "Cristian Ávila Luque" }],
  });
  assert.equal(
    resolveCommentProfile("Cristian Ávila Luque", index, profiles)?.source,
    "requester"
  );
}

const presentation = resolveAvatarPresentation({
  displayName: "Cristian Ávila Luque",
  email: "avila199817@gmail.com",
  username: "avila199817",
});
const emailPresentation = resolveAvatarPresentation({
  name: "CRISTIAN AVILA LUQUE",
  email: "AVILA199817@GMAIL.COM",
});

assert.equal(presentation.seed, "email:avila199817@gmail.com");
assert.equal(presentation.initials, "CL");
assert.equal(presentation.tone, 18);
assert.equal(presentation.colorKey, "rust");
assert.equal(presentation.color, "#8E562E");
assert.equal(presentation.seed, emailPresentation.seed);
assert.equal(presentation.tone, emailPresentation.tone);
assert.equal(presentation.color, emailPresentation.color);
assert.equal(presentation.fingerprint, emailPresentation.fingerprint);
assert.ok(presentation.tone >= 0 && presentation.tone < AVATAR_TONE_COUNT);
assert.equal(AVATAR_TONE_COUNT, 20);

console.log(
  "Incidencias comment avatar contract OK · global AvatarSystem · stable user tone · Fluent Persona palette"
);