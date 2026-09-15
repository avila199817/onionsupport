# Copias de `cleanText` con otro nombre retiradas · 2026-09-15

## Qué cambia

- El escaneo por nombre de las unidades anteriores no veía las copias renombradas. Por huella del cuerpo (`replace(/[\r\n\t]/g, " ")`) quedaban 32 helpers fuera de la autoridad. 25 eran `cleanText` literal con otro nombre (`text`, `txt`, `clean`, `cleanKey`, `safeText`, `safeString`, `cleanAvatarText`): sus módulos importan `cleanText` de `src/core/presentation-text.js` y las llamadas se renombran (253 en total). `safeText`/`safeString` (Cuenta, Servidor, pago confirmado) devolvían el fallback ante `null`/`undefined` antes de convertir; la autoridad produce exactamente lo mismo.
- El sistema de avatares deja de exportar `cleanAvatarText` (`identity.js` e `index.js`); sus dos consumidores importan la autoridad y el objeto por defecto de identidad expone `cleanText` directamente.
- Cuatro variantes de dominio la componen en vez de copiarla: `text` sólo-cadenas en `core/user-identity.js`, `filename` de la política de adjuntos y la clave de prioridad en Incidencias, y el prefill del intake público.
- Cuatro políticas distintas conservan su cuerpo y quedan listadas en el contrato: `redact` en `main.js` (redacción de logs), el título de ruta en `core/public-site.js` (no colapsa espacios), `attrExact` en Clientes (atributos de coincidencia exacta) y `safePageTitle` en `analytics/google-tag.js` (véase abajo).
- `tools/presentation-text-contract.mjs`: ningún módulo fuera de la autoridad contiene la huella del cuerpo salvo la lista; una copia renombrada vuelve a fallar el contrato.
- `.github/scripts/public_home_integrity_core.py`: los tres tokens del payload estructurado del intake (`postalCode`, `city`, `province`) fijan `cleanText(`.
- Docs: fila de `FRONTEND_SHARED_SYSTEMS.md`.

## Analytics queda fuera a propósito

`analytics/google-tag.js` es un chunk hoja cargado tras el consentimiento. Al importar el normalizador desde él, rolldown plegó `presentation-text` (113 B) dentro del chunk de analytics y todos los módulos del kernel pasaron a importarlo: el cierre `auth` subía de 63934 a 95133 bytes. `safePageTitle` conserva su cuerpo y el contrato lo documenta como excepción.

## Comportamiento

Sin cambio. Tanda de equivalencia de 266 comprobaciones (nulos, números, cadenas con saltos y tabuladores, Unicode, objetos con `toString`, arrays, fallbacks distintos y la forma callback `map(cleanText)` que usa el estado del detalle de Incidencias): las copias literales, los early-return de `safeText` y las cuatro composiciones producen la misma salida que la autoridad.

## Cierres de arranque

Frente a main 9f82848f: app 157537 → 157443 (−94), auth 63934 → 63835 (−99), bootstrapPublicHome 218428 → 218291 (−137). Techos 158000 / 64000 / 218500. Chunks diferidos: incidencias −248, cuenta −103, identity −53, facturas-paid-confirm −44, avatar-system +10 (import), incidencias-comment-identity +45 (import).

## Métricas

25 copias literales retiradas, 4 composiciones, 4 políticas listadas; 31 módulos tocados; 165 líneas menos.
