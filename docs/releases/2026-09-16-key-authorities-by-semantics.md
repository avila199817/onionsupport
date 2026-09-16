# Claves por semántica: `codeKey`, `recordKey`, `labelKey` y ningún `normalizeKey` ambiguo · 2026-09-16

## Qué cambia

- Dieciséis pipelines slug inline y cuatro helpers de vista llamados `normalizeKey` quedaban listados como pendientes desde la unidad de claves anterior. Clasificados por semántica:
  - Dos eran `slugKey` exactamente: `directoryKey` de Usuarios cursor (copia muerta, retirada) y `key` de las opciones de Incidencias (1 llamada, importa `slugKey`).
  - Tres copias idénticas en la API y el modal de Facturas (`key`, `recordKey`, `key`; 13 llamadas) son `recordKey`, exportada por `src/core/slug-key.js`: `.` separa, otros símbolos pasan a `_`, `:` se conserva.
  - Dos copias idénticas en las plantillas de Facturas (`normalizeKey`; 19 llamadas) son `labelKey`, exportada por `src/core/slug-key.js`: todo lo que no es `\w` pasa a `_`. El `normalizeText` de la base del modal queda muerto y se retira.
  - Dos copias idénticas de `normalizeCode` (`http`, activación de cuenta; 6 llamadas) y la composición `normalizedErrorCode` del soporte público son `codeKey`, exportada por `src/core/presentation-text.js` (kernel): separadores a `_` y mayúsculas.
  - Dos políticas propias reciben nombre propio sin cambiar de cuerpo: `handleKey` en el perfil técnico (conserva `@`) y `homeLabelKey` en la base de Home (símbolos a `_`, 80 caracteres; cinco plantillas la importan con el nuevo nombre).
  - Cuatro pipelines conservan su política y su nombre: `normalizeStateKey` y la clave de prioridad de Incidencias, `key` del modal de Incidencias y `technicalVersion` de Facturas.
- `tools/presentation-text-contract.mjs`: `codeKey` sólo en la autoridad de texto; `recordKey` y `labelKey` sólo en `core/slug-key.js`; ningún módulo define `normalizeKey` fuera del kernel (lista de variantes vacía); la lista de pipelines slug propios pasa de 16 a 6 y sigue siendo cota superior; muestras de comportamiento de las tres claves.
- Docs: dos filas de `FRONTEND_SHARED_SYSTEMS.md`.

## Comportamiento

Sin cambio: cada copia retirada frente a su autoridad sobre 37 valores (acentos, NFD, símbolos, `@`, `:`/`.`, mayúsculas locales, vacíos, nulos, números, arrays, objetos con `toString`, ligaduras), 370 comprobaciones; los dos helpers renombrados conservan el cuerpo byte a byte.

## Cierres de arranque

Frente a la unidad anterior (booleanos): app 157431 → 157430 (−1), auth 63729 → 63733 (+4), bootstrapPublicHome 218311 → 218310 (−1): `codeKey` entra en `presentation-text` (+71) y `http` pierde su copia (−67). Techos 158000 / 64000 / 218500. Chunks perezosos: Facturas −457, API de facturas −327, Incidencias −194, Usuarios −143, activación −72; `slug-key` +369.

## Métricas

10 copias retiradas (2 → `slugKey`, 3 → `recordKey`, 2 → `labelKey`, 3 → `codeKey`) y 1 helper muerto; 3 autoridades nuevas en 2 módulos existentes; 2 políticas propias con nombre explícito; 4 políticas propias documentadas; 20 ficheros; comportamiento modificado: no.
