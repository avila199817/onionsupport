import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const owners = [
  'src/analytics/google-tag.js',
  'src/features/entity-overlay/index.js',
  'src/features/facturas-paid-confirm/index.js',
  'src/features/incidencias-technician-profile/index.js',
  'src/features/incidencias-video-preview/core.js',
  'src/views/clientes/clientes.index.legacy.js',
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
console.log(`Modal authority contract: PASS (${owners.length} domain owners share lifecycle)`);
