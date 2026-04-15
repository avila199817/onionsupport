/* =========================================================
   Onion SPA - App Boot State
   Archivo: src/app/boot-state.js

   Responsabilidades:
   - sincronizar estado de boot de AppCore
   - sincronizar estado de boot del Store
   - centralizar flags ready / booted / booting
   - endurecer transiciones boot / reboot
   - evitar estados fantasma

   HARDENING PRO:
   - tolerancia total a módulos parciales
   - idempotencia total
   - snapshots útiles debug
   - cero throws accidentales
========================================================= */

/* =========================================================
   BASICS
========================================================= */

function safeBool(value) {
  return value === true;
}

function safeCall(fn, ...args) {
  try {
    if (typeof fn === "function") {
      return fn(...args);
    }
  } catch {}

  return undefined;
}

function ensureObject(value) {
  return (
    value &&
    typeof value === "object"
  )
    ? value
    : {};
}

/* =========================================================
   APP STATE
========================================================= */

export function markAppBootState(
  AppCore,
  {
    booted = false,
    booting = false,
  } = {}
) {
  const finalBooted =
    safeBool(booted);

  const finalBooting =
    safeBool(booting);

  const payload = {
    booted:
      finalBooted,

    booting:
      finalBooting,

    ready:
      finalBooted,

    loading:
      finalBooting,
  };

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state ===
        "object"
    ) {
      Object.assign(
        AppCore.state,
        payload
      );
    }
  } catch {}

  safeCall(
    AppCore?.setState,
    payload
  );

  safeCall(
    AppCore?.events?.emit,
    "app:boot:state",
    payload
  );

  return payload;
}

/* =========================================================
   STORE STATE
========================================================= */

export function markStoreBootState(
  Store,
  {
    ready = false,
    booted = false,
  } = {}
) {
  const finalReady =
    safeBool(ready);

  const finalBooted =
    safeBool(booted);

  const actions =
    ensureObject(
      Store?.actions
    );

  safeCall(
    actions.markReady,
    finalReady
  );

  safeCall(
    actions.markBooted,
    finalBooted
  );

  safeCall(
    actions.set,
    {
      ready:
        finalReady,
      booted:
        finalBooted,
    }
  );

  const payload = {
    ready:
      finalReady,
    booted:
      finalBooted,
  };

  return payload;
}

/* =========================================================
   COMBINED HELPERS
========================================================= */

export function markBootStart(
  AppCore,
  Store
) {
  markAppBootState(
    AppCore,
    {
      booted: false,
      booting: true,
    }
  );

  markStoreBootState(
    Store,
    {
      ready: false,
      booted: false,
    }
  );

  return true;
}

export function markBootReady(
  AppCore,
  Store
) {
  markAppBootState(
    AppCore,
    {
      booted: true,
      booting: false,
    }
  );

  markStoreBootState(
    Store,
    {
      ready: true,
      booted: true,
    }
  );

  return true;
}

export function markBootError(
  AppCore,
  Store
) {
  markAppBootState(
    AppCore,
    {
      booted: false,
      booting: false,
    }
  );

  markStoreBootState(
    Store,
    {
      ready: false,
      booted: false,
    }
  );

  return true;
}

export function markRebootState(
  AppCore,
  Store
) {
  return markBootError(
    AppCore,
    Store
  );
}

/* =========================================================
   DEBUG
========================================================= */

export function getBootStateSnapshot(
  AppCore,
  Store
) {
  return {
    app: {
      booted:
        Boolean(
          AppCore?.state
            ?.booted
        ),
      booting:
        Boolean(
          AppCore?.state
            ?.booting
        ),
      ready:
        Boolean(
          AppCore?.state
            ?.ready
        ),
      loading:
        Boolean(
          AppCore?.state
            ?.loading
        ),
    },

    store: {
      hasActions:
        Boolean(
          Store?.actions
        ),
    },
  };
}

export default {
  markAppBootState,
  markStoreBootState,
  markBootStart,
  markBootReady,
  markBootError,
  markRebootState,
  getBootStateSnapshot,
};
