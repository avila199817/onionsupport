# Guards de forma con autoridad: `core/objects.js` y `core/arrays.js` · 2026-09-15

## Qué cambia

- 114 definiciones locales del guard de objeto plano (`isObject`, `safeObject`, `object`, `obj`, `isObj`, `isPlainObject` en Cuenta) tenían una sola política: `value && typeof value === "object" && !Array.isArray(value)`. Ahora `src/core/objects.js` exporta `isObject(value)` y `safeObject(value, fallback = {})`, y los 77 módulos afectados las importan. Las copias que devolvían `null` por defecto (`facturas.api.alias-core`, `facturas.template.modal`, avatares e identidad de comentarios, experiencia e intake de la Home pública) pasan `null` explícito en sus 33 llamadas de un argumento; las demás conservan la llamada tal cual.
- 40 definiciones de array tenían dos políticas: estricta (27) y «array-like → `Array.from`» (11, formularios y modales). `src/core/arrays.js` exporta `safeArray` y `arrayFrom`; las copias array-like renombran sus 104 llamadas a `arrayFrom`. Dos helpers con otra política se conservan: `array` de `incidencias-media-preview` (iterables) y `toArray` de la Home pública (descarta falsy).
- `home.template.foundation.js` reexporta en vivo `isObject` y `safeArray` para las ocho plantillas de Home, como ya hacía con `cleanText` y `escapeHtml`.
- `main.js` conserva su `isObject`: la entrada no puede importar módulos compartidos (abajo). `http.isPlainObject` compone `isObject` con su comprobación de prototipo.
- `tools/shape-guards-contract.mjs` (en `check:dist`): comportamiento de las copias retiradas, un definidor por nombre (`main.js` exento para `isObject`), ningún módulo con el idioma de objeto plano fuera de la autoridad, toda llamada importa su autoridad, y `main.js` y `analytics/google-tag.js` no importan ningún módulo compartido de helpers.
- Docs: dos filas en `FRONTEND_SHARED_SYSTEMS.md`.

## Por qué dos módulos y por qué la entrada queda fuera

Con un único módulo, rolldown lo pliega en el chunk `user-identity` (que el kernel importa) y la coerción de arrays viaja en el cierre `auth`: 64058 bytes contra un techo de 64000. Separando los guards de objeto de los de array, `arrays` es un chunk propio de 204 bytes fuera de los cierres de arranque. Importar el módulo desde `main.js` lo pliega en el chunk de entrada y todo el kernel pasa a importar `main` (y con él `google-tag`): `auth` subía a 102979 bytes. Medido en prototipo antes de la unidad.

## Comportamiento

Sin cambio. Tanda de equivalencia de 288 comprobaciones (nulos, escalares, cadenas, arrays, objetos planos y sin prototipo, array-likes con `length` válido, negativo, enorme o textual, `Map`, `Set`, funciones, fechas, expresiones regulares, símbolos, `BigInt`, `Uint8Array`) para las tres formas del predicado, las cuatro formas de `safeObject`, `safeArray` y las dos formas array-like; identidad de referencia conservada.

## Cierres de arranque

Frente a main 4381ea90: app 157443 → 157421 (−22), auth 63835 → 63796 (−39), bootstrapPublicHome 218291 → 218315 (+24: lista de precarga del chunk `arrays`). Techos 158000 / 64000 / 218500. Chunks diferidos: clientes −726, incidencias y facturas también bajan (detalle en la PR).

## Métricas

154 definiciones locales retiradas (114 + 40), 2 módulos de autoridad, 79 módulos de `src` tocados, 638 líneas menos en total (86 ficheros, +598/−1236).
