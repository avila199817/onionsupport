# Experiencia pública

La portada, las cinco páginas de servicios, las cuatro vistas de acceso y la vista `not-found` comparten identidad, tokens y pie legal. Las páginas de servicio se generan con `tools/sync-public-site.mjs`; no se editan los HTML derivados por separado.

## Autoridades

- Tokens públicos: `src/css/tokens/public.css` (capa `tokens`) define paleta, tipografía, radios, sombras y anchos del área pública en variables `--public-*`, con tema claro, `forced-colors` e impresión. Es el primer estilo de ruta de las cinco rutas públicas (`src/router/styles.js`) y un `<link>` en cada página de servicio; los shells públicos, el consentimiento y el pie consumen esas variables con un valor literal de respaldo.
- Contenido comercial compartido: `src/core/public-content.js` (ventajas, método en tres pasos y preguntas frecuentes generales). Portada y generador estático leen la misma fuente; el catálogo de servicios y sus `href` siguen viviendo literalmente en el template de Home porque los validadores confiables los leen ahí.
- Portada: `src/views/public/home/template.js` y su controlador. Las llamadas principales apuntan a `#incidencia` desde el HTML inicial; la explicación del formulario en FAQ pertenece al template.
- Formulario: `src/features/public-support/index.js`. El backend sigue siendo la autoridad de identidad, creación y aceptación. El formato de teléfono no debe recortar un número incorrecto para convertirlo en otra identidad válida.
- Datos y pie legal: `src/core/public-legal.js`, reutilizado por Home, shell de acceso, vista `not-found` y generador estático. El pie incluye una columna «Servicios» con los cinco enlaces del catálogo (enlazado interno en toda la superficie pública) y nunca enlaza `/login`. Estilos públicos por ruta en `legal-footer.css`.
- Páginas de servicio: `tools/sync-public-site.mjs` + `tools/public-service-content.mjs` + `src/css/seo/public-service.css`. Cada página lleva cabecera con marca, menú `<details>` de servicios, «Contacto», «Iniciar sesión» y la llamada principal «Abrir incidencia» (`/#incidencia`); portada con ventajas, contenido del servicio, método en tres pasos, contacto y preguntas frecuentes en `<details>` (las del servicio más las generales). Sin métricas, reseñas ni promesas de plazos.
- Página no encontrada: `staticwebapp.config.json` responde HTTP 404 real reescribiendo a `index.html` (`responseOverrides`), y el Router monta `src/views/public/not-found/template.js` para visitantes sin sesión (título, acciones «Abrir incidencia» e «Ir al inicio», catálogo de servicios y acceso). Un usuario autenticado que llega a una URL inexistente recibe el fallback de aplicación en vez de una redirección a `/login`.
- Consentimiento: `src/analytics/google-tag.js`. Las páginas de acceso permiten cambiar preferencias; sólo las seis rutas comerciales permiten medición. Los cambios en acceso se guardan y se comunican a Google al volver a una ruta comercial.

## Recorridos

| Entrada | Resultado |
| --- | --- |
| `/#incidencia` | Conserva el fragmento y lleva al formulario cuando termina de montarse. Si los estilos de ruta, las fuentes o los medios se aplican después y crecen las secciones anteriores, la misma invalidación estructural (`ResizeObserver`) vuelve a alinear el destino durante los primeros 8 s, hasta que el visitante toma el control: se desplaza y se aleja de esa alineación, navega con un enlace de la propia página o usa la barra de desplazamiento propia. |
| `/#public-privacy` | Abre el desplegable de privacidad y enfoca su destino. |
| Presupuesto o servicio | Ofrece abrir incidencia, con WhatsApp identificado como canal alternativo. |
| Reset o activación sin token | Explicación única, controles deshabilitados y acción de recuperación/ayuda. |
| Respuesta inesperada de soporte | Conserva datos y clave de reintento; no anuncia una incidencia creada. |
| Salir durante un envío | Cancela la operación y descarta resultados de una vista desmontada. |
| URL inexistente | HTTP 404 real, `robots: noindex`, título propio y vista de recuperación con los mismos estilos de acceso (`not-found` en `src/router/styles.js`). |

Los desplegables legales nativos evitan añadir rutas sin soporte de compilación o un segundo sistema de modales. El acceso se mantiene en la navegación principal; no hay enlaces de cuenta ocultos en el pie.

## Información legal

Identidad contrastada con `oniontech/template/base.template.js` y sus correos transaccionales: Cristian Ávila Luque, NIF20568568J, domicilio profesional en Sant Vicenç de Castellet, soporte@onionsupport.com y 629946615. Se conserva el contenido sobre presupuesto, copia de seguridad, atención y hojas de reclamación.

El aviso explica el funcionamiento real del consentimiento: la etiqueta de Google se carga con almacenamiento denegado y puede enviar señales sin cookies antes de aceptar. No afirma ausencia de comunicación previa. No se inventan periodos de conservación contractual, un inventario efectivo de cookies ni garantías contratadas de proveedores. Esa información debe mantenerse con el tratamiento y la configuración reales.

Referencias revisadas: [LSSI, artículo10](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10), [información por capas de AEPD](https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos/derecho-de-informacion), [guía de cookies de AEPD](https://www.aepd.es/guias/guia-cookies.pdf) y [modo de consentimiento de Google](https://developers.google.com/tag-platform/security/concepts/consent-mode).

## Validación

- `tools/public-site-contract.mjs`: documentos generados, un único propietario de metadatos, `og:image` con tipo y dimensiones, esquema `Service` con `serviceType` y `areaServed`, llamada principal en la cabecera de cada servicio, método y preguntas frecuentes, tokens compartidos, catálogo del pie y plantilla 404.
- `tools/public-site-browser-contract.mjs`: rutas públicas, anclas, encabezados visibles, ausencia de IDs duplicados y desbordamiento, desplegables y controles sin token, a360/900/1440px con tema claro/oscuro.
- `tools/public-support-runtime-contract.mjs`: validación, aceptación, conservación de identidad/datos, reintentos, idempotencia y desmontaje, con HTTP simulado.
- Pruebas de consentimiento: preferencias públicas y transición comercial→acceso→comercial sin eventos de acceso ni URLs sensibles. Mientras la píldora «Cookies» está visible, el pie reserva su altura (`:has()` en `google-consent.css`) para que nunca cubra «Configurar cookies».
- Pipeline existente: compilación con herramientas fijadas, reproducción con herramientas de la base confiable, preview, publicación del SHA exacto y verificación de los archivos servidos.

Las puntuaciones Lighthouse son mediciones, no una garantía de100. La referencia de producción anterior a esta revisión (SHA886c5e6, cinco ejecuciones por perfil) fue99 en escritorio y90 en móvil para Home; accesibilidad, buenas prácticas ySEO100. La comparación posterior debe identificar su SHA, origen y condiciones.
