/* =========================================================
   Onion SPA - Shared API Response
   Archivo: src/shared/api/response.js

   RESPONSABILIDADES:
   - extraer items de respuestas de colección heterogéneas
   - extraer total/page/limit/meta de respuestas backend
   - normalizar respuestas de listado
   - normalizar respuestas de detalle
   - tolerar arrays directos y payloads con data/items/results/etc.
   - no acoplar lógica de dominio
   - no depender de AppCore ni fetch

   HARDENING PRO:
   - soporta backends heterogéneos
   - soporta estructuras meta/pagination
   - fallback robusto si faltan campos
   - mapItem / mapItems / mapDetail extensibles
   - metaResolver extensible
   - respuestas consistentes para todas las vistas
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

export function safeArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

export function safeObject(
  value,
  fallback = {}
) {
  return value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
    ? value
    : fallback;
}

export function isPlainObject(
  value
) {
  return !!value &&
    typeof value ===
      "object" &&
    !Array.isArray(value);
}

/* =========================================================
   CANDIDATE READERS
========================================================= */

function readFirstFiniteNumber(
  candidates = [],
  fallback = 0
) {
  for (const candidate of candidates) {
    const n = Number(candidate);

    if (
      Number.isFinite(n)
    ) {
      return n;
    }
  }

  return fallback;
}

function readFirstPositiveNumber(
  candidates = [],
  fallback = 1
) {
  for (const candidate of candidates) {
    const n = Number(candidate);

    if (
      Number.isFinite(n) &&
      n > 0
    ) {
      return n;
    }
  }

  return fallback;
}

function readFirstDefined(
  candidates = [],
  fallback = null
) {
  for (const candidate of candidates) {
    if (
      candidate !==
        undefined &&
      candidate !== null
    ) {
      return candidate;
    }
  }

  return fallback;
}

/* =========================================================
   COLLECTION EXTRACTION
========================================================= */

export function extractCollectionItems(
  payload
) {
  if (
    Array.isArray(payload)
  ) {
    return payload;
  }

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return [];
  }

  const directCandidates = [
    payload.items,
    payload.data,
    payload.results,
    payload.rows,
    payload.records,
    payload.list,
    payload.collection,
  ];

  for (const candidate of directCandidates) {
    if (
      Array.isArray(candidate)
    ) {
      return candidate;
    }
  }

  const nestedCandidates = [
    payload.data?.items,
    payload.data?.results,
    payload.data?.rows,
    payload.result?.items,
    payload.result?.results,
    payload.pagination?.items,
    payload.pagination?.rows,
    payload.meta?.items,
  ];

  for (const candidate of nestedCandidates) {
    if (
      Array.isArray(candidate)
    ) {
      return candidate;
    }
  }

  return [];
}

export function extractCollectionTotal(
  payload,
  items = []
) {
  if (
    Array.isArray(payload)
  ) {
    return payload.length;
  }

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return safeArray(items)
      .length;
  }

  return readFirstFiniteNumber(
    [
      payload.total,
      payload.count,
      payload.totalCount,
      payload.recordsTotal,
      payload.pagination
        ?.total,
      payload.pagination
        ?.count,
      payload.meta?.total,
      payload.meta?.count,
      payload.data?.total,
      payload.data?.count,
      payload.data?.totalCount,
      payload.result?.total,
      payload.result?.count,
    ],
    safeArray(items).length
  );
}

export function extractCollectionPage(
  payload,
  fallback = 1
) {
  if (
    Array.isArray(payload)
  ) {
    return fallback;
  }

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return fallback;
  }

  return readFirstPositiveNumber(
    [
      payload.page,
      payload.currentPage,
      payload.pagination
        ?.page,
      payload.pagination
        ?.currentPage,
      payload.meta?.page,
      payload.meta
        ?.currentPage,
      payload.data?.page,
      payload.data
        ?.currentPage,
      payload.result?.page,
    ],
    fallback
  );
}

export function extractCollectionLimit(
  payload,
  items = []
) {
  if (
    Array.isArray(payload)
  ) {
    return safeArray(items)
      .length;
  }

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return safeArray(items)
      .length;
  }

  return readFirstPositiveNumber(
    [
      payload.limit,
      payload.pageSize,
      payload.perPage,
      payload.take,
      payload.pagination
        ?.limit,
      payload.pagination
        ?.pageSize,
      payload.pagination
        ?.perPage,
      payload.meta?.limit,
      payload.meta
        ?.pageSize,
      payload.data?.limit,
      payload.data
        ?.pageSize,
      payload.result?.limit,
    ],
    safeArray(items).length
  );
}

export function extractCollectionOffset(
  payload,
  fallback = 0
) {
  if (
    Array.isArray(payload)
  ) {
    return fallback;
  }

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return fallback;
  }

  return readFirstFiniteNumber(
    [
      payload.offset,
      payload.skip,
      payload.pagination
        ?.offset,
      payload.pagination
        ?.skip,
      payload.meta?.offset,
      payload.meta?.skip,
      payload.data?.offset,
      payload.result?.offset,
    ],
    fallback
  );
}

export function extractCollectionMeta(
  payload
) {
  if (
    !payload ||
    typeof payload !==
      "object" ||
    Array.isArray(payload)
  ) {
    return {};
  }

  return safeObject(
    readFirstDefined(
      [
        payload.meta,
        payload.pagination,
      ],
      {}
    ),
    {}
  );
}

/* =========================================================
   DETAIL EXTRACTION
========================================================= */

export function extractDetailItem(
  payload
) {
  if (
    payload === null ||
    payload === undefined
  ) {
    return null;
  }

  if (
    Array.isArray(payload)
  ) {
    return payload[0] ?? null;
  }

  if (
    !isPlainObject(payload)
  ) {
    return payload;
  }

  const candidates = [
    payload.item,
    payload.data,
    payload.result,
    payload.record,
    payload.details,
  ];

  for (const candidate of candidates) {
    if (
      candidate !==
        undefined &&
      candidate !== null
    ) {
      return candidate;
    }
  }

  return payload;
}

/* =========================================================
   NORMALIZERS
========================================================= */

export function normalizeCollectionResponse(
  payload,
  options = {}
) {
  const {
    mapItem = null,
    mapItems = null,
    metaResolver = null,
    fallbackPage = 1,
  } = safeObject(options, {});

  const rawItems = safeArray(
    extractCollectionItems(
      payload
    )
  );

  let items = rawItems;

  if (
    typeof mapItems ===
    "function"
  ) {
    items = safeArray(
      mapItems(
        rawItems,
        payload
      )
    );
  } else if (
    typeof mapItem ===
    "function"
  ) {
    items = rawItems.map(
      (
        item,
        index
      ) =>
        mapItem(
          item,
          index,
          payload
        )
    );
  }

  const total =
    extractCollectionTotal(
      payload,
      items
    );

  const page =
    extractCollectionPage(
      payload,
      fallbackPage
    );

  const limit =
    extractCollectionLimit(
      payload,
      items
    );

  const offset =
    extractCollectionOffset(
      payload,
      0
    );

  const baseMeta =
    extractCollectionMeta(
      payload
    );

  const extraMeta =
    typeof metaResolver ===
    "function"
      ? safeObject(
          metaResolver(
            payload,
            items
          ),
          {}
        )
      : {};

  return {
    ok: true,
    items,
    total,
    page,
    limit,
    offset,
    hasItems:
      items.length > 0,
    isEmpty:
      items.length === 0,
    raw: payload,
    meta: {
      ...baseMeta,
      ...extraMeta,
    },
  };
}

export function normalizeDetailResponse(
  payload,
  options = {}
) {
  const {
    mapDetail = null,
    metaResolver = null,
  } = safeObject(options, {});

  const rawItem =
    extractDetailItem(
      payload
    );

  const item =
    typeof mapDetail ===
    "function"
      ? mapDetail(
          rawItem,
          payload
        )
      : rawItem;

  const extraMeta =
    typeof metaResolver ===
    "function"
      ? safeObject(
          metaResolver(
            payload,
            item
          ),
          {}
        )
      : {};

  return {
    ok: true,
    item:
      item ?? null,
    raw: payload,
    meta: extraMeta,
  };
}

/* =========================================================
   STATUS HELPERS
========================================================= */

export function isCollectionResponseEmpty(
  normalized
) {
  return (
    safeArray(
      normalized?.items
    ).length === 0
  );
}

export function hasCollectionResponseItems(
  normalized
) {
  return (
    safeArray(
      normalized?.items
    ).length > 0
  );
}

export function getNormalizedCollectionCount(
  normalized
) {
  return safeArray(
    normalized?.items
  ).length;
}

export function getNormalizedCollectionTotal(
  normalized
) {
  return safeNumber(
    normalized?.total,
    getNormalizedCollectionCount(
      normalized
    )
  );
}
