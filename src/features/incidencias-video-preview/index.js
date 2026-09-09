/* Onion Support · canonical owner-scoped attachment viewer.
   The domain controller supplies its exclusive host; importing/preloading does
   not install observers or listeners and never depends on a visited route. */
import core from "./core.js";
import gallery from "./gallery.js";

export const INCIDENCIAS_ATTACHMENT_VIEWER_SUITE_VERSION =
  "incidencias-attachment-viewer.v8.explicit-modal-owner";
export * from "./core.js";
export {
  INCIDENCIAS_MEDIA_GALLERY_VERSION,
  mountIncidenciasMediaGallery,
  destroyIncidenciasMediaGallery,
  getIncidenciasMediaGallerySnapshot,
} from "./gallery.js";

export function mountIncidenciasAttachmentViewer(host = null) {
  if (!core.mount(host)) return false;
  if (gallery.mount(host)) return true;
  core.destroy(host);
  return false;
}

export function destroyIncidenciasAttachmentViewer(host = null) {
  gallery.destroy(host);
  return core.destroy(host);
}

export default Object.freeze({
  version: INCIDENCIAS_ATTACHMENT_VIEWER_SUITE_VERSION,
  mount: mountIncidenciasAttachmentViewer,
  destroy: destroyIncidenciasAttachmentViewer,
  getSnapshot: () => Object.freeze({ core: core.getSnapshot(), gallery: gallery.getSnapshot() }),
});
