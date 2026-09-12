/* Pure metric readers. Missing, invalid and lower-bound counts stay unknown;
   an explicit field wins over aliases, including an explicit null or zero. */
export function exactCount(value) {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function metricNumber(value) {
  if (typeof value !== "number" && !(typeof value === "string" && /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value.trim()))) return null;
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  return Number.isFinite(parsed) ? parsed : null;
}

export function declaredMetric(source, keys, parse = metricNumber) {
  const key = keys.find((name) => Object.hasOwn(source || {}, name));
  return key ? parse(source[key]) : null;
}

export function exactTotal(source = {}, keys = ["total"]) {
  if (!source || [source, source.meta, source.pagination].some((value) => value?.ok === false || value?.success === false || value?.totalKnown === false || value?.totalIsLowerBound === true)) return null;
  return declaredMetric(source, keys, exactCount);
}
