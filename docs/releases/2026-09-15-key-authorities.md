# Claves de comparación con autoridad: `normalizeKey` compacta y `slugKey` · 2026-09-15

## Qué cambia

- `normalizeKey` nombraba dos comportamientos incompatibles: en el kernel (`core`, `http`, `router`, `media`, sidebar, shared público) la clave compacta (`quita -_espacios + minúsculas`, acentos intactos) y en 24 módulos de vista la clave slug (NFD sin acentos, `_` por espacios y guiones, fuera todo salvo `\w:.`). Ahora son dos nombres y dos autoridades.
- `src/core/presentation-text.js` exporta también `normalizeKey(value)` (compacta); las 6 copias del kernel la importan (la de la sidebar estaba muerta y desaparece).
- `src/core/slug-key.js` exporta `slugKey(value)`; los 24 módulos con la copia literal la importan y renombran sus 148 llamadas (`normalizeKey`/`key` → `slugKey`), incluidas las formas callback (`.map(slugKey)`).
- Seis módulos importaban `cleanText` con alias (`as text`, `as safeText`) desde la primera unidad; ahora la importan con su nombre y renombran 127 llamadas. El contrato prohíbe los alias de las autoridades.
- `tools/presentation-text-contract.mjs`: `normalizeKey` se define en la autoridad de texto y sólo cuatro helpers de vista con política slug propia conservan el nombre (lista como cota superior: perfil técnico con `@`, `facturas.template` y `facturas.template.modal.base` con `_` por caracteres no válidos, base de plantillas de Home con `slice(0, 80)`); `slugKey` se define una vez; ningún módulo construye un slug inline salvo los 16 listados (cota superior para la siguiente unidad); comportamiento de ambas claves con ejemplos.
- Docs: dos filas en `FRONTEND_SHARED_SYSTEMS.md`.

## Por qué la compacta va con `cleanText` y la slug en su propio módulo

La compacta la usan `core`, `http` y `router`: en `presentation-text.js` viaja en el chunk que los tres cierres ya cargan y sustituye seis copias (neto negativo). La slug sólo la usan vistas diferidas: como módulo propio es un chunk fuera de los cierres de arranque; dentro de `presentation-text.js` habría añadido ~160 bytes a `auth` y a la Home pública, que hoy tienen 267 y 281 bytes de margen.

## Comportamiento

Sin cambio. 75 comprobaciones de equivalencia (nulos, números, cadenas con separadores, acentos, japonés, objetos con `toString`, arrays, forma callback de `map`): la compacta coincide con sus dos formas y la slug con la forma literal de los 24 módulos. Las cuatro variantes de vista conservan su cuerpo y su salida.

## Cierres de arranque

Frente a main 2592f434: app 157421 → 157355 (−66), auth 63796 → 63733 (−63), bootstrapPublicHome 218315 → 218219 (−96). Techos 158000 / 64000 / 218500. Chunks diferidos: clientes −627, cuenta −287, empleados −106.

## Métricas

30 copias retiradas (6 compactas, 24 slug), 6 alias eliminados, 2 autoridades (una nueva), 34 ficheros, unas 300 líneas menos.
