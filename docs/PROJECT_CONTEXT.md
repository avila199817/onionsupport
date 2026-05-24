# ONION SUPPORT — MAPA MAESTRO DEL PROYECTO

## 1. Identidad del proyecto

**Nombre:** Onion Support  
**Tipo:** SPA JavaScript modular  
**Idioma base:** Español (`es`)  
**Estilo:** SaaS panel premium / soporte técnico / control center

**Frontend canónico:**

- `https://www.onionsupport.com`
- `https://onionsupport.com`

**Backend/API pública:**

- `https://api.onionit.net`

**Objetivo:**

Onion Support es un panel SaaS privado para soporte técnico, incidencias, clientes, facturación, usuarios y administración interna.

El proyecto prioriza:

- SPA simple, rápida y mantenible.
- Arquitectura modular sin duplicidades.
- Auth robusta con sesión persistente.
- Rutas protegidas por sesión y rol.
- UI premium tipo panel/control center.
- Integración con API propia.
- Cosmos DB como almacenamiento principal.
- Crecimiento controlado sin capas paralelas.

---

## 2. Reglas arquitectónicas base

La arquitectura debe mantenerse simple, explícita y coherente.

### Prohibido

No crear:

- `src/styles/`
- `shared/api/`
- `apiClient.js`
- rutas legacy
- rutas preparadas “por si acaso”
- clientes HTTP paralelos
- sistemas de toast duplicados
- stores que autentiquen por sí mismos
- routers paralelos
- lógica de auth dentro de vistas

No declarar rutas inexistentes como:

- `/403`
- `/404`
- `/2fa`
- `/otp`
- `/mfa`
- `/home`

No implementar ahora:

- 2FA
- MFA
- OTP
- TOTP
- backup codes
- `otp_codes`
- flujos de verificación OTP
- flujos preparados para MFA

Cualquier referencia antigua a eso se considera legacy/ruido.

---

## 3. Estructura raíz actual

Archivos y carpetas raíz relevantes:

- `.github/`
- `docs/`
- `src/`
- `favicon.ico`
- `index.html`
- `robots.txt`
- `site.webmanifest`
- `staticwebapp.config.json`

Archivos eliminados intencionadamente:

- `sitemap.xml`
- `BingSiteAuth.xml`

### Estado de raíz

- `index.html`: entrada física única de la SPA.
- `staticwebapp.config.json`: routing, fallback y headers de Azure Static Web Apps.
- `robots.txt`: bloqueo de crawlers.
- `site.webmanifest`: manifiesto mínimo de la app.
- `favicon.ico`: fallback raíz del navegador.
- `.github/workflows/`: deploy Azure Static Web Apps.
- `docs/`: documentación interna, no fuente canónica.
- `src/`: código real de la SPA.

La fuente de verdad del proyecto es el código real, especialmente:

- `index.html`
- `staticwebapp.config.json`
- `src/`

La carpeta `docs/` describe el proyecto. No debe imponer arquitectura inexistente.

---

## 4. Entrada SPA: `index.html`

`index.html` es la entrada física única de la SPA.

Responsabilidades:

- Declarar el documento HTML base.
- Definir idioma base `es`.
- Declarar mounts reales.
- Cargar preboot de tema antes del CSS.
- Cargar CSS principal.
- Cargar `/src/main.js` como entrypoint único.
- Exponer un loader inicial.
- Exponer fallback `noscript`.

No debe contener:

- JS inline.
- CSS inline.
- Auth.
- Router.
- API.
- Clientes HTTP.
- Lógica de sesión.
- Rutas inventadas.

### Cargas canónicas

- `/src/preboot/theme.js`
- `/src/css/app.css`
- `/src/main.js`

### Mounts reales

- `#app-loader`
- `#noscript-root`
- `#app-shell`
- `#sidebar-mount`
- `#topbar-mount`
- `#main-content`
- `#table-head`
- `#tablehead-container`
- `#app-content`
- `#view-container`

Los scripts de `app`, `ui`, `shell`, `router` y vistas deben reutilizar estos nodos.  
No deben crear mounts paralelos.

---

## 5. Azure Static Web Apps

Archivo:

- `staticwebapp.config.json`

Responsabilidades:

- Fallback SPA hacia `/index.html`.
- Bloqueo de rutas internas.
- Headers globales de seguridad.
- Cache básica para documentos estáticos.
- MIME types necesarios.

### Rutas bloqueadas

Actualmente deben bloquearse:

- `/api/*`
- `/.auth/*`
- `/staticwebapp.config.json`
- `/.env*`
- `/.git/*`
- `/.github/*`
- `/.vscode/*`
- `/.idea/*`
- `/docs/*`
- `/config/*`
- `/node_modules/*`
- `/package.json`
- `/package-lock.json`
- `/pnpm-lock.yaml`
- `/yarn.lock`
- `/vite.config.*`
- `/webpack.config.*`
- `/README*`
- `/CHANGELOG*`
- `/LICENSE*`
- `/sitemap.xml`
- `/apple-touch-icon.png`

Motivos:

- La API real vive fuera del frontend: `https://api.onionit.net`.
- No se usa Azure Auth para la sesión de la SPA.
- `docs/` no debe publicarse.
- `sitemap.xml` y `BingSiteAuth.xml` fueron eliminados.
- La SPA es privada/noindex.

---

## 6. Robots e indexación

Archivo:

- `robots.txt`

Contenido actual:

- `User-agent: *`
- `Disallow: /`

Además, el proyecto usa headers/meta de no indexación:

- `noindex`
- `nofollow`
- `noarchive`
- `noimageindex`
- `nosnippet`

La SPA es privada.  
No se usa sitemap público en esta fase.

---

## 7. Manifest e iconos

Archivo:

- `site.webmanifest`

Uso:

- Manifest mínimo.
- Idioma `es`.
- `start_url: "/"`
- `scope: "/"`
- `display: "standalone"`

Icono público/manifest/auth:

- `/src/media/img/favicon_black_circle.png`

Fallback raíz:

- `/favicon.ico`

Logos corporativos principales:

- `/src/media/img/favicon_white.png`
- `/src/media/img/favicon_black.png`

Reglas:

- No usar versionado manual `?v=`.
- No crear `apple-touch-icon.png` separado salvo decisión posterior.
- No inventar tamaños/iconos que no existan físicamente.
- Las vistas públicas de auth/cuenta deben usar `favicon_black_circle.png`.

---

## 8. Workflow de deploy

Archivo:

- `.github/workflows/azure-static-web-apps-polite-bay-086469a1e.yml`

Responsabilidad:

- Deploy a Azure Static Web Apps.
- Sólo desde `main`.
- Preview para PRs internas hacia `main`.
- Cierre de preview al cerrar PR.
- Validación mínima del paquete estático.

Reglas:

- No usar build si la SPA sigue siendo estática sin bundler.
- No meter Node/npm si no es necesario.
- No exigir `sitemap.xml`.
- No exigir `BingSiteAuth.xml`.
- Validar archivos críticos reales.

Archivos críticos esperados:

- `index.html`
- `staticwebapp.config.json`
- `site.webmanifest`
- `robots.txt`
- `favicon.ico`
- `src/main.js`
- `src/preboot/theme.js`
- `src/css/app.css`
- `src/media/img/favicon_black_circle.png`
- `src/media/img/favicon_white.png`
- `src/media/img/favicon_black.png`

---

## 9. Estructura actual de `src/`

Estructura raíz actual de código:

- `src/app/`
- `src/core/`
- `src/css/`
- `src/features/auth/`
- `src/i18n/`
- `src/media/img/`
- `src/preboot/`
- `src/router/`
- `src/services/`
- `src/shared/password-field/`
- `src/store/`
- `src/ui/`
- `src/views/`
- `src/main.js`

No crear carpetas paralelas si ya existe una responsabilidad asignada.

---

## 10. CSS / Design System

CSS canónico actual:

- `src/css/app.css`
- `src/css/core/noscript.css`

`index.html` carga sólo:

- `/src/css/app.css`

`noscript` carga sólo:

- `/src/css/core/noscript.css`

Reglas:

- No crear `src/styles/`.
- No duplicar CSS entre `styles` y `css`.
- No mover CSS sin auditoría previa.
- La auditoría del design system debe partir de los imports reales de `src/css/app.css`.
- Mantener tokens, layout, shell, sidebar, topbar, loader y vistas separados por responsabilidad real, no por nombres inventados.

---

## 11. App layer: `src/app/`

Carpeta actual:

- `src/app/boot-state.js`
- `src/app/constants.js`
- `src/app/errors.js`
- `src/app/events.js`
- `src/app/helpers.js`
- `src/app/i18n.js`
- `src/app/index.js`
- `src/app/loader.js`
- `src/app/router.js`
- `src/app/session.js`
- `src/app/shell.js`
- `src/app/ui.js`
- `src/app/warmup.js`

Responsabilidades esperadas:

- `index.js`: orquestador de boot llamado por `src/main.js`.
- `loader.js`: control exclusivo de `#app-loader`.
- `shell.js`: sincronización de shell/mounts reales.
- `router.js`: puente hacia `/src/router`, no router paralelo.
- `session.js`: hidratación/validación inicial delegando en auth/core.
- `ui.js`: montaje UI global.
- `boot-state.js`: estado del arranque.
- `constants.js`: constantes app-level.
- `errors.js`: errores app-level.
- `events.js`: eventos app-level mínimos.
- `helpers.js`: helpers app-level mínimos.
- `i18n.js`: puente app-level hacia i18n.
- `warmup.js`: precalentamiento mínimo si procede.

No debe convertirse en:

- router paralelo.
- auth paralelo.
- store paralelo.
- cliente HTTP paralelo.
- capa de permisos paralela.

---

## 12. Core layer: `src/core/`

Responsabilidad:

- Configuración base.
- Estado mínimo de núcleo.
- Eventos básicos.
- HTTP/fetch centralizado.
- Sesión base.
- Utilidades transversales imprescindibles.

Reglas:

- La capa HTTP debe ser única.
- No crear `apiClient.js`.
- No crear `shared/api`.
- Las vistas no deben hacer `fetch` directo si existe servicio/API delegada.
- No duplicar auth/session entre core, app, services y features.

---

## 13. Router: `src/router/`

Responsabilidad:

- Resolver ruta actual.
- Aplicar guards.
- Renderizar vista correspondiente.
- Actualizar history.
- Sincronizar estado de ruta.
- Proteger rutas privadas.
- Proteger rutas admin-only.

Reglas:

- Ruta privada sin sesión válida redirige siempre a `/login`.
- No renderizar vistas privadas sin sesión válida.
- No inventar permisos.
- No crear rutas no existentes.
- No declarar `/403` ni `/404` si no existen como vistas reales.
- `/home` no es ruta canónica.
- Tras login correcto, la ruta privada Home debe ser `"/@{slug}"`.

Ejemplo:

- `/@isabelluque1970`

El slug debe salir del usuario validado.

---

## 14. Auth

Rutas públicas actuales:

- `/login`
- `/password-request`
- `/password-reset`
- `/activate-account`

Regla estricta de autenticación:

Un usuario está autenticado sólo si existe:

- token usable.
- usuario usable.

Usuario inválido si:

- `disabled === true`
- `status === "disabled"`
- `status === "deleted"`
- `status === "archived"`

La sesión debe ser persistente.

La app no debe expulsar al usuario por caducidad normal del access token si puede hacer refresh/silent refresh.

Sólo cerrar sesión por:

- logout explícito.
- revocación manual/admin.
- usuario disabled/deleted/archived.
- refresh token/sesión realmente revocada.
- fallo de seguridad crítico.

Reglas:

- No guardar secretos en memoria persistente de documentación.
- No exponer tokens.
- No loguear passwords, hashes, refresh tokens ni datos sensibles.
- No implementar 2FA/MFA/OTP ahora.

---

## 15. Roles y permisos

Roles únicos:

- `admin`
- `user`

No crear roles nuevos.

### Admin

Puede acceder a:

- Home / `@{slug}`
- Clientes
- Tickets
- Facturas
- Usuarios
- Servidor
- Search
- Módulos admin reales

### User

Puede acceder sólo a lo permitido para usuario normal:

- Home / `@{slug}`
- Tickets
- Facturas lectura
- Clientes lectura sólo si el flujo concreto lo permite
- Search lectura

Reglas actuales importantes:

- `/clientes` sólo admin.
- `/usuarios` sólo admin.
- `/servidor` sólo admin.

El sidebar no debe mostrar items admin-only a usuarios `user`.

---

## 16. Sidebar

Carpeta actual:

- `src/ui/sidebar/actions.js`
- `src/ui/sidebar/constants.js`
- `src/ui/sidebar/dom.js`
- `src/ui/sidebar/dropdown.js`
- `src/ui/sidebar/events.js`
- `src/ui/sidebar/index.js`
- `src/ui/sidebar/state.js`
- `src/ui/sidebar/template.js`
- `src/ui/sidebar/user.js`
- `src/ui/sidebar/visibility.js`

Responsabilidades:

- `template.js`: construir DOM/HTML del sidebar.
- `index.js`: controlador principal del sidebar SPA.
- `actions.js`: acciones del sidebar.
- `events.js`: listeners/eventos.
- `dom.js`: helpers DOM propios del sidebar.
- `state.js`: estado interno del sidebar.
- `user.js`: datos visuales del usuario/avatar.
- `visibility.js`: visibilidad por rol/ruta/estado.
- `dropdown.js`: dropdowns del sidebar.
- `constants.js`: constantes del sidebar.

Reglas:

- No duplicar responsabilidades.
- No meter guards de router dentro del sidebar.
- Sidebar oculta/enseña; router protege.
- `Clientes`, `Usuarios` y `Servidor` deben ser sólo admin.
- Avatar/foto debe usar datos reales del usuario validado si existen.
- Fallback de avatar sólo si no hay foto.

---

## 17. Toast / UI global

Toast único:

- `src/ui/toast/index.js`

Reglas:

- No crear bridges por vista.
- No crear toast paralelo en auth, views o app.
- Las vistas deben delegar en el toast global si necesitan feedback.

---

## 18. Store

Store mínimo.

Responsabilidad:

- estado UI.
- estado app.
- entidades cacheables.
- preferencias no sensibles.

No debe:

- autenticar por sí mismo.
- duplicar sesión.
- duplicar usuario canónico.
- duplicar router.
- guardar tokens sensibles.

Auth/session debe estar centralizada en el flujo real correspondiente.

---

## 19. Services

Responsabilidad:

- APIs del frontend hacia backend.
- Delegar en la capa HTTP única.
- No hacer lógica visual.
- No tocar DOM.
- No crear clientes paralelos.

Regla:

- Las vistas llaman servicios.
- Los servicios llaman HTTP/core.
- Las vistas no deberían llamar `fetch` directo salvo caso explícitamente justificado.

---

## 20. Views

Responsabilidad:

- Renderizar pantallas.
- Pedir datos mediante servicios.
- Delegar navegación al router.
- Delegar sesión/auth al módulo correspondiente.
- Delegar shell/sidebar/topbar a UI/app.

Reglas:

- No crear router interno.
- No crear HTTP client.
- No decidir sesión global.
- No duplicar guards.
- No meter permisos hardcodeados si ya existen guards/config.

---

## 21. i18n

Idioma base:

- `es`

Reglas:

- Español como fallback/base.
- No montar capas i18n paralelas.
- No detectar idioma de forma agresiva si rompe la base `es`.
- Cualquier detección futura debe partir de `es` como fallback.

Idiomas soportados declarados actualmente en HTML:

- `es`
- `ca`
- `en`

---

## 22. Backend / API

API pública actual:

- `https://api.onionit.net`

Reglas:

- El frontend no debe asumir Azure Functions locales en `/api`.
- No usar `/.auth`.
- No mezclar Azure Auth con auth propia.
- No duplicar endpoints ficticios.
- No guardar secretos reales en documentación ni código frontend.

---

## 23. Cosmos DB

### Contenedor `usuarios`

- Container: `usuarios`
- Partition key: `/userId`

Reglas:

- `id === userId`
- `docType = "user"`
- `entity = "usuario"`
- `schemaVersion = 3`

Roles sincronizados:

- `role`
- `rol`
- `roles`

Valores permitidos:

- `admin` / `["admin"]`
- `user` / `["user"]`

Schema names:

- `onionsupport.users.admin`
- `onionsupport.users.user`

No guardar en documentación:

- hashes
- TOTP
- backup codes
- NIF
- teléfonos
- direcciones completas
- tokens
- secretos

### Contenedor `tickets`

- Container: `tickets`
- Partition key: `/ticketId`

Reglas:

- `id === ticketId`
- `entityType = "ticket"`
- `tipoDocumento = "ticket"`
- `schemaVersion = 1`

Campos bilingües/legacy que deben mantenerse sincronizados:

- `tipo/type`
- `source/origen/channel`
- `subject/asunto/title`
- `message/description/descripcion/preview`
- `status/estado`
- `priority/prioridad`
- `category/categoria`

Relaciones principales:

- `userId`
- `clienteId`
- `userRef`
- `clienteRef`
- `requesterSnapshot`
- `relations`

Estado cerrado:

- `status = "closed"`
- `statusReason = "resolved"`
- `resolution.resolved = true`
- `resolution.code = "resolved"`
- `closedAt`

### Contenedor `sessions`

- Container: `sessions`
- Partition key: `/userId`

Reglas:

- `id === sessionId`
- `sessionId === id`
- `userId` apunta a `usuarios`

Sesión válida:

- `revoked === false`
- `expiresAt` futuro

Revocar sesión:

- `revoked = true`
- `revokedAt`
- `revokedBy`
- `revocationReason`

No guardar en documentación:

- IPs concretas
- user agents concretos
- ubicaciones concretas
- tokens
- secretos

---

## 24. Seguridad

Reglas generales:

- No guardar passwords.
- No guardar hashes.
- No guardar tokens.
- No guardar refresh tokens.
- No guardar connection strings.
- No guardar SAS.
- No guardar secretos.
- No guardar códigos OTP.
- No exponer PII innecesaria.
- Logs siempre redacted.
- Snapshots siempre redacted.
- Limpiar metadata Cosmos antes de `replace`/`upsert`.

Metadata Cosmos a limpiar antes de escrituras:

- `_rid`
- `_self`
- `_etag`
- `_attachments`
- `_ts`

---

## 25. Rutas actuales esperadas

### Públicas

- `/login`
- `/password-request`
- `/password-reset`
- `/activate-account`

### Privadas

- `/@{slug}`

### Admin-only

- `/clientes`
- `/usuarios`
- `/servidor`

Otras rutas privadas deben existir sólo si hay vista real y guard real.

No considerar `/home` ruta canónica.

---

## 26. Flujo post-login

Tras login correcto:

1. Validar token.
2. Validar usuario.
3. Rechazar usuario disabled/deleted/archived.
4. Obtener slug real del usuario.
5. Redirigir a `"/@{slug}"`.

No redirigir por defecto a `/home`.

---

## 27. Criterio para tocar código

Flujo obligatorio al modificar:

1. 1 bug / 1 archivo.
2. Revisar script completo.
3. Detectar responsabilidades reales.
4. No duplicar lógica.
5. No crear capas paralelas.
6. No inventar helpers/rutas/funciones.
7. Ajustar sólo lo necesario.
8. Devolver script íntegro si se modifica.
9. Indicar siguiente script recomendado.

Prioridad:

- precisión arquitectónica > velocidad.
- coherencia > parche rápido.
- mínimo cambio correcto > reescritura innecesaria.

---

## 28. Orden recomendado de auditoría

La raíz ya está prácticamente cerrada.

Siguiente orden recomendado:

1. `src/main.js`
2. `src/app/index.js`
3. `src/app/session.js`
4. `src/app/router.js`
5. `src/router/*`
6. `src/core/*`
7. `src/features/auth/*`
8. `src/services/*`
9. `src/ui/sidebar/*`
10. `src/css/app.css`

No saltar a carpetas internas sin validar primero el arranque.

---

## 29. Estado actual de limpieza

Completado:

- raíz del repo.
- workflow Azure SWA.
- `staticwebapp.config.json`.
- `robots.txt`.
- `site.webmanifest`.
- `index.html`.
- eliminación de `sitemap.xml`.
- eliminación de `BingSiteAuth.xml`.

Pendiente:

- auditoría `src/main.js`.
- auditoría app boot.
- auditoría session/auth.
- auditoría router/guards.
- auditoría sidebar admin-only.
- auditoría CSS real desde `src/css/app.css`.

---

## 30. Principio rector

Onion Support debe crecer como una SPA profesional, simple y coherente.

Cada archivo debe tener una responsabilidad clara.

Cada capa debe delegar en la capa correcta.

Cada nueva función debe justificar su existencia.

No se acepta complejidad preventiva.
