# Barrido · superficie exportada de la Home y baseline no creciente del contrato · 2026-09-16

## Problema

Dos cosas en la misma unidad:

1. `src/views/home` exportaba 88 nombres; 13 no tenían consumidor fuera de su módulo (8 usados sólo dentro, 5 sin usar en ningún sitio).
2. El contrato de superficie exportada sólo comprobaba «toda exportación tiene consumidor» y llevaba una lista creciente de directorios barridos. Eso impide que reaparezca una exportación muerta, pero no impide que la superficie pública **crezca** por descuido: un `export` nuevo con un consumidor cualquiera pasaba sin decisión.

## Cambio

**Home** (unidad 5 del barrido, mismo método y verificación que las anteriores: importadores estáticos más referencias por nombre en `src`, `tools`, `.github`, `docs`, HTML, `vite.config.js` y `package.json`, con los imports dinámicos de los contratos de navegador incluidos):

- Clase A (sobra el `export`, el símbolo sigue): `HOME_API_VERSION`, `HOME_LIST_LIMIT`, `getHomeApiSnapshot`, `HomeApi` (API), `HOME_ONBOARDING_VERSION`, `canonicalIconName` (base de plantilla), `HOME_INDEX_VERSION`, `HOME_VIEW_VERSION`.
- Clase B (muertas, se retiran): `getHomeOnboardingSnapshot`, `renderHomeLoadingState`, `loadHome`, `clearHomeViewCache`, `clearHomeDom`. Ninguna aparecía en el objeto público de su módulo ni en ningún otro sitio: su única mención era su propia declaración.

**Contrato** (`tools/export-surface-contract.mjs`): dos invariantes, una por columna del baseline.

- Toda exportación de un directorio barrido tiene consumidor fuera de su módulo (lo de antes).
- El número de exportaciones de cada directorio barrido **es igual a su baseline autorizado**. La regla real es no aumentar la superficie pública por accidente: una funcionalidad que necesite de verdad una exportación nueva sube el baseline en el mismo commit, deliberadamente, y un barrido que retira exportaciones lo baja en el mismo commit. El número es el registro de una decisión, no un objetivo arquitectónico: se espera que se mueva.

Baseline inicial: sidebar 7, topbar 10, Correo 25, Cuenta 53, Home 75, Servidor 127, WhatsApp 9 (306 exportaciones vigiladas).

Pruebas negativas: bajar un baseline sin tocar el código falla con «creció la superficie»; subirlo sin tocar el código falla con «encogió: baja el baseline en este commit». La primera versión del baseline de esta unidad llevaba WhatsApp a 10 y el propio contrato lo corrigió a 9.

## Métricas de la unidad

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/views/home` | 88 | 75 |
| Exportaciones privatizadas (A) | | 8 |
| Funciones muertas eliminadas (B) | | 5 |
| Líneas de `src` | | +8 / −59 |
| Ficheros borrados | | 0 |
| Consumidores verificados | 13 nombres contra `src`, `tools`, `.github`, `docs`, HTML, `vite.config.js`, `package.json` | sin referencias |
| Imports dinámicos comprobados | `avatar_runtime_dom_contract` importa `home.template.relation.js` en una página real | ninguno de los 13 aparece |
| Comportamiento modificado | | no |
| Chunks y cierres | | en la PR |

## Riesgo

Bajo: sólo desaparecen nombres sin referencias; el objeto público de la vista y su ruta no cambian. El contrato es ahora más estricto (una exportación nueva exige subir el baseline a conciencia), lo que puede requerir actualizar el número en una funcionalidad futura: es justo la decisión explícita que se busca.
