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
   - register idempotente
   - unregister seguro con dispose opcional
   - eventos consistentes
   - snapshot debug enterprise
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const MODULES_VERSION =
  "10.0.0";

const DEFAULT_DISPOSE_METHODS =
  Object.freeze([
    "destroy",
    "dispose",
    "unmount",
    "stop",
    "teardown",
    "cleanup",
  ]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
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
    String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNow() {
  return Date.now();
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeClone(value, fallback = null) {
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
  try {
    events?.emit?.(
      name,
      payload
    );

    return true;
  } catch {}

  return false;
}

function safeWarn(...args) {
  try {
    console.warn(
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

  if (isObject(value)) {
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

function normalizeName(name = "") {
  return safeText(name, "");
}

function normalizeAlias(alias = "") {
  return safeText(alias, "")
    .toLowerCase();
}

function uniqueAliases(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .map((value) => normalizeAlias(value))
        .filter(Boolean)
    )
  );
}

function createNoopDisposer() {
  return () => false;
}

/* =========================================================
   FACTORY
========================================================= */

export function createModules({
  registry,
  events,
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

  const state = {
    version:
      MODULES_VERSION,

    registerCount:
      0,

    unregisterCount:
      0,

    disposeCount:
      0,

    errorCount:
      0,

    lastRegistered:
      "",

    lastUnregistered:
      "",

    lastError:
      null,
  };

  function fail(message = "Modules error.", extra = {}) {
    state.errorCount += 1;

    state.lastError = {
      message:
        safeText(message, "Modules error."),

      ...extra,

      at:
        safeIsoDate(),
    };

    if (strict) {
      throw new Error(state.lastError.message);
    }

    safeWarn(
      state.lastError.message,
      extra
    );

    return false;
  }

  function resolveName(nameOrAlias = "") {
    const cleanName =
      normalizeName(nameOrAlias);

    if (!cleanName) {
      return "";
    }

    if (finalRegistry.modules.has(cleanName)) {
      return cleanName;
    }

    const alias =
      normalizeAlias(cleanName);

    return (
      finalRegistry.moduleAliases.get(alias) ||
      cleanName
    );
  }

  function buildMeta(name, instance, options = {}) {
    const opts =
      isObject(options)
        ? options
        : {};

    const createdAtMs =
      safeNow();

    const aliases =
      uniqueAliases([
        ...(opts.aliases || []),
        opts.alias,
        instance?.name,
        instance?.moduleName,
        instance?.id,
      ]);

    return {
      name,

      aliases,

      label:
        safeText(
          opts.label ||
            instance?.label ||
            instance?.displayName,
          name
        ),

      version:
        safeText(
          opts.version ||
            instance?.version,
          ""
        ),

      description:
        safeText(
          opts.description ||
            instance?.description,
          ""
        ),

      tags:
        safeArray(opts.tags)
          .map((tag) => safeText(tag, ""))
          .filter(Boolean),

      source:
        safeText(
          opts.source,
          "core"
        ),

      createdAt:
        safeIsoDate(createdAtMs),

      createdAtMs,

      updatedAt:
        safeIsoDate(createdAtMs),

      updatedAtMs:
        createdAtMs,

      overwritten:
        Boolean(opts.overwritten),

      disposable:
        DEFAULT_DISPOSE_METHODS.some((method) =>
          isFunction(instance?.[method])
        ),

      type:
        typeof instance,
    };
  }

  function setAliases(name, aliases = []) {
    const cleanName =
      normalizeName(name);

    if (!cleanName) {
      return [];
    }

    const normalized =
      uniqueAliases(aliases);

    for (const alias of normalized) {
      finalRegistry.moduleAliases.set(
        alias,
        cleanName
      );
    }

    return normalized;
  }

  function removeAliasesFor(name = "") {
    const cleanName =
      normalizeName(name);

    if (!cleanName) {
      return 0;
    }

    let removed =
      0;

    for (const [alias, target] of Array.from(finalRegistry.moduleAliases.entries())) {
      if (target === cleanName) {
        finalRegistry.moduleAliases.delete(alias);
        removed += 1;
      }
    }

    return removed;
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

    return (
      finalRegistry.moduleMeta.get(resolved) ||
      null
    );
  }

  function register(name, instance, options = {}) {
    const cleanName =
      normalizeName(name);

    const opts =
      isObject(options)
        ? options
        : {};

    if (!cleanName) {
      return fail(
        "modules.register(name, instance) requiere un nombre.",
        {
          name,
        }
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
        }
      );
    }

    const exists =
      finalRegistry.modules.has(cleanName);

    const overwrite =
      opts.overwrite !== false;

    if (
      exists &&
      !overwrite
    ) {
      return finalRegistry.modules.get(cleanName);
    }

    const previous =
      exists
        ? finalRegistry.modules.get(cleanName)
        : null;

    finalRegistry.modules.set(
      cleanName,
      instance
    );

    removeAliasesFor(cleanName);

    const meta =
      buildMeta(
        cleanName,
        instance,
        {
          ...opts,
          overwritten:
            exists,
        }
      );

    setAliases(
      cleanName,
      meta.aliases
    );

    finalRegistry.moduleMeta.set(
      cleanName,
      meta
    );

    state.registerCount += 1;
    state.lastRegistered =
      cleanName;

    safeEmit(
      events,
      "app:module:registered",
      {
        name:
          cleanName,

        aliases:
          meta.aliases,

        overwritten:
          exists,

        instance,

        previous,

        meta:
          {
            ...meta,
            type:
              meta.type,
          },
      }
    );

    return instance;
  }

  function alias(name, aliases = []) {
    const cleanName =
      normalizeName(name);

    if (
      !cleanName ||
      !finalRegistry.modules.has(cleanName)
    ) {
      return false;
    }

    const meta =
      finalRegistry.moduleMeta.get(cleanName) ||
      buildMeta(
        cleanName,
        finalRegistry.modules.get(cleanName)
      );

    const merged =
      uniqueAliases([
        ...meta.aliases,
        ...safeArray(aliases),
      ]);

    meta.aliases =
      setAliases(
        cleanName,
        merged
      );

    meta.updatedAtMs =
      safeNow();

    meta.updatedAt =
      safeIsoDate(meta.updatedAtMs);

    finalRegistry.moduleMeta.set(
      cleanName,
      meta
    );

    safeEmit(
      events,
      "app:module:alias",
      {
        name:
          cleanName,

        aliases:
          meta.aliases,
      }
    );

    return true;
  }

  function callDispose(instance, context = {}) {
    if (!instance) {
      return false;
    }

    for (const method of DEFAULT_DISPOSE_METHODS) {
      if (!isFunction(instance?.[method])) {
        continue;
      }

      try {
        instance[method](context);
        state.disposeCount += 1;
        return true;
      } catch (error) {
        state.errorCount += 1;

        state.lastError = {
          message:
            safeText(
              error?.message || error,
              "Module dispose error."
            ),

          method,

          at:
            safeIsoDate(),
        };

        safeWarn(
          `Error ejecutando ${method}() del módulo.`,
          error
        );

        return false;
      }
    }

    return false;
  }

  function unregister(nameOrAlias, options = {}) {
    const resolved =
      resolveName(nameOrAlias);

    const opts =
      isObject(options)
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
      finalRegistry.moduleMeta.get(resolved) ||
      null;

    if (opts.dispose === true) {
      callDispose(
        instance,
        {
          name:
            resolved,

          reason:
            opts.reason || "unregister",
        }
      );
    }

    finalRegistry.modules.delete(resolved);
    finalRegistry.moduleMeta.delete(resolved);
    removeAliasesFor(resolved);

    state.unregisterCount += 1;
    state.lastUnregistered =
      resolved;

    safeEmit(
      events,
      "app:module:unregistered",
      {
        name:
          resolved,

        instance,

        meta,

        disposed:
          Boolean(opts.dispose),
      }
    );

    return true;
  }

  function clear(options = {}) {
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
          options
        )
      ) {
        removed += 1;
      }
    }

    return removed;
  }

  function list() {
    return Array.from(
      finalRegistry.modules.keys()
    );
  }

  function aliases() {
    return Array.from(
      finalRegistry.moduleAliases.keys()
    );
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

        safeWarn(
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

        safeWarn(
          `Error en modules.map("${name}")`,
          error
        );
      }
    }

    return output;
  }

  function getSnapshot() {
    const moduleNames =
      list();

    return {
      version:
        state.version,

      count:
        count(),

      names:
        moduleNames,

      aliases:
        Array.from(
          finalRegistry.moduleAliases.entries()
        ).map(([aliasName, target]) => ({
          alias:
            aliasName,
          target,
        })),

      modules:
        moduleNames.map((name) => {
          const instance =
            finalRegistry.modules.get(name);

          const meta =
            finalRegistry.moduleMeta.get(name) ||
            {};

          return {
            name,

            label:
              meta.label || name,

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

            disposable:
              Boolean(meta.disposable),

            type:
              typeof instance,

            hasInit:
              isFunction(instance?.init),

            hasBoot:
              isFunction(instance?.boot),

            hasDestroy:
              isFunction(instance?.destroy),

            hasDispose:
              isFunction(instance?.dispose),

            createdAt:
              meta.createdAt || "",

            updatedAt:
              meta.updatedAt || "",
          };
        }),

      stats: {
        registerCount:
          state.registerCount,

        unregisterCount:
          state.unregisterCount,

        disposeCount:
          state.disposeCount,

        errorCount:
          state.errorCount,

        lastRegistered:
          state.lastRegistered,

        lastUnregistered:
          state.lastUnregistered,

        lastError:
          safeClone(
            state.lastError,
            null
          ),
      },

      at:
        safeIsoDate(),
    };
  }

  function reset(options = {}) {
    const removed =
      clear(options);

    state.registerCount =
      0;

    state.unregisterCount =
      0;

    state.disposeCount =
      0;

    state.errorCount =
      0;

    state.lastRegistered =
      "";

    state.lastUnregistered =
      "";

    state.lastError =
      null;

    return {
      removed,
      snapshot:
        getSnapshot(),
    };
  }

  return {
    register,
    set:
      register,

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

    unregister,
    delete:
      unregister,
    remove:
      unregister,

    clear,
    reset,

    list,
    aliases,
    entries,
    values,
    count,

    forEach,
    map,

    getSnapshot,
    getDebugSnapshot:
      getSnapshot,
  };
}

export default {
  createModules,
};
