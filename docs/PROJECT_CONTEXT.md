# ONION SUPPORT — CONTEXTO CANÓNICO DEL FRONTEND

> Actualizado: 2026-09-04.
> Describe la arquitectura productiva esperada del repositorio `avila199817/onionsupport`. Si documentación y código divergen, el código de `main` es la autoridad.

## 1. Alcance

Onion Support es una SPA JavaScript modular desplegada en Azure Static Web Apps.

- Frontend: `https://onionsupport.com`
- API: `https://api.onionsupport.com`
- Idioma funcional: español
- Roles funcionales: `admin` y `user`
- Entry point JS: `src/main.js`
- Registry global: `src/app/enhancements.js`
- Entry point CSS global: `src/css/app.css`
- Manifest CSS de ruta: `src/router/styles.js`
- Router: `src/router/`
- HTTP: `src/core/http.js`
- Auth: `src/features/auth/`
- AvatarSystem: `src/features/avatar-system/`
- Modales: `src/features/entity-overlay/modal-lifecycle.js`
- Concurrencia y desmontaje: `src/core/async-scope.js`
- Marca y SEO: `src/core/public-site.js` y `src/router/page-metadata.js`

Este repositorio es exclusivamente frontend. No debe duplicar, simular ni inventar lógica del backend.

La consolidación y sus límites están documentados en `docs/FRONTEND_SHARED_SYSTEMS.md`. La portada usa la marca **Onion Support**, los servicios comparten catálogo y plantilla, y `/login` es accesible pero no indexable. El consentimiento se importa desde `src/main.js` y comparte la autoridad modal; las páginas estáticas de servicios compilan el mismo módulo.

## 2. Regla arquitectónica

Debe existir una sola autoridad por responsabilidad.

No crear:

- otro router, cliente HTTP, sistema de auth o store de sesión;
- otro orquestador global desde `index.html`;
- otra paleta/design system por vista;
- otra autoridad de identidad, color o estado de avatar;
- APIs de vista que inventen endpoints;
- rutas o roles preparados “por si acaso”;
- almacenamiento persistente de secretos, tokens o SAS;
- CSS `patch`, `hotfix`, `final-fix`, `override-vX` o equivalentes;
- observers/listeners correctores cuando la fuente canónica puede emitir directamente el estado correcto;
- `<link>` de estilos inyectados por features cuando la hoja pertenece a una ruta.

Las vistas separan, cuando el dominio lo permite:

1. API y normalización;
2. controlador/lifecycle DOM;
3. template HTML;
4. CSS scopeado y basado en tokens.

## 3. Boot único

`index.html` mantiene sólo lo imprescindible antes del App:

- `src/preboot/theme.js` como script clásico de tema previo al paint;
- `src/css/app.css` como stylesheet global;
- `/src/main.js` como **único** `script type="module"` ejecutable.

El flujo canónico es:

```text
index.html
  -> src/main.js
       -> src/app/enhancements.js
            -> pre-router: ticket-deeplink + App Chrome
       -> src/app/index.js
       -> post-router: mejoras progresivas globales
```

`src/app/enhancements.js` es el registro único de mejoras globales/progresivas. Los módulos no deben volver a auto-orquestarse desde etiquetas `<script type="module">` dispersas en `index.html`.

Las mejoras post-router actuales incluyen DataList móvil, autorefresh de Facturas, previews de Incidencias y experiencia pública. Un fallo progresivo se aísla sin convertir un App sano en fallo fatal.

## 4. Core

`src/core/` concentra contratos transversales:

- `config.js`: URLs, rutas y roles;
- `http.js`: cliente HTTP único;
- `media.js`: política runtime de URLs de imagen;
- `index.js`: estado/core compartido y usuario actual.

Reglas:

- no usar `fetch` directo para dominio si existe `core/http.js`;
- URLs runtime de imagen sólo desde orígenes permitidos;
- SAS únicamente donde el contrato lo necesita y para Azure Blob;
- roles de producto: `admin` y `user`.

## 5. Router y rutas

Rutas públicas principales:

- `/`
- `/login`
- `/password-request`
- `/password-reset`
- `/activate-account`

Home privada:

- `/@{slug}`

Rutas privadas principales:

- `/incidencias`
- `/facturas`
- `/clientes`
- `/usuarios`
- `/correo`
- `/servidor`
- `/cuenta`

`/ajustes` existe sólo como alias legacy y resuelve `Cuenta`. No existe una segunda vista Ajustes.

Admin-only: Clientes, Usuarios, Correo y Servidor. El sidebar controla visibilidad; el Router sigue siendo autoridad de acceso en frontend y el backend es la autoridad final.

## 6. App Chrome

Topbar y Sidebar son componentes funcionales separados, pero su geometría e interacción responsive pertenecen a **App Chrome**.

Autoridades:

- `src/ui/chrome/template.js`
- `src/ui/chrome/index.js`
- `src/css/layout/chrome.css`
- `docs/UI_CHROME.md`

No existen ni deben reaparecer `mobile-shell.css` o `features/mobile-shell/index.js`.

## 7. AvatarSystem

AvatarSystem es la única autoridad transversal de identidad visual, estado de imagen y paint de avatares en la SPA autenticada.

Autoridades:

- `src/features/avatar-system/identity.js`: normalización, iniciales, fingerprint y tone determinista uint32;
- `src/features/avatar-system/index.js`: lifecycle global de loading/image/fallback/error y reconciliación del DOM dinámico;
- `src/css/components/avatar-system.css`: geometría, transparencia real, fallback y paint canónico.

Reglas:

- mismo usuario => misma identidad visual en Sidebar, Home, Incidencias, Facturas, Clientes, Usuarios, Cuenta y DOM dinámico;
- una imagen real válida gana al fallback y conserva alfa transparente;
- no existen motores locales `avatarTone`, paletas 0..9, hashes `% 10` ni clases tone enumeradas por vista;
- no usar `Math.random`, storage ni red para decidir identidad visual;
- los templates pueden aportar identidad de dominio, pero delegan iniciales, tone y presentación a AvatarSystem;
- `src/features/incidencias-comment-identity/` es dominio puro: resuelve aliases/identidad estable, sin DOM, HTTP ni paint;
- `incidencias-comment-avatars` e `incidencias-followup-avatars` son adaptadores contextuales y no una segunda autoridad de avatar;
- en compatibilidad legacy por nombre, una coincidencia normalizada exacta tiene prioridad; el matching flexible sólo se usa si no hay una coincidencia exacta única.

Los guards `avatar_authority_hygiene_contract.mjs` e `incidencias_comment_avatar_contract.mjs` impiden reintroducir autoridades visuales paralelas y fijan la compatibilidad de comentarios.

## 8. Vistas productivas

### Incidencias

Listado, creación, detalle, adjuntos, comentarios, lifecycle, estados/prioridad/tipo, cierre/reapertura, refresco autónomo y previews de media. La hoja `src/css/views/incidencias/media-preview.css` pertenece al manifest de `incidencias`; el feature JS no inyecta stylesheets.

`/incidencias` es la referencia visual privada. El contrato común de carga progresiva para Incidencias, Facturas, Clientes y Usuarios está documentado en `docs/CONTINUOUS_SCROLL.md`.

### Facturas

Listado, creación, detalle, PDF, envío y relación con incidencias. Las colecciones del dominio se preservan como arrays. La apertura directa de una incidencia desde Facturas reutiliza el controller canónico de Incidencias y sus adaptadores de comentario/seguimiento, sin navegar ni reintroducir fallbacks legacy.

### Clientes

Listado admin, creación desde usuario real y detalle read-only conforme al backend.

### Usuarios

Listado, alta administrativa, detalle y política segura de avatares/SAS runtime.

### Correo

Integración Microsoft a través del backend Onion, sin tokens Microsoft en navegador; carpeta/lista/lector, compose, replies, forward, drafts, adjuntos, scroll infinito y cache efímera. La única persistencia browser intencional es la preferencia booleana de notificaciones.

### Servidor

Vista administrativa sobre contratos reales del backend.

### Cuenta

Self-service del usuario autenticado: identidad, avatar, contraseña, sesiones bajo demanda y desactivación. No inventa PATCH/PUT self que el backend no exponga.

## 9. CSS y design system

`src/css/app.css` es la única entrada CSS global y contiene sólo capas realmente transversales. `src/router/styles.js` es la única autoridad de carga para CSS específico de ruta, tanto público como privado.

La arquitectura usa:

- tokens globales;
- reset/core/layout;
- App Chrome;
- componentes compartidos;
- CSS de vista cargado por ruta;
- composiciones transversales;
- guardrails finales de geometría;
- `avatar-system.css` como única autoridad de paint de avatares.

Reglas:

- dark/light salen de tokens globales;
- no crear paletas completas paralelas por vista;
- no crear gradientes, bordes o sombras locales para pintar fallbacks de avatar;
- `!important` no es estrategia de composición;
- una refactorización elimina reglas sustituidas en lugar de apilarlas;
- `app.css` no importa hojas específicas de una ruta;
- Public Home carga `index.css`, `support-request.css`, `public-support-progress.css` y `home-experience.css` desde su manifest de ruta;
- la landing no arrastra `auth/login.css`; esa hoja pertenece a las rutas de autenticación;
- ningún feature debe crear `<link rel="stylesheet">` para CSS que el Router puede declarar canónicamente.

## 10. Seguridad frontend

La SPA nunca sustituye la autorización del backend.

Frontend debe:

- ocultar acciones no permitidas por rol;
- no exponer tokens, secretos ni SAS en snapshots/logs;
- no convertir URLs privadas en públicas;
- evitar storage persistente para credenciales y datos efímeros;
- usar `core/http.js` para auth/refresh y peticiones protegidas;
- mantener rutas privadas con `noindex`/`nofollow`.

Backend sigue siendo autoridad final de ACL, propiedad de recursos y mutaciones.

El canal de reporte responsable del repositorio está documentado en `SECURITY.md`.

## 11. Azure Static Web Apps y SEO

`staticwebapp.config.json` define fallback SPA, headers de seguridad, cache y `X-Robots-Tag` para rutas privadas.

`robots.txt`, `sitemap.xml` y la configuración estática deben permanecer alineados. `sitemap.xml` contiene sólo URLs públicas indexables.

El archivo raíz con nombre hexadecimal es la clave pública de verificación de IndexNow y forma parte del contrato SEO; no es un temporal.

## 12. CI e integridad

### Repository Integrity

`.github/workflows/repo-integrity.yml` valida, entre otros contratos:

- sintaxis de todos los `src/**/*.js` con Node 22;
- contratos estructurales de `.github/scripts/repo_integrity.py`;
- contratos de escala de Incidencias, Clientes y Usuarios;
- contrato de scroll continuo de Facturas y smoke renderizado de las cuatro colecciones;
- entrypoint/runtime único mediante `.github/scripts/app_entrypoint_integrity.py`;
- autoridad CSS privada;
- autoridad global y hygiene de AvatarSystem;
- identidad/avatar de comentarios de Incidencias;
- apertura transversal Facturas -> Incidencias;
- `staticwebapp.config.json`;
- merge markers y whitespace.

`validate_spa_contracts.sh` es un gate crítico: los contratos transversales que puedan bloquear un release no deben vivir únicamente en una segunda fase de `npm run validate:ci`.

### Public Home Integrity

`.github/workflows/public-home-contract.yml` usa `.github/scripts/public_home_integrity.py` como contrato único para landing, intake, UX, progreso de envío, registry de enhancements y propiedad CSS de la ruta pública.

No debe reaparecer un segundo workflow específico que duplique esas mismas comprobaciones.

### Trusted PR Integrity

`.github/workflows/trusted-pr-integrity.yml` trata el candidato como datos no confiables, construye el artefacto sin secretos, lo reconstruye con tooling confiable, prueba provenance byte a byte y despliega un preview aislado `pr<N>`.

### Azure Static Web Apps

Tras fusionar, `.github/workflows/azure-static-web-apps-polite-bay-086469a1e.yml` valida el SHA exacto, genera/materializa el artefacto productivo, despliega la SPA compilada y verifica canonicalización, bytes, seguridad, routing y backend en producción.

`production-verification.yml` vuelve a comparar la producción con el `main` esperado después del release.

## 13. Arrays y normalización

Un helper `first(...values)` selecciona el primer valor útil y no debe aplanar arrays del dominio.

Quedan prohibidos dentro de ese helper `values.flat(...)` y `values.flatMap(...)`: adjuntos, permisos, historial, líneas de factura y otras colecciones son valores completos.

## 14. Persistencia en navegador

Preferir memoria a storage persistente.

No persistir:

- access/refresh tokens;
- contraseñas;
- SAS;
- activation/reset URLs;
- blobs temporales;
- credenciales Microsoft;
- snapshots de seguridad.

Sólo se persisten preferencias no sensibles que realmente deban sobrevivir a un reload.

## 15. Flujo de cambios

Para cambios relevantes:

1. partir de `main` actual;
2. modificar la autoridad canónica, no crear overrides laterales;
3. retirar código/documentación reemplazados;
4. esperar Repository Integrity, Public Home Integrity cuando aplique y Trusted PR preview;
5. fusionar sólo con CI verde;
6. verificar el release productivo del SHA exacto;
7. dejar `main` sin helpers, workflows o archivos de migración temporales.

Dependabot mantiene semanalmente dependencias npm y GitHub Actions; sus cambios deben atravesar el mismo circuito de revisión y CI.

## 16. Regla final

Antes de añadir una capa nueva:

> ¿Ya existe una autoridad para esta responsabilidad?

Si existe, se corrige o amplía esa autoridad. No se crea una segunda implementación.
