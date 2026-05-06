/* =========================================================
   Onion SPA - Core Modules
   Archivo: src/core/modules.js

   Responsabilidades:
   - registrar módulos en el core
   - consultar módulos registrados
   - listar aliases disponibles
   - desregistrar módulos de forma segura
   - soportar metadatos, aliases y snapshots
   - tolerar registry parcial
   - evitar duplicados accidentales

   HARDENING EXTREMO:
   - cero throws por defecto
   - modo strict opcional
   - registry.modules siempre Map
   - aliases case-insensitive
   - names index case-insensitive
   - register idempotente
   - set/upsert con overwrite explícito
   - unregister seguro con dispose opcional
   - dispose defensivo sync/async
   - alias collision controlado
   - eventos consistentes
   - snapshots sin exponer instancias completas
   - compat total con AppCore.modules.register/get/list
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const MODULES_VERSION =
  "11.0.0";

const MAX_RECENT_EVENTS =
  50;

const DEFAULT_DISPOSE_METHODS =
  Object.freeze([
    "destroy",
    "dispose",
    "unmount",
    "stop",
    "teardown",
    "cleanup",
  ]);

const MODULE_EVENTS =
  Object.freeze({
    ready:
      "app:modules:ready",

    registered:
      "app:module:registered",

    duplicate:
      "app:module:duplicate",

    overwritten:
      "app:module:overwritten",

    alias:
      "app:module:alias",

    aliasConflict:
      "app:module:alias-conflict",

    unregistered:
      "app:module:unregistered",

    disposed:
      "app:module:disposed",

    disposeError:
      "app:module:dispose-error",

    cleared:
      "app:modules:cleared",

    error:
      "app:modules:error",
  });

const MODULE_NAME_CONTROL_RE =
  /[\u0000-\u001f\u007f]/g;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(MODULE_NAME_CONTROL_RE, "")
      .trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeClone(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

function safeEmit(events, name, payload = {}) {
  const eventName =
    safeText(name, "");

  if (!eventName) {
    return false;
  }

  try {
    events?.emit?.(
      eventName,
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(utils, ...args) {
  let done =
    false;

  try {
    if (isFunction(utils?.warn)) {
      utils.warn(
        "[Modules]",
        ...args
      );

      done =
        true;
    }
  } catch {
    done =
      false;
  }

  if (done) {
    return;
  }

  try {
    console.warn(
      "[Modules]",
      ...args
    );
  } catch {}
}

function safeLog(utils, ...args) {
  try {
    utils?.log?.(
      "[Modules]",
      ...args
    );
  } catch {}
}

function ensureMap(value) {
  if (value instanceof Map) {
    return value;
  }

  const map =
    new Map();

  if (isPlainObject(value)) {
    try {
      for (const [key, item] of Object.entries(value)) {
        map.set(
          key,
          item
        );
      }
    } catch {}
  }

  return map;
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeName(name = "") {
  return safeText(name, "");
}

function normalizeLookupKey(value = "") {
  return safeText(value, "")
    .toLowerCase();
}

function normalizeAlias(alias = "") {
  return normalizeLookupKey(alias);
}

function collectAliasValues(input, output = []) {
  if (Array.isArray(input)) {
    for (const item of input) {
      collectAliasValues(
        item,
        output
      );
    }

    return output;
  }

  if (
    input !== null &&
    input !== undefined &&
    input !== ""
  ) {
    output.push(input);
  }

  return output;
}

function uniqueAliases(values = []) {
  return Array.from(
    new Set(
      collectAliasValues(values)
        .map((value) => normalizeAlias(value))
        .filter(Boolean)
    )
  );
}

function normalizeTags(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((tag) => safeText(tag, ""))
        .filter(Boolean)
    )
  );
}

function getInstanceValue(instance, key, fallback = undefined) {
  try {
    const value =
      instance?.[key];

    return value === undefined
      ? fallback
      : value;
  } catch {
    return fallback;
  }
}

function hasMethod(instance, method = "") {
  try {
    return isFunction(instance?.[method]);
  } catch {
    return false;
  }
}

function getSymbolDisposeMethod(instance) {
  try {
    if (
      typeof Symbol !== "undefined" &&
      Symbol.dispose &&
      isFunction(instance?.[Symbol.dispose])
    ) {
      return Symbol.dispose;
    }
  } catch {}

  return null;
}

function getSymbolAsyncDisposeMethod(instance) {
  try {
    if (
      typeof Symbol !== "undefined" &&
      Symbol.asyncDispose &&
      isFunction(instance?.[Symbol.asyncDispose])
    ) {
      return Symbol.asyncDispose;
    }
  } catch {}

  return null;
}

function isDisposable(instance) {
  if (!instance) {
    return false;
  }

  if (
    getSymbolDisposeMethod(instance) ||
    getSymbolAsyncDisposeMethod(instance)
  ) {
    return true;
  }

  return DEFAULT_DISPOSE_METHODS.some((method) =>
    hasMethod(instance, method)
  );
}

function getCapabilities(instance) {
  return {
    hasInit:
      hasMethod(instance, "init"),

    hasBoot:
      hasMethod(instance, "boot"),

    hasStart:
      hasMethod(instance, "start"),

    hasStop:
      hasMethod(instance, "stop"),

    hasMount:
      hasMethod(instance, "mount"),

    hasUnmount:
      hasMethod(instance, "unmount"),

    hasRender:
      hasMethod(instance, "render"),

    hasDestroy:
      hasMethod(instance, "destroy"),

    hasDispose:
      hasMethod(instance, "dispose"),

    hasTeardown:
      hasMethod(instance, "teardown"),

    hasCleanup:
      hasMethod(instance, "cleanup"),

    disposable:
      isDisposable(instance),
  };
}

function getInstanceType(instance) {
  if (instance === null) {
    return "null";
  }

  if (instance === undefined) {
    return "undefined";
  }

  if (Array.isArray(instance)) {
    return "array";
  }

  if (isFunction(instance)) {
    return "function";
  }

  return typeof instance;
}

/* =========================================================
   REGISTER ARGS
========================================================= */

function normalizeRegisterArgs(name, instance, options = {}) {
  if (
    isPlainObject(name) &&
    instance === undefined
  ) {
    const source =
      name;

    return {
      name:
        source.name ||
        source.moduleName ||
        source.key ||
        source.id ||
        "",

      instance:
        source.instance ??
        source.module ??
        source.value ??
        source.ref ??
        null,

      options:
        {
          ...source,
          ...(isPlainObject(source.options) ? source.options : {}),
        },
    };
  }

  return {
    name,
    instance,
    options:
      isPlainObject(options)
        ? options
        : {},
  };
}

/* =========================================================
   FACTORY
========================================================= */

export function createModules({
  registry,
  events,
  utils,
  strict = false,
} = {}) {
  const finalRegistry =
    isObject(registry)
      ? registry
      : {};

  finalRegistry.modules =
    ensureMap(
      finalRegistry.modules
    );

  finalRegistry.moduleAliases =
    ensureMap(
      finalRegistry.moduleAliases
    );

  finalRegistry.moduleMeta =
    ensureMap(
      finalRegistry.moduleMeta
    );

  finalRegistry.moduleNameIndex =
    ensureMap(
      finalRegistry.moduleNameIndex
    );

  const recent =
    [];

  const state = {
    version:
      MODULES_VERSION,

    registerCount:
      0,

    duplicateCount:
      0,

    overwriteCount:
      0,

    unregisterCount:
      0,

    aliasCount:
      0,

    aliasConflictCount:
      0,

    disposeCount:
      0,

    clearCount:
      0,

    errorCount:
      0,

    lastRegistered:
      "",

    lastDuplicate:
      "",

    lastOverwritten:
      "",

    lastUnregistered:
      "",

    lastDisposed:
      "",

    lastError:
      null,
  };

  function pushRecent(type = "event", payload = {}) {
    recent.unshift({
      type:
        safeText(type, "event"),

      ...safeClone(
        payload,
        {}
      ),

      at:
        safeIsoDate(),
    });

    if (recent.length > MAX_RECENT_EVENTS) {
      recent.splice(MAX_RECENT_EVENTS);
    }
  }

  function isStrict(options = {}) {
    return Boolean(
      strict ||
      options?.strict === true
    );
  }

  function fail(message = "Modules error.", extra = {}, options = {}) {
    const payload = {
      message:
        safeText(message, "Modules error."),

      ...safeClone(extra, {}),

      at:
        safeIsoDate(),
    };

    state.errorCount += 1;

    state.lastError =
      payload;

    pushRecent(
      "error",
      payload
    );

    safeEmit(
      events,
      MODULE_EVENTS.error,
      payload
    );

    if (isStrict(options)) {
      throw new Error(payload.message);
    }

    safeWarn(
      utils,
      payload.message,
      extra
    );

    return false;
  }

  function rebuildNameIndex() {
    finalRegistry.moduleNameIndex.clear();

    for (const name of finalRegistry.modules.keys()) {
      const cleanName =
        normalizeName(name);

      if (cleanName) {
        finalRegistry.moduleNameIndex.set(
          normalizeLookupKey(cleanName),
          cleanName
        );
      }
    }

    return finalRegistry.moduleNameIndex;
  }

  rebuildNameIndex();

  function resolveName(nameOrAlias = "") {
    const cleanName =
      normalizeName(nameOrAlias);

    if (!cleanName) {
      return "";
    }

    if (finalRegistry.modules.has(cleanName)) {
      return cleanName;
    }

    const lookup =
      normalizeLookupKey(cleanName);

    const byNameIndex =
      finalRegistry.moduleNameIndex.get(lookup);

    if (
      byNameIndex &&
      finalRegistry.modules.has(byNameIndex)
    ) {
      return byNameIndex;
    }

    const byAlias =
      finalRegistry.moduleAliases.get(lookup);

    if (
      byAlias &&
      finalRegistry.modules.has(byAlias)
    ) {
      return byAlias;
    }

    return cleanName;
  }

  function getExistingMeta(name = "") {
    const cleanName =
      normalizeName(name);

    return (
      finalRegistry.moduleMeta.get(cleanName) ||
      null
    );
  }

  function buildMeta(name, instance, options = {}, previousMeta = null) {
    const cleanName =
      normalizeName(name);

    const opts =
      isPlainObject(options)
        ? options
        : {};

    const nowMs =
      safeNow();

    const instanceName =
      getInstanceValue(instance, "name", "");

    const instanceModuleName =
      getInstanceValue(instance, "moduleName", "");

    const instanceId =
      getInstanceValue(instance, "id", "");

    const aliases =
      uniqueAliases([
        cleanName,
        opts.alias,
        opts.aliases,
        instanceName,
        instanceModuleName,
        instanceId,
      ]);

    const previousCreatedAtMs =
      safeNumber(
        previousMeta?.createdAtMs,
        0
      );

    const createdAtMs =
      previousCreatedAtMs > 0
        ? previousCreatedAtMs
        : nowMs;

    const capabilities =
      getCapabilities(instance);

    return {
      name:
        cleanName,

      aliases,

      label:
        safeText(
          opts.label ||
            getInstanceValue(instance, "label", "") ||
            getInstanceValue(instance, "displayName", ""),
          cleanName
        ),

      version:
        safeText(
          opts.version ||
            getInstanceValue(instance, "version", ""),
          ""
        ),

      description:
        safeText(
          opts.description ||
            getInstanceValue(instance, "description", ""),
          ""
        ),

      tags:
        normalizeTags(opts.tags),

      source:
        safeText(
          opts.source,
          "core"
        ),

      type:
        getInstanceType(instance),

      capabilities,

      disposable:
        Boolean(capabilities.disposable),

      createdAt:
        previousMeta?.createdAt ||
        safeIsoDate(createdAtMs),

      createdAtMs,

      updatedAt:
        safeIsoDate(nowMs),

      updatedAtMs:
        nowMs,

      registerCount:
        safeNumber(
          previousMeta?.registerCount,
          0
        ) + 1,

      overwritten:
        Boolean(opts.overwritten),

      custom:
        safeClone(
          opts.meta,
          null
        ),
    };
  }

  function removeAliasesFor(name = "") {
    const cleanName =
      normalizeName(name);

    if (!cleanName) {
      return 0;
    }

    let removed =
      0;

    for (const [aliasName, target] of Array.from(finalRegistry.moduleAliases.entries())) {
      if (target === cleanName) {
        finalRegistry.moduleAliases.delete(aliasName);
        removed += 1;
      }
    }

    return removed;
  }

  function setAliases(name, aliases = [], options = {}) {
    const cleanName =
      normalizeName(name);

    if (!cleanName) {
      return [];
    }

    const opts =
      isPlainObject(options)
        ? options
        : {};

    const normalized =
      uniqueAliases(aliases);

    const accepted =
      [];

    for (const aliasName of normalized) {
      const currentTarget =
        finalRegistry.moduleAliases.get(aliasName);

      const hasConflict =
        Boolean(
          currentTarget &&
          currentTarget !== cleanName
        );

      if (
        hasConflict &&
        opts.overwriteAliases !== true
      ) {
        state.aliasConflictCount += 1;

        const payload = {
          alias:
            aliasName,

          target:
            currentTarget,

          attemptedTarget:
            cleanName,

          at:
            safeIsoDate(),
        };

        pushRecent(
          "alias-conflict",
          payload
        );

        safeEmit(
          events,
          MODULE_EVENTS.aliasConflict,
          payload
        );

        continue;
      }

      finalRegistry.moduleAliases.set(
        aliasName,
        cleanName
      );

      accepted.push(aliasName);
    }

    return accepted;
  }

  function get(nameOrAlias = "") {
    const resolved =
      resolveName(nameOrAlias);

    if (!resolved) {
      return null;
    }

    return (
      finalRegistry.modules.get(resolved) ||
      null
    );
  }

  function has(nameOrAlias = "") {
    const resolved =
      resolveName(nameOrAlias);

    return Boolean(
      resolved &&
      finalRegistry.modules.has(resolved)
    );
  }

  function getMeta(nameOrAlias = "") {
    const resolved =
      resolveName(nameOrAlias);

    if (!resolved) {
      return null;
    }

    const meta =
      finalRegistry.moduleMeta.get(resolved);

    return meta
      ? safeClone(meta, meta)
      : null;
  }

  function register(rawName, rawInstance, rawOptions = {}) {
    const args =
      normalizeRegisterArgs(
        rawName,
        rawInstance,
        rawOptions
      );

    const cleanName =
      normalizeName(args.name);

    const instance =
      args.instance;

    const opts =
      isPlainObject(args.options)
        ? args.options
        : {};

    if (!cleanName) {
      return fail(
        "modules.register(name, instance) requiere un nombre.",
        {
          name:
            args.name,
        },
        opts
      );
    }

    if (
      instance === null ||
      instance === undefined
    ) {
      return fail(
        "modules.register(name, instance) requiere una instancia.",
        {
          name:
            cleanName,
        },
        opts
      );
    }

    const resolvedExisting =
      resolveName(cleanName);

    const exists =
      finalRegistry.modules.has(resolvedExisting);

    const existingName =
      exists
        ? resolvedExisting
        : cleanName;

    const previous =
      exists
        ? finalRegistry.modules.get(existingName)
        : null;

    const sameInstance =
      exists &&
      previous === instance;

    const overwrite =
      opts.overwrite === true ||
      opts.replace === true;

    if (
      exists &&
      sameInstance
    ) {
      const previousMeta =
        getExistingMeta(existingName);

      const mergedAliases =
        uniqueAliases([
          previousMeta?.aliases || [],
          cleanName,
          opts.alias,
          opts.aliases,
        ]);

      const acceptedAliases =
        setAliases(
          existingName,
          mergedAliases,
          opts
        );

      const meta = {
        ...previousMeta,
        aliases:
          acceptedAliases.length
            ? acceptedAliases
            : previousMeta?.aliases || [],
        updatedAtMs:
          safeNow(),
        updatedAt:
          safeIsoDate(),
        registerCount:
          safeNumber(previousMeta?.registerCount, 1),
      };

      finalRegistry.moduleMeta.set(
        existingName,
        meta
      );

      state.duplicateCount += 1;
      state.lastDuplicate =
        existingName;

      const payload = {
        name:
          existingName,

        aliases:
          meta.aliases || [],

        sameInstance:
          true,

        overwritten:
          false,

        meta:
          safeClone(meta, {}),
      };

      pushRecent(
        "duplicate",
        payload
      );

      safeEmit(
        events,
        MODULE_EVENTS.duplicate,
        payload
      );

      return previous;
    }

    if (
      exists &&
      !overwrite
    ) {
      state.duplicateCount += 1;
      state.lastDuplicate =
        existingName;

      const meta =
        getExistingMeta(existingName);

      const payload = {
        name:
          existingName,

        requestedName:
          cleanName,

        sameInstance:
          false,

        overwritten:
          false,

        meta:
          safeClone(meta, null),
      };

      pushRecent(
        "duplicate-blocked",
        payload
      );

      safeEmit(
        events,
        MODULE_EVENTS.duplicate,
        payload
      );

      return previous;
    }

    if (
      exists &&
      overwrite &&
      opts.disposePrevious === true
    ) {
      callDispose(
        previous,
        {
          name:
            existingName,

          reason:
            "overwrite",

          next:
            cleanName,
        },
        opts
      );
    }

    finalRegistry.modules.set(
      existingName,
      instance
    );

    finalRegistry.moduleNameIndex.set(
      normalizeLookupKey(existingName),
      existingName
    );

    removeAliasesFor(existingName);

    const previousMeta =
      getExistingMeta(existingName);

    const meta =
      buildMeta(
        existingName,
        instance,
        {
          ...opts,
          overwritten:
            exists,
        },
        previousMeta
      );

    meta.aliases =
      setAliases(
        existingName,
        meta.aliases,
        opts
      );

    finalRegistry.moduleMeta.set(
      existingName,
      meta
    );

    state.registerCount += 1;
    state.lastRegistered =
      existingName;

    if (exists) {
      state.overwriteCount += 1;
      state.lastOverwritten =
        existingName;
    }

    const payload = {
      name:
        existingName,

      aliases:
        meta.aliases,

      overwritten:
        Boolean(exists),

      previousType:
        getInstanceType(previous),

      type:
        getInstanceType(instance),

      meta:
        safeClone(meta, {}),
    };

    pushRecent(
      exists ? "overwritten" : "registered",
      payload
    );

    safeEmit(
      events,
      exists
        ? MODULE_EVENTS.overwritten
        : MODULE_EVENTS.registered,
      payload
    );

    /*
      Compat con listeners legacy que solo escuchan app:module:registered.
    */
    if (exists) {
      safeEmit(
        events,
        MODULE_EVENTS.registered,
        {
          ...payload,
          legacy:
            true,
        }
      );
    }

    return instance;
  }

  function set(name, instance, options = {}) {
    return register(
      name,
      instance,
      {
        ...(isPlainObject(options) ? options : {}),
        overwrite:
          true,
      }
    );
  }

  function upsert(name, instance, options = {}) {
    return set(
      name,
      instance,
      options
    );
  }

  function alias(nameOrAlias, aliases = [], options = {}) {
    const resolved =
      resolveName(nameOrAlias);

    const opts =
      isPlainObject(options)
        ? options
        : {};

    if (
      !resolved ||
      !finalRegistry.modules.has(resolved)
    ) {
      return fail(
        "No se pueden añadir aliases a un módulo inexistente.",
        {
          name:
            nameOrAlias,
        },
        opts
      );
    }

    const instance =
      finalRegistry.modules.get(resolved);

    const previousMeta =
      getExistingMeta(resolved) ||
      buildMeta(
        resolved,
        instance,
        {},
        null
      );

    const merged =
      uniqueAliases([
        previousMeta.aliases,
        aliases,
      ]);

    const accepted =
      setAliases(
        resolved,
        merged,
        opts
      );

    const nowMs =
      safeNow();

    const meta = {
      ...previousMeta,

      aliases:
        accepted,

      updatedAt:
        safeIsoDate(nowMs),

      updatedAtMs:
        nowMs,
    };

    finalRegistry.moduleMeta.set(
      resolved,
      meta
    );

    state.aliasCount += 1;

    const payload = {
      name:
        resolved,

      aliases:
        accepted,

      at:
        meta.updatedAt,
    };

    pushRecent(
      "alias",
      payload
    );

    safeEmit(
      events,
      MODULE_EVENTS.alias,
      payload
    );

    return true;
  }

  function callDispose(instance, context = {}, options = {}) {
    if (!instance) {
      return {
        ok:
          false,

        method:
          "",

        missing:
          true,
      };
    }

    const opts =
      isPlainObject(options)
        ? options
        : {};

    const methods =
      uniqueAliases([
        opts.disposeMethod,
        opts.disposeMethods,
        DEFAULT_DISPOSE_METHODS,
      ]);

    const symbolAsyncDispose =
      getSymbolAsyncDisposeMethod(instance);

    const symbolDispose =
      getSymbolDisposeMethod(instance);

    const candidates =
      [
        symbolAsyncDispose,
        symbolDispose,
        ...methods,
      ].filter(Boolean);

    for (const method of candidates) {
      let disposeFn =
        null;

      try {
        disposeFn =
          typeof method === "symbol"
            ? instance?.[method]
            : instance?.[method];
      } catch {
        disposeFn =
          null;
      }

      if (!isFunction(disposeFn)) {
        continue;
      }

      const methodName =
        typeof method === "symbol"
          ? String(method)
          : method;

      try {
        const result =
          disposeFn.call(
            instance,
            context
          );

        state.disposeCount += 1;

        const payload = {
          name:
            context?.name || "",

          reason:
            context?.reason || "",

          method:
            methodName,

          async:
            Boolean(
              result &&
              typeof result === "object" &&
              isFunction(result.then)
            ),

          at:
            safeIsoDate(),
        };

        state.lastDisposed =
          payload.name || state.lastDisposed;

        pushRecent(
          "disposed",
          payload
        );

        safeEmit(
          events,
          MODULE_EVENTS.disposed,
          payload
        );

        if (
          result &&
          typeof result === "object" &&
          isFunction(result.catch)
        ) {
          result.catch((error) => {
            state.errorCount += 1;

            state.lastError = {
              message:
                safeText(
                  error?.message || error,
                  "Module async dispose error."
                ),

              name:
                context?.name || "",

              method:
                methodName,

              at:
                safeIsoDate(),
            };

            safeWarn(
              utils,
              `Error async ejecutando ${methodName}() del módulo "${context?.name || ""}".`,
              error
            );

            safeEmit(
              events,
              MODULE_EVENTS.disposeError,
              {
                ...state.lastError,
              }
            );
          });
        }

        return {
          ok:
            true,

          method:
            methodName,

          async:
            payload.async,
        };
      } catch (error) {
        state.errorCount += 1;

        state.lastError = {
          message:
            safeText(
              error?.message || error,
              "Module dispose error."
            ),

          name:
            context?.name || "",

          method:
            methodName,

          at:
            safeIsoDate(),
        };

        pushRecent(
          "dispose-error",
          state.lastError
        );

        safeWarn(
          utils,
          `Error ejecutando ${methodName}() del módulo "${context?.name || ""}".`,
          error
        );

        safeEmit(
          events,
          MODULE_EVENTS.disposeError,
          {
            ...state.lastError,
          }
        );

        return {
          ok:
            false,

          method:
            methodName,

          error:
            state.lastError,
        };
      }
    }

    return {
      ok:
        false,

      method:
        "",

      missing:
        false,
    };
  }

  function disposeModule(nameOrAlias = "", options = {}) {
    const resolved =
      resolveName(nameOrAlias);

    if (
      !resolved ||
      !finalRegistry.modules.has(resolved)
    ) {
      return false;
    }

    const instance =
      finalRegistry.modules.get(resolved);

    const result =
      callDispose(
        instance,
        {
          name:
            resolved,

          reason:
            options?.reason || "disposeModule",
        },
        options
      );

    return result.ok === true;
  }

  function unregister(nameOrAlias, options = {}) {
    const resolved =
      resolveName(nameOrAlias);

    const opts =
      isPlainObject(options)
        ? options
        : {};

    if (
      !resolved ||
      !finalRegistry.modules.has(resolved)
    ) {
      return false;
    }

    const instance =
      finalRegistry.modules.get(resolved);

    const meta =
      getExistingMeta(resolved);

    let disposeResult =
      null;

    if (opts.dispose === true) {
      disposeResult =
        callDispose(
          instance,
          {
            name:
              resolved,

            reason:
              opts.reason || "unregister",
          },
          opts
        );
    }

    finalRegistry.modules.delete(resolved);
    finalRegistry.moduleMeta.delete(resolved);
    finalRegistry.moduleNameIndex.delete(
      normalizeLookupKey(resolved)
    );

    removeAliasesFor(resolved);

    state.unregisterCount += 1;
    state.lastUnregistered =
      resolved;

    const payload = {
      name:
        resolved,

      type:
        getInstanceType(instance),

      disposed:
        Boolean(opts.dispose),

      disposeResult:
        disposeResult
          ? safeClone(disposeResult, disposeResult)
          : null,

      meta:
        safeClone(meta, null),

      at:
        safeIsoDate(),
    };

    pushRecent(
      "unregistered",
      payload
    );

    safeEmit(
      events,
      MODULE_EVENTS.unregistered,
      payload
    );

    return true;
  }

  function clear(options = {}) {
    const opts =
      isPlainObject(options)
        ? options
        : {};

    const names =
      Array.from(
        finalRegistry.modules.keys()
      );

    let removed =
      0;

    for (const name of names) {
      if (
        unregister(
          name,
          opts
        )
      ) {
        removed += 1;
      }
    }

    finalRegistry.moduleAliases.clear();
    finalRegistry.moduleMeta.clear();
    finalRegistry.moduleNameIndex.clear();

    state.clearCount += 1;

    const payload = {
      removed,

      dispose:
        Boolean(opts.dispose),

      at:
        safeIsoDate(),
    };

    pushRecent(
      "cleared",
      payload
    );

    safeEmit(
      events,
      MODULE_EVENTS.cleared,
      payload
    );

    return removed;
  }

  function list() {
    return Array.from(
      finalRegistry.modules.keys()
    );
  }

  function names() {
    return list();
  }

  function aliases() {
    return Array.from(
      finalRegistry.moduleAliases.keys()
    );
  }

  function aliasEntries() {
    return Array.from(
      finalRegistry.moduleAliases.entries()
    ).map(([aliasName, target]) => ({
      alias:
        aliasName,

      target,
    }));
  }

  function entries() {
    return Array.from(
      finalRegistry.modules.entries()
    );
  }

  function values() {
    return Array.from(
      finalRegistry.modules.values()
    );
  }

  function count() {
    return finalRegistry.modules.size;
  }

  function forEach(callback) {
    if (!isFunction(callback)) {
      return false;
    }

    for (const [name, instance] of finalRegistry.modules.entries()) {
      try {
        callback(
          instance,
          name,
          getMeta(name)
        );
      } catch (error) {
        state.errorCount += 1;

        state.lastError = {
          message:
            safeText(
              error?.message || error,
              "modules.forEach error."
            ),

          name,

          at:
            safeIsoDate(),
        };

        safeWarn(
          utils,
          `Error en modules.forEach("${name}")`,
          error
        );
      }
    }

    return true;
  }

  function map(callback) {
    if (!isFunction(callback)) {
      return [];
    }

    const output =
      [];

    for (const [name, instance] of finalRegistry.modules.entries()) {
      try {
        output.push(
          callback(
            instance,
            name,
            getMeta(name)
          )
        );
      } catch (error) {
        state.errorCount += 1;

        state.lastError = {
          message:
            safeText(
              error?.message || error,
              "modules.map error."
            ),

          name,

          at:
            safeIsoDate(),
        };

        safeWarn(
          utils,
          `Error en modules.map("${name}")`,
          error
        );
      }
    }

    return output;
  }

  function filter(callback) {
    if (!isFunction(callback)) {
      return [];
    }

    const output =
      [];

    for (const [name, instance] of finalRegistry.modules.entries()) {
      try {
        if (
          callback(
            instance,
            name,
            getMeta(name)
          )
        ) {
          output.push(instance);
        }
      } catch (error) {
        state.errorCount += 1;

        safeWarn(
          utils,
          `Error en modules.filter("${name}")`,
          error
        );
      }
    }

    return output;
  }

  function find(callback) {
    if (!isFunction(callback)) {
      return null;
    }

    for (const [name, instance] of finalRegistry.modules.entries()) {
      try {
        if (
          callback(
            instance,
            name,
            getMeta(name)
          )
        ) {
          return instance;
        }
      } catch (error) {
        state.errorCount += 1;

        safeWarn(
          utils,
          `Error en modules.find("${name}")`,
          error
        );
      }
    }

    return null;
  }

  function toObject() {
    const output =
      {};

    for (const [name, instance] of finalRegistry.modules.entries()) {
      output[name] =
        instance;
    }

    return output;
  }

  function getModuleSnapshot(name = "") {
    const resolved =
      resolveName(name);

    if (
      !resolved ||
      !finalRegistry.modules.has(resolved)
    ) {
      return null;
    }

    const instance =
      finalRegistry.modules.get(resolved);

    const meta =
      finalRegistry.moduleMeta.get(resolved) ||
      buildMeta(
        resolved,
        instance
      );

    const capabilities =
      getCapabilities(instance);

    return {
      name:
        resolved,

      label:
        meta.label || resolved,

      aliases:
        meta.aliases || [],

      version:
        meta.version || "",

      description:
        meta.description || "",

      tags:
        meta.tags || [],

      source:
        meta.source || "",

      type:
        getInstanceType(instance),

      disposable:
        Boolean(capabilities.disposable),

      capabilities,

      custom:
        safeClone(
          meta.custom,
          null
        ),

      createdAt:
        meta.createdAt || "",

      updatedAt:
        meta.updatedAt || "",

      registerCount:
        safeNumber(
          meta.registerCount,
          0
        ),

      overwritten:
        Boolean(meta.overwritten),
    };
  }

  function getSnapshot(options = {}) {
    const opts =
      isPlainObject(options)
        ? options
        : {};

    const moduleNames =
      list();

    return {
      version:
        MODULES_VERSION,

      count:
        count(),

      names:
        moduleNames,

      aliases:
        aliasEntries(),

      modules:
        moduleNames.map((name) =>
          getModuleSnapshot(name)
        ),

      stats: {
        registerCount:
          state.registerCount,

        duplicateCount:
          state.duplicateCount,

        overwriteCount:
          state.overwriteCount,

        unregisterCount:
          state.unregisterCount,

        aliasCount:
          state.aliasCount,

        aliasConflictCount:
          state.aliasConflictCount,

        disposeCount:
          state.disposeCount,

        clearCount:
          state.clearCount,

        errorCount:
          state.errorCount,

        lastRegistered:
          state.lastRegistered,

        lastDuplicate:
          state.lastDuplicate,

        lastOverwritten:
          state.lastOverwritten,

        lastUnregistered:
          state.lastUnregistered,

        lastDisposed:
          state.lastDisposed,

        lastError:
          safeClone(
            state.lastError,
            null
          ),
      },

      recent:
        opts.includeRecent === false
          ? []
          : recent.map((item) => ({
              ...item,
            })),

      at:
        safeIsoDate(),
    };
  }

  function reset(options = {}) {
    const removed =
      clear(options);

    state.registerCount =
      0;

    state.duplicateCount =
      0;

    state.overwriteCount =
      0;

    state.unregisterCount =
      0;

    state.aliasCount =
      0;

    state.aliasConflictCount =
      0;

    state.disposeCount =
      0;

    state.clearCount =
      0;

    state.errorCount =
      0;

    state.lastRegistered =
      "";

    state.lastDuplicate =
      "";

    state.lastOverwritten =
      "";

    state.lastUnregistered =
      "";

    state.lastDisposed =
      "";

    state.lastError =
      null;

    recent.splice(0);

    return {
      removed,
      snapshot:
        getSnapshot(),
    };
  }

  const api = {
    version:
      MODULES_VERSION,

    events:
      MODULE_EVENTS,

    register,

    set,
    upsert,

    alias,

    get,

    require(nameOrAlias = "") {
      const instance =
        get(nameOrAlias);

      if (!instance && strict) {
        throw new Error(
          `Módulo no registrado: ${nameOrAlias}`
        );
      }

      return instance;
    },

    has,

    getMeta,

    getModuleSnapshot,

    unregister,
    delete:
      unregister,
    remove:
      unregister,

    dispose:
      disposeModule,
    disposeModule,

    clear,
    reset,

    list,
    names,

    aliases,
    aliasEntries,

    entries,
    values,
    count,

    forEach,
    map,
    filter,
    find,

    toObject,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,
  };

  safeEmit(
    events,
    MODULE_EVENTS.ready,
    {
      version:
        MODULES_VERSION,

      count:
        count(),

      at:
        safeIsoDate(),
    }
  );

  safeLog(
    utils,
    "Modules ready.",
    {
      version:
        MODULES_VERSION,
      count:
        count(),
    }
  );

  return api;
}

export {
  MODULES_VERSION,
  DEFAULT_DISPOSE_METHODS,
  MODULE_EVENTS,
};

export default {
  MODULES_VERSION,
  DEFAULT_DISPOSE_METHODS,
  MODULE_EVENTS,
  createModules,
};
