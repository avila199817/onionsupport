/*
 * User names are owned by the user record's `name` field. Older DTOs may
 * expose aliases; keep that compatibility here, never as an independent
 * editable name or a lookup by email/display text. No state or network.
 */

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

export function userNameFromIdentity(value = {}, fallback = "") {
  const source = object(value);
  const candidates = [source, source.profile, source.user, source.raw].map(object);

  // A canonical name always wins over an older display/full-name alias.
  for (const candidate of candidates) {
    const name = text(candidate.name);
    if (name) return name;
  }

  for (const candidate of candidates) {
    for (const field of ["fullName", "displayName", "nombre", "nombreCompleto"]) {
      const name = text(candidate[field]);
      if (name) return name;
    }
  }
  for (const candidate of candidates) {
    const composed = [text(candidate.firstName), text(candidate.lastName || candidate.apellidos)]
      .filter(Boolean).join(" ");
    if (composed) return composed;
  }

  return text(fallback);
}
