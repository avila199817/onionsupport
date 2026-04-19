export {
  safeText,
  safeNumber,
  isPlainObject,
  isEmptyQueryValue,
  serializePrimitive,
  flattenQueryObject,
  cleanQueryParams,
  mergeQueryParams,
  buildListQuery,
  toURLSearchParams,
  toQueryString,
} from "./query.js";

export {
  safeArray,
  safeObject,
  extractCollectionItems,
  extractCollectionTotal,
  extractCollectionPage,
  extractCollectionLimit,
  extractCollectionOffset,
  extractCollectionMeta,
  extractDetailItem,
  normalizeCollectionResponse,
  normalizeDetailResponse,
  isCollectionResponseEmpty,
  hasCollectionResponseItems,
  getNormalizedCollectionCount,
  getNormalizedCollectionTotal,
} from "./response.js";

export {
  createCollectionApi,
  default as createCollectionApiDefault,
} from "./collectionApi.js";
