# Onion Support — UI System V10 Audit

## Correo: política canónica de media runtime

Correo tenía un sanitizador local `safeImageUrl()` que aceptaba cualquier URL HTTP/HTTPS. El resto del shell privado ya dispone de una autoridad más estricta en `src/core/media.js`, capaz de distinguir same-origin, Onion API y Azure Blob/SAS sin aceptar credenciales de aplicación en URLs.

V10 elimina esa segunda política.

- `correo/index.js`: **47,732 → 47,422 bytes**
- Consumidores migrados a `sanitizeRuntimeImageUrl()`: **1**
- Sanitizadores runtime de imagen propios de Correo: **0**
- Autoridad runtime de media: **1** (`src/core/media.js`)

## Efecto de seguridad

El avatar de Correo ya no puede aceptar un host HTTP/HTTPS arbitrario sólo por tener un protocolo válido. Hereda exactamente el mismo contrato que Sidebar: assets relativos, same-origin, dominios Onion permitidos y Azure Blob; SAS sólo cuando corresponde a Blob Storage y sin parámetros sensibles de aplicación.

## Invariante

Repository Integrity exige el import de `sanitizeRuntimeImageUrl`, bloquea la reaparición de `safeImageUrl()` local y fija la versión del controlador de Correo V10.
