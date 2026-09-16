# Barrido · superficie exportada de Incidencias · 2026-09-16

## Problema

`src/views/incidencias` exportaba 191 nombres. Veintiséis no tenían consumidor fuera de su módulo: 25 se usaban sólo dentro del suyo y 1 no se usaba en ningún sitio.

## La fachada, y por qué no basta con «nadie lo importa»

Este dominio no es como los anteriores: `incidencias.api.js` es una fachada que hace `export * from "./incidencias.api.impl.js"` y además difunde el objeto por defecto de la implementación (`...(Impl.default || {})`). Eso significa dos cosas, y las dos se comprobaron antes de tocar nada:

1. **Todo lo que la implementación exporta, la fachada lo reexporta.** Retirar un `export` de la implementación estrecha la superficie de la fachada, así que había que demostrar que ningún módulo importa ese nombre **de la fachada**, no sólo de la implementación. La verificación busca el nombre en todo el repositorio, no el `import` concreto, de modo que un consumidor por la fachada habría aparecido igual.
2. **El objeto por defecto no cambia.** Ocho de los quince nombres retirados de la implementación (`loadIncidencias`, `createIncidenciaRequest`, `commentIncidenciaRequest`, `reopenIncidenciaRequest`, `uploadIncidenciaAttachmentsRequest`, `loadIncidenciasStats`, y los que éstos usan) siguen figurando como propiedades de ese objeto. `src/views/home/home.api.js` importa exactamente ese objeto por defecto, así que `IncidenciasApi.<nombre>` sigue existiendo y comportándose igual: lo que desaparece es la exportación **por nombre**, que nadie usaba.

Se buscó además acceso por corchetes (`Impl[…]`, `IncidenciasApi[…]`) en todo `src`: no existe ninguno, así que no hay consumo por nombre construido en tiempo de ejecución. El único uso real de la Home es `IncidenciasApi.listIncidencias`, que se conserva exportado.

Es la lección de `createSidebarFooter` en la unidad anterior aplicada por adelantado: «sin consumidor detectado» no equivale a «muerto».

## Cambio

**Clase A** (sobra el `export`, el símbolo sigue vivo y con usos internos comprobados uno a uno) — 25 nombres:

- `incidencias.api.impl.js` (15): `INCIDENCIAS_ENDPOINT`, `USERS_SEARCH_LIMIT`, `USERS_SEARCH_MIN_LENGTH`, `INCIDENCIAS_TIMEOUT`, `INCIDENCIAS_DETAIL_TIMEOUT`, `INCIDENCIAS_UPLOAD_TIMEOUT`, `INCIDENCIAS_DETAIL_CACHE_TTL_MS`, `loadIncidencias`, `createIncidenciaRequest`, `closeIncidenciaRequest`, `commentIncidenciaRequest`, `reopenIncidenciaRequest`, `uploadIncidenciaAttachmentsRequest`, `getIncidenciaAttachmentFileRequest`, `loadIncidenciasStats`.
- `incidencias.filter-facets.js` (4): `INCIDENCIAS_FILTER_FACETS_VERSION`, `INCIDENCIAS_FILTER_FACET_KEYS`, `normalizeIncidenciasFilterFacet`, `getIncidenciasFacetTotal`.
- `incidencias.template.modal.js` (2): `INCIDENCIAS_DETAIL_COMMENTS_UI_VERSION`, `INCIDENCIAS_DETAIL_AVATAR_UI_VERSION` — siguen emitiéndose como atributos `data-` del DOM, que es su contrato real.
- Uno en cada uno de: `incidencias.detail-attachment-policy.js` (`INCIDENCIAS_DETAIL_ATTACHMENT_LIMITS`), `incidencias.detail-integrity.js` (`INCIDENCIAS_DETAIL_INTEGRITY_RETRY_DELAYS_MS`), `incidencias.priority-policy.js` (`INCIDENCIAS_HIGH_PRIORITY_KEYS`), `incidencias.template.js` (`INCIDENCIAS_TABLE_COLUMNS`).

**Clase B** (muerta, se retira) — 1 nombre: `incidenciaOptionLabel` en `incidencias.options.js`. Tres líneas sin un solo uso: no está en el objeto congelado que el módulo exporta por defecto, no aparece en `src`, `tools`, `.github`, `docs`, HTML ni en el `dist` construido, y su única mención en el repositorio era su propia declaración.

**Se conservan** los nombres que sí tienen consumidor fuera, incluidos los que sólo lo tienen en el tooling o en los contratos de CI: `INCIDENCIAS_API_VERSION` (lo lee `.github/ci/validate_spa_contracts.sh`), `USERS_SEARCH_ENDPOINT`, `INCIDENCIAS_LIST_LIMIT`, `INCIDENCIAS_CACHE_TTL_MS`, `INCIDENCIAS_DETAIL_CACHE_MAX_ENTRIES`, `INCIDENCIAS_LIST_RESPONSE_CONTRACT`, `normalizeIncidencia`, `searchIncidenciaUsers`, `fetchIncidenciasRequest`, `listIncidencias`, `loadIncidenciasPage`, `getIncidenciaByIdRequest`, `clearIncidenciasCache`, `hydrateIncidenciasFromCache` y el resto de los 165.

**Contrato**: `src/views/incidencias` entra en el `BASELINE` con 165. El contrato vigila ahora 471 exportaciones en 8 directorios.

## Métricas de la unidad

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/views/incidencias` | 191 | 165 |
| Exportaciones privatizadas (A) | | 25 |
| Funciones muertas eliminadas (B) | | 1 |
| Ficheros borrados | | 0 |
| Consumidores verificados | 26 nombres contra `src`, `tools`, `.github`, `docs`, HTML, `vite.config.js`, `package.json` | sin referencias |
| Imports dinámicos y acceso por cadena | `Impl[…]` / `IncidenciasApi[…]` buscados en todo `src` | no existe ninguno |
| Objeto público de la API | `Impl.default` difundido por la fachada | sin cambio |
| Comportamiento modificado | | no |
| Líneas de `src`, `dist` y cierres | | en la PR |

## Riesgo

Bajo. No hay cambios de importes, de datos persistidos, de permisos ni de comportamiento: sólo desaparecen 25 nombres que nadie importaba y una función que nadie llamaba. El riesgo residual sería un consumidor por nombre construido en tiempo de ejecución sobre la fachada o sobre la implementación; se buscó explícitamente y no existe.
