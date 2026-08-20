# Onion Support — UI System V13 Audit

## Autoridad de rol en boundaries frontend

V12 centralizó los controladores visuales. V13 continúa en tres boundaries que ya importaban `AppCore` pero seguían manteniendo un parser/catálogo propio: Auth, Home API y Cuenta API.

- Boundaries migrados: **3**
- Código duplicado retirado: **1,547 bytes**
- Catálogos de roles en Auth: **2 → 1** (sólo Core/config)
- Alias de privilegio legacy en Home API: **eliminados**
- Cuenta conserva su política de fallback `user`, pero la validación `admin/user` la hace Core.

| Archivo | bytes antes | bytes después | retirados |
|---|---:|---:|---:|
| `src/features/auth/index.js` | 46,862 | 46,112 | 750 |
| `src/views/home/home.api.js` | 26,894 | 26,195 | 699 |
| `src/views/cuenta/cuenta.api.js` | 38,766 | 38,668 | 98 |

## Scope deliberado

`usuarios.api.js` mantiene `normalizeRoleValue()` por ahora porque participa en normalización de modelos y filtros de consulta. Se auditará de forma separada para no mezclar una refactorización de query/model con Auth/Cuenta.

## Invariante

Repository Integrity impide reintroducir `function normalizeRole()` en estos tres boundaries, exige `AppCore.normalizeRole()` y bloquea un segundo catálogo de roles dentro de Auth.
