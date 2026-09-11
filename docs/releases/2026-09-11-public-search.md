# Presencia pública y Google Maps — 2026-09-11

## Alcance de esta entrega

Base de trabajo: `46ca86254c770d5609e2b2d2b0a4c5767f7e3456`. Mejora acotada del frontend público, autorizada por el propietario. No modifica backend, autenticación, tickets, facturas, credenciales, consentimiento ni los permisos del repositorio.

- `src/core/public-site.js` conserva la autoridad de marca y metadatos. Añade la URL de Perfil de Empresa facilitada por el propietario, `sameAs` y `contactPoint` a la organización existente. El tipo sigue siendo `Organization`: no se infiere un establecimiento abierto al público, coordenadas, horarios de Maps ni valoraciones.
- `src/core/public-legal.js` muestra el mismo enlace a Maps en el pie público compartido. Es un enlace normal, no un mapa incrustado ni un widget que cargue proveedores externos. Los datos y textos legales existentes no cambian.
- `tools/sync-public-site.mjs` genera el resumen comercial inicial y su alternativa sin JavaScript desde el catálogo existente. Incluye identidad, cobertura, cinco servicios y contacto por teléfono, correo, WhatsApp y Maps. El Router sustituye el resumen inicial al montar la vista; no se cambia el Router ni se duplica el formulario. Esto es HTML comercial inicial, no una migración completa a renderizado en servidor.
- Las cinco páginas de servicio se regeneran desde su fuente. Su enlace «Contacto» lleva a la sección de la propia página, también sin JavaScript.
- El CSS sin JavaScript oculta el cargador y la copia del shell dinámico, permite desplazamiento y conserva enlaces utilizables en móvil.
- Se mantienen las seis URLs del sitemap, las URLs canónicas, el acceso `noindex, follow` y la exclusión de metadatos privados. No se añaden rutas, dependencias ni un segundo sistema de SEO.

## Comprobación y publicación

Los archivos fuente recuperados y las cinco páginas generadas de la base se contrastaron con sus SHA de blob antes de editar. Las comprobaciones locales dirigidas cubren generación exacta e idempotente de las seis páginas, JSON-LD coherente, enlace de Maps, rechazo de límites de generación ausentes y aislamiento de metadatos privados. No sustituyen la compilación completa.

Se amplían los contratos existentes, sin eliminar verificaciones:

```sh
node tools/sync-public-site.mjs --check
node tools/public-site-contract.mjs
npm run validate:ci
```

El contrato de navegador comprueba la retirada del resumen tras montar rutas, identidad de Maps en el DOM, enlace único en el pie y navegación sin JavaScript en fuente y distribución, a 360 y 1440 píxeles. Conserva la matriz anterior de rutas, temas, tamaños, formularios y anclas.

La PR debe pasar Repository Integrity, Trusted PR Integrity y los gates aplicables antes del merge. CI y publicación se acreditan por los runs de la PR y del SHA fusionado, no por este documento. No se afirma una puntuación Lighthouse nueva ni una validación de cuentas reales.

## Fuera de GitHub

El enlace de Maps lo proporciona el propietario; en esta sesión no se ha podido resolver públicamente el enlace corto ni comprobar la titularidad o verificación de la ficha. No se han cambiado sus datos, creado reseñas ni inventado un identificador de lugar. Tampoco se ha inspeccionado una propiedad autenticada de Search Console o solicitado indexación.

Después del despliegue corresponde inspeccionar la portada y las cinco páginas en Search Console, comprobar el sitemap y revisar la ficha desde su cuenta propietaria. Google decide la indexación, los enlaces de sitio y la presentación de la ficha; estos cambios no los garantizan.

Referencias técnicas: [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), [enlaces de sitio](https://developers.google.com/search/docs/appearance/sitelinks) y [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
