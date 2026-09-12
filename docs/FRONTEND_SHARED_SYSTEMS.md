# Sistemas compartidos del frontend

> Consolidación implementada en [PR #487](https://github.com/avila199817/onionsupport/pull/487), con corrección de consentimiento en [PR #490](https://github.com/avila199817/onionsupport/pull/490). La [entrega del 2026-09-08](releases/2026-09-08-single-modal-session.md) amplía la autoridad de modales a una sola sesión de detalle para los cuatro dominios. Estado de release, métricas y límites: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). Próximas entregas: [ROADMAP.md](ROADMAP.md).

Una autoridad por responsabilidad permite corregir un comportamiento en un solo lugar. No exige reunir toda la aplicación en un archivo: las vistas conservan su contenido y sus reglas de negocio, mientras delegan las operaciones comunes.

| Responsabilidad | Autoridad | Integración |
| --- | --- | --- |
| Identidad, iniciales, color y estado de imagen | `src/features/avatar-system/index.js` | Los consumidores describen la identidad; no gestionan otro fallback de imagen. |
| Apertura de detalle, origen y sustitución de entidad | `src/features/entity-overlay/index.js` | Home, listas, relaciones y APIs públicas invocan `EntityOverlay.open`; una sesión y un controlador de detalle. |
| Escape, Tab, pila, foco y scroll modal | `src/features/entity-overlay/modal-lifecycle.js` | Cada propietario conserva render, borradores, confirmación y política de cierre. |
| Montaje, retirada y actualización del panel privado | `src/features/entity-overlay/modal-host.js` | Una lease conserva la propiedad del nodo; el renderer mantiene panel, foco y scroll al actualizar el mismo diálogo. |
| Perfil confirmado de la sesión actual | `src/features/user-profile/index.js` y Core | Cuenta y Usuarios comparten reconciliación y orden de escrituras. Core conserva el único usuario de sesión. |
| Métricas y estadísticas de Facturas | `src/core/statistics.js`, `src/views/facturas/facturas.stats.js` | Selectores puros, sin caché adicional. Home y Facturas comparten los campos del servidor y distinguen desconocido de cero. |
| Texto de presentación y escape HTML | `src/core/presentation-text.js` | Home, pendientes y consumidores privados reutilizan las funciones; las políticas de transporte y límites siguen explícitas. |
| Navegación, guards y commit de vista | `src/router/index.js` | Se conserva un Router y un host de vista comprometida. |
| Cancelación y respuestas vigentes | `src/core/async-scope.js` | Router, EntityOverlay, Correo y consentimiento comparten lifecycle; cada canal identifica su operación más reciente. |
| Carga visual | `src/css/components/skeleton.css` | Una capa global aporta pintura y animaciones; las vistas conservan la geometría necesaria. |
| Tokens y CSS de ruta | `src/css/app.css` y `src/router/styles.js` | No se añade otro cargador global ni otra paleta por pantalla. |
| Marca y páginas públicas | `src/core/public-site.js` | Catálogo consumido por generación estática y navegación SPA. |
| Escritura de metadatos DOM | `src/router/page-metadata.js` | Actualiza título, canonical, robots, Open Graph, Twitter y JSON-LD al navegar. |

Los hosts de avatar proyectan los campos usados por `resolveAvatarPresentation` en `data-avatar-name`, `data-avatar-email`, `data-avatar-user-id` y `data-avatar-username`. El fingerprint y el tono no sustituyen esos aliases: el runtime necesita la identidad original para reconciliar cambios sin perder el email situado en otra celda ni inferir datos de una entidad contigua. Una proyección explícita delimita la identidad completa, incluidos aliases vacíos; sólo los hosts sin metadatos conservan el descubrimiento legacy. Las listas de gestión y los selectores/detalle de Facturas usan esta proyección. Home conserva también userId/username en sus relaciones cuando faltan emails; los demás detalles mantienen sus aliases explícitos. Los IDs de factura y cliente no se utilizan como IDs de usuario. La versión `avatar-identity.v5-user-id-first` prioriza userId, después email y username. Con el mismo userId, cambiar o borrar email/username no altera fingerprint ni tono. La transición cambia una vez el tono de algunos usuarios y conserva la paleta de 20 colores y el hash existentes.

## Contrato de identidad visual

La [consolidación privada del 2026-09-12](releases/2026-09-12-private-centralization.md) incorpora Cuenta al contrato de avatar explícito. Las respuestas de perfil se aplican sólo a su sesión e ID de origen; un GET anterior a una escritura confirmada no puede restaurar datos antiguos. La autoridad privada conserva revisión y operación pendiente, nunca una segunda copia del perfil. Las vistas y cachés de Clientes, Usuarios, Incidencias y Facturas reaccionan a la confirmación mediante sus propietarios existentes.

- `identity.js` resuelve la presentación; `AvatarSystem` reconcilia el DOM. Los IDs de usuario explícitos distintos nunca se unen por email o nombre. Un snapshot sin vínculo de usuario demostrado mantiene el fallback por email/username/nombre; no se inventan IDs ni se crea un registro de correspondencias.
- El solicitante y el técnico del detalle de Incidencias comparten los selectores de identidad de `incidencias-comment-identity` con sus comentarios; el listado también reutiliza la identidad del técnico. Los comentarios se asocian por su ID persistido de evento cuando existe; un autor tercero conserva su userId aunque no haya perfil o foto disponibles. Los constructores iniciales y dinámicos reservan `data-comment-id` para IDs persistidos, sin confundirlos con claves de presentación generadas. Un comentario histórico por email/nombre no adopta el userId de otro perfil por coincidencia de aliases.
- La estabilidad del fingerprint no congela contenido: las firmas de soporte público incluyen los aliases visibles, y comentarios/seguimiento actualizan también aliases vacíos. Las respuestas incompletas del técnico conservan su identidad conocida; un campo explícitamente vacío elimina el dato anterior y una reasignación a otro ID no hereda el perfil anterior.
- El perfil técnico selecciona su foto desde las proyecciones de ticket/Usuarios y delega su estado a AvatarSystem. Se retira `incidencias-technician-avatar-bridge`: copiar una foto de otro host del DOM podía recuperar una imagen obsoleta después de borrarla. Home y Facturas respetan `hasAvatar=false` antes de buscar fuentes antiguas en raw/snapshots.
- La normalización visual del ID no sustituye al identificador de transporte. El perfil técnico conserva el ID original de la entidad de usuario para las peticiones HTTP, incluidas sus mayúsculas; el alias visual normalizado no se usa para inventar un identificador de lectura.
- El backend debe proyectar el userId real cuando ya ha resuelto un vínculo cliente→usuario. El frontend no trata `clienteId`, `facturaId`, `ticketId` o metadata sin procedencia probada como identidad de usuario. Los históricos sin vínculo recuperable quedan como fallback explícito y no se equiparan a perfiles identificados.

## Contrato de detalle transversal

`EntityOverlay` prepara los módulos y estilos, valida el origen comprometido y posee la cancelación de una sesión. Las factories `createFacturaDetailController`, `createIncidenciaDetailController`, `createClienteDetailController` y `createUsuarioDetailController` conservan los modales reales del dominio en modo `detailOnly`, sin montar listados. La ruta de origen permanece visible y sólo el Router escribe navegación.

Cada apertura tiene una sola invocación inicial a la API de detalle. Incidencias y Facturas conservan el panel conectado en carga, error, reintento y refresco. Estado, live sync y avatares de Incidencias reciben la proyección del controlador; las señales solicitan el refresco a ese mismo propietario. Las listas posponen su reconciliación mientras su detalle está abierto y aplican los cambios al cerrar.

Las entradas, callbacks, contratos y ubicaciones para intervenir están definidos en [UI_MODAL_SYSTEM.md](UI_MODAL_SYSTEM.md). Se retiraron los puentes de apertura de Home/Facturas/Incidencias y los adaptadores de detalle de lectura de Clientes/Usuarios. Los adaptadores contextuales de identidad visual tienen otra responsabilidad y se conservan.

## Contrato de estadísticas

El backend determina los totales autorizados. `statistics.js` interpreta valores declarados sin sustituir ausencias por cero ni ignorar mínimos explícitos. `facturas.stats.js` proyecta esos campos para Home y Facturas; las filas paginadas no completan cantidades globales ausentes. Los indicadores de filas cargadas conservan su alcance visible.

La caché estándar de Home pertenece a la sesión y al dashboard sin filtros especiales. Las consultas particulares no la sobrescriben. Las peticiones concurrentes de estadísticas de Facturas se separan por sesión, consulta y revisión de escrituras; una respuesta invalidada no se convierte en la nueva cifra visible. Las facetas de Incidencias invalidan también la petición anterior cuando resuelven desde caché o desde una primera página completa.

## Errores corregidos

- En Correo, cambiar de carpeta invalida el lector anterior. Una respuesta tardía de mensajes, estado o buzones no puede escribir sobre otra operación ni después de desmontar la vista, incluso cuando el transporte ignora la cancelación.
- Los modales anidados no liberan el scroll ni devuelven el foco mientras otro modal sigue siendo propietario. Escape se procesa una vez y respeta los componentes que ya lo han consumido.
- El sistema de avatares detecta cambios de identidad y sustitución de imagen. Un fallo de carga no impide recuperar la foto al recibir una URL nueva.
- Los indicadores comparten sus animaciones y respetan reducción de movimiento. Las reglas de carga fría, refresco y carga incremental siguen separadas para conservar datos visibles.
- El consentimiento espera su hoja de estilos antes de mostrarse, evitando el salto desde su posición temporal en el documento. Si la hoja falla, los controles siguen disponibles sin estilo. Abrir preferencias durante la carga usa el scope asíncrono compartido y se cancela al cerrar o abandonar la ruta pública.

## Marca e indexación

La portada se titula exactamente **Onion Support**. Su descripción presenta soporte para particulares, autónomos y empresas en España, con asistencia remota y diagnóstico claro. La atención presencial se acuerda según servicio y ubicación; la dirección empresarial real no cambia.

Las cinco páginas de servicios mantienen URLs y canonical propios bajo `https://onionsupport.com`, enlaces HTML de navegación y jerarquía de datos estructurados. `/login` permanece accesible y rastreable, pero declara `noindex, follow` en HTML y cabecera HTTP y no aparece en el sitemap.

Para actualizar el catálogo y sus documentos derivados:

```bash
node tools/sync-public-site.mjs
node tools/sync-public-site.mjs --check
```

No editar los metadatos de cada HTML por separado. Los textos específicos de servicios viven en `tools/public-service-content.mjs`; la generación comparte plantilla, navegación, pie y metadatos.

Google decide los sitelinks y puede reescribir títulos o descripciones. La estructura técnica favorece una marca coherente y servicios subordinados, pero no garantiza una presentación idéntica a Apple ni la retirada inmediata de resultados ya indexados. Después del despliegue corresponde solicitar rastreo de la portada y del sitemap en Search Console.

Referencias oficiales: [sitelinks](https://developers.google.com/search/docs/appearance/sitelinks), [noindex rastreable](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [títulos](https://developers.google.com/search/docs/appearance/title-link).

## Verificación y límites

`npm run validate:ci` ejecuta contratos de fuente, pruebas de carreras asíncronas, compilación reproducible, inventario del artefacto y pruebas de navegador. `npm run test:browser:ui` cubre avatares, modales, carga visual, consentimiento con CSS lento o fallido y transiciones reales de metadatos. Los contratos de avatares comparan la identidad antes y después de sincronizar templates reales de Home, Incidencias, Facturas, Clientes y Usuarios, incluidos solicitante/técnico y los detalles. También cubren cambios y borrado de email con ID fijo, homónimos con IDs diferentes, autores terceros, contenido público actualizado y transporte del ID original durante la hidratación del técnico. Se requiere Chrome/Chromium; puede indicarse su ejecutable con `CHROME_BIN`.

El alcance no es reescribir cada API de dominio ni fusionar todas las máquinas de estado. Las nuevas vistas deben consumir estas autoridades; los controladores históricos conservan reglas de dominio y adaptadores que no son intercambiables. La autenticación, la autorización efectiva y los datos de negocio siguen siendo responsabilidad del backend.
