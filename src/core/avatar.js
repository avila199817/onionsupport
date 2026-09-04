/* =========================================================
   Onion Support - Shared Avatar Rules

   Fuente única para avatares sin fotografía:
   - iniciales deterministas y acotadas a dos caracteres;
   - tono determinista a partir de una identidad estable;
   - sin dependencias de DOM ni efectos de montaje.
========================================================= */

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function avatarInitials(value = "") {
  return (
    cleanText(value)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) ||
    "ON"
  );
}

export function avatarToneFromIdentity(value = "") {
  const identity = cleanText(value);
  let hash = 0;

  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash << 5) - hash) + identity.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) % 10;
}

export default Object.freeze({
  avatarInitials,
  avatarToneFromIdentity,
});
