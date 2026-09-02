# CSS centralization checkpoint — 2026-08-31

> **ESTADO: SUPERSEDED / COMPLETADO.**
>
> Este checkpoint conserva únicamente el contexto histórico de la pausa del 31/08/2026. El trabajo pendiente descrito abajo fue retomado y cerrado mediante el issue #394 y el PR #397. La arquitectura vigente está documentada en `docs/PROJECT_CONTEXT.md` y protegida por los contratos actuales de CI.

This checkpoint records the state of the SPA-wide CSS centralization work after the working session stopped before its intermediate local changes were published to GitHub.

Authoritative follow-up: issue #394, `CSS centralizado: continuar auditoría 1:1 light/dark` — **cerrado como completado mediante PR #397**.

## Release scope histórico

This checkpoint did not invent or reconstruct unpublished CSS changes. The production release associated with this checkpoint intentionally rebuilt and redeployed the latest revision that was actually stored in GitHub, through the repository's normal validated Azure Static Web Apps release path.

## Trabajo que estaba pendiente al registrar el checkpoint

La lista siguiente es histórica y **ya no representa trabajo abierto**:

- completar Usuarios y Servidor sobre la autoridad CSS canónica;
- cerrar el drift restante de Crear;
- reforzar contratos permanentes;
- completar validación light/dark;
- verificar paridad de avatar fallback;
- eliminar overrides residuales o autoridades visuales duplicadas.

El cierre posterior consolidó la autoridad visual privada, retiró CSS paralelo de Servidor/Create y añadió guards permanentes para impedir regresiones. Para cualquier decisión actual, `main` y `docs/PROJECT_CONTEXT.md` son la autoridad.
