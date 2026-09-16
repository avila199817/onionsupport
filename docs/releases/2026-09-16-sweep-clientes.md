# Barrido · superficie exportada de Clientes y alias de compatibilidad muertos · 2026-09-16

## Problema

`src/views/clientes` exportaba 170 nombres. Sesenta y ocho no tenían consumidor fuera de su módulo: 44 se usaban sólo dentro del suyo y **24 no se usaban en ningún sitio**. Es la unidad con más código realmente muerto del barrido hasta ahora.

Buena parte de esos 24 está agrupada bajo cabeceras `COMPAT ALIASES` en las plantillas: alias que renombraban una función viva y que quedaron sin llamador cuando el detalle de Clientes dejó de calcar los nombres de Incidencias (U12). Tres nombres para la misma composición del alta —`renderClientesCreateModal` (viva), `renderCreateClienteModal` y `renderClienteCreateModal` (muertas)— son el ejemplo exacto de «una semántica, varios nombres».

## Verificación previa a borrar

Estas plantillas están vigiladas por contratos que leen el fichero **como texto**, no sólo por importación:

- `.github/scripts/private_create_modal_contract.py` exige en `clientes.template.create.js` once fragmentos literales (`renderModalShell(`, `renderModalCloseButton(`, `height: "auto"`, las clases canónicas `cli-create-*` / `inc-create-*`…) y prohíbe otros dos.
- `tools/modal-shell-contract.mjs` lista `clientes.template.create.js` y `clientes.template.modal.js` como consumidores del shell canónico.
- `tools/presentation-text-contract.mjs` importa `renderClientesCreateModal` y la ejecuta; `tools/private-kpi-contract.mjs` importa `renderClientesTemplate`; `tools/private-owner-modal-browser-contract.mjs` carga `clientes.template.modal.js` en una página real.

Por eso, antes de borrar, se comprobó para cada uno de los 24 nombres si su cuerpo era **el único portador** de alguno de esos fragmentos literales, extrayendo el cuerpo y buscando el fragmento en el resto del fichero. **Ninguno lo era**: los once fragmentos siguen presentes en funciones vivas. Los cuatro módulos afectados siguen importados y vivos; lo que desaparece son exportaciones sueltas dentro de ellos, no ficheros.

## Cambio

**Clase A** (sobra el `export`, el símbolo sigue vivo) — 44 nombres: 23 en `clientes.api.js`, 8 en `index.js`, 6 en `clientes.template.js`, 5 en `clientes.template.modal.js`, 1 en `clientes.template.create.js` y 1 en `clientes.create-controller.js`.

**Clase B** (muertos, se retiran) — 24 nombres: 7 en `clientes.template.create.js`, 6 en `clientes.template.js`, 6 en `clientes.template.modal.js`, 4 en `index.js` y 1 en `clientes.api.js`. Entre ellos los cuatro alias de compatibilidad (`validateCreateClienteForm`, `getClientesCreateFormDefaults`, `renderCreateClienteModal`, `renderClienteCreateModal`), los dos «modal cerrado» que devolvían cadena vacía, `renderClienteDetailModal`, `getClienteDetailId`, `getClienteDetailContact`, las constantes de versión y de acciones sin lector y `CLIENTES_LIST_LIMIT`.

`renderCreateModal`, que sí tiene consumidor, **se conserva** aunque esté en el mismo bloque de alias: la unidad retira lo muerto, no el bloque.

**Contrato**: `src/views/clientes` entra en el `BASELINE` con 102. El contrato vigila ahora 726 exportaciones en 10 directorios.

## Métricas de la unidad

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/views/clientes` | 170 | 102 |
| Exportaciones privatizadas (A) | | 44 |
| Nombres muertos eliminados (B) | | 24 |
| Ficheros borrados | | 0 |
| Consumidores verificados | 68 nombres contra `src`, `tools`, `.github`, `docs`, HTML, `vite.config.js`, `package.json` | sin referencias |
| Fragmentos literales de contrato | 11 exigidos en `clientes.template.create.js` | ninguno lo portaba en exclusiva un nombre muerto |
| Comportamiento modificado | | no |
| Líneas de `src`, `dist` y cierres | | en la PR |

## Riesgo

Bajo, pero es la unidad con más borrado real, así que la comprobación fue más estricta: además del barrido de nombres por todo el repositorio y de la ausencia de acceso por corchetes, se verificó que ningún cuerpo eliminado sostuviera un fragmento exigido por los contratos de texto, y la batería de navegador cubre el alta y el detalle de Clientes en una página real.
