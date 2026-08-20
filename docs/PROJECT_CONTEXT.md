# ONION SUPPORT — CONTEXTO CANÓNICO DEL FRONTEND

> Actualizado: 2026-08-20.  
> Describe la arquitectura productiva esperada del repositorio `avila199817/onionsupport`. Si documentación y código divergen, el código de `main` es la autoridad.

## 1. Alcance

Onion Support es una SPA JavaScript modular desplegada en Azure Static Web Apps.

- Frontend: `https://www.onionsupport.com`
- API: `https://api.onionit.net`
- Idioma funcional: español
- Roles funcionales: `admin` y `user`
- Entry point JS: `src/main.js`
- Registry global: `src/app/enhancements.js`
- Entry point CSS: `src/css/app.css`
- Router: `src/router/`
- HTTP: `src/core/http.js`
- Auth: `src/features/auth/`

Este repositorio es exclusivamente frontend. No debe duplicar, simular ni inventar lógica del backend.

## 2. Regla arquitectónica

Debe existir una sola autoridad por responsabilidad.

No crear:

- otro router, cliente HTTP, sistema de auth o store de sesión;
- otro orquestador global desde `index.html`;
- otra paleta/design system por vista;
- APIs de vista que inventen endpoints;
- rutas o roles preparados “por si acaso”;
- almacenamiento persistente de secretos, tokens o SAS;
- CSS `patch`, `hotfix`, `final-fix`, `override-vX` o equivalentes;
- observers/listeners correctores cuando la fuente canónica puede emitir directamente el estado correcto.

Las vistas separan, cuando el dominio lo permite:

1. API y normalización;
2. controlador/lifecycle DOM;
3. template HTML;
4. CSS scopeado y basado en tokens.

## 3. Boot único

`index.html` mantiene sólo lo imprescindible antes del App:

- `src/preboot/theme.js` como script clásico de tema previo al paint;
- `src/css/app.css` como stylesheet principal;
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

## 7. Vistas productivas

### Incidencias

Listado, creación, detalle, adjuntos, comentarios, lifecycle, estados/prioridad/tipo, cierre/reapertura, refresco autónomo y previews de media.

### Facturas

Listado, creación, detalle, PDF, envío y relación con incidencias. Las colecciones del dominio se preservan como arrays.

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

## 8. CSS y design system

`src/css/app.css` es la única entrada CSS global.

La arquitectura usa:

- tokens globales;
- reset/core/layout;
- App Chrome;
- componentes compartidos;
- CSS privado cargado por ruta;
- composiciones transversales;
- guardrails finales de geometría.

Reglas:

- dark/light salen de tokens globales;
- no crear paletas completas paralelas por vista;
- `!important` no es estrategia de composición;
- una refactorización elimina reglas sustituidas en lugar de apilarlas;
- el CSS público progresivo también entra por `app.css`, no mediante `<link>` laterales.

## 9. Seguridad frontend

La SPA nunca sustituye la autorización del backend.

Frontend debe:

- ocultar acciones no permitidas por rol;
- no exponer tokens, secretos ni SAS en snapshots/logs;
- no convertir URLs privadas en públicas;
- evitar storage persistente para credenciales y datos efímeros;
- usar `core/http.js` para auth/refresh y peticiones protegidas;
- mantener rutas privadas con `noindex`/`nofollow`.

Backend sigue siendo autoridad final de ACL, propiedad de recursos y mutaciones.

## 10. Azure Static Web Apps y SEO

`staticwebapp.config.json` define fallback SPA, headers de seguridad, cache y `X-Robots-Tag` para rutas privadas.

`robots.txt`, `sitemap.xml` y la configuración estática deben permanecer alineados. `sitemap.xml` contiene sólo URLs públicas indexables.

El archivo raíz con nombre hexadecimal es la clave pública de verificación de IndexNow y forma parte del contrato SEO; no es un temporal.

## 11. CI e integridad

### Repository Integrity

`.github/workflows/repo-integrity.yml` valida:

- sintaxis de todos los `src/**/*.js` con Node 22;
- contratos estructurales de `.github/scripts/repo_integrity.py`;
- entrypoint único mediante `.github/scripts/app_entrypoint_integrity.py`;
- `staticwebapp.config.json`;
- merge markers y whitespace.

### Public Home Integrity

`.github/workflows/public-home-contract.yml` usa `.github/scripts/public_home_integrity.py` como contrato único para landing, intake, UX, progreso de envío, registry de enhancements y CSS público.

No debe reaparecer un segundo workflow específico que duplique esas mismas comprobaciones.

### Azure Static Web Apps

`.github/workflows/azure-static-web-apps-polite-bay-086469a1e.yml` valida el contrato de despliegue/SEO/referencias y genera preview de PR o deploy productivo tras push a `main`.

## 12. Arrays y normalización

Un helper `first(...values)` selecciona el primer valor útil y no debe aplanar arrays del dominio.

Quedan prohibidos dentro de ese helper `values.flat(...)` y `values.flatMap(...)`: adjuntos, permisos, historial, líneas de factura y otras colecciones son valores completos.

## 13. Persistencia en navegador

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

## 14. Flujo de cambios

Para cambios relevantes:

1. partir de `main` actual;
2. modificar la autoridad canónica, no crear overrides laterales;
3. retirar código/documentación reemplazados;
4. esperar Repository Integrity, Public Home Integrity cuando aplique y Azure preview;
5. fusionar sólo con CI verde;
6. dejar `main` sin helpers, workflows o archivos de migración temporales.

## 15. Regla final

Antes de añadir una capa nueva:

> ¿Ya existe una autoridad para esta responsabilidad?

Si existe, se corrige o amplía esa autoridad. No se crea una segunda implementación.
