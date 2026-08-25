/* =========================================================
   Onion Support · Incidencias Attachment Viewer
   Entrada canónica del feature de media.

   core.js conserva la autoridad del visor, vídeo, cache y sesión de scroll.
   gallery.js añade navegación lateral sin duplicar transporte ni estado.
========================================================= */

export const INCIDENCIAS_ATTACHMENT_VIEWER_SUITE_VERSION =
  "incidencias-attachment-viewer.v6.compact-gallery";

import core from "./core.js";
import "./gallery.js";

export * from "./core.js";
export {
  INCIDENCIAS_MEDIA_GALLERY_VERSION,
  mountIncidenciasMediaGallery,
  destroyIncidenciasMediaGallery,
  getIncidenciasMediaGallerySnapshot,
} from "./gallery.js";

export default core;
