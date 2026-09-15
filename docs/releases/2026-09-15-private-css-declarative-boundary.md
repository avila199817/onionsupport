# Frontera CSS privada declarativa · 2026-09-15

## Problema

La frontera público/privado del CSS era una lista estática en `vite.config.js` (`PRIVATE_CSS_IMPORTS`) acoplada byte a byte a `app.css`, con una excepción declarativa sólo para `private-fullview-routes.css` (R06). Como `vite.config.js` y `tools/` son tooling confiable que la validación toma siempre de `main`, mover una hoja al área privada exigía cambiar la lista y el `@import` en la misma PR: la reconstrucción confiable no la retiraba y la comparación de bytes fallaba. Ninguna secuencia de dos PR resolvía el acoplamiento con lista estática. La primera migración del sistema modal (`components/detail-modal.css` como autoridad estructural siempre presente en el área privada) chocó exactamente con eso en [PR #606](https://github.com/avila199817/onionsupport/pull/606): `Trusted PR integrity` y `Compare home` fallaron con el tooling de `main`.

## Cambio

- `vite.config.js`: el plugin `onion-private-css-entry-split` deriva la lista de `private.css` (datos declarativos del candidato). Acepta sólo statements canónicos sobre `./layout/`, `./components/` y `./compositions/` con la capa de su directorio, rechaza duplicados y formas no canónicas, ignora los imports `layer(guardrails)` (autoridad compartida) y mantiene la comprobación de deriva: cada statement declarado debe existir exactamente una vez en `app.css`. La lista estática y el caso especial de full-view desaparecen; los bytes del artefacto no cambian.
- `tools/private-css-split-regression.mjs`: fixtures sintéticos (ausente, diez imports, full-view comentado y activo, import adicional declarado retirado de un `app.css` que lo lleva y rechazado si no lo lleva, duplicado, capa incorrecta, formas no canónicas, deriva) y el par real `app.css`/`private.css` con salida esperada calculada de forma independiente.
- `.github/scripts/private_css_entry_contract.mjs`: Vite ya no duplica la lista; se exige el patrón canónico, el trato de guardrails y la derivación desde `private.css`.
- `.github/scripts/repo_integrity.py`: el shell modal tiene una única autoridad de carga: o las rutas Usuarios e Incidencias lo listan, o viaja con el área privada (`app.css` y `private.css` lo importan una vez y ninguna ruta lo carga). Nunca ambas.
- `tools/presentation-text-contract.mjs`: la política de escape del detalle pendiente se comprueba sobre el nodo de texto, no sobre el elemento que lo envuelve.

## Pruebas

`npm run validate` completo en verde sobre `main` sin cambios de fuente (bytes idénticos: la regresión exige salida byte a byte igual a la anterior). El árbol de la PR #606 se reconstruyó localmente con este tooling (`stage-trusted-build` equivalente): integridad, contrato de entrada, regresión del split, build, contrato de split en dist y techos de arranque en verde.

## Siguiente

[PR #606](https://github.com/avila199817/onionsupport/pull/606) se rebasa sobre esta base: deja de tocar `vite.config.js`, la regresión y el contrato de texto, y endurece `repo_integrity.py` al único estado válido (área privada).
