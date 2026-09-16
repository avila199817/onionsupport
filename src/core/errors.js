import { cleanText } from "./presentation-text.js";
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
   code or status is the presentation layer's decision, not this module's. */

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
