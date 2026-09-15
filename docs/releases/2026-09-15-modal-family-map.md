# Mapa canónico de la familia modal y cierre de la consolidación · 2026-09-15

## Qué cambia

- `docs/UI_MODAL_SYSTEM.md` incorpora el mapa canónico de la familia modal: para cada responsabilidad (sesión de detalle, estructura y ARIA, CSS estructural, interacción, portal y actualización, confirmaciones, contenido de dominio) la autoridad que la implementa, el contrato que la protege y sus consumidores. Corte del 2026-09-15: 14 consumidores de `renderModalShell`, ningún shell histórico ni override estructural pendiente en `tools/modal-shell-contract.mjs`, capas legacy de `ui.css` retiradas.
- `docs/PROJECT_CONTEXT.md`: la fila de `/agenda` recoge la decisión del propietario: visible para `admin` y `user`, cada rol verá su propia agenda cuando se integre en el sistema; hoy sigue sin citas ni persistencia.

## Unidades de la consolidación (todas fusionadas y desplegadas o en la cola de fusión de esta fecha)

Autoridad del shell (#605–#612), detalle de Incidencias, detalle de Facturas, altas de Incidencias, Facturas, Clientes y Usuarios, detalle de Clientes, confirmaciones y flujo de cobro de Facturas, Correo, perfil del técnico, detalle de Usuarios, capas legacy de `ui.css`, visor de adjuntos, contenido del detalle de Clientes sin alias y tipografía de título de las altas en la composición. Acompaña el endurecimiento del contrato de Correo en Chromium: cada escenario que rellena tras abrir espera al foco inicial que aplica el propio modal. Cada unidad conserva su nota en `docs/releases/`.

## Siguiente

Autoridad única de ACL de tickets (backend y frontend) y, después, normalización, errores, HTTP, enrutado, entidades, UI común y contratos FE↔BE.
