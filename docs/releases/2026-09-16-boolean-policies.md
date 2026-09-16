# `parseBoolean` con políticas de tokens nombradas · 2026-09-16

## Qué cambia

- Seis módulos definían `parseBoolean` con cinco listas de tokens distintas, dos ámbitos de coerción (sólo cadenas o cualquier valor) y dos fallbacks por defecto (`null` en Clientes, `false` en el resto); la base del modal de Facturas tenía además un `bool` con las palabras del interruptor sobre cualquier valor. `src/core/booleans.js` exporta un único `parseBoolean(value, policy, fallback = policy.fallback)` y `BOOLEAN_POLICIES` con seis políticas nombradas (`switch`, `switchAny`, `activity`, `activityEs`, `activityEsStrings`, `activityEsExtended`); los siete consumidores llaman a la autoridad con la política que reproduce exactamente su copia (39 llamadas).
- No se unifican tokens: cada política conserva su lista, su ámbito y su fallback. Convergir es una decisión (véase abajo).
- Cuatro parsers con política propia siguen locales y quedan listados en el contrato como cota superior: `parseBooleanFlag` (API de Facturas), `normalizeBoolean` (Cuenta), `parseStrictBoolean` (API de Usuarios) y `bool` de la plantilla de listado de Facturas.
- `tools/boolean-policies-contract.mjs` (en `check:dist`): políticas congeladas (tokens, ámbito, fallback), respuestas del mecanismo y de cada política, un solo definidor, cada consumidor en la política medida (mover uno es una decisión), toda llamada nombra su política como segundo argumento, ninguna lista de tokens booleanos fuera de la autoridad y de los cuatro locales listados.
- Docs: fila en `FRONTEND_SHARED_SYSTEMS.md`.
- `avatar_runtime_dom_contract`: los seis pasos que importan módulos dinámicamente corren en la página y exponen su resultado (`runOnPage`). Chromium retiene débilmente la promesa de una función asíncrona evaluada; una recolección de basura durante la carga de módulos la recogía y Playwright informaba «Resulting promise was garbage collected» aunque la página había terminado el paso (trazado sentencia a sentencia; modelo de usuario idéntico a `main`). Las llamadas reescritas en `usuarios.api.js` desplazaron la asignación de memoria lo justo para hacer esa GC determinista aquí; el mismo contrato ya había fallado una vez de forma aislada. Sin cambio de aserciones. `modal_lifecycle_contract` (7 pasos) y `spa-modal-regression` (1) usan el mismo patrón y quedan anotados.

## Comportamiento

Sin cambio en los seis `parseBoolean`: equivalencia frente a `origin/main` sobre 58 valores (booleanos, números, dígitos con y sin espacios, palabras en varios idiomas y mayúsculas, acentos, vacíos, nulos, arrays, objetos con `toString`, `Date`, `BigInt`, `Symbol`) × 5 fallbacks, incluido el fallback por defecto de cada copia. Una diferencia intencionada en el `bool` de la base del modal de Facturas: su clave local convertía la puntuación en `_` y la autoridad usa `slugKey`, que la elimina salvo `.` y `:`; sólo difieren palabras pegadas a `.` o `:` (`"yes."`, `"on:"`, `"1."`, `"0:"`), que no son valores booleanos reales.

## Qué políticas podrían converger

Por tokens se anidan: `switch` ⊂ `activity` ⊂ `activityEs` ⊂ `activityEsExtended`; `switchAny`/`activityEsStrings` sólo difieren en el ámbito (cualquier valor frente a sólo cadenas), que en la práctica afecta a arrays y objetos, no a campos booleanos reales. Propuesta, pendiente de tu aprobación: (1) `activity` y `activityEs` → `activityEsExtended` (acepta más palabras, nunca menos); (2) `activityEsStrings` → `activityEsExtended` (deja de distinguir arrays/objetos); (3) `switchAny` → `switch` sólo si aceptas que un array u objeto deje de interpretarse por su texto. `switch` (listado de Facturas) tiene tokens distintos y fallback `false`: se mantiene. De los locales, `parseStrictBoolean` puede componerse sobre `activityEsExtended` si aceptas `" 1 "` como válido; `parseBooleanFlag`, `normalizeBoolean` y el `bool` del listado tienen semántica propia (números distintos de cero, tema claro/oscuro, números distintos de 1) y deben decidirse uno a uno.

## Cierres de arranque

Frente a main dbe6ed25: app 157380 → 157431 (+51), auth 63729 → 63729 (0), bootstrapPublicHome 218260 → 218311 (+51). Techos 158000 / 64000 / 218500. El único coste en los cierres es la entrada de precarga del nuevo chunk `booleans` (1.130 B, cargado sólo por las vistas perezosas) en `routes`; Facturas −589 B, Clientes modelo −168 B, Usuarios −159 B.

## Métricas

7 copias retiradas (6 `parseBoolean`, 1 `bool`) → 1 autoridad con 6 políticas; 7 consumidores, 39 llamadas; 4 políticas locales documentadas; comportamiento modificado: no (una diferencia documentada sin efecto sobre valores reales).
