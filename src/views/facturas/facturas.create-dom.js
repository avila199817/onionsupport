/* Local reconciliation for the create-invoice owner. Templates remain pure;
   the connected overlay, panel, scroll owner and unchanged fields stay mounted.
   No document-wide observer, second modal manager or event rebinding is needed. */
function key(node) {
  if (node.nodeType !== 1) return "";
  for (const name of ["id", "data-render-key", "data-slot", "data-error-slot", "data-field", "data-line-field"]) {
    const value = node.getAttribute(name);
    if (value) return `${name}:${value}`;
  }
  return "";
}

function compatible(current, next) {
  if (!current || current.nodeType !== next.nodeType) return false;
  if (current.nodeType !== 1) return true;
  if (current.namespaceURI !== next.namespaceURI || current.tagName !== next.tagName) return false;
  const identity = key(next);
  if (identity || key(current)) return identity === key(current);
  // Distinguish an inserted notice from an existing form section without using
  // dynamic classes (is-error, is-primary) as identity.
  return (current.getAttribute("class") || "").split(/\s+/)[0] ===
    (next.getAttribute("class") || "").split(/\s+/)[0];
}

function syncNode(current, next) {
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  for (const attribute of [...current.attributes]) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of next.attributes) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
  syncChildren(current, next);
  // Attributes alone do not update dirty form controls. Do not assign equal
  // values: keeping the actual input node and value preserves focus and caret.
  if (["INPUT", "TEXTAREA", "SELECT"].includes(current.tagName)) {
    if (current.value !== next.value) current.value = next.value;
    if (current.tagName === "INPUT" && current.checked !== next.checked) {
      current.checked = next.checked;
    }
  }
}

function syncChildren(current, next) {
  let cursor = current.firstChild;
  for (const desired of [...next.childNodes]) {
    let actual = compatible(cursor, desired) ? cursor : null;
    if (!actual) {
      for (let candidate = cursor; candidate; candidate = candidate.nextSibling) {
        if (compatible(candidate, desired)) { actual = candidate; break; }
      }
    }
    if (!actual) {
      actual = current.ownerDocument.importNode(desired, true);
      current.insertBefore(actual, cursor);
    } else {
      if (actual !== cursor) current.insertBefore(actual, cursor);
      syncNode(actual, desired);
    }
    cursor = actual.nextSibling;
  }
  while (cursor) {
    const obsolete = cursor;
    cursor = cursor.nextSibling;
    obsolete.remove();
  }
}

export function patchFacturaCreateDom(host, html) {
  if (!host?.ownerDocument) return false;
  const template = host.ownerDocument.createElement("template");
  template.innerHTML = html;
  syncChildren(host, template.content);
  return true;
}
