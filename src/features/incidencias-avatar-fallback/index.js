/* =========================================================
   Onion Support - Incidencias Avatar Fallback

   Responsabilidad:
   - Evitar el icono de imagen rota en la tabla de Incidencias.
   - Si un avatar de solicitante o técnico falla, mostrar inmediatamente
     las iniciales ya renderizadas por la plantilla.
   - Cubrir tanto imágenes que fallaron antes de cargar esta mejora como
     errores futuros después de rerenders/infinite scroll.
========================================================= */

export const INCIDENCIAS_AVATAR_FALLBACK_VERSION =
  "incidencias.avatar-fallback.v1";

const IMAGE_SELECTOR = [
  ".incidencias-avatar-img",
  ".incidencias-assigned-avatar img",
].join(",");

const HOST_SELECTOR =
  ".incidencias-avatar, .incidencias-assigned-avatar";

const MOUNT_KEY = "__ONION_INCIDENCIAS_AVATAR_FALLBACK__";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isManagedImage(node = null) {
  return Boolean(
    node?.nodeType === 1 &&
    typeof node.matches === "function" &&
    node.matches(IMAGE_SELECTOR)
  );
}

function markFallback(image = null, reason = "load-error") {
  if (!isManagedImage(image)) return false;

  const host = image.closest?.(HOST_SELECTOR) || null;
  if (!host) return false;

  try {
    host.classList.remove("has-image");
    host.classList.add("is-fallback");
    host.dataset.hasAvatar = "false";
    host.dataset.avatarFallback = "true";
    host.dataset.avatarFallbackReason = reason;
    host.dataset.avatarFallbackVersion = INCIDENCIAS_AVATAR_FALLBACK_VERSION;

    image.hidden = true;
    image.setAttribute("aria-hidden", "true");
    image.dataset.avatarFailed = "true";
    image.dataset.avatarFallbackReason = reason;
    image.style.display = "none";
    image.removeAttribute("src");

    return true;
  } catch {
    return false;
  }
}

function scanBrokenImages(root = document) {
  if (!root?.querySelectorAll) return 0;

  let repaired = 0;

  for (const image of root.querySelectorAll(IMAGE_SELECTOR)) {
    if (
      image?.complete === true &&
      Number(image?.naturalWidth || 0) === 0
    ) {
      if (markFallback(image, "already-broken")) repaired += 1;
    }
  }

  return repaired;
}

function onImageError(event) {
  const image = event?.target || null;
  if (!isManagedImage(image)) return;
  markFallback(image, "load-error");
}

export function mountIncidenciasAvatarFallback() {
  if (!isBrowser()) return false;

  if (window[MOUNT_KEY]?.mounted === true) {
    scanBrokenImages(document);
    return true;
  }

  document.addEventListener("error", onImageError, true);
  const repairedAtMount = scanBrokenImages(document);

  window[MOUNT_KEY] = Object.freeze({
    mounted: true,
    version: INCIDENCIAS_AVATAR_FALLBACK_VERSION,
    repairedAtMount,
    mountedAt: new Date().toISOString(),
  });

  return true;
}

mountIncidenciasAvatarFallback();

export default Object.freeze({
  version: INCIDENCIAS_AVATAR_FALLBACK_VERSION,
  mount: mountIncidenciasAvatarFallback,
});
