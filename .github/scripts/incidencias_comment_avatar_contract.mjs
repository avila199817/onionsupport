import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCommentIdentityIndex,
  commentAvatarIdentity,
  persistedCommentId,
  requesterIdentity,
  resolveCommentIdentity,
  resolveCommentProfile,
  stableCommentIdentity,
  technicianIdentity,
} from "../../src/features/incidencias-comment-identity/index.js";

import { getIncidenciasDetailComments } from "../../src/views/incidencias/incidencias.template.modal.js";

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
  /incidencias\.comment-identity\.v2-comment-id-user-authority/u
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
    /if \(comment\.persistedCommentId\) article\.dataset\.commentId = comment\.persistedCommentId/u,
    `${rendererPath} debe conservar la asociación al comentario cuando hay homónimos`
  );
  assert.match(
    rendererSource,
    /\[(?:comment|item)\.id, (?:comment|item)\.persistedCommentId, (?:comment|item)\.author, (?:comment|item)\.body, timestamp\(/u,
    `${rendererPath} debe invalidar la firma al cambiar autor o procedencia del ID`
  );
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

assert.equal(requesterIdentity({ createdByUserId: "admin-author", cliente: { id: "client-record" } }).userId, "");
for (const key of ["requesterSnapshot", "requester", "receptor", "cliente"]) {
  assert.equal(requesterIdentity({ [key]: { id: "CLI-1" } }).userId, "", `${key}.id is not a proven user ID`);
  assert.equal(requesterIdentity({ raw: { [key]: { id: "CLI-1" } } }).userId, "", `raw.${key}.id is not a proven user ID`);
}
assert.equal(requesterIdentity({ requesterUserId: "requester-user", createdByUserId: "admin-author" }).userId, "requester-user");
assert.equal(requesterIdentity({ raw: { requesterSnapshot: { userId: "requester-user", username: "@Requester" } } }).userId, "requester-user");
assert.equal(requesterIdentity({ raw: { requesterSnapshot: { userId: "requester-user", username: "@Requester" } } }).username, "requester");
assert.equal(requesterIdentity({ cliente: { id: "client-record", userId: "client-contact-user" } }).userId, "client-contact-user");
assert.equal(requesterIdentity({ user: { id: "user-record" } }).userId, "user-record");
assert.equal(technicianIdentity({ assignment: { technicianUserId: "assigned-user", username: "@Assigned" } }).userId, "assigned-user");
assert.equal(technicianIdentity({ assignment: { technicianUserId: "assigned-user", username: "@Assigned" } }).username, "assigned");
assert.equal(stableCommentIdentity({ by: "Visible Author", authorUserId: "author-user" }).userId, "author-user");
for (const by of ["Visible Author", "legacy@example.test", "ON-UNPROVEN-ID"]) {
  assert.equal(stableCommentIdentity({ by }).userId, "", "by escalar no acredita un ID de usuario");
}

for (const legacy of [{ byEmail: "b@example.test" }, { byEmail: "a@example.test" }, {}]) {
  const index = buildCommentIdentityIndex({ comments: [
    { byName: "Alex Gómez", byUserId: "user-a", byEmail: "a@example.test" },
    { byName: "Alex Gómez", ...legacy },
  ] });
  assert.equal(resolveCommentIdentity("Alex Gómez", index).ambiguous, true, "un registro sin UID no hereda el UID del homónimo, coincida el email o no");
  assert.equal(resolveCommentProfile("Alex Gómez", index, [{ name: "Alex Gómez", userId: "user-a", email: "a@example.test", src: "/photo.svg" }]), null);
  assert.equal(commentAvatarIdentity("Alex Gómez", resolveCommentIdentity("Alex Gómez", index)).userId, "");
}

{
  const index = buildCommentIdentityIndex({ comments: [
    { id: "known-event", byName: "Alex Gómez", byUserId: "user-a", byEmail: "a@example.test" },
    { id: "legacy-event", byName: "Alex Gómez", byEmail: "a@example.test" },
  ] });
  assert.equal(resolveCommentIdentity("Alex Gómez", index).ambiguous, true);
  assert.equal(commentAvatarIdentity("Alex Gómez", resolveCommentIdentity("Alex Gómez", index, "known-event")).userId, "user-a");
  assert.equal(commentAvatarIdentity("Alex Gómez", resolveCommentIdentity("Alex Gómez", index, "legacy-event")).userId, "");
}

{
  const live = { name: "Legacy Author", userId: "live-user", email: "legacy@example.test", username: "live", src: "/photo.svg" };
  const index = buildCommentIdentityIndex({ comments: [
    { byName: live.name, byEmail: live.email },
  ] });
  const identity = resolveCommentIdentity(live.name, index);
  const photoProfile = resolveCommentProfile(live.name, index, [live]);
  assert.equal(photoProfile, live, "la foto legacy puede coincidir inequívocamente por email");
  const aliases = commentAvatarIdentity(live.name, identity, photoProfile);
  assert.equal(aliases.userId, "", "coincidencia por email no acredita UID");
  assert.equal(aliases.username, "", "no se importan aliases del perfil por coincidencia legacy");
  assert.equal(resolveAvatarPresentation(aliases).seed, "email:legacy@example.test");
  assert.equal(resolveAvatarPresentation(commentAvatarIdentity(live.name, null, live)).seed, resolveAvatarPresentation({ name: live.name }).seed, "legacy por nombre conserva su fallback propio");
}

{
  const detail = { comments: [
    { byName: "First Person", byUserId: "user-a", body: "First body" },
    { id: "comment_0", byName: "Second Person", byUserId: "user-b", body: "Second body" },
  ] };
  const normalized = getIncidenciasDetailComments({ detail });
  assert.equal(normalized.length, 2, "un ID sintético de UI no elimina un comentario persistido con ese mismo texto");
  const first = normalized.find((item) => item.author === "First Person");
  const second = normalized.find((item) => item.author === "Second Person");
  assert.equal(first.id, "comment_0", "el ID de UI puede conservarse para firmas visuales");
  assert.equal(persistedCommentId(first), "");
  assert.equal(persistedCommentId(second), "comment_0");
  const index = buildCommentIdentityIndex(detail);
  assert.equal(resolveCommentIdentity(first.author, index, persistedCommentId(first)).userId, "user-a");
  assert.equal(resolveCommentIdentity(second.author, index, persistedCommentId(second)).userId, "user-b");
}

{
  const sharedEmail = "shared@example.test";
  const sameNameProfiles = profiles.map((profile) => ({ ...profile, name: "Alex Gómez", email: sharedEmail }));
  const index = buildCommentIdentityIndex({ comments: [
    { id: "requester-comment", byName: "Alex Gómez", byUserId: requester.userId, byEmail: sharedEmail },
    { id: "technician-comment", byName: "Alex Gómez", byUserId: technician.userId, byEmail: sharedEmail },
    { id: "third-comment", byName: "Alex Gómez", byUserId: "third-user", byEmail: sharedEmail },
  ] });
  assert.equal(resolveCommentProfile("Alex Gómez", index, sameNameProfiles), null, "homónimos sin asociación al comentario no toman un perfil prestado");
  assert.equal(resolveCommentProfile("Alex Gómez", index, sameNameProfiles, "requester-comment")?.userId, requester.userId);
  assert.equal(resolveCommentProfile("Alex Gómez", index, sameNameProfiles, "technician-comment")?.userId, technician.userId);
  assert.equal(resolveCommentProfile("Alex Gómez", index, sameNameProfiles, "third-comment"), null, "IDs distintos no se emparejan por compartir email");
  const third = commentAvatarIdentity("Alex Gómez", resolveCommentIdentity("Alex Gómez", index, "third-comment"));
  assert.equal(third.userId, "third-user", "el autor tercero conserva su identidad aunque no haya perfil con foto");
  assert.equal(third.src, undefined, "una identidad de comentario no inventa foto");
  assert.equal(resolveAvatarPresentation(third).seed, "user:third-user");
}

{
  const identity = { userId: "same-user", email: "old@example.test", username: "old-user" };
  const before = resolveAvatarPresentation(commentAvatarIdentity("Ana Prueba", identity, identity));
  for (const current of [
    { userId: identity.userId, email: "new@example.test", username: "new-user" },
    { userId: identity.userId, email: "", username: "" },
  ]) {
    const aliases = commentAvatarIdentity("Ana Prueba", identity, current);
    const after = resolveAvatarPresentation(aliases);
    assert.equal(aliases.email, current.email);
    assert.equal(aliases.username, current.username);
    assert.equal(after.fingerprint, before.fingerprint);
    assert.equal(after.tone, before.tone);
  }
  const index = buildCommentIdentityIndex({ comments: [
    { id: "before", byName: "Ana Prueba", byUserId: identity.userId, byEmail: identity.email },
    { id: "after", byName: "Ana Prueba", byUserId: identity.userId, byEmail: "new@example.test" },
  ] });
  assert.equal(resolveCommentIdentity("Ana Prueba", index).ambiguous, false, "un mismo UID con emails históricos distintos sigue siendo una persona");
}

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
