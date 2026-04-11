/* =========================================================
   Onion SPA - App Boot State
   Archivo: src/app/boot-state.js

   Responsabilidades:
   - sincronizar estado de boot de AppCore
   - sincronizar estado de boot del Store
   - centralizar flags ready / booted / booting
========================================================= */

export function markAppBootState(
  AppCore,
  {
    booted = false,
    booting = false,
  } = {}
) {
  AppCore.setState({
    booting: Boolean(booting),
    ready: Boolean(booted),
  });
}

export function markStoreBootState(
  Store,
  {
    ready = false,
    booted = false,
  } = {}
) {
  if (Store?.actions?.markReady) {
    Store.actions.markReady(Boolean(ready));
  }

  if (Store?.actions?.markBooted) {
    Store.actions.markBooted(Boolean(booted));
  }
}
