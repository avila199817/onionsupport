# `parseAmount` y `round2`: la autoridad de importes en `core/amounts.js` · 2026-09-16

## Problema

Doce módulos tenían su propio parser de importes (`number` ×9, `num` en la lista de Incidencias, `numberOrNull` en el alias de la API y en el modal de Facturas): el mismo mecanismo de texto (quitar `€ $ £ ¥ %`, resolver miles y decimal por el último separador) repetido con pequeñas variaciones de tipo. Cuatro módulos de Facturas definían `round2` y la vista de Facturas repetía el redondeo a céntimos inline dos veces.

## Causa raíz

Cada módulo copiaba el parser al nacer; las copias coincidían en todas las cadenas y números y sólo diferían en qué hacer con booleanos y objetos, una diferencia que nadie había nombrado.

## Cambio

- `src/core/amounts.js`: `parseAmount(value = 0, fallback = 0, policy)` con el mecanismo de texto único y `AMOUNT_POLICIES` para lo que no es texto:
  - `coerced`: booleanos y objetos por `Number()` (`true` → 1, `[12]` → 12, `[]` y `Date(0)` → 0, `{}` → fallback). Modelo y modal de Clientes, API y lista de Incidencias.
  - `booleanDigit`: `true`/`false` → 1/0; objetos → fallback. API base, alta y base del modal de Facturas.
  - `textOnly`: booleanos y objetos → fallback. Lista, modal y alias de la API de Facturas, API de Home, modal de Incidencias.
  - `undefined` es 0, como declaraban las copias con `value = 0`. La API de Home (la única sin ese valor por defecto) nombra su blanco: `parseAmount(options.ttlMs ?? options.cacheTtlMs ?? null, HOME_CACHE_TTL_MS, textOnly)`; `numberOrNull` recibía siempre el resultado de `firstNonEmpty` (número, texto o `null`), nunca `undefined`.
- `round2(value)`: `Math.round((Number(value) + Number.EPSILON) * 100) / 100`. El alias de la API y el modal de Facturas lo importan; la API base y el alta de Facturas, que analizaban antes de redondear, componen `roundAmount(value) = round2(parseAmount(value, 0, booleanDigit))`; la vista de Facturas sustituye sus dos redondeos inline de IVA e IRPF por `round2`.
- 161 llamadas de `parseAmount` nombran su política como último argumento; `optionalNumber` del modal de Clientes compone la autoridad con fallback `NaN`.
- `tools/amounts-contract.mjs` (en `check:dist`): políticas congeladas y su forma, mecanismo de texto (es-ES y en-US, símbolos, espacios, signos, `1e3`, `.5`, `5,`, blancos, `1.5.5`), booleanos y objetos por política, `round2` (1,005 → 1,01; 2,675 → 2,68; texto con coma → `NaN`), un definidor por nombre, ningún módulo vuelve a quitar símbolos de moneda, a redondear con `Number.EPSILON` ni a definir `numberOrNull`, cada llamada pasa valor, fallback y una política nombrada, mapa de consumidores por política medido antes de migrar, consumidores de `round2` medidos, importación por nombre, `main.js` y analytics no importan el módulo. Prueba negativa: una copia de `round2` añadida a Agenda hace fallar el contrato.
- Docs: fila de importes y puntero desde la fila de números en `FRONTEND_SHARED_SYSTEMS.md`; cabecera de `core/numbers.js`.

## Comportamiento

Sin cambio en ningún valor que pueda llegar. Equivalencia de cada copia retirada (extraída de `HEAD`) frente a `parseAmount` con su política sobre 85 valores (números, `-0`, `2^53`, `1,005`, `NaN`, infinitos; cadenas es-ES y en-US con y sin miles, símbolos delante y detrás, espacio fino, signo menos Unicode, porcentajes, exponentes, hexadecimal, separadores repetidos, blancos; booleanos, arrays, objetos con `valueOf`, `Date` válida e inválida, `BigInt`, símbolo, función) × 7 fallbacks (`0`, `null`, `NaN`, `1`, `-1`, `30`, texto) y con un solo argumento; `optionalNumber` compuesto; los cuatro `round2` y los dos redondeos inline: 7.732 comprobaciones. Las únicas diferencias son símbolos y funciones en las tres copias que usaban `String(value)` para tipos exóticos (alta de Facturas y los dos `numberOrNull`): un símbolo hacía caer al fallback y ahora `Number()` lanza, y una función pasaba por su texto. Ningún importe puede ser un símbolo ni una función: `JSON.parse` no los produce y el DOM entrega cadenas. Las copias de Facturas coinciden en los 85 valores restantes con todos los fallbacks.

## Métricas

12 parsers y 4 `round2` + 2 inline → 1 autoridad (`parseAmount`, `round2`) con 3 políticas y 2 composiciones locales (`roundAmount`); 14 ficheros de `src` (13 migrados + la autoridad); líneas de `src`: véase la PR. Cierres de arranque: véase la PR.

## Riesgo

Bajo: mecanismo idéntico demostrado por equivalencia; las políticas reproducen exactamente cada copia; ningún cambio de precisión, redondeo, formato aceptado ni valor persistido. Cualquier módulo futuro que necesite importes importa la autoridad y nombra su política; el contrato impide una nueva copia.
