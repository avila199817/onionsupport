# Presencia pública y Google Maps — 2026-09-11

## Alcance de esta entrega

Base: `46ca86254c770d5609e2b2d2b0a4c5767f7e3456`. Mejora acotada del frontend público, autorizada por el propietario. No modifica backend, autenticación, tickets, facturas, credenciales, consentimiento ni permisos.

- La organización existente incorpora `sameAs` con el enlace de Maps facilitado por el propietario y `contactPoint`. Sigue siendo `Organization`; no se inventan un establecimiento, coordenadas, horarios de Maps ni valoraciones.
- El pie público compartido incorpora un enlace normal a Maps, sin widget ni carga de proveedores externos. Se conserva el renderer puro: el href literal está contrastado con `PUBLIC_SITE` por los contratos de fuente y navegador. Los datos y textos legales existentes no cambian.
- La alternativa sin JavaScript se genera desde el catálogo público: identidad, cobertura, cinco servicios y teléfono, correo, WhatsApp y Maps. Se conserva el título visual no-H1 y el contenedor inicial vacío exigidos por la arquitectura. No es prerenderizado de la portada principal ni una migración a SSR.
- Las cinco páginas estáticas de servicio incluyen los metadatos nuevos y el pie actualizado. «Contacto» lleva a la sección de la propia página y funciona sin JavaScript.
- El CSS sin JavaScript oculta el cargador y el shell dinámico, permite desplazamiento y conserva enlaces utilizables en móvil.
- Se mantienen las seis URLs del sitemap, las canónicas, el acceso `noindex, follow` y la exclusión de metadatos privados. No se añaden rutas, dependencias ni otro sistema de SEO.

## Comprobación y publicación

Las fuentes recuperadas y los cinco HTML originales se contrastaron con sus SHA de blob. Se han ejecutado comprobaciones locales dirigidas de sintaxis, generación exacta e idempotente, identidad estructurada, enlaces y aislamiento de metadatos privados. No sustituyen la compilación completa en CI.

La primera propuesta de HTML dentro del Router y la importación de marca en el footer no respetaban los contratos de arranque y pureza. Se retiraron: no se han modificado ni debilitado esos controles.

```sh
node tools/sync-public-site.mjs --check
node tools/public-site-contract.mjs
npm run validate:ci
```

Se amplían los contratos existentes sin retirar verificaciones de la base. El navegador conserva diez rutas, tres tamaños, dos temas, navegación, formularios y anclas; añade identidad/enlaces de Maps y acceso sin JavaScript en fuente y distribución a 360 y 1440 píxeles. El contrato de fuente comprueba además que el Router root nace vacío.

CI, preview, merge y publicación se acreditan por los runs correspondientes, no por este documento. No se afirma una puntuación Lighthouse nueva ni una validación de cuentas reales.

## Fuera de GitHub

El enlace corto es el declarado por el propietario. No se ha podido resolver públicamente ni verificar titularidad/estado de la ficha. No se han cambiado sus datos, creado reseñas ni inferido identificadores de lugar. Tampoco se ha accedido a Search Console o solicitado indexación.

Después del despliegue: inspeccionar portada y cinco servicios en Search Console, comprobar el sitemap y revisar la ficha desde la cuenta propietaria. Google decide la indexación, los enlaces de sitio y la presentación local; estos cambios no los garantizan. Una futura portada prerenderizada requiere una transición de arquitectura con sus propias pruebas, no saltarse el contrato de arranque.

Referencias: [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), [enlaces de sitio](https://developers.google.com/search/docs/appearance/sitelinks), [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
