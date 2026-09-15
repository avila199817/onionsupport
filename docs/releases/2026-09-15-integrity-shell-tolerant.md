# Integridad tolerante a la migración del detalle de Incidencias · 2026-09-15

## Problema

`repo_integrity.py` es tooling confiable: `Trusted PR integrity` ejecuta la versión de `main` sobre cada candidato. Sus reglas V7 exigían al detalle de Incidencias el marcado emparejado (`incidencias-modal-root ui-detail-modal-root`, overlay, panel, body), de modo que la migración al shell canónico ([PR #608](https://github.com/avila199817/onionsupport/pull/608)) fallaba con el script de `main` aunque su propio script fuese correcto.

## Cambio

Sólo `.github/scripts/repo_integrity.py`: `incidencias_detail_on_shell()` detecta si la plantilla renderiza con `renderModalShell` (`modal-host.js`). Sobre el shell, la regla exige que la plantilla no emita estructura propia (`role="dialog"`, overlay, panel, alias estructurales, botón cerrar propio); sin shell, exige el marcado emparejado V7. Las parejas de contenido compartidas (chip y meta-grid) y el modifier dinámico se exigen siempre. El árbol actual de `main` y el de #608 pasan con este script.

## Siguiente

#608 se rebasa sobre esta base y conserva la regla estricta (sólo shell); la rama tolerante desaparece de `main` con esa fusión.
