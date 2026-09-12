# Public: Home, acceso y servicios — 2026-09-12

## Alcance

Base: `8d9dab863aa65871591828ab50efb2a7a35a6b5c`. Refinamiento del frontend público solicitado por el propietario, manteniendo el Router, Auth, la API y la identidad de marca existentes.

- Home: jerarquía y copy orientados a explicar el servicio, CTA con contexto, cinco accesos directos del catálogo público, tarjetas sin servicios duplicados y contacto directo por teléfono, correo y WhatsApp. La ficha del técnico crece con su contenido y no recorta especialidades; se retiran movimiento magnético y ramas/iconos sin consumidores.
- Acceso: superficies, contraste, tipografía, foco y controles táctiles consistentes. Los mensajes de error son textos de producto; no se imprimen mensajes internos desconocidos del backend.
- Recuperación y activación: estados de envío, éxito y enlace ausente/caducado/usado; campos inutilizables ocultos y bloqueados; caminos de ayuda claros. El reintento de recuperación es explícito y no reenvía automáticamente. Una redirección fallida tras cambiar la contraseña conserva el éxito y el enlace al acceso.
- Navegación: los enlaces a páginas estáticas de servicio solicitan el documento real y quedan fuera de la captura de rutas SPA. Se prueba el clic normal desde Home a los cinco destinos en fuente y build; antes podía terminar en el login.
- Rendimiento: las rutas públicas de contraseña/activación conservan el handoff de tokens y dejan de precargar el módulo privado App Chrome. Se mantiene el presupuesto existente del grafo inicial. El retrato alinea `sizes` y preload con el ancho real: a 412 px y DPR 2 selecciona una única imagen de 640 px (34.592 bytes), en lugar de 960 px (81.454 bytes). A 720 px y DPR 2 mantiene la de 960 px.
- Servicios: navegación nativa entre las cinco páginas, indicación de página actual e información específica para preparar una consulta. Funciona también sin JavaScript.

## Verificación

La evidencia local incluye las comprobaciones de fuente, tooling confiable, build, distribución, reproducibilidad y navegador del proyecto. El contrato público recorre diez rutas, tres anchuras y dos temas, y comprueba enlaces, encabezados, pie, deep links, navegación y ausencia de controles utilizables con tokens ausentes. Se amplía con los accesos del hero, contacto directo, navegación nativa de servicios y ausencia de descargas de Chrome en pantallas públicas de contraseña/activación.

El nuevo contrato `tools/public-auth-state-contract.mjs` usa los controladores y DOM reales con Auth inyectado y red externa bloqueada. Cubre validación, contraseña pegada con espacios, mostrar/ocultar, deduplicación durante envío, errores seguros, reintento explícito, tokens inválidos, éxito y desmontaje con respuestas tardías. No certifica cuentas reales, recepción de correo ni una operación backend real.

La revisión visual usa capturas del build en móvil y escritorio; no se atribuyen puntuaciones Lighthouse antes de disponer de la comparación en CI. Los controles de release, presupuestos y separación público/privado permanecen activos.

### Resultado local e integración

Código validado: `da423244`, sobre el ajuste de contrato `e2f832cd`. Entorno: Node 22.23.2, npm 10.9.8 y Chromium 149.0.7827.0.

- `npm run validate`: PASS, incluyendo fuente, tooling, build y distribución.
- `npm run build:repro`: PASS, 192 archivos idénticos.
- Navegador público: PASS en fuente y build, diez rutas × tres anchuras × dos temas, más navegación real desde Home a los cinco servicios y comprobación del retrato a DPR 2.
- Estados de autenticación y formulario público de soporte: PASS con dependencias de red controladas.
- Contratos adicionales de facturación y diseño de WhatsApp: PASS.
- Grafo inicial: 217.590 bytes sin comprimir, dentro del límite existente de 218.000 bytes.

La suite global de navegador no está completamente verde en este entorno: el caso del visor PDF de `tools/spa-modal-regression.mjs` agota la espera de `framenavigated`. Se reproduce también en la base sin cambios `8d9dab86` con el mismo Chromium. No se modifica ni se omite ese control; los demás contratos pendientes se ejecutaron por separado. La descarga de otro Chromium no pudo completarse por timeout del proveedor. Este resultado no equivale a `validate:ci` aprobado.

La revisión automática de permisos rechazó inicialmente la publicación. El propietario autorizó después de forma explícita publicar los cambios, integrarlos en `main` y desplegar a producción. La primera etapa se tramita en [PR #584](https://github.com/avila199817/onionsupport/pull/584). Su árbol remoto `953776e0ad6f884d9f5eacff01bb6865e6802bd6` coincide exactamente con el commit local de tooling validado.

La integración se realiza en dos etapas: primero el contrato de tamaños de imagen, después el cambio funcional sobre la nueva base. Los controles remotos de integridad, preview y Lighthouse deben aprobar el head definitivo antes de la fusión; después se verifica el despliegue del SHA exacto. La publicación solo se acredita mediante las PR y sus ejecuciones; las comprobaciones locales no son evidencia productiva.

## Google y límites

Se conservan las seis URLs públicas del sitemap, canónicas, esquema estructurado, identidad de Maps y políticas de indexación. El Home principal sigue montándose mediante JavaScript y el Router mantiene su contenedor inicial vacío. Su alternativa sin JavaScript mejora la semántica accesible; no se presenta como SSR ni prerenderizado.

Los accesos directos de la web son cambios controlables. Los sitelinks orgánicos de Google se generan automáticamente y no pueden garantizarse. No se ha accedido a Search Console ni solicitado indexación desde una cuenta propietaria.

Referencias: [sitelinks](https://developers.google.com/search/docs/appearance/sitelinks), [enlaces rastreables](https://developers.google.com/search/docs/crawling-indexing/links-crawlable), [JavaScript y búsqueda](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
