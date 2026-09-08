# Experiencia pública

La portada, las cinco páginas de servicios y las cuatro vistas de acceso comparten identidad y pie legal. Las páginas de servicio se generan con `tools/sync-public-site.mjs`; no se editan los HTML derivados por separado.

## Autoridades

- Portada: `src/views/public/home/template.js` y su controlador. Las llamadas principales apuntan a `#incidencia` desde el HTML inicial; la explicación del formulario en FAQ pertenece al template.
- Formulario: `src/features/public-support/index.js`. El backend sigue siendo la autoridad de identidad, creación y aceptación. El formato de teléfono no debe recortar un número incorrecto para convertirlo en otra identidad válida.
- Datos y pie legal: `src/core/public-legal.js`, reutilizado por Home, shell de acceso y generador estático. Estilos públicos por ruta en `legal-footer.css`.
- Consentimiento: `src/analytics/google-tag.js`. Las páginas de acceso permiten cambiar preferencias; sólo las seis rutas comerciales permiten medición. Los cambios en acceso se guardan y se comunican a Google al volver a una ruta comercial.

## Recorridos

| Entrada | Resultado |
| --- | --- |
| `/#incidencia` | Conserva el fragmento y lleva al formulario cuando termina de montarse. |
| `/#public-privacy` | Abre el desplegable de privacidad y enfoca su destino. |
| Presupuesto o servicio | Ofrece abrir incidencia, con WhatsApp identificado como canal alternativo. |
| Reset o activación sin token | Explicación única, controles deshabilitados y acción de recuperación/ayuda. |
| Respuesta inesperada de soporte | Conserva datos y clave de reintento; no anuncia una incidencia creada. |
| Salir durante un envío | Cancela la operación y descarta resultados de una vista desmontada. |

Los desplegables legales nativos evitan añadir rutas sin soporte de compilación o un segundo sistema de modales. El acceso se mantiene en la navegación principal; no hay enlaces de cuenta ocultos en el pie.

## Información legal

Identidad contrastada con `oniontech/template/base.template.js` y sus correos transaccionales: Cristian Ávila Luque, NIF20568568J, domicilio profesional en Sant Vicenç de Castellet, soporte@onionsupport.com y 629946615. Se conserva el contenido sobre presupuesto, copia de seguridad, atención y hojas de reclamación.

El aviso explica el funcionamiento real del consentimiento: la etiqueta de Google se carga con almacenamiento denegado y puede enviar señales sin cookies antes de aceptar. No afirma ausencia de comunicación previa. No se inventan periodos de conservación contractual, un inventario efectivo de cookies ni garantías contratadas de proveedores. Esa información debe mantenerse con el tratamiento y la configuración reales.

Referencias revisadas: [LSSI, artículo10](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10), [información por capas de AEPD](https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos/derecho-de-informacion), [guía de cookies de AEPD](https://www.aepd.es/guias/guia-cookies.pdf) y [modo de consentimiento de Google](https://developers.google.com/tag-platform/security/concepts/consent-mode).

## Validación

- `tools/public-site-browser-contract.mjs`: rutas públicas, anclas, encabezados visibles, ausencia de IDs duplicados y desbordamiento, desplegables y controles sin token, a360/900/1440px con tema claro/oscuro.
- `tools/public-support-runtime-contract.mjs`: validación, aceptación, conservación de identidad/datos, reintentos, idempotencia y desmontaje, con HTTP simulado.
- Pruebas de consentimiento: preferencias públicas y transición comercial→acceso→comercial sin eventos de acceso ni URLs sensibles.
- Pipeline existente: compilación con herramientas fijadas, reproducción con herramientas de la base confiable, preview, publicación del SHA exacto y verificación de los archivos servidos.

Las puntuaciones Lighthouse son mediciones, no una garantía de100. La referencia de producción anterior a esta revisión (SHA886c5e6, cinco ejecuciones por perfil) fue99 en escritorio y90 en móvil para Home; accesibilidad, buenas prácticas ySEO100. La comparación posterior debe identificar su SHA, origen y condiciones.
