# Cierre de la superficie pública · 2026-09-18

## Alcance

Once URLs públicas: portada (`/`), cinco páginas de servicio generadas (`/reparacion-ordenadores`, `/soporte-informatico`, `/redes-wifi`, `/impresoras`, `/soporte-empresas`), cuatro vistas de acceso (`/login`, `/password-request`, `/password-reset`, `/activate-account`) y cualquier URL inexistente. Más los activos que las acompañan: `robots.txt`, `sitemap.xml`, `site.webmanifest`, el pie legal, el consentimiento de Google y el `noscript`.

Nada del área autenticada cambia de comportamiento. Las herramientas confiables (`vite.config.js`, `tools/`, `package*.json`) no se tocan: todos los cambios son de fuente, HTML raíz o contratos candidatos, y el rebuild confiable produce el mismo `dist/`.

## Problema

- La portada, las páginas de servicio, el acceso, el consentimiento y el `noscript` usaban cuatro paletas y tres pilas tipográficas distintas. Las páginas de servicio eran una identidad aparte (sin la llamada principal, sin marca, tipografía diferente) y el consentimiento heredaba `font-size: .82em` de quien lo montara.
- Una URL inexistente redirigía a `/login` con HTTP 200: el visitante perdía el contexto y los rastreadores indexaban el acceso como destino de cualquier error.
- Faltaban `og:image:type/width/height` en cinco de seis páginas, el esquema `Service` no declaraba tipo ni ámbito, y el pie no enlazaba el catálogo de servicios desde acceso ni desde la portada.
- El CSS público servía 19 KB de hojas que sólo consume el área privada (`app-icons.css`, `mobile-datalist.css`).
- En teléfono el título del formulario y el nombre del técnico se recortaban (`white-space: nowrap` + `overflow: clip`), las cuatro celdas de dirección no cabían en 1180 px y varios rótulos quedaban por debajo de 12 px.
- Dos HTML huérfanos en `public/` (`publicDir: false`, sin rutas ni referencias) y un log suelto en la raíz.

## Cambio

### Sistema visual público

- `src/css/tokens/public.css`: única autoridad de color, tipografía, radios, sombras y anchos del área pública (`--public-*`), con tema claro, `forced-colors` e impresión. Primer estilo de ruta en las cinco rutas públicas y `<link>` en las páginas de servicio.
- `login.css`, `index.css`, `legal-footer.css`, `google-consent.css`, `noscript.css` y `public-service.css` consumen esas variables con respaldo literal. Ninguna hoja privada las lee.
- `google-consent.css` fija `font-size: 16px` en su raíz y dimensiona en `em`; mientras la píldora «Cookies» esté visible, el pie reserva su altura (`body:has(...)`) para que no cubra «Configurar cookies».
- `noscript.css` pasa del morado heredado a la paleta navy/azul de la aplicación.

### Páginas de servicio

- Cabecera con marca (tile + `ONION SUPPORT`), menú `<details>` de servicios, «Contacto», «Iniciar sesión» y la llamada principal «Abrir incidencia» → `/#incidencia`. En teléfono la llamada se mantiene visible y la navegación baja a una segunda fila.
- Ventajas compartidas, método en tres pasos y preguntas frecuentes (`<details>`, tres por servicio más las generales), leídos de `src/core/public-content.js` y `tools/public-service-content.mjs`. El mismo contenido alimenta la portada.
- Copy orientado a decidir: qué ocurre, qué opciones hay, con presupuesto previo y factura. Sin métricas, reseñas, sellos ni plazos garantizados.

### 404 real

- `staticwebapp.config.json`: `responseOverrides.404 → /index.html` (HTTP 404 con la aplicación montada).
- `src/router/index.js`: las rutas bloqueadas o inexistentes montan `src/views/public/not-found/template.js` para visitantes sin sesión (título, «Abrir incidencia», «Ir al inicio», catálogo y acceso); un usuario autenticado recibe el fallback de aplicación. Nueva entrada `not-found` en `src/router/styles.js` con los estilos de acceso.

### SEO técnico y enlazado

- `og:image:type`, `og:image:width` y `og:image:height` generados en las seis páginas desde `PUBLIC_SITE`.
- `Service` declara `serviceType` y `areaServed: España`.
- Columna «Servicios» en el pie legal: los cinco servicios quedan a un enlace desde cualquier URL pública, sin enlazar `/login`.
- `robots.txt` y `sitemap.xml` sin cambios: contienen exactamente las seis URL canónicas.

### Rendimiento

- `app-icons.css` y `mobile-datalist.css` pasan detrás del guard privado (`src/css/private.css`): el CSS público del build baja de 237 146 a 217 918 bytes (−19,2 KB) sin tocar `vite.config.js`.
- Precarga de `public.css` en `public-home-preload.js` junto al pie legal.

### Correcciones de maquetación en teléfono

- Título del formulario y nombre del técnico en varias líneas (`overflow-wrap: anywhere`, `text-wrap: balance`) en vez de recortarse.
- Dirección en dos filas de dos celdas por debajo de 1180 px; retrato con degradado inferior en lugar de borde duro; tarjeta destacada de precios sin el título sobredimensionado.
- Rótulos de 10–11 px subidos a 12 px donde son informativos; los decorativos quedan en 11 px.
- Subtítulo de recuperación de acceso: de «Pon tu correo.» a una instrucción completa.

### Limpieza

- Eliminados `public/privacidad.html`, `public/eliminacion-datos.html` (jamás se construían ni se servían) y `mirror-s31a.log`.

## Contratos

- `tools/public-site-contract.mjs` cubre además: llamada principal en la cabecera de cada servicio, tokens compartidos, método y FAQ, catálogo del pie igual a `PUBLIC_SERVICES`, plantilla 404 (h1, servicios, `/#incidencia`, `/login`), estilos de `not-found` y tokens como primer estilo de las cinco rutas públicas.
- `.github/scripts/public_login_layout_contract.mjs` incorpora `public.css` a la lista de estilos de acceso.
- Los once validadores confiables de `main` pasan sobre el candidato sin modificarse.

## Métricas

| Métrica | Antes | Después |
| --- | --- | --- |
| Paletas/pilas tipográficas en superficie pública | 4 / 3 | **1 / 1** |
| CSS público del build | 237 146 B | **217 918 B** |
| Páginas con `og:image` dimensionada | 1 de 6 | **6 de 6** |
| Respuesta de URL inexistente | 302 → `/login` (200) | **404 + vista pública** |
| Enlaces al catálogo desde acceso y portada (pie) | 0 | **5** |
| Contenido comercial duplicado entre Home y generador | sí | **una fuente** |
| Recortes de texto en 320–412 px | 2 | **0** |
| Archivos huérfanos | 3 | **0** |

## Riesgo

Bajo. Los literales que leen los validadores confiables (geometría del hero, `href` de servicios, cadenas del formulario, presupuesto de imágenes, renderer del pie, selectores del consentimiento, `robots`/`sitemap`, tipos de nodo del esquema) se conservan. El cambio de 404 sólo afecta a visitantes sin sesión que ya llegaban a `/login`; el comportamiento privado (guardas, redirecciones con `returnTo`) no cambia. `:has()` degrada al comportamiento anterior en navegadores sin soporte.

## Pendiente fuera del repositorio

- Medir Lighthouse y Search Console sobre el SHA publicado (la referencia previa está en `PUBLIC_EXPERIENCE.md`).
- Confirmar con el propietario las URL legales registradas en Meta/WhatsApp Business si dependen de `oniontech`.
- Las páginas de revisión de `oniontech` conservan su paleta propia; no forman parte de esta superficie.
