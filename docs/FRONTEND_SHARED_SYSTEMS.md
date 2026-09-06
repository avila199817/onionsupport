# Sistemas compartidos del frontend

> Consolidación implementada en [PR #487](https://github.com/avila199817/onionsupport/pull/487), con corrección de consentimiento en [PR #490](https://github.com/avila199817/onionsupport/pull/490). Estado de release, métricas y límites: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). Próximas entregas: [ROADMAP.md](ROADMAP.md).

Una autoridad por responsabilidad permite corregir un comportamiento en un solo lugar. No exige reunir toda la aplicación en un archivo: las vistas conservan su contenido y sus reglas de negocio, mientras delegan las operaciones comunes.

| Responsabilidad | Autoridad | Integración |
| --- | --- | --- |
| Identidad, iniciales, color y estado de imagen | `src/features/avatar-system/index.js` | Los consumidores describen la identidad; no gestionan otro fallback de imagen. |
| Escape, Tab, pila, foco y scroll modal | `src/features/entity-overlay/modal-lifecycle.js` | Cada propietario conserva render, borradores, confirmación y política de cierre. |
| Navegación, guards y commit de vista | `src/router/index.js` | Se conserva un Router y un host de vista comprometida. |
| Cancelación y respuestas vigentes | `src/core/async-scope.js` | Router, Correo y consentimiento comparten lifecycle; cada canal identifica su operación más reciente. |
| Carga visual | `src/css/components/skeleton.css` | Una capa global aporta pintura y animaciones; las vistas conservan la geometría necesaria. |
| Tokens y CSS de ruta | `src/css/app.css` y `src/router/styles.js` | No se añade otro cargador global ni otra paleta por pantalla. |
| Marca y páginas públicas | `src/core/public-site.js` | Catálogo consumido por generación estática y navegación SPA. |
| Escritura de metadatos DOM | `src/router/page-metadata.js` | Actualiza título, canonical, robots, Open Graph, Twitter y JSON-LD al navegar. |

Los hosts de avatar proyectan los campos usados por `resolveAvatarPresentation` en `data-avatar-name`, `data-avatar-email`, `data-avatar-user-id` y `data-avatar-username`. El fingerprint y el tono no sustituyen esos aliases: el runtime necesita la identidad original para reconciliar cambios sin perder el email situado en otra celda ni inferir datos de una entidad contigua. Una proyección explícita delimita la identidad completa, incluidos aliases vacíos; sólo los hosts sin metadatos conservan el descubrimiento legacy. Las listas de gestión y los selectores/detalle de Facturas usan esta proyección. Home conserva también userId/username en sus relaciones cuando faltan emails; los demás detalles mantienen sus aliases explícitos. Los IDs de factura y cliente no se utilizan como IDs de usuario. La prioridad canónica sigue siendo email, userId y username: cambiar el email puede cambiar el fingerprint o color aunque el userId sea el mismo.

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

`npm run validate:ci` ejecuta contratos de fuente, pruebas de carreras asíncronas, compilación reproducible, inventario del artefacto y pruebas de navegador. `npm run test:browser:ui` cubre avatares, modales, carga visual, consentimiento con CSS lento o fallido y transiciones reales de metadatos. El contrato de avatares compara también la identidad antes y después de sincronizar templates reales de Home, Incidencias, Facturas, Clientes y Usuarios, incluido el técnico separado del solicitante y los detalles de Usuarios/Facturas. Se requiere Chrome/Chromium; puede indicarse su ejecutable con `CHROME_BIN`.

El alcance no es reescribir cada API de dominio ni fusionar todas las máquinas de estado. Las nuevas vistas deben consumir estas autoridades; los controladores históricos conservan reglas de dominio y adaptadores que no son intercambiables. La autenticación, la autorización efectiva y los datos de negocio siguen siendo responsabilidad del backend.
