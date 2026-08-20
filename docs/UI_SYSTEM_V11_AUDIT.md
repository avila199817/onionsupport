# Onion Support — UI System V11 Audit

## Correo: identidad canónica del usuario

V11 elimina la última identidad personal codificada dentro del controlador de Correo y deja `AppCore.publicUser()` como única normalización de usuario antes de pintar cuenta/avatar.

- `correo/index.js`: **47,422 → 47,131 bytes**
- Fallback personal codificado: **eliminado**
- Fallback visible cuando no existe identidad: **`Usuario`**
- Avatar: sólo `publicUser.avatarUrl` + `sanitizeRuntimeImageUrl()`
- Normalizador de usuario consumido por Correo: **1** (`AppCore.publicUser`)

## Efecto

Correo ya no reconstruye manualmente `displayName`, `fullName`, `nombre`, `profile`, `picture` o `photoUrl`. Esa compatibilidad pertenece al Core y se resuelve una sola vez en `publicUser()`. Si Core cambia su contrato de identidad, Correo lo hereda sin mantener una segunda lista de campos.

Repository Integrity bloquea volver a introducir el nombre personal o los fallbacks raw/profile retirados.
