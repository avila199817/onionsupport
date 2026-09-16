import { cleanText, codeKey } from "./presentation-text.js";
import { firstNonEmpty } from "./objects.js";
import { redactSecrets } from "./redact.js";

/* Technical extraction of the human-readable text an error carries. One
   mechanism and two named orders:

   - messageFirst: the error's own message wins over the backend payload
     (error.message, then data.message / payload.message, then the response
     fields). What a thrown Error says is the message; the payload is the
     detail.
   - payloadFirst: the backend payload wins over the error's own message
     (data.message / payload.message, then the response fields, then
     error.message). What the server said is the message; the Error's text
     is the wrapper.

   For an HTTP error both orders agree: core/http.js builds error.message
   from the payload, so message and data.message carry the same text. They
   differ on an Error built locally around a payload (Usuarios and the
   account activation attach `data`). Moving a consumer between orders is a
   product decision.

   The first non-empty candidate is cleaned (one line, trimmed), redacted
   (redactSecrets: token paths, sensitive assignments, Bearer, JWT) and, if
   nothing remains, the fallback is cleaned and returned. Codes are never a
   message: errorCode reads them. Which human message a domain shows for a
   code or status is the presentation layer's decision, not this module's.

   errorStatus(error, fallback) reads the HTTP status an error carries
   (status, statusCode, the response's, the payload's): the first candidate
   that is a finite number above zero; 0, NaN and text are no status.

   errorCode(error, fallback) reads the code an error carries (code, the
   envelope's error string, the payload's, the response's) as the canonical
   code key (separators to "_", upper case: the shape core/http.js gives
   every code); an object is no code.

   describeError(error) is the kernel's structured record of an error
   (name, message, status, code) for state and diagnostics; null when there
   is no error. */

const CANDIDATES = Object.freeze({
  message: (error) => error?.message,
  dataMessage: (error) => error?.data?.message,
  payloadMessage: (error) => error?.payload?.message,
  responseDataMessage: (error) => error?.response?.data?.message,
  responseMessage: (error) => error?.response?.message,
});

export const ERROR_MESSAGE_POLICIES = Object.freeze({
  messageFirst: Object.freeze(["message", "dataMessage", "payloadMessage", "responseDataMessage", "responseMessage"]),
  payloadFirst: Object.freeze(["dataMessage", "payloadMessage", "responseDataMessage", "responseMessage", "message"]),
});

export function errorMessage(error, fallback, order) {
  const text = cleanText(firstNonEmpty(...order.map((key) => CANDIDATES[key](error))), "");
  return (text && redactSecrets(text)) || cleanText(fallback, "");
}

const STATUS_CANDIDATES = Object.freeze([
  (error) => error?.status,
  (error) => error?.statusCode,
  (error) => error?.response?.status,
  (error) => error?.response?.statusCode,
  (error) => error?.data?.status,
  (error) => error?.payload?.status,
]);

export function errorStatus(error, fallback = 0) {
  for (const read of STATUS_CANDIDATES) {
    const value = Number(read(error));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

const CODE_CANDIDATES = Object.freeze([
  (error) => error?.code,
  (error) => error?.error,
  (error) => error?.data?.code,
  (error) => error?.data?.error,
  (error) => error?.payload?.code,
  (error) => error?.payload?.error,
  (error) => error?.response?.data?.code,
  (error) => error?.response?.code,
]);

export function errorCode(error, fallback = "") {
  for (const read of CODE_CANDIDATES) {
    const value = read(error);
    if ((typeof value === "string" || typeof value === "number") && cleanText(value, "")) return codeKey(value);
  }
  return fallback;
}

export function describeError(error) {
  if (!error) return null;
  return {
    name: cleanText(error?.name, "Error"),
    message: redactSecrets(cleanText(error?.message || String(error), "")),
    status: errorStatus(error, null),
    code: errorCode(error) || null,
  };
}
