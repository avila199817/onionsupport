#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
index = (ROOT / "src/views/correo/index.js").read_text(encoding="utf-8")
template = (ROOT / "src/views/correo/correo.template.js").read_text(encoding="utf-8")
api = (ROOT / "src/views/correo/correo.api.js").read_text(encoding="utf-8")
css = (ROOT / "src/css/views/correo/index.css").read_text(encoding="utf-8")
styles = (ROOT / "src/router/styles.js").read_text(encoding="utf-8")
errors = []

if (ROOT / "src/css/views/correo/viewport.css").exists():
    errors.append("Correo debe tener una única autoridad CSS; viewport.css no puede reaparecer")
if styles.count('/src/css/views/correo/') != 1 or '/src/css/views/correo/index.css' not in styles:
    errors.append("Router debe cargar exactamente un CSS de Correo: index.css")
for forbidden in ('window.confirm(', 'cristian@onionsupport.com', 'data-correo-action="add-account"', 'data-correo-infinite-sentinel'):
    if forbidden in index + template:
        errors.append(f"marcador legado/prohibido en Correo: {forbidden}")
for required in (
    'VIEW_CACHE_TTL_MS = 60_000', 'ownerKey', 'cacheKey',
    'listAbortController', 'readerAbortController',
    'compositionstart', 'compositionend', 'searchComposing',
    'focusableElements', 'trapModalFocus', 'confirmAction', 'renderConfirmModal',
    'CorreoApi.updateDraft(', 'draft-edit', 'routeCommitNonBlocking: true',
):
    if required not in index:
        errors.append(f"falta contrato de controlador: {required}")
for required in (
    'data-correo-action="edit-draft"', 'data-correo-action="confirm-accept"',
    'data-correo-action="confirm-cancel"', 'role="alertdialog"',
    'Los adjuntos existentes se conservan',
):
    if required not in template:
        errors.append(f"falta contrato de template: {required}")
for required in ('export async function updateDraft(', 'updateDraft,'):
    if required not in api:
        errors.append(f"API de borrador incompleta: {required}")
for required in ('.correo-confirm-overlay', '.correo-confirm-backdrop', '.correo-confirm-dialog', '.correo-btn--danger', '.correo-field', '.correo-message-line'):
    if required not in css:
        errors.append(f"falta CSS canónico de Correo: {required}")
if css.count('@layer views {') != 1:
    errors.append("Correo index.css debe declarar una sola capa views")

if errors:
    print("Correo integrity FAILED")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)
print("Correo integrity OK · single CSS authority · isolated cache · abortable IO · accessible modals · editable drafts")
