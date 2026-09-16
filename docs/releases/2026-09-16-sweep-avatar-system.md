# Barrido · superficie exportada de avatar-system · 2026-09-16

## Problema

`src/features/avatar-system` exportaba 56 nombres. Ocho no tenían consumidor fuera de su módulo: 7 se usaban sólo dentro del suyo y 1 no se usaba en ningún sitio.

Es una **pieza protegida**, y además es exactamente el sistema donde el barrido ya se equivocó una vez: en la unidad de sidebar/topbar (#664) `createSidebarFooter` se clasificó como muerto porque el verificador excluía por ruta todo el árbol de trabajo, y resultó que `avatar_runtime_dom_contract.mjs` lo construye dentro de una página real a través del objeto de espacio de nombres. Lo cogió la batería de navegador antes de fusionar. Así que aquí la verificación va por delante, no por detrás.

## Qué se comprobó, además del barrido de nombres

1. **Consumo dinámico en página real.** Los contratos `avatar_runtime_dom_contract.mjs`, `avatar_consumer_identity_contract.mjs`, `incidencias_comment_avatar_runtime_contract.mjs` y `avatar_system_contract.mjs` cargan estos módulos en un navegador. Ninguno menciona los ocho nombres; el verificador busca cada nombre en todo el repositorio, incluidos `.mjs`, `.py`, `.sh`, HTML y documentación, precisamente para que un consumidor por importación dinámica aparezca.
2. **Acceso por forma.** Se buscó iteración sobre el módulo (`Object.keys`, `getOwnPropertyNames`) en los contratos de avatar: no existe. Nadie depende del conjunto de exportaciones, sólo de nombres concretos.
3. **Contratos que exigen la palabra `export` literal.** `whatsapp_route_contract.mjs` lee `src/features/avatar-system/index.js` **como texto** y afirma `/export function synchronizeAvatars/`. Es decir: hay contratos que exigen que un nombre siga siendo exportado, escrito así en el fichero. Eso refuerza el método en lugar de contradecirlo, porque un nombre citado en un contrato aparece en el corpus del verificador y **nunca** puede caer en la clase A. `synchronizeAvatars` y `resolveAvatarPresentation`, los dos que ese contrato exige, se conservan intactos.

## Cambio

**Clase A** (sobra el `export`, el símbolo sigue vivo) — 7 nombres:

- `identity.js`: `avatarToneFromName`, `avatarColorFromTone`, `avatarColorKeyFromTone`, `avatarColorKeyFromSeed`. Son los pasos internos de la identidad visual; la autoridad pública (iniciales, tono y color por nombre) sigue exportada y sigue siendo lo que consumen los contratos de identidad.
- `index.js`: `isAvatarFallbackClassName`, `findAvatarHost`, `synchronizeAvatarImage`.

**Clase B** (muerta, se retira) — 1 nombre: `isAvatarImageClassName`, dos líneas cuya única mención en todo el repositorio era su propia declaración. Su hermana `isAvatarFallbackClassName` sí se usa dentro del módulo y se conserva como función privada.

**Contrato**: `src/features/avatar-system` entra en el `BASELINE` con 48. El contrato vigila ahora 934 exportaciones en 12 directorios.

## Métricas de la unidad

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/features/avatar-system` | 56 | 48 |
| Exportaciones privatizadas (A) | | 7 |
| Funciones muertas eliminadas (B) | | 1 |
| Ficheros borrados | | 0 |
| Consumidores verificados | 8 nombres contra `src`, `tools`, `.github`, `docs`, HTML, `vite.config.js`, `package.json` | sin referencias |
| Acceso por forma sobre el módulo | buscado en los contratos de avatar | no existe |
| Comportamiento modificado | | no |
| `dist` y cierres | | en la PR |

## Riesgo

Bajo en el cambio, alto en la atención: es una pieza protegida y el sistema donde el barrido ya falló una vez. Ningún nombre citado por un contrato se toca, la identidad visual no cambia y los cuatro contratos de avatar de la batería corren en una página real antes de fusionar.
