# Onion Support — UI System V12 Audit

## Autoridad canónica de roles en UI

El backend y Cosmos ya trabajan con los roles canónicos `admin` y `user`. Sin embargo, varios controladores visuales seguían manteniendo dialectos locales que traducían valores como `root`, `owner`, `superadmin`, `administrador` o `cliente`. V12 retira esos normalizadores de la capa UI: los consumidores reales pasan a `AppCore.normalizeRole()` y los normalizadores sin consumidores se eliminan como código muerto.

- Controladores auditados: **9**
- Controladores migrados a autoridad Core: **7**
- Normalizadores muertos eliminados: **2**
- Consumidores migrados a `AppCore.normalizeRole()`: **8**
- Código duplicado retirado: **4,296 bytes**
- Alias legacy encontrados dentro de normalizadores retirados: `administrador`, `administrator`, `client`, `cliente`, `owner`, `root`, `super_admin`, `superadmin`, `usuario`
- Roles funcionales de UI después de V12: **`admin` / `user`**

| Archivo | bytes antes | bytes después | retirados | llamadas Core | resultado |
|---|---:|---:|---:|---:|---|
| `src/views/home/index.js` | 21,749 | 21,065 | 684 | 1 | canónico |
| `src/views/server/index.js` | 40,562 | 40,017 | 545 | 1 | canónico |
| `src/ui/topbar/index.js` | 74,738 | 74,519 | 219 | 0 | dead-code |
| `src/ui/sidebar/index.js` | 43,516 | 43,337 | 179 | 1 | canónico |
| `src/ui/sidebar/template.js` | 42,929 | 42,786 | 143 | 0 | dead-code |
| `src/views/incidencias/index.js` | 127,561 | 126,860 | 701 | 1 | canónico |
| `src/views/usuarios/index.js` | 80,632 | 80,156 | 476 | 1 | canónico |
| `src/views/clientes/index.js` | 121,629 | 120,874 | 755 | 2 | canónico |
| `src/views/facturas/index.js` | 121,873 | 121,279 | 594 | 1 | canónico |

## Boundary deliberado

V12 **no toca** `features/auth`, `home.api.js`, `cuenta.api.js` ni APIs de dominio. Esas capas reciben contratos externos/backend y se auditarán por separado antes de retirar compatibilidad. Esta fase sólo elimina dialectos de rol en controladores de presentación que ya disponen de Core o elimina helpers sin consumidores.

## Invariante

Repository Integrity bloquea nuevos `function normalizeRole()` en los controladores auditados y exige `AppCore.normalizeRole()` allí donde existe consumo real.
