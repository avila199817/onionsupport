#!/usr/bin/env python3
from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 anchor, found {count}")
    return text.replace(old, new, 1)


# ---------------- Template ----------------
p = Path("src/views/correo/correo.template.js")
text = p.read_text(encoding="utf-8")

notification_block = '''        <button class="correo-account-menu-notifications${notificationEnabled ? " is-enabled" : ""}" type="button" role="menuitemcheckbox" aria-checked="${notificationEnabled ? "true" : "false"}" data-correo-action="notifications">${icon("bell")}<span><strong>${notificationEnabled ? "Notificaciones activadas" : "Activar notificaciones"}</strong><small>${notificationSupported ? "Avisos del navegador cuando llegue correo" : "Este navegador no admite notificaciones"}</small></span><i class="correo-account-menu-check" aria-hidden="true">${notificationEnabled ? icon("check") : ""}</i></button>'''
signature_menu = notification_block + '''\n        <button class="correo-account-menu-signature" type="button" role="menuitem" data-correo-action="signature">${icon("edit")}<span><strong>Firma de correo</strong><small>Configura la firma que Onion añade al redactar</small></span></button>'''
text = replace_once(text, notification_block, signature_menu, "signature account menu")

boot_old = '''      <aside class="correo-folders-panel"><div class="correo-boot-account"></div>${Array.from({length:7},()=>`<div class="correo-boot-line"></div>`).join("")}</aside>\n      <section class="correo-list-panel"><div class="correo-boot-title"></div>${Array.from({length:7},()=>`<div class="correo-message-skeleton"><span></span><div><i></i><i></i><i></i></div></div>`).join("")}</section>'''
boot_new = '''      <aside class="correo-folders-panel"><div class="correo-boot-account"></div><div class="correo-boot-folder-stack">${Array.from({length:7},()=>`<div class="correo-boot-line"></div>`).join("")}</div></aside>\n      <section class="correo-list-panel"><div class="correo-boot-title"></div><div class="correo-boot-message-stack">${Array.from({length:7},()=>`<div class="correo-message-skeleton"><span></span><div><i></i><i></i><i></i></div></div>`).join("")}</div></section>'''
text = replace_once(text, boot_old, boot_new, "boot skeleton structure")

search_old = '''        <label class="correo-search"><span class="correo-search-icon">${icon("search")}</span><input type="search" autocomplete="off" placeholder="Buscar" aria-label="Buscar en Outlook" data-correo-search value="${attr(input.searchTerm || "")}"><kbd>⌘ K</kbd></label>'''
search_new = '''        <label class="correo-search"><span class="correo-search-icon">${icon("search")}</span><input type="search" autocomplete="off" placeholder="Buscar" aria-label="Buscar en Outlook" data-correo-search value="${attr(input.searchTerm || "")}"></label>'''
text = replace_once(text, search_old, search_new, "remove Mac shortcut badge")

cta_old = '''            <button class="correo-btn correo-btn--primary correo-btn--compact" type="button" data-correo-action="compose">${icon("edit")}<span>Nuevo correo</span></button>'''
cta_new = '''            <button class="correo-btn correo-btn--primary correo-btn--compact correo-compose-cta" type="button" data-correo-action="compose">${icon("edit")}<span>Nuevo correo</span></button>'''
text = replace_once(text, cta_old, cta_new, "compose CTA class")

signature_modal = r'''export function renderSignatureModal(input = {}) {
  const raw = String(input.text ?? "").replace(/\r\n?/g, "\n").slice(0, 4000);
  const enabled = input.enabled !== false;
  const preview = raw.trim() || "Tu firma aparecerá aquí cuando la guardes.";
  return `
    <div class="correo-modal-backdrop" data-correo-action="close-modal"></div>
    <section class="correo-signature-dialog" role="dialog" aria-modal="true" aria-labelledby="correo-signature-title" data-correo-signature-dialog tabindex="-1">
      <header class="correo-signature-header">
        <div><p class="correo-kicker">Personalización</p><h2 id="correo-signature-title">Firma de correo</h2></div>
        <button class="correo-icon-btn" type="button" data-correo-action="close-modal" aria-label="Cerrar">${icon("close")}</button>
      </header>
      <form class="correo-signature-form" data-correo-signature-form>
        <p class="correo-signature-help">Se guarda para este usuario de Onion Support y se inserta como texto seguro al redactar desde esta vista.</p>
        <label class="correo-signature-field"><span>Tu firma</span><textarea name="signature" maxlength="4000" rows="7" data-correo-signature-input placeholder="Nombre, cargo, empresa, teléfono…">${escapeHtml(raw)}</textarea></label>
        <div class="correo-signature-meta">
          <label class="correo-signature-toggle"><input type="checkbox" name="enabled" value="1" ${enabled ? "checked" : ""}><span>Añadir automáticamente en nuevos correos, respuestas y reenvíos</span></label>
          <span data-correo-signature-count>${raw.length}/4000</span>
        </div>
        <div class="correo-signature-preview"><span>Vista previa</span><div data-correo-signature-preview>${escapeHtml(preview)}</div></div>
        <footer class="correo-signature-actions"><button class="correo-btn" type="button" data-correo-action="close-modal">Cancelar</button><button class="correo-btn correo-btn--primary" type="submit">Guardar firma</button></footer>
      </form>
    </section>`;
}

'''
text = replace_once(text, "export function renderComposeModal(input = {}) {", signature_modal + "export function renderComposeModal(input = {}) {", "signature modal export")
p.write_text(text, encoding="utf-8")


# ---------------- Controller ----------------
p = Path("src/views/correo/index.js")
text = p.read_text(encoding="utf-8")
text = replace_once(text, "  renderReader,\n  renderShell,", "  renderReader,\n  renderShell,\n  renderSignatureModal,", "signature modal import")
text = replace_once(text, 'const VIEW_CACHE_TTL_MS = 60_000;\n', 'const VIEW_CACHE_TTL_MS = 60_000;\nconst SIGNATURE_STORAGE_PREFIX = "onion.correo.signature.v1";\nconst SIGNATURE_MAX_CHARS = 4000;\n', "signature constants")

signature_helpers = r'''
function signatureStorageKey(ownerKey = "") {
  const owner = cleanText(ownerKey, "anonymous").toLocaleLowerCase("es-ES");
  return `${SIGNATURE_STORAGE_PREFIX}:${encodeURIComponent(owner)}`;
}

function normalizeSignatureText(value = "") {
  return String(value ?? "").replace(/\r\n?/g, "\n").slice(0, SIGNATURE_MAX_CHARS);
}

function readSignaturePreference(ownerKey = "") {
  const fallback = Object.freeze({ text: "", enabled: true });
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(signatureStorageKey(ownerKey));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Object.freeze({
      text: normalizeSignatureText(parsed?.text || ""),
      enabled: parsed?.enabled !== false,
    });
  } catch {
    return fallback;
  }
}

function writeSignaturePreference(ownerKey = "", preference = {}) {
  if (typeof window === "undefined") return false;
  try {
    const value = {
      text: normalizeSignatureText(preference?.text || ""),
      enabled: preference?.enabled !== false,
    };
    window.localStorage.setItem(signatureStorageKey(ownerKey), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function applySignature(body = "", preference = {}) {
  const base = String(body ?? "").replace(/\r\n?/g, "\n").trimEnd();
  const signature = normalizeSignatureText(preference?.text || "").trim();
  if (preference?.enabled === false || !signature) return base;
  return base ? `${base}\n\n${signature}` : signature;
}
'''
text = replace_once(text, "primeNotificationPreference();\n", "primeNotificationPreference();\n" + signature_helpers, "signature storage helpers")

open_compose_anchor = '''      };\n    }\n    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;'''
open_compose_replacement = '''      };\n    }\n    if (mode !== "draft-edit") {\n      input = { ...input, body: applySignature(input.body || "", readSignaturePreference(state.accountUser.cacheKey)) };\n    }\n    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;'''
text = replace_once(text, open_compose_anchor, open_compose_replacement, "auto signature compose")

signature_controller = r'''
  function openSignatureSettings() {
    const modalRoot = host.querySelector("[data-correo-modal-root]");
    if (!modalRoot || confirmResolver || state.busyAction) return;
    closeAccountMenu();
    const preference = readSignaturePreference(state.accountUser.cacheKey);
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRoot.innerHTML = renderSignatureModal(preference);
    document.documentElement.classList.add("correo-modal-open");
    requestAnimationFrame(() => modalRoot.querySelector("[data-correo-signature-input]")?.focus());
  }

  function updateSignaturePreview(target) {
    const form = target?.closest?.("[data-correo-signature-form]");
    if (!form) return;
    const value = normalizeSignatureText(target.value || "");
    if (target.value !== value) target.value = value;
    const count = form.querySelector("[data-correo-signature-count]");
    if (count) count.textContent = `${value.length}/${SIGNATURE_MAX_CHARS}`;
    const preview = form.querySelector("[data-correo-signature-preview]");
    if (preview) preview.textContent = value.trim() || "Tu firma aparecerá aquí cuando la guardes.";
  }

  function saveSignatureSettings(form) {
    if (!form || state.busyAction) return;
    const data = new FormData(form);
    const textValue = normalizeSignatureText(data.get("signature") || "");
    const enabled = data.get("enabled") === "1";
    const saved = writeSignaturePreference(state.accountUser.cacheKey, { text: textValue, enabled });
    if (!saved) {
      toast("No se pudo guardar la firma en este navegador.", "error");
      return;
    }
    closeModal();
    toast(textValue.trim() ? "Firma de correo guardada." : "Firma eliminada.", "success");
  }

'''
text = replace_once(text, "  function closeModal() {", signature_controller + "  function closeModal() {", "signature controller functions")
text = replace_once(text, '    if (action === "notifications") return toggleNotifications();\n', '    if (action === "notifications") return toggleNotifications();\n    if (action === "signature") return openSignatureSettings();\n', "signature menu action")

input_anchor = '''    if (target?.matches?.("[data-correo-attachments-input]")) {'''
input_replacement = '''    if (target?.matches?.("[data-correo-signature-input]")) {\n      updateSignaturePreview(target);\n      return;\n    }\n\n    if (target?.matches?.("[data-correo-attachments-input]")) {'''
text = replace_once(text, input_anchor, input_replacement, "signature input preview")

submit_old = '''  function onSubmit(event) {\n    const form = event.target?.closest?.("[data-correo-compose-form]");\n    if (!form || !host.contains(form)) return;\n    event.preventDefault();\n    sendCompose(form);\n  }'''
submit_new = '''  function onSubmit(event) {\n    const signatureForm = event.target?.closest?.("[data-correo-signature-form]");\n    if (signatureForm && host.contains(signatureForm)) {\n      event.preventDefault();\n      saveSignatureSettings(signatureForm);\n      return;\n    }\n    const form = event.target?.closest?.("[data-correo-compose-form]");\n    if (!form || !host.contains(form)) return;\n    event.preventDefault();\n    sendCompose(form);\n  }'''
text = replace_once(text, submit_old, submit_new, "signature submit handler")

key_old = '''    const confirmDialog = host.querySelector("[data-correo-confirm-dialog]");\n    const composeDialog = host.querySelector(".correo-compose[role='dialog']");\n    const modalOpen = Boolean(composeDialog);'''
key_new = '''    const confirmDialog = host.querySelector("[data-correo-confirm-dialog]");\n    const composeDialog = host.querySelector(".correo-compose[role='dialog']");\n    const signatureDialog = host.querySelector("[data-correo-signature-dialog]");\n    const modalOpen = Boolean(composeDialog || signatureDialog);'''
text = replace_once(text, key_old, key_new, "signature keyboard modal state")
text = replace_once(text, '''    if (composeDialog && event.key === "Tab") {\n      trapModalFocus(event, composeDialog);\n      return;\n    }''', '''    if (composeDialog && event.key === "Tab") {\n      trapModalFocus(event, composeDialog);\n      return;\n    }\n    if (signatureDialog && event.key === "Tab") {\n      trapModalFocus(event, signatureDialog);\n      return;\n    }''', "signature focus trap")
text = replace_once(text, '    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && modalOpen) {', '    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && composeDialog) {', "compose shortcut scope")
text = replace_once(text, '        notifications: notificationUiState().enabled,\n', '        notifications: notificationUiState().enabled,\n        signatureConfigured: Boolean(readSignaturePreference(state.accountUser.cacheKey).text.trim()),\n', "signature snapshot")
p.write_text(text, encoding="utf-8")


# ---------------- CSS ----------------
p = Path("src/css/views/correo/index.css")
text = p.read_text(encoding="utf-8")
text = replace_once(text, "  grid-template-columns: 20px minmax(0, 1fr) auto;\n", "  grid-template-columns: 20px minmax(0, 1fr);\n", "final search grid")

for pattern in (
    r'\n\.correo-search kbd \{.*?\}\n',
    r'\n\[data-correo-host="true"\] \.correo-search kbd \{.*?\}\n',
):
    text, count = re.subn(pattern, "\n", text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"dead search shortcut CSS: expected 1 match for {pattern}, found {count}")

ux_css = r'''
/* ---------- Final UX polish: boot geometry / compose CTA / signature ---------- */
[data-correo-host="true"] .correo-workspace--boot .correo-folders-panel {
  grid-template-rows: auto minmax(0, 1fr);
}

[data-correo-host="true"] .correo-boot-folder-stack {
  min-block-size: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

[data-correo-host="true"] .correo-workspace--boot .correo-list-panel {
  grid-template-rows: auto minmax(0, 1fr);
}

[data-correo-host="true"] .correo-boot-message-stack {
  min-block-size: 0;
  overflow: hidden;
}

[data-correo-host="true"] .correo-compose-cta {
  min-inline-size: 120px;
  block-size: 38px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-inline: 14px;
  border-radius: 6px;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .005em;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 1px 2px rgba(0,0,0,.28);
}

[data-correo-host="true"] .correo-compose-cta svg {
  inline-size: 17px;
  block-size: 17px;
  flex: 0 0 auto;
}

[data-correo-host="true"] .correo-account-menu-signature {
  border-block-start: 1px solid #383838;
}

.correo-signature-dialog {
  position: fixed;
  z-index: 9999;
  inset-inline-start: 50%;
  inset-block-start: 50%;
  transform: translate(-50%, -50%);
  inline-size: min(620px, calc(100vw - 32px));
  max-block-size: calc(100dvh - 40px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #555;
  border-radius: 10px;
  outline: none;
  background: #292929;
  color: #fff;
  box-shadow: 0 24px 80px rgba(0,0,0,.52);
}

.correo-signature-dialog:focus-visible {
  box-shadow: 0 24px 80px rgba(0,0,0,.52), 0 0 0 2px var(--correo-blue, #479ef5);
}

.correo-signature-header {
  min-block-size: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px 12px 18px;
  border-block-end: 1px solid #424242;
  background: #242424;
}

.correo-signature-header > div { min-inline-size: 0; display: grid; gap: 2px; }
.correo-signature-header .correo-kicker { margin: 0; color: #9d9d9d; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.correo-signature-header h2 { margin: 0; color: #fff; font-size: 17px; line-height: 1.2; font-weight: 650; }

.correo-signature-form {
  min-block-size: 0;
  overflow: auto;
  display: grid;
  gap: 14px;
  padding: 18px;
}

.correo-signature-help { margin: 0; color: #adadad; font-size: 11px; line-height: 1.5; }
.correo-signature-field { display: grid; gap: 7px; color: #d6d6d6; font-size: 11px; font-weight: 600; }
.correo-signature-field textarea {
  inline-size: 100%;
  min-block-size: 150px;
  resize: vertical;
  padding: 12px;
  border: 1px solid #555;
  border-radius: 6px;
  outline: 0;
  background: #1f1f1f;
  color: #fff;
  font-size: 12px;
  line-height: 1.5;
}
.correo-signature-field textarea:focus { border-color: #479ef5; box-shadow: 0 0 0 1px rgba(71,158,245,.28); }
.correo-signature-field textarea::placeholder { color: #858585; }

.correo-signature-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  color: #9d9d9d;
  font-size: 10px;
}

.correo-signature-toggle {
  min-inline-size: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #d6d6d6;
  line-height: 1.4;
  cursor: pointer;
}
.correo-signature-toggle input { margin-block-start: 1px; accent-color: var(--correo-blue-strong, #0f6cbd); }
.correo-signature-meta > span { flex: 0 0 auto; font-variant-numeric: tabular-nums; }

.correo-signature-preview {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid #424242;
  border-radius: 6px;
  background: #242424;
}
.correo-signature-preview > span { color: #9d9d9d; font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.correo-signature-preview > div { min-block-size: 44px; color: #d6d6d6; font-size: 11.5px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }

.correo-signature-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-block-start: 2px;
}

@media (max-width: 680px) {
  .correo-signature-dialog {
    inset: 10px;
    transform: none;
    inline-size: auto;
    max-block-size: none;
  }
  .correo-signature-form { padding: 14px; }
  .correo-signature-meta { display: grid; }
  .correo-signature-actions { display: grid; grid-template-columns: 1fr; }
  .correo-signature-actions .correo-btn { inline-size: 100%; }
}

html[data-theme="light"] .correo-signature-dialog,
body[data-theme="light"] .correo-signature-dialog { background: #fff; color: #242424; border-color: #c8c8c8; }
html[data-theme="light"] .correo-signature-header,
body[data-theme="light"] .correo-signature-header,
html[data-theme="light"] .correo-signature-preview,
body[data-theme="light"] .correo-signature-preview { background: #f5f5f5; border-color: #d6d6d6; }
html[data-theme="light"] .correo-signature-header h2,
body[data-theme="light"] .correo-signature-header h2,
html[data-theme="light"] .correo-signature-field,
body[data-theme="light"] .correo-signature-field,
html[data-theme="light"] .correo-signature-toggle,
body[data-theme="light"] .correo-signature-toggle { color: #242424; }
html[data-theme="light"] .correo-signature-field textarea,
body[data-theme="light"] .correo-signature-field textarea { background: #fff; color: #242424; border-color: #b3b3b3; }
html[data-theme="light"] .correo-signature-preview > div,
body[data-theme="light"] .correo-signature-preview > div { color: #424242; }
'''
text = replace_once(text, "@keyframes correo-final-skeleton {", ux_css + "\n@keyframes correo-final-skeleton {", "final UX CSS insertion")
p.write_text(text, encoding="utf-8")


# ---------------- Permanent Correo contract ----------------
p = Path(".github/scripts/correo_integrity.py")
text = p.read_text(encoding="utf-8")
extra = '''\nif '<kbd>⌘ K</kbd>' in template:\n    errors.append("Correo no debe mostrar un atajo Mac dentro del buscador")\nfor required in (\n    'SIGNATURE_STORAGE_PREFIX = "onion.correo.signature.v1"', 'SIGNATURE_MAX_CHARS = 4000',\n    'readSignaturePreference(', 'writeSignaturePreference(', 'applySignature(', 'openSignatureSettings(',\n    'signatureConfigured:',\n):\n    if required not in index:\n        errors.append(f"falta contrato de firma: {required}")\nfor required in (\n    'data-correo-action="signature"', 'data-correo-signature-form', 'data-correo-signature-input',\n    'correo-boot-folder-stack', 'correo-boot-message-stack', 'correo-compose-cta', 'renderSignatureModal',\n):\n    if required not in template:\n        errors.append(f"falta contrato UX final de Correo: {required}")\nfor required in (\n    '.correo-signature-dialog', '.correo-signature-preview', '.correo-compose-cta',\n    '.correo-boot-folder-stack', '.correo-boot-message-stack',\n):\n    if required not in css:\n        errors.append(f"falta CSS UX final de Correo: {required}")\n'''
text = replace_once(text, "\nif errors:\n", extra + "\nif errors:\n", "permanent final UX contract")
text = replace_once(text, 'print("Correo integrity OK · canonical CSS · fixed boot geometry · polished compose CTA · account-scoped signature · abortable IO · accessible modals")' if 'canonical CSS · fixed boot geometry' in text else 'print("Correo integrity OK · single CSS authority · isolated cache · abortable IO · accessible modals · editable drafts")', 'print("Correo integrity OK · canonical CSS · fixed boot geometry · polished compose CTA · account-scoped signature · abortable IO · accessible modals")', "contract success message")
p.write_text(text, encoding="utf-8")

print("Correo final UX patch applied successfully")
