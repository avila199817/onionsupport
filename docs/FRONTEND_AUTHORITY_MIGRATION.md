# Preparación de autoridades compartidas y marca nacional

La política SEO anterior exige que `/login` sea indexable y figure en el sitemap. El contrato visual anterior exige una animación local `private-admin-shimmer`. Ambos requisitos deben evolucionar para permitir la nueva política solicitada: acceso de clientes fuera del índice y animación de carga compartida.

Esta preparación sólo actualiza validadores y sus regresiones. No activa cambios de HTML, CSS, JavaScript, rutas, consentimiento ni despliegue. Los workflows de publicación y sus límites de confianza permanecen intactos.

## Transición explícita

- Sin `.github/ci/public-site-v3`, siguen vigentes las reglas SEO anteriores. Con su versión exacta, portada y servicios conservan canonical propio e indexación; `/login` exige `noindex, follow` en HTML y cabecera, permanece rastreable y queda fuera del sitemap. La portada exige el título `Onion Support` y un único grafo estructurado coherente.
- Sin `.github/ci/ui-authorities-v1`, sigue exigida la animación anterior. Al activarse, se exige importar `skeleton.css` en la capa global de carga y mantener allí los keyframes canónicos. Se rechazan animaciones de skeleton duplicadas y los spinners CRUD reemplazados.
- Los marcadores se incorporarán con el producto, después de que esta preparación forme parte de la base revisada. Un marcador aislado no satisface los contratos.

El contrato de medición admite el script clásico anterior y, para documentos generados con la marca HTML `public-site-v3`, el mismo bootstrap compilado como módulo. Exige una sola entrada SPA y el lifecycle modal compartido; conserva destinos, consentimiento denegado por defecto, exclusión de rutas privadas y comprobación de bytes de los assets de compatibilidad.

## Verificación

`public_site_policy_regression.py` prueba candidatos antiguos y nuevos, además de rechazar ausencia de `noindex`, bloqueo de rastreo, metadatos duplicados, canonical incorrecto y versiones desconocidas. `ui_authority_transition_contract.py` cubre ambas políticas y rechaza autoridades ausentes, duplicadas o presentes sólo en comentarios. Ambos forman parte del gate SPA.

El validador de producción conserva también las dos políticas, de modo que una comprobación de una revisión anterior no adopta por error las reglas de una revisión posterior.
