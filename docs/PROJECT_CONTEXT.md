# ONION SUPPORT — CONTEXTO CANÓNICO DEL FRONTEND

> Actualizado: 2026-08-19.  
> Esta documentación describe el estado real del repositorio `avila199817/onionsupport`. Si una afirmación entra en conflicto con el código, `main` es la autoridad.

## 1. Qué es este repositorio

Onion Support es una SPA JavaScript modular desplegada como sitio estático en Azure Static Web Apps.

- Frontend canónico: `https://www.onionsupport.com`
- API canónica: `https://api.onionit.net`
- Idioma funcional actual: español (`es`)
- Roles funcionales: `admin` y `user`
- Entry point: `src/main.js`
- CSS principal: `src/css/app.css`
- Router único: `src/router/`
- HTTP único: `src/core/http.js`
- Auth: `src/features/auth/`

Este repositorio contiene el frontend. El backend no debe duplicarse, simularse ni inferirse aquí.

## 2. Principios que no se negocian

La SPA debe mantener una sola autoridad por responsabilidad.

No crear:

- otro router;
- otro cliente HTTP;
- otro sistema de auth;
- otro store de sesión;
- otra paleta o design system por vista;
- APIs de vista que inventen endpoints;
- rutas o roles preparados “por si acaso”;
- almacenamiento persistente de secretos, tokens o SAS;
- parches CSS acumulativos para corregir arquitectura incorrecta.

Las vistas deben separar, siempre que el dominio lo permita:

1. API/normalización del dominio;
2. controlador/lifecycle DOM;
3. template HTML puro;
4. CSS scopeado a la vista y basado en tokens globales.

## 3. Estructura raíz relevante

```text
.github/
  scripts/
  workflows/
docs/
src/
favicon.ico
index.html
robots.txt
site.webmanifest
sitemap.xml
staticwebapp.config.json
```

La raíz pública mantiene una landing indexable y las rutas privadas de la SPA se protegen con `noindex`/`nofollow` en la configuración estática.

## 4. Boot de la SPA

`index.html` carga:

- `src/preboot/theme.js`
- `src/css/app.css`
- `src/main.js`

`src/main.js` delega el arranque a `src/app/`.

`src/app/` coordina boot, shell, sesión y montaje de UI. No contiene un segundo router ni un segundo sistema de auth.

No existe actualmente un motor i18n funcional conectado al boot. El antiguo `src/i18n/` fue retirado porque no tenía consumidores productivos. El código y los textos de interfaz actuales se mantienen en español.

## 5. Core

`src/core/` concentra contratos transversales.

Responsabilidades relevantes:

- `config.js`: URLs, rutas centrales, roles y configuración segura;
- `http.js`: único cliente HTTP de la SPA;
- `media.js`: política runtime de URLs de imagen del shell;
- `index.js`: estado/core compartido y acceso al usuario actual.

Reglas:

- Las vistas no usan `fetch` directo para operaciones de dominio si existe el cliente HTTP canónico.
- Las URLs runtime de imagen sólo pueden usar orígenes permitidos.
- SAS sólo se admite donde el contrato lo necesita y únicamente para Azure Blob Storage.
- Los roles válidos del producto son `admin` y `user`.

## 6. Router y rutas

El router único vive en `src/router/`.

Rutas públicas principales:

- `/`
- `/login`
- `/password-request`
- `/password-reset`
- `/activate-account`

Home privada visible:

- `/@{slug}`

Rutas privadas principales:

- `/incidencias`
- `/facturas`
- `/clientes`
- `/usuarios`
- `/correo`
- `/servidor`
- `/cuenta`

`/ajustes` se conserva únicamente como URL legacy de compatibilidad. Router carga la implementación canónica de `Cuenta`; no existe una segunda vista `Ajustes`, no aparece en sidebar y no participa en búsqueda global.

Admin-only actualmente:

- Clientes
- Usuarios
- Correo
- Servidor

El sidebar controla visibilidad. El router sigue siendo la autoridad de acceso.

## 7. Vistas productivas

`src/views/` contiene los módulos de producto.

### Home

- dashboard privado;
- cache y agregación delegados a su API;
- actividad reciente con identificadores de dominio claros;
- design system global.

### Incidencias

- listado, creación y detalle;
- adjuntos, comentarios y lifecycle;
- edición admin de estado, prioridad y tipo;
- cierre/reapertura mediante contratos del dominio;
- refresco autónomo del listado;
- identidad visual consistente de avatares;
- opciones canónicas compartidas entre creación y detalle.

### Facturas

- listado, creación y detalle;
- PDF, envío y relación con incidencias;
- colecciones del dominio preservadas como arrays;
- diseño alineado con Incidencias y tokens globales.

### Clientes

- listado admin;
- creación a partir de usuario real;
- detalle read-only con contratos reales del backend;
- sin inventar update/delete si no existen.

### Usuarios

- listado y alta administrativa;
- detalle de usuario;
- contratos HTTP centralizados;
- política de avatares compatible con Azure Blob SAS runtime;
- no persistir secretos, activation URLs ni SAS.

### Correo

- integración Microsoft a través del backend Onion;
- sin tokens Microsoft en navegador;
- carpeta/lista/lector, compose, replies, forward, drafts y adjuntos;
- scroll infinito y cache efímera del módulo;
- única persistencia browser intencional: preferencia booleana de notificaciones;
- ruta admin-only y `noindex`.

### Servidor

- vista administrativa;
- acceso admin-only;
- usa contratos del backend, sin inventar infraestructura local.

### Cuenta

- self-service del usuario autenticado;
- identidad y preferencias informativas;
- avatar;
- cambio de contraseña;
- sesiones bajo demanda;
- desactivación de cuenta;
- no usa `/api/users/:id` para editar el usuario actual;
- no simula PATCH/PUT self para campos que el backend no expone.

## 8. CSS y design system

La entrada única es `src/css/app.css`.

La arquitectura visual usa:

- tokens globales;
- core/layout compartido;
- sidebar/topbar/shell globales;
- CSS de vista en `src/css/views/`.

Reglas:

- dark/light deben salir de tokens globales;
- no crear una paleta completa paralela por vista;
- evitar `!important` como estrategia de composición;
- no añadir archivos `final-fix`, `override-vX` o similares;
- una refactorización debe eliminar reglas sustituidas, no apilarlas.

Las vistas principales Incidencias, Facturas, Clientes, Usuarios, Home y Cuenta ya han pasado por una consolidación visual sobre este criterio.

## 9. Seguridad frontend

La SPA nunca sustituye la autorización del backend.

Frontend debe:

- ocultar acciones no permitidas por rol;
- no exponer tokens ni secretos;
- no convertir URLs privadas en URLs públicas;
- redacted logs/snapshots;
- evitar storage persistente para credenciales y datos efímeros;
- usar `core/http.js` para auth/refresh y peticiones protegidas;
- usar rutas privadas con `noindex`/`nofollow`.

Backend sigue siendo autoridad final de ACL, propiedad del recurso y mutaciones.

## 10. Azure Static Web Apps y SEO

`staticwebapp.config.json` define:

- fallback/rewrite SPA;
- headers de seguridad;
- cache;
- rutas privadas con `X-Robots-Tag: noindex, nofollow`.

`robots.txt` y `staticwebapp.config.json` deben mantenerse alineados.

El validador permanente `.github/scripts/repo_integrity.py` comprueba que estas rutas privadas tengan contrato estático correcto:

- incidencias;
- facturas;
- clientes;
- usuarios;
- correo;
- servidor;
- cuenta;
- ajustes (alias legacy privado).

`sitemap.xml` contiene únicamente URLs públicas indexables.

## 11. Integridad y CI

### Repository Integrity

Workflow:

- `.github/workflows/repo-integrity.yml`

Valida en cada PR/push a `main`:

- sintaxis de todos los `.js` bajo `src/` con Node.js 22;
- imports/export/import() locales existentes;
- assets locales y `@import` CSS;
- `new URL(..., import.meta.url)` locales;
- rutas privadas Azure/robots;
- contrato de helpers `first(...values)` para no destruir arrays;
- `staticwebapp.config.json` válido;
- merge markers;
- whitespace del diff.

### Azure Static Web Apps

Workflow:

- `.github/workflows/azure-static-web-apps-polite-bay-086469a1e.yml`

Responsabilidades:

- validación de contrato estático;
- validación SEO;
- validación de referencias públicas;
- ejecución del validador de integridad;
- validación de contratos críticos SPA;
- preview de PR;
- deploy productivo tras push a `main`.

No debe mantener una segunda auditoría permisiva que sólo emita warnings para imports rotos.

## 12. Arrays y normalización

Un helper genérico `first(...values)` selecciona el primer valor útil; no debe aplanar arrays del dominio.

Está prohibido dentro de ese helper:

- `values.flat(...)`
- `values.flatMap(...)`

Motivo: adjuntos, permisos, historial, líneas de factura y otras colecciones son valores completos. Aplanarlas antes de seleccionarlas puede convertir un array en un elemento suelto silenciosamente.

El CI bloquea esta regresión.

## 13. Ajustes legacy

La antigua implementación `src/views/ajustes/` fue eliminada porque duplicaba Cuenta y contenía referencias a módulos ya borrados.

Estado actual:

- `/ajustes` sigue resolviendo para no romper enlaces antiguos;
- carga `Cuenta` como módulo real;
- carga el CSS de `Cuenta`;
- no aparece como segunda opción de menú;
- no existe API/store/template paralelo de Ajustes.

No reintroducir `ajustes.state.js`, `ajustes.store.js`, `ajustes.model.js`, `ajustesView.js` ni `ajustesEditView.js`. El validador de integridad bloquea esas referencias.

## 14. Persistencia en navegador

Regla general: memoria antes que storage persistente.

Persistencia permitida sólo para preferencias no sensibles que necesiten sobrevivir a un reload, por ejemplo la preferencia booleana de notificaciones de Correo.

No persistir en browser storage:

- access/refresh tokens;
- contraseñas;
- SAS;
- activation/reset URLs;
- blobs temporales;
- credenciales Microsoft;
- snapshots de seguridad.

Cualquier cache de datos administrativos debe revisarse explícitamente antes de hacerse persistente.

## 15. Flujo de cambios

Para cambios relevantes:

1. partir de `main` actual;
2. modificar la fuente canónica, no añadir overrides laterales;
3. ejecutar/esperar Repository Integrity;
4. esperar Azure preview/deploy del PR;
5. fusionar sólo con CI verde;
6. dejar `main` sin helpers temporales ni workflows de migración;
7. el push a `main` dispara el circuito productivo.

## 16. Regla final

Antes de añadir una nueva capa, preguntar:

> ¿Ya existe una autoridad para esta responsabilidad?

Si la respuesta es sí, se extiende o corrige esa autoridad. No se crea una segunda implementación.
