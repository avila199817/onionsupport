import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const owners = [
  'src/analytics/google-tag.js',
  'src/features/entity-overlay/index.js',
  'src/features/entity-overlay/modal-confirmation.js',
  'src/features/facturas-paid-confirm/index.js',
  'src/features/incidencias-technician-profile/index.js',
  'src/features/incidencias-video-preview/core.js',
  'src/views/clientes/clientes.create-controller.js',
  'src/views/clientes/clientes.template.modal.js',
  'src/views/usuarios/usuarios.template.create.js',
  'src/views/usuarios/usuarios.template.modal.js',
  'src/views/incidencias/index.impl.js',
  'src/views/facturas/index.js',
  'src/views/correo/index.js',
];
for (const path of owners) {
  const source = await readFile(new URL(path, root), 'utf8');
  assert.match(source, /import\s*\{[^}]*createModalLifecycle[^}]*\}\s*from\s*["'][^"']*modal-lifecycle\.js["']/, `${path}: use the shared modal lifecycle`);
  assert.doesNotMatch(source, /function\s+(?:trap(?:Modal|Viewer|Dialog)?Focus|(?:get)?[Ff]ocusable(?:Elements|Nodes|DialogElements))\s*\(/, `${path}: local focus trap duplicates the shared authority`);
  assert.doesNotMatch(source, /(?:document\.body|body)\.style\.overflow\s*=/, `${path}: local scroll lock bypasses modal ownership`);
  assert.doesNotMatch(source, /classList\.(?:toggle|add|remove)\(\s*["']modal-open["']/, `${path}: shared modal-open class must have one owner registry`);
}
const domOwners = [
  'src/features/facturas-paid-confirm/index.js',
  'src/features/incidencias-technician-profile/index.js',
  'src/views/clientes/clientes.create-controller.js',
  'src/views/clientes/clientes.template.modal.js',
  'src/views/usuarios/usuarios.template.create.js',
  'src/views/usuarios/usuarios.template.modal.js',
  'src/views/incidencias/index.js',
  'src/views/facturas/index.js',
  'src/views/correo/index.js',
];
for (const path of domOwners) {
  const source = await readFile(new URL(path, root), 'utf8');
  assert.match(source, /import\s*\{[^}]*(?:createModalHost|renderModalContent)[^}]*\}\s*from\s*["'][^"']*modal-host\.js["']/, `${path}: private mounting/rendering uses the shared DOM helper`);
}
const hostSource = await readFile(new URL('src/features/entity-overlay/modal-host.js', root), 'utf8');
assert.doesNotMatch(hostSource, /createModalLifecycle|addEventListener\(["']keydown|style\.overflow|new MutationObserver/, 'DOM helpers must not introduce another interaction/session authority');
console.log(`Modal authority contract: PASS (${owners.length} domain owners share lifecycle)`);
