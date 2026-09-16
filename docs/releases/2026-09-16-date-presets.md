# `DATE_PRESETS` y `dateFormatter`: los presets de fecha compartidos en `core/format.js` · 2026-09-16

## Qué cambia

- 29 construcciones de `Intl.DateTimeFormat("es-ES", …)` en 13 módulos usaban 21 juegos de opciones; 16 de ellas repetían cuatro. `src/core/format.js` exporta `DATE_PRESETS` con esos cuatro y `dateFormatter(preset)`, un formateador por preset construido una vez:
  - `dateTime` (16/09/2026, 04:05): Clientes ×2, Usuarios ×2, modal de Incidencias, lista y modal de Facturas (7 construcciones).
  - `date` (16/09/2026): lista y modal de Facturas (2).
  - `shortMonthDate` (16 sept 2026): Clientes ×2, Usuarios, lista de Incidencias (4).
  - `shortMonthDateTime` (16 sept 2026, 04:05): Home, estado del detalle y modal de Incidencias (3).
- Los envoltorios del dominio (`formatDate`, `formatDateTime`, `formatDateShort`, `formatShortDate`) conservan su parseo (`toTimestamp`/`toDate` con su política, o el texto crudo en Incidencias), su texto de vacío (`"—"`, `"Fecha no disponible"`, `"Sin fecha"`) y su rama `catch`; sólo cambian la construcción del formateador por `dateFormatter(DATE_PRESETS.x)`. Seis constantes de módulo (`DATE_TIME`, `DATE_SHORT`, `DATE_TIME_FORMATTER`, `SHORT_DATE_FORMATTER`, `MODAL_DATE_FORMATTER` y la del modal de Incidencias) se retiran.
- Los 13 presets que muestra un solo módulo siguen en su módulo (Agenda ×3, Correo ×3, hora de Clientes, h23 de Incidencias ×2, Servidor ×3, WhatsApp): centralizarlos no ahorra nada y les daría un nombre que nadie más usa. El contrato los lista como cota superior por módulo.
- `tools/format-contract.mjs`: presets congelados, un formateador por preset, la forma que imprime cada preset (independiente de la zona horaria), ninguna construcción de un preset compartido fuera de la autoridad, cota de presets locales por módulo, mapa de consumidores por preset medido.
- Docs: fila de formato en `FRONTEND_SHARED_SYSTEMS.md`.

## Comportamiento

Sin cambio. Equivalencia de cada envoltorio (extraído de `HEAD`, con sus constantes) frente al nuevo sobre 20 valores (ISO con y sin milisegundos, cambios de hora de marzo y octubre, fin de año, bisiesto, 2038, fecha sin hora, `dd/mm/yyyy`, segundos y milisegundos epoch, 0, blancos, texto, `Date`) y el formateador inline del modal de Incidencias: 314 comprobaciones × 3 zonas horarias (`Europe/Madrid`, `UTC`, `America/Bogota`), 0 diferencias.

## Cierres de arranque

Frente a main 768b63a2: app 156026 → 156026 (0), auth 62996 → 62996 (0), bootstrapPublicHome 216100 → 216106 (+6). Techos 158000 / 64000 / 218500. El chunk `format` crece 502 bytes con los presets y la caché; las vistas bajan: Facturas −326, Clientes −282, modal de Usuarios −235, Incidencias −200, estado del detalle −34 (`home` ±9 kB es el artefacto conocido de emparejar por nombre dos chunks `home*`).

## Métricas

16 construcciones → 4 presets en 1 autoridad; 11 ficheros de `src`; 6 constantes retiradas; 13 presets locales listados; 49 + / 124 −, 75 netas menos en `src`; el contrato y esta nota añaden las suyas.
