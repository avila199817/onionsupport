/* =========================================================
   Onion SPA - Shared API Query
   Archivo: src/shared/api/query.js

   RESPONSABILIDADES:
   - limpiar query params
   - serializar valores primitivos de forma consistente
   - detectar valores vacíos no serializables
   - aplanar objetos anidados para query string
   - construir queries de listado reutilizables
   - soportar paginación, búsqueda, sort y filtros
   - no acoplar lógica de dominio
   - no depender de AppCore ni fetch

   HARDENING PRO:
   - tolera null / undefined / strings vacíos
   - soporta arrays
   - soporta Date
   - soporta boolean / number / bigint
   - flatten seguro con dot notation
   - evita meter objetos vacíos en query
   - permite params customizables
   - helpers puros y reutilizables
========================================================= */

/* =========================================================
   BASICS
========================================================= */

export function safeText(
  value,
  fallback = ""
) {
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

export function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
}

export function isPlainObject(
  value
) {
  return !!value &&
    typeof value ===
      "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date);
}

/* =========================================================
   EMPTY VALUE DETECTION
========================================================= */

export function isEmptyQueryValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return true;
  }

  if (
    typeof value ===
    "string"
  ) {
    return (
      value.trim() === ""
    );
  }

  if (
    Array.isArray(value)
  ) {
    return (
      value.length === 0
    );
  }

  if (
    isPlainObject(value)
  ) {
    return (
      Object.keys(value)
        .length === 0
    );
  }

  if (
    typeof value ===
    "number"
  ) {
    return !Number.isFinite(
      value
    );
  }

  if (
    typeof value ===
    "bigint"
  ) {
    return false;
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return false;
  }

  if (
    value instanceof Date
  ) {
    return Number.isNaN(
      value.getTime()
    );
  }

  return false;
}

/* =========================================================
   SERIALIZATION
========================================================= */

export function serializePrimitive(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    value instanceof Date
  ) {
    return Number.isNaN(
      value.getTime()
    )
      ? ""
      : value.toISOString();
  }

  if (
    typeof value ===
    "string"
  ) {
    return value.trim();
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value
      ? "true"
      : "false";
  }

  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value
    )
      ? String(value)
      : "";
  }

  if (
    typeof value ===
    "bigint"
  ) {
    return String(value);
  }

  return safeText(
    value,
    ""
  );
}

/* =========================================================
   FLATTEN
========================================================= */

export function flattenQueryObject(
  input = {},
  prefix = "",
  output = {}
) {
  if (
    !isPlainObject(input)
  ) {
    return output;
  }

  for (const [
    rawKey,
    rawValue,
  ] of Object.entries(
    input
  )) {
    const key = safeText(
      rawKey,
      ""
    );

    if (!key) {
      continue;
    }

    const composedKey =
      prefix
        ? `${prefix}.${key}`
        : key;

    if (
      isEmptyQueryValue(
        rawValue
      )
    ) {
      continue;
    }

    if (
      Array.isArray(
        rawValue
      )
    ) {
      const serializedValues =
        rawValue
          .map((item) =>
            serializePrimitive(
              item
            )
          )
          .filter(Boolean);

      if (
        serializedValues.length
      ) {
        output[
          composedKey
        ] =
          serializedValues;
      }

      continue;
    }

    if (
      isPlainObject(
        rawValue
      )
    ) {
      flattenQueryObject(
        rawValue,
        composedKey,
        output
      );
      continue;
    }

    const serialized =
      serializePrimitive(
        rawValue
      );

    if (serialized) {
      output[
        composedKey
      ] = serialized;
    }
  }

  return output;
}

/* =========================================================
   CLEANERS
========================================================= */

export function cleanQueryParams(
  input = {}
) {
  if (
    !isPlainObject(input)
  ) {
    return {};
  }

  const output = {};

  for (const [
    rawKey,
    rawValue,
  ] of Object.entries(
    input
  )) {
    const key = safeText(
      rawKey,
      ""
    );

    if (!key) {
      continue;
    }

    if (
      isEmptyQueryValue(
        rawValue
      )
    ) {
      continue;
    }

    if (
      Array.isArray(
        rawValue
      )
    ) {
      const serializedValues =
        rawValue
          .map((item) =>
            serializePrimitive(
              item
            )
          )
          .filter(Boolean);

      if (
        serializedValues.length
      ) {
        output[key] =
          serializedValues;
      }

      continue;
    }

    if (
      isPlainObject(
        rawValue
      )
    ) {
      Object.assign(
        output,
        flattenQueryObject(
          rawValue,
          key
        )
      );
      continue;
    }

    const serialized =
      serializePrimitive(
        rawValue
      );

    if (serialized) {
      output[key] =
        serialized;
    }
  }

  return output;
}

export function mergeQueryParams(
  ...sources
) {
  const output = {};

  for (const source of sources) {
    if (
      !isPlainObject(
        source
      )
    ) {
      continue;
    }

    Object.assign(
      output,
      cleanQueryParams(
        source
      )
    );
  }

  return output;
}

/* =========================================================
   LIST QUERY BUILDER
========================================================= */

export function buildListQuery(
  params = {},
  config = {}
) {
  const source =
    isPlainObject(params)
      ? params
      : {};

  const options =
    isPlainObject(config)
      ? config
      : {};

  const {
    pageParam = "page",
    limitParam = "limit",
    searchParam = "search",
    sortByParam = "sortBy",
    sortDirParam = "sortDir",
    defaultPage = 1,
    defaultLimit = 20,
    includeDefaults = false,
    includePagination = true,
    includeSearch = true,
    includeSort = true,
    filtersKey = "filters",
    queryKey = "query",
  } = options;

  const output = {};

  const page =
    safeNumber(
      source.page,
      defaultPage
    );

  const limit =
    safeNumber(
      source.limit ??
        source.pageSize,
      defaultLimit
    );

  const search =
    safeText(
      source.search,
      ""
    );

  const sortBy =
    safeText(
      source.sortBy,
      ""
    );

  const sortDir =
    safeText(
      source.sortDir,
      ""
    );

  if (includePagination) {
    if (
      includeDefaults ||
      page !== defaultPage
    ) {
      output[
        pageParam
      ] = page;
    }

    if (
      includeDefaults ||
      limit !==
        defaultLimit
    ) {
      output[
        limitParam
      ] = limit;
    }
  }

  if (
    includeSearch &&
    search
  ) {
    output[
      searchParam
    ] = search;
  }

  if (
    includeSort &&
    sortBy
  ) {
    output[
      sortByParam
    ] = sortBy;
  }

  if (
    includeSort &&
    sortDir
  ) {
    output[
      sortDirParam
    ] = sortDir;
  }

  if (
    isPlainObject(
      source[filtersKey]
    )
  ) {
    Object.assign(
      output,
      cleanQueryParams(
        source[filtersKey]
      )
    );
  }

  if (
    isPlainObject(
      source[queryKey]
    )
  ) {
    Object.assign(
      output,
      cleanQueryParams(
        source[queryKey]
      )
    );
  }

  for (const [
    rawKey,
    rawValue,
  ] of Object.entries(
    source
  )) {
    const key = safeText(
      rawKey,
      ""
    );

    if (!key) {
      continue;
    }

    if (
      [
        "page",
        "limit",
        "pageSize",
        "search",
        "sortBy",
        "sortDir",
        filtersKey,
        queryKey,
      ].includes(key)
    ) {
      continue;
    }

    if (
      key in output
    ) {
      continue;
    }

    if (
      isEmptyQueryValue(
        rawValue
      )
    ) {
      continue;
    }

    if (
      isPlainObject(
        rawValue
      )
    ) {
      Object.assign(
        output,
        flattenQueryObject(
          rawValue,
          key
        )
      );
      continue;
    }

    if (
      Array.isArray(
        rawValue
      )
    ) {
      const serializedValues =
        rawValue
          .map((item) =>
            serializePrimitive(
              item
            )
          )
          .filter(Boolean);

      if (
        serializedValues.length
      ) {
        output[key] =
          serializedValues;
      }

      continue;
    }

    const serialized =
      serializePrimitive(
        rawValue
      );

    if (serialized) {
      output[key] =
        serialized;
    }
  }

  return cleanQueryParams(
    output
  );
}

/* =========================================================
   URL SEARCH PARAMS
========================================================= */

export function toURLSearchParams(
  input = {}
) {
  const cleaned =
    cleanQueryParams(
      input
    );

  const searchParams =
    new URLSearchParams();

  for (const [
    key,
    value,
  ] of Object.entries(
    cleaned
  )) {
    if (
      Array.isArray(
        value
      )
    ) {
      for (const item of value) {
        if (
          !isEmptyQueryValue(
            item
          )
        ) {
          searchParams.append(
            key,
            serializePrimitive(
              item
            )
          );
        }
      }

      continue;
    }

    searchParams.append(
      key,
      serializePrimitive(
        value
      )
    );
  }

  return searchParams;
}

/* =========================================================
   URL QUERY STRING
========================================================= */

export function toQueryString(
  input = {}
) {
  const searchParams =
    toURLSearchParams(
      input
    );

  const queryString =
    searchParams.toString();

  return queryString
    ? `?${queryString}`
    : "";
}
