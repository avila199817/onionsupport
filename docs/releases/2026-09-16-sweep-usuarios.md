# Barrido · superficie exportada de Usuarios · 2026-09-16

## Problema

`src/views/usuarios` exportaba 234 nombres, la superficie más ancha del barrido. Setenta y cuatro no tenían consumidor fuera de su módulo: 65 se usaban sólo dentro del suyo y 9 no se usaban en ningún sitio.

## Una forma de exportación que las unidades anteriores no tenían

Casi todos los nombres se exportan en su declaración (`export const`, `export function`), pero `usuarios.template.js` tiene además una lista local al final del fichero:

```js
export {
  normalizeSortOrder,
  sessionStartTimestamp,
  sortBySessionStart,
};
```

Ahí la declaración es privada y **la exportación es la entrada de la lista**, así que privatizar `sessionStartTimestamp` significa retirar esa línea, no una palabra `export` que no existe. La herramienta del barrido abortó al no encontrar la declaración —correctamente, en lugar de adivinar— y se amplió para tratar este caso de forma explícita. `normalizeSortOrder` y `sortBySessionStart` sí tienen consumidor y siguen en la lista.

## Cambio

**Clase A** (sobra el `export`, el símbolo sigue vivo) — 65 nombres: 36 en `index.js`, 8 en `usuarios.template.modal.js`, 7 en `usuarios.api.js`, 6 en `usuarios.cursor.js`, 5 en `usuarios.template.js` (uno de ellos por lista) y 3 en `usuarios.template.create.js`.

**Clase B** (muertos, se retiran) — 9 nombres: `USUARIOS_MODULE_VERSION` e `initCreate` en `index.js`; `USUARIOS_CREATE_API_VERSION` en `usuarios.template.create.js`; `USUARIOS_TABLE_TEMPLATE_VERSION`, `USUARIOS_VIEW_TEMPLATE_VERSION`, `USUARIOS_TABLE_ACTIONS` y `USUARIOS_DEFAULT_PAGE_SIZE` en `usuarios.template.js`; `renderUsuarioDetailModal` y `renderUsuarioDetailModalClosed` en `usuarios.template.modal.js`.

`initCreate` era `export const initCreate = openCreate;`: el mismo patrón de alias de compatibilidad sin llamador que en Clientes. `openCreate` no se toca.

## Verificación previa a borrar

Las plantillas de Usuarios están vigiladas por contratos que leen el fichero como texto o lo cargan en una página real (`private_create_modal_contract.py`, `modal_authority_contract.mjs`, `modal_lifecycle_contract.mjs`, `usuarios_scale_contract.py`, `usuarios_session_order_contract.mjs`, `avatar_system_contract.mjs`, `private-owner-modal-browser-contract.mjs`). Por eso, para las dos únicas funciones con cuerpo que se borran se extrajo el cuerpo y se comprobó que no fuera **portador exclusivo** de ningún fragmento estructural (`renderModalShell(`, `renderModalCloseButton(`, `height: "auto"`, `ui-detail-modal`, `usr-detail`): no lo era ninguna. Los demás siete nombres son constantes sin lector.

**Contrato**: `src/views/usuarios` entra en el `BASELINE` con 160. El contrato vigila ahora 886 exportaciones en 11 directorios.

## Métricas de la unidad

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/views/usuarios` | 234 | 160 |
| Exportaciones privatizadas (A) | | 65 |
| Nombres muertos eliminados (B) | | 9 |
| Ficheros borrados | | 0 |
| Consumidores verificados | 74 nombres contra `src`, `tools`, `.github`, `docs`, HTML, `vite.config.js`, `package.json` | sin referencias |
| Comportamiento modificado | | no |
| Líneas de `src`, `dist` y cierres | | en la PR |

## Riesgo

Bajo. No cambia ningún comportamiento, ningún dato persistido ni ningún permiso: la ACL de usuarios vive en el backend y esta unidad no toca ninguna decisión de autorización. El único punto delicado era la lista de exportación, y se trató de forma explícita en lugar de por aproximación.
