# Barrido · superficie exportada de Facturas · 2026-09-16

## Problema

`src/views/facturas` exportaba 202 nombres. Cuarenta y nueve no tenían consumidor fuera de su módulo: 48 se usaban sólo dentro del suyo y 1 era un alias muerto.

## La cadena de reexportación, y dónde está de verdad

Este dominio encadena reexportaciones como Incidencias, pero con una trampa de lectura: `facturas.api.js` parece hacer `import * as Base` y `export * from "./facturas.api.base.js"` en sus líneas 41-42, y **no lo hace**: esas líneas están dentro de un bloque `/* … */`, un «manifiesto de delegación» en comentario. La reexportación real es `facturas.api.boundary.js:15`. Se comprobó antes de clasificar nada, porque de ello depende qué módulo expone qué.

El efecto es el mismo que en Incidencias: lo que `facturas.api.base.js` exporta sube por la cadena hasta la fachada. Por eso la verificación busca cada nombre **en todo el repositorio**, no un `import` concreto: un consumidor que entrara por la fachada habría aparecido igual. Ninguno de los 48 aparece fuera de su propio módulo, y no existe acceso por corchetes (`Base[…]`, `FacturasApi[…]`) en todo `src`.

## Cambio

**Clase A** (sobra el `export`, el símbolo sigue vivo) — 48 nombres:

| Módulo | Nombres |
| --- | --- |
| `facturas.api.base.js` | 31 |
| `facturas.template.create.js` | 5 |
| `facturas.template.modal.base.js` | 4 |
| `facturas.template.js` | 3 |
| `index.js` | 2 |
| `facturas.api.boundary.js`, `facturas.api.canonical.js`, `facturas.api.js` | 1 cada uno |

Los 31 de `facturas.api.base.js` son la versión de la API, los endpoints y sus constructores, los siete tiempos de espera, los límites de paginación, los normalizadores de identificador, de incidencia, de estadísticas, de envío y de payload, dos peticiones y tres lectores (`hasFacturaIncidencia`, `getFacturaAmount`, `resolveFacturaPdfFilename`) más su snapshot. Los de plantilla son fragmentos que sus propias plantillas componen; `renderMiniMeta` sola acumula 19 usos internos.

**Clase B** (muerto, se retira) — 1 nombre: `FacturasIndex`, un alias `export const FacturasIndex = FacturasView;` en el fichero de entrada de la ruta. Su única mención en el repositorio era esa línea. El router resuelve `/facturas` con `names: ["FacturasView"]`, y tanto `FacturasView` como `export default FacturasView` quedan intactos.

**Se conservan** los 153 restantes, incluidos los que sólo consume el tooling o los contratos de CI (`FACTURA_CANONICAL_ALIAS_VERSION`, `isFacturaTechnicalRecord`, `loadFacturasStats`, `clearFacturasCache`, `hydrateFacturasFromCache`…).

## Nada de esto toca dinero

Conviene decirlo explícitamente por ser el dominio fiscal: **no cambia ningún importe, ninguna precisión, ningún redondeo, ningún formato aceptado, ningún comportamiento fiscal, ningún valor persistido y ningún importe mostrado**. Retirar la palabra `export` de `getFacturaAmount` no altera lo que `getFacturaAmount` calcula ni quién lo llama: sus llamadores están en el mismo módulo y siguen llamándolo igual. Las autoridades monetarias (`core/amounts.js`, `core/format.js`) no se tocan.

**Contrato**: `src/views/facturas` entra en el `BASELINE` con 153. El contrato vigila ahora 624 exportaciones en 9 directorios.

## Métricas de la unidad

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/views/facturas` | 202 | 153 |
| Exportaciones privatizadas (A) | | 48 |
| Alias muerto eliminado (B) | | 1 |
| Ficheros borrados | | 0 |
| Consumidores verificados | 49 nombres contra `src`, `tools`, `.github`, `docs`, HTML, `vite.config.js`, `package.json` | sin referencias |
| Acceso por cadena o corchetes | buscado en todo `src` | no existe |
| Comportamiento modificado | | no |
| Líneas de `src`, `dist` y cierres | | en la PR |

## Riesgo

Bajo y acotado a la superficie: desaparecen 48 nombres que nadie importaba y un alias que nadie usaba. Ninguna función se borra, ninguna firma cambia, ningún cálculo se toca.
