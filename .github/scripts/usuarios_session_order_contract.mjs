import assert from "node:assert/strict";
import fs from "node:fs";

import {
  renderUsuariosTableTemplate,
  sortBySessionStart,
} from "../../src/views/usuarios/usuarios.template.js";

const users = [
  {
    id: "U-NEVER",
    userId: "U-NEVER",
    username: "never",
    displayName: "Nunca",
    createdAt: "2026-09-07T08:00:00.000Z",
    active: true,
    emailVerified: true,
    lastLoginAt: null,
  },
  {
    id: "U-OLD",
    userId: "U-OLD",
    username: "old",
    displayName: "Anterior",
    createdAt: "2026-09-07T08:01:00.000Z",
    active: true,
    emailVerified: true,
    lastLoginAt: "2026-09-07T09:00:00.000Z",
  },
  {
    id: "U-NEW",
    userId: "U-NEW",
    username: "new",
    displayName: "Reciente",
    createdAt: "2026-09-07T08:02:00.000Z",
    active: true,
    emailVerified: true,
    lastLoginAt: "2026-09-07T10:00:00.000Z",
  },
];

assert.deepEqual(
  sortBySessionStart(users, "desc").map((user) => user.id),
  ["U-NEW", "U-OLD", "U-NEVER"],
  "default session ordering must be newest login first and never-login last"
);

assert.deepEqual(
  sortBySessionStart(users, "asc").map((user) => user.id),
  ["U-OLD", "U-NEW", "U-NEVER"],
  "ascending session ordering must keep never-login rows at the bottom"
);

const html = renderUsuariosTableTemplate({
  items: users,
  admin: true,
  state: {
    sortOrder: "desc",
    refreshing: true,
    loadingMore: true,
    searchPending: true,
    hasMore: true,
    totalKnown: false,
    lastSyncAt: Date.now(),
  },
});

const newestPosition = html.indexOf('data-user-id="U-NEW"');
const oldestPosition = html.indexOf('data-user-id="U-OLD"');
const neverPosition = html.indexOf('data-user-id="U-NEVER"');

assert.ok(
  newestPosition >= 0 && oldestPosition > newestPosition && neverPosition > oldestPosition,
  "rendered table must follow session-start DESC order"
);

assert.match(
  html,
  /data-usuarios-action="sort-toggle"[\s\S]*?Inicio sesión ↓/,
  "users view must expose the date/session ordering control"
);

assert.match(
  html,
  />Nunca</,
  "users without a session must be labeled as Nunca"
);

for (const forbiddenVisibleLoader of [
  "Actualizando usuarios...",
  "Cargando más usuarios...",
  "Preparando la búsqueda de usuarios...",
  "usuarios-refresh-overlay",
]) {
  assert.ok(
    !html.includes(forbiddenVisibleLoader),
    `loaded users view must not expose refresh loader: ${forbiddenVisibleLoader}`
  );
}

const indexSource = fs.readFileSync("src/views/usuarios/index.js", "utf8");

assert.match(
  indexSource,
  /const keepVisibleRows = items\.length > 0 && \(silent === true \|\| keepAccumulatedPages\);/,
  "silent first-page revalidation must keep current rows visible"
);

assert.match(
  indexSource,
  /case ACTIONS\.SORT_TOGGLE:[\s\S]*?toggleSortOrder/,
  "controller must own the session sort toggle"
);

assert.match(
  indexSource,
  /sortField:\s*"lastLoginAt"/,
  "controller state must identify lastLoginAt as the visual sort field"
);

console.log(
  "Usuarios session order contract OK · newest session first · silent stale-while-revalidate"
);
