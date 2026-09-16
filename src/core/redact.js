import { SENSITIVE_QUERY_PARAMS } from "./config.js";
import { cleanText, normalizeKey } from "./presentation-text.js";

/* Secret redaction: one authority, two named mechanisms.

   redactSecrets(text) masks secrets by pattern in free text (error
   messages, labels, routes quoted in a message): legacy reset and
   activation token paths, query assignments of a sensitive parameter
   name, Bearer credentials and JWT-shaped tokens become "***". Whitespace
   is preserved; a module that presents the text cleans it first
   (cleanText) and clips it after.

   redactUrl(text) masks secrets in a route or href by parsing it: every
   query parameter whose compact key is sensitive is set to "***" and the
   URL is serialized again (an absolute URL keeps its origin; anything
   else comes back as pathname + search + hash), then the pattern pass
   runs. It is the kernel's variant for state routes and http traces; text
   that is not a URL comes back as an encoded path, so it is not for
   messages.

   The parameter names are config's SENSITIVE_QUERY_PARAMS, compared as
   compact keys by redactUrl and as written (case-insensitive) by the
   pattern. The pattern also masks "sas=" (seven view copies did): adding
   "sas" to the parameter set would change what the router drops from a
   navigation and what media accepts, so it stays an explicit extra. */

const SENSITIVE_QUERY_PARAM_NAMES = Object.freeze(
  (Array.isArray(SENSITIVE_QUERY_PARAMS) ? SENSITIVE_QUERY_PARAMS : [])
    .map((name) => cleanText(name, ""))
    .filter(Boolean)
);
export const SENSITIVE_QUERY_KEYS = new Set(
  SENSITIVE_QUERY_PARAM_NAMES.map(normalizeKey).filter(Boolean)
);
const PATTERN_EXTRA_PARAM_NAMES = Object.freeze(["sas"]);

const LEGACY_RESET_TOKEN_PATH =
  /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;
const LEGACY_ACTIVATION_TOKEN_PATH = /(\/activate-account\/)([^/?#\s]+)/gi;
const SENSITIVE_QUERY_ASSIGNMENT = new RegExp(
  `([?&#](?:${[...SENSITIVE_QUERY_PARAM_NAMES, ...PATTERN_EXTRA_PARAM_NAMES].join("|")})=)([^&#\\s]+)`,
  "gi"
);
const BEARER_CREDENTIAL = /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi;
const JWT_SHAPE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const URL_BASE = "https://onionsupport.local";

export function redactTokenPaths(value = "") {
  return String(value ?? "")
    .replace(LEGACY_RESET_TOKEN_PATH, "$1***")
    .replace(LEGACY_ACTIVATION_TOKEN_PATH, "$1***");
}

export function redactSecrets(value = "") {
  return redactTokenPaths(value)
    .replace(SENSITIVE_QUERY_ASSIGNMENT, "$1***")
    .replace(BEARER_CREDENTIAL, "$1***")
    .replace(JWT_SHAPE, "***");
}

export function redactUrl(value = "") {
  let text = cleanText(value, "");
  if (!text) return "";
  text = redactTokenPaths(text);
  try {
    const url = new URL(text, URL_BASE);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeKey(key))) url.searchParams.set(key, "***");
    }
    text = /^https?:\/\//i.test(text) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    text = text.replace(SENSITIVE_QUERY_ASSIGNMENT, "$1***");
  }
  return redactSecrets(text);
}
