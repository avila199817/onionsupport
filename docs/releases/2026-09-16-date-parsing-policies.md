# `toTimestamp`/`toDate` con tres políticas nombradas en `core/dates.js` · 2026-09-16

## Qué cambia

- 17 copias en 16 módulos convertían un valor de payload en milisegundos epoch (`toTimestamp` ×9, `timestamp` ×3, `normalizeDateInput`, `dateMs`, `toDate`, y dos versiones inline en `sortTimestamp` de Clientes y `dateValue` de la API de Home), en nueve clases de comportamiento. `src/core/dates.js` exporta el mecanismo y tres políticas para el texto:
  - `epoch`: texto por `Date.parse` (una fecha sin hora es medianoche UTC). Clientes (modelo, plantilla, modal), Usuarios (API, plantilla, modal), Servidor, Home (API, base de plantillas, compartida), Incidencias (estado y sincronización del detalle, modal, modal impl), WhatsApp: 14 módulos, 53 llamadas.
  - `invoiceDay`: una fecha sin hora es medianoche local (la fecha civil de la factura); el texto sin `T` toma ese sufijo, como hacían las copias de Facturas. Base del modal de Facturas, 3 llamadas (`toDate`).
  - `invoiceText`: `invoiceDay` más `dd/mm/yyyy[, hh:mm[:ss]]` como fecha local. Lista de Facturas, 7 llamadas.
- Mecanismo común: `null`/`undefined`/`""` → 0; `Date` → su tiempo (inválido → 0); número finito → segundos epoch hasta 9.999.999.999 y milisegundos por encima; texto numérico igual; otro texto según la política; el resto → 0. `toDate(value, policy)` compone un `Date` o `null` (Home y el modal de Facturas, que comprobaban `!date || Number.isNaN(date.getTime())`).
- La copia de `facturas.api.base` no tenía llamadores: retirada.
- `tools/dates-contract.mjs` (en `check:dist`): políticas congeladas, mecanismo y texto por política (blancos, `Date`, umbral segundos/milisegundos, texto numérico, `"0"`, exponente y hexadecimal rechazados, ISO con zona, fecha sin hora UTC frente a local, español, inválidos), un definidor, ninguna copia ni heurística local, cada llamada importa la autoridad y nombra su política como último argumento, mapa de consumidores medido, `main.js`/analytics sin importar.
- Docs: fila de fechas en `FRONTEND_SHARED_SYSTEMS.md`.

## Comportamiento

Sin cambio sobre lo que llega: equivalencia de cada copia retirada (extraída de `HEAD`) frente a su política sobre 14 valores alcanzables (texto ISO con y sin milisegundos y con zona, fecha sin hora, segundos y milisegundos epoch, blancos) y 38 sintéticos (umbrales, negativos, texto numérico, exponente, hexadecimal, español, `Date` válidos e inválidos, objetos, arrays, booleanos, texto de 400 dígitos), 884 comprobaciones, con `TZ=Europe/Madrid`. Idénticas en todo el conjunto alcanzable para 14 de las 17 copias. Las otras tres sólo difieren con números, y ninguna recibe números: el modal de Incidencias ordena comentarios por `createdAt` (texto ISO del backend) y leía un número como milisegundos; WhatsApp formatea `lastMessageAt`/`timestamp` (el backend los normaliza a ISO con `webhookTimestamp`) y devolvía 0 para cualquier número y el año 2000 para `0`; la Home formatea `date` de actividad y facturación (`firstNonEmpty(lastActivityAt, updatedAt, createdAt)`, texto) y `loadedAt` (`nowIso()`), y leía un número como milisegundos. Diferencias sintéticas, documentadas: umbral 10^11 del estado del detalle frente a 10^10 (valores entre ambos: milisegundos de 1973, segundos del año 2286); texto numérico ahora aceptado donde sólo había `Date.parse` y ya no aceptado en forma exponente/hexadecimal (`Number("1e3")`) donde había `Number()`; negativos ya no son 0 en las copias «sólo positivos»; un `Date` conserva sus milisegundos (las copias sin rama `Date` pasaban por texto y perdían la fracción); `"0"` es 0 y no el 1 de enero de 2000.

## Cierres de arranque

Frente a main b00e9fe1: app 155920 → 155974 (+54), auth 62996 → 62996 (0), bootstrapPublicHome 215921 → 216011 (+90). Techos 158000 / 64000 / 218500. `core/dates.js` es un chunk perezoso (979 bytes) que importan vistas y features; los cierres pagan sus entradas de precarga (`routes` +54, `enhancements` +36). Vistas: Facturas −620, Clientes −553, modal de Usuarios −399, Servidor −287, API de Usuarios −239, modelo de Clientes −166, Incidencias −90, sincronización del detalle −80 (`home` ±9 kB es el artefacto conocido de emparejar por nombre dos chunks `home*`).

## Métricas

17 copias retiradas (1 sin llamadores) → 1 autoridad con 3 políticas; 16 ficheros de `src` migrados; 65 llamadas nombran su política; 92 + / 484 −, 392 netas menos en `src`; el contrato y esta nota añaden las suyas.
