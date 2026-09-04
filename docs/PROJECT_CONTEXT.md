# ONION SUPPORT — CONTEXTO CANÓNICO DEL FRONTEND

> Actualizado: 2026-09-04.
> Corte de evidencia: 2026-09-04, UTC. Describe el estado observado y las reglas del repositorio `avila199817/onionsupport`. El código de `main` define la implementación; los runs enlazados acreditan la revisión desplegada. Una regla objetivo no acredita por sí sola que todos los consumidores la cumplan.

## Estado del proyecto y evidencia

La última versión funcional verificada de esta sesión es [`5d82b0d0f5757868b52be156cbf8d38a28a7e276`](https://github.com/avila199817/onionsupport/commit/5d82b0d0f5757868b52be156cbf8d38a28a7e276). Los commits posteriores que sólo actualicen documentación deben distinguirse de esta referencia de runtime.

Usamos cuatro estados: **implementado** significa presente en el código; **desplegado**, publicado por el pipeline; **verificado**, contrastado mediante la evidencia y el alcance indicados; **pendiente/propuesto**, trabajo futuro. Ningún módulo queda certificado de extremo a extremo sólo porque su build o un health check sea correcto.

| Trabajo | Estado al corte | Evidencia y límite |
| --- | --- | --- |
| Avatar autenticado en topbar y prioridades Baja/Media/Alta | Integrado antes de la consolidación | La revisión de [PR #482](https://github.com/avila199817/onionsupport/pull/482) confirma los commits ya integrados y sus tres contratos dirigidos. Se cerró sin fusionar una segunda implementación. |
| AvatarSystem, modales, AsyncScope, carga visual y SEO nacional | Implementado y desplegado | [PR #487](https://github.com/avila199817/onionsupport/pull/487), commit `26f546ab`; la consolidación retiró duplicaciones y dejó las autoridades descritas en este documento. No significa que cada normalizador o política de URL privada ya esté migrado. |
| Validadores compatibles y verificación SEO por checkout | Implementado y desplegado | [PR #486](https://github.com/avila199817/onionsupport/pull/486), [PR #488](https://github.com/avila199817/onionsupport/pull/488) y commit [`0ad1500f`](https://github.com/avila199817/onionsupport/commit/0ad1500f): `/login` noindex se comprueba sin relajar los presupuestos Lighthouse. |
| Salto visual del consentimiento | Corregido, desplegado y medido | [PR #490](https://github.com/avila199817/onionsupport/pull/490), commit `5d82b0d0`; CSS preparado antes de mostrar y apertura cancelable. El CLS móvil de la portada pasó a 0,000 en la medición descrita abajo. |
| Flujos privados con cuentas reales | Implementación existente; validación vertical completa pendiente | No se ha certificado en esta sesión login/refresh/logout, ACL, creación de tickets, adjuntos, facturación, correo real y avatar como un único recorrido contra producción. |
| Resultados visibles en Google | Política técnica publicada; evolución del índice pendiente de observar | No consta una inspección autenticada de Search Console ni una solicitud manual de reindexación en esta sesión. IndexNow correcto no acredita rastreo de Google ni sitelinks. |

La publicación de `5d82b0d0` tiene evidencias separadas:

- [Azure Static Web Apps, run 33924499365](https://github.com/avila199817/onionsupport/actions/runs/33924499365): despliegue correcto.
- [Production Verification Gate, run 33924660120](https://github.com/avila199817/onionsupport/actions/runs/33924660120): verificación de producción correcta.
- [Disponibilidad, run 33924660130](https://github.com/avila199817/onionsupport/actions/runs/33924660130): comprobación correcta.
- [IndexNow, run 33924660157](https://github.com/avila199817/onionsupport/actions/runs/33924660157): ejecución correcta del envío previsto por el workflow.
- [Lighthouse, run 33924660177](https://github.com/avila199817/onionsupport/actions/runs/33924660177): 30 muestras, incluidos HTML y HTTP `noindex, follow` en las diez muestras del acceso.

### Rendimiento: resultado y trabajo abierto

Estas son medianas sintéticas de **cinco muestras de portada por perfil**, comparando la revisión inicial `808a536` con `5d82b0d0`. La comparación y sus condiciones constan en [PR #490](https://github.com/avila199817/onionsupport/pull/490) y el [run de Lighthouse](https://github.com/avila199817/onionsupport/actions/runs/33924660177); no son métricas de usuarios reales ni una garantía para todas las páginas.

| Métrica de portada | Antes móvil | Después móvil | Antes escritorio | Después escritorio |
| --- | --- | --- | --- | --- |
| Rendimiento Lighthouse | 75 | 87 | 92 | 100 |
| CLS | 0,217 | 0,000 | 0,172 | 0,006 |
| Accesibilidad / buenas prácticas / SEO público después | — | 100 / 100 / 100 | — | 100 / 100 / 100 |

Siguen abiertos dos avisos del perfil móvil: **TBT de portada 404 ms frente a 300 ms** y **LCP de acceso 2.573 ms frente a 2.500 ms**. El workflow finalizó correctamente con esos avisos; no se redujeron umbrales. La comparación local alternada no reprodujo el aumento de TBT observado en CI y no aporta evidencia suficiente para atribuirlo a AvatarSystem o a la consolidación. El siguiente cambio de rendimiento debe partir de una reproducción controlada, como establece el [roadmap](ROADMAP.md).

### Decisiones vigentes

1. Una autoridad por responsabilidad, con controladores de dominio separados. No se hará una macroreescritura ni se reunirá toda la aplicación en una función universal.
2. El backend conserva autenticación efectiva, ACL y negocio. Compartir un componente visual no comparte automáticamente permisos o cachés.
3. Se corrige la fuente responsable y se retira la implementación sustituida; los adaptadores con consumidores reales se eliminan sólo después de migrarlos y verificar compatibilidad.
4. El siguiente bloque es el recorrido vertical frontend/backend. Las mejoras posteriores se entregan por módulo con criterios de aceptación y evidencia de release.
5. Un PR superado se cierra con motivo y referencia a su sustituto. Los workflows y los controles siguen activos; cerrar la cola no significa que nunca se puedan abrir nuevos PR legítimos.

El plan de trabajo vive únicamente en [ROADMAP.md](ROADMAP.md). La evidencia operativa del backend vive en [oniontech](https://github.com/avila199817/oniontech/blob/main/docs/COMO_LO_TENEMOS_AHORA.md); no se duplica aquí su inventario Azure.

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

AvatarSystem es la autoridad transversal de identidad visual, estado de imagen y paint de avatares. Incluye las superficies privadas y el avatar de cuenta visible en la portada con sesión; no arranca como motor de avatares en la portada anónima.

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

Integración Microsoft a través del backend Onion, sin tokens Microsoft en navegador; carpeta/lista/lector, compose, replies, forward, drafts, adjuntos, scroll infinito y caché de mensajes en memoria. El código también persiste en `localStorage` la preferencia de notificaciones, el buzón elegido por propietario y la firma de texto por propietario/buzón. No debe describirse como si sólo persistiera un booleano. La revisión de retención y cambio de cuenta está pendiente en el roadmap.

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

La política objetivo es persistir únicamente preferencias justificadas y minimizar los datos privados. El código actual todavía contiene excepciones que requieren una entrega específica:

| Consumidor observado | Persistencia presente | Trabajo pendiente |
| --- | --- | --- |
| `src/views/clientes/clientes.api.legacy.js` | Caché proyectada de clientes con datos identificativos y de contacto; elimina URLs temporales de avatar en su proyección | Verificar lectura, retención, aislamiento entre sesiones y borrado; decidir su sustitución por memoria. |
| `src/views/usuarios/usuarios.api.js` | Caché proyectada de usuarios con identidad, contacto y metadatos de cuenta/seguridad; no es un almacén de tokens | Aplicar la misma revisión y reducir los campos persistidos; su TTL de frescura no prueba borrado físico. |
| `src/views/correo/index.js` | Preferencias de notificación/buzón y firma, además de caché de mensajes en memoria | Comprobar necesidad, alcance por propietario y limpieza al cambiar de cuenta. |
| `src/views/cuenta/index.js` | Preferencias de tema e idioma | Mantener el contrato de preferencias y evitar que absorba datos de sesión. |

Esta revisión de fuente no demuestra una fuga entre usuarios ni certifica su ausencia. La validación vertical debe comprobar los límites con cuentas de prueba y aportar evidencia antes de modificar la política.

### Hallazgos históricos que no se arrastran sin comprobar

- Core actual (`core.minimal.v9-specialized-snapshot`) mantiene estado en memoria, snapshots saneados y puentes hacia módulos. Ya no expone un event bus `on/off/emit` genérico. Los eventos DOM de dominio que permanecen se revisan por consumidor.
- `first(...values)` conserva arrays. Los `flat(Infinity)` todavía presentes en Core pertenecen a normalización explícita de roles/permisos, no al selector `first`; no se clasifican automáticamente como el error antiguo.
- Facturas conserva `fetch` para un `blob:` local y para descargar un PDF desde una URL validada con `credentials: "omit"`. Eso no acredita un segundo cliente de API autenticada; la política de documentos sí debe entrar en la futura revisión de URLs.
- El inventario histórico de CSS —77 hojas, 1,29 MB, 194 `!important` y 3.079 colores— no es un inventario actual ni una medida del artefacto servido. Antes de una limpieza adicional se medirá de nuevo el SHA, fuente/build, bytes transferidos y cobertura por ruta.
- El doble motor de avatar quedó sustituido por la autoridad actual; PR #482 no se reabre para recuperar código que esa consolidación retiró.

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
