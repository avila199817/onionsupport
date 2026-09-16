# Barrido · superficie exportada de la vista de Servidor · 2026-09-16

## Problema

`src/views/server` exportaba 149 nombres; 22 no tenían ningún consumidor fuera de su módulo: 16 se usaban sólo dentro (constantes de versión y origen, el intervalo de refresco, las acciones del controlador expuestas ya por el objeto `ServidorView`, el coste y su observabilidad) y 6 no se usaban en ningún sitio (`SERVIDOR_MODULE_NAME`, `SERVER_MODULE_NAME`, `SERVIDOR_VIEW_NAME`, `SERVER_VIEW_NAME`, `SERVER_INDEX_VERSION`, `getActiveServerController`).

## Causa raíz

Exportar por costumbre: cada helper nacía con `export` por si alguien lo necesitaba, y los alias de nombre se conservaron cuando dejaron de tener consumidores.

## Cambio

- Clase A (el `export` sobra, el símbolo sigue): `SERVIDOR_CANONICAL_PATH`, `SERVIDOR_INDEX_VERSION`, `SERVIDOR_INDEX_SOURCE`, `SERVER_REFRESH_INTERVAL_MS`, `loadServerSnapshotPublic`, `startServerLive`, `stopServerLive`, `toggleServerLive`, `copyServerJson`, `copyServerDetail`, `getServerRouteDebug` (vista); `SERVER_COST_CACHE_TTL_MS`, `fetchServerCostsRequest`, `loadServerCosts`, `refreshServerCosts` (API); `renderCostObservability` (plantilla). Todas siguen expuestas por el objeto público del módulo donde lo estaban (`ServidorView`, el `export default` de la API).
- Clase B (muerto, se retira): las cinco constantes de nombre y `getActiveServerController`.
- Verificación por nombre antes de tocar: ninguna referencia estática ni por cadena en `src`, `tools`, `.github`, `docs`, los HTML, `vite.config.js` ni `package.json` (acceso dinámico, registros, fixtures y contratos de dist incluidos).
- `tools/export-surface-contract.mjs` (en `check:dist`): en los directorios barridos, toda exportación tiene un consumidor fuera de su módulo (importación estática o referencia por nombre en el repositorio). Cota que sólo crece: `SWEPT_DIRECTORIES = ["src/views/server"]`. Prueba negativa: volver a exportar una constante interna hace fallar el contrato.

## Métricas

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/views/server` | 149 | 127 |
| Funciones en `src/views/server` | 88 | 87 (`getActiveServerController` fuera) |
| Líneas de `src` | | +16 / −29 |
| Ficheros borrados | | 0 |
| Alias sin consumidor retirados | | 5 constantes de nombre |
| Chunk `server` | 73331 B | 72797 B (−534 B) |
| Cierres `app` / `auth` / `bootstrapPublicHome` | 156124 / 62996 / 216281 | sin cambio |
| Comportamiento | | sin cambio (ningún consumidor existía) |
| Contratos añadidos | | 1 (`export-surface-contract`, cota creciente) |

## Riesgo

Bajo: sólo desaparecen nombres que nadie referenciaba; el objeto público de la vista y el `export default` de la API no cambian. Si un módulo futuro necesita uno de los símbolos internos, lo exporta y añade su importador: el contrato sólo exige que exista el consumidor.
