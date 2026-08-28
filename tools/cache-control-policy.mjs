export function parseCacheControl(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      const separator = item.indexOf("=");
      return {
        key: separator >= 0 ? item.slice(0, separator).trim() : item,
        value: separator >= 0 ? item.slice(separator + 1).trim() : "",
      };
    });
}

export function hasOneYearImmutableCache(value) {
  const directives = parseCacheControl(value);
  const keys = new Set(directives.map((item) => item.key));
  const hasPublic = directives.some((item) => item.key === "public" && item.value === "");
  const hasImmutable = directives.some(
    (item) => item.key === "immutable" && item.value === ""
  );
  const maxAges = directives.filter((item) => item.key === "max-age");
  const maxAge = maxAges.length === 1 && /^\d+$/.test(maxAges[0].value)
    ? Number(maxAges[0].value)
    : -1;

  return (
    hasPublic && hasImmutable &&
    !keys.has("private") && !keys.has("no-store") && !keys.has("no-cache") &&
    Number.isSafeInteger(maxAge) && maxAge >= 31536000
  );
}

export function hasPrivateNoStoreCache(value) {
  const directives = parseCacheControl(value);
  const noCache = directives.some((item) => item.key === "no-cache" && item.value === "");
  const noStore = directives.some((item) => item.key === "no-store" && item.value === "");
  return noCache && noStore;
}
