# Migración de autoridades compartidas y marca nacional

> **Estado: preparación y activación completadas.** La preparación entró en [PR #486](https://github.com/avila199817/onionsupport/pull/486) y el producto en [PR #487](https://github.com/avila199817/onionsupport/pull/487). Ambos marcadores ya existen en `main`. Este documento conserva el diseño de compatibilidad de los validadores; el estado vigente está en [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) y los siguientes pasos en [ROADMAP.md](ROADMAP.md).

La política SEO anterior exigía que `/login` sea indexable y figure en el sitemap. El contrato visual anterior exigía una animación local `private-admin-shimmer`. Ambos requisitos evolucionaron para permitir la nueva política solicitada: acceso de clientes fuera del índice y animación de carga compartida.

La PR de preparación sólo actualizó validadores y sus regresiones; los cambios de HTML, CSS, JavaScript, rutas y consentimiento llegaron en la PR de producto posterior. Los workflows de publicación y sus límites de confianza permanecen intactos.

## Transición explícita

- Sin `.github/ci/public-site-v3`, siguen vigentes las reglas SEO anteriores. Con su versión exacta, portada y servicios conservan canonical propio e indexación; `/login` exige `noindex, follow` en HTML y cabecera, permanece rastreable y queda fuera del sitemap. La portada exige el título `Onion Support` y un único grafo estructurado coherente.
- Sin `.github/ci/ui-authorities-v1`, sigue exigida la animación anterior. Al activarse, se exige importar `skeleton.css` en la capa global de carga y mantener allí los keyframes canónicos. Se rechazan animaciones de skeleton duplicadas y los spinners CRUD reemplazados.
- Los marcadores se incorporaron con el producto después de fusionar la preparación en la base revisada. Un marcador aislado no satisface los contratos.

El contrato de medición admite el script clásico anterior y, para documentos generados con la marca HTML `public-site-v3`, el mismo bootstrap compilado como módulo. Exige una sola entrada SPA y el lifecycle modal compartido; conserva destinos, consentimiento denegado por defecto, exclusión de rutas privadas y comprobación de bytes de los assets de compatibilidad.

## Verificación

`public_site_policy_regression.py` prueba candidatos antiguos y nuevos, además de rechazar ausencia de `noindex`, bloqueo de rastreo, metadatos duplicados, canonical incorrecto y versiones desconocidas. `ui_authority_transition_contract.py` cubre ambas políticas y rechaza autoridades ausentes, duplicadas o presentes sólo en comentarios. Ambos forman parte del gate SPA.

El validador de producción conserva también las dos políticas, de modo que una comprobación de una revisión anterior no adopta por error las reglas de una revisión posterior.
