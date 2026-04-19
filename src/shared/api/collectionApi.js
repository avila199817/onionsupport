/* =========================================================
   Onion SPA - Shared Collection API
   Archivo: src/shared/api/collectionApi.js

   RESPONSABILIDADES:
   - crear APIs reutilizables de colección/CRUD
   - centralizar list / detail / create / update / patch / remove
   - construir queries de listado usando shared/api/query
   - normalizar respuestas usando shared/api/response
   - integrarse con AppCore.apiClient o cliente inyectado
   - mantener la capa API desacoplada del dominio

   HARDENING PRO:
   - endpoints configurables
   - basePath/detailPath/createPath/updatePath/patchPath/removePath custom
   - mapItem / mapItems / mapDetail extensibles
   - hooks beforeCreate / beforeUpdate / beforePatch
   - soporte options transparentes hacia apiClient
   - errores claros cuando falta resource o apiClient
   - no duplica lógica de query ni de response
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  safeText,
  safeNumber,
  isPlainObject,
  buildListQuery,
} from "./query.js";

import {
  safeObject,
  normalizeCollectionResponse,
  normalizeDetailResponse,
} from "./response.js";

/* =========================================================
   PATH HELPERS
========================================================= */

function trimSlashes(
  value = ""
) {
  return safeText(
    value,
    ""
  ).replace(
    /^\/+|\/+$/g,
    ""
  );
}

function joinPath(
  ...parts
) {
  const cleaned =
    parts
      .map((part) =>
        safeText(
          part,
          ""
        )
      )
      .filter(Boolean)
      .map((part) =>
        part.replace(
          /^\/+|\/+$/g,
          ""
        )
      );

  return `/${cleaned.join("/")}`;
}

function replacePathParam(
  template,
  paramName,
  value
) {
  const rawTemplate =
    safeText(
      template,
      ""
    );

  const cleanValue =
    encodeURIComponent(
      safeText(
        value,
        ""
      )
    );

  return rawTemplate.replace(
    new RegExp(
      `:${paramName}\\b`,
      "g"
    ),
    cleanValue
  );
}

function interpolateIdPath(
  pathTemplate,
  id
) {
  const cleanId =
    safeText(id, "");

  if (!cleanId) {
    throw new Error(
      "[collectionApi] 'id' es obligatorio."
    );
  }

  return replacePathParam(
    pathTemplate,
    "id",
    cleanId
  );
}

/* =========================================================
   CLIENT RESOLUTION
========================================================= */

function isApiClientLike(
  value
) {
  return !!value &&
    typeof value ===
      "object" &&
    typeof value.get ===
      "function" &&
    typeof value.post ===
      "function" &&
    typeof value.put ===
      "function" &&
    typeof value.patch ===
      "function" &&
    typeof value.delete ===
      "function";
}

function resolveApiClient(
  explicitClient = null
) {
  if (
    isApiClientLike(
      explicitClient
    )
  ) {
    return explicitClient;
  }

  if (
    isApiClientLike(
      AppCore?.apiClient
    )
  ) {
    return AppCore.apiClient;
  }

  throw new Error(
    "[collectionApi] No se encontró un apiClient válido. Inyecta client o expón AppCore.apiClient."
  );
}

/* =========================================================
   FACTORY
========================================================= */

export function createCollectionApi(
  resource,
  config = {}
) {
  const resourceName =
    trimSlashes(resource);

  if (!resourceName) {
    throw new Error(
      "[collectionApi] 'resource' es obligatorio."
    );
  }

  const options =
    safeObject(
      config,
      {}
    );

  const {
    client = null,
    basePath = `/${resourceName}`,
    detailPath = null,
    createPath = null,
    updatePath = null,
    patchPath = null,
    removePath = null,

    listQueryConfig = {},

    mapItem = null,
    mapItems = null,
    mapDetail = null,

    normalizeListResponse = null,
    normalizeDetail = null,

    beforeCreate = null,
    beforeUpdate = null,
    beforePatch = null,

    buildListOptions = null,
    buildDetailOptions = null,
    buildCreateOptions = null,
    buildUpdateOptions = null,
    buildPatchOptions = null,
    buildRemoveOptions = null,
  } = options;

  function getClient() {
    return resolveApiClient(
      client
    );
  }

  function getBasePath() {
    return joinPath(
      basePath
    );
  }

  function getDetailPath(
    id
  ) {
    if (detailPath) {
      return joinPath(
        interpolateIdPath(
          detailPath,
          id
        )
      );
    }

    return joinPath(
      getBasePath(),
      safeText(id, "")
    );
  }

  function getCreatePath() {
    return createPath
      ? joinPath(
          createPath
        )
      : getBasePath();
  }

  function getUpdatePath(
    id
  ) {
    if (updatePath) {
      return joinPath(
        interpolateIdPath(
          updatePath,
          id
        )
      );
    }

    return getDetailPath(id);
  }

  function getPatchPath(
    id
  ) {
    if (patchPath) {
      return joinPath(
        interpolateIdPath(
          patchPath,
          id
        )
      );
    }

    return getDetailPath(id);
  }

  function getRemovePath(
    id
  ) {
    if (removePath) {
      return joinPath(
        interpolateIdPath(
          removePath,
          id
        )
      );
    }

    return getDetailPath(id);
  }

  function normalizeList(
    payload,
    params = {}
  ) {
    if (
      typeof normalizeListResponse ===
      "function"
    ) {
      return normalizeListResponse(
        payload,
        params
      );
    }

    return normalizeCollectionResponse(
      payload,
      {
        mapItem,
        mapItems,
        fallbackPage:
          safeNumber(
            params?.page,
            1
          ),
      }
    );
  }

  function normalizeOne(
    payload
  ) {
    if (
      typeof normalizeDetail ===
      "function"
    ) {
      return normalizeDetail(
        payload
      );
    }

    return normalizeDetailResponse(
      payload,
      {
        mapDetail,
      }
    );
  }

  function resolveBuiltOptions(
    builder,
    payload = {}
  ) {
    if (
      typeof builder !==
      "function"
    ) {
      return {};
    }

    const result =
      builder(payload);

    return isPlainObject(result)
      ? result
      : {};
  }

  return {
    resource:
      resourceName,

    getPath() {
      return getBasePath();
    },

    getDetailPath,

    getCreatePath,

    getUpdatePath,

    getPatchPath,

    getRemovePath,

    async list(
      params = {},
      requestOptions = {}
    ) {
      const apiClient =
        getClient();

      const query =
        buildListQuery(
          params,
          listQueryConfig
        );

      const builtOptions =
        resolveBuiltOptions(
          buildListOptions,
          {
            resource:
              resourceName,
            params,
            query,
            requestOptions,
          }
        );

      const payload =
        await apiClient.get(
          getBasePath(),
          {
            ...builtOptions,
            ...requestOptions,
            query:
              requestOptions
                ?.query &&
              isPlainObject(
                requestOptions.query
              )
                ? {
                    ...query,
                    ...requestOptions.query,
                  }
                : query,
          }
        );

      return normalizeList(
        payload,
        params
      );
    },

    async detail(
      id,
      requestOptions = {}
    ) {
      const apiClient =
        getClient();

      const builtOptions =
        resolveBuiltOptions(
          buildDetailOptions,
          {
            resource:
              resourceName,
            id,
            requestOptions,
          }
        );

      const payload =
        await apiClient.get(
          getDetailPath(id),
          {
            ...builtOptions,
            ...requestOptions,
          }
        );

      return normalizeOne(
        payload
      );
    },

    async create(
      data = {},
      requestOptions = {}
    ) {
      const apiClient =
        getClient();

      const body =
        typeof beforeCreate ===
        "function"
          ? beforeCreate(
              data,
              requestOptions
            )
          : data;

      const builtOptions =
        resolveBuiltOptions(
          buildCreateOptions,
          {
            resource:
              resourceName,
            data,
            body,
            requestOptions,
          }
        );

      const payload =
        await apiClient.post(
          getCreatePath(),
          body,
          {
            ...builtOptions,
            ...requestOptions,
          }
        );

      return normalizeOne(
        payload
      );
    },

    async update(
      id,
      data = {},
      requestOptions = {}
    ) {
      const apiClient =
        getClient();

      const body =
        typeof beforeUpdate ===
        "function"
          ? beforeUpdate(
              data,
              id,
              requestOptions
            )
          : data;

      const builtOptions =
        resolveBuiltOptions(
          buildUpdateOptions,
          {
            resource:
              resourceName,
            id,
            data,
            body,
            requestOptions,
          }
        );

      const payload =
        await apiClient.put(
          getUpdatePath(id),
          body,
          {
            ...builtOptions,
            ...requestOptions,
          }
        );

      return normalizeOne(
        payload
      );
    },

    async patch(
      id,
      data = {},
      requestOptions = {}
    ) {
      const apiClient =
        getClient();

      const body =
        typeof beforePatch ===
        "function"
          ? beforePatch(
              data,
              id,
              requestOptions
            )
          : data;

      const builtOptions =
        resolveBuiltOptions(
          buildPatchOptions,
          {
            resource:
              resourceName,
            id,
            data,
            body,
            requestOptions,
          }
        );

      const payload =
        await apiClient.patch(
          getPatchPath(id),
          body,
          {
            ...builtOptions,
            ...requestOptions,
          }
        );

      return normalizeOne(
        payload
      );
    },

    async remove(
      id,
      requestOptions = {}
    ) {
      const apiClient =
        getClient();

      const builtOptions =
        resolveBuiltOptions(
          buildRemoveOptions,
          {
            resource:
              resourceName,
            id,
            requestOptions,
          }
        );

      const payload =
        await apiClient.delete(
          getRemovePath(id),
          {
            ...builtOptions,
            ...requestOptions,
          }
        );

      return {
        ok: true,
        item:
          payload?.item ||
          payload?.data ||
          payload?.result ||
          payload ||
          null,
        raw: payload,
      };
    },
  };
}

export default createCollectionApi;
