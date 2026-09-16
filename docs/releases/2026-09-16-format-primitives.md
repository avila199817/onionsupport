# `core/format.js`: formateadores de divisa y de número sobre valores ya analizados · 2026-09-16

## Qué cambia

- 12 copias construían un `Intl.NumberFormat("es-ES", { style: "currency", … })` (10 `formatMoney` en Clientes ×2, Facturas ×3, Home, Incidencias ×2, Servidor y la confirmación de pago, más dos versiones inline en la vista de Facturas), cuatro con caché propia (`MONEY_FORMATTERS`, `getMoneyFormatter`); 5 copias construían el formateador de número simple (`formatNumber` ×4, `numberLabel`). `src/core/format.js` exporta las primitivas y cuatro políticas de divisa:
  - `standard`: dos decimales; es-ES agrupa miles desde cinco cifras (Clientes, Facturas ×4, Home, confirmación de pago, Servidor compacto).
  - `grouped`: dos decimales y miles desde cuatro cifras (lista de Incidencias: `1.234,00 €`).
  - `precise`: de dos a cuatro decimales (costes de Servidor).
  - `currencyDigits`: el mínimo de la divisa, dos como máximo (modales de Clientes e Incidencias; para EUR es igual que `standard`; para JPY muestra `12 JPY`).
- `currencyFormatter(code, policy)` devuelve el formateador (uno por código y política, construido una vez) o `null` si `Intl` rechaza el código; `formatCurrency(amount, code, policy)` formatea o cae al texto estándar `toFixed(2)` con coma y el código; `currencyCode(value, fallback)` normaliza el código; `formatDecimal(amount)` es el número es-ES simple.
- Los dominios componen: cada `formatMoney` conserva su parser de importe, su texto de vacío (`"—"` en la lista de Facturas y en Servidor) y, donde difiere, su texto de respaldo (modal de Clientes: `€`; lista de Incidencias: miles a mano y `€`; modal de Incidencias: punto decimal y `€`), componiendo `currencyFormatter`. Servidor conserva su validación `^[A-Z]{3}$` y elige `standard` o `precise` según `compact`. `axisMoney` de Servidor (notación compacta y decimales según el valor) queda local y listada. `getMoneyFormatter` de Home (sin importadores) y los seis constantes de formateador se retiran.
- `tools/format-contract.mjs` (en `check:dist`): políticas congeladas; comportamiento con `Intl` real (EUR, USD, JPY, código desconocido bien formado, código mal formado y su texto de respaldo, un formateador por código y política, `formatDecimal`); un definidor; ningún `style: "currency"` fuera de la autoridad salvo la local listada; ninguna caché ni formateador es-ES simple fuera; mapa de consumidores por política medido; `main.js`/analytics sin importar.
- Docs: fila de formato en `FRONTEND_SHARED_SYSTEMS.md`.

## Comportamiento

Sin cambio. Equivalencia de cada envoltorio retirado (extraído de `HEAD`, con sus dependencias locales) frente al nuevo sobre 27 importes (0, −0, enteros, 3 y 4 decimales, miles, millones, 10^21, `NaN`, `Infinity`, texto con coma y con miles, texto, blancos, booleanos, arrays, objetos) × 11 divisas (`undefined`, EUR, minúsculas, con espacios, USD, GBP, JPY, ABC, XX1, EURO, vacío, `null`) y, en Servidor, con y sin `compact`: 4.752 comprobaciones, 0 diferencias, con el `Intl` de Node 22 (ICU 78 / CLDR 48). Los dos formateadores inline de la vista de Facturas reproducen el mismo constructo que la confirmación de pago y la base del modal (`standard` con el código en el respaldo).

## Cierres de arranque

Frente a main 850aaead: app 155974 → 156026 (+52), auth 62996 → 62996 (0), bootstrapPublicHome 216011 → 216100 (+89). Techos 158000 / 64000 / 218500. `core/format.js` es un chunk perezoso (872 bytes) que importan vistas y features; los cierres pagan sus entradas de precarga (`routes` +52, `enhancements` +37). Vistas: Facturas −843, Incidencias −299, Clientes −245, confirmación de pago −119, Servidor −90 (`home` ±9 kB es el artefacto conocido de emparejar por nombre dos chunks `home*`).

## Métricas

17 copias retiradas (12 de divisa, 5 de número) → 1 autoridad con 4 políticas; 13 ficheros de `src`; 1 local listada; 39 + / 245 −, 206 netas menos en `src`; el contrato y esta nota añaden las suyas.
